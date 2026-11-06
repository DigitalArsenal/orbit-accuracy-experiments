// PER-REV-FLAG.md: on every stored comparison window, FFM24 (propagator/ffm 2.2.0 by analysis/estimation 0.7.0, the 24 h arc before the cutoff at CHEAPER.md's
// settings) flown over [cutoff - 72 h, cutoff + 168 h] at the truth's epochs, and the revolution means of the flight and the truth (lib/steps.mjs revolutions,
// foundation/orbits 0.1.0). The flag itself is lib/steps.mjs revFlag, applied by per-rev-flag-table.mjs on these rows. Truth through the readers the
// windows' runners used (truth-compare.mjs, all-regimes.mjs); a held object is never read. Module calls only: this file reads, routes and rounds.
//   XM groups (S1, GN): XP2F_CONTROL=1 SDN_MODULES_ROOT=<modules> node experiments/operator-theory/per-rev-flag.mjs --group S1 --shard k/n
//   AP6 groups (LS, DO, GD, IG, GE, HE, HX, WA): SDN_MODULES_ROOT=<modules> node experiments/operator-theory/per-rev-flag.mjs --group GE --shard k/n
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, root, HOUR, DAY, iso, ms, XM } from './lib/xp2.mjs';
import { driverRows } from './lib/xm3.mjs';
import { openFfmHost, openAxes, apriori } from './lib/host.mjs';
import { FFM_220, ORBITS_010 } from './lib/build.mjs';
import { HELD_NORADS, HELD_ROW } from './lib/pairs.mjs';
import { STATIC, DO9, HX, TESS, WA_CUTOFFS } from './lib/regimes.mjs';
import { openElements, revolutions } from './lib/steps.mjs';

export const STORE = '/opt/data/sdn-archive/operator-theory/per-rev-flag';
// maneuver-flags.mjs's holds: C2's held objects, Swarm, GRACE-FO, every Starlink group, any Sentinel-1 cutoff from 2026-06-01, no Sentinel-1 truth after 2026-06-08.
export const EXCLUDE = { norads: new Set([...HELD_NORADS, 31698, 22824, 66315, 8820]), names: /stella|terrasar|sentinel-1d|lageos ?1\b|starlink|swarm|grace/i, s1CutoffBefore: '2026-06-01', s1TruthTo: '2026-06-08T00:00:00Z' };
export const heldWindow = (w) => EXCLUDE.norads.has(Number(w.norad)) || EXCLUDE.names.test(w.name ?? '') || (w.group === 'S1' && String(w.cutoff).slice(0, 10) >= EXCLUDE.s1CutoffBefore);
export const SPAN = { backHours: 72, leadHours: 168, fineS: 30, fitHours: 24 };
const A = '/opt/data/sdn-archive/operator-theory/ap';
// The windows: the comparison's stored keys (ffm220-ratio.mjs's stores; WAAS from the store cells.json reads), errors left out.
export const WINDOW_STORES = { S1: 'ffm220/compare-truth2', GN: 'ffm220/compare-truth2', LS: 'ffm220/regimes', DO: 'ffm220/regimes', GD: 'ffm220/regimes', IG: 'ffm220/regimes', GE: 'ffm220/regimes', HE: 'ffm220/regimes', HX: 'ffm220/regimes', WA: 'b0411/regimes-wa' };
const XM_GROUPS = ['S1', 'GN'];

