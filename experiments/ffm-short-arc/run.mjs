// FSA runner (PLAN.md): one window, every arm, module calls only; JavaScript moves FlatBuffers, reads truth by XM's code and does
// statistics. Rows: <store>/rows/s<k>.jsonl, one JSON line per window (statistics and fit records, no states). XM6's run.mjs is the pattern
// for the FFM arms and the proof; XP2's for P and the SGP4 arms. A fresh window whose P or S17LPc differs from XP2's stored row is a
// software defect: the worker writes <store>/DEFECT.json and every worker stops before its next window.
//   node experiments/ffm-short-arc/run.mjs --prepare [--part k/n]   the public sets of the fresh creation days extracted (XM's extraction);
//                                                                     XP2's GRACE-FO reference copies into <store>/reference, SHA-256 recorded
//   FSA_PROOF=1 node experiments/ffm-short-arc/run.mjs --proof       F2 on XM3's windows and A12, A24 on XM6's, equal to their stored rows: <store>/proof.json
//   node experiments/ffm-short-arc/run.mjs --launch 8                detached workers under nice, PIDs in <store>/logs/pids.json
//   node experiments/ffm-short-arc/run.mjs --shard k/n               one worker (fresh windows not yet stored)
//   node experiments/ffm-short-arc/run.mjs --check                   the E2E: config.check's arms re-run and compared exactly; the table rebuilt
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { config, build, store, dir, root, proofMode, XM3, XM, args, readJsonl, appendJsonl, write, iso, ms, DAY, HOUR, daysOf, dateOf, isoWeek, sha256, rms,
  frozen, pinnedCodeUnchanged, sourcesCommitted, xm3Rows, xm6Rows, xp2Rows, gfzChecked, publicCreationDays, rsgaNormalizedDir } from './common.mjs';

frozen();
pinnedCodeUnchanged();
const C3 = XM3.config;
const LEADS = C3.scoring.leadDays;
const GRID = C3.scoring.gridSeconds * 1000, MIN_BIN = C3.scoring.binMinimumEpochs, MIN_COV = C3.fit.minimumCoverage;
const ARMS = config.arms, NAMES = Object.keys(ARMS);
const CHUNK = 6;
const rowsDir = path.join(store, 'rows'), logsDir = path.join(store, 'logs'), DEFECT = path.join(store, 'DEFECT.json'), PROOF = path.join(store, 'proof.json');
const finite = (st) => st.every((q) => q && [...q.r, ...q.v].every(Number.isFinite));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const short = (e) => String(e?.message ?? e).slice(0, 300);
const OBJECTS = new Map(Object.entries(config.groups).flatMap(([g, grp]) => grp.objects.map((o) => [o.norad, { ...o, group: g }])));

/** Every fresh window in a fixed order: span, object, cutoff. */
function windows() {
  const out = [];
  for (const [span, s] of Object.entries(config.spans)) for (const norad of s.norads) for (const t of daysOf(s.from, s.to)) {
    const o = OBJECTS.get(norad);
    out.push({ key: `${o.group}|${norad}|${dateOf(t)}`, span, group: o.group, o, cutoffMs: t });
  }
  return out;
}
/** A window of a key `<group>|<norad>|<date>` (fresh or spent). */
function windowOf(key) {
  const [group, norad, date] = key.split('|');
  const o = OBJECTS.get(Number(norad));
  if (!o || o.group !== group) throw new Error(`${key}: no such object in ${group}`);
  const span = Object.entries(config.spans).find(([, s]) => s.norads.includes(o.norad) && date >= s.from && date <= s.to)?.[0] ?? null;
  return { key, span, group, o, cutoffMs: Date.parse(`${date}T00:00:00Z`) };
}
const stored = () => new Map((fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => /^s\d+\.jsonl$/.test(f)).sort() : []).flatMap((f) => readJsonl(path.join(rowsDir, f))).filter((r) => !r.defect).map((r) => [r.key, r]));

