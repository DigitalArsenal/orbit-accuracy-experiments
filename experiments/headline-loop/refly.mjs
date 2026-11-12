// The numerical propagator's rows, flown once (they do not change with AP's version; table.mjs reads them). On every window of the
// precise-orbit regimes: FFM (propagator/ffm 2.2.0, fitted by analysis/estimation 0.7.0) fitted to the truth arc and flown on the scored epochs,
// with the truth, windows, fit arcs, coverage rule, scoring grid and as-issued weather of the published harness (all-regimes.mjs, ap-truth.mjs,
// truth-compare.mjs, ap-all-regimes-suite/run.mjs). Rows go to <store>/f0b8352a43f3/ (lib/arms.mjs NUMERICAL_STORE); a row already there is
// not flown again. --second-pass flies the windows touching 2026-03..05 (lib/windows.mjs), each row marked pass: "second".
//   node experiments/headline-loop/refly.mjs [--second-pass] [--retry-errors] [--shard k/n] [--groups T,P,...] [--keys-file <file of window keys>] [--limit n]
//   --retry-errors: a window whose rows all recorded an error (no truth, coverage) is flown again; table.mjs reads a row that flew in its place
//   node experiments/headline-loop/refly.mjs --check
//   node experiments/headline-loop/refly.mjs --after-burns <dir of the burn detector's lists, <group>/<name>.burns.json> [--groups S1,DO,WA] [--shard k/n]
//     [--after-burn-store <store folder>: where the rows go (lib/arms.mjs NUMERICAL_AFTER_BURN.store unless given), one folder per set of
//      lists; each row names its satellite's list (burnList), and table.mjs refuses a row whose list is not the one it was given]
//   node experiments/headline-loop/refly.mjs --tight [--groups T,P] [--arcs 24,72] [--shard k/n] [--retry-errors]
//   --tight (stack issue 520): the full drag setting fitted and flown again at tolerance 1e-13 (lib/arms.mjs NUMERICAL_TIGHT: L70S as
//     L70S13), on every window and fit arc of the groups' rows as table.mjs lists them (the first pass, and a regime's second pass once its
//     numerical rows are all in the store) whose stored numerical row exists and whose full setting is L70S: the window's truth as the
//     first pass reads it, the arc's fit, flown once on the scored epochs and on a 300 s grid from the fit's first state to 7 days after
//     the cutoff together (at 1e-13 the requested epochs move the flight by under 0.2 m). One row per window and fit arc, whatever the
//     outcome (the fit failed: arms.FFMq.ok false; no truth or coverage: error), goes to <store>/<NUMERICAL_TIGHT.store>/rows-tight-<k>of<n>.jsonl
//     with the fitted state (arms.FFMq.product); the trajectory to <store>/numerical-trajectories/<NUMERICAL_TIGHT.to>/<group>/<key>-<arc>.bin,
//     and its manifest line to numerical-trajectories/staged-<NUMERICAL_TIGHT.to>.jsonl. A row already there is not flown again (with
//     --retry-errors, one recording no truth or a failed fit is; table.mjs reads the best of a window's rows, a fit over a failed fit over no
//     truth, and --tight-switch appends that row's line); nothing stored is overwritten. Each line names its fit (fit: setting, process, arc
//     start, first state), so bar.mjs flies the trajectory of the fit whose figures it reads.
//     The fit is of the full arc, with no burn rule: table.mjs keeps a row with a refit after a burn, or in a regime with after-burn rows
//     a window without its decision row, at 1e-10.
//   node experiments/headline-loop/refly.mjs --tight-switch G:arc[,G:arc]: when every window of the row has its staged line, the lines
//     of its windows not in the manifest at 1e-13 (all of them, or the windows that joined the row since) appended in one write (recorded
//     in numerical-trajectories/switched-<NUMERICAL_TIGHT.to>.jsonl)
//   --after-burns (stack issues 462 and 489): the numerical arm's fit of a maneuvering object on the arc after its last burn known at the
//     cutoff (lib/arms.mjs numericalArc: the rule of AP's 72 h fit, and on 24 h fits where that burn lies inside the 24 h). One row per window
//     and fit arc of the groups goes to <store>/<NUMERICAL_AFTER_BURN.store>/: where the rule moves the arc, the full setting (FFMq) fitted
//     on it and flown on the same scored epochs; elsewhere the decision alone (the stored fit stands). Windows without a stored numerical
//     row are not read.
// Settings per window and fit arc (lib/settings.mjs):
//   FFMr     the reduced setting (F20 above 8,400 km at the first scored state, L40 below)
//   FFMc     CONFIGURED
//   FFMq     FULL_SETTING (where it is CONFIGURED, FFMc's row with sameAs)
//   FFMbest  laser geodetic only: the full setting plus ocean tides and Earth radiation pressure (Fbest)
import fs from 'node:fs';
import path from 'node:path';
import { envRecord, usePackages } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
export const ALL_GROUPS = ['T', 'P', 'S1', 'GN', 'GN_GAL', 'LS', 'DO', 'GD', 'IG', 'GE', 'HE72', 'HE', 'HX', 'WA'];
// the order a shard flies its windows: the small groups first, so a run stopped early leaves whole groups
const ORDER = ['GD', 'IG', 'GE', 'HX', 'HE72', 'HE', 'LS', 'GN', 'GN_GAL', 'WA', 'DO', 'S1', 'P', 'T'];

