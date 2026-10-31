// XM4 runner (PLAN.md): every registered window of XM3's groups (P first) through XM's P, rerun with XM's code at 2c7b326 and required
// equal to XM3's stored row, and through the K arms, flown as the console flies FFM-1, with no fit; one JSON line per window under
// <store>/rows/O.s<k>.jsonl (statistics only; no states). XM3's run.mjs (22313bf) is the pattern. Re-running skips windows already
// stored. A difference from XM3's row is a software defect: the worker writes <store>/DEFECT.json and stops, and every worker stops before
// its next window while that file exists.
//   node experiments/open-dca-ffm-regression/run.mjs --smoke          the checks on XM3's smoke window (no score): <store>/smoke.json
//   node experiments/open-dca-ffm-regression/run.mjs --launch 8       detached workers (at most 8), PIDs in <store>/logs/O.pids.json
//   node experiments/open-dca-ffm-regression/run.mjs [--shard k/n] [--limit n]   score windows (committed sources only)
//   node experiments/open-dca-ffm-regression/run.mjs --check          the E2E: config.check's windows re-run and compared exactly; the table
//                                                                     rebuilt against the committed table.json
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, store, args, dir, root, frozen, sourcesCommitted, readJsonl, appendJsonl, write, iso, ms, DAY, build, daysOf, dateOf, isoWeek, sha256, rms, comparable, xm3Rows } from './common.mjs';

frozen();
const GROUPS = Object.keys(config.groups);
const LEADS = config.scoring.leadDays;
const GRID = config.scoring.gridSeconds * 1000, MIN_BIN = config.scoring.binMinimumEpochs;
const CHUNK = 6;
const MAX_WORKERS = 8;
const ARMS = Object.entries(config.arms);
const rowsDir = path.join(store, 'rows'), logsDir = path.join(store, 'logs'), DEFECT = path.join(store, 'DEFECT.json'), SMOKE = path.join(store, 'smoke.json');
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const short = (e) => String(e?.message ?? e).slice(0, 240);   // XM's
const finite = (s) => [...s.r, ...s.v].every(Number.isFinite);

/** Every registered window, in group (P, then S1), object and cutoff order. */
export function windows() {
  const out = [];
  for (const group of GROUPS) for (const o of config.groups[group].objects) for (const t of daysOf(config.period.from, config.period.to)) out.push({ group, o, cutoffMs: t, key: `${group}|${o.norad}|${dateOf(t)}` });
  return out;
}
const stored = () => new Map((fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => /^O\.s\d+\.jsonl$/.test(f)).sort() : []).flatMap((f) => readJsonl(path.join(rowsDir, f))).map((r) => [r.key, r]));

