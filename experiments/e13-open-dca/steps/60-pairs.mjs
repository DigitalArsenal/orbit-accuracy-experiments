// E13 step 60: Part S measurements on SpaceX's files (PLAN.md Amendment S1) from the collector's derived pair records:
//   S1 the mismatch between a version's first state and the previous version's prediction, against the previous version's stated sigma;
//   S2 planned = executed thrust, on the pairs whose previous version plans a net energy gain;
//   S3 the cadence of the versions;  S4 Method A (head fit) against Method B (the energy between two start states).
//
//   node steps/60-pairs.mjs [--out FILE] [--through ISO]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { quantile } from '../../../harness/stats.mjs';
import { H, STORE, config, paths, readJson } from '../common.mjs';
import { boot, weightedQuantile } from '../score.mjs';

const { values } = parseArgs({ options: { out: { type: 'string' }, through: { type: 'string' } } });
const sampleFile = readJson(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'sample.json'));
const through = values.through ? Date.parse(values.through) : Infinity;
const pairs = [];
if (fs.existsSync(paths.pairs)) for (const dir of fs.readdirSync(paths.pairs)) for (const f of fs.readdirSync(path.join(paths.pairs, dir))) {
  const rec = readJson(path.join(paths.pairs, dir, f));
  if (rec.kind === 'e13-pair' && Date.parse(rec.t1) <= through) pairs.push(rec);
}
const seen = new Set(), unique = pairs.filter((p) => { const k = `${p.norad}|${p.t1}`; if (seen.has(k)) return false; seen.add(k); return true; });
const consecutive = unique.filter((p) => p.hoursBetween >= 5 && p.hoursBetween <= 9);
const stratum = (p) => sampleFile.satellites[p.norad]?.split('/')[0] ?? 'unknown';
const day = (p) => p.t1.slice(0, 10);
const out = { pairs: unique.length, consecutive: consecutive.length, satellites: new Set(consecutive.map((p) => p.norad)).size, through: values.through ?? null, strata: {} };
for (const p of consecutive) out.strata[stratum(p)] = (out.strata[stratum(p)] ?? 0) + 1;
const cell = (p, extra) => ({ row: String(p.norad), col: day(p), ...extra });
const sigmaOf = (items) => { const m = weightedQuantile(items, 0.5); return 1.4826 * weightedQuantile(items.map((x) => ({ value: Math.abs(x.value - m), weight: x.weight })), 0.5); };
const interval = (cells, statistic, opts) => boot(cells, statistic, opts);
const fmt = (b, d = 3) => `${b.estimate.toFixed(d)} [${b.lower.toFixed(d)}, ${b.upper.toFixed(d)}]`;

// S3 cadence
out.S3 = {
  hoursBetweenStarts: Object.fromEntries([0.05, 0.25, 0.5, 0.75, 0.95].map((q) => [q, quantile(unique.map((p) => p.hoursBetween), q)])),
  hoursBetweenCreations: Object.fromEntries([0.05, 0.25, 0.5, 0.75, 0.95].map((q) => [q, quantile(unique.map((p) => p.hoursCreatedBetween), q)])),
  creationLagHours: Object.fromEntries([0.05, 0.5, 0.95].map((q) => [q, quantile(unique.map((p) => (p.next.createdMs - p.next.startMs) / H), q)])),
};

// S1 realised against stated
if (consecutive.length >= 20) {
  const axes = ['R', 'T', 'N'];
  out.S1 = { positionRobustSigmaZOld: {}, velocityRobustSigmaZOld: {}, beyond3Sigma: {}, medianRealisedOverStated3d: null };
  const threshold = 0.5;
  axes.forEach((a, k) => {
    out.S1.positionRobustSigmaZOld[a] = interval(consecutive.map((p) => cell(p, { z: p.z.positionRtnOld[k] })), (w) => sigmaOf(w.map((c) => ({ value: c.z, weight: c.weight }))));
    out.S1.velocityRobustSigmaZOld[a] = interval(consecutive.map((p) => cell(p, { z: p.z.velocityRtnOld[k] })), (w) => sigmaOf(w.map((c) => ({ value: c.z, weight: c.weight }))));
    out.S1.beyond3Sigma[a] = consecutive.filter((p) => Math.abs(p.z.positionRtnOld[k]) > 3).length / consecutive.length;
  });
  const ratio3d = consecutive.map((p) => p.mismatch.position3dM / Math.hypot(...p.statedSigma.oldAtT1.slice(0, 3)));
  out.S1.medianRealisedOverStated3d = quantile(ratio3d, 0.5);
  out.S1.overstates = out.S1.positionRobustSigmaZOld.T.upper < threshold;
  out.S1.threshold = threshold;
  for (const a of axes) console.log(`S1 position ${a}: robust sigma of z ${fmt(out.S1.positionRobustSigmaZOld[a])}; velocity ${a}: ${fmt(out.S1.velocityRobustSigmaZOld[a])}; beyond 3 sigma (position) ${(100 * out.S1.beyond3Sigma[a]).toFixed(1)} %`);
  console.log(`S1: median realised / stated 3D position ${out.S1.medianRealisedOverStated3d.toFixed(3)}; the stated sigma ${out.S1.overstates ? 'overstates' : 'does not demonstrably overstate'} the realised error (T, upper bound ${out.S1.positionRobustSigmaZOld.T.upper.toFixed(3)} against ${threshold})`);
}

