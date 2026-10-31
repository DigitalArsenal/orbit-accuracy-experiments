// XM5 runner (PLAN.md): F2 on condition M's rows in every window XM3 attempted F2 under O (group P first); P and F2 under O are XM3's stored
// rows, read for pairing, after the sample reruns them to equality. One JSON line per window under <store>/rows/M.s<k>.jsonl (statistics
// and fit records only; no states). XM3's run.mjs (3af42a8, ee2a513) is the pattern; its scoreWindow is copied with X2 and F3 out, P under O
// only and F2 unchanged. A difference from XM3's or XM's row is a software defect: the worker writes <store>/DEFECT.json and stops, and
// every worker stops before its next window while that file exists. Re-running skips windows already stored.
//   node experiments/ffm-tail-cause/run.mjs --sample       the 12 windows under O, equal to XM3's rows, before any M window: <store>/sample.json
//   node experiments/ffm-tail-cause/run.mjs --launch 8     detached workers (at most 8), PIDs in <store>/logs/M.pids.json
//   node experiments/ffm-tail-cause/run.mjs [--shard k/n] [--limit n]   score windows under M (committed sources only)
//   node experiments/ffm-tail-cause/run.mjs --check        the E2E: config.check's windows rerun and compared exactly; the table rebuilt
//                                                          against the committed table.json
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, store, dir, root, XM3, frozen, sourcesCommitted, xm3Rows, gfzChecked } from './common.mjs';

const { config: C3, args, readJsonl, appendJsonl, write, iso, ms, DAY, HOUR, build, daysOf, dateOf, isoWeek, sha256, rms, comparable, xmRows } = XM3;

frozen();
const GROUPS = Object.keys(C3.groups);
const LEADS = C3.scoring.leadDays;
const GRID = C3.scoring.gridSeconds * 1000, MIN_BIN = C3.scoring.binMinimumEpochs;
const ARC = C3.fit.arcHours;
const CHUNK = 6;
const rowsDir = path.join(store, 'rows'), logsDir = path.join(store, 'logs'), DEFECT = path.join(store, 'DEFECT.json'), SAMPLE = path.join(store, 'sample.json');
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const short = (e) => String(e?.message ?? e).slice(0, 240);   // XM's
const finite = (s) => [...s.r, ...s.v].every(Number.isFinite);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const X3 = await xm3Rows();
/** Every window XM3 attempted F2 in under O, in XM3's order: group (P, then S1), object, cutoff. */
function windows() {
  const out = [];
  for (const group of GROUPS) for (const o of C3.groups[group].objects) for (const t of daysOf(C3.period.from, C3.period.to)) {
    const key = `${group}|${o.norad}|${dateOf(t)}`, x = X3.get(key);
    if (x?.arms?.F2 && !x.arms.F2.notRun) out.push({ group, o, cutoffMs: t, key });
  }
  return out;
}
/** The stored M rows by key; a flagged row is not stored for the runner, so its window is rerun (XM3's rule). */
const stored = () => new Map((fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => /^M\.s\d+\.jsonl$/.test(f)).sort() : []).flatMap((f) => readJsonl(path.join(rowsDir, f))).filter((r) => !r.defect).map((r) => [r.key, r]));

/** The sample's receipt: every window equal to XM3's, under the same run.mjs and common.mjs. */
function sampleChecked(sources) {
  if (!fs.existsSync(SAMPLE)) throw new Error(`run --sample before any M window (${SAMPLE})`);
  const s = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
  if (s.windows.length !== config.sample.xm3Check.length + config.sample.hashed.length || !s.windows.every((w) => w.equal)) throw new Error(`${SAMPLE}: the sample is not equal to XM3's rows`);
  for (const f of ['run.mjs', 'common.mjs']) if (s.sources[f] !== sources[f]) throw new Error(`${SAMPLE} ran under another ${f}; rerun --sample`);
}

