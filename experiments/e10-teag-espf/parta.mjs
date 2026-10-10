// Part A (PLAN.md section 3): the 2025 paper's LEO and GEO cases, by the
// stated rules where the paper is silent. Scenario framing only.
import { config, msOf, iso } from './common.mjs';
import { buildScenario } from './scenario.mjs';
import { rtnAxes } from '../../harness/frames.mjs';

const ARCSEC = Math.PI / 180 / 3600;
export const PAPER_CASES = ['A1-leo-nominal', 'A2-leo-error-bias', 'A3-geo-area-change'];
const diagonal = (sigma) => Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? sigma[i / 7] ** 2 : 0));

export function paperSpan(caseId) {
  const p = config.partA, leo = caseId !== 'A3-geo-area-change', c = leo ? p.leo : p.geo;
  const epochMs = msOf(c.epoch);
  return { leo, c, epochMs, endMs: epochMs + (leo ? c.days * 86400e3 : c.minutes * 60e3) };
}

export async function buildPaperCase(m, env, eopStream, caseId) {
  const p = config.partA, { leo, c, epochMs, endMs } = paperSpan(caseId);
  const model = config.forceModels[leo ? 'paper-leo' : 'paper-geo'];
  const spec = {
    truth: { epochMs, endMs, stepS: leo ? config.partB.truthStepS : 15, state: c.state }, truthModel: model,
    stations: Object.values(config.stations), minElevationDeg: config.partB.minElevationDeg,
    sensor: { intervalS: c.cadenceS, noiseRad: config.partB.sensor.noiseArcsec * ARCSEC, lightTime: config.partB.sensor.lightTime },
    seed: p.seed, target: { id: 'target', norad: 99002, objectId: '2018-999A' },
  };
  let sc = await buildScenario(m, env, eopStream, spec);
  if (!leo) {
    // The area change at measurement 92 (its epoch in the unchanged
    // scenario), kept to the end of the arc.
    const at = sc.observations[c.areaChangeMeasurement - 1].ms;
    spec.events = [{ ms: at, forces: { b: c.areaChange.b, agom: c.areaChange.agom } }];
    sc = await buildScenario(m, env, eopStream, spec);
  }
  if (caseId === 'A2-leo-error-bias') for (const o of sc.observations) if (c.biasArcsec?.[o.station]) o.values[0] += c.biasArcsec[o.station] * ARCSEC;
  const start = caseId === 'A2-leo-error-bias' ? c.perturbedState : c.state;
  const rtn = [];
  for (const [k, o] of sc.observations.entries()) rtn.push(await rtnAxes(m.frames, iso(o.ms), sc.truthAtObs[k]));
  return {
    caseId, epochMs, endMs, filterModel: leo ? 'paper-leo' : 'paper-geo', initial: { ms: epochMs, state: [...start], covariance: diagonal(p.p0Sigma) },
    observations: sc.observations, truthAtObs: sc.truthAtObs, rtn, events: spec.events ?? [], windows: sc.windows.length,
  };
}