if (args.check) await check();
else if (args['after-burns']) await afterBurns();
else if (args.tight || args['tight-switch']) await tight();
else await run();

/** --tight and --tight-switch (stack issue 520): the full drag setting at 1e-13, rows and trajectories, beside the stored 1e-10 ones. */
async function tight() {
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const { SETTINGS, FULL_SETTING } = await import('./lib/settings.mjs');
  const T = A.NUMERICAL_TIGHT, STEP_S = 300, LEAD_D = 7;
  if (JSON.stringify(SETTINGS[T.to]) !== JSON.stringify({ ...SETTINGS[T.from], integrator: { ...SETTINGS[T.from].integrator, tolerance: 1e-13 } })) throw new Error(`${T.to} is not ${T.from} at 1e-13`);
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const read = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean)) : []);
  const TRAJ = path.join(A.STORE_ROOT, 'numerical-trajectories'), ROWS = path.join(A.STORE_ROOT, T.store);
  const STAGED = path.join(TRAJ, `staged-${T.to}.jsonl`), MANIFEST = path.join(TRAJ, 'manifest.jsonl'), SWITCHED = path.join(TRAJ, `switched-${T.to}.jsonl`);
  const SOURCE = `a refit of the row's setting at tolerance 1e-13 on the window's truth (setting ${T.to}: ${T.from} with the integrator's tolerance 1e-13)`;
  const groups = (args.groups ?? 'T,P').split(',').filter((g) => FULL_SETTING[g] === T.from);
  const arcsAsked = args.arcs ? args.arcs.split(',').map(Number) : null;
  const base = new Map();
  for (const r of read(path.join(A.STORE_ROOT, A.NUMERICAL_STORE), /^rows-truth-.*\.jsonl$/)) { const k = `${r.key}|${r.arcH}`; if (!base.has(k) || (base.get(k).error && !r.error)) base.set(k, r); }
  // the windows of each row as table.mjs lists them: the first pass, and a regime's second pass once its numerical rows are all in the store
  const all = W.windowsOf(groups);
  const secondIn = new Set(groups.filter((g) => { const sec = all.second.filter((w) => w.group === g); return sec.length && sec.every((w) => w.arcs.every((a) => base.has(`${w.key}|${a}`))); }));
  const listed = [...all.windows, ...all.second.filter((w) => secondIn.has(w.group))];
  const items = listed.flatMap((w) => w.arcs.filter((a) => (!arcsAsked || arcsAsked.includes(a)) && base.has(`${w.key}|${a}`)).map((a) => ({ w, arc: a })));
  const nameOf = (key, arc) => `${key.replace(/[| ]/g, '_')}-${arc}`;
  if (args['tight-switch']) {
    // a row is switched when every window of it has its staged line. A window's line is the one table.mjs reads the row of (a fit over a
    // failed fit over no truth; of equal rank the later, as a retry gives); it is appended wherever it differs from the window's last 1e-13
    // line in the manifest (none yet, a window that joined the row since, or a retry that replaced a failure), all in one write
    const rank = (x) => (x.source === 'none' ? 0 : x.source === 'failed' ? 1 : 2), staged = new Map();
    for (const x of read(TRAJ, new RegExp(`^staged-${T.to}\\.jsonl$`))) { const k = `${x.key}|${x.arcH}`; if (!staged.has(k) || rank(x) >= rank(staged.get(k))) staged.set(k, x); }
    const inManifest = new Map(read(TRAJ, /^manifest\.jsonl$/).filter((x) => x.setting === T.to).map((x) => [`${x.key}|${x.arcH}`, x]));
    const same = (p, q) => p && q && p.source === q.source && (p.file ?? null) === (q.file ?? null) && (p.from ?? null) === (q.from ?? null);
    for (const ga of [...new Set(args['tight-switch'].split(','))]) {
      const [g, a] = ga.split(':'), rowItems = items.filter((x) => x.w.group === g && x.arc === Number(a)), lines = rowItems.map((x) => staged.get(`${x.w.key}|${x.arc}`));
      if (!rowItems.length || lines.some((l) => !l)) { console.error(`${ga}: ${lines.filter(Boolean).length} of ${rowItems.length} windows staged, not switched (--groups names the rows' groups)`); continue; }
      const add = lines.filter((l) => !same(l, inManifest.get(`${l.key}|${l.arcH}`)));
      if (!add.length) { console.error(`${ga}: every window's line in the manifest is its staged line`); continue; }
      fs.appendFileSync(MANIFEST, add.map((l) => `${JSON.stringify(l)}\n`).join(''));
      fs.appendFileSync(SWITCHED, `${JSON.stringify({ group: g, arcH: Number(a), windows: lines.length, appended: add.length, setting: T.to, at: new Date().toISOString() })}\n`);
      console.error(`${ga}: switched, ${add.length} of ${lines.length} windows' lines appended`);
    }
    process.exit(0);
  }
  const [K, N] = (args.shard ?? '0/1').split('/').map(Number);
  // a window-arc with a row is not flown again; with --retry-errors, one whose rows all record no truth or a failed fit is
  const retry = !!args['retry-errors'], rowsSoFar = read(ROWS, /^rows-.*\.jsonl$/);
  const done = new Set(rowsSoFar.filter((r) => !retry || (!r.error && r.arms?.FFMq?.ok)).map((r) => `${r.key}|${r.arcH}`));
  const mine = items.filter((x) => W.inShard(x.w.key, K, N) && !done.has(`${x.w.key}|${x.arc}`))
    .sort((p, q) => groups.indexOf(p.w.group) - groups.indexOf(q.w.group) || String(p.w.name).localeCompare(String(q.w.name)) || p.w.cutoffMs - q.w.cutoffMs || p.arc - q.arc);
  console.error(`refly --tight shard ${K}/${N}: ${mine.length} window-arcs to fly (${items.length} in the rows of ${groups.join(', ')})`);
  if (!mine.length || args.limit === '0') process.exit(0);
  const { openFfm } = await import('./lib/ffm.mjs');
  const { openModules } = await import(path.join(W.root, W.XP2F.xm.dir, 'lib/modules.mjs'));
  const F = await openFfm(), m = await openModules(), env = { ...envRecord(), ffm: F.provenance }, settings = SETTINGS[T.to];
  fs.mkdirSync(ROWS, { recursive: true });
  const outFile = path.join(ROWS, `rows-tight-${K}of${N}.jsonl`), iso = (t) => new Date(t).toISOString();
  let n = 0, truthKey = null, ctx = null;
  for (const { w, arc } of mine) {
    const t0 = performance.now(), D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs);
    const row = { key: w.key, part: 'truth', group: w.group, regime: G.label, name: w.name, provider: W.providerOf(w.group, w.name), satellite: W.satelliteOf(w.group, w.name), cutoff: W.iso(D0), arcH: arc, env, tolerance: 1e-13, arms: {} };
    const line = { key: w.key, arcH: arc, group: w.group, arm: 'FFMq', setting: T.to, tolerance: 1e-13, stepS: STEP_S, frame: 'GCRF', layout: 'Float64 x, y, z km, vx, vy, vz km/s per state' };
    try {
      if (truthKey !== w.key) {
        truthKey = w.key;
        try {
          const truth = await W.truthOf(w, D0 - maxArc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, null);
          const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
          ctx = sc.entered.length ? { truth, sc, rows: G.vacuum ? null : W.weatherAt(D0).ffm } : { error: 'no lead bin' };
        } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
      }
      if (ctx.error) throw Object.assign(new Error(ctx.error), { window: true });
      const thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
      if (!thin) throw Object.assign(new Error('coverage'), { window: true });
      row.high = Math.hypot(...ctx.sc.truth[0].r) >= 8400;
      try {
        const f = await F.fit(thin, settings, D0, ctx.rows);
        const product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
        const from = W.ms(product.epoch), count = Math.floor((D0 + LEAD_D * W.DAY - from) / (STEP_S * 1000)) + 1;
        const grid = Array.from({ length: count }, (_, k) => from + k * STEP_S * 1000), scoredMs = ctx.sc.epochs.map(W.ms);
        const union = [...new Set([...grid, ...scoredMs])].sort((a, b) => a - b), at = new Map(union.map((t, k) => [t, k]));
        const states = await F.forecast(product, union.map(iso), settings, ctx.rows);
        const days = W.byDay(await m.rtn(scoredMs.map((t) => states[at.get(t)]), ctx.sc.truth), ctx.sc.entered, ctx.sc.sizes);
        const dir = path.join(TRAJ, T.to, w.group), file = path.join(dir, `${nameOf(w.key, arc)}.bin`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, Buffer.from(new Float64Array(grid.flatMap((t) => { const s = states[at.get(t)]; return [...s.r, ...s.v]; })).buffer));
        // the identity of the fit the trajectory flies (bar.mjs takes, for each window, the line whose fit is the numerical row's)
        Object.assign(line, { source: SOURCE, file: path.relative(TRAJ, file), from: iso(from), cutoff: iso(D0), count, parameters: product.parameters, flight: 'one flight on the scored epochs and the 300 s grid together',
          fit: { setting: T.to, process: 'full arc', arcStart: iso(D0 - arc * W.HOUR), firstState: iso(from), burnList: null } });
        row.arms.FFMq = { ok: true, arm: T.to, days, termination: f.termination, fitOk: f.ok, weightedRms: f.weightedRms, iterations: f.iterations, parameters: product.parameters, product: { epoch: product.epoch, state: product.state }, s: (performance.now() - t0) / 1000 };
      } catch (e) {
        row.arms.FFMq = { ok: false, arm: T.to, error: String(e?.message ?? e).slice(0, 200) };
        Object.assign(line, { source: 'failed', error: row.arms.FFMq.error });
      }
    } catch (e) {
      if (!e.window) throw e;
      row.error = e.message;
      Object.assign(line, { source: 'none', why: `no truth or coverage (${e.message})` });
    }
    row.wallS = (performance.now() - t0) / 1000;
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
    fs.appendFileSync(STAGED, `${JSON.stringify(line)}\n`);
    n += 1;
    if (n % 10 === 0 || n === mine.length) console.error(`  ${n}/${mine.length} ${w.key} ${arc} h ${row.wallS.toFixed(0)} s`);
  }
  await F.close(); await m.close();
  console.error(`refly --tight shard ${K}/${N}: done, ${n} window-arcs`);
  process.exit(0);
}