if (args.launch) {
  const count = Math.min(config.workers, Number(args.launch) || config.workers);
  sampleChecked(sourcesCommitted());
  if (fs.existsSync(DEFECT)) throw new Error(`${DEFECT} exists: resolve the defect first`);
  fs.mkdirSync(logsDir, { recursive: true });
  const pids = [];
  for (let i = 0; i < count; i += 1) {
    const log = fs.openSync(path.join(logsDir, `M.s${i}.log`), 'a');
    const child = spawn(process.execPath, ['--max-old-space-size=6144', path.join(dir, 'run.mjs'), '--shard', `${i}/${count}`], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
    pids.push(child.pid);
  }
  const pidFile = path.join(logsDir, 'M.pids.json');
  write(pidFile, { started: new Date().toISOString(), condition: 'M', pids, shards: count });
  console.error(`XM5 M: ${count} workers, PIDs ${pids.join(' ')} (${pidFile})`);
  process.exit(0);
}

const sources = sourcesCommitted();
const T = await import(path.join(root, C3.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, C3.xm.dir, 'lib/weather.mjs'));
gfzChecked(W);
const { openFfm, driverRows } = await import(path.join(root, config.xm3.dir, 'lib/ffm.mjs'));
const XM = xmRows();
const { openModules } = await import(path.join(root, C3.xm.dir, 'lib/modules.mjs'));
const { publicSetAt, extraction } = await import(path.join(root, C3.xm.dir, 'lib/public.mjs'));
if (extraction().missing.length) throw new Error("XM's public extraction is incomplete");
const spacingSeconds = (lines) => {   // XM's
  const d = [];
  for (let i = 1; i < lines.length; i += 1) d.push(ms(lines[i].epoch) - ms(lines[i - 1].epoch));
  d.sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] / 1000 : null;
};

/** Condition O (the sample and the check): the differing fields against XM3's row. The filled days are compared on the days propagator/ffm
 *  reads, D0 - 4 through D0 + 8 (XM3's amendment 1). */
function againstO(row) {
  const x = X3.get(row.key);
  if (!x) return ['no XM3 row'];
  const D0 = ms(row.cutoff), read = (days) => (days ?? []).filter((d) => { const t = Date.parse(`${d}T00:00:00Z`); return t >= D0 - 4 * DAY && t <= D0 + 8 * DAY; });
  const differ = ['binEpochs', 'entered', 'excluded', 'P', 'O', 'arc', 'held'].filter((f) => !same(row[f], x[f]));
  if (!same(read(row.filled), read(x.filled))) differ.push('filled');
  if (!same(row.arms?.F2, x.arms?.F2)) differ.push('F2');
  return differ;
}

/** Condition M: the differing fields against XM3's row (the truth's bins and the arc) and XM's stored M row (the rows' count and span). */
function againstM(row) {
  const x = X3.get(row.key);
  if (!x) return ['no XM3 row'];
  const differ = config.guard.againstXm3.filter((f) => !same(row[f], x[f]));
  for (const f of config.guard.againstXm) if (!same(row[f], XM.get(row.key)?.[f])) differ.push(f);
  return differ;
}
const against = (row) => (row.error ? ['error'] : row.condition === 'O' ? againstO(row) : againstM(row));

