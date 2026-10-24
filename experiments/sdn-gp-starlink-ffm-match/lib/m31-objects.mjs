// The satellites of the batch captured for M31 and M32 (amendments A11c and A12): the derived FFM-1 trajectories (96 h at 60 s, GCRF) of <store>/m31/truth/, as objects the G1 scorers read.
import fs from 'node:fs';
import path from 'node:path';
import { store, config } from '../common.mjs';
import { withT, ms } from './windows.mjs';

export const M31_DIR = path.join(store, 'm31');

/** The captured satellites in NORAD (provisional id) order: [{ meta, object, t0 }]. */
export function batchObjects() {
  const dir = path.join(M31_DIR, 'truth');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)).sort().map((n) => {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
    const flat = new Float64Array(new Uint8Array(fs.readFileSync(path.join(dir, `${meta.norad}.f64`))).buffer);
    const t0 = ms(meta.truth.epochUtc), step = config.truth.cadenceSeconds * 1000;
    const object = withT({ source: 'starlink-ffm', id: `STARLINK (${meta.norad})`, norad: meta.norad, name: `STARLINK-${meta.norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
      lines: Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: new Date(t0 + i * step).toISOString(), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
    return { meta, object, t0 };
  }).sort((a, c) => a.meta.norad - c.meta.norad);
}
