// The maneuver flag (results/ffm-losses-to-ap, fixes F5 and F10): steps of a truth's mean semimajor axis, and where each falls in a window. Each state's osculating
// semimajor axis and orbit plane are foundation/orbits' (cartesian_to_keplerian, through sdn-gp-starlink-ffm-match/lib/orbits.mjs); this file only averages,
// differences and compares them.
//   Low orbit (the study's skeptic-drag/steps.py): the mean over each revolution, ascending node to ascending node; revolutions whose state count is within 2 of
//   the commonest count; the step at revolution i is the median of the 12 revolutions from i less the median of the 12 before it, where those 24 span 2.2 days
//   or less; a step is 8 m or more and the largest within 12 revolutions either side. Its epoch is the start of revolution i.
//   Geosynchronous (the study's burn-times.mjs, F10): on the hour, the mean over the sidereal day after less the mean over the sidereal day before; its
//   residual is that less the median of the same difference 1 to 3 sidereal days either side. A burn is the largest within a day either side of a residual of
//   4 times the satellite's median residual or more, or of the angle between the two days' mean orbit normals of 4 times its median angle or more.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = path.dirname(new URL(import.meta.url).pathname);
const MATCH = path.resolve(here, '../../sdn-gp-starlink-ffm-match/lib');
const { openOrbits } = await import(pathToFileURL(path.join(MATCH, 'orbits.mjs')).href);
const { modulesRoot } = await import(pathToFileURL(path.join(MATCH, 'modules.mjs')).href);

export const HOUR = 3600000, DAY = 86400000;
export const LOW = { K: 12, minM: 8, maxSpanDays: 2.2, countSlack: 2 };
export const GEO = { windowS: 86164.0905, stepH: 1, minStates: 100, baselineDays: [1, 3], times: 4, peakDays: 1 };
const ms = (epoch) => Date.parse(/Z$/.test(epoch) ? epoch : `${epoch}Z`);
const median = (v) => { const s = [...v].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

/** foundation/orbits on one state: { aM: osculating semimajor axis in m, normal: unit orbit normal from inclination and node }. Its provenance beside it. */
export async function openElements() {
  const orbits = await openOrbits(modulesRoot());
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

/** Revolution means, ascending node (GCRF z from below 0 to 0 or above) to ascending node: [{ t: start ms, aM, n }]; a revolution of 8 states or fewer is dropped. */
export async function revolutions(lines, elements) {
  const out = [];
  let start = null, acc = [], prevZ = null;
  for (const { t, l } of ordered(lines)) {
    const z = l.r[2];
    if (prevZ !== null && prevZ < 0 && z >= 0) {
      if (start !== null && acc.length > 8) out.push({ t: start, aM: mean(acc), n: acc.length });
      start = t; acc = [];
    }
    if (start !== null) acc.push((await elements.of(l)).aM);
    prevZ = z;
  }
  return out;
}

/** Low-orbit steps of revolution means: { steps: [{ t, sizeM }], checked: [[from, to]] (ms: the spans where a step could be found), modalCount }. */
export function lowSteps(revs, rule = LOW) {
  const counts = new Map();
  for (const r of revs) counts.set(r.n, (counts.get(r.n) ?? 0) + 1);
  let modal = null, most = -1;
  for (const [n, c] of counts) if (c > most) { most = c; modal = n; }
  const R = revs.filter((r) => Math.abs(r.n - modal) <= rule.countSlack), K = rule.K, s = new Array(R.length).fill(null);
  for (let i = K; i < R.length - K; i += 1) {
    if (R[i + K].t - R[i - K].t > rule.maxSpanDays * DAY) continue;
    s[i] = median(R.slice(i, i + K).map((r) => r.aM)) - median(R.slice(i - K, i).map((r) => r.aM));
  }
  const steps = [], checked = [];
  for (let i = 0; i < R.length; i += 1) {
    if (s[i] === null) continue;
    const last = checked.at(-1);
    if (last && last.i === i - 1) { last[1] = R[i].t; last.i = i; } else checked.push(Object.assign([R[i].t, R[i].t], { i }));
    if (s[i] < rule.minM) continue;
    let top = -Infinity;
    for (let j = Math.max(0, i - K); j < Math.min(R.length, i + K); j += 1) if (s[j] !== null && s[j] > top) top = s[j];
    if (s[i] === top) steps.push({ t: R[i].t, sizeM: s[i] });
  }
  return { steps, checked: checked.map(([a, b]) => [a, b]), modalCount: modal };
}

/** Geosynchronous burns from hourly sidereal-day means: { steps: [{ t, sizeM, residualM, planeMdeg }], checked, medianResidualM, medianPlaneMdeg }. */
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
  return { steps, checked, medianResidualM: mr, medianPlaneMdeg: mp };
}

/** Where steps fall in a window cut at `cutoffMs`: in the fit arc [cutoff - fit, cutoff], in the forecast span (cutoff, cutoff + lead]; checked when the detector covered both. */
export function windowFlag({ steps, checked }, cutoffMs, fitHours, leadHours, slackMs = 2 * HOUR) {
  const from = cutoffMs - fitHours * HOUR, to = cutoffMs + leadHours * HOUR;
  return {
    inFit: steps.filter((s) => s.t >= from && s.t <= cutoffMs),
    inForecast: steps.filter((s) => s.t > cutoffMs && s.t <= to),
    checked: checked.some(([a, b]) => a <= from + slackMs && b >= to - slackMs),
  };
}

/** The class of a window-lead: a maneuver outranks a storm, everywhere a class is assigned. */
export const classOf = ({ maneuver, storm }) => (maneuver ? 'maneuver' : storm ? 'storm' : 'neither');