if (args.launch) {
  const count = Math.min(MAX_WORKERS, Number(args.launch) || MAX_WORKERS);
  sourcesCommitted();
  xm3Rows();
  if (!fs.existsSync(SMOKE) || !JSON.parse(fs.readFileSync(SMOKE, 'utf8')).passed) throw new Error(`a passing --smoke comes before the first scored window (${SMOKE})`);
  if (fs.existsSync(DEFECT)) throw new Error(`${DEFECT} exists: resolve the defect first`);
  const { extraction } = await import(path.join(root, config.xm.dir, 'lib/public.mjs'));
  if (extraction().missing.length) throw new Error("XM's public extraction is incomplete");
  fs.mkdirSync(logsDir, { recursive: true });
  const pids = [];
  for (let i = 0; i < count; i += 1) {
    const log = fs.openSync(path.join(logsDir, `O.s${i}.log`), 'a');
    const child = spawn(process.execPath, ['--max-old-space-size=6144', path.join(dir, 'run.mjs'), '--shard', `${i}/${count}`], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
    pids.push(child.pid);
  }
  const pidFile = path.join(logsDir, 'O.pids.json');
  write(pidFile, { started: new Date().toISOString(), pids, shards: count });
  console.error(`XM4: ${count} workers, PIDs ${pids.join(' ')} (${pidFile})`);
  process.exit(0);
}

const sources = sourcesCommitted();
if (args.smoke) {
  const { smoke } = await import('./lib/smoke.mjs');
  const out = await smoke();
  write(SMOKE, { ...out, sources, at: new Date().toISOString() });
  console.error(`XM4 smoke: ${JSON.stringify({ passed: out.passed, cost: out.cost, checks: out.checks, k2MinusK1Km: out.k2MinusK1Km })}`);
  process.exit(out.passed ? 0 : 1);
}

if (!args.check && (!fs.existsSync(SMOKE) || !JSON.parse(fs.readFileSync(SMOKE, 'utf8')).passed)) throw new Error(`a passing --smoke comes before the first scored window (${SMOKE})`);
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const { publicSetAt, extraction } = await import(path.join(root, config.xm.dir, 'lib/public.mjs'));
if (extraction().missing.length) throw new Error("XM's public extraction is incomplete");
const { weatherAt, cachedDcl, recordAt, movedRecordAt } = await import('./lib/inputs.mjs');
const { openPath } = await import('./lib/ffm1.mjs');
const XM3 = xm3Rows();
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The fields of a window XM3 stored, compared with this run's: the differing fields. */
function againstXm3(row, x) {
  if (!x) return ['no XM3 row'];
  const fields = ['binEpochs', 'entered', 'excluded', 'P', 'O', 'dca'];
  if (row.arms) fields.push('held', 'filled');
  return fields.filter((f) => !same(row[f], x[f]));
}

/** One window: P as XM scores it, then the K arms (PLAN.md, Arms, Inputs, Groups, Decision rule). */
async function scoreWindow(m, flight, w) {
  const { o, group, cutoffMs: D0 } = w;
  const timing = {};
  const row = { group, key: w.key, norad: o.norad, name: o.name, cluster: o.cluster, cutoff: iso(D0), isoWeek: isoWeek(D0), condition: 'O' };
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

  // P: the public set at or before the cutoff under propagator/sgp4 (XM's)
  const set = publicSetAt(o.norad, D0);
  if (!set) row.P = { ok: false, notRun: 'no public set at or before the cutoff' };
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

  // the weather of the condition (XM's) and XM's answer for this cutoff (XM3's row.dca)
  const weather = weatherAt(D0);
  row.O = weather.info;
  const answer = cachedDcl(D0);
  row.dca = answer.ok ? { ok: true, sha256: answer.sha256 } : { ok: false, error: answer.error };
  // windows out of condition O, or below XM3's arc coverage, stay out of the K cells (PLAN.md), counted
  const arc = XM3.get(w.key)?.arc;
  if (weather.excluded || arc?.excluded) { row.out = weather.excluded ?? arc.excluded; return { row, timing }; }
  if (weather.held.length) row.held = { from: weather.held[0], to: weather.held.at(-1), days: weather.held.length };
  if (weather.filled.length) row.filled = weather.filled;
  row.arms = {};
  if (!set) { for (const [name] of ARMS) row.arms[name] = { ok: false, notRun: 'no public set at or before the cutoff' }; return { row, timing }; }

  // the record K2 reads and K3's
  const read = recordAt(D0), moved = movedRecordAt(D0);
  row.record = { issue: iso(read.issueMs), ageDays: read.ageDays, sha256: read.sha256 };
  row.k3 = { from: iso(moved.fromMs), issue: iso(moved.issueMs), ageDays: moved.ageDays, shiftDays: moved.shiftDays, sha256: moved.sha256 };

  // one seed, one B and one AGOM per window; only the listed input differs
  const seed = await flight.seed(set, o.norad, D0);
  if (!seed.ok) { for (const [name] of ARMS) row.arms[name] = { ok: false, error: seed.error }; return { row, timing }; }
  row.seed = { bstar: set.elements.BSTAR, fixedSha256: sha256(JSON.stringify(seed.fixed)) };
  for (const [name, spec] of ARMS) {
    const framed = spec.record === 'read' ? read.framed : spec.record === 'moved' ? moved.framed : null;
    const a = await flight.fly({ D0, objects: [{ fixed: seed.fixed, bstar: set.elements.BSTAR }], recordBytes: flight.records(D0, weather.forms[spec.rows], framed), epochsMs });
    timing[name] = { setupMs: a.setupMs ?? null, coverageMs: a.coverageMs ?? null };
    if (!a.ok) { row.arms[name] = { ok: false, error: a.error }; continue; }
    row.seed.dragAreaOverMass ??= a.dragAreaOverMass;
    row.arms[name] = { ok: true, gcrfSha256: sha256(JSON.stringify(a.states.map((s) => [s.r, s.v]))), days: await score(a.states, false) };
  }
  return { row, timing };
}

const m = await openModules();
const flight = await openPath();
const run = async (w) => {
  const t0 = Date.now();
  let out;
  try { out = await scoreWindow(m, flight, w); } catch (error) { out = { row: { group: w.group, key: w.key, norad: w.o.norad, cluster: w.o.cluster, cutoff: iso(w.cutoffMs), condition: 'O', error: String(error?.stack ?? error).slice(0, 600) }, timing: {} }; }
  return { ...out.row, build: build.modulesCommit.slice(0, 12), timing: { ...out.timing, wallSeconds: (Date.now() - t0) / 1000 } };
};

if (args.check) {
  const have = stored();
  if (!have.size) { console.error('XM4 check: no rows under the store; the check cannot pass without them'); process.exit(1); }
  let bad = 0;
  for (const key of config.check.windows) {
    const old = have.get(key), w = windows().find((x) => x.key === key);
    if (!old || !w) { console.error(`XM4 check: ${key}: no stored row`); bad += 1; continue; }
    const now = await run(w);
    if (comparable(now) !== comparable(old)) { console.error(`XM4 check: ${key}: the re-run differs from the stored row`); bad += 1; } else console.error(`XM4 check: ${key} replayed exactly (${now.timing.wallSeconds} s; record of ${now.record?.issue ?? '-'})`);
    const differ = againstXm3(now, XM3.get(key));
    if (differ.length) { console.error(`XM4 check: ${key}: differs from XM3's stored row in ${differ.join(', ')}`); bad += 1; }
  }
  await m.close();
  const { buildTable, sameAsCommitted } = await import('./table.mjs');
  if (!sameAsCommitted(buildTable())) { console.error('XM4 check: the table rebuilt from the stored rows differs from the committed table.json'); bad += 1; }
  console.error(bad ? `XM4 check: FAIL (${bad})` : 'XM4 check: PASS');
  process.exit(bad ? 1 : 0);
}

const all = windows(), done = stored();
const mine = all.filter((w, i) => Math.floor(i / CHUNK) % n === k && !done.has(w.key));
const limit = args.limit ? Number(args.limit) : Infinity;
let count = 0;
for (const w of mine) {
  if (count >= limit) break;
  if (fs.existsSync(DEFECT)) { console.error(`XM4 shard ${k}/${n}: ${DEFECT} exists; stopping`); break; }
  const row = await run(w);
  row.sources = sources;
  const differ = row.error ? ['error'] : againstXm3(row, XM3.get(row.key));
  if (differ.length) row.defect = differ;
  appendJsonl(path.join(rowsDir, `O.s${k}.jsonl`), row);
  if (row.defect) {
    write(DEFECT, { key: row.key, defect: row.defect, error: row.error ?? null, at: new Date().toISOString(), shard: `${k}/${n}` });
    console.error(`XM4 shard ${k}/${n}: ${row.key} differs from XM3's row in ${row.defect.join(', ')}: a software defect; stopping`);
    await m.close();
    process.exit(3);
  }
  count += 1;
  if (count % 5 === 0) console.error(`XM4 shard ${k}/${n}: ${count} of ${mine.length} windows (${new Date().toISOString()})`);
}
console.error(`XM4 shard ${k}/${n}: ${count} new windows`);
await m.close();
process.exit(0);
