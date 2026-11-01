// The ISS against FFM: NASA's public OEM carries its own mass, drag area and Cd and declares zero solar radiation pressure. Fit the state, or the state
// and B, to the start of the file under one force-model candidate, and read how far the candidate sits from the rest of the file. The file stays in
// memory only; the report holds statistics. Plain RMS of position difference in km.
//   node experiments/operator-theory/iss.mjs [--candidates a,b,c] [--arcs 24] [--out file]
import fs from 'node:fs';
import { openFfmHost, openAxes, apriori, isoMs } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const URL_ISS = 'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt';
const HOUR = 3600000, DAY = 86400000;
const SUN_MOON = [10, 301];
const BASE = { gravity: 'SPHERICAL_HARMONICS', degree: 70, order: 70, thirdBodies: SUN_MOON, srp: false, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: 'IERS_2010', ...(args.base ? JSON.parse(args.base) : {}) };
export const CANDIDATES = {
  base: {},
  'grav-egm96-70': { gravity: 'EGM96' },
  'grav-50': { degree: 50, order: 50 },
  'grav-36': { degree: 36, order: 36 },
  'grav-30': { degree: 30, order: 30 },
  'grav-24': { degree: 24, order: 24 },
  'grav-16': { degree: 16, order: 16 },
  'grav-20': { degree: 20, order: 20 },
  'grav-12': { degree: 12, order: 12 },
  'grav-8': { degree: 8, order: 8 },
  'grav-4': { degree: 4, order: 4 },
  'grav-j2-j4': { gravity: 'J2_TO_J4' },
  'atm-jr': { atmosphere: 'JACCHIA_ROBERTS' },
  'atm-hp': { atmosphere: 'HARRIS_PRIESTER' },
  'atm-exp': { atmosphere: 'EXPONENTIAL' },
  'atm-none': { drag: false },
  'third-none': { thirdBodies: [] },
  'third-planets': { thirdBodies: [10, 301, 2, 4, 5] },
  'atm-msis': { atmosphere: 'NRLMSISE00' },
  'atm-ussa': { atmosphere: 'USSA1976' },
  'srp-on': { srp: true },
  'tides-off': { solidTides: false },
  'rel-off': { relativity: 'NONE' },
  'ocean-on': { oceanTides: true },
};

const text = await (await fetch(URL_ISS)).text();
const header = text.split('\n').filter((l) => /^(CREATION_DATE|ORIGINATOR|REF_FRAME|TIME_SYSTEM|START_TIME|STOP_TIME|COMMENT)/.test(l)).map((l) => l.trim());
const num = (name) => Number(new RegExp(`COMMENT ${name}=([0-9.]+)`).exec(text)[1]);
const mass = num('MASS'), dragArea = num('DRAG_AREA'), cd = num('DRAG_COEFF');
const B = cd * dragArea / mass;
const raw = [];
for (const line of text.split('\n')) {
  const t = line.trim().split(/\s+/);
  if (t.length === 7 && /^\d{4}-\d\d-\d\dT/.test(t[0])) raw.push({ epoch: isoMs(Date.parse(`${t[0]}Z`)), r: t.slice(1, 4).map(Number), v: t.slice(4, 7).map(Number) });
}
const axes = await openAxes();
const gcrf = await axes.convert(raw, 'EME2000', 'GCRF');
await axes.close();
const t0 = Date.parse(gcrf[0].epoch), tEnd = Date.parse(gcrf.at(-1).epoch);
const weather = weatherRows('2026-10-31', '2026-07-15', '2026-12-14');
/** The same rows with one flux and one Ap held on every day: a forecast that assumes fixed activity. */
const heldWeather = (f, ap) => weather.rows.map((r) => ({ ...r, F107_OBS: f, F107_ADJ: f, F107_OBS_CENTER81: f, AP_AVG: ap, AP1: ap, AP2: ap, AP3: ap, AP4: ap, AP5: ap, AP6: ap, AP7: ap, AP8: ap }));
console.error(`ISS file ${header[0]}, ${gcrf.length} states to ${gcrf.at(-1).epoch}, B ${B.toExponential(5)} m2/kg, weather observed through ${weather.observedThrough}`);

