// PLAN.md S4: the decode-time row predicate. Every row that is decoded (an element set, a truth state, a truth
// object) passes held(); a held row is dropped and counted under the predicate that dropped it.
// The list is PLAN.md section 0 plus the VENDORS.md "What is held out" list (pins.json records the blob).
const DAY = 86400000;
const ts = (s) => Date.parse(`${s}T00:00:00Z`);
export const SWARM = [39451, 39452, 39453];
export const GRACEFO = [43476, 43477];
export const COSMIC2 = [44343, 44349, 44350, 44351, 44353, 44358];
export const S1 = { A: 39634, C: 62261, D: 66315 };
export const C2_HELD_OBJECTS = { 31698: 'TerraSAR-X', 22824: 'Stella', 66315: 'Sentinel-1D', 8820: 'LAGEOS-1', 44350: 'COSMIC-2 FM4 (44350)' };
export const ILRS_C2 = [19751, 20026, 22195]; // LAGEOS-2 and Etalon-1/2: C2 R3 calibration objects (the table in its PLAN.md); held from 06-01 as the conservative reading
export const ISS = 25544;
export const TIME_HOLDS = {
  swarmGracefoFrom: ts('2026-10-31'),   // until E13b scores
  c2CalibrationFrom: ts('2026-06-01'),  // C2's time hold-out
  issFrom: ts('2025-01-01'),
};
// The C2 calibration objects for the time hold: Swarm, GRACE-FO, S1A, S1C, COSMIC-2 and every ESA GNSS satellite.
export function isC2Calibration(norad, gnss) { return SWARM.includes(norad) || GRACEFO.includes(norad) || norad === S1.A || norad === S1.C || COSMIC2.includes(norad) || ILRS_C2.includes(norad) || !!gnss; }

export const PREDICATES = ['name-starlink', 'name-galileo-gsat', 'sp3-prn-E', 'norad-c2-held', 'iss-state-2025', 'swarm-gracefo-2026-10-31', 'c2-calibration-2026-06-01', 'vendors-held-list'];
export class HoldAudit {
  constructor() { this.dropped = Object.fromEntries(PREDICATES.map((p) => [p, 0])); this.seen = 0; this.retainedHeld = 0; }
  drop(p) { this.dropped[p]++; return p; }
  json() { return { rowsSeen: this.seen, dropped: this.dropped, heldRetained: this.retainedHeld }; }
}
// A row: {norad, name?, ms?, sp3?: 'G05' (the SP3 identifier), gnss?: bool}. Returns the predicate name or null.
export function heldPredicate(row) {
  const name = row.name ?? '';
  if (/STARLINK/i.test(name)) return 'name-starlink';
  if (/GALILEO|GSAT/i.test(name)) return 'name-galileo-gsat';
  if (row.sp3 && row.sp3[0] === 'E') return 'sp3-prn-E';
  if (C2_HELD_OBJECTS[row.norad]) return 'norad-c2-held';
  const ms = row.ms;
  if (ms !== undefined && ms !== null) {
    if (row.norad === ISS && ms >= TIME_HOLDS.issFrom) return 'iss-state-2025';
    if ((SWARM.includes(row.norad) || GRACEFO.includes(row.norad)) && ms >= TIME_HOLDS.swarmGracefoFrom) return 'swarm-gracefo-2026-10-31';
    if (isC2Calibration(row.norad, row.gnss) && ms >= TIME_HOLDS.c2CalibrationFrom) return 'c2-calibration-2026-06-01';
  }
  return null;
}
// The only way a row enters: returns true when it may be used, counting the drop otherwise.
export function admit(audit, row) {
  audit.seen++;
  const p = heldPredicate(row);
  if (p) { audit.drop(p); return false; }
  return true;
}
// An independent re-check of rows already built (S4's "held rows retained must be 0").
export function auditRetained(rows, audit) {
  for (const r of rows) { if (heldPredicate({ norad: r.norad, ms: r.t, name: r.name, sp3: r.sp3, gnss: r.gnss })) audit.retainedHeld++; if (heldPredicate({ norad: r.norad, ms: r.setMs, gnss: r.gnss })) audit.retainedHeld++; }
  return audit;
}
// Input paths that must never be read.
export const HELD_PATH = /(^|\/)(nsgf\.orb\.|\.secrets|udl|restricted|operator-theory\/vendors)/i;
export function assertPathLawful(p) { if (HELD_PATH.test(p)) throw new Error(`held path: ${p}`); return p; }
