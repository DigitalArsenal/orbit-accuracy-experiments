// B2 aggregation (PLAN.md, Scoring and statistics): the stored rows of parts 1 and 2 -> results/sdn-ap-mixed-screening/table.json and README.md.
// Counting, ordering and resampling only.
//   node experiments/sdn-ap-mixed-screening/table.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, store, results, args, readJsonl, sha256 } from './common.mjs';

const B = config.statistics.bootstrap;
const NAMES = { sdnap: 'SDN-AP', sgp4xp: 'SGP4-XP', sgp4: 'SGP4', forecast: 'Operator forecast', ffm: 'FFM', sdnapTruth: 'SDN-AP fitted to the truth' };
const quantile = (values, q) => { const a = values.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); };
const medianSorted = (a) => { const pos = (a.length - 1) / 2, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); };
function generator(label) { // xorshift128+ (23, 17, 26), seeded by SHA-256 of the label; the high 32 bits as a float in [0, 1)
  const d = crypto.createHash('sha256').update(label).digest();
  let [ah, al, bh, bl] = [d.readUInt32BE(0), d.readUInt32BE(4), d.readUInt32BE(8), d.readUInt32BE(12)];
  if (!(ah | al | bh | bl)) al = 1;
  return () => {
    let xh = ah, xl = al; const yh = bh, yl = bl;
    ah = yh; al = yl;
    xh = (xh ^ ((xh << 23) | (xl >>> 9))) >>> 0; xl = (xl ^ (xl << 23)) >>> 0;
    const x17l = ((xl >>> 17) | (xh << 15)) >>> 0, x17h = xh >>> 17, y26l = ((yl >>> 26) | (yh << 6)) >>> 0, y26h = yh >>> 26;
    bh = (xh ^ yh ^ x17h ^ y26h) >>> 0; bl = (xl ^ yl ^ x17l ^ y26l) >>> 0;
    const lo = bl + yl, carry = lo >= 4294967296 ? 1 : 0;
    return ((bh + yh + carry) >>> 0) / 4294967296;
  };
}
function interval(items, label, clustered) {
  if (items.length < 2) return null;
  const next = generator(label), medians = [];
  for (let r = 0; r < B.resamples; r += 1) {
    const draw = [];
    for (let i = 0; i < items.length; i += 1) { const pick = items[Math.floor(next() * items.length)]; if (clustered) draw.push(...pick); else draw.push(pick); }
    draw.sort((x, y) => x - y);
    medians.push(medianSorted(draw));
  }
  const tail = (1 - B.level) / 2;
  return [quantile(medians, tail), quantile(medians, 1 - tail)];
}
function spread(items, label) { // items: [{ object, value }]
  const ok = items.filter((x) => Number.isFinite(x.value));
  if (!ok.length) return { n: 0 };
  const byObject = new Map();
  for (const x of ok) { if (!byObject.has(x.object)) byObject.set(x.object, []); byObject.get(x.object).push(x.value); }
  const v = ok.map((x) => x.value);
  return { n: v.length, objects: byObject.size, median: quantile(v, 0.5), p10: quantile(v, 0.1), p90: quantile(v, 0.9), ci95Windows: interval(v, `${label}|windows`, false), ci95Objects: byObject.size >= B.objectMinimum ? interval([...byObject.values()], `${label}|objects`, true) : null };
}

