// The two propagators the table compares. AP: the theory alone, fitted to the truth arc with the published $PCF and flown in the module's
// own GCRF output (stack #386: the module's TEME turned to GCRF by foundation/frames is the GMST06 TEME, not the module's). FFM: a named
// setting (lib/settings.mjs), fitted to the same arc by analysis/estimation and flown. Module calls only; JavaScript moves bytes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO, MODULES_ROOT } from './env.mjs';
import { root, XP2F, iso, byDay } from './windows.mjs';
import { SETTINGS, openFfm } from './ffm.mjs';

const OT = path.join(REPO, 'experiments/operator-theory');
const APL = await import(path.join(OT, 'lib/ap.mjs'));
const { openAxes } = await import(path.join(OT, 'lib/host.mjs'));
const { PIN: USSF_PIN } = await import(path.join(OT, 'lib/build.mjs'));
const XP2 = await import(path.join(OT, 'lib/xp2.mjs'));
export const S = await import(path.join(root, XP2F.xm.dir, 'lib/sds.mjs'));
const { openModules } = await import(path.join(root, XP2F.xm.dir, 'lib/modules.mjs'));

export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const STORE_ROOT = process.env.HEADLINE_LOOP_STORE ?? '/opt/data/sdn-archive/headline-loop';
// the store folder holding the numerical arms' rows (named after the AP build of the run that first flew them, sdn-ap 0.6.5)
export const NUMERICAL_STORE = 'f0b8352a43f3';

// PCF_AP / PCF_AP_VACUUM of all-regimes.mjs (ap-truth.mjs's fit for the XM groups is the same: FORCES 31, 20, NRLMSISE-00 on the as-issued rows,
// FIT unset); "vacuum" is the theory's own Jacchia 1970. XP: FORCES and FIT unset, which the module fits and flies as THEORY SGP4XP (our
// clean-room SGP4-XP, the same module and the same fit call as AP), with no space weather
export const PCF = {
  AP: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20 }), fit: null }),
  AP_VACUUM: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20, atmosphere: false }), fit: null }),
  // AP with FORCES.ECOM2 (empty: Y0 starts at 0): sdn-ap solves the ECOM2 Y0 term on fits of 72 h or more (SPEC 16.13)
  AP_ECOM2: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20, ecom2: true }), fit: null }),
  // the same three with FORCES.SOLID_TIDES = IERS_2010 (sdn-ap 0.6.20 and later fly the solid Earth tide only where the $PCF states it)
  AP_TIDES: APL.fitPcf({ forces: { ...APL.apForces({ tesseral: 31, zonal: 20 }), SOLID_TIDES: 1 }, fit: null }),
  AP_VACUUM_TIDES: APL.fitPcf({ forces: { ...APL.apForces({ tesseral: 31, zonal: 20, atmosphere: false }), SOLID_TIDES: 1 }, fit: null }),
  AP_ECOM2_TIDES: APL.fitPcf({ forces: { ...APL.apForces({ tesseral: 31, zonal: 20, ecom2: true }), SOLID_TIDES: 1 }, fit: null }),
  // the low table's rows from ZONAL70_SINCE: zonal degree 70, whose terms of degree 21 to 70 move a low orbit's node (stack #531)
  AP_Z70_TIDES: APL.fitPcf({ forces: { ...APL.apForces({ tesseral: 31, zonal: 70 }), SOLID_TIDES: 1 }, fit: null }),
  XP: APL.fitPcf({ forces: {}, fit: null }),
};

