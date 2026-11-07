// S1-STEP-FREE.md: FFM (truth-compare.mjs's F24, CHEAPER.md's settings, flown on propagator/ffm 2.2.0: lib/build.mjs FFM_220) and AP (propagator/sdn-ap 0.5.1,
// ap-truth.mjs's AP24: module priors, 31x20) on Sentinel-1A and 1C, cutoff 00:00 UTC every day from 2025-10-05 to 2025-12-28: XM's truth, thinning, coverage,
// as-issued weather (xp2-fit-design's store) and scoring. Module calls only.
//   SDN_MODULES_ROOT=<modules> [SDN_MODULES_GIT=<clone holding FFM_220's commit>] node experiments/operator-theory/s1-step-free.mjs --out <store> --shard k/n
// Dry run, before any 2025 window is read: --window <AP5 window key from 2026> with XP2F_CONTROL=1 (AP5's environment); --ffm xm3 flies XM3's propagator/ffm 2.0.4,
// so the row can be set beside AP5's stored F24 and AP24.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, root, HOUR, DAY, iso, ms, rms, XM } from './lib/xp2.mjs';
import { driverRows } from './lib/xm3.mjs';
import { apForces, openAp, fitPcf, fitWeather, horizonOf, readOcm } from './lib/ap.mjs';
import { openFfmHost, apriori } from './lib/host.mjs';
import { BUILD_NOTE, FFM_220 } from './lib/build.mjs';
import { S1_STEP_FREE as WINDOWS } from './lib/regimes.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const OUT = args.out, DRY = args.window ?? null;
if (!OUT) throw new Error('--out');
if (DRY ? !/^S1\|(39634|62261)\|2026-0[1-5]-\d\d$/.test(DRY) || process.env.XP2F_CONTROL !== '1' : process.env.XP2F_CONTROL === '1') {
  throw new Error(DRY ? 'a dry run takes one of AP5\'s read 2026 windows, with XP2F_CONTROL=1' : 'the 2025 as-issued weather is xp2-fit-design\'s store: run without XP2F_CONTROL');
}
// --ffm-commit <sha>, dry runs only: FFM_220's bytes from a commit before main (its WIP), to try the build on a read window.
if (args['ffm-commit'] && !DRY) throw new Error('--ffm-commit is for a dry run');
const FFM = args.ffm === 'xm3' ? null : { ...FFM_220, ...(args['ffm-commit'] ? { modulesCommit: args['ffm-commit'] } : {}) };
if (FFM && !FFM.modulesCommit) throw new Error('propagator/ffm 2.2.0 is not on modules main yet (lib/build.mjs FFM_220)');
const runner = crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const m = await openModules(), A = await openAp(), F = await openFfmHost(FFM ? { ffm: FFM } : {});
const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
// CHEAPER.md's settings, as truth-compare.mjs flies them.
const ffmLow = () => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
});
const PCF_AP = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null });
const objects = WINDOWS.norads.map((n) => XM.config.groups.S1.objects.find((o) => o.norad === n));
const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, `rows-${SHARD}.jsonl`);
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
const cutoffs = DRY ? [Date.parse(`${DRY.split('|')[2]}T00:00:00Z`)] : WINDOWS.cutoffs;
const list = objects.flatMap((o) => cutoffs.map((t) => ({ o, cutoffMs: t, key: `S1|${o.norad}|${XM.dateOf(t)}` }))).filter((w) => (!DRY || w.key === DRY) && inShard(w.key) && !done.has(w.key));
for (const { o, cutoffMs: D0, key } of list) {
  const row = { key, group: 'S1', norad: o.norad, name: o.name, cutoff: iso(D0), createdUtc: new Date().toISOString(), runner, build: BUILD_NOTE, ffm: F.provenance.ffm, arms: {} };
  try {
    const after = T.series(o, D0 + 1, D0 + 7 * DAY).lines;
    const first = after.length ? ms(after[0].epoch) : 0;
    const grid = after.filter((l) => (ms(l.epoch) - first) % GRID === 0);
    const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
    const entered = LEADS.filter((k) => bins[k].length >= MIN_BIN);
    if (!entered.length) throw new Error('no lead bin');
    const scored = entered.flatMap((k) => bins[k]);
    const epochs = scored.map((l) => l.epoch), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
    const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
    if (O.excluded) throw new Error(O.excluded);
    const ex = { spw: fitWeather(O.rows, horizonOf(D0)) };
    const spw = driverRows(O.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
    const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
    const raw = T.series(o, D0 - WINDOWS.fitHours * HOUR, D0).lines;
    const coverage = raw.length > 1 ? raw.length / ((WINDOWS.fitHours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0;
    const thin = coverage >= MIN_COV ? T.thinned(raw).chosen : null;
    const run = async (name, fn) => {
      const a = { ok: false };
      try { if (!thin) throw new Error('coverage'); Object.assign(a, await fn()); a.ok = true; } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); }
      row.arms[name] = a;
    };
    await run('F24', async () => {
      const settings = ffmLow();
      const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0);
      if (!f.state) throw new Error(f.error ?? f.termination);
      const st = await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs, settings, spw);
      return { fitOk: !!f.ok, termination: f.termination, days: score(await m.rtn(st, truth)) };
    });
    await run('AP24', async () => {
      const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
      const f = await A.fit(oem, PCF_AP, ex);
      if (!f.ok) throw new Error(f.error);
      const info = readOcm(f.ocm);
      const st = await A.propagate(f.ocm, epochs, epochs.length);
      return { bterm: info.bterm, rms: info.fitRmsKm, days: score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth)) };
    });
  } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
  fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
}
console.error(`shard ${SHARD}/${SHARDS}: ${list.length} windows`);
await F.close();
process.exit(0);
