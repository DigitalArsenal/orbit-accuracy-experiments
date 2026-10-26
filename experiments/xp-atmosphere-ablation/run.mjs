// XA runner (PLAN.md): every registered window of a group through A0, A1-A3 under conditions M and O, the public set P and,
// for L1 and I, Part D's variants of A0; one JSON line per window under <store>/rows/<group>.s<k>.jsonl (statistics and
// fitted parameters only). Re-running skips windows already present.
//   node experiments/xp-atmosphere-ablation/run.mjs --group L1|L2|I|N [--shard k/n] [--limit n]
//   node experiments/xp-atmosphere-ablation/run.mjs --prep norads | --prep public --shard k/n
//   node experiments/xp-atmosphere-ablation/run.mjs --check   (the E2E: the first window of every group rescored and compared
//                                                             with its stored row; the table regenerated against table.json)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, store, args, frozen, readJsonl, write, iso, ms, DAY, HOUR, build, b1Dir } from './common.mjs';
import { windowsOf, closeGroups, thinned } from './lib/groups.mjs';

frozen();
const GROUPS = ['L1', 'L2', 'I', 'N'];
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);

if (args.prep === 'norads') {
  const norads = new Set();
  for (const g of GROUPS) for (const w of await windowsOf(g)) if (w.norad) norads.add(Number(w.norad));
  write(path.join(store, 'inputs/norads.json'), [...norads].sort((a, b) => a - b));
  console.error(`norads: ${norads.size}`);
  await closeGroups();
  process.exit(0);
}
if (args.prep === 'public') {
  const { extract } = await import('./lib/public.mjs');
  extract(JSON.parse(fs.readFileSync(path.join(store, 'inputs/norads.json'), 'utf8')), k, n);
  process.exit(0);
}

const { openModules } = await import('./lib/modules.mjs');
const S = await import('./lib/sds.mjs');
const { rowsFor } = await import('./lib/weather.mjs');
const { dclAt } = await import('./lib/dca.mjs');
const { publicSetAt } = await import('./lib/public.mjs');
const spheres = JSON.parse(fs.readFileSync(path.join(b1Dir, 'config.json'), 'utf8')).ffm.spheres;
const D = config.diagnostic;
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const short = (e) => String(e?.message ?? e).slice(0, 240);

/** The covariance statistics of a fitted set (SPEC 12 rows): sigma of BTERM and AGOM, their correlation, and the multiple
 *  correlation of each with the epoch state. Statistics only. */
function covStats(info) {
  const C = info.covariance, dr = info.params.SDNAP_COV_DRAG?.split(' ').map(Number), ag = info.params.SDNAP_COV_AGOM?.split(' ').map(Number);
  if (C.length !== 21 || !dr || !ag || dr.length !== 7 || ag.length !== 8) return null;
  const S6 = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => { const [a, b] = i >= j ? [i, j] : [j, i]; return C[(a * (a + 1)) / 2 + b]; }));
  const solve = (A, bvec) => { // Gaussian elimination with partial pivoting on a 6 x 6
    const M = A.map((row, i) => [...row, bvec[i]]);
    for (let c = 0; c < 6; c += 1) {
      let p = c; for (let r = c + 1; r < 6; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < 6; r += 1) { const f = M[r][c] / M[c][c]; for (let q = c; q <= 6; q += 1) M[r][q] -= f * M[c][q]; }
    }
    const x = Array(6).fill(0);
    for (let r = 5; r >= 0; r -= 1) { let s = M[r][6]; for (let q = r + 1; q < 6; q += 1) s -= M[r][q] * x[q]; x[r] = s / M[r][r]; }
    return x;
  };
  const r2 = (c, v) => { const x = solve(S6, c); return c.reduce((s, ci, i) => s + ci * x[i], 0) / v; };
  const sB = Math.sqrt(dr[6]), sA = Math.sqrt(ag[7]);
  return { sigmaBterm: sB, sigmaAgom: sA, rhoBtermAgom: ag[6] / (sB * sA), multipleCorrBtermState: Math.sqrt(Math.max(0, r2(dr.slice(0, 6), dr[6]))), multipleCorrAgomState: Math.sqrt(Math.max(0, r2(ag.slice(0, 6), ag[7]))) };
}

