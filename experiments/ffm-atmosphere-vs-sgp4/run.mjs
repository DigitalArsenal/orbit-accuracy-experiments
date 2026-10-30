// XM2 runner (PLAN.md): every registered window of groups P and S1 (group P first) through XM's P and X2, rerun with XM's code at
// 2c7b326 and required equal to XM's stored row, and through the FFM arms F2 and F3 on the 72 h arc under one condition per pass;
// one JSON line per window under <store>/rows/<condition>.s<k>.jsonl (statistics and fit records only; no states). Re-running
// skips windows already stored. A difference from XM's row is a software defect: the worker writes <store>/DEFECT.json and stops,
// and every worker stops before its next window while that file exists.
//   node experiments/ffm-atmosphere-vs-sgp4/run.mjs --launch 8 --condition O|M   detached workers, PIDs in <store>/logs/<condition>.pids.json
//   node experiments/ffm-atmosphere-vs-sgp4/run.mjs --condition O|M [--shard k/n] [--limit n]   score windows (committed sources only)
//   node experiments/ffm-atmosphere-vs-sgp4/run.mjs --amend A1 --condition O [--group P]   amendment A1: the F arms of the windows
//                                                             propagator/ffm refused for a missing weather day, rerun into
//                                                             <store>/rows/<condition>.A1.jsonl (the refusal rows stay)
//   node experiments/ffm-atmosphere-vs-sgp4/run.mjs --check   the E2E: config.check's windows re-run and compared exactly; the table
//                                                             rebuilt against the committed table.json
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, store, args, dir, root, frozen, sourcesCommitted, readJsonl, appendJsonl, write, iso, ms, DAY, HOUR, build, daysOf, dateOf, isoWeek, sha256, rms } from './common.mjs';

frozen();
const GROUPS = Object.keys(config.groups);
const LEADS = config.scoring.leadDays;
const GRID = config.scoring.gridSeconds * 1000, MIN_BIN = config.scoring.binMinimumEpochs;
const ARC = config.fit.arcHours;
const CHUNK = 6;
const rowsDir = path.join(store, 'rows'), logsDir = path.join(store, 'logs'), DEFECT = path.join(store, 'DEFECT.json');
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const condition = args.check ? config.check.condition : args.condition;
if (!['O', 'M'].includes(condition)) throw new Error('--condition O|M');
const short = (e) => String(e?.message ?? e).slice(0, 240);   // XM's
const finite = (s) => [...s.r, ...s.v].every(Number.isFinite);

/** Every registered window, in group (P, then S1), object and cutoff order. */
export function windows() {
  const out = [];
  for (const group of GROUPS) for (const o of config.groups[group].objects) for (const t of daysOf(config.period.from, config.period.to)) out.push({ group, o, cutoffMs: t, key: `${group}|${o.norad}|${dateOf(t)}` });
  return out;
}
const stored = (c) => new Map((fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => f.startsWith(`${c}.`) && f.endsWith('.jsonl')).sort() : []).flatMap((f) => readJsonl(path.join(rowsDir, f))).map((r) => [r.key, r]));

/** XM's stored rows by key (read only), their digest checked against XM's table (rowsDigest). */
function xmRows() {
  const dirXm = path.join(config.xm.store, 'rows');
  const byKey = new Map();
  for (const f of fs.readdirSync(dirXm).filter((x) => x.endsWith('.jsonl')).sort()) for (const r of readJsonl(path.join(dirXm, f))) if (!byKey.has(r.key)) byKey.set(r.key, r);
  const rows = [...byKey.values()].sort((x, y) => (x.key < y.key ? -1 : 1));
  const digest = sha256(rows.map((r) => JSON.stringify({ ...r, timing: undefined, sources: undefined, build: undefined })).join('\n'));
  if (!digest.startsWith(config.xm.rowsDigest)) throw new Error(`XM's stored rows digest ${digest.slice(0, 12)} is not the registered ${config.xm.rowsDigest}`);
  return byKey;
}

