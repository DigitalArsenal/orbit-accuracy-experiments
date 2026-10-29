// Parts 3 and 4 of B2 as A2, A4, A5 and A6 define them. Part 3: covariance realism cells from the lead records. Part 4: synthetic encounters
// with real errors: per group and secondary class, A2's geometry and A6's frame and draw order, the primary predicted by FFM and by SGP4-XP
// (each with its own covariance) and the operator forecast (miss distance only); Pc by analysis/conjunction-assessment compute_pc (FOSTER,
// 20 m); the rates, the Pc calibration, the paired differences FFM - SGP4-XP with intervals over encounters and object clusters, A5's Pc calls
// and confusion matrices, and the verdict. Drawing, rotating records into the synthetic encounter, counting and resampling only.
import crypto from 'node:crypto';
import * as flatbuffers from 'flatbuffers';
import { CQR, CQRT, CQRProbabilityRequestT, CQRPlaneGeometryT, cqrProbabilityAlgorithm } from 'spacedatastandards.org/lib/js/CQR/main.js';
import { config } from '../common.mjs';

const A4 = config.a4, CA = config.a5.ca, MET = A4.metrics, BOOT = A4.bootstrap;
export const LEADS = A4.encounters.leadHours;
export const ARMS = CA.arms; // ['ffm', 'sgp4xp']
const CHI2_3_95 = 7.814727903251178; // the 95 % quantile of chi-square with 3 degrees of freedom

/** xorshift128+ (23, 17, 26) seeded by SHA-256 of the label, the high 32 bits as a float in [0, 1) (table.mjs's generator). */
export function generator(label) {
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
const quantile = (values, q) => { const a = values.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); };

/** Percentile bootstrap (A4: 10,000 resamples, xorshift128+ seeded by the label) of a statistic of column sums: `columns` are per-item
 *  values, `stat(sums)` the statistic; items are resampled, or their clusters when `cluster[i]` names each item's cluster. */
export function sumsInterval(columns, stat, label, cluster = null) {
  const k = columns.length, items = columns[0].length;
  const groups = cluster ? [...cluster.reduce((m, c, i) => m.set(c, [...(m.get(c) ?? []), i]), new Map()).values()] : null;
  const n = groups ? groups.length : items;
  if (n < 2) return null;
  const units = columns.map((col) => (groups ? Float64Array.from(groups, (g) => g.reduce((s, i) => s + col[i], 0)) : Float64Array.from(col)));
  const next = generator(label), stats = [], sums = new Float64Array(k);
  for (let r = 0; r < BOOT.resamples; r += 1) {
    sums.fill(0);
    for (let i = 0; i < n; i += 1) { const j = Math.floor(next() * n); for (let c = 0; c < k; c += 1) sums[c] += units[c][j]; }
    const v = stat(sums);
    if (Number.isFinite(v)) stats.push(v);
  }
  if (!stats.length) return null;
  const tail = (1 - BOOT.level) / 2;
  return [quantile(stats, tail), quantile(stats, 1 - tail)];
}
const ratio = ([a, b]) => (b > 0 ? a / b : NaN);
export const ratioInterval = (num, den, label, cluster = null) => sumsInterval([num, den], ratio, label, cluster);

// ---- part 3 ----
/** Realism cells (A2 part 3, V1c5's rule) from samples [{ object, d2 }] of one covariance, group and lead. */
export function realismCell(samples, label) {
  const ok = samples.filter((s) => Number.isFinite(s.d2));
  const objects = new Set(ok.map((s) => s.object));
  if (!ok.length) return { n: 0, objects: 0, decision: 'INSUFFICIENT' };
  const v = ok.map((s) => s.d2 / 3), cover = ok.map((s) => (s.d2 <= CHI2_3_95 ? 1 : 0));
  const mean = v.reduce((a, b) => a + b, 0) / v.length, coverage = cover.reduce((a, b) => a + b, 0) / cover.length;
  const cluster = ok.map((s) => s.object);
  const enough = ok.length >= 30 && objects.size >= 3;
  return {
    n: ok.length, objects: objects.size, meanD2Over3: mean, ci95Objects: objects.size >= 2 ? ratioInterval(v, v.map(() => 1), `${label}|objects`, cluster) : null, medianD2Over3: quantile(v, 0.5),
    coverage95: coverage, ci95CoverageObjects: objects.size >= 2 ? ratioInterval(cover, cover.map(() => 1), `${label}|coverage|objects`, cluster) : null,
    decision: !enough ? 'INSUFFICIENT' : mean >= 0.8 && mean <= 1.25 && coverage >= 0.93 && coverage <= 0.97 ? 'REALISTIC' : 'NOT REALISTIC',
  };
}