/** One fitted (or given) set scored: the fit span against the fit input, the held-out bins against the truth. */
async function scoreSet(m, w, omm, pcf, extra, fitThin) {
  const epochs = [...fitThin.map((l) => l.epoch), ...w.truth.map((l) => l.epoch)];
  const lines = await m.propagate(omm, epochs, pcf, extra, S.gridBytes(epochs));
  const pred = await m.toAxes(lines, w.axes);
  const out = { fitRmsKm: null, fitRic: null, days: {} };
  if (fitThin.length) {
    const e = await m.rtn(pred.slice(0, fitThin.length), fitThin);
    out.fitRic = [0, 1, 2].map((c) => rms(e.map((v) => v[c])));
    out.fitRmsKm = Math.hypot(...out.fitRic);
  }
  const held = await m.rtn(pred.slice(fitThin.length), w.truth);
  const by = {};
  held.forEach((e, i) => { const key = w.dayOf(ms(w.truth[i].epoch)); if (key != null) (by[key] ??= []).push(e); });
  for (const [key, e] of Object.entries(by)) {
    if (!w.keep(e.length)) continue;
    const ric = [0, 1, 2].map((c) => rms(e.map((v) => v[c])));
    out.days[key] = { rmsKm: Math.hypot(...ric), n: e.length, ric };
  }
  return out;
}

/** An arm: fit on the block, then the set scored with the same $PCF and inputs. */
async function arm(m, w, block, pcf, extra, fitThin) {
  const oem = S.oemBytes({ frame: w.object.frame, object: w.object, lines: block.lines, useableStart: block.useableStart, useableStop: block.useableStop });
  const f = await m.fit(oem, pcf, extra);
  if (!f.ok) return { ok: false, error: f.error, fitMs: f.fitMs };
  const info = S.readFitOmm(f.omm);
  try {
    const scored = await scoreSet(m, w, f.omm, pcf, extra, fitThin);
    return { ok: true, epoch: info.epoch, bterm: info.bterm, agom: info.agom, moduleFitRmsKm: info.fitRmsKm, iterations: info.iterations, statesFitted: info.states, ...scored, cov: covStats(info), fitMs: f.fitMs };
  } catch (error) { return { ok: false, error: `score: ${short(error)}`, fitMs: f.fitMs }; }
}

/** xorshift128+ seeded by SHA-256 of `label` (B1 table.mjs generator), a float in [0, 1). */
function generator(label) {
  const d = crypto.createHash('sha256').update(label).digest();
  let [ah, al, bh, bl] = [d.readUInt32BE(0), d.readUInt32BE(4), d.readUInt32BE(8), d.readUInt32BE(12)];
  if (!(ah | al | bh | bl)) al = 1;
  return () => {
    let xh = ah, xl = al; const yh = bh, yl = bl;
    ah = yh; al = yl;
    xh = (xh ^ ((xh << 23) | (xl >>> 9))) >>> 0; xl = (xl ^ (xl << 23)) >>> 0;
    const x17l = ((xl >>> 17) | (xh << 15)) >>> 0, x17h = xh >>> 17;
    const y26l = ((yl >>> 26) | (yh << 6)) >>> 0, y26h = yh >>> 26;
    bh = (xh ^ yh ^ x17h ^ y26h) >>> 0; bl = (xl ^ yl ^ x17l ^ y26l) >>> 0;
    const lo = bl + yl, carry = lo >= 4294967296 ? 1 : 0;
    return ((bh + yh + carry) >>> 0) / 4294967296;
  };
}

/** D-sparse: an SSN-like cadence, PASSES passes of PASS minutes in every 24 h of the span, at least SEP minutes apart. */
function sparse(lines, key) {
  const P = D.variants['D-sparse'], next = generator(`XA|sparse|${key}`), out = [];
  const t0 = ms(lines[0].epoch), t1 = ms(lines.at(-1).epoch);
  for (let day = t0; day < t1; day += DAY) {
    const span = Math.min(DAY, t1 - day) - P.passMinutes * 60e3;
    const starts = [];
    for (let tries = 0; starts.length < P.passesPerDay && tries < 1000; tries += 1) {
      const s = day + next() * Math.max(0, span);
      if (starts.every((x) => Math.abs(x - s) >= P.minimumSeparationMinutes * 60e3)) starts.push(s);
    }
    for (const l of lines) { const t = ms(l.epoch); if (t >= day && t < day + DAY && starts.some((s) => t >= s && t <= s + P.passMinutes * 60e3)) out.push(l); }
  }
  return out;
}

