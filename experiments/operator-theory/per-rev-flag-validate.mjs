// PER-REV-FLAG.md, amendment of 2026-11-06 (rule (b) and its validation): FFM24 flown as per-rev-flag.mjs flies it on the validation windows, and on the injection
// windows the truth with a registered along-track step added after t_b (the difference of two FFM flights from t_b of the window's own FFM24 product, one with its
// velocity raised by dv = mu da / (2 a^2 v)). Truth through the readers per-rev-flag.mjs uses; a held object is never read. Module calls only: this file reads,
// routes, adds stored differences and rounds.
//   known (cutoffs in 2026: XP2F_CONTROL=1): node experiments/operator-theory/per-rev-flag-validate.mjs --set known --year 2025|2026 --shard k/n
//   node experiments/operator-theory/per-rev-flag-validate.mjs --set inject-s1|inject-geo|quiet --shard k/n
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, root, HOUR, DAY, iso, ms, XM } from './lib/xp2.mjs';
import { driverRows } from './lib/xm3.mjs';
import { openFfmHost, apriori } from './lib/host.mjs';
import { FFM_220, ORBITS_010 } from './lib/build.mjs';
import { HELD_NORADS } from './lib/pairs.mjs';
import { STATIC } from './lib/regimes.mjs';
import { GM, openElements, revolutions, revDifferences, periodOf, revFlagB, RULE_B } from './lib/steps.mjs';
import { EXCLUDE, SPAN } from './per-rev-flag.mjs';

export const STORE = '/opt/data/sdn-archive/operator-theory/per-rev-flag-validate';
export const SIZES_M = [2, 3, 4, 8];
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), CM = '/opt/data/sdn-archive/operator-theory/covariance-model/steps';
const every = (from, to, days) => { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += days * DAY) out.push(t); return out; };
const day = (t) => new Date(t).toISOString().slice(0, 10);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** The covariance-model catalog's 4 m truth steps of an object (ms), from every set file that holds it. */
export const catalogSteps = (prefix, norad) => fs.readdirSync(CM).filter((f) => f.startsWith(prefix) && f.endsWith(`-${norad}.json`)).flatMap((f) => JSON.parse(fs.readFileSync(path.join(CM, f), 'utf8')).steps.map((s) => Date.parse(s.t)));

/** The 26 known burns: s1-24h-day7's truth steps, deduplicated within 3 h per satellite (covariance-model.mjs's recall set). */
export function knownBurns() {
  const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'results/operator-theory/s1-24h-day7/table.json'), 'utf8')), known = [];
  for (const w of doc.perWindow) {
    const [, norad, date] = w.key.split('|'), c = Date.parse(`${date}T00:00:00Z`);
    for (const x of w.truth.steps4m) { const t = c + x.hours * HOUR; if (!known.some((k) => k.norad === Number(norad) && Math.abs(k.t - t) < 3 * HOUR)) known.push({ norad: Number(norad), t }); }
  }
  return known;
}

