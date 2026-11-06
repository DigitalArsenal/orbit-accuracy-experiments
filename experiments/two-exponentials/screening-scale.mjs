#!/usr/bin/env node
// Screening scale runner (registration: SCREENING-SCALE.md, task experiments-screening-scale-20261106).
// --populations  build the catalogs (archive only) into the scratch directory
// --coverage     theory coverage of the current catalog (counts file only)
// --run          fly the cases (refuses on a dirty or uncommitted registration; guards before every start)
// --table        write table.json, README.md, chart.json from rows.jsonl
// --check        registration before rows, table reproduces byte for byte, fits, shares, conversion, verdict
// (--child <caseId> is the runner's own subprocess.)
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SELF = fileURLToPath(import.meta.url);
const REG_REL = 'experiments/two-exponentials/SCREENING-SCALE.md';
const OUT = process.env.SCALE_OUT ?? path.join(ROOT, 'results/two-exponentials/screening-scale');
const SCRATCH = process.env.SCALE_SCRATCH ?? '/Users/tj/software/terrain-work/body-look/scale';
const MODULES = '/Users/tj/software/private/coordinator-d9/space-data-network-modules-ca';
const CA = path.join(MODULES, 'analysis/conjunction-assessment');
const ARCHIVE = '/opt/data/sdn-archive';
const GPH = `${ARCHIVE}/spacetrack/gp_history/by-creation`;
const CURRENT_SNAPSHOT = `${ARCHIVE}/spacetrack/gp/2026/2026-11-05.json.gz`;
const CURRENT_SHA = 'b63176497acc503080a5243980319e577f3387de6b318426a1766ff6359aa1c1';
const WASM_SHA = 'fe7533e9168c65f31b5d98ea90bafb76024a5e035df5c7f34d252da44718bfec';
const PINNED = {
  'gpu/catalogScreen.mjs': '259ec4674b91a321a577d2455b560b89606c135ce734f9eddbdd6694d6ae2cfc',
  'gpu/continuousScreen.mjs': 'e191d9f3a8cc3f3438dcbabe459c99cbbb49f4f730b3a88bbd0462acc70167d2',
  'gpu/allVsAll.mjs': 'fd7fc206b31b7e4c4ca9e33203f2880ebb3e0bff72adff3d14542f8bd283edfa',
  'gpu/scrFrames.mjs': '6181c730044e5c879b8b10188652bc359bfa2f44e1b08780edfff599fec37423',
  'tests/lib/conjunctionCommandHarness.mjs': 'c96a13d43af9c569677cb46a34c2d578ef77ef1d2bfe16fca1e1392f7c4ec022',
  'tests/lib/cqr.mjs': 'df0e968326a662c041ce3fc7bf465468b68e41d23936b67c2c7f832f6390c9f0',
  'scripts/lib/ommCatalog.mjs': '2a11f493daa87f30ba2ff0398826f192c17580e74b8c0a5c6b2f0b9eb51adf35',
  'plugin-manifest.json': '5285b8dcb05c619c15edf2795b31a0e4b457bfd17594b54e9e208dfbacf86c4f',
  'dist/isomorphic/module.wasm': WASM_SHA,
};
const NODE = 'v25.4.0';
const SEED = 'screening-scale-20261106';
const DATES = ['2022-12-21', '2023-06-21', '2023-12-21', '2024-06-21', '2024-12-21', '2025-06-21', '2025-12-21'];
const CONTROLS = { thresholdKm: 5, coarseStepSec: 60, workers: 8, algorithm: 'ALFANO_MAXIMUM' };
const HORIZON_DAYS = 7, WINDOW_HOURS = 6;
const CORES = 28, MIN_FREE_MEM_GIB = 16, MIN_FREE_DISK_GIB = 25, CONCURRENCY = Number(process.env.SCALE_CONCURRENCY ?? 4);
const TRIALS = 2000;
const B1 = { payloadDoublingYears: 3.8, allObjectsDoublingYears: 9.6 };
const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const nowUtc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// ---------- the cases ----------
function cases() {
  const list = [];
  for (const [fraction, label] of [[0.125, '1-8'], [0.25, '1-4'], [0.5, '1-2']]) {
    for (const seed of [1, 2, 3]) list.push({ id: `ladder-${label}-s${seed}`, kind: 'ladder', population: 'current', fraction, seed });
  }
  for (const r of [1, 2, 3]) list.push({ id: `current-full-r${r}`, kind: 'full', population: 'current', fraction: 1, repeat: r });
  for (const d of DATES) list.push({ id: `date-${d}`, kind: 'date', population: d, fraction: 1 });
  return list.sort((a, b) => (sha256(a.id) < sha256(b.id) ? -1 : 1));
}
const PARITY = { id: 'parity-1-8-s1', fused: true, population: 'current', fraction: 0.125, seed: 1 };
const startJdOf = (population) => {
  const s = population === 'current' ? '2026-11-06' : population;
  return Date.parse(`${s}T00:00:00Z`) / 86400000 + 2440587.5;
};

function registration() {
  const dirty = git(['status', '--porcelain', '--', REG_REL]);
  if (dirty) throw new Error(`registration dirty or uncommitted: ${dirty}`);
  const adds = git(['log', '--diff-filter=A', '--format=%H', '--', REG_REL]).split('\n').filter(Boolean);
  if (!adds.length) throw new Error('registration not committed');
  const commit = adds.at(-1);
  const original = execFileSync('git', ['show', `${commit}:${REG_REL}`], { cwd: ROOT, encoding: 'utf8' });
  const amendments = git(['log', '--reverse', '--format=%H %cI', `${commit}..HEAD`, '--', REG_REL]).split('\n').filter(Boolean);
  return { commit, blob: git(['rev-parse', `${commit}:${REG_REL}`]), time: git(['log', '-1', '--format=%cI', commit]), original, amendments };
}

// ---------- guards ----------
function guards() {
  const load = os.loadavg()[0];
  let freeGiB = 0;
  try {
    const text = execFileSync('vm_stat', { encoding: 'utf8' });
    const page = Number(/page size of (\d+)/.exec(text)[1]);
    const pages = (k) => Number(new RegExp(`Pages ${k}:\\s+(\\d+)`).exec(text)?.[1] ?? 0);
    freeGiB = ((pages('free') + pages('inactive') + pages('speculative')) * page) / 2 ** 30;
  } catch { freeGiB = os.freemem() / 2 ** 30; }
  fs.mkdirSync(SCRATCH, { recursive: true });
  const st = fs.statfsSync(SCRATCH);
  const diskGiB = (st.bavail * st.bsize) / 2 ** 30;
  const ok = freeGiB > MIN_FREE_MEM_GIB && diskGiB >= MIN_FREE_DISK_GIB;   // Amendment 4: memory and disk only; the load is stored, not held
  return { ok, load: +load.toFixed(1), freeGiB: +freeGiB.toFixed(1), diskGiB: +diskGiB.toFixed(1) };
}

// ---------- pinned imports ----------
function verifyPins() {
  if (process.version !== NODE) throw new Error(`node ${process.version}, registered ${NODE}`);
  for (const [rel, want] of Object.entries(PINNED)) {
    if (sha256(fs.readFileSync(path.join(CA, rel))) !== want) throw new Error(`${rel} differs from the registered hash`);
  }
}
const lib = (rel) => import(pathToFileURL(path.join(CA, rel)).href);