const pcfOf = (name, fit) => S.pcfBytes({ forces: config.arms[name].forces, fit });

/** One window through every arm (PLAN.md, Arms), P, and Part D for L1 and I. */
export async function scoreWindow(m, w) {
  if (w.load) await w.load();
  const row = { group: w.group, key: w.key, source: w.source, id: w.id, norad: w.norad, cluster: w.cluster, E: iso(w.E), regime: w.regime ?? null, arms: {}, diag: {} };
  let block = w.block;
  if (w.group === 'L1') {
    const track = await w.input(config.groups.L1.trackHours);
    block = { lines: track, useableStart: track[0].epoch, useableStop: iso(w.E) };
    w.fitLines = track;
  }
  if (!block?.lines?.length || !w.truth.length) return { ...row, excluded: !w.truth.length ? 'no truth after E' : 'no fit input' };
  Object.assign(row, { axes: w.axes, fitStart: block.lines[0].epoch, fitStates: block.lines.length, truthEpochs: w.truth.length, fitSpacingSeconds: w.fitSpacingSeconds, truthSpacingSeconds: w.truthSpacingSeconds });
  const fitThin = thinned(w.fitLines).chosen;
  const first = ms(block.lines[0].epoch), last = ms(w.truth.at(-1).epoch);
  const rows = { M: S.spwBytes(rowsFor(first - config.spaceWeather.rowsMarginDays * DAY, last + DAY, 'M', w.E)), O: S.spwBytes(rowsFor(first - config.spaceWeather.rowsMarginDays * DAY, w.E, 'O', w.E)) };
  const dcl = {};
  for (const c of ['M', 'O']) dcl[c] = await dclAt(m, Math.round(w.E + config.conditions[c].dclIssueOffsetHours * HOUR));
  row.dca = Object.fromEntries(Object.entries(dcl).map(([c, d]) => [c, d.ok ? { ok: true, arcs: d.arcs, doves: d.doves, supportedTo: iso(d.supportedToMs) } : { ok: false, error: d.error }]));
  row.arms.A0 = await arm(m, w, block, pcfOf('A0'), null, fitThin);
  for (const name of ['A1', 'A2', 'A3']) for (const c of ['M', 'O']) {
    if (name === 'A3' && !dcl[c].ok) { row.arms[`${name}${c}`] = { ok: false, notRun: `no $DCL: ${dcl[c].error}` }; continue; }
    row.arms[`${name}${c}`] = await arm(m, w, block, pcfOf(name), { rows: rows[c], dcl: name === 'A3' ? dcl[c].dcl : null }, fitThin);
  }
  // P: the newest public set before E, SGP4
  const set = publicSetAt(w.norad, w.E);
  if (set) {
    try {
      const omm = S.sgp4OmmBytes({ epoch: set.epoch, elements: set.elements, norad: w.norad });
      row.arms.P = { ok: true, setEpoch: set.epoch, setCreation: set.creationDate, bstar: set.elements.BSTAR, ...(await scoreSet(m, w, omm, S.pcfBytes({ theory: 'SGP4' }), null, fitThin)) };
    } catch (error) { row.arms.P = { ok: false, error: short(error) }; }
  } else row.arms.P = { ok: false, notRun: 'no public set before E in the archive' };
  if (!D.groups.includes(w.group)) return row;
  // Part D: one factor changed from D0 = A0
  const a0 = pcfOf('A0');
  for (const hours of [72, 168]) {
    const name = `D-span${hours}`;
    let lines;
    try {
      if (w.group === 'L1') lines = await w.input(hours);
      else { const t = w.longTrack(hours); if (t.error) { row.diag[name] = { ok: false, notRun: t.error }; continue; } lines = t.lines; }
    } catch (error) { row.diag[name] = { ok: false, error: short(error) }; continue; }
    row.diag[name] = await arm(m, w, { lines, useableStart: lines[0].epoch, useableStop: iso(w.E) }, a0, null, thinned(lines).chosen);
  }
  const fixed = (mean) => ({ mean, sigma: 1e-9 });
  row.diag['D-agomP'] = await arm(m, w, block, pcfOf('A0', { srpPrior: fixed(D.publicAgom) }), null, fitThin);
  row.diag['D-bothP'] = set ? await arm(m, w, block, pcfOf('A0', { dragPrior: fixed((2 * set.elements.BSTAR) / 0.15696615), srpPrior: fixed(D.publicAgom) }), null, fitThin) : { ok: false, notRun: 'no public set' };
  if (w.group === 'L1') {
    const s = spheres[String(w.norad)], area = Math.PI * (s.diameterM / 2) ** 2;
    row.diag['D-bothPhys'] = await arm(m, w, block, pcfOf('A0', { dragPrior: fixed((D.sphereCd * area) / s.massKg), srpPrior: fixed((s.cr * area) / s.massKg) }), null, fitThin);
  }
  const sp = sparse(block.lines, w.key);
  row.diag['D-sparse'] = sp.length >= 8 ? await arm(m, w, { lines: sp, useableStart: sp[0].epoch, useableStop: block.useableStop }, a0, null, fitThin) : { ok: false, notRun: `${sp.length} states in the passes` };
  for (const [name, p] of [['D-epochMid', 1], ['D-epochEnd', 2]]) {
    m.diag.epoch(p);
    try { row.diag[name] = await arm(m, w, block, a0, null, fitThin); } finally { m.diag.epoch(0); }
  }
  m.diag.jacobian(1);
  try { row.diag['D-fdJac'] = await arm(m, w, block, a0, null, fitThin); } finally { m.diag.jacobian(0); }
  row.diag['D-np'] = { ok: false, notRun: D.variants['D-np'].notRun };
  return row;
}

