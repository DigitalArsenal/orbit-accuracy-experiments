// XM-fast runner (PLAN.md): every registered window (group, object, cutoff) through P and, for the 72 h and 24 h arcs,
// X0 and X2 and X3 under conditions O and M; one JSON line per window under <store>/rows/s<k>.jsonl (statistics and fitted
// parameters only; no states). Re-running skips windows already present.
//   node experiments/xp-atmosphere-merit/run.mjs --launch 8 [--prep public]   detached workers, PIDs in <store>/logs/<tag>.pids.json
//   node experiments/xp-atmosphere-merit/run.mjs --prep public [--shard k/n]  the Space-Track sets of the objects, by creation day
//   node experiments/xp-atmosphere-merit/run.mjs [--shard k/n] [--limit n]    score windows (committed sources only)
//   node experiments/xp-atmosphere-merit/run.mjs --dev <key>                  one window printed, nothing stored (development)
//   node experiments/xp-atmosphere-merit/run.mjs --check                      the E2E: the pinned windows of config.check re-run and
//                                                                             compared exactly; the table rebuilt against table.json
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, store, args, dir, root, frozen, sourcesCommitted, readJsonl, appendJsonl, write, iso, ms, DAY, HOUR, build, daysOf, dateOf, isoWeek, sha256, rms } from './common.mjs';

frozen();
const GROUPS = Object.keys(config.groups);
const LEADS = config.scoring.leadDays;
const GRID = config.scoring.gridSeconds * 1000, MIN_BIN = config.scoring.binMinimumEpochs;
const ARCS = [config.fit.arcsHours.primary, config.fit.arcsHours.secondary];
const CHUNK = 6;
const rowsDir = path.join(store, 'rows'), logsDir = path.join(store, 'logs');
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const short = (e) => String(e?.message ?? e).slice(0, 240);

/** Every registered window, in group, object and cutoff order. */
export function windows() {
  const out = [];
  for (const group of GROUPS) for (const o of config.groups[group].objects) for (const t of daysOf(config.period.from, config.period.to)) out.push({ group, o, cutoffMs: t, key: `${group}|${o.norad}|${dateOf(t)}` });
  return out;
}
const stored = () => new Map((fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => f.endsWith('.jsonl')).sort() : []).flatMap((f) => readJsonl(path.join(rowsDir, f))).map((r) => [r.key, r]));

if (args.launch) {
  const count = Math.min(8, Number(args.launch) || 8);
  const tag = args.prep ? `prep-${args.prep}` : 'score';
  if (!args.prep) {
    sourcesCommitted();
    const { extraction } = await import('./lib/public.mjs');
    const x = extraction();
    if (x.missing.length) throw new Error(`the public extraction lacks ${x.missing.length} of ${x.days} days`);
  }
  fs.mkdirSync(logsDir, { recursive: true });
  const pids = [];
  for (let i = 0; i < count; i += 1) {
    const log = fs.openSync(path.join(logsDir, `${tag}.s${i}.log`), 'a');
    const child = spawn(process.execPath, ['--max-old-space-size=6144', path.join(dir, 'run.mjs'), ...(args.prep ? ['--prep', args.prep] : []), '--shard', `${i}/${count}`], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
    pids.push(child.pid);
  }
  write(path.join(logsDir, `${tag}.pids.json`), { started: new Date().toISOString(), tag, pids, shards: count });
  console.error(`XM-fast ${tag}: ${count} workers, PIDs ${pids.join(' ')} (${path.join(logsDir, `${tag}.pids.json`)})`);
  process.exit(0);
}

if (args.prep === 'public') {
  const { extract, extraction } = await import('./lib/public.mjs');
  extract([...new Set(GROUPS.flatMap((g) => config.groups[g].objects.map((o) => o.norad)))], k, n);
  console.error(`XM-fast prep public shard ${k}/${n}: ${JSON.stringify({ ...extraction(), missing: extraction().missing.length })}`);
  process.exit(0);
}

const sources = args.dev ? null : sourcesCommitted();
const { openModules } = await import('./lib/modules.mjs');
const S = await import('./lib/sds.mjs');
const T = await import('./lib/truth.mjs');
const W = await import('./lib/weather.mjs');
const { dclAt } = await import('./lib/dca.mjs');
const { publicSetAt, extraction } = await import('./lib/public.mjs');
if (extraction().missing.length) throw new Error('the public extraction is incomplete: run --prep public first');

const pcfOf = (name) => S.pcfBytes({ forces: config.arms[name].forces, fit: { dragPrior: config.fit.dragPrior, srpPrior: config.fit.srpPrior } });
const PCF = Object.fromEntries(['X0', 'X2', 'X3'].map((a) => [a, pcfOf(a)]));
const finite = (s) => [...s.r, ...s.v].every(Number.isFinite);
const spacingSeconds = (lines) => {
  const d = [];
  for (let i = 1; i < lines.length; i += 1) d.push(ms(lines[i].epoch) - ms(lines[i - 1].epoch));
  d.sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] / 1000 : null;
};
const dclInfo = (d) => (d.ok ? { ok: true, arcs: d.arcs, doves: d.doves, supportedTo: iso(d.supportedToMs), nodes: d.nodes, sha256: d.sha256 } : { ok: false, error: d.error });

