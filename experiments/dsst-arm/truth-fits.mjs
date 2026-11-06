// The DSST arm's run on the precise-orbit stores (DSST.md as amended 2026-11-05): each window's arc, truth grid, weather and Earth
// orientation through the readers the AP arm's runners used (experiments/operator-theory/ap-truth.mjs, all-regimes.mjs), the fit and
// flight in DsstArm.java, the flight scored by lib/modules.mjs rtn. Reading, selection and bookkeeping only; no physics here.
//   node experiments/dsst-arm/truth-fits.mjs --store ap/b051/regimes [--workers 6] [--cost] [--limit n]
//   ap/b051/truth2 needs XP2F_CONTROL=1 (AP2.md's windows, store and truth), as ap-truth.mjs --xm does.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { collect, regimeOf } from './windows.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const STORE_NAME = args.store;
if (!STORE_NAME) throw new Error('--store <ap/b051/...>');
const COST = args.cost === 'true';
const WORKERS = COST ? 1 : Math.min(6, Number(args.workers ?? 6));
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const OUT = '/opt/data/sdn-archive/operator-theory/dsst-arm';
const SCRATCH = `/Users/tj/software/terrain-work/body-look/claude-dsst-d9/run/${STORE_NAME.replace(/\//g, '-')}${COST ? '-cost' : ''}`;
const COMMON = '/Users/tj/software/terrain-work/body-look/claude-dsst-d9/data/common';
const JARS = '/Users/tj/software/gmat09-authority/jars';
const JAVA = '/opt/homebrew/opt/openjdk/bin/java';
const DRIVER = path.join(here, 'DsstArm.java');
const EOP_TABLE = '/opt/data/sdn-archive/sdn-ap-baselines/environment/environment.json';
const EOP_TABLE_SHA = '520b825d61e64418d1904a482da49c647cb2f92765c9df736d14d90a6e61dcf6';
const DRAG_BELOW_KM = 2500;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// the registration pins (DSST.md, amendment 9)
export const JAR_SHA256 = {
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
const { config: X2, root, HOUR, DAY, iso, ms, rms, XM, windows: x2windows } = await import(pathToFileURL(path.join(OT, 'lib/xp2.mjs')).href);
const { fitWeather, horizonOf } = await import(pathToFileURL(path.join(OT, 'lib/ap.mjs')).href);
const { STATIC, MGEX_CUTOFFS, TESS, WA_CUTOFFS, HX, windowKey } = await import(pathToFileURL(path.join(OT, 'lib/regimes.mjs')).href);
const T = await import(path.join(root, X2.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, X2.xm.dir, 'lib/weather.mjs'));
const { openModules } = await import(path.join(root, X2.xm.dir, 'lib/modules.mjs'));
const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
// AP9.md's 2026 RSGA sources, as all-regimes.mjs added them for 2026 cutoffs
XM.config.spaceWeather.rsgaDirs = [...new Set([...XM.config.spaceWeather.rsgaDirs, '/opt/data/sdn-archive/hac/noaa-swpc/warehouse/2026/RSGA', '/opt/data/sdn-archive/hac/noaa-swpc/2026'])];

// the Earth-orientation table every FFM arm read (amendment 6)
const eopRaw = fs.readFileSync(EOP_TABLE);
if (sha256(eopRaw) !== EOP_TABLE_SHA) throw new Error(`${EOP_TABLE} is not the registered table`);
const EOP = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(Buffer.from(JSON.parse(eopRaw.toString('utf8')).inputs.earth_orientation_finals, 'base64')))).unpack().EARTH_ORIENTATION.ROWS;
const mjdOf = (t) => Math.floor(t / DAY) + 40587;
const ARCSEC = Math.PI / 648000, MAS = ARCSEC / 1000;
const pad = (v, w) => String(v).padStart(w);
const fix = (v, w, d) => Number(v).toFixed(d).padStart(w);
/** The slice [MJD(from - 2 d) - 1, MJD(to + 2 d) + 1] as one IAU 2000 finals-format file (the columns Orekit's loader reads). */
function finalsText(fromMs, toMs) {
  const lo = mjdOf(fromMs - 2 * DAY) - 1, hi = mjdOf(toMs + 2 * DAY) + 1;
  const rows = EOP.filter((r) => r.MJD >= lo && r.MJD <= hi);
  if (!rows.length || rows.at(-1).MJD < mjdOf(toMs)) throw new Error(`Earth orientation ends before ${iso(toMs)}`);
  return rows.map((r) => {
    const d = new Date((r.MJD - 40587) * DAY);
    const yy = pad(d.getUTCFullYear() % 100, 2).replace(/ /g, '0'), mm = pad(d.getUTCMonth() + 1, 2), dd = pad(d.getUTCDate(), 2);
    return `${yy}${mm}${dd} ${fix(r.MJD, 8, 2)} I ${fix(r.X_POLE_WANDER_RADIANS / ARCSEC, 9, 6)}${fix(0, 9, 6)} ${fix(r.Y_POLE_WANDER_RADIANS / ARCSEC, 9, 6)}${fix(0, 9, 6)}  I${fix(r.UT1_MINUS_UTC_SECONDS, 10, 7)}${fix(0, 10, 7)} ${fix(r.LENGTH_OF_DAY_CORRECTION_SECONDS * 1000, 7, 4)}${fix(0, 7, 4)}  I ${fix(r.X_CELESTIAL_POLE_OFFSET_RADIANS / MAS, 9, 3)}${fix(0, 9, 3)} ${fix(r.Y_CELESTIAL_POLE_OFFSET_RADIANS / MAS, 9, 3)}${fix(0, 9, 3)}`;
  }).join('\n') + '\n';
}

