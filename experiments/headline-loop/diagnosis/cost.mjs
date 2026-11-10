// #316 / #317 (exploratory): where AP's cost goes on eccentric orbits. Made-up orbits (no catalog data): an SGP4 set flown by the
// module's SGP4 path for 3 days, AP 0.6.5 fitted to it under each force selection, then the bare kernel (load_epochs, then
// sdnap_epochs_set_at, one TEME state per call) timed over 7 days at 300 s and at 60 s output, cold (a fresh module instance, first
// sweep) and warm (later sweeps on the same instance). CPU time of this process (user + system).
//   SDN_MODULES_ROOT=... node experiments/headline-loop/diagnosis/cost.mjs <out.json> [--orbits e05,e72,...] [--configs X,XD,Z,ZD,G,GD]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const OUT = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const MODULES = process.env.SDN_MODULES_ROOT;
const imp = (p) => import(pathToFileURL(p).href);
const FIVE = path.join(REPO, 'experiments/ap-five-day-accuracy/lib');
const SDS = path.join(MODULES, 'propagator/sdn-ap/node_modules/spacedatastandards.org/lib/js');
const { loadWasmModule, TYPES } = await imp(`${FIVE}/wasm-hosts.mjs`);
const { buildSpaceWeather } = await imp(`${FIVE}/space-weather.mjs`);
const { propagateSingleTleSgp4Gcrf } = await imp(`${FIVE}/ssn-epoch-engine.mjs`);
const PCF = await imp(`${SDS}/PCF/main.js`);
const OCM = await imp(`${SDS}/OCM/main.js`);
const { OEM, OEMT, ephemerisDataBlockT, ephemerisDataLineT, CATT, timingStandard } = await imp(`${SDS}/OEM/main.js`);
const { RFMT } = await imp(`${SDS}/RFM/RFM.js`);
const { CelestialFrameWrapperT } = await imp(`${SDS}/RFM/CelestialFrameWrapper.js`);
const { CelestialFrame } = await imp(`${SDS}/RFM/CelestialFrame.js`);
const { RFMUnion } = await imp(`${SDS}/RFM/RFMUnion.js`);
const fb = await imp(createRequire(path.join(MODULES, 'propagator/sdn-ap/package.json')).resolve('flatbuffers'));

const WASM = 'propagator/sdn-ap/dist/isomorphic/module.wasm';
const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(MODULES, WASM))).digest('hex');
if (sha !== 'f0b8352a43f305fbdd1ad15c9894e2d28f3179528838cae8f967bf1ea5d089b7') throw new Error(`module.wasm is ${sha}, not sdn-ap 0.6.5`);

const DAY = 86400000, MU = 398600.4418, RE = 6378.137;
const jdOfMs = (t) => { const d = t / DAY; return { whole: Math.floor(d) + 2440587.5, frac: d - Math.floor(d) }; };
const isoNoZ = (t) => new Date(t).toISOString().replace(/Z$/, '');
const t0 = Date.parse('2026-11-01T00:00:00Z');
const spw = buildSpaceWeather({ firstDate: '2026-09-25', lastDate: '2026-12-12', cutoffDate: '2026-11-08' }).bytes;

// Orbits: perigee 500 km unless stated; a from the perigee and e; n in rev/day.
const nOf = (a) => (Math.sqrt(MU / a ** 3) * 86400) / (2 * Math.PI);
const ecc = (e, hp = 500, inc = 27) => { const a = (RE + hp) / (1 - e); return { e, a, n: nOf(a), inc, hp }; };
const ORBITS = {
  e05: ecc(0.05), e10: ecc(0.1), e20: ecc(0.2), e29: ecc(0.29), e31: ecc(0.31), e40: ecc(0.4), e50: ecc(0.5), e60: ecc(0.6), e72: ecc(0.72), e80: ecc(0.8),
  e72h: ecc(0.72, 3000), themis: ecc(0.82, 900, 8), molniya: ecc(0.74, 600, 63.4),
};
const CONFIGS = {
  X: { caps: [0, 0], drag: false }, XD: { caps: [0, 0], drag: true }, Z: { caps: [0, 20], drag: false }, ZD: { caps: [0, 20], drag: true },
  G: { caps: [31, 20], drag: false }, GD: { caps: [31, 20], drag: true }, T: { caps: [12, 0], drag: false }, TD: { caps: [12, 0], drag: true },
};
const pickOrbits = (args.orbits ?? Object.keys(ORBITS).join(',')).split(',');
const pickConfigs = (args.configs ?? 'X,XD,Z,ZD,G,GD').split(',');

