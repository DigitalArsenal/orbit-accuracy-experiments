// AP6.md: AP, XP, SGP4 and FFM on the regimes AP5 did not reach, its truth, grid, coverage rule and as-issued weather. Module calls only.
//   node experiments/operator-theory/all-regimes.mjs --out <dir> --groups LS,DO,GD,IG,GE,HE --shard k/n
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, root, HOUR, DAY, iso, ms, rms, XM } from './lib/xp2.mjs';
import { openSgp4Fit } from './lib/xp2.mjs';
import { driverRows } from './lib/xm3.mjs';
import { apForces, openAp, fitPcf, fitWeather, horizonOf, readOcm } from './lib/ap.mjs';
import { openUssfXp } from './lib/ussf-xp.mjs';
import { openFfmHost, openAxes, apriori } from './lib/host.mjs';
import { HX, STATIC, DO9, MGEX_CUTOFFS, TESS, WA_CUTOFFS, windowKey } from './lib/regimes.mjs';
// AP9.md (DO9): its cutoffs fall in 2026, and the XP2 store's normalized RSGA set that xp2-fit-design/common.mjs pins ends 2025-12-31, so
// the as-issued 2026 reports are read from the archive's NOAA warehouse copy (fetched 2026-10-09) and the daily collector. Added 2026-11-04
// after the first DO9 run excluded every window for want of an RSGA; no fit had run. Same files, same parser; 2025 cutoffs are unchanged.
XM.config.spaceWeather.rsgaDirs = [...XM.config.spaceWeather.rsgaDirs, '/opt/data/sdn-archive/hac/noaa-swpc/warehouse/2026/RSGA', '/opt/data/sdn-archive/hac/noaa-swpc/2026'];

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const OUT = args.out, GROUPS = (args.groups ?? 'LS,DO,GD,IG,GE,HE').split(',');
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
// --arms U: the Space Force's SGP4-XP alone, in its own store. --arms AP,XP (any of AP, XP, S, F): only those, in their own store, as for a
// later AP build (AP7.md). Without it, this file's registered arms, unchanged.
const ARMS = (args.arms ?? 'AP,XP,S,F').split(','), ONLY_U = ARMS.includes('U'), has = (a) => !ONLY_U && ARMS.includes(a);
const m = await openModules(), A = has('AP') || has('XP') ? await openAp() : null, G = has('S') ? await openSgp4Fit() : null, F = has('F') ? await openFfmHost() : null, U = ONLY_U ? await openUssfXp() : null;
const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
const PCF_AP = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null });
const PCF_AP_VACUUM = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20, atmosphere: false }), fit: null });
const PCF_XP = fitPcf({ forces: {}, fit: null });
const ffmLow = () => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
});
const ffmHigh = () => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
});
const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, `rows-${SHARD}.jsonl`);
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);

/** Every object of the groups asked for: { group, name, norad, objectId, lines, arcs, cutoffs, vacuum }. */
/** A kernel's states on the fit's grid, whole seconds, in GCRF. */
async function spkOnGrid(lines, axes) {
  const norm = lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
  const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
  const thin = norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % GRID === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() }));
  return axes.convert(thin, 'EME2000', 'GCRF');
}

async function objects() {
  const out = [];
  for (const o of [...STATIC.filter((x) => GROUPS.includes(x.group)), ...(GROUPS.includes('DO9') ? DO9 : [])]) {
    const files = o.files();
    if (!files.length) { console.error(`${o.group} ${o.name}: no product`); continue; }
    const series = SRC.chain(files);
    out.push({ group: o.group, name: series.name || o.name, norad: series.norad, objectId: series.objectId ?? '', lines: series.lines, arcs: o.arcs, cutoffs: o.cutoffs });
  }
  // GEO-TRUTH.md part W: the three WAAS geostationary satellites, truth from the broadcast.
  if (GROUPS.includes('WA')) {
    const { SBAS, series } = await import('./lib/sbas.mjs');
    for (const [prn, sat] of Object.entries(SBAS)) {
      if (!WA_CUTOFFS.some((t) => inShard(windowKey('WA', sat.name, t)))) continue;
      out.push({ group: 'WA', name: sat.name, norad: sat.norad, objectId: '', lines: await series(Number(prn), WA_CUTOFFS[0] - 3 * DAY, WA_CUTOFFS.at(-1) + 7 * DAY + DAY), arcs: [24, 72], cutoffs: WA_CUTOFFS, vacuum: true });
    }
  }
  for (const [group, klass] of [['IG', 'igso'], ['GE', 'geo']]) {
    if (!GROUPS.includes(group)) continue;
    for (const o of SRC.mgex({ klass })) out.push({ group, name: o.name, norad: o.norad, objectId: o.objectId ?? '', lines: o.lines, arcs: [72], cutoffs: MGEX_CUTOFFS });
  }
  if (GROUPS.includes('HE') && TESS.cutoffs.some((t) => inShard(windowKey('HE', TESS.name, t)))) {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    const files = fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f));
    const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: TESS.name, norad: TESS.norad, fromUtc: TESS.from, toUtc: TESS.to, stride: 1 });
    const axes = await openAxes();
    out.push({ group: 'HE', name: TESS.name, norad: TESS.norad, objectId: TESS.objectId, lines: await spkOnGrid(s.lines, axes), arcs: TESS.arcs, cutoffs: TESS.cutoffs, vacuum: true });
    await axes.close();
  }
  // Report only, added 2026-11-02 so that highly elliptical orbits do not rest on one satellite: THEMIS and Chandra, from NAIF's public kernels, read as TESS is.
  if (GROUPS.includes('HX')) {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    const axes = await openAxes();
    for (const h of HX) {
      if (!h.cutoffs.some((t) => inShard(windowKey('HX', h.name, t)))) continue;
      const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files: [h.file], source: 'ap6-heo', id: h.id, name: h.name, norad: h.norad, fromUtc: h.from, toUtc: h.to, stride: 1 });
      out.push({ group: 'HX', name: h.name, norad: h.norad, objectId: h.objectId, lines: await spkOnGrid(s.lines, axes), arcs: h.arcs, cutoffs: h.cutoffs, vacuum: true });
    }
    await axes.close();
  }
  return out;
}

