// The maneuver flag (results/ffm-losses-to-ap, fixes F5 and F10): steps of a truth's mean semimajor axis, and where each falls in a window. Each state's osculating
// semimajor axis and orbit plane are foundation/orbits' (cartesian_to_keplerian, through sdn-gp-starlink-ffm-match/lib/orbits.mjs); this file only averages,
// differences and compares them.
//   Low orbit (the study's skeptic-drag/steps.py, on time means): the time mean over each revolution, ascending node to ascending node (GCRF z from below 0 to
//   0 or above, the crossing interpolated in z), by the trapezoid rule; a revolution with a hole (a spacing over 1.5 times the product's own) is left out. The
//   study averaged the states of a revolution instead, which moves the mean by one state's share of the twice-per-revolution swing (about 15 m at 10 s, 440 m
//   at 300 s) whenever a revolution holds one state more. The change at revolution i is the median of the 12 revolutions from i less the median of the 12
//   before it, where those 24 span 2.2 days or less; its residual is that less the median change 1 to 3 days either side (the drift: decay moves the two
//   medians apart by about 2 m at 700 km). A step is a residual of 8 m or more, the largest within 12 revolutions either side (the first of equals). Its epoch
//   is the start of revolution i, the first whole revolution after the burn.
//   Geosynchronous (the study's burn-times.mjs, F10): on the hour, the mean over the sidereal day after less the mean over the sidereal day before; its
//   residual is that less the median of the same difference 1 to 3 sidereal days either side, so the satellite's drift does not count. A burn is the largest
//   within a day either side of a residual 4 times the satellite's median residual or more, or of an angle between the two days' mean orbit normals 4 times its
//   median angle or more.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MATCH = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../sdn-gp-starlink-ffm-match/lib');

export const HOUR = 3600000, DAY = 86400000, GM = 398600.4418;
export const LOW = { K: 12, minM: 8, maxSpanDays: 2.2, holeTimes: 1.5, baselineDays: [1, 3] };
export const GEO = { windowS: 86164.0905, stepH: 1, minStates: 100, baselineDays: [1, 3], times: 4, peakDays: 1 };
const ms = (epoch) => Date.parse(/Z$/.test(epoch) ? epoch : `${epoch}Z`);
const median = (v) => { const s = [...v].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

/**
 * foundation/orbits on one state: { aM: osculating semimajor axis in m, normal: unit orbit normal from inclination and node }. From the modules checkout's dist, or
 * by `build` ({ modulesCommit, wasmSha256 }: lib/ap.mjs pinnedFile, git show at the commit, SHA-256 checked).
 */
export async function openElements({ build } = {}) {
  const { openOrbits } = await import(pathToFileURL(path.join(MATCH, 'orbits.mjs')).href);
  const { modulesRoot } = await import(pathToFileURL(path.join(MATCH, 'modules.mjs')).href);
  let modules = modulesRoot();
  if (build) {
    const file = (await import('./ap.mjs')).pinnedFile('foundation/orbits', build), at = path.join(os.tmpdir(), 'operator-theory-root', build.modulesCommit, 'foundation/orbits');
    fs.mkdirSync(path.join(at, 'dist/isomorphic'), { recursive: true });
    fs.copyFileSync(file, path.join(at, 'dist/isomorphic/module.wasm'));
    fs.copyFileSync(path.join(path.dirname(file), 'plugin-manifest.json'), path.join(at, 'plugin-manifest.json'));
    modules = path.join(os.tmpdir(), 'operator-theory-root', build.modulesCommit);
  }
  const orbits = await openOrbits(modules, { gm: GM });
  const rad = Math.PI / 180;
  return {
    async of(l) {
      const k = await orbits.toKeplerian({ epoch: new Date(ms(l.epoch)).toISOString(), r: l.r, v: l.v });
      const i = k.i * rad, o = k.raan * rad;
      return { aM: k.a * 1000, normal: [Math.sin(i) * Math.sin(o), -Math.sin(i) * Math.cos(o), Math.cos(i)] };
    },
    close: () => orbits.destroy(),
  };
}

/** One state per epoch, in time order: { t, l }. */
const ordered = (lines) => { const seen = new Map(); for (const l of lines) seen.set(ms(l.epoch), l); return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([t, l]) => ({ t, l })); };

