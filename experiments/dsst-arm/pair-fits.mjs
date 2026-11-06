// The DSST arm's run on the operator-file pairs (DSST.md, amendment 2026-11-05 (driver defect and rerun), 5): each registered pair built
// as the AP arm's runners built it (experiments/operator-theory/score.mjs for the laser-prediction pairs, providers-run.mjs for the
// provider pairs): the older file's states from its start over the fit hours, the weather the AP arm's call read, the newer file's first
// 3 h as the reference; the fit and flight in DsstArm.java, the flight scored by lib/modules.mjs rtn. Reading, selection and bookkeeping
// only; no physics here.
//   node experiments/dsst-arm/pair-fits.mjs --store ap/b0411/laser/forward [--workers 6] [--cost] [--limit n]
//   node experiments/dsst-arm/pair-fits.mjs --store ap/b0411/providers [--workers 6] [--cost]
//   XP2F_CONTROL=1 node experiments/dsst-arm/pair-fits.mjs --store ap/b0411/providers --iss   the ISS pairs (NASA's archive, as-issued weather)
//   --dry: build every request (files, arcs, weather, Earth orientation) and count the jobs by outcome; no JVM runs and no row is written
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { collect, cellGrid, regimeOf, ROOT } from './windows.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const STORE_NAME = args.store;
if (!['ap/b0411/laser/forward', 'ap/b0411/providers'].includes(STORE_NAME)) throw new Error('--store ap/b0411/laser/forward | ap/b0411/providers');
const LASER = STORE_NAME === 'ap/b0411/laser/forward', ISS = args.iss === 'true';
if (ISS && (LASER || process.env.XP2F_CONTROL !== '1')) throw new Error('--iss: the provider store\'s ISS pairs, with XP2F_CONTROL=1 (providers-run.mjs --iss)');
const COST = args.cost === 'true', DRY = args.dry === 'true';
const WORKERS = COST ? 1 : Math.min(6, Number(args.workers ?? 6));
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const OUT = path.join(ROOT, 'dsst-arm');
const TAG = `${STORE_NAME.replace(/\//g, '-')}${ISS ? '-iss' : ''}${COST ? '-cost' : ''}`;
const SCRATCH = `/Users/tj/software/terrain-work/body-look/claude-dsst-d9/run/${TAG}`;
const COMMON = '/Users/tj/software/terrain-work/body-look/claude-dsst-d9/data/common';
const JARS = '/Users/tj/software/gmat09-authority/jars';
const JAVA = '/opt/homebrew/opt/openjdk/bin/java';
const DRIVER = path.join(here, 'DsstArm.java');
const EOP_TABLE = '/opt/data/sdn-archive/sdn-ap-baselines/environment/environment.json';
const EOP_TABLE_SHA = '520b825d61e64418d1904a482da49c647cb2f92765c9df736d14d90a6e61dcf6';
const DRAG_BELOW_KM = 2500, HOUR = 3600000, DAY = 86400000, TRUTH_H = 3;
// the laser pairs' weather span (cycle-ap7.sh laser: score.mjs --weather-from 2026-02-20); the providers' (providers-run.mjs)
const WEATHER_FROM = LASER ? '2026-02-20' : '2026-07-15', WEATHER_TO = '2026-12-14';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// the registration pins (DSST.md, amendment 9), as truth-fits.mjs checks them
const JAR_SHA256 = {
  'orekit-13.1.jar': 'bbda7dae7ddaf6b5b4464548ee2519c545b59f24117ef790fc34d5bbef3f7407',
  'hipparchus-core-4.0.1.jar': '944a55c3a1b13b0a0c9c4db6dbb79c33b1b49511ab7430b6cdc69dc046154a87',
  'hipparchus-geometry-4.0.1.jar': '75eb277e4dbb59f981ad26eb56ba32a9a13420dd83d2ee7796d9b1f49c05f516',
  'hipparchus-ode-4.0.1.jar': 'ae1266fc1c1570a7ca8879a98cb44ccabf43692e411c1310226d87f6163d0f44',
  'hipparchus-optim-4.0.1.jar': 'a5af8e00aed1623a1f39340aa291de8ab586f8875ffd74e8a305dd4516ad43cf',
  'hipparchus-fitting-4.0.1.jar': '5c57a879eaec6adc05034d6e301def260abaef6291a6b65b621321266c3bb6cf',
  'hipparchus-stat-4.0.1.jar': 'fda3097a7840e5db86d822a79d89947639f13d0832863a6d135be427cf6e3bd4',
  'hipparchus-filtering-4.0.1.jar': 'd15bf8a00f9b2b434028b498ed7c453b1f1c9fe5109e33475a49cac786fadc6c',
};
for (const [jar, want] of Object.entries(JAR_SHA256)) { const got = sha256(fs.readFileSync(path.join(JARS, jar))); if (got !== want) throw new Error(`${jar} is ${got.slice(0, 12)}, registered ${want.slice(0, 12)}`); }
const jvmVersion = (() => { try { return execFileSync('sh', ['-c', `${JAVA} -version 2>&1 | head -1`]).toString().trim(); } catch { return 'unknown'; } })();
const BUILD = { orekit: { version: '13.1', sha256: JAR_SHA256['orekit-13.1.jar'] }, hipparchus: { version: '4.0.1', sha256: Object.fromEntries(Object.entries(JAR_SHA256).filter(([k]) => k.startsWith('hipparchus'))) }, jvm: jvmVersion, driverSha256: sha256(fs.readFileSync(DRIVER)), harnessSha256: sha256(fs.readFileSync(new URL(import.meta.url))) };

