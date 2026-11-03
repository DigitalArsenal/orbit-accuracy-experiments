// XM7 runner (PLAN.md): pass H (F2H: M's rows with the 3-hourly ap, the test wasm) and pass C (F2C and F2E: O's rows with a centered F10.7a, the pinned wasm) in every
// group-P window XM3 attempted F2 in. F2O, F2M and P are XM3's and XM5's stored rows, read for pairing, after the proof. One JSON line per window under
// <store>/rows/<pass>.s<k>.jsonl (statistics and fit records only; no states). XM6's run.mjs is the pattern. A difference from XM3's or XM5's row is a software defect:
// the worker writes <store>/DEFECT.json and stops, and every worker stops before its next window while that file exists. Exploratory: PLAN.md.
//   node experiments/ffm-3h-ap/run.mjs --proof              the test wasm and this code against the stored rows: <store>/proof.json
//   node experiments/ffm-3h-ap/run.mjs --launch 8 --pass H|C   detached workers (at most 8), PIDs in <store>/logs/<pass>.pids.json
//   node experiments/ffm-3h-ap/run.mjs --pass H|C [--shard k/n] [--limit n]   score windows (committed sources only)
//   node experiments/ffm-3h-ap/run.mjs --check              the E2E: config.check's arms rerun and compared exactly; the table rebuilt
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, store, dir, root, XM3, xm3Rows, xm5Rows, gfzChecked, frozen, sourcesCommitted, testWasm, ap3hOf } from './common.mjs';

const { config: C3, args, readJsonl, appendJsonl, write, iso, ms, DAY, HOUR, build, daysOf, dateOf, isoWeek, sha256, rms, xmRows } = XM3;

frozen();
const LEADS = C3.scoring.leadDays;
const GRID = C3.scoring.gridSeconds * 1000, MIN_BIN = C3.scoring.binMinimumEpochs;
const ARC = C3.fit.arcHours;
const CHUNK = 6;
const rowsDir = path.join(store, 'rows'), logsDir = path.join(store, 'logs'), DEFECT = path.join(store, 'DEFECT.json'), PROOF = path.join(store, 'proof.json');
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const finite = (s) => [...s.r, ...s.v].every(Number.isFinite);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const X3 = await xm3Rows();
/** Every window of the group XM3 attempted F2 in under O, in XM3's order. */
function windows() {
  const out = [];
  for (const o of C3.groups[config.group].objects) for (const t of daysOf(C3.period.from, C3.period.to)) {
    const key = `${config.group}|${o.norad}|${dateOf(t)}`, x = X3.get(key);
    if (x?.arms?.F2 && !x.arms.F2.notRun) out.push({ group: config.group, o, cutoffMs: t, key });
  }
  return out;
}
/** The stored rows of a pass by key; a flagged row is not stored for the runner, so its window is rerun (XM3's rule). */
const stored = (pass) => new Map((fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => f.startsWith(`${pass}.s`) && f.endsWith('.jsonl')).sort() : []).flatMap((f) => readJsonl(path.join(rowsDir, f))).filter((r) => !r.defect).map((r) => [r.key, r]));

/** The proof's receipt: every check equal, under the same run.mjs, common.mjs and lib/ffm.mjs. */
function proofChecked(sources) {
  if (!fs.existsSync(PROOF)) throw new Error(`run --proof before any arm (${PROOF})`);
  const s = JSON.parse(fs.readFileSync(PROOF, 'utf8'));
  if (!s.checks.length || !s.checks.every((c) => c.equal)) throw new Error(`${PROOF}: the proof did not pass`);
  for (const f of ['run.mjs', 'common.mjs', 'lib/ffm.mjs']) if (s.sources[f] !== sources[f]) throw new Error(`${PROOF} ran under another ${f}; rerun --proof`);
}

const passArg = args.pass;
if (args.launch) {
  if (!config.passes[passArg]) throw new Error('--pass H|C');
  const count = Math.min(config.workers, Number(args.launch) || config.workers);
  proofChecked(sourcesCommitted());
  if (fs.existsSync(DEFECT)) throw new Error(`${DEFECT} exists: resolve the defect first`);
  fs.mkdirSync(logsDir, { recursive: true });
  const pids = [];
  for (let i = 0; i < count; i += 1) {
    const log = fs.openSync(path.join(logsDir, `${passArg}.s${i}.log`), 'a');
    const child = spawn(process.execPath, ['--max-old-space-size=6144', path.join(dir, 'run.mjs'), '--pass', passArg, '--shard', `${i}/${count}`], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
    pids.push(child.pid);
  }
  const pidFile = path.join(logsDir, `${passArg}.pids.json`);
  write(pidFile, { started: new Date().toISOString(), pass: passArg, pids, shards: count });
  console.error(`XM7 ${passArg}: ${count} workers, PIDs ${pids.join(' ')} (${pidFile})`);
  process.exit(0);
}

const sources = sourcesCommitted();
const T = await import(path.join(root, C3.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, C3.xm.dir, 'lib/weather.mjs'));
gfzChecked(W);
const { openFfm, settingsFor, driverRows } = await import('./lib/ffm.mjs');
const X5 = await xm5Rows();
const XM = xmRows();
const { openModules } = await import(path.join(root, C3.xm.dir, 'lib/modules.mjs'));
const spacingSeconds = (lines) => {   // XM's
  const d = [];
  for (let i = 1; i < lines.length; i += 1) d.push(ms(lines[i].epoch) - ms(lines[i - 1].epoch));
  d.sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] / 1000 : null;
};

