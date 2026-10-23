// One independent arc per single-threaded WASM worker; no numerical kernels here.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import assert from 'node:assert/strict';
import { loadModule } from '../../harness/modules.mjs';
import { epochMs } from '../../harness/gp-archive.mjs';
import { ommFrame } from '../../harness/records.mjs';
import { moduleFactory, bindings, coverage, sgp4Client } from '../v1c-console-ffm-path/modules.mjs';
import { covarianceResident, validMatrix, catalogSeedEpoch } from '../v1c2-console-covariance-realism/modules.mjs';
import { call, pair, apply, stateRecord } from './calibration.mjs';
const { modules, phase, selection, config } = workerData;
const provenance = [], record = { addModule: p => provenance.push(p) };
const gp = await loadModule(modules, 'analysis/gp-error-model'); provenance.push(gp.provenance);
const codec = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
const makeSgp4 = await sgp4Client(modules, await moduleFactory(modules, 'propagator/sgp4', record));
const populationBytes = fs.readFileSync(path.join(modules, 'analysis/gp-error-model/data/e14-s3-kc.erm'));
const populationFrame = { portId: 'model', typeRef: codec.ERM_TYPE, payload: populationBytes };
const b = phase === 'ffm' ? await bindings(modules) : null;
const makeFfm = phase === 'ffm' ? await moduleFactory(modules, 'propagator/ffm', record) : null;
const time = phase === 'ffm' ? await loadModule(modules, 'foundation/time') : null;
if (time) provenance.push(time.provenance);

async function native(elements, set, times) {
  return (await call(gp, codec, 'object_covariance', [ommFrame(elements, 'elements'), codec.frame('request', 'objects', {
    objects: times.map((ms, i) => ({ id: String(i), set: { norad: set.norad, epoch: set.epoch }, ageDays: (ms - epochMs(set.epoch)) / 86400000 })),
  })])).objects;
}
async function population(set, state, ageDays) {
  return (await call(gp, codec, 'calibrate_covariance', [populationFrame, ommFrame([set], 'elements'), codec.frame('objects', 'objects', {
    objects: [{ id: 'population', set: { norad: set.norad, epoch: set.epoch }, ageDays, state: stateRecord(state) }],
  })])).objects[0];
}
async function baseTerms(base, nat, set, state, ms) {
  if (base === 'P') {
    const pop = await population(set, state, (ms - epochMs(set.epoch)) / 86400000);
    return pop.covarianceInertial ? [pop.covarianceInertial] : [];
  }
  if (!nat.covarianceInertial) return [];
  const terms = [nat.covarianceInertial];
  if (base === 'F' && nat.status === 'EMPIRICAL') {
    const floor = await population(set, state, 0);
    assert(floor.covarianceInertial, 'age-zero population floor unavailable');
    terms.push(floor.covarianceInertial);
  }
  return terms;
}
async function sgpArc(job) {
  const { key, group, n, ms, set, elements, targets, missingHorizons } = job;
  const sgp = await makeSgp4(set);
  try {
    const covariances = await native(elements, set, targets.map(t => t.ms));
    const samples = [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i], state = await sgp.at(target.ms), nat = covariances[i];
      const sample = { hours: target.hours, ms: target.ms, truth: target.state, state, status: nat.status, bases: {} };
      for (const base of ['N', 'F', 'P']) {
        const terms = await baseTerms(base, nat, set, state, target.ms);
        for (const p of terms) validMatrix(p, 1e-10);
        sample.bases[base] = { terms };
        if (terms.length) {
          sample.bases[base].score = await pair(gp, codec, state, terms, target.state);
          sample.bases[base].fit = await pair(gp, codec, state, terms, target.state, 'predicted');
        }
      }
      samples.push(sample);
    }
    return { key, norad: n, group, ms, missingHorizons, samples };
  } finally { await sgp.destroy(); }
}
async function ffmArc(job) {
  const { key, group, n, ms, set, elements, targets, missingHorizons, env, frozenPositions } = job;
  const sgp = await makeSgp4(set), host = await makeFfm(), residents = [];
  let catalog;
  try {
    const fixedSeed = { ms, epoch: new Date(ms).toISOString().replace('Z', ''), state: await sgp.at(ms, true) };
    const configuration = b.frame('configuration', 'EXECUTION_REQUEST', b.catalog.fullForceRequest({ epoch: fixedSeed.epoch, state: fixedSeed.state }));
    catalog = coverage(host, [configuration, ...env], fixedSeed, set.elements.BSTAR, true);
    assert.equal(catalog.profile, 'FFM-1');
    const seed = { ...fixedSeed, epoch: await catalogSeedEpoch(time, ms), state: catalog.transform(ms, fixedSeed.state, true) };
    const nat = (await native(elements, set, [ms]))[0];
    const rawTerms = await baseTerms(selection.selected[0], nat, set, seed.state, ms);
    const terms = await apply(gp, codec, selection.model, group, config.seedFactorHorizonHours, seed.state, rawTerms);
    const steps = [];
    let zeroTimeCovarianceRelative = 0;
    for (const p0 of terms) {
      const h = await makeFfm(); residents.push(h);
      const step = await covarianceResident(h, b, configuration, env, seed, p0, set.elements.BSTAR);
      const zero = await step(ms);
      const relative = Math.max(...p0.map((p, i) => Math.abs(p - zero.covariance[i]))) / Math.max(...p0.map(Math.abs));
      assert(relative <= 1e-8, 'zero-time covariance mismatch');
      zeroTimeCovarianceRelative = Math.max(zeroTimeCovarianceRelative, relative);
      steps.push(step);
    }
    const at = new Map(targets.map(t => [t.ms, t]));
    const ticks = new Set(targets.map(t => t.ms));
    if (!frozenPositions) for (let t = ms + 300000; t < targets.at(-1).ms; t += 300000) ticks.add(t);
    const samples = [];
    for (const tms of [...ticks].sort((a, b) => a - b)) {
      const covered = frozenPositions ? null : catalog.step(tms), target = at.get(tms);
      if (!target) continue;
      const transported = [];
      for (const step of steps) transported.push(await step(tms));
      const position = frozenPositions ? frozenPositions.find(p => p.hours === target.hours).position
        : catalog.transform(tms, [...covered, 0, 0, 0], true).slice(0, 3);
      const state = [...position, ...(transported[0]?.state.slice(3) ?? seed.state.slice(3))];
      const sample = { hours: target.hours, ms: tms, truth: target.state, state, status: nat.status, terms: transported.map(t => t.covariance) };
      if (sample.terms.length) {
        sample.score = await pair(gp, codec, state, sample.terms, target.state);
        sample.fit = await pair(gp, codec, state, sample.terms, target.state, 'predicted');
      }
      samples.push(sample);
    }
    return { key, norad: n, group, ms, missingHorizons, samples, zeroTimeCovarianceRelative };
  } finally { await Promise.all(residents.map(h => h.destroy())); catalog?.dispose(); await host.destroy(); await sgp.destroy(); }
}
parentPort.on('message', async job => {
  try { parentPort.postMessage({ result: await (phase === 'sgp' ? sgpArc(job) : ffmArc(job)) }); }
  catch (error) { parentPort.postMessage({ error: error.stack ?? String(error) }); }
});
parentPort.postMessage({ ready: true, provenance });
