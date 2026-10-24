// SDN-AP (theory 16) of side B's module `sdn-gp-propagator` as a third fitter beside SGP4 and SGP4-XP (amendment A9). The module is used as built, through its
// published surfaces: `fit_sdngp` on the invoke surface (typed $OEM with the fit interval, the space-weather table as FFM reads it, an optional open-DCA $DCL
// and B prior), `ingest_omm` for the fitted set, and the batch entry `sdngp_propagate_minutes_soa` (the one the module's own tests use) to get states at the
// held-out epochs, because the invoke surface's `propagate` stops one day after the set's epoch. Side B rebuilds `dist/` in place, so every run first copies the
// built wasm and manifest into <store>/sdngp-snapshot/<sha256 prefix>/ and runs that copy; the hash and the source commit are recorded in the rows.
// JavaScript here moves bytes and counts; every number comes out of the module.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createStandaloneHarness } from 'space-data-module-sdk/testing/isomorphic';
import { OMM, OEM, flatbuffers, blockLines } from './sds.mjs';
import { pcfBytes, PCF_TYPE } from './pcf.mjs';
import { sha256 } from '../common.mjs';

// Side B's package: sdn-gp-propagator until the owner's rename of 2026-10-24 (SDN-AP, "advanced propagator"), sdn-ap-propagator after it; the first of the two with a built wasm is used, SDNAP_MODULE_ROOT (or the earlier
// SDNGP_MODULE_ROOT) names another place.
const PACKAGES = '/Users/tj/software/worktrees/space-data-network-closed-modules--modules-sdn-gp-propagator-20261023/packages';
export const SDNGP_SOURCE = process.env.SDNAP_MODULE_ROOT ?? process.env.SDNGP_MODULE_ROOT
  ?? ['sdn-ap-propagator', 'sdn-gp-propagator'].map((n) => path.join(PACKAGES, n)).find((d) => fs.existsSync(path.join(d, 'dist/isomorphic/module.wasm'))) ?? path.join(PACKAGES, 'sdn-gp-propagator');
const T = (name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName: name, wireFormat: 'flatbuffer' });

