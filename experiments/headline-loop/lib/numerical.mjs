// A window's numerical row and, where it has no numerical figure by the rule, the reason: one function, read by table.mjs and bar.mjs, so
// the bar counts a window by reason exactly as the scoreboard does.
import * as A from './arms.mjs';
import * as W from './windows.mjs';

export const REFIT = 'maneuvering: the arc after its last burn';
// the row whose numerical fits are not properly configured for its truth: an arm only where the arc after the last burn frees its fit
export const NOT_CONFIGURED = new Set(['WA']);
const H = 3600e3;

/** The window's numerical row: the stored one, or under --burns in a regime with refits after a burn (afterBurnGroups), the refit where the
 *  rule moved the arc (with its last burn, its arc in hours and its start), or the stored fit with the decision row's fit process. On the
 *  commercial geostationary row (NOT_CONFIGURED) a window whose arc still holds a known burn has no numerical arm (burnInArc). A window of
 *  such a regime without a decision row has none (null), unless its stored row records an error. */
export function numericalOf({ w, arc, base, afterBurn, afterBurnGroups }) {
  const k = `${w.key}|${arc}`, b = base.get(k);
  if (!b || !afterBurnGroups.has(w.group)) return b;
  const r = afterBurn.get(k);
  if (!r || r.error) return b?.error ? b : null;
  if (NOT_CONFIGURED.has(w.group) && r.burnInArc) return { ...b, arms: {}, fitProcess: r.fitProcess, burnInArc: true };
  if (r.fitProcess === REFIT) return { ...b, env: r.env, arms: { FFMq: r.arms?.FFMq ?? { ok: false } }, fitProcess: r.fitProcess, fitArcHours: r.fitArcHours, lastBurn: r.lastBurn, ...(r.fitArcStart ? { fitArcStart: r.fitArcStart } : {}) };
  return { ...b, fitProcess: r.fitProcess };
}

/** A 72 h window's arc starts (ms), AP's and the numerical arm's, each to the millisecond where it can be told: AP's from the rule on the
 *  lists given (lib/arms.mjs maneuverArc, the row's recorded start where it has one), the full 72 h where its row is on the full arc; the
 *  numerical arm's from its refit's last burn by the rule (numericalArc, with the row's own minimum arc), the full 72 h otherwise. Without
 *  lists AP's start is the cutoff less its fitArcHours. */
export function arcStarts({ w, ap, nr, lists }) {
  const D0 = w.cutoffMs, full = D0 - 72 * H;
  const apStart = ap.fitArcStart ? Date.parse(ap.fitArcStart) : ap.fitArcHours == null ? full
    : lists ? A.maneuverArc(A.arcBreaks(lists, w.group, w.name, D0), D0, ap.perigeeKm ?? Infinity, undefined, A.minHoursOf(w.group)).startMs : D0 - ap.fitArcHours * H;
  const numStart = nr.fitProcess !== REFIT ? full : nr.fitArcStart ? Date.parse(nr.fitArcStart)
    : nr.lastBurn ? A.numericalArc([{ from: nr.lastBurn, to: nr.lastBurn }], D0, Infinity, 72, A.minHoursOf(w.group)).startMs : D0 - nr.fitArcHours * H;
  return { ap: apStart, numerical: numStart };
}

/** Why a window AP scored has no numerical figure, or null where the rule gives it one: noTruthOrCoverage (no numerical row, or one that
 *  records an error), ruleLeavesNoArm (the rule gives no arm: burnInArc), armsOnDifferentArcs (on a 72 h row, a window with an arm whose
 *  arc starts elsewhere than AP's, to the millisecond). A window that has an arm and still no figure is fitFailed (the caller's: it needs
 *  the row's arm). */
export function noArmWhy({ w, arc, ap, nr, lists }) {
  if (!nr || nr.error) return 'noTruthOrCoverage';
  if (nr.burnInArc) return 'ruleLeavesNoArm';
  if (arc === 72 && ap && !ap.error && !ap.apError) {
    const s = arcStarts({ w, ap, nr, lists });
    if (s.ap !== s.numerical) return 'armsOnDifferentArcs';
  }
  return null;
}
