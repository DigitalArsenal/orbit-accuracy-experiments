// Public sets and truth for experiments/ap-catalog-construction (PLAN.md). Nothing is excluded by object: the owner's ruling of
// 2026-11-10 (stack issue 314) dropped every exclusion rule, so neither reader consults the five-day pipeline's hold list. The truth
// gate (its ledger, its sanity rule and its jump screen) still drops corrupted states.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { CONFIG, REPO, DAY, STEP, COVER, utcMs, dayOf, tleMs } from './engine.mjs';

const imp = (p) => import(pathToFileURL(p).href);
const { jdOf } = await imp(path.join(REPO, 'experiments/ap-five-day-accuracy/lib/gp-history-loader.mjs'));
const { assertAllowedPath } = await imp(path.join(REPO, 'experiments/ap-five-day-accuracy/lib/hold-gate.mjs')); // the secrets path guard only
const SRC = await imp(path.join(REPO, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')); // truth reader behind the truth gate
const GATE = await imp(path.join(REPO, 'harness/truth-gate.mjs'));

/** The read window of a run: nothing dated outside [from, to] is read; a window may also name spans it must never touch. */
export function makeWindow({ from, to, never = [] }) {
  return (a, b, what) => {
    if (a < from || b > to) throw new Error(`REFUSED: ${what} ${new Date(a).toISOString()} to ${new Date(b).toISOString()} is outside this run's window ${new Date(from).toISOString()} to ${new Date(to).toISOString()}`);
    for (const [x, y] of never) if (a < y && b > x) throw new Error(`REFUSED: ${what} touches ${new Date(x).toISOString()} to ${new Date(y).toISOString()}`);
  };
}

/**
 * The public sets of the listed objects with epochs in [fromMs, cutoffMs] and created by cutoffMs: Space-Track's daily GP snapshots and
 * gp_history by creation date, as the five-day pipeline's loader reads them (gp-history-loader.mjs), less its hold list. Sets with
 * epochs within 60 s of each other are one set (the higher GP_ID); a decayed object or one with no set in the last 30 days is left out.
 */
export function loadPublicSets({ fromMs, cutoffMs, norads, guard }) {
  guard(fromMs, cutoffMs, 'public sets');
  const archive = CONFIG.archive;
  assertAllowedPath(archive);
  const cutoffIso = new Date(cutoffMs).toISOString().replace(/Z$/, '000'), cutoffDay = cutoffIso.slice(0, 10);
  const startDay = dayOf(fromMs), wanted = new Set(norads), byNorad = new Map();
  const ingest = (arr, snapshot) => {
    for (const r of arr) {
      const norad = Number(r.NORAD_CAT_ID);
      if (!wanted.has(norad)) continue;
      if (r.DECAY_DATE && r.DECAY_DATE <= cutoffDay) continue;
      if (!snapshot && r.CREATION_DATE && r.CREATION_DATE > cutoffIso.slice(0, 19)) continue;
      if (!r.EPOCH || r.EPOCH > cutoffIso) continue;
      const n = Number(r.MEAN_MOTION), e = Number(r.ECCENTRICITY);
      if (!(n > 0.05) || !(e >= 0 && e < 0.995)) continue;
      const jd = jdOf(r.EPOCH);
      if (!jd) continue;
      const ms = Math.round((jd.whole - 2440587.5 + jd.frac) * DAY);
      if (ms > cutoffMs || ms < fromMs) continue;
      if (!byNorad.has(norad)) byNorad.set(norad, []);
      byNorad.get(norad).push({ norad, epoch: r.EPOCH, whole: jd.whole, frac: jd.frac, n, e, inc: Number(r.INCLINATION), raan: Number(r.RA_OF_ASC_NODE),
        argp: Number(r.ARG_OF_PERICENTER), ma: Number(r.MEAN_ANOMALY), bstar: Number(r.BSTAR) || 0, ndot: Number(r.MEAN_MOTION_DOT) || 0,
        nddot: Number(r.MEAN_MOTION_DDOT) || 0, gpId: Number(r.GP_ID) || 0 });
    }
  };
  for (const [dir, snapshot] of [['spacetrack/gp', true], ['spacetrack/gp_history/by-creation', false]]) {
    for (const year of [...new Set([startDay.slice(0, 4), cutoffDay.slice(0, 4)])]) {
      const d = path.join(archive, dir, year);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json.gz') && x.slice(0, 10) >= startDay && x.slice(0, 10) <= cutoffDay).sort()) {
        ingest(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(d, f))).toString('utf8')), snapshot);
      }
    }
  }
  const objects = [];
  for (const [norad, list] of byNorad) {
    list.sort((a, b) => tleMs(a) - tleMs(b) || a.gpId - b.gpId);
    const sets = [];
    for (const x of list) {
      if (sets.length && Math.abs(tleMs(x) - tleMs(sets.at(-1))) < 60000) { if (x.gpId >= sets.at(-1).gpId) sets[sets.length - 1] = x; } else sets.push(x);
    }
    if (cutoffMs - tleMs(sets.at(-1)) > 30 * DAY) continue;
    objects.push({ norad, tles: sets });
  }
  return objects.sort((a, b) => a.norad - b.norad);
}

