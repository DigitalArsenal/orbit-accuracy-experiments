// GEO-TRUTH.md part F, report only: every arm fitted to the first 24 h and 48 h of each stored Intelsat file of Galaxy 30 and SES file of SES-15, and the operator's own file, scored
// against the WAAS broadcast on each day after the end of the fit. Module calls only; interpolation of the operator's 300 s table is a data step, as in providers-run.mjs.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/geo-truth-files.mjs --wasm <AP 0.4.0> --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import { isoMs, openFfmHost, apriori } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';
import { apForces, openAp } from './lib/ap.mjs';
import { openUssfXp } from './lib/ussf-xp.mjs';
import { series } from './lib/sbas.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import { openSgp4Fit } from '../xp2-fit-design/lib/sgp4fit.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';
import { config as XMC } from '../xp-atmosphere-merit/common.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const OUT = args.out, HOUR = 3600000, DAY = 86400000, ARCS = [24, 48], PRN = { 46114: 135, 42709: 133 }, MIN_DAY = 168;
if (!OUT || !args.wasm) throw new Error('--out and --wasm');
const STORE = '/opt/data/sdn-archive/operator-theory/vendors';
const rmsOf = (e) => Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);
const lines = (b64) => S.oemLines(Buffer.from(b64, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)) }));
function interpolate(table, t) {
  const ts = table.map((l) => Date.parse(l.epoch));
  const i = ts.findIndex((x) => x >= t);
  if (i < 0 || t < ts[0]) return null;
  const lo = Math.max(0, Math.min(ts.length - 8, i - 4)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
  const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : (acc * (t - ts[b])) / (ts[a] - ts[b])), 1));
  const mix = (get) => [0, 1, 2].map((c) => idx.reduce((s, a, k) => s + w[k] * get(table[a])[c], 0));
  return { r: mix((l) => l.r), v: mix((l) => l.v) };
}
const ffmHigh = () => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
});

const files = new Map();
for (const c of fs.readdirSync(STORE).filter((d) => /^c\d{8}T\d{4}$/.test(d)).sort()) {
  const dir = path.join(STORE, c, 'products');
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((n) => /^(intelsat|ses)-/.test(n))) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!PRN[p.norad] || !p.forecastOem || files.has(`${p.norad}|${p.start}`)) continue;
    files.set(`${p.norad}|${p.start}`, p);
  }
}
// --arms AP,XP (any of AP, XP, U, S, F, operator): only those, in their own store, as for a later AP build (AP7.md). Without it, every arm.
const ARMS = (args.arms ?? 'AP,XP,U,S,F,operator').split(','), has = (a) => ARMS.includes(a);
const M = await openModules(), A = has('AP') || has('XP') ? await openAp(args.wasm) : null, G = has('S') ? await openSgp4Fit() : null, U = has('U') ? await openUssfXp() : null, F = has('F') ? await openFfmHost() : null;
const PCF_AP = S.pcfBytes({ forces: apForces(XMC.arms.X2.forces, { tesseral: 31, zonal: 20 }), fit: null }), PCF_XP = S.pcfBytes({ forces: {}, fit: null });
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, 'rows.jsonl');
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
for (const [key, p] of files) {
  const all = lines(p.forecastOem), t0 = Date.parse(all[0].epoch);
  for (const arc of ARCS) {
    const rowKey = `${key}|${arc}`, fitEnd = t0 + arc * HOUR;
    if (done.has(rowKey)) continue;
    const truthAll = await series(PRN[p.norad], fitEnd + 1, fitEnd + 7 * DAY);
    const days = [1, 2, 3, 4, 5, 6, 7].map((k) => truthAll.filter((l) => { const t = Date.parse(l.epoch); return t > fitEnd + (k - 1) * DAY && t <= fitEnd + k * DAY; })).map((s, i) => [i + 1, s]).filter(([, s]) => s.length >= MIN_DAY);
    const row = { key: rowKey, source: p.source, norad: p.norad, object: p.object, start: p.start, fitHours: arc, fileEnd: all.at(-1).epoch, days: days.map(([k]) => k), arms: {} };
    // No truth yet: nothing is written, so a later run scores it.
    if (!days.length) continue;
    const truth = days.flatMap(([, s]) => s), epochs = truth.map((l) => l.epoch), epochsMs = epochs.map((e) => Date.parse(e)), sizes = days.map(([, s]) => s.length), states = truth.map((l) => ({ r: l.r, v: l.v }));
    const score = async (flown) => {
      const e = await M.rtn(flown, states), out = {};
      let i = 0;
      days.forEach(([k], j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rmsOf(s.map((q) => q[c]))); out[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; });
      return out;
    };
    const seg = all.filter((l) => Date.parse(l.epoch) <= fitEnd);
    const oem = S.oemBytes({ frame: 'GCRF', object: { name: p.object, id: '', norad: p.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' });
    const w = weatherRows(p.weatherDay, '2026-07-15', '2026-12-14');
    const extra = { rows: S.spwBytes(w.rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG }))) };
    const grid = S.gridBytes(epochs);
    const run = async (name, fn) => { if (!has(name)) return; try { row.arms[name] = { days: await score(await fn()) }; } catch (error) { row.arms[name] = { error: String(error?.message ?? error).slice(0, 160) }; } };
    await run('AP', async () => { const f = await A.fit(oem, PCF_AP, extra); if (!f.ok) throw new Error(f.error); return M.toAxes(await A.propagate(f.omm, grid, PCF_AP, extra, epochs.length), epochs, 'GCRF'); });
    await run('XP', async () => { const f = await A.fit(oem, PCF_XP, undefined); if (!f.ok) throw new Error(f.error); return M.toAxes(await A.propagate(f.omm, grid, PCF_XP, undefined, epochs.length), epochs, 'GCRF'); });
    await run('U', async () => { const f = await U.fit(oem); if (!f.ok) throw new Error(f.error); return M.toAxes(await U.propagate(f.omm, grid, epochs.length), epochs, 'GCRF'); });
    await run('S', async () => {
      const { el } = await G.fit(oem, { from: seg[0].epoch, to: seg.at(-1).epoch, epoch: 'first', fitBstar: true }, { name: p.object, objectId: '' });
      const flown = await M.propagateSgp4(el, p.norad, epochsMs, 256);
      if (flown.some((x) => !x)) throw new Error('SGP4 returned no state');
      return M.toAxes(flown, epochs, 'GCRF');
    });
    await run('F', async () => {
      const settings = ffmHigh();
      const f = await F.fit(seg, [...seg[0].r, ...seg[0].v], settings, w.rows, Date.parse(seg.at(-1).epoch));
      if (!f.state) throw new Error(f.error ?? f.termination);
      const out = [];
      for (let i = 0; i < epochs.length; i += 9000) out.push(...(await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs.slice(i, i + 9000), settings, w.rows)));
      return out;
    });
    // The operator's own file, where it reaches.
    const inFile = epochsMs.map((t) => interpolate(all, t));
    if (inFile.every(Boolean)) await run('operator', async () => inFile);
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
    console.error(`${rowKey}: days ${row.days.join(',')}`);
  }
}
await F?.close();
process.exit(0);