// ---------- populations ----------
async function populations() {
  verifyPins();
  const { createOmmEncoder, catalogFile } = await lib('scripts/lib/ommCatalog.mjs');
  const encode = await createOmmEncoder();
  const popDir = path.join(SCRATCH, 'pop');
  fs.mkdirSync(popDir, { recursive: true });
  const build = (label, records, startMs) => {
    const lo = startMs - 30 * 86400000;
    const keep = [];
    for (const g of records.values()) {
      const ep = Date.parse(`${g.EPOCH}Z`);
      if (!(ep >= lo && ep < startMs) || g.DECAY_DATE != null || g.MEAN_ELEMENT_THEORY !== 'SGP4') continue;
      const omm = encode(g);
      if (omm) keep.push([Number(g.NORAD_CAT_ID), omm]);
    }
    keep.sort((a, b) => a[0] - b[0]);
    fs.writeFileSync(path.join(popDir, `${label}.omm.bin`), catalogFile(keep.map((k) => k[1])));
    fs.writeFileSync(path.join(popDir, `${label}.norad.json`), JSON.stringify(keep.map((k) => k[0])));
    console.log(`${label}: ${keep.length} objects`);
    return keep.length;
  };
  const newest = (map, g) => {
    const id = Number(g.NORAD_CAT_ID), prev = map.get(id);
    if (!prev || g.EPOCH >= prev.EPOCH) map.set(id, g);
  };
  const counts = {};
  const gpFile = (file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const cur = fs.readFileSync(CURRENT_SNAPSHOT);
  if (sha256(cur) !== CURRENT_SHA) throw new Error('the current snapshot changed');
  const map = new Map();
  for (const g of JSON.parse(zlib.gunzipSync(cur))) newest(map, g);
  counts.current = build('current', map, Date.parse('2026-11-06T00:00:00Z'));
  for (const d of DATES) {
    const startMs = Date.parse(`${d}T00:00:00Z`), m = new Map();
    for (let k = 30; k >= 1; k--) {
      const day = new Date(startMs - k * 86400000).toISOString().slice(0, 10);
      const file = `${GPH}/${day.slice(0, 4)}/${day}.json.gz`;
      if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
      for (const g of gpFile(file)) newest(m, g);
    }
    counts[d] = build(d, m, startMs);
  }
  fs.writeFileSync(path.join(popDir, 'counts.json'), JSON.stringify(counts, null, 1) + '\n');
}

function loadPopulation(label) {
  const dir = path.join(SCRATCH, 'pop');
  return { bytes: new Uint8Array(fs.readFileSync(path.join(dir, `${label}.omm.bin`))), norad: JSON.parse(fs.readFileSync(path.join(dir, `${label}.norad.json`), 'utf8')) };
}
function subsetOf(norad, fraction, seed) {
  if (fraction === 1) return norad.map((_, i) => i);
  const want = Math.round(fraction * norad.length);
  const ranked = norad.map((n, i) => [sha256(`${SEED}:${seed}:${n}`), i]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return ranked.slice(0, want).map((r) => r[1]).sort((a, b) => a - b);
}

// the event-set digest: one SHA-256 over the sorted event keys, fed key by key (a joined string of every event is too long for a full catalog)
const digestOf = (keys) => { const h = createHash('sha256'); for (const k of keys) h.update(k).update('\n'); return h.digest('hex'); };

// ---------- the screen (child) ----------
async function child(caseId, smoke) {
  verifyPins();
  const c = smoke ?? [...cases(), PARITY].find((x) => x.id === caseId);
  if (!c) throw new Error(`no case ${caseId}`);
  const cpuS = (u) => (u.user + u.system) / 1e6;
  const load0 = os.loadavg()[0];
  const startedUtc = nowUtc();
  const { createConjunctionCommandHarness } = await lib('tests/lib/conjunctionCommandHarness.mjs');
  const cs = await lib('gpu/catalogScreen.mjs');
  const av = await lib('gpu/allVsAll.mjs');
  const cont = await lib('gpu/continuousScreen.mjs');
  const { PRWInstanceT } = await import(pathToFileURL(path.join(CA, 'node_modules/spacedatastandards.org/lib/js/CQR/main.js')).href);
  const pop = smoke ? { bytes: new Uint8Array(fs.readFileSync(path.join(SCRATCH, 'pop/current.omm.bin'))), norad: JSON.parse(fs.readFileSync(path.join(SCRATCH, 'pop/current.norad.json'), 'utf8')) } : loadPopulation(c.population);
  const frames = cs.splitCatalog(pop.bytes);
  const pick = smoke ? smoke.pick : subsetOf(pop.norad, c.fraction, c.seed ?? 0);
  const chosen = pick.map((i) => frames[i]);
  const startJd = startJdOf(c.population);
  const windows = cs.screenWindows(startJd, HORIZON_DAYS, WINDOW_HOURS);
  const controls = smoke ? { ...CONTROLS, workers: smoke.workers } : CONTROLS;
  const cpuStart = process.cpuUsage();
  const harness = await createConjunctionCommandHarness({ runtimeKind: 'browser' });
  const moduleStartCpuS = cpuS(process.cpuUsage(cpuStart));
  const acc = {};
  const bucket = (m) => (m === 'coarse_grid' ? 'propagation' : m === 'search_grid' ? 'search' : m === 'refine_candidates' ? 'refine' : 'index');
  const invoke = async (methodId, inputs) => {
    const u0 = process.cpuUsage(), t0 = performance.now();
    const r = await harness.invoke({ methodId, inputs });
    const u = process.cpuUsage(u0), a = (acc[bucket(methodId)] ??= { cpuS: 0, wallS: 0, calls: 0 });
    a.cpuS += cpuS(u); a.wallS += (performance.now() - t0) / 1000; a.calls++;
    return r;
  };
  const CATALOG = new PRWInstanceT('conjunction-assessment', 'scale-catalog', 1n);
  const REFINE = new PRWInstanceT('conjunction-assessment', 'scale-refine', 1n);
  const loadCpu = process.cpuUsage(), loadT = performance.now();
  const sources = cs.sgp4Sources(chosen);
  const identity = sources.map((s) => av.objectKey(s.OBJECT_ID, s.NORAD_CATALOG_ID));
  const loadS = { cpuS: cpuS(process.cpuUsage(loadCpu)), wallS: (performance.now() - loadT) / 1000 };
  const screenCpu = process.cpuUsage(), screenT = performance.now();
  const events = [], cutoffs = new Map();
  let candidates = 0;
  try {
    if (c.fused) {
      const full = await cs.screenCatalog({ invoke, propagator: 'sgp4', catalog: chosen, windows, controls });
      const fusedCpuS = cpuS(process.cpuUsage(screenCpu));
      const canon = full.events.map((e) => `${Math.min(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${Math.max(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${e.TCA.JULIAN_DATE.toFixed(8)}|${e.MISS_DISTANCE_M.toFixed(3)}`).sort();
      return emit({ ...base(), fused: true, fusedCpuS, fusedWallS: (performance.now() - screenT) / 1000, events: canon.length, candidates: full.candidates, excluded: full.excluded.length, digest: digestOf(canon) });
    }
    const handle = await cs.prepareIndex(invoke, sources, [], CATALOG);
    for (const w of windows) {
      const grid = await cont.sampleWindowGrid({ invoke, request: cs.windowRequest(handle, 'TEME', w, controls, CATALOG) });
      for (const [row, jd] of grid.excluded) av.refuseAt(cutoffs, identity[row], jd);
      const refineIndex = async (rows) => {
        const h = await cs.prepareIndex(invoke, rows.map((r) => sources[r]), [], REFINE);
        return { request: cs.windowRequest(h, 'TEME', w, controls, REFINE), release: () => cs.releaseIndex(invoke, h, REFINE) };
      };
      const run = await cont.screenStoredWindow({ invoke, decodeCatalogResult: cs.decodeCatalogResult, request: cs.windowRequest(0, 'TEME', w, controls, REFINE), grid, refineIndex });
      events.push(...run.events);
      candidates += run.candidates;
    }
    await cs.releaseIndex(invoke, handle, CATALOG);
  } finally { await harness.destroy?.(); }
  const total = { cpuS: cpuS(process.cpuUsage(screenCpu)), wallS: (performance.now() - screenT) / 1000 };
  const merged = av.mergeWindowEvents(events, cutoffs);
  const canon = merged.map((e) => `${Math.min(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${Math.max(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${e.TCA.JULIAN_DATE.toFixed(8)}|${e.MISS_DISTANCE_M.toFixed(3)}`).sort();
  const phases = Object.fromEntries(['propagation', 'search', 'refine', 'index'].map((k) => [k, acc[k] ?? { cpuS: 0, wallS: 0, calls: 0 }]));
  const hostCpuS = total.cpuS - Object.values(phases).reduce((s, p) => s + p.cpuS, 0);
  return emit({ ...base(), phases, hostCpuS, totalCpuS: total.cpuS, totalWallS: total.wallS, load: loadS, moduleStartCpuS,
    events: canon.length, candidates, excluded: cutoffs.size, digest: digestOf(canon) });

  function base() {
    return { id: c.id, startedUtc, endedUtc: nowUtc(), objects: chosen.length, load1Start: +load0.toFixed(1), load1End: +os.loadavg()[0].toFixed(1), workers: controls.workers };
  }
  function emit(row) { row.endedUtc = nowUtc(); if (!smoke) fs.writeFileSync(path.join(SCRATCH, 'results', `${process.env.SCALE_QUIET ? 'quiet-' : ''}${c.id}.json`), JSON.stringify(row) + '\n'); console.log(`ROW ${JSON.stringify(row)}`); return row; }
}

// ---------- coverage ----------
function coverage() {
  const popN = loadPopulation('current').norad;
  const cur = new Set(popN);
  const theory = { xp: new Set(), ap: new Set(), ffm: new Set() };
  const base = `${ARCHIVE}/celestrak/supgp`;
  for (const g of fs.readdirSync(base)) {
    const dir = path.join(base, g);
    if (g.startsWith('_') || !fs.statSync(dir).isDirectory()) continue;
    const files = fs.readdirSync(dir).filter((f) => /^\d{8}T\d{6}Z\.json$/.test(f) && f < '20261106T000000Z').sort();
    if (!files.length) continue;
    try { for (const r of JSON.parse(fs.readFileSync(path.join(dir, files.at(-1)), 'utf8'))) theory.xp.add(Number(r.NORAD_CAT_ID)); } catch { /* skipped, counted below */ }
  }
  const rows = `${ARCHIVE}/sdn-ap-mixed-screening/rows`;
  const keyTheory = { sgp4xp: 'xp', ffm: 'ffm', ffm3: 'ffm', ap: 'ap', sdnap: 'ap' };
  for (const f of fs.readdirSync(rows).filter((x) => x.endsWith('.jsonl') && !x.startsWith('ca-encounters'))) {
    for (const line of fs.readFileSync(path.join(rows, f), 'utf8').split('\n')) {
      if (!line) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      const n = Number(r.norad ?? r.NORAD_CAT_ID ?? (f.startsWith('iss') ? 25544 : NaN));
      if (!Number.isFinite(n)) continue;
      for (const [k, t] of Object.entries(keyTheory)) if (r[k] && t !== 'xp') theory[t].add(n);
    }
  }
  const share = (set) => +([...set].filter((n) => cur.has(n)).length / cur.size).toFixed(6);
  const out = { catalogObjects: cur.size, xp: { objects: [...theory.xp].filter((n) => cur.has(n)).length, share: share(theory.xp) },
    ap: { objects: [...theory.ap].filter((n) => cur.has(n)).length, share: share(theory.ap) },
    ffm: { objects: [...theory.ffm].filter((n) => cur.has(n)).length, share: share(theory.ffm) } };
  fs.mkdirSync(path.join(SCRATCH, 'results'), { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'results', 'coverage.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out));
}

// ---------- run (parent) ----------
async function run() {
  const reg = registration();
  verifyPins();
  const resDir = path.join(SCRATCH, 'results');
  fs.mkdirSync(resDir, { recursive: true });
  if (!fs.existsSync(path.join(resDir, 'coverage.json'))) coverage();
  const all = [...cases(), PARITY];
  const done = (c) => fs.existsSync(path.join(resDir, `${c.id}.json`));
  const pending = all.filter((c) => !done(c));
  const running = new Map();
  console.log(`${nowUtc()} ${pending.length} cases pending`);
  while (pending.length || running.size) {
    if (pending.length && running.size < Math.min(CONCURRENCY, 4)) {
      const g = guards();
      if (g.ok) {
        const c = pending.shift();
        const child_ = spawn(process.execPath, ['--max-old-space-size=24000', SELF, '--child', c.id], { stdio: ['ignore', 'pipe', 'inherit'] });
        const concurrent = running.size + 1;
        let out = '';
        child_.stdout.on('data', (d) => { out += d; });
        running.set(c.id, new Promise((resolve) => child_.on('close', (code) => {
          running.delete(c.id);
          if (code !== 0) { console.log(`${nowUtc()} ${c.id} failed (exit ${code})`); resolve(); return; }
          const f = path.join(resDir, `${c.id}.json`), row = JSON.parse(fs.readFileSync(f, 'utf8'));
          row.concurrentAtStart = concurrent; row.guardAtStart = g; fs.writeFileSync(f, JSON.stringify(row) + '\n');
          console.log(`${nowUtc()} ${c.id} done`); resolve();
        })));
        console.log(`${nowUtc()} start ${c.id} (guards ${JSON.stringify(g)}, running ${concurrent})`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      console.log(`${nowUtc()} guard holds: ${JSON.stringify(g)}`);
    }
    await new Promise((r) => setTimeout(r, running.size ? 15000 : 60000));
  }
  await timingFlights();
  assemble(reg);
}

async function timingFlights() {
  const dir = process.env.SCALE_FLIGHT_ROWS ?? path.join(SCRATCH, 'flight-rows');
  const env = { ...process.env, SDN_MODULES_ROOT: '/Users/tj/software/private/coordinator-d9/space-data-network-modules-bench2', SDN_MODULES_GIT: MODULES, SCALE_FLIGHT_ROWS: dir };
  for (const [arm, run] of Object.entries(FLIGHT_RUN)) {
    if (fs.existsSync(path.join(dir, run, `flights-${arm}.jsonl`))) continue;
    for (;;) { const g = guards(); if (g.ok) break; console.log(`${nowUtc()} timing guard holds: ${JSON.stringify(g)}`); await new Promise((r) => setTimeout(r, 60000)); }
    console.log(`${nowUtc()} timing ${arm} (${run})`);
    await new Promise((resolve) => spawn(process.execPath, [path.join(HERE, 'cost-flights.mjs'), 'flights', '--run', run, '--arms', arm], { stdio: ['ignore', 'inherit', 'inherit'], env }).on('close', resolve));
  }
}

function assemble(reg) {
  const resDir = path.join(SCRATCH, 'results');
  const get = (id) => JSON.parse(fs.readFileSync(path.join(resDir, `${id}.json`), 'utf8'));
  const list = cases().map((c) => ({ c, r: get(c.id) }));
  const fullRows = list.filter((x) => x.c.kind === 'full').map((x) => x.r);
  const n0 = fullRows[0].objects;
  const parity = get(PARITY.id);
  const phasedParity = list.find((x) => x.c.id === 'ladder-1-8-s1').r;
  const rows = [], crows = [];
  for (const { c, r } of list.sort((a, b) => (a.c.id < b.c.id ? -1 : 1))) {
    rows.push({ id: c.id, kind: c.kind, population: c.population === 'current' ? 'current' : c.population, fraction: c.fraction, seed: c.seed ?? null, repeat: c.repeat ?? null,
      index: +(r.objects / n0).toFixed(6), startedUtc: r.startedUtc, endedUtc: r.endedUtc,
      cpuS: { propagation: r.phases.propagation.cpuS, search: r.phases.search.cpuS, refine: r.phases.refine.cpuS, index: r.phases.index.cpuS, host: r.hostCpuS, total: r.totalCpuS },
      wallS: { propagation: r.phases.propagation.wallS, search: r.phases.search.wallS, refine: r.phases.refine.wallS, index: r.phases.index.wallS, total: r.totalWallS },
      events: r.events, candidates: r.candidates,
      load1Start: r.load1Start, load1End: r.load1End, concurrentAtStart: r.concurrentAtStart ?? 1, workers: r.workers });
    crows.push({ id: c.id, objects: r.objects, events: r.events, candidates: r.candidates, excluded: r.excluded, digest: r.digest });
  }
  const cov = JSON.parse(fs.readFileSync(path.join(resDir, 'coverage.json'), 'utf8'));
  crows.push({ id: 'coverage', ...cov });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'rows.jsonl'), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const tim = timingRows();
  fs.writeFileSync(path.join(OUT, 'flights.jsonl'), flightRowsOf(process.env.SCALE_FLIGHT_ROWS ?? path.join(SCRATCH, 'flight-rows')).map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'timing.jsonl'), tim.map((x) => JSON.stringify(x)).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'counts.jsonl'), crows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const meta = {
    registration_commit: reg.commit, registration_blob: reg.blob, registration_time: reg.time, amendments: reg.amendments,
    runner_sha256: sha256(fs.readFileSync(SELF)), node: process.version,
    module: { plugin: 'analysis/conjunction-assessment', version: '0.18.4', wasm_sha256: WASM_SHA, root: path.basename(MODULES), pinned: PINNED },
    controls: { ...CONTROLS, horizonDays: HORIZON_DAYS, windowHours: WINDOW_HOURS, path: 'CPU, no GPU; coarse_grid, search_grid, refine_candidates' },
    host: { cpus: os.cpus().length, model: os.cpus()[0]?.model },
    parity: { id: PARITY.id, phasedEvents: phasedParity.events, fusedEvents: parity.events, phasedDigest: phasedParity.digest, fusedDigest: parity.digest,
      equal: phasedParity.events === parity.events && phasedParity.digest === parity.digest,
      fusedCpuS: parity.fusedCpuS, phasedCpuS: phasedParity.totalCpuS },
    note: 'counts.jsonl is for the whitepaper only; the site, chart and marketing never read it.',
  };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log('rows written', rows.length);
}

// ---------- timing arm rows (Amendment 3) ----------
const FLIGHT_RUN = { SGP4: 'a13cb468', XPU: 'a13cb468', XP: 'sdn-ap-0.6.3', AP: 'sdn-ap-0.6.3', FFM20: 'ffm-2.2.1', FFM40: 'ffm-2.2.1' };
const FLIGHT_BUILD = { SGP4: 'sgp4 1.4.1', XPU: 'sgp4-xp 0.2.2', XP: 'sdn-ap 0.6.3', AP: 'sdn-ap 0.6.3', FFM20: 'ffm 2.2.1', FFM40: 'ffm 2.2.1' };
function timingRows() {
  const dir = process.env.SCALE_FLIGHT_ROWS ?? path.join(SCRATCH, 'flight-rows');
  const out = [];
  const med = (v) => { const a = [...v].sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
  for (const [arm, run] of Object.entries(FLIGHT_RUN)) {
    const f = path.join(dir, run, `flights-${arm}.jsonl`);
    if (!fs.existsSync(f)) continue;
    const ok = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.ok && !r.refused);
    const by = new Map();
    for (const r of ok) { const us = (r.flightCpuSeconds / (r.states ?? 10080)) * 1e6; for (const k of ['pooled', r.regime]) (by.get(k) ?? by.set(k, []).get(k)).push(us); }
    for (const [regime, v] of by) out.push({ arm, run, build: FLIGHT_BUILD[arm], regime, n: v.length, cpuUsPerState: med(v), min: Math.min(...v), max: Math.max(...v) });
  }
  return out;
}

const QUIET_CASES = ['ladder-1-8-s1', 'ladder-1-2-s1', 'current-full-r1'];
const QUIET_KEYS = ['LS|LARETS|2025-10-25', 'DO|SENTINEL 3B|2025-11-29'];
const QUIET_ARMS = ['SGP4', 'AP', 'FFM40'];
function flightRowsOf(dir, only) {
  const out = [];
  for (const [arm, run] of Object.entries(FLIGHT_RUN)) {
    const f = path.join(dir, run, `flights-${arm}.jsonl`);
    if (!fs.existsSync(f)) continue;
    for (const r of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) {
      if (!r.ok || r.refused || (only && !only.includes(r.key))) continue;
      out.push({ arm, run, key: r.key, regime: r.regime, cpuUsPerState: (r.flightCpuSeconds / (r.states ?? 10080)) * 1e6, wallS: r.flightWallSeconds, loadBefore: r.loadBefore, loadAfter: r.loadAfter });
    }
  }
  return out;
}
async function quiet() {
  verifyPins();
  const resDir = path.join(SCRATCH, 'results');
  let below = 0;
  for (;;) {
    const l = os.loadavg()[0];
    below = l <= 28 ? below + 1 : 0;
    console.log(`${nowUtc()} quiet window: load ${l.toFixed(1)}, ${below} of 30 minutes`);
    if (below >= 30) break;
    await new Promise((r) => setTimeout(r, 60000));
  }
  const quietStartedUtc = nowUtc();
  for (const id of QUIET_CASES) {
    await new Promise((resolve) => spawn(process.execPath, ['--max-old-space-size=24000', SELF, '--child', id], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, SCALE_QUIET: '1' } }).on('close', resolve));
  }
  const dir = path.join(SCRATCH, 'quiet-flight-rows');
  const env = { ...process.env, SDN_MODULES_ROOT: '/Users/tj/software/private/coordinator-d9/space-data-network-modules-bench2', SDN_MODULES_GIT: MODULES, SCALE_FLIGHT_ROWS: dir };
  for (const arm of QUIET_ARMS) {
    await new Promise((resolve) => spawn(process.execPath, [path.join(HERE, 'cost-flights.mjs'), 'flights', '--run', FLIGHT_RUN[arm], '--arms', arm, '--only', QUIET_KEYS.join(',')], { stdio: ['ignore', 'inherit', 'inherit'], env }).on('close', resolve));
  }
  const rowsQ = QUIET_CASES.map((id) => JSON.parse(fs.readFileSync(path.join(resDir, `quiet-${id}.json`), 'utf8')));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'quiet.jsonl'), JSON.stringify({ kind: 'window', quietStartedUtc, endedUtc: nowUtc(), loadAtEnd: +os.loadavg()[0].toFixed(1) }) + '\n' + rowsQ.map((r) => JSON.stringify({ kind: 'screen', id: r.id, startedUtc: r.startedUtc, cpuS: { propagation: r.phases.propagation.cpuS, search: r.phases.search.cpuS, refine: r.phases.refine.cpuS, total: r.totalCpuS }, events: r.events, load1Start: r.load1Start, load1End: r.load1End })).join('\n') + '\n' + flightRowsOf(dir, QUIET_KEYS).map((r) => JSON.stringify({ kind: 'flight', ...r })).join('\n') + '\n');
  console.log('quiet rows written');
}