/** The registered windows of a set: { key, group, norad, name?, cutoff (ms), burn? }. */
export function windowsOf(set) {
  if (set === 'known') return knownBurns().map((b) => { const c = Date.parse(`${day(b.t)}T00:00:00Z`) - 2 * DAY; return { key: `S1|${b.norad}|${day(c)}|${new Date(b.t).toISOString().slice(0, 16)}`, group: 'S1', norad: b.norad, cutoff: c, burn: b.t }; });
  if (set === 'inject-s1') {
    const used = new Set(JSON.parse(fs.readFileSync(path.join(REPO, 'results/operator-theory/s1-24h-day7/table.json'), 'utf8')).perWindow.map((w) => w.key));
    return [39634, 62261].flatMap((norad) => every('2025-10-05', '2025-12-21', 1).map((c) => ({ key: `S1|${norad}|${day(c)}`, group: 'S1', norad, cutoff: c })))
      .filter((w) => !used.has(w.key)).sort((a, b) => (hash(`PERREV-INJ|${a.key}`) < hash(`PERREV-INJ|${b.key}`) ? -1 : 1)).slice(0, 40);
  }
  if (set === 'inject-geo') return every('2026-02-02', '2026-08-31', 14).map((c) => ({ cutoff: c, group: 'GE' }));
  if (set === 'quiet') return [
    ...['ajisai', 'lares'].flatMap((name) => every('2025-10-12', '2025-12-17', 5).map((c) => ({ group: 'LS', static: name, cutoff: c }))),
    ...['lageos2', 'etalon1', 'etalon2', 'lares2'].flatMap((name) => every('2025-10-14', '2025-12-16', 7).map((c) => ({ group: 'GD', static: name, cutoff: c }))),
    ...STATIC.filter((x) => x.group === 'DO').flatMap((x) => every('2025-10-12', '2025-12-17', 5).map((c) => ({ group: 'DO', static: x.name, cutoff: c }))),
  ];
  throw new Error(`set ${set}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number), SET = args.set, YEAR = args.year;
  if (SET === 'known' && !['2025', '2026'].includes(YEAR)) throw new Error('--year 2025|2026 with --set known');
  if ((SET === 'known' && YEAR === '2026') !== (process.env.XP2F_CONTROL === '1')) throw new Error('XP2F_CONTROL=1 only with --set known --year 2026');
  if (!(SET === 'known' && YEAR === '2026')) XM.config.spaceWeather.rsgaDirs = [...XM.config.spaceWeather.rsgaDirs, '/opt/data/sdn-archive/hac/noaa-swpc/warehouse/2026/RSGA', '/opt/data/sdn-archive/hac/noaa-swpc/2026'];
  const runner = crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const MIN_COV = XM.config.fit.minimumCoverage;
  const inShard = (key) => parseInt(hash(key).slice(0, 8), 16) % SHARDS === SHARD;
  const dir = path.join(args.store ?? STORE, SET === 'known' ? `known-${YEAR}` : SET);
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, `rows-${SHARD}.jsonl`);
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);

  // The windows with their truth reader: XM's per day (Sentinel-1), or an object's whole series (GFZ geostationary, laser, altimetry).
  let list = [];
  const series = new Map();
  if (SET === 'known' || SET === 'inject-s1') {
    list = windowsOf(SET).filter((w) => (SET !== 'known' || String(new Date(w.cutoff).getUTCFullYear()) === YEAR));
    for (const w of list) w.object = XM.config.groups.S1.objects.find((x) => x.norad === w.norad);
  } else if (SET === 'inject-geo') {
    for (const o of SRC.mgex({ klass: 'geo', year: 2026, firstDay: 29, days: 223 })) { series.set(o.name, o.lines); for (const w of windowsOf(SET)) list.push({ ...w, key: `GE|${o.name}|${day(w.cutoff)}`, norad: o.norad, name: o.name }); }
  } else {
    const wins = windowsOf(SET);
    for (const o of STATIC.filter((x) => wins.some((w) => w.static === x.name && w.group === x.group))) {
      const files = o.files(); if (!files.length) continue;
      const s = SRC.chain(files), name = s.name || o.name;
      series.set(name, s.lines);
      const dols = o.group === 'DO' ? catalogSteps('dols', s.norad) : null;
      for (const w of wins.filter((x) => x.static === o.name && x.group === o.group)) {
        if (dols && dols.some((t) => t >= w.cutoff - SPAN.backHours * HOUR && t <= w.cutoff + SPAN.leadHours * HOUR)) continue;
        list.push({ ...w, key: `${w.group}|${name}|${day(w.cutoff)}`, norad: s.norad, name });
      }
    }
  }
  list = list.filter((w) => inShard(w.key) && !done.has(w.key));
  for (const w of list) if (HELD_NORADS.has(Number(w.norad)) || EXCLUDE.norads.has(Number(w.norad)) || EXCLUDE.names.test(w.name ?? w.object?.name ?? '')) throw new Error(`${w.key}: held`);

  const F = await openFfmHost({ ffm: FFM_220 }), el = await openElements({ build: ORBITS_010 });
  const ffmLow = () => ({ forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]) });
  const ffmHigh = () => ({ forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]) });
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const revs = async (lines) => (await revolutions(lines, el)).map((x) => [x.t, r3(x.aM)]);
  const fly = async (product, lines, settings, spw) => {
    const P0 = ms(product.epoch), back = lines.filter((l) => ms(l.epoch) < P0), ahead = lines.filter((l) => ms(l.epoch) >= P0), out = [];
    for (let i = back.length; i > 0; i -= 9000) { const part = back.slice(Math.max(0, i - 9000), i).reverse(); const st = await F.forecast(product, part.map((l) => l.epoch), settings, spw); out.unshift(...st.map((s, j) => ({ epoch: part[j].epoch, r: s.r, v: s.v })).reverse()); }
    for (let i = 0; i < ahead.length; i += 9000) { const part = ahead.slice(i, i + 9000); const st = await F.forecast(product, part.map((l) => l.epoch), settings, spw); out.push(...st.map((s, j) => ({ epoch: part[j].epoch, r: s.r, v: s.v }))); }
    return out;
  };
  for (const w of list) {
    const D0 = w.cutoff, from = D0 - SPAN.backHours * HOUR, to = D0 + SPAN.leadHours * HOUR;
    const row = { key: w.key, set: SET, group: w.group, norad: w.norad, name: w.name ?? w.object.name, cutoff: iso(D0), ...(w.burn ? { burn: iso(w.burn) } : {}), createdUtc: new Date().toISOString(), runner, ffm: F.provenance.ffm };
    try {
      let span, arcRaw;
      if (w.object) {
        if (w.object && D0 + SPAN.leadHours * HOUR > Date.parse(EXCLUDE.s1TruthTo)) throw new Error('past the Sentinel-1 hold');
        const read = (a, b) => { const out = []; for (let t = a; t < b; t += DAY) out.push(...T.series(w.object, t, Math.min(t + DAY, b) - 1).lines); return out; };
        span = read(from, to + 1); arcRaw = T.series(w.object, D0 - SPAN.fitHours * HOUR, D0).lines;
      } else {
        const lines = series.get(w.name);
        span = lines.filter((l) => { const t = ms(l.epoch); return t >= from && t <= to; });
        arcRaw = lines.filter((l) => { const t = ms(l.epoch); return t >= D0 - SPAN.fitHours * HOUR && t <= D0; });
      }
      if (span.length < 10) throw new Error('no truth over the span');
      const coverage = arcRaw.length > 1 ? arcRaw.length / ((SPAN.fitHours * 3600) / ((ms(arcRaw[1].epoch) - ms(arcRaw[0].epoch)) / 1000)) : 0;
      if (coverage < MIN_COV) throw new Error('coverage');
      const thin = T.thinned(arcRaw).chosen;
      const gaps = span.slice(1).map((l, i) => ms(l.epoch) - ms(span[i].epoch)).sort((a, b) => a - b), start = ms(span[0].epoch);
      const use = (gaps[gaps.length >> 1] < SPAN.fineS * 1000 ? span.filter((l) => (ms(l.epoch) - start) % (SPAN.fineS * 1000) === 0) : span).map((l) => ({ epoch: l.epoch, r: l.r, v: l.v }));
      const high = Math.hypot(...thin[0].r) >= 8400, settings = high ? ffmHigh() : ffmLow();
      let spw;
      if (!high) { const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0); if (R.excluded) throw new Error(R.excluded); spw = driverRows(R.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap })); }
      const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0);
      if (!f.state) throw new Error(f.error ?? f.termination);
      const product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
      const flight = await revs(await fly(product, use, settings, spw)), truth = await revs(use);
      Object.assign(row, { ok: true, fitOk: !!f.ok, settings: high ? 'high' : 'low', stepS: (ms(use[1].epoch) - ms(use[0].epoch)) / 1000, truth, flight });
      if (SET.startsWith('inject')) {
        // t_b: the middle of the longest stretch of (C + 12 h, C + 156 h) with no rule (b) step on the uninjected truth (and, on Sentinel-1, no catalog step).
        const diff = revDifferences(flight, truth), b = revFlagB(diff, periodOf(truth), D0);
        const marks = [...b.steps.map((s) => s.t), ...(SET === 'inject-s1' ? [...catalogSteps('s1q4', w.norad), ...catalogSteps('trS1', w.norad)] : [])].filter((t) => t > D0 + 12 * HOUR && t < D0 + 156 * HOUR).sort((p, q) => p - q);
        const edges = [D0 + 12 * HOUR, ...marks, D0 + 156 * HOUR];
        let best = [0, 0];
        for (let i = 1; i < edges.length; i += 1) if (edges[i] - edges[i - 1] > best[1] - best[0]) best = [edges[i - 1], edges[i]];
        if (best[1] - best[0] < 24 * HOUR) throw new Error(`longest burn-free stretch ${((best[1] - best[0]) / HOUR).toFixed(1)} h`);
        const tb = Math.round((best[0] + best[1]) / 2 / 1000) * 1000, at = (await F.forecast(product, [iso(tb)], settings, spw))[0];
        const A = { epoch: iso(tb), state: [...at.r, ...at.v].map((x) => x * 1000), parameters: f.parameters };
        const k0 = use.findIndex((l) => ms(l.epoch) >= tb), after = use.slice(k0), base = await fly(A, after, settings, spw), aKm = (await el.of({ epoch: iso(tb), r: at.r, v: at.v })).aM / 1000, v = Math.hypot(...at.v);
        row.injections = [];
        for (const sizeM of SIZES_M) {
          const dv = (GM * (sizeM / 1000)) / (2 * aKm * aKm * v), vb = at.v.map((x) => x + (dv * x) / v);
          const realizedM = (await el.of({ epoch: iso(tb), r: at.r, v: vb })).aM - (await el.of({ epoch: iso(tb), r: at.r, v: at.v })).aM;
          const raised = await fly({ ...A, state: [...at.r, ...vb].map((x) => x * 1000) }, after, settings, spw);
          const injected = use.map((l, n) => { const i = n - k0; return i < 0 ? l : { epoch: l.epoch, r: l.r.map((x, c) => x + raised[i].r[c] - base[i].r[c]), v: l.v.map((x, c) => x + raised[i].v[c] - base[i].v[c]) }; });
          row.injections.push({ sizeM, tb: iso(tb), dvMmS: r3(dv * 1e6), realizedM: r3(realizedM), truth: await revs(injected) });
        }
      }
    } catch (error) { row.ok = row.ok ?? false; row.error = String(error?.message ?? error).slice(0, 180); if (!row.injections && SET.startsWith('inject')) row.ok = false; }
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  }
  console.error(`per-rev-flag-validate ${SET}${YEAR ? ` ${YEAR}` : ''} shard ${SHARD}/${SHARDS}: ${list.length} windows`);
  await F.close(); await el.close();
  process.exit(0);
}
export { RULE_B };