// The published rule (2026-11-10): for navigation satellites in medium Earth orbit AP also solves the ECOM2 Y0 term on fits of 72 h or
// more. The gate is the group, the fit arc and the AP build's own version (its package.json at the commit flown, compared by its numeric
// fields, so 0.6.15-rc.1 counts as 0.6.15): from ECOM2_SINCE, GN and GN_GAL fits of ECOM2_MIN_ARC hours or more use PCF.AP_ECOM2, and from
// ECOM2_GEO_SINCE the geostationary (GE) and inclined geosynchronous (IG) fits of that length too; every other
// fit, and every fit by an older build (which refuses FORCES.ECOM2 by name), uses the same $PCF bytes as before.
export const ECOM2_SINCE = '0.6.15';
// the one-day class's resonant tail (sdn-ap 0.6.19, stack #434), which also solves Y0 on these rows (SDN-AP SPEC 16.13)
export const ECOM2_GEO_SINCE = '0.6.19';
export const ECOM2_RULES = [{ groups: ['GN', 'GN_GAL'], since: ECOM2_SINCE }, { groups: ['GE', 'IG'], since: ECOM2_GEO_SINCE }];
export const ECOM2_MIN_ARC = 72;
// The solid Earth tide (IERS 2010): from TIDES_SINCE every AP fit states it, on every row (sdn-ap 0.6.20, stack #449)
export const TIDES_SINCE = '0.6.20';
// The record's zonal degree in the low table (class 0 at or below e 0.05: the rows of ZONAL70_GROUPS): from ZONAL70_SINCE an AP
// fit there states zonal degree 70 (tesseral 31), the label AP_Z70_TIDES (sdn-ap 0.6.42, the low table's output table to the
// record's degree, stack #477; the choice of degrees, stack #504). Every other row, and an older build's, keeps degree 20.
export const ZONAL70_SINCE = '0.6.42';
export const ZONAL70_GROUPS = ['T', 'P', 'S1', 'LS', 'DO', 'GD'];
const numeric = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v)); return m ? m.slice(1).map(Number) : null; };
export const atLeast = (v, w) => {
  const a = numeric(v), b = numeric(w);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};
// The 24 h fit's carried terms (stack issue 496; owner, 2026-11-11: how an $OCM is made is free, and only data before the cutoff is
// used). From CARRY24_SINCE a 24 h AP fit first fits the window's 72 h arc, which ends at the same cutoff, and carries its terms:
// - above the drag (the 72 h record's regime ABOVE), the radiation terms: AGOM with its stated sigma (FIT.SRP_PRIOR GAUSSIAN_SIGNED) and,
//   where the 72 h fit solved it, ECOM2's Y0 (FORCES.ECOM2 Y0_M_S2, held on a 24 h arc);
// - under the drag, the drag term only, and only where the plain 24 h fit states a sigma of ln BTERM of CARRY24_DRAG_SIGMA or more (the
//   arc does not see it): BTERM with the 72 h record's stated sigma of ln B (FIT.DRAG_PRIOR LOG_NORMAL).
// The 72 h fit is of the full 72 h arc, for an object that maneuvers (MANEUVER72, below) too: not its 72 h record, which is the arc after
// its burn. Where the truth holds no 72 h arc before the cutoff, the 24 h fit is the plain one.
// Measured on 0.6.26 against the precise orbits (stack issue 496): carrying the drag term where the 24 h arc does see it lost on the
// near-700 km and strong-drag rows, and carrying the radiation terms under the drag changed nothing. On the maneuvering windows the full
// arc's drag term, carried under the rule, gained over carrying nothing on altimetry (14 better, 2 worse of 34; the median at day 5 2,049
// to 950 m) and moved one near-700 km window of 266 (worse).
export const CARRY24_SINCE = '0.6.26';
export const CARRY24_DRAG_SIGMA = 1;
export const carry24 = (version) => atLeast(version, CARRY24_SINCE);
/** The terms a fitted $OCM carries into a later fit: { b, sLnB, agom, sAgom, y0, regime } (regime: the record's COV_REALISM REGIME). */
export const carriedTerms = (ocm) => {
  const info = APL.readOcm(ocm), o = info.o, kinds = o.COV_PARAMETER_KINDS ?? [], cv = o.COVARIANCE_DATA ?? [];
  const at = 6 + kinds.indexOf(S.OCM.prwDynamicParameter.SRP_AREA_OVER_MASS), varS = at >= 6 ? cv[(at * (at + 1)) / 2 + at] : null;
  const y0 = (o.ORBIT_DETERMINATION?.OD_DYNAMIC_PARAMETERS ?? []).find((p) => p.NAME === 'ECOM2_Y0' && p.SOLVED_FOR);
  return { b: info.bterm, sLnB: info.sigmaLnB, agom: info.agom, sAgom: Number.isFinite(varS) && varS > 0 ? Math.sqrt(varS) : null, y0: y0 ? y0.VALUE : null,
    regime: (o.COV_REALISM ?? [])[0]?.REGIME ?? null };
};
/** A $PCF's bytes with the carried terms stated: `drag` FIT.DRAG_PRIOR at the term and its sigma of ln B, `radiation` FIT.SRP_PRIOR at
 *  AGOM and its sigma and FORCES.ECOM2 Y0_M_S2 where the terms name a Y0. FORCES is packed with its defaults, as the table's own. */
