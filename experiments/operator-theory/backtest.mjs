// The back-test (BACKTEST.md): each arm fitted to one captured SpaceX file head and flown to the first 3 h of every newer file of the same object. Reads only the state
// vectors of the capture's $OCM sidecars, never their covariance values, and never prints a state. Rows match score.mjs, so table.mjs reads them. A rerun adds new pairs only.
//   node experiments/operator-theory/backtest.mjs --out <dir> --shard k/n [--count 400] [--capture <root>] [--norads a,b] [--only-cycles a,b]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as flatbuffers from 'flatbuffers';
import * as O from 'spacedatastandards.org/lib/js/OCM/main.js';
import { openFfmHost, apriori, isoMs } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';
import { openSgp4Fit } from '../xp2-fit-design/lib/sgp4fit.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';
import { config as XMC } from '../xp-atmosphere-merit/common.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const CAPTURE = args.capture ?? '/opt/data/sdn-archive/operator-capture';
const OUT = args.out;
if (!OUT) throw new Error('--out <dir>');
const COUNT = Number(args.count ?? 400);
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const HOUR = 3600000, TRUTH_H = 3, MIN_GAP_H = 6, MAX_LEAD_H = 180;
const FIRST_CYCLE = '2026-10-30T05-01-35-297Z';
const FORWARD_CYCLE = args['forward-cycle'] ?? '/opt/data/sdn-archive/operator-theory/c20261101T0326';
const SUBSETS = new URL('../operator-capture/SUBSETS.md', import.meta.url);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const short = (e) => String(e?.message ?? e).slice(0, 160);
const cycleMs = (id) => Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z'));

// ---- the fixed sample (BACKTEST.md, Satellites)
function sample(firstCycleNorads, v2, forward, count) {
  const heldOutByE13b = (n) => parseInt(sha(`e13b-20261023:${n}`).slice(0, 8), 16) % 5 === 0;
  return firstCycleNorads.filter((n) => !heldOutByE13b(n) && !v2.has(n) && !forward.has(n)).sort((a, b) => sha(`operator-theory-backtest-20261101:${a}`).localeCompare(sha(`operator-theory-backtest-20261101:${b}`))).slice(0, count);
}
const cyclesRoot = path.join(CAPTURE, 'cycles');
const onlyCycles = args['only-cycles'] ? new Set(args['only-cycles'].split(',')) : null;
const cycles = fs.readdirSync(cyclesRoot).filter((d) => d >= FIRST_CYCLE && fs.existsSync(path.join(cyclesRoot, d, 'summary.json')) && (!onlyCycles || onlyCycles.has(d))).sort();
const ocmNorads = (cycle) => fs.readdirSync(path.join(cyclesRoot, cycle)).filter((n) => /^\d+\.ocm$/.test(n)).map((n) => Number(n.split('.')[0]));
const v2 = new Set(JSON.parse(/```json\n([\s\S]*?)```/.exec(fs.readFileSync(SUBSETS, 'utf8'))[1]).subsets.flatMap((s) => s.norads));
const forward = new Set(fs.readdirSync(path.join(FORWARD_CYCLE, 'products')).filter((n) => n.startsWith('starlink-')).map((n) => Number(n.split('-')[1])));
if (forward.size !== 60) throw new Error(`the forward test holds 60 Starlink objects, found ${forward.size}`);
const chosen = args.norads ? args.norads.split(',').map(Number) : sample(ocmNorads(FIRST_CYCLE), v2, forward, COUNT);
const mine = chosen.filter((n) => parseInt(sha(`shard:${n}`).slice(0, 8), 16) % SHARDS === SHARD);

