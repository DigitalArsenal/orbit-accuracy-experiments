#!/usr/bin/env node
// Alerts per real conjunction (registration: ALERTS-PER-CONJUNCTION.md, task experiments-alerts-per-conjunction-20261106). Statistics only: every state is the module's.
// --screen     fly the tiers (refuses on a dirty or uncommitted registration; guards before every start)
// --geometry   event states to encounter-plane records, regimes and classes (scratch only)
// --errors     the error rows of both arms (scratch), errors.json (committed)
// --sizing     the three-way rule's pass chances on synthetic errors (sizing.json)
// --sim        the replicates (scratch), then rows.jsonl
// --table      table.json, README.md, chart.json from the committed rows
// --check      registration and order, t0's digest, medians against the landed cells, the table reproducing byte for byte
// (--child <tier>, --shard <i>, --size-shard <i> are the runner's own subprocesses.)
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
const REG_REL = 'experiments/two-exponentials/ALERTS-PER-CONJUNCTION.md';
const OUT = path.join(ROOT, 'results/two-exponentials/alerts-per-conjunction');
const OUT_REL = 'results/two-exponentials/alerts-per-conjunction';
const SCRATCH = process.env.ALERTS_SCRATCH ?? '/Users/tj/software/terrain-work/body-look/b3';
const POP = path.join(SCRATCH, 'pop');
const B2_POP = '/Users/tj/software/terrain-work/body-look/scale/pop';
const MODULES = '/Users/tj/software/private/coordinator-d9/space-data-network-modules-ca';
const CA = path.join(MODULES, 'analysis/conjunction-assessment');
const ARCHIVE = '/opt/data/sdn-archive';
const OT = `${ARCHIVE}/operator-theory`;
const SNAPSHOT = `${ARCHIVE}/spacetrack/gp/2026/2026-11-05.json.gz`;
const SNAPSHOT_SHA = 'b63176497acc503080a5243980319e577f3387de6b318426a1766ff6359aa1c1';
const WASM_SHA = 'fe7533e9168c65f31b5d98ea90bafb76024a5e035df5c7f34d252da44718bfec';
const B2_DIGEST = 'ef114fe59487d57ffc7c92be81fe22d01f443c564e3fce362897837ebb8f4eb7';
const B2_EVENTS = 1069553, B2_LADDER = 16091;
const PINNED = {
  'gpu/catalogScreen.mjs': '259ec4674b91a321a577d2455b560b89606c135ce734f9eddbdd6694d6ae2cfc',
  'gpu/continuousScreen.mjs': 'e191d9f3a8cc3f3438dcbabe459c99cbbb49f4f730b3a88bbd0462acc70167d2',
  'gpu/allVsAll.mjs': 'fd7fc206b31b7e4c4ca9e33203f2880ebb3e0bff72adff3d14542f8bd283edfa',
  'gpu/scrFrames.mjs': '6181c730044e5c879b8b10188652bc359bfa2f44e1b08780edfff599fec37423',
  'tests/lib/conjunctionCommandHarness.mjs': 'c96a13d43af9c569677cb46a34c2d578ef77ef1d2bfe16fca1e1392f7c4ec022',
  'tests/lib/cqr.mjs': 'df0e968326a662c041ce3fc7bf465468b68e41d23936b67c2c7f832f6390c9f0',
  'plugin-manifest.json': '5285b8dcb05c619c15edf2795b31a0e4b457bfd17594b54e9e208dfbacf86c4f',
  'dist/isomorphic/module.wasm': WASM_SHA,
};
const NODE = 'v25.4.0';
const SEED = 'screening-scale-20261106';
const CONTROLS = { coarseStepSec: 60, workers: 8, algorithm: 'ALFANO_MAXIMUM' };
const HORIZON_DAYS = 7, WINDOW_HOURS = 6, START_JD = Date.parse('2026-11-06T00:00:00Z') / 86400000 + 2440587.5;
const MIN_FREE_MEM_GIB = 16, MIN_FREE_DISK_GIB = 25, HEAVY = 4;
const LABEL = 'Real geometry and real forecast errors, simulated pairing. No covariance anywhere; this is not a collision-probability result.';

const TIERS = [{ id: 't0', tier: 0, fraction: 1, seed: null, thresholdKm: 5, keepFromKm: 0 }];
for (const [tier, fraction, thresholdKm, keepFromKm] of [[1, 1 / 8, 50, 5], [2, 1 / 64, 300, 50], [3, 1 / 256, 1000, 300]]) {
  for (const seed of [1, 2, 3]) TIERS.push({ id: `t${tier}-s${seed}`, tier, fraction, seed, thresholdKm, keepFromKm });
}
// The regimes every encounter's object falls in. LS is the sensitivity's alternate for the 750 to 2000 km band.
const REGIMES = ['SD', 'S1', 'DO', 'GD', 'GN', 'GE', 'IG', 'HX'];
const REGIME_LABEL = { SD: 'Strong drag', S1: 'Near 700 km', DO: 'Altimetry band', GD: 'Laser geodetic band', GN: 'Medium Earth orbit', GE: 'Geostationary', IG: 'Inclined geosynchronous', HX: 'Highly elliptical', LS: 'Laser spheres' };
const THEORIES = ['SGP4', 'XP', 'XPU', 'AP', 'FFM'];
const THEORY_LABEL = { SGP4: 'SGP4', XP: 'XP, whiteroom', XPU: 'XP, Space Force', AP: 'AP', FFM: 'FFM', PUB: 'SGP4 on public sets', ZERO: 'Perfect forecast' };
const PCTS = [0.95, 0.99, 0.999];
const REPLICATES = 400;
const HELD_GALILEO = [43567, 37847, 41862, 41174, 43055, 41175];
const RECORD = 14;   // missKm, speedKmS, then the plane's two axes in each object's radial, in-track, cross-track
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const nowUtc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sig = (x, n = 5) => (Number.isFinite(x) ? Number(x.toPrecision(n)) : null);
const pct = (sorted, q) => { if (!sorted.length) return null; const x = (sorted.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo); };
const asc = (a, b) => a - b;
const fmt = (x) => (x === null || x === undefined ? 'n/a' : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3));

