// FSA table (PLAN.md, Scoring and statistics; Families; Storms; False-positive rate and power): every registered cell from the stored
// rows with XM's cluster bootstrap (XM3's cellStats, copied with two changes: the interval levels 97.5 % and 95 % both computed, and this
// experiment's seed label), the families tested in their fixed order, the false-positive rates of results/ffm-short-arc/false-positive.json
// (fpr.mjs) beside every statement, the splits beside (span, orbit group, P's age, storms), the fits, the window counts; written to
// results/ffm-short-arc/table.json and README.md, the README opening with a plain-words reading generated from the verdicts. Deterministic:
// no times. Statistics only.
//   node experiments/ffm-short-arc/table.mjs            write table.json and README.md
//   node experiments/ffm-short-arc/table.mjs --check    rebuild and compare with the committed files byte for byte
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, build, store, results, readJsonl, sha256, ms, DAY, frozen, REGISTRATION } from './common.mjs';

frozen();
const LEADS = config.scoring.leadDays;
const DRAWS = config.statistics.bootstrap.draws;
const LEVELS = config.statistics.bootstrap.levels;
const L0 = config.statistics.bootstrap.primaryLevel;
const LN110 = Math.log(1.10);
const rowsDir = path.join(store, 'rows');
const TABLE = path.join(results, 'table.json'), README = path.join(results, 'README.md'), FPR = path.join(results, 'false-positive.json');
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
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const stormInArc = (row) => [1, 2, 3].some((k) => STORMS.has(dayOf(ms(row.cutoff) - k * DAY)));
const stormInForecast = (row, lead) => { for (let k = 0; k < lead; k += 1) if (STORMS.has(dayOf(ms(row.cutoff) + k * DAY))) return true; return false; };

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
  setWithin6h: (row) => !!row.set && row.set.creationAgeHours <= 6,
};
const metBy = (c, form, level) => { const r = c?.rules?.[level] ?? {}; return form === 'xm' ? !!c?.pass?.[level] : form === 'rule1' ? !!r.medianBelow0 : form === 'prediction-above0' ? !!r.medianAbove0 : false; };

