// How E1 applies a correction and assigns satellites to tiers (PLAN.md §3–4).
// Bookkeeping on element-set fields only.
import { epochMs } from '../../harness/gp-archive.mjs';
import { designs } from './features.mjs';
import { predict, standardize } from './models.mjs';

// PLAN.md §4: a correction is an along-track time offset Δt, applied as an
// edit of the element set, mean anomaly + n·Δt (n in rev/day, M in degrees).
// The edited set goes through the same modules as M0.
export function shiftAlongTrack(set, dtSeconds) {
  const M = set.elements.MEAN_ANOMALY + 360 * set.elements.MEAN_MOTION * dtSeconds / 86400;
  return { ...set, elements: { ...set.elements, MEAN_ANOMALY: ((M % 360) + 360) % 360 }, correctionSeconds: dtSeconds };
}

// The time offset a fitted candidate predicts for one set: the regression
// predicts the along-track error in seconds of flight, and the correction
// removes it.
export function correctionSeconds(candidate, geometry, norad, fit = candidate.fit) {
  const row = standardize(candidate.standardizer, designs[candidate.method](geometry, candidate.scales, candidate.order));
  return -predict(fit, row, norad);
}

// ── Planes (G2) ──
const TAU = 2 * Math.PI;
const wrap = (x) => ((x % TAU) + TAU) % TAU;
const circularMean = (xs) => wrap(Math.atan2(xs.reduce((s, x) => s + Math.sin(x), 0), xs.reduce((s, x) => s + Math.cos(x), 0)));
const circularDistance = (a, b) => { const d = Math.abs(wrap(a) - wrap(b)); return Math.min(d, TAU - d); };

// Each set nearest `atMs` per satellite.
function nearest(sets, atMs) {
  const best = new Map();
  for (const s of sets) {
    const d = Math.abs(epochMs(s.epoch) - atMs);
    if (!best.has(s.norad) || d < best.get(s.norad).d) best.set(s.norad, { d, set: s });
  }
  return best;
}

// PLAN.md §3 with amendment 3: satellites with an element set within
// `withinDays` of `assignAt` are clustered by right ascension of the node,
// split at the `count` largest circular gaps; planes are numbered from the
// smallest mean node. Returns {members: {norad: plane}, at, withinDays}.
export function assignPlanes(sets, { count, assignAt }, withinDays) {
  const at = Date.parse(`${assignAt}T00:00:00Z`);
  const points = [...nearest(sets, at)].filter(([, v]) => v.d <= withinDays * 86400000)
    .map(([norad, v]) => ({ norad, raan: wrap(v.set.elements.RA_OF_ASC_NODE * Math.PI / 180) }))
    .sort((a, b) => a.raan - b.raan);
  const gaps = points.map((p, i) => ({ i, gap: wrap(points[(i + 1) % points.length].raan - p.raan) }))
    .sort((a, b) => b.gap - a.gap).slice(0, count).map((g) => g.i).sort((a, b) => a - b);
  const members = {};
  gaps.forEach((end, k) => {
    const start = (gaps[(k + gaps.length - 1) % gaps.length] + 1) % points.length;
    for (let i = start; ; i = (i + 1) % points.length) { members[points[i].norad] = k; if (i === end) break; }
  });
  // Renumber planes by their mean node.
  const means = [...Array(count).keys()].map((k) => circularMean(points.filter((p) => members[p.norad] === k).map((p) => p.raan)));
  const order = means.map((m, k) => [m, k]).sort((a, b) => a[0] - b[0]).map(([, k]) => k);
  const renumber = new Map(order.map((k, i) => [k, i]));
  for (const n of Object.keys(members)) members[n] = renumber.get(members[n]);
  return { members, assignAt, withinDays };
}

// A satellite outside the clustered set joins the plane whose members' mean
// node, from their sets nearest the newcomer's first set, is closest.
export function planeOf(planes, norad, sets) {
  if (planes.members[norad] !== undefined) return planes.members[norad];
  const own = sets.filter((s) => s.norad === norad).sort((a, b) => epochMs(a.epoch) - epochMs(b.epoch))[0];
  if (!own) return null;
  const at = epochMs(own.epoch);
  const near = nearest(sets.filter((s) => planes.members[s.norad] !== undefined), at);
  const raan = own.elements.RA_OF_ASC_NODE * Math.PI / 180;
  let best = null;
  for (let k = 0; k < Object.values(planes.members).reduce((m, v) => Math.max(m, v + 1), 0); ++k) {
    const xs = [...near].filter(([n]) => planes.members[n] === k).map(([, v]) => v.set.elements.RA_OF_ASC_NODE * Math.PI / 180);
    if (!xs.length) continue;
    const d = circularDistance(circularMean(xs), raan);
    if (!best || d < best.d) best = { k, d };
  }
  return best?.k ?? null;
}

// G3: launch year from the international designator ("2018-109A").
export const launchYear = (set) => Number(String(set.objectId ?? '').slice(0, 4));
