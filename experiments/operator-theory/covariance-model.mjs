// COVARIANCE-MODEL.md: AP's DRAG process-noise forms, selected on the coverage study's rows by leave-one-block-out, the selected form scored once
// on held-out windows neither earlier fit read. Module calls only: every fit, state, covariance and RIC projection is a module's; JavaScript
// moves records, re-weights the module's own per-term variances (P(t) is linear in each squared size) and takes ratios and medians.
//   node experiments/operator-theory/covariance-model.mjs --rows                 held-out rows: every shard of every set (resumable)
//   node experiments/operator-theory/covariance-model.mjs --worker <set> --shard k
//   node experiments/operator-theory/covariance-model.mjs --select              the forms in order, five folds each, until one passes
//   node experiments/operator-theory/covariance-model.mjs --fold <form> <block>  one fit (block: a training block left out, or all)
//   node experiments/operator-theory/covariance-model.mjs --heldout             the selected form scored once; then the others as information
//   node experiments/operator-theory/covariance-model.mjs --table [--out <dir>]
//   node experiments/operator-theory/covariance-model.mjs --check               the end to end
// Environment: SDN_MODULES_ROOT the read-only root holding XM's registered installs (space-data-network-modules-r2); SDN_AP_ROOT the read-only
// clone holding the shipped 0.6.1 build's commit (space-data-network-modules-pin), its git and its SDS 1.278.0 bindings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const argOf = (name, k = 1) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + k] : null; };
const ARCHIVE = '/opt/data/sdn-archive/operator-theory', TRAIN = path.join(ARCHIVE, 'covariance-coverage'), B051 = path.join(ARCHIVE, 'ap/b051');
const OUT = process.env.COVM_OUT ?? path.join(ARCHIVE, 'covariance-model');
const RESULTS = path.join(repo, 'results/ap-truth/covariance-model'), PLAN = 'experiments/operator-theory/COVARIANCE-MODEL.md';
const SHARDS = 12, WORKERS = Number(process.env.COVM_WORKERS ?? 6), LOAD_BELOW = Number(process.env.COVM_LOAD_BELOW ?? 42), HOURS = 167, HOUR = 3600000, DAY = 86400000;
const BUILD = { module: 'propagator/sdn-ap', version: '0.6.1', modulesCommit: '3b59e95b3', wasmSha256: '05dd4a6600fb4c65d5841e1f49dc26df64fca7c14f1084644cafcfa875fe0a87' };
const AP_ROOT = process.env.SDN_AP_ROOT ?? '/Users/tj/software/private/coordinator-d9/space-data-network-modules-pin';
const K_F_061 = 1.5127596877626373; // the floor scale the 0.6.1 record's FLOOR fields carry (SPEC 12.2)
const ROW_061 = { s_e: 1.8579913326733934e-7, s_i: 1.12761105007012e-6, s_l: 7.647194501793458e-7, c: 0.112126311682426, k_F: K_F_061 };

// ---- bars (R2): C2's by-object hold-outs and the satellites barred until E13b scores; Swarm and GRACE-FO by time; C2's time cut on its objects
const BARRED = [31698, 66315, 22824, 8820, 43567, 37847, 41862, 41174, 43055, 41175];
const SWARM_GRACE = [39451, 39452, 39453, 43476, 43477], SWARM_GRACE_LAST = Date.parse('2026-10-31T00:00:00Z');
const C2_OBJECTS = [39451, 39452, 39453, 43476, 43477, 39634, 62261, 28874, 41019, 43058, 37869, 44850], C2_CUT = Date.parse('2026-06-01T00:00:00Z');
function barred(norad, cutoffMs, name = '') {
  if (BARRED.includes(norad)) return 'a held-out or barred object';
  if (SWARM_GRACE.includes(norad) && cutoffMs + 7 * DAY > SWARM_GRACE_LAST) return 'Swarm or GRACE-FO truth after 2026-10-31';
  if (C2_OBJECTS.includes(norad) && cutoffMs >= C2_CUT) return "C2's time hold-out";
  if (/starlink/i.test(name)) return 'a Starlink object';
  return null;
}

// ---- held-out sets (R1)
const NEAR = { 'CryoSat-2': 36508, SARAL: 39086, 'Sentinel-3A': 41335, 'Sentinel-3B': 43437, larets: 27944, starlette: 7646, westpac: 25398 };
const WEAK = { 'Jason-3': 41240, 'Sentinel-6A': 46984, 'Sentinel-6B': 66514, SWOT: 54754, 'HY-2C': 46469, 'HY-2D': 48621, ajisai: 16908, lares: 38077 };
const SETS = {
  p26: { regime: 'H1', label: 'Strong drag, 2026 (P)', producer: 'xm', env: { XP2F_CONTROL: '1' }, group: 'P', from: '2026-01-01', to: '2026-05-31', arms: ['AP72', 'AP24'], control: 'truth2' },
  s1q4: { regime: 'H2b', label: 'Near 700 km, Sentinel-1 2025', producer: 'xm', env: {}, group: 'S1', from: '2025-10-04', to: '2025-12-21', arms: ['AP72', 'AP24'], control: null },
  dols: { regime: null, label: 'DO and LS 2025', producer: 'regimes', env: {}, arms: ['AP24', 'AP72'], control: 'regimes' },
  // the training windows re-flown on 0.6.1 at 17 digits (amendment 2: the precision rule's flight), exactly the coverage study's windows
  trT: { regime: 'T', label: 'Strong drag, 2025 (training)', producer: 'xp2', env: {}, from: '2025-04-01', to: '2025-12-21', arms: ['AP24', 'APRa12'], control: 'truth', training: 'truth' },
  trS1: { regime: 'S1', label: 'Near 700 km, 2026 (training)', producer: 'xm', env: { XP2F_CONTROL: '1' }, group: 'S1', from: '2026-01-01', to: '2026-05-31', arms: ['AP72', 'AP24'], control: 'truth2', training: 'truth2' },
};
const HELD_SETS = ['p26', 's1q4', 'dols'], TRAIN_SETS = ['trT', 'trS1'];
const REGIME = { T: 'Strong drag, 2025', S1: 'Near 700 km, 2026', H1: 'Strong drag, 2026 (P)', H2a: 'Near 700 km, DO and LS 2025', H2b: 'Near 700 km, Sentinel-1 2025', H3: 'Weak drag, DO and LS 2025 (no-harm)' };
const REQUIRED = ['H1', 'H2a', 'H2b'], NOHARM = ['H3'];
const regimeOfDols = (name) => (name in NEAR ? 'H2a' : name in WEAK ? 'H3' : null);

// ---- training blocks (R3)
const BLOCKS = { 'T-a': ['T', '2025-04-01', '2025-06-30'], 'T-b': ['T', '2025-07-01', '2025-09-30'], 'T-c': ['T', '2025-10-01', '2025-12-21'],
  'S1-a': ['S1', '2026-01-01', '2026-03-15'], 'S1-b': ['S1', '2026-03-16', '2026-05-31'] };
const blockOf = (regime, date) => Object.entries(BLOCKS).find(([, [r, a, b]]) => r === regime && date >= a && date <= b)?.[0] ?? null;
const GUARD_DAYS = 10;

const TERMS = ['e', 'i', 'l', 'd'], VARIANTS = ['full', ...TERMS, 'off'], AXES = ['R', 'I', 'C'];
const HALF_NORMAL_MEDIAN = 0.6744897501960817, BAND = [0.603, 0.754], TWO_SIGMA_MIN = 0.90, CHI2_3_95 = 7.814727903251178, CELLS = [24, 72, 167];
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
const rowsIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const msOf = (t) => Date.parse(/Z$/.test(t) ? t : `${t}Z`);
const sig = (x, n = 6) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toPrecision(n)));
const fmt = (x) => (x === null || x === undefined ? '' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : Math.abs(x) >= 0.01 ? x.toPrecision(3) : x.toExponential(2));

// =====================================================================================================================================
// Held-out rows: the producers' fits on the shipped 0.6.1 build, each flown six ways (COVARIANCE-COVERAGE.md's flights), full RIC block, 17 digits.
async function apKit() {
  const req = createRequire(path.join(AP_ROOT, 'propagator/sdn-ap/package.json'));
  const standards = path.dirname(req.resolve('spacedatastandards.org/package.json'));
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const [OCM, OEM, PCF] = await Promise.all(['OCM', 'OEM', 'PCF'].map((c) => import(pathToFileURL(path.join(standards, `lib/js/${c}/main.js`)).href)));
  process.env.SDN_MODULES_GIT = AP_ROOT;
  const { standalone } = await import('./lib/ap.mjs');
  const h = await standalone('propagator/sdn-ap', { modulesCommit: BUILD.modulesCommit, wasmSha256: BUILD.wasmSha256 });
  const TYPE = (name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName: name, wireFormat: 'flatbuffer' });
  const prefixed = (u, id) => String.fromCharCode(...u.subarray(8, 12)) === id;
  const pcf = (t) => { const b = new fb.Builder(1 << 12); PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
  const ocmOf = (u) => (prefixed(u, '$OCM') ? OCM.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(u)) : OCM.OCM.getRootAsOCM(new fb.ByteBuffer(u))).unpack();
  return {
    sds: JSON.parse(fs.readFileSync(path.join(standards, 'package.json'), 'utf8')).version,
    flightPcf: (frame, epochs) => { const t = new PCF.PCFT(); t.OUTPUT = Object.assign(new PCF.PCFOutputT(), { FRAME: PCF.pcfOutputFrame[frame], EPOCHS: epochs }); return pcf(t); },
    async fit(inputs) {
      const r = await h.invoke({ methodId: 'fit', inputs: inputs.map(([portId, name, payload]) => ({ portId, typeRef: TYPE(name), payload })) });
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
      return { ok: true, ocm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) };
    },
    async fly(ocm, flightPcf) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: flightPcf }] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      return new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload);
    },
    lines(bytes) {
      const u = new Uint8Array(bytes);
      const o = (prefixed(u, '$OEM') ? OEM.OEM.getSizePrefixedRootAsOEM(new fb.ByteBuffer(u)) : OEM.OEM.getRootAsOEM(new fb.ByteBuffer(u))).unpack();
      const block = o.EPHEMERIS_DATA_BLOCK[0], cov = new Map((block.COVARIANCE_MATRIX_LINES ?? []).map((c) => [c.EPOCH, [c.CX_X, c.CY_X, c.CY_Y, c.CZ_X, c.CZ_Y, c.CZ_Z,
        c.CX_DOT_X, c.CX_DOT_Y, c.CX_DOT_Z, c.CX_DOT_X_DOT, c.CY_DOT_X, c.CY_DOT_Y, c.CY_DOT_Z, c.CY_DOT_X_DOT, c.CY_DOT_Y_DOT,
        c.CZ_DOT_X, c.CZ_DOT_Y, c.CZ_DOT_Z, c.CZ_DOT_X_DOT, c.CZ_DOT_Y_DOT, c.CZ_DOT_Z_DOT]]));
      return block.EPHEMERIS_DATA_LINES.map((l) => ({ epoch: l.EPOCH, r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT], cov: cov.get(l.EPOCH) ?? null }));
    },
    covPropagation(ocm) { const o = ocmOf(new Uint8Array(ocm)); return { cp: o.COV_PROPAGATION ? { ...o.COV_PROPAGATION } : null, fitStop: o.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_STOP ?? null }; },
    variant(ocm, set) {
      const u = new Uint8Array(ocm), pre = prefixed(u, '$OCM'), o = ocmOf(u);
      for (const [f, v] of Object.entries(set)) o.COV_PROPAGATION[f] = v;
      const b = new fb.Builder(u.length + 1024);
      if (pre) OCM.OCM.finishSizePrefixedOCMBuffer(b, o.pack(b)); else OCM.OCM.finishOCMBuffer(b, o.pack(b));
      return b.asUint8Array().slice();
    },
  };
}
const ZERO = { full: {}, e: { NOISE_ECCENTRICITY_PER_DAY: 0 }, i: { NOISE_INCLINATION_PER_DAY: 0 }, l: { NOISE_MEAN_MOTION_RELATIVE: 0 },
  d: { NOISE_NON_GRAVITATIONAL_RAD_DAY2: 0, NON_GRAVITATIONAL_SHARE: 0 } };