/** Every object of the plan's truth families with states in [fromMs, toMs]: norad -> [{ family, start, stop, file }]. */
export function truthIndex(fromMs, toMs) {
  const index = new Map();
  for (const rel of CONFIG.truth.roots) {
    const root = path.join(CONFIG.archive, rel);
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root).sort()) {
      const fam = CONFIG.truth.families.find((f) => dir.startsWith(f.prefix));
      const idx = path.join(root, dir, 'index.json');
      if (!fam || !fs.existsSync(idx)) continue;
      for (const o of JSON.parse(fs.readFileSync(idx, 'utf8')).objects ?? []) {
        const start = utcMs(o.start), stop = utcMs(o.stop);
        if (!(stop >= fromMs && start <= toMs)) continue;
        if (!index.has(o.norad)) index.set(o.norad, []);
        index.get(o.norad).push({ family: fam.family, start, stop, file: path.join(root, dir, o.file) });
      }
    }
  }
  for (const list of index.values()) list.sort((a, b) => a.start - b.start || a.file.localeCompare(b.file));
  return index;
}

const files = new Map();
export const truthCounts = { screenedStates: 0, files: new Map() };
function readTruthFile(file) {
  if (!files.has(file)) {
    if (files.size > 800) files.delete(files.keys().next().value);
    if (!truthCounts.files.has(file)) truthCounts.files.set(file, fs.statSync(file).size);
    files.set(file, SRC.readReference(file).lines.map((l) => ({ ms: utcMs(l.epoch), r: l.r, v: l.v }))); // the jump screen uses velocities
  }
  return files.get(file);
}

/** Truth of (fromMs, fromMs + days], at its own epochs thinned to the grid step (a later file wins where files overlap); states the
 *  gate's jump screen marks are dropped; `perDay` is what a full day holds (amendment A1 of ap-from-public-sets). */
export function truthFor(index, norad, fromMs, days, guard) {
  guard(fromMs, fromMs + days * DAY, 'truth');
  const byMs = new Map();
  for (const e of index.get(norad) ?? []) {
    if (e.stop < fromMs || e.start > fromMs + days * DAY) continue;
    for (const s of readTruthFile(e.file)) if (s.ms > fromMs && s.ms <= fromMs + days * DAY) byMs.set(s.ms, s);
  }
  const merged = [...byMs.values()].sort((a, b) => a.ms - b.ms);
  const marked = new Set(GATE.screen(merged).candidates);
  truthCounts.screenedStates += marked.size;
  const series = marked.size ? merged.filter((_, i) => !marked.has(i)) : merged;
  const gaps = [];
  for (let k = 1; k < Math.min(series.length, 400); k += 1) gaps.push(series[k].ms - series[k - 1].ms);
  gaps.sort((x, y) => x - y);
  const native = gaps.length ? gaps[gaps.length >> 1] : STEP;
  const perDay = DAY / (native * Math.max(1, Math.ceil((STEP - 1000) / native)));
  const truth = [];
  let prev = -Infinity;
  for (const s of series) if (s.ms - prev >= STEP - 1000) { truth.push(s); prev = s.ms; }
  return { truth, perDay, firstDayCovered: truth.filter((s) => s.ms <= fromMs + DAY).length >= COVER * perDay };
}