if (args.launch) {
  const count = Math.min(8, Number(args.launch) || 8);
  sourcesCommitted();
  xmRows();
  if (fs.existsSync(DEFECT)) throw new Error(`${DEFECT} exists: resolve the defect first`);
  const { extraction } = await import(path.join(root, config.xm.dir, 'lib/public.mjs'));
  if (extraction().missing.length) throw new Error("XM's public extraction is incomplete");
  if (condition === 'M' && !args.amend) {
    const o = stored('O').size, registered = windows().length;
    if (o < registered) throw new Error(`condition M runs only after every O window is stored (${o} of ${registered})`);
  }
  fs.mkdirSync(logsDir, { recursive: true });
  const pids = [];
  const tag = args.amend ? `${condition}.${args.amend}` : condition;
  for (let i = 0; i < count; i += 1) {
    const log = fs.openSync(path.join(logsDir, `${tag}.s${i}.log`), 'a');
    const extra = [...(args.amend ? ['--amend', args.amend] : []), ...(args.group ? ['--group', args.group] : [])];
    const child = spawn(process.execPath, ['--max-old-space-size=6144', path.join(dir, 'run.mjs'), '--condition', condition, ...extra, '--shard', `${i}/${count}`], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
    pids.push(child.pid);
  }
  write(path.join(logsDir, `${tag}.pids.json`), { started: new Date().toISOString(), condition, amendment: args.amend ?? null, group: args.group ?? null, pids, shards: count });
  console.error(`XM2 ${tag}: ${count} workers, PIDs ${pids.join(' ')} (${path.join(logsDir, `${tag}.pids.json`)})`);
  process.exit(0);
}

const sources = sourcesCommitted();
const XM = xmRows();
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const { publicSetAt, extraction } = await import(path.join(root, config.xm.dir, 'lib/public.mjs'));
const { config: XMC } = await import(path.join(root, config.xm.dir, 'common.mjs'));
const { openFfm, driverRows, cachedDcl } = await import('./lib/ffm.mjs');
if (extraction().missing.length) throw new Error("XM's public extraction is incomplete");
const PCF_X2 = S.pcfBytes({ forces: XMC.arms.X2.forces, fit: { dragPrior: XMC.fit.dragPrior, srpPrior: XMC.fit.srpPrior } });
const spacingSeconds = (lines) => {   // XM's
  const d = [];
  for (let i = 1; i < lines.length; i += 1) d.push(ms(lines[i].epoch) - ms(lines[i - 1].epoch));
  d.sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] / 1000 : null;
};
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The fields of a window that XM stored, compared with this run's: a list of the differing fields (empty: equal). */
function againstXm(row, x) {
  if (!x) return ['no XM row'];
  const differ = [];
  for (const f of ['binEpochs', 'entered', 'excluded', 'P']) if (!same(row[f], x[f])) differ.push(f);
  if (row.excluded) return differ;
  if (!same(row[condition], x[condition])) differ.push(condition);
  const dx = x.dca?.[condition];
  if (!same(row.dca, dx?.ok ? { ok: true, sha256: dx.sha256 } : { ok: false, error: dx?.error })) differ.push('dca');
  const ax = x.arcs?.[ARC];
  const meta = (a) => (a ? { coverage: a.coverage, stepSeconds: a.stepSeconds, states: a.states, first: a.first, last: a.last, excluded: a.excluded } : null);
  if (!same(meta(row.arc), meta(ax))) differ.push('arc');
  if (!row.arc?.excluded && !same(row.arms?.X2, ax?.arms?.[`X2${condition}`])) differ.push('X2');
  return differ;
}

/** One window: P and X2 as XM scores them, then F2 and F3 (PLAN.md, Arms, Fit, Environment, Conditions, Scoring). With `registered`
 *  (amendment A1), P and X2 are taken from that row and only the F arms are run. */
