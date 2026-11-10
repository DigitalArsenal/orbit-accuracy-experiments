// stack #316, the headline loop: re-fly every published precise-orbit window on an AP build, with the numerical reference beside it, the same truth,
// windows, fit arcs, coverage rule, scoring grid and as-issued weather the published harness used (compare-cells.mjs's stores; all-regimes.mjs,
// ap-truth.mjs, truth-compare.mjs, ap-all-regimes-suite/run.mjs). Rows go to a store outside the repository; a row already written is not run again.
//   node experiments/headline-loop/refly.mjs [--ap-wasm <file>] [--shard k/n] [--groups T,P,...] [--traj-step 60] [--apc-method <id>] [--limit n]
//        [--keys-file <file of window keys>] [--half-tolerance-every 12] [--hindcast-every 3] [--floor-every 8] [--period 2026-03..05]
//   --period 2026-03..05: the second pass, the windows touching March to May 2026 the first pass leaves out, rows flagged `period`, to
//   rows-truth-spring-<k>of<n>.jsonl in the same store; a window reaching past 2026-11-10 flies in neither pass
//   node experiments/headline-loop/refly.mjs --ap-only --ap-wasm <file> --base-rows <store>/<base sha12> [--shard k/n] [--groups GD,IG] [--only-ap]
//        another AP build on the base run's windows: AP arms only, every numerical arm from the base rows and the FFM cache (runApOnly);
//        --only-ap leaves out APwide, APobs and APfloor; AP's fitted B, S, iterations and convergence are recorded
//   node experiments/headline-loop/refly.mjs --check        made-up inputs: window rules, cache key, statistics helpers (no module, no truth)
// Arms per window and fit arc (lib/ffm.mjs SETTINGS names the numerical ones):
//   AP      the theory alone, the published $PCF, on the build given
//   FFMr    the reduced setting the published cells flew (F20 above 8,400 km at the first scored state, L40 below): must equal the stored rows
//   FFMc    the configured arm the round-0 referee flew (CONFIGURED: L40S low orbit, E5 navigation and geosynchronous, Ffull geodetic and
//           eccentric): the closing tests of REF-1 to REF-3 read it
//   FFMq    the qualified reference goal.md scores against (QUALIFIED: the registered full settings with the radiation model fitted, L70S below
//           8,400 km, E5F navigation and geosynchronous, Ffull geodetic and eccentric; where it is FFMc, FFMc's row with sameAs). FFMc and FFMq are
//           cached with their trajectories over the fit arc plus 7 days at --traj-step
//   D       per lead day, the RMS of |r_AP - r_FFM| for FFMq, FFMc and FFMr on the scored epochs (C1-1)
//   extras  GD: Fbest (ocean tides, Earth radiation). Every --half-tolerance-every-th window: FFMq at half its integrator tolerance (goal.md,
//           qualification 2). S1 24 h: L40S_B2 and AP with the wide drag prior (BUD-4). Every --hindcast-every-th T, P, S1 window: AP and FFMq on
//           observed weather (REF-5). Every --floor-every-th window: AP fitted to a conservative-force model orbit flown from FFMq's state
//           (SETTINGS.Fcons), its fit RMS and its error against that orbit (BUD-3)
//   APC     the record with a carried forecast: absent until the AP build declares --apc-method
// SGP4 and both XP builds are not re-flown: score.mjs reads them from the stored published rows.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MODULES_ROOT, envRecord, usePackages, packageState } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
export const ALL_GROUPS = ['T', 'P', 'S1', 'GN', 'GN_GAL', 'LS', 'DO', 'GD', 'IG', 'GE', 'HE', 'HX', 'WA'];
// the order a shard flies its windows: the small groups first, so a run stopped early leaves whole groups
const ORDER = ['GD', 'IG', 'GE', 'HX', 'HE', 'LS', 'GN', 'GN_GAL', 'WA', 'DO', 'S1', 'P', 'T'];
const DEFAULT_WASM = path.join(MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm');

if (args.check) await check();
else if (args['ap-only']) await runApOnly();
else await run();

async function run() {
  usePackages(); // REF-8: refuse unless the lockfile's packages are what the modules below read
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const { CONFIGURED, QUALIFIED, reducedFor } = await import('./lib/settings.mjs');
  const [K, N] = (args.shard ?? '0/1').split('/').map(Number);
  const groups = (args.groups ?? ALL_GROUPS.join(',')).split(',');
  const build = A.apBuildOf(args['ap-wasm'] ?? DEFAULT_WASM, args['ap-version']);
  const sha12 = build.sha256.slice(0, 12), trajStepS = Number(args['traj-step'] ?? 60), hindEvery = Number(args['hindcast-every'] ?? 3), halfEvery = Number(args['half-tolerance-every'] ?? 12), floorEvery = Number(args['floor-every'] ?? 8);
  const outDir = path.join(A.STORE_ROOT, sha12);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'build.json'), JSON.stringify({ ...build, file: path.relative(MODULES_ROOT, build.file) }, null, 1));
  const done = new Set(fs.readdirSync(outDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(outDir, f), 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.key}|${r.arcH}`; })));
  // --period 2026-03..05: the second pass, the windows of those months the first pass left out (rows flagged period); nothing after 2026-11-10
  if (args.period && args.period !== W.SPRING_PERIOD) throw new Error(`--period ${args.period}: only ${W.SPRING_PERIOD}`);
  const second = args.period === W.SPRING_PERIOD;
  const outFile = path.join(outDir, `rows-truth-${second ? 'spring-' : ''}${K}of${N}.jsonl`);
  const all = W.windowsOf(groups), windows = second ? all.spring : all.windows, skipped = second ? all.skipped.filter((w) => !all.spring.some((s) => s.key === w.key)) : all.skipped;
  const only = args['keys-file'] ? new Set(fs.readFileSync(args['keys-file'], 'utf8').split('\n').filter(Boolean)) : null;
  const mine = windows.filter((w) => (!only || only.has(w.key)) && W.inShard(w.key, K, N) && w.arcs.some((a) => !done.has(`${w.key}|${a}`)))
    .sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || String(a.name).localeCompare(String(b.name)) || a.cutoffMs - b.cutoffMs).slice(0, Number(args.limit ?? Infinity));
  console.error(`refly shard ${K}/${N}: AP ${build.version} (${sha12}); ${mine.length} windows to fly (${windows.length} in the ${second ? `${W.SPRING_PERIOD} pass` : 'first pass'}, ${skipped.length} ${second ? 'after 2026-11-10' : 'in 2026-03..05 or after 2026-11-10'}, not read)`);
  if (!mine.length) process.exit(0);
  const arms = await A.openArms({ apWasm: build.file, apcMethod: args['apc-method'] ?? null });
  const env = { ...envRecord(), ffm: arms.ffmProvenance };
  const caches = {};
  const cacheFor = (arm, step) => (caches[`${arm}|${step}`] ??= (() => { const c = A.ffmCacheKey(arm, step), dir = path.join(A.STORE_ROOT, 'ffm-cache', c.key); fs.mkdirSync(dir, { recursive: true }); if (!fs.existsSync(path.join(dir, 'key.json'))) fs.writeFileSync(path.join(dir, 'key.json'), JSON.stringify(c.doc, null, 1)); return { ...c, dir }; })());
  const err = (e) => ({ ok: false, error: String(e?.message ?? e).slice(0, 200) });
  const ffmRow = (f) => ({ ok: true, arm: f.arm, days: f.days, termination: f.termination, fitOk: f.fitOk, weightedRms: f.weightedRms, parameters: f.product.parameters, cached: f.cached, s: f.s });
  let n = 0;
  for (const w of mine) {
    const t0 = Date.now(), D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs);
    const head = { key: w.key, part: 'truth', group: w.group, regime: G.label, name: w.name, provider: W.providerOf(w.group, w.name), satellite: W.satelliteOf(w.group, w.name), cutoff: W.iso(D0), ...(w.period ? { period: w.period } : {}), ap: { module: build.module, version: build.version, sha256: build.sha256 } };
    let ctx;
    try {
      const truth = await W.truthOf(w, D0 - maxArc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      if (!sc.entered.length) throw new Error('no lead bin');
      const wx = G.vacuum ? null : W.weatherAt(D0);
      ctx = { truth, sc, wx, high: Math.hypot(...sc.truth[0].r) >= 8400, object: { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 } };
    } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
    for (const arc of w.arcs) {
      if (done.has(`${w.key}|${arc}`)) continue;
      const row = { ...head, arcH: arc, env, arms: {} };
      if (ctx.error) row.error = ctx.error;
      else {
        const raw = ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; });
        const thin = W.arcOf(raw, arc);
        if (!thin) row.error = 'coverage';
        else {
          row.high = ctx.high;
          const { sc, wx } = ctx;
          const base = { thin, D0, sc };
          const name = `${w.key.replace(/[^A-Za-z0-9_.-]+/g, '_')}-${arc}`;
          let ap = null, fr = null, fc = null, fq = null;
          try { ap = await arms.ap({ ...base, object: ctx.object, pcf: G.vacuum ? A.PCF.AP_VACUUM : A.PCF.AP, spw: wx?.spw }); row.arms.AP = { ok: true, rms: ap.rms, days: ap.days, s: ap.s }; } catch (e) { row.arms.AP = err(e); }
          const reduced = reducedFor(ctx.high), configured = CONFIGURED[w.group], qualified = QUALIFIED[w.group];
          try { fr = await arms.ffm({ ...base, arm: reduced, rows: wx?.ffm }); row.arms.FFMr = ffmRow(fr); } catch (e) { row.arms.FFMr = { ...err(e), arm: reduced }; }
          // the trajectory (for the carried-forecast record) is kept for the qualified reference only
          const stepC = qualified === configured ? trajStepS : null;
          try { const c = cacheFor(configured, stepC); fc = await arms.ffm({ ...base, arm: configured, rows: wx?.ffm, cacheDir: c.dir, cacheName: name, trajStepS: stepC }); row.arms.FFMc = { ...ffmRow(fc), cache: c.key }; } catch (e) { row.arms.FFMc = { ...err(e), arm: configured }; }
          if (qualified === configured) { fq = fc; row.arms.FFMq = { ...row.arms.FFMc, sameAs: 'FFMc' }; }
          else try { const c = cacheFor(qualified, trajStepS); fq = await arms.ffm({ ...base, arm: qualified, rows: wx?.ffm, cacheDir: c.dir, cacheName: name, trajStepS }); row.arms.FFMq = { ...ffmRow(fq), cache: c.key }; } catch (e) { row.arms.FFMq = { ...err(e), arm: qualified }; }
          if (ap && fq) row.arms.AP.dVsFFMq = arms.dayRms(ap.states, fq.states, sc);
          if (ap && fc) row.arms.AP.dVsFFMc = arms.dayRms(ap.states, fc.states, sc);
          if (ap && fr) row.arms.AP.dVsFFMr = arms.dayRms(ap.states, fr.states, sc);
          // extras
          const extra = async (label, fn) => { try { row.arms[label] = await fn(); } catch (e) { row.arms[label] = err(e); } };
          if (w.group === 'GD') await extra('FFMbest', async () => ffmRow(await arms.ffm({ ...base, arm: 'Fbest', rows: null })));
          // the reference's step check (goal.md, qualification 2): the qualified arm again at half its integrator tolerance
          if (W.sampled(`tol|${w.key}`, halfEvery)) await extra('FFMqHalfTol', async () => ffmRow(await arms.ffm({ ...base, arm: qualified, rows: wx?.ffm, halfTolerance: true })));
          // BUD-3: AP's floor against a conservative-force model orbit made from the qualified fit's state (fit RMS and the RMS of
          // |r_AP - r_model| per lead day, km)
          if (fq?.product && W.sampled(`floor|${w.key}`, floorEvery)) await extra('APfloor', async () => {
            const model = await arms.modelOrbit(fq.product, [...thin.map((l) => l.epoch), ...sc.epochs]);
            const lines = thin.map((l, i) => ({ epoch: l.epoch, r: model[i].r, v: model[i].v }));
            const x = await arms.apFitFly({ object: ctx.object, lines, D0, pcf: A.PCF.AP_FLOOR, epochs: sc.epochs });
            return { ok: true, model: 'Fcons from the FFMq fit state', rms: x.rms, vsModel: arms.dayRms(x.states, model.slice(thin.length), sc) };
          });
          if (w.group === 'S1' && arc === 24) {
            await extra('FFMtightB', async () => ffmRow(await arms.ffm({ ...base, arm: 'L40S_B2', rows: wx?.ffm })));
            await extra('APwide', async () => { const x = await arms.ap({ ...base, object: ctx.object, pcf: A.PCF.AP_WIDE, spw: wx?.spw }); return { ok: true, rms: x.rms, days: x.days }; });
          }
          if (['T', 'P', 'S1'].includes(w.group) && W.sampled(w.key, hindEvery)) {
            try {
              const wm = W.weatherObserved(D0);
              const x = await arms.ap({ ...base, object: ctx.object, pcf: A.PCF.AP, spw: wm.spw });
              row.arms.APobs = { ok: true, rms: x.rms, days: x.days };
              const f = await arms.ffm({ ...base, arm: qualified, rows: wm.ffm });
              row.arms.FFMqObs = ffmRow(f);
              row.arms.APobs.dVsFFMqObs = arms.dayRms(x.states, f.states, sc);
            } catch (e) { row.arms.APobs ??= err(e); }
          }
          if (arms.apcAvailable && fq?.trajectory) await extra('APC', async () => { const x = await arms.apc({ object: ctx.object, traj: arms.trajectoryOf(cacheFor(qualified, trajStepS).dir, fq), pcf: G.vacuum ? A.PCF.AP_VACUUM : A.PCF.AP, spw: wx?.spw, sc }); return { ok: true, days: x.days, dVsFFMq: arms.dayRms(x.states, fq.states, sc) }; });
        }
      }
      row.wallS = (Date.now() - t0) / 1000;
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
    }
    n += 1;
    if (n % 5 === 0 || n === mine.length) console.error(`  ${n}/${mine.length} ${w.key} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await arms.close();
  console.error(`refly shard ${K}/${N}: done, ${n} windows`);
  process.exit(0);
}