function registration() {
  const dirty = git(['status', '--porcelain', '--', REG_REL]);
  if (dirty) throw new Error(`registration dirty or uncommitted: ${dirty}`);
  const adds = git(['log', '--diff-filter=A', '--format=%H', '--', REG_REL]).split('\n').filter(Boolean);
  if (!adds.length) throw new Error('registration not committed');
  const commit = adds.at(-1);
  return { commit, blob: git(['rev-parse', `${commit}:${REG_REL}`]), time: git(['log', '-1', '--format=%cI', commit]), amendments: git(['log', '--reverse', '--format=%H %cI', `${commit}..HEAD`, '--', REG_REL]).split('\n').filter(Boolean) };
}
function guards() {
  const text = execFileSync('vm_stat', { encoding: 'utf8' });
  const page = Number(/page size of (\d+)/.exec(text)[1]);
  const pages = (k) => Number(new RegExp(`Pages ${k}:\\s+(\\d+)`).exec(text)?.[1] ?? 0);
  const freeGiB = ((pages('free') + pages('inactive') + pages('speculative')) * page) / 2 ** 30;
  fs.mkdirSync(SCRATCH, { recursive: true });
  const st = fs.statfsSync(SCRATCH);
  const diskGiB = (st.bavail * st.bsize) / 2 ** 30;
  return { ok: freeGiB > MIN_FREE_MEM_GIB && diskGiB >= MIN_FREE_DISK_GIB, load: +os.loadavg()[0].toFixed(1), freeGiB: +freeGiB.toFixed(1), diskGiB: +diskGiB.toFixed(1) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lib = (rel) => import(pathToFileURL(path.join(CA, rel)).href);
function verifyPins() {
  if (process.version !== NODE) throw new Error(`node ${process.version}, registered ${NODE}`);
  for (const [rel, want] of Object.entries(PINNED)) if (sha256(fs.readFileSync(path.join(CA, rel))) !== want) throw new Error(`${rel} differs from the registered hash`);
}
function subsetOf(norad, fraction, seed) {
  if (fraction === 1) return norad.map((_, i) => i);
  const want = Math.round(fraction * norad.length);
  const ranked = norad.map((n, i) => [sha256(`${SEED}:${seed}:${n}`), i]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return ranked.slice(0, want).map((r) => r[1]).sort((a, b) => a - b);
}
const digestOf = (keys) => { const h = createHash('sha256'); for (const k of keys) h.update(k).update('\n'); return h.digest('hex'); };

// ---------- the screen ----------
async function child(id) {
  verifyPins();
  const t = TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`no tier ${id}`);
  const started = nowUtc(), load0 = os.loadavg()[0], cpu0 = process.cpuUsage(), wall0 = performance.now();
  const { createConjunctionCommandHarness } = await lib('tests/lib/conjunctionCommandHarness.mjs');
  const cs = await lib('gpu/catalogScreen.mjs');
  const av = await lib('gpu/allVsAll.mjs');
  const cont = await lib('gpu/continuousScreen.mjs');
  const { PRWInstanceT } = await import(pathToFileURL(path.join(CA, 'node_modules/spacedatastandards.org/lib/js/CQR/main.js')).href);
  const norad = JSON.parse(fs.readFileSync(path.join(POP, 'current.norad.json'), 'utf8'));
  const frames = cs.splitCatalog(new Uint8Array(fs.readFileSync(path.join(POP, 'current.omm.bin'))));
  const pick = subsetOf(norad, t.fraction, t.seed ?? 0);
  const chosen = pick.map((i) => frames[i]);
  const windows = cs.screenWindows(START_JD, HORIZON_DAYS, WINDOW_HOURS);
  const controls = { ...CONTROLS, thresholdKm: t.thresholdKm };
  const harness = await createConjunctionCommandHarness({ runtimeKind: 'browser' });
  const invoke = (methodId, inputs) => harness.invoke({ methodId, inputs });
  const CATALOG = new PRWInstanceT('conjunction-assessment', 'scale-catalog', 1n);
  const REFINE = new PRWInstanceT('conjunction-assessment', 'scale-refine', 1n);
  const sources = cs.sgp4Sources(chosen);
  const identity = sources.map((s) => av.objectKey(s.OBJECT_ID, s.NORAD_CATALOG_ID));
  const light = (e) => {
    const a = e.PRIMARY_STATE.STATE, b = e.SECONDARY_STATE.STATE;
    return { PRIMARY_ID: e.PRIMARY_ID, PRIMARY_NORAD_ID: e.PRIMARY_NORAD_ID, SECONDARY_ID: e.SECONDARY_ID, SECONDARY_NORAD_ID: e.SECONDARY_NORAD_ID, TCA: { JULIAN_DATE: e.TCA.JULIAN_DATE }, MISS_DISTANCE_M: e.MISS_DISTANCE_M, RELATIVE_SPEED_M_S: e.RELATIVE_SPEED_M_S,
      s: Float64Array.of(a.POSITION.X, a.POSITION.Y, a.POSITION.Z, a.VELOCITY.X, a.VELOCITY.Y, a.VELOCITY.Z, b.POSITION.X, b.POSITION.Y, b.POSITION.Z, b.VELOCITY.X, b.VELOCITY.Y, b.VELOCITY.Z) };
  };
  const events = [], cutoffs = new Map();
  let candidates = 0;
  const handle = await cs.prepareIndex(invoke, sources, [], CATALOG);
  for (const w of windows) {
    const grid = await cont.sampleWindowGrid({ invoke, request: cs.windowRequest(handle, 'TEME', w, controls, CATALOG) });
    for (const [row, jd] of grid.excluded) av.refuseAt(cutoffs, identity[row], jd);
    const refineIndex = async (rows) => {
      const h = await cs.prepareIndex(invoke, rows.map((r) => sources[r]), [], REFINE);
      return { request: cs.windowRequest(h, 'TEME', w, controls, REFINE), release: () => cs.releaseIndex(invoke, h, REFINE) };
    };
    const run = await cont.screenStoredWindow({ invoke, decodeCatalogResult: cs.decodeCatalogResult, request: cs.windowRequest(0, 'TEME', w, controls, REFINE), grid, refineIndex });
    for (const e of run.events) events.push(light(e));
    candidates += run.candidates;
  }
  await cs.releaseIndex(invoke, handle, CATALOG);
  await harness.destroy?.();
  const merged = av.mergeWindowEvents(events, cutoffs);
  const canon = merged.map((e) => `${Math.min(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${Math.max(Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID))}|${e.TCA.JULIAN_DATE.toFixed(8)}|${e.MISS_DISTANCE_M.toFixed(3)}`).sort();
  const keep = merged.filter((e) => e.MISS_DISTANCE_M / 1000 > t.keepFromKm && e.MISS_DISTANCE_M / 1000 <= t.thresholdKm || (t.keepFromKm === 0 && e.MISS_DISTANCE_M / 1000 <= t.thresholdKm));
  const FIELDS = 17, out = new Float64Array(keep.length * FIELDS);
  keep.forEach((e, i) => { out.set([Number(e.PRIMARY_NORAD_ID), Number(e.SECONDARY_NORAD_ID), e.TCA.JULIAN_DATE, e.MISS_DISTANCE_M, e.RELATIVE_SPEED_M_S], i * FIELDS); out.set(e.s, i * FIELDS + 5); });
  fs.mkdirSync(path.join(SCRATCH, 'events'), { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'events', `${t.id}.f64`), Buffer.from(out.buffer, out.byteOffset, out.byteLength));
  const under5 = merged.filter((e) => e.MISS_DISTANCE_M <= 5000).length;
  const cpu = process.cpuUsage(cpu0);
  const row = { id: t.id, tier: t.tier, seed: t.seed, fraction: t.fraction, thresholdKm: t.thresholdKm, keepFromKm: t.keepFromKm, objects: chosen.length, catalog: norad.length, events: merged.length, kept: keep.length, under5km: under5, candidates, excluded: cutoffs.size, digest: digestOf(canon),
    cpuS: +((cpu.user + cpu.system) / 1e6).toFixed(1), wallS: +((performance.now() - wall0) / 1000).toFixed(1), startedUtc: started, endedUtc: nowUtc(), load1Start: +load0.toFixed(1), load1End: +os.loadavg()[0].toFixed(1) };
  fs.writeFileSync(path.join(SCRATCH, 'events', `${t.id}.json`), JSON.stringify(row) + '\n');
  console.log(`ROW ${JSON.stringify(row)}`);
}
async function screen() {
  registration();
  verifyPins();
  fs.mkdirSync(POP, { recursive: true });
  for (const f of ['current.omm.bin', 'current.norad.json']) if (!fs.existsSync(path.join(POP, f))) fs.copyFileSync(path.join(B2_POP, f), path.join(POP, f));
  if (sha256(fs.readFileSync(SNAPSHOT)) !== SNAPSHOT_SHA) throw new Error('the snapshot changed');
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
  const queue = TIERS.filter((t) => (!only || only.includes(t.id)) && !fs.existsSync(path.join(SCRATCH, 'events', `${t.id}.json`)));
  const running = new Set();
  while (queue.length || running.size) {
    while (queue.length && running.size < HEAVY && guards().ok) {
      const t = queue.shift();
      console.log(`${nowUtc()} start ${t.id}`);
      const c = spawn(process.execPath, ['--max-old-space-size=48000', SELF, '--child', t.id], { stdio: 'inherit' });
      running.add(c);
      c.on('exit', (code) => { running.delete(c); console.log(`${nowUtc()} end ${t.id} ${code}`); if (code) throw new Error(`${t.id} exited ${code}`); });
    }
    await sleep(2000);
  }
}

// ---------- geometry ----------
function regimeOf(g) {
  const n = Number(g.MEAN_MOTION), e = Number(g.ECCENTRICITY), inc = Number(g.INCLINATION);
  const mu = 398600.4418, a = Math.cbrt(mu / (n * 2 * Math.PI / 86400) ** 2), hp = a * (1 - e) - 6378.137;
  if (e >= 0.1) return 'HX';
  if (hp < 600) return 'SD';
  if (hp < 750) return 'S1';
  if (hp < 2000) return 'DO';
  if (hp < 15000) return 'GD';
  if (hp < 30000) return 'GN';
  return inc < 5 ? 'GE' : 'IG';
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const m = Math.hypot(...a); return m > 0 ? a.map((x) => x / m) : [0, 0, 0]; };
function geometry() {
  const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(SNAPSHOT)));
  const newest = new Map();
  for (const g of snap) { const id = Number(g.NORAD_CAT_ID), p = newest.get(id); if (!p || g.EPOCH >= p.EPOCH) newest.set(id, g); }
  const regime = new Map([...newest].map(([id, g]) => [id, REGIMES.indexOf(regimeOf(g))]));
  const geo = path.join(SCRATCH, 'geom');
  fs.mkdirSync(geo, { recursive: true });
  const stats = {};
  for (const t of TIERS) {
    const f = fs.readFileSync(path.join(SCRATCH, 'events', `${t.id}.f64`));
    const d = new Float64Array(f.buffer, f.byteOffset, f.byteLength / 8), n = d.length / 17;
    const g = new Float32Array(n * RECORD), reg = new Uint8Array(n * 2);
    let offMiss = 0, offPlane = 0, zeroSpeed = 0, noRegime = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 17, s = (k) => d[o + k];
      const rA = [s(5), s(6), s(7)], vA = [s(8), s(9), s(10)], rB = [s(11), s(12), s(13)], vB = [s(14), s(15), s(16)];
      const dr = [rA[0] - rB[0], rA[1] - rB[1], rA[2] - rB[2]], dv = [vA[0] - vB[0], vA[1] - vB[1], vA[2] - vB[2]];
      const speed = Math.hypot(...dv);
      if (speed < 1e-3) zeroSpeed++;
      const w = speed < 1e-3 ? unit(rA) : dv.map((x) => x / speed);
      const along = dot(dr, w), p = [dr[0] - along * w[0], dr[1] - along * w[1], dr[2] - along * w[2]];
      const miss = Math.hypot(...dr);
      if (Math.abs(miss - s(3)) > 1) offMiss++;
      if (miss > 1 && Math.abs(along) / miss > 0.01) offPlane++;
      const u1 = Math.hypot(...p) > 1e-6 ? unit(p) : unit(cross(w, Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
      const u2 = cross(w, u1);
      const axes = (r, v) => { const R = unit(r), C = unit(cross(r, v)), I = cross(C, R); return [dot(u1, R), dot(u1, I), dot(u1, C), dot(u2, R), dot(u2, I), dot(u2, C)]; };
      g.set([s(3) / 1000, speed / 1000, ...axes(rA, vA), ...axes(rB, vB)], i * RECORD);
      const a = regime.get(s(0)), b = regime.get(s(1));
      if (a === undefined || b === undefined) { noRegime++; reg[i * 2] = 255; reg[i * 2 + 1] = 255; } else { reg[i * 2] = a; reg[i * 2 + 1] = b; }
    }
    fs.writeFileSync(path.join(geo, `${t.id}.f32`), Buffer.from(g.buffer));
    fs.writeFileSync(path.join(geo, `${t.id}.reg`), Buffer.from(reg.buffer));
    stats[t.id] = { n, offMissOver1m: offMiss, offPlaneOver1pct: offPlane, zeroSpeed, noRegime };
    console.log(t.id, JSON.stringify(stats[t.id]));
  }
  fs.writeFileSync(path.join(SCRATCH, 'geometry.json'), JSON.stringify(stats, null, 1) + '\n');
}
function loadGeometry() {
  const geo = path.join(SCRATCH, 'geom');
  const read = (t) => {
    const f = fs.readFileSync(path.join(geo, `${t.id}.f32`)), r = fs.readFileSync(path.join(geo, `${t.id}.reg`));
    const row = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'events', `${t.id}.json`), 'utf8'));
    const k = row.objects, N = row.catalog;
    return { ...t, g: new Float32Array(f.buffer, f.byteOffset, f.byteLength / 4), reg: new Uint8Array(r.buffer, r.byteOffset, r.byteLength), n: f.byteLength / 4 / RECORD, weight: t.fraction === 1 ? 1 : (N * (N - 1)) / (k * (k - 1)) };
  };
  const tiers = Object.fromEntries(TIERS.map((t) => [t.id, read(t)]));
  // The classes: a regime pair with 100 or more true events, the rest "sparse".
  const t0 = tiers.t0, pairCount = new Map();
  const pairOf = (a, b) => (a <= b ? a * 16 + b : b * 16 + a);
  for (let i = 0; i < t0.n; i++) if (t0.g[i * RECORD] < 1 && t0.reg[i * 2] !== 255) { const p = pairOf(t0.reg[i * 2], t0.reg[i * 2 + 1]); pairCount.set(p, (pairCount.get(p) ?? 0) + 1); }
  const own = [...pairCount].filter(([, c]) => c >= 100).sort((a, b) => b[1] - a[1]);
  const classOf = new Map(own.map(([p], i) => [p, i]));
  const SPARSE = own.length;
  const names = [...own.map(([p]) => `${REGIMES[p >> 4]}-${REGIMES[p & 15]}`), 'sparse'];
  for (const t of Object.values(tiers)) {
    const cls = new Uint8Array(t.n);
    for (let i = 0; i < t.n; i++) {
      const a = t.reg[i * 2], b = t.reg[i * 2 + 1];
      cls[i] = a === 255 ? 255 : classOf.get(pairOf(a, b)) ?? SPARSE;
    }
    t.cls = cls;
  }
  // The true events, as their own tier.
  let m = 0;
  for (let i = 0; i < t0.n; i++) if (t0.g[i * RECORD] < 1 && t0.reg[i * 2] !== 255) m++;
  const g = new Float32Array(m * RECORD), reg = new Uint8Array(m * 2), cls = new Uint8Array(m);
  for (let i = 0, j = 0; i < t0.n; i++) if (t0.g[i * RECORD] < 1 && t0.reg[i * 2] !== 255) {
    g.set(t0.g.subarray(i * RECORD, (i + 1) * RECORD), j * RECORD); reg[j * 2] = t0.reg[i * 2]; reg[j * 2 + 1] = t0.reg[i * 2 + 1]; cls[j] = t0.cls[i]; j++;
  }
  return { tiers, truth: { g, reg, cls, n: m, weight: 1 }, classNames: names };
}

