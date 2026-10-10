// SatNOGS waterfall images (matplotlib PNG: time up the y axis from 0 s at
// the bottom edge, frequency offset from the tuned frequency along x, a
// colorbar at the right) read as a grid of relative power, and the signal's
// track extracted the way STRF's rffind does it on a spectrogram: per time
// row, pixels standing above the row's noise by a threshold, near the
// track. Image measurement only: no orbit, frame or Doppler computation.
import { decodePng } from '../../harness/png.mjs';
import { median } from '../../harness/stats.mjs';

const lum = (p) => p[0] + p[1] + p[2];
const groups = (indices) => {
  const out = [];
  for (const i of indices) {
    const last = out.at(-1);
    if (last && i === last[1] + 1) last[1] = i; else out.push([i, i]);
  }
  return out;
};

// The plot geometry: axes frame, colorbar, tick positions.
function geometry(img) {
  const dark = (x, y) => lum(img.pixel(x, y)) < 150;
  const cols = [], rows = [];
  for (let x = 0; x < img.width; ++x) { let n = 0; for (let y = 0; y < img.height; ++y) if (dark(x, y)) ++n; if (n > img.height * 0.5) cols.push(x); }
  const cg = groups(cols);
  if (cg.length < 4) throw new Error('waterfall: axes frame and colorbar not found');
  for (let y = 0; y < img.height; ++y) { let n = 0; for (let x = cg[0][0]; x <= cg[1][1]; ++x) if (dark(x, y)) ++n; if (n > (cg[1][1] - cg[0][0]) * 0.9) rows.push(y); }
  const rg = groups(rows);
  if (rg.length < 2) throw new Error('waterfall: top and bottom frame not found');
  const frame = { left: cg[0][1], right: cg[1][0], top: rg[0][1], bottom: rg.at(-1)[0] };
  const ticks = (positions) => groups(positions).map(([a, b]) => (a + b) / 2);
  const xt = [], yt = [], rt = [];
  for (let x = frame.left; x <= frame.right; ++x) if (dark(x, frame.bottom + 3)) xt.push(x);
  for (let y = frame.top; y <= frame.bottom; ++y) if (dark(frame.left - 3, y)) yt.push(y);
  for (let y = frame.top; y <= frame.bottom; ++y) if (dark(frame.right + 3, y)) rt.push(y);
  // Colorbar: its middle column, top (maximum) to bottom (minimum).
  const cbx = Math.round((cg[2][1] + cg[3][0]) / 2);
  const cbRows = [];
  for (let y = 0; y < img.height; ++y) if (lum(img.pixel(cbx, y)) < 700) cbRows.push(y);
  const cb = groups(cbRows).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  return { frame, xTicks: ticks(xt), yTicks: ticks(yt), rightTicks: ticks(rt), colorbar: { x: cbx, top: cb[0] + 1, bottom: cb[1] - 1 } };
}

// Color -> relative level in [0, 1] (0 = colorbar minimum), by the colorbar.
function levels(img, cb) {
  const table = [];
  for (let y = cb.top; y <= cb.bottom; ++y) table.push([img.pixel(cb.x, y), (cb.bottom - y) / (cb.bottom - cb.top)]);
  const cache = new Map();
  return (p) => {
    const key = (p[0] << 16) | (p[1] << 8) | p[2];
    let v = cache.get(key);
    if (v === undefined) {
      let best = Infinity;
      for (const [c, level] of table) {
        const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2;
        if (d < best) { best = d; v = level; }
      }
      cache.set(key, v);
    }
    return v;
  };
}

