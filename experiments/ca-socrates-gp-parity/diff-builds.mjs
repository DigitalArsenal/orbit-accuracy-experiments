#!/usr/bin/env node
// ca-socrates-gp-parity A3: what moved between builds, event by event: a run's screen events against a baseline run's, and the
// objects on the excluded port. Encounters pair one to one by NORAD pair and TCA within 1 s (the registered merge rule), nearest
// first, after the 1 s merge. Counting only. A row names the pair, TCA, miss and speed, as the report's rows do; no element set.
//   node experiments/ca-socrates-gp-parity/diff-builds.mjs --run <dir> --baseline <dir> --parts 1,2 --version 0.12.0 --out <file>
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, sha256, jdToIso, DAY_S, parseListing, notScreenedAt } from './common.mjs';

const { values: o } = parseArgs({ options: { run: { type: 'string' }, baseline: { type: 'string' }, parts: { type: 'string', default: '1,2' }, version: { type: 'string' }, out: { type: 'string' } } });
if (!o.run || !o.baseline || !o.out || !o.version) throw new Error('usage: diff-builds.mjs --run DIR --baseline DIR --parts 1,2 --version V --out FILE');
const parts = o.parts.split(',');
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const load = (dir) => parts.flatMap((p) => JSON.parse(fs.readFileSync(path.join(dir, `part${p}`, 'screen-events.json'), 'utf8')));
const hashes = (dir) => Object.fromEntries(parts.map((p) => [`part${p}`, sha256(fs.readFileSync(path.join(dir, `part${p}`, 'screen-events.json')))]));
const merge = (list) => {
  const sorted = list.map((e) => ({ ...e, key: pairKey(e.a, e.b) })).sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : x.tcaJd - y.tcaJd));
  const out = [];
  for (const e of sorted) { const last = out.at(-1); if (!(last && last.key === e.key && (e.tcaJd - last.tcaJd) * DAY_S <= config.comparison.mergeSeconds)) out.push(e); }
  return out;
};
const A = merge(load(o.baseline)), B = merge(load(o.run));
const byPair = new Map();
B.forEach((e, n) => { if (!byPair.has(e.key)) byPair.set(e.key, []); byPair.get(e.key).push(n); });
const cand = [];
A.forEach((e, i) => { for (const n of byPair.get(e.key) ?? []) { const dt = Math.abs(B[n].tcaJd - e.tcaJd) * DAY_S; if (dt <= config.comparison.mergeSeconds) cand.push([dt, i, n]); } });
cand.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
const aTo = new Int32Array(A.length).fill(-1), bTo = new Int32Array(B.length).fill(-1);
for (const [, i, n] of cand) if (aTo[i] < 0 && bTo[n] < 0) { aTo[i] = n; bTo[n] = i; }
const row = (e) => ({ pair: [e.a, e.b], tcaUtc: jdToIso(e.tcaJd), missM: e.missM, speedMS: e.speedMS });
const dist = (v) => { const s = v.map(Math.abs).sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return s.length ? { n: s.length, median: q(0.5), p99: q(0.99), max: s[s.length - 1] } : { n: 0 }; };
const diffs = A.flatMap((e, i) => (aTo[i] < 0 ? [] : [{ e, x: B[aTo[i]], dt: (B[aTo[i]].tcaJd - e.tcaJd) * DAY_S, dm: B[aTo[i]].missM - e.missM, ds: B[aTo[i]].speedMS - e.speedMS }]));
const changed = diffs.filter((d) => d.dt !== 0 || d.dm !== 0 || d.ds !== 0);

