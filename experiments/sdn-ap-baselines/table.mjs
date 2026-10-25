// B1 aggregation (PLAN.md, Statistics): the stored window rows and G1's SDN-AP rows -> results/sdn-ap-baselines/table.json and README.md.
// Everything in the committed table is computed here from the rows; nothing is typed. Counting, ordering and resampling only.
//   node experiments/sdn-ap-baselines/table.mjs [--check]   (--check recomputes and compares with the committed table.json)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, store, results, args, readJsonl, sha256 } from './common.mjs';
import { collectWindows } from './lib/windows.mjs';

const ARMS = ['sdnap', 'sgp4', 'sgp4xp', 'ffm'];
const NAMES = { sdnap: 'SDN-AP', sgp4: 'SGP4', sgp4xp: 'SGP4-XP', ffm: 'FFM' };
const DAYS = config.scoring.leadDays;
const B = config.statistics.bootstrap;

const quantile = (values, q) => { // G1 lib/windows.mjs quantile (linear interpolation between order statistics)
  const a = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
};
const medianSorted = (a) => { const pos = (a.length - 1) / 2, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); };

/** xorshift128+ on two 64-bit words held as 32-bit halves, seeded by SHA-256 of `label`; next() is a float in [0, 1) from the high 32 bits. */
function generator(label) {
  const d = crypto.createHash('sha256').update(label).digest();
  let [ah, al, bh, bl] = [d.readUInt32BE(0), d.readUInt32BE(4), d.readUInt32BE(8), d.readUInt32BE(12)];
  if (!(ah | al | bh | bl)) al = 1;
  return () => {
    let xh = ah, xl = al; const yh = bh, yl = bl;
    ah = yh; al = yl;
    // x ^= x << 23
    xh = (xh ^ ((xh << 23) | (xl >>> 9))) >>> 0; xl = (xl ^ (xl << 23)) >>> 0;
    // s1 = x ^ y ^ (x >> 17) ^ (y >> 26)
    const x17l = ((xl >>> 17) | (xh << 15)) >>> 0, x17h = xh >>> 17;
    const y26l = ((yl >>> 26) | (yh << 6)) >>> 0, y26h = yh >>> 26;
    bh = (xh ^ yh ^ x17h ^ y26h) >>> 0; bl = (xl ^ yl ^ x17l ^ y26l) >>> 0;
    // return s1 + y (the high word)
    const lo = bl + yl, carry = lo >= 4294967296 ? 1 : 0;
    const hi = (bh + yh + carry) >>> 0;
    return hi / 4294967296;
  };
}

/** Percentile-bootstrap interval of the median: items are values (kind 'windows') or arrays of values (kind 'satellites', one per satellite). */
function interval(items, label, clustered) {
  if (items.length < 2) return null;
  const next = generator(label);
  const medians = new Float64Array(B.resamples);
  for (let r = 0; r < B.resamples; r += 1) {
    const draw = [];
    for (let i = 0; i < items.length; i += 1) { const pick = items[Math.floor(next() * items.length)]; if (clustered) draw.push(...pick); else draw.push(pick); }
    draw.sort((x, y) => x - y);
    medians[r] = medianSorted(draw);
  }
  const all = Array.from(medians);
  const tail = (1 - B.level) / 2;
  return [quantile(all, tail), quantile(all, 1 - tail)];
}

const satelliteOf = (w) => (w.norad ? String(w.norad) : w.id);
const dayOf = (w, arm, k) => (arm === 'sdnap' ? (w.sdnap?.ok ? w.sdnap.days?.[k]?.rmsKm : undefined) : (w.b1?.[arm]?.ok ? w.b1[arm].days?.[k]?.rmsKm : undefined));
const fitOf = (w, arm) => (arm === 'sdnap' ? (w.sdnap?.ok ? w.sdnap.fitRmsKm : undefined) : (w.b1?.[arm]?.ok ? w.b1[arm].fitRmsKm : undefined));
const okOf = (w, arm) => (arm === 'sdnap' ? Boolean(w.sdnap?.ok) : Boolean(w.b1?.[arm]?.ok));

