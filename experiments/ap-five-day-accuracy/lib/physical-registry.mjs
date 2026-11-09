import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PhysicalPropertiesT } from "spacedatastandards.org/lib/js/OCM/PhysicalProperties.js";
import { assertAllowedPath, isHeldForStudy } from "./hold-gate.mjs";

const RCS_SIZE_DEFAULT_M2 = {
  SMALL: 0.03,
  MEDIUM: 0.35,
  LARGE: 3.5,
};

/**
 * Loads ESA DISCOS physical records + Space-Track SATCAT metadata indexed by integer NORAD_CAT_ID
 * (strictly enforcing study hold lists and allowed paths).
 */
export function loadPhysicalRegistry(archiveRoot = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive")) {
  assertAllowedPath(archiveRoot);
  const byNorad = new Map();

  // 1. SATCAT baseline
  const satcatPath = `${archiveRoot}/spacetrack/satcat/2026/2026-11-07.json.gz`;
  assertAllowedPath(satcatPath);
  if (fs.existsSync(satcatPath)) {
    const sc = JSON.parse(zlib.gunzipSync(fs.readFileSync(satcatPath)).toString("utf8"));
    for (const row of sc) {
      const norad = Number(row.NORAD_CAT_ID);
      if (!Number.isInteger(norad) || norad <= 0) continue;
      const name = row.OBJECT_NAME || row.SATNAME || "";
      if (isHeldForStudy(norad, name, "2026-11-08T00:00:00Z")) continue;
      const rcsVal = Number(row.RCSVALUE);
      byNorad.set(norad, {
        norad,
        name: name || null,
        intlDes: row.OBJECT_ID || row.INTLDES || null,
        objectType: row.OBJECT_TYPE || "UNKNOWN",
        country: row.COUNTRY || null,
        launchDate: row.LAUNCH || null,
        decayDate: row.DECAY || null,
        rcsSize: row.RCS_SIZE || null,
        rcsM2: rcsVal > 0 ? rcsVal : (RCS_SIZE_DEFAULT_M2[row.RCS_SIZE] ?? NaN),
        discos: null,
        areaToMassM2Kg: NaN,
      });
    }
  }

  // 2. ESA DISCOS 2026-11 dimensional & mass database (938 JSON pages)
  const discosDir = `${archiveRoot}/hac/esa-discos/2026/2026-11`;
  assertAllowedPath(discosDir);
  if (fs.existsSync(discosDir)) {
    const files = fs.readdirSync(discosDir).filter((f) => f.startsWith("objects-") && f.endsWith(".json")).sort();
    for (const f of files) {
      let parsed;
      try {
        parsed = JSON.parse(fs.readFileSync(path.join(discosDir, f), "utf8"));
      } catch {
        continue;
      }
      for (const item of parsed.data ?? []) {
        const a = item.attributes ?? {};
        const norad = Number(a.satno);
        if (!Number.isInteger(norad) || norad <= 0) continue;
        if (isHeldForStudy(norad, a.name || "", "2026-11-08T00:00:00Z")) continue;
        const entry = byNorad.get(norad) ?? {
          norad,
          name: a.name || null,
          intlDes: a.cosparId || null,
          objectType: a.objectClass || "UNKNOWN",
          country: null,
          launchDate: a.firstEpoch || null,
          decayDate: null,
          rcsSize: null,
          rcsM2: NaN,
          discos: null,
          areaToMassM2Kg: NaN,
        };
        entry.discos = {
          name: a.name || null,
          objectClass: a.objectClass || null,
          mass: a.mass > 0 ? Number(a.mass) : NaN,
          shape: a.shape || null,
          width: a.width > 0 ? Number(a.width) : NaN,
          height: a.height > 0 ? Number(a.height) : NaN,
          depth: a.depth > 0 ? Number(a.depth) : NaN,
          diameter: a.diameter > 0 ? Number(a.diameter) : NaN,
          span: a.span > 0 ? Number(a.span) : NaN,
          xSectMax: a.xSectMax > 0 ? Number(a.xSectMax) : NaN,
          xSectMin: a.xSectMin > 0 ? Number(a.xSectMin) : NaN,
          xSectAvg: a.xSectAvg > 0 ? Number(a.xSectAvg) : NaN,
          active: a.active,
        };
        if (entry.discos.mass > 0 && entry.discos.xSectAvg > 0) {
          entry.areaToMassM2Kg = entry.discos.xSectAvg / entry.discos.mass;
        }
        byNorad.set(norad, entry);
      }
    }
  }

  return byNorad;
}