export async function buildTable(rows = storedRows()) {
  const spansOf = { P: config.verdictPool.P, S1: config.verdictPool.S1 };
  const cells = [];
  const cell = (group, spanLabel, spans, clusters, arm, ref, lead, split = 'all', subset = rows) => {
    const pairs = pairsOf(subset, group, spans, clusters, arm, ref, lead, SPLITS[split] ?? (() => true));
    const c = { group, span: spanLabel, split, clusters, arm, ref, lead, ...cellStats(pairs, `FSA|${group}|${spanLabel}|${split}|${arm}/${ref}|${lead}|${clusters}`) };
    cells.push(c);
    return c;
  };
  const ages = rows.filter((r) => r.group === 'P' && r.set && !r.error && !r.excluded).map((r) => r.set.ageHours).sort((a, b) => a - b);
  const tercile = ages.length ? [ages[Math.floor(ages.length / 3)], ages[Math.floor(2 * ages.length / 3)]] : null;
  if (tercile) { SPLITS.ageYoung = (r) => !!r.set && r.set.ageHours < tercile[0]; SPLITS.ageMiddle = (r) => !!r.set && r.set.ageHours >= tercile[0] && r.set.ageHours < tercile[1]; SPLITS.ageOld = (r) => !!r.set && r.set.ageHours >= tercile[1]; }
  const clustersOf = (group) => [...new Set(rows.filter((r) => r.group === group).map((r) => r.cluster))].sort();
  for (const group of Object.keys(spansOf)) for (const [arm, ref] of CONTRASTS) for (const lead of LEADS) {
    for (const clusters of ['week', 'orbit']) cell(group, 'pool', spansOf[group], clusters, arm, ref, lead);
    if (group === 'P') for (const s of spansOf.P) cell(group, s, [s], 'week', arm, ref, lead);
    for (const cl of clustersOf(group)) cell(group, 'pool', spansOf[group], 'week', arm, ref, lead, `cluster:${cl}`, rows.filter((r) => r.cluster === cl));
    for (const split of Object.keys(SPLITS).filter((s) => s !== 'all')) cell(group, 'pool', spansOf[group], 'week', arm, ref, lead, split);
  }
  const find = (group, arm, ref, lead, clusters = 'week', span = 'pool', split = 'all') => cells.find((c) => c.group === group && c.arm === arm && c.ref === ref && c.lead === lead && c.clusters === clusters && c.span === span && c.split === split);
  const fpr = fs.existsSync(FPR) ? JSON.parse(fs.readFileSync(FPR, 'utf8')) : null;
  const families = {};
  for (const [fam, statements] of Object.entries(config.families)) {
    if (!Array.isArray(statements)) continue;
    const group = fam === 'P' ? 'P' : 'S1';
    let open = true;
    families[fam] = statements.map((s) => {
      const per = s.leads.map((lead) => { const c = find(group, s.arm, s.ref, lead); return { lead, met: metBy(c, s.form, L0), pairs: c?.pairs ?? 0, clusters: c?.clusterCount ?? 0, medianRatioPercent: c?.medianRatioPercent ?? null, ciMedianD: c?.intervals?.[L0]?.ciMedianD ?? null, p95Ratio: c?.p95Ratio ?? null, ciLnP95Ratio: c?.intervals?.[L0]?.ciLnP95Ratio ?? null, failures: c?.armFailures ?? null, rules: c?.rules?.[L0] ?? null }; });
      const passed = per.every((p) => p.met);
      const tested = open;
      const status = !tested ? 'not tested' : s.form === 'prediction-above0' ? (passed ? 'confirmed' : 'not confirmed') : passed ? 'PASS' : 'FAIL';
      if (tested && !passed) open = false;
      const beside = { at95: s.leads.every((lead) => metBy(find(group, s.arm, s.ref, lead), s.form, 0.95)), orbitWeek: s.leads.every((lead) => metBy(find(group, s.arm, s.ref, lead, 'orbit'), s.form, L0)) };
      const f = fpr?.statements?.[s.id];
      const falsePositive = f ? { leastFavorable: f.leastFavorable, singleLeadRule1: Object.fromEntries(s.leads.map((lead) => [lead, { week: f.rates[`week|single-rule1@day${lead}`]?.percent?.[L0] ?? null, orbit: f.rates[`orbit|single-rule1@day${lead}`]?.percent?.[L0] ?? null }])), spans: f.spans, draws: fpr.draws } : null;
      const printed = s.id === 'S2' ? { day7NoLoss: !!find(group, s.arm, s.ref, 7)?.rules?.[L0]?.medianUpperBelowLn110, day7: find(group, s.arm, s.ref, 7)?.medianRatioPercent ?? null, day7Ci: find(group, s.arm, s.ref, 7)?.intervals?.[L0]?.ciMedianD ?? null } : s.id === 'S1' ? { rule2ByLead: LEADS.map((lead) => ({ lead, met: !!find(group, s.arm, s.ref, lead)?.rules?.[L0]?.p95RatioBelow110, bound: find(group, s.arm, s.ref, lead)?.intervals?.[L0]?.ciLnP95Ratio?.[1] ?? null })) } : undefined;
      return { ...s, tested, status, passed, perLead: per, beside, falsePositive, printed };
    });
  }
  const counts = {};
  for (const [span, s] of Object.entries(config.spans)) { const rs = rows.filter((r) => r.span === span); counts[span] = { expected: s.windows, stored: rs.length, excluded: rs.filter((r) => r.excluded).length, errors: rs.filter((r) => r.error).length, noSet: rs.filter((r) => r.noSet).length, noXp2Row: rs.filter((r) => r.noXp2Row).length }; }
  const fits = {};
  for (const group of Object.keys(spansOf)) for (const cl of clustersOf(group)) for (const name of Object.keys(config.arms).filter((a) => config.arms[a].kind === 'ffm')) {
    const arms = rows.filter((r) => r.group === group && r.cluster === cl && r.arms?.[name]).map((r) => r.arms[name]);
    const fitted = arms.filter((a) => a.fit), conv = fitted.filter((a) => a.fit.termination === 'CONVERGED');
    const param = (a, kind) => a.fit.parameters?.find((q) => q.kind === kind)?.value;
    const causes = {}; for (const a of arms) if (a.ok === false && !a.notRun) { const e = String(a.error).slice(0, 60); causes[e] = (causes[e] || 0) + 1; }
    fits[`${group}|${cl}|${name}`] = { group, cluster: cl, arm: name, windows: arms.length, notRun: arms.filter((a) => a.notRun).length, fits: fitted.length, converged: conv.length, failed: arms.filter((a) => a.ok === false && !a.notRun).length, causes, medianRounds: finiteMedian(conv.map((a) => a.fit.iterations)), mostRounds: conv.length ? Math.max(...conv.map((a) => a.fit.iterations)) : null, bAtBound: conv.filter((a) => a.fit.boundStatus?.[0]).length, agomAtBound: conv.filter((a) => a.fit.boundStatus?.[1]).length, medianB: finiteMedian(conv.map((a) => param(a, 'DRAG_AREA_OVER_MASS'))), medianAgom: finiteMedian(conv.map((a) => param(a, 'SRP_AREA_OVER_MASS'))) };
  }
  // The verdicts of the table code exactly as registered (ea70019), run unchanged on the same rows (results/ffm-short-arc/verdicts-registered.json):
  // printed beside the corrected code's; where they differ, the registered code's verdict is the one on record and the corrected one is exploratory.
  const REG = path.join(results, 'verdicts-registered.json');
  const registered = fs.existsSync(REG) ? JSON.parse(fs.readFileSync(REG, 'utf8')) : null;
  const verdictComparison = registered ? Object.values(families).flat().map((s) => { const r = registered.verdicts[s.id]; return { id: s.id, registered: r?.status ?? 'absent', corrected: s.status, same: r?.status === s.status, perLeadSame: !!r && JSON.stringify(r.perLeadMet) === JSON.stringify(s.perLead.map((p) => ({ lead: p.lead, met: p.met }))) }; }) : null;
  const pAge = rows.filter((r) => r.group === 'P' && r.set).map((r) => r.set.ageHours).sort((a, b) => a - b);
  const sAge = rows.filter((r) => r.group === 'S1' && r.set).map((r) => r.set.ageHours).sort((a, b) => a - b);
  const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : null);
  return { experiment: config.id, task: config.task, registration: REGISTRATION, modulesCommit: build.modulesCommit, rowsDigest: sha256(rows.map(comparableRow).join('\n')).slice(0, 12), rows: rows.length, windows: counts, levels: { verdict: `${L0 * 100} %`, beside: '95 %' }, clusters: { verdict: 'ISO week', beside: 'orbit group x ISO week' }, ageTercilesHours: tercile, publicSetAgeHours: { P: med(pAge), S1: med(sAge) }, families, registeredCode: registered ? { code: registered.code, codeSha256: registered.codeSha256, rowsDigest: registered.rowsDigest, comparison: verdictComparison, allSame: verdictComparison.every((c) => c.same && c.perLeadSame) } : null, fits, falsePositive: fpr ? { file: 'results/ffm-short-arc/false-positive.json', method: fpr.method, draws: fpr.draws } : 'not yet computed', cells };
}

