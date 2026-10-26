// The modules XM runs, opened once at build.json's commit: propagator/sdn-ap (fit, propagate, the atmosphere probe; one
// direct harness), analysis/gp-error-model (G1's scorer: pair_statistics in the truth's RTN axes), foundation/frames (TEME
// to the truth's axes, as B1 and B2) and analysis/density-calibration (the open-DCA $DCL). JavaScript moves bytes; every
// number comes out of a module. Every call's frames are recorded (P7: the X0 calls carry none).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { g1Dir, modulesRoot, sha256 } from '../common.mjs';
import { TYPE, oemLines } from './sds.mjs';

const modules = modulesRoot();
const g1 = (name) => import(path.join(g1Dir, name));
const [{ openModule }, F, B] = await Promise.all(['lib/modules.mjs', 'lib/frames.mjs', 'lib/baselines.mjs'].map(g1));
const apRequire = createRequire(path.join(modules, 'propagator/sdn-ap/package.json'));
const { createStandaloneHarness } = await import(pathToFileURL(apRequire.resolve('space-data-module-sdk/testing/isomorphic')).href);
const dcRequire = createRequire(path.join(modules, 'analysis/density-calibration/package.json'));
const { createBrowserModuleHarness } = await import(pathToFileURL(dcRequire.resolve('space-data-module-sdk/host/browser-module')).href);
const short = (e) => String(e?.message ?? e).slice(0, 240);

/** The frames a call carries, by port (the manifest P7 records). */
export const framesOf = (inputs) => inputs.map((i) => i.portId);

export async function openModules() {
  const apWasm = path.join(modules, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
  const h = await createStandaloneHarness('browser', apWasm, { surface: 'direct' });
  const x = h.instance.exports;
  const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
  const gem = await openModule(modules, 'analysis/gp-error-model', { fresh: true });
  const frames = await openModule(modules, 'foundation/frames');
  const dcDir = path.join(modules, 'analysis/density-calibration');
  const dc = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dcDir, 'dist/isomorphic/module.wasm')), manifest: JSON.parse(fs.readFileSync(path.join(dcDir, 'plugin-manifest.json'), 'utf8')), surface: 'direct' });
  const b = { erm, gem, frames };
  const extraFrames = (extra) => { const { rows, dcl } = extra ?? {}; return [
    ...(rows ? [{ portId: 'space_weather', typeRef: TYPE('SPW'), payload: rows }] : []),
    ...(dcl ? [{ portId: 'density_correction', typeRef: TYPE('DCL'), payload: dcl }] : []),
  ]; };
  const mem = () => h.memory.buffer;
  const put = (bytes) => { const p = x.sdnap_alloc(bytes.length); new Uint8Array(mem(), p, bytes.length).set(bytes); return p; };
  return {
    provenance: { sdnapWasmSha256: sha256(fs.readFileSync(apWasm)) },
    /** propagator/sdn-ap `fit` of one block: { ok, omm, obd, frames, fitMs } or { ok: false, error, frames }. */
    async fit(oem, pcf, extra) {
      const inputs = [{ portId: 'ephemeris', typeRef: TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: pcf }, ...extraFrames(extra)];
      const t0 = performance.now();
      let r;
      try { r = await h.invoke({ methodId: 'fit', inputs }); } catch (error) { return { ok: false, error: short(error), frames: framesOf(inputs) }; }
      const fitMs = performance.now() - t0;
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`, fitMs, frames: framesOf(inputs) };
      return { ok: true, omm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload), obd: new Uint8Array(r.outputs.find((o) => o.portId === 'determination').payload), fitMs, frames: framesOf(inputs) };
    },
    /** propagator/sdn-ap `propagate` of one set at explicit epochs (ISO UTC), TEME: { lines: [{epoch, r, v}], frames, bytes }. */
    async propagate(omm, epochs, pcf, extra, grid) {
      const inputs = [{ portId: 'omm', typeRef: TYPE('OMM'), payload: omm }, { portId: 'grid', typeRef: TYPE('OEM'), payload: grid }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: pcf }, ...extraFrames(extra)];
      const r = await h.invoke({ methodId: 'propagate', inputs });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const bytes = new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload);
      const lines = oemLines(bytes);
      if (lines.length !== epochs.length) throw new Error(`propagate returned ${lines.length} of ${epochs.length} states`);
      return { lines, frames: framesOf(inputs), bytes };
    },
    /** TEME states to the truth's axes by foundation/frames (B1, B2): [{r, v}]. */
    async toAxes(lines, axes) {
      const out = [];
      for (const l of lines) {
        const t = await F.transformState(frames, 'TEME', axes, l.epoch, [...l.r, ...l.v]);
        out.push({ r: t.slice(0, 3), v: t.slice(3, 6) });
      }
      return out;
    },
    /** The truth's axes to TEME by foundation/frames (the density check's probe positions). */
    async toTeme(lines, axes) {
      const out = [];
      for (const l of lines) out.push((await F.transformState(frames, axes, 'TEME', l.epoch, [...l.r, ...(l.v ?? [0, 0, 0])])).slice(0, 3));
      return out;
    },
    /** G1's scorer: the error of each predicted state against its truth state (same axes and epochs) in the truth's RTN axes. */
    rtn: (predicted, truth) => B.rtnSeries(b, predicted, truth),
    /** analysis/density-calibration `calibrate_log_density`: { ok, dcl } or { ok: false, error }. */
    async calibrate(request) {
      const r = await dc.invoke({ methodId: 'calibrate_log_density', inputs: [{ portId: 'request', typeRef: TYPE('DCL'), payload: request }] });
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
      return { ok: true, dcl: new Uint8Array(r.outputs[0].payload) };
    },
    /** sdnap_atmosphere_probe (diagnostic export): the density (kg/m^3) a drag node takes at a TEME position (km) and UTC split
     *  Julian date under model 0 (the theory's own), 1 (Jacchia 1970 on rows), 2 (NRLMSISE-00 on rows) or 3 (times exp(s(t))). */
    probeSession(rows, dcl) {
      const rp = rows ? put(rows) : 0, dp = dcl ? put(dcl) : 0, pos = x.sdnap_alloc(24), out = x.sdnap_alloc(56);
      return {
        density(model, whole, frac, r) {
          new Float64Array(mem(), pos, 3).set(r);
          const status = x.sdnap_atmosphere_probe(model, whole, frac, pos, model === 0 ? 0 : rp, model === 0 ? 0 : rows.length, model === 3 ? dp : 0, model === 3 ? dcl.length : 0, out);
          return status === 0 ? new Float64Array(mem(), out, 7)[0] : null;
        },
        close() { for (const p of [rp, dp, pos, out]) if (p) x.sdnap_free(p); },
      };
    },
    async close() { await h.destroy?.(); await frames.destroy?.(); await dc.destroy?.(); },
  };
}