ZERO.off = { ...ZERO.e, ...ZERO.i, ...ZERO.l, ...ZERO.d };

async function scorer() {
  const XMC = await import('../xp-atmosphere-merit/common.mjs');
  const modules = XMC.modulesRoot();
  const { bytes, manifest } = XMC.pinned(modules, 'analysis/gp-error-model');
  const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(modules, 'analysis/gp-error-model/package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
  const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')).href);
  return {
    async pairs(list) {
      const h = await createBrowserModuleHarness({ wasmSource: bytes, manifest, surface: 'direct' });
      try {
        const r = await h.invoke({ methodId: 'pair_statistics', inputs: [erm.frame('pairs', 'pairs', { axesFrom: 'truth', pairs: list.map((p, i) => ({ id: String(i),
          predicted: { position: p.r, velocity: p.v, covariance: p.cov, covarianceAxes: 'INERTIAL' }, truth: { position: p.tr, velocity: p.tv } })) })] });
        if (r.statusCode !== 0) throw new Error(`pair_statistics: ${r.errorCode ?? r.statusCode}: ${String(r.errorMessage).slice(0, 200)}`);
        const out = {};
        for (const o of r.outputs) out[o.portId] = Buffer.from(o.payload);
        return erm.decode(out.statistics).pairs;
      } finally { await h.destroy(); }
    },
  };
}

/** One fitted $OCM flown six ways at `leads`: per lead the error (RIC), each variant's RIC position block (RR, TR, TT, NR, NT, NN), d2 of the full flight. */
async function coverage(kit, gem, ocm, leads) {
  const fp = kit.flightPcf('GCRF', leads.map((l) => l.epoch));
  const original = await kit.fly(ocm, fp);
  const repackEqual = Buffer.from(await kit.fly(kit.variant(ocm, {}), fp)).equals(Buffer.from(original));
  const flights = {};
  for (const v of VARIANTS) flights[v] = kit.lines(v === 'full' ? original : await kit.fly(kit.variant(ocm, ZERO[v]), fp));
  for (const v of VARIANTS) if (flights[v].length !== leads.length || flights[v].some((s) => !s.cov)) throw new Error(`${v}: ${flights[v].length} of ${leads.length} states`);
  const stats = await gem.pairs(VARIANTS.flatMap((v) => flights[v].map((s, i) => ({ r: s.r, v: s.v, cov: s.cov, tr: leads[i].r, tv: leads[i].v }))));
  const at = (v, i) => stats[VARIANTS.indexOf(v) * leads.length + i];
  return { repackEqual, leads: leads.map((l, i) => ({ h: l.h, offsetS: l.offsetS, e: at('full', i).errorRtn, d2: at('full', i).d2Predicted,
    p: Object.fromEntries(VARIANTS.map((v) => [v, at(v, i).predictedRtn])) })) };
}

/** Lead hour h: the first state of the producer's grid at or after cutoff + h, within one grid step (COVARIANCE-COVERAGE.md amendment 1). */
function leadsOf(grid, D0, gridMs, ms) {
  const leads = [];
  for (let h = 1, j = 0; h <= HOURS; h += 1) {
    while (j < grid.length && ms(grid[j].epoch) < D0 + h * HOUR) j += 1;
    const l = grid[j];
    if (l && ms(l.epoch) < D0 + h * HOUR + gridMs) leads.push({ h, epoch: l.epoch, r: l.r, v: l.v, offsetS: (ms(l.epoch) - D0 - h * HOUR) / 1000 });
  }
  return leads;
}

async function worker(set, k) {
  const s = SETS[set];
  Object.assign(process.env, s.env);
  const X = await import('./lib/xp2.mjs');
  const { config, root, XM, iso, ms, rms } = X;
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
  const { apForces, fitPcf, fitWeather, horizonOf, readOcm } = await import('./lib/ap.mjs');
  const m = await openModules(), kit = await apKit(), gem = await scorer();
  const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
  const PCF = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null });
  // the 2025 producer's held-B arm (APRa12: 17 h arc, BTERM held at the stored RFa12 value), as ap-truth.mjs --arms registered runs it
  const storedB = new Map();
  if (s.producer === 'xp2') for (const f of fs.readdirSync(path.join(X.store, 'rows')).filter((n) => n.endsWith('.jsonl'))) for (const l of fs.readFileSync(path.join(X.store, 'rows', f), 'utf8').split('\n')) if (l) { const r = JSON.parse(l); if (r.arms?.RFa12?.bHeld) storedB.set(r.key, r.arms.RFa12.bHeld); }
  const FIT = { srpPrior: XM.config.fit.srpPrior };
  const heldPcf = (b) => fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: { dragPrior: { form: 'LOG_NORMAL', mean: b, sigma: 1e-6 }, ...(FIT.srpPrior ? { srpPrior: FIT.srpPrior } : {}) } });
  const trainingKeys = s.training ? new Set(rowsIn(path.join(TRAIN, s.training)).map((r) => r.key)) : null;
  const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === k;
  const outDir = path.join(OUT, set), outFile = path.join(outDir, `rows-${k}.jsonl`);
  fs.mkdirSync(outDir, { recursive: true });
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  // objects: { group, name, norad, objectId, series(from, to) -> lines, cutoffs, regime }
  let objects;
  if (s.producer === 'xp2') {
    const byObject = new Map();
    for (const w of Object.keys(X.config.spans).flatMap((sp) => X.windows(sp))) {
      if (w.date < s.from || w.date > s.to || !trainingKeys.has(w.key)) continue;
      if (!byObject.has(w.o.norad)) byObject.set(w.o.norad, { o: w.o, ws: new Map() });
      byObject.get(w.o.norad).ws.set(w.cutoffMs, w.key);
    }
    objects = [...byObject.values()].map(({ o, ws }) => ({ group: null, name: o.name, norad: o.norad, objectId: o.objectId ?? '', o, cutoffs: [...ws.keys()], regime: s.regime,
      key: (t) => ws.get(t), series: (a, b) => T.series(o, a, b).lines }));
  } else if (s.producer === 'xm') {
    objects = XM.config.groups[s.group].objects.map((o) => ({ group: s.group, name: o.name, norad: o.norad, objectId: o.objectId ?? '', o, cutoffs: XM.daysOf(s.from, s.to), regime: s.regime,
      key: (t) => `${s.group}|${o.norad}|${XM.dateOf(t)}`, series: (a, b) => T.series(o, a, b).lines }))
      .map((x) => (trainingKeys ? { ...x, cutoffs: x.cutoffs.filter((t) => trainingKeys.has(x.key(t))) } : x));
  } else {
    // all-regimes.mjs's objects of groups DO and LS (Stella is barred: its files are never listed), its truth chain
    const { STATIC, windowKey } = await import('./lib/regimes.mjs');
    const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
    objects = [];
    for (const o of STATIC.filter((x) => (x.group === 'DO' || x.group === 'LS') && x.name !== 'stella')) {
      const regime = regimeOfDols(o.name);
      if (!regime) throw new Error(`${o.group} ${o.name}: in neither fixed list`);
      if (!o.cutoffs.some((t) => inShard(windowKey(o.group, o.name, t)))) continue;
      const files = o.files();
      if (!files.length) { console.error(`${o.group} ${o.name}: no product`); continue; }
      const series = SRC.chain(files), want = { ...NEAR, ...WEAK }[o.name];
      if (series.norad !== want) throw new Error(`${o.name}: NORAD ${series.norad}, fixed ${want}`);
      const lines = series.lines, times = lines.map((l) => ms(l.epoch));
      objects.push({ group: o.group, name: series.name || o.name, norad: series.norad, objectId: series.objectId ?? '', cutoffs: o.cutoffs, regime, arcs: o.arcs,
        key: (t) => windowKey(o.group, series.name || o.name, t), series: (a, b) => lines.filter((_, i) => times[i] >= a && times[i] <= b) });
    }
  }
  let budget = Number(process.env.COVM_LIMIT ?? Infinity);
  for (const o of objects) for (const D0 of o.cutoffs) {
    const key = o.key(D0);
    if (!inShard(key) || done.has(key) || budget <= 0) continue;
    budget -= 1;
    const bar = barred(o.norad, D0, o.name);
    if (bar) throw new Error(`${key}: ${bar}`);
    const row = { key, set, regime: o.regime, group: o.group, norad: o.norad, name: o.name, cutoff: iso(D0), arms: {} };
    try {
      const after = o.series(D0 + 1, D0 + 7 * DAY);
      const times = after.map((l) => ms(l.epoch)), first = times[0] ?? 0;
      const stepMs = times.length > 1 ? times[1] - times[0] : GRID;
      const gridMs = s.producer === 'xm' ? GRID : Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs);
      const minBin = s.producer === 'xm' ? MIN_BIN : Math.ceil((MIN_BIN / (DAY / GRID)) * (DAY / gridMs));
      const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
      const bins = Object.fromEntries(LEADS.map((d) => [d, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (d - 1) * DAY && t <= D0 + d * DAY; })]));
      const entered = LEADS.filter((d) => bins[d].length >= minBin);
      if (!entered.length) throw new Error('no lead bin');
      const scored = entered.flatMap((d) => bins[d]), sizes = entered.map((d) => bins[d].length);
      const epochs = scored.map((l) => l.epoch), truth = scored.map((l) => ({ r: l.r, v: l.v }));
      const leads = leadsOf(grid, D0, gridMs, ms);
      const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
      if (O.excluded) throw new Error(O.excluded);
      const spw = fitWeather(O.rows, horizonOf(D0));
      const score = (e) => { const days = {}; let i = 0; entered.forEach((d, j) => { const q = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(q.map((x) => x[c]))); days[d] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
      const arc = (hours) => { const raw = o.series(D0 - hours * HOUR, D0); const cov = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return cov >= MIN_COV ? T.thinned(raw).chosen : null; };
      for (const name of s.arms) {
        const hours = name === 'APRa12' ? 17 : Number(name.slice(2)), a = { ok: false };
        let f, pcf = PCF;
        try {
          if (name === 'APRa12') { const b = storedB.get(key); if (!(b > 0)) throw new Error('no positive B'); pcf = heldPcf(b); a.bHeld = b; }
          const thin = arc(hours);
          if (!thin) throw new Error('coverage');
          f = await kit.fit([['ephemeris', 'OEM', S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId, norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) })],
            ['configuration', 'PCF', pcf], ['space_weather', 'SPW', spw]]);
          if (!f.ok) throw new Error(f.error);
          const info = readOcm(f.ocm);
          a.bterm = info.bterm; a.agom = info.agom; a.rms = info.fitRmsKm;
          const st = kit.lines(await kit.fly(f.ocm, kit.flightPcf('TEME', epochs)));
          if (st.length !== epochs.length) throw new Error(`propagate returned ${st.length} of ${epochs.length} states`);
          a.days = score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth));
          a.ok = true;
        } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); row.arms[name] = a; continue; }
        try {
          if (!leads.length) throw new Error('no lead hour');
          const cp = kit.covPropagation(f.ocm);
          a.covPropagation = cp.cp; a.fitStop = cp.fitStop;
          const c = await coverage(kit, gem, f.ocm, leads);
          a.repackEqual = c.repackEqual; a.leads = c.leads;
        } catch (error) { a.coverageError = String(error?.message ?? error).slice(0, 180); }
        row.arms[name] = a;
      }
    } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  }
  console.error(`${set} shard ${k}/${SHARDS}: done`);
  process.exit(0);
}

