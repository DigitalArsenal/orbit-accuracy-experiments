// The site's one table for a released sdn-ap version (owner, 2026-11-10: "True is ALWAYS measured honestly against a properly configured
// numerical propagator"). AP of the given modules commit is fitted and flown on every first-pass window, in the module's own GCRF output, and
// scored against truth in meters. The numerical propagator's errors on the same windows are read from the store: it was flown once (FFM,
// fitted by analysis/estimation) and does not change with AP's version. Writes one JSON (schema sdn-ap-scoreboard/1) and nothing else.
//
//   node experiments/headline-loop/table.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 14] [--groups GD,IG]
//
// The build is read by git show at the commit (propagator/sdn-ap/dist/isomorphic/module.wasm and its package.json), never from a working tree.
// AP's rows go to <store>/table/<wasm sha12>/rows.jsonl; a row already there is not flown again. The harness's working tree must be clean
// (the file names the harness commit). The numerical arm of a regime and fit length is the stored arm with the lowest median 3D error at
// 168 h over that row's windows; among arms within 1 % of it, the fuller setting (Fbest, then the full setting, the configured, the reduced).
// It is null ("being measured") until the store holds every first-pass window of that row, and null where no stored arm is properly
// configured for the truth (NOT_CONFIGURED).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { REPO, usePackages } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = new URL(import.meta.url).pathname;
const ALL = ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE', 'HX'];
// the order windows are handed out: the slowest first (long eccentric arcs), so the last ones to finish are short
const HEAVY = ['HE', 'HX', 'DO', 'S1', 'P', 'T', 'WA', 'LS', 'GN_GAL', 'GN', 'GE', 'IG', 'GD'];
const LEADS = [[24, 1], [72, 3], [168, 7]];
const BASE = 'f0b8352a43f3';
// commercial geostationary: the truth holds station-keeping burns and every stored arm fits through them (fit RMS 88 m at 24 h, 1.5 km at 72 h
// against a truth good to 2 m), so none is a properly configured propagator for it
const NOT_CONFIGURED = new Set(['WA']);
const PREFER = ['FFMbest', 'FFMq', 'FFMc', 'FFMr'];
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });

if (args.worker) await worker();
else await main();

