import { writeWeatherManifest } from './lib/weather-manifest.mjs';
// Fits one record of arm W (AP) or arm X (SGP4-XP) to each set of the chosen rows, once per unique set, through the module's fit.
//   node fit-records.mjs --arm W|X [--config config.json] [--shard i/n] [--limit k]
// Input: rows-sgp4*.jsonl of the store (the sets of the chosen rows) and sets_index.json. Output: ocm/<arm>-<set>.bin and fits-<arm>*.jsonl (first line: header;
// then per set: ok, residual rmsM (m, fit against the SGP4 flight it was fitted to), the fitted span, wall time, or the refusing status by name).
// Arm W reads the weather table of the set's epoch day (the builder's cut: nothing archived after that day) and a provenance input; arm X reads neither.
import fs from 'node:fs';
import path from 'node:path';
import { readConfig, loadHost, header, tleOf, fly, importFile, REPO, sha256 } from './lib/module.mjs';
import { loadBindings, wholeArcOem, fitPcfBytes, fitRecord, TYPES } from './lib/records.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const config = readConfig(argv);
const ARM = arg('--arm');
if (!config.arms[ARM]) throw new Error(`--arm ${ARM}: not an arm of this configuration`);
const SPAN = config.arms[ARM];
const [si, sn] = arg('--shard', '0/1').split('/').map(Number);
const LIMIT = Number(arg('--limit', 0));
const DAY = 86400000, STEP = config.sampleSeconds * 1000;
const isoNoZ = (ms) => new Date(ms).toISOString().replace(/Z$/, '');
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

const lib = await loadBindings();
let host = await loadHost(config);
const freshHost = async () => { host = await loadHost(config); }; // a refused fit replaces the module instance; the new load is checked too

// The weather files the builder reads for an epoch day (its choice: the baseline table, the newest GFZ nowcast directory and the newest NOAA SWPC directory
// dated on or before the day), with their SHA-256, written to inputs-weather-<arm>.json so that the run's weather inputs are named.
const weatherDays = new Map();
function weatherFiles(day) {
  const newest = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && n <= day).sort().at(-1) : null);
  const list = [path.join(config.archiveRoot, 'hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt')];
  const g = newest(path.join(config.archiveRoot, 'hac/gfz-kp/2026')), s = newest(path.join(config.archiveRoot, 'hac/noaa-swpc/2026'));
  if (g) list.push(path.join(config.archiveRoot, 'hac/gfz-kp/2026', g, 'Kp_ap_Ap_SN_F107_nowcast.txt'));
  if (s) {
    // the builder reads the 3-day forecast only when the newest directory is dated at most 2 days before the epoch day
    const lag = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / DAY);
    for (const f of ['daily-solar-indices.txt', 'daily-geomagnetic-indices.txt', ...(lag <= 2 ? ['sgarf.txt'] : [])]) list.push(path.join(config.archiveRoot, 'hac/noaa-swpc/2026', s, f));
  }
  return list.filter((f) => fs.existsSync(f)).map((f) => ({ file: path.relative(config.archiveRoot, f), sha256: sha256(fs.readFileSync(f)) }));
}
/** With the registered configuration arm W needs its weather inputs for the epoch day: the baseline table, a nowcast directory and a space-weather directory dated on or before the day. */
function assertWeatherInputs(day) {
  const files = weatherFiles(day).map((f) => f.file);
  const need = [/^hac\/gfz-kp\/20261009\/Kp_ap_Ap_SN_F107_since_1932\.txt$/, /^hac\/gfz-kp\/2026\/[^/]+\/Kp_ap_Ap_SN_F107_nowcast\.txt$/,
    /^hac\/noaa-swpc\/2026\/[^/]+\/daily-solar-indices\.txt$/, /^hac\/noaa-swpc\/2026\/[^/]+\/daily-geomagnetic-indices\.txt$/];
  for (const re of need) if (!files.some((f) => re.test(f))) throw new Error(`no weather input ${re} for the epoch day ${day}: the registered run stops`);
}
let extraFor = () => [];
let forecasterSha256 = null;
if (ARM === 'W') {
  // the forecaster's bytes are hashed before the weather builder imports (and so loads) them; another hash stops the run
  const fcFile = path.join(REPO, config.weatherForecaster.file);
  forecasterSha256 = fs.existsSync(fcFile) ? sha256(fs.readFileSync(fcFile)) : null;
  if (forecasterSha256 !== config.weatherForecaster.sha256) throw new Error(`the weather forecaster ${config.weatherForecaster.file} is ${forecasterSha256 ?? 'absent'}; this experiment registers ${config.weatherForecaster.sha256}`);
  process.env.SDN_ARCHIVE_ROOT = config.archiveRoot;
  const five = path.join(REPO, 'experiments/ap-five-day-accuracy/lib');
  // the weather builder's host loads the forecaster from this path: the registered file is the one it loads
  if (path.resolve(fcFile) !== path.resolve(five, '../wasm/tle-astrodynamics-upgrades.wasm')) throw new Error('the registered forecaster path is not the path the weather builder loads');
  const { buildSpaceWeather } = await importFile(path.join(five, 'space-weather.mjs'));
  if (sha256(fs.readFileSync(fcFile)) !== config.weatherForecaster.sha256) throw new Error('the weather forecaster changed while it was loaded');
  const { CREDITS, buildPvnBytes } = await importFile(path.join(five, 'hold-gate.mjs'));
  const spwCache = new Map();
  const spwFor = (ms) => {
    const day = dayOf(ms);
    if (!spwCache.has(day)) {
      if (config.registered) assertWeatherInputs(day);
      spwCache.set(day, buildSpaceWeather({ archiveRoot: config.archiveRoot, firstDate: dayOf(ms - 45 * DAY), lastDate: dayOf(ms + 50 * DAY), cutoffDate: day }).bytes);
      weatherDays.set(day, weatherFiles(day));
    }
    return spwCache.get(day);
  };
  extraFor = (t0) => [
    { portId: 'provenance', typeRef: TYPES.PVN, payload: buildPvnBytes({ sourceId: 'gp-own-epoch', lineage: CREDITS.GP_EPOCH }) },
    { portId: 'space_weather', typeRef: TYPES.SPW, payload: spwFor(t0) }];
}

