// Maneuvers found in a stored orbit by analysis/maneuver-detection, unmodified: its D2 detector, a robust step test on the orbit-averaged semimajor axis, at a floor low enough for orbit-keeping
// burns. A precise orbit is one trajectory, so it reaches the detector cut into overlapping trajectories, one every 6 h, each centered on its own time. Module calls only.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { modulesRoot } from '../../xp-atmosphere-merit/common.mjs';
import { TYPE, OEM, flatbuffers, oemBytes } from '../../xp-atmosphere-merit/lib/sds.mjs';

const STEP_MS = 6 * 3600000, HALF_MS = 12 * 3600000, FLOOR_MPS = 0.005;

export async function openDetector() {
  const dir = path.join(modulesRoot(), 'analysis/maneuver-detection');
  const entry = createRequire(path.join(modulesRoot(), 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/host/browser-module');
  const { createBrowserModuleHarness } = await import(pathToFileURL(entry).href);
  const h = await createBrowserModuleHarness({
    wasmSource: fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm')),
    manifest: JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8')),
    surface: 'direct',
    hostOptions: { config: { detect: { detectors: ['D2'], glr_floor_in_track_mps: FLOOR_MPS } } },
  });
  return {
    /** lines: [{ epoch ISO, r km, v km/s }] in GCRF. Returns the raw $MNV frames and the status. */
    async detect(lines, object) {
      const t = lines.map((l) => Date.parse(l.epoch));
      const blocks = [];
      for (let c = t[0] + HALF_MS; c + HALF_MS <= t.at(-1); c += STEP_MS) {
        const part = lines.filter((_, i) => t[i] >= c - HALF_MS && t[i] <= c + HALF_MS);
        if (part.length >= 8) blocks.push(OEM.OEM.getRootAsOEM(new flatbuffers.ByteBuffer(oemBytes({ frame: 'GCRF', object, lines: part }))).unpack().EPHEMERIS_DATA_BLOCK[0]);
      }
      const whole = Object.assign(new OEM.OEMT(), { CCSDS_OEM_VERS: 2.0, CREATION_DATE: '', ORIGINATOR: 'operator-theory', EPHEMERIS_DATA_BLOCK: blocks });
      const builder = new flatbuffers.Builder(1 << 20);
      OEM.OEM.finishOEMBuffer(builder, whole.pack(builder));
      const response = await h.invoke({ methodId: 'detect_maneuvers', inputs: [{ portId: 'ephemerides', typeRef: TYPE('OEM'), payload: builder.asUint8Array().slice() }] });
      return { statusCode: response.statusCode, error: response.errorMessage, frames: blocks.length, maneuvers: response.outputs.filter((o) => o.portId === 'maneuvers').map((o) => new Uint8Array(o.payload)), report: response.outputs.find((o) => o.portId === 'report')?.payload };
    },
  };
}