export const carriedPcf = (bytes, t, { drag, radiation }) => {
  const P = S.PCF, x = P.PCF.getRootAsPCF(new S.flatbuffers.ByteBuffer(bytes)).unpack();
  const prior = (mean, sigma) => Object.assign(new P.PCFGaussianPriorT(), { MEAN: mean, SIGMA: sigma, HAS_SIGMA: true });
  x.FIT = Object.assign(x.FIT ?? new P.PCFFitPolicyT(), {
    ...(drag && t.b > 0 && t.sLnB > 0 ? { DRAG_PRIOR: prior(t.b, t.sLnB), DRAG_PRIOR_FORM: P.pcfPriorForm.LOG_NORMAL } : {}),
    ...(radiation && t.sAgom > 0 ? { SRP_PRIOR: prior(t.agom, t.sAgom), SRP_PRIOR_FORM: P.pcfPriorForm.GAUSSIAN_SIGNED } : {}) });
  if (radiation && t.y0 != null) x.FORCES.ECOM2 = Object.assign(new P.PCFEcom2T(), { Y0_M_S2: t.y0 });
  const f = x.FORCES, pack = f.pack.bind(f);
  f.pack = (b) => {
    const offset = b.addFieldOffset;
    b.addFieldOffset = function (slot, value, d) { if (value !== d) offset.call(this, slot, value, d); };
    b.forceDefaults(true);
    try { return pack(b); } finally { b.forceDefaults(false); b.addFieldOffset = offset; }
  };
  const b = new S.flatbuffers.Builder(1024);
  P.PCF.finishPCFBuffer(b, x.pack(b));
  return b.asUint8Array().slice();
};
// The 72 h fit of a maneuvering object (stack issue 489; owner, 2026-11-11: "do not get worse against truth just to match FFM", and the
// OD process is free). From MANEUVER72_SINCE the table's 72 h AP fit of an object with its perigee at MANEUVER72.perigeeMinKm or above,
// whose precise orbit holds a burn known at the cutoff (the burn detector, stack issue 462: every piece that found it ended at or
// before the cutoff) ending within MANEUVER72.historyDays before the cutoff, is fitted on the arc after its last such burn (its end plus
// afterBurnMin), at most capHours and at least 24 h. Such an arc is under 71 h, so the module fits it under its short-arc rule. Every
// other 72 h fit is the full arc. On such an object a 72 h arc fitted at the data's own sigma takes the maintenance thrust into its drag
// term, as the numerical propagator's does, and lands on the numerical propagator's forecast instead of the orbit (measured on 0.6.26
// against the precise orbits, paired against 0.6.25: stack issue 489).
export const MANEUVER72_SINCE = '0.6.26';
// perigeeMinKm stays 600 for both arms (stack issue 462): on the six strong-drag window-arcs that lifting it would touch, the arc after the
// burn moved each arm against the precise orbits as often one way as the other (AP: better on one 72 h arc, three times worse at day 5 on the
// other), so there is no measured gain, and two arms fitted on different arcs of one window would add a difference that is only the arc.
export const MANEUVER72 = { historyDays: 7, capHours: 70, minHours: 24, afterBurnMin: 10, perigeeMinKm: 600 };
/** The rule's perigee clause in words ('' without a floor). */
export const perigeeClause = (km) => (km > 0 ? ` with its perigee at ${km} km or above` : '');
export const maneuver72 = (version) => atLeast(version, MANEUVER72_SINCE);
/** The burns the detector found in an object's precise orbit (<dir>/<group>/<name>.burns.json) that are known at the cutoff D0 (ms), each
 *  with endMs, the end of its arc-breaking span. A candidate whose delta-v does not hold from truth states 10 and 20 min further out
 *  (refined.consistent false: a truth state with a bad velocity, or a fragment beside a longer burn) is not a burn.
 *  Known at D0: in a list made as of its burns (asOf, the burn detector of experiments/burn-detector, stack issue 506), a burn whose
 *  reportTime is at or before D0; in an older list, one every piece of which had ended by D0.
 *  endMs: the end of the burn's extent (extentTo), carried across the rejected candidates known by D0 that begin within 60 min after it
 *  (the tail of a longer burn), so an arc after the burn starts after all of it. */