// The excluded port, by slice: this run's forms (strict) and the baseline's records as they were written.
const units = (dir) => parts.flatMap((p) => fs.readdirSync(path.join(dir, `part${p}`, 'slices')).filter((n) => /^slice-\d+\.json$/.test(n)).map((n) => JSON.parse(fs.readFileSync(path.join(dir, `part${p}`, 'slices', n), 'utf8'))));
const baselineSlices = new Map(), baselineReasons = {}, runSlices = new Map();
for (const u of units(o.baseline)) for (const x of u.excluded) {
  if (!baselineSlices.has(x.norad)) baselineSlices.set(x.norad, new Set());
  baselineSlices.get(x.norad).add(u.slice);
  const reason = /First failure at \S+: (.+)$/.exec(String(x.comment))?.[1] ?? String(x.comment);
  (baselineReasons[reason] ??= new Set()).add(x.norad);
}
for (const u of units(o.run)) for (const x of u.excluded) {
  if (!runSlices.has(x.norad)) runSlices.set(x.norad, new Map());
  if (!runSlices.get(x.norad).has(u.slice)) runSlices.get(x.norad).set(u.slice, parseListing(x.comment));
}
const win = JSON.parse(fs.readFileSync(path.join(o.run, `part${parts[0]}`, 'screen-summary.json'), 'utf8')).window;
const sliceOf = (jd) => Math.floor(((jd - win.startJd) * DAY_S) / win.sliceSeconds);
// A row's standing on the port: whether an object of the pair was listed in its slice on the baseline, and how it is now.
const standing = (e) => {
  const k = sliceOf(e.tcaJd);
  const was = [e.a, e.b].filter((n) => baselineSlices.get(n)?.has(k));
  const now = [e.a, e.b].filter((n) => runSlices.get(n)?.has(k)).map((n) => { const l = runSlices.get(n).get(k); return { norad: n, form: l.form, lastValid: l.lastValid ?? null, firstRefusal: l.firstRefusal ?? null, screenedAtThisTca: !notScreenedAt(l, e.tcaJd) }; });
  return { listedOnBaselineInThisSlice: was, listedNowInThisSlice: now };
};
const onlyBaseline = A.filter((_, i) => aTo[i] < 0).map((e) => ({ ...row(e), ...standing(e) }));
const onlyThisBuild = B.filter((_, n) => bTo[n] < 0).map((e) => ({ ...row(e), ...standing(e) }));
const baselineObjects = [...baselineSlices.keys()], runObjects = [...runSlices.keys()];
const FULL = 1000;
const out = {
  baselineVersion: o.version, baseline: path.basename(o.baseline), run: path.basename(o.run), parts: parts.map(Number), baselineEventsSha256: hashes(o.baseline), eventsSha256: hashes(o.run),
  baselineEvents: A.length, events: B.length, paired: diffs.length, identicalValues: diffs.length - changed.length, changedValues: changed.length,
  tcaSeconds: dist(diffs.map((d) => d.dt)), missM: dist(diffs.map((d) => d.dm)), speedMS: dist(diffs.map((d) => d.ds)),
  largestChanges: [...changed].sort((p, q) => Math.abs(q.dm) - Math.abs(p.dm)).slice(0, 25).map((d) => ({ pair: [d.e.a, d.e.b], baselineTcaUtc: jdToIso(d.e.tcaJd), dtSeconds: d.dt, dMissM: d.dm, dSpeedMS: d.ds })),
  onlyBaseline: { count: onlyBaseline.length, rows: onlyBaseline.slice(0, FULL) },
  onlyThisBuild: { count: onlyThisBuild.length, rows: onlyThisBuild.sort((x, y) => x.tcaUtc.localeCompare(y.tcaUtc)).slice(0, FULL) },
  listings: {
    baselineObjects: baselineObjects.length, objects: runObjects.length,
    newObjects: runObjects.filter((n) => !baselineSlices.has(n)).sort((a, b) => a - b), goneObjects: baselineObjects.filter((n) => !runSlices.has(n)).sort((a, b) => a - b),
    baselineByRefusal: Object.fromEntries(Object.entries(baselineReasons).map(([k, v]) => [k, v.size])),
    changedSlices: runObjects.filter((n) => baselineSlices.has(n)).map((n) => { const was = [...baselineSlices.get(n)].sort((a, b) => a - b), now = [...runSlices.get(n).keys()].sort((a, b) => a - b); return { norad: n, was: [was[0], was.at(-1), was.length], now: [now[0], now.at(-1), now.length] }; }).filter((x) => JSON.stringify(x.was) !== JSON.stringify(x.now)),
  },
};
fs.writeFileSync(o.out, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ baseline: A.length, events: B.length, paired: diffs.length, identical: out.identicalValues, changed: changed.length, onlyBaseline: onlyBaseline.length, onlyThisBuild: onlyThisBuild.length, newListed: out.listings.newObjects, goneListed: out.listings.goneObjects, maxDtS: out.tcaSeconds.max, maxDMissM: out.missM.max }));