// ---- part 4 ----
const rtnToEncounter = (u) => [[0, u[0], -u[1]], [0, u[1], u[0]], [1, 0, 0]]; // rows x, y, z; columns R = z, T = u, N = z x u
const mulVec = (M, e) => M.map((row) => row[0] * e[0] + row[1] * e[1] + row[2] * e[2]);
const unpackSym = (p) => [[p[0], p[1], p[3]], [p[1], p[2], p[4]], [p[3], p[4], p[5]]]; // pair_statistics' packed lower triangle (RR, TR, TT, NR, NT, NN)
const congruence = (M, C) => { const MC = M.map((r) => [0, 1, 2].map((j) => r[0] * C[0][j] + r[1] * C[1][j] + r[2] * C[2][j])); return MC.map((r) => [0, 1, 2].map((j) => r[0] * M[j][0] + r[1] * M[j][1] + r[2] * M[j][2])); };

/** compute_pc of analysis/conjunction-assessment: Foster's 2D Pc on the encounter plane (meters, square meters). */
export function pcClient(ca) {
  return async (xi, zeta, cxx, cxz, czz) => {
    const b = new flatbuffers.Builder(256), record = new CQRT();
    record.PROBABILITY_REQUEST = new CQRProbabilityRequestT(new CQRPlaneGeometryT(xi, zeta, cxx, cxz, czz, MET.hardBodyRadiusM), cqrProbabilityAlgorithm.FOSTER);
    CQR.finishCQRBuffer(b, record.pack(b));
    const response = await ca.invoke('compute_pc', [{ portId: 'request', typeRef: { schemaName: 'CQR.fbs', fileIdentifier: '$CQR', rootTypeName: 'CQR', wireFormat: 'flatbuffer' }, payload: b.asUint8Array() }]);
    return CQR.getRootAsCQR(new flatbuffers.ByteBuffer(new Uint8Array(response.outputs[0].payload))).unpack().PROBABILITY_RESULT.PROBABILITY;
  };
}

/** The encounters of one group and class. windows: [{ object, key, leads: { L: { ffm, sgp4xp, forecast, gp } } }] (lead records, km). */
export async function encounters(group, cls, windows, pc, { limit = A4.encounters.perGroupAndClass, extraArms = [] } = {}) {
  // extraArms (A13 part 5 point 1): further covariance arms evaluated on the same encounters; the pools stay A5's (the registered pair)
  const has = (w, L, arm) => w.leads[L]?.[arm] && (arm === 'forecast' || Array.isArray(w.leads[L][arm].cov));
  const primaries = Object.fromEntries(LEADS.map((L) => [L, windows.filter((w) => ARMS.every((arm) => has(w, L, arm)))]));
  const secondaries = Object.fromEntries(LEADS.map((L) => [L, cls === 'gp' ? windows.filter((w) => has(w, L, 'gp')) : primaries[L]]));
  const out = [], counts = { attempted: limit, noPrimary: 0, noSecondary: 0 };
  for (let k = 0; k < limit; k += 1) {
    const next = generator(`B2|part4|${group}|${cls}|${k}`);
    const L = LEADS[Math.floor(next() * LEADS.length)];
    if (!primaries[L].length) { counts.noPrimary += 1; continue; } // each encounter has its own generator: a skipped one moves no other
    const p = primaries[L][Math.floor(next() * primaries[L].length)];
    const pool = cls === 'precise' ? secondaries[L].filter((w) => w.object !== p.object) : secondaries[L];
    const u = next();
    if (!pool.length) { counts.noSecondary += 1; continue; }
    const s = pool[Math.floor(u * pool.length)];
    const theta = (10 + 160 * next()) * Math.PI / 180, missM = Math.exp(Math.log(10) + next() * (Math.log(10000) - Math.log(10))), phi = 2 * Math.PI * next();
    const up = [Math.cos(theta / 2), -Math.sin(theta / 2), 0], us = [Math.cos(theta / 2), Math.sin(theta / 2), 0];
    const Mp = rtnToEncounter(up), Ms = rtnToEncounter(us), m = [missM * Math.cos(phi), 0, missM * Math.sin(phi)];
    const row = { k, L, primary: p.key, primaryObject: p.object, secondary: s.key, secondaryObject: s.object, thetaDeg: theta * 180 / Math.PI, trueMissM: missM, arms: {} };
    for (const arm of [...ARMS, ...extraArms, ...CA.missOnly]) {
      const ep = p.leads[L][arm], es = cls === 'gp' ? s.leads[L].gp : s.leads[L][arm];
      if (!ep || !es || (arm !== 'forecast' && (!Array.isArray(ep.cov) || !Array.isArray(es.cov)))) continue;
      const dp = mulVec(Mp, ep.err), ds = mulVec(Ms, es.err);
      const r = [0, 1, 2].map((i) => m[i] + 1000 * (ds[i] - dp[i]));
      const predicted = Math.hypot(r[0], r[2]);
      if (CA.missOnly.includes(arm)) { row.arms[arm] = { predictedMissM: predicted }; continue; }
      const C = [congruence(Mp, unpackSym(ep.cov)), congruence(Ms, unpackSym(es.cov))].reduce((a, c) => a.map((rr, i) => rr.map((x, j) => x + c[i][j])));
      const plane = [r[0], r[2], C[0][0] * 1e6, C[0][2] * 1e6, C[2][2] * 1e6];
      try { row.arms[arm] = { predictedMissM: predicted, pc: await pc(...plane) }; } catch (error) { row.arms[arm] = { predictedMissM: predicted, pc: null, pcError: String(error.message).replace(/^.*compute_pc: /, '').slice(0, 160), plane }; }
    }
    out.push(row);
  }
  return { rows: out, counts };
}

