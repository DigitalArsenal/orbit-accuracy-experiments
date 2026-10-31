// XM4's signed along-track check (SIGNED.md): exploratory, not registered; it moves no registered cell. K1, K2 and K3 are flown again on rows L in every
// flown window and must equal XM4's stored GCRF digests (a difference stops the run); one JSON line per window under <store>/signed/s<k>.jsonl (bin means only).
//   node experiments/open-dca-ffm-regression/signed.mjs --launch 8      detached workers (at most 8), PIDs in <store>/signed/logs/pids.json
//   node experiments/open-dca-ffm-regression/signed.mjs [--shard k/n]   the windows of one shard (committed sources only)
//   node experiments/open-dca-ffm-regression/signed.mjs --table         results/open-dca-ffm-regression/signed.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { config, store, args, dir, root, results, guardRef, frozen, readJsonl, appendJsonl, write, iso, ms, DAY, daysOf, dateOf, sha256 } from './common.mjs';

frozen();
const REL = 'experiments/open-dca-ffm-regression';
for (const rel of [`${REL}/SIGNED.md`, `${REL}/signed.mjs`]) {
  if (!execFileSync('git', ['-C', root, 'show', `${guardRef}:${rel}`], { maxBuffer: 1 << 28 }).equals(fs.readFileSync(path.join(root, rel)))) throw new Error(`${rel} differs from ${guardRef}: SIGNED.md comes before any signed number`);
}
const LEADS = config.scoring.leadDays, GRID = config.scoring.gridSeconds * 1000;
const out = path.join(store, 'signed'), logs = path.join(out, 'logs'), DEFECT = path.join(out, 'DEFECT.json');
const ARMS = ['K1', 'K2', 'K3'];
const DRAWS = 10000;
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const rowsOf = (d, re) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => re.test(f)).sort() : []).flatMap((f) => readJsonl(path.join(d, f)));
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;

if (args.launch) {
  const count = Math.min(8, Number(args.launch) || 8);
  fs.mkdirSync(logs, { recursive: true });
  const pids = [];
  for (let i = 0; i < count; i += 1) {
    const log = fs.openSync(path.join(logs, `s${i}.log`), 'a');
    const child = spawn(process.execPath, ['--max-old-space-size=6144', path.join(dir, 'signed.mjs'), '--shard', `${i}/${count}`], { cwd: root, detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
    pids.push(child.pid);
  }
  write(path.join(logs, 'pids.json'), { started: new Date().toISOString(), pids, shards: count });
  console.error(`XM4 signed: ${count} workers, PIDs ${pids.join(' ')}`);
  process.exit(0);
}

// ---- the statistics ---------------------------------------------------------------------------------------------------------------------------
/** xorshift128+ seeded by SHA-256 of `label` (XM-fast's generator), a float in [0, 1). */
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
const ranks = (v) => { const order = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); for (let i = 0; i < order.length;) { let j = i; while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1; for (let m = i; m <= j; m += 1) r[order[m][1]] = (i + j) / 2; i = j + 1; } return r; };
function moments(x, y) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, syy = 0, sxx = 0, oxy = 0, oyy = 0, same = 0;
  for (let i = 0; i < x.length; i += 1) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; syy += b * b; sxx += a * a; oxy += x[i] * y[i]; oyy += y[i] * y[i]; if (x[i] * y[i] > 0) same += 1; }
  return { gamma: sxy / syy, gammaOrigin: oxy / oyy, beta: sxy / sxx, sameSign: same / x.length };
}
function spearman(x, y) { const a = ranks(x), b = ranks(y), ma = mean(a), mb = mean(b); return moments(a, b).gamma * Math.sqrt(b.reduce((s, v) => s + (v - mb) ** 2, 0) / a.reduce((s, v) => s + (v - ma) ** 2, 0)); }
const interval = (v) => { const s = [...v].sort((a, b) => a - b); const at = (q) => { const p = q * (s.length - 1), lo = Math.floor(p); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (p - lo); }; return [at(0.025), at(0.975)]; };

