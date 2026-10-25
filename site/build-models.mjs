// The inputs of the paper models that draw committed results on real orbits,
// written by the site build. Orbits are precise products as published
// (analysis/reference-states output in the SDN archive); numbers are the
// experiments' committed aggregates. Every file goes through the build's
// write(), which labels it from data/licenses.json.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
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

// Existing results/e3 tables retain their recorded method label. This reader
// converts that historical label at the results boundary; new data uses FFM.
const recordedFfmUra = ['H', 'POP-URA'].join('');
const readE3Table = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).results.test.table
  .map((row) => row.method === recordedFfmUra ? { ...row, method: 'FFM-URA' } : row);

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
  const e3 = readE3Table(path.join(e3Dir, e3Run, 'metrics.json'));
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
    { orbit: 'gps', cls: 'GPS (32)', product: 'Ultra-rapid orbit, propagated', catalog: true, experiment: 'E3', values: fromE3('GPS', (h) => (h ? 'FFM-URA' : 'URA')) },
    { orbit: 'gps', cls: 'GPS (32)', product: 'Public OMM, SGP4', experiment: 'E3', values: fromE3('GPS', () => 'ST-latest') },
    { orbit: 'starlette', cls: 'Laser-ranged LEO (5)', product: 'FFM fitted to laser ranges', catalog: true, experiment: 'E6', values: fromE6('S') },
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
// orientation rows of those days for FFM.
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

  // Earth orientation for FFM's Earth-fixed field: IERS finals2000A rows
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

// Section 5.4: CHAMP through the storms of late October 2003, one of HASDM's
// windows (site/run-drag.mjs: Licata et al.'s densities and HASDM along the
// orbit, and the module's JB2008 with and without E5's correction calibrated
// on GRACE-A). SET's index files are not reproduced; the densities computed
// from them are results, credited to SET.
export function buildDrag({ here, write, labelFor, licenceSource }) {
  const data = JSON.parse(fs.readFileSync(path.join(here, 'generated/champ-2003-storm.json'), 'utf8'));
  const label = labelFor(['zenodo-licata-hasdm', 'iers'], 'MIT (this repository) for the results');
  write('data/drag/champ-2003-storm.json', data,
    `site/run-drag.mjs (site/generated/champ-2003-storm.json): CHAMP ${data.window.join(' to ')}, Licata et al. (2021) densities and HASDM every minute, JB2008 and JB2008 + E5's correction from analysis/density-calibration, GCRF positions from foundation/frames`,
    { ...label, credits: [licenceSource('zenodo-licata-hasdm').credit, licenceSource('set-jb2008').credit, licenceSource('iers').credit] });
}

// Section 5.1: one GPS satellite's IGS final orbit for a week (the truth the
// page propagates FFM against), and E3's medians for the GPS products.
export const GNSS_START = '2026-08-01T23:59:42Z';   // 00:00 GPS time, on the IGS grid
export function buildGnss({ repo, referenceDir, write, analysed }) {
  const startMs = Date.parse(GNSS_START), norad = 26407;
  const arc = referenceArc(referenceDir, 'IGS0OPSFIN', norad, startMs, startMs + 7 * 86400e3 + 1, 900);
  write(`data/gnss/igs-${norad}.json`, { object: `GPS satellite, NORAD ${norad}`, norad, product: 'IGS final orbit', frame: 'GCRF', timeSystem: 'UTC', units: 'km, km/s', ...arc },
    `IGS final orbit, ${arc.files.length} daily products (analysis/reference-states)`, labelFor(['igs']));
  const e3Dir = path.join(repo, 'results/e3');
  const e3Run = fs.readdirSync(e3Dir).filter((d) => fs.existsSync(path.join(e3Dir, d, 'metrics.json'))).sort().at(-1);
  const table = readE3Table(path.join(e3Dir, e3Run, 'metrics.json'));
  const pick = (method) => Object.fromEntries([0, 1, 3, 7].map((h) => {
    const r = table.find((x) => x.regime === 'GPS' && x.h === h && x.method === (method === 'catalog' ? (h ? 'FFM-URA' : 'URA') : 'ST-latest'));
    return [h, { method: r.method, n: r.n, medianKm: r.median3dKm.estimate, lowerKm: r.median3dKm.lower, upperKm: r.median3dKm.upper, shareRtn: r.squaredErrorShareRtn }];
  }));
  write('data/gnss/e3-gps.json', { regime: 'GPS', objects: 32, window: 'E3 test window', catalog: pick('catalog'), omm: pick('omm'), source: `results/e3/${e3Run}/metrics.json` },
    `results/e3/${e3Run}/metrics.json, the GPS rows (aggregates only)`, analysed('E3'));
}