// the AP runners' libraries
const OT = path.join(repo, 'experiments/operator-theory');
const { isoMs, openAxes } = await import(pathToFileURL(path.join(OT, 'lib/host.mjs')).href);
const { weatherRows } = await import(pathToFileURL(path.join(OT, 'lib/weather.mjs')).href);
const { fitWeather, rowsOfSpw, horizonOf } = await import(pathToFileURL(path.join(OT, 'lib/ap.mjs')).href);
const { binOf } = await import(pathToFileURL(path.join(OT, 'lib/compare.mjs')).href);
const { openModules } = await import(pathToFileURL(path.join(repo, 'experiments/xp-atmosphere-merit/lib/modules.mjs')).href);
const S = await import(pathToFileURL(path.join(repo, 'experiments/xp-atmosphere-merit/lib/sds.mjs')).href);
const { config: XMC } = await import(pathToFileURL(path.join(repo, 'experiments/xp-atmosphere-merit/common.mjs')).href);
const W = ISS ? await import(pathToFileURL(path.join(repo, 'experiments/xp-atmosphere-merit/lib/weather.mjs')).href) : null;

// the Earth-orientation table every FFM arm read (amendment 6), sliced per pair as truth-fits.mjs slices it
const eopRaw = fs.readFileSync(EOP_TABLE);
if (sha256(eopRaw) !== EOP_TABLE_SHA) throw new Error(`${EOP_TABLE} is not the registered table`);
const EOP = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(Buffer.from(JSON.parse(eopRaw.toString('utf8')).inputs.earth_orientation_finals, 'base64')))).unpack().EARTH_ORIENTATION.ROWS;
const mjdOf = (t) => Math.floor(t / DAY) + 40587;
const ARCSEC = Math.PI / 648000, MAS = ARCSEC / 1000;
const pad = (v, w) => String(v).padStart(w);
const fix = (v, w, d) => Number(v).toFixed(d).padStart(w);
function finalsText(fromMs, toMs) {
  const lo = mjdOf(fromMs - 2 * DAY) - 1, hi = mjdOf(toMs + 2 * DAY) + 1;
  const rows = EOP.filter((r) => r.MJD >= lo && r.MJD <= hi);
  if (!rows.length || rows.at(-1).MJD < mjdOf(toMs)) throw new Error(`Earth orientation ends before ${isoMs(toMs)}`);
  return rows.map((r) => {
    const d = new Date((r.MJD - 40587) * DAY);
    const yy = pad(d.getUTCFullYear() % 100, 2).replace(/ /g, '0'), mm = pad(d.getUTCMonth() + 1, 2), dd = pad(d.getUTCDate(), 2);
    return `${yy}${mm}${dd} ${fix(r.MJD, 8, 2)} I ${fix(r.X_POLE_WANDER_RADIANS / ARCSEC, 9, 6)}${fix(0, 9, 6)} ${fix(r.Y_POLE_WANDER_RADIANS / ARCSEC, 9, 6)}${fix(0, 9, 6)}  I${fix(r.UT1_MINUS_UTC_SECONDS, 10, 7)}${fix(0, 10, 7)} ${fix(r.LENGTH_OF_DAY_CORRECTION_SECONDS * 1000, 7, 4)}${fix(0, 7, 4)}  I ${fix(r.X_CELESTIAL_POLE_OFFSET_RADIANS / MAS, 9, 3)}${fix(0, 9, 3)} ${fix(r.Y_CELESTIAL_POLE_OFFSET_RADIANS / MAS, 9, 3)}${fix(0, 9, 3)}`;
  }).join('\n') + '\n';
}

