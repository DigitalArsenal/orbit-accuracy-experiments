// XM6 runner (PLAN.md): the arms A12, A24, A36 and W72 in every window XM3 attempted F2 in under O (group P first). F2O and P are XM3's stored rows, read
// for pairing, after the proof reruns F2 through this code to equality. One JSON line per window under <store>/rows/O.s<k>.jsonl (statistics and fit
// records only; no states). XM5's run.mjs is the pattern. A difference from XM3's row is a software defect: the worker writes <store>/DEFECT.json and
// stops, and every worker stops before its next window while that file exists. Re-running skips windows already stored. Exploratory: PLAN.md.
//   node experiments/ffm-agom-prior-leo/run.mjs --proof        F2 at 72 h and 30 % on three windows, equal to XM3's rows: <store>/proof.json
//   node experiments/ffm-agom-prior-leo/run.mjs --launch 8     detached workers (at most 8), PIDs in <store>/logs/O.pids.json
//   node experiments/ffm-agom-prior-leo/run.mjs [--shard k/n] [--limit n] [--group P|S1]   score windows (committed sources only)
//   node experiments/ffm-agom-prior-leo/run.mjs --check        the E2E: config.check's arms rerun and compared exactly; the table rebuilt
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, store, dir, root, XM3, xm3Rows, gfzChecked, frozen, sourcesCommitted } from './common.mjs';

const { config: C3, args, readJsonl, appendJsonl, write, iso, ms, DAY, HOUR, build, daysOf, dateOf, isoWeek, sha256, rms } = XM3;

frozen();
const GROUPS = Object.keys(C3.groups);
const LEADS = C3.scoring.leadDays;
const GRID = C3.scoring.gridSeconds * 1000, MIN_BIN = C3.scoring.binMinimumEpochs;
const ARMS = config.arms, NAMES = Object.keys(ARMS);
const CHUNK = 6;
const rowsDir = path.join(store, 'rows'), logsDir = path.join(store, 'logs'), DEFECT = path.join(store, 'DEFECT.json'), PROOF = path.join(store, 'proof.json');
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
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
/** The stored rows by key; a flagged row is not stored for the runner, so its window is rerun (XM3's rule). */
const stored = () => new Map((fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => /^O\.s\d+\.jsonl$/.test(f)).sort() : []).flatMap((f) => readJsonl(path.join(rowsDir, f))).filter((r) => !r.defect).map((r) => [r.key, r]));

/** The proof's receipt: every window equal to XM3's, under the same run.mjs, common.mjs and lib/ffm.mjs. */
function proofChecked(sources) {
  if (!fs.existsSync(PROOF)) throw new Error(`run --proof before any arm (${PROOF})`);
  const s = JSON.parse(fs.readFileSync(PROOF, 'utf8'));
  if (s.windows.length !== config.proofArm.windows.length || !s.windows.every((w) => w.equal)) throw new Error(`${PROOF}: the proof is not equal to XM3's rows`);
  for (const f of ['run.mjs', 'common.mjs', 'lib/ffm.mjs']) if (s.sources[f] !== sources[f]) throw new Error(`${PROOF} ran under another ${f}; rerun --proof`);
}

if (args.launch) {
  const count = Math.min(config.workers, Number(args.launch) || config.workers);
  proofChecked(sourcesCommitted());
  if (fs.existsSync(DEFECT)) throw new Error(`${DEFECT} exists: resolve the defect first`);
  fs.mkdirSync(logsDir, { recursive: true });
  const pids = [];
  for (let i = 0; i < count; i += 1) {
    const log = fs.openSync(path.join(logsDir, `O.s${i}.log`), 'a');
    const child = spawn(process.execPath, ['--max-old-space-size=6144', path.join(dir, 'run.mjs'), '--shard', `${i}/${count}`, ...(args.group ? ['--group', args.group] : [])], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
    pids.push(child.pid);
  }
  const pidFile = path.join(logsDir, 'O.pids.json');
  write(pidFile, { started: new Date().toISOString(), group: args.group ?? 'all', pids, shards: count });
  console.error(`XM6: ${count} workers, PIDs ${pids.join(' ')} (${pidFile})`);
  process.exit(0);
}

const sources = sourcesCommitted();
const T = await import(path.join(root, C3.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, C3.xm.dir, 'lib/weather.mjs'));
gfzChecked(W);
const { openFfm, settingsFor, driverRows } = await import('./lib/ffm.mjs');
const { openModules } = await import(path.join(root, C3.xm.dir, 'lib/modules.mjs'));
const spacingSeconds = (lines) => {   // XM's
  const d = [];
  for (let i = 1; i < lines.length; i += 1) d.push(ms(lines[i].epoch) - ms(lines[i - 1].epoch));
  d.sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] / 1000 : null;
};