/** Children under nice, at most WORKERS at once, each started while the 1-minute load is under LOAD_BELOW (or when none runs). */
async function pool(jobs, argsOf, logOf, doneOf) {
  const pending = jobs.filter((j) => !doneOf || !fs.existsSync(doneOf(j))), running = new Set(), failed = [];
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  while (pending.length || running.size) {
    if (pending.length && running.size < WORKERS && (os.loadavg()[0] < LOAD_BELOW || running.size === 0)) {
      const j = pending.shift(), log = fs.openSync(logOf(j), 'a');
      const child = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=6144', path.join(here, 'covariance-model.mjs'), ...argsOf(j)], { cwd: repo, stdio: ['ignore', log, log], env: process.env });
      running.add(child);
      console.error(`${new Date().toISOString()} start ${argsOf(j).join(' ')} pid ${child.pid} load ${os.loadavg()[0].toFixed(1)}`);
      child.on('exit', (code) => { running.delete(child); fs.closeSync(log); if (code === 0) { if (doneOf) fs.writeFileSync(doneOf(j), `${new Date().toISOString()}\n`); } else failed.push(`${argsOf(j).join(' ')} exit ${code}`); });
      await nap(1500);
    } else await nap(5000);
  }
  return failed;
}

async function rows() {
  fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true });
  const manifestFile = path.join(OUT, 'manifest.json');
  if (!fs.existsSync(manifestFile)) fs.writeFileSync(manifestFile, `${JSON.stringify({ startedUtc: new Date().toISOString(), commit: git(repo, 'rev-parse', 'HEAD').toString().trim(),
    runner: sha256(fs.readFileSync(new URL(import.meta.url))), build: BUILD, modulesRoot: process.env.SDN_MODULES_ROOT ?? null, apRoot: AP_ROOT, hours: HOURS, sets: SETS }, null, 1)}\n`);
  const jobs = [];
  const only = argOf('--sets')?.split(',') ?? HELD_SETS;
  for (let k = 0; k < SHARDS; k += 1) for (const set of only) jobs.push({ set, k });
  const failed = await pool(jobs, (j) => ['--worker', j.set, '--shard', String(j.k)], (j) => path.join(OUT, 'logs', `${j.set}-${j.k}.log`), (j) => path.join(OUT, 'logs', `${j.set}-${j.k}.done`));
  fs.writeFileSync(path.join(OUT, `run-${only.join('-')}.json`), `${JSON.stringify({ finishedUtc: new Date().toISOString(), failed }, null, 1)}\n`);
  if (failed.length) { console.error(`failed: ${failed.join('; ')}`); process.exit(1); }
}