// S2 planned = executed thrust
const raise = consecutive.filter((p) => p.energyJkg.predictedChange >= 100);
const decay = consecutive.filter((p) => stratum(p) === 'decay');
out.S2 = { plannedRaisePairs: raise.length, plannedRaiseSatellites: new Set(raise.map((p) => p.norad)).size, decayPairs: decay.length };
if (raise.length >= 20) {
  const ratio = interval(raise.map((p) => cell(p, { r: p.energyJkg.mismatch / p.energyJkg.predictedChange })), (w) => weightedQuantile(w.map((c) => ({ value: c.r, weight: c.weight })), 0.5));
  out.S2.medianMismatchOverPredicted = ratio;
  const sRaise = sigmaOf(raise.map((p) => ({ value: p.energyJkg.mismatch, weight: 1 }))), sDecay = decay.length >= 20 ? sigmaOf(decay.map((p) => ({ value: p.energyJkg.mismatch, weight: 1 }))) : NaN;
  out.S2.robustSigmaMismatchJkg = { plannedRaise: sRaise, decay: sDecay, ratio: sRaise / sDecay };
  out.S2.verdict = (Math.abs(ratio.estimate) <= 0.05 && ratio.lower >= -0.10 && ratio.upper <= 0.10 && sRaise / sDecay <= 2) ? 'executed = planned' : (ratio.estimate < -0.05 && ratio.upper < 0 ? 'under-executed' : 'neither');
  console.log(`S2: ${raise.length} planned-raise pairs of ${out.S2.plannedRaiseSatellites} satellites; median mismatch / predicted gain ${fmt(ratio)}; robust sigma of the mismatch ${sRaise.toFixed(1)} J/kg against ${Number.isFinite(sDecay) ? sDecay.toFixed(1) : 'n/a'} for the decaying stratum: ${out.S2.verdict}`);
}

// S4 Method A against Method B on the decaying stratum, no jump and a gate pass in the head fit of the new version
const indexByName = new Map(fs.existsSync(paths.index) ? fs.readFileSync(paths.index, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.name, r]) : []);
const agree = decay.map((p) => ({ p, a: indexByName.get(p.next.name) })).filter(({ p, a }) => a?.gatePass && a.jumps === 0 && p.methodB?.cdAreaOverMass > 0 && p.methodB.cdAreaOverMass < 1 && Math.abs(p.methodB.checkMismatchJkg ?? 1e9) < 5);
out.S4 = { pairs: agree.length };
if (agree.length >= 10) {
  const l = agree.map(({ p, a }) => Math.log(a.cdAreaOverMass / p.methodB.cdAreaOverMass));
  out.S4.medianLnRatioAB = quantile(l, 0.5);
  out.S4.robustSigmaLnRatio = sigmaOf(l.map((value) => ({ value, weight: 1 })));
  console.log(`S4: Method A / Method B on ${agree.length} decaying-stratum pairs: median ln ratio ${out.S4.medianLnRatioAB.toFixed(3)}, robust sigma ${out.S4.robustSigmaLnRatio.toFixed(3)}`);
}
console.log(`pairs ${out.pairs}, consecutive ${out.consecutive} (${out.satellites} satellites): hours between starts median ${out.S3.hoursBetweenStarts[0.5]?.toFixed(2)}, creation lag median ${out.S3.creationLagHours[0.5]?.toFixed(2)} h`);
if (values.out) fs.writeFileSync(values.out, `${JSON.stringify(out, null, 1)}\n`);