// the weather in the CSSI layout, as truth-fits.mjs writes it (amendment 4)
const KP10 = [0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 53, 57, 60, 63, 67, 70, 73, 77, 80, 83, 87, 90];
const APS = [0, 2, 3, 4, 5, 6, 7, 9, 12, 15, 18, 22, 27, 32, 39, 48, 56, 67, 80, 94, 111, 132, 154, 179, 207, 236, 300, 400];
const kp10Of = (ap) => KP10[APS.reduce((best, v, i) => (Math.abs(v - ap) < Math.abs(APS[best] - ap) ? i : best), 0)];
function expandRows(rows, throughMs) {
  const out = [];
  for (const r of rows) {
    for (let t = out.length ? Date.parse(`${out.at(-1).date}T00:00:00Z`) + DAY : Infinity; t < Date.parse(`${r.date}T00:00:00Z`); t += DAY) out.push({ ...out.at(-1), date: new Date(t).toISOString().slice(0, 10) });
    out.push({ date: r.date, f107: r.f107, c81: r.c81, ap: r.ap });
  }
  for (let t = Date.parse(`${out.at(-1).date}T00:00:00Z`) + DAY; t <= throughMs; t += DAY) out.push({ ...out.at(-1), date: new Date(t).toISOString().slice(0, 10) });
  return out;
}
function cssiText(rows) {
  const lines = rows.map((r, k) => {
    const ap = Math.round(r.ap), kp = kp10Of(ap);
    const [y, m, d] = r.date.split('-');
    return `${pad(y, 4)} ${m} ${d} ${pad(2000 + k, 4)} ${pad((k % 27) + 1, 2)} ${Array(8).fill(pad(kp, 2)).join(' ')} ${pad(8 * kp, 3)} ${Array(8).fill(pad(ap, 3)).join(' ')} ${pad(ap, 3)} ${(ap / 25).toFixed(1).padStart(3)} ${Math.min(9, Math.round(ap / 12))} ${pad(0, 3)} ${r.f107.toFixed(1).padStart(5)} 0 ${r.c81.toFixed(1).padStart(5)} ${r.c81.toFixed(1).padStart(5)} ${r.f107.toFixed(1).padStart(5)} ${r.c81.toFixed(1).padStart(5)} ${r.c81.toFixed(1).padStart(5)}`;
  });
  return ['DATATYPE CssiSpaceWeather', 'VERSION 1.2 ', `UPDATED ${new Date().toUTCString()}`, '# The pair\'s $SPW rows (DSST.md, amendment 4) in the CSSI Space Weather layout; written by experiments/dsst-arm/pair-fits.mjs.',
    '# FORMAT(I4,I3,I3,I5,I3,8I3,I4,8I4,I4,F4.1,I2,I4,F6.1,I2,5F6.1)', `NUM_OBSERVED_POINTS ${lines.length}`, 'BEGIN OBSERVED', ...lines, 'END OBSERVED', '',
    'NUM_DAILY_PREDICTED_POINTS 0', 'BEGIN DAILY_PREDICTED', 'END DAILY_PREDICTED', '', 'NUM_MONTHLY_PREDICTED_POINTS 0', 'BEGIN MONTHLY_PREDICTED', 'END MONTHLY_PREDICTED', '', 'NUM_MONTHLY_FIT_POINTS 0', 'BEGIN MONTHLY_FIT', 'END MONTHLY_FIT', ''].join('\n');
}
function roundTrip(text, rows) {
  const back = text.split('\n').filter((l) => /^\d{4} \d\d \d\d /.test(l)).map((l) => l.trim().split(/\s+/));
  if (back.length !== rows.length) throw new Error(`CSSI round trip: ${back.length} lines for ${rows.length} rows`);
  back.forEach((t, k) => { const r = rows[k]; if (`${t[0]}-${t[1]}-${t[2]}` !== r.date || Number(t[30]) !== Number(r.f107.toFixed(1)) || Number(t[31]) !== Number(r.c81.toFixed(1)) || Number(t[22]) !== Math.round(r.ap)) throw new Error(`CSSI round trip differs on ${r.date}`); });
}

