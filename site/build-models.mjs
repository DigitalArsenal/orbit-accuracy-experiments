// The inputs of the paper models that draw committed results on real orbits,
// written by the site build. Orbits are precise products as published
// (analysis/reference-states output in the SDN archive); numbers are the
// experiments' committed aggregates. Every file goes through the build's
// write(), which labels it from data/licenses.json.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeOemStream } from '../harness/records.mjs';
import { ReferenceIndex } from '../harness/reference.mjs';
import { labelFor } from '../harness/data-licenses.mjs';

const MIN = 60e3;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

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

// Section 5.5: the ISS reboost of 25 September 2026. NASA's trajectory before
// the burn (the plan) and the first one after it, as served (public domain),
// cut to [TIG − 24 h, TIG + 48 h] (compare_ephemerides gives the same
// executed change from the cut versions as from the whole files); the
// detector's events on the public element sets (site/run-maneuver.mjs:
// results only, the element sets are not reproduced); and the Earth
// orientation rows of those days for HPOP.
const ISS_FILES = ['2026-09-24', '2026-09-25'];

// A NASA ISS OEM as served: its creation time, its trajectory event summary
// (TIG as GMT day of year) and its states (UTC, EME2000, km, km/s).
export function parseNasaOem(text) {
  const created = Date.parse(`${/CREATION_DATE\s*=\s*(\S+)/.exec(text)[1].replace(/Z$/, '')}Z`);
  const year = new Date(created).getUTCFullYear();
  const events = [], epochs = [], states = [];
  const row = /^COMMENT\s+(\S.*?)\s+(\d{3}):(\d\d):(\d\d):(\d\d(?:\.\d+)?)\s+(?:\d+\s+)?([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$/;
  for (const line of text.split(/\r?\n/)) {
    const m = row.exec(line);
    if (m) {
      const [, name, doy, hh, mm, ss, dv, ha, hp] = m;
      events.push({ name: name.trim(), tigMs: Date.UTC(year, 0, Number(doy), Number(hh), Number(mm)) + Number(ss) * 1000, dvMps: Number(dv), haKm: Number(ha), hpKm: Number(hp) });
      continue;
    }
    const p = line.trim().split(/\s+/);
    if (p.length === 7 && /^\d{4}-\d\d-\d\dT/.test(p[0])) { epochs.push(Date.parse(`${p[0].replace(/Z$/, '')}Z`)); states.push(p.slice(1).map(Number)); }
  }
  return { created, events, epochs, states };
}

export async function buildManeuver({ here, repo, write, loadEopParser, finalsRecords, eopFrame, own, spaceTrackCredit, servedWasmSha256 }) {
  const versions = ISS_FILES.map((day) => {
    const raw = gunzipSync(fs.readFileSync(path.join(here, 'src/data/iss', `${day}--ISS.OEM_J2K_EPH.txt.gz`)));
    return { day, url: `https://nasa-public-data.s3.amazonaws.com/iss-coords/${day}/ISS_OEM/ISS.OEM_J2K_EPH.txt`, servedSha256: sha256(raw), ...parseNasaOem(raw.toString('utf8')) };
  });
  const [plan, post] = versions;
  const burn = plan.events.find((e) => e.dvMps > 0 && e.tigMs > plan.created && e.tigMs < post.created);
  if (!burn) throw new Error('no planned burn between the two NASA versions');
  const lo = burn.tigMs - 24 * 3600e3, hi = burn.tigMs + 48 * 3600e3;
  write('data/maneuver/iss-versions.json', {
    object: { norad: 25544, objectId: '1998-067A', name: 'ISS' }, frame: 'EME2000', timeSystem: 'UTC', units: 'km, km/s',
    burn: { name: burn.name, tig: new Date(burn.tigMs).toISOString(), dvMps: burn.dvMps, haKm: burn.haKm, hpKm: burn.hpKm, planIssued: new Date(plan.created).toISOString() },
    versions: versions.map((v) => {
      const keep = v.epochs.map((t, i) => i).filter((i) => v.epochs[i] >= lo && v.epochs[i] <= hi);
      return { url: v.url, servedSha256: v.servedSha256, created: new Date(v.created).toISOString(), start: new Date(v.epochs[0]).toISOString(), stop: new Date(v.epochs.at(-1)).toISOString(),
        events: v.events.map((e) => ({ ...e, tig: new Date(e.tigMs).toISOString(), tigMs: undefined })),
        epochsUnixMs: keep.map((i) => v.epochs[i]), position: keep.flatMap((i) => v.states[i].slice(0, 3)), velocity: keep.flatMap((i) => v.states[i].slice(3, 6)) };
    }),
  }, `NASA ISS trajectory ${ISS_FILES.join(' and ')} (served SHA-256 ${versions.map((v) => v.servedSha256.slice(0, 12)).join(', ')}), states in [TIG − 24 h, TIG + 48 h]`, labelFor(['nasa-iss-oem']));

  // The recorded detection must be of the detector binary this site serves.
  const detection = JSON.parse(fs.readFileSync(path.join(here, 'generated/iss-detection.json'), 'utf8'));
  const recorded = detection.modules.find((m) => m.path === 'analysis/maneuver-detection')?.wasmSha256;
  if (recorded !== servedWasmSha256('analysis/maneuver-detection')) {
    throw new Error(`site/generated/iss-detection.json is for analysis/maneuver-detection ${recorded?.slice(0, 12)}; this build serves ${servedWasmSha256('analysis/maneuver-detection')?.slice(0, 12)}. Run node site/run-maneuver.mjs first.`);
  }
  write('data/maneuver/iss-detection.json', detection, 'site/run-maneuver.mjs (site/generated/iss-detection.json): the detector’s events on the public element sets',
    own('MIT (this repository); detections are analysed information; the element sets are not reproduced', spaceTrackCredit));

  // Earth orientation for HPOP's Earth-fixed field: IERS finals2000A rows
  // (data/e1, as committed) for the days of the burn.
  const parser = await loadEopParser();
  try {
    const finals = await finalsRecords(parser, gunzipSync(fs.readFileSync(path.join(repo, 'data/e1/finals2000A.all.gz'))));
    const mjd = (ms) => Math.floor(ms / 86400000) + 40587;
    write('data/eop/eop-2026-09.prw', Buffer.from(eopFrame(finals.records, mjd(lo) - 1, mjd(hi) + 1).payload),
      `IERS finals2000A rows MJD ${mjd(lo) - 1}..${mjd(hi) + 1} (data/e1/finals2000A.all.gz) through data-source/eop-parser, as a PRW EARTH_ORIENTATION frame`, labelFor(['iers']));
  } finally {
    await parser.destroy();
  }
}