// The long-period rows (stack #479): the highly elliptical rows' arc after a firing is at least LONG_PERIOD.minHours (both arms, cap
// MANEUVER72.capHours); a firing less than that before the cutoff stays inside the arc (burnInArc), never dropped. Every other row keeps
// MANEUVER72.minHours. On the rows of SEAMS_BREAK_ARC, whose truth is weekly solutions joined inside the windows (Chandra), a join known
// before the cutoff (the lists' seams) moves the arc as a firing does; elsewhere a join is flagged only. A list is read from the folder of
// listsGroup(group) (the 72 h TESS row reads TESS's list).
export const LONG_PERIOD = { groups: ['HE72', 'HE', 'HX'], minHours: 9 };
export const minHoursOf = (group) => (LONG_PERIOD.groups.includes(group) ? LONG_PERIOD.minHours : MANEUVER72.minHours);
export const SEAMS_BREAK_ARC = ['HX'];
/** Of two stored rows for one window and fit arc, whether the later (r) takes the earlier's place: a row that flew over one that recorded an
 *  error, and on a one-file row (windows.mjs oneFile) a row that names its reference file (truthFile) over one that names none. */
export const laterWins = (old, r, oneFile) => !old || (!!old.error && !r.error) || (!!oneFile && !r.error && !!r.truthFile && !old.truthFile);
/** The rule of the windows placed after a firing (the 72 h TESS row, stack #479): one cutoff per firing of the object's list (a burn the
 *  list does not reject), at the first midnight (UTC) at least LONG_PERIOD.minHours after the firing's report time; ISO dates, one per
 *  firing, sorted. The row's windows at those cutoffs are placed by the rule; a cutoff the row already has is not added again. */
export const firingCutoffs = (dir, group, name) => {
  const f = listFile(dir, group, name);
  if (!fs.existsSync(f)) return [];
  const DAY = 864e5, burns = (JSON.parse(fs.readFileSync(f, 'utf8')).burns ?? []).filter((b) => b.refined?.consistent !== false && b.reportTime);
  return burns.map((b) => new Date(Math.ceil((Date.parse(b.reportTime) + LONG_PERIOD.minHours * 3600e3) / DAY) * DAY).toISOString().slice(0, 10)).sort();
};
export const listsGroup = (group) => (group === 'HE72' ? 'HE' : group);
const listFile = (dir, group, name) => path.join(dir, listsGroup(group), `${String(name).replace(/[^A-Za-z0-9]+/g, '_')}.burns.json`);
/** An object's burn list's sha256, first 12 hex (refly.mjs --after-burns writes it as burnList, table.mjs on AP's 72 h rows), or null. */
export const listSha = (dir, group, name) => { const f = listFile(dir, group, name); return fs.existsSync(f) ? sha256(fs.readFileSync(f)).slice(0, 12) : null; };
export const knownBurns = (dir, group, name, D0, field = 'burns') => {
  const f = listFile(dir, group, name);
  if (!fs.existsSync(f)) return [];
  const d = JSON.parse(fs.readFileSync(f, 'utf8')), H = 3600000;
  const knownAt = (b) => (d.asOf ? Date.parse(b.reportTime) : Math.max(...(b.pieces ?? [b.to]).map((p) => Date.parse(p))) + (b.pieces ? d.lengthH * H : 0));
  // a join of the truth's solutions (seams) is a join whatever its delta-v test says: only burns pass the consistency filter
  const seen = (d[field] ?? []).filter((b) => knownAt(b) <= D0), rejected = field === 'seams' ? [] : seen.filter((b) => b.refined?.consistent === false);
  return seen.filter((b) => field === 'seams' || b.refined?.consistent !== false).map((b) => {
    let endMs = Date.parse(b.extentTo ?? b.to);
    for (let more = true; more;) {
      more = false;
      for (const x of rejected) { const s = Date.parse(x.extentFrom ?? x.from), e = Date.parse(x.extentTo ?? x.to); if (s <= endMs + 60 * 60000 && e > endMs) { endMs = e; more = true; } }
    }
    return { ...b, endMs };
  });
};
/** The joins of the truth's solutions in an object's list (seams, never burns) known at D0, as knownBurns gives burns. */
export const knownSeams = (dir, group, name, D0) => knownBurns(dir, group, name, D0, 'seams');
/** What moves a fit arc on a row: its known burns, and on SEAMS_BREAK_ARC rows its known joins too. */
export const arcBreaks = (dir, group, name, D0) => [...knownBurns(dir, group, name, D0), ...(SEAMS_BREAK_ARC.includes(group) ? knownSeams(dir, group, name, D0) : [])];
/** A known burn's end (ms): endMs (knownBurns), else its extent's end. */
export const burnEndMs = (b) => b.endMs ?? Date.parse(b.extentTo ?? b.to);
/** A 72 h fit's arc start (ms): the full arc, or for a maneuvering object (above) the arc after its last known burn; with the rule's reason.
 *  floorKm: the perigee floor (MANEUVER72.perigeeMinKm unless given; the numerical arm passes NUMERICAL_AFTER_BURN.perigeeMinKm, the same). */