/** One table row: windows [{ object, arms: { arm: { ok, bins } } }], the arms, the bins. */
function tableRow(id, label, note, windows, arms, bins) {
  const row = { id, row: label, note, windows: windows.length, objects: new Set(windows.map((w) => w.object)).size, arms: {}, paired: {}, closest: {} };
  for (const arm of arms) {
    const attempted = windows.filter((w) => w.arms?.[arm]).length;
    row.arms[arm] = { attempted, scored: windows.filter((w) => w.arms?.[arm]?.ok).length, bins: Object.fromEntries(bins.map((b) => [b, spread(windows.map((w) => ({ object: w.object, value: w.arms?.[arm]?.ok ? w.arms[arm].bins?.[b]?.rmsKm : undefined })), `B2|${label}|${arm}|${b}`)])) };
  }
  for (const other of arms.filter((x) => x !== 'sdnap')) {
    row.paired[other] = Object.fromEntries(bins.map((b) => {
      const pairs = windows.map((w) => [w.arms?.sdnap?.ok ? w.arms.sdnap.bins?.[b]?.rmsKm : undefined, w.arms?.[other]?.ok ? w.arms[other].bins?.[b]?.rmsKm : undefined]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x > 0);
      if (!pairs.length) return [b, { n: 0 }];
      const ratios = pairs.map(([x, y]) => y / x);
      return [b, { n: pairs.length, sdnapCloser: pairs.filter(([x, y]) => x < y).length / pairs.length, medianRatio: quantile(ratios, 0.5), ci95Windows: interval(ratios, `B2|${label}|${other}/sdnap|${b}|windows`, false) }];
    }));
  }
  for (const b of bins) {
    const c = arms.filter((x) => x !== 'sdnapTruth' && row.arms[x].bins[b].n > 0).map((x) => [x, row.arms[x].bins[b].median]);
    const best = c.length ? Math.min(...c.map(([, m]) => m)) : null;
    row.closest[b] = c.length ? c.filter(([, m]) => m === best).map(([x]) => x) : null;
  }
  return row;
}

const rows = (prefix) => { const dir = path.join(store, 'rows'); return (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort() : []).flatMap((f) => readJsonl(path.join(dir, f))); };

export function build() {
  const out = { experiment: config.experiment, plan: 'experiments/sdn-ap-mixed-screening/PLAN.md', modulesCommit: config.modules.commit, sdnapWasmSha256: config.modules.sdnapWasmSha256, units: 'km, 3D RMS of a horizon bin (part 1: hours after E; part 2: days after T); a cell is over windows', inputs: {}, rows: [] };
  const BINS = ['1', '2', '3'];
  // part 1a
  const st = rows('starlink-score.');
  out.inputs.starlinkScore = sha256(Buffer.from(JSON.stringify(st)));
  const sw = st.filter((r) => r.arms).map((r) => ({ object: String(r.norad), arms: r.arms, maneuverEvident: r.maneuverEvident }));
  if (st.length) {
    out.rows.push(tableRow('starlink-all', 'Starlink, SpaceX operator track (all satellites)', `${st.length} satellites in the forecast cycle; ${sw.length} scored`, sw, ['sdnap', 'sgp4xp'], BINS));
    out.rows.push(tableRow('starlink-quiet', 'Starlink, no maneuver evident', 'truth files agree within 1 km where they overlap', sw.filter((w) => !w.maneuverEvident), ['sdnap', 'sgp4xp'], BINS));
    out.rows.push(tableRow('starlink-forecast', 'Starlink, the forecast sample (SpaceX\'s own forecast beside)', 'sample satellites whose fetched file is F', sw.filter((w) => w.arms.forecast?.ok), ['sdnap', 'sgp4xp', 'forecast'], BINS));
  }
  // part 1b
  const iss = rows('iss.');
  out.inputs.iss = sha256(Buffer.from(JSON.stringify(iss)));
  const iw = iss.filter((r) => r.arms).map((r) => ({ object: 'ISS', arms: r.arms }));
  out.rows.push(tableRow('iss', 'ISS, NASA trajectory files 2020 to 2026', `${iss.length} files; ${iss.filter((r) => r.excluded?.startsWith('planned burn')).length} excluded for a planned burn, ${iss.filter((r) => r.excluded && !r.excluded.startsWith('planned burn')).length} without a newer file in the 72 h; ${iw.length} scored`, iw, ['sdnap', 'sgp4xp', 'sgp4', 'forecast'], BINS));
  out.rows.push(tableRow('iss-forecast', 'ISS, the windows NASA\'s file reaches (forecast beside)', 'windows whose own file holds the truth epochs', iw.filter((w) => w.arms.forecast?.ok), ['sdnap', 'sgp4xp', 'sgp4', 'forecast'], BINS));
  // part 2
  const la = rows('laser.');
  out.inputs.laser = sha256(Buffer.from(JSON.stringify(la)));
  const lw = la.filter((r) => r.arms && !r.arms.error).map((r) => ({ object: r.target, arms: r.arms }));
  out.rows.push(tableRow('laser', 'LEO laser-ranged spheres from ILRS normal points (Starlette, Stella, LARETS, WESTPAC, LARES), 2026-07-16 to 08-30', `${la.length} cutoffs; SDN-AP and SGP4-XP fitted to 24 h of the full force model carried from the normal-point fit (not to the ranges directly)`, lw, ['sdnap', 'sgp4xp', 'ffm', 'sgp4', 'sdnapTruth'], BINS));
  for (const t of config.part2.targets) out.rows.push(tableRow(`laser-${t}`, `Laser, ${t}`, '', lw.filter((w) => w.object === t), ['sdnap', 'sgp4xp', 'ffm', 'sgp4', 'sdnapTruth'], BINS));
  return out;
}