/** Copy the built module into the store (once per build) and describe it; with `hash` (a prefix) the snapshot already taken is used, so that all workers of a run run the same build. */
export function snapshot(store, pin = null) {
  if (pin) {
    const dir = fs.readdirSync(path.join(store, 'sdngp-snapshot')).filter((d) => d.startsWith(pin)).map((d) => path.join(store, 'sdngp-snapshot', d))[0];
    if (!dir) throw new Error(`no SDN-AP snapshot ${pin} in ${store}`);
    return { dir, wasmPath: path.join(dir, 'module.wasm'), ...JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8')) };
  }
  const wasm = fs.readFileSync(path.join(SDNGP_SOURCE, 'dist/isomorphic/module.wasm'));
  const hash = sha256(wasm);
  const dir = path.join(store, 'sdngp-snapshot', hash.slice(0, 12));
  const wasmPath = path.join(dir, 'module.wasm');
  const git = (...a) => { try { return execFileSync('git', ['-C', SDNGP_SOURCE, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
  if (!fs.existsSync(wasmPath)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${wasmPath}.part`, wasm); fs.renameSync(`${wasmPath}.part`, wasmPath);
    const manifestSource = path.join(SDNGP_SOURCE, 'dist/plugin-manifest.json'); // the method list with its ports (the wasm holds it as a flatbuffer; this is the JSON the build wrote beside it)
    if (fs.existsSync(manifestSource)) fs.copyFileSync(manifestSource, path.join(dir, 'plugin-manifest.json'));
    fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify({ wasmSha256: hash, sourceCommit: git('rev-parse', 'HEAD'), sourceDirtyFiles: (git('status', '--short') ?? '').split('\n').filter(Boolean).length, createdUtc: new Date().toISOString() }, null, 2) + '\n');
  }
  return { dir, wasmPath, wasmSha256: hash, ...JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8')) };
}

export async function openSdngp({ store, pin = process.env.SDNGP_SNAPSHOT ?? null }) {
  const snap = snapshot(store, pin);
  const h = await createStandaloneHarness('browser', snap.wasmPath, { surface: 'direct' });
  const x = h.instance.exports;
  // The owner's rename (SDN-AP): a build that carries `fit_sdnap` and `sdnap_*` exports is called by those names, an earlier one by `fit_sdngp` and `sdngp_*`; the parameters it writes
  // (SDNAP_*) are read back as SDNGP_* so that the row schema, which keeps the historical keys, is the same for every build. The other methods keep their names.
  // The methods and ports the build declares (the JSON manifest beside its snapshot, when it was taken with one): an earlier build's `maneuver` and `detect_maneuvers` have no environment port.
  const manifestFile = path.join(snap.dir, 'plugin-manifest.json');
  const declared = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')).methods ?? [] : [];
  const declares = (methodId, portId) => (portId === undefined ? declared.some((m) => m.methodId === methodId) : declared.find((m) => m.methodId === methodId)?.inputPorts?.some((q) => q.portId === portId) ?? false);
  const renamed = Buffer.from(await h.readManifest()).toString('latin1').includes('fit_sdnap');
  const merged = declares('fit', 'configuration'); // from build b9bc708baa50 (amendment A15): one `fit` with a required $PCF `configuration` port, THEORY selecting SGP4XP or SDNAP; the build has no fit_sdnap
  const fitMethod = merged ? 'fit' : renamed ? 'fit_sdnap' : 'fit_sdngp';
  const E = (name) => x[`${typeof x.sdnap_alloc === 'function' ? 'sdnap' : 'sdngp'}_${name}`];
  const historicalName = (n) => String(n).replace(/^SDNAP_/, 'SDNGP_');
  const mem = () => h.memory.buffer;
  let scratch = null;
  const reserve = (n) => {
    if (scratch && scratch.n >= n) return;
    if (scratch) { E('free')(scratch.minutes); E('free')(scratch.out); E('free')(scratch.status); }
    scratch = { n, minutes: E('alloc')(8 * n), out: E('alloc')(48 * n), status: E('alloc')(4 * n) };
  };
  return {
    provenance: { module: 'sdn-gp-propagator', wasmSha256: snap.wasmSha256, sourceCommit: snap.sourceCommit, sourceDirtyFiles: snap.sourceDirtyFiles },
    declares,
    /** Fit an SDN-AP set to one plain (not size-prefixed) $OEM block: { ok, omm (bytes), obd (bytes), unpacked, comment, fitRmsKm, heldOutRmsKm, iterations, params } or { ok: false, error }. */
    async fit(oem, { weatherTable, densityCorrection, prior } = {}) {
      const inputs = [{ portId: 'ephemeris', typeRef: T('OEM'), payload: oem }];
      if (merged) inputs.push({ portId: 'configuration', typeRef: PCF_TYPE, payload: pcfBytes({ theory: 'SDNAP' }) });
      if (weatherTable) inputs.push({ portId: 'space_weather_table', typeRef: T('PRW'), payload: weatherTable });
      if (densityCorrection) inputs.push({ portId: 'density_correction', typeRef: T('DCL'), payload: densityCorrection });
      if (prior) inputs.push({ portId: 'prior', typeRef: T('OMM'), payload: prior });
      const r = await h.invoke({ methodId: fitMethod, inputs });
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 160)}` };
      const omm = new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload);
      const obd = new Uint8Array(r.outputs.find((o) => o.portId === 'determination').payload);
      const unpacked = OMM.OMM.getRootAsOMM(new flatbuffers.ByteBuffer(omm)).unpack();
      const comment = unpacked.COMMENT ?? '';
      // the set's own bytes: the record without comment and without the fit statistics among the user-defined parameters (size-prefixed, as the XP and SGP4 element bytes)
      const minimalT = OMM.OMM.getRootAsOMM(new flatbuffers.ByteBuffer(omm)).unpack();
      minimalT.COMMENT = null;
      minimalT.USER_DEFINED_PARAMETERS = minimalT.USER_DEFINED_PARAMETERS.filter((q) => ['THEORY', 'SDNGP_B_EFF', 'SDNGP_TAU0', 'SDNGP_TAUC', 'SDNGP_TAUS'].includes(historicalName(q.PARAM_NAME)));
      const builder = new flatbuffers.Builder(512);
      OMM.OMM.finishSizePrefixedOMMBuffer(builder, minimalT.pack(builder));
      const minimal = builder.asUint8Array();
      const num = (re) => { const mm = re.exec(comment); return mm ? Number(mm[1]) : null; }; // the Earth and the Moon-centered comments word their statistics alike but not identically
      return {
        ok: true, omm, obd, unpacked, comment, minimal,
        statesFitted: num(/(\d+) states fitted/), statesHeldOut: num(/(\d+) held out/), fitRmsKm: num(/fit RMS ([\d.]+) km/), fitMaxKm: num(/max ([\d.]+) km/), heldOutRmsKm: num(/held-out RMS ([\d.]+) km/), iterations: num(/(\d+) iterations/),
        params: Object.fromEntries((unpacked.USER_DEFINED_PARAMETERS ?? []).map((p) => [historicalName(p.PARAM_NAME), p.PARAM_VALUE])),
      };
    },
    /** A fitted set (any center) propagated by the invoke surface on a grid $OEM template (amendment A9f; the Moon-centered sets are reached only this way): { ok, blocks: [[{epoch, r, v}]], center, error }. */
    async propagateGrid(omm, grid) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'omm', typeRef: T('OMM'), payload: omm }, { portId: 'grid', typeRef: T('OEM'), payload: grid }, ...(declares('propagate', 'configuration') ? [{ portId: 'configuration', typeRef: PCF_TYPE, payload: pcfBytes({ theory: 'SDNAP' }) }] : [])] });
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 160)}` };
      const bytes = new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload);
      const prefixed = String.fromCharCode(...bytes.slice(8, 12)) === '$OEM';
      const oem = (prefixed ? OEM.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(bytes)) : OEM.OEM.getRootAsOEM(new flatbuffers.ByteBuffer(bytes))).unpack();
      return { ok: true, blocks: oem.EPHEMERIS_DATA_BLOCK.map((blk) => blockLines(blk)), center: oem.EPHEMERIS_DATA_BLOCK[0]?.CENTER_NAME ?? null };
    },
    /** TEME states (km, km/s) of a fitted set at the given minutes after its epoch: the set is ingested (replacing the store) and the batch entry is called once per time. */
    async states(omm, minutes) {
      const r = await h.invoke({ methodId: 'ingest_omm', inputs: [{ portId: 'omm', typeRef: T('OMM'), payload: omm }] });
      if (r.statusCode !== 0) throw new Error(`ingest_omm: ${r.errorCode} ${r.errorMessage}`);
      reserve(1);
      const index = x.plugin_entity_count() - 1;
      const out = [];
      for (const m of minutes) {
        new Float64Array(mem(), scratch.minutes, 1)[0] = m;
        const status = E('propagate_minutes_soa')(scratch.minutes, index, 1, scratch.out, scratch.status);
        const v = new Float64Array(mem(), scratch.out, 6);
        out.push({ status, r: [v[0], v[1], v[2]], v: [v[3], v[4], v[5]] });
      }
      return out;
    },
    /** The build's DESIGN 2c.2 switch (export sdngp_fit_diagnostic, amendment A9d): fits after this call replace a B_eff above `limit` (m2/kg; Infinity: never, B_eff free) by tau0 held after the arc. Returns the previous limit in m2/kg x 1000, or null when the build has no such export. */
    setLoweringLimit(limit) {
      if (typeof E('fit_diagnostic') !== 'function') return null;
      return E('fit_diagnostic')(limit === Infinity ? 2000000 : Math.round(limit * 1000), -1);
    },
    destroy: async () => { await h.destroy?.(); },
    raw: { x, h },
  };
}
