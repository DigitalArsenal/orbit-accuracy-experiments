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

// The SDN-AP paper's held-out model (its section 12.3): what the page cannot
// run in the browser, run here by the modules it serves, on the truth and
// seeds it serves (dist/), so page and build read the same bytes.
//  - SGP4: analysis/gp-error-model `fit_elements` on the 24 h of LAGEOS-1's
//    ILRS orbit before each epoch (the page propagates the set with
//    propagator/sdn-ap, which reads SGP4 sets).
//  - SGP4 envelope: gp-error-model `object_covariance`, the population
//    covariance of SGP4 element sets in the set's regime at its age, on the
//    set above.
//  - FFM envelope: propagator/ffm-v1 (the binary the page runs) from the
//    precise state at the epoch, the V1 forces E-f, with white acceleration
//    process noise fitted on the other laser-ranged MEO spheres (FFM_FIT).
//  - SDN-AP and SGP4-XP envelopes: propagator/sdn-ap's own propagated
//    covariance (sdnap_covariance_at) of the set its `fit` returns, the same
//    fit the page makes, which carries the epoch covariance; the module's
//    measured realism on LAGEOS-1 (its test/results/covariance-realism-*.json)
//    goes with them.
//  - The paper's day medians: the 12.3 table's row for laser-ranged MEO
//    satellites, read from the paper itself.
// Envelope values: the 1σ and 3σ of the predicted position, √trace of the
// position block (km): the root-mean-square distance the covariance predicts.
export const SDNAP_ROW = 'MEO, laser-ranged (LAGEOS, Etalon, LARES 2)';
export const SDNAP_STEP_MIN = 30;
export const FFM_FIT = ['lageos2', 'etalon1', 'etalon2'];
export const FFM_NOISE_INTERVAL_S = 60;
const OMM_TYPE = { schemaName: 'OMM.fbs', fileIdentifier: '$OMM', rootTypeName: 'OMM', wireFormat: 'flatbuffer' };
const REALISM_SET = 'lageos1';  // the module's LAGEOS-1 windows (2025), none of them the page's

