// PER-REV-FLAG.md, amendment of 2026-11-06 (two separating tests): per passive-sphere window, the truth product's file joins in [cutoff - 72 h, cutoff + 168 h], and
// the model-truth control: FFM24's product (as-issued weather) flown on the definitive weather (lib/weather.mjs rowsM) as a truth with drag and no joins, the
// detector run unchanged on it (FFM24 fitted to its 24 h arc, as-issued weather, flown over the span; revolution means of both). WAAS: the broadcast runs' starts
// only. Truth through all-regimes.mjs's readers; a held object is never read. Module calls only: this file reads, routes and rounds.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/per-rev-flag-separate.mjs --group LS|GD|WA --shard k/n
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, root, HOUR, DAY, iso, ms, XM } from './lib/xp2.mjs';
import { driverRows } from './lib/xm3.mjs';
import { openFfmHost, apriori } from './lib/host.mjs';
import { FFM_220, ORBITS_010 } from './lib/build.mjs';
import { STATIC, WA_CUTOFFS } from './lib/regimes.mjs';
import { openElements, revolutions } from './lib/steps.mjs';
import { STORE as FLIGHTS, SPAN, windowsOf, heldWindow } from './per-rev-flag.mjs';

export const STORE = '/opt/data/sdn-archive/operator-theory/per-rev-flag-separate';
export const LOW_SET = ['LARETS', 'WESTPAC', 'STARLETTE'];

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number), GROUP = args.group;
  if (!['LS', 'GD', 'WA'].includes(GROUP)) throw new Error('--group LS|GD|WA');
  if (process.env.XP2F_CONTROL === '1') throw new Error('LS, GD and WA run without XP2F_CONTROL');
  const runner = crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
  const dir = path.join(args.store ?? STORE, GROUP);
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, `rows-${SHARD}.jsonl`);
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  // The windows whose FFM24 fitted in per-rev-flag.mjs.
  const flown = new Set(fs.readdirSync(path.join(FLIGHTS, GROUP)).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(FLIGHTS, GROUP, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => r.ok).map((r) => r.key));
  const list = windowsOf(GROUP).filter((w) => flown.has(w.key) && inShard(w.key) && !done.has(w.key));
  for (const w of list) if (heldWindow(w)) throw new Error(`${w.key}: held`);
  const names = new Set(list.map((w) => w.name)), series = new Map(), joins = new Map();
  if (GROUP === 'WA') {
    const { SBAS, series: sbas } = await import('./lib/sbas.mjs');
    for (const [prn, sat] of Object.entries(SBAS)) if (names.has(sat.name)) series.set(sat.name, await sbas(Number(prn), WA_CUTOFFS[0] - 4 * DAY, WA_CUTOFFS.at(-1) + 8 * DAY));
    // A broadcast run is records 256 s apart; each run's first record starts a join.
    for (const [name, lines] of series) { const t = lines.map((l) => ms(l.epoch)).sort((a, b) => a - b); joins.set(name, t.filter((x, i) => i === 0 || x - t[i - 1] !== 256000)); }
  } else {
    for (const o of STATIC.filter((x) => x.group === GROUP)) {
      const files = o.files();
      if (!files.length) continue;
      const s = SRC.chain(files), name = s.name || o.name;
      if (!names.has(name)) continue;
      series.set(name, s.lines);
      // Each product file's first state after the object's first file: where the chained series moves to the next file.
      joins.set(name, files.slice(1).map((f) => SRC.chain([f]).lines[0]).filter(Boolean).map((l) => ms(l.epoch)));
    }
  }
  const control = GROUP !== 'WA', F = control ? await openFfmHost({ ffm: FFM_220 }) : null, el = control ? await openElements({ build: ORBITS_010 }) : null;
  const ffmLow = () => ({ forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]) });
  const ffmHigh = () => ({ forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]) });
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const revs = async (lines) => (await revolutions(lines, el)).map((x) => [x.t, r3(x.aM)]);
  const spwOf = (rows, D0) => driverRows(rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
  /** The product carried over `lines`' epochs, backward from its epoch then forward, in chunks: [{ epoch, r, v }]. */
  const fly = async (product, lines, settings, spw) => {
    const P0 = ms(product.epoch), back = lines.filter((l) => ms(l.epoch) < P0), ahead = lines.filter((l) => ms(l.epoch) >= P0), out = [];
    for (let i = back.length; i > 0; i -= 9000) { const part = back.slice(Math.max(0, i - 9000), i).reverse(); const st = await F.forecast(product, part.map((l) => l.epoch), settings, spw); out.unshift(...st.map((s, j) => ({ epoch: part[j].epoch, r: s.r, v: s.v })).reverse()); }
    for (let i = 0; i < ahead.length; i += 9000) { const part = ahead.slice(i, i + 9000); const st = await F.forecast(product, part.map((l) => l.epoch), settings, spw); out.push(...st.map((s, j) => ({ epoch: part[j].epoch, r: s.r, v: s.v }))); }
    return out;
  };
  for (const w of list) {
    const D0 = Date.parse(w.cutoff), from = D0 - SPAN.backHours * HOUR, to = D0 + SPAN.leadHours * HOUR;
    const row = { key: w.key, group: GROUP, norad: w.norad, name: w.name, cutoff: iso(D0), createdUtc: new Date().toISOString(), runner, joins: (joins.get(w.name) ?? []).filter((t) => t >= from && t <= to) };
    try {
      if (control) {
        const lines = series.get(w.name);
        if (!lines) throw new Error(`${w.name}: no truth`);
        const span = lines.filter((l) => { const t = ms(l.epoch); return t >= from && t <= to; });
        const gaps = span.slice(1).map((l, i) => ms(l.epoch) - ms(span[i].epoch)).sort((a, b) => a - b), start = ms(span[0].epoch);
        const use = gaps[gaps.length >> 1] < SPAN.fineS * 1000 ? span.filter((l) => (ms(l.epoch) - start) % (SPAN.fineS * 1000) === 0) : span;
        const thin = T.thinned(lines.filter((l) => { const t = ms(l.epoch); return t >= D0 - SPAN.fitHours * HOUR && t <= D0; })).chosen;
        const high = Math.hypot(...thin[0].r) >= 8400, settings = high ? ffmHigh() : ffmLow();
        let O, M;
        if (!high) {
          const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0); if (R.excluded) throw new Error(R.excluded);
          const D = W.rowsM(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0 + 8 * DAY);
          O = spwOf(R.rows, D0); M = spwOf(D.rows, D0);
        }
        const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, O, D0);
        if (!f.state) throw new Error(f.error ?? f.termination);
        // The model truth: FFM24's product on the definitive weather, at the truth's epochs.
        const model = await fly({ epoch: f.epoch, state: f.state, parameters: f.parameters }, use, settings, M);
        // The detector on it, unchanged: FFM24 fitted to the model's 24 h arc on the as-issued weather, flown over the span.
        const arc = T.thinned(model.filter((l) => { const t = ms(l.epoch); return t >= D0 - SPAN.fitHours * HOUR && t <= D0; })).chosen;
        const g = await F.fit(arc, [...arc[0].r, ...arc[0].v], settings, O, D0);
        if (!g.state) throw new Error(g.error ?? g.termination);
        const flight = await fly({ epoch: g.epoch, state: g.state, parameters: g.parameters }, use, settings, O);
        Object.assign(row, { ok: true, ffm: F.provenance.ffm, settings: high ? 'high' : 'low', b: f.parameters?.[0]?.value ?? null, bModel: g.parameters?.[0]?.value ?? null, modelTruth: await revs(model), modelFlight: await revs(flight) });
      } else row.ok = true;
    } catch (error) { row.ok = false; row.error = String(error?.message ?? error).slice(0, 180); }
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  }
  console.error(`per-rev-flag-separate ${GROUP} shard ${SHARD}/${SHARDS}: ${list.length} windows`);
  await F?.close(); await el?.close();
  process.exit(0);
}
