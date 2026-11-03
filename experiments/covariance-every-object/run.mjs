// Part 2 acceptance runner. `--check`: each item prints PASS, FAIL, PENDING or NOT EVALUABLE; exit 0 unless an item FAILs.
import fs from 'node:fs'; import crypto from 'node:crypto';
import { TRUTH, C2_HELD_NORADS } from './lib/hold.mjs';
import { synthRows } from './lib/s2-synth.mjs';
import { evalS21, s21Null, s21Power, evalS22, evalS23 } from './lib/s2.mjs';
import { rng, normal, synthP } from './lib/synth.mjs';
import { floorCov, minGenEig, dFactors, uHat, encounterBasis, project } from './lib/inflate.mjs';

export function acceptanceA() {
  const r = rng(20261103), U = [-Math.log(4), 0, Math.log(2), Math.log(4)];
  const N = 1000, tol = 1e-12, sq = (M) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => M[i][j]));
  let minFull = Infinity, minPlane = Infinity, maxRho = 0, badEq = 0, nLe0 = 0, estBase = 0, estLe0 = 0, shrinkDP = 0;
  const angles = Array.from({ length: 17 }, (_, i) => ((i + 1) * 10 * Math.PI) / 180);
  for (let o = 0; o < N; o++) {
    const { P, maxRho: mr } = synthP(r, [0.5, 0.8, 0.9, 0.945][o % 4]);
    maxRho = Math.max(maxRho, mr);
    const u = [0, 1, 2].map(() => U[Math.floor(r() * 4)]);
    const d = dFactors(u), Po = floorCov(P, d);
    minFull = Math.min(minFull, minGenEig(P, Po));
    for (const th of angles) { const B = encounterBasis(th); minPlane = Math.min(minPlane, minGenEig(project(sq(P), B), project(sq(Po), B))); }
    if (u.every((x) => x <= 0)) { nLe0++; if (P.some((row, i) => row.some((x, j) => x !== Po[i][j]))) badEq++; }
    // reporting only: the estimator on a synthetic 40-pair history per axis, and whether plain D P D would shrink
    const uh = u.map((uu) => { const a = 1, r2 = [], aa = []; for (let k = 0; k < 40; k++) { r2.push(a * Math.exp(uu) * normal(r) ** 2); aa.push(a); } return uHat(r2, aa, 20); });
    if (u.every((x) => x <= 0)) { estLe0++; if (uh.every((x) => x <= 0)) estBase++; }
    const DPD = P.map((row, i) => row.map((x, j) => x * d[i] * d[j]));
    if (minGenEig(P, DPD) < 1 - 1e-9) shrinkDP++;
  }
  const pass = minFull >= 1 - tol && minPlane >= 1 - tol && badEq === 0 && maxRho <= 0.95 + 1e-9 && maxRho >= 0.9;
  return { status: pass ? 'PASS' : 'FAIL', objects: N, minEigFull: minFull, minEigEncounterPlane: minPlane, crossingAnglesDeg: '10..170 step 10', maxAbsRho: maxRho,
    plantedLe0Objects: nLe0, plantedLe0NotEqualBase: badEq, report: { estimatorBaseShareAtPlantedLe0: estLe0 ? estBase / estLe0 : null, objectsWhereDPDAloneWouldShrink: shrinkDP } };
}