// ---- preparation (no score) -------------------------------------------------------------------------------------------------
if (args.prepare) {
  if (proofMode) throw new Error('--prepare runs without FSA_PROOF');
  const [k, n] = String(args.part ?? '0/1').split('/').map(Number);
  const P = await import(path.join(root, config.code.xm.dir, 'lib/public.mjs'));
  const norads = [...OBJECTS.keys()];
  P.extract(norads, k, n);
  const e = P.extraction();
  console.error(`FSA prepare ${k}/${n}: public sets ${e.extracted} of ${e.days} creation days (${publicCreationDays.join('..')}) extracted`);
  if (k === 0) {
    // XP2's GRACE-FO reference copies (its store, read only) into this store's reference, byte for byte, SHA-256 recorded
    const src = config.truth['gfz-rso'].split(' ')[0], dst = path.join(store, 'reference');
    fs.mkdirSync(dst, { recursive: true });
    const copies = [];
    for (const d of fs.readdirSync(src).filter((x) => x.startsWith('GFZOP_RSO_')).sort()) {
      const from = path.join(src, d), to = path.join(dst, d);
      if (!fs.existsSync(to)) fs.cpSync(from, to, { recursive: true });
      for (const f of fs.readdirSync(to)) { const a = sha256(fs.readFileSync(path.join(from, f))), b = sha256(fs.readFileSync(path.join(to, f))); if (a !== b) throw new Error(`${to}/${f} differs from ${from}/${f}`); copies.push({ dir: d, file: f, sha256: b }); }
    }
    write(path.join(store, 'inputs/reference-copies.json'), { from: src, to: dst, files: copies.length, copies });
    const bulletins = fs.readdirSync(rsgaNormalizedDir).filter((f) => /^\d{8}RSGA\.txt$/.test(f)).sort().map((f) => ({ file: f, sha256: sha256(fs.readFileSync(path.join(rsgaNormalizedDir, f))) }));
    write(path.join(store, 'inputs/rsga-normalized.json'), { dir: rsgaNormalizedDir, reader: build.experimentsCode.xp2.rsgaReaderSha256, bulletins: bulletins.length, first: bulletins[0]?.file, last: bulletins.at(-1)?.file, files: bulletins });
    console.error(`FSA prepare: ${copies.length} reference files copied and checked; ${bulletins.length} normalized bulletins recorded`);
  }
  process.exit(0);
}

// ---- the launcher -------------------------------------------------------------------------------------------------------------
function proofChecked(sources) {
  if (!fs.existsSync(PROOF)) throw new Error(`run --proof before any fresh window (${PROOF})`);
  const s = JSON.parse(fs.readFileSync(PROOF, 'utf8'));
  if (!s.windows.length || !s.windows.every((w) => w.equal)) throw new Error(`${PROOF}: the proof is not equal to the stored rows`);
  for (const f of ['run.mjs', 'common.mjs', 'lib/ffm.mjs', 'lib/sgp4fit.mjs']) if (s.sources[f] !== sources[f]) throw new Error(`${PROOF} ran under another ${f}; rerun --proof`);
}
if (args.launch) {
  if (proofMode) throw new Error('--launch runs without FSA_PROOF');
  const count = Math.min(config.workers.count, Number(args.launch) || config.workers.count);
  proofChecked(sourcesCommitted());
  if (fs.existsSync(DEFECT)) throw new Error(`${DEFECT} exists: resolve the defect first`);
  fs.mkdirSync(logsDir, { recursive: true });
  const pids = [];
  for (let i = 0; i < count; i += 1) {
    const log = fs.openSync(path.join(logsDir, `s${i}.log`), 'a');
    const child = spawn('nice', ['-n', String(config.workers.nice), process.execPath, `--max-old-space-size=${config.workers.heapMb}`, path.join(dir, 'run.mjs'), '--shard', `${i}/${count}`], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
    pids.push(child.pid);
  }
  const pidFile = path.join(logsDir, 'pids.json');
  write(pidFile, { started: new Date().toISOString(), pids, shards: count, nice: config.workers.nice });
  console.error(`FSA: ${count} workers under nice ${config.workers.nice}, PIDs ${pids.join(' ')} (${pidFile})`);
  process.exit(0);
}

// ---- modules and data ---------------------------------------------------------------------------------------------------------
const sources = sourcesCommitted();
const S = await import(path.join(root, config.code.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.code.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, config.code.xm.dir, 'lib/weather.mjs'));
const { publicSetAt } = await import(path.join(root, config.code.xm.dir, 'lib/public.mjs'));
const { openModules } = await import(path.join(root, config.code.xm.dir, 'lib/modules.mjs'));
const { openFfm, settingsFor, driverRows } = await import('./lib/ffm.mjs');
const { openSgp4Fit } = await import('./lib/sgp4fit.mjs');
const gfzSha = gfzChecked(W);
const spacingSeconds = (lines) => { const d = []; for (let i = 1; i < lines.length; i += 1) d.push(ms(lines[i].epoch) - ms(lines[i - 1].epoch)); d.sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] / 1000 : null; };