// ---- a captured head: states only
function readHead(cycle, norad) {
  const file = path.join(cyclesRoot, cycle, `${norad}.ocm`);
  if (!fs.existsSync(file)) return null;
  const o = O.OCM.getSizePrefixedRootAsOCM(new flatbuffers.ByteBuffer(new Uint8Array(fs.readFileSync(file)))).unpack();
  const t0 = Date.parse(o.METADATA.START_TIME), step = o.STATE_STEP_SIZE * 1000, data = o.STATE_DATA;
  const lines = [];
  for (let i = 0; i * 6 < data.length; i += 1) lines.push({ epoch: isoMs(t0 + i * step), r: [data[6 * i], data[6 * i + 1], data[6 * i + 2]], v: [data[6 * i + 3], data[6 * i + 4], data[6 * i + 5]] });
  return { cycle, norad, object: o.METADATA.OBJECT_NAME, start: isoMs(t0), t0, lines };
}

/** The older head's own state at t: Hermite on the eight nearest states for position (about 2 mm at 600 s in low orbit), degree 7 for the velocity that only names the RTN axes. A data step. */
function interpolate(lines, t) {
  const ts = lines.map((l) => Date.parse(l.epoch));
  if (t < ts[0] || t > ts.at(-1)) return null;
  const i = ts.findIndex((x) => x >= t);
  const lo = Math.max(0, Math.min(ts.length - 8, i - 4)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
  const u = idx.map((k) => ts[k] / 1000), x = t / 1000;
  const L = u.map((a, m) => u.reduce((acc, b, n) => (n === m ? acc : acc * (x - b) / (a - b)), 1));
  const dL = u.map((a, m) => u.reduce((acc, b, n) => (n === m ? acc : acc + 1 / (a - b)), 0));
  const r = [0, 1, 2].map((c) => idx.reduce((s, k, m) => s + L[m] * L[m] * ((1 - 2 * dL[m] * (x - u[m])) * lines[k].r[c] + (x - u[m]) * lines[k].v[c]), 0));
  const v = [0, 1, 2].map((c) => idx.reduce((s, k, m) => s + L[m] * lines[k].v[c], 0));
  return { r, v };
}

// ---- settings: PLAN.md's
const FIT = { dragPrior: XMC.fit.dragPrior, srpPrior: XMC.fit.srpPrior };
const PCF = { X0: S.pcfBytes({ forces: XMC.arms.X0.forces, fit: FIT }), X2: S.pcfBytes({ forces: XMC.arms.X2.forces, fit: FIT }) };
const pinned = (b) => S.pcfBytes({ forces: XMC.arms.X2.forces, fit: { dragPrior: { form: 'LOG_NORMAL', mean: b, sigma: 1e-6 }, srpPrior: FIT.srpPrior } });
const integrator = { tolerance: 1e-10, maxStep: 120, minStep: 1e-4 };
const ffmSettings = (norad, atmosphere) => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 70, order: 70, thirdBodies: [10, 301], srp: true, drag: true, atmosphere, solidTides: true, relativity: 'IERS_2010' },
  integrator, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.03 }], fixed: { agom: norad < 56000 ? 0.11 : 0.19 }, apriori: apriori([0.3]),
});
const weatherOf = new Map();
function weather(day) {
  if (!weatherOf.has(day)) {
    const w = weatherRows(day, '2026-07-15', '2026-12-14');
    weatherOf.set(day, { rows: w.rows, spw: S.spwBytes(w.rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG }))) });
  }
  return weatherOf.get(day);
}

const M = await openModules();
const G = await openSgp4Fit();
const F = await openFfmHost();