const callOf = (pcv) => (pcv >= CA.calls.red ? 'red' : pcv >= CA.calls.green ? 'yellow' : 'green');
const truthClass = (m) => (m < CA.truthClassesKm[0] * 1000 ? 'under 200 m' : m <= CA.truthClassesKm[1] * 1000 ? '200 m to 5 km' : 'above 5 km');

/** Every registered figure of one group and class from its encounter rows; an encounter with an arm whose Pc the module could not evaluate
 *  is counted and left out for both arms (A7). */
export function summarize(group, cls, allRows, counts, { leads = LEADS } = {}) {
  const failed = allRows.filter((r) => ARMS.some((arm) => r.arms[arm]?.pc == null));
  const rows = allRows.filter((r) => !failed.includes(r));
  counts = { ...counts, formed: allRows.length, pcNotEvaluated: Object.fromEntries(ARMS.map((arm) => [arm, failed.filter((r) => r.arms[arm]?.pc == null).length])), leftOut: failed.length };
  const seed = (metric, kind) => `B2|A4|${group}|${cls}|${metric}|${kind}`;
  const cluster = rows.map((r) => r.primaryObject);
  const objects = new Set(cluster).size;
  const ind = (f) => rows.map((r) => (f(r) ? 1 : 0));
  const ones = rows.map(() => 1);
  const both = (metric, num, den) => ({ value: den.reduce((a, b) => a + b, 0) ? num.reduce((a, b) => a + b, 0) / den.reduce((a, b) => a + b, 0) : null, ci95Encounters: ratioInterval(num, den, seed(metric, 'encounters')), ci95Objects: objects >= 2 ? ratioInterval(num, den, seed(metric, 'objects'), cluster) : null });
  const hit = (r) => r.trueMissM < MET.hitKm * 1000, near = (r) => r.trueMissM < MET.nearKm * 1000, far = (r) => r.trueMissM > MET.farKm * 1000;
  const out = { group, class: cls, encounters: rows.length, objects, counts, arms: {}, paired: {}, calls: {} };
  for (const arm of [...ARMS, ...CA.missOnly]) {
    const used = rows.filter((r) => r.arms[arm]);
    const err = used.map((r) => r.arms[arm].predictedMissM - r.trueMissM);
    out.arms[arm] = { encounters: used.length, missErrorM: { median: quantile(err, 0.5), p10: quantile(err, 0.1), p90: quantile(err, 0.9) } };
    if (CA.missOnly.includes(arm)) continue;
    const pcv = (r) => r.arms[arm].pc, alert = (r) => pcv(r) >= MET.alertPc, quiet = (r) => pcv(r) < MET.quietPc;
    Object.assign(out.arms[arm], {
      missedAlert: both(`missedAlert:${arm}`, ind((r) => quiet(r) && hit(r)), ones),
      falseAlert: both(`falseAlert:${arm}`, ind((r) => alert(r) && far(r)), ones),
      recall: both(`recall:${arm}`, ind((r) => alert(r) && hit(r)), ind(hit)),
      precision: both(`precision:${arm}`, ind((r) => alert(r) && near(r)), ind(alert)),
      pcCalibration: A4.pcBins.slice(0, -1).map((lo, i) => { const hi = A4.pcBins[i + 1], inBin = rows.filter((r) => pcv(r) >= lo && (i === A4.pcBins.length - 2 ? pcv(r) <= hi : pcv(r) < hi)); return { pc: [lo, hi], encounters: inBin.length, hitShare: inBin.length ? inBin.filter(hit).length / inBin.length : null }; }),
    });
  }
  // the paired differences FFM - SGP4-XP of each rate on the same encounters, intervals over encounters and over object clusters
  const [a, b] = ARMS;
  const pc = (r, arm) => r.arms[arm].pc;
  const diff = (metric, columns, stat) => {
    const sums = columns.map((c) => c.reduce((x, y) => x + y, 0));
    return { value: stat(sums), ci95Encounters: sumsInterval(columns, stat, seed(`${metric}:${a}-${b}`, 'encounters')), ci95Objects: objects >= 2 ? sumsInterval(columns, stat, seed(`${metric}:${a}-${b}`, 'objects'), cluster) : null };
  };
  const col = (f) => rows.map((r) => (f(r) ? 1 : 0));
  const of = (arm) => ({ quiet: (r) => pc(r, arm) < MET.quietPc, alert: (r) => pc(r, arm) >= MET.alertPc });
  const [A, B] = [of(a), of(b)];
  const rateDiff = ([x, y, n]) => (n > 0 ? (x - y) / n : NaN), shareDiff = ([x, dx, y, dy]) => (dx > 0 && dy > 0 ? x / dx - y / dy : NaN);
  out.paired[`${a}-${b}`] = {
    missedAlert: diff('missedAlert', [col((r) => A.quiet(r) && hit(r)), col((r) => B.quiet(r) && hit(r)), ones], rateDiff),
    falseAlert: diff('falseAlert', [col((r) => A.alert(r) && far(r)), col((r) => B.alert(r) && far(r)), ones], rateDiff),
    recall: diff('recall', [col((r) => A.alert(r) && hit(r)), col(hit), col((r) => B.alert(r) && hit(r)), col(hit)], shareDiff),
    precision: diff('precision', [col((r) => A.alert(r) && near(r)), col(A.alert), col((r) => B.alert(r) && near(r)), col(B.alert)], shareDiff),
  };
  const pm = out.paired[`${a}-${b}`];
  const interval = (x) => [x.ci95Encounters, x.ci95Objects];
  const nowhereAbove = interval(pm.missedAlert).every((c) => c && c[1] <= 0), whollyBelow = interval(pm.falseAlert).every((c) => c && c[1] < 0);
  out.verdict = nowhereAbove && whollyBelow ? 'FFM makes a CA difference' : 'no demonstrated CA difference';
  if (objects < 2) out.verdictReason = 'one primary object: no object-cluster interval';
  // A5's Pc calls per lead and arm (part 5 has one lead, 'all')
  for (const L of leads) {
    const atL = rows.filter((r) => r.L === L);
    out.calls[L] = {};
    for (const arm of ARMS) {
      const matrix = {};
      for (const r of atL) { const c = callOf(r.arms[arm].pc), t = truthClass(r.trueMissM); matrix[c] ??= {}; matrix[c][t] = (matrix[c][t] ?? 0) + 1; }
      const s = (metric, num, den) => ({ value: den.reduce((x, y) => x + y, 0) ? num.reduce((x, y) => x + y, 0) / den.reduce((x, y) => x + y, 0) : null, ci95Encounters: ratioInterval(num, den, `B2|A5|${group}|${cls}|${L}|${arm}|${metric}`) });
      const red = atL.map((r) => (callOf(r.arms[arm].pc) === 'red' ? 1 : 0));
      out.calls[L][arm] = {
        encounters: atL.length, matrix,
        redFar: s('redFar', atL.map((r, i) => (red[i] && far(r) ? 1 : 0)), red),
        hitGreen: s('hitGreen', atL.map((r) => (hit(r) && callOf(r.arms[arm].pc) === 'green' ? 1 : 0)), atL.map((r) => (hit(r) ? 1 : 0))),
      };
    }
  }
  return out;
}