/** An arm's fit settings: XM3's settingsFor, with the arm's prior sigma on AGOM when it differs from XM3's fraction (XM6's settingsOf). */
function settingsOf(norad, arm) {
  const s = settingsFor(norad);
  if (arm.bPriorFraction != null && arm.bPriorFraction !== C3.fit.apriori.parameterFraction) throw new Error('a B prior other than XM3\'s is not registered');
  if (arm.agomPriorFraction != null && arm.agomPriorFraction !== C3.fit.apriori.parameterFraction) {
    const seed = s.parameters.find((p) => p.kind === 'SRP_AREA_OVER_MASS').value;
    if (s.parameters.at(-1).kind !== 'SRP_AREA_OVER_MASS') throw new Error('AGOM is not the last parameter');
    s.apriori[s.apriori.length - 1] = (arm.agomPriorFraction * seed) ** 2;
  }
  return s;
}

/** One window: the named arms (PLAN.md, Arms). XM6's scoreWindow for the FFM arms; XP2's for P and the SGP4 arms. */
async function scoreWindow(m, F, G, w, names) {
  const { o, group, cutoffMs: D0 } = w;
  const timing = {};
  const row = { group, span: w.span, key: w.key, norad: o.norad, name: o.name, cluster: o.cluster, cutoff: iso(D0), isoWeek: isoWeek(D0), condition: 'O' };
  const after = T.series(o, D0 + 1, D0 + 7 * DAY).lines;
  const t0 = after.length ? ms(after[0].epoch) : 0;
  const grid = after.filter((l) => (ms(l.epoch) - t0) % GRID === 0);
  const bins = Object.fromEntries(LEADS.map((kk) => [kk, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (kk - 1) * DAY && t <= D0 + kk * DAY; })]));
  row.binEpochs = Object.fromEntries(LEADS.map((kk) => [kk, bins[kk].length]));
  row.entered = LEADS.filter((kk) => bins[kk].length >= MIN_BIN);
  if (!row.entered.length) return { row: { ...row, excluded: `no lead bin holds ${MIN_BIN} truth epochs` }, timing };
  const scored = row.entered.flatMap((kk) => bins[kk]);
  const epochs = scored.map((l) => l.epoch), epochsMs = epochs.map(ms), truth = scored.map((l) => ({ r: l.r, v: l.v }));
  const sizes = row.entered.map((kk) => bins[kk].length);
  const score = async (states) => {
    const errors = await m.rtn(states, truth);
    const days = {};
    let i = 0;
    row.entered.forEach((kk, j) => { const e = errors.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(e.map((v) => v[c]))); days[kk] = { rmsKm: Math.hypot(...ric), atKm: ric[1], n: e.length }; });
    return days;
  };
  const O = W.rowsO(D0 - 72 * HOUR - C3.conditions.rowsMarginDays * DAY, D0);
  row.O = O.excluded ? { excluded: O.excluded } : { rsga: O.rsga, c81: O.c81, lastObserved: O.lastObserved, rows: O.rows.length, first: O.rows[0]?.date, last: O.rows.at(-1)?.date };
  if (O.excluded) return { row, timing };
  const held = driverRows(O.rows, D0);
  if (held.held.length) row.held = { from: held.held[0], to: held.held.at(-1), days: held.held.length };
  if (held.filled.length) row.filled = held.filled;
  const set = publicSetAt(o.norad, D0);
  if (set) row.set = { epoch: set.epoch, creation: set.creationDate, gpId: set.gpId, ageHours: (D0 - ms(set.epoch)) / HOUR, creationAgeHours: (D0 - ms(set.creationDate)) / HOUR }; else row.noSet = true;
  const Tc = set ? Math.min(D0, ms(set.creationDate)) : null;
  const arcOf = (end, hours) => { const lines = T.series(o, end - hours * HOUR, end).lines; const step = spacingSeconds(lines); const coverage = step ? lines.length / ((hours * 3600) / step) : 0; return { step, coverage, thin: coverage >= MIN_COV ? T.thinned(lines).chosen : null }; };
  row.arms = {};
  for (const name of names) {
    const arm = ARMS[name];
    if (arm.kind === 'public') {
      if (!set) { row.P = { ok: false, error: 'no set' }; continue; }
      try { const st = await m.propagateSgp4(set, o.norad, epochsMs, C3.scoring.gridSeconds); row.P = st.some((q) => q == null) || !finite(st) ? { ok: false, error: 'no state' } : { ok: true, days: await score(await m.toAxes(st, epochs, 'GCRF')) }; } catch (error) { row.P = { ok: false, error: short(error) }; }
      continue;
    }
    const end = arm.endsAt === 'creation' ? Tc : D0;
    if (end == null || (arm.kind === 'sgp4fit' && !set)) { row.arms[name] = { ok: false, notRun: 'no public set' }; continue; }
    const a = arcOf(end, arm.arcHours);
    if (!a.thin) { row.arms[name] = { notRun: `arc coverage below ${MIN_COV}`, arc: { coverage: a.coverage, stepSeconds: a.step } }; continue; }
    const arc = { coverage: a.coverage, stepSeconds: a.step, states: a.thin.length, first: a.thin[0].epoch, last: a.thin.at(-1).epoch };
    if (arm.kind === 'ffm') {
      const r = await F.arm(settingsOf(o.norad, arm), a.thin, epochs, held.rows);
      timing[name] = { fitMs: r.fitMs ?? null, forecastMs: r.forecastMs ?? null };
      if (!r.ok) row.arms[name] = { ok: false, error: r.error, arc, fit: r.fit ?? null };
      else if (!finite(r.states)) row.arms[name] = { ok: false, error: 'non-finite state', arc, fit: r.fit };
      else row.arms[name] = { ok: true, arc, fit: r.fit, gcrfSha256: sha256(JSON.stringify(r.states.map((s) => [s.r, s.v]))), days: await score(r.states) };
    } else if (arm.kind === 'sgp4fit') {
      const t1 = performance.now();
      try {
        const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: a.thin, useableStart: a.thin[0].epoch, useableStop: iso(end) });
        const { fr, el, bstar } = await G.fit(oem, { from: iso(end - arm.arcHours * HOUR), to: iso(end), epoch: 'last', fitBstar: false, bstar: set.elements.BSTAR }, o);
        timing[name] = { fitMs: Math.round(performance.now() - t1) };
        const st = await m.propagateSgp4(el, o.norad, epochsMs, C3.scoring.gridSeconds);
        if (st.some((q) => q == null) || !finite(st)) row.arms[name] = { ok: false, error: 'no state', bstar, arc };
        else row.arms[name] = { ok: true, bstar, rmsKm: fr.rms?.rms3dKm, iterations: fr.iterations, arc, days: await score(await m.toAxes(st, epochs, 'GCRF')) };
      } catch (error) { row.arms[name] = { ok: false, error: short(error), arc }; }
    } else throw new Error(`${name}: unknown arm kind ${arm.kind}`);
  }
  return { row, timing };
}