const rowsDir = path.join(store, 'rows');
const stored = () => new Map(fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readJsonl(path.join(rowsDir, f))).map((r) => [r.key, r]) : []);

const m = await openModules();
if (args.check) {
  const have = stored();
  if (!have.size) { console.error('XA check: no local rows under the store; the check cannot pass without them'); process.exit(1); }
  let bad = 0;
  const close = (x, y) => (x == null && y == null) || (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y)));
  for (const g of GROUPS) {
    const w = (await windowsOf(g)).find((x) => have.get(x.key) && !have.get(x.key).excluded && !have.get(x.key).error);
    if (!w) { console.error(`XA check: ${g}: no stored window`); bad += 1; continue; }
    const old = have.get(w.key), now = await scoreWindow(m, w);
    for (const part of ['arms', 'diag']) for (const [name, a] of Object.entries(old[part] ?? {})) for (const d of ['1', '2', '3']) {
      const x = now[part]?.[name]?.days?.[d]?.rmsKm, y = a?.days?.[d]?.rmsKm;
      if (!close(x, y) || Boolean(now[part]?.[name]?.ok) !== Boolean(a?.ok)) { console.error(`XA check: ${g} ${name} day ${d}: ${x} against stored ${y}`); bad += 1; }
    }
    console.error(`XA check: ${g} ${w.key} replayed`);
  }
  const { build: buildTable, sameAsCommitted } = await import('./table.mjs');
  if (!sameAsCommitted(buildTable())) { console.error('XA check: the table regenerated from the stored rows differs from the committed table.json'); bad += 1; }
  await m.close(); await closeGroups();
  console.error(bad ? `XA check: FAIL (${bad})` : 'XA check: PASS');
  process.exit(bad ? 1 : 0);
}

const group = args.group;
if (!GROUPS.includes(group)) throw new Error(`--group ${GROUPS.join('|')}`);
const windows = await windowsOf(group);
const done = stored();
fs.mkdirSync(rowsDir, { recursive: true });
const limit = args.limit ? Number(args.limit) : Infinity;
let count = 0;
for (let i = 0; i < windows.length; i += 1) {
  const w = windows[i];
  if (i % n !== k || done.has(w.key)) continue;
  if (count >= limit) break;
  const t0 = Date.now();
  let row;
  try { row = await scoreWindow(m, w); } catch (error) { row = { group: w.group, key: w.key, id: w.id, norad: w.norad, cluster: w.cluster, E: iso(w.E), error: String(error?.stack ?? error).slice(0, 500) }; }
  row.wallSeconds = (Date.now() - t0) / 1000;
  row.build = build.modulesCommit.slice(0, 12);
  fs.appendFileSync(path.join(rowsDir, `${group}.s${k}.jsonl`), `${JSON.stringify(row)}\n`);
  count += 1;
  if (count % 5 === 0) console.error(`XA ${group} shard ${k}/${n}: ${count} windows`);
}
console.error(`XA ${group} shard ${k}/${n}: ${count} new windows`);
await m.close(); await closeGroups();
process.exit(0);
