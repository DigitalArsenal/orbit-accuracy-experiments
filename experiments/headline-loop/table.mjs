// The site's one table for a released sdn-ap version (owner, 2026-11-10: "True is ALWAYS measured honestly against a properly configured
// numerical propagator"; the pass line "within 100 meters 5 days out"; "beat [XP] at a large enough margin to make our propagator the one
// to use for conjunction assessment"). AP of the given modules commit, and SGP4-XP of the same module (THEORY SGP4XP, the same fit call), are
// fitted and flown on every window of the first pass, and of a regime's second pass (the windows touching March to May 2026) once its
// numerical rows are all in the store, in the module's own GCRF output, and scored against truth in meters. The numerical propagator's
// errors on the same windows are read from the store: it was flown once (FFM, fitted by analysis/estimation) and does not change with AP's
// version. Writes one JSON (schema sdn-ap-scoreboard/2) and nothing else. The theory alone: no record that carries a forecast.
//
//   node experiments/headline-loop/table.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 14] [--groups GD,IG]
//   node experiments/headline-loop/table.mjs --check
//
// The build is read by git show at the commit (propagator/sdn-ap/dist/isomorphic/module.wasm and its package.json), never from a working tree.
// AP's and XP's rows go to <store>/table/<wasm sha12>/rows.jsonl (theory AP or SGP4XP); a row already there is not flown again. The harness's working tree must be clean
// (the file names the harness commit). The numerical arm of a regime and fit length is the stored arm with the lowest median 3D error at
// 168 h over that row's windows; among arms within 1 % of it, the fuller setting (Fbest, then the full setting, the configured, the reduced).
// It is null ("being measured") until the store holds every window of that row, and null where no stored arm is properly
// configured for the truth (NOT_CONFIGURED).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { REPO, usePackages, envRecord } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = new URL(import.meta.url).pathname;
const ALL = ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE', 'HX'];
// the order windows are handed out: the slowest first (long eccentric arcs), so the last ones to finish are short
const HEAVY = ['HE', 'HX', 'DO', 'S1', 'P', 'T', 'WA', 'LS', 'GN_GAL', 'GN', 'GE', 'IG', 'GD'];
const LEADS = [[24, 1], [72, 3], [120, 5], [168, 7]];
// AP and SGP4XP are the released module's; USSFXP (the Space Force's XP, propagator/sgp4-xp) and SGP4 (analysis/gp-error-model's fit,
// propagator/sgp4's flight) are outside builds, pinned (lib/arms.mjs OUTSIDE). --theories limits the ones flown in a run.
const THEORIES = ['AP', 'SGP4XP', 'USSFXP', 'SGP4'];
// the owner's pass line (2026-11-10): AP within 100 m of the numerical propagator 5 days out
const PASS_LEAD_DAY = 5, PASS_M = 100;
const STATISTIC = [
  'For each window (one satellite, one cutoff) and lead, the root mean square of the 3D position error against the truth over the 24 hours that end at the lead, on the truth\'s 300 s grid (a day counts when the truth covers 90 % of it); the median and the 95th percentile (linear interpolation) are taken over the lead\'s windows, those where AP and the numerical propagator were both scored.',
  'xp is SGP4-XP, our clean-room build in the same module as AP (THEORY SGP4XP), fitted to the same arc by the same fit call and flown in the module\'s own GCRF output. xpUssf is the Space Force\'s SGP4-XP (propagator/sgp4-xp 0.2.1, its library the unmodified Sgp4Prop 9.1.1.0 XP build), fitted to the same arc by that module\'s own fitter, which searches two-line-element digits with every evaluation running the library, and flown by its propagate in its own GCRF output. sgp4 is SGP4 fitted to the same arc by analysis/gp-error-model (its own SGP4 in improved mode, B* fitted) and flown by propagator/sgp4 (AFSPC mode), its TEME output turned to GCRF by foundation/frames, the path its fit uses. Each is taken over the lead\'s windows where it was scored too, and is null until it is flown on every window of the row. apBeatsXp and apBeatsXpUssf count those windows (windows), the ones where AP\'s error is below that XP\'s (apBetter), and give the median over them of AP\'s error divided by that XP\'s (medianApOverXp).',
  'within100mOfFfm counts, at the 120 hour lead, the windows where AP\'s error is less than 100 m above the numerical propagator\'s (AP better than it counts as met); share is met over windows.',
].join(' ');
// linear interpolation between order statistics (R type 7)
const quantile = (sorted, p) => { if (!sorted.length) return null; const x = p * (sorted.length - 1), i = Math.floor(x), f = x - i; return i + 1 < sorted.length ? sorted[i] + f * (sorted[i + 1] - sorted[i]) : sorted[i]; };
// commercial geostationary: the truth holds station-keeping burns and every stored arm fits through them (fit RMS 88 m at 24 h, 1.5 km at 72 h
// against a truth good to 2 m), so none is a properly configured propagator for it
const NOT_CONFIGURED = new Set(['WA']);
const PREFER = ['FFMbest', 'FFMq', 'FFMc', 'FFMr'];
const FFM_SELECTION = 'Each row\'s numerical propagator is the stored FFM setting (the reduced, the configured and the full setting, and on the laser geodetic spheres the full setting with ocean tides and Earth radiation pressure) with the lowest median 3D error at the 168 hour lead over that row\'s windows; among settings within 1 % of it, the fuller one. The choice is made on the outcome, in FFM\'s favor.';
// The measured spread of the numerical figure itself (stack issue 396): two flights of the same FFM fit that differ only in the integrator's
// step sequence (the scored epochs against a 60 s trajectory), from the carried-record rows of 2026-11-10 (store 1104598edeeb-apc), by row
// and setting; appended to that row's configuration sentence. Measured on the full setting; elsewhere it is at most 2 mm, or under 5 % of FFM's own error.
const SPREAD = { 'LS|24|L70S': ' Two flights of this same fit that differ only in the integrator\'s step sequence part by up to 0.9 m at 24 h, 2.8 m at 72 h and 8.4 m at 168 h (40, 33 and 38 windows; stack issue 396).' };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });

if (args.check) await check();
else if (args.worker) await worker();
else await main();

/** A forked worker: opens the module once, then flies each window it is sent (the theories and fit arcs asked), answering with its rows. */
async function worker() {
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const groups = args.groups.split(',');
  const all = W.windowsOf(groups);
  const winOf = new Map([...all.windows, ...all.second].map((w) => [w.key, w]));
  const want = args.theories.split(',');
  const arms = await A.openArms({ apWasm: args.wasm, ussf: want.includes('USSFXP'), sgp4: want.includes('SGP4') });
  const build = { version: args['ap-version'], sha256: args.sha256 }, env = envRecord();
  const fly = async (w, need) => {
    const D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs), t0 = performance.now();
    let ctx;
    try {
      const truth = await W.truthOf(w, D0 - maxArc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      if (!sc.entered.length) throw new Error('no lead bin');
      ctx = { truth, sc, wx: G.vacuum ? null : W.weatherAt(D0), object: { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 } };
    } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
    const truthS = (performance.now() - t0) / 1000, rows = [];
    for (const [theory, arc] of need) {
      const row = { key: w.key, group: w.group, name: w.name, arcH: arc, theory, ap: build, env, truthS };
      if (ctx.error) row.error = ctx.error;
      else {
        const thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
        if (!thin) row.error = 'coverage';
        else {
          try {
            const pcf = theory === 'SGP4XP' ? A.PCF.XP : G.vacuum ? A.PCF.AP_VACUUM : A.PCF.AP, spw = theory === 'SGP4XP' ? undefined : ctx.wx?.spw;
            const base = { thin, D0, sc: ctx.sc, object: ctx.object };
            const x = theory === 'USSFXP' ? await arms.ussf(base) : theory === 'SGP4' ? await arms.sgp4(base) : await arms.ap({ ...base, pcf, spw });
            Object.assign(row, { days: x.days, fitRmsKm: x.rms, fit: x.fit, s: x.s });
          } catch (e) { row.apError = String(e?.message ?? e).slice(0, 200); }
        }
      }
      rows.push(row);
    }
    return rows;
  };
  process.on('message', async (m) => {
    if (m.stop) { await arms.close(); process.exit(0); }
    const w = winOf.get(m.key);
    process.send({ key: m.key, rows: w ? await fly(w, m.need) : [{ key: m.key, error: 'not a listed window' }] });
  });
  process.send({ ready: true });
}

