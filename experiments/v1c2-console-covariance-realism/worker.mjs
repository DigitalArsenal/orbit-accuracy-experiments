// Independent arc execution. This is the sequential pilot's unchanged numerical call sequence.
import { parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { loadModule } from '../../harness/modules.mjs';
import { epochMs } from '../../harness/gp-archive.mjs';
import { ommFrame } from '../../harness/records.mjs';
import { moduleFactory, bindings, coverage, resident, sgp4Client, distance } from '../v1c-console-ffm-path/modules.mjs';
import { covarianceResident, score, validMatrix, catalogSeedEpoch } from './modules.mjs';
const { modules, config, v1c } = workerData;
const provenance = [], record = { addModule: p => provenance.push(p) };
const makeFfm = await moduleFactory(modules, 'propagator/ffm', record), b = await bindings(modules);
const makeSgp4 = await sgp4Client(modules, await moduleFactory(modules, 'propagator/sgp4', record));
const gp = await loadModule(modules, 'analysis/gp-error-model'); provenance.push(gp.provenance);
const time = await loadModule(modules, 'foundation/time'); provenance.push(time.provenance);
const codec = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
const relative = (a, z) => Math.max(...a.map((x, i) => Math.abs(x - z[i]))) / Math.max(...z.map(Math.abs));
async function scoreArc({ prior, n, ms, set, targets, elements, env }) {
  const arc = { key: prior.key, norad: n, group: prior.group, missingHorizons: prior.missingHorizons };
  const anchorMs = epochMs(set.epoch);
  const asks = [ms, ...targets.map(t => t.ms)].map((t, i) => ({ id: String(i), set: { norad: n, epoch: set.epoch }, ageDays: (t - anchorMs) / 86400000 }));
  const response = await gp.invoke('object_covariance', [ommFrame(elements, 'elements'), codec.frame('request', 'objects', { objects: asks })]);
  const cov = codec.decode(response.outputs.find(f => f.portId === 'covariance').payload).objects;
  assert.equal(cov.length, asks.length);
  const supported = c => ['EMPIRICAL', 'POPULATION'].includes(c.status);
  for (const c of cov) if (supported(c)) validMatrix(c.covarianceInertial, config.covarianceSymmetryRelative);
  const sgp4 = await makeSgp4(set), host = await makeFfm(); let catalog;
  try {
    const fixedSeed = { ms, epoch: new Date(ms).toISOString().replace('Z', ''), state: await sgp4.at(ms, true) };
    const configuration = b.frame('configuration', 'EXECUTION_REQUEST', b.catalog.fullForceRequest({ epoch: fixedSeed.epoch, state: fixedSeed.state }));
    catalog = coverage(host, [configuration, ...env], fixedSeed, set.elements.BSTAR, true);
    assert.equal(catalog.profile, 'FFM-1');
    const seed = { ...fixedSeed, epoch: await catalogSeedEpoch(time, ms), state: catalog.transform(ms, fixedSeed.state, true) };
    // Resident and coverage are separate module instances, exactly as in the console.
    const residentHost = supported(cov[0]) ? await makeFfm() : null, stateHost = await makeFfm(), isoHost = await makeFfm();
    try {
      const cdAm = stateHost.instance.exports.plugin_drag_area_over_mass_from_bstar(set.elements.BSTAR, .01);
      const stateStep = await resident(stateHost, b, { drag: true, frame: configuration }, env, seed, .02, cdAm);
      const isoStep = await resident(isoHost, b, { drag: true, frame: configuration }, env, { ...seed, epoch: fixedSeed.epoch }, .02, cdAm);
      const step = residentHost ? await covarianceResident(residentHost, b, configuration, env, seed, cov[0].covarianceInertial, set.elements.BSTAR) : null;
      if (step) { const zero = await step(ms); arc.zeroTimeCovarianceRelative = relative(zero.covariance, cov[0].covarianceInertial); assert(arc.zeroTimeCovarianceRelative <= config.zeroTimeCovarianceRelative, `zero-time covariance relative difference ${arc.zeroTimeCovarianceRelative}`); }
      const ticks = new Set(targets.map(t => t.ms));
      for (let t = ms + v1c.coverageStepSeconds * 1000; t < targets.at(-1).ms; t += v1c.coverageStepSeconds * 1000) ticks.add(t);
      const at = new Map(targets.map((t, i) => [t.ms, { ...t, covariance: cov[i + 1] }]));
      arc.samples = [];
      for (const tms of [...ticks].sort((a, z) => a - z)) {
        const covered = catalog.step(tms), stateOnly = await stateStep(tms), isoState = await isoStep(tms), t = at.get(tms); if (!t) continue;
        const propagated = step ? await step(tms) : null;
        const sgpState = await sgp4.at(tms), oldSgp = prior.methods.SGP4.samples.find(s => s.hours === t.hours), oldFfm = prior.methods['Console FFM-1'].samples.find(s => s.hours === t.hours);
        const sample = { hours: t.hours, elapsedHours: (tms - ms) / 3600000, sgp4ErrorDifferenceM: Math.abs(distance(sgpState, t.state) - oldSgp.errorM),
          SGP4: { status: t.covariance.status, d2: null }, 'FFM-1': { status: cov[0].status, d2: null } };
        assert(sample.sgp4ErrorDifferenceM <= config.pathAgreementM, `SGP4 replay mismatch ${prior.key}`);
        const coverageState = catalog.transform(tms, [...covered, 0, 0, 0], true);
        sample.coverageReplayDifferenceM = distance(coverageState, oldFfm.position);
        assert(sample.coverageReplayDifferenceM <= config.pathAgreementM, 'coverage replay mismatch');
        sample.residentCoverageDifferenceM = distance(stateOnly, oldFfm.position);
        sample.isoSeedCoverageDifferenceM = distance(isoState, oldFfm.position);
        assert(sample.residentCoverageDifferenceM <= config.pathAgreementM, `state-only resident replay mismatch: ${sample.residentCoverageDifferenceM} m; original ISO ${sample.isoSeedCoverageDifferenceM} m`);
        if (supported(t.covariance)) Object.assign(sample.SGP4, await score(gp, codec, sgpState, t.covariance.covarianceInertial, t.state));
        if (propagated) {
          validMatrix(propagated.covariance, config.covarianceSymmetryRelative);
          sample.covarianceResidentCoverageDifferenceM = distance(propagated.state, oldFfm.position);
          Object.assign(sample['FFM-1'], await score(gp, codec, [...oldFfm.position, ...propagated.state.slice(3)], propagated.covariance, t.state));
        }
        arc.samples.push(sample);
      }
    } finally { await residentHost?.destroy(); await stateHost.destroy(); await isoHost.destroy(); }
    return arc;
  } finally { catalog?.dispose(); await host.destroy(); await sgp4.destroy(); }

}
parentPort.on('message', async job => {
  try { parentPort.postMessage({ result: await scoreArc(job) }); }
  catch (e) { parentPort.postMessage({ error: e.stack ?? String(e) }); }
});
parentPort.postMessage({ ready: true, provenance });
