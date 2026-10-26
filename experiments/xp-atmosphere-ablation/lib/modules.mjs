// The modules XA runs, opened once at build.json's commit: propagator/sdn-ap (fit, propagate and the Part D diagnostic
// exports, one direct harness), analysis/gp-error-model (G1's scorer: pair_statistics in the truth's RTN axes),
// foundation/frames (TEME to the truth's axes, as B1 and B2) and analysis/density-calibration (the open-DCA $DCL).
// JavaScript moves bytes; every number comes out of a module.
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
  return {
    provenance: { modulesCommit: null, sdnapWasmSha256: sha256(fs.readFileSync(apWasm)) },
    /** propagator/sdn-ap `fit` of one block: { ok, omm (Uint8Array), ms } or { ok: false, error }. */
    async fit(oem, pcf, extra) {
      const t0 = performance.now();
      let r;
      try {
        r = await h.invoke({ methodId: 'fit', inputs: [{ portId: 'ephemeris', typeRef: TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: pcf }, ...extraFrames(extra)] });
      } catch (error) { return { ok: false, error: short(error) }; }
      const fitMs = performance.now() - t0;
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`, fitMs };
      return { ok: true, omm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload), fitMs };
    },
    /** propagator/sdn-ap `propagate` of one set at explicit epochs (ISO UTC), TEME: [{epoch, r, v}] (km, km/s). */
    async propagate(omm, epochs, pcf, extra, grid) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'omm', typeRef: TYPE('OMM'), payload: omm }, { portId: 'grid', typeRef: TYPE('OEM'), payload: grid },
        { portId: 'configuration', typeRef: TYPE('PCF'), payload: pcf }, ...extraFrames(extra)] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const lines = oemLines(r.outputs.find((o) => o.portId === 'ephemeris').payload);
      if (lines.length !== epochs.length) throw new Error(`propagate returned ${lines.length} of ${epochs.length} states`);
      return lines;
    },
    /** Part D's diagnostic exports: the fitted set's epoch placement (0 first state, 1 middle, 2 last) and the
     *  finite-difference columns in every fit (0, 1); each returns the previous value. */
    diag: { epoch: (p) => x.sdnap_fit_epoch_diagnostic(p), jacobian: (j) => x.sdnap_fit_jacobian_diagnostic(j) },
    /** TEME states to the truth's axes by foundation/frames (B1, B2): [{r, v}]. */
    async toAxes(lines, axes) {
      const out = [];
      for (const l of lines) {
        const t = await F.transformState(frames, 'TEME', axes, l.epoch, [...l.r, ...l.v]);
        out.push({ r: t.slice(0, 3), v: t.slice(3, 6) });
      }
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
    async close() { await h.destroy?.(); await frames.destroy?.(); await dc.destroy?.(); },
  };
}