// ---------- the error rows ----------
const jsonlIn = (dir, re = /^rows-\d+\.jsonl$/) => fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l && !/"source":"starlink"/.test(l)).map((l) => JSON.parse(l)));
const windowsIn = (...dirs) => new Map(dirs.flatMap((d) => jsonlIn(d)).map((r) => [r.key, r]));
function refuseHeld(r) {
  if (HELD_GALILEO.includes(r.norad)) throw new Error(`held Galileo satellite ${r.norad}`);
  if (/^(Swarm|GRACE)/.test(r.name ?? '') && Date.parse(`${r.cutoff}T00:00:00Z`) + 7 * 86400000 > Date.parse('2026-10-31T00:00:00Z')) throw new Error(`Swarm or GRACE-FO past the hold: ${r.key}`);
  if (/starlink/i.test(`${r.group ?? ''}${r.name ?? ''}`)) throw new Error(`Starlink row ${r.key}`);
}
function loadErrors() {
  const P = (...a) => path.join(OT, ...a);
  const b0411 = 'ap/b0411', b051 = 'ap/b051', b063 = 'ap/b063', ffm = 'ap/ffm220', dl = 'day-leads';
  const list = (d, keep) => jsonlIn(P(d)).filter(keep);
  const noErr = (r) => !r.error;
  const group = (g) => (r) => !r.error && r.group === g;
  const cmp2 = windowsIn(P(b0411, 'compare-truth2')), u2 = windowsIn(P(b051, 'ussf-truth2')), a2 = windowsIn(P(b051, 'truth2')), f2 = windowsIn(P(ffm, 'compare-truth2'));
  const cmp1 = windowsIn(P(b0411, 'compare-truth')), u1 = windowsIn(P(b051, 'ussf-truth')), a1 = windowsIn(P(b051, 'truth')), f1 = windowsIn(P(ffm, 'compare-truth'));
  const regimes = jsonlIn(P(b0411, 'regimes')).filter(noErr), regimesMap = new Map(regimes.map((r) => [r.key, r]));
  const uSix = windowsIn(P(b051, 'ussf-regimes'), P(b051, 'ussf-regimes-hx')), aSix = windowsIn(P(b051, 'regimes'), P(b063, 'regimes-hx')), fSix = windowsIn(P(ffm, 'regimes'));
  const d1 = { ap: windowsIn(P(dl, 'truth')), xp: windowsIn(P(dl, 'compare-truth')) }, d2 = { ap: windowsIn(P(dl, 'truth2')), xp: windowsIn(P(dl, 'compare-truth2')) }, d6 = windowsIn(P(dl, 'regimes'));
  const CUTS = [
    { cut: 'T', regime: 'SD', cell: 'Strong drag, 2025', fit: 24, ffm: 'FFM40', list: list(`${b0411}/truth`, noErr), s: cmp1, u: u1, a: a1, f: f1, dlA: d1.ap, dlX: d1.xp },
    { cut: 'P', regime: 'SD', cell: 'Strong drag, 2026', fit: 24, ffm: 'FFM40', list: list(`${b0411}/truth2`, group('P')), s: cmp2, u: u2, a: a2, f: f2, dlA: d2.ap, dlX: d2.xp },
    { cut: 'S1', regime: 'S1', cell: 'Near 700 km', fit: 72, ffm: 'FFM40', list: list(`${b0411}/truth2`, group('S1')), s: cmp2, u: u2, a: a2, f: f2, dlA: d2.ap, dlX: d2.xp },
    { cut: 'GN', regime: 'GN', cell: 'Medium Earth orbit', fit: 72, ffm: 'FFM20', list: list(`${b0411}/truth2`, group('GN')), s: cmp2, u: u2, a: a2, f: f2, dlA: d2.ap, dlX: d2.xp },
    ...[['DO', 'Low orbit, altimetry', 'FFM40'], ['LS', 'Low orbit, laser spheres', 'FFM40'], ['GD', 'Laser geodetic', 'FFM20'], ['IG', 'Inclined geosynchronous', 'FFM20'], ['GE', 'Geostationary', 'FFM20'], ['HX', 'Highly elliptical, THEMIS and Chandra', 'FFM20']]
      .map(([g, cell, f]) => ({ cut: g, regime: g, cell, fit: 72, ffm: f, list: regimes.filter((r) => r.group === g), s: regimesMap, u: uSix, a: aSix, f: fSix, dlA: d6, dlX: d6 })),
  ];
  const flags = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'results/operator-theory/maneuver-flags/flags.json'), 'utf8')).windows.map((w) => [w.key, w]));
  const out = { keys: {}, a1: {}, cuts: CUTS.map((c) => ({ cut: c.cut, regime: c.regime, cell: c.cell, fit: c.fit, ffm: c.ffm })), flags: {} };
  const cellOf = (row, arm, day) => { const d = row?.arms?.[arm]?.days?.[day]; return d && Number.isFinite(d.r) && Number.isFinite(d.t) && Number.isFinite(d.n) && Number.isFinite(d.e) ? [d.r, d.t, d.n, d.e] : null; };
  for (const c of CUTS) {
    const keys = (out.keys[c.regime] ??= []);
    const lead = (out.a1[c.regime] ??= { 1: {}, 3: {}, 5: {} });
    for (const r of c.list) {
      refuseHeld(r);
      const idx = keys.length;
      keys.push({ key: r.key, sat: r.name ?? String(r.norad), cut: c.cut });
      const f = flags.get(r.key);
      if (f && (c.regime === 'S1' || c.regime === 'DO')) out.flags[r.key] = { 1: burn(f, c.fit, 24), 3: burn(f, c.fit, 72) };
      const put = (theory, day, cell) => { if (cell) ((lead[day][theory] ??= [])).push([idx, ...cell]); };
      for (const day of [1, 3]) {
        put('SGP4', day, cellOf(c.s.get(r.key), `S${c.fit}`, day));
        put('XP', day, cellOf(c.s.get(r.key), `XP${c.fit}`, day));
        put('XPU', day, cellOf(c.u.get(r.key), `U${c.fit}`, day));
        put('AP', day, cellOf(c.a.get(r.key), `AP${c.fit}`, day));
        put('FFM', day, cellOf(c.f.get(r.key), `F${c.fit}`, day));
      }
      put('AP', 5, cellOf(c.dlA.get(r.key), `AP${c.fit}`, 5));
      put('XP', 5, cellOf(c.dlX.get(r.key), `XP${c.fit}`, 5));
    }
  }
  // Arm 2: SGP4 on the latest public set. Starlink and held Galileo lines are dropped as text, before any parse.
  const OD = `${ARCHIVE}/sdn-ap-gp-history-od/rows`;
  const heldLine = new RegExp(`"regime":"leo-starlink"|"norad":(${HELD_GALILEO.join('|')})\\b`);
  const od = fs.readdirSync(OD).filter((f) => /^all\.s\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(OD, f), 'utf8').split('\n').filter((l) => l && !heldLine.test(l)).map((l) => JSON.parse(l)));
  const seen = new Set();
  out.pub = {};
  for (const r of od) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    const arm = r.arms?.['sgp4-latest'];
    if (!arm?.ok) continue;
    const by = (out.pub[r.regime] ??= { keys: [], 1: [], 3: [] });
    const idx = by.keys.length;
    by.keys.push({ key: r.key, sat: String(r.norad) });
    for (const day of [1, 3]) { const v = arm.days?.[day]?.rmsKm; if (Number.isFinite(v)) by[day].push([idx, v]); }
  }
  return out;
}
function burn(w, fit, lead) {
  const inFit = w.steps.some((s) => s.hours >= -fit && s.hours <= 0), inForecast = w.steps.some((s) => s.hours > 0 && s.hours <= lead);
  return inFit || inForecast ? 1 : 0;
}
function errorSummary(errs) {
  const cells = JSON.parse(fs.readFileSync(path.join(ROOT, 'results/ap-truth/compare/cells.json'), 'utf8')).rows;
  const round = (x) => (x === null || x === undefined ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));
  const rows = [], mismatches = [];
  for (const c of errs.cuts) {
    const keys = errs.keys[c.regime];
    for (const day of [1, 3, 5]) {
      const leadRows = errs.a1[c.regime][day];
      const landed = day === 5 ? null : cells.find((r) => r.reference === 'truth' && r.level === 'regime' && r.regime === c.cell && r.fit === c.fit && r.lead === day * 24);
      if (day !== 5 && !landed) { mismatches.push(`no cell ${c.cell} ${day}`); continue; }
      for (const theory of THEORIES) {
        const list = (leadRows[theory] ?? []).filter(([i]) => keys[i].cut === c.cut);
        if (!list.length) continue;
        const v = list.map((x) => x[4]).sort(asc);
        const row = { cut: c.cut, cell: c.cell, fit: c.fit, lead: day, theory, n: v.length, median: round(pct(v, 0.5)), p95: round(pct(v, 0.95)) };
        if (landed) {
          const col = theory === 'FFM' ? c.ffm : theory;
          const a = landed.arms[col];
          row.column = col;
          row.landed = a ?? null;
          if (!a || a[0] !== row.median || a[1] !== row.p95 || a[2] !== row.n) mismatches.push(`${c.cell} day ${day} ${theory}: ${row.median}/${row.p95}/${row.n} vs ${a}`);
        }
        rows.push(row);
      }
    }
    const inCut = keys.map((k, i) => [k, i]).filter(([k]) => k.cut === c.cut).map(([, i]) => i);
    for (const day of [1, 3]) {
      const sets = THEORIES.map((t) => new Set((errs.a1[c.regime][day][t] ?? []).map((x) => x[0])));
      const union = inCut.filter((i) => sets.some((s) => s.has(i))), common = inCut.filter((i) => sets.every((s) => s.has(i)));
      rows.push({ cut: c.cut, cell: c.cell, lead: day, windowsAny: union.length, windowsAllFive: common.length });
    }
  }
  const pub = Object.fromEntries(Object.entries(errs.pub).map(([k, v]) => [k, Object.fromEntries([1, 3].map((d) => { const x = v[d].map((a) => a[1]).sort(asc); return [d, { n: x.length, objects: new Set(v[d].map((a) => v.keys[a[0]].sat)).size, median: round(pct(x, 0.5)), p95: round(pct(x, 0.95)) }]; }))]));
  return { rows, pub, mismatches };
}
function errorsMode() {
  const errs = loadErrors();
  fs.writeFileSync(path.join(SCRATCH, 'errors-full.json'), JSON.stringify(errs));
  const s = errorSummary(errs);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(s, null, 1) + '\n');
  console.log('error cells', s.rows.length, 'mismatches', s.mismatches.length);
  for (const m of s.mismatches.slice(0, 30)) console.log(m);
}

