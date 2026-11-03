// FSA table (PLAN.md, Scoring and statistics; Families; Storms): every registered cell from the stored rows with XM's cluster bootstrap
// (XM3's cellStats, copied with two changes: the interval levels 97.5 % and 95 % both computed, and this experiment's seed label), the
// families tested in their fixed order, the splits beside (span, orbit group, P's age, storms), the fits, the window counts; written to
// results/ffm-short-arc/table.json and README.md. Deterministic: no times. The false-positive computation on the scored rows (PLAN.md)
// is added before the README's verdicts are read; until then the table says so.
//   node experiments/ffm-short-arc/table.mjs            write table.json and README.md
//   node experiments/ffm-short-arc/table.mjs --check    rebuild and compare with the committed files byte for byte
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, build, store, results, root, readJsonl, sha256, ms, DAY, iso, frozen, REGISTRATION } from './common.mjs';

frozen();
const LEADS = config.scoring.leadDays;
const DRAWS = config.statistics.bootstrap.draws;
const LEVELS = config.statistics.bootstrap.levels;
const LN110 = Math.log(1.10);
const rowsDir = path.join(store, 'rows');
const TABLE = path.join(results, 'table.json'), README = path.join(results, 'README.md');
const CONTRASTS = [['A12', 'P'], ['A12', 'F2'], ['A12c', 'P'], ['A24', 'P'], ['A24c', 'P'], ['A24', 'F2'], ['F2', 'P'], ['W12', 'A12'], ['W12', 'P'], ['A12', 'A24'], ['S17LP', 'P'], ['S17LPc', 'P'], ['A12c', 'S17LPc'], ['A12', 'S17LP']];
const STORMS = new Set(config.storms.days);

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
function select(a, n, kk) {
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) { while (a[i] < pivot) i += 1; while (a[j] > pivot) j -= 1; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i += 1; j -= 1; } }
    if (kk <= j) hi = j; else if (kk >= i) lo = i; else break;
  }
  return a[kk];
}
const between = (x, y, f) => { if (x === y || f === 0) return x; if (x === -Infinity && y === Infinity) return NaN; if (y === Infinity) return Infinity; if (x === -Infinity) return -Infinity; return x + (y - x) * f; };
function quantile(a, n, q) {
  const p = q * (n - 1), lo = Math.floor(p), f = p - lo;
  const x = select(a, n, lo);
  if (f === 0) return x;
  let y = Infinity;
  for (let i = lo + 1; i < n; i += 1) if (a[i] < y) y = a[i];
  return between(x, y, f);
}
const up = (x) => (Number.isNaN(x) ? Infinity : x);
const lnRatio = (a, r) => up(Math.log(a) - Math.log(r));
const finiteMedian = (v) => { const a = v.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const h = Math.floor(a.length / 2); return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
const num = (x) => (Number.isFinite(x) ? x : x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : null);

/** One cell: XM3's cellStats with the intervals at every registered level (percentile (1 - L)/2, (1 + L)/2) and the rules at each. */
function cellStats(pairs, seed) {
  const N = pairs.length;
  const out = { pairs: N, clusterCount: new Set(pairs.map((p) => p.cluster)).size, armFailures: pairs.filter((p) => p.armFailed).length, refFailures: pairs.filter((p) => p.refFailed).length };
  if (!N) return { ...out, rules: {}, pass: {}, why: 'no pairs' };
  const D = Float64Array.from(pairs, (p) => p.d), EA = Float64Array.from(pairs, (p) => p.eArm), ER = Float64Array.from(pairs, (p) => p.eRef);
  const medD = up(quantile(Float64Array.from(D), N, 0.5));
  const lnP95 = lnRatio(quantile(Float64Array.from(EA), N, 0.95), quantile(Float64Array.from(ER), N, 0.95));
  const names = [...new Set(pairs.map((p) => p.cluster))].sort();
  const members = names.map((c) => pairs.flatMap((p, i) => (p.cluster === c ? [i] : [])));
  const C = names.length, cap = C * Math.max(...members.map((x) => x.length));
  const bD = new Float64Array(cap), bA = new Float64Array(cap), bR = new Float64Array(cap);
  const meds = new Float64Array(DRAWS), lrs = new Float64Array(DRAWS);
  const next = generator(seed);
  for (let r = 0; r < DRAWS; r += 1) {
    let m = 0;
    for (let j = 0; j < C; j += 1) for (const i of members[Math.floor(next() * C)]) { bD[m] = D[i]; bA[m] = EA[i]; bR[m] = ER[i]; m += 1; }
    meds[r] = up(quantile(bD, m, 0.5));
    lrs[r] = lnRatio(quantile(bA, m, 0.95), quantile(bR, m, 0.95));
  }
  meds.sort(); lrs.sort();
  const intervals = {}, rules = {}, pass = {};
  for (const L of LEVELS) {
    const ci = (a) => [quantile(a, DRAWS, (1 - L) / 2), quantile(a, DRAWS, (1 + L) / 2)];
    const ciMed = ci(meds), ciLr = ci(lrs);
    intervals[L] = { ciMedianD: ciMed.map(num), ciLnP95Ratio: ciLr.map(num) };
    rules[L] = { medianBelow0: ciMed[1] < 0, p95RatioBelow110: ciLr[1] < LN110, failuresAtMost1pc: out.armFailures <= 0.01 * N, medianAbove0: ciMed[0] > 0, medianUpperBelowLn110: ciMed[1] < LN110 };
    pass[L] = rules[L].medianBelow0 && rules[L].p95RatioBelow110 && rules[L].failuresAtMost1pc;
  }
  return { ...out, medianD: num(medD), medianRatioPercent: Number.isFinite(medD) ? (Math.exp(medD) - 1) * 100 : num(medD), lnP95Ratio: num(lnP95), p95Ratio: Number.isFinite(lnP95) ? Math.exp(lnP95) : num(lnP95),
    medianEArmKm: finiteMedian(pairs.map((p) => p.eArm)), medianERefKm: finiteMedian(pairs.map((p) => p.eRef)), medianAtArmKm: finiteMedian(pairs.map((p) => p.atArm)), medianAtRefKm: finiteMedian(pairs.map((p) => p.atRef)),
    intervals, rules, pass };
}

// ---- rows -----------------------------------------------------------------------------------------------------------------------
export function storedRows() {
  const byKey = new Map();
  for (const f of (fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((x) => /^s\d+\.jsonl$/.test(x)).sort() : [])) for (const r of readJsonl(path.join(rowsDir, f))) if (!byKey.has(r.key) || byKey.get(r.key).defect) byKey.set(r.key, r);
  return [...byKey.values()].sort((x, y) => (x.key < y.key ? -1 : 1));
}
const comparableRow = (r) => JSON.stringify({ key: r.key, arms: r.arms, P: r.P, set: r.set, binEpochs: r.binEpochs, entered: r.entered });
const armOf = (row, name) => (name === 'P' ? row.P : row.arms?.[name]);
const stormInArc = (row) => [1, 2, 3].some((k) => STORMS.has(new Date(ms(row.cutoff) - k * DAY).toISOString().slice(0, 10)));
const stormInForecast = (row, lead) => { for (let k = 0; k < lead; k += 1) if (STORMS.has(new Date(ms(row.cutoff) + k * DAY).toISOString().slice(0, 10))) return true; return false; };

/** The pairs of one cell: rows of the group and spans with a filter; the arm and the reference attempted; failures as XM3. */
function pairsOf(rows, group, spans, clusters, arm, ref, lead, filter = () => true) {
  const out = [];
  for (const row of rows) {
    if (row.group !== group || !spans.includes(row.span) || row.error || row.excluded || !(row.entered ?? []).map(Number).includes(lead) || row.O?.excluded) continue;
    if (!filter(row, lead)) continue;
    const a = armOf(row, arm), r = armOf(row, ref);
    if (!r || r.notRun || !a || a.notRun) continue;
    const armFailed = !a.ok || !a.days?.[lead], refFailed = !r.ok || !r.days?.[lead];
    const eArm = armFailed ? Infinity : a.days[lead].rmsKm, eRef = refFailed ? Infinity : r.days[lead].rmsKm;
    const d = armFailed ? Infinity : refFailed ? -Infinity : Math.log(eArm) - Math.log(eRef);
    out.push({ key: row.key, cluster: clusters === 'week' ? row.isoWeek : `${row.cluster}|${row.isoWeek}`, d, eArm, eRef, armFailed, refFailed, atArm: armFailed ? null : a.days[lead].atKm, atRef: refFailed ? null : r.days[lead].atKm });
  }
  return out.sort((x, y) => (x.key < y.key ? -1 : 1));
}

const SPLITS = {
  all: () => true,
  stormArc: (row) => stormInArc(row), noStormArc: (row) => !stormInArc(row),
  stormForecast: (row, lead) => stormInForecast(row, lead), quiet: (row, lead) => !stormInArc(row) && !stormInForecast(row, lead),
  setWithin6h: (row) => row.set && row.set.creationAgeHours <= 6,
};

export async function buildTable(rows = storedRows()) {
  const spansOf = { P: config.verdictPool.P, S1: config.verdictPool.S1 };
  const cells = [];
  const cell = (group, spanLabel, spans, clusters, arm, ref, lead, split = 'all') => {
    const pairs = pairsOf(rows, group, spans, clusters, arm, ref, lead, SPLITS[split]);
    const c = { group, span: spanLabel, split, clusters, arm, ref, lead, ...cellStats(pairs, `FSA|${group}|${spanLabel}|${split}|${arm}/${ref}|${lead}|${clusters}`) };
    cells.push(c);
    return c;
  };
  // age terciles (group P pool, by P's age at the cutoff) as report-only splits
  const ages = rows.filter((r) => r.group === 'P' && r.set && !r.error && !r.excluded).map((r) => r.set.ageHours).sort((a, b) => a - b);
  const tercile = ages.length ? [ages[Math.floor(ages.length / 3)], ages[Math.floor(2 * ages.length / 3)]] : null;
  if (tercile) { SPLITS.ageYoung = (r) => r.set && r.set.ageHours < tercile[0]; SPLITS.ageMiddle = (r) => r.set && r.set.ageHours >= tercile[0] && r.set.ageHours < tercile[1]; SPLITS.ageOld = (r) => r.set && r.set.ageHours >= tercile[1]; }
  for (const group of Object.keys(spansOf)) for (const [arm, ref] of CONTRASTS) for (const lead of LEADS) {
    for (const clusters of ['week', 'orbit']) cell(group, 'pool', spansOf[group], clusters, arm, ref, lead);
    if (group === 'P') for (const s of spansOf.P) cell(group, s, [s], 'week', arm, ref, lead);
    for (const cl of [...new Set(rows.filter((r) => r.group === group).map((r) => r.cluster))].sort()) { const sub = rows.filter((r) => r.cluster === cl); const pairs = pairsOf(sub, group, spansOf[group], 'week', arm, ref, lead); cells.push({ group, span: 'pool', split: `cluster:${cl}`, clusters: 'week', arm, ref, lead, ...cellStats(pairs, `FSA|${group}|pool|cluster:${cl}|${arm}/${ref}|${lead}|week`) }); }
    for (const split of Object.keys(SPLITS).filter((s) => s !== 'all')) cell(group, 'pool', spansOf[group], 'week', arm, ref, lead, split);
  }
  const find = (group, arm, ref, lead, clusters = 'week', span = 'pool', split = 'all') => cells.find((c) => c.group === group && c.arm === arm && c.ref === ref && c.lead === lead && c.clusters === clusters && c.span === span && c.split === split);
  // the families, in their fixed order (PLAN.md)
  const L0 = config.statistics.bootstrap.primaryLevel;
  const families = {};
  for (const [fam, statements] of Object.entries(config.families)) {
    if (!Array.isArray(statements)) continue;
    const group = fam === 'P' ? 'P' : 'S1';
    let open = true;
    families[fam] = statements.map((s) => {
      const per = s.leads.map((lead) => { const c = find(group, s.arm, s.ref, lead); const r = c?.rules?.[L0] ?? {}; const met = s.form === 'xm' ? !!c?.pass?.[L0] : s.form === 'rule1' ? !!r.medianBelow0 : s.form === 'prediction-above0' ? !!r.medianAbove0 : false; return { lead, met, pairs: c?.pairs ?? 0, medianRatioPercent: c?.medianRatioPercent ?? null, ciMedianD: c?.intervals?.[L0]?.ciMedianD ?? null, ciLnP95Ratio: c?.intervals?.[L0]?.ciLnP95Ratio ?? null, failures: c?.armFailures ?? null }; });
      const passed = per.every((p) => p.met);
      const tested = open;
      const status = !tested ? 'not tested' : s.form === 'prediction-above0' ? (passed ? 'confirmed' : 'not confirmed') : passed ? 'PASS' : 'FAIL';
      if (tested && !passed) open = false;
      const beside = { at95: s.leads.every((lead) => { const c = find(group, s.arm, s.ref, lead); const r = c?.rules?.[0.95] ?? {}; return s.form === 'xm' ? !!c?.pass?.[0.95] : s.form === 'rule1' ? !!r.medianBelow0 : !!r.medianAbove0; }), orbitWeek: s.leads.every((lead) => { const c = find(group, s.arm, s.ref, lead, 'orbit'); const r = c?.rules?.[L0] ?? {}; return s.form === 'xm' ? !!c?.pass?.[L0] : s.form === 'rule1' ? !!r.medianBelow0 : !!r.medianAbove0; }) };
      const printed = s.id === 'S2' ? { day7NoLoss: !!find(group, s.arm, s.ref, 7)?.rules?.[L0]?.medianUpperBelowLn110 } : s.id === 'S1' ? { rule2ByLead: LEADS.map((lead) => ({ lead, met: !!find(group, s.arm, s.ref, lead)?.rules?.[L0]?.p95RatioBelow110 })) } : undefined;
      return { ...s, tested, status, passed, perLead: per, beside, printed };
    });
  }
  // windows and fits
  const counts = {};
  for (const [span, s] of Object.entries(config.spans)) { const rs = rows.filter((r) => r.span === span); counts[span] = { expected: s.windows, stored: rs.length, excluded: rs.filter((r) => r.excluded).length, errors: rs.filter((r) => r.error).length, noSet: rs.filter((r) => r.noSet).length, noXp2Row: rs.filter((r) => r.noXp2Row).length }; }
  const fits = {};
  for (const group of Object.keys(spansOf)) for (const cl of [...new Set(rows.filter((r) => r.group === group).map((r) => r.cluster))].sort()) for (const name of Object.keys(config.arms).filter((a) => config.arms[a].kind === 'ffm')) {
    const arms = rows.filter((r) => r.group === group && r.cluster === cl && r.arms?.[name]).map((r) => r.arms[name]);
    const fitted = arms.filter((a) => a.fit), conv = fitted.filter((a) => a.fit.termination === 'CONVERGED');
    const over = (kind, i) => finiteMedian(conv.map((a) => { const p = a.fit.parameters?.find((q) => q.kind === kind); return p ? p.value : NaN; }).map((v, j) => v / (conv[j].fit.seed?.[i] ?? NaN)));
    fits[`${group}|${cl}|${name}`] = { group, cluster: cl, arm: name, windows: arms.length, notRun: arms.filter((a) => a.notRun).length, fits: fitted.length, converged: conv.length, failed: arms.filter((a) => a.ok === false).length, medianRounds: finiteMedian(conv.map((a) => a.fit.iterations)), mostRounds: conv.length ? Math.max(...conv.map((a) => a.fit.iterations)) : null, bAtBound: conv.filter((a) => a.fit.boundStatus?.[0]).length, agomAtBound: conv.filter((a) => a.fit.boundStatus?.[1]).length, medianB: finiteMedian(conv.map((a) => a.fit.parameters?.find((q) => q.kind === 'DRAG_AREA_OVER_MASS')?.value)), medianAgom: finiteMedian(conv.map((a) => a.fit.parameters?.find((q) => q.kind === 'SRP_AREA_OVER_MASS')?.value)) };
  }
  return { experiment: config.id, task: config.task, registration: REGISTRATION, modulesCommit: build.modulesCommit, rowsDigest: sha256(rows.map(comparableRow).join('\n')).slice(0, 12), rows: rows.length, windows: counts, levels: { verdict: `${L0 * 100} %`, beside: '95 %' }, clusters: { verdict: 'ISO week', beside: 'orbit group x ISO week' }, ageTercilesHours: tercile, families, fits, falsePositive: 'not yet computed: added before the verdicts are read (PLAN.md, False-positive rate and power)', cells };
}

const fmt = (x, d = 1) => (x == null || typeof x === 'string' ? (x ?? '-') : Number(x).toFixed(d));
const pct = (c) => (c?.medianRatioPercent == null || typeof c.medianRatioPercent === 'string' ? '-' : `${c.medianRatioPercent >= 0 ? '+' : ''}${c.medianRatioPercent.toFixed(1)}`);
const ci = (c, L) => { const v = c?.intervals?.[L]?.ciMedianD; return v ? `[${v.map((x) => (typeof x === 'number' ? ((Math.exp(x) - 1) * 100).toFixed(1) : x)).join(', ')}]` : '-'; };
const bound = (c, L) => { const v = c?.intervals?.[L]?.ciLnP95Ratio?.[1]; return typeof v === 'number' ? Math.exp(v).toFixed(3) : v ?? '-'; };

export function render(t) {
  const L0 = config.statistics.bootstrap.primaryLevel;
  const find = (group, arm, ref, lead, clusters = 'week', span = 'pool', split = 'all') => t.cells.find((c) => c.group === group && c.arm === arm && c.ref === ref && c.lead === lead && c.clusters === clusters && c.span === span && c.split === split);
  const line = (group, arm, ref, span = 'pool', split = 'all', clusters = 'week') => { const cs = LEADS.map((l) => find(group, arm, ref, l, clusters, span, split)); return `| ${arm} / ${ref}${split !== 'all' ? ` (${split})` : ''}${span !== 'pool' ? ` (${span})` : ''}${clusters !== 'week' ? ' (orbit x week)' : ''} | ${cs.map((c) => `${pct(c)} ${ci(c, L0)}`).join(' | ')} | ${cs.map((c) => bound(c, L0)).join(', ')} | ${cs[0]?.pairs ?? 0}, ${cs[0]?.clusterCount ?? 0} |`; };
  const head = '| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |\n|---|---|---|---|---|---|---|';
  const out = [];
  out.push(`# FSA: FFM with a short fit arc on unseen 2025 windows\n`);
  out.push(`Task \`${t.task}\`. Registered before any fresh score: commit ${t.registration.slice(0, 10)} (\`experiments/ffm-short-arc/PLAN.md\`). Modules ${t.modulesCommit.slice(0, 9)}, every wasm SHA-256 checked. Rows digest ${t.rowsDigest}; ${t.rows} stored windows (${Object.entries(t.windows).map(([s, c]) => `${s} ${c.stored} of ${c.expected}, ${c.excluded} excluded, ${c.errors} with a row error`).join('; ')}). Medians are percent change in the 3D RMS position error at days 1, 2, 3, 7 with ${t.levels.verdict} percentile intervals on ISO-week clusters unless marked.\n`);
  out.push(`## Verdicts: two fixed sequences\n\n| Id | Contrast | Form | Leads | Status at ${t.levels.verdict}, ISO week | 95 %; orbit group x week | Per lead (median %, interval, p95 upper bound, failures) |\n|---|---|---|---|---|---|---|`);
  for (const [fam, statements] of Object.entries(t.families)) for (const s of statements) out.push(`| ${s.id} | ${s.arm} / ${s.ref} | ${s.form} | ${s.leads.join(', ')} | ${s.status} | ${s.beside.at95 ? 'meets' : 'misses'}, ${s.beside.orbitWeek ? 'meets' : 'misses'} | ${s.perLead.map((p) => `d${p.lead}: ${p.medianRatioPercent == null ? '-' : Number(p.medianRatioPercent).toFixed(1)} ${p.ciMedianD ? `[${p.ciMedianD.map((x) => (typeof x === 'number' ? ((Math.exp(x) - 1) * 100).toFixed(1) : x)).join(', ')}]` : ''} ${p.ciLnP95Ratio ? Math.exp(p.ciLnP95Ratio[1]).toFixed(3) : ''} ${p.failures ?? ''}`).join('; ')}${s.printed ? ` ${JSON.stringify(s.printed)}` : ''} |`);
  out.push(`\nFalse-positive rates: ${t.falsePositive}\n`);
  for (const group of ['P', 'S1']) {
    out.push(`## Group ${group}: the registered contrasts, ${group === 'P' ? 'the pool' : 'Sentinel-1'}\n\n${head}`);
    for (const [arm, ref] of CONTRASTS) out.push(line(group, arm, ref));
    out.push('');
    out.push(`### Group ${group} beside: 95 %, orbit group x week, spans, orbit groups, P's age, storms\n\n${head}`);
    for (const [arm, ref] of [['A12', 'P'], ['A12', 'F2'], ['A12c', 'P'], ['A24', 'P'], ['A24', 'F2']]) {
      out.push(line(group, arm, ref, 'pool', 'all', 'orbit'));
      if (group === 'P') for (const s of config.verdictPool.P) out.push(line(group, arm, ref, s));
      for (const split of ['stormArc', 'noStormArc', 'stormForecast', 'quiet', 'setWithin6h', 'ageYoung', 'ageMiddle', 'ageOld']) if (t.cells.some((c) => c.split === split && c.group === group)) out.push(line(group, arm, ref, 'pool', split));
      for (const cl of [...new Set(t.cells.filter((c) => c.group === group && c.split.startsWith('cluster:')).map((c) => c.split))]) out.push(line(group, arm, ref, 'pool', cl));
    }
    out.push('');
  }
  out.push(`## Fits\n\n| Group | Orbit group | Arm | Windows | Not run | Fits | CONVERGED | Failed | Median rounds | Most rounds | B at 0 | AGOM at 0 | Median B | Median AGOM |\n|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|`);
  for (const f of Object.values(t.fits)) out.push(`| ${f.group} | ${f.cluster} | ${f.arm} | ${f.windows} | ${f.notRun} | ${f.fits} | ${f.converged} | ${f.failed} | ${fmt(f.medianRounds, 0)} | ${f.mostRounds ?? '-'} | ${f.bAtBound} | ${f.agomAtBound} | ${fmt(f.medianB, 5)} | ${fmt(f.medianAgom, 5)} |`);
  out.push(`\nP's age terciles (hours at the cutoff): ${t.ageTercilesHours ? t.ageTercilesHours.map((x) => x.toFixed(2)).join(', ') : '-'}.\n`);
  out.push(`## Reproduction\n\n\`\`\`\nSDN_MODULES_ROOT=<stack>/repos/main-packages/space-data-network-modules node experiments/ffm-short-arc/run.mjs --prepare\nFSA_PROOF=1 SDN_MODULES_ROOT=... node experiments/ffm-short-arc/run.mjs --proof\nSDN_MODULES_ROOT=... node experiments/ffm-short-arc/run.mjs --launch 8\nSDN_MODULES_ROOT=... node experiments/ffm-short-arc/table.mjs\nSDN_MODULES_ROOT=... node experiments/ffm-short-arc/run.mjs --check\n\`\`\`\n`);
  return `${out.join('\n')}\n`;
}

export function sameAsCommitted(t) {
  const want = `${JSON.stringify(t, null, 1)}\n`;
  return fs.existsSync(TABLE) && fs.readFileSync(TABLE, 'utf8') === want && fs.existsSync(README) && fs.readFileSync(README, 'utf8') === render(t);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const t = await buildTable();
  if (process.argv.includes('--check')) { if (!sameAsCommitted(t)) { console.error('table.json or README.md differs from the rebuild'); process.exit(1); } console.log(`table.json and README.md rebuilt byte for byte (rows digest ${t.rowsDigest})`); process.exit(0); }
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, `${JSON.stringify(t, null, 1)}\n`);
  fs.writeFileSync(README, render(t));
  console.log(`wrote ${TABLE} and ${README}: rows digest ${t.rowsDigest}, ${t.cells.length} cells`);
}