// =====================================================================================================================================
// Burns (amendment 3): lib/steps.mjs lowSteps (minimum 4 m) on the truth's revolution means, per object over its whole span of windows. Truth only.
const STEP_RULE_M = 4, STEP_MARGIN_DAYS = 4.5, STEP_SHIFT_MS = 2 * HOUR, UNCHECKED_GAP_MS = 2 * HOUR;
const C2_TRUTH_END = Date.parse('2026-06-01T00:00:00Z');
const STEP_SETS = {
  trT: { env: {}, producer: 'xp2', cutoffsFrom: path.join(TRAIN, 'truth') },
  trS1: { env: { XP2F_CONTROL: '1' }, producer: 'xm', group: 'S1', cutoffsFrom: path.join(TRAIN, 'truth2') },
  p26: { env: { XP2F_CONTROL: '1' }, producer: 'xm', group: 'P', from: '2026-01-01', to: '2026-05-31' },
  s1q4: { env: {}, producer: 'xm', group: 'S1', from: '2025-10-04', to: '2025-12-21' },
  dols: { env: {}, producer: 'regimes' },
};
async function steps(set) {
  const s = STEP_SETS[set];
  Object.assign(process.env, s.env);
  const X = await import('./lib/xp2.mjs');
  const { config, root, XM } = X;
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const { revolutions, lowSteps, openElements, LOW } = await import('./lib/steps.mjs');
  const { ORBITS_010 } = await import('./lib/build.mjs');
  const el = await openElements({ build: ORBITS_010 });
  const rule = { ...LOW, minM: STEP_RULE_M };
  // objects with their cutoffs and a reader of [a, b]
  const objects = [];
  if (s.producer === 'regimes') {
    const { STATIC } = await import('./lib/regimes.mjs');
    const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
    for (const o of STATIC.filter((x) => (x.group === 'DO' || x.group === 'LS') && x.name !== 'stella')) {
      const files = o.files(); if (!files.length) continue;
      const series = SRC.chain(files), want = { ...NEAR, ...WEAK }[o.name];
      if (series.norad !== want) throw new Error(`${o.name}: NORAD ${series.norad}, fixed ${want}`);
      const t = series.lines.map((l) => msOf(l.epoch));
      objects.push({ norad: series.norad, name: series.name || o.name, cutoffs: o.cutoffs, read: (a, b) => series.lines.filter((_, i) => t[i] >= a && t[i] <= b) });
    }
  } else {
    const all = s.producer === 'xp2' ? Object.keys(X.config.spans).flatMap((sp) => X.windows(sp)).map((w) => w.o) : XM.config.groups[s.group].objects;
    const byNorad = new Map(all.map((o) => [o.norad, o]));
    const cuts = new Map();
    if (s.cutoffsFrom) for (const r of rowsIn(s.cutoffsFrom)) (cuts.get(r.norad) ?? cuts.set(r.norad, []).get(r.norad)).push(Date.parse(r.cutoff));
    else for (const o of XM.config.groups[s.group].objects) cuts.set(o.norad, XM.daysOf(s.from, s.to));
    for (const [norad, c] of cuts) { const o = byNorad.get(norad); objects.push({ norad, name: o.name, cutoffs: c, read: (a, b) => { const out = []; for (let t = a; t < b; t += DAY) out.push(...T.series(o, t, Math.min(t + DAY, b) - 1).lines); return out; } }); }
  }
  fs.mkdirSync(path.join(OUT, 'steps'), { recursive: true });
  for (const o of objects) {
    const file = path.join(OUT, 'steps', `${set}-${o.norad}.json`);
    if (fs.existsSync(file)) continue;
    let from = Math.min(...o.cutoffs) - 72 * HOUR - STEP_MARGIN_DAYS * DAY, to = Math.max(...o.cutoffs) + 7 * DAY + STEP_MARGIN_DAYS * DAY;
    if (C2_OBJECTS.includes(o.norad)) to = Math.min(to, C2_TRUTH_END);
    if (SWARM_GRACE.includes(o.norad)) to = Math.min(to, SWARM_GRACE_LAST);
    const t0 = Date.now(), lines = o.read(from, to);
    const revs = await revolutions(lines, el), d = lowSteps(revs, rule);
    fs.writeFileSync(file, `${JSON.stringify({ set, norad: o.norad, name: o.name, from: new Date(from).toISOString(), to: new Date(to).toISOString(), states: lines.length, revolutions: revs.length, rule,
      steps: d.steps.map((x) => ({ t: new Date(x.t).toISOString(), sizeM: x.sizeM, changeM: x.changeM })), checked: d.checked.map(([a, b]) => [new Date(a).toISOString(), new Date(b).toISOString()]) })}\n`);
    console.error(`${set} ${o.name}: ${lines.length} states, ${revs.length} revolutions, ${d.steps.length} steps (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  await el.close?.();
  process.exit(0);
}
/** The catalog of one object: steps (ms, shifted 2 h earlier) and checked spans (ms), every set that read it merged. */
let CATALOG = null;
function catalog() {
  if (CATALOG) return CATALOG;
  CATALOG = new Map();
  const dir = path.join(OUT, 'steps');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.json')) : []) {
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), e = CATALOG.get(c.norad) ?? { steps: [], checked: [] };
    e.steps.push(...c.steps.map((x) => msOf(x.t) - STEP_SHIFT_MS)); e.checked.push(...c.checked.map(([a, b]) => [msOf(a), msOf(b)]));
    CATALOG.set(c.norad, e);
  }
  for (const e of CATALOG.values()) { e.steps.sort((a, b) => a - b); e.checked.sort((a, b) => a[0] - b[0]); }
  return CATALOG;
}
/** True when [a, b] holds no step and is covered by checked spans (gaps of 2 h or less). */
function clean(norad, a, b) {
  const e = catalog().get(norad);
  if (!e) return false;
  if (e.steps.some((t) => t >= a && t <= b)) return false;
  let at = a;
  for (const [x, y] of e.checked) { if (y < at) continue; if (x > at + UNCHECKED_GAP_MS) return false; at = Math.max(at, y); if (at >= b - UNCHECKED_GAP_MS) return true; }
  return at >= b - UNCHECKED_GAP_MS;
}
const ARC_HOURS = { AP24: 24, APRa12: 17, AP72: 72 };
// Amendment 4: the catalog censors the propulsive objects near 700 km only (Sentinel-1A, 1C; the DO altimetry satellites)
const PROPULSIVE = new Set([39634, 62261, 36508, 39086, 41335, 43437, 41240, 46984, 66514, 54754, 46469, 48621]);
// the cells each regime scores (amendment 4: Sentinel-1 at days 1 and 3)
const CELLS_OF = { S1: [24, 72], H2b: [24, 72] };
const cellsOf = (regime) => CELLS_OF[regime] ?? CELLS;
const MIN_N = 30;
/** Amendment 3's rule on one arm's samples: null if the fit arc is not clean, else the leads whose (cutoff, lead] is clean. */
function censor(arm) {
  if (process.env.COVM_UNCENSORED === '1' || !PROPULSIVE.has(arm.norad)) return arm;
  const c = Date.parse(arm.cutoff);
  if (!clean(arm.norad, c - ARC_HOURS[arm.arm] * HOUR, c)) return null;
  const leads = arm.leads.filter((l) => clean(arm.norad, c, c + l.h * HOUR + (l.offsetS ?? 0) * 1000));
  return leads.length ? { ...arm, leads } : null;
}

/** Amendment 3's validation and losses, before the catalog is used: OUT/censor-report.json. */
function censorReport() {
  const cat = catalog(), files = fs.readdirSync(path.join(OUT, 'steps')).filter((n) => n.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(OUT, 'steps', f), 'utf8')));
  const raw = new Map(); // unshifted steps per norad
  for (const c of files) for (const x of c.steps) (raw.get(c.norad) ?? raw.set(c.norad, []).get(c.norad)).push(msOf(x.t));
  const day7 = JSON.parse(execFileSync('git', ['-C', repo, 'show', 'origin/main:results/operator-theory/s1-24h-day7/table.json'], { maxBuffer: 1 << 28 }));
  const known = new Map(), quiet = [];
  for (const w of day7.perWindow) {
    const [, norad, date] = w.key.split('|'), c = Date.parse(`${date}T00:00:00Z`);
    if (!w.truth.steps4m.length && Math.abs(w.arms?.F24?.jump?.sizeM ?? 99) <= 0.22) quiet.push({ key: w.key, norad: Number(norad), from: c - 24 * HOUR, to: c + 7 * DAY });
    for (const x of w.truth.steps4m) { const t = c + x.hours * HOUR, l = known.get(Number(norad)) ?? known.set(Number(norad), []).get(Number(norad)); if (!l.some((u) => Math.abs(u - t) < 3 * HOUR)) l.push(t); }
  }
  const recall = [...known].map(([norad, ts]) => ({ norad, known: ts.length, found: ts.filter((t) => (raw.get(norad) ?? []).some((u) => Math.abs(u - t) <= 3 * HOUR)).length,
    missed: ts.filter((t) => !(raw.get(norad) ?? []).some((u) => Math.abs(u - t) <= 3 * HOUR)).map((t) => new Date(t).toISOString()) }));
  const quietAlarms = quiet.map((q) => ({ key: q.key, steps: (raw.get(q.norad) ?? []).filter((t) => t >= q.from && t <= q.to).map((t) => new Date(t).toISOString()), checked: clean(q.norad, q.from, q.to) || (raw.get(q.norad) ?? []).some((t) => t >= q.from && t <= q.to) }));
  const checkedDays = (c) => c.checked.reduce((sum, [a, b]) => sum + (msOf(b) - msOf(a)) / DAY, 0);
  const perObject = files.map((c) => ({ set: c.set, norad: c.norad, name: c.name, from: c.from, to: c.to, states: c.states, steps: c.steps.length, checkedDays: +checkedDays(c).toFixed(1), stepsPer30Days: +(c.steps.length / checkedDays(c) * 30).toFixed(2),
    passive: [16908, 7646, 27944, 25398, 38077].includes(c.norad) }));
  const passive = perObject.filter((o) => o.passive), falsePassive = { steps: passive.reduce((a, o) => a + o.steps, 0), days: +passive.reduce((a, o) => a + o.checkedDays, 0).toFixed(1) };
  // losses: training from the rows; held-out from the window definitions (every cutoff and arm; producer coverage failures not yet known)
  const tally = (list) => {
    const out = {};
    for (const x of list) { const k = `${x.regime}|${x.block ?? ''}|${x.name}`; const e = out[k] ??= { regime: x.regime, block: x.block ?? null, name: x.name, arms: 0, armsDropped: 0, leads: 0, leadsKept: 0 };
      e.arms += 1; if (!x.arcClean) e.armsDropped += 1; e.leads += x.leads; e.leadsKept += x.kept; }
    return Object.values(out);
  };
  const train = [], cells = {};
  const cell = (regime, block, h, ok) => { const k = `${regime}|${block ?? 'all'}|${h}`; const e = cells[k] ??= { regime, block, h, before: 0, after: 0 }; e.before += 1; if (ok) e.after += 1; };
  for (const set of TRAIN_SETS) for (const r of rowsIn(path.join(OUT, set))) for (const [arm, a] of Object.entries(r.arms ?? {})) {
    if (!a.ok || !a.leads?.length) continue;
    const c = Date.parse(r.cutoff), arcClean = clean(r.norad, c - ARC_HOURS[arm] * HOUR, c), regime = SETS[set].regime, block = blockOf(regime, r.cutoff.slice(0, 10));
    const kept = a.leads.filter((l) => l.h <= HOURS && arcClean && clean(r.norad, c, c + l.h * HOUR + (l.offsetS ?? 0) * 1000));
    train.push({ regime, block, name: r.name, arcClean, leads: a.leads.filter((l) => l.h <= HOURS).length, kept: kept.length });
    for (const h of CELLS) if (a.leads.some((l) => l.h === h)) { cell(regime, block, h, kept.some((l) => l.h === h)); cell(regime, null, h, kept.some((l) => l.h === h)); }
  }
  const held = [];
  const heldDefs = [];
  for (const o of [39452, 39451, 39453, 43476, 43477]) for (const t of daysOf('2026-01-01', '2026-05-31')) heldDefs.push({ regime: 'H1', norad: o, cutoff: t, arms: ['AP72', 'AP24'] });
  for (const o of [39634, 62261]) for (const t of daysOf('2025-10-04', '2025-12-21')) heldDefs.push({ regime: 'H2b', norad: o, cutoff: t, arms: ['AP72', 'AP24'] });
  const every5 = []; for (let t = Date.parse('2025-10-10T00:00:00Z'); t <= Date.parse('2025-12-21T00:00:00Z'); t += 5 * DAY) every5.push(t);
  for (const [name, norad] of Object.entries({ ...NEAR, ...WEAK })) for (const t of every5) heldDefs.push({ regime: regimeOfDols(name), norad, cutoff: t, arms: ['AP24', 'AP72'] });
  const nameOf = new Map(files.map((c) => [c.norad, c.name]));
  for (const w of heldDefs) for (const arm of w.arms) {
    const arcClean = clean(w.norad, w.cutoff - ARC_HOURS[arm] * HOUR, w.cutoff);
    let kept = 0; for (let h = 1; h <= HOURS; h += 1) if (arcClean && clean(w.norad, w.cutoff, w.cutoff + h * HOUR)) kept += 1;
    held.push({ regime: w.regime, name: nameOf.get(w.norad) ?? String(w.norad), arcClean, leads: HOURS, kept });
    for (const h of CELLS) cell(w.regime, null, h, arcClean && clean(w.norad, w.cutoff, w.cutoff + h * HOUR));
  }
  const out = { createdUtc: new Date().toISOString(), rule: { minM: STEP_RULE_M, shiftHours: STEP_SHIFT_MS / HOUR, uncheckedGapHours: UNCHECKED_GAP_MS / HOUR },
    validation: { recall, recallTotal: { known: recall.reduce((a, r) => a + r.known, 0), found: recall.reduce((a, r) => a + r.found, 0) }, quietWindows: quietAlarms, passiveSpheres: { ...falsePassive, perDay: +(falsePassive.steps / falsePassive.days).toFixed(4) } },
    perObject, losses: { training: tally(train), heldOut: tally(held) }, cells: Object.values(cells), under30: Object.values(cells).filter((c) => c.after < 30) };
  fs.writeFileSync(path.join(OUT, 'censor-report.json'), `${JSON.stringify(out, null, 1)}\n`);
  return out;
}
function daysOf(a, b) { const out = []; for (let t = Date.parse(`${a}T00:00:00Z`); t <= Date.parse(`${b}T00:00:00Z`); t += DAY) out.push(t); return out; }

// =====================================================================================================================================
// Samples: per window-arm and lead, the error and each term's variance contribution, as the identity of section 2 needs them.
// Training rows (0.6.0, 10 digits, diagonal only); held-out rows (0.6.1, 17 digits, full RIC block).
const N0 = 1e-6; // nu_0, 1/day
/** One arm's samples: per lead { h, d (days from the fit's end), e[3], off[6], F[6] (the row's floor), dk: {e,i,l,d}[6] }, with its row sizes. */
function armSamples(row, armName, a, full) {
  const cp = a.covPropagation, stop = msOf(a.fitStop), cut = Date.parse(row.cutoff);
  const F = [cp.FLOOR_UU_KM2, cp.FLOOR_VU_KM2, cp.FLOOR_VV_KM2, cp.FLOOR_WU_KM2, cp.FLOOR_WV_KM2, cp.FLOOR_WW_KM2];
  const leads = a.leads.filter((l) => l.h <= HOURS).map((l) => {
    const d = (cut + l.h * HOUR + (l.offsetS ?? 0) * 1000 - stop) / DAY;
    if (full) {
      const p = l.p, diff = Object.fromEntries(TERMS.map((t) => [t, p.full.map((x, j) => x - p[t][j])]));
      return { h: l.h, offsetS: l.offsetS ?? 0, d, e: l.e, full: p.full, off: p.off, dk: diff, d2: l.d2 };
    }
    // diagonal rows: indices 0, 2, 5 of the block
    const blk = (v) => [v[0], 0, v[1], 0, 0, v[2]];
    const diff = Object.fromEntries(TERMS.map((t) => [t, blk(l.v.full.map((x, j) => x - l.v[t][j]))]));
    return { h: l.h, d, e: l.e, full: blk(l.v.full), off: blk(l.v.off), dk: diff };
  });
  return { key: row.key, arm: armName, norad: row.norad, name: row.name, cutoff: row.cutoff, nu: Math.abs(cp.NON_GRAVITATIONAL_RATE_PER_DAY), L: cp.NOISE_START_MINUTES / 1440,
    size: { e: cp.NOISE_ECCENTRICITY_PER_DAY, i: cp.NOISE_INCLINATION_PER_DAY, l: cp.NOISE_MEAN_MOTION_RELATIVE, d: cp.NOISE_NON_GRAVITATIONAL_RAD_DAY2, c: cp.NON_GRAVITATIONAL_SHARE },
    F, kRow: full ? K_F_061 : 1, digits: full ? 17 : 10, leads };
}

function trainingArms() {
  const out = [];
  for (const set of TRAIN_SETS) for (const r of rowsIn(path.join(OUT, set))) {
    const bar = barred(r.norad, Date.parse(r.cutoff), r.name);
    if (bar) throw new Error(`training ${r.key}: ${bar}`);
    for (const [arm, a] of Object.entries(r.arms ?? {})) {
      if (!a.ok || !a.leads?.length || !a.covPropagation) continue;
      const s = censor(armSamples(r, arm, a, true));
      if (!s) continue;
      s.regime = r.regime; s.block = blockOf(r.regime, r.cutoff.slice(0, 10)); s.date = r.cutoff.slice(0, 10);
      out.push(s);
    }
  }
  return out;
}
function heldOutArms() {
  const out = [];
  for (const set of HELD_SETS) for (const r of rowsIn(path.join(OUT, set))) {
    const bar = barred(r.norad, Date.parse(r.cutoff), r.name);
    if (bar) throw new Error(`held-out ${r.key}: ${bar}`);
    const regime = set === 'dols' ? regimeOfDols(Object.entries({ ...NEAR, ...WEAK }).find(([, n]) => n === r.norad)?.[0]) : SETS[set].regime;
    for (const [arm, a] of Object.entries(r.arms ?? {})) {
      if (!a.ok || !a.leads?.length || !a.covPropagation) continue;
      const s = censor(armSamples(r, arm, a, true));
      if (!s) continue;
      s.regime = regime; s.set = set; s.date = r.cutoff.slice(0, 10);
      out.push(s);
    }
  }
  return out;
}

// ---- forms (section 2): each a parameter list and, per window, the sizes; per lead, the time factors
// Parameter kinds: 'log' (positive, solved in ln), 'real'. Neutral values and the registered start offsets (section 4).
const P = {
  s_e: { kind: 'log', neutral: ROW_061.s_e }, s_i: { kind: 'log', neutral: ROW_061.s_i }, s_l: { kind: 'log', neutral: ROW_061.s_l }, c: { kind: 'log', neutral: ROW_061.c },
  k_F: { kind: 'log', neutral: K_F_061 },
  k_U: { kind: 'log', neutral: K_F_061, offsets: [K_F_061 * 3, K_F_061 * 10, K_F_061 / 3] }, k_V: { kind: 'log', neutral: K_F_061, offsets: [K_F_061 * 3, K_F_061 * 10, K_F_061 / 3] },
  k_W: { kind: 'log', neutral: K_F_061, offsets: [K_F_061 * 3, K_F_061 * 10, K_F_061 / 3] },
  c_i: { kind: 'log', neutral: 1e-12, offsets: [0.01, 0.1, 1] }, q_i: { kind: 'real', neutral: 0, offsets: [0.25, 0.5, 1] },
  p_l: { kind: 'real', neutral: 1, offsets: [1.25, 1.5, 2] }, m: { kind: 'real', neutral: 0, offsets: [0.5, 1, 1.5] },
  inv_tau: { kind: 'log', neutral: 1e-4, offsets: [0.1, 0.3, 1] }, s_a: { kind: 'log', neutral: 1e-12, offsets: [1e-6, 1e-5, 1e-4] },
  q_d: { kind: 'real', neutral: 0, offsets: [-0.5, -1, 0.5] },
  // the second row of S (perigee below 600 km: the strong-drag windows)
  s_e2: { kind: 'log', neutral: ROW_061.s_e, offsets: [ROW_061.s_e * 10, ROW_061.s_e / 10, ROW_061.s_e * 100] },
  s_i2: { kind: 'log', neutral: ROW_061.s_i, offsets: [ROW_061.s_i * 3, ROW_061.s_i / 3, ROW_061.s_i * 10] },
  s_l2: { kind: 'log', neutral: ROW_061.s_l, offsets: [ROW_061.s_l * 3, ROW_061.s_l / 3, ROW_061.s_l * 10] },
  c2: { kind: 'log', neutral: ROW_061.c, offsets: [ROW_061.c * 3, ROW_061.c / 3, ROW_061.c * 10] },
  k_F2: { kind: 'log', neutral: K_F_061, offsets: [K_F_061 * 3, K_F_061 / 3, K_F_061 * 10] },
};
const M0 = ['s_e', 's_i', 's_l', 'c', 'k_F'], M0X3 = ['s_e', 's_i', 's_l', 'c', 'k_U', 'k_V', 'k_W'];
const FORMS = [
  { id: 'F0', params: M0, flight: false },
  { id: 'F1', params: [...M0, 'q_i'], flight: false },
  { id: 'F2', params: [...M0, 'c_i'], flight: false },
  { id: 'F3', params: M0X3, flight: false },
  { id: 'F4', params: [...M0X3, 'q_i'], flight: false },
  { id: 'F5', params: [...M0X3, 'q_i', 'm'], flight: false },
  { id: 'F6', params: [...M0X3, 'q_i', 'q_d'], flight: 'where unresolved' },
  { id: 'F7', params: [...M0X3, 'q_i', 's_a'], flight: 'near 700 km and weak drag' },
  { id: 'F8', params: [...M0X3, 'q_i', 'p_l'], flight: false, recordField: 'p_l' },
  { id: 'F9', params: [...M0X3, 'q_i', 'inv_tau'], flight: false, recordField: 'tau' },
  { id: 'F10', params: [...M0X3, 'q_i', 'p_l', 'inv_tau'], flight: false, recordField: 'p_l, tau' },
  { id: 'F11', params: [...M0X3, 'q_i', 'm', 's_a'], flight: 'near 700 km and weak drag' },
  { id: 'F12', params: [...M0, 's_e2', 's_i2', 's_l2', 'c2', 'k_F2'], flight: false },
];
const formOf = (id) => FORMS.find((f) => f.id === id);
const STRONG = new Set(['T', 'H1']); // S's second row: perigee below 600 km (every T and P window; none of S1, H2, H3)

/** The form's sizes and floor scales for one arm (a per-window constant) and its per-lead factors on the l and d columns. */
function sizesOf(form, x, arm) {
  const two = form.params.includes('s_e2') && STRONG.has(arm.regime);
  const g = (k, k2) => (two ? x[k2] : x[k]);
  const nuRel = Math.max(arm.nu, 1e-30) / N0;
  let s_i = g('s_i', 's_i2');
  if ('q_i' in x) s_i *= nuRel ** x.q_i;
  if ('c_i' in x) s_i += x.c_i * arm.nu;
  let s_l = g('s_l', 's_l2');
  if ('m' in x) s_l *= arm.L ** -x.m;
  let c = g('c', 'c2');
  if ('q_d' in x) c *= nuRel ** x.q_d;
  // the n-dot size: c |nu| n, from the row's own s_d / c_row (the module's invariant), with T4's absolute part
  const sdRel = arm.size.c > 0 ? (c / arm.size.c) * arm.size.d : 0;
  const s_d = 's_a' in x ? Math.hypot(sdRel, x.s_a) : sdRel;
  const rho = { e: (g('s_e', 's_e2') / arm.size.e) ** 2, i: (s_i / arm.size.i) ** 2, l: (s_l / arm.size.l) ** 2, d: arm.size.d > 0 ? (s_d / arm.size.d) ** 2 : 0 };
  const k = 'k_U' in x ? [x.k_U, x.k_V, x.k_W] : [g('k_F', 'k_F2'), g('k_F', 'k_F2'), g('k_F', 'k_F2')];
  const kb = [k[0], Math.sqrt(k[0] * k[1]), k[1], Math.sqrt(k[0] * k[2]), Math.sqrt(k[1] * k[2]), k[2]].map((v) => v / arm.kRow - 1);
  return { rho, kb, p_l: x.p_l ?? 1, inv_tau: x.inv_tau ?? 0 };
}
/** Re-weighted block (6) at one lead and its precision bound (the sum over terms of rho x 10^-(digits-1) x |full| per diagonal). */
function blockAt(arm, z, lead, out, bound = true) {
  const fl = Math.max(lead.d, 1e-9);
  const fac = { e: 1, i: 1, l: z.p_l === 1 ? 1 : fl ** (2 * (z.p_l - 1)), d: (1 + lead.d * z.inv_tau) ** 2 };
  for (let j = 0; j < 6; j += 1) {
    let v = lead.off[j] + z.kb[j] * arm.F[j];
    for (const t of TERMS) v += z.rho[t] * fac[t] * lead.dk[t][j];
    out[j] = v;
  }
  if (!bound) return 0;
  const q = 10 ** -(arm.digits - 1);
  let worst = 0;
  for (const [j, a] of [[0, 0], [2, 1], [5, 2]]) {
    let b = 0;
    for (const t of TERMS) b += z.rho[t] * fac[t] * q * Math.abs(lead.full[j]);
    worst = Math.max(worst, b / Math.abs(out[j]));
    void a;
  }
  return worst;
}

// ---- the evaluator: samples flattened per regime and lead hour; median |z| per axis by quickselect
function quickMedian(a, n) {
  const sel = (k) => { let lo = 0, hi = n - 1; while (lo < hi) { const p = a[(lo + hi) >> 1]; let i = lo, j = hi; while (i <= j) { while (a[i] < p) i++; while (a[j] > p) j--; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } } if (k <= j) hi = j; else if (k >= i) lo = i; else return a[k]; } return a[k]; };
  if (n === 0) return NaN;
  if (n % 2) return sel((n - 1) >> 1);
  const hi = sel(n >> 1);
  let lo = -Infinity; for (let i = 0; i < (n >> 1); i++) if (a[i] > lo) lo = a[i];
  return (lo + hi) / 2;
}
/** Statistics of a form at x over `arms`, per regime and lead hour in `hours`: median |z|, shares within 1 and 2 sigma per axis; 3D (full block where held). */
function evaluate(form, x, arms, hours, { threeD = false, precision = false } = {}) {
  const hs = new Set(hours), groups = new Map(), blk = new Float64Array(6);
  let flagged = 0, worstBound = 0;
  for (const arm of arms) {
    const z = sizesOf(form, x, arm);
    for (const lead of arm.leads) {
      if (!hs.has(lead.h)) continue;
      const bound = blockAt(arm, z, lead, blk);
      if (precision) { worstBound = Math.max(worstBound, bound); if (bound > 1e-3) flagged += 1; }
      const key = `${arm.regime}|${lead.h}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { regime: arm.regime, h: lead.h, z: [[], [], []], d2: [] }));
      const zz = [lead.e[0] / Math.sqrt(blk[0]), lead.e[1] / Math.sqrt(blk[2]), lead.e[2] / Math.sqrt(blk[5])];
      for (let a = 0; a < 3; a++) g.z[a].push(Math.abs(zz[a]));
      if (threeD) g.d2.push(arm.digits === 17 ? d2Of(blk, lead.e) : zz[0] ** 2 + zz[1] ** 2 + zz[2] ** 2);
    }
  }
  const cells = [];
  for (const g of groups.values()) {
    const axes = g.z.map((v) => { const n = v.length, f = Float64Array.from(v); return { n, medianAbsZ: quickMedian(f, n), within1: v.filter((q) => q <= 1).length / n, within2: v.filter((q) => q <= 2).length / n }; });
    const c = { regime: g.regime, h: g.h, n: g.z[0].length, axes };
    if (threeD) c.threeD = { meanD2Over3: g.d2.reduce((s, q) => s + q, 0) / g.d2.length / 3, inside95: g.d2.filter((q) => q <= CHI2_3_95).length / g.d2.length };
    cells.push(c);
  }
  return { cells, flagged, worstBound };
}
function d2Of(b, e) {
  const [a, bb, c, d, f, g] = [b[0], b[1], b[2], b[3], b[4], b[5]]; // RR, TR, TT, NR, NT, NN
  const m = [[a, bb, d], [bb, c, f], [d, f, g]];
  const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const inv = [[m[1][1] * m[2][2] - m[1][2] * m[2][1], m[0][2] * m[2][1] - m[0][1] * m[2][2], m[0][1] * m[1][2] - m[0][2] * m[1][1]],
    [m[1][2] * m[2][0] - m[1][0] * m[2][2], m[0][0] * m[2][2] - m[0][2] * m[2][0], m[0][2] * m[1][0] - m[0][0] * m[1][2]],
    [m[1][0] * m[2][1] - m[1][1] * m[2][0], m[0][1] * m[2][0] - m[0][0] * m[2][1], m[0][0] * m[1][1] - m[0][1] * m[1][0]]].map((r) => r.map((v) => v / det));
  let s = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += e[i] * inv[i][j] * e[j];
  return s;
}