const TABLE = path.join(results, 'table.json');
export const sameAsCommitted = (t) => fs.existsSync(TABLE) && fs.readFileSync(TABLE, 'utf8') === `${JSON.stringify(t, null, 2)}\n`;
const km = (v) => (v == null ? '' : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3));
const cell = (s) => (!s?.n ? '-' : `${km(s.median)} (${km(s.p10)} to ${km(s.p90)}) [${s.ci95Windows ? `${km(s.ci95Windows[0])}, ${km(s.ci95Windows[1])}` : '-'}] n ${s.n}`);

export function markdown(t) {
  const o = ['# B2: SDN-AP from operator ephemerides and from observations (parts 1 and 2)', ''];
  o.push(`Generated by \`node experiments/sdn-ap-mixed-screening/table.mjs\` from the stored rows; plan: [PLAN.md](../../experiments/sdn-ap-mixed-screening/PLAN.md). Modules at ${t.modulesCommit.slice(0, 12)}, SDN-AP build ${t.sdnapWasmSha256.slice(0, 12)}.`, '');
  o.push('A cell is the median over windows of a bin\'s 3D RMS (km), the 10th and 90th percentiles in parentheses, the 95 % bootstrap interval of the median over windows in brackets, and the windows scored. Part 1 bins are hours after E, (0, 24], (24, 48], (48, 72]; part 2 bins are days after T. SDN-AP in part 2 is fitted to 24 h of the full force model carried from the normal-point fit, not to the ranges directly.', '');
  if (!t.rows.some((r) => r.id.startsWith('starlink'))) o.push('Part 1a (Starlink, prospective) is scored once the capture cycles reach 72 h after E (from 2026-10-28 21:00Z); its rows are not in this table yet. Parts 3 and 4 are registered by amendment.', '');
  for (const r of t.rows) {
    o.push(`## ${r.row}`, '', r.note ? `${r.note}.` : '', '', '| Arm | Scored / attempted | Bin 1 | Bin 2 | Bin 3 |', '| --- | --: | --- | --- | --- |');
    for (const [arm, a] of Object.entries(r.arms)) o.push(`| ${NAMES[arm]} | ${a.scored} / ${a.attempted} | ${['1', '2', '3'].map((b) => cell(a.bins[b])).join(' | ')} |`);
    o.push('', `Closest by bin: ${['1', '2', '3'].map((b) => `${b}: ${r.closest[b] ? r.closest[b].map((x) => NAMES[x]).join(', ') : '-'}`).join('; ')}.`, '');
    const p = Object.entries(r.paired).filter(([, v]) => Object.values(v).some((x) => x.n));
    if (p.length) {
      o.push('| Paired with SDN-AP | Bin 1 | Bin 2 | Bin 3 |', '| --- | --- | --- | --- |');
      for (const [other, v] of p) o.push(`| ${NAMES[other]} | ${['1', '2', '3'].map((b) => (v[b].n ? `SDN-AP closer in ${Math.round(100 * v[b].sdnapCloser)} %; other / SDN-AP ${km(v[b].medianRatio)}${v[b].ci95Windows ? ` [${km(v[b].ci95Windows[0])}, ${km(v[b].ci95Windows[1])}]` : ''} (n ${v[b].n})` : '-')).join(' | ')} |`);
      o.push('');
    }
  }
  return o.join('\n');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const t = build();
  if (args.check) { const same = sameAsCommitted(t); console.error(same ? 'B2 table: PASS (same as committed)' : 'B2 table: differs from committed'); process.exit(same ? 0 : 1); }
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, `${JSON.stringify(t, null, 2)}\n`);
  fs.writeFileSync(path.join(results, 'README.md'), markdown(t));
  console.error(`B2 table: ${t.rows.length} rows`);
}