const F = await openFfmHost();
const integrator = { tolerance: 1e-10, maxStep: 120, minStep: 1e-4 };
const rmsKm = (a) => Math.sqrt(a.reduce((s, x) => s + x, 0) / a.length);
const BINS = [[0, 6], [6, 12], [12, 24], [24, 48], [48, 72], [72, 120], [120, 168], [168, 240], [240, 360]];

async function run(name, overrides, arcHours, freeB, weatherRowsUsed = weather.rows) {
  const forces = { ...BASE, ...overrides };
  const drag = forces.drag;
  const settings = {
    forces, integrator, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: freeB && drag ? [{ kind: 'DRAG_AREA_OVER_MASS', value: B }] : [],
    fixed: { b: drag ? B : 0, agom: forces.srp ? 0.01 : 0 },
    apriori: apriori(freeB && drag ? [B * 3] : []),
  };
  const arc = gcrf.filter((l) => Date.parse(l.epoch) <= t0 + arcHours * HOUR);
  const started = performance.now();
  const f = await F.fit(arc, [...arc[0].r, ...arc[0].v], settings, weatherRowsUsed, t0 + arcHours * HOUR);
  const fitMs = performance.now() - started;
  if (!f.state) return { name, arcHours, freeB, ok: false, error: f.error ?? f.termination, fitMs };
  const states = await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, gcrf.map((l) => l.epoch), settings, weatherRowsUsed);
  const d2 = gcrf.map((l, i) => l.r.reduce((s, x, k) => s + (x - states[i].r[k]) ** 2, 0));
  const hours = gcrf.map((l) => (Date.parse(l.epoch) - t0) / HOUR);
  const bins = Object.fromEntries(BINS.map(([a, b]) => { const v = d2.filter((_, i) => hours[i] > a && hours[i] <= b); return [`${a}-${b}h`, v.length ? Number(rmsKm(v).toFixed(3)) : null]; }));
  const inArc = d2.filter((_, i) => hours[i] <= arcHours);
  return { name, arcHours, freeB, ok: !!f.ok, termination: f.termination, fitRmsKm: Number(rmsKm(inArc).toFixed(4)), b: f.parameters?.[0]?.value ?? B, bRatio: Number(((f.parameters?.[0]?.value ?? B) / B).toFixed(3)), iterations: f.iterations, ffmCalls: f.ffmCalls, fitSeconds: Number((fitMs / 1000).toFixed(1)), bins };
}

const names = (args.candidates ?? 'base').split(',');
const skipPlain = args.held && args['held-only'];
const arcs = (args.arcs ?? '24').split(',').map(Number);
const modes = (args.modes ?? 'fixed,free').split(',');
const rows = [];
if (!skipPlain) for (const name of names) for (const arc of arcs) for (const mode of modes) {
  const out = await run(name, CANDIDATES[name], arc, mode === 'free');
  rows.push(out);
  console.log(JSON.stringify(out));
}
// --held: every candidate again under each held flux and Ap, F10.7:Ap pairs.
for (const pair of (args.held ?? '').split(',').filter(Boolean)) {
  const [f, ap] = pair.split(':').map(Number);
  for (const name of names) for (const arc of arcs) for (const mode of modes) {
    const out = { held: pair, ...(await run(name, CANDIDATES[name], arc, mode === 'free', heldWeather(f, ap))) };
    rows.push(out);
    console.log(JSON.stringify(out));
  }
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ header, B, mass, dragArea, cd, states: gcrf.length, weatherObservedThrough: weather.observedThrough, provenance: F.provenance, rows }, null, 1));
await F.close();
process.exit(0);
