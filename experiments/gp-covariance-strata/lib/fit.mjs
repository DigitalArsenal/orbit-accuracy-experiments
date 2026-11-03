// R0 and R2 (PLAN.md 1.3). R0 = K0 x k^2 per cell: K0 the 5-robust-sigma clipped RTN second moment, k^2 per cell so that the
// training coverage at 95 % is 0.95 through the interpolation lookup (swept to a fixed point, neighbours held). R2 = R0 per axis:
// S K0 S with each axis scale set so that axis' |z| <= 1.96 share is 0.95 through the same lookup.
import { BINS } from './bins.mjs';
import { CHI2_95, Z95, MIN_BIN_SAMPLES, clippedMoment, interp, inv3, quad, sample } from './stats.mjs';

const SWEEPS = 6, ITER = 32, FITN = 6000;
const scaleP = (K, s) => [K[0] * s[0] * s[0], K[1] * s[0] * s[1], K[2] * s[0] * s[2], K[3] * s[1] * s[1], K[4] * s[1] * s[2], K[5] * s[2] * s[2]];

// byBin[b] = array of row ids into tab; returns {kind, cells: [{P, K0, s, n}|null]}
export function fit(kind, tab, byBin) {
  const cells = BINS.map((_, b) => {
    const ids = byBin[b]; if (!ids || ids.length < MIN_BIN_SAMPLES) return null;
    const es = sample(ids, 60000).map((i) => [tab.e[3 * i], tab.e[3 * i + 1], tab.e[3 * i + 2]]);
    const { P, kept } = clippedMoment(es);
    return { K0: P, s: [1, 1, 1], P, n: ids.length, kept };
  });
  const rows = byBin.map((ids) => (ids && ids.length >= MIN_BIN_SAMPLES ? sample(ids, FITN) : []));
  const withScale = (b, s) => { const save = cells[b]; cells[b] = { ...save, s, P: scaleP(save.K0, s) }; return save; };
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (let b = 0; b < cells.length; b++) {
      if (!cells[b]) continue;
      if (kind === 'R0') {
        let lo = -12, hi = 12;   // ln k^2
        for (let it = 0; it < ITER; it++) {
          const mid = 0.5 * (lo + hi), k = Math.exp(0.5 * mid);
          withScale(b, [k, k, k]);
          let ok = 0;
          for (const i of rows[b]) { const P = interp(cells, tab.age[i]); if (quad([tab.e[3 * i], tab.e[3 * i + 1], tab.e[3 * i + 2]], inv3(P)) <= CHI2_95) ok++; }
          if (ok / rows[b].length > 0.95) hi = mid; else lo = mid;
        }
        const k = Math.exp(0.25 * (lo + hi)); withScale(b, [k, k, k]);
      } else {
        for (let a = 0; a < 3; a++) {
          let lo = -6, hi = 6;   // ln s_a
          for (let it = 0; it < ITER; it++) {
            const mid = 0.5 * (lo + hi), s = cells[b].s.slice(); s[a] = Math.exp(mid); withScale(b, s);
            let ok = 0;
            for (const i of rows[b]) { const P = interp(cells, tab.age[i]); const dg = [P[0], P[3], P[5]][a]; if (Math.abs(tab.e[3 * i + a]) / Math.sqrt(dg) <= Z95) ok++; }
            if (ok / rows[b].length > 0.95) hi = mid; else lo = mid;
          }
          const s = cells[b].s.slice(); s[a] = Math.exp(0.5 * (lo + hi)); withScale(b, s);
        }
      }
    }
  }
  return { kind, cells };
}
// d2, signed z and the step-lookup d2 of row i under a fit
export function evalRow(tab, i, fitted) {
  const e = [tab.e[3 * i], tab.e[3 * i + 1], tab.e[3 * i + 2]];
  const P = interp(fitted.cells, tab.age[i]);
  const cell = fitted.cells[tab.b[i]];
  return { d2: quad(e, inv3(P)), z: [e[0] / Math.sqrt(P[0]), e[1] / Math.sqrt(P[3]), e[2] / Math.sqrt(P[5])], step: cell ? quad(e, inv3(cell.P)) : NaN, P };
}
