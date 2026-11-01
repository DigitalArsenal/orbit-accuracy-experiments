// Cost of our fits and propagators against the other implementations we can run here, same input, same machine, one thread, one call at a time. Fit: 24 h of an
// operator file at 300 s. Propagation: 3 days, output every 60 s. Each figure is the smallest of `--reps` timed calls after one warm-up. The reference XP is
// propagator/sgp4-xp, run as a black box through its published methods; nothing of it is read. Full-force engines other than FFM are in FFM's own benchmark
// (space-data-network-modules propagator/ffm/tests/evidence/engines); this file adds the mean-element side and FFM on the same input.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/speed.mjs [--reps 5] [--out file]
import fs from 'node:fs';
import { openFfmHost, openAxes, apriori, isoMs } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';
import { openSgp4Fit } from '../xp2-fit-design/lib/sgp4fit.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';
import { config as XMC } from '../xp-atmosphere-merit/common.mjs';
import { openModule } from '../sdn-gp-starlink-ffm-match/lib/modules.mjs';
import * as G1S from '../sdn-gp-starlink-ffm-match/lib/sds.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const REPS = Number(args.reps ?? 5);
const HOUR = 3600000, DAY = 86400000;
const UA = { 'User-Agent': 'sdn-operator-theory/1.0' };
const modules = process.env.SDN_MODULES_ROOT;
if (!modules) throw new Error('set SDN_MODULES_ROOT');

async function issLines() {
  const text = await (await fetch('https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt', { headers: UA })).text();
  const lines = [];
  for (const line of text.split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t.length === 7 && /^\d{4}-\d\d-\d\dT/.test(t[0])) lines.push({ epoch: isoMs(Date.parse(`${t[0]}Z`)), r: t.slice(1, 4).map(Number), v: t.slice(4, 7).map(Number) });
  }
  return lines;
}
const today = args.weather ?? new Date(Date.now() - 12 * HOUR).toISOString().slice(0, 10);
const weather = weatherRows(today, '2026-07-15', '2026-12-14');
const spw = S.spwBytes(weather.rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG })));
const FIT = { dragPrior: XMC.fit.dragPrior, srpPrior: XMC.fit.srpPrior };
const PCF = { X0: S.pcfBytes({ forces: XMC.arms.X0.forces, fit: FIT }), X2: S.pcfBytes({ forces: XMC.arms.X2.forces, fit: FIT }) };

const M = await openModules();
const G = await openSgp4Fit();
const F = await openFfmHost();
const axes = await openAxes();
const REF = await openModule(modules, 'propagator/sgp4-xp');

const raw = await issLines();
const t0 = Date.parse(raw[0].epoch);
const thin = raw.filter((l) => (Date.parse(l.epoch) - t0) % 480000 === 0 && Date.parse(l.epoch) <= t0 + 24 * HOUR);
const arc = await axes.convert(thin, 'EME2000', 'GCRF');
const object = { name: 'ISS', id: '1998-067A', norad: 25544 };
const oem = S.oemBytes({ frame: 'GCRF', object, lines: arc, useableStart: arc[0].epoch, useableStop: arc.at(-1).epoch, originator: 'operator-theory' });
const refFit = G1S.frame('ephemeris', 'OEM', G1S.oemBytes({ originator: 'operator-theory', block: { frame: 'GCRF', object, lines: arc, start: arc[0].epoch, stop: arc.at(-1).epoch, useableStart: arc[0].epoch, useableStop: arc.at(-1).epoch } }));
const flyEpochs = Array.from({ length: 3 * 1440 + 1 }, (_, i) => isoMs(t0 + i * 60000));
const flyMs = flyEpochs.map((e) => Date.parse(e));
const refGrid = G1S.frame('grid', 'OEM', G1S.oemBytes({ originator: 'operator-theory', block: { frame: 'GCRF', object, lines: flyEpochs.map((epoch) => ({ epoch, r: [0, 0, 0], v: [0, 0, 0] })), start: flyEpochs[0], stop: flyEpochs.at(-1) } }));
const forces = { gravity: 'SPHERICAL_HARMONICS', degree: 70, order: 70, thirdBodies: [10, 301], srp: false, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: 'IERS_2010' };
const ffmSettings = { forces, integrator: { tolerance: 1e-10, maxStep: 120, minStep: 1e-4 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.004 }], fixed: { agom: 0 }, apriori: apriori([0.04]) };

async function timed(fn) {
  await fn();
  let best = Infinity;
  for (let i = 0; i < REPS; i += 1) { const t = performance.now(); await fn(); best = Math.min(best, performance.now() - t); }
  return best;
}
const out = { input: 'one NASA ISS file: fit 24 h at 480 s, propagate 3 days with output every 60 s', reps: REPS, machine: 'Mac Studio M3 Ultra, Node.js, one thread, SDK browser harness', arms: {} };
const report = (name, fit, fly, note) => { out.arms[name] = { fitMs: fit === null ? null : Number(fit.toFixed(1)), propagate3dMs: fly === null ? null : Number(fly.toFixed(1)), msPerObjectDayAt60s: fly === null ? null : Number((fly / 3).toFixed(2)), note }; console.log(name, JSON.stringify(out.arms[name])); };

// SGP4, ours
let el;
const sFit = await timed(async () => { el = (await G.fit(oem, { from: arc[0].epoch, to: arc.at(-1).epoch, epoch: 'first', fitBstar: true }, { name: 'ISS', objectId: '' })).el; });
const sFly = await timed(() => M.propagateSgp4(el, 25544, flyMs, 60));
report('SGP4, ours', sFit, sFly, 'analysis/gp-error-model fit_elements (six elements and B*); propagator/sgp4');
// XP, ours, with each atmosphere
for (const [name, label, extra] of [['X0', 'XP, ours, built-in atmosphere', undefined], ['X2', 'XP2, ours, NRLMSISE-00', { rows: spw }]]) {
  let f;
  const fit = await timed(async () => { f = await M.fit(oem, PCF[name], extra); if (!f.ok) throw new Error(f.error); });
  const grid = S.gridBytes(flyEpochs);
  const fly = await timed(() => M.propagate(f.omm, grid, PCF[name], extra, flyEpochs.length));
  report(label, fit, fly, 'propagator/sdn-ap fit and propagate');
}
// XP, the reference library as a black box
{
  let omm;
  const fit = await timed(async () => { omm = (await REF.call('fit', [refFit])).elements; });
  const fly = await timed(() => REF.call('propagate', [G1S.ommFrame('omm', omm), refGrid]));
  report('XP, reference library (black box)', fit, fly, 'propagator/sgp4-xp fit and propagate');
}
// FFM, ours
{
  let f;
  const fit = await timed(async () => { f = await F.fit(arc, [...arc[0].r, ...arc[0].v], ffmSettings, weather.rows, Date.parse(arc.at(-1).epoch)); if (!f.state) throw new Error(f.error); });
  const fly = await timed(() => F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, flyEpochs, ffmSettings, weather.rows));
  report('FFM, ours, 70x70, RK78 1e-10, steps up to 120 s', fit, fly, 'analysis/estimation fit_batch; propagator/ffm');
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
await F.close(); await axes.close(); await M.close(); await REF.destroy();
process.exit(0);