/** One window under one condition: F2, and under O XM's P (XM3's scoreWindow; PLAN.md, Arms, Weather). */
async function scoreWindow(m, F, w, condition) {
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
  /** e per lead of GCRF states (km), or of TEME states taken to GCRF by foundation/frames as XM takes P. */
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

  // P, under O only: the public set at or before the cutoff under propagator/sgp4 (XM's). Under M it is XM3's stored P.
  if (condition === 'O') {
    const set = publicSetAt(o.norad, D0);
    if (!set) row.P = { ok: false, notRun: 'no public set at or before the cutoff' };
    else {
      const p = { setEpoch: set.epoch, setCreation: set.creationDate, gpId: set.gpId };
      let states = null;
      try { states = await m.propagateSgp4(set, o.norad, epochsMs, C3.scoring.gridSeconds); } catch (error) { row.P = { ok: false, error: `propagator/sgp4: ${short(error)}`, ...p }; }
      if (states) {
        const missing = states.filter((s) => s == null).length;
        if (missing) throw new Error(`propagator/sgp4 answered no state at ${missing} of ${states.length} scored epochs (grid)`);
        row.P = states.every(finite) ? { ok: true, ...p, days: await score(states, true) } : { ok: false, error: 'non-finite state', ...p };
      }
    }
  }

  // the condition's rows (XM's)
  const from = D0 - 72 * HOUR - C3.conditions.rowsMarginDays * DAY;
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

  // the 72 h arc (XM's)
  const lines = T.series(o, D0 - ARC * HOUR, D0).lines;
  const step = spacingSeconds(lines);
  const coverage = step ? lines.length / ((ARC * 3600) / step) : 0;
  if (!(coverage >= C3.fit.minimumCoverage)) { row.arc = { coverage, stepSeconds: step, excluded: `arc coverage below ${C3.fit.minimumCoverage}` }; return { row, timing }; }
  const thin = T.thinned(lines).chosen;
  row.arc = { coverage, stepSeconds: step, states: thin.length, first: thin[0].epoch, last: thin.at(-1).epoch };
  row.arms = {};
  if (notRun) { row.arms.F2 = { ok: false, notRun }; return { row, timing }; }

  // F2: propagator/ffm fitted by analysis/estimation 0.7.0 on the arc, the drivers as XM3 registered them (hold-last and A1)
  const held = driverRows(rows, D0);
  if (held.held.length) row.held = { from: held.held[0], to: held.held.at(-1), days: held.held.length };
  if (held.filled.length) row.filled = held.filled;
  const a = await F.arm(o.norad, thin, epochs, held.rows, null);
  timing.F2 = { fitMs: a.fitMs ?? null, forecastMs: a.forecastMs ?? null };
  if (!a.ok) row.arms.F2 = { ok: false, error: a.error, fit: a.fit ?? null };
  else if (!a.states.every(finite)) row.arms.F2 = { ok: false, error: 'non-finite state', fit: a.fit };
  else row.arms.F2 = { ok: true, fit: a.fit, gcrfSha256: sha256(JSON.stringify(a.states.map((s) => [s.r, s.v]))), days: await score(a.states, false) };
  return { row, timing };
}

const m = await openModules();
let F = await openFfm();
const trapped = (x) => /RuntimeError|unreachable|out of bounds|memory access/i.test(String(x?.error ?? ''));
const run = async (w, condition) => {
  const t0 = Date.now();
  let out;
  try { out = await scoreWindow(m, F, w, condition); } catch (error) { out = { row: { group: w.group, key: w.key, norad: w.o.norad, cluster: w.o.cluster, cutoff: iso(w.cutoffMs), condition, error: String(error?.stack ?? error).slice(0, 600) }, timing: {} }; }
  const row = { ...out.row, build: build.modulesCommit.slice(0, 12), timing: { ...out.timing, wallSeconds: (Date.now() - t0) / 1000 } };
  // a module trap leaves the instance unusable: the next window gets fresh FFM modules
  if (trapped(row.arms?.F2)) { try { await F.close(); } catch { /* the trapped instance */ } F = await openFfm(); }
  return row;
};
const windowOf = (key) => windows().find((w) => w.key === key);
const finish = async (code) => { await m.close(); await F.close(); process.exit(code); };