export const maneuverArc = (burns, D0, perigeeKm, floorKm = MANEUVER72.perigeeMinKm, minHours = MANEUVER72.minHours) => {
  const H = 3600000, full = { startMs: D0 - 72 * H, maneuvering: false };
  if (!(perigeeKm >= floorKm)) return full;
  const ends = burns.map(burnEndMs).filter((t) => t <= D0 && t >= D0 - MANEUVER72.historyDays * 24 * H);
  if (!ends.length) return full;
  const last = Math.max(...ends), startMs = Math.min(D0 - minHours * H, Math.max(D0 - MANEUVER72.capHours * H, last + MANEUVER72.afterBurnMin * 60000));
  // burnInArc: the last burn ends after the arc's start (it ended less than the minimum arc before the cutoff), so the arc holds it; the
  // numerical arm's rows (refly.mjs --after-burns) say the same of their arc
  return { startMs, maneuvering: true, lastBurnMs: last, burnInArc: last > startMs };
};
// The numerical arm's fit of a maneuvering object (stack issues 462 and 489): the numerical propagator has no thrust term either, so a fit
// through a burn takes the thrust into its drag and radiation terms and its forecast leaves the orbit. With the burn lists (refly.mjs
// --after-burns) it is fitted on the same arc as AP, by the same rule and the same lists: a 72 h fit by maneuverArc; a 24 h fit, where the
// last burn known at the cutoff ends inside its 24 h, on the arc after it (its end plus MANEUVER72.afterBurnMin) when that arc is at least
// NUMERICAL_AFTER_BURN.minHours24 long, else on the full 24 h. Every other fit is the stored full-arc fit. The refits are stored apart
// (NUMERICAL_AFTER_BURN.store), one row per window and fit arc of the rows flown, so the two can be compared. Its perigee floor is AP's
// (NUMERICAL_AFTER_BURN.perigeeMinKm): same rule, same arc, both arms.
export const NUMERICAL_AFTER_BURN = { minHours24: 6, perigeeMinKm: MANEUVER72.perigeeMinKm, store: `${NUMERICAL_STORE}-after-burn` };
// The drag setting fitted and flown again at tolerance 1e-13 (stack issue 520; refly.mjs --tight), one row per window and fit arc whatever
// the outcome, stored apart from the 1e-10 rows (which stay as they are): lib/settings.mjs L70S13. A row of the table takes them only when
// every window of it with a numerical arm by the rule has one, and then every such window takes its own.
export const NUMERICAL_TIGHT = { from: 'L70S', to: 'L70S13', store: `${NUMERICAL_STORE}-L70S13` };
/** The sha256 over every *.burns.json under a burn-list directory, in path order: each file's relative path, a zero byte, its length, a
 *  zero byte and its contents, so a list moved to another satellite's name changes it (table.mjs and bar.mjs state its first 12 hex). */
export function listsDigest(dir) {
  const files = [];
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else if (e.name.endsWith('.burns.json')) files.push(r); } };
  walk(dir, '');
  const hash = crypto.createHash('sha256');
  for (const f of files.sort()) { const b = fs.readFileSync(path.join(dir, f)); hash.update(`${f}\0${b.length}\0`); hash.update(b); }
  return hash.digest('hex');
}
/** The numerical arm's fit arc for a fit of arcH hours: { startMs, maneuvering, lastBurnMs?, shortAfterBurn? }. */
export const numericalArc = (burns, D0, perigeeKm, arcH, minHours = MANEUVER72.minHours) => {
  const H = 3600000, full = { startMs: D0 - arcH * H, maneuvering: false };
  if (arcH === 72) return maneuverArc(burns, D0, perigeeKm, NUMERICAL_AFTER_BURN.perigeeMinKm, minHours);
  if (arcH !== 24 || !(perigeeKm >= NUMERICAL_AFTER_BURN.perigeeMinKm)) return full;
  const ends = burns.map(burnEndMs).filter((t) => t <= D0 && t > D0 - arcH * H);
  if (!ends.length) return full;
  const last = Math.max(...ends), startMs = last + MANEUVER72.afterBurnMin * 60000;
  return D0 - startMs >= NUMERICAL_AFTER_BURN.minHours24 * H ? { startMs, maneuvering: true, lastBurnMs: last } : { ...full, shortAfterBurn: true, lastBurnMs: last };
};
/** The burn list's verdict that an object's orbit is not ballistic between impulses ({ positionsOnlyMedianM, pieceHours } or null): the
 *  numerical setting flown over its pieces from the truth's positions alone closes above the 100 m bar, as under continuous low thrust, so
 *  no arc of it is burn-free and its numerical fit is not a properly configured one. In a list with positionsOnly (the burn detector's
 *  ballistic.mjs, stack issue 506) the verdict is as of D0: from the pairs that ended by then, with at least minPairs of them. */