// the registered pairs of this store: source|id|olderStart|newerStart (lib/pairs.mjs pairKey)
const registered = collect();
const thisStore = registered.stores.find((s) => s.store === STORE_NAME);
let KEYS = thisStore.keys.filter((k) => (k.split('|')[0] === 'iss') === ISS);
if (COST) { const sample = new Set(Object.entries(registered.costSample).filter(([k]) => k.startsWith('operator-file|')).flatMap(([, keys]) => keys)); KEYS = KEYS.filter((k) => sample.has(k)); }
const grid = cellGrid();
const parse = (key) => { const t = key.split('|'); return { source: t[0], id: t.slice(1, -2).join('|'), olderStart: t.at(-2), newerStart: t.at(-1) }; };
const wanted = new Set(KEYS.map((k) => { const p = parse(k); return `${p.source}|${p.id}`; }));

/** The files of each wanted object: `${source}|${id}` -> Map(start -> item), from the roots the AP arm's runner read. */
function items() {
  const out = new Map();
  const put = (key, item) => { if (!wanted.has(key)) return; const m = out.get(key) ?? out.set(key, new Map()).get(key); if (!m.has(item.start)) m.set(item.start, item); };
  if (ISS) {
    const archive = '/opt/data/sdn-archive/hac/nasa-iss-oem-archive';
    for (const d of fs.readdirSync(archive).filter((n) => /^2026-0[1-5]-\d\d$/.test(n)).sort()) {
      const file = path.join(archive, d, 'ISS.OEM_J2K_EPH.txt');
      if (!fs.existsSync(file)) continue;
      const first = /^(\d{4}-\d{2}-\d{2}T[\d:.]+)\s/m.exec(fs.readFileSync(file, 'utf8').slice(0, 20000))?.[1];
      if (first) put('iss|25544', { source: 'iss', norad: 25544, object: 'ISS', start: isoMs(Date.parse(`${first}Z`)), file, iss: true });
    }
    return out;
  }
  const roots = LASER ? [[path.join(ROOT, 'ap/b0411/laser'), null]] : [[ROOT, new Set(['iss', 'css'])], [path.join(ROOT, 'vendors'), new Set(['gps', 'glonass', 'planet', 'intelsat', 'ses'])]];
  for (const [root, keep] of roots) {
    for (const c of fs.readdirSync(root).filter((d) => /^c\d{8}T\d{4}$/.test(d) && fs.existsSync(path.join(root, d, 'products'))).sort()) {
      for (const f of fs.readdirSync(path.join(root, c, 'products'))) {
        if (keep && !keep.has(f.split('-')[0])) continue;
        if (!keep && ![...wanted].some((w) => f.startsWith(`${w.split('|')[0].replace(/-(leo|high)$/, '')}-`))) continue;
        const file = path.join(root, c, 'products', f);
        const p = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!p.start || !p.forecastOem) continue;
        put(LASER ? `${p.source}|${p.norad}` : `${p.source}|${p.norad ?? p.object}`, { source: p.source, norad: p.norad, object: p.object, start: p.start, file, weatherDay: p.weatherDay });
      }
    }
  }
  return out;
}
let axes = null;
async function linesOf(item) {
  if (!item.iss) return S.oemLines(Buffer.from(JSON.parse(fs.readFileSync(item.file, 'utf8')).forecastOem, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));
  const raw = [];
  for (const line of fs.readFileSync(item.file, 'utf8').split('\n')) { const t = line.trim().split(/\s+/); if (t.length === 7 && /^\d{4}-\d\d-\d\dT/.test(t[0])) raw.push({ epoch: isoMs(Date.parse(`${t[0]}Z`)), r: t.slice(1, 4).map(Number), v: t.slice(4, 7).map(Number) }); }
  axes ??= await openAxes();
  return axes.convert(raw, 'EME2000', 'GCRF');
}
/** The daily weather rows the AP arm's call for this pair read (amendment 4): score.mjs and providers-run.mjs weather(older.weatherDay); for the ISS, XM's as-issued rows. */
function weatherOf(item, t0) {
  if (!item.iss) return rowsOfSpw(weatherRows(item.weatherDay, WEATHER_FROM, WEATHER_TO).rows);
  const O = W.rowsO(t0 - 72 * HOUR - XMC.conditions.rowsMarginDays * DAY, t0);
  if (O.excluded) throw new Error(`weather: ${O.excluded}`);
  return O.rows;
}