/** Revolution time means, ascending node to ascending node: [{ t: crossing ms, aM }]; a revolution with a hole is left out. */
export async function revolutions(lines, elements, rule = LOW) {
  const s = ordered(lines);
  const gaps = s.slice(1).map((x, i) => x.t - s[i].t).sort((a, b) => a - b), step = gaps[gaps.length >> 1], hole = rule.holeTimes * step;
  const out = [];
  let start = null, area = 0, holed = false, prev = null;
  for (const { t, l } of s) {
    const z = l.r[2], a = start === null && !(prev && prev.z < 0 && z >= 0) ? null : (await elements.of(l)).aM;
    if (prev && prev.z < 0 && z >= 0) {
      const pa = prev.a ?? (await elements.of(prev.l)).aM, f = -prev.z / (z - prev.z), tc = prev.t + f * (t - prev.t), ac = pa + f * (a - pa);
      if (start !== null && !holed && t - prev.t <= hole) out.push({ t: start, aM: (area + ((tc - prev.t) * (pa + ac)) / 2) / (tc - start) });
      start = tc; area = ((t - tc) * (ac + a)) / 2; holed = t - prev.t > hole;
    } else if (start !== null) {
      if (t - prev.t > hole) holed = true;
      area += ((t - prev.t) * (prev.a + a)) / 2;
    }
    prev = { t, z, a, l };
  }
  return out;
}

/** Low-orbit steps of revolution means: { steps: [{ t, sizeM: the residual, changeM: the change }], checked: [[from, to]] (ms: the spans where a step could be found) }. */
export function lowSteps(revs, rule = LOW) {
  const R = revs, K = rule.K, s = new Array(R.length).fill(null), d = new Array(R.length).fill(null);
  for (let i = K; i < R.length - K; i += 1) {
    if (R[i + K].t - R[i - K].t > rule.maxSpanDays * DAY) continue;
    s[i] = median(R.slice(i, i + K).map((r) => r.aM)) - median(R.slice(i - K, i).map((r) => r.aM));
  }
  const [b0, b1] = rule.baselineDays.map((x) => x * DAY);
  for (let i = 0, lo = 0, hi = 0; i < R.length; i += 1) {
    if (s[i] === null) continue;
    while (R[lo].t < R[i].t - b1) lo += 1;
    while (hi < R.length && R[hi].t <= R[i].t + b1) hi += 1;
    const near = [];
    for (let j = lo; j < hi; j += 1) if (s[j] !== null && Math.abs(R[j].t - R[i].t) >= b0) near.push(s[j]);
    if (near.length >= K) d[i] = s[i] - median(near);
  }
  const steps = [], checked = [];
  for (let i = 0; i < R.length; i += 1) {
    if (d[i] === null) continue;
    const last = checked.at(-1);
    if (last && last.i === i - 1) { last[1] = R[i].t; last.i = i; } else checked.push(Object.assign([R[i].t, R[i].t], { i }));
    if (d[i] < rule.minM) continue;
    let top = true;
    for (let j = Math.max(0, i - K); j < Math.min(R.length, i + K) && top; j += 1) if (d[j] !== null && (d[j] > d[i] || (j < i && d[j] === d[i]))) top = false;
    if (top) steps.push({ t: R[i].t, sizeM: d[i], changeM: s[i] });
  }
  return { steps, checked: checked.map(([a, b]) => [a, b]) };
}