/** --ap-only --base-rows <store>/<base sha12>: a new AP build on the base run's windows. The AP arms fly again (AP, and where the base row
 *  holds them APwide, APobs, APfloor); every numerical arm is the base row's, and D reads FFMq's and FFMc's scored states from the FFM cache
 *  (never fitted again: a missing cache entry is an error in that row). D against FFMr and against the hindcast FFM is not formed (their
 *  states are not cached). Rows go to <store>/<this build's sha12>/, the base and its period flags carried. */
async function runApOnly() {
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const { CONFIGURED, QUALIFIED } = await import('./lib/settings.mjs');
  const baseDir = args['base-rows'];
  if (!baseDir || !fs.existsSync(path.join(baseDir, 'build.json'))) throw new Error('--ap-only needs --base-rows <store>/<base sha12>');
  const [K, N] = (args.shard ?? '0/1').split('/').map(Number);
  const build = A.apBuildOf(args['ap-wasm'] ?? DEFAULT_WASM, args['ap-version']);
  const baseBuild = JSON.parse(fs.readFileSync(path.join(baseDir, 'build.json'), 'utf8'));
  // --frame GCRF: AP flown in the module's own GCRF output. The default (TEME, turned to GCRF by foundation/frames) is the published
  // harness's path; it differs from the module's own GCRF by 1 to 12 m (the two TEME definitions), so it is kept only to reproduce.
  // --apc: the record that carries the cached FFMq forecast (SPEC 18) instead of AP's own fit, always flown in GCRF; rows to <sha12>-apc/
  const apc = !!args.apc, frame = apc ? 'GCRF' : (args.frame ?? 'TEME'), theory = args.theory ?? 'AP', costEvery = Number(args['apc-cost-every'] ?? 10), HORIZON = Date.parse('2026-11-10T00:00:00Z');
  if (!['TEME', 'GCRF'].includes(frame)) throw new Error(`--frame ${frame}: TEME or GCRF`);
  if (build.sha256 === baseBuild.sha256 && frame === 'TEME' && !apc && theory === 'AP') throw new Error('--ap-only: the build is the base build, flown the same way');
  const sha12 = build.sha256.slice(0, 12), trajStepS = Number(args['traj-step'] ?? 60);
  const outDir = path.join(A.STORE_ROOT, apc ? `${sha12}-apc` : theory === 'XP' ? `${sha12}-xp-${frame.toLowerCase()}` : frame === 'GCRF' ? `${sha12}-gcrf` : sha12);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'build.json'), JSON.stringify({ ...build, file: path.relative(MODULES_ROOT, build.file), frame, theory, provenance: frame === 'GCRF' ? 'flown in the own GCRF output of sdn-ap, the corrected path (DigitalArsenal/spacedatanetwork-stack#386; cause #389: foundation/frames TEME is the GMST06 TEME, 57 mas from the AIAA 2006-6753 TEME of sdn-ap in 2025-26)' : 'flown in sdn-ap TEME and turned to GCRF by foundation/frames, the published path (1 to 12 m frame error at high altitude, DigitalArsenal/spacedatanetwork-stack#386)', ...(apc ? { arm: 'APC' } : {}), base: { version: baseBuild.version, sha256: baseBuild.sha256 } }, null, 1));
  // the base store may still be written by its own shards: a line not yet whole is passed over (the next run takes it)
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const readRows = (d) => fs.readdirSync(d).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean));
  const groups = args.groups ? new Set(args.groups.split(',')) : null, onlyAp = !!args['only-ap'];
  const done = new Set(readRows(outDir).map((r) => `${r.key}|${r.arcH}`));
  const byWindow = new Map();
  for (const r of readRows(baseDir)) if (!groups || groups.has(r.group)) (byWindow.get(r.key) ?? byWindow.set(r.key, []).get(r.key)).push(r);
  const outFile = path.join(outDir, `rows-truth-ap-${K}of${N}.jsonl`);
  const listed = W.windowsOf(ALL_GROUPS), winOf = new Map([...listed.windows, ...listed.spring].map((x) => [x.key, x]));
  const keys = [...byWindow.keys()].filter((k) => winOf.has(k) && W.inShard(k, K, N) && byWindow.get(k).some((r) => !done.has(`${k}|${r.arcH}`))).sort();
  console.error(`refly --ap-only shard ${K}/${N}: AP ${build.version} (${sha12}) on the windows of ${baseBuild.version} (${baseBuild.sha256.slice(0, 12)}); ${keys.length} windows to fly`);
  const arms = await A.openArms({ apWasm: build.file });
  const env = { ...envRecord(), ffm: arms.ffmProvenance };
  const cacheDir = (arm, step) => path.join(A.STORE_ROOT, 'ffm-cache', A.ffmCacheKey(arm, step).key);
  const err = (e) => ({ ok: false, error: String(e?.message ?? e).slice(0, 200) });
  let n = 0;
  for (const key of keys) {
    const t0 = Date.now(), bases = byWindow.get(key), w = winOf.get(key), G = W.GROUPS[w.group], D0 = w.cutoffMs;
    let ctx;
    try {
      const truth = await W.truthOf(w, D0 - Math.max(...w.arcs) * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      ctx = { truth, sc, wx: G.vacuum ? null : W.weatherAt(D0), object: { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 } };
      // APC past its span: the truth of the 7 days after it, never past 2026-11-10; bins 1, 3 and 7 days past the span's end
      if (apc) {
        const to = Math.min(D0 + 14 * W.DAY + W.HOUR, HORIZON);
        try { const later = to > D0 + 7 * W.DAY ? await W.truthOf(w, D0 + 7 * W.DAY, to, arms.axes) : { lines: [] }; ctx.past = W.scoredOf(later.lines.filter((l) => W.ms(l.epoch) > D0 + 7 * W.DAY && W.ms(l.epoch) <= to), D0 + 7 * W.DAY); } catch (e) { ctx.pastError = String(e?.message ?? e).slice(0, 200); }
      }
    } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
    for (const b of bases) {
      if (done.has(`${key}|${b.arcH}`)) continue;
      const arc = b.arcH;
      const row = { ...b, ap: { module: build.module, version: build.version, sha256: build.sha256 }, apOnly: { base: baseBuild.sha256.slice(0, 12) }, env, arms: Object.fromEntries(Object.entries(b.arms ?? {}).filter(([k]) => /^FFM/.test(k))) };
      delete row.wallS;
      if (b.error || ctx.error) row.error = b.error ?? ctx.error;
      else {
        const thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
        const { sc, wx } = ctx, base = { thin, D0, sc };
        const name = `${key.replace(/[^A-Za-z0-9_.-]+/g, '_')}-${arc}`;
        const configured = CONFIGURED[b.group], qualified = QUALIFIED[b.group];
        const cached = async (arm, step) => { try { return await arms.ffm({ ...base, arm, rows: null, cacheDir: cacheDir(arm, step), cacheName: name, trajStepS: step, cacheOnly: true }); } catch (e) { return { error: String(e.message) }; } };
        const fc = await cached(configured, qualified === configured ? trajStepS : null);
        const fq = qualified === configured ? fc : await cached(qualified, trajStepS);
        if (apc) {
          try {
            if (!fq.trajectory) throw new Error(fq.error ?? 'the cached FFMq has no trajectory');
            let traj = arms.trajectoryOf(cacheDir(qualified, trajStepS), fq), block = 'cached', reflyCpuS = null;
            // the span: the cutoff to the trajectory's last state at or before cutoff + 7 d (the trajectory sits on the truth's own lattice, so
            // every scored epoch is inside it)
            const stopMs = Math.min(D0 + 7 * W.DAY, W.ms(traj.at(-1).epoch));
            const make = () => arms.carriedRecord({ object: ctx.object, block: traj, D0, startIso: W.iso(D0), stopIso: W.iso(stopMs), forces: G.vacuum ? A.AP_FORCES.AP_VACUUM : A.AP_FORCES.AP, spw: wx?.spw });
            let rec;
            try { rec = await make(); } catch (e) {
              // the cached trajectory's chunks are separate integrations; when the join breaks the 5 mm rule, the product is flown again in one pass
              if (!/carry-tolerance/.test(String(e.message))) throw e;
              const c0 = process.cpuUsage();
              traj = await arms.flyContinuous({ arm: qualified, product: fq.product, epochs: traj.map((l) => l.epoch), rows: wx?.ffm });
              const c = process.cpuUsage(c0); reflyCpuS = (c.user + c.system) / 1e6; block = 'reflown in one pass';
              rec = await make();
            }
            const states = await arms.flyRecord(rec.ocm, sc.epochs, frame);
            // the compression error: against the block's own states at the scored epochs (the block is on the truth's lattice); D against the
            // FFMq scored states adds the two FFM integrations' difference (step sequences), meters in low orbit over a week
            const at = new Map(traj.map((l) => [W.ms(l.epoch), l]));
            const own = sc.epochs.map((e) => at.get(W.ms(e)));
            const dVsBlock = own.every(Boolean) ? arms.dayRms(states, own, sc) : null;
            row.arms.APC = { ok: true, frame, days: await arms.score(states, sc), dVsFFMq: arms.dayRms(states, fq.states, sc), dVsBlock, bytes: rec.bytes, segments: rec.segments, maxResidualKm: rec.maxResidualKm, spanDays: (stopMs - D0) / W.DAY, buildCpuS: rec.cpuS, buildWallS: rec.wallS, trajectoryStepS: fq.trajectory.stepS, block, reflyCpuS };
            if (ctx.past?.entered?.length) row.arms.APC.pastSpan = await arms.score(await arms.flyRecord(rec.ocm, ctx.past.epochs, frame), ctx.past);
            else row.arms.APC.pastSpan = ctx.pastError ? { error: ctx.pastError } : null;
            if (W.sampled(`cost|${key}`, costEvery)) row.arms.APC.cost = await arms.ffmCost({ arm: qualified, thin, D0, rows: wx?.ffm, epochs: traj.map((l) => l.epoch) });
          } catch (e) { row.arms.APC = err(e); }
          row.wallS = (Date.now() - t0) / 1000;
          fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
          continue;
        }
        let ap = null;
        try { ap = await arms.ap({ ...base, object: ctx.object, pcf: theory === 'XP' ? A.PCF.XP : G.vacuum ? A.PCF.AP_VACUUM : A.PCF.AP, spw: theory === 'XP' ? undefined : wx?.spw, frame }); row.arms.AP = { ok: true, frame, rms: ap.rms, fit: ap.fit, days: ap.days, s: ap.s }; } catch (e) { row.arms.AP = err(e); }
        if (ap && fq.states) row.arms.AP.dVsFFMq = arms.dayRms(ap.states, fq.states, sc); else if (ap) row.arms.AP.dError = fq.error;
        if (ap && fc.states) row.arms.AP.dVsFFMc = arms.dayRms(ap.states, fc.states, sc);
        const extra = async (label, fn) => { if (onlyAp) return; try { row.arms[label] = await fn(); } catch (e) { row.arms[label] = err(e); } };
        if (b.arms?.APwide) await extra('APwide', async () => { const x = await arms.ap({ ...base, object: ctx.object, pcf: A.PCF.AP_WIDE, spw: wx?.spw, frame }); return { ok: true, rms: x.rms, days: x.days }; });
        if (b.arms?.APobs) await extra('APobs', async () => { const x = await arms.ap({ ...base, object: ctx.object, pcf: A.PCF.AP, spw: W.weatherObserved(D0).spw, frame }); return { ok: true, rms: x.rms, days: x.days }; });
        if (b.arms?.APfloor && fq.product) await extra('APfloor', async () => {
          const model = await arms.modelOrbit(fq.product, [...thin.map((l) => l.epoch), ...sc.epochs]);
          const x = await arms.apFitFly({ object: ctx.object, lines: thin.map((l, i) => ({ epoch: l.epoch, r: model[i].r, v: model[i].v })), D0, pcf: A.PCF.AP_FLOOR, epochs: sc.epochs, frame });
          return { ok: true, model: 'Fcons from the FFMq fit state', rms: x.rms, vsModel: arms.dayRms(x.states, model.slice(thin.length), sc) };
        });
      }
      row.wallS = (Date.now() - t0) / 1000;
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
    }
    n += 1;
    if (n % 20 === 0 || n === keys.length) console.error(`  ${n}/${keys.length} ${key} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await arms.close();
  console.error(`refly --ap-only shard ${K}/${N}: done, ${n} windows`);
  process.exit(0);
}

/** --check, end to end: refly.mjs itself, as its own process, on a made-up stale checkout (refused), on the window lists (no flight), and on
 *  one real laser geodetic window into a temporary store (rows against the stored published rows; a second run flies nothing; the same
 *  window AP-only in sdn-ap's GCRF output). About two minutes. */
async function check() {
  const E = await import('./lib/e2e.mjs');
  const { check: ok, done } = E.checker('REFLY');
  const dir = E.tmp('refly'), store = path.join(dir, 'store'), env = { HEADLINE_LOOP_STORE: store };
  // REF-8: a checkout whose installed spacedatastandards.org is older than its lockfile's is refused, naming npm ci
  const stale = path.join(dir, 'stale');
  fs.mkdirSync(path.join(stale, 'node_modules/spacedatastandards.org'), { recursive: true });
  fs.writeFileSync(path.join(stale, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/spacedatastandards.org': { version: '1.276.0' } } }));
  fs.writeFileSync(path.join(stale, 'node_modules/spacedatastandards.org/package.json'), JSON.stringify({ version: '1.243.0' }));
  const r0 = E.run('refly.mjs', ['--limit', '0'], { ...env, HEADLINE_LOOP_CHECKOUT: stale });
  ok(r0.code !== 0 && /refused: run `npm ci`/.test(r0.err) && /spacedatastandards\.org 1\.276\.0/.test(r0.err), `stale checkout not refused: ${r0.code} ${r0.err.slice(-200)}`);
  // the two passes' window lists, read from the published stores (nothing flown)
  const r1 = E.run('refly.mjs', ['--limit', '0'], env), r2 = E.run('refly.mjs', ['--limit', '0', '--period', '2026-03..05'], env);
  ok(r1.code === 0 && /0 windows to fly \(2096 in the first pass, 1218 in 2026-03\.\.05 or after 2026-11-10, not read\)/.test(r1.err), `first-pass list: ${r1.err.slice(-300)}`);
  ok(r2.code === 0 && /0 windows to fly \(1218 in the 2026-03\.\.05 pass, 0 after 2026-11-10, not read\)/.test(r2.err), `second-pass list: ${r2.err.slice(-300)}`);
  // one real window
  const key = 'GD|ETALON 1|2025-10-25', keys = path.join(dir, 'keys.txt');
  fs.writeFileSync(keys, `${key}\n`);
  const r3 = E.run('refly.mjs', ['--keys-file', keys], env);
  ok(r3.code === 0, `the window did not fly: ${r3.err.slice(-300)}`);
  const sha12 = fs.readdirSync(store).find((d) => /^[0-9a-f]{12}$/.test(d));
  const row = sha12 ? E.jsonl(path.join(store, sha12)).find((x) => x.key === key) : null;
  ok(row && ['AP', 'FFMr', 'FFMc', 'FFMq', 'FFMbest'].every((a) => row.arms[a]?.ok) && row.arms.FFMr.arm === 'F20' && row.arms.FFMc.arm === 'Ffull' && row.arms.FFMq.sameAs === 'FFMc' && Number.isFinite(row.arms.AP.dVsFFMq?.['1']), `row arms ${row ? JSON.stringify(Object.fromEntries(Object.entries(row.arms).map(([k, v]) => [k, v.arm ?? v.ok]))) : 'none'}`);
  const stored = (d) => fs.readdirSync(d).filter((f) => /^rows(-\d+)?\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).find((x) => x.key === key);
  const ffm = stored('/opt/data/sdn-archive/operator-theory/ap/ffm220/regimes'), ap = stored('/opt/data/sdn-archive/operator-theory/ap/b051/regimes');
  const rel = (a, b) => Math.max(...Object.keys(b).filter((d) => a[d]).map((d) => Math.abs(a[d].e / b[d].e - 1)));
  ok(row && ffm && rel(row.arms.FFMr.days, ffm.arms.F72.days) < 1e-4, `the reduced arm against the stored FFM row: ${row && ffm ? rel(row.arms.FFMr.days, ffm.arms.F72.days) : 'missing'}`);
  ok(row && ap && rel(row.arms.AP.days, ap.arms.AP72.days) < 1e-3, `AP against the stored 0.5.1 row: ${row && ap ? rel(row.arms.AP.days, ap.arms.AP72.days) : 'missing'}`);
  const r4 = E.run('refly.mjs', ['--keys-file', keys], env);
  ok(r4.code === 0 && /; 0 windows to fly/.test(r4.err), `a second run flies again: ${r4.err.slice(-200)}`);
  // the same window AP-only in sdn-ap's GCRF output (stack #386): the numerical arms copied, AP flown again
  const r5 = E.run('refly.mjs', ['--ap-only', '--frame', 'GCRF', '--only-ap', '--base-rows', path.join(store, sha12 ?? 'none')], env);
  const g = sha12 && fs.existsSync(path.join(store, `${sha12}-gcrf`)) ? E.jsonl(path.join(store, `${sha12}-gcrf`)).find((x) => x.key === key) : null;
  ok(r5.code === 0 && g?.arms?.AP?.frame === 'GCRF' && g.arms.FFMq?.days?.['1']?.e === row?.arms?.FFMq?.days?.['1']?.e && Math.abs(g.arms.AP.days['1'].e / row.arms.AP.days['1'].e - 1) > 1e-3, `AP-only GCRF: ${r5.err.slice(-200)} ${g ? JSON.stringify(g.arms.AP.days['1']) : 'no row'}`);
  fs.rmSync(dir, { recursive: true, force: true });
  done('refly.mjs refuses a stale checkout naming npm ci; lists 2,096 first-pass and 1,218 second-pass windows; flies one laser geodetic window with every arm, its reduced arm on the stored FFM row within 1e-4 and AP on the stored 0.5.1 row within 1e-3; a second run flies nothing; AP-only in GCRF copies the numerical arms and flies AP again');
}