const toMs = (date) => Date.parse(`${date}T00:00:00Z`);
/** The true centered 81-day mean of each day (XM's rowsM's c81); a day rowsM dropped takes the last value before it. */
function centeredOf(fromMs, toMsValue) {
  const M = W.rowsM(fromMs, toMsValue).rows;
  const byDate = new Map(M.map((r) => [r.date, r.c81]));
  return (date) => { for (let t = toMs(date); t >= fromMs; t -= DAY) { const v = byDate.get(dateOf(t)); if (v > 0) return v; } throw new Error(`no centered F10.7a at or before ${date}`); };
}
/** A centered mean buildable at the cutoff: over 40 days either side of each day, what the cutoff knew: O's rows' F10.7, GFZ's observed before them, the last row's value after them; a day with none skipped. */
function estimateOf(oRows) {
  const { days } = W.gfzDays();
  const byDate = new Map(oRows.map((r) => [r.date, r.f107]));
  const first = toMs(oRows[0].date), last = toMs(oRows.at(-1).date), lastValue = oRows.at(-1).f107;
  const known = (t) => (t > last ? lastValue : t >= first ? byDate.get(dateOf(t)) : days.get(dateOf(t))?.f107);
  return (date) => {
    let sum = 0, count = 0;
    for (let i = -40; i <= 40; i += 1) { const v = known(toMs(date) + i * DAY); if (v > 0) { sum += v; count += 1; } }
    if (!count) throw new Error(`no F10.7 around ${date}`);
    return sum / count;
  };
}

/** The drivers of an arm in a window, and the condition's metadata (XM's fields). */
function driversOf(armDef, row, D0, epochsMs) {
  const from = D0 - 72 * HOUR - C3.conditions.rowsMarginDays * DAY;
  if (armDef.rows === 'M') {
    const M = W.rowsM(from, epochsMs.at(-1) + DAY);
    row.M = { rows: M.rows.length, first: M.rows[0]?.date, last: M.rows.at(-1)?.date };
    return driverRows(armDef.ap3h ? M.rows.map((r) => ({ ...r, ap3h: ap3hOf(r.date) })) : M.rows, D0);
  }
  const O = W.rowsO(from, D0);
  row.O = O.excluded ? { excluded: O.excluded } : { rsga: O.rsga, c81: O.c81, lastObserved: O.lastObserved, rows: O.rows.length, first: O.rows[0]?.date, last: O.rows.at(-1)?.date };
  if (O.excluded) throw new Error(`${row.key}: ${O.excluded}`);
  const held = driverRows(O.rows, D0);
  if (armDef.f107a === 'centered') { const c = centeredOf(from - 2 * DAY, D0 + 9 * DAY); return { ...held, rows: held.rows.map((r) => ({ ...r, c81: c(r.date) })) }; }
  if (armDef.f107a === 'estimate') { const c = estimateOf(O.rows); return { ...held, rows: held.rows.map((r) => ({ ...r, c81: c(r.date) })) }; }
  return held;
}

