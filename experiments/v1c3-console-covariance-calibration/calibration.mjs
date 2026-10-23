// Typed orchestration: covariance arithmetic and fitting stay in gp-error-model.
import assert from 'node:assert/strict';

export const modes = ['SGP4', 'FFM-1'];
export const bases = ['N', 'F', 'P'];
export const methods = ['none', 'scalar-mle', 'coverage', 'axes-mle'];
export const sgpCandidates = bases.flatMap(base => methods.map(method => `${base}-${method}`));
export const groups = ['GPS', 'LEO 400-800 km', 'SLR LEO 800-1500 km', 'SLR MEO'];
export const horizons = [1, 6, 12, 24, 48, 72];
const boundaries = [0, 3.5, 9, 18, 36, 60, 96];
const regimes = groups.map((id, i) => ({ id, altitudeKm: [[19000, 30000], [400, 800], [800, 1500], [1500, 19000]][i], eccentricity: [0, 1] }));
export const stateRecord = state => ({ position: state.slice(0, 3), velocity: state.slice(3, 6) });
export const stratum = (group, hours) => `${group}|${hours}`;

export async function call(gp, codec, method, inputs) {
  const response = await gp.invoke(method, inputs);
  return codec.decode(response.outputs[0].payload);
}
export async function pair(gp, codec, state, terms, truth, axesFrom = 'truth') {
  const response = await call(gp, codec, 'pair_statistics', [codec.frame('pairs', 'pairs', { axesFrom, pairs: [{
    id: 'sample', predicted: { ...stateRecord(state), covarianceAxes: 'INERTIAL', covarianceTerms: terms.map(covariance => ({ weight: 1, covariance })) },
    truth: stateRecord(truth),
  }] })]);
  assert(!response.pairs[0].missing, response.pairs[0].missing);
  return response.pairs[0];
}
export async function apply(gp, codec, model, group, hours, state, terms) {
  if (!model) return terms;
  const response = await call(gp, codec, 'calibrate_covariance', [codec.frame('model', 'model', model), codec.frame('objects', 'objects', {
    objects: terms.map((covariance, i) => ({ id: String(i), regime: group, horizonDays: hours / 24,
      covariance, covarianceAxes: 'INERTIAL', state: stateRecord(state) })),
  })]);
  return response.objects.map(o => { assert(o.covarianceInertial, `calibration missing: ${o.status}`); return o.covarianceInertial; });
}
export async function fit(gp, codec, rows, method, config, version) {
  if (method === 'none') return { model: null, calibration: null };
  const calibration = await call(gp, codec, 'fit_calibration', [codec.frame('samples', 'calibration', { samples: rows }),
    codec.frame('options', 'calibration', { method, coverage: config.coverage, minimumSamples: config.minimumSamples, minimumObjects: config.minimumObjects })]);
  const model = { kind: 'e14-factors', version, regimes, strata: groups.flatMap(group => horizons.map((hours, i) => {
    const r = calibration.strata.find(r => r.stratum === stratum(group, hours));
    return { regime: group, horizonDays: [boundaries[i] / 24, boundaries[i + 1] / 24], status: r?.status ?? 'INSUFFICIENT',
      ...(r?.status === 'FITTED' ? r.axesFactors ? { axesFactors: r.axesFactors } : { factor: r.factor } : { factor: 1 }) };
  })) };
  return { model, calibration };
}

// Fixed statistical selection; it never receives test rows.
export function select(tables, order) {
  const ranked = order.map(candidate => {
    const cells = tables[candidate];
    assert.equal(cells.length, 24);
    let violation = 0;
    for (const c of cells) {
      const m = c.meanD2Over3?.estimate, cover = c.coverage95?.estimate;
      violation += c.decision === 'INSUFFICIENT' || !Number.isFinite(m) || !Number.isFinite(cover) ? 1e12
        : (Math.max(0, .8 - m, m - 1.25) / .45) ** 2 + (Math.max(0, .93 - cover, cover - .97) / .04) ** 2;
    }
    return { candidate, realistic: cells.filter(c => c.decision === 'REALISTIC').length,
      insufficient: cells.filter(c => c.decision === 'INSUFFICIENT').length, violation };
  });
  ranked.sort((a, b) => b.realistic - a.realistic || a.insufficient - b.insufficient || a.violation - b.violation || order.indexOf(a.candidate) - order.indexOf(b.candidate));
  return { selected: ranked[0].candidate, ranked };
}
