// The numerical propagator's rows, flown once (they do not change with AP's version; table.mjs reads them). On every first-pass window of the
// precise-orbit regimes: FFM (propagator/ffm 2.2.0, fitted by analysis/estimation 0.7.0) fitted to the truth arc and flown on the scored epochs,
// with the truth, windows, fit arcs, coverage rule, scoring grid and as-issued weather of the published harness (all-regimes.mjs, ap-truth.mjs,
// truth-compare.mjs, ap-all-regimes-suite/run.mjs). Rows go to <store>/f0b8352a43f3/ (lib/arms.mjs NUMERICAL_STORE); a row already there is
// not flown again.
//   node experiments/headline-loop/refly.mjs [--shard k/n] [--groups T,P,...] [--keys-file <file of window keys>] [--limit n]
//   node experiments/headline-loop/refly.mjs --check
// Settings per window and fit arc (lib/settings.mjs):
//   FFMr     the reduced setting (F20 above 8,400 km at the first scored state, L40 below)
//   FFMc     CONFIGURED
//   FFMq     FULL_SETTING (where it is CONFIGURED, FFMc's row with sameAs)
//   FFMbest  laser geodetic only: the full setting plus ocean tides and Earth radiation pressure (Fbest)
import fs from 'node:fs';
import path from 'node:path';
import { envRecord, usePackages } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
export const ALL_GROUPS = ['T', 'P', 'S1', 'GN', 'GN_GAL', 'LS', 'DO', 'GD', 'IG', 'GE', 'HE', 'HX', 'WA'];
// the order a shard flies its windows: the small groups first, so a run stopped early leaves whole groups
const ORDER = ['GD', 'IG', 'GE', 'HX', 'HE', 'LS', 'GN', 'GN_GAL', 'WA', 'DO', 'S1', 'P', 'T'];

if (args.check) await check();
else await run();

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
  const done = new Set(fs.readdirSync(outDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(outDir, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean).map((r) => `${r.key}|${r.arcH}`)));
  const outFile = path.join(outDir, `rows-truth-ffm-${K}of${N}.jsonl`);
  const all = W.windowsOf(groups);
  const only = args['keys-file'] ? new Set(fs.readFileSync(args['keys-file'], 'utf8').split('\n').filter(Boolean)) : null;
  const mine = all.windows.filter((w) => (!only || only.has(w.key)) && W.inShard(w.key, K, N) && w.arcs.some((a) => !done.has(`${w.key}|${a}`)))
    .sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || String(a.name).localeCompare(String(b.name)) || a.cutoffMs - b.cutoffMs).slice(0, Number(args.limit ?? Infinity));
  console.error(`refly shard ${K}/${N}: ${mine.length} windows to fly (${all.windows.length} in the first pass, ${all.skipped.length} in 2026-03..05 or after 2026-11-10, not read)`);
  if (!mine.length) process.exit(0);
  const arms = await A.openArms();
  const env = { ...envRecord(), ffm: arms.ffmProvenance };
  const err = (e) => ({ ok: false, error: String(e?.message ?? e).slice(0, 200) });
  const ffmRow = (f) => ({ ok: true, arm: f.arm, days: f.days, termination: f.termination, fitOk: f.fitOk, weightedRms: f.weightedRms, parameters: f.product.parameters, s: f.s });
  let n = 0;
  for (const w of mine) {
    const t0 = Date.now(), D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs);
    const head = { key: w.key, part: 'truth', group: w.group, regime: G.label, name: w.name, provider: W.providerOf(w.group, w.name), satellite: W.satelliteOf(w.group, w.name), cutoff: W.iso(D0) };
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
  ok(r1.code === 0 && /0 windows to fly \(2096 in the first pass, 1218 in 2026-03\.\.05 or after 2026-11-10, not read\)/.test(r1.err), `first-pass list: ${r1.err.slice(-300)}`);
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
  done('refly.mjs refuses a stale checkout naming npm ci; lists 2,096 first-pass windows; flies one laser geodetic window in four FFM settings and no AP, its reduced arm on the stored FFM row within 1e-4; a second run flies nothing');
}
