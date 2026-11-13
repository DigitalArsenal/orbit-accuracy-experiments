// Synthetic variants retain catalog SYNTHETIC-ORBITS, NORAD 0 and EXERCISE status.
// Starting with the first committed made-up fit/seed/truth, rename all case identities and links.
// Refusal: negative mean motion. Missing truth: omit its frame. Short truth: keep 13 states after cutoff.
// Decay: zero the first position. Outside: translate truth X by 1 km. Other variants remove or corrupt one field.
// No orbit is fitted or numerically propagated by this fixture builder.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { frames, RecordStream } from '../experiments/synthetic-orbits/records.mjs';
import { sha256hex } from '../experiments/synthetic-orbits/identity.mjs';
const require = createRequire(import.meta.url), fb = require('flatbuffers');
const { OCM } = await import(require.resolve('spacedatastandards.org/lib/js/OCM/OCM.js'));
export const unpack = (b) => OCM.getRootAsOCM(new fb.ByteBuffer(b)).unpack();
export const pack = (o) => { const b = new fb.Builder(16384); OCM.finishOCMBuffer(b, o.pack(b)); return b.asUint8Array().slice(); };
export function makeFixtures(source, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const names = ['records.fsdata', 'truth-ocm.fsdata', 'seed-ocm.fsdata'];
  for (const n of names) fs.copyFileSync(path.join(source, n), path.join(dir, n));
  const base = names.map((n) => [...frames(path.join(source, n))][0].bytes);
  const streams = names.map((n) => new RecordStream(path.join(dir, n)));
  for (const kind of ['refused', 'no-truth', 'short', 'decay', 'outside', 'no-cutoff', 'hash-mismatch', 'no-seed', 'off-grid']) {
    const [fit, truth, seed] = base.map(unpack), objects = [fit, truth, seed];
    for (let i = 0; i < 3; i += 1) {
      objects[i].HEADER.MESSAGE_ID = `fixture-${kind}-${i}`;
      objects[i].METADATA.OBJECT_NAME = objects[i].METADATA.OBJECT_DESIGNATOR = `fixture-${kind}`;
    }
    const cutoff = Date.parse(`${fit.ORBIT_DETERMINATION.FIT_STATISTICS.FIT_START}Z`);
    const k0 = (cutoff - Date.parse(`${truth.METADATA.START_TIME}Z`)) / 300000;
    if (kind === 'refused') fit.MEAN_ELEMENTS.MEAN_MOTION = -1;
    if (kind === 'short') truth.STATE_DATA = truth.STATE_DATA.slice(0, (k0 + 13) * 6);
    if (kind === 'decay') truth.STATE_DATA.splice(0, 3, 0, 0, 0);
    if (kind === 'outside') for (let k = 0; k < truth.STATE_DATA.length; k += 6) truth.STATE_DATA[k] += 1;
    if (kind === 'no-cutoff') { fit.ORBIT_DETERMINATION.FIT_STATISTICS.FIT_START = null; fit.MEAN_ELEMENTS.EPOCH = null; }
    if (kind === 'off-grid') fit.ORBIT_DETERMINATION.FIT_STATISTICS.FIT_START = new Date(cutoff + 1000).toISOString().replace('Z', '');
    const sb = pack(seed);
    Object.assign(truth.PROVENANCE, { SOURCE_ID: seed.HEADER.MESSAGE_ID, SOURCE_SHA256: sha256hex(sb), SOURCE_BYTES: BigInt(sb.length) });
    const tb = pack(truth);
    Object.assign(fit.PROVENANCE, { SOURCE_ID: truth.HEADER.MESSAGE_ID, SOURCE_SHA256: kind === 'hash-mismatch' ? '0'.repeat(64) : sha256hex(tb), SOURCE_BYTES: BigInt(tb.length) });
    streams[0].append(pack(fit));
    if (kind !== 'no-truth') streams[1].append(tb);
    if (kind !== 'no-seed') streams[2].append(sb);
  }
}
