// The combination against itself: the full force model (propagator/ffm through G1's wrapper, drag off, Etalon's area-to-mass) carried from the last
// state of the week ending 2026-10-03 to every 2nd hour of the week ending 2026-10-10, both as converted by analysis/reference-states (GCRF).
//   SDN_MODULES_ROOT=<modules checkout> node experiments/etalon2-anomaly/continuity.mjs > experiments/etalon2-anomaly/continuity.json
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const g1 = (n) => import(path.join(here, '../sdn-gp-starlink-ffm-match', n));
const [{ readReference }, FFM, { modulesRoot }] = await Promise.all([g1('lib/sources.mjs'), g1('lib/ffm.mjs'), g1('lib/modules.mjs')]);
const V = '/opt/data/sdn-archive/v1c5/truth/reference-finals2000a';
const a = readReference(path.join(V, 'ilrsa.orb.etalon2.261003.v80', '20026.oem')), b = readReference(path.join(V, 'ilrsa.orb.etalon2.261010.v80', '20026.oem'));
const modules = modulesRoot();
const ctx = await FFM.loadEnvironment(modules, { archive: '/opt/data/sdn-archive', store: '/opt/data/sdn-archive/sdn-gp-starlink-ffm-match' });
const last = a.lines.at(-1), targets = b.lines.filter((_, i) => i % 8 === 0);
const res = await FFM.propagate(modules, ctx, { epoch: last.epoch, state: [...last.r, ...last.v].map((x) => x * 1000), cdAm: 0.0001, crAm: 0.0011, epochs: targets.map((l) => Date.parse(l.epoch)), forces: { ENABLE_DRAG: false } });
const rows = res.samples.map((s, i) => ({ epoch: targets[i].epoch, km: Number(Math.hypot(...s.state.slice(0, 3).map((x, k) => x / 1000 - targets[i].r[k])).toFixed(4)) }));
process.stdout.write(`${JSON.stringify({ from: last.epoch, ffmWasmSha256: res.wasmSha256, rows }, null, 1)}\n`);
process.exit(0);