function oem(norad, states) {
  const rfm = Object.assign(new RFMT(), { FRAME_TYPE: RFMUnion.CelestialFrameWrapper, FRAME: Object.assign(new CelestialFrameWrapperT(), { frame: CelestialFrame.GCRF }), NAME: 'GCRF' });
  const lines = states.map((s) => Object.assign(new ephemerisDataLineT(), { EPOCH: s.epoch, X: s.r[0], Y: s.r[1], Z: s.r[2], X_DOT: s.v[0], Y_DOT: s.v[1], Z_DOT: s.v[2] }));
  const blk = Object.assign(new ephemerisDataBlockT(), { OBJECT: Object.assign(new CATT(), { OBJECT_NAME: `SAT-${norad}`, OBJECT_ID: `${norad}`, NORAD_CAT_ID: norad }), CENTER_NAME: 'EARTH', REFERENCE_FRAME: rfm, TIME_SYSTEM: timingStandard.UTC,
    START_TIME: lines[0].EPOCH, STOP_TIME: lines.at(-1).EPOCH, USEABLE_START_TIME: lines[0].EPOCH, USEABLE_STOP_TIME: lines.at(-1).EPOCH, EPHEMERIS_DATA_LINES: lines });
  const o = Object.assign(new OEMT(), { CCSDS_OEM_VERS: '2.0', CREATION_DATE: lines.at(-1).EPOCH, ORIGINATOR: 'heo-cost', EPHEMERIS_DATA_BLOCK: [blk] });
  const b = new fb.Builder(1 << 16); OEM.finishOEMBuffer(b, o.pack(b)); return b.asUint8Array().slice();
}
function fitPcf({ caps, drag }) {
  const stock = !drag && !caps[0] && !caps[1];
  const c = new PCF.PCFT();
  c.THEORY = stock ? PCF.pcfTheory.SGP4XP : PCF.pcfTheory.AP;
  const f = Object.assign(new PCF.PCFForceModelT(), { EPHEMERIS_SOURCE: '',
    ATMOSPHERE_MODEL: drag ? PCF.pcfAtmosphereFamily.NRLMSISE00 : PCF.pcfAtmosphereFamily.JACCHIA70,
    WEATHER_SOURCE: drag ? PCF.pcfWeatherSource.RECORDS : PCF.pcfWeatherSource.THEORY_FLUX_MODEL,
    ...(caps[0] ? { HAS_MAXIMUM_TESSERAL_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: caps[0] } : {}),
    ...(caps[1] ? { HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: caps[1] } : {}) });
  const pack = f.pack.bind(f);
  f.pack = (b) => { const offset = b.addFieldOffset; b.addFieldOffset = function (slot, value, d) { if (value !== d) offset.call(this, slot, value, d); }; b.forceDefaults(true); try { return pack(b); } finally { b.forceDefaults(false); b.addFieldOffset = offset; } };
  c.FORCES = f;
  const prior = (mean, sigma) => Object.assign(new PCF.PCFGaussianPriorT(), { MEAN: mean, SIGMA: sigma, HAS_SIGMA: true });
  // drag: B held at 0.01 m2/kg (LOG_NORMAL, sigma 1e-6); no drag: B held at 0. S held at 0.01 either way.
  c.FIT = Object.assign(new PCF.PCFFitPolicyT(), {
    DRAG_PRIOR: drag ? prior(0.01, 1e-6) : prior(0, 1e-12), DRAG_PRIOR_FORM: drag ? PCF.pcfPriorForm.LOG_NORMAL : PCF.pcfPriorForm.GAUSSIAN_SIGNED,
    SRP_PRIOR: prior(0.01, 1e-9), SRP_PRIOR_FORM: PCF.pcfPriorForm.GAUSSIAN_SIGNED, WEATHER_HORIZON_DAYS: 30 });
  const b = new fb.Builder(512); b.finish(c.pack(b), '$PCF'); return b.asUint8Array().slice();
}
const cpu = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1000; };
async function sweep(h, grid) {
  const ex = h.instance.exports, out = ex.sdnap_alloc(48);
  const jds = grid.map(jdOfMs);
  const c0 = cpu();
  for (const jd of jds) { const rc = ex.sdnap_epochs_set_at(0, 0, jd.whole, jd.frac, out); if (rc !== 0) throw new Error(`sdnap_epochs_set_at rc ${rc}`); }
  const msUsed = cpu() - c0;
  ex.sdnap_free(out);
  return msUsed;
}

