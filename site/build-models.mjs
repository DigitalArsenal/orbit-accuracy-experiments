// The inputs of the paper models that draw committed results on real orbits,
// written by the site build. Orbits are precise products as published
// (analysis/reference-states output in the SDN archive); numbers are the
// experiments' committed aggregates. Every file goes through the build's
// write(), which labels it from data/licenses.json.
import fs from 'node:fs';
import path from 'node:path';
import { decodeOemStream } from '../harness/records.mjs';
import { ReferenceIndex } from '../harness/reference.mjs';
import { labelFor } from '../harness/data-licenses.mjs';

const MIN = 60e3;

// One object's precise states over [fromMs, toMs] (GCRF, UTC, km and km/s),
// at least `stepSeconds` apart, from the product family `prefix`.
export function referenceArc(referenceDir, prefix, norad, fromMs, toMs, stepSeconds = 60) {
  const index = new ReferenceIndex(referenceDir, prefix);
  const lines = new Map();
  for (const frame of index.frames(norad, fromMs, toMs)) {
    for (const oem of decodeOemStream(new Uint8Array(frame.payload))) {
      for (const block of oem.EPHEMERIS_DATA_BLOCK ?? []) {
        if (block.REFERENCE_FRAME?.NAME !== 'GCRF') throw new Error(`${prefix} ${norad}: frame ${block.REFERENCE_FRAME?.NAME}, not GCRF`);
        for (const l of block.EPHEMERIS_DATA_LINES ?? []) {
          const ms = Date.parse(l.EPOCH.endsWith('Z') ? l.EPOCH : `${l.EPOCH}Z`);
          if (ms >= fromMs && ms <= toMs) lines.set(ms, [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT]);
        }
      }
    }
  }
  const out = { epochsUnixMs: [], position: [], velocity: [], files: Object.keys(index.read) };
  let last = -Infinity;
  for (const ms of [...lines.keys()].sort((a, b) => a - b)) {
    if (ms - last < stepSeconds * 1000) continue;
    last = ms;
    const s = lines.get(ms);
    out.epochsUnixMs.push(ms);
    out.position.push(s[0], s[1], s[2]);
    out.velocity.push(s[3], s[4], s[5]);
  }
  if (out.epochsUnixMs.length < 3) throw new Error(`${prefix} ${norad}: no states in ${new Date(fromMs).toISOString()}..${new Date(toMs).toISOString()}`);
  return out;
}

// Section 11: the median 3D error of each product by object class and age,
// drawn on one real orbit per class.
export const ACCURACY_EPOCH = '2026-08-02T06:00:00Z';
const HORIZONS = [0, 1, 3, 7];