// The waterfall as {hzOf(x), secondsOf(y), level(x, y), frame, scale} or
// throws when its axes are not a supported layout. durationSeconds: the
// observation's length, which fixes the time axis' tick step.
// scales: [{ratio: [lo, hi], tickHz}] — the frequency tick step by the ratio
// of the half-width to the tick spacing (config.extraction.frequencyScales).
export function readWaterfall(bytes, { durationSeconds, startMs, startSlackSeconds = 5, scales, timeSteps, minRecordedFraction }) {
  const img = decodePng(bytes);
  const g = geometry(img);
  const { frame } = g;
  if (g.xTicks.length < 3 || g.yTicks.length < 2) throw new Error('waterfall: ticks not found');
  const xs = g.xTicks, dx = (xs.at(-1) - xs[0]) / (xs.length - 1);
  const zero = xs[Math.floor(xs.length / 2)];
  const ratio = (frame.right - frame.left) / 2 / dx;
  const scale = scales.find((s) => ratio >= s.ratio[0] && ratio <= s.ratio[1]);
  if (!scale || xs.length % 2 !== 1 || Math.abs(zero - (frame.left + frame.right) / 2) > 2) throw new Error(`waterfall: unsupported frequency axis (ratio ${ratio.toFixed(3)}, ${xs.length} ticks)`);
  const height = frame.bottom - frame.top;
  let pxPerSecond, step, utcOfBottom = null;
  if (g.rightTicks.length >= 2) {
    // Two time axes (SatNOGS layout since 2026): UTC on the left, ticked
    // on whole minutes; seconds from the recording's start on the right.
    // The bottom edge is the recording start: the whole minute of the lowest
    // left tick is the first one that puts the start at or after the
    // scheduled start less startSlackSeconds.
    const ys = g.yTicks, dy = (ys.at(-1) - ys[0]) / (ys.length - 1);
    step = 60;
    pxPerSecond = dy / 60;
    const lowest = ys.at(-1), before = (frame.bottom - lowest) / pxPerSecond;
    let minute = Math.ceil((startMs / 1000 - startSlackSeconds + before) / 60) * 60;
    utcOfBottom = (minute - before) * 1000;
    const rs = g.rightTicks, rdy = (rs.at(-1) - rs[0]) / (rs.length - 1);
    const rightStep = rdy / pxPerSecond;
    if (!timeSteps.some((t) => Math.abs(rightStep / t - 1) < 0.01)) throw new Error(`waterfall: UTC and seconds axes disagree (right tick step ${rightStep.toFixed(2)} s)`);
  } else {
    // One time axis (seconds from the start): the recording is at most the
    // scheduled duration (it starts late and stops on schedule), so the tick
    // step is the matplotlib step (1, 2, 2.5, 5 x 10^k) that makes the
    // recorded length the largest one not above the scheduled duration
    // (1 % slack), and at least minRecordedFraction of it.
    const ys = g.yTicks, dy = (ys.at(-1) - ys[0]) / (ys.length - 1);
    const implied = dy * durationSeconds / height;
    step = timeSteps.filter((s) => s <= implied * 1.01 && s >= implied * minRecordedFraction).sort((a, b) => b - a)[0];
    if (!step) throw new Error(`waterfall: time axis does not match the scheduled duration (tick step ${implied.toFixed(1)} s)`);
    pxPerSecond = dy / step;
  }
  const level = levels(img, g.colorbar);
  return {
    frame,
    scale: { tickHz: scale.tickHz, halfWidthHz: ratio * scale.tickHz, timeStep: step, recordedSeconds: height / pxPerSecond, utcOfBottom },
    hzOf: (x) => (x - zero) / dx * scale.tickHz,
    secondsOf: (y) => (frame.bottom - y) / pxPerSecond,
    level: (x, y) => level(img.pixel(x, y)),
  };
}