/** One window through P and every arm of both arcs (PLAN.md, Arms, Fit, Conditions, Scoring). */
export async function scoreWindow(m, w) {
  const { o, group, cutoffMs: D0 } = w;
  const timing = { fitMs: {} };
  const row = { group, key: w.key, norad: o.norad, name: o.name, cluster: o.cluster, cutoff: iso(D0), isoWeek: isoWeek(D0) };
  // the truth after the cutoff: the 300 s grid and the lead bins, decided by the truth alone
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
    const errors = await m.rtn(await m.toAxes(states, epochs, 'GCRF'), truth);
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

  // P: the public set at or before the cutoff under propagator/sgp4
  const set = publicSetAt(o.norad, D0);
  if (!set) row.P = { ok: false, notRun: 'no public set at or before the cutoff' };
  else {
    const p = { setEpoch: set.epoch, setCreation: set.creationDate, gpId: set.gpId };
    let states = null;
    try { states = await m.propagateSgp4(set, o.norad, epochsMs, config.scoring.gridSeconds); } catch (error) { row.P = { ok: false, error: `propagator/sgp4: ${short(error)}`, ...p }; }
    if (states) {
      const missing = states.filter((s) => s == null).length;
      if (missing) throw new Error(`propagator/sgp4 answered no state at ${missing} of ${states.length} scored epochs (grid)`);
      row.P = states.every(finite) ? { ok: true, ...p, days: await score(states) } : { ok: false, error: 'non-finite state', ...p };
    }
  }

  // the conditions' rows and $DCL
  const from = D0 - 72 * HOUR - config.conditions.rowsMarginDays * DAY;
  const O = W.rowsO(from, D0), M = W.rowsM(from, epochsMs.at(-1) + DAY);
  row.O = O.excluded ? { excluded: O.excluded } : { rsga: O.rsga, c81: O.c81, lastObserved: O.lastObserved, rows: O.rows.length, first: O.rows[0]?.date, last: O.rows.at(-1)?.date };
  row.M = { rows: M.rows.length, first: M.rows[0]?.date, last: M.rows.at(-1)?.date };
  const spw = { O: O.excluded ? null : S.spwBytes(O.rows), M: S.spwBytes(M.rows) };
  const dcl = {};
  for (const c of ['O', 'M']) dcl[c] = await dclAt(m, Math.round(D0 + config.conditions[c].dclIssueOffsetHours * HOUR));
  row.dca = { O: dclInfo(dcl.O), M: dclInfo(dcl.M) };

  /** An X arm: fit on the block, then the set propagated with the same $PCF and inputs and scored. */
  const arm = async (arc, oem, name, extra) => {
    const f = await m.fit(oem, PCF[name], extra);
    timing.fitMs[`${arc}|${name}|${extra?.rows === spw.O ? 'O' : extra ? 'M' : '-'}`] = f.fitMs;
    if (!f.ok) return { ok: false, error: f.error };
    const info = S.readFitOmm(f.omm), obd = S.readObd(f.obd);
    const fit = { epoch: info.epoch, bterm: info.bterm, agom: info.agom, fitRmsKm: info.fitRmsKm, iterations: info.iterations, states: info.states, wrmsKm: obd.wrmsKm, sigmaLnB: obd.sigmaLnB, priorLimited: obd.priorLimited };
    let lines;
    try { lines = await m.propagate(f.omm, S.gridBytes(epochs), PCF[name], extra, epochs.length); } catch (error) { return { ok: false, error: short(error), fit }; }
    if (!lines.every(finite)) return { ok: false, error: 'non-finite state', fit };
    return { ok: true, fit, temeSha256: sha256(JSON.stringify(lines.map((l) => [l.r, l.v]))), days: await score(lines) };
  };
  row.arcs = {};
  for (const A of ARCS) {
    const lines = T.series(o, D0 - A * HOUR, D0).lines;
    const step = spacingSeconds(lines);
    const coverage = step ? lines.length / ((A * 3600) / step) : 0;
    if (!(coverage >= config.fit.minimumCoverage)) { row.arcs[A] = { coverage, stepSeconds: step, excluded: `arc coverage below ${config.fit.minimumCoverage}` }; continue; }
    const thin = T.thinned(lines).chosen;
    const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
    const res = { coverage, stepSeconds: step, states: thin.length, first: thin[0].epoch, last: thin.at(-1).epoch, arms: {} };
    res.arms.X0 = await arm(A, oem, 'X0', null);
    for (const c of ['O', 'M']) {
      if (!spw[c]) { res.arms[`X2${c}`] = { ok: false, notRun: row.O.excluded }; res.arms[`X3${c}`] = { ok: false, notRun: row.O.excluded }; continue; }
      res.arms[`X2${c}`] = await arm(A, oem, 'X2', { rows: spw[c] });
      res.arms[`X3${c}`] = dcl[c].ok ? await arm(A, oem, 'X3', { rows: spw[c], dcl: dcl[c].dcl }) : { ok: false, error: `no $DCL: ${dcl[c].error}` };
    }
    row.arcs[A] = res;
  }
  return { row, timing };
}

