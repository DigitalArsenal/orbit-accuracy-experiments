// AP: propagator/sdn-ap with THEORY AP (SPEC 16), at the pinned build (lib/build.mjs PIN). One $OCM in: `fit` takes the arc's $OEM, the
// fit $PCF (FORCES with ATMOSPHERE_MODEL stated, FIT), the arc's $SPW rows and an optional $PVN, and emits one $OCM that carries the rows it flies on;
// `propagate` takes that $OCM and a $PCF with OUTPUT.EPOCHS, nothing else. Whiteroom XP is the same module with the theory's own forces (stock).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { modulesRoot } from '../../xp-atmosphere-merit/common.mjs';
import { TYPE, oemLines, flightPcfBytes, pcfBytes, spwBytes, readFitOcm } from '../../xp-atmosphere-merit/lib/sds.mjs';
import { PIN } from './build.mjs';

const DAY = 86400000;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
/**
 * A module's wasm and manifest at PIN's commit, or at `build`'s (git show from the modules checkout, or from SDN_MODULES_GIT, a clone holding the pinned commits), SHA-256
 * checked, written under the OS temp directory: the file.
 */
export function pinnedFile(rel, build = { modulesCommit: PIN.modulesCommit, wasmSha256: PIN.wasmSha256[rel] }) {
  const want = build.wasmSha256, commit = build.modulesCommit;
  const dir = path.join(os.tmpdir(), 'operator-theory-build', commit, rel), file = path.join(dir, 'module.wasm');
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== want || !fs.existsSync(path.join(dir, 'plugin-manifest.json'))) {
    const show = (p) => execFileSync('git', ['-C', process.env.SDN_MODULES_GIT ?? modulesRoot(), 'show', `${commit}:${rel}/${p}`], { maxBuffer: 1 << 28 });
    const bytes = show('dist/isomorphic/module.wasm');
    if (sha256(bytes) !== want) throw new Error(`${rel} at ${commit} is ${sha256(bytes)}, pinned ${want}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, b] of [['plugin-manifest.json', show('plugin-manifest.json')], ['module.wasm', bytes]]) { const t = path.join(dir, `${name}.${process.pid}.tmp`); fs.writeFileSync(t, b); fs.renameSync(t, path.join(dir, name)); }
  }
  if (sha256(fs.readFileSync(file)) !== want) throw new Error(`${file} is not the pinned ${want}`);
  return file;
}
export async function standalone(rel, build) {
  const entry = createRequire(path.join(modulesRoot(), 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  return createStandaloneHarness('browser', pinnedFile(rel, build), { surface: 'direct' });
}

/** AP's drag atmosphere: NRLMSISE-00 on $SPW rows. */
export const MSIS = { ATMOSPHERE_MODEL: 'NRLMSISE00', WEATHER_SOURCE: 'RECORDS' };
/** One arm's FORCES: the drag atmosphere unless `atmosphere` is false, and the gravity terms by degree. */
export const apForces = ({ tesseral = 0, zonal = 0, atmosphere: drag = true, noTerms = false } = {}) => ({
  ...(drag ? MSIS : {}),
  ...(noTerms ? {} : { HAS_MAXIMUM_TESSERAL_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: tesseral, HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: zonal }),
});
/** The theory's own forces (the module's stock rule, pcf.inc): Jacchia 1970 on the theory's flux model, no correction, both caps 0. */
const stock = (f) => f.ATMOSPHERE_MODEL !== 'NRLMSISE00' && (f.WEATHER_SOURCE ?? 'THEORY_FLUX_MODEL') === 'THEORY_FLUX_MODEL'
  && (f.DENSITY_CORRECTION ?? 'NONE') === 'NONE' && !f.MAXIMUM_TESSERAL_DEGREE && !f.MAXIMUM_DEGREE;
/** A fit's $PCF: ATMOSPHERE_MODEL stated (JACCHIA70 unless the forces name NRLMSISE00), THEORY SGP4XP for stock forces and AP otherwise. */
export function fitPcf({ forces = {}, fit = null } = {}) {
  const f = { ATMOSPHERE_MODEL: 'JACCHIA70', ...forces };
  return pcfBytes({ theory: stock(f) ? 'SGP4XP' : 'AP', forces: f, fit });
}
/** Daily rows [{date, f107, c81, ap}] as the fit's $SPW: a missing day filled by the row before it and the last row held, as PRD, through
 *  `throughMs`'s day (the record's horizon, FIT.WEATHER_HORIZON_DAYS 30 past its epoch's day). The drivers 0.4 held past the last row. */
export function fitWeather(rows, throughMs) {
  const out = [];
  for (const r of rows) {
    for (let t = out.length ? Date.parse(`${out.at(-1).date}T00:00:00Z`) + DAY : Infinity; t < Date.parse(`${r.date}T00:00:00Z`); t += DAY) out.push({ ...out.at(-1), date: new Date(t).toISOString().slice(0, 10), held: true });
    out.push(r);
  }
  for (let t = Date.parse(`${out.at(-1).date}T00:00:00Z`) + DAY; t <= throughMs; t += DAY) out.push({ ...out.at(-1), date: new Date(t).toISOString().slice(0, 10), held: true });
  return spwBytes(out);
}
/** The rows of lib/weather.mjs (SDS field names) as fitWeather takes them. */
export const rowsOfSpw = (rows) => rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG }));
/** The horizon a fit needs its rows to reach: the arc's end plus FIT.WEATHER_HORIZON_DAYS and a day. */
export const horizonOf = (arcEndMs) => arcEndMs + 31 * DAY;

/** A fitted $OCM by its typed fields (XM's readFitOcm), plain or size-prefixed (propagator/sgp4-xp writes it size-prefixed). */
export const readOcm = (bytes) => { const u = new Uint8Array(bytes); return readFitOcm(String.fromCharCode(...u.subarray(8, 12)) === '$OCM' ? u.subarray(4) : u); };

const short = (e) => String(e?.message ?? e).slice(0, 240);
/** propagator/sdn-ap at PIN: { fit(oem, pcf, extra) -> { ok, ocm } | { ok: false, error }, propagate(ocm, epochs, count) -> [{epoch, r, v}] TEME }.
 *  extra: { spw } $SPW bytes (fitWeather), { dcl } a $DCL, { pvn } the ephemeris source's $PVN. */
export async function openAp() {
  const h = await standalone('propagator/sdn-ap');
  return {
    build: { modulesCommit: PIN.modulesCommit, version: PIN.versions['propagator/sdn-ap'], wasmSha256: PIN.wasmSha256['propagator/sdn-ap'] },
    async fit(oem, pcf, extra) {
      const inputs = [{ portId: 'ephemeris', typeRef: TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: pcf },
        ...(extra?.spw ? [{ portId: 'space_weather', typeRef: TYPE('SPW'), payload: extra.spw }] : []),
        ...(extra?.dcl ? [{ portId: 'density_correction', typeRef: TYPE('DCL'), payload: extra.dcl }] : []),
        ...(extra?.pvn ? [{ portId: 'provenance', typeRef: TYPE('PVN'), payload: extra.pvn }] : [])];
      let r;
      try { r = await h.invoke({ methodId: 'fit', inputs }); } catch (error) { return { ok: false, error: short(error) }; }
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
      return { ok: true, ocm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) };
    },
    async propagate(ocm, epochs, count) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: flightPcfBytes(epochs) }] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const lines = oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
      if (lines.length !== count) throw new Error(`propagate returned ${lines.length} of ${count} states`);
      return lines;
    },
    close: async () => h.destroy?.(),
  };
}