// ---- the loss (section 4): per regime the mean over R, I, C and lead hours 1 to 167 of ln^2(median |z| / 0.674), the regimes averaged.
// Fast path: per regime and lead, preallocated buffers.
function lossFn(form, arms) {
  const regimes = [...new Set(arms.map((a) => a.regime))].sort();
  let n = 0;
  for (const arm of arms) n += arm.leads.length;
  // flat samples: e (3), off diagonal (3), floor diagonal (3), term differences e, i, l, d on the diagonal (12), d (days); the arm and the group
  const W = 22, D = new Float64Array(n * W), armOf = new Int32Array(n), groupOf = new Int32Array(n), count = new Int32Array(regimes.length * HOURS);
  let i = 0;
  arms.forEach((arm, k) => {
    const ri = regimes.indexOf(arm.regime);
    for (const l of arm.leads) {
      const o = i * W, diag = [0, 2, 5];
      for (let a = 0; a < 3; a++) { const j = diag[a]; D[o + a] = Math.abs(l.e[a]); D[o + 3 + a] = l.off[j]; D[o + 6 + a] = arm.F[j]; TERMS.forEach((t, q) => { D[o + 9 + q * 3 + a] = l.dk[t][j]; }); }
      D[o + 21] = Math.max(l.d, 1e-9);
      armOf[i] = k; groupOf[i] = ri * HOURS + l.h - 1; count[groupOf[i]] += 1; i += 1;
    }
  });
  const offsets = new Int32Array(count.length + 1);
  for (let g = 0; g < count.length; g++) offsets[g + 1] = offsets[g] + count[g];
  const Z = [new Float64Array(n), new Float64Array(n), new Float64Array(n)], fill = new Int32Array(count.length);
  const A = new Float64Array(arms.length * 9); // per arm: rho e, i, l, d; kb diagonal (3); p_l; inv_tau
  return (x) => {
    for (let k = 0; k < arms.length; k++) { const z = sizesOf(form, x, arms[k]), o = k * 9; A[o] = z.rho.e; A[o + 1] = z.rho.i; A[o + 2] = z.rho.l; A[o + 3] = z.rho.d; A[o + 4] = z.kb[0]; A[o + 5] = z.kb[2]; A[o + 6] = z.kb[5]; A[o + 7] = z.p_l; A[o + 8] = z.inv_tau; }
    fill.fill(0);
    for (let s = 0; s < n; s++) {
      const o = s * W, a9 = armOf[s] * 9, dd = D[o + 21];
      const fl = A[a9 + 7] === 1 ? 1 : dd ** (2 * (A[a9 + 7] - 1)), ft = (1 + dd * A[a9 + 8]) ** 2;
      const g = groupOf[s], at = offsets[g] + fill[g]++;
      for (let a = 0; a < 3; a++) {
        const v = D[o + 3 + a] + A[a9 + 4 + a] * D[o + 6 + a] + A[a9] * D[o + 9 + a] + A[a9 + 1] * D[o + 12 + a] + A[a9 + 2] * fl * D[o + 15 + a] + A[a9 + 3] * ft * D[o + 18 + a];
        Z[a][at] = D[o + a] / Math.sqrt(v);
      }
    }
    let total = 0;
    for (let r = 0; r < regimes.length; r++) {
      let sum = 0, m = 0;
      for (let h = 0; h < HOURS; h++) {
        const g = r * HOURS + h; if (count[g] < MIN_N) continue;
        for (let a = 0; a < 3; a++) { const med = quickMedian(Z[a].subarray(offsets[g], offsets[g + 1]), count[g]); const q = Math.log(med / HALF_NORMAL_MEDIAN); sum += Number.isFinite(q) ? q * q : 1e6; m += 1; }
      }
      total += sum / m;
    }
    return total / regimes.length;
  };
}

