// PER-REV-FLAG.md, amendment of 2026-11-06 (c): rule (c)'s validation windows near 700 km, FFM24 flown as per-rev-flag.mjs flies it, and on the injection windows
// the truth carrying a registered along-track step: the truth state at t_b with its velocity raised by dv = mu da / (2 a^2 v), flown by FFM from t_b in one flight
// (the window's FFM24 settings, fitted parameters and weather), the truth before t_b unchanged. Truth through the readers per-rev-flag.mjs uses; a held object is
// never read. Module calls only: this file selects, reads, routes and rounds.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/per-rev-flag-c.mjs --set known|inject|quiet --shard k/n
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
import { GM, openElements, revolutions, revDifferences, periodOf, revFlagC } from './lib/steps.mjs';
import { EXCLUDE, SPAN } from './per-rev-flag.mjs';
import { windowsOf as validateWindows, catalogSteps } from './per-rev-flag-validate.mjs';

export const STORE = '/opt/data/sdn-archive/operator-theory/per-rev-flag-c';
export const SIZES_M = [2, 3, 4, 8], TOLERANCE_H = 13, MIN_STRETCH_H = 30;
// Near 700 km: Sentinel-1A and 1C (propulsive), the altimetry satellites between 650 and 850 km (propulsive), the passive spheres there (quiet only).
export const S1 = [39634, 62261];
export const ALTIMETRY = [{ name: 'CryoSat-2', norad: 36508 }, { name: 'SARAL', norad: 39086 }, { name: 'Sentinel-3A', norad: 41335 }, { name: 'Sentinel-3B', norad: 43437 }];
export const SPHERES = ['larets', 'westpac', 'starlette'];
const FIRST = '2025-10-05', LAST = '2025-12-21';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const every = (from, to, days) => { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += days * DAY) out.push(t); return out; };
const day = (t) => new Date(t).toISOString().slice(0, 10);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const byHash = (salt) => (a, b) => (hash(`${salt}|${a.key}`) < hash(`${salt}|${b.key}`) ? -1 : 1);

/** Cutoffs used by (a), (b) or the choosing: Sentinel-1 by satellite (S1-24H-DAY7's 2025 windows, (b)'s injection and known-burn windows); the AP6 regimes' and (b)'s quiet dates. */
export function usedCutoffs() {
  const s1 = new Set(JSON.parse(fs.readFileSync(path.join(REPO, 'results/operator-theory/s1-24h-day7/table.json'), 'utf8')).perWindow.map((w) => w.key));
  for (const w of validateWindows('inject-s1')) s1.add(w.key);
  for (const w of validateWindows('known')) s1.add(`S1|${w.norad}|${day(w.cutoff)}`);
  const dates = new Set([...every('2025-10-10', '2025-12-21', 5), ...every('2025-10-12', '2025-12-17', 5)].map(day));
  return { s1: (norad, c) => s1.has(`S1|${norad}|${day(c)}`), other: (c) => dates.has(day(c)) };
}

