// Synthetic coverage rows for exercising the S2 evaluators without Part 1's data. chi-square(3) errors, optional erratic days.
import { rng, normal } from './synth.mjs';
export function synthRows({ clusters = 8, blocks = 10, perBlock = 30, erraticShare = 0.2, erraticScale = 2, inflates = true, seed = 5 } = {}) {
  const r = rng(seed), rows = [];
  for (let c = 0; c < clusters; c++) for (let b = 0; b < blocks; b++) for (let i = 0; i < perBlock; i++) {
    const erratic = r() < erraticShare, s = erratic ? erraticScale : 1, e = [0, 1, 2].map(() => normal(r) * s), d2Base = e.reduce((a, x) => a + x * x, 0);
    // P_o inflated by s^2 on erratic days when inflates, else unchanged
    rows.push({ regime: c % 2 ? 'LEO-M' : 'MEO', cluster: `c${c}`, block: b, flagged: erratic, d2Base, d2O: inflates && erratic ? d2Base / (s * s) : d2Base, half: i % 2, z: e.map((x) => x / s) });
  }
  return rows;
}
