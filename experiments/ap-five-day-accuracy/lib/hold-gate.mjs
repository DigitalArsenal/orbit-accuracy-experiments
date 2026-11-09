import * as flatbuffers from "flatbuffers";
import { PVN, PVNT, pvnSourceKind, pvnLicenseClass } from "../../../../../../repos/main-packages/spacedatastandards.org/lib/js/PVN/main.js";

export const HELD_GALILEO_NORADS = new Set([43567, 37847, 41862, 41174, 43055, 41175]);
export const HELD_EUTELSAT_NORADS = new Set([41589]); // EUTE 117W B / Eutelsat 117 West B (owner 2026-11-03 drop)
export const SWARM_GRACEFO_NORADS = new Set([39451, 39452, 39453, 43476, 43477]);
export const SWARM_GRACEFO_CUTOFF_ISO = "2026-10-31T23:59:59.999999Z";

const FORBIDDEN_PATH_SUBSTRINGS = [
  "operator-capture",
  ".secrets",
  "reference-states/seal",
  "comspoc",
  "udl",
  ".sdn-keys",
];

/**
 * Throws immediately if a path touches any held, secret, or restricted directory.
 */
export function assertAllowedPath(filePath) {
  const lower = String(filePath).toLowerCase();
  for (const banned of FORBIDDEN_PATH_SUBSTRINGS) {
    if (lower.includes(banned)) {
      throw new Error(`HOLD_GATE_VIOLATION: forbidden path accessed: ${filePath}`);
    }
  }
  return filePath;
}

/**
 * Checks whether an object is excluded from external/truth/optical study evaluation.
 * Enforces:
 *  - No Starlink groups
 *  - No Eutelsat (owner 2026-11-03 drop)
 *  - No 6 held Galileo IDs (43567, 37847, 41862, 41174, 43055, 41175)
 *  - No Swarm (39451-39453) or GRACE-FO (43476-43477) after 2026-10-31
 */
export function isHeldForStudy(norad, name = "", epochIso = "2026-11-08T00:00:00Z") {
  const id = Number(norad);
  if (HELD_GALILEO_NORADS.has(id) || HELD_EUTELSAT_NORADS.has(id)) return true;
  if (SWARM_GRACEFO_NORADS.has(id) && epochIso > SWARM_GRACEFO_CUTOFF_ISO) return true;
  const upper = String(name || "").toUpperCase();
  if (upper.includes("STARLINK")) return true;
  if (/EUTELSAT|\bEUTE\b|\bEUTEL\b/.test(upper)) return true;
  return false;
}

export const CREDITS = Object.freeze({
  SATNOGS_OPTICAL: "SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0",
  IAU_SCORE: "IAU CPS SatHub SCORE - https://score.cps.iau.org",
  FINK_ZTF: "Fink Broker / Zwicky Transient Facility (ZTF, Palomar I41) - https://fink-portal.org",
  SEESAT_L: "SeeSat-L visual/optical observer archive (cited, lettered)",
  EUMETSAT_METOPSG: "EUMETSAT Metop-SG AUX_POFD Operational Flight Dynamics",
  ESA_GNSS: "ESA Navigation Support Office Final GNSS Orbit Product (cited)",
  WAAS_SBAS: "U.S. FAA Wide Area Augmentation System (WAAS) GEO Broadcast via NASA CDDIS",
  IDS_DORIS: "International DORIS Service (IDS) Combined Orbit Product",
  COPERNICUS_POD: "Copernicus Sentinel-1 Precise Orbit Ephemeris (POEORB)",
  ILRS: "International Laser Ranging Service (ILRS)",
  GP_EPOCH: "18th SDS GP Historical Own-Epoch Element Sets (cited, lettered A)",
});

export function buildPvnBytes({
  sourceId,
  sourceKind = pvnSourceKind.ElementSet,
  originator = "SDN-AP",
  licenseClass = pvnLicenseClass.Cited,
  licenseId = "",
  lineage = "",
  sourceUrl = "",
  retrievedAt = "",
  sourceSha256 = "",
}) {
  const pvn = Object.assign(new PVNT(), {
    SOURCE_ID: sourceId,
    SOURCE_KIND: sourceKind,
    ORIGINATOR: originator,
    PROVIDER_ID: "com.spacedatanetwork.sdn-ap-propagator",
    PRODUCER: "com.spacedatanetwork.sdn-ap-propagator 0.6.5",
    LICENSE_CLASS: licenseClass,
    ...(licenseId ? { LICENSE_ID: licenseId } : {}),
    ...(lineage ? { LINEAGE: lineage } : {}),
    ...(sourceUrl ? { SOURCE_URL: sourceUrl } : {}),
    ...(retrievedAt ? { RETRIEVED_AT: retrievedAt } : {}),
    ...(sourceSha256 ? { SOURCE_SHA256: sourceSha256 } : {}),
  });
  const b = new flatbuffers.Builder(512);
  PVN.finishPVNBuffer(b, pvn.pack(b));
  return b.asUint8Array().slice();
}