/** Geosynchronous burns from hourly sidereal-day means: { steps: [{ t, sizeM, residualM, planeMdeg, by }], rows: the hourly [{ t, daM, residualM, planeMdeg }], checked, medianResidualM, medianPlaneMdeg }. */
export async function geoSteps(lines, elements, rule = GEO) {
  const L = [];
  for (const { t, l } of ordered(lines)) if (l.v && Number.isFinite(l.v[0])) L.push({ t, ...(await elements.of(l)) });
  const W = rule.windowS * 1000, H = rule.stepH * HOUR;
  const times = L.map((x) => x.t);
  const lower = (t) => { let lo = 0, hi = times.length; while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < t) lo = m + 1; else hi = m; } return lo; };
  const meanOver = (a, b) => {
    const i = lower(a), j = lower(b);
    if (j - i < rule.minStates) return null;
    let sa = 0; const h = [0, 0, 0];
    for (let k = i; k < j; k += 1) { sa += L[k].aM; for (let c = 0; c < 3; c += 1) h[c] += L[k].normal[c]; }
    const m = Math.hypot(...h);
    return { aM: sa / (j - i), normal: h.map((x) => x / m) };
  };
  const rows = [];
  for (let t = Math.ceil(L[0].t / H) * H + W; t + W <= L.at(-1).t; t += H) {
    const p = meanOver(t - W, t), q = meanOver(t, t + W);
    if (!p || !q) continue;
    const plane = (Math.acos(Math.min(1, p.normal.reduce((s, x, k) => s + x * q.normal[k], 0))) * 180) / Math.PI * 1000;
    rows.push({ t, daM: q.aM - p.aM, planeMdeg: plane });
  }
  const [b0, b1] = rule.baselineDays.map((d) => d * W);
  for (const r of rows) {
    const near = rows.filter((x) => Math.abs(x.t - r.t) >= b0 && Math.abs(x.t - r.t) <= b1).map((x) => x.daM);
    r.residualM = near.length ? r.daM - median(near) : null;
  }
  const scored = rows.filter((r) => r.residualM !== null);
  const mr = median(scored.map((r) => Math.abs(r.residualM))), mp = median(rows.map((r) => r.planeMdeg));
  const steps = [];
  for (const r of scored) {
    const nb = scored.filter((x) => Math.abs(x.t - r.t) <= rule.peakDays * DAY);
    const byResidual = Math.abs(r.residualM) >= rule.times * mr && Math.abs(r.residualM) === Math.max(...nb.map((x) => Math.abs(x.residualM)));
    const byPlane = r.planeMdeg >= rule.times * mp && r.planeMdeg === Math.max(...nb.map((x) => x.planeMdeg));
    if (byResidual || byPlane) steps.push({ t: r.t, sizeM: r.daM, residualM: r.residualM, planeMdeg: r.planeMdeg, by: byResidual && byPlane ? 'both' : byResidual ? 'semimajor axis' : 'plane' });
  }
  const checked = [];
  for (const r of scored) { const last = checked.at(-1); if (last && r.t - last[1] <= H) last[1] = r.t; else checked.push([r.t, r.t]); }
  return { steps, rows, checked, medianResidualM: mr, medianPlaneMdeg: mp };
}

/** A window's flag from an object's detector output ({ steps, checked } in ms): its steps in [cutoff - fit, cutoff + lead] by hours from the cutoff (sizes to 0.1 m), and the
 *  spans of it the detector could not cover. */
export function windowSteps(d, cutoffMs, { fitHours = 72, leadHours = 168 } = {}) {
  const r1 = (x) => Math.round(x * 10) / 10, from = cutoffMs - fitHours * HOUR, to = cutoffMs + leadHours * HOUR;
  const steps = d.steps.filter((s) => s.t >= from && s.t <= to).map((s) => ({ t: new Date(s.t).toISOString().slice(0, 16), hours: r1((s.t - cutoffMs) / HOUR), sizeM: r1(s.sizeM) }));
  const unchecked = [];
  let at = from;
  for (const [a, b] of d.checked.filter(([a, b]) => b >= from && a <= to).sort((p, q) => p[0] - q[0])) { if (a > at + 2 * HOUR) unchecked.push([r1((at - cutoffMs) / HOUR), r1((a - cutoffMs) / HOUR)]); at = Math.max(at, b); }
  if (at < to - 2 * HOUR) unchecked.push([r1((at - cutoffMs) / HOUR), r1((to - cutoffMs) / HOUR)]);
  return { steps, unchecked };
}

/**
 * A flagged window (results/operator-theory/maneuver-flags/flags.json: its steps by hours from the cutoff, and the spans the detector could not cover) at a fit and
 * lead: a step in the fit arc [-fit, 0] or the forecast span (0, lead] flags it; with none it is step-free only where the detector covered both, else unchecked.
 */
export function windowState(w, fit, lead) {
  const inFit = w.steps.some((s) => s.hours >= -fit && s.hours <= 0), inForecast = w.steps.some((s) => s.hours > 0 && s.hours <= lead);
  const covered = !w.unchecked.some(([a, b]) => b > -fit && a < lead);
  return { inFit, inForecast, flagged: inFit || inForecast, stepFree: !inFit && !inForecast && covered, unchecked: !inFit && !inForecast && !covered };
}

/** The class of a window-lead: a maneuver outranks a storm, everywhere a class is assigned. */
export const classOf = ({ maneuver, storm }) => (maneuver ? 'maneuver' : storm ? 'storm' : 'neither');