// the weather: fitWeather's expansion of the AP call's rows (fill a missing day with the day before, hold the last through the horizon),
// written in the CSSI layout the FFM suite writes for Orekit (tests/fixtures/orekit/make-synthetic-weather.mjs)
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
  return ['DATATYPE CssiSpaceWeather', 'VERSION 1.2 ', `UPDATED ${new Date().toUTCString()}`, '# The window\'s $SPW rows (DSST.md, amendment 4) in the CSSI Space Weather layout; written by experiments/dsst-arm/truth-fits.mjs.',
    '# FORMAT(I4,I3,I3,I5,I3,8I3,I4,8I4,I4,F4.1,I2,I4,F6.1,I2,5F6.1)', `NUM_OBSERVED_POINTS ${lines.length}`, 'BEGIN OBSERVED', ...lines, 'END OBSERVED', '',
    'NUM_DAILY_PREDICTED_POINTS 0', 'BEGIN DAILY_PREDICTED', 'END DAILY_PREDICTED', '', 'NUM_MONTHLY_PREDICTED_POINTS 0', 'BEGIN MONTHLY_PREDICTED', 'END MONTHLY_PREDICTED', '', 'NUM_MONTHLY_FIT_POINTS 0', 'BEGIN MONTHLY_FIT', 'END MONTHLY_FIT', ''].join('\n');
}
/** Amendment 4's round trip: the CSSI lines read back must give the rows' F10.7, 81-day mean and Ap to the written precision. */
function roundTrip(text, rows) {
  const back = text.split('\n').filter((l) => /^\d{4} \d\d \d\d /.test(l)).map((l) => l.trim().split(/\s+/));
  if (back.length !== rows.length) throw new Error(`CSSI round trip: ${back.length} lines for ${rows.length} rows`);
  back.forEach((t, k) => { const r = rows[k]; if (`${t[0]}-${t[1]}-${t[2]}` !== r.date || Number(t[30]) !== Number(r.f107.toFixed(1)) || Number(t[31]) !== Number(r.c81.toFixed(1)) || Number(t[22]) !== Math.round(r.ap)) throw new Error(`CSSI round trip differs on ${r.date}`); });
}