function spread(ws, value, label) {
  const scored = ws.filter((w) => Number.isFinite(value(w)));
  const values = scored.map(value);
  if (!values.length) return { n: 0 };
  const bySat = new Map();
  for (const w of scored) { const s = satelliteOf(w); if (!bySat.has(s)) bySat.set(s, []); bySat.get(s).push(value(w)); }
  return {
    n: values.length, satellites: bySat.size, median: quantile(values, 0.5), p10: quantile(values, 0.1), p90: quantile(values, 0.9),
    ci95Windows: interval(values, `${label}|windows`, false),
    ci95Satellites: bySat.size >= B.satelliteMinimum ? interval([...bySat.values()], `${label}|satellites`, true) : null,
  };
}

/** The table from the windows (each with its SDN-AP row and its stored B1 row as w.b1). */
export function build() {
  const stored = new Map();
  const dir = path.join(store, 'rows');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort() : [];
  for (const f of files) for (const r of readJsonl(path.join(dir, f))) stored.set(r.key, r);
  const windows = collectWindows().map((w) => ({ ...w, b1: stored.get(w.key) ?? null }));
  const rowsDigest = sha256(Buffer.from(JSON.stringify(windows.map((w) => [w.key, w.b1 && ARMS.slice(1).map((a) => w.b1[a] && { ok: w.b1[a].ok, days: w.b1[a].days, fitRmsKm: w.b1[a].fitRmsKm ?? null })]))));
  const out = { experiment: config.experiment, plan: 'experiments/sdn-ap-baselines/PLAN.md', sdnapBuild: config.g1.sdnapBuild, modulesCommit: config.modules.commit, rowsDigest, units: 'km, 3D RMS of a held-out day; a cell is over windows', rows: [] };
  for (const r of config.rows) {
    const ws = windows.filter((w) => w.regime === r.regime);
    const missing = ws.filter((w) => !w.b1).length;
    const row = { row: r.row, regime: r.regime, center: r.center, windows: ws.length, satellites: new Set(ws.map(satelliteOf)).size, notRunYet: missing, arms: {}, paired: {}, closest: {} };
    for (const arm of ARMS) {
      const na = arm !== 'sdnap' ? ws.find((w) => w.b1?.[arm]?.notApplicable) : null;
      if (na) { row.arms[arm] = { notApplicable: na.b1[arm].error }; continue; }
      const failures = {};
      for (const w of ws) if (!okOf(w, arm)) { const e = String((arm === 'sdnap' ? w.sdnap?.error : w.b1?.[arm]?.error) ?? 'not run').split(':')[0].slice(0, 60); failures[e] = (failures[e] ?? 0) + 1; }
      row.arms[arm] = {
        attempted: ws.length, fitted: ws.filter((w) => okOf(w, arm)).length, failures,
        fit: arm === 'ffm' ? null : spread(ws, (w) => fitOf(w, arm), `B1|${r.row}|${arm}|fit`),
        days: Object.fromEntries(DAYS.map((k) => [k, spread(ws, (w) => dayOf(w, arm, k), `B1|${r.row}|${arm}|${k}`)])),
      };
    }
    for (const other of ARMS.slice(1)) {
      if (row.arms[other].notApplicable) continue;
      row.paired[other] = Object.fromEntries(DAYS.map((k) => {
        const pairs = ws.map((w) => [dayOf(w, 'sdnap', k), dayOf(w, other, k)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x > 0);
        if (!pairs.length) return [k, { n: 0 }];
        const ratios = pairs.map(([x, y]) => y / x);
        return [k, { n: pairs.length, sdnapCloser: pairs.filter(([x, y]) => x < y).length / pairs.length, medianRatio: quantile(ratios, 0.5), ci95Windows: interval(ratios, `B1|${r.row}|${other}/sdnap|${k}|windows`, false) }];
      }));
    }
    for (const k of DAYS) {
      const cands = ARMS.filter((a) => !row.arms[a].notApplicable && row.arms[a].days[k].n > 0).map((a) => [a, row.arms[a].days[k].median]);
      if (!cands.length) { row.closest[k] = null; continue; }
      const best = Math.min(...cands.map(([, m]) => m));
      row.closest[k] = cands.filter(([, m]) => m === best).map(([a]) => a);
    }
    out.rows.push(row);
  }
  const star = windows.filter((w) => w.b1?.ffmIdentity);
  out.identityCheck = { what: 'FFM from the Starlink truth state at the fit end with the truth\'s own Cd*A/m and Cr*A/m (PLAN.md, Arms 4): a check of the pipeline, not an arm', windows: star.length, ok: star.filter((w) => w.b1.ffmIdentity.ok).length,
    days: Object.fromEntries(DAYS.map((k) => { const v = star.map((w) => w.b1.ffmIdentity.days?.[k]?.rmsKm).filter(Number.isFinite); return [k, v.length ? { n: v.length, medianKm: quantile(v, 0.5), maxKm: quantile(v, 1) } : { n: 0 }]; })) };
  const envFile = path.join(store, 'environment/environment.json');
  out.environment = fs.existsSync(envFile) ? JSON.parse(fs.readFileSync(envFile, 'utf8')).provenance : null;
  if (out.environment) delete out.environment.createdUtc;
  return out;
}

const TABLE = path.join(results, 'table.json');
export const sameAsCommitted = (t) => fs.existsSync(TABLE) && fs.readFileSync(TABLE, 'utf8') === `${JSON.stringify(t, null, 2)}\n`;

const km = (v) => (v == null ? '' : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3));
const cell = (s) => (!s || !s.n ? '-' : `${km(s.median)} (${km(s.p10)} to ${km(s.p90)})`);
const ci = (s) => (!s?.ci95Windows ? '-' : `${km(s.ci95Windows[0])} to ${km(s.ci95Windows[1])}${s.ci95Satellites ? `; ${km(s.ci95Satellites[0])} to ${km(s.ci95Satellites[1])}` : ''}`);