const m = await openModules();
const run = async (w) => {
  const t0 = Date.now();
  let out;
  try { out = await scoreWindow(m, w); } catch (error) { out = { row: { group: w.group, key: w.key, norad: w.o.norad, cluster: w.o.cluster, cutoff: iso(w.cutoffMs), error: String(error?.stack ?? error).slice(0, 600) }, timing: {} }; }
  return { ...out.row, build: build.modulesCommit.slice(0, 12), timing: { ...out.timing, wallSeconds: (Date.now() - t0) / 1000 } };
};
const comparable = (r) => JSON.stringify({ ...r, timing: undefined, sources: undefined, build: undefined });

if (args.dev) {
  const w = windows().find((x) => x.key === args.dev);
  if (!w) throw new Error(`no window ${args.dev}`);
  console.log(JSON.stringify(await run(w), null, 1));
  await m.close();
  process.exit(0);
}

if (args.check) {
  const have = stored();
  if (!have.size) { console.error('XM-fast check: no rows under the store; the check cannot pass without them'); process.exit(1); }
  let bad = 0;
  for (const key of config.check.windows) {
    const old = have.get(key), w = windows().find((x) => x.key === key);
    if (!old || !w) { console.error(`XM-fast check: ${key}: no stored row`); bad += 1; continue; }
    const now = await run(w);
    if (comparable(now) !== comparable(old)) { console.error(`XM-fast check: ${key}: the re-run differs from the stored row`); bad += 1; } else console.error(`XM-fast check: ${key} replayed exactly (${now.timing.wallSeconds} s)`);
  }
  await m.close();
  const { buildTable, sameAsCommitted } = await import('./table.mjs');
  if (!sameAsCommitted(buildTable([...have.values()]))) { console.error('XM-fast check: the table rebuilt from the stored rows differs from the committed table.json'); bad += 1; }
  console.error(bad ? `XM-fast check: FAIL (${bad})` : 'XM-fast check: PASS');
  process.exit(bad ? 1 : 0);
}

const all = windows(), done = stored();
const mine = all.filter((w, i) => Math.floor(i / CHUNK) % n === k && !done.has(w.key));
const limit = args.limit ? Number(args.limit) : Infinity;
let count = 0;
for (const w of mine) {
  if (count >= limit) break;
  const row = await run(w);
  row.sources = sources;
  appendJsonl(path.join(rowsDir, `s${k}.jsonl`), row);
  count += 1;
  if (count % 10 === 0) console.error(`XM-fast shard ${k}/${n}: ${count} of ${mine.length} windows (${new Date().toISOString()})`);
}
console.error(`XM-fast shard ${k}/${n}: ${count} new windows`);
await m.close();
process.exit(0);