/** Every arm's fit of one head, kept as compact products so a later cycle only flies them. */
async function fitAll(head, w) {
  const { lines, t0, norad, object } = head;
  const obj = { name: object, id: '', norad };
  const arcOf = (h) => lines.filter((l) => Date.parse(l.epoch) <= t0 + h * HOUR);
  const lastOf = (h, end) => lines.filter((l) => { const t = Date.parse(l.epoch); return t >= end - h * HOUR && t <= end; });
  const oem = (arc) => S.oemBytes({ frame: 'GCRF', object: obj, lines: arc, useableStart: arc[0].epoch, useableStop: arc.at(-1).epoch, originator: 'operator-theory' });
  const products = {}, diagnostics = {};
  const attempt = async (name, run) => {
    const started = performance.now();
    try { products[name] = await run(); diagnostics[name] = { ms: Math.round(performance.now() - started), ...(diagnostics[name] ?? {}) }; } catch (error) { diagnostics[name] = { error: short(error) }; }
  };
  await attempt('S12', async () => {
    const { el, bstar } = await G.fit(oem(arcOf(12)), { from: lines[0].epoch, to: isoMs(t0 + 12 * HOUR), epoch: 'first', fitBstar: true }, { name: object, objectId: '' });
    diagnostics.S12 = { bstar };
    return el;
  });
  for (const a of [12, 16]) for (const name of ['X0', 'X2']) {
    await attempt(`${name}@${a}`, async () => {
      const f = await M.fit(oem(arcOf(a)), PCF[name], name === 'X2' ? { rows: w.spw } : undefined);
      if (!f.ok) throw new Error(f.error);
      const info = S.readFitOmm(f.omm);
      diagnostics[`${name}@${a}`] = { bterm: info.bterm, fitRmsKm: info.fitRmsKm };
      return Buffer.from(f.omm).toString('base64');
    });
  }
  for (const [a, atmosphere] of [[12, 'NRLMSISE00'], [16, 'NRLMSISE00'], [16, 'EXPONENTIAL']]) {
    const name = `F-${atmosphere}@${a}`, settings = ffmSettings(norad, atmosphere);
    await attempt(name, async () => {
      const arc = arcOf(a);
      const f = await F.fit(arc, [...arc[0].r, ...arc[0].v], settings, w.rows, Date.parse(arc.at(-1).epoch));
      if (!f.state) throw new Error(f.error ?? f.termination);
      diagnostics[name] = { termination: f.termination, b: f.parameters?.[0]?.value };
      return { epoch: f.epoch, state: f.state, parameters: f.parameters, forces: settings.forces, fixed: settings.fixed };
    });
  }
  await attempt('RFa12@16', async () => {
    const end = Math.min(t0 + 16 * HOUR, Date.parse(lines.at(-1).epoch));
    const drag = lastOf(12, end), settings = ffmSettings(norad, 'NRLMSISE00');
    const g = await F.fit(drag, [...drag[0].r, ...drag[0].v], settings, w.rows, end);
    const b = g.parameters?.[0]?.value;
    diagnostics['RFa12@16'] = { termination: g.termination, b };
    if (!g.state) throw new Error(g.error ?? g.termination);
    if (!(b > 0)) throw new Error('no positive drag from the 12 h fit');
    const f = await M.fit(oem(lastOf(16, end)), pinned(b), { rows: w.spw });
    if (!f.ok) throw new Error(f.error);
    return { omm: Buffer.from(f.omm).toString('base64'), b };
  });
  return { products, diagnostics };
}

const rmsOf = (e) => Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);
const scorer = (truthStates) => async (states) => {
  const e = await M.rtn(states, truthStates);
  return { km: Math.hypot(rmsOf(e.map((x) => x[0])), rmsOf(e.map((x) => x[1])), rmsOf(e.map((x) => x[2]))), r: rmsOf(e.map((x) => x[0])), t: rmsOf(e.map((x) => x[1])), n: rmsOf(e.map((x) => x[2])) };
};