// ---------- the kernel ----------
function rngOf(seedText) {
  const h = createHash('sha256').update(seedText).digest();
  let a = h.readUInt32LE(0), b = h.readUInt32LE(4), c = h.readUInt32LE(8), d = h.readUInt32LE(12) | 1;
  const next = () => { const t = (((a + b) | 0) + d) | 0; d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0; return t >>> 0; };
  for (let i = 0; i < 16; i++) next();
  return next;
}
// One forecast miss per event: out[i] km, NaN where a regime has no error rows.
function fly(t, E, next, out) {
  const { g, reg, n } = t, K = 2.3283064365386963e-10;
  for (let i = 0; i < n; i++) {
    const ra = reg[i * 2];
    if (ra === 255) { out[i] = NaN; continue; }
    const Ea = E[ra], Eb = E[reg[i * 2 + 1]];
    if (!Ea || !Eb) { out[i] = NaN; continue; }
    const o = i * RECORD, ja = Math.floor(next() * K * Ea.len), jb = Math.floor(next() * K * Eb.len), s = next();
    const r1 = s & 1 ? Ea.r[ja] : -Ea.r[ja], t1 = s & 2 ? Ea.t[ja] : -Ea.t[ja], n1 = s & 4 ? Ea.n[ja] : -Ea.n[ja];
    const r2 = s & 8 ? Eb.r[jb] : -Eb.r[jb], t2 = s & 16 ? Eb.t[jb] : -Eb.t[jb], n2 = s & 32 ? Eb.n[jb] : -Eb.n[jb];
    const x = g[o] + g[o + 2] * r1 + g[o + 3] * t1 + g[o + 4] * n1 - g[o + 8] * r2 - g[o + 9] * t2 - g[o + 10] * n2;
    const y = g[o + 5] * r1 + g[o + 6] * t1 + g[o + 7] * n1 - g[o + 11] * r2 - g[o + 12] * t2 - g[o + 13] * n2;
    out[i] = Math.sqrt(x * x + y * y);
  }
}
const quantileAt = (sorted, q) => (sorted.length ? sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] : NaN);
// The whole reading of one error law: the radii from the true events, then the alerts from every tier in use.
function readCell(geo, use, E, next, buf) {
  const { truth, classNames } = geo, C = classNames.length, P = PCTS.length;
  const forecast = buf.subarray(0, truth.n);
  fly(truth, E, next, forecast);
  const perClass = Array.from({ length: C }, () => []), all = [], fast = Array.from({ length: C }, () => []);
  for (let i = 0; i < truth.n; i++) {
    const f = forecast[i];
    if (f !== f) continue;
    perClass[truth.cls[i]].push(f); all.push(f);
    if (truth.g[i * RECORD + 1] >= 0.1) fast[truth.cls[i]].push(f);
  }
  for (const a of [...perClass, ...fast, all]) a.sort(asc);
  const R = perClass.map((a) => PCTS.map((q) => quantileAt(a, q))), Rfast = fast.map((a) => PCTS.map((q) => quantileAt(a, q))), Rall = PCTS.map((q) => quantileAt(all, q));
  const alerts = Array.from({ length: C }, () => new Float64Array(P)), allAlerts = new Float64Array(P), fastAlerts = new Float64Array(P);
  for (const { tier: t, weight } of use) {
    const out = buf.subarray(0, t.n);
    fly(t, E, next, out);
    const { cls, g, n } = t;
    for (let i = 0; i < n; i++) {
      const f = out[i];
      if (f !== f) continue;
      const k = cls[i], Rk = R[k], Rf = Rfast[k], isFast = g[i * RECORD + 1] >= 0.1;
      for (let p = 0; p < P; p++) {
        if (f <= Rk[p]) alerts[k][p] += weight;
        if (f <= Rall[p]) allAlerts[p] += weight;
        if (isFast && f <= Rf[p]) fastAlerts[p] += weight;
      }
    }
  }
  // The realized catch share, with a fresh draw.
  fly(truth, E, next, forecast);
  const caught = new Float64Array(P);
  for (let i = 0; i < truth.n; i++) { const f = forecast[i]; if (f !== f) continue; for (let p = 0; p < P; p++) if (f <= R[truth.cls[i]][p]) caught[p]++; }
  const nTrue = all.length, nFast = fast.reduce((s, a) => s + a.length, 0);
  const sum = (p) => alerts.reduce((s, a) => s + a[p], 0);
  return {
    nTrue, nFast, dropped: 1 - nTrue / truth.n,
    ae: PCTS.map((_, p) => sum(p) / nTrue),
    single: PCTS.map((_, p) => allAlerts[p] / nTrue),
    fast: PCTS.map((_, p) => fastAlerts[p] / nFast),
    caught: PCTS.map((_, p) => caught[p] / nTrue),
    Rsingle: Rall,
    cap: R.some((x) => x[1] > 1000) || Rall[1] > 1000,
    perClass: { R: R.map((x) => x[1]), ae: alerts.map((a, k) => (perClass[k].length ? a[1] / perClass[k].length : NaN)), n: perClass.map((a) => a.length) },
  };
}
function arrays(list, unitOf) {
  const m = list.length;
  const r = new Float32Array(m), t = new Float32Array(m), n = new Float32Array(m);
  list.forEach((x, i) => { const u = unitOf ? unitOf(x, i) : x; r[i] = u[0]; t[i] = u[1]; n[i] = u[2]; });
  return { r, t, n, len: m };
}