/** The 12.3 table row for the named regime: { row, days: [{ day, km }] }. */
export function sdnApPaperRow(markdown, row = SDNAP_ROW) {
  const section = markdown.split(/^### /m).find((s) => s.startsWith('12.3 '));
  if (!section) throw new Error('sdn-ap paper: no section 12.3');
  const line = section.split('\n').find((l) => l.startsWith(`| ${row} |`));
  if (!line) throw new Error(`sdn-ap paper 12.3: no row "${row}"`);
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  const days = cells.slice(-3).map((c, i) => ({ day: i + 1, km: Number(c) }));
  if (days.some((d) => !Number.isFinite(d.km))) throw new Error(`sdn-ap paper 12.3: row "${row}" has no day columns`);
  return { row, windows: cells[2], days };
}

// `modules`: a modules checkout whose analysis/gp-error-model has the
// population covariance (SDN_AP_MODULES; the pinned SDN-AP commit or later).
export async function buildSdnAp({ dist, modules, write, own, credits, paperFile }) {
  const { createBrowserModuleHarness } = await import('space-data-module-sdk/host/browser-module');
  const { PRW_TYPE, executionFrame } = await import('../harness/prw.mjs');
  const P = await import('spacedatastandards.org/lib/js/PRW/main.js');
  const flatbuffers = await import('flatbuffers');
  const codec = await import('./src/models/sdn-ap/codec.js');
  const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
  const served = async (relative) => {
    const dir = path.join(dist, 'modules', relative);
    const h = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dir, 'module.wasm')), manifest: JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8')), surface: 'direct' });
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8'));
    return { manifest, destroy: () => h.destroy(), async invoke(methodId, inputs) {
      const r = await h.invoke({ methodId, inputs });
      if (r.statusCode !== 0) throw new Error(`${relative} ${methodId}: ${r.errorCode ?? r.statusCode}: ${r.errorMessage}`);
      return r;
    } };
  };
  const readDist = (relative) => fs.readFileSync(path.join(dist, relative));
  const truth = JSON.parse(readDist('data/truth/lageos1.json'));
  const seeds = JSON.parse(readDist('data/v1/seeds.json'));
  const v1 = JSON.parse(readDist('data/v1/config.json'));
  const metrics = JSON.parse(readDist('data/v1/metrics.json'));
  const paper = sdnApPaperRow(fs.readFileSync(paperFile, 'utf8'));
  // gp-error-model is not served: the build runs it from the modules checkout.
  const { loadModule, gitState } = await import('../harness/modules.mjs');
  const [ap, ffm, gem] = await Promise.all([served('propagator/sdn-ap'), served('propagator/ffm-v1'), loadModule(modules, 'analysis/gp-error-model')]);
  gem.manifest = JSON.parse(fs.readFileSync(path.join(modules, 'analysis/gp-error-model/plugin-manifest.json'), 'utf8'));
  // The served SDN-AP bytes through the modules checkout's own test helper,
  // for the raw exports (sdnap_covariance_at, sdnap_frame_to_uvw).
  process.env.SDNAP_WASM = path.join(dist, 'modules/propagator/sdn-ap/module.wasm');
  const raw = await (await import(pathToFileURL(path.join(modules, 'propagator/sdn-ap/test/lib/module.mjs')))).openModule({ threads: 0 });
  const f64 = (p, n) => new Float64Array(raw.harness.memory.buffer, p, n);
  // A set's covariance at hours after the page's epoch: per time the position
  // 1σ (√trace, km) and the position covariance in the module's own radial,
  // in-track and cross-track axes of its state (B P Bᵀ, sdnap_frame_to_uvw on
  // the columns and then the rows), km².
  const moduleCovariance = (omm, e0, sampleHours) => {
    const o = codec.readOmm(omm);
    const setMs = Date.parse(/Z$/.test(o.EPOCH) ? o.EPOCH : `${o.EPOCH}Z`);
    const n = sampleHours.length;
    const pO = raw.x.sdnap_alloc(omm.length), pT = raw.x.sdnap_alloc(8 * n), pC = raw.x.sdnap_alloc(8 * 42 * n), pV = raw.x.sdnap_alloc(8 * 12);
    new Uint8Array(raw.harness.memory.buffer, pO, omm.length).set(omm);
    f64(pT, n).set(sampleHours.map((h) => (e0 + h * HOUR - setMs) / 60000));
    const status = raw.x.sdnap_covariance_at(pO, omm.length, pT, n, pC);
    if (status !== 0) throw new Error(`sdn-ap model: sdnap_covariance_at refused the ${o.MEAN_ELEMENT_THEORY} set (${status})`);
    const out = f64(pC, 42 * n).slice();
    const uvw = (state, vec) => {
      f64(pV, 9).set([...state.slice(0, 6), ...vec]);
      raw.x.sdnap_frame_to_uvw(pV, pV + 24, pV + 48, pV + 72);
      return Array.from(f64(pV + 72, 3));
    };
    const rows = sampleHours.map((_, k) => {
      const block = out.subarray(42 * k, 42 * k + 42), state = block.subarray(0, 6), P = block.subarray(6);
      const col = (j) => [P[j], P[6 + j], P[12 + j]];
      const BP = [0, 1, 2].map((j) => uvw(state, col(j)));        // B times column j of P (position block)
      const BPBt = [0, 1, 2].map((i) => uvw(state, BP.map((c) => c[i])));  // B times row i of B P
      return { sigma: Math.sqrt(P[0] + P[7] + P[14]), rtn: BPBt.flat() };
    });
    for (const p of [pO, pT, pC, pV]) raw.x.sdnap_free(p);
    return rows;
  };
  const servedSha = sha256(fs.readFileSync(process.env.SDNAP_WASM));
  const realism = Object.fromEntries(['sdnap', 'sgp4xp'].map((k) => {
    const file = path.join(modules, `propagator/sdn-ap/test/results/covariance-realism-${k}.json`);
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    const days = r.realism?.[REALISM_SET]?.all;
    if (!days) throw new Error(`sdn-ap model: ${file} has no ${REALISM_SET} realism`);
    if (r.moduleSha256 !== servedSha) throw new Error(`sdn-ap model: ${file} measures module ${r.moduleSha256.slice(0, 12)}, the site serves ${servedSha.slice(0, 12)}`);
    return [k, { set: REALISM_SET, moduleSha256: r.moduleSha256, days: [1, 2, 3].map((d) => ({ day: d, windows: days[d].windows, samples: days[d].samples, meanD2Over3: days[d].meanD2Over3, coverage95: days[d].coverage95 })) }];
  }));
  const kernel = { portId: 'kernel', typeRef: PRW_TYPE, payload: readDist('data/kernel/de440-2026.prw') };
  const eop = { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: readDist('data/eop/eop-v1.prw') };
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const object = { norad: truth.norad, objectId: '1976-039A', name: 'LAGEOS-1' };
  const iso = (ms) => new Date(ms).toISOString();
  const pick = (arr, ids) => ids.flatMap((i) => arr.slice(3 * i, 3 * i + 3));
  // gp-error-model reads the size-prefixed $OMM; propagator/sdn-ap answers
  // with the plain form. Re-framed through the checkout's own SDS binding.
  const sds = path.join(modules, 'node_modules');
  const OMMs = await import(pathToFileURL(path.join(sds, 'spacedatastandards.org/lib/js/OMM/main.js')));
  const fbs = await import(pathToFileURL(path.join(sds, 'flatbuffers/mjs/flatbuffers.js')));
  const sizePrefixed = (bytes) => {
    if (new TextDecoder().decode(bytes.subarray(8, 12)) === '$OMM') return bytes;
    const builder = new fbs.Builder(1024);
    OMMs.OMM.finishSizePrefixedOMMBuffer(builder, OMMs.OMM.getRootAsOMM(new fbs.ByteBuffer(bytes)).unpack().pack(builder));
    return builder.asUint8Array().slice();
  };
  const sigmaKm = (cov, n) => Math.sqrt(cov[0] + cov[n + 1] + cov[2 * n + 2]) / 1000;  // m² in, km out
  const band = (hours, sigmas) => ({ sigma1: hours.map((h, i) => [h, sigmas[i]]), sigma3: hours.map((h, i) => [h, 3 * sigmas[i]]) });
  const covered = seeds.filter((s) => s.object === 'lageos1' && s.seedUnixMs - DAY >= truth.epochsUnixMs[0] && s.seedUnixMs + 3 * DAY <= truth.epochsUnixMs.at(-1));
  const hours = Array.from({ length: (72 * 60) / SDNAP_STEP_MIN }, (_, k) => ((k + 1) * SDNAP_STEP_MIN) / 60);
  // FFM's propagated covariance: P₀ = 0 at the precise state (its error, at
  // centimeters, is below what the days after add) and white acceleration
  // noise of spectral density q on each RTN axis, whose size is fitted, not
  // assumed: on the V1 runs of the other laser-ranged MEO spheres (FFM_FIT),
  // P(t) = q·G(t), so the q at which the covariance predicts the mean squared
  // error, E|e|² = trace P, is the mean of |e|²/trace G over their samples.
  // Each sample's position block of P(t), 3×3 row-major, m².
  const ffmPosition = async (arc, seed, sampleHours, q) => {
    const e0 = seed.seedUnixMs, i0 = arc.epochsUnixMs.indexOf(e0);
    if (i0 < 0) throw new Error(`sdn-ap model: no ${arc.object} state at ${seed.seedUtc}`);
    const samples = sampleHours.map((h) => iso(e0 + h * HOUR).replace('Z', ''));
    const request = executionFrame({ epoch: iso(e0).replace('Z', ''), timeScale: 'UTC', position: arc.position.slice(3 * i0, 3 * i0 + 3), velocity: arc.velocity.slice(3 * i0, 3 * i0 + 3),
      samples, target: samples.at(-1), integrator: v1.integrator, forces: { ...v1.configurations['E-f'], ...seed.params }, kernel: true });
    const prw = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(request.payload)).unpack();
    prw.EXECUTION_REQUEST.INITIAL_COVARIANCE = Object.assign(new P.PRWStateMatrixT(), { DIMENSION: 6, VALUES: Array(36).fill(0) });
    prw.EXECUTION_REQUEST.PROCESS_NOISE = Object.assign(new P.PRWProcessNoiseT(), { MODEL: P.prwProcessNoiseModel.WHITE_ACCELERATION, AXES: P.prwProcessNoiseAxes.RADIAL_TRANSVERSE_NORMAL,
      SPECTRAL_DENSITY_M2_S3: [q, q, q], DISCRETIZATION_SECONDS: FFM_NOISE_INTERVAL_S });
    const b = new flatbuffers.Builder(1 << 16);
    P.PRW.finishSizePrefixedPRWBuffer(b, prw.pack(b));
    const response = await ffm.invoke('invoke', [{ ...request, payload: b.asUint8Array().slice() }, kernel, eop]);
    const result = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(response.outputs.find((o) => o.portId === 'response').payload))).unpack().EXECUTION_RESULT;
    if (result.SAMPLES.length !== samples.length || result.SAMPLES.some((x) => !x.COVARIANCE?.VALUES?.length)) throw new Error('sdn-ap model: propagator/ffm-v1 returned a sample without covariance');
    return result.SAMPLES.map((x) => { const n = x.COVARIANCE.DIMENSION, c = x.COVARIANCE.VALUES; return [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => c[i * n + j])); });
  };
  const ffmNoise = { psdM2s3: null, samples: 0, objects: FFM_FIT, intervalSeconds: FFM_NOISE_INTERVAL_S, initial: 'zero' };
  {
    let sum = 0;
    for (const name of FFM_FIT) {
      const arc = JSON.parse(readDist(`data/truth/${name}.json`));
      for (const seed of seeds.filter((s) => s.object === name)) {
        const rows = metrics.results.filter((r) => r.object === name && r.seedEpoch === seed.seedUtc && r.configuration === 'E-f' && Number.isFinite(r.errorM));
        if (!rows.length) continue;
        const traces = (await ffmPosition(arc, seed, rows.map((r) => r.hours), 1)).map((c) => c[0] + c[4] + c[8]);
        rows.forEach((r, k) => { sum += (r.errorM * r.errorM) / traces[k]; ffmNoise.samples += 1; });
      }
    }
    if (!ffmNoise.samples) throw new Error('sdn-ap model: no V1 rows to fit FFM’s process noise on');
    ffmNoise.psdM2s3 = sum / ffmNoise.samples;
  }
  const windows = [];
  for (const seed of covered) {
    const e0 = seed.seedUnixMs;
    const fitIds = truth.epochsUnixMs.map((t, i) => [t, i]).filter(([t]) => t > e0 - DAY && t <= e0).map(([, i]) => i);
    const states = [fitIds.map((i) => truth.epochsUnixMs[i]), pick(truth.position, fitIds), pick(truth.velocity, fitIds)];
    // SGP4, fitted by the error model to the 24 h before the epoch.
    const fit = await gem.invoke('fit_elements', [codec.frame('ephemeris', 'OEM', codec.oem(object, ...states, { sizePrefixed: true })),
      erm.frame('options', 'fitOptions', { from: iso(e0 - DAY), to: iso(e0), epoch: 'last', fitBstar: true, closure: false })]);
    const report = erm.decode(codec.outputsOf(fit, 'report')[0]).fits?.[0];
    if (!report?.converged) throw new Error(`sdn-ap model: SGP4 fit for ${seed.seedUtc} did not converge (${report?.error ?? report?.stop})`);
    const sgp4 = codec.outputsOf(fit, 'elements')[0];
    const population = async (omm) => {
      const o = codec.readOmm(omm);
      const setMs = Date.parse(/Z$/.test(o.EPOCH) ? o.EPOCH : `${o.EPOCH}Z`);
      const request = erm.frame('request', 'objects', { objects: hours.map((h, n) => ({ id: String(n), set: { norad: object.norad, epoch: o.EPOCH }, ageDays: (e0 + h * HOUR - setMs) / DAY })) });
      const out = erm.decode(codec.outputsOf(await gem.invoke('object_covariance', [{ portId: 'elements', payload: sizePrefixed(omm), typeRef: OMM_TYPE }, request]), 'covariance')[0]);
      const missing = out.objects.find((x) => !x.covarianceInertial);
      if (missing) throw new Error(`sdn-ap model: object_covariance ${missing.status} at ${hours[Number(missing.id)]} h`);
      return { regime: out.objects[0].regime, status: out.objects[0].status, ...band(hours, out.objects.map((x) => sigmaKm(x.covarianceInertial, 6))) };
    };
    const ffmBlocks = await ffmPosition(truth, seed, hours, ffmNoise.psdM2s3);
    const ffmEnvelope = { ...band(hours, ffmBlocks.map((c) => Math.sqrt(c[0] + c[4] + c[8]) / 1000)),
      // GCRF position covariance (km²) every hour, for the page's ellipsoids.
      position: hours.map((h, k) => [h, ffmBlocks[k].map((v) => v / 1e6)]).filter(([h]) => Number.isInteger(h)) };
    const envelopes = { sgp4: await population(sgp4), ffm: ffmEnvelope };
    for (const [key, theory] of [['sdnap', codec.THEORY.SDNAP], ['sgp4xp', codec.THEORY.SGP4XP]]) {
      const fitted = codec.outputsOf(await ap.invoke('fit', [codec.frame('ephemeris', 'OEM', codec.oem(object, ...states)), codec.frame('configuration', 'PCF', codec.pcf(theory))]), 'elements')[0];
      const rows = moduleCovariance(fitted, e0, hours);
      envelopes[key] = { ...band(hours, rows.map((r) => r.sigma)),
        // radial, in-track, cross-track position covariance (km²) every hour, for the page's ellipsoids
        rtn: hours.map((h, k) => [h, rows[k].rtn]).filter(([h]) => Number.isInteger(h)) };
    }
    windows.push({ seedUnixMs: e0, seedUtc: seed.seedUtc, sgp4: { omm: Buffer.from(sgp4).toString('base64'), epoch: report.epoch, fitRmsKm: report.rms?.rms3dKm ?? null }, envelopes });
  }
  await Promise.all([ap.destroy(), gem.destroy(), ffm.destroy(), raw.destroy?.()]);
  const label = own('MIT (this repository); results are analysed information', credits.join(' '), credits);
  write('data/sdn-ap/held-out.json', { object: object.name, stepMinutes: SDNAP_STEP_MIN, paper, ffmNoise, realism,
    modules: { 'propagator/sdn-ap': ap.manifest.version, 'analysis/gp-error-model': { version: gem.manifest.version, commit: gitState(modules).commit, wasmSha256: gem.provenance.wasmSha256 }, 'propagator/ffm-v1': ffm.manifest.version }, windows },
  'site/build-models.mjs buildSdnAp: SGP4 fits, the envelopes of each propagator, the SDN-AP paper’s 12.3 row', label);
  return { windows: windows.length };
}