export function windowsOf(group) {
  const dir = path.join(A, WINDOW_STORES[group]);
  return fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n'))
    .filter((l) => l && !HELD_ROW.test(l)).map((l) => JSON.parse(l)).filter((r) => (r.group ?? r.key.split('|')[0]) === group && !r.error && !heldWindow({ ...r, group }))
    .map((r) => ({ key: r.key, group, norad: r.norad, name: r.name, cutoff: r.cutoff }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number), GROUP = args.group;
  if (!WINDOW_STORES[GROUP]) throw new Error('--group S1|GN|LS|DO|GD|IG|GE|HE|HX|WA');
  if (XM_GROUPS.includes(GROUP) !== (process.env.XP2F_CONTROL === '1')) throw new Error('S1 and GN run with XP2F_CONTROL=1, the rest without it');
  if (!XM_GROUPS.includes(GROUP)) XM.config.spaceWeather.rsgaDirs = [...XM.config.spaceWeather.rsgaDirs, '/opt/data/sdn-archive/hac/noaa-swpc/warehouse/2026/RSGA', '/opt/data/sdn-archive/hac/noaa-swpc/2026'];
  const runner = crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const MIN_COV = XM.config.fit.minimumCoverage, CAP = Date.parse(EXCLUDE.s1TruthTo);
  const ffmLow = () => ({ forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]) });
  const ffmHigh = () => ({ forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]) });
  const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
  const dir = path.join(args.store ?? STORE, GROUP);
  fs.mkdirSync(dir, { recursive: true });
  const outFile = path.join(dir, `rows-${SHARD}.jsonl`);
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  const list = windowsOf(GROUP).filter((w) => inShard(w.key) && !done.has(w.key));
  for (const w of list) if (heldWindow(w)) throw new Error(`${w.key}: held`);

  // Each object's truth as all-regimes.mjs read it (AP6 groups), or by XM's reader per window (XM groups).
  const series = new Map();
  if (!XM_GROUPS.includes(GROUP) && list.length) {
    const names = new Set(list.map((w) => w.name));
    if (['LS', 'DO', 'GD'].includes(GROUP)) for (const o of [...STATIC, ...DO9].filter((x) => x.group === GROUP)) { const files = o.files(); if (!files.length) continue; const s = SRC.chain(files); const name = s.name || o.name; if (names.has(name)) series.set(name, [...(series.get(name) ?? []), ...s.lines]); }
    if (GROUP === 'IG' || GROUP === 'GE') for (const o of SRC.mgex({ klass: GROUP === 'IG' ? 'igso' : 'geo' })) if (names.has(o.name)) series.set(o.name, o.lines);
    if (GROUP === 'WA') { const { SBAS, series: sbas } = await import('./lib/sbas.mjs'); for (const [prn, sat] of Object.entries(SBAS)) if (names.has(sat.name)) series.set(sat.name, await sbas(Number(prn), WA_CUTOFFS[0] - 4 * DAY, WA_CUTOFFS.at(-1) + 8 * DAY)); }
    if (GROUP === 'HE' || GROUP === 'HX') {
      const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
      const axes = await openAxes(), GRID = XM.config.scoring.gridSeconds * 1000;
      const onGrid = async (lines) => { const norm = lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() })); const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
        return axes.convert(norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % GRID === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() })), 'EME2000', 'GCRF'); };
      const kernels = GROUP === 'HE' ? [{ ...TESS, id: 'TESS (-95)', files: fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f)) }] : HX.map((h) => ({ ...h, files: [h.file] }));
      for (const k of kernels) if (names.has(k.name)) series.set(k.name, await onGrid((await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files: k.files, source: 'ap6-heo', id: k.id, name: k.name, norad: k.norad, fromUtc: k.from, toUtc: k.to, stride: 1 })).lines));
      await axes.close();
    }
    for (const [name, lines] of series) { const seen = new Map(); for (const l of lines) seen.set(ms(l.epoch), l); series.set(name, [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l)); }
  }
  const F = await openFfmHost({ ffm: FFM_220 }), el = await openElements({ build: ORBITS_010 });
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const revs = async (lines) => (await revolutions(lines, el)).map((x) => [x.t, r3(x.aM)]);
  for (const w of list) {
    const D0 = Date.parse(w.cutoff), row = { key: w.key, group: GROUP, norad: w.norad, name: w.name, cutoff: iso(D0), createdUtc: new Date().toISOString(), runner, ffm: F.provenance.ffm };
    try {
      const from = D0 - SPAN.backHours * HOUR, to = D0 + SPAN.leadHours * HOUR;
      let span, arcRaw;
      if (XM_GROUPS.includes(GROUP)) {
        const o = XM.config.groups[GROUP].objects.find((x) => x.norad === Number(w.norad));
        const read = (a, b) => { if (GROUP === 'S1' && b > CAP) throw new Error(`truth to ${iso(b)} is past the hold`); const out = []; for (let t = a; t < b; t += DAY) out.push(...T.series(o, t, Math.min(t + DAY, b) - 1).lines); return out; };
        span = read(from, to + 1); arcRaw = T.series(o, D0 - SPAN.fitHours * HOUR, D0).lines;
      } else {
        const lines = series.get(w.name);
        if (!lines) throw new Error(`${w.name}: no truth`);
        span = lines.filter((l) => { const t = ms(l.epoch); return t >= from && t <= to; });
        arcRaw = lines.filter((l) => { const t = ms(l.epoch); return t >= D0 - SPAN.fitHours * HOUR && t <= D0; });
      }
      if (span.length < 10) throw new Error('no truth over the span');
      const coverage = arcRaw.length > 1 ? arcRaw.length / ((SPAN.fitHours * 3600) / ((ms(arcRaw[1].epoch) - ms(arcRaw[0].epoch)) / 1000)) : 0;
      if (coverage < MIN_COV) throw new Error('coverage');
      const thin = T.thinned(arcRaw).chosen;
      // The truth's epochs at 30 s where the product is finer, every epoch where it is not.
      const gaps = span.slice(1).map((l, i) => ms(l.epoch) - ms(span[i].epoch)).sort((a, b) => a - b), start = ms(span[0].epoch);
      const use = gaps[gaps.length >> 1] < SPAN.fineS * 1000 ? span.filter((l) => (ms(l.epoch) - start) % (SPAN.fineS * 1000) === 0) : span;
      const high = Math.hypot(...thin[0].r) >= 8400, vacuum = ['WA', 'HE', 'HX'].includes(GROUP);
      let spw;
      if (!vacuum && !high) { const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0); if (R.excluded) throw new Error(R.excluded); spw = driverRows(R.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap })); }
      const settings = high ? ffmHigh() : ffmLow();
      const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0);
      if (!f.state) throw new Error(f.error ?? f.termination);
      const product = { epoch: f.epoch, state: f.state, parameters: f.parameters }, P0 = ms(f.epoch);
      const back = use.filter((l) => ms(l.epoch) < P0), ahead = use.filter((l) => ms(l.epoch) >= P0), flown = [];
      // Backward from the fit epoch (descending samples), then forward, each in chunks.
      for (let i = back.length; i > 0; i -= 9000) { const part = back.slice(Math.max(0, i - 9000), i).reverse(); const st = await F.forecast(product, part.map((l) => l.epoch), settings, spw); flown.unshift(...st.map((s, j) => ({ epoch: part[j].epoch, r: s.r, v: s.v })).reverse()); }
      for (let i = 0; i < ahead.length; i += 9000) { const part = ahead.slice(i, i + 9000); const st = await F.forecast(product, part.map((l) => l.epoch), settings, spw); flown.push(...st.map((s, j) => ({ epoch: part[j].epoch, r: s.r, v: s.v }))); }
      Object.assign(row, { ok: true, fitOk: !!f.ok, termination: f.termination, fitEpoch: f.epoch, b: f.parameters?.[0]?.value ?? null, settings: high ? 'high' : 'low', stepS: (ms(use[1].epoch) - ms(use[0].epoch)) / 1000,
        truth: await revs(use.map((l) => ({ epoch: l.epoch, r: l.r, v: l.v }))), flight: await revs(flown) });
    } catch (error) { row.ok = false; row.error = String(error?.message ?? error).slice(0, 180); }
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  }
  console.error(`per-rev-flag ${GROUP} shard ${SHARD}/${SHARDS}: ${list.length} windows`);
  await F.close(); await el.close();
  process.exit(0);
}