if (args.sample) {
  const out = [];
  for (const key of [...config.sample.xm3Check, ...config.sample.hashed]) {
    const w = windowOf(key);
    if (!w) throw new Error(`the sample window ${key} is not eligible`);
    const row = await run(w, 'O');
    const differ = against(row);
    out.push({ key, equal: !differ.length, differ, termination: row.arms?.F2?.fit?.termination ?? null, rounds: row.arms?.F2?.fit?.iterations ?? null, wallSeconds: row.timing.wallSeconds });
    console.error(`XM5 sample ${out.length}: ${key} ${differ.length ? `differs in ${differ.join(', ')}` : 'equals XM3'} (${row.timing.wallSeconds} s)`);
    if (differ.length) {
      write(DEFECT, { key, condition: 'O', defect: differ, error: row.error ?? null, at: new Date().toISOString() });
      await finish(3);
    }
  }
  write(SAMPLE, { at: new Date().toISOString(), sources, modulesCommit: build.modulesCommit, windows: out });
  console.error(`XM5 sample: ${out.length} of ${out.length} equal XM3's rows (${SAMPLE})`);
  await finish(0);
}

if (args.check) {
  const have = stored();
  if (!have.size) { console.error('XM5 check: no rows under the store; the check cannot pass without them'); await finish(1); }
  let bad = 0;
  for (const key of config.check.M) {
    const old = have.get(key), w = windowOf(key);
    if (!old || !w) { console.error(`XM5 check: ${key}: no stored row`); bad += 1; continue; }
    const now = await run(w, 'M');
    if (comparable(now) !== comparable(old)) { console.error(`XM5 check: ${key}: the rerun under M differs from the stored row`); bad += 1; } else console.error(`XM5 check: ${key} replayed exactly under M (${now.timing.wallSeconds} s; F2 ${now.arms?.F2?.fit?.termination ?? '-'} in ${now.arms?.F2?.fit?.iterations ?? '-'} rounds)`);
    const differ = against(now);
    if (differ.length) { console.error(`XM5 check: ${key}: differs from XM3's or XM's row in ${differ.join(', ')}`); bad += 1; }
  }
  for (const key of config.check.O) {
    const now = await run(windowOf(key), 'O');
    const differ = against(now);
    if (differ.length) { console.error(`XM5 check: ${key}: under O differs from XM3's row in ${differ.join(', ')}`); bad += 1; } else console.error(`XM5 check: ${key} equals XM3's row under O (${now.timing.wallSeconds} s)`);
  }
  await m.close(); await F.close();
  const { buildTable, sameAsCommitted } = await import('./table.mjs');
  if (!sameAsCommitted(await buildTable())) { console.error('XM5 check: the table rebuilt from the stored rows differs from the committed table.json'); bad += 1; }
  console.error(bad ? `XM5 check: FAIL (${bad})` : 'XM5 check: PASS');
  process.exit(bad ? 1 : 0);
}

sampleChecked(sources);
const all = windows(), done = stored();
const mine = all.filter((w, i) => Math.floor(i / CHUNK) % n === k && !done.has(w.key));
const limit = args.limit ? Number(args.limit) : Infinity;
let count = 0;
for (const w of mine) {
  if (count >= limit) break;
  if (fs.existsSync(DEFECT)) { console.error(`XM5 shard ${k}/${n}: ${DEFECT} exists; stopping`); break; }
  const row = await run(w, 'M');
  row.sources = sources;
  const differ = against(row);
  if (differ.length) row.defect = differ;
  appendJsonl(path.join(rowsDir, `M.s${k}.jsonl`), row);
  if (row.defect) {
    write(DEFECT, { key: row.key, condition: 'M', defect: row.defect, error: row.error ?? null, at: new Date().toISOString(), shard: `${k}/${n}` });
    console.error(`XM5 shard ${k}/${n}: ${row.key} differs in ${row.defect.join(', ')}: a software defect; stopping`);
    await finish(3);
  }
  count += 1;
  if (count % 5 === 0) console.error(`XM5 shard ${k}/${n}: ${count} of ${mine.length} windows (${new Date().toISOString()})`);
}
console.error(`XM5 shard ${k}/${n}: ${count} new windows`);
await finish(0);
