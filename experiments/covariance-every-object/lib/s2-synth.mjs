// Synthetic cell rows for exercising the S2 evaluators without Part 1's data. chi-square(3) errors, optional erratic days.
import { rng, normal } from './synth.mjs'; import { C95, C99 } from './s2.mjs';
export function synthRows({ clusters = 8, blocks = 10, perBlock = 30, erraticShare = 0.2, erraticScale = 2, inflates = true, seed = 5 } = {}) {
  const r = rng(seed), rows = [];
  for (let c = 0; c < clusters; c++) for (let b = 0; b < blocks; b++) for (let i = 0; i < perBlock; i++) {
    const erratic = r() < erraticShare, s = erratic ? erraticScale : 1, e = [0, 1, 2].map(() => normal(r) * s), d2 = e.reduce((a, x) => a + x * x, 0), d2O = inflates && erratic ? d2 / (s * s) : d2;
    rows.push({ regime: c % 2 ? 'LEO-M' : 'MEO', cluster: `c${c}`, block: b, flagged: erratic, half: i % 2, n: 1, cb: +(d2 <= C95), co: +(d2O <= C95), cb4: +(4 * d2 <= C95), co99: +(d2O <= C99), z: { n: 1, ok: e.map((x) => +(Math.abs(x / s) <= 1.96)), sum: e.map((x) => x / s) } });
  }
  return rows;
}
