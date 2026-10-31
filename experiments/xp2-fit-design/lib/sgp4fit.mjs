// XP2F: plain SGP4 fitted to truth, the S arms (PLAN.md, Arms): analysis/gp-error-model fit_elements (foundation/sgp4-str3 in the module's improved mode, Levenberg-Marquardt tolerance 1e-10,
// at most 100 iterations, central differences), the wasm pinned as XM pins it, a fresh harness per call as XM hosts this module. Flown by XM's propagateSgp4, exactly as P. JavaScript moves FlatBuffers.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { XM, root, config } from '../common.mjs';

export async function openSgp4Fit() {
  const modules = XM.modulesRoot();
  const { bytes, manifest } = XM.pinned(modules, 'analysis/gp-error-model');
  const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(modules, 'analysis/gp-error-model/package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
  const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')).href);
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  return {
    /** One fit of an $OEM: { fr: the module's fit report, el: the elements as XM's propagateSgp4 takes them, bstar }. Throws when the fit does not converge. */
    async fit(oem, options, identity) {
      const h = await createBrowserModuleHarness({ wasmSource: bytes, manifest, surface: 'direct' });
      try {
        const r = await h.invoke({ methodId: 'fit_elements', inputs: [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, erm.frame('options', 'fitOptions', { closure: false, ...options })] });
        if (r.statusCode !== 0) throw new Error(`fit_elements: ${r.errorCode ?? r.statusCode}: ${String(r.errorMessage).slice(0, 200)}`);
        const out = {};
        for (const o of r.outputs) out[o.portId] = Buffer.from(o.payload);
        const fr = erm.decode(out.report).fits?.[0];
        if (!fr || !fr.converged) throw new Error(fr?.error ?? 'not converged');
        const u = S.OMM.OMM.getSizePrefixedRootAsOMM(new S.flatbuffers.ByteBuffer(new Uint8Array(out.elements))).unpack();
        const el = { epoch: u.EPOCH, objectName: identity.name, objectId: identity.objectId ?? '', elements: { MEAN_MOTION: u.MEAN_MOTION, ECCENTRICITY: u.ECCENTRICITY, INCLINATION: u.INCLINATION, RA_OF_ASC_NODE: u.RA_OF_ASC_NODE, ARG_OF_PERICENTER: u.ARG_OF_PERICENTER, MEAN_ANOMALY: u.MEAN_ANOMALY, BSTAR: u.BSTAR, MEAN_MOTION_DOT: u.MEAN_MOTION_DOT, MEAN_MOTION_DDOT: u.MEAN_MOTION_DDOT } };
        return { fr, el, bstar: u.BSTAR };
      } finally { await h.destroy(); }
    },
  };
}