// the windows of the store
const registered = collect();
const thisStore = registered.stores.find((s) => s.store === STORE_NAME);
if (!thisStore) throw new Error(`${STORE_NAME} is not a registered store`);
const KEYS = new Set(thisStore.keys);
const inShard = () => true;
/** [{ key, group, name, norad, objectId, lines | series(o), arcs, cutoffMs, vacuum }] for this store's registered windows. */
async function windowsOf() {
  const out = [];
  if (STORE_NAME === 'ap/b051/truth') {
    for (const w of [...x2windows('extension'), ...x2windows('primary')]) if (KEYS.has(w.key)) out.push({ key: w.key, group: 'P', name: w.o.name, norad: w.o.norad, objectId: w.o.objectId ?? '', o: w.o, arcs: [24], cutoffMs: w.cutoffMs });
    return out;
  }
  if (STORE_NAME === 'ap/b051/truth2') {
    if (process.env.XP2F_CONTROL !== '1') throw new Error('ap/b051/truth2 runs with XP2F_CONTROL=1 (AP2.md\'s windows, store and truth)');
    for (const [group, g] of Object.entries(XM.config.groups)) for (const o of g.objects) for (const t of XM.daysOf(XM.config.period.from, XM.config.period.to)) {
      const key = `${group}|${o.norad}|${XM.dateOf(t)}`;
      if (KEYS.has(key)) out.push({ key, group, name: o.name, norad: o.norad, objectId: o.objectId ?? '', o, arcs: [24, 72], cutoffMs: t });
    }
    return out;
  }
  // all-regimes.mjs's objects(), the groups of this store
  const objects = [];
  const groups = STORE_NAME === 'ap/b051/regimes' ? ['LS', 'DO', 'GD', 'IG', 'GE', 'HE'] : STORE_NAME === 'ap/b051/regimes-hx' ? ['HX'] : ['WA'];
  const wanted = (group, name, t) => KEYS.has(windowKey(group, name, t));
  for (const o of STATIC.filter((x) => groups.includes(x.group))) {
    const files = o.files();
    if (!files.length) continue;
    const series = SRC.chain(files);
    objects.push({ group: o.group, name: series.name || o.name, norad: series.norad, objectId: series.objectId ?? '', lines: series.lines, arcs: o.arcs, cutoffs: o.cutoffs });
  }
  if (groups.includes('WA')) {
    const { SBAS, series } = await import(pathToFileURL(path.join(OT, 'lib/sbas.mjs')).href);
    for (const [prn, sat] of Object.entries(SBAS)) {
      if (!WA_CUTOFFS.some((t) => wanted('WA', sat.name, t))) continue;
      objects.push({ group: 'WA', name: sat.name, norad: sat.norad, objectId: '', lines: await series(Number(prn), WA_CUTOFFS[0] - 3 * DAY, WA_CUTOFFS.at(-1) + 7 * DAY + DAY), arcs: [24, 72], cutoffs: WA_CUTOFFS, vacuum: true });
    }
  }
  for (const [group, klass] of [['IG', 'igso'], ['GE', 'geo']]) {
    if (!groups.includes(group)) continue;
    for (const o of SRC.mgex({ klass })) objects.push({ group, name: o.name, norad: o.norad, objectId: o.objectId ?? '', lines: o.lines, arcs: [72], cutoffs: MGEX_CUTOFFS });
  }
  const spkOnGrid = async (lines, axes) => {
    const norm = lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
    const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
    const thin = norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % GRID === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() }));
    return axes.convert(thin, 'EME2000', 'GCRF');
  };
  if (groups.includes('HE') && TESS.cutoffs.some((t) => wanted('HE', TESS.name, t))) {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    const { openAxes } = await import(pathToFileURL(path.join(OT, 'lib/host.mjs')).href);
    const files = fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f));
    const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: TESS.name, norad: TESS.norad, fromUtc: TESS.from, toUtc: TESS.to, stride: 1 });
    const axes = await openAxes();
    objects.push({ group: 'HE', name: TESS.name, norad: TESS.norad, objectId: TESS.objectId, lines: await spkOnGrid(s.lines, axes), arcs: TESS.arcs, cutoffs: TESS.cutoffs, vacuum: true });
    await axes.close();
  }
  if (groups.includes('HX')) {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    const { openAxes } = await import(pathToFileURL(path.join(OT, 'lib/host.mjs')).href);
    const axes = await openAxes();
    for (const h of HX) {
      if (!h.cutoffs.some((t) => wanted('HX', h.name, t))) continue;
      const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files: [h.file], source: 'ap6-heo', id: h.id, name: h.name, norad: h.norad, fromUtc: h.from, toUtc: h.to, stride: 1 });
      objects.push({ group: 'HX', name: h.name, norad: h.norad, objectId: h.objectId, lines: await spkOnGrid(s.lines, axes), arcs: h.arcs, cutoffs: h.cutoffs, vacuum: true });
    }
    await axes.close();
  }
  for (const o of objects) for (const D0 of o.cutoffs) { const key = windowKey(o.group, o.name, D0); if (KEYS.has(key)) out.push({ ...o, key, cutoffMs: D0, cutoffs: undefined }); }
  return out;
}