// ---------- statistics ----------
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function ols(x, y) {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  const b = sxy / sxx, a = my - b * mx;
  let rss = 0;
  for (let i = 0; i < n; i++) rss += (y[i] - a - b * x[i]) ** 2;
  const sd = Math.sqrt(rss / (n - 2)), se = sd / Math.sqrt(sxx);
  const t = T95[n - 2] ?? 1.96;
  return { a, b, sd, se, lo: b - t * se, hi: b + t * se, n };
}
const callOf = (f) => (f.lo <= 1 && 1 <= f.hi && f.hi < 2 ? '1' : f.lo <= 2 && 2 <= f.hi && f.lo > 1 ? '2' : 'U');
function pass(x, f, key) {
  const rnd = mulberry32(fnv(`${SEED}|${key}`));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const out = {};
  for (const p0 of [1, 2]) {
    let c1 = 0, c2 = 0;
    for (let t = 0; t < TRIALS; t++) {
      const y = x.map((v) => f.a + p0 * v + f.sd * gauss());
      const k = callOf(ols(x, y));
      if (k === '1') c1++; else if (k === '2') c2++;
    }
    out[`P1_at${p0}`] = c1 / TRIALS; out[`P2_at${p0}`] = c2 / TRIALS;
  }
  return out;
}
function fit(points, pick, key) {
  const x = points.map((p) => Math.log(p.index)), y = points.map((p) => Math.log(pick(p)));
  const f = ols(x, y), sim = pass(x, f, key), call = callOf(f);
  const verdict = call === '1' && sim.P1_at1 >= 0.8 && sim.P1_at2 <= 0.1 ? 'p = 1' : call === '2' && sim.P2_at2 >= 0.8 && sim.P2_at1 <= 0.1 ? 'p = 2' : 'undecided';
  return { n: f.n, p: f.b, lo: f.lo, hi: f.hi, se: f.se, sd: f.sd, call, ...sim, verdict };
}
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