if (process.argv[1]?.endsWith('run.mjs') && process.argv.includes('--day')) {
  const { runDay } = await import('./daily.mjs'), i = process.argv.indexOf('--day'), l = process.argv.indexOf('--limit');
  console.log(JSON.stringify(await runDay(process.argv[i + 1], l > 0 ? Number(process.argv[l + 1]) : 0), null, 1)); process.exit(0);
}
export function acceptanceD() {
  const here = new URL('.', import.meta.url).pathname, repo = here.replace(/experiments\/covariance-every-object\/$/, '');
  const au = JSON.parse(fs.readFileSync(`${repo}results/covariance-every-object/provenance-audit.json`)), fails = [];
  const sha = crypto.createHash('sha256').update(fs.readFileSync(`${here}truth-objects.json`)).digest('hex');
  if (sha !== au.truthObjectsSha256) fails.push('truth-objects.json differs from the audited file');
  for (const k of ['catalogRows', 'freshRows', 'c2CalibrationRowsFromCutoff', 'c2HeldObjectRows', 'issRowsFromHold', 'swarmGraceRowsFromHold', 'outsideSpanRows', 'nsgfOrHeldPaths']) if (au[k] !== 0) fails.push(`${k}=${au[k]}`);
  for (const o of TRUTH.objects) {
    if (C2_HELD_NORADS.has(o.norad) || /TerraSAR|Stella|Sentinel-1D|LAGEOS-1\b|Galileo|nsgf/i.test(o.name)) fails.push(`held object in table: ${o.name}`);
    if (o.c2cal && o.to >= '2026-06-01') fails.push(`${o.name} span reaches the C2 cutoff`);
    if (o.cluster === 'iss' && o.to >= '2025-01-01') fails.push('ISS span reaches 2025');
  }
  return { status: fails.length ? 'FAIL' : 'PASS', pairRows: au.pairRows, droppedByPredicate: au.dropped, heldRowsRetained: 0, fails };
}
export async function acceptanceB() {
  const repo = new URL('../../', import.meta.url).pathname, res = `${repo}results/covariance-every-object/`, f = JSON.parse(fs.readFileSync(`${res}n0-rows.json`));
  const AR = '/opt/data/sdn-archive/covariance-every-object/dev-pairs';
  if (!fs.existsSync(AR)) return { status: 'PENDING', reason: 'dev pairs under AR absent on this machine; the committed rows are not recomputed' };
  const { loadPairs, simulate, blockDays } = await import('./lib/n0sim.mjs');
  const den = JSON.parse(fs.readFileSync(`${res}denominators.json`)).strata, a = Object.fromEntries(Object.entries(den).map(([k, v]) => [k, v.a_RTN_m2]));
  const adm = new Set(Object.entries(JSON.parse(fs.readFileSync(`${res}admission.json`)).cells).flatMap(([c, v]) => v.filter((x) => x.admittedBySD).map((x) => `${c}|${x.axis}`)));
  const objs = loadPairs(AR, TRUTH), rows = simulate(objs, a, { seed: f.seed, histories: f.histories, L: f.blockDays, adm });
  const worst = Math.max(...rows.map((r, i) => Math.max(Math.abs(r.pFlagU0 - f.rows[i].pFlagU0), Math.abs(r.medianRatioAtLn4 - f.rows[i].medianRatioAtLn4))));
  const failing = rows.filter((r) => !(r.pFlagU0 <= 0.05 && r.medianRatioAtLn4 >= 0.8 && r.medianRatioAtLn4 <= 1.25));
  if (worst > 0.005) return { status: 'FAIL', reason: `recomputed rows differ from the frozen seed's rows by ${worst}` };
  return failing.length ? { status: 'REPORT-ONLY', maxDifference: worst, provisional: f.status, failingRows: failing } : { status: 'PASS', maxDifference: worst };
}
export function acceptanceF() {
  const repo = new URL('../../', import.meta.url).pathname, res = `${repo}results/covariance-every-object/`, bad = [];
  for (const x of fs.readdirSync(res, { recursive: true })) { const p = res + x; if (fs.statSync(p).isFile() && /"norad"|"gpId"|"MEAN_MOTION"/.test(fs.readFileSync(p, 'utf8'))) bad.push(x); }
  const man = fs.existsSync(`${res}manifest.json`) ? JSON.parse(fs.readFileSync(`${res}manifest.json`)) : {}, mism = [];
  for (const [file, h] of Object.entries(man)) { const p = `/opt/data/sdn-archive/covariance-every-object/daily/${file}`; if (fs.existsSync(p) && crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') !== h) mism.push(file); }
  return { status: bad.length || mism.length ? 'FAIL' : 'PASS', perObjectValueFiles: bad, manifestMismatches: mism, dailyFilesListed: Object.keys(man).length };
}
export function s2Code() {
  const strong = synthRows({ erraticShare: 0.2, erraticScale: 2 }), none = synthRows({ erraticShare: 0, seed: 9 });
  const nullFP = s21Null(none.map((r) => ({ ...r, flagged: r.cluster === 'c0' ? true : false })), { perms: 100, inner: 100 }), power = s21Power(strong, { reps: 60, inner: 100 });
  const s22 = evalS22(strong, { B: 500 }), s21r = evalS21(strong, { B: 500, nullPower: { falsePositive: nullFP, power } }), s23 = evalS23([{ name: 'synthetic', rows: strong.map((r) => ({ ...r })), o1b: false }]);
  const ok = nullFP <= 0.1 && power >= 0.8 && s21r.state === 'PASS' && s22.state === 'PASS';
  return { status: ok ? 'PASS' : 'FAIL', note: 'evaluators exercised on synthetic rows only; no Part 1 row is read', nullFalsePositive: nullFP, power, s21: s21r.state, s22: s22.state, s23: s23.state };
}
export function acceptanceCE() {
  const repo = new URL('../../', import.meta.url).pathname, res = `${repo}results/covariance-every-object/`, fz = JSON.parse(fs.readFileSync(`${res}frozen-constants.json`));
  const bad = fz.admittedBins.afterNullCondition.filter((k) => { const [r, b, ax] = k.split('|'), c = JSON.parse(fs.readFileSync(`${res}admission.json`)).cells[`${r}|${b}`].find((x) => x.axis === ax); return !(c.sd <= 0.35) || !(fz.s2_1.null <= 0.05); });
  const c = { status: bad.length ? 'FAIL' : 'PASS', admitted: fz.admittedBins.afterNullCondition.length, admittedBySD: fz.admittedBins.count, ofAxisCells: fz.admittedBins.of, s21Null: fz.s2_1.null, s21Power: fz.s2_1.power };
  const p = fz.part1FrozenConstantsSha256, e = typeof p === 'object' && p.sha256 ? { status: p.provisional ? 'PROVISIONAL' : 'PASS', sha256: p.sha256, note: p.note } : { status: 'PENDING', reason: 'Part 1 pin absent' };
  return { c, e };
}
const PENDING = (why) => ({ status: 'PENDING', reason: why });
if (process.argv[1] && process.argv[1].endsWith('run.mjs') && process.argv.includes('--check')) {
  const items = {
    a: acceptanceA(),
    b: await acceptanceB(),
    c: acceptanceCE().c,
    d: acceptanceD(),
    e: acceptanceCE().e,
    f: acceptanceF(),
    s2code: s2Code(),
    g: { S2_1: 'PENDING', S2_2: 'PENDING', S2_3: 'PENDING' },
  };
  console.log(JSON.stringify(items, null, 2));
  process.exit(Object.values(items).some((x) => x.status === 'FAIL') ? 1 : 0);
}
