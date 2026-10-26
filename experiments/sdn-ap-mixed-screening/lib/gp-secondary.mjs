// A6 point 2: the public element set's prediction and its covariances at each lead time of a window, in V1c5's pinned runtime with V1c5's
// rules at the issue time (the window's prediction start): the newest Space-Track set created and dated at or before it with its 31-day
// history, the causal event rule (custody, and analysis/maneuver-detection) over the 45 days before it, SGP4 by V1c5's propagator/sgp4
// (GCRF, meters) and three covariances, each scored by pair_statistics in the truth's RTN axes:
//   v1c5         V1c5 frozen: base P (the population at the actual age), the group from the event rule and the risk tier, V1c5's selected model;
//   uncalibrated base N (object_covariance alone);
//   v1c4         V1c4 best: base F (N plus the age-zero floor when EMPIRICAL), results/v1c4/sgp-F-scalar-mle_UNFLAGGED.erm, the class factors.
// The base terms follow V1c3's worker (experiments/v1c3-console-covariance-calibration/worker.mjs: native, population, baseTerms). Archive
// selection and routing only; every orbit, covariance and statistic is a module's.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { root, sha256, gpArchive } from '../common.mjs';

export const RUNTIME = '/opt/data/sdn-archive/v1c5/runtime';
const E3 = JSON.parse(fs.readFileSync(path.join(root, 'experiments/e3-combined-catalog/config.json'), 'utf8'));
/** The class of an object for V1c5's model (A6 point 3): E3's registry where it lists the object, else "LEO 400-800 km" (the ISS, Starlinks). */
export const v1c5Class = (norad) => Object.entries(E3.regimes).find(([, spec]) => spec.objects && String(norad) in spec.objects)?.[0] ?? 'LEO 400-800 km';
export const FIRST_ISSUE_MS = Date.parse('2023-01-04T00:00:00Z'); // the archive's first day plus the event rule's 45-day lookback (A6 point 4)
const DAY = 86400e3;
const imp = (rel) => import(path.join(root, rel));
const km = (v, k = 1e-3) => v.map((x) => Number((x * k).toPrecision(9)));

/** The sets of `norads` created on the days [from, to], whole-day and partial-window files (A6: the history V1c5's object_covariance takes;
 *  the archive holds partial-window files only from 2026-09-28): [{ norad, epoch, creationDate, gpId, elements }] in file order. */
function readCreated(from, to, norads) {
  const { dayList } = GA;
  const out = [];
  for (const day of dayList(from, to)) {
    const dir = path.join(gpArchive, day.slice(0, 4));
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((n) => n.startsWith(day) && n.endsWith('.json.gz')).sort()) {
      for (const g of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))))) {
        const norad = Number(g.NORAD_CAT_ID);
        if (g.MEAN_ELEMENT_THEORY !== 'SGP4' || String(g.EPHEMERIS_TYPE) !== '0' || !norads.has(norad)) continue;
        out.push({ norad, epoch: g.EPOCH, creationDate: g.CREATION_DATE, gpId: String(g.GP_ID), elements: Object.fromEntries(FIELDS.map((f) => [f, Number(g[f])])) });
      }
    }
  }
  return out;
}
let GA, FIELDS;

