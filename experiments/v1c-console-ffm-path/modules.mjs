// ABI transport only. All propagation, transforms and B* conversion are WASM.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import * as fb from 'flatbuffers';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import { sha256 } from '../../harness/modules.mjs';
import { ommFrame } from '../../harness/records.mjs';
export const jd = ms => ms / 86400000 + 2440587.5; // UTC representation, no time-scale conversion
export const distance = (a, b) => Math.hypot(...a.slice(0, 3).map((v, i) => v - b[i]));
export async function moduleFactory(root, relative, run) {
  const bytes = fs.readFileSync(path.join(root, relative, 'dist/isomorphic/module.wasm'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, relative, 'plugin-manifest.json')));
  run.addModule({ path: relative, version: manifest.version, wasmSha256: sha256(bytes) });
  const compiled = await WebAssembly.compile(bytes);
  return () => createBrowserModuleHarness({ wasmSource: compiled, manifest, surface: 'direct' });
}
export async function bindings(root) {
  const base = path.join(root, 'propagator/ffm');
  const catalog = await import(pathToFileURL(path.join(base, 'catalog.mjs')));
  const table = (name, values) => Object.assign(new catalog.prw[`${name}T`](), values);
  const frame = (portId, arm, value) => ({ portId, typeRef: catalog.TYPE, payload: catalog.encode(arm, value) });
  return { catalog, table, frame };
}
export function coverage(h, frames, seed, bstar = 0, earthFixed = false) {
  const x = h.instance.exports, memory = x.memory ?? h.memory;
  const alloc = array => { const p = x.plugin_alloc(array.byteLength); assert(p); new Uint8Array(memory.buffer, p, array.byteLength).set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)); return p; };
  const text = p => { const b = new Uint8Array(memory.buffer); let e = p; while (b[e]) e++; return new TextDecoder().decode(b.slice(p, e)); };
  const check = (r, expected) => { assert.equal(r, expected, text(x.plugin_catalog_error())); };
  check(x.plugin_init(), 0);
  const bytes = Buffer.concat(frames.map(f => Buffer.from(f.payload)));
  const b = alloc(bytes), bs = alloc(new Float64Array([bstar]));
  check(x.plugin_configure_catalog(b, bytes.length, bs, 1), 0);
  x.plugin_free(b); x.plugin_free(bs);
  const state = alloc(new Float64Array([jd(seed.ms), ...seed.state]));
  if (!earthFixed) check(x.plugin_catalog_transform_state(jd(seed.ms), state + 8, state + 8, 0), 0);
  check(x.plugin_init_states_ecef(state, 1), 1); x.plugin_free(state);
  const out = alloc(new Float64Array(6));
  const transform = (ms, values, inverse = false) => {
    new Float64Array(memory.buffer, out, 6).set(values);
    check(x.plugin_catalog_transform_state(jd(ms), out, out, Number(inverse)), 0);
    return Array.from(new Float64Array(memory.buffer, out, 6));
  };
  return {
    profile: text(x.plugin_get_profile()),
    step(ms) { check(x.plugin_ensure_coverage(jd(ms), 0, 1), 1); check(x.plugin_eval_positions(jd(ms), out, 1), 1); return Array.from(new Float64Array(memory.buffer, out, 3)); },
    transform,
    dispose() { x.plugin_free(out); x.plugin_destroy(); },
  };
}
export async function resident(h, b, configuration, environment, seed, crAm, cdAm = .01) {
  const { catalog: c, table, frame } = b;
  const instanceId = 'v1c';
  const instance = table('PRWInstance', { MODULE_ID: c.MODULE_ID, INSTANCE_ID: instanceId, GENERATION: 1n });
  const response = await h.invoke({ methodId: 'ingest_state', inputs: [frame('state', 'RESIDENT_STATE', c.residentState({ instanceId, handle: 1, epoch: seed.epoch, state: seed.state, cdAm: configuration.drag ? cdAm : undefined, crAm })), { ...configuration.frame, portId: 'configuration' }, ...environment] });
  assert.equal(response.statusCode, 0, response.errorMessage);
  return async ms => {
    const response = await h.invoke({ methodId: 'propagate_state', inputs: [frame('request', 'RESIDENT_REQUEST', table('PRWResidentRequest', {
      INSTANCE: instance, ENTITY_HANDLES: [1], TARGET_COORDINATE_SYSTEM: c.gcrf(),
      TARGET_EPOCH: table('TIMInstant', { TIME_SYSTEM: c.prw.timingStandard.UTC, EPOCH_FORMAT: c.prw.timEpochRepresentation.JULIAN_DATE, JULIAN_DATE: jd(ms) }),
    }))] });
    assert.equal(response.statusCode, 0, response.errorMessage);
    const r = c.prw.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).unpack().RESIDENT_STATE;
    assert(r?.VALID, 'invalid resident result');
    return [r.STATE.POSITION.X, r.STATE.POSITION.Y, r.STATE.POSITION.Z];
  };
}
export async function sgp4Client(root, factory) {
  const dir = path.join(root, 'propagator/sgp4/tests/lib/generated/orbpro');
  const { PropagatorBatchRequest: R } = await import(pathToFileURL(path.join(dir, 'propagator/propagator-batch-request.js')));
  const { PropagatorState: S } = await import(pathToFileURL(path.join(dir, 'plugins/propagator-state.js')));
  return async set => {
    // A fresh instance holds exactly this OMM, so no future or neighboring set can win.
    const h = await factory();
    const init = await h.invoke({ methodId: 'ingest_omm', inputs: [ommFrame([set], 'omm')] });
    assert.equal(init.statusCode, 0, init.errorMessage);
    return {
      async at(ms, fixed = false) {
        const b = new fb.Builder(128);
        const handles = R.createEntityHandlesVector(b, [0]);
        R.startPropagatorBatchRequest(b); R.addEpoch(b, jd(ms)); R.addEntityHandles(b, handles); R.addMaxCount(b, 1); R.addOutputFrame(b, fixed ? 3 : 2); b.finish(R.endPropagatorBatchRequest(b));
        const response = await h.invoke({ methodId: 'propagate_state', inputs: [{ portId: 'request', payload: b.asUint8Array(), typeRef: { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP' } }] });
        assert.equal(response.statusCode, 0, response.errorMessage);
        const s = S.getRootAsPropagatorState(new fb.ByteBuffer(new Uint8Array(response.outputs.find(f => f.portId === 'state').payload)));
        assert(s.valid()); assert.equal(s.catalogNumber(), set.norad); assert.equal(s.referenceFrame(), fixed ? 1 : 3);
        return [0, 1, 2].map(i => s.position(i)).concat([0, 1, 2].map(i => s.velocity(i)));
      }, destroy: () => h.destroy(),
    };
  };
}