const m = await openModules();
let F = await openFfm();
const G = await openSgp4Fit();
const trapped = (x) => /RuntimeError|unreachable|out of bounds|memory access/i.test(String(x?.error ?? ''));
const run = async (w, names) => {
  const t0 = Date.now();
  let out;
  try { out = await scoreWindow(m, F, G, w, names); } catch (error) { out = { row: { group: w.group, span: w.span, key: w.key, norad: w.o.norad, cluster: w.o.cluster, cutoff: iso(w.cutoffMs), condition: 'O', error: String(error?.stack ?? error).slice(0, 600) }, timing: {} }; }
  const row = { ...out.row, build: build.modulesCommit.slice(0, 12), timing: { ...out.timing, wallSeconds: (Date.now() - t0) / 1000 } };
  if (Object.values(row.arms ?? {}).some(trapped)) { try { await F.close(); } catch { /* the trapped instance */ } F = await openFfm(); }
  return row;
};
const finish = async (code) => { try { await m.close(); await F.close(); } catch { /* closing */ } process.exit(code); };

// ---- the equality guards ------------------------------------------------------------------------------------------------------
const readDays = (D0, days) => (days ?? []).filter((d) => { const t = Date.parse(`${d}T00:00:00Z`); return t >= D0 - 4 * DAY && t <= D0 + 8 * DAY; });
/** Against XM3's row (proof): the truth's bins, the condition's rows, the held and filled days on the days propagator/ffm reads (XM3's amendment 1 span). */
function againstXm3(row, x) {
  if (!x) return ['no XM3 row'];
  if (row.error) return ['error'];
  const D0 = ms(row.cutoff);
  const differ = ['binEpochs', 'entered', 'excluded', 'O', 'held'].filter((f) => !same(row[f], x[f]));
  if (!same(readDays(D0, row.filled), readDays(D0, x.filled))) differ.push('filled');
  return differ;
}
/** Against XP2's row (fresh group-P windows): the bins, the set, P and S17LPc in every number XP2 stored (its field names e, t, n). */
function againstXp2(row, x) {
  if (!x) return null;
  if (row.error) return ['error'];
  const differ = [];
  const dEq = (a, b) => !!a && !!b && LEADS.every((L) => (!a[L] && !b[L]) || (!!a[L] && !!b[L] && a[L].rmsKm === b[L].e && a[L].atKm === b[L].t && a[L].n === b[L].n));
  if (!same((row.entered ?? []).map(String), (x.entered ?? []).map(String))) differ.push('entered');
  if (!same(row.binEpochs, x.binEpochs)) differ.push('binEpochs');
  if ((row.set?.gpId ?? null) !== (x.set?.gpId ?? null)) differ.push('set');
  if (!!row.P?.ok !== !!x.P?.ok || (row.P?.ok && !dEq(row.P.days, x.P.days))) differ.push('P');
  const a = row.arms?.S17LPc, b = x.arms?.S17LPc;
  if (!!a?.ok !== !!b?.ok || (a?.ok && (a.bstar !== b.bstar || a.iterations !== b.iterations || a.rmsKm !== b.rmsKm || !dEq(a.days, b.days)))) differ.push('S17LPc');
  return differ;
}

