import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, results, read, sha, median, options } from './lib.mjs';

export function report(check = false) {
  const xp = read(path.join(results, 'xp.json')), ca = read(path.join(results, 'ca.json'));
  const ffm = read(path.join(results, 'ffm.json')), reference = read(path.join(results, 'reference.json'));
  const f = (n, places = 2) => Number(n).toFixed(places);
  const summary = { exploratory: true, xp: [], ca: ca.checks, ffmPass: ffm.result?.ok === true,
    xpEnginePass: xp.enginePass, referenceOrderPass: reference.pass,
    sourceHashes: Object.fromEntries(['xp', 'ca', 'ffm', 'reference'].map((k) => [k, sha(fs.readFileSync(path.join(results, `${k}.json`)))])) };
  for (const direction of config.xp.directions) {
    const byOrder = {};
    for (const order of ['caller', 'temporal']) {
      const rows = xp.rows.filter((r) => r.engine === 'white' && r.direction === direction && r.order === order);
      const v = rows.map((r) => r.jobCpuUsPerState);
      byOrder[order] = { medianCpuUsPerState: median(v), rangeCpuUsPerState: [Math.min(...v), Math.max(...v)],
        medianJobWallMs: median(rows.map((r) => r.jobWallMs)), medianPlanningCpuUs: median(rows.map((r) => r.planningCpuUs)) };
    }
    summary.xp.push({ direction, ...byOrder, speedup: byOrder.caller.medianCpuUsPerState / byOrder.temporal.medianCpuUsPerState });
  }
  const own = xp.comparisons.filter((r) => r.engine === 'white');
  const refChecks = xp.comparisons.filter((r) => r.engine === 'ussf' && r.rep === 0);
  const precise = ca.groups['laser-precise'], reproduction = precise.reproduction.ffm;
  const coverage = Object.values(ca.historicalCovarianceRealism.laser.ffm).map((r) => r.coverage95);
  const lines = [
    '# Propagator execution and CA/Pc audit', '',
    'Generated from the committed aggregate outputs and their manifests. Plan: [PLAN.md](../../experiments/propagator-ca-frontier/PLAN.md). The follow-up is exploratory: the original timing and B2 results were already known.', '',
    '**Decision:** preserve demonstrated accuracy gains, including weather and density correction. Optimize execution and trajectory reuse around that accuracy. Temporal batching is promising; covariance prediction and the evaluation event still need attention.', '',
    '## XP: complete batch cost', '',
    `White-room XP, ${xp.objects} synthetic objects across five regimes, ${xp.queries} shuffled epochs per object and ${xp.repetitions} alternating repetitions. CPU microseconds per returned state include ingest, sorting, propagation, output copying and restoration of caller order. Module loading is separate. Fits, frames, covariance, TCA, Pc and transport are excluded.`, '',
    '| Query span | Caller order, median (range) | Temporal batching, median (range) | Speedup |',
    '| --- | ---: | ---: | ---: |',
    ...summary.xp.map((r) => `| ${r.direction} | ${f(r.caller.medianCpuUsPerState)} (${r.caller.rangeCpuUsPerState.map((v) => f(v)).join('–')}) | ${f(r.temporal.medianCpuUsPerState)} (${r.temporal.rangeCpuUsPerState.map((v) => f(v)).join('–')}) | ${f(r.speedup)}× |`), '',
    `Forward spans epoch to +72 h; backward spans epoch to −72 h; both spans −36 to +36 h. Every white-XP comparison passed: ${own.reduce((n, r) => n + r.states, 0).toLocaleString('en-US')} state comparisons across ${own.length} repetitions/directions, zero changed position or velocity components, zero status errors and no nonfinite states. There are ${xp.objects * xp.queries * config.xp.directions.length} distinct object/query cases; repeated checks are not independent accuracy samples.`, '',
    `Each returned batch occupies ${xp.rows[0].outputBytes.toLocaleString('en-US')} bytes. White XP's reported resident store is ${xp.rows.find((r) => r.engine === 'white').storeBytes.toLocaleString('en-US')} bytes for this population. WASM memory figures in xp.json are high-water marks and must not be used as a cross-engine resident-memory comparison. Host saturation check: ${xp.timingAdmissible ? 'passed' : 'FAILED; timing inadmissible'}.`, '',
    'The source retains 12 sparse checkpoints per direction and the latest interval. Reordered queries can repeat integration between checkpoints. The implemented experiment helper groups queries outward from epoch and restores caller order; it changes no forces, integrator or interpolation. The next production candidate is the same scheduling where queries are known, or retained fixed nodes for adaptive TCA searches. This result does not establish adaptive-query or full-catalog speed.', '',
    '## USSF reference: a failed unordered-query comparison', '',
    'The pinned reference is **USSF 9.1.1.0 WASM**, distinct from the native 9.9 conformance reference. All comparison failures remain in the aggregates; exact-equality criteria were not relaxed.', '',
    '| Direction | Shuffled nonfinite states / states | Temporal nonfinite states | Largest finite position difference between orders, m |',
    '| --- | ---: | ---: | ---: |',
    ...refChecks.map((r) => `| ${r.direction} | ${r.nonfiniteStates.caller} / ${r.states} | ${r.nonfiniteStates.temporal} | ${f(r.maxFinitePositionDifferenceM, 3)} |`), '',
    'The nonfinite states carried status zero. The distributed API documentation confirms the eight-double result layout. An independent check through the repository\'s existing single-object reference wrapper reproduces the issue; precomputing to +72 h also fails to remove it:', '',
    '| Regime | Shuffled nonfinite / queries | Prepared then shuffled nonfinite / queries | Sorted nonfinite |',
    '| --- | ---: | ---: | ---: |',
    ...reference.rows.filter((r) => !r.preparedTo72h).map((r) => {
      const prepared = reference.rows.find((x) => x.regime === r.regime && x.preparedTo72h);
      return `| ${r.regime} | ${r.nonfiniteStates.caller} / ${r.states} | ${prepared.nonfiniteStates.caller} / ${prepared.states} | ${r.nonfiniteStates.temporal} |`;
    }), '',
    'Consequently, the earlier scratch claim that USSF is faster for shuffled queries is not an admissible comparison of successful propagation. Its elapsed CPU is recorded, but invalid output disqualifies that workload from the ranking. This does not establish a defect in native 9.9 or any later release. No USSF implementation was modified or reverse engineered.', '',
    '## FFM: restored resident-path measurement', '',
    'The first scratch attempt resolved old parent-directory schema bindings because propagator/ffm lacked local dependencies. An isolated checkout with its exact lockfile dependencies resolves the issue. The existing resident A/A runner now succeeds on the identical pinned artifact:', '',
    '| Fixture | CPU seconds per object-day | Byte-identical repeat |', '| --- | ---: | --- |',
    ...(ffm.result?.rows || []).map((r) => `| ${r.seed} | ${f(r.candidateCpuSPerObjectDay, 5)} | ${r.byteIdentical ? 'yes' : 'NO'} |`), '',
    `Batched versus separate objects: ${ffm.result?.batchedIdentical ? 'byte-identical' : 'FAILED'}. The runner measures ingest + three-day trajectory preparation + description, reporting the smaller of two repeats. These are eight fixture orbits with synthetic weather, not a real-weather catalog benchmark. Native WasmEdge: skipped (${ffm.result?.wasmedge?.skipped || 'see ffm.json'}). A/A agreement tests repeatability, not independent accuracy. This workload must not be divided by XP state-query timings to claim a speed ratio.`, '',
    '## B2: proximity is distinct from the Pc collision event', '',
    `The audit read ${ca.checks.sourceRows.toLocaleString('en-US')} stored encounter rows and reproduced all ${ca.checks.registeredRatesReproduced} registered missedAlert values. B2 uses Pc for a ${ca.hardBodyRadiusM} m combined hard-body radius, but its hit and pcCalibration.hitShare predicates use true miss below ${ca.proximityRadiusM} m. The registered missedAlert denominator is all paired encounters, not only collisions or close approaches.`, '',
    `Laser/precise-secondary population: ${precise.paired.toLocaleString('en-US')} paired encounters; ${precise.excludedInvalidOrMissingPc} excluded for missing/invalid paired Pc. Green is Pc < ${ca.quietPc}; red is Pc >= ${ca.alertPc}; remaining cases are yellow.`, '',
    '| True miss | Denominator | FFM green | FFM red | XP green | XP red |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(precise.strata).map(([label, s]) => `| ${label} | ${s.denominator} | ${s.arms.ffm.green} | ${s.arms.ffm.red} | ${s.arms.sgp4xp.green} | ${s.arms.sgp4xp.red} |`), '',
    `Of FFM's ${reproduction.greenBelow200M} registered green outcomes below 200 m, ${reproduction.greenOutsideHbrBelow200M} (${f(reproduction.fractionOfProximityMissesOutsideHbr * 100)}%) lie outside the collision radius. The headline ${f(reproduction.reproduced * 100)}% is a proximity statistic, not a missed-collision rate. Within the sampled collision stratum, FFM has ${precise.strata['inside-HBR'].arms.ffm.green}/${precise.strata['inside-HBR'].denominator} green outcomes and XP ${precise.strata['inside-HBR'].arms.sgp4xp.green}/${precise.strata['inside-HBR'].denominator}; both threshold bands and false-alert outcomes matter.`, '',
    ...ca.limitations.map((s) => `- ${s}`), '',
    'A 200 m screening-recall requirement can be useful, but must be scored separately from the collision event. NASA defines the hard-body radius as the collision boundary; its handbook also requires realistic uncertainty for probability-based assessment. [NASA handbook, Appendices I and N](https://www.nasa.gov/wp-content/uploads/2024/01/oce-51-nasa-spacecraft-conjunction-assessment.pdf).', '',
    'The registered verdict also requires strictly improved false alerts above 5 km. Two zero-false-alert arms cannot satisfy that condition. “No demonstrated CA difference” therefore must not be interpreted as proof of equal utility.', '',
    '## Accuracy remains valuable; covariance remains unresolved', '',
    'Existing B2 median window 3D RMS, km; these historical results use a different pinned module revision from the new timing:', '',
    '| Population | Arm | Day 1 | Day 2 | Day 3 |', '| --- | --- | ---: | ---: | ---: |',
    ...ca.historicalAccuracy.rows.flatMap((r) => Object.entries(r.arms).map(([arm, a]) => `| ${r.id} | ${arm} | ${[1, 2, 3].map((k) => f(a.bins[k].median, 3)).join(' | ')} |`)), '',
    `Laser FFM nominal 95% covariance coverage ranges from ${f(Math.min(...coverage) * 100, 1)}% to ${f(Math.max(...coverage) * 100, 1)}%. Those failures survive the event correction. Preserve the position-accuracy gains and improve forecast-error modeling and calibration on independent holdouts. These limited populations do not establish broad operational superiority.`, '',
    '## Reproduction and verification', '',
    'Check out the modules commit in config.json and attach each module\'s exact dependency bundle. No binaries or third-party element sets are copied into this experiment. Commands, package versions, source/artifact/input hashes and the committed frozen plan are in the four `*.manifest.json` files.', '',
    '```sh',
    'node experiments/propagator-ca-frontier/run-xp.mjs --modules /path/to/pinned-modules',
    'node experiments/propagator-ca-frontier/probe-reference.mjs --modules /path/to/pinned-modules',
    'node experiments/propagator-ca-frontier/run-ffm.mjs --modules /path/to/pinned-modules',
    'node experiments/propagator-ca-frontier/audit-ca.mjs --rows /path/to/B2/rows',
    'node experiments/propagator-ca-frontier/verify.mjs --modules /path/to/pinned-modules',
    '```', '',
    'The first two commands return a failing research outcome when reference-order equality fails; results and manifests are still saved. The E2E verifies faithful reproduction of that failure, white-XP equivalence, the real archive audit and exact report regeneration. It does not convert a failed scientific comparison into a pass. Original scratch raw timings and the first failed full batch run are retained as exploratory evidence. No future truth windows or production deployment are part of this work.', '',
  ];
  const outputs = { 'summary.json': JSON.stringify(summary, null, 2) + '\n', 'README.md': lines.join('\n') };
  for (const [file, bytes] of Object.entries(outputs)) {
    const target = path.join(results, file);
    if (check) { if (fs.readFileSync(target, 'utf8') !== bytes) throw new Error(`Report differs: ${file}`); }
    else fs.writeFileSync(target, bytes);
  }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) report(options().check);
