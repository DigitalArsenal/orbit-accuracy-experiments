// gp-error-model pair_statistics for C2 (PLAN.md 3.1): predicted states with their covariance (inertial, or covarianceTerms) against
// truth states in the same axes, in the truth's RTN axes (A5's lead records use the same axes). Encoding and routing only.
import path from 'node:path';

/** Opens gp-error-model of `modules` (G1's openBaselines): { stats(pairs), close }. */
export async function openPairs(modules) {
  const B = await import(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../sdn-gp-starlink-ffm-match/lib/baselines.mjs'));
  const b = await B.openBaselines(modules);
  return {
    provenance: b.provenance,
    /** pairs [{ predicted: {position, velocity (km, km/s), covariance | covarianceTerms, covarianceAxes}, truth: {position, velocity, covariance?, covarianceAxes?} }] */
    async stats(pairs, axesFrom = 'truth') {
      const framed = pairs.map((p, i) => ({ id: String(i), ...p }));
      return b.erm.decode((await b.gem.call('pair_statistics', [b.erm.frame('pairs', 'pairs', { axesFrom, pairs: framed })])).statistics).pairs;
    },
    /** noise_responses (request -> responses) and dcp_covariance (request -> dcp) by the module's typed frames. */
    async noise(request) { const out = await b.gem.call('noise_responses', [b.erm.frame('request', 'noise', request)]); return b.erm.decode(out.responses); },
    async dcp(request) { const out = await b.gem.call('dcp_covariance', [b.erm.frame('request', 'dcp', request)]); return b.erm.decode(out.dcp); },
    close: () => b.close(),
  };
}