export const notBallistic = (dir, group, name, D0 = Infinity) => {
  const f = listFile(dir, group, name);
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8')), po = d.positionsOnly;
  if (!po) return d.notBallistic ?? null;
  const v = po.pairs.filter((p) => !p.error && Date.parse(p.end) <= D0).map((p) => p.positionsOnlyM).sort((a, b) => a - b);
  if (v.length < po.minPairs) return null;
  const m = v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return m > po.barM ? { positionsOnlyMedianM: m, pairs: v.length, pieceHours: po.pieceHours } : null;
};
/** The perigee height (km above the equatorial radius) of an osculating state { r km, v km/s } about the Earth. */
export const perigeeKmOf = ({ r, v }) => {
  const MU = 398600.4418, rr = Math.hypot(...r), vv = Math.hypot(...v), aKm = 1 / (2 / rr - (vv * vv) / MU);
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
  return aKm * (1 - Math.sqrt(Math.max(0, 1 - (h[0] ** 2 + h[1] ** 2 + h[2] ** 2) / (MU * aKm)))) - 6378.137;
};
/** Every burn in an object's burn list, known at a cutoff or not (what the truth holds): [{ t (ms), sizeMmS, alongTrackMmS (+ raises the
 *  orbit) }], or null without a list. A candidate the list rejects (refined.consistent false) is left out. */
export const listedBurns = (dir, group, name, field = 'burns') => {
  const f = listFile(dir, group, name);
  if (!fs.existsSync(f)) return null;
  return (JSON.parse(fs.readFileSync(f, 'utf8'))[field] ?? []).filter((b) => field === 'seams' || b.refined?.consistent !== false).map((b) => {
    const dv = b.refined?.dvRtnMmS ?? b.dvRtnMmS.map((x) => -x);
    return { t: Date.parse(b.burn ?? b.at), sizeMmS: Math.hypot(...dv), alongTrackMmS: dv[1] };
  });
};
/** AP's $PCF for a fit: { label: 'AP' | 'AP_VACUUM' | 'AP_ECOM2', with _TIDES from TIDES_SINCE, or AP_Z70_TIDES on a low-table row from ZONAL70_SINCE, pcf }. */
export const apPcfFor = (group, version, vacuum, arcH) => {
  const base = vacuum ? 'AP_VACUUM' : arcH >= ECOM2_MIN_ARC && ECOM2_RULES.some((r) => r.groups.includes(group) && atLeast(version, r.since)) ? 'AP_ECOM2' : 'AP';
  const label = base === 'AP' && ZONAL70_GROUPS.includes(group) && atLeast(version, ZONAL70_SINCE) ? 'AP_Z70_TIDES'
    : atLeast(version, TIDES_SINCE) ? `${base}_TIDES` : base;
  return { label, pcf: PCF[label] };
};
/** AP's forces and fitted terms for a $PCF label, in one plain sentence (the table's apForces). */
export const AP_FORCES_TEXT = {
  AP: 'Gravity to degree 20 in the zonal terms and 31 in the tesseral terms; atmospheric drag by NRLMSISE-00 driven by the space weather known at the cutoff; fitted for the mean elements, the drag coefficient and the radiation coefficient, with the module\'s stated priors.',
  AP_VACUUM: 'Gravity to degree 20 in the zonal terms and 31 in the tesseral terms; atmospheric drag by the theory\'s own Jacchia 1970 atmosphere, with no space weather; fitted for the mean elements, the drag coefficient and the radiation coefficient, with the module\'s stated priors.',
  AP_ECOM2: 'Gravity to degree 20 in the zonal terms and 31 in the tesseral terms; atmospheric drag by NRLMSISE-00 driven by the space weather known at the cutoff; fitted for the mean elements, the drag coefficient and the radiation coefficient, with the module\'s stated priors, and the ECOM2 Y0 radiation term solved as well.',
};
for (const label of ['AP', 'AP_VACUUM', 'AP_ECOM2']) AP_FORCES_TEXT[`${label}_TIDES`] = AP_FORCES_TEXT[label].replace('31 in the tesseral terms;', '31 in the tesseral terms; the solid Earth tide (IERS 2010);');
AP_FORCES_TEXT.AP_Z70_TIDES = AP_FORCES_TEXT.AP_TIDES.replace('Gravity to degree 20 in the zonal terms', 'Gravity to degree 70 in the zonal terms');