// ---------- window picks ----------
function pickWindows(keys, eligible, rep, label) {
  if (rep === 0) return eligible;
  const next = rngOf(`alerts:${label}:${rep}`), K = 2.3283064365386963e-10;
  const bySat = new Map();
  for (const i of eligible) { const s = keys[i].sat; (bySat.get(s) ?? bySat.set(s, []).get(s)).push(i); }
  const sats = [...bySat.keys()];
  const out = [];
  if (sats.length >= 5) {
    for (let s = 0; s < sats.length; s++) { const list = bySat.get(sats[Math.floor(next() * K * sats.length)]); for (let w = 0; w < list.length; w++) out.push(list[Math.floor(next() * K * list.length)]); }
  } else for (let w = 0; w < eligible.length; w++) out.push(eligible[Math.floor(next() * K * eligible.length)]);
  return out;
}
// The error law of one cell at one replicate: regime index to arrays. spec: { theory, lead, scope, map }.
function lawOf(errs, spec, rep) {
  const E = new Array(REGIMES.length).fill(null);
  if (spec.theory === 'ZERO') { const zero = { r: new Float32Array(1), t: new Float32Array(1), n: new Float32Array(1), len: 1 }; return E.map(() => zero); }
  if (spec.arm === 2) return publicLaw(errs, spec, rep);
  REGIMES.forEach((g, gi) => {
    const src = g === 'DO' && spec.map === 'ls' ? 'LS' : g;
    const keys = errs.keys[src], cells = errs.a1[src]?.[spec.lead];
    if (!cells || !cells[spec.theory]?.length) return;
    const present = (t) => new Set((cells[t] ?? []).map((x) => x[0]));
    let eligible = [...new Set(THEORIES.flatMap((t) => (cells[t] ?? []).map((x) => x[0])))].sort(asc);
    if (spec.scope === 'common') { const sets = THEORIES.map(present); eligible = eligible.filter((i) => sets.every((s) => s.has(i))); }
    if (spec.scope === 'burnfree' && (src === 'S1' || src === 'DO')) eligible = eligible.filter((i) => !errs.flags[keys[i].key]?.[spec.lead]);
    const picks = pickWindows(keys, eligible, rep, `${src}:${spec.lead}:${spec.scope ?? 'all'}`);
    const row = new Map(cells[spec.theory].map((x) => [x[0], x]));
    const list = picks.map((i) => row.get(i)).filter(Boolean).map((x) => [x[1], x[2], x[3]]);
    if (list.length) E[gi] = arrays(list);
  });
  return E;
}
function publicLaw(errs, spec, rep) {
  const E = new Array(REGIMES.length).fill(null);
  const MAP = { SD: spec.map === 'slr' ? 'leo-slr' : 'leo-iss', S1: 'leo-slr', DO: 'leo-slr', GD: 'meo-slr', GN: 'meo-gnss', GE: 'geo-gnss', IG: 'igso-gnss' };
  const K = 2.3283064365386963e-10;
  REGIMES.forEach((g, gi) => {
    const od = errs.pub[MAP[g]];
    if (!od) return;
    const row = new Map(od[spec.lead].map((x) => [x[0], x[1]]));
    const picks = pickWindows(od.keys, od[spec.lead].map((x) => x[0]), rep, `pub:${MAP[g]}:${spec.lead}`);
    const next = rngOf(`alerts:dir:${g}:${spec.lead}:${rep}:${spec.scope ?? 'all'}`);
    const dirs = (errs.a1[g]?.[spec.lead]?.SGP4 ?? []).map((x) => [x[1] / x[4], x[2] / x[4], x[3] / x[4]]);
    const unitOf = (i) => {
      const e = row.get(i);
      if (spec.scope === 'isotropic') {
        const v = [0, 0, 0].map(() => Math.sqrt(-2 * Math.log(1 - next() * K)) * Math.cos(2 * Math.PI * next() * K));
        const m = Math.hypot(...v);
        return v.map((x) => (Math.abs(x) * e) / m);
      }
      const d = dirs[Math.floor(next() * K * dirs.length)];
      return [d[0] * e, d[1] * e, d[2] * e];
    };
    E[gi] = arrays(picks, unitOf);
  });
  return E;
}

// ---------- the cells of the run ----------
const key3 = (s) => [`a${s.arm}`, s.theory, s.lead, s.scope ?? 'all', s.map ?? 'base'].join('|');
function cellsOfRun() {
  const out = [{ arm: 1, theory: 'ZERO', lead: 0 }];
  for (const lead of [3, 1]) for (const theory of THEORIES) out.push({ arm: 1, theory, lead });
  for (const theory of ['AP', 'XP']) out.push({ arm: 1, theory, lead: 5 });
  for (const theory of THEORIES) {
    out.push({ arm: 1, theory, lead: 3, scope: 'common' });
    out.push({ arm: 1, theory, lead: 3, map: 'ls' });
    out.push({ arm: 1, theory, lead: 3, scope: 'burnfree' });
  }
  out.push({ arm: 2, theory: 'PUB', lead: 3 }, { arm: 2, theory: 'PUB', lead: 1 }, { arm: 2, theory: 'PUB', lead: 3, map: 'slr' }, { arm: 2, theory: 'PUB', lead: 3, scope: 'isotropic' });
  return out;
}
const DETAILED = (s) => !s.scope && !s.map && s.lead === 3;
function useOf(geo, rep) {
  const use = [{ tier: geo.tiers.t0, weight: 1 }];
  const next = rngOf(`alerts:tiers:${rep}`);
  for (const tier of [1, 2, 3]) {
    if (rep === 0) for (const seed of [1, 2, 3]) { const t = geo.tiers[`t${tier}-s${seed}`]; use.push({ tier: t, weight: t.weight / 3 }); }
    else { const t = geo.tiers[`t${tier}-s${1 + (next() % 3)}`]; use.push({ tier: t, weight: t.weight }); }
  }
  return use;
}
function shard(i, of) {
  const geo = loadGeometry(), errs = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'errors-full.json'), 'utf8'));
  const max = Math.max(geo.truth.n, ...Object.values(geo.tiers).map((t) => t.n));
  const buf = new Float32Array(max);
  const dir = path.join(SCRATCH, 'sim');
  fs.mkdirSync(dir, { recursive: true });
  for (let rep = 0; rep <= REPLICATES; rep++) {
    if (rep % of !== i) continue;
    const file = path.join(dir, `rep-${rep}.jsonl`);
    if (fs.existsSync(file)) continue;
    const use = useOf(geo, rep), lines = [];
    for (const spec of cellsOfRun()) {
      if (spec.theory === 'ZERO' && rep !== 0) continue;
      const next = rngOf(`alerts:draw:${key3(spec)}:${rep}`);
      const r = readCell(geo, use, lawOf(errs, spec, rep), next, buf);
      const row = { rep, cell: key3(spec), ae: r.ae.map((x) => sig(x)), single: r.single.map((x) => sig(x)), fast: r.fast.map((x) => sig(x)), caught: r.caught.map((x) => sig(x, 4)), dropped: sig(r.dropped, 4), cap: r.cap, Rsingle: sig(r.Rsingle[1]) };
      if (rep === 0 || DETAILED(spec)) { row.R = r.perClass.R.map((x) => sig(x)); row.aeClass = r.perClass.ae.map((x) => sig(x)); }
      if (rep === 0) row.nClass = r.perClass.n;
      lines.push(JSON.stringify(row));
    }
    fs.writeFileSync(`${file}.tmp`, lines.join('\n') + '\n');
    fs.renameSync(`${file}.tmp`, file);
    console.log(`${nowUtc()} rep ${rep} shard ${i}`);
  }
}
async function fanOut(flag, of = HEAVY) {
  await Promise.all(Array.from({ length: of }, (_, i) => new Promise((res, rej) => {
    const c = spawn(process.execPath, ['--max-old-space-size=20000', SELF, flag, String(i)], { stdio: 'inherit' });
    c.on('exit', (code) => (code ? rej(new Error(`${flag} ${i} exited ${code}`)) : res()));
  })));
}
async function sim() {
  const reg = registration();
  if (!git(['log', '--format=%H', '--', `${OUT_REL}/sizing.json`])) throw new Error('sizing.json is not committed: the pass chances come before any alert');
  if (!guards().ok) throw new Error(`guards: ${JSON.stringify(guards())}`);
  await fanOut('--shard');
  const dir = path.join(SCRATCH, 'sim');
  const lines = [];
  for (let rep = 0; rep <= REPLICATES; rep++) lines.push(fs.readFileSync(path.join(dir, `rep-${rep}.jsonl`), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'rows.jsonl'), lines.join(''));
  writeMeta(reg);
}
function writeMeta(reg) {
  const rows = TIERS.map((t) => JSON.parse(fs.readFileSync(path.join(SCRATCH, 'events', `${t.id}.json`), 'utf8')));
  const geo = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'geometry.json'), 'utf8'));
  const sizingCommit = git(['log', '--diff-filter=A', '--format=%H', '--', `${OUT_REL}/sizing.json`]).split('\n').filter(Boolean).at(-1);
  const meta = { registration_commit: reg.commit, registration_blob: reg.blob, registration_time: reg.time, amendments: reg.amendments, sizing_commit: sizingCommit, sizing_time: git(['log', '-1', '--format=%cI', sizingCommit]), node: NODE, runner_sha256: sha256(fs.readFileSync(SELF)),
    screen: { plugin: 'analysis/conjunction-assessment', version: '0.18.4', wasm_sha256: WASM_SHA, root: 'space-data-network-modules-ca', snapshot_sha256: SNAPSHOT_SHA, coarseStepSec: 60, horizonDays: 7 },
    b2: { digest: B2_DIGEST, events: B2_EVENTS, ladder_1_8_s1: B2_LADDER }, t0_digest: rows[0].digest, geometry: geo };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'counts.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