/** One cell: the point values and ISO-week intervals of SIGNED.md, and its reading. */
function cell(group, lead, pts) {
  const stat = (p) => {
    const x2 = p.map((q) => q.x2), x3 = p.map((q) => q.x3), y = p.map((q) => q.y);
    const a = moments(x2, y), b = moments(x3, y);
    return { gamma2: a.gamma, gamma3: b.gamma, difference: a.gamma - b.gamma, gammaOrigin2: a.gammaOrigin, gammaOrigin3: b.gammaOrigin, beta2: a.beta, beta3: b.beta, sameSign2: a.sameSign, sameSign3: b.sameSign };
  };
  const point = { ...stat(pts), spearman2: spearman(pts.map((q) => q.x2), pts.map((q) => q.y)), spearman3: spearman(pts.map((q) => q.x3), pts.map((q) => q.y)) };
  const weeks = [...new Set(pts.map((q) => q.week))].sort(), members = weeks.map((w) => pts.filter((q) => q.week === w));
  const next = generator(`XM4-signed|${group}|${lead}`);
  const draws = Object.fromEntries(Object.keys(point).map((name) => [name, []]));
  for (let r = 0; r < DRAWS; r += 1) {
    const sample = [];
    for (let j = 0; j < weeks.length; j += 1) sample.push(...members[Math.floor(next() * weeks.length)]);
    const s = stat(sample);
    for (const [name, v] of Object.entries(s)) draws[name].push(v);
    if (r % 10 === 0) { draws.spearman2.push(spearman(sample.map((q) => q.x2), sample.map((q) => q.y))); draws.spearman3.push(spearman(sample.map((q) => q.x3), sample.map((q) => q.y))); }
  }
  const intervals = Object.fromEntries(Object.entries(draws).map(([name, v]) => [name, interval(v.filter(Number.isFinite))]));
  const g = intervals.gamma2, d = intervals.difference;
  const reading = g[1] < 0 ? 'wrong way' : g[0] <= 0 ? 'no signal' : d[0] > 0 ? 'date-specific signal' : 'signal, not date-specific';
  return { group, lead, windows: pts.length, weeks: weeks.length, reading, ...point, intervals, spearmanDraws: draws.spearman2.length, meanYKm: mean(pts.map((q) => q.y)), meanX2Km: mean(pts.map((q) => q.x2)), meanX3Km: mean(pts.map((q) => q.x3)) };
}

if (args.table) {
  const rows = rowsOf(out, /^s\d+\.jsonl$/).sort((a, b) => (a.key < b.key ? -1 : 1));
  const cells = [];
  for (const group of Object.keys(config.groups)) for (const lead of LEADS) {
    const pts = rows.filter((r) => r.group === group && r.bins[lead]).map((r) => ({ week: r.isoWeek, ...r.bins[lead] }));
    if (pts.length) cells.push(cell(group, lead, pts));
  }
  const table = { experiment: config.experiment, label: 'exploratory, not registered (SIGNED.md); it moves no registered cell', rows: rows.length, convention: [...new Set(rows.map((r) => r.convention))], rowsDigest: sha256(rows.map((r) => JSON.stringify({ ...r, timing: undefined })).join('\n')), cells };
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(path.join(results, 'signed.json'), `${JSON.stringify(table, null, 1)}\n`);
  for (const c of cells) console.error(`${c.group} day ${c.lead}: n ${c.windows} weeks ${c.weeks} ${c.reading}; gamma2 ${c.gamma2.toFixed(4)} [${c.intervals.gamma2.map((v) => v.toFixed(4))}] gamma3 ${c.gamma3.toFixed(4)} [${c.intervals.gamma3.map((v) => v.toFixed(4))}] diff ${c.difference.toFixed(4)} [${c.intervals.difference.map((v) => v.toFixed(4))}]`);
  process.exit(0);
}

