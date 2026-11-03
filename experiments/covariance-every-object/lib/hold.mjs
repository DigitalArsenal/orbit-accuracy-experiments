// S4 decode-time row predicate (PLAN.md reading 11). Pure functions; counts are kept by the caller.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export const VENDORS_BLOB = 'e9dd6db5b4df53fd9df0132faf59c12cae07947d'; // experiments/operator-theory/VENDORS.md at experiments origin/main 0cc5436f (Part 1 pin)
export const TRUTH = JSON.parse(fs.readFileSync(path.join(here, '..', 'truth-objects.json'), 'utf8'));
const byNorad = new Map(TRUTH.objects.map((o) => [o.norad, o]));
export const C2_CUTOFF = Date.parse('2026-06-01T00:00:00Z'), SWARM_HOLD = Date.parse('2026-10-31T00:00:00Z'), ISS_HOLD = Date.parse('2025-01-01T00:00:00Z');
const NAME_DROP = /STARLINK|GALILEO|GSAT/i;
const C2_HELD_NAMES = /TERRASAR|^STELLA|SENTINEL-1D|^LAGEOS 1$/i;
export const C2_HELD_NORADS = new Set([44350, 66315, 8820, 31698, 22824]); // 44350, Sentinel-1D, LAGEOS-1, TerraSAR-X, Stella
export const PREDICATES = ['name:starlink|galileo|gsat', 'c2-held-object', 'iss>=2025-01-01', 'swarm-gracefo>=2026-10-31', 'c2-calibration>=2026-06-01'];
/** Reason a decoded record is dropped, or null. rec: { OBJECT_NAME, NORAD_CAT_ID, EPOCH } as served. */
export function rowHeld(rec) {
  const n = Number(rec.NORAD_CAT_ID), ep = Date.parse(/[zZ]$/.test(rec.EPOCH) ? rec.EPOCH : `${rec.EPOCH}Z`);
  if (NAME_DROP.test(rec.OBJECT_NAME ?? '')) return PREDICATES[0];
  if (C2_HELD_NORADS.has(n) || C2_HELD_NAMES.test(rec.OBJECT_NAME ?? '')) return PREDICATES[1];
  if (n === 25544 && ep >= ISS_HOLD) return PREDICATES[2];
  const t = byNorad.get(n);
  if (t && /^(Swarm|GRACE)/.test(t.name) && ep >= SWARM_HOLD) return PREDICATES[3];
  if (t?.c2cal && ep >= C2_CUTOFF) return PREDICATES[4];
  return null;
}
/** Input path predicate: nsgf.orb.*, secrets, UDL and restricted paths are never opened. */
export const pathHeld = (p) => /nsgf\.orb\.|\.secrets|\/udl|restricted/i.test(p);