/** The builds of the two outside theories (table.mjs names them): the Space Force's XP through propagator/sgp4-xp (its library is the
 *  unmodified Sgp4Prop 9.1.1.0 XP build, called as a black box), SGP4 fitted by analysis/gp-error-model and flown by propagator/sgp4. */
// Each theory's rows are kept in a store keyed by its own builds (<store>/outside/<key>/rows.jsonl): they do not depend on AP's build, so
// they are flown once and read by every later table run.
const XMB = (await import(path.join(root, XP2F.xm.dir, 'common.mjs'))).build;
const ussfBuild = { module: 'propagator/sgp4-xp', version: USSF_PIN.versions['propagator/sgp4-xp'], modulesCommit: USSF_PIN.modulesCommit, wasmSha256: USSF_PIN.wasmSha256['propagator/sgp4-xp'] };
const sgp4Builds = [
  { module: 'analysis/gp-error-model', modulesCommit: XP2.build.modulesCommit, wasmSha256: XP2.build.wasmSha256['analysis/gp-error-model'] },
  { module: 'propagator/sgp4', modulesCommit: XMB.modulesCommit, wasmSha256: XMB.wasmSha256['propagator/sgp4'] },
  { module: 'foundation/frames', modulesCommit: XMB.modulesCommit, wasmSha256: XMB.wasmSha256['foundation/frames'] },
];
export const OUTSIDE = {
  USSFXP: { key: `sgp4-xp-${ussfBuild.wasmSha256.slice(0, 12)}`, builds: [ussfBuild] },
  SGP4: { key: `sgp4-${sgp4Builds[0].wasmSha256.slice(0, 12)}-${sgp4Builds[1].wasmSha256.slice(0, 12)}`, builds: sgp4Builds },
};