// ---- Nelder-Mead on the encoded parameters (section 4: steps ln 10 on logs, 0.25 on q, p_l, m; 4,000 evaluations at most)
const encode = (form, x) => form.params.map((p) => (P[p].kind === 'log' ? Math.log(x[p]) : x[p]));
const decode = (form, u) => Object.fromEntries(form.params.map((p, i) => [p, P[p].kind === 'log' ? Math.exp(u[i]) : u[i]]));
function nelderMead(f, x0, steps, maxEval = 4000) {
  const n = x0.length, simplex = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; simplex.push(x); }
  let vals = simplex.map(f), evals = n + 1;
  while (evals < maxEval) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    const S = order.map((i) => simplex[i]), V = order.map((i) => vals[i]);
    for (let i = 0; i <= n; i++) { simplex[i] = S[i]; vals[i] = V[i]; }
    if (Math.abs(vals[n] - vals[0]) <= 1e-12 * (Math.abs(vals[0]) + 1e-12) && Math.max(...simplex.slice(1).map((s) => Math.max(...s.map((q, j) => Math.abs(q - simplex[0][j]))))) < 1e-9) break;
    const c = Array.from({ length: n }, (_, j) => simplex.slice(0, n).reduce((s, x) => s + x[j], 0) / n);
    const at = (t) => c.map((cj, j) => cj + t * (simplex[n][j] - cj));
    const xr = at(-1), fr = f(xr); evals++;
    if (fr < vals[0]) { const xe = at(-2), fe = f(xe); evals++; if (fe < fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; } }
    else if (fr < vals[n - 1]) { simplex[n] = xr; vals[n] = fr; }
    else {
      const xc = fr < vals[n] ? at(-0.5) : at(0.5), fc = f(xc); evals++;
      if (fc < Math.min(fr, vals[n])) { simplex[n] = xc; vals[n] = fc; }
      else { for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((q, j) => simplex[0][j] + 0.5 * (q - simplex[0][j])); vals[i] = f(simplex[i]); evals++; } }
    }
  }
  const best = vals.indexOf(Math.min(...vals));
  return { u: simplex[best], loss: vals[best], evals };
}
/** The registered starts: every parameter neutral (M0 at the 0.6.1 row), then three offsets per added parameter, the others neutral. */
function startsOf(form) {
  const neutral = Object.fromEntries(form.params.map((p) => [p, P[p].neutral]));
  const out = [{ label: 'neutral (0.6.1 row)', x: neutral }];
  for (const p of form.params) if (!M0.includes(p) && P[p].offsets) for (const o of P[p].offsets) out.push({ label: `${p} ${o}`, x: { ...neutral, [p]: o } });
  return out;
}
function fitForm(form, arms) {
  const L = lossFn(form, arms), steps = form.params.map((p) => (P[p].kind === 'log' ? Math.log(10) : 0.25));
  const runs = startsOf(form).map((s) => { const r = nelderMead((u) => L(decode(form, u)), encode(form, s.x), steps); return { start: s.label, loss: r.loss, evals: r.evals, x: decode(form, r.u) }; });
  const best = runs.reduce((a, b) => (b.loss < a.loss ? b : a));
  return { x: best.x, loss: best.loss, runs: runs.map((r) => ({ start: r.start, loss: r.loss, evals: r.evals })) };
}
const inBand = (q) => q >= BAND[0] && q <= BAND[1];
function verdict(cells, regimes) {
  const out = [];
  for (const c of cells) if (regimes.includes(c.regime) && cellsOf(c.regime).includes(c.h)) c.axes.forEach((a, i) => out.push({ regime: c.regime, h: c.h, axis: AXES[i], n: c.n, medianAbsZ: a.medianAbsZ, within1: a.within1, within2: a.within2,
    decidable: c.n >= MIN_N, pass: c.n >= MIN_N ? inBand(a.medianAbsZ) && a.within2 >= TWO_SIGMA_MIN : null }));
  return out;
}
const passes = (cells) => cells.some((c) => c.decidable) && cells.filter((c) => c.decidable).every((c) => c.pass);

