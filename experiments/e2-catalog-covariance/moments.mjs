// Moments and small matrices for E2's statistics (no orbit computation):
// gp-error-model strata carry a 6x6 RTN covariance as its lower triangle
// (RR, TR, TT, NR, NT, NN, dR R, ...) and a mean.

export function lowerToFull(lower) {
  const full = Array(36).fill(0);
  let k = 0;
  for (let i = 0; i < 6; ++i) for (let j = 0; j <= i; ++j) { full[i * 6 + j] = lower[k]; full[j * 6 + i] = lower[k]; ++k; }
  return full;
}
export function fullToLower(full) {
  const lower = [];
  for (let i = 0; i < 6; ++i) for (let j = 0; j <= i; ++j) lower.push(full[i * 6 + j]);
  return lower;
}

// A stratum with its covariance replaced by the second moment about zero
// (covariance + mean mean'), the clipped block likewise.
export function addMeanOuter(stratum) {
  const second = (c, m) => fullToLower(lowerToFull(c).map((v, k) => v + m[Math.floor(k / 6)] * m[k % 6]));
  if (!stratum.covariance || !stratum.mean) return stratum;  // too few samples for moments
  const out = { ...stratum, covariance: second(stratum.covariance, stratum.mean) };
  if (stratum.clipped?.covariance) out.clipped = { ...stratum.clipped, covariance: second(stratum.clipped.covariance, stratum.clipped.mean) };
  return out;
}
export const positionTrace = (stratum) => stratum.covariance[0] + stratum.covariance[2] + stratum.covariance[5];

// Eigenvalues of a symmetric n x n matrix (cyclic Jacobi).
export function symmetricEigenvalues(a, n) {
  const m = [...a];
  for (let sweep = 0; sweep < 100; ++sweep) {
    let off = 0;
    for (let p = 0; p < n; ++p) for (let q = p + 1; q < n; ++q) off += m[p * n + q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; ++p) for (let q = p + 1; q < n; ++q) {
      if (Math.abs(m[p * n + q]) < 1e-300) continue;
      const theta = (m[q * n + q] - m[p * n + p]) / (2 * m[p * n + q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; ++k) {
        const kp = m[k * n + p], kq = m[k * n + q];
        m[k * n + p] = c * kp - s * kq; m[k * n + q] = s * kp + c * kq;
      }
      for (let k = 0; k < n; ++k) {
        const pk = m[p * n + k], qk = m[q * n + k];
        m[p * n + k] = c * pk - s * qk; m[q * n + k] = s * pk + c * qk;
      }
    }
  }
  return Array.from({ length: n }, (_, i) => m[i * n + i]).sort((x, y) => x - y);
}

// H4's corrected C1: second moment of consecutive differences minus the
// second moment of the at-epoch error against precise orbits (independence
// of the two set errors assumed, as PLAN.md states). psd: whether every
// stratum's position block stays positive definite.
export function correctedModel(raw, epoch, gpRegime) {
  const e = epoch.strata.find((s) => s.regime === gpRegime && s.ageIndex === 0);
  const eFull = lowerToFull(addMeanOuter(e).covariance);
  let psd = true;
  const eigenvalues = [];
  const strata = raw.strata.map((s) => {
    const { clipped, ...rest } = addMeanOuter(s);
    void clipped;
    if (s.regime !== gpRegime) return rest;
    const full = lowerToFull(rest.covariance).map((v, k) => v - eFull[k]);
    const pos = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => full[i * 6 + j]));
    const ev = symmetricEigenvalues(pos, 3);
    eigenvalues.push({ ageDays: s.ageDays, positionKm2: ev });
    if (!(ev[0] > 0)) psd = false;
    return { ...rest, covariance: fullToLower(full), mean: Array(6).fill(0) };
  });
  return { psd, eigenvalues, model: { ...raw, strata } };
}

// d^2 = e' C^-1 e for a 3-vector and a row-major 3x3 covariance, by
// Cholesky (statistics on module outputs); NaN when C is not positive definite.
export function mahalanobis3(e, c) {
  const l00 = Math.sqrt(c[0]), l10 = c[3] / l00, l20 = c[6] / l00;
  const l11 = Math.sqrt(c[4] - l10 * l10), l21 = (c[7] - l20 * l10) / l11;
  const l22 = Math.sqrt(c[8] - l20 * l20 - l21 * l21);
  const z0 = e[0] / l00, z1 = (e[1] - l10 * z0) / l11, z2 = (e[2] - l20 * z0 - l21 * z1) / l22;
  return z0 * z0 + z1 * z1 + z2 * z2;
}