/** The differing fields against XM3's row: the truth's bins, the condition's rows and the held and filled days (XM3's amendment 1 span). */
function againstXm3(row) {
  const x = X3.get(row.key);
  if (!x) return ['no XM3 row'];
  if (row.error) return ['error'];
  const D0 = ms(row.cutoff), read = (days) => (days ?? []).filter((d) => { const t = Date.parse(`${d}T00:00:00Z`); return t >= D0 - 4 * DAY && t <= D0 + 8 * DAY; });
  const differ = config.guard.againstXm3.filter((f) => !same(row[f], x[f]));
  if (!same(read(row.filled), read(x.filled))) differ.push('filled');
  return differ;
}

/** An arm's fit settings: F2's (XM3's settingsFor), with the arm's prior sigma on AGOM (the last parameter). */
function settingsOf(norad, arm) {
  const s = settingsFor(norad);
  if (arm.agomPriorFraction != null) {
    const seed = s.parameters.find((p) => p.kind === 'SRP_AREA_OVER_MASS').value;
    if (s.parameters.at(-1).kind !== 'SRP_AREA_OVER_MASS') throw new Error('AGOM is not the last parameter');
    s.apriori[s.apriori.length - 1] = (arm.agomPriorFraction * seed) ** 2;
  }
  return s;
}

/** One window: the named arms on their arcs, XM3's rows and scorer for the rest (XM3's scoreWindow; PLAN.md, Arms). */
async function scoreWindow(m, F, w, arms) {
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
  const epochs = scored.map((l) => l.epoch), truth = scored.map((l) => ({ r: l.r, v: l.v }));
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

  // condition O's rows and XM3's drivers, the same for every arm
  const O = W.rowsO(D0 - 72 * HOUR - C3.conditions.rowsMarginDays * DAY, D0);
  row.O = O.excluded ? { excluded: O.excluded } : { rsga: O.rsga, c81: O.c81, lastObserved: O.lastObserved, rows: O.rows.length, first: O.rows[0]?.date, last: O.rows.at(-1)?.date };
  if (O.excluded) return { row, timing };
  const held = driverRows(O.rows, D0);
  if (held.held.length) row.held = { from: held.held[0], to: held.held.at(-1), days: held.held.length };
  if (held.filled.length) row.filled = held.filled;

  row.arms = {};
  for (const [name, arm] of arms) {
    const lines = T.series(o, D0 - arm.arcHours * HOUR, D0).lines;
    const step = spacingSeconds(lines);
    const coverage = step ? lines.length / ((arm.arcHours * 3600) / step) : 0;
    if (!(coverage >= C3.fit.minimumCoverage)) { row.arms[name] = { notRun: `arc coverage below ${C3.fit.minimumCoverage}`, arc: { coverage, stepSeconds: step } }; continue; }
    const thin = T.thinned(lines).chosen;
    const arc = { coverage, stepSeconds: step, states: thin.length, first: thin[0].epoch, last: thin.at(-1).epoch };
    const a = await F.arm(settingsOf(o.norad, arm), thin, epochs, held.rows);
    timing[name] = { fitMs: a.fitMs ?? null, forecastMs: a.forecastMs ?? null };
    if (!a.ok) row.arms[name] = { ok: false, error: a.error, arc, fit: a.fit ?? null };
    else if (!a.states.every(finite)) row.arms[name] = { ok: false, error: 'non-finite state', arc, fit: a.fit };
    else row.arms[name] = { ok: true, arc, fit: a.fit, gcrfSha256: sha256(JSON.stringify(a.states.map((s) => [s.r, s.v]))), days: await score(a.states) };
  }
  return { row, timing };
}

const m = await openModules();
let F = await openFfm();
const trapped = (x) => /RuntimeError|unreachable|out of bounds|memory access/i.test(String(x?.error ?? ''));
const run = async (w, arms) => {
  const t0 = Date.now();
  let out;
  try { out = await scoreWindow(m, F, w, arms); } catch (error) { out = { row: { group: w.group, key: w.key, norad: w.o.norad, cluster: w.o.cluster, cutoff: iso(w.cutoffMs), condition: 'O', error: String(error?.stack ?? error).slice(0, 600) }, timing: {} }; }
  const row = { ...out.row, build: build.modulesCommit.slice(0, 12), timing: { ...out.timing, wallSeconds: (Date.now() - t0) / 1000 } };
  // a module trap leaves the instance unusable: the next window gets fresh FFM modules
  if (Object.values(row.arms ?? {}).some(trapped)) { try { await F.close(); } catch { /* the trapped instance */ } F = await openFfm(); }
  return row;
};
const windowOf = (key) => windows().find((w) => w.key === key);
const finish = async (code) => { await m.close(); await F.close(); process.exit(code); };
const PROOF_ARMS = [['F72', { arcHours: config.proofArm.arcHours, agomPriorFraction: config.proofArm.agomPriorFraction }]];
/** The proof on one window: F2 through this code against XM3's stored row. */
async function proofOf(key) {
  const row = await run(windowOf(key), PROOF_ARMS);
  const x = X3.get(key), got = row.arms?.F72, differ = againstXm3(row);
  if (!same(got?.arc, x.arc)) differ.push('arc');
  const { arc, ...armOnly } = got ?? {};
  if (!same(armOnly, x.arms?.F2)) differ.push('F2');
  return { key, equal: !differ.length, differ, termination: got?.fit?.termination ?? null, rounds: got?.fit?.iterations ?? null, wallSeconds: row.timing.wallSeconds, error: row.error ?? null };
}

