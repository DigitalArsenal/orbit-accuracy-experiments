// Host side of analysis/maneuver-detection for the event rule: encodes one object's causal element sets, routes the
// detector's propagation queries to propagator/sgp4 (propagate_ephemeris, one block per set), and returns the detected events.
// Bytes in, bytes out: every orbit computation is a module's. Follows the module's own study host (study/lib/host.mjs).
import fs from 'node:fs';
import path from 'node:path';
import * as fb from 'flatbuffers';
import * as OMM from 'spacedatastandards.org/lib/js/OMM/main.js';
import * as OEM from 'spacedatastandards.org/lib/js/OEM/main.js';
import * as MNV from 'spacedatastandards.org/lib/js/MNV/main.js';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import { sha256 } from '../../harness/modules.mjs';
import { epochMs } from '../../harness/gp-archive.mjs';

const TYPES = {
  OMM: { schemaName: 'OMM.fbs', fileIdentifier: '$OMM', rootTypeName: 'OMM', wireFormat: 'flatbuffer' },
  OEM: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' },
};
const PROP = { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' };
const OMM_SGP4 = { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' };

function ommRecord(set) {
  const t = new OMM.OMMT();
  Object.assign(t, { OBJECT_NAME: '', OBJECT_ID: set.objectId ?? '', NORAD_CAT_ID: set.norad, EPOCH: String(set.epoch), MEAN_ELEMENT_THEORY: OMM.meanElementSource.SGP4,
    MEAN_MOTION: set.elements.MEAN_MOTION, ECCENTRICITY: set.elements.ECCENTRICITY, INCLINATION: set.elements.INCLINATION, RA_OF_ASC_NODE: set.elements.RA_OF_ASC_NODE,
    ARG_OF_PERICENTER: set.elements.ARG_OF_PERICENTER, MEAN_ANOMALY: set.elements.MEAN_ANOMALY, BSTAR: set.elements.BSTAR,
    MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0, REV_AT_EPOCH: 0, ELEMENT_SET_NO: 0, COMMENT: `GP_ID ${set.gpId}` });
  const b = new fb.Builder(512);
  OMM.OMM.finishSizePrefixedOMMBuffer(b, t.pack(b));
  return Buffer.from(b.asUint8Array());
}
const ommStream = sets => Buffer.concat(sets.map(ommRecord));

function propagationRequest({ catalogNumbers, stepSeconds, neighbourSets }) {
  const b = new fb.Builder(256);
  b.startVector(4, catalogNumbers.length, 4);
  for (let i = catalogNumbers.length - 1; i >= 0; --i) b.addInt32(catalogNumbers[i]);
  const cat = b.endVector();
  b.startObject(10);
  b.addFieldFloat64(0, 0, 0);
  b.addFieldOffset(4, cat, 0);
  b.addFieldInt8(5, 0, 3);              // output_frame TEME
  b.addFieldFloat64(6, 0, 0);
  b.addFieldFloat64(7, stepSeconds, 0);
  b.addFieldInt8(8, 1, 0);              // element_set_blocks
  b.addFieldInt32(9, neighbourSets, 2);
  b.finish(b.endObject());
  return b.asUint8Array();
}
function oemFrame(blocks) {
  const m = new OEM.OEMT();
  m.CREATION_DATE = '2026-10-23T00:00:00.000Z';
  m.EPHEMERIS_DATA_BLOCK = blocks;
  const b = new fb.Builder(1 << 20);
  OEM.OEM.finishOEMBuffer(b, m.pack(b));
  return b.asUint8Array();
}
// A compiled module and a factory of fresh instances: propagator/sgp4 keeps the element sets it was given, so every call
// gets its own instance, and the detector gets one too (nothing carries from one object's call to the next).
const moduleOf = async (root, relative) => {
  const wasm = fs.readFileSync(path.join(root, relative, 'dist/isomorphic/module.wasm'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, relative, 'plugin-manifest.json'), 'utf8'));
  const compiled = await WebAssembly.compile(wasm);
  return { make: () => createBrowserModuleHarness({ wasmSource: compiled, manifest, surface: 'direct', hostOptions: { config: {} } }),
    provenance: { path: relative, version: manifest.version, wasmSha256: sha256(wasm) } };
};
const invoke = async (harness, methodId, inputs) => {
  const response = await harness.invoke({ methodId, inputs });
  if (response.statusCode !== 0) throw new Error(`${methodId}: ${response.errorCode ?? response.statusCode}: ${response.errorMessage}`);
  return response;
};

// options: {gridStepS, neighbourSets} are the detector's defaults (60 s, 2); both modules run with their defaults otherwise.
export async function makeDetector(root, { gridStepS = 60, neighbourSets = 2 } = {}) {
  const detector = await moduleOf(root, 'analysis/maneuver-detection'), sgp4 = await moduleOf(root, 'propagator/sgp4');
  return {
    provenance: [detector.provenance, sgp4.provenance],
    // `sets`: one object's element sets, ascending by epoch, one per epoch ({norad, epoch, gpId, elements}).
    async events(sets) {
      const stream = ommStream(sets), element_sets = { portId: 'element_sets', payload: stream, typeRef: TYPES.OMM };
      const d = await detector.make(), p = await sgp4.make();
      try {
        const first = await invoke(d, 'detect_maneuvers', [element_sets]);
        if (!first.outputs.some(o => o.portId === 'propagation_requests')) throw new Error('detector made no propagation request');
        const out = await invoke(p, 'propagate_ephemeris', [{ portId: 'request', payload: propagationRequest({ catalogNumbers: [sets[0].norad], stepSeconds: gridStepS, neighbourSets }), typeRef: PROP },
          { portId: 'omm', payload: stream, typeRef: OMM_SGP4 }]);
        const blocks = OEM.OEM.getRootAsOEM(new fb.ByteBuffer(new Uint8Array(out.outputs.find(o => o.portId === 'ephemeris').payload))).unpack().EPHEMERIS_DATA_BLOCK;
        if (blocks.length !== sets.length) throw new Error(`${blocks.length} propagation blocks for ${sets.length} sets`);
        const second = await invoke(d, 'detect_maneuvers', [element_sets, { portId: 'propagation', payload: oemFrame(blocks), typeRef: TYPES.OEM }]);
        return second.outputs.filter(o => o.portId === 'maneuvers').map(o => {
          const m = MNV.MNV.getRootAsMNV(new fb.ByteBuffer(new Uint8Array(o.payload))).unpack();
          return { time: epochMs(m.EVENT_START_TIME), end: epochMs(m.EVENT_END_TIME), deltaVelKmS: m.DELTA_VEL, deltaVelV: m.DELTA_VEL_V, deltaVelW: m.DELTA_VEL_W, algorithm: m.ALGORITHM };
        });
      } finally { await d.destroy(); await p.destroy(); }
    },
    destroy: async () => {},
  };
}