// ---- one fold: the form fitted on the training blocks other than `block` (less the 10-day guard), scored on `block`; `all`: every training row
function foldArms(arms, block) {
  if (block === 'all') return { fit: arms, score: [] };
  const [regime, a, b] = BLOCKS[block], lo = Date.parse(`${a}T00:00:00Z`) - GUARD_DAYS * DAY, hi = Date.parse(`${b}T00:00:00Z`) + GUARD_DAYS * DAY;
  const t = (arm) => Date.parse(`${arm.date}T00:00:00Z`);
  return { fit: arms.filter((x) => x.block !== block && !(x.regime === regime && t(x) >= lo && t(x) <= hi)), score: arms.filter((x) => x.block === block) };
}
function fold(formId, block) {
  const form = formOf(formId), arms = trainingArms(), { fit, score } = foldArms(arms, block);
  const t0 = Date.now(), r = fitForm(form, fit);
  const pre = evaluate(form, r.x, fit, Array.from({ length: HOURS }, (_, i) => i + 1), { precision: true });
  // the loss again from the evaluator's own medians (a check of the fast path)
  const byRegime = {};
  for (const c of pre.cells) if (c.n >= MIN_N) for (const a of c.axes) (byRegime[c.regime] ??= []).push(Math.log(a.medianAbsZ / HALF_NORMAL_MEDIAN) ** 2);
  const lossCheck = Object.values(byRegime).reduce((s, v) => s + v.reduce((p, q) => p + q, 0) / v.length, 0) / Object.keys(byRegime).length;
  const out = { form: formId, block, fitWindows: fit.length, scoreWindows: score.length, x: r.x, loss: r.loss, runs: r.runs, seconds: (Date.now() - t0) / 1000,
    precision: { flagged: pre.flagged, worstBound: pre.worstBound }, lossCheck };
  if (block !== 'all') { const ev = evaluate(form, r.x, score, CELLS); out.cells = verdict(ev.cells, [BLOCKS[block][0]]); out.pass = passes(out.cells); }
  fs.mkdirSync(path.join(OUT, 'fits'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'fits', `${formId}-${block}.json`), `${JSON.stringify(out, null, 1)}\n`);
  console.error(`${formId} ${block}: loss ${r.loss.toPrecision(6)} ${block === 'all' ? '' : out.pass ? 'PASS' : 'fail'} (${out.seconds.toFixed(0)} s; flagged ${pre.flagged})`);
}

async function select() {
  fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true });
  const record = { startedUtc: new Date().toISOString(), commit: git(repo, 'rev-parse', 'HEAD').toString().trim(), order: FORMS.map((f) => f.id), forms: [] };
  const fitFile = (f, b) => path.join(OUT, 'fits', `${f}-${b}.json`);
  for (const form of FORMS) {
    const jobs = [...Object.keys(BLOCKS), 'all'].map((b) => ({ f: form.id, b })).filter((j) => !fs.existsSync(fitFile(j.f, j.b)));
    const failed = await pool(jobs, (j) => ['--fold', j.f, j.b], (j) => path.join(OUT, 'logs', `fit-${j.f}-${j.b}.log`), (j) => path.join(OUT, 'logs', `fit-${j.f}-${j.b}.done`));
    if (failed.length) throw new Error(failed.join('; '));
    const folds = Object.keys(BLOCKS).map((b) => JSON.parse(fs.readFileSync(fitFile(form.id, b), 'utf8')));
    const flagged = folds.reduce((s, f) => s + f.precision.flagged, 0) + JSON.parse(fs.readFileSync(fitFile(form.id, 'all'), 'utf8')).precision.flagged;
    const pass = folds.every((f) => f.pass) && flagged === 0;
    record.forms.push({ form: form.id, pass, flagged, failingCells: folds.flatMap((f) => f.cells.filter((c) => c.pass === false).map((c) => `${f.block} ${c.axis} ${c.h} h ${c.medianAbsZ.toFixed(3)} / ${c.within2.toFixed(3)}`)),
      notDecidable: folds.flatMap((f) => f.cells.filter((c) => !c.decidable).map((c) => `${f.block} ${c.axis} ${c.h} h n ${c.n}`)) });
    console.error(`${form.id}: ${pass ? 'selected' : 'fails'}${flagged ? ` (${flagged} samples need a flight)` : ''}`);
    if (flagged) { record.stoppedAt = form.id; record.reason = 'samples need a flight; the flight path is the next step'; break; }
    if (pass) { record.selected = form.id; break; }
  }
  record.finishedUtc = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'selection.json'), `${JSON.stringify(record, null, 1)}\n`);
  console.log(record.selected ? `selected ${record.selected}` : `no form selected${record.stoppedAt ? ` (stopped at ${record.stoppedAt})` : ''}`);
}

// ---- held-out: the selected form scored once (manifested before the score is computed); then, as information only, the other fitted forms
function heldout() {
  const sel = JSON.parse(fs.readFileSync(path.join(OUT, 'selection.json'), 'utf8'));
  const arms = heldOutArms(), file = path.join(OUT, 'heldout.json');
  if (fs.existsSync(file)) throw new Error('the held-out score exists; it is computed once');
  const score = (formId) => {
    const fit = JSON.parse(fs.readFileSync(path.join(OUT, 'fits', `${formId}-all.json`), 'utf8'));
    const ev = evaluate(formOf(formId), fit.x, arms, CELLS, { threeD: true, precision: true });
    const cells = verdict(ev.cells, [...REQUIRED, ...NOHARM]);
    return { form: formId, x: fit.x, cells, threeD: ev.cells.map((c) => ({ regime: c.regime, h: c.h, ...c.threeD })), flagged: ev.flagged, worstBound: ev.worstBound };
  };
  const base = (() => { const ev = evaluate({ params: M0 }, ROW_061, arms, CELLS, { threeD: true }); return { cells: verdict(ev.cells, [...REQUIRED, ...NOHARM]), threeD: ev.cells.map((c) => ({ regime: c.regime, h: c.h, ...c.threeD })) }; })();
  const out = { computedUtc: new Date().toISOString(), selected: sel.selected ?? null, windows: Object.fromEntries([...new Set(arms.map((a) => a.regime))].map((r) => [r, arms.filter((a) => a.regime === r).length])), base061: base };
  if (sel.selected) {
    const s = score(sel.selected), req = s.cells.filter((c) => REQUIRED.includes(c.regime));
    const present = REQUIRED.filter((r) => req.some((c) => c.regime === r && c.decidable));
    const noharm = s.cells.filter((c) => NOHARM.includes(c.regime)).map((c) => {
      const b = base.cells.find((q) => q.regime === c.regime && q.h === c.h && q.axis === c.axis);
      return { ...c, base: b?.medianAbsZ, ok: !c.decidable ? null : inBand(c.medianAbsZ) || Math.abs(Math.log(c.medianAbsZ / HALF_NORMAL_MEDIAN)) <= Math.abs(Math.log(b.medianAbsZ / HALF_NORMAL_MEDIAN)) };
    });
    out.score = { ...s, requiredPresent: present, notDecidable: s.cells.filter((c) => !c.decidable).map((c) => `${c.regime} ${c.axis} ${c.h} h n ${c.n}`),
      pass: s.flagged === 0 && present.length > 0 && req.filter((c) => c.decidable).every((c) => c.pass) && noharm.every((c) => c.ok !== false), noharm };
  }
  fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
  // information only, afterwards
  const info = FORMS.filter((f) => f.id !== sel.selected && fs.existsSync(path.join(OUT, 'fits', `${f.id}-all.json`))).map((f) => score(f.id));
  fs.writeFileSync(path.join(OUT, 'heldout-information.json'), `${JSON.stringify({ computedUtc: new Date().toISOString(), note: 'information only, after the selected form was scored', forms: info }, null, 1)}\n`);
  console.log(out.selected ? `held-out ${out.selected}: ${out.score.pass ? 'PASS' : 'FAIL'}` : 'no form was selected; nothing scored as a verdict');
}