// ---- A13 (parts 1, 4 and 5): proper scores of Pc against the hit indicator, their paired differences, the reliability table ----
const HIT_M = MET.hardBodyRadiusM; // a hit: true miss under 20 m (A13 part 1 point 4)
const CLIP = 1e-15;
/** Brier and log scores per arm, paired differences against SGP4-XP and against FFM with A5's covariance, and the Pc reliability table by
 *  decade (A4's pcBins), with A4's intervals over encounters and primary objects, seeds B2|A13|<group>|<class>|<metric>[|<a>-<b>]|<kind>. */
export function a13Scores(group, cls, rows, arms) {
  const seed = (metric, kind, pair) => `B2|A13|${group}|${cls}|${metric}|${pair ? `${pair}|` : ''}${kind}`;
  const hit = (r) => (r.trueMissM < HIT_M ? 1 : 0);
  const pcOf = (r, arm) => r.arms[arm]?.pc;
  const ok = (r, arm) => Number.isFinite(pcOf(r, arm));
  const brier = (p, h) => (p - h) ** 2;
  const logLoss = (p, h) => { const q = Math.min(Math.max(p, CLIP), 1 - CLIP); return -(h * Math.log(q) + (1 - h) * Math.log(1 - q)); };
  const clipped = (p) => p < CLIP || p > 1 - CLIP;
  const meanCI = (values, cluster, metric, pair) => {
    const ones = values.map(() => 1), objects = new Set(cluster).size;
    return { value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, n: values.length,
      ci95Encounters: values.length >= 2 ? ratioInterval(values, ones, seed(metric, 'encounters', pair)) : null,
      ci95Objects: objects >= 2 ? ratioInterval(values, ones, seed(metric, 'objects', pair), cluster) : null };
  };
  const out = { hitM: HIT_M, clip: CLIP, arms: {}, paired: {}, reliability: {} };
  for (const arm of arms) {
    const used = rows.filter((r) => ok(r, arm)), cluster = used.map((r) => r.primaryObject);
    const unclipped = used.filter((r) => !clipped(pcOf(r, arm)));
    out.arms[arm] = {
      encounters: used.length, hits: used.filter(hit).length, pcNotEvaluated: rows.length - used.length,
      brier: meanCI(used.map((r) => brier(pcOf(r, arm), hit(r))), cluster, `brier:${arm}`),
      log: meanCI(used.map((r) => logLoss(pcOf(r, arm), hit(r))), cluster, `log:${arm}`),
      clipped: used.length - unclipped.length,
      logUnclipped: meanCI(unclipped.map((r) => logLoss(pcOf(r, arm), hit(r))), unclipped.map((r) => r.primaryObject), `logUnclipped:${arm}`),
    };
    out.reliability[arm] = A4.pcBins.slice(0, -1).map((lo, i) => {
      const hi = A4.pcBins[i + 1], inBin = used.filter((r) => { const p = pcOf(r, arm); return p >= lo && (i === A4.pcBins.length - 2 ? p <= hi : p < hi); });
      const h = inBin.map(hit);
      return { pc: [lo, hi], encounters: inBin.length, meanPc: inBin.length ? inBin.reduce((a, r) => a + pcOf(r, arm), 0) / inBin.length : null, hitShare: inBin.length ? h.reduce((a, b) => a + b, 0) / inBin.length : null,
        ci95Encounters: inBin.length >= 2 ? ratioInterval(h, h.map(() => 1), seed(`reliability:${arm}:${lo}`, 'encounters')) : null };
    });
  }
  // paired differences (arm minus reference) on the encounters both evaluated: against SGP4-XP and against FFM with A5's covariance
  for (const ref of ['sgp4xp', 'ffm']) for (const arm of arms.filter((a) => a !== ref && !(ref === 'ffm' && a === 'sgp4xp'))) {
    const both = rows.filter((r) => ok(r, arm) && ok(r, ref)), cluster = both.map((r) => r.primaryObject), pair = `${arm}-${ref}`;
    out.paired[pair] = {
      encounters: both.length,
      brier: meanCI(both.map((r) => brier(pcOf(r, arm), hit(r)) - brier(pcOf(r, ref), hit(r))), cluster, 'brier', pair),
      log: meanCI(both.map((r) => logLoss(pcOf(r, arm), hit(r)) - logLoss(pcOf(r, ref), hit(r))), cluster, 'log', pair),
    };
  }
  return out;
}

/** Part 3 cells of a calibrated covariance under C2's pass rule (A13 part 5 point 6): mean d2/3 in [0.8, 1.25] and 95 % coverage in
 *  [0.93, 0.97]; a cell with fewer than 100 windows or 3 clusters (objects) is not eligible. samples [{ object, d2 }]. */
export function realismCellC2(samples, label) {
  const c = realismCell(samples, label);
  const eligible = c.n >= 100 && c.objects >= 3;
  return { ...c, decision: !eligible ? `not eligible (${[c.n < 100 ? 'n < 100' : null, c.objects < 3 ? 'clusters < 3' : null].filter(Boolean).join(', ')})` : c.meanD2Over3 >= 0.8 && c.meanD2Over3 <= 1.25 && c.coverage95 >= 0.93 && c.coverage95 <= 0.97 ? 'pass' : 'fail' };
}
