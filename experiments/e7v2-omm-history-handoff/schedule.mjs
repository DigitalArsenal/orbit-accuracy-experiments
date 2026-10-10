// E7v2's samples (PLAN.md section 4) and their targets (section 8).
//
// A sample: an object, a product time t, and the object's OMM with the latest
// epoch among those created by t, at most sampleMaxAgeDays old; its
// CREATION_DATE is the information cutoff. Truth-rich classes take product
// times at a stride (staggered across objects, as E7); OMM-only regimes take
// the seeded draw of step 00.
//
// Targets: truth (first precise-orbit state at or after epoch + h within the
// tolerance) and pseudo-truth (first OMM with epoch in [epoch + h, epoch + h +
// max(1 h, h/4)], its epoch state). A truth-rich sample also carries, for
// each pseudo-truth target, the first truth state at or after its epoch
// (the pseudo-truth's own error). Selecting only.
import { config, DAY_MS, HOUR_MS, isoUtc } from './common.mjs';

const maxAgeOf = (cls) => (config.sampleMaxAgeDays[cls] ?? config.sampleMaxAgeDays.default) * DAY_MS;

// The sample OMM for product time t: index into the object's sets, or -1.
function sampleIndex(mine, t, maxAgeMs) {
  let k = -1;
  for (let i = 0; i < mine.length && mine[i].epochMs <= t; ++i) if (mine[i].createdMs <= t) k = i;
  if (k < 0 || t - mine[k].epochMs > maxAgeMs) return -1;
  return k;
}

const target = (h, s) => (s ? { h, ms: s.ms, epoch: s.epoch, r: s.r, v: s.v, file: s.entry.file, ...(s.gpId ? { gpId: s.gpId } : {}) } : { h, missing: true });

export function truthTargets(products, norad, epochMs) {
  const tol = config.targetToleranceSeconds * 1000;
  return config.horizonsHours.map((h) => target(h, products.firstAtOrAfter(norad, epochMs + h * HOUR_MS, tol)));
}

export function pseudoTargets(pseudo, norad, epochMs, truth = null) {
  const p = config.pseudoTruth, tol = config.targetToleranceSeconds * 1000;
  return p.horizonsHours.map((h) => {
    const w = Math.max(p.minimumWindowHours, p.windowFraction * h) * HOUR_MS;
    const t = target(h, pseudo.firstAtOrAfter(norad, epochMs + h * HOUR_MS, w));
    if (truth && !t.missing) {
      const s = truth.firstAtOrAfter(norad, t.ms, tol);
      t.truthAt = s ? { ms: s.ms, epoch: s.epoch, r: s.r, v: s.v, file: s.entry.file } : null;
    }
    return t;
  });
}

function sampleOf(cls, kind, norad, t, mine, k) {
  const set = mine[k];
  return { cls, kind, norad, scheduled: isoUtc(t), gpId: set.gpId, epoch: set.epoch, epochMs: set.epochMs, cutoffMs: set.createdMs, index: k };
}

// Truth-rich classes: {cls: {products, objects}}; byObject: setsByObjectOf.
export async function truthSamples(window, truthByClass, byObject, pseudo) {
  const samples = [];
  const lo = Date.parse(`${window.from}T00:00:00Z`), hi = Date.parse(`${window.to}T00:00:00Z`);
  for (const [cls, { products, objects }] of Object.entries(truthByClass)) {
    const stride = config.classes[cls].strideDays[window.name];
    for (const [j, norad] of objects.entries()) {
      const mine = byObject.get(norad) ?? [];
      if (!mine.length) continue;
      await pseudo.prepare(norad, mine);
      const used = new Set();
      for (let t = lo + (j % stride) * DAY_MS; t <= hi; t += stride * DAY_MS) {
        const k = sampleIndex(mine, t, maxAgeOf(cls));
        if (k < 0 || used.has(mine[k].gpId)) continue;
        used.add(mine[k].gpId);
        const s = sampleOf(cls, 'truth', norad, t, mine, k);
        s.targets = truthTargets(products, norad, s.epochMs);
        if (s.targets.every((x) => x.missing)) continue;
        s.pseudoTargets = pseudoTargets(pseudo, norad, s.epochMs, products);
        samples.push(s);
      }
      products.dropCache();
    }
  }
  return samples;
}

// OMM-only regimes: draws {regime: [{norad, subclass, objectType, times}]}.
export async function ommSamples(draws, classes, byObject, pseudo) {
  const samples = [];
  for (const [cls, list] of Object.entries(draws)) {
    if (!classes.includes(cls)) continue;
    for (const o of list) {
      const mine = byObject.get(o.norad) ?? [];
      if (!mine.length) continue;
      await pseudo.prepare(o.norad, mine);
      const used = new Set();
      for (const t of o.times) {
        const k = sampleIndex(mine, t, maxAgeOf(cls));
        if (k < 0 || used.has(mine[k].gpId)) continue;
        used.add(mine[k].gpId);
        const s = { ...sampleOf(cls, 'omm', o.norad, t, mine, k), subclass: o.subclass, objectType: o.objectType };
        s.targets = pseudoTargets(pseudo, o.norad, s.epochMs);
        if (s.targets.every((x) => x.missing)) continue;
        samples.push(s);
      }
    }
  }
  return samples;
}