if (args.proof) {
  const out = [];
  for (const key of config.proofArm.windows) {
    const r = await proofOf(key);
    out.push(r);
    console.error(`XM6 proof ${out.length}: ${key} ${r.equal ? 'equals XM3' : `differs in ${r.differ.join(', ')}`} (${r.wallSeconds} s)`);
    if (!r.equal) { write(DEFECT, { key, proof: true, defect: r.differ, error: r.error, at: new Date().toISOString() }); await finish(3); }
  }
  write(PROOF, { at: new Date().toISOString(), sources, modulesCommit: build.modulesCommit, windows: out });
  console.error(`XM6 proof: ${out.length} of ${out.length} equal XM3's rows (${PROOF})`);
  await finish(0);
}

if (args.check) {
  const have = stored();
  if (!have.size) { console.error('XM6 check: no rows under the store; the check cannot pass without them'); await finish(1); }
  let bad = 0;
  for (const { key, arms } of config.check.windows) {
    const old = have.get(key), w = windowOf(key);
    if (!old || !w) { console.error(`XM6 check: ${key}: no stored row`); bad += 1; continue; }
    const now = await run(w, arms.map((a) => [a, ARMS[a]]));
    for (const a of arms) {
      if (!same(now.arms?.[a], old.arms?.[a])) { console.error(`XM6 check: ${key} ${a}: the rerun differs from the stored row`); bad += 1; } else console.error(`XM6 check: ${key} ${a} replayed exactly (${now.timing.wallSeconds} s; ${now.arms?.[a]?.fit?.termination ?? '-'} in ${now.arms?.[a]?.fit?.iterations ?? '-'} rounds)`);
    }
    const differ = againstXm3(now);
    if (differ.length) { console.error(`XM6 check: ${key}: differs from XM3's row in ${differ.join(', ')}`); bad += 1; }
  }
  for (const key of config.check.proof) {
    const r = await proofOf(key);
    if (!r.equal) { console.error(`XM6 check: ${key}: F2 through this code differs from XM3's row in ${r.differ.join(', ')}`); bad += 1; } else console.error(`XM6 check: ${key}: F2 through this code equals XM3's row (${r.wallSeconds} s)`);
  }
  await m.close(); await F.close();
  const { buildTable, sameAsCommitted } = await import('./table.mjs');
  if (!sameAsCommitted(await buildTable())) { console.error('XM6 check: the table rebuilt from the stored rows differs from the committed table.json'); bad += 1; }
  console.error(bad ? `XM6 check: FAIL (${bad})` : 'XM6 check: PASS');
  process.exit(bad ? 1 : 0);
}

proofChecked(sources);
const all = windows(), done = stored();
const mine = all.filter((w, i) => Math.floor(i / CHUNK) % n === k && !done.has(w.key) && (!args.group || w.group === args.group));
const limit = args.limit ? Number(args.limit) : Infinity;
const arms = NAMES.map((name) => [name, ARMS[name]]);
let count = 0;
for (const w of mine) {
  if (count >= limit) break;
  if (fs.existsSync(DEFECT)) { console.error(`XM6 shard ${k}/${n}: ${DEFECT} exists; stopping`); break; }
  const row = await run(w, arms);
  row.sources = sources;
  const differ = againstXm3(row);
  if (differ.length) row.defect = differ;
  appendJsonl(path.join(rowsDir, `O.s${k}.jsonl`), row);
  if (row.defect) {
    write(DEFECT, { key: row.key, defect: row.defect, error: row.error ?? null, at: new Date().toISOString(), shard: `${k}/${n}` });
    console.error(`XM6 shard ${k}/${n}: ${row.key} differs in ${row.defect.join(', ')}: a software defect; stopping`);
    await finish(3);
  }
  count += 1;
  if (count % 5 === 0) console.error(`XM6 shard ${k}/${n}: ${count} of ${mine.length} windows (${new Date().toISOString()})`);
}
console.error(`XM6 shard ${k}/${n}: ${count} new windows`);
await finish(0);
