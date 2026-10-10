// analysis/estimation `evaluate_teag`: the MVEE of a finite support, for the
// ESPF's published sets and their alpha-cuts. Framing only.

// points: count x n row-major. Returns {center, shape, logVolume, iterations}
// or null when the module finds no MVEE (fewer than n + 1 points or a
// degenerate set). The filter's own settings (EspfOptions mvee_tolerance
// 1e-7, 20,000 iterations) reproduce its internal MVEE exactly.
export async function mvee(codec, est, points, n, { tolerance = 1e-7, maxIterations = 20000 } = {}) {
  const T = codec.T;
  const count = points.length / n;
  if (count < n + 1) return null;
  const envelope = T('EstimationEnvelope', { teagRequest: T('TeagRequest', { dimension: n, points: [...points], mvee: true, mveeTolerance: tolerance, mveeMaxIterations: maxIterations }) });
  let response;
  try {
    response = await est.invoke('evaluate_teag', [codec.frame('request', codec.pack(envelope))]);
  } catch {
    return null;  // degenerate support: the module finds no MVEE
  }
  if (response.statusCode !== 0) return null;
  const r = codec.unpack(response.outputs.find((o) => o.portId === 'result').payload).teagResult;
  if (!r?.mveeShape?.length) return null;
  return { center: [...r.mveeCenter], shape: [...r.mveeShape], logVolume: r.mveeLogVolume, iterations: r.mveeIterations };
}