async function afterBurns() {
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const { FULL_SETTING } = await import('./lib/settings.mjs');
  const burnsDir = args['after-burns'], [K, N] = (args.shard ?? '0/1').split('/').map(Number);
  const groups = (args.groups ?? 'S1,DO,WA').split(',');
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const read = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean)) : []);
  // the stored fits (a flown row over an error row, as table.mjs reads them)
  const base = new Map();
  for (const r of read(path.join(A.STORE_ROOT, A.NUMERICAL_STORE), /^rows-truth-.*\.jsonl$/)) { const k = `${r.key}|${r.arcH}`; if (!base.has(k) || (base.get(k).error && !r.error)) base.set(k, r); }
  const store = args['after-burn-store'] ?? A.NUMERICAL_AFTER_BURN.store;
  if (!store.startsWith(`${A.NUMERICAL_STORE}-after-burn`) || store.includes('/')) throw new Error(`--after-burn-store ${store}: a folder name beginning ${A.NUMERICAL_STORE}-after-burn`);
  const outDir = path.join(A.STORE_ROOT, store);
  fs.mkdirSync(outDir, { recursive: true });
  const done = new Set(read(outDir, /^rows-after-burn-.*\.jsonl$/).filter((r) => !r.error).map((r) => `${r.key}|${r.arcH}`));
  const outFile = path.join(outDir, `rows-after-burn-${K}of${N}.jsonl`);
  const all = W.windowsOf(groups);
  const mine = [...all.windows, ...all.second].filter((w) => W.inShard(w.key, K, N) && w.arcs.some((a) => base.has(`${w.key}|${a}`) && !base.get(`${w.key}|${a}`).error && !done.has(`${w.key}|${a}`)))
    .sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || String(a.name).localeCompare(String(b.name)) || a.cutoffMs - b.cutoffMs)
    .slice(0, Number(args.limit ?? Infinity));
  console.error(`refly --after-burns shard ${K}/${N}: ${mine.length} windows to decide`);
  if (!mine.length) process.exit(0);
  const arms = await A.openArms();
  const env = { ...envRecord(), ffm: arms.ffmProvenance };
  const sha = (g, name) => A.listSha(burnsDir, g, name);
  let n = 0, refit = 0;
  for (const w of mine) {
    const D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs);
    const head = { key: w.key, part: 'after-burn', group: w.group, name: w.name, cutoff: W.iso(D0), burnList: sha(w.group, w.name) };
    const burns = A.arcBreaks(burnsDir, w.group, w.name, D0), thrust = A.notBallistic(burnsDir, w.group, w.name, D0), minH = A.minHoursOf(w.group);
    // the decision needs the cutoff's last state alone (its perigee); the window's truth, scored epochs and weather only where a fit moves
    let ctx;
    try {
      const last = (await W.truthOf(w, D0 - 2 * W.HOUR, D0, arms.axes)).lines.at(-1);
      if (!last) throw new Error('no state before the cutoff');
      ctx = { perigeeKm: A.perigeeKmOf(last) };
      if (!thrust && w.arcs.some((arc) => A.numericalArc(burns, D0, ctx.perigeeKm, arc, minH).maneuvering)) {
        const truth = await W.truthOf(w, D0 - maxArc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
        const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
        if (!sc.entered.length) throw new Error('no lead bin');
        Object.assign(ctx, { truth, sc, wx: G.vacuum ? null : W.weatherAt(D0) });
      }
    } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
    for (const arc of w.arcs) {
      const b = base.get(`${w.key}|${arc}`);
      if (!b || b.error || done.has(`${w.key}|${arc}`)) continue;
      const row = { ...head, arcH: arc };
      if (ctx.error) row.error = ctx.error;
      else if (thrust) {
        // an orbit that is not ballistic between impulses has no burn-free arc: the stored fit, marked as holding thrust
        row.burnInArc = true;
        row.fitProcess = `not ballistic: the truth flown from its positions alone closes to ${Math.round(thrust.positionsOnlyMedianM)} m over ${thrust.pieceHours} h (median); the stored fit`;
      } else {
        const m = A.numericalArc(burns, D0, ctx.perigeeKm, arc, minH);
        const hours = (D0 - m.startMs) / W.HOUR;
        // a known burn still inside the arc the rule gives (a burn in the last 24 h of a 72 h arc, or a 24 h arc after it too short)
        row.burnInArc = burns.some((x) => A.burnEndMs(x) > m.startMs && Date.parse(x.extentFrom ?? x.from) <= D0);
        if (m.lastBurnMs) row.lastBurn = W.iso(m.lastBurnMs);
        const thin = m.maneuvering ? W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= m.startMs && t <= D0; }), hours) : null;
        if (!m.maneuvering) row.fitProcess = m.shortAfterBurn ? `maneuvering, the arc after its last burn under ${A.NUMERICAL_AFTER_BURN.minHours24} h: the stored full-arc fit` : 'the full arc: the stored fit';
        else if (!thin) row.fitProcess = 'maneuvering, the arc after its last burn short of coverage: the stored full-arc fit';
        else {
          row.fitProcess = 'maneuvering: the arc after its last burn';
          row.fitArcHours = Math.round(hours * 10) / 10;
          row.fitArcStart = W.iso(m.startMs);
          row.env = env;
          const arm = FULL_SETTING[w.group];
          try {
            const f = await arms.ffm({ thin, D0, rows: ctx.wx?.ffm, sc: ctx.sc, arm });
            row.arms = { FFMq: { ok: true, arm: f.arm, days: f.days, termination: f.termination, fitOk: f.fitOk, weightedRms: f.weightedRms, parameters: f.product.parameters, s: f.s } };
          } catch (e) { row.arms = { FFMq: { ok: false, arm, error: String(e?.message ?? e).slice(0, 200) } }; }
          refit += 1;
        }
      }
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
    }
    n += 1;
    if (n % 10 === 0 || n === mine.length) console.error(`  ${n}/${mine.length} windows, ${refit} fits refitted`);
  }
  await arms.close();
  console.error(`refly --after-burns shard ${K}/${N}: done, ${n} windows, ${refit} fits refitted`);
  process.exit(0);
}

