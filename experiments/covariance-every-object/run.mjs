// Part 2 acceptance runner. `--check`: each item prints PASS, FAIL, PENDING or NOT EVALUABLE; exit 0 unless an item FAILs.
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

const PENDING = (why) => ({ status: 'PENDING', reason: why });
if (process.argv[1] && process.argv[1].endsWith('run.mjs') && process.argv.includes('--check')) {
  const items = {
    a: acceptanceA(),
    b: PENDING('n0 rows need Part 1 dev rows and the dev pairs'),
    c: PENDING('admission needs Part 1 truth moments'),
    d: PENDING('denominator provenance audit runs on the dev pair build'),
    e: PENDING('Part 1 frozen-constants.json not yet committed'),
    f: PENDING('no daily files before 2026-11-10'),
    g: { S2_1: 'PENDING', S2_2: 'PENDING', S2_3: 'PENDING' },
  };
  console.log(JSON.stringify(items, null, 2));
  process.exit(Object.values(items).some((x) => x.status === 'FAIL') ? 1 : 0);
}
