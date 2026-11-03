// Pc through conjunction-assessment compute_pc (FOSTER, adaptive Gaussian disk integral). Request encoding only.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import { sha256 } from '../../../harness/modules.mjs';

export async function openPc(pinDir, expectedWasmSha256) {
  const dir = path.join(pinDir, 'analysis/conjunction-assessment');
  const wasm = fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm'));
  if (sha256(wasm) !== expectedWasmSha256) throw new Error('conjunction-assessment artifact is not the pinned one');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8'));
  const root = process.env.SPACE_DATA_STANDARDS_ROOT;
  const req = createRequire(path.join(root, 'package.json'));
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const C = await import(pathToFileURL(path.join(root, 'lib/js/CQR/main.js')).href);
  const h = await createBrowserModuleHarness({ wasmSource: wasm, manifest, surface: 'direct' });
  return {
    close: () => h.destroy(),
    // cov = [var_xi, cov_xi_zeta, var_zeta] in m^2, hbr in m, zero miss unless given
    async pc(cov, hbr, miss = [0, 0]) {
      const b = new fb.Builder(512), record = new C.CQRT();
      record.PROBABILITY_REQUEST = new C.CQRProbabilityRequestT(new C.CQRPlaneGeometryT(miss[0], miss[1], cov[0], cov[1], cov[2], hbr), C.cqrProbabilityAlgorithm.FOSTER);
      C.CQR.finishCQRBuffer(b, record.pack(b));
      const r = await h.invoke({ methodId: 'compute_pc', inputs: [{ portId: 'request', typeRef: { schemaName: 'CQR.fbs', fileIdentifier: '$CQR', rootTypeName: 'CQR', wireFormat: 'flatbuffer' }, payload: b.asUint8Array() }] });
      if (r.statusCode !== 0) throw new Error(r.errorMessage);
      const p = C.CQR.getRootAsCQR(new fb.ByteBuffer(new Uint8Array(r.outputs[0].payload))).unpack().PROBABILITY_RESULT;
      if (!p.CONVERGED || !Number.isFinite(p.PROBABILITY) || p.PROBABILITY < 0 || p.PROBABILITY > 1) throw new Error('Pc did not converge');
      return p.PROBABILITY;
    },
  };
}
