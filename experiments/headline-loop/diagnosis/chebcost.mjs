// Proxy cost of a piecewise Chebyshev record per state (JavaScript, V8): segment lookup plus Clenshaw for 3 position components
// (and the velocity by the derivative series), degree p. A measure of the arithmetic, not of the module; wasm would be similar or faster.
//   node experiments/headline-loop/diagnosis/chebcost.mjs
const cpu = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
for (const p of [5, 8, 12, 16]) for (const withVel of [false, true]) {
  const nSeg = 200, coef = new Float64Array(nSeg * 3 * (p + 1)).map(() => Math.random()), segLen = 3600;
  const out = new Float64Array(6);
  const evalAt = (t) => {
    const s = Math.min(nSeg - 1, Math.floor(t / segLen)), x = (2 * (t - s * segLen)) / segLen - 1, base = s * 3 * (p + 1);
    for (let c = 0; c < 3; c += 1) {
      let b1 = 0, b2 = 0, d1 = 0, d2 = 0;
      const o = base + c * (p + 1);
      for (let k = p; k >= 1; k -= 1) {
        const b0 = 2 * x * b1 - b2 + coef[o + k];
        if (withVel) { const d0 = 2 * x * d1 - d2 + 2 * b1; d2 = d1; d1 = d0; }
        b2 = b1; b1 = b0;
      }
      out[c] = x * b1 - b2 + coef[o];
      if (withVel) out[3 + c] = (x * d1 - d2 + b1) * (2 / segLen);
    }
    return out[0];
  };
  let sink = 0;
  for (let i = 0; i < 1e5; i += 1) sink += evalAt((i * 7.3) % (nSeg * segLen));
  const N = 5e6, c0 = cpu();
  for (let i = 0; i < N; i += 1) sink += evalAt((i * 7.3) % (nSeg * segLen));
  const us = ((cpu() - c0) * 1000) / N;
  console.log(`degree ${p}${withVel ? ' + velocity' : ''}: ${us.toFixed(3)} µs per state ${sink > 0 ? '' : ' '}`);
}
