// The public-set arms of experiments/ap-catalog-construction (PLAN.md, config.json "arms"): which public-set states an AP record is
// fitted to. States only move between the module's SGP4 and its fit here; nothing is computed on them but distances.
import { CONFIG, DAY, STEP, tleMs, grid, flySgp4 } from './engine.mjs';

/** The registered history of ap-from-public-sets: each set of the look-back flown from its epoch until the next set's epoch, on the
 *  300 s grid over [t0 - H d, t0). Null when fewer than 3 sets or under 80 % of the grid. */
function piecewiseHistory(tle, prior, H) {
  const t0 = tleMs(tle);
  const all = prior.filter((x) => tleMs(x) >= t0 - (H + CONFIG.history.lookbackExtraDays) * DAY).concat([tle]);
  if (all.length < CONFIG.history.minimumSets) return null;
  const bySet = new Map();
  for (let ms = t0 - H * DAY; ms < t0; ms += STEP) {
    let pick = null;
    for (const x of all) { if (tleMs(x) <= ms) pick = x; else break; }
    if (pick) { if (!bySet.has(pick)) bySet.set(pick, []); bySet.get(pick).push(ms); }
  }
  const states = [];
  for (const [x, msList] of bySet) { const tr = flySgp4(x, msList); if (!tr) return null; states.push(...tr); }
  states.sort((p, q) => p.ms - q.ms);
  return states.length >= CONFIG.history.minimumGridShare * ((H * DAY) / STEP) ? states : null;
}

/** The sets after the last jump: a jump is where the earlier set's SGP4 position at the later set's epoch is more than cutKm from the
 *  later set's own position there. */
export function afterLastJump(sets, cutKm) {
  let start = 0;
  for (let k = 1; k < sets.length; k += 1) {
    const ms = tleMs(sets[k]);
    const a = flySgp4(sets[k - 1], [ms]), b = flySgp4(sets[k], [ms]);
    if (!a || !b) continue;
    if (Math.hypot(a[0].r[0] - b[0].r[0], a[0].r[1] - b[0].r[1], a[0].r[2] - b[0].r[2]) > cutKm) start = k;
  }
  return sets.slice(start);
}

/** The interleaved history: every set with epoch in [t0 - (H + 3) d, t0], the current one included, each flown over
 *  [its epoch - back, its epoch + fwd] inside [t0 - H d, t0) on a grid of `step` offset by its rank, so that no instant is flown twice.
 *  With cutKm, only the sets from the last jump on. Null when fewer than 3 sets or under 80 % of an H-day grid at `step`. */
function interleavedHistory(tle, prior, { H, back, fwd, stepSeconds, cutKm }) {
  const t0 = tleMs(tle), step = stepSeconds * 1000;
  let sets = prior.filter((x) => tleMs(x) >= t0 - (H + CONFIG.history.lookbackExtraDays) * DAY).concat([tle]);
  if (cutKm) sets = afterLastJump(sets, cutKm);
  if (sets.length < CONFIG.history.minimumSets) return null;
  const states = [];
  sets.forEach((x, j) => {
    const e = tleMs(x), off = Math.round((j * step) / sets.length), msList = [];
    for (let ms = t0 - H * DAY + off; ms < t0; ms += step) if (ms >= e - back * DAY && ms <= e + fwd * DAY) msList.push(ms);
    const tr = flySgp4(x, msList);
    if (tr) states.push(...tr);
  });
  states.sort((p, q) => p.ms - q.ms);
  return states.length >= CONFIG.history.minimumGridShare * ((H * DAY) / step) ? states : null;
}

/** The states a public-set arm is fitted to, or null when the arm does not exist for this set. The forecast is the current set over
 *  [t0, t0 + F d] at 300 s; an arm with a history needs it. */
export function armStates(name, tle, prior) {
  const a = CONFIG.arms[name];
  const t0 = tleMs(tle);
  let hist = [];
  if (a.history?.kind === 'piecewise') hist = piecewiseHistory(tle, prior, a.history.H);
  else if (a.history?.kind === 'interleaved') hist = interleavedHistory(tle, prior, a.history);
  if (hist === null) return null;
  const fwd = flySgp4(tle, grid(t0, a.forecastDays));
  if (!fwd) return null;
  return hist.concat(fwd);
}