/**
 * Derives Optimal Enclosing Box (OEB), cross-sectional areas, Keep-Out Sphere radius,
 * attitude/tumble characterization, and typed SDS PhysicalPropertiesT from DISCOS + SATCAT + fitted AP BTERM/AGOM.
 */
export function buildPhysicalProperties(reg, { bterm = 0, agom = 0, btermSigma = 0, agomSigma = 0 } = {}) {
  const p = new PhysicalPropertiesT();
  const d = reg?.discos ?? null;
  const objType = String(reg?.objectType ?? d?.objectClass ?? "UNKNOWN").toUpperCase();
  const isDebris = objType.includes("DEBRIS") || objType.includes("FRAGMENT");
  const isRocketBody = objType.includes("ROCKET");

  const cdNom = 2.2;
  const crNom = 1.3;
  p.DRAG_COEFF_NOM = cdNom;
  p.SOLAR_RAD_COEFF = crNom;
  p.MASS_UNITS = "kg";
  p.AREA_UNITS = "m**2";

  // Dimensions -> Optimal Enclosing Box [OEB_MAX >= OEB_INT >= OEB_MIN]
  const dims = [];
  if (d) {
    if (Number.isFinite(d.height)) dims.push(d.height);
    if (Number.isFinite(d.width)) dims.push(d.width);
    if (Number.isFinite(d.depth)) dims.push(d.depth);
    if (Number.isFinite(d.diameter)) {
      if (dims.length < 2) dims.push(d.diameter);
      if (dims.length < 3) dims.push(d.diameter);
    }
    if (Number.isFinite(d.span) && (dims.length === 0 || d.span > Math.max(...dims))) {
      dims.push(d.span);
    }
  }
  dims.sort((x, y) => y - x);

  if (dims.length >= 3) {
    p.OEB_MAX = dims[0];
    p.OEB_INT = dims[1];
    p.OEB_MIN = dims[2];
  } else if (dims.length === 2) {
    p.OEB_MAX = dims[0];
    p.OEB_INT = dims[1];
    p.OEB_MIN = dims[1];
  } else if (dims.length === 1) {
    p.OEB_MAX = dims[0];
    p.OEB_INT = dims[0];
    p.OEB_MIN = dims[0];
  } else {
    // Fallback geometric envelope from RCS size class
    const eqDiam = Number.isFinite(reg?.rcsM2) && reg.rcsM2 > 0 ? 2 * Math.sqrt(reg.rcsM2 / Math.PI) : (isRocketBody ? 4.0 : isDebris ? 0.25 : 1.5);
    p.OEB_MAX = isRocketBody ? eqDiam * 2.5 : eqDiam;
    p.OEB_INT = eqDiam;
    p.OEB_MIN = eqDiam;
  }

  // Cross-sectional areas
  const areaAvg = Number.isFinite(d?.xSectAvg)
    ? d.xSectAvg
    : 0.5 * (p.OEB_MAX * p.OEB_INT + p.OEB_INT * p.OEB_MIN);
  const areaMax = Number.isFinite(d?.xSectMax) ? d.xSectMax : p.OEB_MAX * p.OEB_INT;
  const areaMin = Number.isFinite(d?.xSectMin) ? d.xSectMin : p.OEB_INT * p.OEB_MIN;

  p.AREA_ALONG_OEB_MAX = p.OEB_INT * p.OEB_MIN;
  p.AREA_ALONG_OEB_INT = p.OEB_MAX * p.OEB_MIN;
  p.AREA_ALONG_OEB_MIN = p.OEB_MAX * p.OEB_INT;
  p.AREA_MIN_FOR_PC = areaMin;
  p.AREA_MAX_FOR_PC = areaMax;
  p.AREA_TYP_FOR_PC = areaAvg;

  // Mass & fitted effective drag/SRP areas (BTERM = Cd * A / m, AGOM = Cr * A / m)
  const aOverMDrag = Math.abs(bterm) > 1e-8 ? Math.abs(bterm) / cdNom : NaN;
  const aOverMSrp = Math.abs(agom) > 1e-8 ? Math.abs(agom) / crNom : NaN;
  if (Number.isFinite(d?.mass) && d.mass > 0) {
    p.WET_MASS = d.mass;
    p.DRY_MASS = d.mass;
    p.DRAG_CONST_AREA = Number.isFinite(aOverMDrag) ? aOverMDrag * d.mass : areaAvg;
    p.SRP_CONST_AREA = Number.isFinite(aOverMSrp) ? aOverMSrp * d.mass : areaAvg;
  } else {
    // Estimate mass from geometric area and fitted A/m when available, else nominal density
    const effAm = Number.isFinite(aOverMDrag) && aOverMDrag > 1e-4 && aOverMDrag < 5.0
      ? aOverMDrag
      : (isDebris ? 0.025 : isRocketBody ? 0.012 : 0.015);
    const estMass = Math.max(0.05, areaAvg / effAm);
    p.WET_MASS = estMass;
    p.DRY_MASS = estMass;
    p.DRAG_CONST_AREA = areaAvg;
    p.SRP_CONST_AREA = areaAvg;
  }

  if (Math.abs(bterm) > 1e-9 && btermSigma > 0) {
    p.DRAG_UNCERTAINTY = Math.min(2.0, btermSigma / Math.abs(bterm)) * cdNom;
  }
  if (Math.abs(agom) > 1e-9 && agomSigma > 0) {
    p.SRP_UNCERTAINTY = Math.min(2.0, agomSigma / Math.abs(agom)) * crNom;
  }

  if (Number.isFinite(reg?.rcsM2)) p.RCS = reg.rcsM2;
  if (d?.shape) p.BUS_MODEL = d.shape;

  // Attitude / operational class metadata
  if (isDebris) {
    p.ATT_CONTROL_MODE = "UNCONTROLLED";
    p.REFLECTANCE = 0.22;
  } else if (isRocketBody) {
    p.ATT_CONTROL_MODE = "UNCONTROLLED";
    p.REFLECTANCE = 0.35;
  } else if (d?.active === false) {
    p.ATT_CONTROL_MODE = "INACTIVE";
    p.REFLECTANCE = 0.28;
  } else {
    p.ATT_CONTROL_MODE = "OPERATIONAL";
    p.REFLECTANCE = 0.30;
  }

  if (p.WET_MASS > 0 && p.OEB_MAX > 0) {
    p.IXX = (p.WET_MASS / 12.0) * (p.OEB_INT ** 2 + p.OEB_MIN ** 2);
    p.IYY = (p.WET_MASS / 12.0) * (p.OEB_MAX ** 2 + p.OEB_MIN ** 2);
    p.IZZ = (p.WET_MASS / 12.0) * (p.OEB_MAX ** 2 + p.OEB_INT ** 2);
  }

  const hardBodyRadiusM = 0.5 * Math.hypot(p.OEB_MAX, p.OEB_INT, p.OEB_MIN);

  p.COMMENT = [
    `OBJECT_CLASS=${objType}`,
    `DISCOS_MATCH=${d ? "YES" : "NO"}`,
    `BOUNDING_RADIUS_M=${hardBodyRadiusM.toFixed(2)}`,
  ];

  return { props: p, hardBodyRadiusM, hasDiscos: !!d, objectType: objType };
}
