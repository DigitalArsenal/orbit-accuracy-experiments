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
const MODULES = '/Users/tj/software/private/coordinator-d9/space-data-network-modules-r2';
const CA = path.join(MODULES, 'analysis/conjunction-assessment');
const ARCHIVE = '/opt/data/sdn-archive';
const GPH = `${ARCHIVE}/spacetrack/gp_history/by-creation`;
const CURRENT_SNAPSHOT = `${ARCHIVE}/spacetrack/gp/2026/2026-11-05.json.gz`;
const CURRENT_SHA = 'b63176497acc503080a5243980319e577f3387de6b318426a1766ff6359aa1c1';
const WASM_SHA = 'a077c6929cd1eb979eb3c39dbe158198f6c94f90a5ad7494345e51596699148f';
const PINNED = {
  'gpu/catalogScreen.mjs': '259ec4674b91a321a577d2455b560b89606c135ce734f9eddbdd6694d6ae2cfc',
  'gpu/continuousScreen.mjs': 'e191d9f3a8cc3f3438dcbabe459c99cbbb49f4f730b3a88bbd0462acc70167d2',
  'gpu/allVsAll.mjs': 'fd7fc206b31b7e4c4ca9e33203f2880ebb3e0bff72adff3d14542f8bd283edfa',
  'gpu/scrFrames.mjs': '6181c730044e5c879b8b10188652bc359bfa2f44e1b08780edfff599fec37423',
  'tests/lib/conjunctionCommandHarness.mjs': 'c96a13d43af9c569677cb46a34c2d578ef77ef1d2bfe16fca1e1392f7c4ec022',
  'tests/lib/cqr.mjs': 'df0e968326a662c041ce3fc7bf465468b68e41d23936b67c2c7f832f6390c9f0',
  'scripts/lib/ommCatalog.mjs': '2a11f493daa87f30ba2ff0398826f192c17580e74b8c0a5c6b2f0b9eb51adf35',
  'plugin-manifest.json': '2833c53f0fbe8e496c706a9d4989c609676132d710dbd270ee2d300bf18463ec',
  'dist/isomorphic/module.wasm': WASM_SHA,
};
const NODE = 'v25.4.0';
const SEED = 'screening-scale-20261106';
const DATES = ['2022-12-21', '2023-06-21', '2023-12-21', '2024-06-21', '2024-12-21', '2025-06-21', '2025-12-21'];
const CONTROLS = { thresholdKm: 5, coarseStepSec: 60, workers: 8, algorithm: 'ALFANO_MAXIMUM' };
const HORIZON_DAYS = 7, WINDOW_HOURS = 6;
const CORES = 28, MIN_FREE_MEM_GIB = 16, MIN_FREE_DISK_GIB = 25, CONCURRENCY = Number(process.env.SCALE_CONCURRENCY ?? 2);
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
  const commit = git(['log', '-1', '--format=%H', '--', REG_REL]);
  if (!commit) throw new Error('registration not committed');
  return { commit, blob: git(['hash-object', REG_REL]), time: git(['log', '-1', '--format=%cI', commit]) };
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
  const ok = load < CORES && freeGiB > MIN_FREE_MEM_GIB && diskGiB >= MIN_FREE_DISK_GIB;
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
      const canon = full.events.map((e) => JSON.stringify(e, (k, v) => (typeof v === 'bigint' ? v.toString() : v))).sort();
      return emit({ ...base(), fused: true, fusedCpuS, fusedWallS: (performance.now() - screenT) / 1000, events: canon.length, candidates: full.candidates, excluded: full.excluded.length, digest: sha256(canon.join('\n')) });
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
  const canon = merged.map((e) => JSON.stringify(e, (k, v) => (typeof v === 'bigint' ? v.toString() : v))).sort();
  const phases = Object.fromEntries(['propagation', 'search', 'refine', 'index'].map((k) => [k, acc[k] ?? { cpuS: 0, wallS: 0, calls: 0 }]));
  const hostCpuS = total.cpuS - Object.values(phases).reduce((s, p) => s + p.cpuS, 0);
  return emit({ ...base(), phases, hostCpuS, totalCpuS: total.cpuS, totalWallS: total.wallS, load: loadS, moduleStartCpuS,
    events: canon.length, candidates, excluded: cutoffs.size, digest: sha256(canon.join('\n')) });

  function base() {
    return { id: c.id, startedUtc, endedUtc: nowUtc(), objects: chosen.length, load1Start: +load0.toFixed(1), load1End: +os.loadavg()[0].toFixed(1), workers: controls.workers };
  }
  function emit(row) { row.endedUtc = nowUtc(); if (!smoke) fs.writeFileSync(path.join(SCRATCH, 'results', `${c.id}.json`), JSON.stringify(row) + '\n'); console.log(`ROW ${JSON.stringify(row)}`); return row; }
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
        const child_ = spawn(process.execPath, [SELF, '--child', c.id], { stdio: ['ignore', 'pipe', 'inherit'] });
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
  assemble(reg);
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
  fs.writeFileSync(path.join(OUT, 'counts.jsonl'), crows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const meta = {
    registration_commit: reg.commit, registration_blob: reg.blob, registration_time: reg.time,
    runner_sha256: sha256(fs.readFileSync(SELF)), node: process.version,
    module: { plugin: 'analysis/conjunction-assessment', version: '0.17.0', wasm_sha256: WASM_SHA, root: path.basename(MODULES), pinned: PINNED },
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

function build(rows, meta, cov) {
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
  const years = (p, d) => (3 / p) * d;
  const L = fits.ladder.cpu, D = fits.dates.cpu;
  const convert = (f) => ({ doublings: 3 / f.p, doublingsRange: [3 / f.hi, 3 / f.lo], payloadYears: years(f.p, B1.payloadDoublingYears), payloadYearsRange: [years(f.hi, B1.payloadDoublingYears), years(f.lo, B1.payloadDoublingYears)],
    allYears: years(f.p, B1.allObjectsDoublingYears), allYearsRange: [years(f.hi, B1.allObjectsDoublingYears), years(f.lo, B1.allObjectsDoublingYears)] });
  const conversion = { ladder: convert(L), dates: convert(D) };
  const f2 = (v) => v.toFixed(2), f1 = (v) => v.toFixed(1);
  const c = conversion.ladder, d = conversion.dates;
  const sentence = `With p = ${f2(L.p)} (95 percent interval ${f2(L.lo)} to ${f2(L.hi)}; ${L.verdict}) on the thinning ladder, one eighth of the compute buys 3 / p = ${f2(c.doublings)} doublings of the object count (${f2(c.doublingsRange[0])} to ${f2(c.doublingsRange[1])}): ${f1(c.payloadYears)} years (${f1(c.payloadYearsRange[0])} to ${f1(c.payloadYearsRange[1])}) at the payload doubling time of ${B1.payloadDoublingYears} years (catalog growth 2018-2026, exponential), and ${f1(c.allYears)} years (${f1(c.allYearsRange[0])} to ${f1(c.allYearsRange[1])}) at the all-objects fit of ${B1.allObjectsDoublingYears} years (2018-2026, undecided between exponential and linear). The real-dates fit gives p = ${f2(D.p)} (${f2(D.lo)} to ${f2(D.hi)}; ${D.verdict}): ${f2(d.doublings)} doublings, ${f1(d.payloadYears)} years at ${B1.payloadDoublingYears} and ${f1(d.allYears)} years at ${B1.allObjectsDoublingYears}.`;
  const overlap = !(L.hi < D.lo || D.hi < L.lo);
  const verdict = `Ladder p = ${f2(L.p)} (${f2(L.lo)} to ${f2(L.hi)}): ${L.verdict}. Dates p = ${f2(D.p)} (${f2(D.lo)} to ${f2(D.hi)}): ${D.verdict}. The two intervals ${overlap ? 'overlap' : 'do not overlap'}. Propagation takes ${(100 * fullShare).toFixed(1)} percent of the screen CPU at the full catalog (SGP4); a propagator of zero cost cuts the screen CPU at most by a factor ${f2(1 / (1 - fullShare))}.`;
  const chartPoint = (p, ref_) => ({ index: p.index, cpu: p.total / ref_.total, propagation: p.propagation / ref_.total, search: p.search / ref_.total, refine: p.refine / ref_.total, events: p.events / ref_.events });
  const chart = {
    note: 'values normalized to the current catalog = 1; no object count',
    ladder: { points: ladder.map((p) => chartPoint(p, ref)), fits: fits.ladder },
    dates: { points: rows.filter((r) => r.kind === 'date').map(pointOf).concat([mergedFull]).map((p) => chartPoint(p, ref)), fits: fits.dates },
    propagationShare: fullShare, conversion,
  };
  return { fits, shares, noise, theories, conversion, sentence, verdict, overlap, parity: meta.parity, chart, ladderN: ladder.length, datesN: dates.length };
}

function render(rows, meta, cov) {
  const t = build(rows, meta, cov);
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
  lines.push('', '## Conversion', '', t.sentence, '', '## Parity guard', '', `Phased path and fused path on ${meta.parity.id}: events ${meta.parity.phasedEvents} and ${meta.parity.fusedEvents}, event-set digests ${meta.parity.equal ? 'equal' : 'DIFFER'}.`, '', '## Verdict', '', t.verdict, '');
  return { 'table.json': JSON.stringify({ fits: t.fits, theories: t.theories, conversion: t.conversion, sentence: t.sentence, verdict: t.verdict, noise: t.noise, parity: meta.parity }, null, 1) + '\n', 'README.md': lines.join('\n'), 'chart.json': JSON.stringify(t.chart, null, 1) + '\n', _t: t };
}

function readAll() {
  const rows = fs.readFileSync(path.join(OUT, 'rows.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'meta.json'), 'utf8'));
  const counts = fs.readFileSync(path.join(OUT, 'counts.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { rows, meta, cov: counts.find((x) => x.id === 'coverage') };
}
function table() {
  const { rows, meta, cov } = readAll();
  const files = render(rows, meta, cov);
  for (const [n, c] of Object.entries(files)) if (!n.startsWith('_')) fs.writeFileSync(path.join(OUT, n), c);
  console.log('table written');
}
function check() {
  const fails = [];
  const { rows, meta, cov } = readAll();
  try {
    const reg = registration();
    if (reg.blob !== meta.registration_blob) fails.push('registration changed after the rows');
    if (reg.commit !== meta.registration_commit) fails.push('registration commit differs from the rows');
    execFileSync('git', ['merge-base', '--is-ancestor', meta.registration_commit, 'HEAD'], { cwd: ROOT });
    const regMs = Date.parse(git(['log', '-1', '--format=%cI', meta.registration_commit]));
    for (const r of rows) if (Date.parse(r.startedUtc) <= regMs) fails.push(`row ${r.id} started before the registration commit`);
    const added = git(['log', '--diff-filter=A', '--format=%H', '--', 'results/two-exponentials/screening-scale/rows.jsonl']).split('\n').filter(Boolean);
    if (added.length && added.at(-1) === meta.registration_commit) fails.push('rows committed in the registration commit');
  } catch (e) { fails.push(`registration order: ${e.message.split('\n')[0]}`); }
  const files = render(rows, meta, cov);
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

const mode = process.argv[2];
if (mode === '--populations') await populations();
else if (mode === '--coverage') coverage();
else if (mode === '--run') await run();
else if (mode === '--child') await child(process.argv[3]);
else if (mode === '--smoke') {
  // plumbing only: a fixed subset of the current snapshot, not a row
  const pop = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'pop/current.norad.json'), 'utf8'));
  await child('smoke', { id: 'smoke', population: 'current', fraction: 1, pick: pop.map((_, i) => i).filter((i) => i % Math.floor(pop.length / 200) === 0).slice(0, 200), workers: 2, fused: process.argv[3] === 'fused' });
} else if (mode === '--table') table();
else if (mode === '--check') check();
else { console.error('usage: screening-scale.mjs --populations | --coverage | --run | --table | --check'); process.exit(2); }