// The worked examples (compare-examples.mjs picks them, compare-examples-publish.mjs writes what the site reads): positions in km, offsets in m. Arithmetic on stored positions only.
/** The reference's radial, in-track and cross-track axes at one sample, in GCRF; its motion is differenced across the sample. */
export function axesAt(reference, count, i) {
  const k = 3 * i, lo = 3 * Math.max(0, i - 1), hi = 3 * Math.min(count - 1, i + 1);
  const p = [reference[k], reference[k + 1], reference[k + 2]], v = [reference[hi] - reference[lo], reference[hi + 1] - reference[lo + 1], reference[hi + 2] - reference[lo + 2]];
  const r = Math.hypot(...p), R = p.map((x) => x / r);
  const c = [p[1] * v[2] - p[2] * v[1], p[2] * v[0] - p[0] * v[2], p[0] * v[1] - p[1] * v[0]], m = Math.hypot(...c), C = c.map((x) => x / m);
  return { p, R, I: [C[1] * R[2] - C[2] * R[1], C[2] * R[0] - C[0] * R[2], C[0] * R[1] - C[1] * R[0]], C };
}

/** Radial, in-track, cross-track distance of one track from the reference at each time, Float32 meters, positions in km. */
export function offsetsOf(track, reference, count) {
  const out = new Float32Array(3 * count);
  for (let i = 0; i < count; i += 1) {
    const k = 3 * i, { p, R, I, C } = axesAt(reference, count, i);
    const d = [(track[k] - p[0]) * 1000, (track[k + 1] - p[1]) * 1000, (track[k + 2] - p[2]) * 1000];
    const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
    out[k] = dot(R); out[k + 1] = dot(I); out[k + 2] = dot(C);
  }
  return out;
}

/**
 * Where the reference's orbit steps: a burn the forecast does not know about moves the forecast's orbit-mean radial distance from the reference at once, and drag and fit error move it slowly.
 * At each sample, the mean over the orbit after less the mean over the orbit before, against the median absolute size of that difference for this example; a step is at least 8 of those and
 * at least 5 m. Hours from the first state. On next-prediction examples, only before the newer file starts, since the reference changes source there.
 */
export function exampleSteps(d, offsets) {
  const t = d.epochsSeconds, period = 86400 / d.meanMotion, lastT = d.reference === 'next' ? (d.scoreFromMs - Date.parse(d.start)) / 1000 : Infinity;
  const stepS = t[1] - t[0], stride = Math.max(1, Math.round(period / 4 / stepS));
  const mean = (from, to) => { let s = 0, n = 0; for (let i = 0; i < t.length; i += 1) if (t[i] >= from && t[i] < to) { s += offsets[3 * i]; n += 1; } return n >= (period / stepS) / 2 ? s / n : NaN; };
  const jumps = [];
  for (let i = 0; i < t.length; i += stride) {
    if (t[i] - period < t[0] || t[i] + period > Math.min(t.at(-1), lastT)) continue;
    const j = mean(t[i], t[i] + period) - mean(t[i] - period, t[i]);
    if (Number.isFinite(j)) jumps.push({ at: t[i], j });
  }
  if (!jumps.length) return [];
  const sizes = jumps.map((x) => Math.abs(x.j)).sort((p, q) => p - q), typical = sizes[sizes.length >> 1], floor = Math.max(5, 8 * typical);
  const events = [];
  for (const x of jumps) {
    if (Math.abs(x.j) < floor) continue;
    const last = events.at(-1);
    if (last && x.at - last.at < 2 * period) { if (Math.abs(x.j) > Math.abs(last.j)) { last.at = x.at; last.j = x.j; } } else events.push({ ...x });
  }
  const passive = /laser spheres|geodetic/i.test(d.regime) || /ajisai|starlette|stella|lares|larets|westpac|beacon|lageos|etalon/i.test(d.satellite);
  return events.map((e) => ({ hour: Math.round((e.at / 3600) * 10) / 10, radialM: Math.round(e.j * 10) / 10, kind: passive ? 'reference-step' : 'maneuver' }));
}

/** An example's burns: its maneuver steps inside the fit (hour < fitHours) and after it. */
export const exampleBurns = (d, steps) => ({ burnsInFit: steps.filter((s) => s.kind === 'maneuver' && s.hour < d.fitHours).length, burnsInForecast: steps.filter((s) => s.kind === 'maneuver' && s.hour >= d.fitHours).length });

/** The steps of an example being picked, from its tracks ({ name: [[x, y, z]] }, km) as the publisher finds them on FFM's offsets. */
export const pickedSteps = (d, tracks) => exampleSteps(d, offsetsOf(Float64Array.from(tracks.FFM.flat()), Float64Array.from(tracks.reference.flat()), d.count));
