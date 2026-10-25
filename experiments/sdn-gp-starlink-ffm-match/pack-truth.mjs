// Truth packs for the regimes awaiting SDN-AP whose kernels the modules can read (SPK types 8, 9, 13): Artemis II after the
// translunar burn (Earth-centered, cislunar) and LRO (Moon-centered). States by files/orbit-products, epochs by foundation/time.
// Local output under <store>/pack/: <name>.f64 holds [unix ms, x, y, z, vx, vy, vz] per state (km, km/s, J2000 axes, UTC), <name>.json the
// description. Derived from public NAIF kernels; nothing is committed except the counts in results/.../kernels.json.
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, write, sha256 } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openContainers } from './lib/containers.mjs';
import { openTime } from './lib/timeconv.mjs';
import { KERNELS, spkObject } from './lib/spk-sources.mjs';

frozen();
const modules = modulesRoot();
const containers = await openContainers(modules), time = await openTime(modules);
const K = KERNELS(config.archive);
const packs = [
  { name: 'artemis2-cislunar', file: path.join(K, 'artemis2/art002_rec_260402_260410_jsc_bet_revf.bsp'), center: 'Earth', from: '2026-04-02T22:50:00Z', to: '2026-04-10T23:53:00Z', note: 'Orion best-estimated trajectory after the translunar burn; Earth-centered axes, lunar flyby inside' },
  { name: 'lro-lunar', file: path.join(K, 'lro/lrorg_2026074_2026166_v01.bsp'), center: 'Moon', from: '2026-03-15T00:01:10Z', to: '2026-06-14T23:59:00Z', note: 'LRO reconstructed ephemeris, Moon-centered' },
];
fs.mkdirSync(path.join(store, 'pack'), { recursive: true });
for (const p of packs) {
  const object = await spkObject(modules, { file: p.file, source: p.name, id: p.name, name: p.name, norad: 0, fromUtc: p.from, toUtc: p.to, containers, time });
  const flat = new Float64Array(object.lines.length * 7);
  object.lines.forEach((l, i) => { flat.set([Date.parse(l.epoch), ...l.r, ...l.v], i * 7); });
  fs.writeFileSync(path.join(store, 'pack', `${p.name}.f64`), Buffer.from(flat.buffer));
  write(path.join(store, 'pack', `${p.name}.json`), { name: p.name, kernel: path.basename(p.file), center: p.center, axes: 'J2000 (EME2000)', timeSystem: 'UTC', units: 'ms since 1970, km, km/s', states: object.lines.length, startUtc: object.lines[0].epoch, stopUtc: object.lines.at(-1).epoch, sha256: sha256(Buffer.from(flat.buffer)), note: p.note });
  console.log(`${p.name}: ${object.lines.length} states ${object.lines[0].epoch} to ${object.lines.at(-1).epoch}`);
}
await containers.destroy(); await time.destroy();
process.exit(0);
