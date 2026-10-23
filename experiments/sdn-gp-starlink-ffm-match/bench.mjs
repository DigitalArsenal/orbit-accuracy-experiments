// Cost of one propagated state and of one element record, per theory, through the same module call
// (propagator/sgp4-xp `propagate`, the Space Force library's SGP4 and SGP4-XP paths). Median of repeated one-day
// propagations on a 60 s grid in GCRF, V8 on a loaded machine. Output: results/sdn-gp-starlink-ffm-match/bench.json.
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, results, write } from './common.mjs';
import { modulesRoot, openModule } from './lib/modules.mjs';
import { openBaselines } from './lib/baselines.mjs';
import { frame, oemBytes, ommFrame, ommBytes, readOmm } from './lib/sds.mjs';
import * as sources from './lib/sources.mjs';
import { DAY, iso, ms, quantile, slice } from './lib/windows.mjs';

frozen();
const modules = modulesRoot();
const b = await openBaselines(modules);
const REPEATS = 7;
const cases = [
  { regime: 'LEO (ISS)', object: sources.iss()[0] },
  { regime: 'MEO (GPS)', object: sources.gnss({ perConstellation: 1, days: 4 }).find((o) => o.name.startsWith('G')) },
  { regime: 'GEO (BeiDou-2 GEO)', object: sources.mgex({ klass: 'geo', ...sources.MGEX_A4, days: 4 })[0] },
];
const out = [];
for (const { regime, object } of cases) {
  const start = object.t[0];
  const lines = slice(object, start, start + 2 * DAY);
  const fit = (extra) => oemBytes({ block: { frame: object.frame === 'EME2000' ? 'EME2000' : 'GCRF', object: { name: object.name, norad: object.norad }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch, ...extra } });
  const xpFit = await b.xp.call('fit', [frame('ephemeris', 'OEM', fit({ useableStart: lines[0].epoch, useableStop: iso(start + DAY) }))]);
  const sgFit = await b.gem.call('fit_elements', [frame('ephemeris', 'OEM', fit({})), b.erm.frame('options', 'fitOptions', { from: iso(start), to: iso(start + DAY), epoch: 'first', fitBstar: true, closure: false })]);
  const grid = oemBytes({ block: { frame: object.frame === 'EME2000' ? 'EME2000' : 'GCRF', object: { name: object.name, norad: object.norad }, lines: Array.from({ length: 5761 }, (_, i) => ({ epoch: iso(start + i * 60000), r: [0, 0, 0], v: [0, 0, 0] })), start: iso(start), stop: iso(start + 4 * DAY) } });
  for (const [theory, payload] of [['SGP4', sgFit.elements], ['SGP4-XP', xpFit.elements]]) {
    const times = [];
    for (let i = 0; i < REPEATS; i += 1) {
      const t0 = performance.now();
      await b.xp.call('propagate', [ommFrame('omm', payload), frame('grid', 'OEM', grid)]);
      times.push(((performance.now() - t0) * 1000) / 5761);
    }
    out.push({ regime, theory, usPerState: quantile(times, 0.5), usPerStateMin: Math.min(...times), states: 5761, repeats: REPEATS, elementBytes: ommBytes({ theory: theory === 'SGP4' ? 'SGP4' : 'SGP4XP', ...(() => { const o = readOmm(payload); return { epoch: o.EPOCH, meanMotion: o.MEAN_MOTION, eccentricity: o.ECCENTRICITY, inclination: o.INCLINATION, raan: o.RA_OF_ASC_NODE, argPerigee: o.ARG_OF_PERICENTER, meanAnomaly: o.MEAN_ANOMALY, norad: object.norad, bstar: o.BSTAR, agom: o.MEAN_MOTION_DDOT }; })() }).length, parameters: theory === 'SGP4' ? 7 : 8 });
  }
}
write(path.join(results, 'bench.json'), { note: 'microseconds per propagated state: one propagator/sgp4-xp propagate call over 5761 states (four days, 60 s), median of repeats; includes the harness call overhead and output decoding', modules: b.provenance, rows: out });
console.log(JSON.stringify(out.map((r) => [r.regime, r.theory, r.usPerState.toFixed(1), r.elementBytes])));
await b.close();
process.exit(0);