/** One window: the named arms, XM3's rows and scorer for the rest (XM3's scoreWindow; PLAN.md, Arms). */
async function scoreWindow(m, F, w, arms) {
  const { o, group, cutoffMs: D0 } = w;
  const timing = {};
  const row = { group, key: w.key, norad: o.norad, name: o.name, cluster: o.cluster, cutoff: iso(D0), isoWeek: isoWeek(D0) };
  const after = T.series(o, D0 + 1, D0 + 7 * DAY).lines;
  const t0 = after.length ? ms(after[0].epoch) : 0;
  const grid = after.filter((l) => (ms(l.epoch) - t0) % GRID === 0);
  const bins = Object.fromEntries(LEADS.map((kk) => [kk, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (kk - 1) * DAY && t <= D0 + kk * DAY; })]));
  row.binEpochs = Object.fromEntries(LEADS.map((kk) => [kk, bins[kk].length]));
  row.entered = LEADS.filter((kk) => bins[kk].length >= MIN_BIN);
  if (!row.entered.length) return { row: { ...row, excluded: `no lead bin holds ${MIN_BIN} truth epochs` }, timing };
  const scored = row.entered.flatMap((kk) => bins[kk]);
  const epochs = scored.map((l) => l.epoch), epochsMs = scored.map((l) => ms(l.epoch)), truth = scored.map((l) => ({ r: l.r, v: l.v }));
  const sizes = row.entered.map((kk) => bins[kk].length);
  const score = async (states) => {
    const errors = await m.rtn(states, truth);
    const days = {};
    let i = 0;
    row.entered.forEach((kk, j) => {
      const e = errors.slice(i, i + sizes[j]);
      i += sizes[j];
      const ric = [0, 1, 2].map((c) => rms(e.map((v) => v[c])));
      days[kk] = { rmsKm: Math.hypot(...ric), atKm: ric[1], n: e.length };
    });
    return days;
  };
  const lines = T.series(o, D0 - ARC * HOUR, D0).lines;
  const step = spacingSeconds(lines);
  const coverage = step ? lines.length / ((ARC * 3600) / step) : 0;
  if (!(coverage >= C3.fit.minimumCoverage)) { row.arc = { coverage, stepSeconds: step, excluded: `arc coverage below ${C3.fit.minimumCoverage}` }; return { row, timing }; }
  const thin = T.thinned(lines).chosen;
  row.arc = { coverage, stepSeconds: step, states: thin.length, first: thin[0].epoch, last: thin.at(-1).epoch };

  row.arms = {};
  for (const [name, def] of arms) {
    const held = driversOf(def, row, D0, epochsMs);
    if (held.held.length) row.held = { from: held.held[0], to: held.held.at(-1), days: held.held.length };
    if (held.filled.length) row.filled = held.filled;
    const a = await F.arm(settingsFor(o.norad), thin, epochs, held.rows);
    timing[name] = { fitMs: a.fitMs ?? null, forecastMs: a.forecastMs ?? null };
    if (!a.ok) row.arms[name] = { ok: false, error: a.error, fit: a.fit ?? null };
    else if (!a.states.every(finite)) row.arms[name] = { ok: false, error: 'non-finite state', fit: a.fit };
    else row.arms[name] = { ok: true, fit: a.fit, gcrfSha256: sha256(JSON.stringify(a.states.map((s) => [s.r, s.v]))), days: await score(a.states) };
  }
  return { row, timing };
}

/** The differing fields against the stored rows: the truth's bins and the arc (XM3's), the condition's rows (XM3's under O, XM's under M). */
function againstStored(row) {
  const x = X3.get(row.key);
  if (!x) return ['no XM3 row'];
  if (row.error) return ['error'];
  const differ = ['binEpochs', 'entered', 'excluded', 'arc'].filter((f) => !same(row[f], x[f]));
  if (row.O && !same(row.O, x.O)) differ.push('O');
  if (row.M && !same(row.M, XM.get(row.key)?.M)) differ.push('M');
  return differ;
}

const m = await openModules();
const open = (wasm) => openFfm(wasm === 'test' ? { ffmWasm: testWasm() } : {});
let F = null, openWasm = null;
const useWasm = async (wasm) => { if (openWasm !== wasm) { if (F) await F.close(); F = await open(wasm); openWasm = wasm; } };
const trapped = (x) => /RuntimeError|unreachable|out of bounds|memory access/i.test(String(x?.error ?? ''));
const run = async (w, arms, wasm) => {
  await useWasm(wasm);
  const t0 = Date.now();
  let out;
  try { out = await scoreWindow(m, F, w, arms); } catch (error) { out = { row: { group: w.group, key: w.key, norad: w.o.norad, cluster: w.o.cluster, cutoff: iso(w.cutoffMs), error: String(error?.stack ?? error).slice(0, 600) }, timing: {} }; }
  const row = { ...out.row, build: build.modulesCommit.slice(0, 12), timing: { ...out.timing, wallSeconds: (Date.now() - t0) / 1000 } };
  if (Object.values(row.arms ?? {}).some(trapped)) { try { await F.close(); } catch { /* the trapped instance */ } F = await open(wasm); }
  return row;
};
const windowOf = (key) => windows().find((w) => w.key === key);
const finish = async (code) => { await m.close(); if (F) await F.close(); process.exit(code); };
const armsOf = (pass) => config.passes[pass].map((name) => [name, config.arms[name]]);