// ---- README ---------------------------------------------------------------------------------------------------------------------
const pct1 = (x) => (x == null || typeof x === 'string' ? '-' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}`);
const ciPct = (v) => (v ? `[${v.map((x) => (typeof x === 'number' ? ((Math.exp(x) - 1) * 100).toFixed(1) : x)).join(', ')}]` : '-');
const boundOf = (v) => (typeof v?.[1] === 'number' ? Math.exp(v[1]).toFixed(3) : v?.[1] ?? '-');
const fmt = (x, d = 1) => (x == null || typeof x === 'string' ? (x ?? '-') : Number(x).toFixed(d));

export function render(t) {
  const find = (group, arm, ref, lead, clusters = 'week', span = 'pool', split = 'all') => t.cells.find((c) => c.group === group && c.arm === arm && c.ref === ref && c.lead === lead && c.clusters === clusters && c.span === span && c.split === split);
  const row4 = (group, arm, ref, span = 'pool', split = 'all', clusters = 'week', label = null) => { const cs = LEADS.map((l) => find(group, arm, ref, l, clusters, span, split)); return `| ${label ?? `${arm} / ${ref}`}${split !== 'all' ? ` (${split.replace('cluster:', '')})` : ''}${span !== 'pool' ? ` (${span})` : ''}${clusters !== 'week' ? ' (orbit x week)' : ''} | ${cs.map((c) => `${pct1(c?.medianRatioPercent)} ${ciPct(c?.intervals?.[L0]?.ciMedianD)}`).join(' | ')} | ${cs.map((c) => boundOf(c?.intervals?.[L0]?.ciLnP95Ratio)).join(', ')} | ${cs[0]?.pairs ?? 0}, ${cs[0]?.clusterCount ?? 0} |`; };
  const head = '| | Day 1 | Day 2 | Day 3 | Day 7 | p95 upper bound | Pairs, clusters |\n|---|---|---|---|---|---|---|';
  const st = Object.fromEntries(Object.values(t.families).flat().map((s) => [s.id, s]));
  const leadsText = (s) => s.perLead.map((p) => `${pct1(p.medianRatioPercent)} %`).join(', ');
  const out = [];
  out.push('# FSA: FFM with a short fit arc on unseen 2025 windows\n');
  // plain-words reading, generated from the verdicts
  const P1 = st.P1, P2 = st.P2, P3 = st.P3, P4 = st.P4, P5 = st.P5, P6 = st.P6, S1 = st.S1, S2 = st.S2, S3 = st.S3;
  const verdictWord = (s) => (s.status === 'PASS' ? 'passed' : s.status === 'FAIL' ? 'failed' : s.status);
  out.push('## Reading\n');
  out.push(`On ${t.rows} windows of 2025 where no FFM forecast had been scored before (${t.windows.primary.stored} on Swarm A, B, C and GRACE-FO 1, 2 at cutoffs ${config.spans.primary.from} to ${config.spans.primary.to}; ${t.windows.extension.stored} on Swarm A, B, C at ${config.spans.extension.from} to ${config.spans.extension.to}; ${t.windows.s1.stored} on Sentinel-1A and 1C at ${config.spans.s1.from} to ${config.spans.s1.to}), the registered statements read as follows, at ${t.levels.verdict} on ISO-week clusters, each tested only if the earlier statements of its family passed.\n`);
  out.push(`- **P1 ${verdictWord(P1)}.** FFM with NRLMSISE-00 fitted to the last 12 h of precise truth (A12) against the public set under SGP4 (P) by XM's three-condition rule at days 1, 2, 3, 7: median change ${leadsText(P1)}; p95 upper bounds ${P1.perLead.map((p) => boundOf(p.ciLnP95Ratio)).join(', ')} against 1.100; failures ${P1.perLead.map((p) => p.failures).join(', ')} of ${P1.perLead[0].pairs} pairs. ${P1.status === 'PASS' ? 'The 12 h fit beats the public set at every lead, median and tail, on dates never scored, with zero-latency truth-quality input.' : P1.status === 'FAIL' ? `It fails at ${P1.perLead.filter((p) => !p.met).map((p) => `day ${p.lead} (${Object.entries(p.rules ?? {}).filter(([k, v]) => ['medianBelow0', 'p95RatioBelow110', 'failuresAtMost1pc'].includes(k) && !v).map(([k]) => k).join(', ')})`).join('; ')}; no pass.` : ''}`);
  out.push(`- **P2 ${verdictWord(P2)}.** A12 against the 72 h fit (F2), rule 1 at days 1, 2, 3: ${leadsText(P2)}, intervals ${P2.perLead.map((p) => ciPct(p.ciMedianD)).join(', ')}. ${P2.status === 'PASS' ? 'The arc, not the model, was F2\'s fault at days 1 to 3: the same model and fit on 12 h beats itself on 72 h.' : P2.status === 'FAIL' ? 'The 12 h arc does not beat the 72 h arc at every one of days 1 to 3.' : 'Not tested: an earlier statement of the family failed.'}`);
  out.push(`- **P3 ${verdictWord(P3)}.** A12 with its arc ending when the public set was created (A12c, equal data age) against P, XM's rule: ${leadsText(P3)}, p95 upper bounds ${P3.perLead.map((p) => boundOf(p.ciLnP95Ratio)).join(', ')}. The clock: S17LPc against P ${LEADS.map((l) => pct1(find('P', 'S17LPc', 'P', l)?.medianRatioPercent)).join(', ')} % with intervals ${LEADS.map((l) => ciPct(find('P', 'S17LPc', 'P', l)?.intervals?.[L0]?.ciMedianD)).join(', ')} (holding 0 means creation time is P's information time). ${P3.status === 'PASS' ? 'The lead survives equal data age, on better data.' : P3.status === 'FAIL' ? 'On equal data age the lead is not shown at every lead by the whole rule; the cells say where.' : 'Not tested.'}`);
  out.push(`- **P4 ${verdictWord(P4)}.** A24 against P, XM's rule: ${leadsText(P4)}, p95 upper bounds ${P4.perLead.map((p) => boundOf(p.ciLnP95Ratio)).join(', ')}.`);
  out.push(`- **P5 ${verdictWord(P5)}.** A12 against F2 at day 7, rule 1: ${leadsText(P5)}, interval ${ciPct(P5.perLead[0].ciMedianD)}. ${P5.status === 'PASS' ? 'The short arc also wins the long lead against the 72 h fit on drag-strong objects.' : P5.status === 'FAIL' ? 'The 72 h arc\'s B still pays at day 7; the interval is printed.' : 'Not tested.'}`);
  out.push(`- **P6 ${verdictWord(P6)}.** A24c against P, XM's rule: ${leadsText(P6)}, p95 upper bounds ${P6.perLead.map((p) => boundOf(p.ciLnP95Ratio)).join(', ')}.`);
  out.push(`- **S1 ${verdictWord(S1)}.** On Sentinel-1, A24 against P, rule 1 at days 1, 2, 3: ${leadsText(S1)}, intervals ${S1.perLead.map((p) => ciPct(p.ciMedianD)).join(', ')}. The tail rule there is printed and not tested: bounds ${S1.printed.rule2ByLead.map((r) => (typeof r.bound === 'number' ? Math.exp(r.bound).toFixed(3) : '-')).join(', ')}.`);
  out.push(`- **S2 ${verdictWord(S2)}.** A24 against F2 on Sentinel-1, rule 1 at days 1, 2, 3: ${leadsText(S2)}; day 7 ${pct1(S2.printed.day7)} % ${ciPct(S2.printed.day7Ci)} (no-loss reading ${S2.printed.day7NoLoss ? 'met' : 'not met'}, not a rule).`);
  out.push(`- **S3 ${S3.status}.** The registered prediction of a loss: A12 against F2 at day 7 on Sentinel-1 wholly above 0: ${leadsText(S3)}, interval ${ciPct(S3.perLead[0].ciMedianD)}. ${S3.status === 'confirmed' ? 'The 12 h arc loses the long lead where drag is weak: the arc rule\'s reason replicates on unseen windows.' : 'The rule\'s reason is not shown on these windows; the rule stands as registered.'}\n`);
  const fp = (s) => (s.falsePositive ? `${fmt(s.falsePositive.leastFavorable.week?.[L0])} (orbit x week ${fmt(s.falsePositive.leastFavorable.orbit?.[L0])})` : 'not computed');
  out.push(`What it means and does not mean: every fitted arm read truth-quality precise products, which are not real-time, and P is the public set available at the cutoff; a pass at the cutoff reading answers the theory-and-fit question with zero-latency precise truth, and the parity reading (P3, P6) removes the data age, not the data quality. No result here changes a module, the console default or a public claim; it is not a catalog claim (catalog objects have public sets, not precise states) and not a console claim (operator ephemerides have their own latency and quality). The public set's median age at the cutoff is ${fmt(t.publicSetAgeHours.P, 2)} h on the group-P pool and ${fmt(t.publicSetAgeHours.S1, 2)} h on Sentinel-1; the youngest-third cells are printed beside the verdicts. Storm windows (a GFZ Ap of at least 40 in the 72 h before the cutoff) are inside every verdict cell and split beside it.\n`);
  out.push(`Task \`${t.task}\`. Registered before any fresh score: commit ${t.registration.slice(0, 10)} (\`experiments/ffm-short-arc/PLAN.md\`). Modules ${t.modulesCommit.slice(0, 9)}, every wasm SHA-256 checked; no module changed. Rows digest ${t.rowsDigest}; ${t.rows} stored windows (${Object.entries(t.windows).map(([s, c]) => `${s} ${c.stored} of ${c.expected}, ${c.excluded} excluded, ${c.errors} with a row error`).join('; ')}); P and S17LPc equal XP2's stored rows on every group-P window (the run's guard). Medians are percent change in the 3D RMS position error at days 1, 2, 3, 7 with ${t.levels.verdict} percentile intervals on ISO-week clusters unless marked; "p95 upper bound" is the upper bound of the interval of the p95 ratio (rule 2 asks below 1.100).\n`);
  out.push(`## Verdicts: two fixed sequences\n\n| Id | Contrast | Form | Leads | Status at ${t.levels.verdict}, ISO week | 95 %; orbit group x week | False-positive rate on these dates, % (whole statement, least favorable null, ${t.levels.verdict}; orbit x week) | Per lead: median %, interval, p95 upper bound, failures |\n|---|---|---|---|---|---|---|---|`);
  for (const s of Object.values(t.families).flat()) out.push(`| ${s.id} | ${s.arm} / ${s.ref} | ${s.form} | ${s.leads.join(', ')} | ${s.status} | ${s.beside.at95 ? 'meets' : 'misses'}, ${s.beside.orbitWeek ? 'meets' : 'misses'} | ${fp(s)}${s.falsePositive ? `; single-lead rule 1 by lead ${s.leads.map((l) => fmt(s.falsePositive.singleLeadRule1[l]?.week)).join(', ')}` : ''} | ${s.perLead.map((p) => `d${p.lead}: ${pct1(p.medianRatioPercent)} ${ciPct(p.ciMedianD)} ${boundOf(p.ciLnP95Ratio)} ${p.failures ?? ''}`).join('; ')} |`);
  out.push(`\nFalse-positive rates: ${typeof t.falsePositive === 'string' ? t.falsePositive : `${t.falsePositive.method} (${t.falsePositive.draws} draws; ${t.falsePositive.file}).`} The first construction (fpr.mjs and power.mjs as registered) scaled each simulated span to its own median, which makes a pass impossible and every rate 0 by construction (PLAN.md, amendment 2); the rates printed are the corrected construction's.\n`);
  if (t.registeredCode) {
    out.push(`### Verdicts by the table code as registered, beside the corrected code's\n\nThe registered table code (${t.registeredCode.code}; SHA-256 ${t.registeredCode.codeSha256.slice(0, 16)}; rows digest ${t.registeredCode.rowsDigest}) and the corrected code (this file) on the same rows. Where they differ, the registered code's verdict is the one on record and the corrected code's is exploratory. ${t.registeredCode.allSame ? 'Every statement\'s status and every per-lead decision are the same under both.' : 'They differ on the statements marked.'}\n\n| Id | Registered code | Corrected code | Same status | Same per-lead decisions |\n|---|---|---|---|---|`);
    for (const c of t.registeredCode.comparison) out.push(`| ${c.id} | ${c.registered} | ${c.corrected}${c.same ? '' : ' (exploratory)'} | ${c.same ? 'yes' : 'NO'} | ${c.perLeadSame ? 'yes' : 'NO'} |`);
    out.push('');
  }
  for (const group of ['P', 'S1']) {
    out.push(`## Group ${group}: the registered contrasts, ${group === 'P' ? 'the pool' : 'Sentinel-1'}\n\n${head}`);
    for (const [arm, ref] of CONTRASTS) out.push(row4(group, arm, ref));
    out.push('');
    out.push(`### Group ${group} beside: 95 %, orbit group x week, spans, orbit groups, P's age, storms\n\n${head}`);
    for (const [arm, ref] of [['A12', 'P'], ['A12', 'F2'], ['A12c', 'P'], ['A24', 'P'], ['A24', 'F2'], ['F2', 'P']]) {
      out.push(row4(group, arm, ref, 'pool', 'all', 'orbit'));
      if (group === 'P') for (const s of config.verdictPool.P) out.push(row4(group, arm, ref, s));
      for (const split of ['stormArc', 'noStormArc', 'stormForecast', 'quiet', 'setWithin6h', 'ageYoung', 'ageMiddle', 'ageOld']) if (t.cells.some((c) => c.split === split && c.group === group)) out.push(row4(group, arm, ref, 'pool', split));
      for (const cl of [...new Set(t.cells.filter((c) => c.group === group && c.split.startsWith('cluster:')).map((c) => c.split))]) out.push(row4(group, arm, ref, 'pool', cl));
    }
    out.push('');
  }
  out.push(`## Fits\n\n| Group | Orbit group | Arm | Windows | Not run | Fits | CONVERGED | Failed | Causes | Median rounds | Most rounds | B at 0 | AGOM at 0 | Median B | Median AGOM |\n|---|---|---|--:|--:|--:|--:|--:|---|--:|--:|--:|--:|--:|--:|`);
  for (const f of Object.values(t.fits)) out.push(`| ${f.group} | ${f.cluster} | ${f.arm} | ${f.windows} | ${f.notRun} | ${f.fits} | ${f.converged} | ${f.failed} | ${Object.entries(f.causes).map(([k, v]) => `${v} ${k}`).join('; ') || '-'} | ${fmt(f.medianRounds, 0)} | ${f.mostRounds ?? '-'} | ${f.bAtBound} | ${f.agomAtBound} | ${fmt(f.medianB, 5)} | ${fmt(f.medianAgom, 5)} |`);
  out.push(`\nP's age terciles (hours at the cutoff): ${t.ageTercilesHours ? t.ageTercilesHours.map((x) => x.toFixed(2)).join(', ') : '-'}. A failed fit is a loss in its cells (d = +Infinity); an arm not run (arc coverage below 90 %, or no public set) leaves them, counted.\n`);
  out.push(`## Disclosures\n\n- The arcs and the arc rule were chosen from XM6's spent-window cells; the power simulation (experiments/ffm-short-arc/power.json) was computed from spent rows before the registration. These dates were analyzed before for other questions (PLAN.md, Previously analyzed): XP2's FFM fits for XP's drag, C2's covariance fits, E13's and the open-DCA test's development split. The open-DCA registered test's fresh dates overlap this experiment's extension at different cutoffs; its rows were not opened.\n- table.mjs, fpr.mjs and power.mjs were committed before the run and corrected after it only where running them on the stored rows found defects: the false-positive null is fixed once from the full set of windows and the simulated spans drawn from that scaled set (PLAN.md, amendment 2; the first construction scaled each simulated span to its own median, which made a pass impossible and the rate 0 by construction). No cell definition, rule, tolerance or statement changed, and no verdict was read before the correction. Every number is a module output or a statistic of module outputs.\n- Results use every dataset the run read; only aggregates are published. Space-Track.org GP element sets stay in the local store. ESA Swarm precise orbits (SP3 COM); GFZ ISDC GRACE-FO rapid science orbits; contains modified Copernicus Sentinel data 2025 (Sentinel-1 POEORB). GFZ Kp, ap, Ap and F10.7: CC BY 4.0, Matzka et al. (2021), doi:10.5880/Kp.0001. NOAA SWPC RSGA: US Government work. IERS EOP (finals.all): IERS Earth Orientation Center. JPL DE440s: NASA JPL.\n`);
  out.push(`## Reproduction\n\n\`\`\`\nexport SDN_MODULES_ROOT=<stack>/repos/main-packages/space-data-network-modules\nnode experiments/ffm-short-arc/run.mjs --prepare\nFSA_PROOF=1 node experiments/ffm-short-arc/run.mjs --proof\nnode experiments/ffm-short-arc/run.mjs --launch 8\nnode experiments/ffm-short-arc/fpr.mjs --shard k/8 --out <file>; node experiments/ffm-short-arc/fpr.mjs --merge <files>\nnode experiments/ffm-short-arc/table.mjs\nnode experiments/ffm-short-arc/run.mjs --check\n\`\`\`\n`);
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
