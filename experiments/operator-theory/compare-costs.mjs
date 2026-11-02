// COMPARE.md: what each propagator costs on the same files, in one process, one call at a time. Each file's five arms run in an order that rotates by file, so a change of
// load on the machine falls on all of them alike. The first file is a warm-up and is not counted. Fit: the file's first 48 h. Flight: every state of the file.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/compare-costs.mjs --root <store> --ap030 <wasm> --ap040 <wasm> --out <file> [--files 40]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openFfmHost, apriori, isoMs } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';
import { openAp, apForces } from './lib/ap.mjs';
import { openUssfXp } from './lib/ussf-xp.mjs';
import { openSgp4Fit } from '../xp2-fit-design/lib/sgp4fit.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';
import { config as XMC } from '../xp-atmosphere-merit/common.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ROOT = args.root, OUT = args.out, COUNT = Number(args.files ?? 40), HOUR = 3600000;
if (!ROOT || !OUT || !args.ap030 || !args.ap040) throw new Error('--root, --ap030, --ap040 and --out');

const cycles = fs.readdirSync(ROOT).filter((d) => /^c\d{8}T\d{4}$/.test(d) && fs.existsSync(path.join(ROOT, d, 'products'))).sort();
const refs = [];
for (const c of cycles) for (const f of fs.readdirSync(path.join(ROOT, c, 'products'))) refs.push(path.join(ROOT, c, 'products', f));
const rank = (p) => crypto.createHash('sha256').update(`compare-costs-20261102:${path.basename(p)}`).digest('hex');
const chosen = [];
for (const file of refs.sort((a, b) => rank(a).localeCompare(rank(b)))) {
  if (chosen.length >= COUNT + 1) break;
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (p.forecastOem && String(p.source).endsWith('-leo') && Date.parse(p.stop) - Date.parse(p.start) >= 48 * HOUR) chosen.push(file);
}

const weather = weatherRows('2026-10-10', '2026-02-20', '2026-12-14');
const spw = S.spwBytes(weather.rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG })));
const M = await openModules();
const G = await openSgp4Fit();
const F = await openFfmHost();
const A030 = await openAp(args.ap030), A040 = await openAp(args.ap040), U = await openUssfXp();
const pcfXp = S.pcfBytes({ forces: apForces(XMC.arms.X2.forces, { atmosphere: false, noTerms: true }), fit: null });
const pcfAp = S.pcfBytes({ forces: apForces(XMC.arms.X2.forces, { tesseral: 31, zonal: 20 }), fit: null });
const ffm = (degree, tides) => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree, order: degree, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: tides, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
});

const timed = async (fn) => { const t = performance.now(); const value = await fn(); return [value, (performance.now() - t) / 1000]; };
const ARMS = {
  SGP4: async ({ p, oem, seg, t0, ms }) => {
    const [fit, fitSeconds] = await timed(() => G.fit(oem, { from: seg[0].epoch, to: isoMs(t0 + 48 * HOUR), epoch: 'first', fitBstar: true }, { name: p.object, objectId: '' }));
    const [flown, flightSeconds] = await timed(() => M.propagateSgp4(fit.el, p.norad, ms, (ms[1] - ms[0]) / 1000));
    if (flown.some((x) => !x)) throw new Error('SGP4 returned no state');
    return { fitSeconds, flightSeconds };
  },
  XP: async ({ oem, epochs }) => {
    const [fit, fitSeconds] = await timed(() => A030.fit(oem, pcfXp, undefined));
    if (!fit.ok) throw new Error(fit.error);
    const [, flightSeconds] = await timed(() => A030.propagate(fit.omm, S.gridBytes(epochs), pcfXp, undefined, epochs.length));
    return { fitSeconds, flightSeconds };
  },
  XPU: async ({ oem, epochs }) => {
    const [fit, fitSeconds] = await timed(() => U.fit(oem));
    if (!fit.ok) throw new Error(fit.error);
    const [, flightSeconds] = await timed(() => U.propagate(fit.omm, S.gridBytes(epochs), epochs.length));
    return { fitSeconds, flightSeconds };
  },
  AP: async ({ oem, epochs }) => {
    const [fit, fitSeconds] = await timed(() => A040.fit(oem, pcfAp, { rows: spw }));
    if (!fit.ok) throw new Error(fit.error);
    const [, flightSeconds] = await timed(() => A040.propagate(fit.omm, S.gridBytes(epochs), pcfAp, { rows: spw }, epochs.length));
    return { fitSeconds, flightSeconds };
  },
};
for (const [name, degree, tides] of [['FFM20', 20, false], ['FFM40', 40, true]]) {
  const settings = ffm(degree, tides);
  ARMS[name] = async ({ seg, epochs }) => {
    const [fit, fitSeconds] = await timed(() => F.fit(seg, [...seg[0].r, ...seg[0].v], settings, weather.rows, Date.parse(seg.at(-1).epoch)));
    if (!fit.state) throw new Error(fit.error ?? fit.termination);
    const [, flightSeconds] = await timed(() => F.forecast({ epoch: fit.epoch, state: fit.state, parameters: fit.parameters }, epochs, settings, weather.rows));
    return { fitSeconds, flightSeconds };
  };
}

// --only XP,XPU: the two versions of XP head to head. Without it, this file's registered arms.
const NAMES = args.only ? args.only.split(',') : Object.keys(ARMS).filter((n) => n !== 'XPU');
for (let k = 0; k < chosen.length; k += 1) {
  const p = JSON.parse(fs.readFileSync(chosen[k], 'utf8'));
  const all = S.oemLines(Buffer.from(p.forecastOem, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));
  const t0 = Date.parse(all[0].epoch);
  const seg = all.filter((l) => Date.parse(l.epoch) <= t0 + 48 * HOUR);
  const oem = S.oemBytes({ frame: 'GCRF', object: { name: p.object, id: '', norad: p.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' });
  const epochs = all.map((l) => l.epoch), ms = epochs.map((e) => Date.parse(e));
  const row = { file: path.basename(chosen[k]), source: p.source, object: p.object, warmUp: k === 0, fitStates: seg.length, flightStates: all.length, flightDays: (ms.at(-1) - ms[0]) / (24 * HOUR), arms: {} };
  const order = NAMES.map((_, i) => NAMES[(i + k) % NAMES.length]);
  for (const name of order) {
    try { row.arms[name] = await ARMS[name]({ p, oem, seg, t0, ms, epochs }); } catch (error) { row.arms[name] = { error: String(error.message).slice(0, 160) }; }
  }
  fs.appendFileSync(OUT, `${JSON.stringify(row)}\n`);
  console.error(`${k + 1}/${chosen.length} ${p.object}`);
}
await F.close(); await M.close();
process.exit(0);
