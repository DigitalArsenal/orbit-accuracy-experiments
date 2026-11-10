// stack #316, the headline loop: re-fly every published precise-orbit window on an AP build, with the numerical reference beside it, the same truth,
// windows, fit arcs, coverage rule, scoring grid and as-issued weather the published harness used (compare-cells.mjs's stores; all-regimes.mjs,
// ap-truth.mjs, truth-compare.mjs, ap-all-regimes-suite/run.mjs). Rows go to a store outside the repository; a row already written is not run again.
//   node experiments/headline-loop/refly.mjs [--ap-wasm <file>] [--shard k/n] [--groups T,P,...] [--traj-step 60] [--apc-method <id>] [--limit n]
//        [--keys-file <file of window keys>] [--half-tolerance-every 12] [--hindcast-every 3] [--floor-every 8] [--period 2026-03..05]
//   --period 2026-03..05: the second pass, the windows touching March to May 2026 the first pass leaves out, rows flagged `period`, to
//   rows-truth-spring-<k>of<n>.jsonl in the same store; a window reaching past 2026-11-10 flies in neither pass
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

/** --check: the rules on made-up inputs; no module is opened and no truth is read. */
async function check() {
  const faults = [];
  const W = await import('./lib/windows.mjs');
  const { SETTINGS, CONFIGURED, QUALIFIED, isFullSetting, reducedFor } = await import('./lib/settings.mjs');
  const d = (s) => Date.parse(`${s}T00:00:00Z`);
  // REF-8: a checkout whose installed spacedatastandards.org is older or newer than its lockfile's is refused, naming npm ci; one holding the
  // lockfile's version is accepted (made-up checkouts under the temp folder)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'headline-loop-check-'));
  const mk = (dir, version) => { fs.mkdirSync(path.join(dir, 'node_modules/spacedatastandards.org'), { recursive: true }); fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/spacedatastandards.org': { version: '1.276.0' } } })); fs.writeFileSync(path.join(dir, 'node_modules/spacedatastandards.org/package.json'), JSON.stringify({ version })); return packageState(dir); };
  const s0 = mk(path.join(tmp, 'stale'), '1.243.0'), s1 = mk(path.join(tmp, 'good'), '1.276.0'), s2 = mk(path.join(tmp, 'newer'), '1.279.0');
  if (!s0.refusal || !/npm ci/.test(s0.refusal) || !/1\.276\.0/.test(s0.refusal) || !s2.refusal) faults.push('a checkout with another version than its lockfile is not refused with npm ci named');
  if (s1.refusal) faults.push('a checkout with the lockfile version is refused');
  fs.rmSync(tmp, { recursive: true, force: true });
  const here = packageState();
  // reserved periods: a window whose arc or 7-day forecast touches 2026-03-01..05-31 or anything after 2026-11-10 is out
  const cases = [[d('2026-02-21'), false], [d('2026-02-23'), true], [d('2026-04-01'), true], [d('2026-06-02'), true], [d('2026-06-05'), false], [d('2026-05-31'), true], [d('2026-11-02'), false], [d('2026-11-04'), true], [d('2025-12-21'), false]];
  for (const [cut, want] of cases) if (W.reserved(cut - 72 * W.HOUR, cut + 7 * W.DAY) !== want) faults.push(`reserved(${new Date(cut).toISOString().slice(0, 10)}) is not ${want}`);
  // the second pass: a window touching 2026-03..05 flies there unless it also reaches past 2026-11-10; one past 2026-11-10 flies in neither
  const second = [[d('2026-04-01'), true], [d('2026-02-23'), true], [d('2026-06-02'), true], [d('2026-11-04'), false], [d('2026-11-12'), false]];
  for (const [cut, want] of second) if ((W.reserved(cut - 72 * W.HOUR, cut + 7 * W.DAY) && !W.afterHorizon(cut - 72 * W.HOUR, cut + 7 * W.DAY)) !== want) faults.push(`second pass(${new Date(cut).toISOString().slice(0, 10)}) is not ${want}`);
  // scoring bins: a made-up 300 s truth after the cutoff with day 4 missing: bins 1, 2, 3, 5, 7 enter at 288 epochs each
  const D0 = d('2025-11-01'), after = [];
  for (let t = D0 + 300000; t <= D0 + 7 * W.DAY; t += 300000) if (!(t > D0 + 3 * W.DAY && t <= D0 + 4 * W.DAY)) after.push({ epoch: new Date(t).toISOString(), r: [7000, 0, 0], v: [0, 7.5, 0] });
  const sc = W.scoredOf(after, D0);
  if (sc.entered.join() !== '1,2,3,5,7' || sc.sizes.some((x) => x !== 288)) faults.push(`scored bins ${sc.entered.join()} sizes ${sc.sizes.join()}`);
  const days = W.byDay(sc.epochs.map(() => [0.003, 0.004, 0]), sc.entered, sc.sizes);
  if (Object.values(days).some((x) => Math.abs(x.e - 0.005) > 1e-12)) faults.push('byDay does not give 5 m from a constant [3, 4, 0] m error');
  const arc = Array.from({ length: 289 }, (_, i) => ({ epoch: new Date(D0 - 86400000 + i * 300000).toISOString(), r: [7000, 0, 0], v: [0, 7.5, 0] }));
  if (!W.arcOf(arc, 24)) faults.push('a full 24 h arc fails the coverage rule');
  if (W.arcOf(arc.slice(0, 120), 24) !== null) faults.push('a 10 h arc of a 24 h window passes the coverage rule');
  // arms: the reduced setting is the published one by radius; every group has a configured arm with a fitted radiation term
  if (reducedFor(true) !== 'F20' || reducedFor(false) !== 'L40' || SETTINGS.L40.fixed.agom !== 0.02 || SETTINGS.F20.forces.solidTides !== false) faults.push('the reduced arm is not the published setting');
  for (const g of ALL_GROUPS) {
    const s = SETTINGS[CONFIGURED[g]];
    if (!s) { faults.push(`${g} has no configured arm`); continue; }
    if (s.fixed?.agom === 0.02 || !s.parameters.some((p) => p.kind === 'SRP_AREA_OVER_MASS' || p.kind.startsWith('ECOM2_'))) faults.push(`${g}: configured arm ${CONFIGURED[g]} does not fit a radiation term`);
  }
  if (!['GN', 'IG', 'GE'].every((g) => CONFIGURED[g] === 'E5') || CONFIGURED.GD !== 'Ffull' || CONFIGURED.LS !== 'L40S') faults.push('configured arms differ from the referee\'s closing-test arms (REF-1 L40S, REF-2 E5, REF-3 Ffull)');
  // goal.md qualification 1: every group's qualified arm is the registered full setting with a fitted radiation model, drag fitted in low orbit,
  // ECOM2 on the navigation and geosynchronous buses; the reduced and configured lower settings are not
  for (const g of ALL_GROUPS) {
    const q = SETTINGS[QUALIFIED[g]];
    if (!isFullSetting(QUALIFIED[g])) faults.push(`${g}: qualified arm ${QUALIFIED[g]} is not the full setting`);
    if (['T', 'P', 'S1', 'LS', 'DO'].includes(g) && !q.parameters.some((p) => p.kind === 'DRAG_AREA_OVER_MASS')) faults.push(`${g}: qualified arm fits no drag`);
    if (['GN', 'GN_GAL', 'IG', 'GE', 'WA'].includes(g) && !q.parameters.some((p) => p.kind.startsWith('ECOM2_'))) faults.push(`${g}: qualified arm has no ECOM2 terms`);
  }
  if (['F20', 'L40', 'L40S', 'E5'].some(isFullSetting)) faults.push('a reduced or configured lower setting passes as the full setting');
  const fc = SETTINGS.Fcons;
  if (fc.forces.drag || fc.forces.srp || fc.parameters.length || fc.forces.degree < 70 || !fc.forces.solidTides || !fc.forces.relativity) faults.push('the BUD-3 model orbit is not conservative 70x70 with tides and relativity');
  if (ALL_GROUPS.some((g) => !ORDER.includes(g)) || ORDER.length !== ALL_GROUPS.length) faults.push('the flight order does not cover every group once');
  // sampling is deterministic and about 1 in n
  const keys = Array.from({ length: 3000 }, (_, i) => `X|${i}`), share = keys.filter((k) => W.sampled(k, 5)).length / keys.length;
  if (share < 0.17 || share > 0.23 || keys.filter((k) => W.sampled(k, 5)).join() !== keys.filter((k) => W.sampled(k, 5)).join()) faults.push(`sampling share ${share}`);
  const published = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../../results/ap-truth/compare/cells.json'), 'utf8')).rows.filter((r) => r.reference === 'truth' && r.level === 'regime');
  const labels = new Set(Object.values(W.GROUPS).map((g) => g.label));
  for (const r of published) if (!labels.has(r.regime)) faults.push(`published regime ${r.regime} has no group`);
  console.log(faults.length ? `REFLY CHECK: FAIL\n${faults.join('\n')}` : `REFLY CHECK: PASS (package rule: older and newer than the lockfile refused naming npm ci, the lockfile version accepted; this checkout: ${here.refusal ? `refused (${here.wrong.join(', ')})` : 'packages as the lockfile'}; first-pass period rule on ${cases.length} cutoffs, second-pass rule on ${second.length}; scoring bins; day statistics; coverage rule; reduced arm = published setting; configured arm per group fits a radiation term (L40S, E5, Ffull); qualified arm per group is the full setting (L70S, E5F, Ffull); deterministic sampling; ${published.length} published cells mapped to groups)`);
  process.exit(faults.length ? 1 : 0);
}