if (args.proof) {
  const checks = [];
  const compare = async (key, wasm, def, want, label) => {
    const row = await run(windowOf(key), [['X', def]], wasm);
    const differ = againstStored(row);
    if (!same(row.arms?.X, want)) differ.push('F2');
    const c = { label, key, equal: !differ.length, differ, rounds: row.arms?.X?.fit?.iterations ?? null, wallSeconds: row.timing.wallSeconds, error: row.error ?? null };
    checks.push(c);
    console.error(`XM7 proof: ${label} ${key} ${c.equal ? 'equal' : `differs in ${differ.join(', ')}`} (${c.wallSeconds} s)`);
    return row;
  };
  for (const key of config.proof.testWasmO) await compare(key, 'test', { rows: 'O' }, X3.get(key).arms.F2, 'test wasm, O rows without AP1-8, against XM3');
  for (const key of config.proof.testWasmM) await compare(key, 'test', { rows: 'M' }, X5.get(key).arms.F2, 'test wasm, M rows without AP1-8, against XM5');
  for (const key of config.proof.pinnedO) await compare(key, 'pinned', { rows: 'O' }, X3.get(key).arms.F2, 'pinned wasm, O rows, against XM3');
  const key = config.proof.branchActive;
  const row = await run(windowOf(key), [['X', { rows: 'M', ap3h: true }]], 'test');
  const active = row.arms?.X?.ok && row.arms.X.gcrfSha256 !== X5.get(key).arms.F2.gcrfSha256;
  checks.push({ label: 'test wasm, M rows with AP1-8, differs from XM5', key, equal: !!active, rounds: row.arms?.X?.fit?.iterations ?? null, wallSeconds: row.timing.wallSeconds, error: row.error ?? null });
  console.error(`XM7 proof: the branch on ${key} ${active ? 'differs from F2M, as it must' : 'DOES NOT differ from F2M'}`);
  const pass = checks.every((c) => c.equal);
  if (!pass) write(DEFECT, { proof: true, checks, at: new Date().toISOString() });
  write(PROOF, { at: new Date().toISOString(), sources, modulesCommit: build.modulesCommit, testBuild: config.testBuild.commit, checks });
  console.error(`XM7 proof: ${checks.filter((c) => c.equal).length} of ${checks.length} (${PROOF})`);
  await finish(pass ? 0 : 3);
}

if (args.check) {
  const haveH = stored('H'), haveC = stored('C');
  let bad = 0;
  for (const { key, arms } of config.check.windows) {
    for (const a of arms) {
      const def = config.arms[a], old = (def.pass === 'H' ? haveH : haveC).get(key);
      if (!old) { console.error(`XM7 check: ${key} ${a}: no stored row`); bad += 1; continue; }
      const now = await run(windowOf(key), [[a, def]], def.wasm);
      if (!same(now.arms?.[a], old.arms?.[a])) { console.error(`XM7 check: ${key} ${a}: the rerun differs from the stored row`); bad += 1; } else console.error(`XM7 check: ${key} ${a} replayed exactly (${now.timing.wallSeconds} s; ${now.arms?.[a]?.fit?.termination ?? '-'} in ${now.arms?.[a]?.fit?.iterations ?? '-'} rounds)`);
      const differ = againstStored(now);
      if (differ.length) { console.error(`XM7 check: ${key}: differs from the stored rows in ${differ.join(', ')}`); bad += 1; }
    }
  }
  await m.close(); if (F) await F.close();
  const { buildTable, sameAsCommitted } = await import('./table.mjs');
  if (!sameAsCommitted(await buildTable())) { console.error('XM7 check: the table rebuilt from the stored rows differs from the committed table.json'); bad += 1; }
  console.error(bad ? `XM7 check: FAIL (${bad})` : 'XM7 check: PASS');
  process.exit(bad ? 1 : 0);
}

if (!config.passes[passArg]) throw new Error('--pass H|C');
proofChecked(sources);
const all = windows(), done = stored(passArg);
const mine = all.filter((w, i) => Math.floor(i / CHUNK) % n === k && !done.has(w.key));
const limit = args.limit ? Number(args.limit) : Infinity;
const arms = armsOf(passArg), wasm = arms[0][1].wasm;
let count = 0;
for (const w of mine) {
  if (count >= limit) break;
  if (fs.existsSync(DEFECT)) { console.error(`XM7 shard ${k}/${n}: ${DEFECT} exists; stopping`); break; }
  const row = await run(w, arms, wasm);
  row.pass = passArg;
  row.sources = sources;
  const differ = againstStored(row);
  if (differ.length) row.defect = differ;
  appendJsonl(path.join(rowsDir, `${passArg}.s${k}.jsonl`), row);
  if (row.defect) {
    write(DEFECT, { key: row.key, pass: passArg, defect: row.defect, error: row.error ?? null, at: new Date().toISOString(), shard: `${k}/${n}` });
    console.error(`XM7 shard ${k}/${n}: ${row.key} differs in ${row.defect.join(', ')}: a software defect; stopping`);
    await finish(3);
  }
  count += 1;
  if (count % 5 === 0) console.error(`XM7 shard ${k}/${n}: ${count} of ${mine.length} windows (${new Date().toISOString()})`);
}
console.error(`XM7 shard ${k}/${n}: ${count} new windows`);
await finish(0);