/** The runtime, opened once: { forWindows(windows) -> records, provenance, close }. */
export async function openGp() {
  const provenance = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'PROVENANCE.json'), 'utf8'));
  for (const [file, hash] of Object.entries(provenance.files)) assert.equal(sha256(fs.readFileSync(path.join(RUNTIME, file))), hash, `V1c5 runtime file differs from its pin: ${file}`);
  GA = await imp('harness/gp-archive.mjs');
  const [{ loadModule }, { ommFrame, ELEMENT_FIELDS }, V1C, M, EV, UNI, CV, CAL] = await Promise.all(['harness/modules.mjs', 'harness/records.mjs', 'experiments/v1c-console-ffm-path/modules.mjs',
    'experiments/v1c5/maneuvers.mjs', 'experiments/v1c5/events.mjs', 'experiments/v1c5/universe.mjs', 'experiments/v1c5/cv.mjs', 'experiments/v1c3-console-covariance-calibration/calibration.mjs'].map(imp));
  FIELDS = ELEMENT_FIELDS;
  const gp = await loadModule(RUNTIME, 'analysis/gp-error-model');
  const codec = await import(pathToFileURL(path.join(RUNTIME, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
  const makeSgp4 = await V1C.sgp4Client(RUNTIME, await V1C.moduleFactory(RUNTIME, 'propagator/sgp4', { addModule: () => {} }));
  const detector = await M.makeDetector(RUNTIME);
  const v5 = JSON.parse(fs.readFileSync(path.join(root, 'experiments/v1c5/config.json'), 'utf8'));
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'experiments/v1c5/candidates.json'), 'utf8'));
  const selection = JSON.parse(fs.readFileSync(path.join(root, 'results/v1c5/selection.json'), 'utf8'));
  const frozenName = JSON.parse(fs.readFileSync(path.join(root, 'results/v1c5/MODEL.json'), 'utf8')).SGP4.candidate;
  assert.equal(selection.selected, frozenName, 'V1c5 selection is not the frozen model');
  const v1c5Model = selection.models[frozenName].model;
  const v1c4Model = codec.decode(fs.readFileSync(path.join(root, 'results/v1c4/sgp-F-scalar-mle_UNFLAGGED.erm')));
  const population = { portId: 'model', typeRef: codec.ERM_TYPE, payload: fs.readFileSync(path.join(RUNTIME, 'analysis/gp-error-model/data/e14-s3-kc.erm')) };
  const events = v5.events;

  // V1c3's worker: the native covariance (object_covariance), the population at an age (calibrate_covariance), the base terms
  const native = async (elements, set, times) => (await CAL.call(gp, codec, 'object_covariance', [ommFrame(elements, 'elements'), codec.frame('request', 'objects', {
    objects: times.map((ms, i) => ({ id: String(i), set: { norad: set.norad, epoch: set.epoch }, ageDays: (ms - GA.epochMs(set.epoch)) / DAY })),
  })])).objects;
  const populationAt = async (set, state, ageDays) => (await CAL.call(gp, codec, 'calibrate_covariance', [population, ommFrame([set], 'elements'), codec.frame('objects', 'objects', {
    objects: [{ id: 'population', set: { norad: set.norad, epoch: set.epoch }, ageDays, state: CAL.stateRecord(state) }],
  })])).objects[0];
  async function baseTerms(base, nat, set, state, ms) {
    if (base === 'P') { const pop = await populationAt(set, state, (ms - GA.epochMs(set.epoch)) / DAY); return pop.covarianceInertial ? [pop.covarianceInertial] : []; }
    if (!nat.covarianceInertial) return [];
    const terms = [nat.covarianceInertial];
    if (base === 'F' && nat.status === 'EMPIRICAL') { const floor = await populationAt(set, state, 0); assert(floor.covarianceInertial, 'age-zero population floor unavailable'); terms.push(floor.covarianceInertial); }
    return terms;
  }
  const scored = async (state, terms, truth) => {
    if (!terms.length) return { error: 'no covariance' };
    const s = await CAL.pair(gp, codec, state, terms, truth);
    return { err: km(s.errorRtn), cov: km(s.predictedRtn, 1e-6), d2: Number(s.d2Predicted.toPrecision(9)) };
  };

  return {
    runtime: { path: RUNTIME, modulesCommit: provenance.modulesCommit, v1c5Model: frozenName, v1c4Model: 'results/v1c4/sgp-F-scalar-mle_UNFLAGGED.erm' },
    /** The element sets of `norads` for issue times in [fromMs, toMs]: { sets, history } by NORAD id. */
    load(norads, fromMs, toMs) {
      const day = (t) => new Date(t).toISOString().slice(0, 10);
      const keep = (n) => norads.has(n);
      const { sets } = GA.readElementSets(gpArchive, day(fromMs - (events.lookbackDays + 5) * DAY), day(toMs), { keep, lagDays: 3, theory: 'SGP4', ephemerisType: '0', duplicateEpochSeconds: 1 });
      const history = readCreated(day(fromMs - 45 * DAY), day(toMs), norads);
      return { sets: UNI.groupBy(sets, (s) => s.norad), history: UNI.groupBy(history, (s) => s.norad) };
    },
    /** One window: { key, norad, cls, issueMs, leads: [{ L, line: { epoch, r, v } GCRF km }] } with its object's loaded sets -> its record. */
    async record(w, loaded) {
      if (w.issueMs < FIRST_ISSUE_MS) return { key: w.key, excluded: 'prediction start before 2023-01-04' };
      const objectSets = loaded.sets.get(w.norad) ?? [], ms = w.issueMs;
      const available = EV.availableSets(objectSets, ms, events.lookbackDays);
      const custody = EV.custodyOf(available, ms, events);
      let detected = { sets: available.length, recent: [], error: null };
      if (available.length >= events.detector.minimumSets) {
        let times = [], error = null;
        try { times = (await detector.events(EV.detectorInput(available))).map((e) => e.time); } catch (e) { error = String(e.message ?? e).slice(0, 200); }
        detected = { sets: available.length, recent: times.filter((t) => t > ms - events.windowDays * DAY && t <= ms), error };
      } else detected.skipped = 'fewer than the minimum sets';
      const flag = { custody, flagged: Boolean(custody.flag || detected.recent.length) };
      const tier = CV.groupOf({ group: w.cls }, 'risk', flag, spec);
      const set = UNI.anchorOf(objectSets, ms);
      if (!set) return { key: w.key, excluded: 'no set created and dated before the prediction start', flag, tier };
      const anchorMs = GA.epochMs(set.epoch);
      const causal = (loaded.history.get(w.norad) ?? []).filter((s) => GA.epochMs(s.creationDate) <= ms && GA.epochMs(s.epoch) >= anchorMs - v5.historyDays * DAY && GA.epochMs(s.epoch) <= anchorMs + 1000);
      const elements = [...causal.filter((s) => s.gpId !== set.gpId), set];
      const out = { key: w.key, set: { epoch: set.epoch, gpId: set.gpId, created: set.creationDate }, history: elements.length, flagged: flag.flagged, tier, custodyFlag: custody.flag, detected: detected.recent.length, detectorError: detected.error, leads: {} };
      if (!w.leads.length) return out;
      const sgp = await makeSgp4(set);
      try {
        const times = w.leads.map(({ line }) => Date.parse(line.epoch));
        const nat = await native(elements, set, times);
        for (let i = 0; i < w.leads.length; i += 1) {
          const { L, line } = w.leads[i], t = times[i];
          const state = await sgp.at(t), truth = [...line.r, ...line.v].map((x) => x * 1000);
          const p = await baseTerms('P', nat[i], set, state, t), n = await baseTerms('N', nat[i], set, state, t), f = await baseTerms('F', nat[i], set, state, t);
          out.leads[L] = {
            epoch: line.epoch, status: nat[i].status,
            v1c5: await scored(state, p.length ? await CAL.apply(gp, codec, v1c5Model, tier, L, state, p) : [], truth),
            uncalibrated: await scored(state, n, truth),
            v1c4: await scored(state, f.length ? await CAL.apply(gp, codec, v1c4Model, w.cls, L, state, f) : [], truth),
          };
        }
      } finally { await sgp.destroy(); }
      return out;
    },
    close: async () => { await gp.destroy?.(); },
  };
}
