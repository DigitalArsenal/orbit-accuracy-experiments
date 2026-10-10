// Gradient-boosted decision trees for multi-class classification (Friedman
// 2001, "Greedy function approximation: a gradient boosting machine", Ann.
// Statist. 29(5); multinomial deviance, one regression tree per class and
// round, Newton leaf values as in his Algorithm 6). Statistics only: it
// learns from feature vectors, it computes no orbit. Deterministic given its
// options (no subsampling).
const softmax = (z) => { const m = Math.max(...z); const e = z.map((v) => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map((v) => v / s); };

// One regression tree on gradients g and hessians h over rows idx.
function grow(X, g, h, idx, depth, { maxDepth, minLeaf, lambda }) {
  const G = idx.reduce((s, i) => s + g[i], 0), H = idx.reduce((s, i) => s + h[i], 0);
  const leaf = { value: G / (H + lambda) };
  if (depth >= maxDepth || idx.length < 2 * minLeaf) return leaf;
  const score = (gs, hs) => (gs * gs) / (hs + lambda);
  let best = null;
  const p = X[0].length;
  for (let f = 0; f < p; ++f) {
    const order = [...idx].sort((a, b) => X[a][f] - X[b][f]);
    let gl = 0, hl = 0;
    for (let k = 0; k < order.length - 1; ++k) {
      gl += g[order[k]]; hl += h[order[k]];
      if (k + 1 < minLeaf || order.length - k - 1 < minLeaf) continue;
      const x0 = X[order[k]][f], x1 = X[order[k + 1]][f];
      if (x0 === x1) continue;
      const gain = score(gl, hl) + score(G - gl, H - hl) - score(G, H);
      if (!best || gain > best.gain) best = { gain, feature: f, threshold: (x0 + x1) / 2 };
    }
  }
  if (!best || best.gain <= 1e-12) return leaf;
  const left = idx.filter((i) => X[i][best.feature] <= best.threshold), right = idx.filter((i) => X[i][best.feature] > best.threshold);
  return { feature: best.feature, threshold: best.threshold, gain: best.gain,
    left: grow(X, g, h, left, depth + 1, { maxDepth, minLeaf, lambda }), right: grow(X, g, h, right, depth + 1, { maxDepth, minLeaf, lambda }) };
}
const predictTree = (t, x) => { while (t.left) t = x[t.feature] <= t.threshold ? t.left : t.right; return t.value; };

// X [[n x p]], y [class index], K classes. Returns a model {K, rate, prior, trees}.
export function train(X, y, K, { rounds = 150, rate = 0.1, maxDepth = 3, minLeaf = 4, lambda = 1 } = {}) {
  const n = X.length;
  const counts = Array(K).fill(1); y.forEach((c) => ++counts[c]);
  const prior = counts.map((c) => Math.log(c / (n + K)));
  const F = X.map(() => [...prior]);
  const trees = [];
  const idx = X.map((_, i) => i);
  for (let r = 0; r < rounds; ++r) {
    const P = F.map(softmax);
    const round = [];
    for (let k = 0; k < K; ++k) {
      const g = P.map((p, i) => (y[i] === k ? 1 : 0) - p[k]);
      const h = P.map((p) => Math.max(p[k] * (1 - p[k]), 1e-6));
      const tree = grow(X, g, h, idx, 0, { maxDepth, minLeaf, lambda });
      round.push(tree);
      for (let i = 0; i < n; ++i) F[i][k] += rate * ((K - 1) / K) * predictTree(tree, X[i]);
    }
    trees.push(round);
  }
  return { K, rate, prior, trees };
}

export function predict(model, x) {
  const F = [...model.prior];
  for (const round of model.trees) round.forEach((t, k) => { F[k] += model.rate * ((model.K - 1) / model.K) * predictTree(t, x); });
  return softmax(F);
}

// Total split gain per feature (importance).
export function importance(model, p) {
  const out = Array(p).fill(0);
  const walk = (t) => { if (!t.left) return; out[t.feature] += t.gain; walk(t.left); walk(t.right); };
  for (const round of model.trees) round.forEach(walk);
  const s = out.reduce((a, b) => a + b, 0) || 1;
  return out.map((v) => v / s);
}