/** The registered windows of a set: { key, group, norad, static?, cutoff (ms), burn? }. */
export function windowsOf(set) {
  const U = usedCutoffs(), C = every(FIRST, LAST, 1), lo = Date.parse('2025-10-07T00:00:00Z'), hi = Date.parse('2025-12-24T00:00:00Z');
  const fresh = (w) => (w.group === 'S1' ? !U.s1(w.norad, w.cutoff) : !U.other(w.cutoff));
  // Known burns: the covariance-model catalog's 4 m truth steps (12-revolution-median epochs), less (b)'s 26; cutoff the burn's day less 2, else 3, else 1 days.
  const used26 = validateWindows('known').map((w) => ({ norad: w.norad, t: w.burn }));
  const burns = [...S1.flatMap((norad) => catalogSteps('s1q4', norad).map((t) => ({ group: 'S1', norad, t }))), ...ALTIMETRY.flatMap((a) => catalogSteps('dols', a.norad).map((t) => ({ group: 'DO', norad: a.norad, static: a.name, t })))]
    .filter((b) => b.t >= lo && b.t < hi && !used26.some((u) => u.norad === b.norad && Math.abs(u.t - b.t) < 3 * HOUR));
  const known = [];
  for (const b of burns) {
    const d0 = Date.parse(`${day(b.t)}T00:00:00Z`), c = [2, 3, 1].map((k) => d0 - k * DAY).find((x) => x >= C[0] && x <= C.at(-1) && fresh({ ...b, cutoff: x }));
    if (c !== undefined) known.push({ key: `${b.group}|${b.static ?? b.norad}|${day(c)}|${new Date(b.t).toISOString().slice(0, 16)}`, group: b.group, norad: b.norad, static: b.static, cutoff: c, burn: b.t });
  }
  if (set === 'known') return known;
  const taken = new Set(known.map((w) => `${w.group}|${w.static ?? w.norad}|${day(w.cutoff)}`));
  const pool = (group, list) => list.flatMap((o) => C.map((c) => ({ key: `${group}|${o.static ?? o.norad}|${day(c)}`, group, norad: o.norad, static: o.static, cutoff: c }))).filter((w) => fresh(w) && !taken.has(w.key));
  const injS1 = pool('S1', S1.map((norad) => ({ norad }))).sort(byHash('PERREV-C-INJ')).slice(0, 40);
  const injDo = pool('DO', ALTIMETRY.map((a) => ({ norad: a.norad, static: a.name }))).sort(byHash('PERREV-C-INJ')).slice(0, 20);
  if (set === 'inject') return [...injS1, ...injDo];
  for (const w of [...injS1, ...injDo]) taken.add(w.key);
  const quietDo = pool('DO', ALTIMETRY.map((a) => ({ norad: a.norad, static: a.name }))).filter((w) => !taken.has(w.key) && !catalogSteps('dols', w.norad).some((t) => t >= w.cutoff - SPAN.backHours * HOUR && t <= w.cutoff + SPAN.leadHours * HOUR)).sort(byHash('PERREV-C-QUIET')).slice(0, 40);
  const quietLs = pool('LS', SPHERES.map((s) => ({ norad: null, static: s }))).sort(byHash('PERREV-C-QUIET')).slice(0, 15);
  if (set === 'quiet') return [...quietDo, ...quietLs];
  throw new Error(`set ${set}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number), SET = args.set;
  if (process.env.XP2F_CONTROL === '1') throw new Error('rule (c) windows are in 2025: run without XP2F_CONTROL');
  const runner = hash(fs.readFileSync(new URL(import.meta.url)));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const MIN_COV = XM.config.fit.minimumCoverage;
  const inShard = (key) => parseInt(hash(key).slice(0, 8), 16) % SHARDS === SHARD;
  const dir = path.join(args.store ?? STORE, SET);
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, `rows-${SHARD}.jsonl`);
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  const list = windowsOf(SET).filter((w) => inShard(w.key) && !done.has(w.key));
  const series = new Map();
  for (const name of new Set(list.filter((w) => w.static).map((w) => w.static))) {
    const o = STATIC.find((x) => x.name === name);
    const s = SRC.chain(o.files());
    if (HELD_NORADS.has(Number(s.norad)) || EXCLUDE.norads.has(Number(s.norad)) || EXCLUDE.names.test(s.name ?? '')) throw new Error(`${name}: held`);
    series.set(name, s);
  }
  const F = await openFfmHost({ ffm: FFM_220 }), el = await openElements({ build: ORBITS_010 });
  const settings = { forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]) };
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const revs = async (lines) => (await revolutions(lines, el)).map((x) => [x.t, r3(x.aM)]);
  const fly = async (product, lines, spw) => {
    const P0 = ms(product.epoch), back = lines.filter((l) => ms(l.epoch) < P0), ahead = lines.filter((l) => ms(l.epoch) >= P0), out = [];
    for (let i = back.length; i > 0; i -= 9000) { const part = back.slice(Math.max(0, i - 9000), i).reverse(); const st = await F.forecast(product, part.map((l) => l.epoch), settings, spw); out.unshift(...st.map((s, j) => ({ epoch: part[j].epoch, r: s.r, v: s.v })).reverse()); }
    for (let i = 0; i < ahead.length; i += 9000) { const part = ahead.slice(i, i + 9000); const st = await F.forecast(product, part.map((l) => l.epoch), settings, spw); out.push(...st.map((s, j) => ({ epoch: part[j].epoch, r: s.r, v: s.v }))); }
    return out;
  };
  for (const w of list) {
    const D0 = w.cutoff, from = D0 - SPAN.backHours * HOUR, to = D0 + SPAN.leadHours * HOUR;
    const row = { key: w.key, set: SET, group: w.group, norad: w.norad ?? series.get(w.static)?.norad, cutoff: iso(D0), ...(w.burn ? { burn: iso(w.burn) } : {}), createdUtc: new Date().toISOString(), runner, ffm: F.provenance.ffm, ok: false };
    try {
      let span, arcRaw;
      if (w.group === 'S1') {
        const o = XM.config.groups.S1.objects.find((x) => x.norad === w.norad);
        row.name = o.name;
        const read = (a, b) => { const out = []; for (let t = a; t < b; t += DAY) out.push(...T.series(o, t, Math.min(t + DAY, b) - 1).lines); return out; };
        span = read(from, to + 1); arcRaw = T.series(o, D0 - SPAN.fitHours * HOUR, D0).lines;
      } else {
        const s = series.get(w.static);
        row.name = s.name;
        span = s.lines.filter((l) => { const t = ms(l.epoch); return t >= from && t <= to; });
        arcRaw = s.lines.filter((l) => { const t = ms(l.epoch); return t >= D0 - SPAN.fitHours * HOUR && t <= D0; });
      }
      if (span.length < 10) throw new Error('no truth over the span');
      const coverage = arcRaw.length > 1 ? arcRaw.length / ((SPAN.fitHours * 3600) / ((ms(arcRaw[1].epoch) - ms(arcRaw[0].epoch)) / 1000)) : 0;
      if (coverage < MIN_COV) throw new Error('coverage');
      const thin = T.thinned(arcRaw).chosen;
      const gaps = span.slice(1).map((l, i) => ms(l.epoch) - ms(span[i].epoch)).sort((a, b) => a - b), start = ms(span[0].epoch);
      const use = (gaps[gaps.length >> 1] < SPAN.fineS * 1000 ? span.filter((l) => (ms(l.epoch) - start) % (SPAN.fineS * 1000) === 0) : span).map((l) => ({ epoch: l.epoch, r: l.r, v: l.v }));
      const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
      if (R.excluded) throw new Error(R.excluded);
      const spw = driverRows(R.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
      const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0);
      if (!f.state) throw new Error(f.error ?? f.termination);
      const flight = await revs(await fly({ epoch: f.epoch, state: f.state, parameters: f.parameters }, use, spw)), truth = await revs(use);
      Object.assign(row, { ok: true, fitOk: !!f.ok, stepS: (ms(use[1].epoch) - ms(use[0].epoch)) / 1000, truth, flight });
      if (SET === 'inject') {
        // t_b: the middle of the longest stretch of (C + 12 h, C + 156 h) with no rule (c) step on the uninjected truth and no catalog step; at least 30 h.
        const c = revFlagC(revDifferences(flight, truth), periodOf(truth), D0);
        const catalog = w.group === 'S1' ? [...catalogSteps('s1q4', w.norad), ...catalogSteps('trS1', w.norad)] : catalogSteps('dols', w.norad);
        const marks = [...c.steps.map((s) => s.t), ...catalog].filter((t) => t > D0 + 12 * HOUR && t < D0 + 156 * HOUR).sort((p, q) => p - q), edges = [D0 + 12 * HOUR, ...marks, D0 + 156 * HOUR];
        let best = [0, 0];
        for (let i = 1; i < edges.length; i += 1) if (edges[i] - edges[i - 1] > best[1] - best[0]) best = [edges[i - 1], edges[i]];
        if (best[1] - best[0] < MIN_STRETCH_H * HOUR) { row.ok = false; throw new Error(`longest stretch ${((best[1] - best[0]) / HOUR).toFixed(1)} h`); }
        const k0 = use.findIndex((l) => ms(l.epoch) >= (best[0] + best[1]) / 2), at = use[k0], tb = ms(at.epoch), aKm = (await el.of(at)).aM / 1000, v = Math.hypot(...at.v);
        row.injections = [];
        for (const sizeM of SIZES_M) {
          const dv = (GM * (sizeM / 1000)) / (2 * aKm * aKm * v), vb = at.v.map((x) => x + (dv * x) / v);
          const realizedM = (await el.of({ epoch: at.epoch, r: at.r, v: vb })).aM - (await el.of(at)).aM;
          // One flight carries the step: the truth state at t_b with the raised velocity, flown over the truth epochs from t_b.
          const carried = await fly({ epoch: at.epoch, state: [...at.r, ...vb].map((x) => x * 1000), parameters: f.parameters }, use.slice(k0), spw);
          row.injections.push({ sizeM, tb: iso(tb), dvMmS: r3(dv * 1e6), realizedM: r3(realizedM), truth: await revs([...use.slice(0, k0), ...carried]) });
        }
      }
    } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); if (SET === 'inject' && !row.injections) row.ok = false; }
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  }
  console.error(`per-rev-flag-c ${SET} shard ${SHARD}/${SHARDS}: ${list.length} windows`);
  await F.close(); await el.close();
  process.exit(0);
}