// the JVM workers
// The heap bounds (DSST.md, amendment 2026-11-06 (memory)): a cost JVM runs on a fixed heap, 4x the largest live set of the grid-check
// windows, with every GC logged, so DSST's peak memory is the largest heap used after a GC during the window's fit and flight; an
// accuracy JVM runs under a bound well above the live set. The governor's memory guard drains a JVM by naming its PID in DRAIN: the
// worker takes no further window, and a run left with windows exits 3 so its chain runs the store again later.
const COST_HEAP = '', ACCURACY_HEAP = '16g';
if (COST && !COST_HEAP) throw new Error('cost: the fixed heap is not yet registered (DSST.md, amendment 2026-11-06 (memory)); no cost row is written');
const DRAIN = '/Users/tj/software/terrain-work/body-look/claude-dsst-d9/run2/drain.pids';
const drained = (pid) => { try { return fs.readFileSync(DRAIN, 'utf8').split(/\s+/).includes(String(pid)); } catch { return false; } };
const UNIT = { K: 1024, M: 1048576, G: 1073741824 };
/** The largest heap used after a GC between t0 and t1 (ms), from the JVM's GC log (-Xlog:gc:file=...:utctime); null when none ran. */
function liveHeapMax(file, t0, t1) {
  let best = null;
  for (const l of (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n')) {
    const m = /^\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+)([+-]\d\d)(\d\d)\].*Pause.* (\d+)([KMG])->(\d+)([KMG])\(/.exec(l);
    if (!m) continue;
    const t = Date.parse(`${m[1]}${m[2]}:${m[3]}`);
    if (t < t0 || t > t1) continue;
    const after = Number(m[6]) * UNIT[m[7]];
    if (best === null || after > best) best = after;
  }
  return best;
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SCRATCH, { recursive: true });
  const outFile = path.join(OUT, `rows-${STORE_NAME.replace(/\//g, '-')}${COST ? '-cost' : ''}.jsonl`);
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.key}@${r.fit}`; }) : []);
  let list = await windowsOf();
  if (COST) { const sample = new Set(Object.entries(registered.costSample).filter(([k]) => k.startsWith('precise-orbit|')).flatMap(([, keys]) => keys)); list = list.filter((w) => sample.has(w.key)); }
  const jobs = list.flatMap((w) => w.arcs.map((hours) => ({ w, hours }))).filter((j) => !done.has(`${j.w.key}@${j.hours}`)).slice(0, LIMIT);
  console.error(`${STORE_NAME}: ${list.length} windows, ${jobs.length} fits to run, ${WORKERS} JVM(s)${COST ? ', cost mode' : ''}`);
  if (!jobs.length) return;
  const m = await openModules();
  const workers = Array.from({ length: WORKERS }, (_, i) => worker(i));
  console.error(`JVM PIDs: ${workers.map((w) => w.pid).join(' ')}`);
  fs.writeFileSync(path.join(SCRATCH, 'pids.txt'), workers.map((w) => w.pid).join('\n') + '\n');
  let next = 0, written = 0, failed = 0;
  // a window the AP arm also left unscored (no lead bin, arc coverage, an excluded weather span) is an unscored row, not a failed fit
  const UNSCORED = /^(no lead bin|coverage|weather: )/;
  /** One window's fit and flight: the row. */
  const fitOne = async (wk, job) => {
      const { w, hours } = job, D0 = w.cutoffMs;
      const row = { key: w.key, store: STORE_NAME, reference: 'truth', input: 'precise-orbit', regime: regimeOf({ group: w.group, at: D0 }), group: w.group, norad: w.norad, name: w.name, cutoff: iso(D0), fit: hours, writtenAt: null, build: BUILD };
      try {
        const lines = w.o ? null : w.lines;
        const times = lines ? lines.map((l) => ms(l.epoch)) : null;
        const between = (a, b) => (lines ? lines.filter((l, i) => times[i] >= a && times[i] <= b) : T.series(w.o, a, b).lines);
        const stepMs = lines && times.length > 1 ? times[1] - times[0] : GRID;
        const gridMs = lines ? Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs) : GRID;
        const minBin = lines ? Math.ceil((MIN_BIN / (DAY / GRID)) * (DAY / gridMs)) : MIN_BIN;
        const after = between(D0 + 1, D0 + 7 * DAY);
        const first = after.length ? ms(after[0].epoch) : 0;
        const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
        const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
        const entered = LEADS.filter((k) => bins[k].length >= minBin);
        if (!entered.length) throw new Error('no lead bin');
        const scored = entered.flatMap((k) => bins[k]);
        const epochs = scored.map((l) => l.epoch), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
        const raw = between(D0 - hours * HOUR, D0);
        const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0;
        if (coverage < MIN_COV) throw new Error('coverage');
        const thin = T.thinned(raw).chosen;
        const dir = path.join(SCRATCH, `${w.key.replace(/[^A-Za-z0-9._-]/g, '_')}@${hours}`);
        fs.mkdirSync(dir, { recursive: true });
        if (!w.vacuum) {
          const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
          if (R.excluded) throw new Error(`weather: ${R.excluded}`);
          const spw = fitWeather(R.rows, horizonOf(D0));
          const rows = expandRows(R.rows, horizonOf(D0));
          const text = cssiText(rows);
          roundTrip(text, rows);
          fs.writeFileSync(path.join(dir, 'SpaceWeather-All-v1.2.txt'), text);
          row.spwSha256 = sha256(Buffer.from(spw)); row.cssiSha256 = sha256(text); row.spwDays = rows.length;
        } else { row.spwSha256 = null; row.cssiSha256 = null; }
        const finals = finalsText(ms(thin[0].epoch), ms(epochs.at(-1)));
        fs.writeFileSync(path.join(dir, 'finals2000A.all'), finals);
        row.eopSha256 = sha256(finals); row.eopTableSha256 = EOP_TABLE_SHA;
        const req = path.join(dir, 'request.txt');
        fs.writeFileSync(req, [`key ${w.key}`, `cutoff ${iso(D0)}`, `fit ${hours}`, `dragBelowKm ${DRAG_BELOW_KM}`, `window ${dir}`, `arc ${thin.length}`, ...thin.map((l) => `${l.epoch} ${l.r.join(' ')} ${l.v.join(' ')}`), `out ${epochs.length}`, ...epochs].join('\n') + '\n');
        const load = os.loadavg()[0], t0w = Date.now();
        const reply = await wk.run(req);
        const t1w = Date.now();
        const res = readResponse(`${req}.out`);
        if (res.status !== 'ok') throw new Error(`fit: ${res.error ?? reply}`);
        if (res.states.length !== epochs.length) throw new Error(`flight returned ${res.states.length} of ${epochs.length} states`);
        const e = await m.rtn(res.states.map((s) => ({ r: s.r, v: s.v })), truth);
        const leads = {}; let i = 0;
        entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); leads[k * 24] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2], states: sizes[j] }; });
        if (Object.values(leads).some((x) => !Number.isFinite(x.e))) throw new Error('non-finite state at a scored epoch');
        Object.assign(row, { drag: res.drag === 1, perigeeKm: res.perigeeKm, converged: true, iterations: res.iterations, evaluations: res.evaluations, rmsM: res.rms_m, cdAm: res.drag === 1 ? res.cd : null, crAm: res.drag === 1 ? 0.01 : res.cr, epoch: res.epoch, mean: res.mean, arcStates: thin.length, leads,
          ephemerisGapM: String(res.ephemerisGapM ?? '').split(' ').map(Number),
          cost: { ...res.cost, objectDays: (ms(epochs.at(-1)) - D0) / DAY, stepSeconds: gridMs / 1000, singleThread: COST, load1: [load, os.loadavg()[0]], heapBound: COST ? COST_HEAP : ACCURACY_HEAP, liveHeapMaxBytes: COST ? liveHeapMax(wk.gcLog, t0w, t1w) : null } });
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (error) { const why = String(error?.message ?? error).slice(0, 300); if (UNSCORED.test(why)) row.unscored = why; else { row.failed = true; row.error = why; } }
      return row;
  };
  // cost mode: one uncounted window warms the JVM (DSST.md, Cost); its row is not written
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
      if (written % 25 === 0) console.error(`${new Date().toISOString()} ${STORE_NAME}: ${written}/${jobs.length} rows, ${failed} failed`);
    }
  };
  await Promise.all(workers.map(one));
  remaining = Math.max(0, jobs.length - next);
  const errs = await Promise.all(workers.map((wk) => wk.close()));
  if (COST) { const rss = /(\d+)\s+maximum resident set size/.exec(errs[0]); fs.writeFileSync(path.join(OUT, `cost-${STORE_NAME.replace(/\//g, '-')}.json`), `${JSON.stringify({ store: STORE_NAME, maxRssBytes: rss ? Number(rss[1]) : null, jvm: jvmVersion, machine: 'Mac Studio, Apple M3 Ultra, 28 cores', flags: ['-XX:ActiveProcessorCount=1', '-XX:+UseSerialGC', 'nice -n 10'], rows: written }, null, 1)}\n`); }
  console.error(`${STORE_NAME}: ${written} rows written, ${failed} failed`);
  await m.close?.();
}
let remaining = 0;
await main();
if (remaining) console.error(`drained: ${remaining} windows left for a later run`);
process.exit(remaining ? 3 : 0);
