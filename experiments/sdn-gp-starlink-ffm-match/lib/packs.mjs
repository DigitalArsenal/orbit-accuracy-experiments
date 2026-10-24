// Truth packs for the regimes SDN-GP will cover: <store>/pack/<name>.f64 holds [unix ms UTC, x, y, z, vx, vy, vz] per state
// (km, km/s, inertial axes of the source, the pack's center), <name>.json describes it. Derived from public sources; local only.
// JavaScript here reads, slices and writes arrays; every orbit, frame and time computation is a module's.
import fs from 'node:fs';
import path from 'node:path';
import { store, sha256 } from '../common.mjs';
import { withT } from './windows.mjs';

export const packDir = () => path.join(store, 'pack');

export function writePack(name, { states, description }) {
  fs.mkdirSync(packDir(), { recursive: true });
  const flat = new Float64Array(states.length * 7);
  states.forEach((s, i) => flat.set([s.ms, ...s.r, ...s.v], i * 7));
  const bytes = Buffer.from(flat.buffer);
  fs.writeFileSync(path.join(packDir(), `${name}.f64`), bytes);
  const meta = { name, ...description, timeSystem: 'UTC', units: 'ms since 1970, km, km/s', states: states.length, startUtc: new Date(states[0].ms).toISOString(), stopUtc: new Date(states.at(-1).ms).toISOString(), sha256: sha256(bytes) };
  fs.writeFileSync(path.join(packDir(), `${name}.json`), JSON.stringify(meta, null, 2) + '\n');
  return meta;
}

export function readPackMeta(name) { return JSON.parse(fs.readFileSync(path.join(packDir(), `${name}.json`), 'utf8')); }

/** A pack as an ephemeris object in the experiment's form ({lines: [{epoch, r, v}], t}) for scoreWindow-style slicing. */
export function readPack(name) {
  const meta = readPackMeta(name);
  const flat = new Float64Array(new Uint8Array(fs.readFileSync(path.join(packDir(), `${name}.f64`))).buffer);
  const lines = Array.from({ length: flat.length / 7 }, (_, i) => ({ epoch: new Date(flat[i * 7]).toISOString(), r: [flat[i * 7 + 1], flat[i * 7 + 2], flat[i * 7 + 3]], v: [flat[i * 7 + 4], flat[i * 7 + 5], flat[i * 7 + 6]] }));
  return { meta, object: withT({ source: name, id: name, norad: 0, name, objectId: '', originator: meta.source ?? '', creation: '', frame: 'GCRF', timeSystem: 'UTC', lines }) };
}

export const listPacks = () => (fs.existsSync(packDir()) ? fs.readdirSync(packDir()).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort() : []);