// =====================================================================================================================================
// table and README, from the rows and the fits alone
function table(dir) {
  const sel = JSON.parse(fs.readFileSync(path.join(OUT, 'selection.json'), 'utf8'));
  const fits = fs.readdirSync(path.join(OUT, 'fits')).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(OUT, 'fits', f), 'utf8')));
  const held = fs.existsSync(path.join(OUT, 'heldout.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'heldout.json'), 'utf8')) : null;
  const info = fs.existsSync(path.join(OUT, 'heldout-information.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'heldout-information.json'), 'utf8')) : null;
  const manifest = fs.existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : null;
  const t = { study: PLAN, task: 'modules-sdn-ap-covariance-noise-model-20261105', training: TRAIN, heldOutRows: OUT, build: BUILD, blocks: BLOCKS, criterion: { band: BAND, twoSigmaMin: TWO_SIGMA_MIN, leadHours: CELLS },
    forms: FORMS, selection: sel, fits: fits.map((f) => ({ form: f.form, block: f.block, loss: f.loss, x: f.x, pass: f.pass ?? null, cells: f.cells ?? null, precision: f.precision, fitWindows: f.fitWindows, scoreWindows: f.scoreWindows, runs: f.runs })),
    heldOut: held, information: info, manifest };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'table.json'), `${JSON.stringify(t, null, 1)}\n`);
  const L = [];
  const selLine = sel.selected ? `Selected on training (leave-one-block-out): ${sel.selected}.` : `No form passed leave-one-block-out on training${sel.stoppedAt ? ` (stopped at ${sel.stoppedAt}: ${sel.reason})` : ''}; nothing is scored on the held-out set as a verdict and nothing ships.`;
  const heldLine = held?.score ? `Held-out verdict for ${held.selected}: ${held.score.pass ? 'PASS' : 'FAIL'}.` : 'Held-out verdict: none.';
  L.push(`${selLine} ${heldLine}`, '', '# AP DRAG process-noise model (COVARIANCE-MODEL.md)', '');
  L.push('Forms fitted on the coverage study\'s rows (sdn-ap 0.6.0) by re-weighting the module\'s own per-term variances; selected in the registered order by leave-one-block-out on five season blocks (T-a, T-b, T-c, S1-a, S1-b; 10-day guards): every left-out cell (R, I, C at 24, 72, 167 h) median |z| in [0.603, 0.754] and the share within 2 sigma at least 0.90. The selected form alone is scored once on the held-out windows (sdn-ap 0.6.1 flights).', '');
  L.push('## Selection', '', '| Form | Parameters | Folds passed | Failing cells (block axis lead median / 2-sigma share) |', '|---|---:|---:|---|');
  for (const f of sel.forms) L.push(`| ${f.form} | ${formOf(f.form).params.length} | ${fits.filter((q) => q.form === f.form && q.block !== 'all' && q.pass).length} of 5 | ${f.failingCells.slice(0, 8).join('; ')}${f.failingCells.length > 8 ? `; ${f.failingCells.length - 8} more` : ''} |`);
  L.push('', '## Fitted on all training rows', '', '| Form | Loss | Parameters |', '|---|---:|---|');
  for (const f of fits.filter((q) => q.block === 'all')) L.push(`| ${f.form} | ${f.loss.toPrecision(4)} | ${Object.entries(f.x).map(([k, v]) => `${k} ${Number(v).toPrecision(6)}`).join(', ')} |`);
  if (held) {
    L.push('', '## Held-out windows', '', `Window-arms: ${Object.entries(held.windows).map(([r, n]) => `${REGIME[r]} ${n}`).join('; ')}.`, '');
    const show = (title, cells, base) => {
      L.push(`### ${title}`, '', '| Regime | Lead h | n | R | I | C | R within 1, 2 sigma | I within 1, 2 sigma | C within 1, 2 sigma | 0.6.1 R / I / C |', '|---|---:|---:|---:|---:|---:|---|---|---|---|');
      for (const r of [...REQUIRED, ...NOHARM]) for (const h of CELLS) {
        const c = AXES.map((a) => cells.find((q) => q.regime === r && q.h === h && q.axis === a)), b = AXES.map((a) => base.find((q) => q.regime === r && q.h === h && q.axis === a));
        if (!c[0]) continue;
        L.push(`| ${REGIME[r]} | ${h} | ${c[0].n} | ${c.map((q) => fmt(q.medianAbsZ)).join(' | ')} | ${c.map((q) => `${fmt(q.within1)}, ${fmt(q.within2)}`).join(' | ')} | ${b.map((q) => fmt(q?.medianAbsZ)).join(' / ')} |`);
      }
      L.push('');
    };
    if (held.score) show(`${held.selected}, the verdict`, held.score.cells, held.base061.cells);
    for (const f of info?.forms ?? []) show(`${f.form}, information only`, f.cells, held.base061.cells);
  }
  L.push(`Build of the held-out flights: \`propagator/sdn-ap\` ${BUILD.version}, wasm SHA-256 \`${BUILD.wasmSha256}\` at modules \`${BUILD.modulesCommit}\`.${manifest ? ` Rows: \`${OUT}\`, run from this repository at \`${manifest.commit.slice(0, 10)}\`.` : ''}`);
  fs.writeFileSync(path.join(dir, 'README.md'), `${L.join('\n')}\n`);
}

// ---- the end to end
function check() {
  const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
  const reg = git(repo, 'log', '--diff-filter=A', '--format=%H %cI', '--', PLAN).toString().trim().split('\n').at(-1).split(' ');
  const sel = JSON.parse(fs.readFileSync(path.join(OUT, 'selection.json'), 'utf8'));
  ok(Date.parse(reg[1]) < Date.parse(sel.startedUtc), 'the registration does not precede the selection');
  if (fs.existsSync(path.join(OUT, 'manifest.json'))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
    ok(Date.parse(reg[1]) < Date.parse(manifest.startedUtc), 'the registration does not precede the held-out rows');
    ok(manifest.build.wasmSha256 === BUILD.wasmSha256, 'the held-out rows name another build');
  }
  // bars: every row read
  let read = 0;
  for (const dir of [path.join(TRAIN, 'truth'), path.join(TRAIN, 'truth2'), ...Object.keys(SETS).map((s) => path.join(OUT, s))]) for (const r of rowsIn(dir)) {
    read += 1; const b = barred(r.norad, Date.parse(r.cutoff), r.name); ok(!b, `${r.key}: ${b}`);
  }
  // training: the identity at the rows' own sizes reproduces their full variances
  const arms = trainingArms();
  let maxRel = 0;
  for (const arm of arms.slice(0, 400)) {
    const z = { rho: { e: 1, i: 1, l: 1, d: 1 }, kb: [0, 0, 0, 0, 0, 0], p_l: 1, inv_tau: 0 }, blk = new Float64Array(6);
    for (const l of arm.leads) { blockAt(arm, z, l, blk); for (const j of [0, 2, 5]) maxRel = Math.max(maxRel, Math.abs(blk[j] - l.full[j]) / Math.abs(l.full[j])); }
  }
  ok(maxRel <= 1e-6, `the identity reproduces the training rows' full variances within ${maxRel}`);
  ok(arms.every((a) => a.block), 'a training window in no block');
  // held-out control and repack
  const held = heldOutArms();
  const repack = Object.keys(SETS).flatMap((s) => rowsIn(path.join(OUT, s))).flatMap((r) => Object.values(r.arms ?? {})).filter((a) => a.leads);
  ok(repack.every((a) => a.repackEqual === true), 'an unchanged copy did not fly byte-equal');
  const ctl = control();
  ok(ctl.differing === 0, `the control differs on ${ctl.differing} of ${ctl.scalarsCompared} scalars`);
  // results reproduce
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'covariance-model-'));
  table(scratch);
  for (const f of ['table.json', 'README.md']) ok(fs.existsSync(path.join(RESULTS, f)) && fs.readFileSync(path.join(scratch, f), 'utf8') === fs.readFileSync(path.join(RESULTS, f), 'utf8'), `${f} does not reproduce from the rows`);
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`rows read ${read}; training arms ${arms.length}; held-out arms ${held.length}; identity max relative ${maxRel.toExponential(2)}; control ${ctl.scalarsCompared} scalars, ${ctl.differing} differing`);
  console.log(sel.selected ? `selected ${sel.selected}` : `no form selected${sel.stoppedAt ? ` (stopped at ${sel.stoppedAt})` : ''}`);
  if (fs.existsSync(path.join(OUT, 'heldout.json'))) { const h = JSON.parse(fs.readFileSync(path.join(OUT, 'heldout.json'), 'utf8')); if (h.score) console.log(`held-out ${h.selected}: ${h.score.pass ? 'PASS' : 'FAIL'}`); }
  if (fails.length) { console.error(`FAIL\n${fails.join('\n')}`); process.exit(1); }
  console.log('PASS');
}
/** The reproduced fits against the producers' stored rows (P: ap/b051/truth2; DO and LS: ap/b051/regimes): ok, error, bterm, agom, rms and lead days 1, 2, 3, 7. */
function control() {
  const out = { scalarsCompared: 0, differing: 0, differences: [] };
  for (const [set, s] of Object.entries(SETS)) {
    if (!s.control) continue;
    const stored = new Map(rowsIn(path.join(B051, s.control)).map((r) => [r.key, r]));
    for (const r of rowsIn(path.join(OUT, set))) {
      const a = stored.get(r.key);
      for (const arm of s.arms) {
        const x = a?.arms?.[arm], y = r.arms?.[arm];
        if (!x && !y) continue;
        const fields = set === 'dols' ? ['ok', 'rms'] : set === 'trT' ? ['ok', 'bterm', 'agom', 'rms', 'bHeld'] : ['ok', 'bterm', 'agom', 'rms'];
        const cmp = (name, p, q) => { out.scalarsCompared += 1; if (JSON.stringify(p ?? null) !== JSON.stringify(q ?? null)) { out.differing += 1; if (out.differences.length < 20) out.differences.push({ key: r.key, arm, name, stored: p ?? null, flown: q ?? null }); } };
        for (const f of fields) cmp(f, x?.[f], y?.[f]);
        for (const d of ['1', '2', '3', '7']) for (const f of ['e', 'r', 't', 'n']) cmp(`days.${d}.${f}`, x?.days?.[d]?.[f], y?.days?.[d]?.[f]);
      }
    }
  }
  return out;
}

export { catalog, clean, censor, armSamples, rowsIn, STEP_SETS, trainingArms, heldOutArms, sizesOf, blockAt, formOf, evaluate, verdict, BLOCKS, CELLS, OUT };
const main = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (!main) { /* imported: no command */ }
else if (process.argv.includes('--steps')) await steps(argOf('--steps'));
else if (process.argv.includes('--censor-report')) { const r = censorReport(); console.log(JSON.stringify({ validation: r.validation, perObject: r.perObject.map((o) => `${o.set} ${o.name} ${o.steps} steps ${o.checkedDays} d ${o.stepsPer30Days}/30d`), under30: r.under30 }, null, 1)); }
else if (process.argv.includes('--worker')) await worker(argOf('--worker'), Number(argOf('--shard')));
else if (process.argv.includes('--rows')) await rows();
else if (process.argv.includes('--fold')) fold(argOf('--fold'), argOf('--fold', 2));
else if (process.argv.includes('--select')) await select();
else if (process.argv.includes('--heldout')) heldout();
else if (process.argv.includes('--table')) { table(argOf('--out') ?? RESULTS); console.log(`table written to ${argOf('--out') ?? RESULTS}`); }
else if (process.argv.includes('--check')) check();
else { console.error('usage: --rows | --worker <set> --shard k | --select | --fold <form> <block> | --heldout | --table [--out dir] | --check'); process.exit(2); }
