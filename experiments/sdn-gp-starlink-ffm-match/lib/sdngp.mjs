// SDN-GP (theory 16) of side B's module `sdn-gp-propagator` as a third fitter beside SGP4 and SGP4-XP (amendment A9). The module is used as built, through its
// published surfaces: `fit_sdngp` on the invoke surface (typed $OEM with the fit interval, the space-weather table as FFM reads it, an optional open-DCA $DCL
// and B prior), `ingest_omm` for the fitted set, and the batch entry `sdngp_propagate_minutes_soa` (the one the module's own tests use) to get states at the
// held-out epochs, because the invoke surface's `propagate` stops one day after the set's epoch. Side B rebuilds `dist/` in place, so every run first copies the
// built wasm and manifest into <store>/sdngp-snapshot/<sha256 prefix>/ and runs that copy; the hash and the source commit are recorded in the rows.
// JavaScript here moves bytes and counts; every number comes out of the module.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createStandaloneHarness } from 'space-data-module-sdk/testing/isomorphic';
import { OMM, OEM, flatbuffers } from './sds.mjs';
import { sha256 } from '../common.mjs';

export const SDNGP_SOURCE = process.env.SDNGP_MODULE_ROOT ?? '/Users/tj/software/worktrees/space-data-network-closed-modules--modules-sdn-gp-propagator-20261023/packages/sdn-gp-propagator';
const T = (name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName: name, wireFormat: 'flatbuffer' });

/** Copy the built module into the store (once per build) and describe it; with `hash` (a prefix) the snapshot already taken is used, so that all workers of a run run the same build. */
export function snapshot(store, pin = null) {
  if (pin) {
    const dir = fs.readdirSync(path.join(store, 'sdngp-snapshot')).filter((d) => d.startsWith(pin)).map((d) => path.join(store, 'sdngp-snapshot', d))[0];
    if (!dir) throw new Error(`no SDN-GP snapshot ${pin} in ${store}`);
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
    fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify({ wasmSha256: hash, sourceCommit: git('rev-parse', 'HEAD'), sourceDirtyFiles: (git('status', '--short') ?? '').split('\n').filter(Boolean).length, createdUtc: new Date().toISOString() }, null, 2) + '\n');
  }
  return { dir, wasmPath, wasmSha256: hash, ...JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8')) };
}

export async function openSdngp({ store, pin = process.env.SDNGP_SNAPSHOT ?? null }) {
  const snap = snapshot(store, pin);
  const h = await createStandaloneHarness('browser', snap.wasmPath, { surface: 'direct' });
  const x = h.instance.exports;
  const mem = () => h.memory.buffer;
  let scratch = null;
  const reserve = (n) => {
    if (scratch && scratch.n >= n) return;
    if (scratch) { x.sdngp_free(scratch.minutes); x.sdngp_free(scratch.out); x.sdngp_free(scratch.status); }
    scratch = { n, minutes: x.sdngp_alloc(8 * n), out: x.sdngp_alloc(48 * n), status: x.sdngp_alloc(4 * n) };
  };
  return {
    provenance: { module: 'sdn-gp-propagator', wasmSha256: snap.wasmSha256, sourceCommit: snap.sourceCommit, sourceDirtyFiles: snap.sourceDirtyFiles },
    /** Fit an SDN-GP set to one plain (not size-prefixed) $OEM block: { ok, omm (bytes), obd (bytes), unpacked, comment, fitRmsKm, heldOutRmsKm, iterations, params } or { ok: false, error }. */
    async fit(oem, { weatherTable, densityCorrection, prior } = {}) {
      const inputs = [{ portId: 'ephemeris', typeRef: T('OEM'), payload: oem }];
      if (weatherTable) inputs.push({ portId: 'space_weather_table', typeRef: T('PRW'), payload: weatherTable });
      if (densityCorrection) inputs.push({ portId: 'density_correction', typeRef: T('DCL'), payload: densityCorrection });
      if (prior) inputs.push({ portId: 'prior', typeRef: T('OMM'), payload: prior });
      const r = await h.invoke({ methodId: 'fit_sdngp', inputs });
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 160)}` };
      const omm = new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload);
      const obd = new Uint8Array(r.outputs.find((o) => o.portId === 'determination').payload);
      const unpacked = OMM.OMM.getRootAsOMM(new flatbuffers.ByteBuffer(omm)).unpack();
      const comment = unpacked.COMMENT ?? '';
      const m = /(\d+) states fitted, (\d+) held out; fit RMS ([\d.]+) km, max ([\d.]+) km(?:; held-out RMS ([\d.]+) km)?; (\d+) iterations/.exec(comment);
      return {
        ok: true, omm, obd, unpacked, comment,
        statesFitted: m ? Number(m[1]) : null, statesHeldOut: m ? Number(m[2]) : null, fitRmsKm: m ? Number(m[3]) : null, fitMaxKm: m ? Number(m[4]) : null, heldOutRmsKm: m && m[5] ? Number(m[5]) : null, iterations: m ? Number(m[6]) : null,
        params: Object.fromEntries((unpacked.USER_DEFINED_PARAMETERS ?? []).map((p) => [p.PARAM_NAME, p.PARAM_VALUE])),
      };
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
        const status = x.sdngp_propagate_minutes_soa(scratch.minutes, index, 1, scratch.out, scratch.status);
        const v = new Float64Array(mem(), scratch.out, 6);
        out.push({ status, r: [v[0], v[1], v[2]], v: [v[3], v[4], v[5]] });
      }
      return out;
    },
    destroy: async () => { await h.destroy?.(); },
    raw: { x, h },
  };
}
