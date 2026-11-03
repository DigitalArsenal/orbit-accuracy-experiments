// SGP4 through the pinned module propagator/sgp4 (AFSPC mode, as the module is built). Transport only: every state is the module's.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import assert from 'node:assert/strict'; import { pathToFileURL } from 'node:url';
import * as fb from 'flatbuffers';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import { ommFrame } from '../../../harness/records.mjs';
// SHA-256 of the artifacts at space-data-network-modules origin/main 3ae1eb289 (git show origin/main:propagator/sgp4/<file>).
export const PINS = {
  'dist/isomorphic/module.wasm': '2fe246b716c78a4b947cd95e70e126b7a738cbbb9775e5196f07b1fe551f4643',
  'plugin-manifest.json': '8dd8399bfb20e4ac1246508c86a07a50055f74e9ad2516a6d8c049f8a1a098de',
  'tests/lib/generated/orbpro/propagator/propagator-batch-request.js': '524875f1d1fdb3885fe3e70f65bf6abfb0f9ae2754eb2ee09ac1ec91eb64f85b',
  'tests/lib/generated/orbpro/plugins/propagator-state.js': 'f733c4af3ef63d6620f7a86b09949c69cf0f436df498b1a4a221890482c38b70',
};
export const jd = (ms) => ms / 86400000 + 2440587.5;
export async function openSgp4(modulesRoot = process.env.SDN_MODULES_ROOT) {
  assert(modulesRoot, 'SDN_MODULES_ROOT');
  const base = path.join(modulesRoot, 'propagator/sgp4');
  for (const [f, h] of Object.entries(PINS)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(base, f))).digest('hex'), h, `sgp4 artifact differs from its pin: ${f}`);
  const gen = path.join(base, 'tests/lib/generated/orbpro');
  const { PropagatorBatchRequest: R } = await import(pathToFileURL(path.join(gen, 'propagator/propagator-batch-request.js')));
  const { PropagatorState: S } = await import(pathToFileURL(path.join(gen, 'plugins/propagator-state.js')));
  const compiled = await WebAssembly.compile(fs.readFileSync(path.join(base, 'dist/isomorphic/module.wasm')));
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'plugin-manifest.json')));
  const type = { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP' };
  /** A fresh instance holding exactly this set, so no neighbor can win. at(ms) -> [x,y,z,vx,vy,vz] in the module's inertial frame (frame 2). */
  return async (set) => {
    const h = await createBrowserModuleHarness({ wasmSource: compiled, manifest, surface: 'direct' });
    const init = await h.invoke({ methodId: 'ingest_omm', inputs: [ommFrame([{ norad: set.norad, epoch: set.epoch, elements: Object.fromEntries(['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'].map((f, i) => [f, set.el[i]]))}], 'omm')] });
    assert.equal(init.statusCode, 0, init.errorMessage);
    return {
      async at(ms) {
        const b = new fb.Builder(128);
        const handles = R.createEntityHandlesVector(b, [0]);
        R.startPropagatorBatchRequest(b); R.addEpoch(b, jd(ms)); R.addEntityHandles(b, handles); R.addMaxCount(b, 1); R.addOutputFrame(b, 2); b.finish(R.endPropagatorBatchRequest(b));
        const r = await h.invoke({ methodId: 'propagate_state', inputs: [{ portId: 'request', payload: b.asUint8Array(), typeRef: type }] });
        assert.equal(r.statusCode, 0, r.errorMessage);
        const s = S.getRootAsPropagatorState(new fb.ByteBuffer(new Uint8Array(r.outputs.find((f) => f.portId === 'state').payload)));
        if (!s.valid()) return null; assert.equal(s.catalogNumber(), set.norad);
        return [0, 1, 2].map((i) => s.position(i)).concat([0, 1, 2].map((i) => s.velocity(i)));
      },
      destroy: () => h.destroy(),
    };
  };
}
/** Difference a - b rotated into b's RTN (R = r/|r|, N = r x v, T = N x R); inputs in the module's units. */
export function rtn(a, b) {
  const r = b.slice(0, 3), v = b.slice(3), nr = Math.hypot(...r);
  const R = r.map((x) => x / nr), c = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], nc = Math.hypot(...c), N = c.map((x) => x / nc);
  const T = [N[1] * R[2] - N[2] * R[1], N[2] * R[0] - N[0] * R[2], N[0] * R[1] - N[1] * R[0]];
  const d = a.map((x, i) => x - b[i]), dot = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  return [dot(d.slice(0, 3), R), dot(d.slice(0, 3), T), dot(d.slice(0, 3), N), dot(d.slice(3), R), dot(d.slice(3), T), dot(d.slice(3), N)];
}