// the JVM workers, as truth-fits.mjs runs them
// The heap bounds (DSST.md, amendments 2026-11-06 (memory), (cost heap) and (heap calibration)): a cost JVM runs on a fixed 8 GiB heap
// with every GC logged; each cost row records the largest heap after a full collection during the window and the JVM's resident set,
// sampled once a second; an accuracy JVM runs under a bound well above the live set. The governor's memory guard drains a JVM by naming its PID in DRAIN: the
// worker takes no further window, and a run left with windows exits 3 so its chain runs the store again later.
const COST_HEAP = '12g', ACCURACY_HEAP = '16g';
if (COST && !COST_HEAP) throw new Error('cost: the fixed heap is not yet registered (DSST.md, amendment 2026-11-06 (memory)); no cost row is written');
const DRAIN = '/Users/tj/software/terrain-work/body-look/claude-dsst-d9/run2/drain.pids';
const drained = (pid) => { try { return fs.readFileSync(DRAIN, 'utf8').split(/\s+/).includes(String(pid)); } catch { return false; } };
const UNIT = { K: 1024, M: 1048576, G: 1073741824 };
/** The largest heap after a full collection between t0 and t1 (ms), from the JVM's GC log (-Xlog:gc:file=...:utctime); null when none ran. */
function fullGcHeapMax(file, t0, t1) {
  let best = null;
  for (const l of (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n')) {
    const m = /^\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+)([+-]\d\d)(\d\d)\].*Pause Full.* (\d+)([KMG])->(\d+)([KMG])\(/.exec(l);
    if (!m) continue;
    const t = Date.parse(`${m[1]}${m[2]}:${m[3]}`);
    if (t < t0 || t > t1) continue;
    const after = Number(m[6]) * UNIT[m[7]];
    if (best === null || after > best) best = after;
  }
  return best;
}
/** The collection time (s) between t0 and t1 (ms): the sum of the logged pause times; the serial collector runs on the one processor. */
function gcSeconds(file, t0, t1) {
  let ms = 0;
  for (const l of (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n')) {
    const m = /^\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+)([+-]\d\d)(\d\d)\].*Pause.* ([\d.]+)ms$/.exec(l);
    if (!m) continue;
    const t = Date.parse(`${m[1]}${m[2]}:${m[3]}`);
    if (t >= t0 && t <= t1) ms += Number(m[4]);
  }
  return ms / 1000;
}
/** Samples the cost JVM's resident set once a second (the JVM is the child of /usr/bin/time, which execs nice, which execs java). */
function rssSampler(wk) {
  wk.javaPid ??= execFileSync('pgrep', ['-P', String(wk.pid)]).toString().trim().split('\n')[0];
  const out = { max: null };
  const sample = () => { try { const kb = Number(execFileSync('ps', ['-o', 'rss=', '-p', wk.javaPid]).toString().trim()); if (kb > 0) out.max = Math.max(out.max ?? 0, kb * 1024); } catch {} };
  sample();
  const timer = setInterval(sample, 1000);
  out.stop = () => { clearInterval(timer); sample(); return out.max; };
  return out;
}
function worker(id) {
  const gcLog = path.join(SCRATCH, `gc-${process.pid}-${id}.log`);
  const jvmArgs = ['-cp', `${JARS}/*`, ...(COST ? ['-XX:ActiveProcessorCount=1', '-XX:+UseSerialGC', `-Xms${COST_HEAP}`, `-Xmx${COST_HEAP}`, `-Xlog:gc:file=${gcLog}:utctime`] : [`-Xmx${ACCURACY_HEAP}`]), DRIVER, COMMON];
  const cmd = COST ? '/usr/bin/time' : 'nice', pre = COST ? ['-l', 'nice', '-n', '10', JAVA] : ['-n', '10', JAVA];
  const child = spawn(cmd, [...pre, ...jvmArgs], { stdio: ['pipe', 'pipe', 'pipe'] });
  const queue = []; let buf = '', err = '';
  child.stdout.on('data', (d) => { buf += d; let at; while ((at = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, at); buf = buf.slice(at + 1); const next = queue.shift(); if (next) next.resolve(line); } });
  child.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
  const exit = new Promise((resolve) => child.on('exit', (code) => { for (const q of queue.splice(0)) q.reject(new Error(`worker ${id} exited ${code}: ${err.slice(-400)}`)); resolve(code); }));
  return { id, pid: child.pid, gcLog, run: (file) => new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(`${file}\n`); }), close: async () => { child.stdin.end(); await exit; return err; } };
}
function readResponse(file) {
  const out = { states: [] };
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = l.trim().split(/\s+/);
    if (t[0] === 'status') { out.status = t[1]; if (t[1] !== 'ok') out.error = t.slice(2).join(' '); }
    else if (t[0] === 'state') out.states.push({ epoch: t[1], r: t.slice(2, 5).map(Number), v: t.slice(5, 8).map(Number) });
    else if (t[0] === 'mean') out.mean = { a: Number(t[1]), ex: Number(t[2]), ey: Number(t[3]), hx: Number(t[4]), hy: Number(t[5]), lM: Number(t[6]) };
    else if (t[0] === 'cost') out.cost = { fitCpuS: Number(t[1]) / 1e9, fitWallS: Number(t[2]) / 1e9, flightCpuS: Number(t[3]) / 1e9, flightWallS: Number(t[4]) / 1e9, peakHeapBytes: Number(t[5]), flightPath: t[6] };
    else if (t[0]) out[t[0]] = t.length === 2 ? (Number.isFinite(Number(t[1])) ? Number(t[1]) : t[1]) : t.slice(1).join(' ');
  }
  return out;
}
const rmsOf = (e) => Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);