function build(rows, meta, cov, extra) {
  const full = rows.filter((r) => r.kind === 'full');
  const ref = { total: median(full.map((r) => r.cpuS.total)), propagation: median(full.map((r) => r.cpuS.propagation)), search: median(full.map((r) => r.cpuS.search)),
    refine: median(full.map((r) => r.cpuS.refine)), events: median(full.map((r) => r.events)) };
  const pointOf = (r) => ({ index: r.index, total: r.cpuS.total, propagation: r.cpuS.propagation, search: r.cpuS.search, refine: r.cpuS.refine, events: r.events });
  const mergedFull = { ...pointOf(full[0]), index: 1, total: ref.total, propagation: ref.propagation, search: ref.search, refine: ref.refine, events: ref.events };
  const ladder = [...rows.filter((r) => r.kind === 'ladder').map(pointOf), mergedFull];
  const dates = [...rows.filter((r) => r.kind === 'date').map(pointOf), mergedFull];
  const q = { cpu: (p) => p.total, events: (p) => p.events, propagation: (p) => p.propagation, search: (p) => p.search, refine: (p) => p.refine };
  const fits = {};
  for (const [series, pts] of [['ladder', ladder], ['dates', dates]]) {
    fits[series] = {};
    for (const [name, pick] of Object.entries(q)) {
      if (series === 'dates' && ['propagation', 'search', 'refine'].includes(name)) continue;
      fits[series][name] = fit(pts, pick, `${series}|${name}`);
    }
  }
  const shares = rows.map((r) => ({ id: r.id, kind: r.kind, index: r.index, share: r.cpuS.propagation / r.cpuS.total }));
  const fullShare = ref.propagation / ref.total;
  const spread = (k) => (Math.max(...full.map((r) => r.cpuS[k] ?? r.events)) - Math.min(...full.map((r) => r.cpuS[k] ?? r.events))) / median(full.map((r) => r.cpuS[k] ?? r.events));
  const noise = { totalCpuRelativeRange: spread('total') };
  const theories = [
    { theory: 'SGP4', flown: true, coveredShare: 1, propagationShare: fullShare, shareRange: [Math.min(...shares.map((s) => s.share)), Math.max(...shares.map((s) => s.share))], maxSpeedup: 1 / (1 - fullShare) },
    ...['xp', 'ap', 'ffm'].map((t) => ({ theory: t === 'xp' ? 'SGP4-XP' : t.toUpperCase(), flown: false, coveredShare: cov[t].share, propagationShare: null, reason: cov[t].share < 0.5 ? 'covered share below one half of the catalog: not flown, not extrapolated' : 'no integration of these states into this screen is built in this study: not flown' })),
  ];
  const L = fits.ladder.cpu, D = fits.dates.cpu, P = fits.ladder.propagation;
  const f2 = (v) => v.toFixed(2), f1 = (v) => v.toFixed(1);
  // Amendments 2 and 3: Amdahl conversion and the derived series per arm and per regime; a propagation 1/8 as costly changes the total by f = (1 - s) + s / 8
  const tm = Object.fromEntries((extra.timing ?? []).map((x) => [`${x.arm}|${x.regime}`, x]));
  const regimes = [...new Set((extra.timing ?? []).map((x) => x.regime))];
  const amdahl = (s, f) => { const fac = (1 - s) + s / 8; const dbl = Math.log2(1 / fac) / f.p, dblLo = Math.log2(1 / fac) / f.hi, dblHi = Math.log2(1 / fac) / f.lo; return { s, factor: fac, doublings: dbl, doublingsRange: [dblLo, dblHi], payloadYears: dbl * B1.payloadDoublingYears, allYears: dbl * B1.allObjectsDoublingYears }; };
  const derivedBase = (r) => ({ index: r.index, base: r.cpuS.search + r.cpuS.index + r.cpuS.host, refine: r.cpuS.refine, N: r.index * extra.n0 });
  const derivedPoints = [...rows.filter((r) => r.kind !== 'full').map(derivedBase), { index: 1, base: ref.search + median(full.map((r) => r.cpuS.index + r.cpuS.host)), refine: ref.refine, N: extra.n0 }];
  const derived = {};
  for (const regime of regimes) {
    const cS = tm[`SGP4|${regime}`]?.cpuUsPerState;
    if (!cS) continue;
    for (const arm of ['XP', 'XPU', 'AP', 'FFM20', 'FFM40']) {
      const x = tm[`${arm}|${regime}`];
      if (!x) continue;
      const c = x.cpuUsPerState;
      const pts = derivedPoints.map((d) => { const prop = c * 1e-6 * d.N * 10080; const lower = d.base + d.refine + prop, upper = d.base + d.refine * (c / cS) + prop; return { index: d.index, lower, upper, sLo: prop / upper, sHi: prop / lower }; }).sort((a, b) => a.index - b.index);
      const fullPt = pts.find((y) => y.index === 1);
      (derived[arm] ??= {})[regime] = { cpuUsPerState: c, n: x.n, points: pts, amdahl: { sLoCase: amdahl(fullPt.sLo, L), sHiCase: amdahl(fullPt.sHi, L) } };
    }
  }
  const sgp4Amdahl = amdahl(fullShare, L);
  // Amendment 6: AP against FFM and against SGP4 at the screen's 60 s step, per regime; f from the derived totals, doublings with the propagation-phase p
  const HEADLINE = 'With SGP4, propagation is about a quarter of the screen. With a more accurate propagator, it is nearly all of it, so per-state cost decides the horsepower.';
  const COMPARATOR = { 'Low orbit, laser spheres': 'FFM40', 'Low orbit, altimetry': 'FFM40', 'Strong drag, 2026': 'FFM40', 'Near 700 km': 'FFM40', 'Laser geodetic': 'FFM20', 'Medium Earth orbit': 'FFM20', 'Geostationary': 'FFM20', 'Inclined geosynchronous': 'FFM20' };
  const apVsFfm = [];
  for (const [regime, cmp] of Object.entries(COMPARATOR)) {
    const a = tm[`AP|${regime}`], fm = tm[`${cmp}|${regime}`], sg = tm[`SGP4|${regime}`], dA = derived.AP?.[regime], dF = derived[cmp]?.[regime];
    if (!a || !fm || !sg || !dA || !dF) continue;
    const at = (d, k) => d.points.find((x) => x.index === 1)[k];
    const fLo = at(dA, 'lower') / at(dF, 'lower'), fHi = at(dA, 'upper') / at(dF, 'upper');
    const dbl = (f, pp) => Math.log2(1 / f) / pp;
    const fs_ = [fLo, fHi].sort((x, y) => x - y);
    apVsFfm.push({ regime, comparator: cmp, apUs: a.cpuUsPerState, ffmUs: fm.cpuUsPerState, sgp4Us: sg.cpuUsPerState, apOverFfm: a.cpuUsPerState / fm.cpuUsPerState, apOverSgp4: a.cpuUsPerState / sg.cpuUsPerState,
      f: fs_, doublings: fs_.map((f) => dbl(f, P.p)), doublingsRange: [dbl(fs_[1], P.hi), dbl(fs_[0], P.lo)], payloadYears: fs_.map((f) => dbl(f, P.p) * B1.payloadDoublingYears), allYears: fs_.map((f) => dbl(f, P.p) * B1.allObjectsDoublingYears) });
  }
  const conversion = { propagationP: { p: P.p, lo: P.lo, hi: P.hi }, apVsFfm };
  const ratioText = apVsFfm.map((r) => `${r.regime} ${r.apOverFfm < 1 ? `${f2(r.apOverFfm)}` : `${f2(r.apOverFfm)}x`} (${r.comparator})`).join('; ');
  const sentence = `${HEADLINE} AP over FFM, CPU per state at the 60 s step of a screen: ${ratioText}. With p = ${f2(P.p)} (${f2(P.lo)} to ${f2(P.hi)}, the propagation-phase fit), the screen cost with AP against the same screen with FFM is a factor f of ${apVsFfm.map((r) => `${f2(r.f[0])} to ${f2(r.f[1])} (${r.regime})`).join('; ')}; a factor below 1 buys log2(1 / f) / p doublings of the object count, years at ${B1.payloadDoublingYears} (payload) and ${B1.allObjectsDoublingYears} (all objects, undecided) in the table.`;
  const pearson = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
  const lnN = rows.map((r) => Math.log(r.index)), loadMean = rows.map((r) => (r.load1Start + r.load1End) / 2), startOrder = rows.map((r) => Date.parse(r.startedUtc));
  const correlation = { lnNvsLoad: pearson(lnN, loadMean), lnNvsStartOrder: pearson(lnN, startOrder), loadRange: [Math.min(...loadMean), Math.max(...loadMean)] };
  const qa = extra.quiet ?? [];
  let quietCheck = { run: false };
  if (qa.length) {
    const win = qa.find((x) => x.kind === 'window'), qs = qa.filter((x) => x.kind === 'screen'), qf = qa.filter((x) => x.kind === 'flight');
    const rel = (a, b) => a / b - 1;
    const screen = qs.map((x) => { const l = rows.find((r) => r.id === x.id); const ph = ['propagation', 'search', 'refine', 'total'].map((k) => ({ phase: k, quiet: x.cpuS[k], loaded: l.cpuS[k], rel: rel(x.cpuS[k], l.cpuS[k]) })); return { id: x.id, phases: ph, events: [x.events, l.events] }; });
    const flightsLoaded = extra.flights ?? [];
    const sum = (list, arm) => list.filter((f) => f.arm === arm && QUIET_KEYS.includes(f.key)).reduce((a, f) => a + f.cpuUsPerState, 0);
    const ratios = [['AP/FFM40', 'AP', 'FFM40'], ['AP/SGP4', 'AP', 'SGP4']].map(([name, a, b]) => { const rq = sum(qf, a) / sum(qf, b), rl = sum(flightsLoaded, a) / sum(flightsLoaded, b); return { name, quiet: rq, loaded: rl, rel: rel(rq, rl) }; });
    const arms = QUIET_ARMS.map((arm) => ({ arm, quiet: sum(qf, arm), loaded: sum(flightsLoaded, arm), rel: rel(sum(qf, arm), sum(flightsLoaded, arm)) }));
    const worst = Math.max(...screen.flatMap((x) => x.phases.map((p) => Math.abs(p.rel))), ...ratios.map((r) => Math.abs(r.rel)));
    quietCheck = { run: true, window: win, screen, ratios, arms, worstRelativeDifference: worst, agree: worst <= 0.10 };
  }
  const overlap = !(L.hi < D.lo || D.hi < L.lo);
  const verdict = `${HEADLINE} Ladder p = ${f2(L.p)} (${f2(L.lo)} to ${f2(L.hi)}) on CPU: ${L.verdict}; events p = ${f2(fits.ladder.events.p)} (${f2(fits.ladder.events.lo)} to ${f2(fits.ladder.events.hi)}): ${fits.ladder.events.verdict}; propagation p = ${f2(P.p)}. The real-dates series is not drawn and not a scaling statement (diagnosis below). SGP4 propagation takes ${(100 * fullShare).toFixed(1)} percent of its screen CPU at the full catalog.`;
  const chartPoint = (p, ref_) => ({ index: p.index, cpu: p.total / ref_.total, propagation: p.propagation / ref_.total, search: p.search / ref_.total, refine: p.refine / ref_.total, events: p.events / ref_.events });
  const chart = {
    headline: HEADLINE,
    note: 'values normalized to the current catalog = 1; no object count; the real-dates series is not drawn (diagnosis)',
    ladder: { points: ladder.map((p) => chartPoint(p, ref)), fits: fits.ladder },
    propagationShare: fullShare, headline: HEADLINE, apVsFfm: apVsFfm.map((r) => ({ regime: r.regime, comparator: r.comparator, apOverFfm: r.apOverFfm, apOverSgp4: r.apOverSgp4, step: '60 s', f: r.f, doublings: r.doublings, doublingsRange: r.doublingsRange })), propagationP: conversion.propagationP,
    derived: { label: 'derived from measured parts; only SGP4 flew the whole screen', assumption: 'candidate and event counts held at SGP4\'s', series: Object.fromEntries(Object.entries(derived).map(([k, byRegime]) => [k, Object.fromEntries(Object.entries(byRegime).map(([rg, v]) => [rg, v.points.map((x) => ({ index: x.index, lower: x.lower / ref.total, upper: x.upper / ref.total }))]))])) },
  };
  return { HEADLINE, apVsFfm, correlation, quietCheck, derived, sgp4Amdahl, timing: tm, fits, shares, noise, theories, conversion, sentence, verdict, overlap, parity: meta.parity, chart, ladderN: ladder.length, datesN: dates.length };
}

