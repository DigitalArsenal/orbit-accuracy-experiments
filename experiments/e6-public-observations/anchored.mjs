// Anchored fits at a cutoff T (PLAN.md §4.3-4.4), shared by E6's arms
// (SatNOGS range rates, ILRS laser ranges): the element-set history in the
// arc as full-state pseudo-observations, the arc's measurement segments,
// the variants of the config, and their scoring against truth in the
// truth's RTN axes beside the published set propagated by SGP4. Each fitted
// variant is also written as a product (state and covariance at its epoch)
// for later scoring by other experiments. Routing and statistics only.
import fs from 'node:fs';
import path from 'node:path';
import { json, loadModule, sha256 } from '../../harness/modules.mjs';
import { mpeFrame, decodeOemStream, ommFrame } from '../../harness/records.mjs';
import { rtnAxes } from '../../harness/frames.mjs';
import { eopFrame } from '../../harness/eop.mjs';
import { gfzSpaceWeather, kernelFrame } from '../../harness/hpop-execution.mjs';
import { estimationCodec } from '../e2-catalog-covariance/estimation-wire.mjs';
import { gcrfOem } from '../e4-operator-ephemeris-parity/products.mjs';
import { finalsRecords } from './eop.mjs';
import { conditioned, fitOrbit, propagateFit } from './fit.mjs';
import { config, DAY_MS, HOUR_MS } from './common.mjs';

const iso = (ms) => new Date(ms).toISOString();
export const setMs = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);

// Modules, codec and environment inputs for a run.
export async function anchoredContext(run, modulesDir, repoRoot) {
  const m = {};
  for (const name of ['analysis/estimation', 'propagator/hpop', 'analysis/gp-error-model', 'analysis/epoch-state', 'foundation/frames', 'data-source/eop-parser']) { m[name] = await loadModule(modulesDir, name); run.addModule(m[name].provenance); }
  const codec = await estimationCodec(modulesDir, path.join(repoRoot, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  const finals = await finalsRecords(m['data-source/eop-parser'], config.inputs.eopFinals);
  const kernelBytes = fs.readFileSync(path.join(modulesDir, config.inputs.kernel));
  const sw = gfzSpaceWeather(config.inputs.spaceWeather);
  const gpModelBytes = fs.readFileSync(path.join(modulesDir, config.inputs.gpErrorModel));
  run.addInputs('environment', { eopFinals: finals.sha256, kernel: sha256(kernelBytes), spaceWeather: sw.sha256, gpErrorModel: sha256(gpModelBytes) });
  return { m, codec, finals, kernelBytes, sw, gpModel: JSON.parse(gpModelBytes) };
}

// Element sets with epoch in [from, to] and creation at or before cutoff, one
// per epoch (republished within 1 s: the later creation), in epoch order.
export function setsIn(sets, from, to, cutoff) {
  const list = sets.filter((s) => { const e = setMs(s.epoch); return e >= from && e <= to && setMs(s.creationDate) <= cutoff; })
    .sort((a, b) => setMs(a.epoch) - setMs(b.epoch) || String(a.creationDate).localeCompare(String(b.creationDate)));
  const out = [];
  for (const s of list) { if (out.length && Math.abs(setMs(s.epoch) - setMs(out.at(-1).epoch)) <= 1000) out[out.length - 1] = s; else out.push(s); }
  return out;
}

export async function epochState(m, set, norad) {
  const mm = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?/.exec(set.epoch);
  const r = await m['analysis/epoch-state'].invoke('derive', [mpeFrame([{ entityId: `NORAD:${norad}`, epochUnix: Date.parse(`${mm[1]}Z`) / 1000 + Number(`0.${mm[2] ?? '0'}`), ...set.elements }])]);
  const l = decodeOemStream(new Uint8Array(r.outputs.find((x) => x.portId === 'states').payload))[0].EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0];
  return { epoch: l.EPOCH, state: [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT].map((v) => v * 1000) };
}

// The GP error model's at-epoch 6x6 covariance (RTN lower triangle, km and
// km/s) of a regime, rotated to GCRF about a state, in m and m/s.
export async function priorCovariance(m, gpModel, regime, epoch, state) {
  const stratum = gpModel.strata.find((s) => s.regime === regime && s.ageDays[0] === 0);
  const lower = (stratum.clipped?.covariance ?? stratum.covariance).map((v) => v * 1e6);
  const C = Array(36).fill(0); let k = 0;
  for (let r = 0; r < 6; r++) for (let c = 0; c <= r; c++) { C[r * 6 + c] = lower[k]; C[c * 6 + r] = lower[k]; ++k; }
  const R = await rtnAxes(m['foundation/frames'], epoch, state);
  const Rt = (i, j) => ((i < 3 && j < 3) || (i >= 3 && j >= 3) ? R[(j % 3) * 3 + (i % 3)] : 0);
  const out = Array(36).fill(0);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { let s = 0; for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) s += Rt(i, a) * C[a * 6 + b] * Rt(j, b); out[i * 6 + j] = s; }
  for (let i = 0; i < 6; i++) for (let j = 0; j < i; j++) { const v = (out[i * 6 + j] + out[j * 6 + i]) / 2; out[i * 6 + j] = v; out[j * 6 + i] = v; }
  return out;
}