async function main() {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SCRATCH, { recursive: true });
  const outFile = path.join(OUT, `rows-${TAG}.jsonl`);
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.key}@${r.fit}`; }) : []);
  const files = items();
  const jobs = [];
  for (const key of KEYS) {
    const p = parse(key), list = files.get(`${p.source}|${p.id}`);
    const older = list?.get(p.olderStart), newer = list?.get(p.newerStart);
    const regime = regimeOf({ group: p.source, object: older?.object ?? '' });
    const cell = grid[`next|${regime}`];
    for (const fit of cell?.fits ?? [0]) if (!done.has(`${key}@${fit}`)) jobs.push({ key, p, older, newer, regime, cell, fit });
  }
  jobs.splice(LIMIT);
  console.error(`${STORE_NAME}${ISS ? ' (ISS)' : ''}: ${KEYS.length} pairs, ${jobs.length} fits to run, ${WORKERS} JVM(s)${COST ? ', cost mode' : ''}`);
  if (!jobs.length) return;
  const m = await openModules();
  const workers = DRY ? [{ run: async () => 'dry' }] : Array.from({ length: WORKERS }, (_, i) => worker(i));
  if (!DRY) { console.error(`JVM PIDs: ${workers.map((w) => w.pid).join(' ')}`); fs.writeFileSync(path.join(SCRATCH, 'pids.txt'), workers.map((w) => w.pid).join('\n') + '\n'); }
  // unscored: a pair the AP arm's runner also leaves unscored (the file shorter than the fit, a lead outside the cells' bins, an excluded
  // weather span), and a pair whose reference starts inside the fit (forward error only: a lead counts from the fit's end)
  const UNSCORED = /^(file shorter|lead bin|weather: |no reference|inside the fit)/;
  const fitOne = async (wk, job) => {
    const { key, p, older, newer, regime, cell, fit } = job;
    const leadHours = (Date.parse(p.newerStart) - Date.parse(p.olderStart)) / HOUR, lead = binOf(leadHours);
    const row = { key, store: STORE_NAME, reference: 'next', input: 'operator-file', regime, group: p.source, norad: older?.norad ?? null, name: older?.object ?? p.id, cutoff: p.olderStart, olderStart: p.olderStart, newerStart: p.newerStart, leadHours, lead, fit, writtenAt: null, build: BUILD };
    try {
      if (!older || !newer) throw new Error(`a file of the pair is missing (${older ? 'newer' : 'older'})`);
      if (!cell) throw new Error(`no cell for regime ${regime}`);
      if (!cell.leads.includes(lead)) throw new Error(`lead bin: ${leadHours} h is outside the cells' bins`);
      const table = await linesOf(older), nl = await linesOf(newer);
      const t0 = Date.parse(table[0].epoch), end = t0 + fit * HOUR;
      if (Date.parse(table.at(-1).epoch) - t0 < fit * HOUR) throw new Error('file shorter than the fit');
      const seg = table.filter((l) => Date.parse(l.epoch) <= end);
      if (seg.length < 7) throw new Error(`file shorter than the fit: ${seg.length} states`);
      const n0 = LASER ? Date.parse(newer.start) : Date.parse(nl[0].epoch);
      const truth = nl.filter((l) => Date.parse(l.epoch) <= n0 + TRUTH_H * HOUR);
      if (truth.length < 2) throw new Error('no reference states');
      if (Date.parse(truth[0].epoch) < end - 60000) throw new Error(`inside the fit: the reference starts ${((end - Date.parse(truth[0].epoch)) / HOUR).toFixed(2)} h before the fit's end`);
      const epochs = truth.map((l) => l.epoch);
      const dir = path.join(SCRATCH, `${key.replace(/[^A-Za-z0-9._-]/g, '_')}@${fit}`);
      fs.mkdirSync(dir, { recursive: true });
      const rows = weatherOf(older, t0);
      const spw = fitWeather(rows, horizonOf(end));
      const daily = expandRows(rows, horizonOf(end));
      const text = cssiText(daily);
      roundTrip(text, daily);
      fs.writeFileSync(path.join(dir, 'SpaceWeather-All-v1.2.txt'), text);
      row.spwSha256 = sha256(Buffer.from(spw)); row.cssiSha256 = sha256(text); row.spwDays = daily.length;
      const finals = finalsText(Date.parse(seg[0].epoch), Date.parse(epochs.at(-1)));
      fs.writeFileSync(path.join(dir, 'finals2000A.all'), finals);
      row.eopSha256 = sha256(finals); row.eopTableSha256 = EOP_TABLE_SHA;
      const req = path.join(dir, 'request.txt');
      fs.writeFileSync(req, [`key ${key}`, `cutoff ${isoMs(end)}`, `fit ${fit}`, `dragBelowKm ${DRAG_BELOW_KM}`, `window ${dir}`, `arc ${seg.length}`, ...seg.map((l) => `${l.epoch} ${l.r.join(' ')} ${l.v.join(' ')}`), `out ${epochs.length}`, ...epochs].join('\n') + '\n');
      if (DRY) { fs.rmSync(dir, { recursive: true, force: true }); return { ...row, dry: `arc ${seg.length} out ${epochs.length} weather ${daily.length} d` }; }
      const load = os.loadavg()[0], t0w = Date.now(), rss = COST ? rssSampler(wk) : null;
      const reply = await wk.run(req);
      const t1w = Date.now(), rssMaxBytes = rss ? rss.stop() : null;
      const res = readResponse(`${req}.out`);
      if (res.status !== 'ok') throw new Error(`fit: ${res.error ?? reply}`);
      if (res.states.length !== epochs.length) throw new Error(`flight returned ${res.states.length} of ${epochs.length} states`);
      const e = await m.rtn(res.states.map((s) => ({ r: s.r, v: s.v })), truth.map((l) => ({ r: l.r, v: l.v })));
      const ric = [0, 1, 2].map((c) => rmsOf(e.map((x) => x[c])));
      if (!ric.every(Number.isFinite)) throw new Error('non-finite state at a scored epoch');
      Object.assign(row, { drag: res.drag === 1, perigeeKm: res.perigeeKm, converged: true, iterations: res.iterations, evaluations: res.evaluations, rmsM: res.rms_m, cdAm: res.drag === 1 ? res.cd : null, crAm: res.drag === 1 ? 0.01 : res.cr, epoch: res.epoch, mean: res.mean, arcStates: seg.length,
        leads: { [lead]: { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2], states: truth.length } },
        ephemerisGapM: String(res.ephemerisGapM ?? '').split(' ').map(Number),
        cost: { ...res.cost, objectDays: (Date.parse(epochs.at(-1)) - end) / DAY, stepSeconds: (Date.parse(seg[1].epoch) - Date.parse(seg[0].epoch)) / 1000, singleThread: COST, load1: [load, os.loadavg()[0]], heapBound: COST ? COST_HEAP : ACCURACY_HEAP, heapAfterFullGcMaxBytes: COST ? fullGcHeapMax(wk.gcLog, t0w, t1w) : null, rssMaxBytes, gcSeconds: COST ? gcSeconds(wk.gcLog, t0w, t1w) : null } });
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) { const why = String(error?.message ?? error).slice(0, 300); if (UNSCORED.test(why)) row.unscored = why; else { row.failed = true; row.error = why; } }
    return row;
  };
  let next = 0, written = 0, failed = 0;
  if (DRY) {
    const tally = {};
    for (const job of jobs) { const r = await fitOne(workers[0], job); const k = r.dry ? `ready ${r.regime} fit ${r.fit} lead ${r.lead}` : r.unscored ? `unscored ${r.unscored.replace(/[\d.]+ h/g, 'x h').slice(0, 60)}` : `failed ${r.error.slice(0, 80)}`; tally[k] = (tally[k] ?? 0) + 1; }
    for (const [k, n] of Object.entries(tally).sort()) console.log(`${n}\t${k}`);
    await axes?.close?.(); await m.close?.();
    return;
  }
  // cost mode: one uncounted pair warms the JVM (DSST.md, Cost); its row is not written
  if (COST) await fitOne(workers[0], jobs[0]);
  const one = async (wk) => {
    for (;;) {
      if (drained(wk.pid)) return;
      const job = jobs[next++];
      if (!job) return;
      const row = await fitOne(wk, job);
      if (row.failed) failed += 1;
      row.writtenAt = new Date().toISOString();
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      written += 1;
      if (written % 25 === 0) console.error(`${new Date().toISOString()} ${TAG}: ${written}/${jobs.length} rows, ${failed} failed`);
    }
  };
  await Promise.all(workers.map(one));
  remaining = Math.max(0, jobs.length - next);
  const errs = await Promise.all(workers.map((wk) => wk.close()));
  if (COST) { const rss = /(\d+)\s+maximum resident set size/.exec(errs[0]); fs.writeFileSync(path.join(OUT, `cost-${TAG.replace(/-cost$/, '')}.json`), `${JSON.stringify({ store: `${STORE_NAME}${ISS ? ' (ISS)' : ''}`, maxRssBytes: rss ? Number(rss[1]) : null, jvm: jvmVersion, machine: 'Mac Studio, Apple M3 Ultra, 28 cores', flags: ['-XX:ActiveProcessorCount=1', '-XX:+UseSerialGC', 'nice -n 10'], rows: written }, null, 1)}\n`); }
  console.error(`${TAG}: ${written} rows written, ${failed} failed`);
  await axes?.close?.();
  await m.close?.();
}
let remaining = 0;
await main();
if (remaining) console.error(`drained: ${remaining} windows left for a later run`);
process.exit(remaining ? 3 : 0);
