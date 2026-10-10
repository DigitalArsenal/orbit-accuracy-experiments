// GMAT R2022a truth ephemerides for E12 (the physics-match gauntlet).
//
// The sibling of orekit-truth.mjs: the same call and return shape, so the two
// reference engines are interchangeable. NASA GMAT (GSFC, Apache-2.0) is the
// engine for synthetic ephemerides with known physics, including models
// propagator/hpop lacks (MSISE-90, JGM-2/JGM-3, GMAT's SRP and shadow), and
// GMAT_DEFAULTS below is the whole-stack "GMAT out of the box" hypothesis.
//
//   const { cases, provenance } = await gmatTruth(cases, { workDir });
//   case in:    { id, epoch (ISO UTC), state [x,y,z,vx,vy,vz] (GCRF, m, m/s), samples [ISO UTC, ascending],
//                 forces: { gravity JGM2|JGM3|EGM96, degree, order?, thirdBodies NONE|SUN_MOON|SUN_MOON_PLANETS
//                   (Venus, Mars, Jupiter), relativity bool, srp NONE|SPHERICAL + agom (Cr*A/m: area 1 m^2,
//                   mass 1 kg, Cr = agom), atmosphere NONE|MSISE90|JACCHIA_ROBERTS|EXPONENTIAL + b (Cd*A/m likewise),
//                   spaceWeather CONSTANT (F10.7 = F10.7a = 150, Kp 3 = Ap 15) | FILE,
//                   constants HPOP (default) | GMAT },
//                 integrator: { tolerance, maxStep, method? PrinceDormand78 (default) | RungeKutta89 } }
//   cases out:  [{ id, samples: [{ epoch, state }], gmatVersion, notes, icrfDriftM }]  (GCRF, m and m/s; epochs as requested)
//   provenance: { gmat: {path, buildDate}, gmatVersion, data: {file: sha256}, scripts: {id: sha256}, startupFiles, casesSha256, ... }
// Environment: GMAT_TRUTH_PROCESSES (default 2, at most 4 concurrent GmatConsole runs, all under `nice -n 10`).
// Options: gmat (GmatConsole path), kernel (DE440s; default config.json's), eopFinals (default config.json's),
// cssiFile (CSSI space weather for FILE; default GMAT's shipped one, observed to 2022-10-24, after which GMAT
// reads its Schatten prediction), concurrency.
//
// Conventions (the template is propagator/hpop tests/fixtures/gmat/make-gmat-reference.mjs; its header has the why):
// - Axes. GMAT integrates in MJ2000Eq and builds the Earth-fixed field with IAU 1976/1980 (FK5), no nutation offsets.
//   The initial state goes in as EarthICRF (field geometry right at the epoch) and every sample is read in MJ2000Eq
//   and rotated to GCRF by the one fixed rotation GMAT used at the epoch (from the epoch state in both axes).
//   Its own ICRF output drifts from that by ~0.13 mas/day; the largest gap is returned per case (icrfDriftM).
// - Earth orientation: pole and UT1-UTC from the finals2000A file HPOP is given, written as an IERS C04 file
//   (GMAT's shipped one ends 2023-04-24); celestial pole offsets and LOD are not applied by GMAT R2022a.
// - Epochs. UTC Gregorian to the millisecond in; sample states at the requested instants by ElapsedSecs (leap seconds
//   inside a case are refused). GMAT's double MJD limits the reported time to ~0.15 us (1 mm in LEO).
// - Sun/Moon/planets from the DE440s SPK (planets by their system barycentres, NAIF 2, 4, 5, as HPOP reads them).
// - constants HPOP: Earth GM 398600.4415 and radius 6378.137 km (WGS84 flattening with drag), nutation every call, Sun
//   and Moon GM and Sun radius 695 700 km as the template, planet GMs as HPOP, SRP 1361 W/m^2 at 149 597 870.7 km.
//   constants GMAT: all of those left at GMAT's own (SRP 1367 at 149 597 870.691, flattening 0.0033527, DE405).
// - The macOS R2022a build has no MSISE86 or NRLMSISE-00 plugin (both are proprietary, not shipped): refused.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { repoRoot } from '../../../harness/provenance.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const GMAT = '/Applications/GMAT/bin/GmatConsole';
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha256Text = (text) => crypto.createHash('sha256').update(text).digest('hex');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const f = (v) => v.toPrecision(17);
const msOf = (iso) => { const t = Date.parse(/[zZ]$/.test(iso) ? iso : `${iso}Z`); if (!Number.isFinite(t)) throw new Error(`not an ISO UTC instant: ${iso}`); return t; };
const gregorian = (ms) => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${d.toISOString().slice(11, 23)}`; };
const slug = (id) => String(id).replace(/[^\w.-]+/g, '_');

const COF = { JGM2: ['JGM2.cof', 70], JGM3: ['JGM3.cof', 70], EGM96: ['EGM96.cof', 360] };
const DRAG = { MSISE90: 'MSISE90', JACCHIA_ROBERTS: 'JacchiaRoberts', EXPONENTIAL: 'Exponential' };
// Venus, Mars, Jupiter by system barycentre (DE440s has no 499/599), GM as propagator/hpop's ephemeris table.
const PLANETS = [['Venus', 2, 324858.592], ['Mars', 4, 42828.375816], ['Jupiter', 5, 126712764.1]];
// Sun and Moon GM from the DE440 header (the template's), km^3/s^2.
const AU_KM = 149597870.7, AU3_DAY2 = AU_KM ** 3 / 86400 ** 2;
const GM_SUN = 2.9591220828411951e-04 * AU3_DAY2, GM_MOON = 8.9970116036316091e-10 * AU3_DAY2 / (1 + 81.3005682214972154);

// GMAT R2022a's out-of-the-box resources: `Create ForceModel`, `Create Propagator`, `Create Spacecraft` with no
// settings, written by GMAT itself (the libSaveCommand plugin's Save command), the body constants measured from
// OrbitPeriod of test orbits and the rest from GMAT's help (Propagator, CelestialBody, SpacecraftEpoch).
export const GMAT_DEFAULTS = Object.freeze({
  source: 'GMAT R2022a (GmatConsole, build Jan 11 2023), 2026-10-10. Force model, propagator and spacecraft: `Create` of each with no field set, then GMAT\'s own Save command (libSaveCommand plugin) wrote the resolved fields; drag and SRP defaults from the same Save after `Drag.AtmosphereModel = ...` / `SRP = On`. Body constants measured: Earth/Sun/Luna GM by solving OrbitPeriod of test orbits, Earth radius by Earth.Altitude of a point on the equator. Earth orientation, nutation interval, shadow and weather precedence from GMAT\'s help (CelestialBody, Propagator); startup-file paths from bin/gmat_startup_file.txt. Not measured: Earth flattening (help and the xval template give 0.0033527).',
  forceModel: {
    centralBody: 'Earth',
    gravity: { body: 'Earth', model: 'JGM2', file: 'JGM2.cof', degree: 4, order: 4, stmLimit: 100, tideModel: 'None' },
    pointMasses: [], drag: 'None', srp: 'Off', relativity: 'Off', errorControl: 'RSSStep',
    dragWhenOn: { atmosphereModel: 'JacchiaRoberts (when chosen)', historicWeatherSource: 'ConstantFluxAndGeoMag', predictedWeatherSource: 'ConstantFluxAndGeoMag', f107: 150, f107a: 150, magneticIndexKp: 3, dragModel: 'Spherical', cssiFile: 'SpaceWeather-All-v1.2.txt', schattenFile: 'SchattenPredict.txt', schattenErrorModel: 'Nominal', schattenTimingModel: 'NominalCycle' },
    srpWhenOn: { model: 'Spherical', fluxWm2: 1367, nominalSunKm: 149597870.691, shadow: 'dual cone (documented; no field)' },
    atmosphereModelsInThisBuild: ['JacchiaRoberts', 'MSISE90', 'Exponential'],
  },
  propagator: { type: 'RungeKutta89', initialStepS: 60, accuracy: 1e-11, minStepS: 0.001, maxStepS: 2700, maxStepAttempts: 50, stopIfAccuracyIsViolated: true },
  spacecraft: { epochFormat: 'TAIModJulian', epoch: '21545 (JD 2451545.0 TAI)', coordinateSystem: 'EarthMJ2000Eq', displayState: 'Cartesian', dryMassKg: 850, cd: 2.2, cr: 1.8, dragAreaM2: 15, srpAreaM2: 1, state: 'X 7100, Y 0, Z 1300 km; VX 0, VY 7.35, VZ 1 km/s' },
  earth: { gmKm3S2: 398600.4415, equatorialRadiusKm: 6378.1363, flattening: 0.0033527, orientation: 'IAU-1976/FK5 (FK5IAU1980) with EOP (polar motion, UT1-UTC); nutation 1980 (NUTATION.DAT), no celestial pole offsets', nutationUpdateIntervalS: 60 },
  sun: { gmKm3S2: 132712440017.99 }, luna: { gmKm3S2: 4902.8005821478 },
  solarSystem: { ephemerisSource: 'DE405', note: 'planetary SPK in the startup file is DE421AllPlanets.bsp; DE405 source is the script default' },
  outputCoordinateSystemDefault: 'EarthMJ2000Eq (spacecraft state); GMAT integrates in MJ2000Eq axes',
  timeAndEop: { timeScaleFormats: 'TAIModJulian default; UTCGregorian/A1ModJulian etc. selectable', eopFile: 'data/planetary_coeff/eopc04_08.62-now (IERS C04 14; ends 2023-04-24)', leapSeconds: 'data/time/tai-utc.dat (last step 2017-01-01, TAI-UTC 37 s)', cssi: 'data/atmosphere/earth/SpaceWeather-All-v1.2.txt (observed to 2022-10-24; GMAT never uses the file\'s predictions)', historicBeforePredicted: 'weather: CSSI file for epochs inside its observed block, then the predicted source (constants, or the Schatten file)' },
});

// IERS C04-layout rows (the shipped file's header kept) from finals2000A fixed-width rows covering [fromMs, toMs].
function writeEop(file, finals, fromMs, toMs, gmatRoot) {
  const lines = fs.readFileSync(finals, 'latin1').split('\n');
  const rows = [];
  const lo = Math.floor(fromMs / 86400000) + 40587 - 3, hi = Math.floor(toMs / 86400000) + 40587 + 3;
  for (const line of lines) {
    const mjd = Number(line.slice(7, 15));
    if (!(mjd >= lo && mjd <= hi)) continue;
    const x = Number(line.slice(18, 27)), y = Number(line.slice(37, 46)), ut = Number(line.slice(58, 68)), lod = Number(line.slice(79, 86));
    if (![x, y, ut].every(Number.isFinite) || line.slice(18, 27).trim() === '') throw new Error(`finals2000A row for MJD ${mjd} has no pole or UT1-UTC`);
    const d = new Date((mjd - 40587) * 86400000);
    rows.push(`${String(d.getUTCFullYear()).padStart(4)}${String(d.getUTCMonth() + 1).padStart(4)}${String(d.getUTCDate()).padStart(4)}${String(mjd).padStart(7)}${x.toFixed(6).padStart(11)}${y.toFixed(6).padStart(11)}`
      + `${ut.toFixed(7).padStart(12)}${(Number.isFinite(lod) ? lod / 1000 : 0).toFixed(7).padStart(12)}${'0.000000'.padStart(11)}${'0.000000'.padStart(11)}`
      + '   0.000000   0.000000  0.0000000  0.0000000    0.000000    0.000000');
  }
  if (rows.length < hi - lo) throw new Error(`${finals} lacks rows for MJD ${lo}..${hi} (${rows.length} found)`);
  const original = fs.readFileSync(path.join(gmatRoot, 'data/planetary_coeff/eopc04_08.62-now'), 'latin1').split('\n');
  const first = original.findIndex((l) => /^\s*\d{4}\s+\d+\s+\d+\s+\d{5}\s/.test(l));
  fs.writeFileSync(file, `${[...original.slice(0, first), ...rows].join('\n')}\n`);
}

// A leap second between two instants would make ElapsedSecs (TAI) differ from UTC differences.
function checkNoLeapSecond(gmatRoot, fromMs, toMs) {
  const steps = [...fs.readFileSync(path.join(gmatRoot, 'data/time/tai-utc.dat'), 'utf8').matchAll(/=JD\s+([\d.]+)\s+TAI-UTC=\s+([\d.]+)\s+S\s+\+\s+\(MJD - [\d.]+\)\s+X\s+0\.0+\s+S/g)]
    .map((m) => ({ ms: (Number(m[1]) - 2440587.5) * 86400000, offset: Number(m[2]) }));
  if (fromMs < steps[0].ms) throw new Error('epoch before 1972: UTC had a drift rate then, not supported');
  if (steps.some((s) => s.ms > fromMs && s.ms <= toMs)) throw new Error('a leap second falls inside the case');
}

function script(c, ctx) {
  const { forces: F, integrator: I } = c;
  const hpop = (F.constants ?? 'HPOP') === 'HPOP';
  const body = [];
  const add = (...l) => body.push(...l);
  if (!(F.gravity in COF)) throw new Error(`${c.id}: gravity ${F.gravity} is not one of ${Object.keys(COF).join(', ')}`);
  const [cof, maxDegree] = COF[F.gravity], degree = F.degree ?? 0, order = F.order ?? degree;
  if (degree === 1 || degree < 0 || degree > maxDegree || order > degree) throw new Error(`${c.id}: degree ${degree} order ${order} is not valid for ${F.gravity} (2..${maxDegree}, or 0 for point mass)`);
  const atmosphere = F.atmosphere ?? 'NONE', srp = F.srp ?? 'NONE';
  if (atmosphere !== 'NONE' && !DRAG[atmosphere]) throw new Error(`${c.id}: atmosphere ${atmosphere} is not available in GMAT R2022a on macOS (${Object.keys(DRAG).join(', ')}; MSISE86 and NRLMSISE-00 are proprietary plugins)`);
  if (!['NONE', 'SPHERICAL'].includes(srp)) throw new Error(`${c.id}: srp ${srp}`);
  const bodies = { NONE: [], SUN_MOON: ['Sun', 'Luna'], SUN_MOON_PLANETS: ['Sun', 'Luna', ...PLANETS.map((p) => p[0])] }[F.thirdBodies ?? 'NONE'];
  if (!bodies) throw new Error(`${c.id}: thirdBodies ${F.thirdBodies}`);

  if (hpop) {
    add(`GMAT SolarSystem.EphemerisSource = 'SPICE';`, `GMAT SolarSystem.SPKFilename = '${ctx.kernel}';`,
      'GMAT Earth.Mu = 398600.4415;', 'GMAT Earth.EquatorialRadius = 6378.137;', 'GMAT Earth.NutationUpdateInterval = 0;',
      `GMAT Sun.Mu = ${f(GM_SUN)};`, 'GMAT Sun.EquatorialRadius = 695700;', `GMAT Luna.Mu = ${f(GM_MOON)};`);
    if (atmosphere !== 'NONE') add(`GMAT Earth.Flattening = ${f(1 / 298.257223563)};`);
    for (const [n, naif, mu] of PLANETS) if (bodies.includes(n)) add(`GMAT ${n}.NAIFId = ${naif};`, `GMAT ${n}.Mu = ${mu};`);
  } else {
    add('GMAT Earth.NutationUpdateInterval = 0;');
    if (bodies.length > 2) for (const [n, naif] of PLANETS) add(`GMAT ${n}.NAIFId = ${naif};`);
    if (bodies.length > 2) add(`GMAT SolarSystem.EphemerisSource = 'SPICE';`, `GMAT SolarSystem.SPKFilename = '${ctx.kernel}';`);
  }
  const [x, y, z, vx, vy, vz] = c.state;
  add('', 'Create Spacecraft Sat;', 'GMAT Sat.DateFormat = UTCGregorian;', `GMAT Sat.Epoch = '${gregorian(msOf(c.epoch))}';`, 'GMAT Sat.CoordinateSystem = EarthICRF;', 'GMAT Sat.DisplayStateType = Cartesian;',
    ...Object.entries({ X: x, Y: y, Z: z, VX: vx, VY: vy, VZ: vz }).map(([k, v]) => `GMAT Sat.${k} = ${f(v / 1000)};`),
    'GMAT Sat.DryMass = 1;', `GMAT Sat.Cd = ${f(F.b ?? 0)};`, `GMAT Sat.Cr = ${f(F.agom ?? 0)};`, 'GMAT Sat.DragArea = 1;', 'GMAT Sat.SRPArea = 1;');
  add('', 'Create ForceModel FM;', 'GMAT FM.CentralBody = Earth;');
  // Degree 0 is the point mass: GMAT only allows drag on a primary body, and a 0x0 field equals PointMasses = {Earth} (4e-7 m in a day).
  add('GMAT FM.PrimaryBodies = {Earth};', `GMAT FM.GravityField.Earth.Degree = ${degree};`, `GMAT FM.GravityField.Earth.Order = ${order};`, `GMAT FM.GravityField.Earth.PotentialFile = '${path.join(ctx.gmatRoot, 'data/gravity/earth', cof)}';`, `GMAT FM.GravityField.Earth.TideModel = 'None';`);
  if (bodies.length) add(`GMAT FM.PointMasses = {${bodies.join(', ')}};`);
  add(`GMAT FM.SRP = ${srp === 'NONE' ? 'Off' : 'On'};`);
  if (srp !== 'NONE') add('GMAT FM.SRP.SRPModel = Spherical;', ...(hpop ? ['GMAT FM.SRP.Flux = 1361;', `GMAT FM.SRP.Nominal_Sun = ${AU_KM};`] : []));
  if (atmosphere !== 'NONE') {
    add(`GMAT FM.Drag.AtmosphereModel = ${DRAG[atmosphere]};`, 'GMAT FM.Drag.DragModel = Spherical;');
    if (atmosphere !== 'EXPONENTIAL') {
      const w = F.spaceWeather ?? 'CONSTANT';
      if (w === 'CONSTANT') add(`GMAT FM.Drag.HistoricWeatherSource = 'ConstantFluxAndGeoMag';`, `GMAT FM.Drag.PredictedWeatherSource = 'ConstantFluxAndGeoMag';`, 'GMAT FM.Drag.F107 = 150;', 'GMAT FM.Drag.F107A = 150;', 'GMAT FM.Drag.MagneticIndex = 3;');
      else if (w === 'FILE') add(`GMAT FM.Drag.HistoricWeatherSource = 'CSSISpaceWeatherFile';`, `GMAT FM.Drag.CSSISpaceWeatherFile = '${ctx.cssiFile}';`, `GMAT FM.Drag.PredictedWeatherSource = 'SchattenFile';`, `GMAT FM.Drag.SchattenFile = '${path.join(ctx.gmatRoot, 'data/atmosphere/earth/SchattenPredict.txt')}';`);
      else throw new Error(`${c.id}: spaceWeather ${w}`);
    }
  }
  add(`GMAT FM.RelativisticCorrection = ${F.relativity ? 'On' : 'Off'};`, 'GMAT FM.ErrorControl = RSSStep;');
  const method = I.method ?? 'PrinceDormand78';
  add('', 'Create Propagator Prop;', 'GMAT Prop.FM = FM;', `GMAT Prop.Type = ${method};`, `GMAT Prop.InitialStepSize = ${Math.min(30, I.maxStep)};`, `GMAT Prop.Accuracy = ${I.tolerance};`,
    'GMAT Prop.MinStep = 0;', `GMAT Prop.MaxStep = ${I.maxStep};`, 'GMAT Prop.MaxStepAttempts = 200;', 'GMAT Prop.StopIfAccuracyIsViolated = true;');
  const columns = 'Sat.UTCModJulian Sat.EarthMJ2000Eq.X Sat.EarthMJ2000Eq.Y Sat.EarthMJ2000Eq.Z Sat.EarthMJ2000Eq.VX Sat.EarthMJ2000Eq.VY Sat.EarthMJ2000Eq.VZ Sat.EarthICRF.X Sat.EarthICRF.Y Sat.EarthICRF.Z Sat.EarthICRF.VX Sat.EarthICRF.VY Sat.EarthICRF.VZ';
  add('', 'Create ReportFile Out;', `GMAT Out.Filename = '${ctx.report}';`, 'GMAT Out.Precision = 17;', 'GMAT Out.WriteHeaders = false;', 'GMAT Out.LeftJustify = On;', 'GMAT Out.ZeroFill = Off;', 'GMAT Out.ColumnWidth = 28;',
    '', 'BeginMissionSequence;', `Report Out ${columns};`);
  let last = msOf(c.epoch);
  for (const s of c.samples) {
    const t = msOf(s);
    if (t < last) throw new Error(`${c.id}: samples must ascend from the epoch (${s})`);
    if (t > last) add(`Propagate Prop(Sat) {Sat.ElapsedSecs = ${((t - last) / 1000).toFixed(3)}};`);
    add(`Report Out ${columns};`);
    last = t;
  }
  return `% ${c.id} (gmat-truth.mjs)\n${body.join('\n')}\n`;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(...a); return a.map((x) => x / n); };
const triad = (r, v) => { const e1 = unit(r), e3 = unit(cross(r, v)); return [e1, cross(e3, e1), e3]; };

// Rows of the report -> GCRF samples (m, m/s) by the epoch's fixed MJ2000Eq -> ICRF rotation.
function samplesOf(c, rows) {
  if (rows.length !== c.samples.length + 1) throw new Error(`${c.id}: ${rows.length} report rows for ${c.samples.length + 1} instants`);
  const mj = triad(rows[0].slice(1, 4), rows[0].slice(4, 7)), icrf = triad(rows[0].slice(7, 10), rows[0].slice(10, 13));
  const toGcrf = (v) => [0, 1, 2].map((i) => mj.reduce((s, e, k) => s + icrf[k][i] * dot(e, v), 0));
  let icrfDriftM = 0;
  const samples = c.samples.map((epoch, k) => {
    const r = rows[k + 1], gmatT = (r[0] - rows[0][0]) * 86400, t = (msOf(epoch) - msOf(c.epoch)) / 1000;
    if (Math.abs(gmatT - t) > 1e-3) throw new Error(`${c.id}: GMAT sample ${k} at ${gmatT} s, not ${t} s`);
    const p = toGcrf(r.slice(1, 4)), v = toGcrf(r.slice(4, 7));
    icrfDriftM = Math.max(icrfDriftM, 1000 * Math.hypot(p[0] - r[7], p[1] - r[8], p[2] - r[9]));
    return { epoch, state: [...p.map((x) => x * 1000), ...v.map((x) => x * 1000)] };
  });
  return { samples, icrfDriftM };
}

const runGmat = (gmat, startup, file) => new Promise((resolve, reject) => {
  const child = spawn('nice', ['-n', '10', gmat, '--startup_file', startup, '--logfile', file.replace(/\.script$/, '.log'), '--verbose', 'off', '--run', file], { cwd: path.dirname(gmat), stdio: 'ignore' });
  child.on('error', reject);
  child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`GmatConsole exited ${code} on ${file} (see its .log)`))));
});

export async function gmatTruth(cases, { workDir, gmat = GMAT, kernel, eopFinals, cssiFile, concurrency } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(here, '..', 'config.json'), 'utf8'));
  const resolve = (p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));
  kernel = resolve(kernel ?? (config.inputs.kernels?.DE440 ?? config.inputs.kernel).path);
  eopFinals = resolve(eopFinals ?? config.inputs.eopFinals);
  const gmatRoot = path.resolve(path.dirname(gmat), '..');
  cssiFile = cssiFile ? path.resolve(cssiFile) : path.join(gmatRoot, 'data/atmosphere/earth/SpaceWeather-All-v1.2.txt');
  const ids = new Set(cases.map((c) => slug(c.id)));
  if (ids.size !== cases.length) throw new Error('case ids must be distinct (as file names)');
  const buildDate = execFileSync(gmat, ['--version'], { cwd: path.dirname(gmat), encoding: 'utf8' }).match(/Build Date:[^\n]*/)?.[0] ?? 'unknown';
  const gmatVersion = `GMAT R2022a (GmatConsole, ${buildDate})`;
  fs.mkdirSync(workDir, { recursive: true });
  const spans = cases.map((c) => [msOf(c.epoch), msOf(c.samples.at(-1) ?? c.epoch)]);
  for (const [a, b] of spans) checkNoLeapSecond(gmatRoot, a, b);
  const eop = path.join(workDir, 'eop-finals.txt');
  writeEop(eop, eopFinals, Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1])), gmatRoot);

  // GMAT's own startup file, every path absolute, output into the case's directory, no Python/MATLAB/OpenFrames plugins, our EOP file.
  const startupText = fs.readFileSync(path.join(path.dirname(gmat), 'gmat_startup_file.txt'), 'utf8');
  const startupFor = (dir) => startupText.split('\n').map((line) => {
    if (/^PLUGIN\s/.test(line)) return /libPythonInterface|libMatlabInterface|libOpenFrames/.test(line) ? `# ${line}` : line.replace('../', `${gmatRoot}/`);
    if (/^ROOT_PATH\s/.test(line)) return `ROOT_PATH                = ${gmatRoot}/`;
    if (/^OUTPUT_PATH\s/.test(line)) return `OUTPUT_PATH              = ${dir}/`;
    if (/^EOP_FILE\s/.test(line)) return `EOP_FILE                 = ${eop}`;
    return line;
  }).join('\n');

  const scripts = {}, startups = {}, usedData = new Set([eop]);
  const jobs = cases.map((c) => {
    const dir = path.resolve(workDir, slug(c.id)), file = path.join(dir, 'case.script'), report = path.join(dir, 'report.txt');
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(report, { force: true });
    const text = script(c, { kernel, gmatRoot, cssiFile, report });
    const startup = path.join(dir, 'gmat_startup_file.txt');
    fs.writeFileSync(file, text);
    fs.writeFileSync(startup, startupFor(dir));
    scripts[c.id] = sha256Text(text);
    startups[c.id] = sha256(startup);
    const F = c.forces;
    usedData.add(path.join(gmatRoot, 'data/gravity/earth', COF[F.gravity]?.[0] ?? 'JGM2.cof'));
    if ((F.constants ?? 'HPOP') === 'HPOP' || F.thirdBodies === 'SUN_MOON_PLANETS') usedData.add(kernel);
    if (F.constants === 'GMAT' && F.thirdBodies !== 'SUN_MOON_PLANETS') for (const n of ['leDE1941.405']) usedData.add(path.join(gmatRoot, 'data/planetary_ephem/de', n));
    if ((F.atmosphere ?? 'NONE') !== 'NONE' && F.atmosphere !== 'EXPONENTIAL' && F.spaceWeather === 'FILE') { usedData.add(cssiFile); usedData.add(path.join(gmatRoot, 'data/atmosphere/earth/SchattenPredict.txt')); }
    if (F.atmosphere === 'EXPONENTIAL') usedData.add(path.join(gmatRoot, 'data/atmosphere/earth/EarthExponentialAtmosphereData.txt'));
    return { c, dir, file, startup, report };
  });
  for (const n of ['data/planetary_coeff/NUTATION.DAT', 'data/time/tai-utc.dat', 'data/time/SPICELeapSecondKernel.tls', 'data/icrf/ICRF_Table.txt', 'data/planetary_coeff/SPICEPlanetaryConstantsKernel.tpc',
    'data/planetary_coeff/earth_latest_high_prec.bpc', 'data/planetary_coeff/SPICEEarthCurrentKernel.bpc', 'data/planetary_coeff/SPICEEarthPredictedKernel.bpc']) usedData.add(path.join(gmatRoot, n));

  // At most `concurrency` (default GMAT_TRUTH_PROCESSES or 2; never above 4) GmatConsole processes at once.
  const width = Math.min(4, Math.max(1, Number(concurrency ?? process.env.GMAT_TRUTH_PROCESSES ?? 2)));
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, async () => {
    while (next < jobs.length) {
      const k = next++, { c, file, startup, report } = jobs[k];
      try {
        await runGmat(gmat, startup, file);
        const rows = fs.readFileSync(report, 'utf8').trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
        results[k] = samplesOf(c, rows);
      } catch (error) { results[k] = { error: `${c.id}: ${error.message}` }; }
    }
  }));
  const failed = results.filter((r) => r.error);
  if (failed.length) throw new Error(`gmatTruth: ${failed.map((r) => r.error).join('; ')}`);

  const out = jobs.map(({ c }, k) => {
    const F = c.forces, notes = [`${c.integrator.method ?? 'PrinceDormand78'} ${c.integrator.tolerance} max ${c.integrator.maxStep} s`, `constants ${F.constants ?? 'HPOP'}`, `ICRF axes drift ${results[k].icrfDriftM.toExponential(2)} m`];
    if ((F.atmosphere ?? 'NONE') !== 'NONE' && F.atmosphere !== 'EXPONENTIAL' && F.spaceWeather === 'FILE') notes.push('space weather: CSSI observed block where it covers the epoch, else the Schatten prediction (nominal)');
    return { id: c.id, samples: results[k].samples, gmatVersion, notes: notes.join('; '), icrfDriftM: results[k].icrfDriftM };
  });
  const data = Object.fromEntries([...usedData].sort().filter((p) => fs.existsSync(p)).map((p) => [p, sha256(p)]));
  return {
    cases: out,
    provenance: {
      gmat: { path: gmat, buildDate }, gmatVersion, data, eopSource: { path: eopFinals, sha256: sha256(eopFinals) },
      scripts, startupFiles: startups, casesSha256: sha256Text(JSON.stringify({ cases })),
      generator: { path: path.join(here, 'gmat-truth.mjs'), sha256: sha256(path.join(here, 'gmat-truth.mjs')) },
    },
  };
}