async function main() {
  const t0 = Date.now();
  const root = args['modules-root'], want = args['modules-commit'], out = args.out, jobs = Number(args.jobs ?? 14);
  if (!root || !want || !out) throw new Error('usage: table.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 14] [--groups GD,IG]');
  const dirty = git(REPO, 'status', '--porcelain', '--', 'experiments').toString().trim();
  if (dirty) throw new Error(`refused: the harness's working tree differs from its commit (the file names the commit):\n${dirty}`);
  const harnessCommit = git(REPO, 'rev-parse', 'HEAD').toString().trim();
  const commit = git(root, 'rev-parse', '--verify', `${want}^{commit}`).toString().trim();
  const wasm = git(root, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`);
  const version = JSON.parse(git(root, 'show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
  const wasmSha = sha256(wasm);
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const { SETTINGS } = await import('./lib/settings.mjs');
  const { FFM_220 } = await import(path.join(REPO, 'experiments/operator-theory/lib/build.mjs'));
  const dir = path.join(A.STORE_ROOT, 'table', wasmSha.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'module.wasm');
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== wasmSha) fs.writeFileSync(file, wasm);
  const groups = args.groups ? args.groups.split(',') : ALL;
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean) : []);
  // the numerical propagator's rows (refly.mjs, both passes)
  const baseDir = path.join(A.STORE_ROOT, A.NUMERICAL_STORE);
  // a row that flew wins over a row that recorded an error for the same window and arc (a window flown again after its truth was found)
  const base = new Map();
  for (const r of fs.readdirSync(baseDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => readRows(path.join(baseDir, f)))) { const k = `${r.key}|${r.arcH}`; if (!base.has(k) || (base.get(k).error && !r.error)) base.set(k, r); }
  // the windows: the first pass, and a regime's second pass (the windows touching 2026-03..05) once its numerical rows are all in the store
  const all = W.windowsOf(groups);
  const secondIn = new Set(groups.filter((g) => { const sec = all.second.filter((w) => w.group === g); return sec.length && sec.every((w) => w.arcs.every((a) => base.has(`${w.key}|${a}`))); }));
  const listed = [...all.windows, ...all.second.filter((w) => secondIn.has(w.group))];
  const notYet = all.second.filter((w) => !secondIn.has(w.group));
  const day = (t) => new Date(t).toISOString().slice(0, 10), count = (n) => n.toLocaleString('en-US');
  const cutoffs = listed.map((w) => w.cutoffMs);
  const windowsText = `The table holds ${count(listed.length)} windows (one satellite and one cutoff each), cutoffs from ${day(Math.min(...cutoffs))} to ${day(Math.max(...cutoffs))}`
    + (notYet.length ? `; the ${count(notYet.length)} windows whose fit arc or 7-day forecast touches March to May 2026 (the second pass) are not flown yet` : all.second.length ? ', the windows touching March to May 2026 (the second pass) among them' : '')
    + (all.after.length ? `; ${count(all.after.length)} windows reaching past 2026-11-10 are not read` : '') + '.';
  const rowsFile = path.join(dir, 'rows.jsonl');
  // a row without a theory is AP's (the version-1 rows)
  const flownRows = new Map(readRows(rowsFile).filter((r) => r.ap?.sha256 === wasmSha).map((r) => [`${r.theory ?? 'AP'}|${r.key}|${r.arcH}`, r]));
  const rowOf = (theory, w, arc) => flownRows.get(`${theory}|${w.key}|${arc}`);
  // --retry-errors: a window whose row recorded an error (no truth, coverage, a failed fit or flight) is flown again; the later row is read in
  // its place
  const flying = args.theories ? args.theories.split(',') : THEORIES, retry = !!args['retry-errors'];
  const needOf = (w) => flying.flatMap((t) => w.arcs.filter((a) => !rowOf(t, w, a) || (retry && (rowOf(t, w, a).error || rowOf(t, w, a).apError))).map((a) => [t, a]));
  const todo = listed.filter((w) => needOf(w).length)
    .sort((a, b) => HEAVY.indexOf(a.group) - HEAVY.indexOf(b.group) || Math.max(...b.arcs) - Math.max(...a.arcs) || a.key.localeCompare(b.key));
  console.error(`table: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${listed.length} windows (${all.windows.length} first pass, ${listed.length - all.windows.length} second), ${todo.length} to fly on ${Math.min(jobs, todo.length)} jobs`);

  // fly: each worker takes the next window as it finishes one
  let next = 0, flown = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker', '--wasm', file, '--ap-version', version, '--sha256', wasmSha, '--groups', groups.join(','), '--theories', flying.join(',')], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => { if (next < todo.length) { const w = todo[next++]; child.send({ key: w.key, need: needOf(w) }); } else child.send({ stop: true }); };
    child.on('message', (m) => {
      if (m.rows) {
        for (const r of m.rows) { fs.appendFileSync(rowsFile, `${JSON.stringify(r)}\n`); flownRows.set(`${r.theory ?? 'AP'}|${r.key}|${r.arcH}`, r); }
        flown += 1;
        if (flown % 50 === 0 || flown === todo.length) console.error(`  ${flown}/${todo.length} windows, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));

  const meters = (row, arm, day) => { const e = arm ? row?.arms?.[arm]?.ok && row.arms[arm].days?.[day]?.e : row?.days?.[day]?.e; return Number.isFinite(e) ? e * 1000 : null; };
  const stats = (v) => { const s = v.slice().sort((a, b) => a - b); return { medianM: round(quantile(s, 0.5)), p95M: round(quantile(s, 0.95)) }; };
  const median = (v) => quantile(v.slice().sort((a, b) => a - b), 0.5);
  const truthName = (g, ws) => [...new Set(ws.map((w) => W.providerOf(g, w.name)))].join('; ');
  const chooseArm = (g, bs) => {
    if (NOT_CONFIGURED.has(g)) return null;
    const present = PREFER.filter((a) => bs.some((b) => b.arms?.[a]?.ok));
    const common = bs.filter((b) => present.every((a) => meters(b, a, '7') != null));
    if (!common.length) return null;
    const med = Object.fromEntries(present.map((a) => [a, median(common.map((b) => meters(b, a, '7')))]));
    const best = Math.min(...Object.values(med));
    return present.find((a) => med[a] <= best * 1.01);
  };
  const rows = [];
  for (const g of ALL.filter((x) => groups.includes(x))) {
    for (const arc of [...new Set(listed.filter((w) => w.group === g).flatMap((w) => w.arcs))].sort((a, b) => a - b)) {
      const ws = listed.filter((w) => w.group === g && w.arcs.includes(arc));
      const bs = ws.map((w) => base.get(`${w.key}|${arc}`));
      const complete = bs.every(Boolean);
      const label = complete ? chooseArm(g, bs) : null;
      let ffm = null;
      if (label) {
        const used = bs.filter((b) => b.arms[label]?.ok);
        const builds = [...new Set(used.map((b) => JSON.stringify(b.env?.ffm?.ffm ?? null)))];
        const settings = [...new Set(used.map((b) => b.arms[label].arm))];
        if (builds.length !== 1 || settings.length !== 1) throw new Error(`${g} ${arc} h: the stored ${label} rows mix FFM builds or settings (${builds.join(', ')}; ${settings.join(', ')})`);
        const b = JSON.parse(builds[0]);
        if (b?.sha256 !== FFM_220.wasmSha256) throw new Error(`${g} ${arc} h: FFM ${b?.version} ${b?.sha256} is not a build this file knows the commit of`);
        ffm = { version: b.version, wasmSha256: b.sha256, modulesCommit: FFM_220.modulesCommit, configuration: describe(SETTINGS[settings[0]]) + (SPREAD[`${g}|${arc}|${settings[0]}`] ?? '') };
      }
      // per lead: the windows where AP and (where it is measured) the numerical propagator were scored; XP on those of them where it was too
      // an outside theory's column stands only once that theory has a row (flown or failed) on every window of the row
      const flownAll = (t) => ws.every((w) => rowOf(t, w, arc));
      const pairsAt = (day) => ws.map((w, i) => ({ w, a: meters(rowOf('AP', w, arc), null, day), f: label ? meters(bs[i], label, day) : null, x: meters(rowOf('SGP4XP', w, arc), null, day), u: meters(rowOf('USSFXP', w, arc), null, day), s: meters(rowOf('SGP4', w, arc), null, day) })).filter((p) => p.a != null && (!label || p.f != null));
      const leads = LEADS.map(([hours, day]) => {
        const pairs = pairsAt(day), withXp = pairs.filter((p) => p.x != null), withU = pairs.filter((p) => p.u != null), withS = pairs.filter((p) => p.s != null);
        return {
          hours, windows: pairs.length,
          ap: pairs.length ? stats(pairs.map((p) => p.a)) : null,
          ffm: label ? (pairs.length ? stats(pairs.map((p) => p.f)) : null) : null,
          xp: withXp.length ? stats(withXp.map((p) => p.x)) : null,
          xpUssf: flownAll('USSFXP') && withU.length ? stats(withU.map((p) => p.u)) : null,
          sgp4: flownAll('SGP4') && withS.length ? stats(withS.map((p) => p.s)) : null,
          apBeatsXp: withXp.length ? { windows: withXp.length, apBetter: withXp.filter((p) => p.a < p.x).length, medianApOverXp: round3(median(withXp.map((p) => p.a / p.x))) } : null,
          apBeatsXpUssf: flownAll('USSFXP') && withU.length ? { windows: withU.length, apBetter: withU.filter((p) => p.a < p.u).length, medianApOverXp: round3(median(withU.map((p) => p.a / p.u))) } : null,
        };
      });
      const pass = label ? pairsAt(PASS_LEAD_DAY) : [];
      const met = pass.filter((p) => p.a - p.f < PASS_M).length;
      const within100mOfFfm = label && pass.length ? { windows: pass.length, met, share: round3(met / pass.length) } : null;
      const scored = ws.filter((w, i) => LEADS.some(([, day]) => meters(rowOf('AP', w, arc), null, day) != null && (!label || meters(bs[i], label, day) != null)));
      rows.push({ regime: W.GROUPS[g].label, truth: truthName(g, ws), fitData: `the truth's states over the ${arc} h before the cutoff, one every 300 s (GCRF)`, fitHours: arc, satellites: new Set(scored.map((w) => w.name)).size, windows: scored.length, ffm, within100mOfFfm, leads });
      const failed = (t) => ws.filter((w) => rowOf(t, w, arc)?.apError).length;
      console.error(`  ${g} ${arc} h: ${scored.length} of ${ws.length} windows scored${THEORIES.map((t) => (failed(t) ? `, ${t} failed on ${failed(t)}` : '')).join('')}; numerical arm ${label ? `${label} (${ffm.configuration.split(';')[0]})` : complete ? 'none properly configured' : 'being measured'}`);
    }
  }
  const doc = {
    schema: 'sdn-ap-scoreboard/2',
    measured: new Date().toISOString().slice(0, 10),
    statistic: STATISTIC,
    ffmSelection: FFM_SELECTION,
    windows: windowsText,
    module: { version, modulesCommit: commit, wasmSha256: wasmSha },
    harness: { repo: 'orbit-accuracy-experiments', commit: harnessCommit, command: ['node', 'experiments/headline-loop/table.mjs', ...process.argv.slice(2)].join(' ') },
    frame: 'GCRF, the module\'s own output',
    rows,
  };
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
  console.error(`table: wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(0);
}

/** --check, end to end: table.mjs itself, as its own process, on the laser geodetic regime into a temporary store whose numerical rows are the
 *  real store's. The file holds exactly the agreed fields; every number equals the one recomputed here from the rows it read; with one
 *  window's numerical row taken away the row's numerical columns are null ("being measured"); a second run flies nothing. About a minute. */
async function check() {
  const E = await import('./lib/e2e.mjs');
  const { MODULES_ROOT } = await import('./lib/env.mjs');
  const A = await import('./lib/arms.mjs');
  const { check: ok, done } = E.checker('TABLE');
  const dir = E.tmp('table'), real = path.join(A.STORE_ROOT, A.NUMERICAL_STORE);
  const commit = git(MODULES_ROOT, 'rev-parse', 'HEAD').toString().trim();
  const wasmSha = sha256(git(MODULES_ROOT, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`));
  const runIn = (store, out, more = []) => E.run('table.mjs', ['--modules-commit', commit, '--modules-root', MODULES_ROOT, '--out', out, '--groups', 'GD', '--jobs', '8', ...more], { HEADLINE_LOOP_STORE: store });
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const lines = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean);
  const gd = fs.readdirSync(real).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => lines(path.join(real, f))).filter((r) => r.group === 'GD' && !r.period);
  // 1. the real numerical rows
  const s1 = path.join(dir, 's1'), out1 = path.join(dir, 'a.json');
  fs.mkdirSync(s1, { recursive: true });
  fs.symlinkSync(real, path.join(s1, A.NUMERICAL_STORE));
  const r1 = runIn(s1, out1);
  ok(r1.code === 0 && fs.existsSync(out1), `the table did not run: ${r1.err.slice(-300)}`);
  const doc = fs.existsSync(out1) ? E.readJson(out1) : {};
  ok(JSON.stringify(Object.keys(doc)) === JSON.stringify(['schema', 'measured', 'statistic', 'ffmSelection', 'windows', 'module', 'harness', 'frame', 'rows']) && doc.windows === 'The table holds 55 windows (one satellite and one cutoff each), cutoffs from 2025-10-11 to 2025-12-20.' && doc.schema === 'sdn-ap-scoreboard/2' && doc.frame === 'GCRF, the module\'s own output', `top-level fields: ${Object.keys(doc)}`);
  ok(doc.module?.modulesCommit === commit && doc.module?.wasmSha256 === wasmSha && /^[0-9a-f]{40}$/.test(doc.harness?.commit ?? ''), `module and harness: ${JSON.stringify(doc.module)} ${doc.harness?.commit}`);
  const row = doc.rows?.[0];
  ok(doc.rows?.length === 1 && JSON.stringify(Object.keys(row ?? {})) === JSON.stringify(['regime', 'truth', 'fitData', 'fitHours', 'satellites', 'windows', 'ffm', 'within100mOfFfm', 'leads']) && row.regime === 'Laser geodetic' && row.truth === 'ILRS' && row.fitHours === 72 && row.satellites === 5, `the row: ${JSON.stringify(row)?.slice(0, 300)}`);
  ok(row?.ffm?.version === '2.2.0' && /^[0-9a-f]{64}$/.test(row.ffm.wasmSha256) && /ocean tides/.test(row.ffm.configuration) && !/Fbest|FFM/.test(row.ffm.configuration), `the numerical arm: ${JSON.stringify(row?.ffm)}`);
  const sha12 = wasmSha.slice(0, 12), flown = lines(path.join(s1, 'table', sha12, 'rows.jsonl'));
  const apRows = new Map(flown.filter((r) => (r.theory ?? 'AP') === 'AP').map((r) => [r.key, r])), xpRows = new Map(flown.filter((r) => r.theory === 'SGP4XP').map((r) => [r.key, r]));
  const uRows = new Map(flown.filter((r) => r.theory === 'USSFXP').map((r) => [r.key, r])), sRows = new Map(flown.filter((r) => r.theory === 'SGP4').map((r) => [r.key, r]));
  ok([apRows, xpRows, uRows, sRows].every((m) => m.size === 55) && /propagator\/sgp4-xp/.test(doc.statistic) && /analysis\/gp-error-model/.test(doc.statistic), `rows flown: AP ${apRows.size}, XP ${xpRows.size}, Space Force XP ${uRows.size}, SGP4 ${sRows.size} (55 windows); the fitters named`);
  const med = (v) => round(quantile(v.slice().sort((a, b) => a - b), 0.5)), p95 = (v) => round(quantile(v.slice().sort((a, b) => a - b), 0.95));
  const pairsAt = (day) => gd.map((b) => ({ a: apRows.get(b.key)?.days?.[day]?.e, f: b.arms?.FFMbest?.ok ? b.arms.FFMbest.days?.[day]?.e : undefined, x: xpRows.get(b.key)?.days?.[day]?.e, u: uRows.get(b.key)?.days?.[day]?.e, s: sRows.get(b.key)?.days?.[day]?.e })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.f));
  ok(JSON.stringify(row?.leads?.map((l) => l.hours)) === '[24,72,120,168]', `leads ${JSON.stringify(row?.leads?.map((l) => l.hours))}`);
  for (const [hours, day] of LEADS) {
    const pairs = pairsAt(day), wx = pairs.filter((p) => Number.isFinite(p.x)), wu = pairs.filter((p) => Number.isFinite(p.u)), ws = pairs.filter((p) => Number.isFinite(p.s));
    const l = row?.leads?.find((x) => x.hours === hours);
    ok(l && l.windows === pairs.length && l.ap.medianM === med(pairs.map((p) => p.a * 1000)) && l.ap.p95M === p95(pairs.map((p) => p.a * 1000)) && l.ffm.medianM === med(pairs.map((p) => p.f * 1000)) && l.ffm.p95M === p95(pairs.map((p) => p.f * 1000)), `lead ${hours} h: ${JSON.stringify(l)} against ${pairs.length} windows recomputed`);
    ok(l && wx.length && l.xp.medianM === med(wx.map((p) => p.x * 1000)) && l.xp.p95M === p95(wx.map((p) => p.x * 1000)) 
      && l.apBeatsXp.windows === wx.length && l.apBeatsXp.apBetter === wx.filter((p) => p.a < p.x).length && l.apBeatsXp.medianApOverXp === round3(quantile(wx.map((p) => (p.a * 1000) / (p.x * 1000)).sort((a, b) => a - b), 0.5)), `XP at ${hours} h: ${JSON.stringify(l?.xp)} ${JSON.stringify(l?.apBeatsXp)} against ${wx.length} windows recomputed`);
    ok(l && wu.length && ws.length && l.xpUssf.medianM === med(wu.map((p) => p.u * 1000)) && l.xpUssf.p95M === p95(wu.map((p) => p.u * 1000)) && l.sgp4.medianM === med(ws.map((p) => p.s * 1000)) && l.sgp4.p95M === p95(ws.map((p) => p.s * 1000))
      && l.apBeatsXpUssf.windows === wu.length && l.apBeatsXpUssf.apBetter === wu.filter((p) => p.a < p.u).length && l.apBeatsXpUssf.medianApOverXp === round3(quantile(wu.map((p) => (p.a * 1000) / (p.u * 1000)).sort((a, b) => a - b), 0.5)), `Space Force XP and SGP4 at ${hours} h: ${JSON.stringify(l?.xpUssf)} ${JSON.stringify(l?.sgp4)} ${JSON.stringify(l?.apBeatsXpUssf)} against ${wu.length} and ${ws.length} windows recomputed`);
  }
  const pass = pairsAt('5'), met = pass.filter((p) => p.a * 1000 - p.f * 1000 < 100).length;
  ok(row?.within100mOfFfm?.windows === pass.length && row.within100mOfFfm.met === met && row.within100mOfFfm.share === round3(met / pass.length), `pass line: ${JSON.stringify(row?.within100mOfFfm)} against ${met} of ${pass.length} recomputed`);
  // 2. one window's numerical row and one Space Force XP row taken away, the Space Force XP not flown: FFM, the pass line and the Space Force
  // XP are "being measured"; the other rows are reused, nothing flown
  const s2 = path.join(dir, 's2'), out2 = path.join(dir, 'b.json');
  fs.mkdirSync(path.join(s2, A.NUMERICAL_STORE), { recursive: true });
  fs.writeFileSync(path.join(s2, A.NUMERICAL_STORE, 'rows-truth-0of1.jsonl'), gd.slice(1).map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.mkdirSync(path.join(s2, 'table', sha12), { recursive: true });
  const dropU = gd[0].key;
  fs.writeFileSync(path.join(s2, 'table', sha12, 'rows.jsonl'), flown.filter((r) => !(r.theory === 'USSFXP' && r.key === dropU)).map((r) => JSON.stringify(r)).join('\n') + '\n');
  const r2 = runIn(s2, out2, ['--theories', 'AP,SGP4XP,SGP4']);
  const b = fs.existsSync(out2) ? E.readJson(out2).rows?.[0] : null;
  ok(r2.code === 0 && /, 0 to fly/.test(r2.err), `the second run flew again: ${r2.err.slice(-200)}`);
  ok(b && b.ffm === null && b.within100mOfFfm === null && b.leads.every((l) => l.ffm === null && l.ap && l.xp && l.sgp4 && l.xpUssf === null && l.apBeatsXpUssf === null) && b.leads[0].ap.medianM === row?.leads?.[0]?.ap?.medianM, `being measured: ${JSON.stringify(b)?.slice(0, 300)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  done('table.mjs writes exactly the agreed fields (version 2) for the laser geodetic regime at 24, 72, 120 and 168 h: AP, FFM, our SGP4-XP, the Space Force XP and SGP4 medians and 95th percentiles, AP against both XPs as counts, and the 100 m pass line at 120 h, each equal to the one recomputed from the rows it read; the fitters named; the numerical arm named in plain words on FFM 2.2.0; with one numerical row and one Space Force XP row missing those columns are being measured (null) and nothing is flown again');
}

function round(x) { return x == null ? null : Math.round(x * 100) / 100; }
function round3(x) { return x == null ? null : Math.round(x * 1000) / 1000; }

/** A setting in one plain sentence: gravity, drag and its weather, radiation pressure, third bodies, tides, relativity, what is fitted, the integrator. */
function describe(s) {
  const f = s.forces, kinds = s.parameters.map((p) => p.kind), ecom = kinds.filter((k) => k.startsWith('ECOM2_')).map((k) => k.slice(6).replace('_COS', ' cos').replace('_SIN', ' sin'));
  const radiation = ecom.length ? `solar radiation pressure by the ECOM2 model (${ecom.join(', ')})` : f.srp ? `solar radiation pressure on a sphere${kinds.includes('SRP_AREA_OVER_MASS') ? '' : ` (area to mass held at ${s.fixed.agom} m2/kg)`}` : 'no radiation pressure';
  const fitted = ['the initial state', ...(kinds.includes('DRAG_AREA_OVER_MASS') ? ['the drag area to mass'] : []), ...(kinds.includes('SRP_AREA_OVER_MASS') ? ['the radiation area to mass'] : []), ...(ecom.length ? ['the five ECOM2 terms'] : [])];
  const and = (v) => (v.length > 1 ? `${v.slice(0, -1).join(', ')} and ${v.at(-1)}` : v[0]);
  const tides = [...(f.solidTides ? ['solid Earth tides'] : []), ...(f.oceanTides ? ['ocean tides (FES2004 to degree 30)'] : [])];
  return [
    `Earth gravity to degree and order ${f.degree}`,
    f.drag ? 'atmospheric drag by NRLMSISE-00 driven by the space weather known at the cutoff (GFZ observed F10.7 and Ap, then the NOAA SWPC forecast issued before it)' : 'no atmospheric drag',
    radiation,
    ...(f.earthRadiation ? ['Earth radiation pressure (Knocke)'] : []),
    f.thirdBodies?.length ? 'the Sun and Moon' : 'no third bodies',
    tides.length ? and(tides) : 'no tides',
    f.relativity ? 'general relativity (IERS 2010)' : 'no relativity',
    `integrated by RK78 at a tolerance of ${s.integrator.tolerance} with steps up to ${s.integrator.maxStep} s; fitted by batch least squares (analysis/estimation) for ${and(fitted)}.`,
  ].join('; ').replace(/^./, (c) => c.toUpperCase());
}
