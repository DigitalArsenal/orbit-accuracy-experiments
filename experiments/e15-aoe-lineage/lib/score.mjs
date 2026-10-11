// Residuals of served element sets against reference states, by analysis/gp-error-model element_residuals (WASM):
// SGP4 (Vallado 2020, WGS-72, opsmode i) to each reference state in a window, the reference state taken to TEME by the
// module's own frames (EME2000 through the IAU 2006 frame bias, GCRF through IAU 2006/2000A and the equation of the
// equinoxes), and the difference, prediction minus reference, projected in the module on the reference state's R, T, N
// axes. This file frames the calls and keeps the first sample of each window; it computes no orbit quantity.
import { json } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { config } from './windows.mjs';

const isoZ = (ms) => new Date(ms).toISOString();
const DAY = 86400000;
const BATCH = 64;   // objects per call
// One call per method: the module merges sets of one object whose epochs lie within 1 s, so the sources never share a call.
export const METHODS = ['AOE-latest', 'ST-latest', 'SupGP-latest'];

// items: [{norad, regime, ephemeris (labelled $OEM port frame), truth: {...provenance}, targets: [{issue, h, window, T,
// targetMs, sets: {'AOE-latest': set|null, 'ST-latest': set|null, 'SupGP-latest': set|null}}]}]
// Returns rows: one per (object, target, method with a set), with the RTN error (km) of the first reference state in
// [target, target + tolerance], or `failure`.
export async function scoreItems(scorer, items, { log = () => {} } = {}) {
  const tolMs = config.targetToleranceSeconds * 1000;
  const rows = [];
  const counts = { calls: 0, requests: 0, samples: 0, failures: 0 };
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    for (const method of METHODS) {
      const sets = new Map();
      const requests = [];
      const wanted = [];
      for (const item of batch) {
        for (const t of item.targets) {
          const set = t.sets[method];
          if (!set) continue;
          sets.set(`${set.norad}|${set.id}`, set);
          requests.push({ norad: item.norad, set: `${set.epoch}Z`, label: `${t.issue}|${t.h}`, windows: [{ from: isoZ(t.targetMs), to: isoZ(t.targetMs + tolMs), label: 'target' }] });
          wanted.push({ item, t, set });
        }
      }
      if (!requests.length) continue;
      const ephemerides = batch.filter((item) => item.targets.some((t) => t.sets[method])).map((item) => item.ephemeris);
      let res;
      try {
        res = await scorer.invokeJson('element_residuals', [ommFrame([...sets.values()]), ...ephemerides, json('options', { requests, samples: true })], 'residuals');
      } catch (error) {
        for (const w of wanted) rows.push(row(w, method, null, `element_residuals: ${String(error.message).slice(0, 200)}`));
        counts.failures += wanted.length;
        continue;
      }
      ++counts.calls;
      counts.requests += requests.length;
      res.results.forEach((r, k) => {
        const w = wanted[k];
        // The module answers the requests in order; it must have answered this object and this set.
        if (r.norad !== w.item.norad || Date.parse(r.set) !== Date.parse(`${w.set.epoch}Z`)) throw new Error(`element_residuals answered ${r.norad}@${r.set} for ${w.item.norad}@${w.set.epoch}`);
        if (r.error) { rows.push(row(w, method, null, r.error)); ++counts.failures; return; }
        const win = r.windows[0];
        const samples = (win.samples ?? []).slice().sort((a, b) => Date.parse(`${a[0]}`) - Date.parse(`${b[0]}`));
        if (!samples.length) { rows.push(row(w, method, null, win.failures ? 'SGP4 failed' : 'no reference state in the window')); ++counts.failures; return; }
        ++counts.samples;
        rows.push(row(w, method, samples[0]));
      });
    }
  }
  log(`scored ${items.length} objects: ${counts.calls} calls, ${counts.requests} requests, ${counts.samples} samples, ${counts.failures} failures`);
  return { rows, counts };
}

function row({ item, t, set }, method, sample, failure = null) {
  const out = {
    v: 1, regime: item.regime, norad: item.norad, issue: t.issue, T: isoZ(t.T), h: t.h, window: t.window, method,
    set: { id: set.id, epoch: set.epoch, snapshot: set.snapshot ?? null, createdUtc: set.source === 'AOE' ? isoZ(set.ctimeMs) : `${set.creationDate}Z` },
    truth: item.truth,
  };
  if (failure) return { ...out, failure };
  const targetMs = Date.parse(/Z$/.test(sample[0]) ? sample[0] : `${sample[0]}Z`);
  const startMs = item.truth.startUtc ? Date.parse(item.truth.startUtc) : NaN;
  return { ...out, target: isoZ(targetMs), ageDays: (targetMs - set.epochMs) / DAY, truthAgeHours: Number.isFinite(startMs) ? (targetMs - startMs) / 3600000 : null, rtnKm: [sample[1], sample[2], sample[3]] };
}
