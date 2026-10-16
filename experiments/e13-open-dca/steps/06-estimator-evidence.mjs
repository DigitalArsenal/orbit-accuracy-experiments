// E13 step 06: the evidence for reading a day's drag through the orbital energy (PLAN.md section 4.1), on development arcs only.
// One Dove (hardware id 0505) over its first eight consecutive daily arcs from 2025-10-05, three ways:
//   - the 6-D weighted least squares over both states' stated covariances (arcs.mjs sixDimensionalArc): B, formal sigma, chi-square and
//     the condition number of the mismatch covariance;
//   - the energy form (arcs.mjs energyArc) with the degree-24 lean force profile that production uses;
//   - the energy form with the full force profile (EGM2008 70x70, ocean tides, Earth radiation, five bodies, relativity) on the first
//     `fullArcs` arcs, so the production profile's error is measured against the full one.
// Writes the numbers to the derived store; prints them.
//
//   node steps/06-estimator-evidence.mjs [--hwid 0505] [--arcs 8] [--fullArcs 4]
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, paths, writeJson } from '../common.mjs';
import { arcsOf, readPlanetSeries } from '../planet-history.mjs';
import { openArcEnv } from '../arcs.mjs';

const { values } = parseArgs({ options: { hwid: { type: 'string', default: '0505' }, arcs: { type: 'string', default: '8' }, fullArcs: { type: 'string', default: '4' } } });
const P = config.planet;
const series = readPlanetSeries({ fromDay: '2025-10-05', toDay: '2025-10-20' });
const arcs = arcsOf(series.get(values.hwid), { minHours: P.arc.minHours, maxHours: P.arc.maxHours }).slice(0, Number(values.arcs));
const cr = P.arc.crAreaOverMass, sigma = P.arc.sigma;
const rows = arcs.map((arc) => ({ utcA: arc.a.epochTt, hours: arc.hours, planetCdAreaOverMass: 1 / arc.a.ballisticKgPerM2 }));

for (const [profile, count] of [['g24lean', arcs.length], ['full', Number(values.fullArcs)]]) {
  const env = await openArcEnv({ profile });
  for (const [i, { a, b }] of arcs.slice(0, count).entries()) {
    const A = await env.toUtcGcrf(a), Bs = await env.toUtcGcrf(b), b0 = 1 / a.ballisticKgPerM2;
    const e = await env.energyArc(A, Bs, { b0, cr, sigma });
    rows[i][`energy_${profile}`] = { B: e.B, sigmaB: e.sigmaB, energyMismatchJkg: e.energyMismatchJkg, ffmCalls: e.ffmCalls, seconds: e.seconds };
    if (profile === 'g24lean') {
      const s = await env.sixDimensionalArc(A, Bs, { b0, cr, sigma });
      rows[i].sixD = { B: s.B, sigmaB: s.sigmaB, chi2: s.chi2, dof: s.dof, conditionCy: s.conditionCy, mismatchRtnM: s.mismatchRtnM };
    }
    console.log(`[${profile}] arc ${i} ${a.epochTt.slice(0, 16)}: energy B ${e.B.toFixed(5)} +- ${e.sigmaB.toFixed(5)}${rows[i].sixD ? `, 6-D B ${rows[i].sixD.B.toFixed(5)} +- ${rows[i].sixD.sigmaB.toFixed(5)} chi2 ${rows[i].sixD.chi2.toFixed(0)} cond ${rows[i].sixD.conditionCy.toExponential(2)}` : ''}`);
  }
  await env.destroy();
}
const ratio = rows.filter((r) => r.energy_full).map((r) => r.energy_g24lean.B / r.energy_full.B);
const summary = {
  hwid: values.hwid, arcs: rows.length, from: arcs[0].a.epochTt.slice(0, 10),
  sixD: { minB: Math.min(...rows.map((r) => r.sixD.B)), maxB: Math.max(...rows.map((r) => r.sixD.B)), maxConditionCy: Math.max(...rows.map((r) => r.sixD.conditionCy)), medianChi2: rows.map((r) => r.sixD.chi2).sort((x, y) => x - y)[rows.length >> 1] },
  energy: { minB: Math.min(...rows.map((r) => r.energy_g24lean.B)), maxB: Math.max(...rows.map((r) => r.energy_g24lean.B)) },
  planetOwn: { minB: Math.min(...rows.map((r) => r.planetCdAreaOverMass)), maxB: Math.max(...rows.map((r) => r.planetCdAreaOverMass)) },
  profileG24VsFull: { arcs: ratio.length, ratios: ratio, maxAbsDeviation: Math.max(...ratio.map((x) => Math.abs(x - 1))) },
};
console.log(JSON.stringify(summary, null, 1));
writeJson(path.join(paths.planetArcs, `estimator-evidence-${values.hwid}.json`), { summary, rows });