fs.mkdirSync(path.join(OUT, 'products'), { recursive: true });
const rowsFile = path.join(OUT, `rows-${SHARD}.jsonl`);
const done = new Set();
if (fs.existsSync(rowsFile)) for (const line of fs.readFileSync(rowsFile, 'utf8').split('\n')) if (line) { const r = JSON.parse(line); done.add(`${r.norad}|${r.olderStart}|${r.newerStart}`); }
let added = 0;
for (const norad of mine) {
  // Each distinct file once, from the first cycle holding it.
  const heads = [];
  for (const cycle of cycles) {
    const head = readHead(cycle, norad);
    if (head && !heads.some((x) => x.start === head.start)) heads.push(head);
  }
  heads.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i < heads.length; i += 1) {
    const older = heads[i];
    const newers = heads.slice(i + 1).filter((n) => { const h = (n.t0 - older.t0) / HOUR; return h > MIN_GAP_H && h <= MAX_LEAD_H && !done.has(`${norad}|${older.start}|${n.start}`); });
    if (!newers.length) continue;
    const weatherDay = isoMs(cycleMs(older.cycle) - 12 * HOUR).slice(0, 10);
    const w = weather(weatherDay);
    const store = path.join(OUT, 'products', `${norad}-${older.t0}.json`);
    let fitted;
    if (fs.existsSync(store)) fitted = JSON.parse(fs.readFileSync(store, 'utf8'));
    else {
      fitted = { norad, object: older.object, cycle: older.cycle, start: older.start, states: older.lines.length, weatherDay, ...(await fitAll(older, w)) };
      fs.writeFileSync(store, JSON.stringify(fitted));
    }
    // FFM flies once per fit across every newer reference; the module samples the same trajectory.
    const refs = newers.map((n) => {
      const truth = n.lines.filter((l) => Date.parse(l.epoch) <= n.t0 + TRUTH_H * HOUR);
      return { n, truth, epochs: truth.map((l) => l.epoch), epochsMs: truth.map((l) => Date.parse(l.epoch)), states: truth.map((l) => ({ r: l.r, v: l.v })) };
    });
    const allEpochs = [...new Set(refs.flatMap((r) => r.epochsMs))].sort((a, b) => a - b).map(isoMs);
    const ffm = {};
    for (const [name, product] of Object.entries(fitted.products)) {
      if (!name.startsWith('F-')) continue;
      try {
        const settings = { forces: product.forces, fixed: product.fixed, integrator };
        const flown = await F.forecast({ epoch: product.epoch, state: product.state, parameters: product.parameters }, allEpochs, settings, w.rows);
        ffm[name] = new Map(allEpochs.map((e, k) => [e, flown[k]]));
      } catch (error) { ffm[name] = { error: short(error) }; }
    }
    for (const ref of refs) {
      const { n, epochs, epochsMs, states: truthStates } = ref;
      const score = scorer(truthStates);
      const row = { key: `starlink|${norad}`, source: 'starlink', norad, object: older.object, older: older.cycle, newer: n.cycle, olderStart: older.start, newerStart: n.start, leadHours: (n.t0 - older.t0) / HOUR, truthStates: epochs.length, weatherDay, arms: {} };
      const own = epochsMs.map((t) => interpolate(older.lines, t));
      if (own.every(Boolean)) row.arms.operator = await score(own);
      for (const [name, product] of Object.entries(fitted.products)) {
        try {
          if (name.startsWith('S')) {
            const flown = await M.propagateSgp4(product, norad, epochsMs, (epochsMs[1] - epochsMs[0]) / 1000);
            if (flown.some((x) => !x)) throw new Error('SGP4 returned no state');
            row.arms[name] = await score(await M.toAxes(flown, epochs, 'GCRF'));
          } else if (name.startsWith('X')) {
            const kind = name.split('@')[0];
            const flown = await M.propagate(Buffer.from(product, 'base64'), S.gridBytes(epochs), PCF[kind], kind === 'X2' ? { rows: w.spw } : undefined, epochs.length);
            row.arms[name] = await score(await M.toAxes(flown, epochs, 'GCRF'));
          } else if (name.startsWith('RFa')) {
            const flown = await M.propagate(Buffer.from(product.omm, 'base64'), S.gridBytes(epochs), pinned(product.b), { rows: w.spw }, epochs.length);
            row.arms[name] = await score(await M.toAxes(flown, epochs, 'GCRF'));
          } else if (name.startsWith('F-')) {
            if (ffm[name].error) throw new Error(ffm[name].error);
            row.arms[name] = await score(epochs.map((e) => ffm[name].get(e)));
          }
        } catch (error) { row.arms[name] = { error: short(error) }; }
      }
      for (const [name, d] of Object.entries(fitted.diagnostics)) if (d.error && !row.arms[name]) row.arms[name] = { error: d.error };
      fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);
      added += 1;
    }
  }
}
console.error(`${added} pairs added, shard ${SHARD}/${SHARDS}, ${mine.length} objects, ${cycles.length} cycles`);
await F.close(); await M.close();
process.exit(0);