async function scoreWindow(m, F, w, registered = null) {
  const { o, group, cutoffMs: D0 } = w;
  const timing = {};
  const row = { group, key: w.key, norad: o.norad, name: o.name, cluster: o.cluster, cutoff: iso(D0), isoWeek: isoWeek(D0), condition };
  // the truth after the cutoff: the 300 s grid and the lead bins, decided by the truth alone (XM's)
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
  /** e per lead of GCRF states (km), or of TEME states taken to GCRF by foundation/frames as XM takes P and X2. */
  const score = async (states, teme) => {
    const errors = await m.rtn(teme ? await m.toAxes(states, epochs, 'GCRF') : states, truth);
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

  // P: the public set at or before the cutoff under propagator/sgp4 (XM's)
  const set = registered ? null : publicSetAt(o.norad, D0);
  if (registered) row.P = registered.P;
  else if (!set) row.P = { ok: false, notRun: 'no public set at or before the cutoff' };
  else {
    const p = { setEpoch: set.epoch, setCreation: set.creationDate, gpId: set.gpId };
    let states = null;
    try { states = await m.propagateSgp4(set, o.norad, epochsMs, config.scoring.gridSeconds); } catch (error) { row.P = { ok: false, error: `propagator/sgp4: ${short(error)}`, ...p }; }
    if (states) {
      const missing = states.filter((s) => s == null).length;
      if (missing) throw new Error(`propagator/sgp4 answered no state at ${missing} of ${states.length} scored epochs (grid)`);
      row.P = states.every(finite) ? { ok: true, ...p, days: await score(states, true) } : { ok: false, error: 'non-finite state', ...p };
    }
  }

  // the condition's rows (XM's) and $DCL (XM's cache)
  const from = D0 - 72 * HOUR - config.conditions.rowsMarginDays * DAY;
  let rows = null, notRun = null;
  if (condition === 'O') {
    const O = W.rowsO(from, D0);
    row.O = O.excluded ? { excluded: O.excluded } : { rsga: O.rsga, c81: O.c81, lastObserved: O.lastObserved, rows: O.rows.length, first: O.rows[0]?.date, last: O.rows.at(-1)?.date };
    if (O.excluded) notRun = O.excluded; else rows = O.rows;
  } else {
    const M = W.rowsM(from, epochsMs.at(-1) + DAY);
    row.M = { rows: M.rows.length, first: M.rows[0]?.date, last: M.rows.at(-1)?.date };
    rows = M.rows;
  }
  const dcl = cachedDcl(Math.round(D0 + config.conditions[condition].dclIssueOffsetHours * HOUR));
  row.dca = dcl.ok ? { ok: true, sha256: dcl.sha256 } : { ok: false, error: dcl.error };

  // the 72 h arc (XM's)
  const lines = T.series(o, D0 - ARC * HOUR, D0).lines;
  const step = spacingSeconds(lines);
  const coverage = step ? lines.length / ((ARC * 3600) / step) : 0;
  if (!(coverage >= config.fit.minimumCoverage)) { row.arc = { coverage, stepSeconds: step, excluded: `arc coverage below ${config.fit.minimumCoverage}` }; return { row, timing }; }
  const thin = T.thinned(lines).chosen;
  row.arc = { coverage, stepSeconds: step, states: thin.length, first: thin[0].epoch, last: thin.at(-1).epoch };
  row.arms = {};
  if (notRun) {
    for (const a of ['X2', 'F2', 'F3']) row.arms[a] = { ok: false, notRun };
    return { row, timing };
  }

  // X2 (XM's arm, its condition's rows, no $DCL)
  if (registered) row.arms.X2 = registered.arms?.X2;
  else {
    const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
    const extra = { rows: S.spwBytes(rows) };
    const f = await m.fit(oem, PCF_X2, extra);
    timing.X2FitMs = f.fitMs;
    if (!f.ok) row.arms.X2 = { ok: false, error: f.error };
    else {
      const info = S.readFitOmm(f.omm), obd = S.readObd(f.obd);
      const fit = { epoch: info.epoch, bterm: info.bterm, agom: info.agom, fitRmsKm: info.fitRmsKm, iterations: info.iterations, states: info.states, wrmsKm: obd.wrmsKm, sigmaLnB: obd.sigmaLnB, priorLimited: obd.priorLimited };
      let teme = null;
      try { teme = await m.propagate(f.omm, S.gridBytes(epochs), PCF_X2, extra, epochs.length); } catch (error) { row.arms.X2 = { ok: false, error: short(error), fit }; }
      if (teme) row.arms.X2 = !teme.every(finite) ? { ok: false, error: 'non-finite state', fit } : { ok: true, fit, temeSha256: sha256(JSON.stringify(teme.map((l) => [l.r, l.v]))), days: await score(teme, true) };
    }
  }

  // F2 and F3: propagator/ffm fitted by analysis/estimation on the same arc, the rows held as PLAN.md states (O) and F3's $DCL
  const held = driverRows(rows, D0);
  if (held.held.length) row.held = { from: held.held[0], to: held.held.at(-1), days: held.held.length };
  if (held.filled.length) row.filled = held.filled;
  const ffmArm = async (name, d) => {
    const a = await F.arm(o.norad, thin, epochs, held.rows, d);
    timing[name] = { fitMs: a.fitMs ?? null, forecastMs: a.forecastMs ?? null };
    if (!a.ok) return { ok: false, error: a.error, fit: a.fit ?? null };
    if (!a.states.every(finite)) return { ok: false, error: 'non-finite state', fit: a.fit };
    return { ok: true, fit: a.fit, gcrfSha256: sha256(JSON.stringify(a.states.map((s) => [s.r, s.v]))), days: await score(a.states, false) };
  };
  row.arms.F2 = await ffmArm('F2', null);
  row.arms.F3 = dcl.ok ? await ffmArm('F3', dcl.dcl) : { ok: false, error: `no $DCL: ${dcl.error}` };
  return { row, timing };
}

const m = await openModules();
let F = await openFfm();
const trapped = (x) => /RuntimeError|unreachable|out of bounds|memory access/i.test(String(x?.error ?? ''));
const run = async (w, registered = null) => {
  const t0 = Date.now();
  let out;
  try { out = await scoreWindow(m, F, w, registered); } catch (error) { out = { row: { group: w.group, key: w.key, norad: w.o.norad, cluster: w.o.cluster, cutoff: iso(w.cutoffMs), condition, error: String(error?.stack ?? error).slice(0, 600) }, timing: {} }; }
  const row = { ...out.row, build: build.modulesCommit.slice(0, 12), timing: { ...out.timing, wallSeconds: (Date.now() - t0) / 1000 } };
  // a module trap leaves the instance unusable: the next window gets fresh FFM modules
  if (trapped(row.arms?.F2) || trapped(row.arms?.F3)) { try { await F.close(); } catch { /* the trapped instance */ } F = await openFfm(); }
  return row;
};
const comparable = (r) => JSON.stringify({ ...r, timing: undefined, sources: undefined, build: undefined });

if (args.check) {
  const have = stored(condition);
  if (!have.size) { console.error('XM2 check: no rows under the store; the check cannot pass without them'); process.exit(1); }
  let bad = 0;
  for (const key of config.check.windows) {
    const old = have.get(key), w = windows().find((x) => x.key === key);
    if (!old || !w) { console.error(`XM2 check: ${key}: no stored row`); bad += 1; continue; }
    const now = await run(w);
    if (comparable(now) !== comparable(old)) { console.error(`XM2 check: ${key}: the re-run differs from the stored row`); bad += 1; } else console.error(`XM2 check: ${key} replayed exactly (${now.timing.wallSeconds} s)`);
    const differ = againstXm(now, XM.get(key));
    if (differ.length) { console.error(`XM2 check: ${key}: differs from XM's stored row in ${differ.join(', ')}`); bad += 1; }
  }
  await m.close(); await F.close();
  const { buildTable, sameAsCommitted } = await import('./table.mjs');
  if (!sameAsCommitted(buildTable())) { console.error('XM2 check: the table rebuilt from the stored rows differs from the committed table.json'); bad += 1; }
  console.error(bad ? `XM2 check: FAIL (${bad})` : 'XM2 check: PASS');
  process.exit(bad ? 1 : 0);
}

if (args.amend) {
  // amendment A1 (PLAN.md): the windows of this condition whose F arm propagator/ffm refused for a missing weather day; the F arms
  // rerun with the rows A1 prepares, P and X2 taken from the registered row; the same truth, arc, rows' days and $DCL required
  if (args.amend !== 'A1') throw new Error('--amend A1');
  const reg = stored(condition), file = path.join(rowsDir, `${condition}.A1.jsonl`);
  const doneA1 = new Set(readJsonl(file).map((r) => r.key));
  const refused = (x) => /space-weather-out-of-range/.test(String(x?.error ?? ''));
  const todo = windows().filter((w) => (!args.group || w.group === args.group) && reg.has(w.key) && !doneA1.has(w.key) && (refused(reg.get(w.key).arms?.F2) || refused(reg.get(w.key).arms?.F3)));
  const mineA1 = todo.filter((_, i) => i % n === k);
  for (const w of mineA1) {
    const old = reg.get(w.key);
    const row = await run(w, old);
    row.sources = sources;
    row.amendment = { id: 'A1', registered: { F2: { ok: old.arms?.F2?.ok ?? null, error: old.arms?.F2?.error ?? null }, F3: { ok: old.arms?.F3?.ok ?? null, error: old.arms?.F3?.error ?? null } } };
    const differ = row.error ? ['error'] : [...againstXm(row, XM.get(w.key)), ...['binEpochs', 'entered', condition, 'dca', 'arc'].filter((f) => !same(row[f], old[f]))];
    if (differ.length) row.defect = differ;
    appendJsonl(file, row);
    if (row.defect) {
      write(DEFECT, { key: row.key, condition, amendment: 'A1', defect: row.defect, error: row.error ?? null, at: new Date().toISOString(), shard: `${k}/${n}` });
      console.error(`XM2 A1 ${k}/${n}: ${row.key} differs in ${row.defect.join(', ')}: a software defect; stopping`);
      await m.close(); await F.close();
      process.exit(3);
    }
    console.error(`XM2 A1 ${k}/${n}: ${row.key} F2 ${row.arms?.F2?.ok} F3 ${row.arms?.F3?.ok} (${row.timing.wallSeconds} s)`);
  }
  console.error(`XM2 A1 ${k}/${n}: ${mineA1.length} windows`);
  await m.close(); await F.close();
  process.exit(0);
}

const all = windows(), done = stored(condition);
const mine = all.filter((w, i) => Math.floor(i / CHUNK) % n === k && !done.has(w.key));
const limit = args.limit ? Number(args.limit) : Infinity;
let count = 0;
for (const w of mine) {
  if (count >= limit) break;
  if (fs.existsSync(DEFECT)) { console.error(`XM2 shard ${k}/${n}: ${DEFECT} exists; stopping`); break; }
  const row = await run(w);
  row.sources = sources;
  const differ = row.error ? ['error'] : againstXm(row, XM.get(w.key));
  if (differ.length) row.defect = differ;
  appendJsonl(path.join(rowsDir, `${condition}.s${k}.jsonl`), row);
  if (row.defect) {
    write(DEFECT, { key: row.key, condition, defect: row.defect, error: row.error ?? null, at: new Date().toISOString(), shard: `${k}/${n}` });
    console.error(`XM2 shard ${k}/${n}: ${row.key} differs from XM's row in ${row.defect.join(', ')}: a software defect; stopping`);
    await m.close(); await F.close();
    process.exit(3);
  }
  count += 1;
  if (count % 5 === 0) console.error(`XM2 shard ${k}/${n}: ${count} of ${mine.length} windows (${new Date().toISOString()})`);
}
console.error(`XM2 shard ${k}/${n}: ${count} new windows`);
await m.close(); await F.close();
process.exit(0);
