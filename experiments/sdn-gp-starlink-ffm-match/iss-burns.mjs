// Amendment A11, M24: the burn list and the windows of NASA's ISS archive, from the headers alone (no state vectors): results/sdn-gp-starlink-ffm-match/iss-burns.json. The headers' event tables are
// NASA's planned values (TIG, delta-v, apogee and perigee heights of the trajectory in the file); the burns are those with a delta-v above zero.
//   node experiments/sdn-gp-starlink-ffm-match/iss-burns.mjs
import path from 'node:path';
import { write, results, sha256 } from './common.mjs';
import { archiveHeaders, issWindows, WINDOW_H } from './lib/iss-windows.mjs';
import { iso } from './lib/windows.mjs';

const files = archiveHeaders();
const r = issWindows(files);
const out = {
  generatedFrom: "the header event tables of NASA's ISS OEM files (nasa-public-data iss-coords archive, retrieved 2026-10-24); headers only, no state vectors",
  plannedValues: 'TIG, delta-v, HA and HP are the planned values of the trajectory in the file (NASA JSC FOD TOPO), not measurements of the executed burns',
  files: { count: files.length, first: files[0].date, last: files.at(-1).date, withoutEvents: files.filter((f) => !f.events.length).length, headersSha256: sha256(JSON.stringify(files.map((f) => [f.date, f.header.creationUtc, f.header.startMs, f.header.stopMs, f.events.map((e) => [e.name, e.tigMs, e.dvMS, e.haKm, e.hpKm])]))) },
  windowHours: WINDOW_H,
  clusters: r.clusters,
  notScored: r.notScored,
  windows: r.windows.map((w) => ({ kind: w.kind, cluster: w.cluster, file: w.date, startUtc: iso(w.startMs), stopUtc: iso(w.stopMs), ...(w.tigMs ? { tigUtc: iso(w.tigMs), name: w.name, plannedDvMS: w.dvMS, haKm: w.haKm, hpKm: w.hpKm, otherBurns: w.otherBurns, short: w.short } : {}) })),
  counts: { clusters: r.clusters.length, burnPre: r.windows.filter((w) => w.kind === 'burn-pre').length, burnPost: r.windows.filter((w) => w.kind === 'burn-post').length, free: r.windows.filter((w) => w.kind === 'free').length, notScored: r.notScored.length },
};
write(path.join(results, 'iss-burns.json'), out);
console.log(JSON.stringify(out.counts), JSON.stringify(out.files));