// SGP4 errors (m, truth RTN) of a set at truth states (gp-error-model accumulate).
export async function sgp4Errors(m, set, norad, states) {
  const t0 = setMs(set.epoch);
  const ages = states.map((s) => (Date.parse(s.epoch) - t0) / DAY_MS);
  const half = 1 / 86400;
  const acc = await m['analysis/gp-error-model'].invokeJson('accumulate', [ommFrame([{ ...set, norad }]), gcrfOem(norad, states), json('options', { ageBinsDays: ages.map((a) => [Math.max(0, a - half), a + half]), referenceStepSeconds: 0 })], 'accumulator');
  const out = states.map(() => null);
  for (const s of acc.strata) if (s.n === 1) out[s.age] = s.sum.slice(0, 3).map((v) => v * 1000);
  return out;
}

// All variants at one cutoff T. arm: {name, norad, regime, settings (fit settings), fit (arc, options),
//   variants, segmentsFor(variant, inArc) -> segments}; truthStates: [{epoch, state}] at the scoring epochs.
// Returns the sample row; appends products to productsFile.
export async function anchoredAt(env, arm, T, scoring, truthStates, sets, segments, productsFile) {
  const { m, codec, finals, kernelBytes, sw, gpModel } = env;
  const F = arm.fit;
  const latest = setsIn(sets, -Infinity, T, T).at(-1);
  const history = setsIn(sets, T - F.arcDays * DAY_MS, T, T);
  const first = setsIn(sets, -Infinity, T - F.arcDays * DAY_MS, T).at(-1) ?? history[0];
  if (!latest || !first || !history.length) return { T: iso(T), skipped: 'no element set' };
  const axes = []; for (const t of truthStates) axes.push(await rtnAxes(m['foundation/frames'], t.epoch, t.state));
  const rtn = (k, d) => [0, 1, 2].map((i) => axes[k][i * 3] * d[0] + axes[k][i * 3 + 1] * d[1] + axes[k][i * 3 + 2] * d[2]);
  const rtnCov = (k, c) => { const R = axes[k]; const o = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s += R[i * 3 + a] * c[a][b] * R[j * 3 + b]; o.push(s); } return o; };
  const baseline = await sgp4Errors(m, latest, arm.norad, truthStates);
  const row = {
    T: iso(T), arm: arm.name, norad: arm.norad, set: { epoch: latest.epoch, created: latest.creationDate, ageHours: (T - setMs(latest.epoch)) / HOUR_MS }, historySets: history.length,
    scoring: scoring.map((s, k) => ({ E: iso(s.E), tau: s.tau, sgp4: baseline[k] })), variants: {},
  };
  const reference = await epochState(m, first, arm.norad);
  const startMs = Date.parse(reference.epoch), endMs = Math.max(T, ...scoring.map((s) => s.E));
  const mjd = (ms) => ms / DAY_MS + 40587;
  const inputs = [kernelFrame(kernelBytes), eopFrame(finals.records, Math.floor(mjd(startMs)) - 1, Math.ceil(mjd(endMs)) + 1), sw.frame(iso(startMs - DAY_MS).slice(0, 10), iso(endMs + DAY_MS).slice(0, 10))];
  const ctx = { estimation: m['analysis/estimation'], hpop: m['propagator/hpop'], codec, inputs };
  const priors = [];
  // Each set's epoch state as a pseudo-observation: its position only
  // (lanes 'position', the 3x3 block) or its full state ('state').
  for (const s of history) {
    const st = await epochState(m, s, arm.norad);
    const c6 = await priorCovariance(m, gpModel, arm.regime, st.epoch, st.state);
    priors.push(F.historyLanes === 'position'
      ? { epoch: st.epoch, kind: 'POSITION_VECTOR', values: st.state.slice(0, 3), covariance: [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => c6[i * 6 + j])) }
      : { ...st, covariance: c6 });
  }
  const inArc = segments.filter((s) => s.start >= Math.max(T - F.arcDays * DAY_MS, startMs) && s.end <= T).sort((a, b) => b.end - a.end);
  row.segmentsInArc = inArc.length;
  row.stationsInArc = new Set(inArc.map((s) => s.station)).size;
  let warm = null;
  for (const v of arm.variants) {
    if (v.everyNth && Math.round(T / (3 * HOUR_MS)) % v.everyNth !== 0) continue;
    for (const n of v.segments ?? [null]) {
      const name = n === null ? v.name : `${v.name}-n${n}`;
      if (n !== null && n > 0 && inArc.length < n) { row.variants[name] = { skipped: `${inArc.length} segments` }; continue; }
      const chosen = n === null ? inArc : inArc.slice(0, n);
      if (!v.history && chosen.length < F.minimumSegmentsWithoutHistory) { row.variants[name] = { skipped: `${chosen.length} segments` }; continue; }
      const use = arm.segmentsFor(v, chosen);
      const t0 = Date.now();
      try {
        // Measurement fits start from the element-set-history fit (P) when it
        // exists: the same first guess for every variant, closer than a
        // single set's epoch state, and B already near its fitted value.
        const start = use.length && warm ? warm : reference;
        const product = await fitOrbit(ctx, use, v.history ? priors : [], start, arm.settings, { ...F.options, firstRoundSigmaFactor: v.firstRoundSigmaFactor ?? 1 });
        if (product.failed) { row.variants[name] = { failed: product.failed }; continue; }
        if (!use.length && v.history && !warm) warm = { epoch: product.epoch, state: product.state, parameters: product.parameters };
        const fit = product.fit;
        const chi = Math.max(1, fit.reducedChiSquare);
        const covariance = fit.covariance.map((x) => x * chi);
        // The product at its cutoff, then at every scoring epoch.
        const epochs = [...new Set([iso(T), ...scoring.map((s) => iso(s.E))])];
        const all = await propagateFit(ctx, product, epochs, arm.settings, conditioned(covariance));
        const at = new Map(epochs.map((e, i) => [e, all[i]]));
        const samples = scoring.map((s) => at.get(iso(s.E)));
        const cut = at.get(iso(T));
        row.variants[name] = {
          segments: use.length, stations: new Set(use.map((s) => s.station)).size, measurements: fit.measurementCount, converged: fit.converged, iterations: fit.iterations,
          reducedChiSquare: fit.reducedChiSquare, parameters: product.parameters, hpopCalls: product.hpopCalls, outer: product.outer, seconds: (Date.now() - t0) / 1000, stoppedBy: product.stoppedBy,
          nuisance: { theta: product.nuisance.map((x) => x.theta), rms: product.nuisance.map((x) => x.rms), edited: product.nuisance.filter((x) => x.edited).length },
          scoring: samples.map((s, k) => {
            const d = [0, 1, 2].map((i) => s.state[i] - truthStates[k].state[i]);
            const c = [0, 1, 2].map((i) => [0, 1, 2].map((j) => s.covariance[i * s.n + j]));
            return { error: rtn(k, d), covariance: rtnCov(k, c) };
          }),
        };
        fs.appendFileSync(productsFile, `${JSON.stringify({
          arm: arm.name, norad: arm.norad, variant: name, cutoff: iso(T), epoch: iso(T), frame: 'GCRF', timeScale: 'UTC', state: cut.state, covariance: cut.covariance, dimension: cut.n,
          parameters: arm.settings.parameters.map((p, i) => ({ kind: p.kind, value: product.parameters[i] })), fixed: arm.settings.fixed, covarianceScale: chi,
          fitEpoch: product.epoch, fitState: product.state, fitCovariance: covariance,
          forces: arm.settings.forces, elementSets: v.history ? history.length : 0, segments: use.map((s) => s.key), measurements: fit.measurementCount,
        })}\n`);
      } catch (e) { row.variants[name] = { failed: e.message.slice(0, 300) }; }
    }
  }
  return row;
}