// ---- the proof (spent windows, XM3's and XM6's environment) ----------------------------------------------------------------------
if (args.proof) {
  if (!proofMode) throw new Error('--proof needs FSA_PROOF=1 (XM3 and XM6 ran in XM\'s own store and bulletins)');
  const X3 = await xm3Rows(), X6 = xm6Rows();
  const out = [];
  const record = (r) => { out.push(r); console.error(`FSA proof ${out.length}: ${r.key} ${r.arm}: ${r.equal ? 'equals the stored row' : `differs in ${r.differ.join(', ')}`} (${r.wallSeconds} s; ${r.termination ?? '-'} in ${r.rounds ?? '-'} rounds)`); };
  for (const key of config.proof.f2.windows) {
    const row = await run(windowOf(key), ['F2']);
    const x = X3.get(key), got = row.arms?.F2, differ = againstXm3(row, x);
    if (!same(got?.arc, x?.arc)) differ.push('arc');
    const { arc, ...armOnly } = got ?? {};
    if (!same(armOnly, x?.arms?.F2)) differ.push('F2');
    record({ key, arm: 'F2', against: 'XM3', equal: !differ.length, differ, termination: got?.fit?.termination ?? null, rounds: got?.fit?.iterations ?? null, wallSeconds: row.timing.wallSeconds, error: row.error ?? null });
  }
  for (const { key, arms } of config.proof.shortArcs.windows) {
    const row = await run(windowOf(key), arms);
    const x = X6.get(key);
    for (const a of arms) {
      const differ = x ? [] : ['no XM6 row'];
      if (x && !same(row.arms?.[a], x.arms?.[a])) differ.push(a);
      record({ key, arm: a, against: 'XM6', equal: !differ.length, differ, termination: row.arms?.[a]?.fit?.termination ?? null, rounds: row.arms?.[a]?.fit?.iterations ?? null, wallSeconds: row.timing.wallSeconds, error: row.error ?? null });
    }
  }
  const equal = out.every((r) => r.equal);
  write(PROOF, { at: new Date().toISOString(), equal, sources, modulesCommit: build.modulesCommit, gfzSha256: gfzSha, windows: out });
  console.error(`FSA proof: ${out.filter((r) => r.equal).length} of ${out.length} equal the stored rows (${PROOF})`);
  if (!equal) write(DEFECT, { proof: true, at: new Date().toISOString(), windows: out.filter((r) => !r.equal) });
  await finish(equal ? 0 : 3);
}