const index = JSON.parse(fs.readFileSync(path.join(config.storeDir, 'sets_index.json'), 'utf8'));
const byGp = new Map();
for (const [n, L] of Object.entries(index)) for (const s of L) byGp.set(s.gp, { s, norad: Number(n) });
const gps = new Set();
for (const f of fs.readdirSync(config.storeDir).filter((x) => /^rows-sgp4(-\d+of\d+)?\.jsonl$/.test(x))) {
  for (const line of fs.readFileSync(path.join(config.storeDir, f), 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.gpA) { gps.add(r.gpA); gps.add(r.gpB); }
  }
}
const jobs = [...gps].sort();
fs.mkdirSync(path.join(config.storeDir, 'ocm'), { recursive: true });
const out = fs.createWriteStream(path.join(config.storeDir, sn > 1 ? `fits-${ARM}-${si}of${sn}.jsonl` : `fits-${ARM}.jsonl`));
out.write(JSON.stringify(header(config, `fits-${ARM}`, { span: SPAN, limit: LIMIT || null, forecasterSha256 })) + '\n');
console.log(`arm ${ARM}: ${jobs.length} unique sets`);
let k = 0;
for (const gp of jobs.filter((_, i) => i % sn === si).slice(0, LIMIT || Infinity)) {
  const { s, norad } = byGp.get(gp);
  const tle = tleOf(s, norad);
  const t0 = Math.round(tle.epochSec * 1000);
  const from = t0 + SPAN.fromDays * DAY, to = t0 + SPAN.toDays * DAY;
  const row = { key: `${ARM}-${gp}`, arm: ARM, gp, norad, spanFrom: from, spanTo: to, e: s.e, n: s.n };
  const ts = Date.now();
  // Only the module's own answers are counted results: its refusal of the fit (a returned status) and an SGP4 status on the set's flight. Every other error
  // (a missing weather input, a failed read or write, a missing export) is not caught: it stops the run with a non-zero exit.
  const extra = extraFor(t0);
  const ms = []; for (let t = from; t <= to; t += STEP) ms.push(t);
  const fl = fly(host, tle, ms.map((m) => m / 1000));
  if (fl.st.some((x) => x !== 0)) { row.ok = false; row.status = { name: 'sgp4-status' }; }
  else {
    const states = ms.map((m, i) => ({ epoch: isoNoZ(m), r: [fl.r[3 * i], fl.r[3 * i + 1], fl.r[3 * i + 2]], v: [fl.v[3 * i], fl.v[3 * i + 1], fl.v[3 * i + 2]] }));
    const place = host.instance.exports.sdnap_fit_epoch_diagnostic;
    if (typeof place !== 'function') throw new Error('this build has no sdnap_fit_epoch_diagnostic export');
    place(SPAN.epochPlacement); // 0: the record's epoch at the first fitted state
    const f = await fitRecord(host, lib, { oem: wholeArcOem(lib, { norad, states }), pcf: fitPcfBytes(lib, ARM, s.e), extra });
    row.ok = f.ok;
    if (f.ok) { row.rmsM = Math.round(f.rmsM * 10) / 10; fs.writeFileSync(path.join(config.storeDir, 'ocm', `${row.key}.bin`), f.ocmBytes); }
    else { row.status = f.status; await freshHost(); }
  }
  row.wallMs = Date.now() - ts;
  out.write(JSON.stringify(row) + '\n');
  k += 1;
  if (k % 100 === 0) console.log(`${k} fits`);
}
await new Promise((r) => out.end(r));
writeWeatherManifest(config, ARM, `${si}/${sn}`, forecasterSha256, weatherDays);
console.log(`finished ${k} fits`);
process.exit(0);