// The track of the strongest near-constant signal in a Doppler-corrected
// waterfall. Per image row: the noise level and spread of the central
// columns (median, MAD), the excess of every column within searchHz of the
// track, and the power-weighted centroid of the columns above zThreshold
// (the carrier's mean frequency, which an FM signal's deviation does not
// move). Points are binned (binSeconds); a bin's value is the median of its
// rows and its uncertainty the robust spread of the rows over sqrt(n).
// Bins off the running median by more than editSigma are dropped.
// Returns {points: [{t, hz, sigmaHz, rows}], center, rowsUsed, rowsTotal}.
export function extractTrack(w, { estimator = 'centroid', jumpHz = Infinity, searchHz, zThreshold, minColumns, binSeconds, minRowsPerBin, floorHz, editSigma, runningBins, excludeDcHz }) {
  const { frame } = w;
  const x0 = frame.left + 1, x1 = frame.right - 1;
  const central = [Math.round(x0 + (x1 - x0) * 0.2), Math.round(x1 - (x1 - x0) * 0.2)];
  const rows = [];
  for (let y = frame.top + 1; y < frame.bottom; ++y) {
    const values = [];
    for (let x = central[0]; x <= central[1]; ++x) values.push(w.level(x, y));
    const m = median(values), s = 1.4826 * median(values.map((v) => Math.abs(v - m))) || 1e-6;
    rows.push({ y, m, s });
  }
  // The track's column: the largest summed excess over all rows, within the
  // central band, away from the DC line.
  const excess = new Map();
  for (const r of rows) {
    for (let x = central[0]; x <= central[1]; ++x) {
      if (Math.abs(w.hzOf(x)) <= excludeDcHz) continue;
      const z = (w.level(x, r.y) - r.m) / r.s;
      if (z >= zThreshold) excess.set(x, (excess.get(x) ?? 0) + z);
    }
  }
  if (!excess.size) return { points: [], center: null, rowsUsed: 0, rowsTotal: rows.length };
  const center = [...excess].sort((a, b) => b[1] - a[1])[0][0];
  const centerHz = w.hzOf(center);
  const raw = [];
  for (const r of rows) {
    let sw = 0, sx = 0, n = 0, peak = null;
    for (let x = x0; x <= x1; ++x) {
      const hz = w.hzOf(x);
      if (Math.abs(hz - centerHz) > searchHz || Math.abs(hz) <= excludeDcHz) continue;
      const z = (w.level(x, r.y) - r.m) / r.s;
      if (z < zThreshold) continue;
      sw += z; sx += z * hz; ++n;
      if (!peak || z > peak.z) peak = { x, z };
    }
    if (n < minColumns) continue;
    if (estimator === 'peak') {
      // Parabolic interpolation of the peak column with its neighbours.
      const a = w.level(peak.x - 1, r.y), b = w.level(peak.x, r.y), c = w.level(peak.x + 1, r.y);
      const den = a - 2 * b + c, offset = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
      raw.push({ t: w.secondsOf(r.y), hz: w.hzOf(peak.x + offset) });
    } else raw.push({ t: w.secondsOf(r.y), hz: sx / sw });
  }
  const bins = new Map();
  for (const p of raw) {
    const k = Math.floor(p.t / binSeconds);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(p);
  }
  let points = [];
  for (const [k, list] of [...bins].sort((a, b) => a[0] - b[0])) {
    if (list.length < minRowsPerBin) continue;
    const hz = median(list.map((p) => p.hz));
    const spread = 1.4826 * median(list.map((p) => Math.abs(p.hz - hz)));
    points.push({ t: (k + 0.5) * binSeconds, tMean: list.reduce((a, p) => a + p.t, 0) / list.length, hz, sigmaHz: Math.max(floorHz, spread / Math.sqrt(list.length)), rows: list.length });
  }
  // Edit: drop bins off the running median of their neighbours.
  for (let pass = 0; pass < 3; ++pass) {
    const keep = points.filter((p, i) => {
      const near = points.slice(Math.max(0, i - runningBins), i + runningBins + 1).map((q) => q.hz);
      const m = median(near), s = 1.4826 * median(near.map((v) => Math.abs(v - m))) || floorHz;
      return Math.abs(p.hz - m) <= editSigma * Math.max(s, p.sigmaHz);
    });
    if (keep.length === points.length) break;
    points = keep;
  }
  // Segments: a step in the offset larger than jumpHz between consecutive
  // bins (a station retuning, or the track jumping to another carrier)
  // starts a new segment, which gets its own frequency bias downstream.
  let segment = 0;
  points.forEach((p, i) => { if (i && Math.abs(p.hz - points[i - 1].hz) > jumpHz) ++segment; p.segment = segment; });
  return { points, center: centerHz, rowsUsed: raw.length, rowsTotal: rows.length, segments: segment + 1 };
}