// ---- the worker ---------------------------------------------------------------------------------------------------------------------------------
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const { publicSetAt } = await import(path.join(root, config.xm.dir, 'lib/public.mjs'));
const { weatherAt, recordAt, movedRecordAt } = await import('./lib/inputs.mjs');
const { openPath } = await import('./lib/ffm1.mjs');
const stored = new Map(rowsOf(path.join(store, 'rows'), /^O\.s\d+\.jsonl$/).map((r) => [r.key, r]));
const windows = [];
for (const group of Object.keys(config.groups)) for (const o of config.groups[group].objects) for (const t of daysOf(config.period.from, config.period.to)) windows.push({ group, o, cutoffMs: t, key: `${group}|${o.norad}|${dateOf(t)}` });
const done = new Set(rowsOf(out, /^s\d+\.jsonl$/).map((r) => r.key));
const mine = windows.filter((w, i) => Math.floor(i / 6) % n === k && !done.has(w.key) && stored.get(w.key)?.arms);
const m = await openModules();
const flight = await openPath();
/** The scorer's sign: +1 when its along-track component is predicted minus truth. A probe, no score: a state moved forward along its own velocity. */
async function convention(lines) {
  const { r, v } = lines[0], speed = Math.hypot(...v), probe = { r: r.map((x, i) => x + v[i] / speed), v };
  const [e] = await m.rtn([probe], [{ r, v }]);
  return Math.sign(e[1]);
}
let count = 0;
for (const w of mine) {
  if (fs.existsSync(DEFECT)) { console.error(`XM4 signed shard ${k}/${n}: ${DEFECT} exists; stopping`); break; }
  const { o, cutoffMs: D0 } = w, row = stored.get(w.key), t0 = Date.now();
  const after = T.series(o, D0 + 1, D0 + 7 * DAY).lines;
  const first = ms(after[0].epoch);
  const grid = after.filter((l) => (ms(l.epoch) - first) % GRID === 0);
  const bins = row.entered.map((lead) => grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (lead - 1) * DAY && t <= D0 + lead * DAY; }));
  const scored = bins.flat(), epochsMs = scored.map((l) => ms(l.epoch)), truth = scored.map((l) => ({ r: l.r, v: l.v }));
  const sign = await convention(scored);
  const weather = weatherAt(D0), set = publicSetAt(o.norad, D0), seed = await flight.seed(set, o.norad, D0);
  const records = { K1: null, K2: recordAt(D0).framed, K3: movedRecordAt(D0).framed };
  const along = {};
  let bad = null;
  for (const arm of ARMS) {
    const a = await flight.fly({ D0, objects: [{ fixed: seed.fixed, bstar: set.elements.BSTAR }], recordBytes: flight.records(D0, weather.forms.L, records[arm]), epochsMs });
    if (!a.ok || sha256(JSON.stringify(a.states.map((s) => [s.r, s.v]))) !== row.arms[arm].gcrfSha256) { bad = `${arm} differs from its stored digest: ${a.error ?? 'digest'}`; break; }
    along[arm] = (await m.rtn(a.states, truth)).map((e) => sign * e[1]);   // predicted minus truth, along-track, km
  }
  if (bad) { write(DEFECT, { key: w.key, bad, at: new Date().toISOString() }); console.error(`XM4 signed: ${w.key}: ${bad}; stopping`); process.exit(3); }
  const out1 = {};
  let at = 0;
  row.entered.forEach((lead, j) => {
    const idx = bins[j].map((_, i) => at + i);
    at += bins[j].length;
    out1[lead] = { y: mean(idx.map((i) => -along.K1[i])), x2: mean(idx.map((i) => along.K2[i] - along.K1[i])), x3: mean(idx.map((i) => along.K3[i] - along.K1[i])) };
  });
  appendJsonl(path.join(out, `s${k}.jsonl`), { key: w.key, group: w.group, norad: o.norad, isoWeek: row.isoWeek, convention: sign, bins: out1, timing: { wallSeconds: (Date.now() - t0) / 1000 } });
  count += 1;
  if (count % 10 === 0) console.error(`XM4 signed shard ${k}/${n}: ${count} of ${mine.length} (${iso(Date.now())})`);
}
console.error(`XM4 signed shard ${k}/${n}: ${count} new windows`);
await m.close();
process.exit(0);