const rows = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const fitter = await loadWasmModule(WASM);
for (const on of pickOrbits) {
  const s = ORBITS[on];
  const norad = 99100 + Object.keys(ORBITS).indexOf(on);
  const tle = { norad, n: s.n, e: s.e, inc: s.inc, raan: 60, argp: 180, ma: 10, bstar: 1e-4, ndot: 0, nddot: 0, ...jdOfMs(t0) };
  const arc = Array.from({ length: 865 }, (_, i) => t0 + i * 300000);
  const tr = propagateSingleTleSgp4Gcrf(fitter, tle, arc.map(jdOfMs));
  if (tr.some((q) => q.status !== 0)) { console.error(`${on}: SGP4 status ${tr.find((q) => q.status !== 0).status}`); continue; }
  const oemBytes = oem(norad, tr.map((q, i) => ({ epoch: isoNoZ(arc[i]), r: q.rGcrf, v: q.vGcrf })));
  for (const cn of pickConfigs) {
    if (rows.some((r) => r.orbit === on && r.config === cn)) continue;
    const cfg = CONFIGS[cn];
    const row = { orbit: on, ...s, periodMin: 1440 / s.n, config: cn, ...cfg };
    try {
      const c0 = cpu();
      const fit = await fitter.invoke({ methodId: 'fit', inputs: [
        { portId: 'ephemeris', typeRef: TYPES.OEM, payload: oemBytes }, { portId: 'configuration', typeRef: TYPES.PCF, payload: fitPcf(cfg) },
        ...(cfg.drag ? [{ portId: 'space_weather', typeRef: TYPES.SPW, payload: spw }] : [])] });
      row.fitMs = cpu() - c0;
      if (fit.statusCode !== 0) throw new Error(`fit ${fit.errorCode}: ${String(fit.errorMessage).slice(0, 160)}`);
      const ocm = new Uint8Array(fit.outputs.find((o) => o.portId === 'elements').payload);
      const o = OCM.OCM.getRootAsOCM(new fb.ByteBuffer(ocm)).unpack();
      row.theory = o.MEAN_ELEMENTS?.MEAN_ELEMENT_THEORY; row.bterm = o.MEAN_ELEMENTS?.BTERM; row.fitRmsKm = o.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_RMS_KM;
      for (const step of [300, 60]) {
        const grid = Array.from({ length: (7 * 86400) / step }, (_, i) => t0 + (i + 1) * step * 1000);
        const h = await loadWasmModule(WASM);
        const r = await h.invoke({ methodId: 'load_epochs', inputs: [{ portId: 'ocm', typeRef: TYPES.OCM, payload: ocm }] });
        if (r.statusCode !== 0) throw new Error(`load_epochs ${r.errorCode}: ${String(r.errorMessage).slice(0, 120)}`);
        const cold = await sweep(h, grid);
        const warm = [await sweep(h, grid), await sweep(h, grid), await sweep(h, grid)].sort((a, b) => a - b)[1];
        row[`s${step}`] = { states: grid.length, coldMs: cold, warmMs: warm, coldUsPerState: (cold * 1000) / grid.length, warmUsPerState: (warm * 1000) / grid.length };
        await h.destroy?.();
      }
    } catch (error) { row.error = String(error.message).slice(0, 200); }
    rows.push(row);
    fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
    console.error(`${on} ${cn} ${row.error ?? `theory ${row.theory} cold ${row.s300.coldUsPerState.toFixed(2)} warm ${row.s300.warmUsPerState.toFixed(2)} us/state @300s; cold ${row.s60.coldUsPerState.toFixed(2)} warm ${row.s60.warmUsPerState.toFixed(2)} @60s; fit ${(row.fitMs / 1000).toFixed(1)} s`}`);
  }
}
process.exit(0);