// ---------- sizing: the rule's pass chances on synthetic errors ----------
const TRIALS = 200, SIZE_B = 100, SUBSAMPLE = 16;
function subsampleTier(t, stride) {
  const n = Math.floor(t.n / stride), g = new Float32Array(n * RECORD), reg = new Uint8Array(n * 2), cls = new Uint8Array(n);
  for (let j = 0; j < n; j++) { const i = j * stride; g.set(t.g.subarray(i * RECORD, (i + 1) * RECORD), j * RECORD); reg[j * 2] = t.reg[i * 2]; reg[j * 2 + 1] = t.reg[i * 2 + 1]; cls[j] = t.cls[i]; }
  return { g, reg, cls, n, weight: t.weight };
}
function lawParents() {
  const landed = JSON.parse(fs.readFileSync(path.join(ROOT, 'results/ap-truth/compare/cells.json'), 'utf8')).rows;
  const CELL = { SD: ['Strong drag, 2026', 24], S1: ['Near 700 km', 72], DO: ['Low orbit, altimetry', 72], GD: ['Laser geodetic', 72], GN: ['Medium Earth orbit', 72], GE: ['Geostationary', 72], IG: ['Inclined geosynchronous', 72], HX: ['Highly elliptical, THEMIS and Chandra', 72] };
  return REGIMES.map((g) => {
    const [cell, fit] = CELL[g];
    const row = landed.find((r) => r.reference === 'truth' && r.level === 'regime' && r.regime === cell && r.fit === fit && r.lead === 72);
    const [median, p95, n] = row.arms.AP;
    return { median, sigma: Math.log(p95 / median) / 1.6449, n: g === 'SD' ? 1694 : n };
  });
}
function synthWindows(parents, next, scale) {
  const K = 2.3283064365386963e-10, axis = Math.hypot(0.1, 1, 0.1);
  return parents.map((p) => {
    const r = new Float32Array(p.n), t = new Float32Array(p.n), n = new Float32Array(p.n);
    for (let i = 0; i < p.n; i++) {
      const z = Math.sqrt(-2 * Math.log(1 - next() * K)) * Math.cos(2 * Math.PI * next() * K);
      const e = scale * p.median * Math.exp(p.sigma * z);
      r[i] = (0.1 * e) / axis; t[i] = e / axis; n[i] = (0.1 * e) / axis;
    }
    return { r, t, n, len: p.n };
  });
}
function resample(E, next) {
  const K = 2.3283064365386963e-10;
  return E.map((x) => {
    const r = new Float32Array(x.len), t = new Float32Array(x.len), n = new Float32Array(x.len);
    for (let i = 0; i < x.len; i++) { const j = Math.floor(next() * K * x.len); r[i] = x.r[j]; t[i] = x.t[j]; n[i] = x.n[j]; }
    return { r, t, n, len: x.len };
  });
}
function sizingGeo() {
  const geo = loadGeometry();
  const small = { classNames: geo.classNames, truth: subsampleTier(geo.truth, SUBSAMPLE) };
  const use = [{ tier: subsampleTier(geo.tiers.t0, SUBSAMPLE), weight: 1 }];
  for (const tier of [1, 2, 3]) { const t = geo.tiers[`t${tier}-s1`]; const s = subsampleTier(t, SUBSAMPLE); use.push({ tier: s, weight: s.weight }); }
  const max = Math.max(small.truth.n, ...use.map((u) => u.tier.n));
  return { small, use, buf: new Float32Array(max) };
}
const callOf = (lo, hi) => (hi < 0.9 ? 'fewer' : lo >= 0.9 ? 'notFewer' : 'undecided');
function sizeShard(i, of = HEAVY) {
  const { small, use, buf } = sizingGeo(), parents = lawParents();
  const { k } = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'sizing-k.json'), 'utf8'));
  const dir = path.join(SCRATCH, 'sizing');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, scale] of [['ratio1', 1], ['ratio05', k]]) {
    for (let trial = 0; trial < TRIALS; trial++) {
      if (trial % of !== i) continue;
      const file = path.join(dir, `${name}-${trial}.json`);
      if (fs.existsSync(file)) continue;
      const next = rngOf(`alerts:size:${name}:${trial}`);
      const A = synthWindows(parents, next, 1), B = synthWindows(parents, next, scale);
      const ratios = [];
      for (let b = 0; b < SIZE_B; b++) {
        const ra = readCell(small, use, resample(A, next), next, buf).ae[1], rb = readCell(small, use, resample(B, next), next, buf).ae[1];
        ratios.push(ra / rb);
      }
      ratios.sort(asc);
      fs.writeFileSync(file, JSON.stringify({ name, trial, lo: pct(ratios, 0.025), hi: pct(ratios, 0.975), call: callOf(pct(ratios, 0.025), pct(ratios, 0.975)) }) + '\n');
    }
  }
}
async function sizing() {
  const reg = registration();
  if (git(['log', '--format=%H', '--', `${OUT_REL}/rows.jsonl`])) throw new Error('rows are already committed');
  const { small, use, buf } = sizingGeo(), parents = lawParents();
  const big = parents.map((p) => ({ ...p, n: 4000 }));
  const next = rngOf('alerts:size:bisect');
  const base = synthWindows(big, next, 1);
  const scaled = (k) => base.map((x) => ({ r: x.r.map((v) => v * k), t: x.t.map((v) => v * k), n: x.n.map((v) => v * k), len: x.len }));
  const refAe = readCell(small, use, base, next, buf).ae[1];
  let lo = 1, hi = 4;
  for (let i = 0; i < 14; i++) { const k = Math.sqrt(lo * hi); const ae = readCell(small, use, scaled(k), next, buf).ae[1]; if (refAe / ae > 0.5) lo = k; else hi = k; }
  const k = Math.sqrt(lo * hi);
  fs.writeFileSync(path.join(SCRATCH, 'sizing-k.json'), JSON.stringify({ k }) + '\n');
  console.log('k for a true ratio of 0.5:', k);
  await fanOut('--size-shard');
  const dir = path.join(SCRATCH, 'sizing');
  const read = (name) => Array.from({ length: TRIALS }, (_, t) => JSON.parse(fs.readFileSync(path.join(dir, `${name}-${t}.json`), 'utf8')));
  const shareOf = (rows, call) => sig(rows.filter((r) => r.call === call).length / rows.length, 3);
  const one = read('ratio1'), half = read('ratio05');
  const doc = { registration_commit: reg.commit, trials: TRIALS, bootstrapReplicates: SIZE_B, subsample: SUBSAMPLE, kForRatio05: sig(k, 4), law: 'lognormal 3D error per regime through AP median and p95 at day 3 of cells.json; axes 0.1 : 1 : 0.1; windows per regime as landed; synthetic, no real error row',
    'P(fewer|1)': shareOf(one, 'fewer'), 'P(notFewer|1)': shareOf(one, 'notFewer'), 'P(undecided|1)': shareOf(one, 'undecided'),
    'P(fewer|0.5)': shareOf(half, 'fewer'), 'P(notFewer|0.5)': shareOf(half, 'notFewer'), 'P(undecided|0.5)': shareOf(half, 'undecided') };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'sizing.json'), JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify(doc));
}

