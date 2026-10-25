// The objects, truth readers, element sets and per-pair jobs of V1c4. Archive selection only: no orbit computation.
// Rules are V1c3's (which are V1c2's and E3's): the latest public OMM created and dated at or before the issue time,
// its 31-day history, the first reference state at or after each target within 900 s, nothing excluded on truth.
import assert from 'node:assert/strict';
import path from 'node:path';
import { Products } from '../e3-combined-catalog/truth.mjs';
import { readElementSets, readCreationDays, epochMs, dayList, shiftDay } from '../../harness/gp-archive.mjs';
import { horizons } from '../v1c3-console-covariance-calibration/calibration.mjs';

export const DAY = 86400000;
export const issueMs = (e3, day) => Date.parse(`${day}T${e3.issueTimeUtc}Z`) + e3.issueOffsetSeconds * 1000;

// Truth readers for one window. `roots.main` holds E3's converted products (the archive for training, the refreshed copy for
// the test), `roots.leo` the converted COSMIC-2 orbits. Which object belongs to which class is fixed by E3's registry, the GPS
// satellites named in the ESA products, and config.extraObjects.
export function truthFor({ e3, config, roots }) {
  const main = new Products(roots.main, e3.truthPrefixes);
  const gps = new Products(roots.main, [e3.regimes.GPS.truthPrefix]);
  const leo = new Products(roots.leo, config.extraTruthPrefixes);
  const regime = new Map(), extra = new Set();
  for (const [name, spec] of Object.entries(e3.regimes)) if (spec.objects) for (const n of Object.keys(spec.objects)) regime.set(+n, name);
  for (const n of main.objects()) if (!regime.has(n) && main.entries(n).some(e => e.product.startsWith(e3.regimes.GPS.truthPrefix) && e.comment.includes(`SP3 satellite ${e3.regimes.GPS.sp3System}`))) regime.set(n, 'GPS');
  for (const [group, objects] of Object.entries(config.extraObjects)) for (const n of Object.keys(objects)) { regime.set(+n, group); extra.add(+n); }
  const ref = n => extra.has(n) ? leo : regime.get(n) === 'GPS' ? gps : main;
  const objects = [...regime.keys()].filter(n => ref(n).entries(n).length).sort((a, b) => a - b);
  const dropCache = () => { main.dropCache(); gps.dropCache(); leo.dropCache(); };
  // Every OEM file whose states were used, by absolute path, with its SHA-256.
  const reads = () => Object.fromEntries([main, gps, leo].flatMap(p => Object.entries(p.read).map(([f, h]) => [path.join(p.dir, f), h])));
  return { regime, ref, objects, dropCache, reads, readers: { main, gps, leo }, roots };
}

// Element sets of the kept objects for a list of issue days: `sets` (epoch from `epochLookbackDays` before the first issue day
// to its last day, de-duplicated as E3 does, with creation dates for causality) and `history` (every set created from 45 days
// before the first issue day, for object_covariance's 31-day history).
export function elementSets({ e3, days, keep, epochLookbackDays = 10, withHistory = true }) {
  const { sets, files } = readElementSets(e3.inputs.gpHistory, shiftDay(days[0], -epochLookbackDays), days.at(-1), { keep, lagDays: e3.elementSets.creationLagDays,
    theory: e3.elementSets.meanElementTheory, ephemerisType: e3.elementSets.ephemerisType, duplicateEpochSeconds: e3.elementSets.duplicateEpochSeconds });
  if (!withHistory) return { sets, history: [], files, historyFiles: {} };
  const history = readCreationDays(e3.inputs.gpHistory, shiftDay(days[0], -45), days.at(-1), { keep, theory: e3.elementSets.meanElementTheory, ephemerisType: e3.elementSets.ephemerisType });
  return { sets, history: history.sets, files, historyFiles: history.files };
}

export const pairKey = (norad, day) => `V5:${norad}:${day}`;
export const pairsOf = (truth, days, regimeOf = truth.regime) => truth.objects.flatMap(n => days.map(day => ({ key: pairKey(n, day), norad: n, group: regimeOf.get(n), day })));

// The causal anchor of one pair: the newest set created and dated at or before the issue time.
export function anchorOf(setsOfObject, ms) {
  return setsOfObject.filter(s => epochMs(s.creationDate) <= ms && epochMs(s.epoch) <= ms)
    .sort((a, b) => epochMs(b.epoch) - epochMs(a.epoch) || epochMs(b.creationDate) - epochMs(a.creationDate))[0];
}

// One worker job (V1c3's job()): the anchor, its 31-day causal history, and the truth at each horizon.
export function jobOf({ e3, config, truth, bySet, byHistory, pair, window }) {
  const n = pair.norad, ms = issueMs(e3, pair.day);
  const set = anchorOf(bySet.get(n) ?? [], ms);
  const targets = horizons.map(hours => {
    const requested = ms + hours * 3600000;
    if (window.targetBefore) assert(requested + e3.targetToleranceSeconds * 1000 < Date.parse(window.targetBefore), `training target after the embargo: ${pair.key}`);
    const t = truth.ref(n).firstAtOrAfter(n, requested, e3.targetToleranceSeconds * 1000);
    return t ? { hours, ms: t.ms, state: [...t.r, ...t.v].map(x => x * 1000) } : null;
  }).filter(Boolean);
  truth.dropCache();
  const missingHorizons = horizons.filter(h => !targets.some(t => t.hours === h));
  if (!set || !targets.length) return { key: pair.key, norad: n, group: pair.group, ms, missingHorizons, skipped: !set ? 'no causal OMM' : 'no truth targets' };
  const anchorMs = epochMs(set.epoch);
  const causal = (byHistory.get(n) ?? []).filter(s => epochMs(s.creationDate) <= ms && epochMs(s.epoch) >= anchorMs - config.historyDays * DAY && epochMs(s.epoch) <= anchorMs + 1000);
  return { key: pair.key, group: pair.group, n, ms, set, targets, missingHorizons, elements: [...causal.filter(s => s.gpId !== set.gpId), set] };
}
export const groupBy = (rows, key) => { const m = new Map(); for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