function diagnosisText() {
  const f = path.join(OUT, 'diagnosis.json');
  const base = 'The real-dates series (seven past dates at N 0.74 to 0.90 of the current catalog, and the current catalog) is not drawn and carries no exponent: from 195 thousand events at the past dates, 324 thousand at 2025-12, to 1.07 million at the current catalog (3.3x for 11 percent more objects, where the ladder predicts about 1.2x). The statement is the ladder\'s: events grow as N^2.';
  if (!fs.existsSync(f)) return `${base} Diagnosis pending.`;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return `${base} ${d.text}`;
}
const regimes0 = (t) => [...new Set(Object.keys(t.timing).map((k) => k.split('|')[1]))].filter((r) => r !== 'pooled');
function render(rows, meta, cov, extra) {
  const t = build(rows, meta, cov, extra);
  const fmt = (v, n = 3) => (v === null || v === undefined ? '-' : Number(v).toFixed(n));
  const lines = [];
  lines.push('# Screening scale: CPU and events against the number of objects (report-only)', '');
  lines.push('Registration: `SCREENING-SCALE.md`. N is an index, the current catalog = 1. `counts.jsonl` holds the raw counts for the whitepaper only; the site, the chart and marketing never read it.', '');
  lines.push('## Fit of ln(value) on ln(N index)', '', '| Series | Quantity | n | p | Interval | P(1\\|1) | P(2\\|1) | P(2\\|2) | P(1\\|2) | Verdict |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const [s, o] of Object.entries(t.fits)) for (const [qn, f] of Object.entries(o)) lines.push(`| ${s} | ${qn} | ${f.n} | ${fmt(f.p)} | ${fmt(f.lo)} to ${fmt(f.hi)} | ${fmt(f.P1_at1, 2)} | ${fmt(f.P2_at1, 2)} | ${fmt(f.P2_at2, 2)} | ${fmt(f.P1_at2, 2)} | ${f.verdict} |`);
  lines.push('', 'P(a\\|b): the share of 2000 simulated fits at a true p = b that the three-way rule calls "p = a".', '');
  lines.push('## Runs', '', '| Case | Index | CPU total s | Propagation s | Search s | Refine s | Index s | Host s | Wall s | Events | Propagation share |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.id} | ${fmt(r.index, 4)} | ${fmt(r.cpuS.total, 1)} | ${fmt(r.cpuS.propagation, 1)} | ${fmt(r.cpuS.search, 1)} | ${fmt(r.cpuS.refine, 1)} | ${fmt(r.cpuS.index, 1)} | ${fmt(r.cpuS.host, 1)} | ${fmt(r.wallS.total, 1)} | ${r.events} | ${fmt(r.cpuS.propagation / r.cpuS.total, 3)} |`);
  lines.push('', `Run-to-run range of the total CPU over the three full-catalog repeats: ${(100 * t.noise.totalCpuRelativeRange).toFixed(1)} percent of the median.`, '');
  lines.push('## Propagation share by theory', '', '| Theory | Flown | Covered share of the catalog | Propagation share of the screen CPU | Note |', '|---|---|---|---|---|');
  for (const th of t.theories) lines.push(`| ${th.theory} | ${th.flown ? 'yes' : 'no'} | ${fmt(th.coveredShare, 4)} | ${th.propagationShare === null ? '-' : fmt(th.propagationShare, 3)} | ${th.reason ?? `range over cases ${fmt(th.shareRange[0], 3)} to ${fmt(th.shareRange[1], 3)}; zero-cost propagator bound ${fmt(th.maxSpeedup, 2)}x`} |`);
  lines.push('', '## Timing arm: propagation CPU per state at 7 days x 60 s, the cost benchmark\'s own flights (median over a regime\'s windows, microseconds)', '', `| Arm | Build | ${['pooled', ...regimes0(t)].join(' | ')} |`, `|---|---|${['pooled', ...regimes0(t)].map(() => '---').join('|')}|`);
  for (const arm of ['SGP4', 'XP', 'XPU', 'AP', 'FFM20', 'FFM40']) { const x = t.timing[`${arm}|pooled`]; if (!x) { lines.push(`| ${arm} | - | not measured |`); continue; } lines.push(`| ${arm} | ${x.build} | ${['pooled', ...regimes0(t)].map((rg) => { const y = t.timing[`${arm}|${rg}`]; return y ? `${fmt(y.cpuUsPerState, 2)} (n ${y.n})` : '-'; }).join(' | ')} |`); }
  lines.push('', 'Four windows per regime (the benchmark\'s), 32 pooled: the pooled figure is not the catalog\'s regime mix. FFM 40x40 flies below 8,400 km only. A window an arm refused or failed is absent from n.');
  lines.push('', '## AP against FFM and against SGP4, per regime, at the 60 s step of a screen', '', '| Regime | Comparator | AP us/state | FFM us/state | AP / FFM | SGP4 us/state | AP / SGP4 | f (screen with AP over screen with FFM) | Doublings | Years at 3.8 | Years at 9.6 (undecided) |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of t.apVsFfm) lines.push(`| ${r.regime} | ${r.comparator} | ${fmt(r.apUs, 1)} | ${fmt(r.ffmUs, 1)} | ${fmt(r.apOverFfm, 2)} | ${fmt(r.sgp4Us, 2)} | ${fmt(r.apOverSgp4, 0)} | ${fmt(r.f[0], 2)} to ${fmt(r.f[1], 2)} | ${fmt(r.doublings[0], 2)} to ${fmt(r.doublings[1], 2)} | ${fmt(r.payloadYears[0], 1)} to ${fmt(r.payloadYears[1], 1)} | ${fmt(r.allYears[0], 1)} to ${fmt(r.allYears[1], 1)} |`);
  lines.push('', `Every ratio is at the 60 s step of a screen. At 300 s per object-day the benchmark has AP at about 1/8 of FFM; at 60 s it is about 1/3 in low orbit, because AP's cost follows the number of output states and FFM's mostly follows its integration steps. AP is far costlier than SGP4 (the AP / SGP4 column) and cheaper than the FFM it nearly matches in low orbit; against FFM 20x20 in MEO and for laser geodetic satellites AP costs more. Doublings use the propagation-phase p of the ladder, ${fmt(t.conversion.propagationP.p, 2)} (${fmt(t.conversion.propagationP.lo, 2)} to ${fmt(t.conversion.propagationP.hi, 2)}); a negative number means AP costs more than the comparator. AP is propagator/sdn-ap 0.6.3, FFM is propagator/ffm 2.2.1.`);
  lines.push('', '## Derived totals: share of propagation s with each theory', '', '| Theory | Regime | s (band) |', '|---|---|---|');
  for (const [k, byRegime] of Object.entries(t.derived)) for (const [rg, v] of Object.entries(byRegime)) lines.push(`| ${k} | ${rg} | ${fmt(v.amdahl.sLoCase.s, 3)} to ${fmt(v.amdahl.sHiCase.s, 3)} |`);
  lines.push('', 'Derived from measured parts; only SGP4 flew the whole screen. Search, index and host CPU are SGP4 as measured at each N; propagation is the arm\'s measured CPU per state in that regime times N times 10,080 (FFM: its 10,000-state flight per state); refine is a band (lower: as measured with SGP4; upper: scaled by the arm\'s CPU per state over SGP4\'s in the regime). Hidden assumption: candidate and event counts are held at SGP4\'s; whether better accuracy allows a smaller threshold is another study.');
  lines.push('', '## Case order', '', `Pearson correlation of ln(N index) with the 1-minute load (mean of start and end) across the ${rows.length} screen rows: ${fmt(t.correlation.lnNvsLoad, 3)}; with the start time: ${fmt(t.correlation.lnNvsStartOrder, 3)}. Load across the rows: ${fmt(t.correlation.loadRange[0], 1)} to ${fmt(t.correlation.loadRange[1], 1)}.`);
  lines.push('', '## Quiet-window check', '');
  if (!t.quietCheck.run) lines.push('Not run: every absolute CPU figure in this file reads "under load, not quiet-checked" and is not for the page. The ratios and p stand with that caveat.');
  else {
    lines.push(`Quiet window: load at or below 28 for 30 minutes, then the re-runs (started ${t.quietCheck.window.quietStartedUtc}, ended ${t.quietCheck.window.endedUtc}, load at end ${t.quietCheck.window.loadAtEnd}). Agreement line 10 percent. Worst relative difference: ${fmt(100 * t.quietCheck.worstRelativeDifference, 1)} percent: ${t.quietCheck.agree ? 'the loaded and quiet figures agree' : 'they DISAGREE beyond the line; the absolute figures and s are read from the quiet rows'}.`, '', '| Case | Phase | Quiet CPU s | Loaded CPU s | Quiet / loaded - 1 |', '|---|---|---|---|---|');
    for (const x of t.quietCheck.screen) for (const p of x.phases) lines.push(`| ${x.id} | ${p.phase} | ${fmt(p.quiet, 2)} | ${fmt(p.loaded, 2)} | ${fmt(100 * p.rel, 1)} % |`);
    lines.push('', '| Timing arm (two windows) | Quiet us | Loaded us | Difference |', '|---|---|---|---|');
    for (const a of t.quietCheck.arms) lines.push(`| ${a.arm} | ${fmt(a.quiet, 2)} | ${fmt(a.loaded, 2)} | ${fmt(100 * a.rel, 1)} % |`);
    lines.push('', '| Ratio | Quiet | Loaded | Difference |', '|---|---|---|---|');
    for (const r of t.quietCheck.ratios) lines.push(`| ${r.name} | ${fmt(r.quiet, 4)} | ${fmt(r.loaded, 4)} | ${fmt(100 * r.rel, 1)} % |`);
  }
  lines.push('', '## Reading', '', t.sentence, '', '## Real dates: not drawn', '', diagnosisText(), '', '## Parity guard', '', `Phased path and fused path on ${meta.parity.id}: events ${meta.parity.phasedEvents} and ${meta.parity.fusedEvents}, event-set digests ${meta.parity.equal ? 'equal' : 'DIFFER'}.`, '', '## Verdict', '', t.verdict, '');
  return { 'table.json': JSON.stringify({ headline: t.HEADLINE, correlation: t.correlation, quietCheck: t.quietCheck, fits: t.fits, theories: t.theories, conversion: t.conversion, sentence: t.sentence, verdict: t.verdict, noise: t.noise, parity: meta.parity }, null, 1) + '\n', 'README.md': lines.join('\n'), 'chart.json': JSON.stringify(t.chart, null, 1) + '\n', _t: t };
}

function readAll() {
  const rows = fs.readFileSync(path.join(OUT, 'rows.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'meta.json'), 'utf8'));
  const counts = fs.readFileSync(path.join(OUT, 'counts.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const tf = path.join(OUT, 'timing.jsonl');
  const timing = fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const jl = (f) => (fs.existsSync(path.join(OUT, f)) ? fs.readFileSync(path.join(OUT, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const qrows = jl('quiet.jsonl'), flights = jl('flights.jsonl');
  return { rows, meta, cov: counts.find((x) => x.id === 'coverage'), extra: { timing, quiet: qrows, flights, n0: counts.find((x) => x.id === 'current-full-r1').objects } };
}
function table() {
  const { rows, meta, cov, extra } = readAll();
  const files = render(rows, meta, cov, extra);
  for (const [n, c] of Object.entries(files)) if (!n.startsWith('_')) fs.writeFileSync(path.join(OUT, n), c);
  console.log('table written');
}
function check() {
  const fails = [];
  const { rows, meta, cov, extra } = readAll();
  try {
    const reg = registration();
    if (!fs.readFileSync(path.join(ROOT, REG_REL), 'utf8').startsWith(reg.original)) fails.push('registration text changed (only appended amendments are allowed)');
    if (reg.blob !== meta.registration_blob) fails.push('registration blob differs from the rows');
    if (reg.commit !== meta.registration_commit) fails.push('registration commit differs from the rows');
    execFileSync('git', ['merge-base', '--is-ancestor', meta.registration_commit, 'HEAD'], { cwd: ROOT });
    const regMs = Date.parse(git(['log', '-1', '--format=%cI', meta.registration_commit]));
    for (const r of rows) if (Date.parse(r.startedUtc) <= regMs) fails.push(`row ${r.id} started before the registration commit`);
    const added = git(['log', '--diff-filter=A', '--format=%H', '--', 'results/two-exponentials/screening-scale/rows.jsonl']).split('\n').filter(Boolean);
    if (added.length && added.at(-1) === meta.registration_commit) fails.push('rows committed in the registration commit');
  } catch (e) { fails.push(`registration order: ${e.message.split('\n')[0]}`); }
  const files = render(rows, meta, cov, extra);
  for (const [n, c] of Object.entries(files)) {
    if (n.startsWith('_')) continue;
    const have = fs.existsSync(path.join(OUT, n)) ? fs.readFileSync(path.join(OUT, n), 'utf8') : null;
    if (have !== c) fails.push(`${n} does not reproduce byte for byte`);
  }
  const t = files._t;
  for (const s of ['ladder', 'dates']) for (const f of Object.values(t.fits[s])) {
    if (![f.p, f.lo, f.hi].every(Number.isFinite)) fails.push(`${s}: p or its interval missing`);
    if (!['p = 1', 'p = 2', 'undecided'].includes(f.verdict)) fails.push(`${s}: no verdict`);
  }
  if (t.ladderN !== 10) fails.push(`ladder has ${t.ladderN} points, registered 10`);
  if (t.datesN !== 8) fails.push(`dates has ${t.datesN} points, registered 8`);
  if (!rows.every((r) => Number.isFinite(r.events) && Number.isFinite(r.index))) fails.push('events or index missing');
  if (!t.theories.every((th) => th.flown ? Number.isFinite(th.propagationShare) : Number.isFinite(th.coveredShare))) fails.push('propagation share or coverage missing');
  for (const arm of ['SGP4', 'XP', 'XPU', 'AP', 'FFM20', 'FFM40']) if (!t.timing[`${arm}|pooled`]) fails.push(`timing arm ${arm} not measured`);
  if (!/doublings/.test(t.sentence) || !/years/.test(t.sentence)) fails.push('conversion sentence');
  if (!meta.parity.equal) fails.push('parity guard: phased and fused events differ');
  const chart = fs.readFileSync(path.join(OUT, 'chart.json'), 'utf8');
  if (/"(count|objects)"/.test(chart)) fails.push('chart.json carries a count');
  const rowsText = fs.readFileSync(path.join(OUT, 'rows.jsonl'), 'utf8');
  if (/"objects"/.test(rowsText)) fails.push('rows.jsonl carries an object count');
  for (const f of ['counts.jsonl', 'meta.json']) if (!fs.existsSync(path.join(OUT, f))) fails.push(`missing ${f}`);
  console.log(fails.length ? `FAIL\n${fails.join('\n')}` : `PASS: ladder p ${t.fits.ladder.cpu.p.toFixed(2)} (${t.fits.ladder.cpu.lo.toFixed(2)} to ${t.fits.ladder.cpu.hi.toFixed(2)}), dates p ${t.fits.dates.cpu.p.toFixed(2)}; ${t.verdict}`);
  process.exit(fails.length ? 1 : 0);
}

// ---------- timing arm (Amendment 2): propagation CPU per state at 7 days x 60 s, timing only ----------
const TIMING_K = { sgp4: 200, xp: 100, ap: 100, ffm: 10 };
const STEPS = HORIZON_DAYS * 1440;   // 10,080 states per object at 60 s
const ROOTS = { sgp4: path.join(MODULES.replace(/-ca$/, '-r2'), 'propagator/sgp4'), xp: path.join(MODULES.replace(/-ca$/, '-r2'), 'propagator/sgp4-xp'),
  ap: path.join(MODULES, 'propagator/sdn-ap'), ffm: path.join(MODULES.replace(/-ca$/, '-r2'), 'propagator/ffm') };
async function timing(theory) {
  const smokeK = Number(process.env.SCALE_TIMING_SMOKE ?? 0), K = smokeK || TIMING_K[theory];
  if (!K) throw new Error(`no theory ${theory}`);
  const pop = loadPopulation('current');
  const cs = await lib('gpu/catalogScreen.mjs');
  const frames = cs.splitCatalog(pop.bytes);
  const ranked = pop.norad.map((n, i) => [sha256(`${SEED}:timing:${n}`), i]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, K).map((r) => r[1]).sort((a, b) => a - b);
  const { OMM } = await import(pathToFileURL(path.join(CA, 'node_modules/spacedatastandards.org/lib/js/CQR/main.js')).href);
  const fb = await import(pathToFileURL(path.join(CA, 'node_modules/flatbuffers/mjs/flatbuffers.js')).href);
  const omms = ranked.map((i) => OMM.getRootAsOMM(new fb.ByteBuffer(frames[i])).unpack());
  const cpuUs = () => { const u = process.cpuUsage(); return u.user + u.system; };
  const startMs = Date.parse('2026-11-06T00:00:00Z');
  let flight, wasmFile;
  if (theory === 'sgp4') {
    // the sgp4 module's propagate_ephemeris: 60 s lines over 7 days for each object
    const sdk = await import(pathToFileURL(path.join(CA, 'node_modules/space-data-module-sdk/src/host/browserModuleHarness.js')).href);
    const codec = await import(pathToFileURL(path.join(CA, 'node_modules/space-data-module-sdk/src/invoke/codec.js')).href);
    const enc = await import(pathToFileURL(path.join(ROOTS.sgp4, 'tests/lib/payloadEncoders.mjs')).href);
    wasmFile = path.join(ROOTS.sgp4, 'dist/isomorphic/module.wasm');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOTS.sgp4, 'plugin-manifest.json'), 'utf8'));
    const raw = await sdk.createBrowserModuleHarness({ wasmSource: fs.readFileSync(wasmFile), manifest, surface: 'direct' });
    const invoke = async (request) => { const a = await raw.invokeRaw(codec.encodePluginInvokeRequest(request)); return a; };
    const sized = (fs_) => { const out = new Uint8Array(fs_.reduce((n, f) => n + 4 + f.length, 0)), v = new DataView(out.buffer); let at = 0; for (const f of fs_) { v.setUint32(at, f.length, true); out.set(f, at + 4); at += 4 + f.length; } return out; };
    await invoke({ methodId: 'ingest_omm', inputs: [{ portId: 'omm', payload: sized(ranked.map((i) => frames[i])), typeRef: { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' } }] });
    const numbers = omms.map((o) => Number(o.NORAD_CAT_ID));
    const epoch = startMs / 86400000 + 2440587.5;
    flight = async () => { const r = await invoke({ methodId: 'propagate_ephemeris', inputs: [{ portId: 'request', typeRef: { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' },
      payload: enc.encodePropagatorBatchRequest({ outputFrame: enc.ReferenceFrame.TEME, epoch, stopEpoch: epoch + (STEPS - 1) / 1440, stepSeconds: 60, catalogNumbers: numbers }) }] }); if (r.length < K * STEPS * 40) throw new Error(`short answer: ${r.length} bytes`); };
  } else if (theory === 'ap' || theory === 'xp') {
    const { tleLines, elementsOf } = await import(pathToFileURL(path.join(MODULES, 'propagator/sdn-ap/test/lib/tle.mjs')).href);
    const sets = omms.map((o, i) => {
      const epochMs = Date.parse(`${o.EPOCH}Z`), d = new Date(epochMs);
      const day = 1 + (epochMs - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000;
      const bterm = Math.min(0.1, Math.max(1e-5, Math.abs(Number(o.BSTAR)) * 12.741621));
      return { lines: tleLines({ satnum: (1 + i) % 100000, year: d.getUTCFullYear() % 100, day, type: 4, agom: 0.01, bterm, inc: o.INCLINATION, raan: o.RA_OF_ASC_NODE, ecc: o.ECCENTRICITY, argp: o.ARG_OF_PERICENTER, ma: o.MEAN_ANOMALY, mm: o.MEAN_MOTION, rev: 0 }) };
    });
    if (theory === 'ap') {
      const { openModule, wasmPath } = await import(pathToFileURL(path.join(MODULES, 'propagator/sdn-ap/test/lib/module.mjs')).href);
      wasmFile = wasmPath;
      const m = await openModule({ threads: 0 });
      m.init(sets.map((s) => elementsOf(s.lines)));
      const minutes = new Float64Array(sets.length);
      flight = () => { for (let t = 0; t < STEPS; t++) m.atMinutes(minutes.fill(t), { raw: true }); };
    } else {
      const { createRequire } = await import('node:module');
      wasmFile = path.join(ROOTS.xp, 'third_party/ussf-sgp4/Sgp4Prop.xp.wasm');
      const M = createRequire(import.meta.url)(path.join(ROOTS.xp, 'third_party/ussf-sgp4/Sgp4Prop.xp.js'));
      M.print = () => {}; M.printErr = () => {};
      if (!M.calledRun) await new Promise((resolve) => { M.onRuntimeInitialized = resolve; });
      const n = sets.length, keys = M._malloc(8 * n), errors = M._malloc(8 * n), out = M._malloc(64 * n);
      const str = (s) => { const b = new TextEncoder().encode(s), p = M._malloc(b.length + 1); M.HEAPU8.set(b, p); M.HEAPU8[p + b.length] = 0; return p; };
      sets.forEach((s, i) => { const p = str(s.lines[0]), q = str(s.lines[1]), key = M._TleAddSatFrLines_wasm(p, q); M._free(p); M._free(q); if (key < 0n) throw new Error('USSF refused an input'); M.HEAP64[(keys >> 3) + i] = BigInt(key); });
      if (M._Sgp4InitSats_wasm(keys, n, errors) !== 0) throw new Error('USSF initialization failed');
      flight = () => { for (let t = 0; t < STEPS; t++) if (M._Sgp4PropPosVel_wasm(keys, n, t, 1, 1, out) !== 0) throw new Error('USSF propagation failed'); };
    }
  } else {
    throw new Error('ffm: driver not built in this runner version');
  }
  const wasmSha = fs.existsSync(wasmFile) ? sha256(fs.readFileSync(wasmFile)) : null;
  await flight();   // warm-up flight
  const reps = [];
  for (let r = 0; r < 3; r++) { const l0 = os.loadavg()[0], c0 = cpuUs(), t0 = performance.now(); await flight(); reps.push({ cpuUsPerState: (cpuUs() - c0) / (K * STEPS), wallS: (performance.now() - t0) / 1000, load1: +l0.toFixed(1) }); }
  const row = { theory, objects: K, states: K * STEPS, steps: STEPS, stepSeconds: 60, wasmSha256: wasmSha, startedUtc: nowUtc(), reps,
    cpuUsPerState: median(reps.map((x) => x.cpuUsPerState)), range: [Math.min(...reps.map((x) => x.cpuUsPerState)), Math.max(...reps.map((x) => x.cpuUsPerState))] };
  fs.mkdirSync(path.join(SCRATCH, 'results'), { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'results', `${smokeK ? 'smoke-' : ''}timing-${theory}.json`), JSON.stringify(row) + '\n');
  console.log(`TIMING ${JSON.stringify(row)}`);
  process.exit(0);
}

const mode = process.argv[2];
if (mode === '--timing') await timing(process.argv[3]);
else if (mode === '--populations') await populations();
else if (mode === '--coverage') coverage();
else if (mode === '--run') await run();
else if (mode === '--quiet') await quiet();
else if (mode === '--assemble') assemble(registration());
else if (mode === '--child') await child(process.argv[3]);
else if (mode === '--smoke') {
  // plumbing only: a fixed subset of the current snapshot, not a row
  const pop = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'pop/current.norad.json'), 'utf8'));
  await child('smoke', { id: 'smoke', population: 'current', fraction: 1, pick: pop.map((_, i) => i).filter((i) => i % Math.floor(pop.length / 200) === 0).slice(0, 200), workers: 2, fused: process.argv[3] === 'fused' });
} else if (mode === '--table') table();
else if (mode === '--check') check();
else { console.error('usage: screening-scale.mjs --populations | --coverage | --run | --table | --check'); process.exit(2); }