export function buildMeasuredAccuracy({ repo, referenceDir, write, analysed }) {
  const epochMs = Date.parse(ACCURACY_EPOCH);
  const orbits = [
    { id: 'gps', name: 'GPS satellite, NORAD 26407', norad: 26407, prefix: 'IGS0OPSFIN', minutes: 720, step: 900, sources: ['igs'], product: 'IGS final orbit' },
    { id: 'lageos1', name: 'LAGEOS-1', norad: 8820, prefix: 'ilrsa.orb.lageos1', minutes: 230, step: 120, sources: ['ilrs'], product: 'ILRS combined orbit' },
    { id: 'starlette', name: 'Starlette', norad: 7646, prefix: 'nsgf.orb.starlette', minutes: 105, step: 60, sources: ['ilrs-nsgf'], product: 'ILRS (NERC SGF) orbit' },
    { id: 'sentinel-1c', name: 'Sentinel-1C', norad: 62261, prefix: 'S1C_OPER_AUX_POEORB', minutes: 100, step: 60, sources: ['copernicus-sentinel'], product: 'Copernicus precise orbit (AUX_POEORB)' },
  ];
  for (const o of orbits) {
    const arc = referenceArc(referenceDir, o.prefix, o.norad, epochMs, epochMs + o.minutes * MIN, o.step);
    write(`data/accuracy/orbit-${o.id}.json`, { object: o.name, norad: o.norad, product: o.product, frame: 'GCRF', timeSystem: 'UTC', units: 'km, km/s', ...arc },
      `${o.product}, ${arc.files.join(', ')} (analysis/reference-states)`, labelFor(o.sources));
  }

  // E3's test table and E6's laser-ranged fits, as the paper's section 11 reads them.
  const e3Dir = path.join(repo, 'results/e3');
  const e3Run = fs.readdirSync(e3Dir).filter((d) => fs.existsSync(path.join(e3Dir, d, 'metrics.json'))).sort().at(-1);
  const e3 = JSON.parse(fs.readFileSync(path.join(e3Dir, e3Run, 'metrics.json'), 'utf8')).results.test.table;
  const e6 = JSON.parse(fs.readFileSync(path.join(repo, 'results/e6/test/metrics.json'), 'utf8')).groups.slr.variants;
  const fromE3 = (regime, methodAt) => Object.fromEntries(HORIZONS.map((h) => {
    const r = e3.find((x) => x.regime === regime && x.h === h && x.method === methodAt(h));
    if (!r) throw new Error(`results/e3 ${e3Run}: no ${regime} ${methodAt(h)} row at ${h} d`);
    return [h, { method: r.method, n: r.n, objects: r.objects, medianKm: r.median3dKm.estimate, lowerKm: r.median3dKm.lower, upperKm: r.median3dKm.upper, shareRtn: r.squaredErrorShareRtn }];
  }));
  const fromE6 = (variant) => Object.fromEntries(HORIZONS.map((h) => {
    const r = e6[variant][String(h)];
    const sq = r.medianAbsRtnKm.map((x) => x * x), total = sq.reduce((a, b) => a + b, 0);
    return [h, { method: variant, n: r.n, medianKm: r.median3dKm.estimate, lowerKm: r.median3dKm.lower, upperKm: r.median3dKm.upper, shareRtn: sq.map((x) => x / total) }];
  }));
  const rows = [
    { orbit: 'gps', cls: 'GPS (32)', product: 'Ultra-rapid orbit, propagated', catalog: true, experiment: 'E3', values: fromE3('GPS', (h) => (h ? 'HPOP-URA' : 'URA')) },
    { orbit: 'gps', cls: 'GPS (32)', product: 'Public OMM, SGP4', experiment: 'E3', values: fromE3('GPS', () => 'ST-latest') },
    { orbit: 'starlette', cls: 'Laser-ranged LEO (5)', product: 'HPOP fitted to laser ranges', catalog: true, experiment: 'E6', values: fromE6('S') },
    { orbit: 'starlette', cls: 'Laser-ranged LEO (5)', product: 'Public OMM, SGP4', experiment: 'E6', values: fromE6('B') },
    { orbit: null, cls: 'Laser-ranged LEO, 800–1,500 km (5)', product: 'Public OMM, SGP4', experiment: 'E3', values: fromE3('SLR LEO 800-1500 km', () => 'ST-latest') },
    { orbit: 'lageos1', cls: 'Laser-ranged MEO (5)', product: 'Public OMM, SGP4', experiment: 'E3', values: fromE3('SLR MEO', () => 'ST-latest') },
    { orbit: 'sentinel-1c', cls: 'LEO, 400–800 km (6)', product: 'Public OMM, SGP4', experiment: 'E3', values: fromE3('LEO 400-800 km', () => 'ST-latest') },
  ];
  write('data/accuracy/measured.json', { epoch: ACCURACY_EPOCH, horizonsDays: HORIZONS, rows, orbits: orbits.map(({ id, name, norad, product }) => ({ id, name, norad, product })),
    sources: { E3: `results/e3/${e3Run}/metrics.json (test window)`, E6: 'results/e6/test/metrics.json (variants S and B)' } },
  `results/e3/${e3Run}/metrics.json and results/e6/test/metrics.json, aggregates only`, analysed('E3', 'E6'));
}