/** A forked worker: opens AP once, then flies each window it is sent (every fit arc), answering with its rows. */
async function worker() {
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const groups = args.groups.split(',');
  const winOf = new Map(W.windowsOf(groups).windows.map((w) => [w.key, w]));
  const arms = await A.openArms({ apWasm: args.wasm });
  const build = { version: args['ap-version'], sha256: args.sha256 };
  const fly = async (w) => {
    const D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs), t0 = performance.now();
    let ctx;
    try {
      const truth = await W.truthOf(w, D0 - maxArc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      if (!sc.entered.length) throw new Error('no lead bin');
      ctx = { truth, sc, wx: G.vacuum ? null : W.weatherAt(D0), object: { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 } };
    } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
    const truthS = (performance.now() - t0) / 1000, rows = [];
    for (const arc of w.arcs) {
      const row = { key: w.key, group: w.group, name: w.name, arcH: arc, ap: build, truthS };
      if (ctx.error) row.error = ctx.error;
      else {
        const thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
        if (!thin) row.error = 'coverage';
        else {
          try {
            const ap = await arms.ap({ thin, D0, sc: ctx.sc, object: ctx.object, pcf: G.vacuum ? A.PCF.AP_VACUUM : A.PCF.AP, spw: ctx.wx?.spw, frame: 'GCRF' });
            Object.assign(row, { days: ap.days, fitRmsKm: ap.rms, fit: ap.fit, s: ap.s });
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
    process.send({ key: m.key, rows: w ? await fly(w) : [{ key: m.key, error: 'not a listed window' }] });
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
  const { quantile } = await import('./lib/stats.mjs');
  const dir = path.join(A.STORE_ROOT, 'table', wasmSha.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'module.wasm');
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== wasmSha) fs.writeFileSync(file, wasm);
  const groups = args.groups ? args.groups.split(',') : ALL;
  const listed = W.windowsOf(groups).windows;
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const rowsFile = path.join(dir, 'rows.jsonl');
  const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean) : []);
  const apRows = new Map(readRows(rowsFile).filter((r) => r.ap?.sha256 === wasmSha).map((r) => [`${r.key}|${r.arcH}`, r]));
  const todo = listed.filter((w) => w.arcs.some((a) => !apRows.has(`${w.key}|${a}`)))
    .sort((a, b) => HEAVY.indexOf(a.group) - HEAVY.indexOf(b.group) || Math.max(...b.arcs) - Math.max(...a.arcs) || a.key.localeCompare(b.key));
  console.error(`table: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${listed.length} first-pass windows, ${todo.length} to fly on ${Math.min(jobs, todo.length)} jobs`);

  // fly: each worker takes the next window as it finishes one
  let next = 0, flown = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker', '--wasm', file, '--ap-version', version, '--sha256', wasmSha, '--groups', groups.join(',')], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => { if (next < todo.length) child.send({ key: todo[next++].key }); else child.send({ stop: true }); };
    child.on('message', (m) => {
      if (m.rows) {
        for (const r of m.rows) { fs.appendFileSync(rowsFile, `${JSON.stringify(r)}\n`); apRows.set(`${r.key}|${r.arcH}`, r); }
        flown += 1;
        if (flown % 50 === 0 || flown === todo.length) console.error(`  ${flown}/${todo.length} windows, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));

  // the numerical arm: the store's first-pass rows of the base run
  const baseDir = path.join(A.STORE_ROOT, BASE);
  const base = new Map(fs.readdirSync(baseDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => readRows(path.join(baseDir, f))).filter((r) => !r.period).map((r) => [`${r.key}|${r.arcH}`, r]));
  const meters = (row, arm, day) => { const e = arm ? row?.arms?.[arm]?.ok && row.arms[arm].days?.[day]?.e : row?.days?.[day]?.e; return Number.isFinite(e) ? e * 1000 : null; };
  const stats = (v) => { const s = v.slice().sort((a, b) => a - b); return { medianM: round(quantile(s, 0.5)), p95M: round(quantile(s, 0.95)) }; };
  const median = (v) => quantile(v.slice().sort((a, b) => a - b), 0.5);
  const truthName = (g, ws) => [...new Set(ws.map((w) => (W.GROUPS[g].truth === 'gnss' ? 'ESA navigation' : W.providerOf(g, w.name))))].join('; ');
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
        ffm = { version: b.version, wasmSha256: b.sha256, modulesCommit: FFM_220.modulesCommit, configuration: describe(SETTINGS[settings[0]], settings[0]) };
      }
      const leads = LEADS.map(([hours, day]) => {
        const pairs = ws.map((w, i) => ({ w, a: meters(apRows.get(`${w.key}|${arc}`), null, day), f: label ? meters(bs[i], label, day) : null })).filter((p) => p.a != null && (!label || p.f != null));
        return { hours, windows: pairs.length, ap: pairs.length ? stats(pairs.map((p) => p.a)) : null, ffm: label ? (pairs.length ? stats(pairs.map((p) => p.f)) : null) : null };
      });
      const scored = ws.filter((w, i) => LEADS.some(([, day]) => meters(apRows.get(`${w.key}|${arc}`), null, day) != null && (!label || meters(bs[i], label, day) != null)));
      rows.push({ regime: W.GROUPS[g].label, truth: truthName(g, ws), fitData: `the truth's states over the ${arc} h before the cutoff, one every 300 s (GCRF)`, fitHours: arc, satellites: new Set(scored.map((w) => w.name)).size, windows: scored.length, ffm, leads });
      const failed = ws.filter((w) => apRows.get(`${w.key}|${arc}`)?.apError).length;
      console.error(`  ${g} ${arc} h: ${scored.length} of ${ws.length} windows scored${failed ? `, AP failed on ${failed}` : ''}; numerical arm ${label ? `${label} (${ffm.configuration.split(';')[0]})` : complete ? 'none properly configured' : 'being measured'}`);
    }
  }
  const doc = {
    schema: 'sdn-ap-scoreboard/1',
    measured: new Date().toISOString().slice(0, 10),
    statistic: 'For each window (one satellite, one cutoff) and lead, the root mean square of the 3D position error against the truth over the 24 hours that end at the lead, on the truth\'s 300 s grid (a day counts when the truth covers 90 % of it); the median and the 95th percentile (linear interpolation) are taken over the row\'s windows, the same windows for AP and the numerical propagator.',
    module: { version, modulesCommit: commit, wasmSha256: wasmSha },
    harness: { repo: 'orbit-accuracy-experiments', commit: harnessCommit, command: ['node', 'experiments/headline-loop/table.mjs', ...process.argv.slice(2)].join(' ') },
    frame: 'GCRF, the module\'s own output',
    rows,
  };
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
  console.error(`table: wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(0);
}

function round(x) { return x == null ? null : Math.round(x * 100) / 100; }

/** A setting in plain words: gravity, drag and its weather, radiation pressure, third bodies, tides, relativity, what is fitted, the integrator. */
function describe(s, name) {
  const f = s.forces, kinds = s.parameters.map((p) => p.kind), ecom = kinds.filter((k) => k.startsWith('ECOM2_')).map((k) => k.slice(6).replace('_COS', ' cos').replace('_SIN', ' sin'));
  const radiation = ecom.length ? `solar radiation pressure by the ECOM2 model (${ecom.join(', ')})` : f.srp ? `solar radiation pressure, cannonball${kinds.includes('SRP_AREA_OVER_MASS') ? '' : ` (area to mass held at ${s.fixed.agom} m2/kg)`}` : 'no radiation pressure';
  const fitted = ['the initial state', ...(kinds.includes('DRAG_AREA_OVER_MASS') ? ['the drag area to mass'] : []), ...(kinds.includes('SRP_AREA_OVER_MASS') ? ['the radiation area to mass'] : []), ...(ecom.length ? ['the ECOM2 terms'] : [])];
  return [
    `FFM setting ${name}: gravity ${f.degree}x${f.order}`,
    f.drag ? `drag by NRLMSISE-00 driven by the space weather known at the cutoff (GFZ observed F10.7 and Ap, then the NOAA SWPC forecast issued before it)` : 'no drag',
    radiation,
    f.thirdBodies?.length ? 'Sun and Moon' : 'no third bodies',
    [f.solidTides ? 'solid Earth tides' : 'no solid Earth tides', ...(f.oceanTides ? ['ocean tides (FES2004 to degree 30)'] : [])].join(', '),
    ...(f.earthRadiation ? ['Earth radiation pressure (Knocke)'] : []),
    f.relativity ? 'relativity (IERS 2010)' : 'no relativity',
    `fitted by batch least squares (analysis/estimation): ${fitted.join(', ')}`,
    `RK78 at ${s.integrator.tolerance}, steps to ${s.integrator.maxStep} s`,
  ].join('; ');
}