async function run() {
  usePackages(); // refuse unless the lockfile's packages are what the modules below read
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const { CONFIGURED, FULL_SETTING, reducedFor } = await import('./lib/settings.mjs');
  const [K, N] = (args.shard ?? '0/1').split('/').map(Number);
  const groups = (args.groups ?? ALL_GROUPS.join(',')).split(',');
  const outDir = path.join(A.STORE_ROOT, A.NUMERICAL_STORE);
  fs.mkdirSync(outDir, { recursive: true });
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const retry = !!args['retry-errors'];
  const done = new Set(fs.readdirSync(outDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(outDir, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean)).filter((r) => !retry || !r.error).map((r) => `${r.key}|${r.arcH}`));
  const second = !!args['second-pass'];
  const outFile = path.join(outDir, `rows-truth-ffm-${second ? 'second-' : ''}${K}of${N}.jsonl`);
  const all = W.windowsOf(groups);
  const only = args['keys-file'] ? new Set(fs.readFileSync(args['keys-file'], 'utf8').split('\n').filter(Boolean)) : null;
  const mine = (second ? all.second : all.windows).filter((w) => (!only || only.has(w.key)) && W.inShard(w.key, K, N) && w.arcs.some((a) => !done.has(`${w.key}|${a}`)))
    .sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || String(a.name).localeCompare(String(b.name)) || a.cutoffMs - b.cutoffMs).slice(0, Number(args.limit ?? Infinity));
  console.error(`refly shard ${K}/${N}: ${mine.length} windows to fly in the ${second ? 'second' : 'first'} pass (${all.windows.length} in the first pass, ${all.second.length} in the second, ${all.after.length} after 2026-11-10, never read)`);
  if (!mine.length) process.exit(0);
  const arms = await A.openArms();
  const env = { ...envRecord(), ffm: arms.ffmProvenance };
  const err = (e) => ({ ok: false, error: String(e?.message ?? e).slice(0, 200) });
  const ffmRow = (f) => ({ ok: true, arm: f.arm, days: f.days, termination: f.termination, fitOk: f.fitOk, weightedRms: f.weightedRms, parameters: f.product.parameters, s: f.s });
  let n = 0;
  for (const w of mine) {
    const t0 = Date.now(), D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs);
    const head = { key: w.key, part: 'truth', group: w.group, regime: G.label, name: w.name, provider: W.providerOf(w.group, w.name), satellite: W.satelliteOf(w.group, w.name), cutoff: W.iso(D0), ...(second ? { pass: 'second' } : {}) };
    let ctx;
    try {
      const truth = await W.truthOf(w, D0 - maxArc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      if (!sc.entered.length) throw new Error('no lead bin');
      ctx = { truth, sc, wx: G.vacuum ? null : W.weatherAt(D0), high: Math.hypot(...sc.truth[0].r) >= 8400 };
    } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
    for (const arc of w.arcs) {
      if (done.has(`${w.key}|${arc}`)) continue;
      const row = { ...head, arcH: arc, env, arms: {} };
      if (ctx.error) row.error = ctx.error;
      else {
        const thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
        if (!thin) row.error = 'coverage';
        else {
          row.high = ctx.high;
          const base = { thin, D0, sc: ctx.sc, rows: ctx.wx?.ffm };
          const fly = async (label, arm) => { try { row.arms[label] = ffmRow(await arms.ffm({ ...base, arm })); } catch (e) { row.arms[label] = { ...err(e), arm }; } };
          await fly('FFMr', reducedFor(ctx.high));
          await fly('FFMc', CONFIGURED[w.group]);
          if (FULL_SETTING[w.group] === CONFIGURED[w.group]) row.arms.FFMq = { ...row.arms.FFMc, sameAs: 'FFMc' };
          else await fly('FFMq', FULL_SETTING[w.group]);
          if (w.group === 'GD') await fly('FFMbest', 'Fbest');
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

/** --check, end to end: refly.mjs itself, as its own process, on a made-up stale checkout (refused), on the window list (no flight), and on one
 *  real laser geodetic window into a temporary store (its reduced arm against the stored published FFM row; a second run flies nothing). */
async function check() {
  const E = await import('./lib/e2e.mjs');
  const { check: ok, done } = E.checker('REFLY');
  const dir = E.tmp('refly'), store = path.join(dir, 'store'), env = { HEADLINE_LOOP_STORE: store };
  // a checkout whose installed spacedatastandards.org is older than its lockfile's is refused, naming npm ci
  const stale = path.join(dir, 'stale');
  fs.mkdirSync(path.join(stale, 'node_modules/spacedatastandards.org'), { recursive: true });
  fs.writeFileSync(path.join(stale, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/spacedatastandards.org': { version: '1.276.0' } } }));
  fs.writeFileSync(path.join(stale, 'node_modules/spacedatastandards.org/package.json'), JSON.stringify({ version: '1.243.0' }));
  const r0 = E.run('refly.mjs', ['--limit', '0'], { ...env, HEADLINE_LOOP_CHECKOUT: stale });
  ok(r0.code !== 0 && /refused: run `npm ci`/.test(r0.err) && /spacedatastandards\.org 1\.276\.0/.test(r0.err), `stale checkout not refused: ${r0.code} ${r0.err.slice(-200)}`);
  // the first-pass window list, read from the published stores (nothing flown)
  const r1 = E.run('refly.mjs', ['--limit', '0'], env);
  ok(r1.code === 0 && /0 windows to fly in the first pass \(2103 in the first pass, 1218 in the second, 0 after 2026-11-10, never read\)/.test(r1.err), `first-pass list: ${r1.err.slice(-300)}`);
  const r2 = E.run('refly.mjs', ['--second-pass', '--limit', '0'], env);
  ok(r2.code === 0 && /0 windows to fly in the second pass \(2103 in the first pass, 1218 in the second/.test(r2.err), `second-pass list: ${r2.err.slice(-300)}`);
  // one real window
  const key = 'GD|ETALON 1|2025-10-25', keys = path.join(dir, 'keys.txt');
  fs.writeFileSync(keys, `${key}\n`);
  const r3 = E.run('refly.mjs', ['--keys-file', keys], env);
  ok(r3.code === 0, `the window did not fly: ${r3.err.slice(-300)}`);
  const row = fs.existsSync(path.join(store, 'f0b8352a43f3')) ? E.jsonl(path.join(store, 'f0b8352a43f3')).find((x) => x.key === key) : null;
  ok(row && ['FFMr', 'FFMc', 'FFMq', 'FFMbest'].every((a) => row.arms[a]?.ok) && row.arms.FFMr.arm === 'F20' && row.arms.FFMc.arm === 'Ffull' && row.arms.FFMq.sameAs === 'FFMc' && row.arms.FFMbest.arm === 'Fbest' && !row.arms.AP, `row arms ${row ? JSON.stringify(Object.fromEntries(Object.entries(row.arms).map(([k, v]) => [k, v.arm ?? v.ok]))) : 'none'}`);
  const stored = (d) => fs.readdirSync(d).filter((f) => /^rows(-\d+)?\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).find((x) => x.key === key);
  const ffm = stored('/opt/data/sdn-archive/operator-theory/ap/ffm220/regimes');
  const rel = (a, b) => Math.max(...Object.keys(b).filter((d) => a[d]).map((d) => Math.abs(a[d].e / b[d].e - 1)));
  ok(row && ffm && rel(row.arms.FFMr.days, ffm.arms.F72.days) < 1e-4, `the reduced arm against the stored FFM row: ${row && ffm ? rel(row.arms.FFMr.days, ffm.arms.F72.days) : 'missing'}`);
  const r4 = E.run('refly.mjs', ['--keys-file', keys], env);
  ok(r4.code === 0 && /: 0 windows to fly/.test(r4.err), `a second run flies again: ${r4.err.slice(-200)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  done('refly.mjs refuses a stale checkout naming npm ci; lists 2,103 first-pass and 1,218 second-pass keys (window and row: the 72 h TESS row has its own keys over the 336 h row\'s cutoffs; the check\'s store holds no added windows); flies one laser geodetic window in four FFM settings and no AP, its reduced arm on the stored FFM row within 1e-4; a second run flies nothing');
}