export function markdown(t) {
  const o = [];
  o.push('# B1: SGP4, SGP4-XP and FFM on the windows of the SDN-AP paper\'s held-out table', '');
  o.push(`Generated by \`node experiments/sdn-ap-baselines/table.mjs\` from the stored window rows (digest \`${t.rowsDigest.slice(0, 12)}\`) and G1's SDN-AP rows of build ${t.sdnapBuild}; plan: [PLAN.md](../../experiments/sdn-ap-baselines/PLAN.md). Modules at ${t.modulesCommit.slice(0, 12)}.`, '');
  o.push('SDN-AP is the paper\'s section 12.3 (G1, build ' + t.sdnapBuild + '), read, not rerun. SGP4 is analysis/gp-error-model `fit_elements` (six mean elements and B*) on the same 24 h; SGP4-XP is propagator/sdn-ap `fit` with THEORY SGP4XP on the same block; FFM is propagator/ffm from the truth state at the end of the fit, with a priori force parameters (published values for the laser-ranged spheres) and nothing fitted. Every arm is scored by the same scorer. A cell is the median over windows of a day\'s 3D RMS, in km, with the 10th and 90th percentiles in parentheses.', '');
  o.push('Rerun: `node experiments/sdn-ap-baselines/run.mjs [--shard k/n]` (one row per window into the local store), then `node experiments/sdn-ap-baselines/table.mjs`; the E2E is `node experiments/sdn-ap-baselines/run.mjs --check`. Setup, inputs and keys: [docs/sdn-ap-reproduction.md](../../docs/sdn-ap-reproduction.md). Only these aggregates are committed: the per-window rows, and every truth state, stay in the local store.', '');
  o.push('## Held-out error by day (km): median (10th to 90th percentile)', '');
  o.push('| Row | Arm | Fitted / windows | Fit | Day 1 | Day 2 | Day 3 |', '| --- | --- | --: | --- | --- | --- | --- |');
  for (const r of t.rows) {
    for (const arm of ARMS) {
      const a = r.arms[arm];
      if (a.notApplicable) { o.push(`| ${r.row} | ${NAMES[arm]} | not run | ${a.notApplicable} | | | |`); continue; }
      o.push(`| ${r.row} | ${NAMES[arm]} | ${a.fitted} / ${a.attempted} | ${a.fit ? cell(a.fit) : 'none (from the precise state)'} | ${DAYS.map((k) => cell(a.days[k])).join(' | ')} |`);
    }
  }
  o.push('', '## Closest arm by row and day (lowest median)', '');
  o.push('| Row | Day 1 | Day 2 | Day 3 |', '| --- | --- | --- | --- |');
  for (const r of t.rows) o.push(`| ${r.row} | ${DAYS.map((k) => (r.closest[k] ? r.closest[k].map((a) => NAMES[a]).join(', ') : '-')).join(' | ')} |`);
  o.push('', '## 95 % intervals of the median (km): bootstrap over windows; over satellites where a row has five or more', '');
  o.push('| Row | Arm | Day 1 | Day 2 | Day 3 |', '| --- | --- | --- | --- | --- |');
  for (const r of t.rows) for (const arm of ARMS) { const a = r.arms[arm]; if (!a.notApplicable) o.push(`| ${r.row} | ${NAMES[arm]} | ${DAYS.map((k) => ci(a.days[k])).join(' | ')} |`); }
  o.push('', '## Paired with SDN-AP on the windows both scored: share of windows where SDN-AP is closer; median of other / SDN-AP [95 % interval over windows]', '');
  o.push('| Row | Against | Day 1 | Day 2 | Day 3 |', '| --- | --- | --- | --- | --- |');
  const pct = (v) => `${Math.round(100 * v)} %`;
  for (const r of t.rows) for (const [other, p] of Object.entries(r.paired)) o.push(`| ${r.row} | ${NAMES[other]} | ${DAYS.map((k) => (p[k].n ? `${pct(p[k].sdnapCloser)}; ${km(p[k].medianRatio)}${p[k].ci95Windows ? ` [${km(p[k].ci95Windows[0])}, ${km(p[k].ci95Windows[1])}]` : ''} (n ${p[k].n})` : '-')).join(' | ')} |`);
  o.push('', '## Windows an arm did not fit or score', '');
  for (const r of t.rows) for (const arm of ARMS) { const a = r.arms[arm]; if (!a.notApplicable && a.fitted < a.attempted) o.push(`- ${r.row}, ${NAMES[arm]}: ${a.attempted - a.fitted} of ${a.attempted} (${Object.entries(a.failures).map(([e, n]) => `${e}: ${n}`).join('; ')})`); }
  const id = t.identityCheck;
  o.push('', '## Check of the pipeline', '');
  o.push(`- FFM from the Starlink truth state with the truth's own parameters (the truth is FFM-1): ${id.ok} of ${id.windows} windows; ${DAYS.map((k) => (id.days[k].n ? `day ${k} median ${(id.days[k].medianKm * 1000).toFixed(3)} m, largest ${(id.days[k].maxKm * 1000).toFixed(3)} m` : `day ${k} -`)).join('; ')}.`);
  if (t.environment) {
    const e = t.environment;
    o.push(`- FFM's environment (amendments A1 and A2): Earth orientation from IERS finals.all (${e.earthOrientation.finalsSha256.slice(0, 12)}, MJD ${e.earthOrientation.firstMjd} to ${e.earthOrientation.lastMjd}), or G1's ${e.earthOrientation.savedRows} saved rows (MJD ${e.earthOrientation.savedFirstMjd} to ${e.earthOrientation.savedLastMjd}) for an arc within their span; space weather ${e.spaceWeather.first} to ${e.spaceWeather.last} (GFZ ${e.spaceWeather.gfzSha256.slice(0, 12)}; against the saved rows ${e.spaceWeather.checkAgainstSavedRows.fieldsEqual} of ${e.spaceWeather.checkAgainstSavedRows.fieldsCompared} fields equal, against G1's history ${e.spaceWeather.checkAgainstG1History.fieldsEqual} of ${e.spaceWeather.checkAgainstG1History.fieldsCompared}).`);
  }
  o.push('');
  return o.join('\n');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const t = build();
  if (args.check) { const same = sameAsCommitted(t); console.error(same ? 'B1 table: PASS (same as committed)' : 'B1 table: differs from committed'); process.exit(same ? 0 : 1); }
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, `${JSON.stringify(t, null, 2)}\n`);
  fs.writeFileSync(path.join(results, 'README.md'), markdown(t));
  console.error(`B1 table: ${t.rows.length} rows, ${t.rows.reduce((s, r) => s + r.notRunYet, 0)} windows not run yet`);
}