// ---------- the table ----------
function buildTable() {
  const rows = fs.readFileSync(path.join(OUT, 'rows.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'meta.json'), 'utf8'));
  const sizing = JSON.parse(fs.readFileSync(path.join(OUT, 'sizing.json'), 'utf8'));
  const errors = JSON.parse(fs.readFileSync(path.join(OUT, 'errors.json'), 'utf8'));
  const counts = fs.readFileSync(path.join(OUT, 'counts.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const classesRow = JSON.parse(fs.readFileSync(path.join(OUT, 'classes.json'), 'utf8'));
  const byCell = new Map();
  for (const r of rows) (byCell.get(r.cell) ?? byCell.set(r.cell, []).get(r.cell)).push(r);
  const interval = (v) => { const s = v.filter(Number.isFinite).sort(asc); return s.length ? [sig(pct(s, 0.025), 4), sig(pct(s, 0.975), 4)] : [null, null]; };
  const read = (cell, field = 'ae') => {
    const list = byCell.get(cell);
    if (!list) return null;
    const p0 = list.find((r) => r.rep === 0), reps = list.filter((r) => r.rep > 0);
    return Object.fromEntries(PCTS.map((q, p) => [String(q * 100), { value: p0[field][p], interval: interval(reps.map((r) => r[field][p])) }]));
  };
  const cellId = (arm, theory, lead, scope = 'all', map = 'base') => `a${arm}|${theory}|${lead}|${scope}|${map}`;
  const summary = (id) => {
    const list = byCell.get(id);
    if (!list) return null;
    const p0 = list.find((r) => r.rep === 0);
    return { cell: id, ae: read(id), singleRadius: read(id, 'single'), withoutSlowEncounters: read(id, 'fast'), caught: p0.caught, droppedTrueEventShare: p0.dropped, beyondTiers: p0.cap, singleRadiusKm99: p0.Rsingle };
  };
  const arm1 = {};
  for (const lead of [1, 3, 5]) { arm1[lead] = {}; for (const t of THEORIES) arm1[lead][t] = summary(cellId(1, t, lead)); }
  const arm2 = { 1: summary(cellId(2, 'PUB', 1)), 3: summary(cellId(2, 'PUB', 3)) };
  const floor = summary(cellId(1, 'ZERO', 0));
  // The verdicts: alerts(AP) / alerts(comparator), within each replicate.
  const verdicts = {};
  for (const c of ['SGP4', 'XP', 'XPU', 'FFM']) {
    const a = byCell.get(cellId(1, 'AP', 3)), b = new Map(byCell.get(cellId(1, c, 3)).map((r) => [r.rep, r]));
    const ratio = (r) => r.ae[1] / b.get(r.rep).ae[1];
    const [lo, hi] = interval(a.filter((r) => r.rep > 0).map(ratio));
    verdicts[c] = { ratio: sig(ratio(a.find((r) => r.rep === 0)), 4), interval: [lo, hi], verdict: callOf(lo, hi) };
  }
  const ratiosBeside = (scope, map) => Object.fromEntries(['SGP4', 'XP', 'XPU', 'FFM'].map((c) => {
    const a = byCell.get(cellId(1, 'AP', 3, scope, map)), b = new Map(byCell.get(cellId(1, c, 3, scope, map)).map((r) => [r.rep, r]));
    const ratio = (r) => r.ae[1] / b.get(r.rep).ae[1];
    return [c, { ratio: sig(ratio(a.find((r) => r.rep === 0)), 4), interval: interval(a.filter((r) => r.rep > 0).map(ratio)) }];
  }));
  const sensitivities = {
    commonWindows: { theories: Object.fromEntries(THEORIES.map((t) => [t, read(cellId(1, t, 3, 'common'))])), apOver: ratiosBeside('common', 'base') },
    laserSpheresIn750to2000: { theories: Object.fromEntries(THEORIES.map((t) => [t, read(cellId(1, t, 3, 'all', 'ls'))])), apOver: ratiosBeside('all', 'ls') },
    burnFreeNear700AndAltimetry: { theories: Object.fromEntries(THEORIES.map((t) => [t, read(cellId(1, t, 3, 'burnfree'))])), apOver: ratiosBeside('burnfree', 'base') },
    publicLaserSpheresBelow600: read(cellId(2, 'PUB', 3, 'all', 'slr')),
    publicIsotropicDirection: read(cellId(2, 'PUB', 3, 'isotropic')),
  };
  // Per regime pair at the primary reading.
  const names = classesRow.names;
  const perPair = (id) => {
    const list = byCell.get(id), p0 = list.find((r) => r.rep === 0), reps = list.filter((r) => r.rep > 0);
    return names.map((name, k) => ({ pair: name, radiusKm: p0.R[k], radiusInterval: interval(reps.map((r) => r.R[k])), alertsPerTrueEvent: p0.aeClass[k], interval: interval(reps.map((r) => r.aeClass[k])), trueEventShare: sig(p0.nClass[k] / p0.nClass.reduce((s, x) => s + x, 0), 3) }));
  };
  const pairs = { ...Object.fromEntries(THEORIES.map((t) => [t, perPair(cellId(1, t, 3))])), PUB: perPair(cellId(2, 'PUB', 3)) };
  // Closure and the shape of the geometry.
  const t = (id) => counts.find((c) => c.id === id);
  const weightOf = (c) => (c.catalog * (c.catalog - 1)) / (c.objects * (c.objects - 1));
  const closure = {
    t0Digest: { value: counts[0].digest, b2: B2_DIGEST, equal: counts[0].digest === B2_DIGEST && counts[0].events === B2_EVENTS },
    ladderUnder5km: { t1s1: t('t1-s1').under5km, b2: B2_LADDER, rel: sig(t('t1-s1').under5km / B2_LADDER - 1, 3) },
    weightedAgainstFull: Object.fromEntries(TIERS.filter((x) => x.tier).map((x) => [x.id, sig((t(x.id).under5km * weightOf(t(x.id))) / counts[0].events - 1, 3)])),
  };
  const doc = { label: LABEL, primary: '99 percent, 3 days ahead, one radius per regime pair', perfectForecast: floor, arm1: { input: 'precise orbits', leads: arm1, verdicts, comparison: 'same windows where a window key holds every theory; see errors.json windowsAllFive' }, arm2: { input: 'public element sets, SGP4 only', leads: arm2, pairedWithArm1: false }, sensitivities, perPair: pairs, closure, geometry: classesRow.shape, sizing, builds: BUILD_NAMES, holds: 'No Starlink group, held Galileo satellite, operator capture or C2 row was parsed. Swarm and GRACE-FO truth never after 2026-10-31.', registration: { commit: meta.registration_commit, time: meta.registration_time, sizing_commit: meta.sizing_commit } };
  return { doc, errors, counts };
}
const BUILD_NAMES = {
  SGP4: 'analysis/gp-error-model 0.11.0, propagator/sgp4 1.4.1, refit to the same truth',
  XP: 'whiteroom XP, flown on sdn-ap 0.4.11; equal on 0.5.1, 0.6.3 and 0.6.4 by the cells.json provenance',
  XPU: 'Space Force XP through propagator/sgp4-xp 0.2.1',
  AP: 'sdn-ap: flown on 0.5.1, named 0.6.4 by the identities in cells.json provenance; THEMIS and Chandra flown on 0.6.3; day 5 flown on 0.5.1',
  FFM: 'propagator/ffm 2.2.0, RK78, analysis/estimation 0.7.0; 40x40 below 2000 km perigee, 20x20 elsewhere',
  PUB: 'SGP4 on the latest public element set, sdn-ap-gp-history-od baseline, no fit',
  screen: 'analysis/conjunction-assessment 0.18.4',
};
function tableFiles() {
  const { doc, errors } = buildTable();
  const q99 = (x) => x?.ae?.['99'];
  const L = [];
  L.push('# Alerts per real conjunction, per theory (report-only)', '', `**${LABEL}**`, '', 'Registration: `ALERTS-PER-CONJUNCTION.md`. Arm 1: input precise orbits. Arm 2: input public element sets. Arm 2 is on other windows than arm 1; the two are never paired.', '');
  L.push('## Alerts per true event: 99 percent caught, one radius per regime pair', '', '| Input | Theory | 1 day | 3 days | 5 days |', '|---|---|---:|---:|---:|');
  const cell = (x) => (x ? `${fmt(q99(x).value)} (${fmt(q99(x).interval[0])} to ${fmt(q99(x).interval[1])})${x.beyondTiers ? ', at least' : ''}` : 'not measured');
  for (const t of THEORIES) L.push(`| Precise orbits | ${THEORY_LABEL[t]} | ${cell(doc.arm1.leads[1][t])} | ${cell(doc.arm1.leads[3][t])} | ${cell(doc.arm1.leads[5][t])} |`);
  L.push(`| Public element sets | ${THEORY_LABEL.PUB} | ${cell(doc.arm2.leads[1])} | ${cell(doc.arm2.leads[3])} | not measured |`);
  L.push(`| None | ${THEORY_LABEL.ZERO} | ${fmt(q99(doc.perfectForecast).value)} | | |`, '');
  L.push('A perfect forecast gives about 1. Intervals: percentile bootstrap, 400 replicates; they cover the error rows, the draws and the thinning, not the one week of catalog or the few satellites behind each regime.', '');
  L.push('## Sensitivity to the share caught, 3 days ahead', '', '| Input | Theory | 95 percent | 99 percent | 99.9 percent | 99 percent, one radius for all | 99 percent, without encounters under 100 m/s |', '|---|---|---:|---:|---:|---:|---:|');
  const iv = (o) => (o ? `${fmt(o.value)} (${fmt(o.interval[0])} to ${fmt(o.interval[1])})` : 'n/a');
  const sens = (input, name, x) => L.push(`| ${input} | ${name} | ${iv(x.ae['95'])} | ${iv(x.ae['99'])} | ${iv(x.ae['99.9'])} | ${iv(x.singleRadius['99'])} | ${iv(x.withoutSlowEncounters['99'])} |`);
  for (const t of THEORIES) sens('Precise orbits', THEORY_LABEL[t], doc.arm1.leads[3][t]);
  sens('Public element sets', THEORY_LABEL.PUB, doc.arm2.leads[3]);
  L.push('', '## AP against each theory, 3 days ahead, 99 percent', '', '| Comparator | AP alerts / comparator alerts | Interval | Verdict |', '|---|---:|---|---|');
  const verdictWord = { fewer: 'AP fewer', notFewer: 'AP not fewer', undecided: 'undecided' };
  for (const [c, v] of Object.entries(doc.arm1.verdicts)) L.push(`| ${THEORY_LABEL[c]} | ${fmt(v.ratio)} | ${fmt(v.interval[0])} to ${fmt(v.interval[1])} | ${verdictWord[v.verdict]} |`);
  L.push('', `Rule: AP fewer if the upper bound is below 0.9, AP not fewer if the lower bound is at or above 0.9, else undecided. Pass chances (\`sizing.json\`, synthetic errors, committed before any alert): P(fewer | true ratio 1) ${doc.sizing['P(fewer|1)']}, P(not fewer | 1) ${doc.sizing['P(notFewer|1)']}, P(fewer | 0.5) ${doc.sizing['P(fewer|0.5)']}, P(not fewer | 0.5) ${doc.sizing['P(notFewer|0.5)']}.`, '');
  L.push('## The same ratio under each other reading', '', '| Reading | Over SGP4 | Over XP, whiteroom | Over XP, Space Force | Over FFM |', '|---|---:|---:|---:|---:|');
  const ratioRow = (name, r) => L.push(`| ${name} | ${['SGP4', 'XP', 'XPU', 'FFM'].map((c) => `${fmt(r[c].ratio)} (${fmt(r[c].interval[0])} to ${fmt(r[c].interval[1])})`).join(' | ')} |`);
  ratioRow('Only windows all five flew', doc.sensitivities.commonWindows.apOver);
  ratioRow('750 to 2000 km on the laser spheres', doc.sensitivities.laserSpheresIn750to2000.apOver);
  ratioRow('Near 700 km and altimetry without burn windows', doc.sensitivities.burnFreeNear700AndAltimetry.apOver);
  L.push('', `Public element sets at 3 days: ${iv(doc.sensitivities.publicLaserSpheresBelow600['99'])} with the laser spheres' errors also below 600 km; ${iv(doc.sensitivities.publicIsotropicDirection['99'])} with a uniformly random error direction.`, '');
  L.push('## By regime pair, 3 days ahead, 99 percent', '', '| Pair | Share of true events | Theory | Radius km | Alerts per true event |', '|---|---:|---|---:|---:|');
  for (const t of [...THEORIES, 'PUB']) for (const p of doc.perPair[t]) L.push(`| ${p.pair} | ${p.trueEventShare} | ${THEORY_LABEL[t]} | ${fmt(p.radiusKm)} (${fmt(p.radiusInterval[0])} to ${fmt(p.radiusInterval[1])}) | ${fmt(p.alertsPerTrueEvent)} (${fmt(p.interval[0])} to ${fmt(p.interval[1])}) |`);
  L.push('', '## Same-window', '', 'Each theory\'s whole landed cell is the primary reading. A replicate resamples window keys jointly; a key a theory lacks drops from that theory alone.', '', '| Cut | Lead days | Windows, any theory | Windows, all five |', '|---|---:|---:|---:|');
  for (const r of errors.rows.filter((x) => x.windowsAny !== undefined)) L.push(`| ${r.cell} | ${r.lead} | ${r.windowsAny} | ${r.windowsAllFive} |`);
  L.push('', '## Builds', '');
  for (const [k, v] of Object.entries(doc.builds)) L.push(`- ${THEORY_LABEL[k] ?? k}: ${v}.`);
  L.push('', '## Closure and geometry', '', `- t0 equals B2's landed event set: ${doc.closure.t0Digest.equal} (digest \`${doc.closure.t0Digest.value}\`).`, `- t1 seed 1's events under 5 km against B2's \`ladder-1-8-s1\`: ${doc.closure.ladderUnder5km.rel}.`, `- Each thinned tier's weighted count under 5 km against the full catalog's, relative: ${Object.entries(doc.closure.weightedAgainstFull).map(([k, v]) => `${k} ${v}`).join(', ')}.`, `- True events under 100 m/s relative speed: ${doc.geometry.slowTrueShare}. True events by miss, share under 0.5 km: ${doc.geometry.under500mShare} (0.25 for a miss uniform over the plane).`, `- Realized catch at 99 percent, 3 days: ${THEORIES.map((t) => `${THEORY_LABEL[t]} ${doc.arm1.leads[3][t].caught[1]}`).join(', ')}, ${THEORY_LABEL.PUB} ${doc.arm2.leads[3].caught[1]}.`, `- True events left out for want of error rows: 5 days ${doc.arm1.leads[5].AP.droppedTrueEventShare}; public sets ${doc.arm2.leads[3].droppedTrueEventShare} (highly elliptical).`, '');
  L.push('## What this does not say', '', '- The errors of the two objects are drawn independently. The rows come from the few satellites with precise orbits and are carried by regime to the whole catalog: most of the low catalog flies the errors of Swarm and GRACE-FO.', '- "True" is SGP4\'s geometry from one week of the catalog, not what happened in orbit.', '- This is no collision probability and uses no covariance. It derives no compute ratio, and uses none of B2\'s fits or timing rows.', '- Arm 1 assumes precise orbits, which exist for a small share of the catalog. Arm 2 is what the public sets give; it holds SGP4 alone, because fitting another theory to SGP4-generated states is barred.', '');
  const chart = { label: LABEL, title: 'Alerts per real conjunction', y: 'Alerts per true event, 99 percent caught', arms: { 'precise orbits': Object.fromEntries(THEORIES.map((t) => [THEORY_LABEL[t], Object.fromEntries([1, 3, 5].map((d) => [d, doc.arm1.leads[d][t] ? { value: q99(doc.arm1.leads[d][t]).value, interval: q99(doc.arm1.leads[d][t]).interval } : null]))])), 'public element sets': { [THEORY_LABEL.PUB]: Object.fromEntries([1, 3].map((d) => [d, { value: q99(doc.arm2.leads[d]).value, interval: q99(doc.arm2.leads[d]).interval }])) } }, perfectForecast: q99(doc.perfectForecast).value, armsPaired: false };
  return { 'table.json': JSON.stringify(doc, null, 1) + '\n', 'README.md': L.join('\n'), 'chart.json': JSON.stringify(chart, null, 1) + '\n' };
}
function classesMode() {
  const geo = loadGeometry();
  const { truth, tiers } = geo;
  let slow = 0, under = 0;
  for (let i = 0; i < truth.n; i++) { if (truth.g[i * RECORD + 1] < 0.1) slow++; if (truth.g[i * RECORD] < 0.5) under++; }
  // Encounters under 5 km by true miss, for the miss distribution's shape: index share per kilometer ring.
  const rings = new Float64Array(5);
  for (let i = 0; i < tiers.t0.n; i++) rings[Math.min(4, Math.floor(tiers.t0.g[i * RECORD]))]++;
  const doc = { names: geo.classNames, shape: { slowTrueShare: sig(slow / truth.n, 3), under500mShare: sig(under / truth.n, 3), ringShares0to5km: [...rings].map((x) => sig(x / tiers.t0.n, 3)), uniformPlane: [0.04, 0.12, 0.2, 0.28, 0.36] } };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'classes.json'), JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify(doc));
}
function table() {
  for (const [n, c] of Object.entries(tableFiles())) fs.writeFileSync(path.join(OUT, n), c);
  console.log('table written');
}

// ---------- check ----------
function check() {
  const fails = [];
  const reg = registration();
  const firstOf = (rel) => git(['log', '--diff-filter=A', '--format=%H %cI', '--', rel]).split('\n').filter(Boolean).at(-1)?.split(' ');
  const sizingC = firstOf(`${OUT_REL}/sizing.json`), rowsC = firstOf(`${OUT_REL}/rows.jsonl`);
  if (!sizingC || !rowsC) fails.push('sizing or rows not committed');
  else {
    if (!(Date.parse(reg.time) < Date.parse(sizingC[1]))) fails.push('sizing is not after the registration');
    if (!(Date.parse(sizingC[1]) < Date.parse(rowsC[1]))) fails.push('the alert rows are not after the sizing');
    const ancestor = (a, b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: ROOT }); return true; } catch { return false; } };
    if (!ancestor(reg.commit, sizingC[0]) || !ancestor(sizingC[0], rowsC[0])) fails.push('registration, sizing and rows are not one ancestry chain');
  }
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'meta.json'), 'utf8'));
  if (meta.registration_commit !== reg.commit) fails.push('meta names another registration');
  if (meta.t0_digest !== B2_DIGEST) fails.push(`t0 digest ${meta.t0_digest} is not B2's`);
  const files = tableFiles();
  for (const [n, c] of Object.entries(files)) if (fs.readFileSync(path.join(OUT, n), 'utf8') !== c) fails.push(`${n} does not reproduce from the rows`);
  const doc = JSON.parse(files['table.json']);
  // The error rows against the landed cells, from the archive.
  const now = errorSummary(loadErrors());
  if (now.mismatches.length) fails.push(`${now.mismatches.length} error cells differ from cells.json: ${now.mismatches[0]}`);
  if (JSON.stringify(now, null, 1) + '\n' !== fs.readFileSync(path.join(OUT, 'errors.json'), 'utf8')) fails.push('errors.json does not reproduce from the archive');
  const checked = now.rows.filter((r) => r.landed).length;
  for (const lead of [1, 3]) for (const t of THEORIES) { const x = doc.arm1.leads[lead][t]; if (!x || !Number.isFinite(x.ae['99'].value) || !Number.isFinite(x.ae['99'].interval[0])) fails.push(`arm 1 ${t} day ${lead} has no figure`); }
  for (const t of ['AP', 'XP']) if (!doc.arm1.leads[5][t]) fails.push(`arm 1 ${t} day 5 has no figure`);
  for (const lead of [1, 3]) if (!doc.arm2.leads[lead]) fails.push(`arm 2 day ${lead} has no figure`);
  for (const k of ['commonWindows', 'laserSpheresIn750to2000', 'burnFreeNear700AndAltimetry', 'publicLaserSpheresBelow600', 'publicIsotropicDirection']) if (!doc.sensitivities[k]) fails.push(`sensitivity ${k} missing`);
  for (const t of THEORIES) for (const q of ['95', '99.9']) if (!Number.isFinite(doc.arm1.leads[3][t].ae[q].value)) fails.push(`${t} ${q} percent missing`);
  if (!doc.closure.t0Digest.equal) fails.push('closure: t0 is not B2');
  if (Math.abs(doc.closure.ladderUnder5km.rel) > 0.01) fails.push(`closure: ladder ${doc.closure.ladderUnder5km.rel}`);
  if (doc.label !== LABEL) fails.push('label');
  if (!Object.values(doc.arm1.verdicts).every((v) => ['fewer', 'notFewer', 'undecided'].includes(v.verdict))) fails.push('verdicts');
  if (fails.length) { console.log('FAIL'); for (const f of fails) console.log(`  ${f}`); process.exit(1); }
  const v = (t) => { const x = doc.arm1.leads[3][t].ae['99']; return `${t} ${x.value} [${x.interval[0]}, ${x.interval[1]}]`; };
  console.log(`alerts-per-conjunction --check PASS: registration ${reg.commit.slice(0, 10)} before the sizing and the rows; t0 equals B2 (${B2_EVENTS} events); ${checked} error cells equal cells.json; table reproduces; alerts per true event at 3 days, 99 percent: ${THEORIES.map(v).join('; ')}; public sets ${doc.arm2.leads[3].ae['99'].value}; both arms and the sensitivities present.`);
}

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
if (arg('--child')) await child(arg('--child')).then(() => process.exit(0));
else if (process.argv.includes('--screen')) await screen();
else if (process.argv.includes('--geometry')) { geometry(); classesMode(); }
else if (process.argv.includes('--errors')) errorsMode();
else if (process.argv.includes('--sizing')) await sizing();
else if (arg('--size-shard')) sizeShard(Number(arg('--size-shard')));
else if (process.argv.includes('--sim')) await sim();
else if (arg('--shard')) shard(Number(arg('--shard')), HEAVY);
else if (process.argv.includes('--table')) table();
else if (process.argv.includes('--check')) check();
else { console.error('see the header'); process.exit(2); }