/** The arms: { axes, ffmProvenance, ap() (when apWasm is given), ussf() and sgp4() (when asked), ffm(), close() }. */
export async function openArms({ apWasm = null, ussf = false, sgp4 = false } = {}) {
  const m = await openModules();
  const F = await openFfm();
  const axes = await openAxes();
  const U = ussf ? await APL.standalone('propagator/sgp4-xp') : null;
  const G = sgp4 ? await XP2.openSgp4Fit() : null;
  let ap = null, invoke = null;
  if (apWasm) {
    const entry = createRequire(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
    const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
    ap = await createStandaloneHarness('browser', apWasm, { surface: 'direct' });
    invoke = async (methodId, inputs) => {
      const r = await ap.invoke({ methodId, inputs });
      if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      return r;
    };
  }
  const gcrfFlightPcf = (epochs) => {
    const t = new S.PCF.PCFT();
    t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs });
    const b = new S.flatbuffers.Builder(1 << 12);
    S.PCF.PCF.finishPCFBuffer(b, t.pack(b));
    return b.asUint8Array().slice();
  };
  const flyAp = async (ocm, epochs) => {
    const r = await invoke('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: gcrfFlightPcf(epochs) }]);
    const lines = S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
    if (lines.length !== epochs.length) throw new Error(`propagate returned ${lines.length} of ${epochs.length}`);
    return lines.map((l) => ({ r: l.r, v: l.v }));
  };
  const fitAp = async (oem, pcf, spw) => {
    const r = await invoke('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: spw }] : [])]);
    return new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload);
  };
  return {
    axes,
    ffmProvenance: F.provenance,
    /** AP: fitted to the truth arc (GCRF states), the record flown on the scored epochs in GCRF: { ok, rms (km), fit, days, s }. */
    async ap({ object, thin, D0, pcf, spw, sc, record = false }) {
      const t0 = performance.now();
      const ocm = await fitAp(S.oemBytes({ frame: 'GCRF', object, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }), pcf, spw);
      if (record) return { ocm };  // the fitted record alone (a carried fit's source, stack issue 496): not flown
      const info = APL.readOcm(ocm);
      const states = await flyAp(ocm, sc.epochs);
      // held: the hold rule's outcome as the record states it in OD COMMENT (SPEC 12.1: "prior-limited: BTERM held at its prior ...")
      const odComment = [].concat(info.o.ORBIT_DETERMINATION?.COMMENT ?? []).join(' ');
      const fit = { b: info.bterm, s: info.agom, sigmaLnB: info.sigmaLnB, iterations: info.iterations, converged: info.o.ORBIT_DETERMINATION?.FIT_STATISTICS?.CONVERGED ?? null,
        held: { drag: /BTERM held at its prior/.test(odComment), srp: /AGOM held at its prior/.test(odComment) } };
      return { ok: true, rms: info.fitRmsKm, fit, days: byDay(await m.rtn(states, sc.truth), sc.entered, sc.sizes), s: (performance.now() - t0) / 1000 };
    },
    /** The Space Force's XP: propagator/sgp4-xp's own fit of the truth arc (GCRF states; its fitter searches two-line-element digits, every
     *  evaluation running the library), flown by its propagate in its own GCRF output on the scored epochs: { ok, days, s }. */
    async ussf({ object, thin, D0, sc }) {
      const t0 = performance.now();
      const oem = S.oemBytes({ frame: 'GCRF', object, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
      const f = await U.invoke({ methodId: 'fit', inputs: [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }] });
      if (f.statusCode !== 0) throw new Error(`sgp4-xp fit: ${f.errorCode}: ${String(f.errorMessage).slice(0, 200)}`);
      const ocm = new Uint8Array(f.outputs.find((o) => o.portId === 'elements').payload);
      const grid = S.oemBytes({ frame: 'GCRF', lines: sc.epochs.map((e) => ({ epoch: e, r: [0, 0, 0], v: [0, 0, 0] })) });
      const r = await U.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'grid', typeRef: S.TYPE('OEM'), payload: grid }] });
      if (r.statusCode !== 0) throw new Error(`sgp4-xp propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const states = S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => ({ r: l.r, v: l.v }));
      if (states.length !== sc.epochs.length) throw new Error(`sgp4-xp propagate returned ${states.length} of ${sc.epochs.length}`);
      return { ok: true, days: byDay(await m.rtn(states, sc.truth), sc.entered, sc.sizes), s: (performance.now() - t0) / 1000 };
    },
    /** SGP4: analysis/gp-error-model's fit of the truth arc (its own SGP4 in improved mode, the epoch at the arc's first state, B* fitted),
     *  flown by propagator/sgp4 (AFSPC mode) on the scored epochs, its TEME output turned to GCRF by foundation/frames (the path the fit
     *  uses): { ok, days, s }. */
    async sgp4({ object, thin, D0, sc }) {
      const t0 = performance.now();
      const oem = S.oemBytes({ frame: 'GCRF', object, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
      const { el } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name: object.name, objectId: object.id });
      // propagate_ephemeris steps from the first scored epoch: at the scored grid's own step (300 s, or the truth's step times the smallest
      // whole number reaching 300 s), so every scored epoch is one of its steps
      const t = sc.epochs.map((e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`));
      const step = Math.min(...t.slice(1).map((x, i) => x - t[i]).filter((d) => d > 0)) / 1000;
      const fl = await m.propagateSgp4(el, object.norad, t, step);
      if (fl.some((s) => !s)) throw new Error('propagator/sgp4 returned a gap');
      const states = await m.toAxes(fl, sc.epochs, 'GCRF');
      return { ok: true, days: byDay(await m.rtn(states, sc.truth), sc.entered, sc.sizes), s: (performance.now() - t0) / 1000 };
    },
    /** One FFM setting: fitted to the arc, flown on the scored epochs: { arm, product, termination, fitOk, weightedRms, iterations, days, s }. */
    async ffm({ arm, thin, D0, rows, sc }) {
      const t0 = performance.now(), settings = SETTINGS[arm];
      const f = await F.fit(thin, settings, D0, rows);
      const product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
      const scored = await F.forecast(product, sc.epochs, settings, rows);
      const days = byDay(await m.rtn(scored, sc.truth), sc.entered, sc.sizes);
      return { arm, product, termination: f.termination, fitOk: f.ok, weightedRms: f.weightedRms, iterations: f.iterations, days, s: (performance.now() - t0) / 1000 };
    },
    async close() { await axes.close(); await F.close(); await m.close(); await ap?.destroy?.(); await U?.destroy?.(); },
  };
}