for (const o of await objects()) {
  const times = o.lines.map((l) => ms(l.epoch));
  const stepMs = times.length > 1 ? times[1] - times[0] : GRID;
  const gridMs = Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs);
  // XM's minimum, 260 of the 288 states of a day at 300 s, is 90 % of a day's states; a product on a coarser grid is held to the same share.
  const minBin = Math.ceil((MIN_BIN / (DAY / GRID)) * (DAY / gridMs));
  const between = (a, b) => { const out = []; for (let i = 0; i < times.length; i += 1) if (times[i] >= a && times[i] <= b) out.push(o.lines[i]); return out; };
  for (const D0 of o.cutoffs) {
    const key = windowKey(o.group, o.name, D0);
    if (!inShard(key) || done.has(key)) continue;
    const row = { key, group: o.group, norad: o.norad, name: o.name, cutoff: iso(D0), arms: {} };
    try {
      const after = between(D0 + 1, D0 + 7 * DAY);
      const first = after.length ? ms(after[0].epoch) : 0;
      const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
      const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
      const entered = LEADS.filter((k) => bins[k].length >= minBin);
      if (!entered.length) throw new Error('no lead bin');
      const scored = entered.flatMap((k) => bins[k]);
      const epochs = scored.map((l) => l.epoch), epochsMs = epochs.map(ms), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
      let ex, spw;
      if (!o.vacuum) {
        const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
        if (R.excluded) throw new Error(R.excluded);
        ex = { spw: fitWeather(R.rows, horizonOf(D0)) };
        spw = driverRows(R.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
      }
      const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
      const arc = (hours) => { const raw = between(D0 - hours * HOUR, D0); const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
      const high = Math.hypot(...scored[0].r) >= 8400;
      const pcfAp = o.vacuum ? PCF_AP_VACUUM : PCF_AP;
      for (const hours of o.arcs) {
        const thin = arc(hours);
        const run = async (name, fn) => {
          if (!ONLY_U && !has(name)) return;
          const a = { ok: false };
          try { if (!thin) throw new Error('coverage'); Object.assign(a, await fn()); a.ok = true; } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); }
          row.arms[`${name}${hours}`] = a;
        };
        const oem = thin ? S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId, norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }) : null;
        if (ONLY_U) {
          await run('U', async () => {
            const f = await U.fit(oem);
            if (!f.ok) throw new Error(f.error);
            return { rms: readOcm(f.ocm).fitRmsKm, days: score(await m.rtn(await m.toAxes(await U.propagate(f.ocm, epochs, epochs.length), epochs, 'GCRF'), truth)) };
          });
          continue;
        }
        await run('AP', async () => {
          const f = await A.fit(oem, pcfAp, ex);
          if (!f.ok) throw new Error(f.error);
          const st = await A.propagate(f.ocm, epochs, epochs.length);
          return { rms: readOcm(f.ocm).fitRmsKm, days: score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth)) };
        });
        await run('XP', async () => {
          const f = await A.fit(oem, PCF_XP, undefined);
          if (!f.ok) throw new Error(f.error);
          const st = await A.propagate(f.ocm, epochs, epochs.length);
          return { rms: readOcm(f.ocm).fitRmsKm, days: score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth)) };
        });
        await run('S', async () => {
          const { el } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name: o.name, objectId: o.objectId });
          const flown = await m.propagateSgp4(el, o.norad, epochsMs, gridMs / 1000);
          const present = flown.filter(Boolean).length;
          if (present !== flown.length) throw new Error(`SGP4 returned ${present} of ${flown.length} states`);
          return { days: score(await m.rtn(await m.toAxes(flown, epochs, 'GCRF'), truth)) };
        });
        await run('F', async () => {
          const settings = high ? ffmHigh() : ffmLow();
          const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0);
          if (!f.state) throw new Error(f.error ?? f.termination);
          const st = await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs, settings, spw);
          return { fitOk: !!f.ok, termination: f.termination, days: score(await m.rtn(st, truth)) };
        });
      }
    } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  }
}
console.error(`shard ${SHARD}/${SHARDS}: done`);
await F?.close();
process.exit(0);