// ---- the check ----------------------------------------------------------------------------------------------------------------
if (args.check) {
  const have = stored();
  if (!have.size) { console.error('FSA check: no rows under the store; the check cannot pass without them'); await finish(1); }
  let bad = 0;
  for (const { key, arms } of config.check.windows) {
    const old = have.get(key);
    if (!old) { console.error(`FSA check: ${key}: no stored row`); bad += 1; continue; }
    const now = await run(windowOf(key), arms);
    for (const a of arms) {
      const got = a === 'P' ? now.P : now.arms?.[a], was = a === 'P' ? old.P : old.arms?.[a];
      if (!same(got, was)) { console.error(`FSA check: ${key} ${a}: the rerun differs from the stored row`); bad += 1; } else console.error(`FSA check: ${key} ${a} replayed exactly (${now.timing.wallSeconds} s)`);
    }
  }
  await m.close(); await F.close();
  if (fs.existsSync(path.join(dir, 'table.mjs'))) {
    const { buildTable, sameAsCommitted } = await import('./table.mjs');
    if (!sameAsCommitted(await buildTable())) { console.error('FSA check: the table rebuilt from the stored rows differs from the committed table.json'); bad += 1; }
  } else { console.error('FSA check: no table.mjs yet'); bad += 1; }
  console.error(bad ? `FSA check: FAIL (${bad})` : 'FSA check: PASS');
  process.exit(bad ? 1 : 0);
}

// ---- a worker: fresh windows --------------------------------------------------------------------------------------------------
if (proofMode) throw new Error('a scored run runs without FSA_PROOF');
proofChecked(sources);
const [k, n] = String(args.shard ?? '0/1').split('/').map(Number);
const XP2 = await xp2Rows();
const freeGiB = () => { const t = execFileSync('vm_stat', { encoding: 'utf8' }); const page = Number(/page size of (\d+)/.exec(t)?.[1] ?? 16384); const pages = (name) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(t)?.[1] ?? 0); return (pages('Pages free') + pages('Pages inactive') + pages('Pages speculative')) * page / 2 ** 30; };
const diskGiB = () => { const s = fs.statfsSync(store); return s.bavail * s.bsize / 2 ** 30; };
const sleep = (msec) => new Promise((r) => setTimeout(r, msec));
const all = windows(), done = stored();
const mine = all.filter((w, i) => Math.floor(i / CHUNK) % n === k && !done.has(w.key) && (!args.group || w.group === args.group) && (!args.span || w.span === args.span));
const limit = args.limit ? Number(args.limit) : Infinity;
let count = 0;
fs.mkdirSync(rowsDir, { recursive: true });
for (const w of mine) {
  if (count >= limit) break;
  if (fs.existsSync(DEFECT)) { console.error(`FSA shard ${k}/${n}: ${DEFECT} exists; stopping`); break; }
  while (freeGiB() < config.workers.freeMemoryFloorGiB || diskGiB() < config.workers.diskFloorGiB) { console.error(`FSA shard ${k}/${n}: free memory ${freeGiB().toFixed(1)} GiB, disk ${diskGiB().toFixed(1)} GiB: waiting 60 s`); await sleep(60_000); }
  const row = await run(w, NAMES);
  row.sources = sources;
  const differ = w.group === 'P' ? againstXp2(row, XP2.get(w.key)) : null;
  if (differ === null && w.group === 'P') row.noXp2Row = true;
  if (differ && differ.length) row.defect = differ;
  appendJsonl(path.join(rowsDir, `s${k}.jsonl`), row);
  if (row.defect) {
    write(DEFECT, { key: row.key, defect: row.defect, error: row.error ?? null, at: new Date().toISOString(), shard: `${k}/${n}` });
    console.error(`FSA shard ${k}/${n}: ${row.key} differs from XP2's row in ${row.defect.join(', ')}: a software defect; stopping`);
    await finish(3);
  }
  count += 1;
  if (count % 5 === 0) console.error(`FSA shard ${k}/${n}: ${count} of ${mine.length} windows (${new Date().toISOString()})`);
}
console.error(`FSA shard ${k}/${n}: ${count} new windows`);
await finish(0);