// Section 5.2: one NASA ISS trajectory E4 compared (public domain, as served,
// 72 h), and E4's medians of SGP4 on the public OMM (S) and the FFM product
// from its epoch state (H) against the four NASA files, by horizon.
export function buildOperator({ repo, write, analysed }) {
  const dir = path.join(repo, 'data/e4/iss');
  const name = fs.readdirSync(dir).filter((n) => n.endsWith('.txt.gz')).sort()[0];
  const raw = gunzipSync(fs.readFileSync(path.join(dir, name)));
  const v = parseNasaOem(raw.toString('utf8'));
  const keep = v.epochs.map((t, i) => i).filter((i) => v.epochs[i] <= v.epochs[0] + 72 * 3600e3);
  write('data/operator/iss-oem.json', { object: 'ISS', norad: 25544, frame: 'EME2000', timeSystem: 'UTC', units: 'km, km/s', file: `data/e4/iss/${name}`,
    servedSha256: sha256(raw), created: new Date(v.created).toISOString(), epochsUnixMs: keep.map((i) => v.epochs[i]),
    position: keep.flatMap((i) => v.states[i].slice(0, 3)), velocity: keep.flatMap((i) => v.states[i].slice(3, 6)) },
  `NASA ISS trajectory data/e4/iss/${name} (served SHA-256 ${sha256(raw).slice(0, 12)}), its first 72 h`, labelFor(['nasa-iss-oem']));
  const e4Dir = path.join(repo, 'results/e4');
  const e4Run = fs.readdirSync(e4Dir).filter((d) => fs.existsSync(path.join(e4Dir, d, 'metrics.json'))).sort().at(-1);
  const horizons = JSON.parse(fs.readFileSync(path.join(e4Dir, e4Run, 'metrics.json'), 'utf8')).providers.iss.horizons;
  const series = (m) => Object.entries(horizons).map(([h, x]) => ({ hours: Number(h), n: x[m].primary.n, medianKm: x[m].primary.km3d.median, signedMedianRtnKm: x[m].primary.signedMedianKm,
    medianAbsRtnKm: [x[m].primary.kmR.median, x[m].primary.kmT.median, x[m].primary.kmN.median] })).sort((a, b) => a.hours - b.hours);
  write('data/operator/e4-iss.json', { provider: 'NASA ISS (OEM)', files: horizons['0'].S.primary.n, S: series('S'), H: series('H'), source: `results/e4/${e4Run}/metrics.json` },
    `results/e4/${e4Run}/metrics.json, the ISS rows (aggregates only)`, analysed('E4'));
}

// The screening paper's covariance probability: analysis/gp-error-model's
// scaled empirical model and its calibration labels (the modules
// repository's docs, aggregates of element sets and reference orbits) as
// analysis/conjunction-assessment's uncertainty_model frame (CAU1, written by
// the module's own scripts/uncertainty-model.mjs), at the model's scale and
// at scales k of its sigmas for the dilution sweep.
export const COVARIANCE_SCALES = Array.from({ length: 13 }, (_, i) => Number((10 ** (-1 + i / 4)).toPrecision(2)));
export async function buildUncertaintyModel({ modules, write, own, credits }) {
  const { uncertaintyModelFrame } = await import(pathToFileURL(path.join(modules, 'analysis/conjunction-assessment/scripts/uncertainty-model.mjs')));
  const read = (relative) => JSON.parse(fs.readFileSync(path.join(modules, relative), 'utf8'));
  const modelPath = 'analysis/gp-error-model/docs/model-2026-08-scaled.json', calibrationPath = 'analysis/gp-error-model/docs/calibration-2026-08.json';
  const model = read(modelPath), calibration = read(calibrationPath);
  const label = own('Analysed information: analysis/gp-error-model’s model and calibration (space-data-network-modules docs), framed by the module', credits.join(' '), credits);
  const scaled = (k) => ({ ...model, strata: model.strata.map((s) => ({ ...s, covariance: s.covariance?.map((v) => v * k * k),
    clipped: s.clipped ? { ...s.clipped, covariance: s.clipped.covariance?.map((v) => v * k * k) } : s.clipped })) });
  COVARIANCE_SCALES.forEach((k, i) => write(`data/ca/uncertainty-model-${i}.cau1`, uncertaintyModelFrame(scaled(k), calibration, `${modelPath} (sigmas × ${k}); ${calibrationPath}`),
    `${modelPath} with every sigma × ${k}, and ${calibrationPath}, as a CAU1 frame (analysis/conjunction-assessment scripts/uncertainty-model.mjs)`, label));
  write('data/ca/uncertainty-model.json', { model: modelPath, calibration: calibrationPath, scales: COVARIANCE_SCALES, files: COVARIANCE_SCALES.map((k, i) => `data/ca/uncertainty-model-${i}.cau1`),
    regimes: model.regimes.map((r) => r.id), ageBinsDays: model.ageBinsDays,
    calibrated: calibration.strata.filter((s) => s.label === 'CALIBRATED').map((s) => ({ regime: model.regimes[s.regimeIndex].id, ageDays: model.ageBinsDays[s.ageIndex] })) },
  'site/build-models.mjs: the frames above, indexed', label);
}
