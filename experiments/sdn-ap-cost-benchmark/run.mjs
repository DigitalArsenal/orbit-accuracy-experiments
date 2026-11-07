// BENCHMARK.md: the registered cost benchmark on the current builds. Phases: fits | flights | memory | tables | --check.
//   SDN_MODULES_ROOT=<modules clone holding the run's commits> node experiments/sdn-ap-cost-benchmark/run.mjs fits --run <run>   one child process per arm
//   ... run.mjs flights --run <run>   the fitted products flown 7 days at 300 s, one child per arm
//   ... run.mjs memory --run <run>    module bytes, peak wasm pages, RSS and product bytes per arm, from the children's records
//   ... run.mjs tables                results/sdn-ap-cost-benchmark/table.json and README.md from every run's stored rows
//   ... run.mjs --check               the table reproduces byte for byte from the rows; every build by dist hash; the step named; no catalog count
// --run <R>: one of RUNS (the registered run a13cb468, or a shipped build of the 2026-11-06 amendment; default a13cb468). --arm <A>: a child (one arm).
// --only k1,k2: those window keys. --arms A,B: those arms. --rows <dir>: another row directory (a trial, never the record).
// Arm definitions are the harness's (experiments/operator-theory: compare-costs.mjs, all-regimes.mjs ffmHigh, lib/ap.mjs, lib/ussf-xp.mjs, lib/xp2.mjs,
// lib/host.mjs); every state comes from a module; this file moves bytes, thins the arc and times.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { windows as registeredWindows, STORE } from './windows.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'results/sdn-ap-cost-benchmark');
const args = Object.fromEntries(process.argv.slice(3).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const PHASE = process.argv[2];
const ROWS_ROOT = path.join(STORE, 'sdn-ap-cost-benchmark');
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const HOUR = 3600000, DAY = 86400000;
export const STEP_SECONDS = 300, FIT_HOURS = 48, FLIGHT_DAYS = 7, HIGH_KM = 8400, MIN_COVERAGE = 0.9;
export const FIT_STATES = (FIT_HOURS * 3600) / STEP_SECONDS + 1, FLIGHT_STATES = (FLIGHT_DAYS * 86400) / STEP_SECONDS;
const MODULES_COMMIT = '890c8655f2d268067ab3148813b5eab2aabc6849';
/** BENCHMARK.md's registered builds (a13cb468): each wasm by git show at its commit, SHA-256 checked before it is loaded. */
export const REGISTERED_BUILDS = {
  'propagator/sdn-ap': { version: '0.5.2', commit: MODULES_COMMIT, sha256: '74388314396a8f8c4bc962b63566b01ee8a99e1d8a295e8233fac36d5683500d' },
  'propagator/sgp4-xp': { version: '0.2.2', commit: MODULES_COMMIT, sha256: '1f8aa4c7e3c01a9eb6c499a6730be827afee2b969f535410af32c74237f17877' },
  'propagator/sgp4': { version: '1.4.1', commit: MODULES_COMMIT, sha256: '2fe246b716c78a4b947cd95e70e126b7a738cbbb9775e5196f07b1fe551f4643' },
  'propagator/ffm': { version: '2.2.0', commit: MODULES_COMMIT, sha256: 'd635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153' },
  'analysis/estimation': { version: '0.7.0', commit: '9a05d899b95242b358939ab1d68a776170a6b167', sha256: '7a555ca5b3ed0b021dd5b7986bd73dd8f8dc5125a2aa7943e3b3e983320d6bcd' },
  'analysis/gp-error-model': { version: '0.11.0', commit: 'fbda894501f32210b77c74b53bcad036ce7a1b07', sha256: '8e13eddbd5ccc3e0ee121f3b851e8314e426715cf5517823aa8d925566ef0e19' },
};
export const ARMS = ['SGP4', 'XP', 'XPU', 'AP', 'FFM20', 'FFM40'];
/** The runs (BENCHMARK.md amendment 2026-11-06): the registered run and one run per shipped build, each with its own row directory and the arms it reruns;
 *  every other module at its registered build. */
const QUIET_BOX = 'the DSST run\'s seven accuracy JVMs SIGSTOPped through the DSST governor from 2026-11-06T07:05:58Z to 07:19:17Z, around the benchmark (07:12:32Z to 07:18:58Z); the FFM rerun lane\'s eight single-thread scoring workers ran throughout (disclosed by the coordinator at 07:12Z); 1-minute load 11.7 to 12.7 at every phase boundary, under the ceiling';
export const RUNS = {
  a13cb468: { label: 'the registered run, 2026-11-05', rows: ROWS_ROOT, builds: REGISTERED_BUILDS, arms: ARMS, machine: 'shared with other lanes; the load before and after each arm in load' },
  'sdn-ap-0.6.2': { label: 'propagator/sdn-ap 0.6.2', rows: path.join(ROWS_ROOT, 'builds', 'sdn-ap-0.6.2-84d50dca'), arms: ['XP', 'AP'], machine: QUIET_BOX,
    builds: { ...REGISTERED_BUILDS, 'propagator/sdn-ap': { version: '0.6.2', commit: 'e1e4fad87ae810dd71e9acb568e9f083df1cc9b8', sha256: '84d50dca4efdfea87eff7e3b4618d795c26a7d0a6df0e877341e69bc73161f41' } } },
  'sdn-ap-0.6.3': { label: 'propagator/sdn-ap 0.6.3', rows: path.join(ROWS_ROOT, 'builds', 'sdn-ap-0.6.3-aa3ed22a'), arms: ['XP', 'AP'], machine: QUIET_BOX,
    builds: { ...REGISTERED_BUILDS, 'propagator/sdn-ap': { version: '0.6.3', commit: '93cb5a0584fa728864e4426cc9ceb368936589f9', sha256: 'aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e' } } },
  'ffm-2.2.1': { label: 'propagator/ffm 2.2.1', rows: path.join(ROWS_ROOT, 'builds', 'ffm-2.2.1-a9133120'), arms: ['FFM20', 'FFM40'], machine: QUIET_BOX,
    builds: { ...REGISTERED_BUILDS, 'propagator/ffm': { version: '2.2.1', commit: '9cb02c8e22f5a738a9984992e8af2246cd11e090', sha256: 'a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4' } } },
};
/** The shipped build of each arm: the run whose column the comparison page and the paper read (table.json arms, builds, byRegime). */
export const SHIPPED = { SGP4: 'a13cb468', XP: 'sdn-ap-0.6.3', XPU: 'a13cb468', AP: 'sdn-ap-0.6.3', FFM20: 'ffm-2.2.1', FFM40: 'ffm-2.2.1' };
/** The module whose build names an arm's column. */
const COLUMN_MODULE = { SGP4: 'propagator/sgp4', XP: 'propagator/sdn-ap', XPU: 'propagator/sgp4-xp', AP: 'propagator/sdn-ap', FFM20: 'propagator/ffm', FFM40: 'propagator/ffm' };
const RUN = args.run ?? 'a13cb468';
if (!RUNS[RUN]) throw new Error(`no run ${RUN}: ${Object.keys(RUNS).join(', ')}`);
export const BUILDS = RUNS[RUN].builds;
const ROWS = args.rows ?? RUNS[RUN].rows;
/** The arcs: prepared once by the registered run, read as they are by every run (a trial directory prepares its own). */
const ARCS = path.join(args.rows ?? ROWS_ROOT, 'arcs.json');
/** The rerun's load ceiling (amendment 2026-11-06): the registered run's highest recorded 1-minute load. A child waits under it before each row; a row above it after its call is refused. */
export const LOAD_CEILING = 22.83, LOAD_WAIT_SECONDS = 15, LOAD_WAIT_MAX_SECONDS = 600;
export const ARM_MODULES = { SGP4: ['analysis/gp-error-model', 'propagator/sgp4'], XP: ['propagator/sdn-ap'], XPU: ['propagator/sgp4-xp'], AP: ['propagator/sdn-ap'], FFM20: ['analysis/estimation', 'propagator/ffm'], FFM40: ['analysis/estimation', 'propagator/ffm'] };
export const COLUMNS = { SGP4: 'SGP4', XP: 'XP, whiteroom', XPU: 'XP, Space Force', AP: 'AP', FFM20: 'FFM 20×20', FFM40: 'FFM 40×40' };
const PRODUCT = { SGP4: 'the $OMM the fitter emits', XP: 'the $OCM', XPU: 'the $OCM', AP: 'the $OCM', FFM20: 'the fit\'s epoch, state and parameters as UTF-8 JSON (no FlatBuffer product in the harness)', FFM40: 'the fit\'s epoch, state and parameters as UTF-8 JSON (no FlatBuffer product in the harness)' };
const MACHINE = { model: 'Mac Studio (Mac15,14)', cpu: 'Apple M3 Ultra', cores: 28, performanceCores: 20, efficiencyCores: 8, memoryGiB: 256, os: 'macOS 26.3.1', node: process.version, arch: process.arch, threads: 'one process at a time; propagator/sdn-ap with its thread pool bounded to one, every other module a sequential artifact' };

const isoMs = (t) => new Date(t).toISOString();
const ms = (e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`);
const short = (e) => String(e?.message ?? e).slice(0, 240);
const asc = (a, b) => a - b;
const fig = (x) => (Number.isFinite(x) ? Number(Number(x).toPrecision(4)) : null);
/** Nearest-rank percentile of a sorted list. */
const pct = (v, p) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
const stats = (list) => { const v = list.filter(Number.isFinite).sort(asc); return v.length ? { median: fig(pct(v, 0.5)), p10: fig(pct(v, 0.1)), p90: fig(pct(v, 0.9)), n: v.length } : { median: null, p10: null, p90: null, n: 0 }; };
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const modulesRoot = () => { const m = process.env.SDN_MODULES_ROOT; if (!m) throw new Error('SDN_MODULES_ROOT: the modules clone at the registered commit'); return m; };

// ---- the wasm memory probe: every instance the process makes (its exported memory) and every WebAssembly.Memory the host constructs
// (the shared memory an emscripten-pthreads module imports); read after each call. Memory only grows, so the last reading is the peak.
const MEMS = new Set();
function installProbe() {
  const track = (inst) => { const m = inst?.exports?.memory; if (m instanceof WebAssembly.Memory) MEMS.add(m); return inst; };
  const instantiate = WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate = async (...a) => { const r = await instantiate(...a); track(r?.instance ?? r); return r; };
  const Instance = WebAssembly.Instance;
  const WrappedInstance = function (...a) { return track(new Instance(...a)); };
  WrappedInstance.prototype = Instance.prototype;
  WebAssembly.Instance = WrappedInstance;
  const Memory = WebAssembly.Memory;
  const WrappedMemory = function (...a) { const m = new Memory(...a); MEMS.add(m); return m; };
  WrappedMemory.prototype = Memory.prototype;
  WebAssembly.Memory = WrappedMemory;
}
const peakPages = () => (MEMS.size ? Math.max(...[...MEMS].map((m) => m.buffer.byteLength / 65536)) : null);
async function timed(fn) {
  const c0 = process.cpuUsage(), t0 = performance.now();
  const value = await fn();
  const wall = (performance.now() - t0) / 1000, c = process.cpuUsage(c0);
  return { value, cpu: (c.user + c.system) / 1e6, wall };
}

// ---- inputs: the products' states for the registered windows, through the harness's readers (read before any module opens)
async function inputs(ws) {
  const need = new Set(ws.map((w) => w.group));
  const series = new Map();
  const R = await import('../operator-theory/lib/regimes.mjs');
  const SRC = await import(pathToFileURL(path.join(ROOT, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  for (const o of R.STATIC) {
    if (!need.has(o.group)) continue;
    const files = o.files();
    if (!files.length) continue;
    const norad = Number(path.basename(files[0], '.oem'));
    if (ws.some((w) => w.group === o.group && Number(w.norad) === norad)) series.set(`${o.group}|${norad}`, SRC.chain(files).lines);
  }
  for (const [group, klass] of [['GE', 'geo'], ['IG', 'igso']]) {
    if (!need.has(group)) continue;
    for (const o of SRC.mgex({ klass })) if (ws.some((w) => w.group === group && Number(w.norad) === Number(o.norad))) series.set(`${group}|${o.norad}`, o.lines);
  }
  if (['P', 'S1', 'GN'].some((g) => need.has(g))) {
    const groups = JSON.parse(fs.readFileSync(path.join(ROOT, 'experiments/xp-atmosphere-merit/config.json'), 'utf8')).groups;
    const T = await import('../xp-atmosphere-merit/lib/truth.mjs');
    for (const w of ws.filter((x) => ['P', 'S1', 'GN'].includes(x.group))) {
      const o = groups[w.group].objects.find((x) => Number(x.norad) === Number(w.norad));
      if (!o) continue;
      const cutoff = Date.parse(w.cutoff);
      series.set(`${w.group}|${w.norad}`, T.series(o, cutoff - FIT_HOURS * HOUR - DAY, cutoff + DAY).lines);
    }
  }
  return series;
}
/** The fit arc, the harness's rule (xp-atmosphere-merit/lib/truth.mjs thinned, all-regimes.mjs arc): the product's states in [cutoff - 48 h, cutoff],
 *  coverage on the product's own grid (states / (48 h / step) at least 0.9), then every round(300 s / step)-th state from the first. */
function arcOf(lines, cutoffMs) {
  const inArc = (lines ?? []).filter((l) => { const t = ms(l.epoch); return t >= cutoffMs - FIT_HOURS * HOUR && t <= cutoffMs; });
  if (inArc.length < 2) return { error: `coverage ${inArc.length} states` };
  const diffs = inArc.slice(1).map((l, i) => ms(l.epoch) - ms(inArc[i].epoch)).sort(asc), step = diffs[diffs.length >> 1];
  const expected = (FIT_HOURS * 3600 * 1000) / step;
  if (inArc.length / expected < MIN_COVERAGE) return { error: `coverage ${inArc.length}/${Math.round(expected)} on the product's ${step / 1000} s grid` };
  const k = Math.max(1, Math.round((STEP_SECONDS * 1000) / step));
  const arc = inArc.filter((_, i) => i % k === 0).map((l) => ({ epoch: isoMs(ms(l.epoch)), r: l.r, v: l.v }));
  return { arc, high: Math.hypot(...arc.at(-1).r) >= HIGH_KM, productStepSeconds: step / 1000, thinnedStepSeconds: (k * step) / 1000 };
}
/** The parent's one reading of the inputs: the registered windows' arcs, written under the row directory (never the repository) for every arm's process. */
async function prepareArcs(ws) {
  const S = await import('../xp-atmosphere-merit/lib/sds.mjs');
  const series = await inputs(ws);
  const out = [];
  for (const w of ws) {
    const cutoffMs = Date.parse(w.cutoff), a = arcOf(series.get(`${w.group}|${w.norad}`), cutoffMs);
    if (a.error) { out.push({ ...w, error: a.error }); console.error(`${w.key}: ${a.error}`); continue; }
    const oem = S.oemBytes({ frame: 'GCRF', object: { name: w.name, id: '', norad: Number(w.norad) }, lines: a.arc, useableStart: a.arc[0].epoch, useableStop: isoMs(cutoffMs), originator: 'sdn-ap-cost-benchmark' });
    out.push({ ...w, norad: Number(w.norad), cutoffMs, high: a.high, productStepSeconds: a.productStepSeconds, thinnedStepSeconds: a.thinnedStepSeconds, states: a.arc.length, arc: a.arc, oem: Buffer.from(oem).toString('base64') });
    console.error(`${w.key}: ${a.arc.length} states at ${a.thinnedStepSeconds} s (product ${a.productStepSeconds} s), ${a.high ? 'high' : 'low'}`);
  }
  fs.mkdirSync(path.dirname(ARCS), { recursive: true });
  fs.writeFileSync(ARCS, JSON.stringify(out));
  return out;
}
const readArcs = () => JSON.parse(fs.readFileSync(ARCS, 'utf8')).map((a) => (a.oem ? { ...a, oem: new Uint8Array(Buffer.from(a.oem, 'base64')) } : a));
const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
/** The 1-minute load before a row's call, after waiting (LOAD_WAIT_SECONDS cycles, at most LOAD_WAIT_MAX_SECONDS) for it to come under the ceiling. */
async function loadUnderCeiling() {
  const t0 = Date.now();
  let load = os.loadavg()[0];
  while (load > LOAD_CEILING && Date.now() - t0 < LOAD_WAIT_MAX_SECONDS * 1000) { console.error(`load ${load.toFixed(2)} above the ceiling ${LOAD_CEILING}: waiting ${LOAD_WAIT_SECONDS} s`); await sleep(LOAD_WAIT_SECONDS); load = os.loadavg()[0]; }
  return load;
}
/** A row whose load after its call is above the ceiling is refused: its time leaves the statistics, its product (a fit's) stays for the flight. */
function refuseAboveCeiling(row) {
  row.loadAfter = os.loadavg()[0];
  if (row.ok && row.loadAfter > LOAD_CEILING) { row.refused = true; row.error = `load ${fig(row.loadAfter)} after the call, above the ceiling ${LOAD_CEILING}: refused`; }
}
const flightEpochs = (cutoffMs) => Array.from({ length: FLIGHT_STATES }, (_, i) => isoMs(cutoffMs + (i + 1) * STEP_SECONDS * 1000));

/** GFZ's observed daily rows (lib/weather.mjs gfzDays) as $SPW fields, the centered 81-day mean from them, a day without values held from the day before. */
async function weatherTable(from, to) {
  const { gfzDays } = await import('../operator-theory/lib/weather.mjs');
  const days = new Map();
  for (const d of gfzDays('2025-03-01')) days.set(d.date, d);
  const center = (t) => { const v = []; for (let k = -40; k <= 40; k += 1) { const d = days.get(isoMs(t + k * DAY).slice(0, 10)); if (d?.f107) v.push(d.f107); } return v.length >= 40 ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const rows = [];
  let last = null;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const date = isoMs(t).slice(0, 10), d = days.get(date), c81 = center(t);
    if (d && d.f107 && d.kp && c81) last = { d, c81 };
    if (!last) throw new Error(`no weather for ${date}`);
    const { d: u, c81: c } = last;
    rows.push({ DATE: date, KP1: u.kp[0], KP2: u.kp[1], KP3: u.kp[2], KP4: u.kp[3], KP5: u.kp[4], KP6: u.kp[5], KP7: u.kp[6], KP8: u.kp[7], KP_SUM: u.kp.reduce((a, b) => a + b, 0),
      AP1: u.ap8[0], AP2: u.ap8[1], AP3: u.ap8[2], AP4: u.ap8[3], AP5: u.ap8[4], AP6: u.ap8[5], AP7: u.ap8[6], AP8: u.ap8[7], AP_AVG: u.ap, F107_OBS: u.f107, F107_ADJ: u.f107, F107_DATA_TYPE: 0, F107_OBS_CENTER81: c });
  }
  return rows;
}

// ---- arms (the harness's definitions), each at BENCHMARK.md's build
async function openArm(arm, weather) {
  const AP = await import('../operator-theory/lib/ap.mjs');
  const S = await import('../xp-atmosphere-merit/lib/sds.mjs');
  const build = (rel) => ({ modulesCommit: BUILDS[rel].commit, wasmSha256: BUILDS[rel].sha256 });
  const check = (r, what) => { if (r.statusCode !== 0) throw new Error(`${what}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); return r; };
  const port = (r, id) => new Uint8Array(r.outputs.find((o) => o.portId === id).payload);
  const daily = AP.rowsOfSpw(weather);
  if (arm === 'XP' || arm === 'AP') {
    // lib/ap.mjs standalone's path (the pinned file through the module's own SDK), with the thread pool bounded to one: sdn-ap is emscripten-pthreads.
    const file = AP.pinnedFile('propagator/sdn-ap', build('propagator/sdn-ap'));
    const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(modulesRoot(), 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
    // maxThreads sizes a browser pool and is ignored on Node; wasiThreadPoolSize caps the live guest threads on Node (the SDK's documentation).
    const h = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(file), manifest: JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'plugin-manifest.json'), 'utf8')), surface: 'direct', maxThreads: 1, wasiThreadPoolSize: 1 });
    const pcf = arm === 'XP' ? AP.fitPcf({ forces: AP.apForces({ atmosphere: false, noTerms: true }), fit: null }) : AP.fitPcf({ forces: AP.apForces({ tesseral: 31, zonal: 20 }), fit: null });
    return {
      prepare: (w) => ({ spw: arm === 'AP' ? AP.fitWeather(daily, AP.horizonOf(w.cutoffMs)) : null }),
      async fit(w) {
        const inputs = [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: w.oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(w.spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: w.spw }] : [])];
        return { bytes: port(check(await h.invoke({ methodId: 'fit', inputs }), 'fit'), 'elements') };
      },
      async fly(product, epochs) {
        const r = check(await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: product.bytes }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }] }), 'propagate');
        const n = S.oemLines(port(r, 'ephemeris')).length;
        if (n !== epochs.length) throw new Error(`propagate returned ${n} of ${epochs.length} states`);
        return n;
      },
      close: () => h.destroy?.(),
    };
  }
  if (arm === 'XPU') {
    // lib/ussf-xp.mjs's black-box path: the module's fit, then propagate on a grid. Nothing of the library is read.
    const h = await AP.standalone('propagator/sgp4-xp', build('propagator/sgp4-xp'));
    return {
      prepare: () => ({}),
      async fit(w) { return { bytes: port(check(await h.invoke({ methodId: 'fit', inputs: [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: w.oem }] }), 'fit'), 'elements') }; },
      async fly(product, epochs) {
        const r = check(await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: product.bytes }, { portId: 'grid', typeRef: S.TYPE('OEM'), payload: S.gridBytes(epochs) }] }), 'propagate');
        const n = S.oemLines(port(r, 'ephemeris')).length;
        if (n !== epochs.length) throw new Error(`propagate returned ${n} of ${epochs.length} states`);
        return n;
      },
      close: () => h.destroy?.(),
    };
  }
  if (arm === 'SGP4') {
    const modules = modulesRoot();
    const sdk = (rel) => import(pathToFileURL(createRequire(path.join(modules, rel, 'package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
    const open = async (rel) => {
      const file = AP.pinnedFile(rel, build(rel));
      const { createBrowserModuleHarness } = await sdk(rel);
      return createBrowserModuleHarness({ wasmSource: fs.readFileSync(file), manifest: JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'plugin-manifest.json'), 'utf8')), surface: 'direct' });
    };
    // The fitter: lib/xp2.mjs openSgp4Fit's call (fit_elements, the same options and decoding) on one instance for every fit, as every other arm keeps one;
    // openSgp4Fit itself makes an instance per fit, which would put the module's compilation inside the fit's time (BENCHMARK.md amendment 5).
    const { build: xp2fBuild } = await import('../operator-theory/lib/xp2.mjs');
    if (xp2fBuild.wasmSha256['analysis/gp-error-model'] !== BUILDS['analysis/gp-error-model'].sha256) throw new Error('analysis/gp-error-model: BENCHMARK.md names a build other than the harness\'s SGP4 fitter');
    const gem = await open('analysis/gp-error-model');
    const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')).href);
    const G = { async fit(oem, options, identity) {
      const r = check(await gem.invoke({ methodId: 'fit_elements', inputs: [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, erm.frame('options', 'fitOptions', { closure: false, ...options })] }), 'fit_elements');
      const out = {};
      for (const o of r.outputs) out[o.portId] = Buffer.from(o.payload);
      const fr = erm.decode(out.report).fits?.[0];
      if (!fr || !fr.converged) throw new Error(fr?.error ?? 'not converged');
      const u = S.OMM.OMM.getSizePrefixedRootAsOMM(new S.flatbuffers.ByteBuffer(new Uint8Array(out.elements))).unpack();
      return { fr, el: { epoch: u.EPOCH, objectName: identity.name, objectId: identity.objectId ?? '', elements: { MEAN_MOTION: u.MEAN_MOTION, ECCENTRICITY: u.ECCENTRICITY, INCLINATION: u.INCLINATION, RA_OF_ASC_NODE: u.RA_OF_ASC_NODE, ARG_OF_PERICENTER: u.ARG_OF_PERICENTER, MEAN_ANOMALY: u.MEAN_ANOMALY, BSTAR: u.BSTAR, MEAN_MOTION_DOT: u.MEAN_MOTION_DOT, MEAN_MOTION_DDOT: u.MEAN_MOTION_DDOT } }, omm: out.elements };
    } };
    const sgp4 = await open('propagator/sgp4');
    const enc = await import(pathToFileURL(path.join(modules, 'propagator/sgp4/tests/lib/payloadEncoders.mjs')).href);
    const OMM_TYPE = { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' };
    const PROP_TYPE = { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' };
    const jd = (t) => 2440587.5 + t / 86400000;
    const ommOf = (el, norad) => { const e = el.elements; return enc.encodeOmmPayload({ noradId: norad, objectName: el.objectName ?? '', objectId: el.objectId ?? '', epoch: el.epoch, meanMotion: e.MEAN_MOTION, eccentricity: e.ECCENTRICITY, inclination: e.INCLINATION, raan: e.RA_OF_ASC_NODE, argPericenter: e.ARG_OF_PERICENTER, meanAnomaly: e.MEAN_ANOMALY, bstar: e.BSTAR, meanMotionDot: e.MEAN_MOTION_DOT, meanMotionDdot: e.MEAN_MOTION_DDOT }); };
    return {
      prepare: () => ({}),
      // Bytes per object: the $OMM the fitter emits (size-prefixed), the set a store holds.
      async fit(w) { const { el, omm } = await G.fit(w.oem, { from: w.arc[0].epoch, to: isoMs(w.cutoffMs), epoch: 'first', fitBstar: true }, { name: w.name, objectId: '' }); return { bytes: Buffer.from(omm), el }; },
      // xp-atmosphere-merit/lib/modules.mjs propagateSgp4's call (propagate_ephemeris of the set, TEME, the step), on one instance for every flight (amendment 5).
      async fly(product, epochs, w) {
        const epochsMs = epochs.map(Date.parse);
        const omm = ommOf(product.el, w.norad);
        const request = enc.encodePropagatorBatchRequest({ epoch: jd(epochsMs[0]), stopEpoch: jd(epochsMs.at(-1)), catalogNumbers: [w.norad], outputFrame: enc.ReferenceFrame.TEME, stepSeconds: STEP_SECONDS });
        const r = check(await sgp4.invoke({ methodId: 'propagate_ephemeris', inputs: [{ portId: 'omm', typeRef: OMM_TYPE, payload: Buffer.from(enc.encodeSizePrefixedStream([omm])) }, { portId: 'request', typeRef: PROP_TYPE, payload: Buffer.from(request) }] }), 'propagate_ephemeris');
        let n = 0;
        for (const blk of enc.decodeOem(new Uint8Array(Buffer.from(r.outputs.find((o) => o.portId === 'ephemeris').payload))).EPHEMERIS_DATA_BLOCK) n += blk.EPHEMERIS_DATA_LINES.length;
        if (n < epochs.length) throw new Error(`propagate_ephemeris returned ${n} of ${epochs.length} states`);
        return n;
      },
      close: async () => { await gem.destroy(); await sgp4.destroy(); },
    };
  }
  if (arm === 'FFM20' || arm === 'FFM40') {
    const { openFfmHost, apriori } = await import('../operator-theory/lib/host.mjs');
    const F = await openFfmHost({ ffm: build('propagator/ffm') });
    const degree = arm === 'FFM40' ? 40 : 20, tides = arm === 'FFM40';
    // compare-costs.mjs ffm(degree, tides) below 8,400 km; all-regimes.mjs ffmHigh at or above (FFM20 only: the harness has no high-orbit FFM40).
    const low = { forces: { gravity: 'SPHERICAL_HARMONICS', degree, order: degree, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: tides, relativity: undefined }, integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]) };
    const high = { forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined }, integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]) };
    const settings = (w) => { if (!w.high) return low; if (arm === 'FFM40') throw new Error('no high-orbit FFM40 in the harness (cells.json has none): not run'); return high; };
    return {
      prepare: () => ({}),
      async fit(w) {
        const s = settings(w);
        const f = await F.fit(w.arc, [...w.arc[0].r, ...w.arc[0].v], s, weather, w.cutoffMs);
        if (!f.state) throw new Error(f.error ?? f.termination ?? 'no state');
        const product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
        return { bytes: Buffer.from(JSON.stringify(product), 'utf8'), product, iterations: f.iterations, termination: f.termination };
      },
      async fly(product, epochs, w) { const out = await F.forecast(product.product, epochs, settings(w), weather); return out.length; },
      close: () => F.close(),
    };
  }
  throw new Error(`no arm ${arm}`);
}

// ---- phases
const windowsAsked = () => registeredWindows().filter((w) => !ONLY || ONLY.has(w.key));
const armsAsked = () => (args.arms ? args.arms.split(',') : RUNS[RUN].arms).filter((a) => RUNS[RUN].arms.includes(a));
const earliest = (ws) => Math.min(...ws.map((w) => Date.parse(w.cutoff))), latest = (ws) => Math.max(...ws.map((w) => Date.parse(w.cutoff)));
const NOT_RUN = /: not run$/;
const memoryRecord = (arm, phase, loadBefore, warmUp) => JSON.stringify({ arm, phase, maxRssBytes: process.resourceUsage().maxRSS * 1024, rssBytesAtEnd: process.memoryUsage().rss, peakPages: peakPages(), memories: MEMS.size, warmUp, loadBefore, loadAfter: os.loadavg()[0], node: process.version, finishedAt: isoMs(Date.now()) }, null, 1) + '\n';
async function childFits(arm) {
  const ws = windowsAsked();
  const loadBefore = os.loadavg()[0];
  installProbe();
  const arcs = new Map(readArcs().map((a) => [a.key, a]));
  const weather = await weatherTable(isoMs(earliest(ws) - 90 * DAY).slice(0, 10), isoMs(latest(ws) + 40 * DAY).slice(0, 10));
  const A = await openArm(arm, weather);
  const prepared = (w) => { const a = arcs.get(w.key); return a && !a.error ? { ...a, ...A.prepare(a) } : null; };
  // One warm-up call per arm and phase, not counted (the harness's rule: compare-costs.mjs's first file, speed.mjs's first call).
  let warmUp = null;
  for (const w of ws) { const p = prepared(w); if (!p) continue; try { await A.fit(p); warmUp = { key: w.key, ok: true }; } catch (error) { warmUp = { key: w.key, ok: false, error: short(error) }; } break; }
  const rows = [];
  for (const w of ws) {
    const a = arcs.get(w.key);
    const row = { key: w.key, group: w.group, regime: w.regime, norad: w.norad, name: w.name, cutoff: w.cutoff, arm };
    if (!a || a.error) { row.ok = false; row.error = a?.error ?? 'no arc'; rows.push(row); console.error(`${arm} ${w.key}: ${row.error}`); continue; }
    const prep = prepared(w);
    row.states = a.states; row.productStepSeconds = a.productStepSeconds; row.thinnedStepSeconds = a.thinnedStepSeconds; row.high = a.high;
    row.loadBefore = await loadUnderCeiling();
    try {
      const { value, cpu, wall } = await timed(() => A.fit(prep));
      row.ok = true; row.fitCpuSeconds = cpu; row.fitWallSeconds = wall; row.productBytes = value.bytes.length; row.product = Buffer.from(value.bytes).toString('base64');
      if (value.el) row.el = value.el;
      if (value.iterations !== undefined) row.iterations = value.iterations;
      row.peakPages = peakPages();
    } catch (error) { row.ok = false; row.error = short(error); row.notRun = NOT_RUN.test(row.error); }
    refuseAboveCeiling(row);
    rows.push(row);
    console.error(`${arm} ${w.key}: ${row.ok ? `fit ${row.fitCpuSeconds.toFixed(3)} s cpu, ${row.fitWallSeconds.toFixed(3)} s wall, ${row.productBytes} B; load ${row.loadBefore.toFixed(2)} to ${row.loadAfter.toFixed(2)}${row.refused ? ' REFUSED' : ''}` : row.error}`);
  }
  await A.close?.();
  fs.writeFileSync(path.join(ROWS, `fits-${arm}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(ROWS, `memory-fits-${arm}.json`), memoryRecord(arm, 'fits', loadBefore, warmUp));
}
async function childFlights(arm) {
  const ws = windowsAsked();
  const loadBefore = os.loadavg()[0];
  installProbe();
  const fits = new Map(readJsonl(path.join(ROWS, `fits-${arm}.jsonl`)).map((r) => [r.key, r]));
  const weather = await weatherTable(isoMs(earliest(ws) - 90 * DAY).slice(0, 10), isoMs(latest(ws) + 40 * DAY).slice(0, 10));
  const A = await openArm(arm, weather);
  const productOf = (f) => { const bytes = new Uint8Array(Buffer.from(f.product, 'base64')); return { bytes, el: f.el, product: arm.startsWith('FFM') ? JSON.parse(Buffer.from(bytes).toString('utf8')) : undefined }; };
  const flightOf = (w, f) => { const cutoffMs = Date.parse(w.cutoff); return A.fly(productOf(f), flightEpochs(cutoffMs), { ...w, cutoffMs, high: f.high, norad: Number(w.norad) }); };
  let warmUp = null;
  for (const w of ws) { const f = fits.get(w.key); if (!f?.ok) continue; try { await flightOf(w, f); warmUp = { key: w.key, ok: true }; } catch (error) { warmUp = { key: w.key, ok: false, error: short(error) }; } break; }
  const rows = [];
  for (const w of ws) {
    const f = fits.get(w.key);
    const row = { key: w.key, group: w.group, regime: w.regime, norad: w.norad, name: w.name, cutoff: w.cutoff, arm, high: f?.high };
    if (!f?.ok) { row.ok = false; row.error = f ? `no product: ${f.error}` : 'no fit row'; row.notRun = !!f?.notRun; rows.push(row); continue; }
    row.loadBefore = await loadUnderCeiling();
    try {
      const { value, cpu, wall } = await timed(() => flightOf(w, f));
      row.ok = true; row.states = value; row.flightCpuSeconds = cpu; row.flightWallSeconds = wall; row.peakPages = peakPages();
    } catch (error) { row.ok = false; row.error = short(error); }
    refuseAboveCeiling(row);
    rows.push(row);
    console.error(`${arm} ${w.key}: ${row.ok ? `flight ${row.flightCpuSeconds.toFixed(3)} s cpu, ${row.flightWallSeconds.toFixed(3)} s wall, ${row.states} states; load ${row.loadBefore.toFixed(2)} to ${row.loadAfter.toFixed(2)}${row.refused ? ' REFUSED' : ''}` : row.error}`);
  }
  await A.close?.();
  fs.writeFileSync(path.join(ROWS, `flights-${arm}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(ROWS, `memory-flights-${arm}.json`), memoryRecord(arm, 'flights', loadBefore, warmUp));
}
async function parent(phase) {
  fs.mkdirSync(ROWS, { recursive: true });
  if (phase === 'fits' && !fs.existsSync(ARCS)) await prepareArcs(windowsAsked());
  for (const arm of armsAsked()) {
    const loadBefore = os.loadavg()[0], startedAt = Date.now();
    const extra = ['--run', RUN, ...(args.rows ? ['--rows', ROWS] : []), ...(args.only ? ['--only', args.only] : [])];
    const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname, phase, '--arm', arm, ...extra], { stdio: 'inherit', env: process.env });
    fs.appendFileSync(path.join(ROWS, 'phases.jsonl'), `${JSON.stringify({ run: RUN, phase, arm, startedAt: isoMs(startedAt), seconds: fig((Date.now() - startedAt) / 1000), loadBefore: fig(loadBefore), loadAfter: fig(os.loadavg()[0]), exit: r.status })}\n`);
  }
}
function memory() {
  const modules = modulesRoot();
  const size = (rel) => Number(execFileSync('git', ['-C', modules, 'cat-file', '-s', `${BUILDS[rel].commit}:${rel}/dist/isomorphic/module.wasm`]).toString().trim());
  for (const arm of RUNS[RUN].arms) {
    const fits = readJsonl(path.join(ROWS, `fits-${arm}.jsonl`)), mf = JSON.parse(fs.readFileSync(path.join(ROWS, `memory-fits-${arm}.json`), 'utf8')), ml = JSON.parse(fs.readFileSync(path.join(ROWS, `memory-flights-${arm}.json`), 'utf8'));
    const out = { arm, modules: Object.fromEntries(ARM_MODULES[arm].map((rel) => [rel, { ...BUILDS[rel], bytes: size(rel) }])), peakPages: Math.max(mf.peakPages ?? 0, ml.peakPages ?? 0) || null, maxRssBytes: { fits: mf.maxRssBytes, flights: ml.maxRssBytes }, bytesPerObject: { ...stats(fits.filter((r) => r.ok).map((r) => r.productBytes)), what: PRODUCT[arm] }, epochStore: 'not measured: the sdn-ap epoch store (SPEC 14, load_epochs) has no snapshot codec in the harness' };
    fs.writeFileSync(path.join(ROWS, `memory-${arm}.json`), JSON.stringify(out, null, 1) + '\n');
  }
}

// ---- the table: every run's columns; the shipped build of each arm fills `arms`, `builds` and `byRegime` (what the comparison page and the paper read),
// every other build's column stands under `comparison`, by hash (BENCHMARK.md amendment 2026-11-06).
const num = (s, k = 'median') => (s && s[k] !== null && s[k] !== undefined ? String(s[k]) : '—');
const spread = (s) => (s && s.n ? `${s.median} (${s.p10} to ${s.p90}, n ${s.n})` : '—');
/** The site's median (the middle two averaged at an even count), for the per-regime ratio. */
const plainMedian = (xs) => { const s = xs.filter(Number.isFinite).sort(asc), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const columnKey = (run, arm) => `${arm}@${RUNS[run].builds[COLUMN_MODULE[arm]].sha256.slice(0, 12)}`;
const buildOf = (run, arm) => ({ module: COLUMN_MODULE[arm], ...RUNS[run].builds[COLUMN_MODULE[arm]] });
const buildLabel = (run, arm) => { const b = buildOf(run, arm); return `${b.module} ${b.version} ${b.sha256.slice(0, 12)}`; };
/** One arm of one run: its rows read and reduced as the registered run's were; a row the load ceiling refused leaves the statistics and is named. */
function columnOf(run, arm, ws) {
  const rows = RUNS[run].rows;
  const fits = readJsonl(path.join(rows, `fits-${arm}.jsonl`)), flights = readJsonl(path.join(rows, `flights-${arm}.jsonl`)), mem = JSON.parse(fs.readFileSync(path.join(rows, `memory-${arm}.json`), 'utf8'));
  const okFits = fits.filter((r) => r.ok && !r.refused), okFlights = flights.filter((r) => r.ok && !r.refused);
  const loads = [...fits, ...flights].flatMap((r) => [r.loadBefore, r.loadAfter]).filter(Number.isFinite);
  const byRegime = {};
  for (const w of ws) {
    const f = okFits.find((r) => r.key === w.key), l = okFlights.find((r) => r.key === w.key);
    byRegime[w.regime] ??= { fitCpu: [], flightCpu: [] };
    if (f) byRegime[w.regime].fitCpu.push(f.fitCpuSeconds / (FIT_HOURS / 24));
    if (l) byRegime[w.regime].flightCpu.push(l.flightCpuSeconds / FLIGHT_DAYS);
  }
  for (const regime of Object.keys(byRegime)) { const v = byRegime[regime]; byRegime[regime] = { fitCpuSecondsPerObjectDay: stats(v.fitCpu).median, flightCpuSecondsPerObjectDay: stats(v.flightCpu).median, n: Math.min(v.fitCpu.length, v.flightCpu.length) || v.fitCpu.length }; }
  const column = {
    run, column: COLUMNS[arm], modules: mem.modules,
    fit: { windows: okFits.length, cpuSecondsPerObjectDay: stats(okFits.map((r) => r.fitCpuSeconds / (FIT_HOURS / 24))), wallSecondsPerObjectDay: stats(okFits.map((r) => r.fitWallSeconds / (FIT_HOURS / 24))), cpuSeconds: stats(okFits.map((r) => r.fitCpuSeconds)), wallSeconds: stats(okFits.map((r) => r.fitWallSeconds)), states: stats(okFits.map((r) => r.states)) },
    flight: { windows: okFlights.length, cpuSecondsPerObjectDay: stats(okFlights.map((r) => r.flightCpuSeconds / FLIGHT_DAYS)), wallSecondsPerObjectDay: stats(okFlights.map((r) => r.flightWallSeconds / FLIGHT_DAYS)), cpuSeconds: stats(okFlights.map((r) => r.flightCpuSeconds)), wallSeconds: stats(okFlights.map((r) => r.flightWallSeconds)), states: FLIGHT_STATES },
    memory: { peakLinearMemoryPages: mem.peakPages, peakLinearMemoryMiB: mem.peakPages === null ? null : fig((mem.peakPages * 65536) / 1048576), maxRssBytes: mem.maxRssBytes, moduleBytes: Object.fromEntries(Object.entries(mem.modules).map(([k, v]) => [k, v.bytes])), bytesPerObject: mem.bytesPerObject, epochStore: mem.epochStore },
    notRun: fits.filter((r) => !r.ok && r.notRun).map((r) => r.key),
    failed: [...fits.filter((r) => !r.ok && !r.notRun).map((r) => ({ key: r.key, phase: 'fit', error: r.error })), ...flights.filter((r) => !r.ok && fits.find((f) => f.key === r.key)?.ok).map((r) => ({ key: r.key, phase: 'flight', error: r.error }))],
    refused: [...fits.filter((r) => r.refused).map((r) => ({ key: r.key, phase: 'fit', load: fig(r.loadAfter) })), ...flights.filter((r) => r.refused).map((r) => ({ key: r.key, phase: 'flight', load: fig(r.loadAfter) }))],
    load: loads.length ? { min: fig(Math.min(...loads)), max: fig(Math.max(...loads)), ceiling: LOAD_CEILING } : null,
  };
  return { column, byRegime, flights: okFlights };
}
/** AP's flight CPU seconds per object-day over FFM 40x40's on the low-orbit windows both completed: per window, and per regime (the site's rule, its rounded reciprocal the front page's fraction). */
function lowOrbitRatio(apRun, ffmRun, cols) {
  const ap = cols[apRun].AP, ffm = cols[ffmRun].FFM40;
  const ffmBy = new Map(ffm.flights.map((r) => [r.key, r]));
  const pairs = ap.flights.filter((r) => !r.high && ffmBy.has(r.key)).map((r) => ({ key: r.key, ratio: r.flightCpuSeconds / ffmBy.get(r.key).flightCpuSeconds }));
  const low = Object.entries(ap.byRegime).filter(([regime, a]) => /^(Low orbit|Strong drag|Near 700)/.test(regime) && a.flightCpuSecondsPerObjectDay && ffm.byRegime[regime]?.flightCpuSecondsPerObjectDay);
  const regimes = Object.fromEntries(low.map(([regime, a]) => [regime, a.flightCpuSecondsPerObjectDay / ffm.byRegime[regime].flightCpuSecondsPerObjectDay]));
  const median = plainMedian(Object.values(regimes));
  return { ap: { run: apRun, build: buildOf(apRun, 'AP') }, ffm40: { run: ffmRun, build: buildOf(ffmRun, 'FFM40') }, perWindow: stats(pairs.map((p) => p.ratio)), perRegime: { regimes: Object.fromEntries(Object.entries(regimes).map(([k, v]) => [k, fig(v)])), median: fig(median), reciprocal: median ? Math.round(1 / median) : null } };
}
const phasesOf = (run) => readJsonl(path.join(RUNS[run].rows, 'phases.jsonl'));
function buildTable() {
  const ws = registeredWindows();
  const cols = {};
  for (const [run, R] of Object.entries(RUNS)) { cols[run] = {}; for (const arm of R.arms) cols[run][arm] = columnOf(run, arm, ws); }
  const arms = Object.fromEntries(ARMS.map((arm) => [arm, cols[SHIPPED[arm]][arm].column]));
  const byRegime = Object.fromEntries([...new Set(ws.map((w) => w.regime))].map((regime) => [regime, Object.fromEntries(ARMS.map((arm) => [arm, cols[SHIPPED[arm]][arm].byRegime[regime]]))]));
  const builds = {};
  for (const rel of Object.keys(REGISTERED_BUILDS)) { const arm = ARMS.find((a) => ARM_MODULES[a].includes(rel)); const b = RUNS[SHIPPED[arm]].builds[rel]; builds[`${rel}@${b.sha256.slice(0, 12)}`] = { module: rel, ...b }; }
  const comparison = {};
  for (const [run, R] of Object.entries(RUNS)) for (const arm of R.arms) if (SHIPPED[arm] !== run) comparison[columnKey(run, arm)] = { ...cols[run][arm].column, column: `${COLUMNS[arm]}, ${buildLabel(run, arm)}`, build: buildOf(run, arm), byRegime: cols[run][arm].byRegime };
  const runs = Object.fromEntries(Object.entries(RUNS).map(([run, R]) => {
    const phases = phasesOf(run);
    const t0 = phases.length ? Math.min(...phases.map((p) => Date.parse(p.startedAt))) : null, t1 = phases.length ? Math.max(...phases.map((p) => Date.parse(p.startedAt) + p.seconds * 1000)) : null;
    return [run, { label: R.label, arms: R.arms, rows: R.rows, builds: R.builds, machine: R.machine, startedAt: t0 === null ? null : isoMs(t0), endedAt: t1 === null ? null : isoMs(t1), wallSeconds: t0 === null ? null : fig((t1 - t0) / 1000), loadCeiling: run === 'a13cb468' ? null : LOAD_CEILING }];
  }));
  return {
    registered: 'experiments/sdn-ap-cost-benchmark/BENCHMARK.md',
    reading: 'Per arm, over the registered windows that completed: median and 10th to 90th percentile (nearest rank). CPU is user plus system time of the process across the one call; wall is elapsed. Fit per object-day: the 48 h fit divided by 2; flight per object-day: the 7-day flight divided by 7. One warm-up call per arm and phase is not counted. sdn-ap runs with its thread pool bounded to one; every other module is sequential. Peak linear memory: the largest WebAssembly.Memory the arm\'s process held, pages of 64 KiB. maxRSS: the arm\'s own process, one arm per process, which reads the prepared arcs, never the products. Module bytes: dist/isomorphic/module.wasm. Bytes per object: the fitted product the arm emits. arms, builds and byRegime carry the shipped build of each arm (shipped names its run); comparison carries the same arms on every other build, by hash, with the same statistics; a row the rerun\'s load ceiling refused leaves the statistics and is named (amendment 2026-11-06).',
    machine: MACHINE, stepSeconds: STEP_SECONDS, fitHours: FIT_HOURS, fitStatesAtMost: FIT_STATES, flightDays: FLIGHT_DAYS, flightStates: FLIGHT_STATES,
    windows: ws.length, regimes: [...new Set(ws.map((w) => w.regime))], windowKeys: ws.map((w) => w.key),
    builds, shipped: SHIPPED, arms, byRegime, comparison,
    lowOrbitRatio: { shipped: lowOrbitRatio(SHIPPED.AP, SHIPPED.FFM40, cols), comparison: { 'sdn-ap-0.6.2 over ffm-2.2.1': lowOrbitRatio('sdn-ap-0.6.2', 'ffm-2.2.1', cols), a13cb468: lowOrbitRatio('a13cb468', 'a13cb468', cols) } },
    runs,
    load: Object.keys(RUNS).flatMap((run) => phasesOf(run).map((p) => ({ run, phase: p.phase, arm: p.arm, loadBefore: p.loadBefore, loadAfter: p.loadAfter, seconds: p.seconds }))),
  };
}
function buildReadme(t) {
  const L = [];
  L.push('# The cost of each theory on the current builds', '');
  L.push(`Registered in \`${t.registered}\` before any run. One machine: ${t.machine.model}, ${t.machine.cpu}, ${t.machine.cores} cores (${t.machine.performanceCores} performance, ${t.machine.efficiencyCores} efficiency), ${t.machine.memoryGiB} GiB, ${t.machine.os}, Node.js ${t.machine.node}; ${t.machine.threads}. Step ${t.stepSeconds} s everywhere: the fit reads a ${t.fitHours} h arc thinned to ${t.stepSeconds} s (at most ${t.fitStatesAtMost} states); the flight writes ${t.flightStates} states, every ${t.stepSeconds} s for ${t.flightDays} days. ${t.windows} registered windows over ${t.regimes.length} regimes of the comparison explorer's precise-orbit rows: ${t.regimes.join('; ')}.`, '');
  L.push('## Builds', '', '| Module | Version | SHA-256 of the dist | Commit |', '| --- | --- | --- | --- |');
  for (const b of Object.values(t.builds)) L.push(`| ${b.module} | ${b.version} | \`${b.sha256}\` | ${b.commit.slice(0, 10)} |`);
  L.push('', 'The shipped build of each arm, one per module: the columns below, the comparison page and the paper read these. Each wasm by `git show` at its commit, SHA-256 checked before it is loaded. propagator/sgp4-xp is the Space Force library\'s module, timed as a black box through its published methods; nothing of it is read. Whiteroom XP is propagator/sdn-ap at the theory\'s own forces. The same arms on the earlier builds stand beside them in the section "The shipped builds beside the earlier ones".', '');
  L.push('## Per object-day, median over the windows (10th to 90th percentile, windows)', '');
  L.push('| Arm | Fit CPU s | Fit wall s | Flight CPU s | Flight wall s |', '| --- | --- | --- | --- | --- |');
  for (const [arm, a] of Object.entries(t.arms)) L.push(`| ${a.column} | ${spread(a.fit.cpuSecondsPerObjectDay)} | ${spread(a.fit.wallSecondsPerObjectDay)} | ${spread(a.flight.cpuSecondsPerObjectDay)} | ${spread(a.flight.wallSecondsPerObjectDay)} |`);
  L.push('', `A fit per object-day is the ${t.fitHours} h fit's time divided by 2; a flight per object-day the ${t.flightDays}-day flight's divided by ${t.flightDays}. CPU: user plus system time of the process across the call; wall: elapsed, on a shared machine (the load in table.json). One warm-up call per arm and phase is not counted. sdn-ap runs with its thread pool bounded to one; every other module is sequential. The laser products are on 120 s and 180 s grids: the harness thins them to every round(300 / step)-th state, 360 s apart (481 states); every other arc is 577 states at 300 s.`, '');
  L.push('## One call, seconds, median (10th to 90th percentile)', '', '| Arm | Fit, 48 h arc | Flight, 7 days |', '| --- | --- | --- |');
  for (const a of Object.values(t.arms)) L.push(`| ${a.column} | ${spread(a.fit.cpuSeconds)} CPU, ${spread(a.fit.wallSeconds)} wall | ${spread(a.flight.cpuSeconds)} CPU, ${spread(a.flight.wallSeconds)} wall |`);
  L.push('', '## Memory', '', '| Arm | Peak linear memory, pages (MiB) | maxRSS, fits (MiB) | maxRSS, flights (MiB) | Module bytes | Bytes per object, median (10th to 90th) |', '| --- | --- | --- | --- | --- | --- |');
  for (const a of Object.values(t.arms)) {
    const m = a.memory;
    const mods = Object.entries(m.moduleBytes).map(([k, v]) => `${k.split('/')[1]} ${v.toLocaleString('en-US')}`).join('; ');
    L.push(`| ${a.column} | ${m.peakLinearMemoryPages ?? '—'} (${m.peakLinearMemoryMiB ?? '—'}) | ${fig(m.maxRssBytes.fits / 1048576)} | ${fig(m.maxRssBytes.flights / 1048576)} | ${mods} | ${m.bytesPerObject.n ? `${m.bytesPerObject.median} (${m.bytesPerObject.p10} to ${m.bytesPerObject.p90}): ${m.bytesPerObject.what}` : '—'} |`);
  }
  L.push('', 'Peak linear memory: the largest WebAssembly.Memory the arm\'s process held, read after each call; every module runs one instance for the arm\'s whole phase. maxRSS: process.resourceUsage() of the arm\'s own process; the FFM arms\' figure carries the harness\'s planetary kernel and Earth-orientation frames beside the two modules. The sdn-ap epoch store (SPEC 14) is not measured here: the harness has no snapshot codec for it.', '');
  L.push('## By regime, CPU seconds per object-day, median', '', `| Regime | ${Object.values(t.arms).map((a) => `${a.column} fit`).join(' | ')} | ${Object.values(t.arms).map((a) => `${a.column} flight`).join(' | ')} |`, `| --- |${Object.keys(t.arms).map(() => ' --- |').join('')}${Object.keys(t.arms).map(() => ' --- |').join('')}`);
  for (const [regime, cells] of Object.entries(t.byRegime)) L.push(`| ${regime} | ${Object.keys(t.arms).map((arm) => (cells[arm]?.fitCpuSecondsPerObjectDay ?? '—')).join(' | ')} | ${Object.keys(t.arms).map((arm) => (cells[arm]?.flightCpuSecondsPerObjectDay ?? '—')).join(' | ')} |`);
  // The shipped builds beside the earlier ones: every column of every run for the arms that were rerun, by hash (amendment 2026-11-06).
  const loadText = (c) => (c.load ? `${c.load.min} to ${c.load.max}` : 'in table.json by arm');
  const buildText = (b) => `${b.module} ${b.version}, \`${b.sha256}\`, ${b.commit.slice(0, 10)}`;
  L.push('', '## The shipped builds beside the earlier ones', '', 'The arms whose module shipped since the registered run, on every build measured, the same windows, measures and statistics (BENCHMARK.md, amendment 2026-11-06). The shipped build\'s row is the column above; every other row is a comparison column of table.json, by hash.', '',
    '| Column | Build | Fit CPU s per object-day | Flight CPU s per object-day | Windows, fit / flight | Peak linear memory (MiB) | 1-minute load, min to max |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const arm of ARMS.filter((a) => Object.entries(RUNS).some(([run, R]) => R.arms.includes(a) && SHIPPED[a] !== run))) {
    const s = t.arms[arm];
    L.push(`| ${s.column}, shipped | ${buildText(buildOf(SHIPPED[arm], arm))} | ${spread(s.fit.cpuSecondsPerObjectDay)} | ${spread(s.flight.cpuSecondsPerObjectDay)} | ${s.fit.windows} / ${s.flight.windows} | ${s.memory.peakLinearMemoryMiB ?? '—'} | ${loadText(s)} |`);
    for (const [run, R] of Object.entries(RUNS)) if (R.arms.includes(arm) && SHIPPED[arm] !== run) { const c = t.comparison[columnKey(run, arm)]; L.push(`| ${c.column} | ${buildText(c.build)} | ${spread(c.fit.cpuSecondsPerObjectDay)} | ${spread(c.flight.cpuSecondsPerObjectDay)} | ${c.fit.windows} / ${c.flight.windows} | ${c.memory.peakLinearMemoryMiB ?? '—'} | ${loadText(c)} |`); }
  }
  const ratioText = (r) => `AP on ${r.ap.build.module} ${r.ap.build.version} (\`${r.ap.build.sha256.slice(0, 12)}\`) over FFM 40×40 on ${r.ffm40.build.module} ${r.ffm40.build.version} (\`${r.ffm40.build.sha256.slice(0, 12)}\`): per window ${spread(r.perWindow)}; per regime ${Object.entries(r.perRegime.regimes).map(([k, v]) => `${k} ${v}`).join(', ')}, median ${r.perRegime.median ?? '—'}${r.perRegime.reciprocal ? `, about 1/${r.perRegime.reciprocal}` : ''}.`;
  L.push('', '## AP\'s flight over FFM 40×40\'s, low Earth orbit', '', 'Flight CPU seconds per object-day, AP over FFM 40×40, on the windows below 8,400 km both arms completed: per window, median (10th to 90th percentile, windows); per regime, each regime\'s median over the other\'s, and the median of those (the site\'s rule; its rounded reciprocal is the front page\'s fraction).', '', `- Shipped: ${ratioText(t.lowOrbitRatio.shipped)}`);
  for (const [k, r] of Object.entries(t.lowOrbitRatio.comparison)) L.push(`- ${k}: ${ratioText(r)}`);
  const refused = [...Object.values(t.arms), ...Object.values(t.comparison)].flatMap((c) => c.refused.map((r) => `${c.column}, ${r.key}, ${r.phase}: load ${r.load} after the call, above ${LOAD_CEILING}`));
  L.push('', '## Runs', '', ...Object.entries(t.runs).map(([run, r]) => `- ${run} (${r.label}): arms ${r.arms.join(', ')}; ${r.startedAt ? `${r.startedAt} to ${r.endedAt}, ${r.wallSeconds} s of wall time` : 'not run'}${r.loadCeiling ? `; load ceiling ${r.loadCeiling}` : ''}; ${r.machine}; rows \`${r.rows}\`.`));
  L.push('', '## Rows refused by the load ceiling', '', ...(refused.length ? refused.map((f) => `- ${f}`) : ['- none']));
  const failed = [...Object.entries(t.arms).map(([, a]) => a), ...Object.values(t.comparison)].flatMap((a) => a.failed.map((f) => `${a.column}, ${f.key}, ${f.phase}: ${f.error}`));
  const notRun = [...Object.values(t.arms), ...Object.values(t.comparison)].filter((a) => a.notRun.length).map((a) => `${a.column}: ${a.notRun.length} windows at or above 8,400 km (no such arm in the harness)`);
  L.push('', '## Windows an arm did not complete', '', ...(failed.length ? failed.map((f) => `- ${f}`) : ['- none']), ...(notRun.length ? ['', 'Not run by registration:', '', ...notRun.map((f) => `- ${f}`)] : []));
  L.push('', '## Not measured', '', '- The sdn-ap epoch store\'s bytes per series (SPEC 14): no snapshot codec in the harness.', '- Highly elliptical orbits and the next-file (centers\' and operators\' files) regimes: outside this registration (BENCHMARK.md).', '- FFM 40×40 at or above 8,400 km: the harness defines no such arm.', '');
  L.push(`Rows: \`${ROWS_ROOT}\` (the reruns under \`builds/<run>\`). Reproduce the table: \`node experiments/sdn-ap-cost-benchmark/run.mjs --check\`.`, '');
  return L.join('\n');
}
function tables() {
  const t = buildTable();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'table.json'), JSON.stringify(t, null, 1) + '\n');
  fs.writeFileSync(path.join(OUT, 'README.md'), buildReadme(t));
  console.log(`table.json: ${Object.keys(t.arms).length} arms, ${Object.keys(t.comparison).length} comparison columns, ${t.windows} windows; README.md written`);
}
function check() {
  let ok = true;
  const say = (pass, line) => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'} ${line}`); };
  const t = buildTable();
  const want = JSON.stringify(t, null, 1) + '\n', have = fs.readFileSync(path.join(OUT, 'table.json'), 'utf8');
  say(want === have, `table.json reproduces byte for byte from the rows under ${ROWS_ROOT} (${have.length} bytes)`);
  const readme = fs.readFileSync(path.join(OUT, 'README.md'), 'utf8');
  say(buildReadme(t) === readme, `README.md reproduces byte for byte (${readme.length} bytes)`);
  const hashes = [...new Set(Object.values(RUNS).flatMap((R) => Object.values(R.builds).map((b) => b.sha256)))];
  const columns = { ...t.arms, ...t.comparison };
  say(hashes.every((h) => readme.includes(h) && have.includes(h)) && Object.values(columns).every((a) => Object.values(a.modules).every((m) => /^[0-9a-f]{64}$/.test(m.sha256))), `every build named by dist hash: ${hashes.length} dists over ${Object.keys(RUNS).length} runs, ${Object.keys(columns).length} columns`);
  say(readme.includes(`Step ${STEP_SECONDS} s`) && t.stepSeconds === STEP_SECONDS, `the step is named: ${STEP_SECONDS} s`);
  say(!/catalog/i.test(readme) && !/catalog/i.test(have), 'no catalog count anywhere in the results');
  const measured = Object.values(columns).filter((a) => a.fit.windows > 0 && a.flight.windows > 0).length;
  say(measured === Object.keys(columns).length, `every column measured on at least one window: ${measured} of ${Object.keys(columns).length}; fits ${Object.values(columns).map((a) => a.fit.windows).join('/')}, flights ${Object.values(columns).map((a) => a.flight.windows).join('/')}`);
  say(ARMS.every((arm) => t.arms[arm].run === SHIPPED[arm]) && Object.keys(t.builds).length === Object.keys(REGISTERED_BUILDS).length, `arms carry the shipped build of each arm (${ARMS.map((a) => `${a} ${SHIPPED[a]}`).join(', ')}); builds one per module`);
  for (const [key, a] of Object.entries(columns)) console.log(`     ${key}: fit ${num(a.fit.cpuSecondsPerObjectDay)} s CPU per object-day, flight ${num(a.flight.cpuSecondsPerObjectDay)} s CPU per object-day, peak ${a.memory.peakLinearMemoryPages} pages, maxRSS ${fig(Math.max(a.memory.maxRssBytes.fits, a.memory.maxRssBytes.flights) / 1048576)} MiB, product ${num(a.memory.bytesPerObject)} B${a.refused.length ? `, ${a.refused.length} refused` : ''}`);
  const r = t.lowOrbitRatio.shipped;
  console.log(`     low Earth orbit, AP flight over FFM 40x40 flight (shipped): per window ${spread(r.perWindow)}; per regime median ${r.perRegime.median}, about 1/${r.perRegime.reciprocal}`);
  if (!ok) process.exit(1);
}

if (PHASE === '--check') check();
else if (PHASE === 'tables') tables();
else if (PHASE === 'memory') memory();
else if (PHASE === 'fits' || PHASE === 'flights') {
  if (args.arm) { await (PHASE === 'fits' ? childFits(args.arm) : childFlights(args.arm)); process.exit(0); } else await parent(PHASE);
} else { console.error('run.mjs fits | flights | memory | tables | --check'); process.exit(2); }
