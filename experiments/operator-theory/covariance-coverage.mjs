// COVARIANCE-COVERAGE.md: AP 0.6.0's propagated covariance against its forward error on ap/b051's strong-drag 2025 and near-700 km windows,
// per RIC axis and lead hour 1 to 168; each process-noise term switched off through the record's own COV_PROPAGATION fields; the ISS demo figure.
// Module calls only: every fit, state, covariance and RIC projection is a module's; JavaScript moves records and takes ratios and medians.
//   node experiments/operator-theory/covariance-coverage.mjs --run              every shard of both sets and the ISS figure (resumable), then --table
//   node experiments/operator-theory/covariance-coverage.mjs --worker <set> --shard k
//   node experiments/operator-theory/covariance-coverage.mjs --iss
//   node experiments/operator-theory/covariance-coverage.mjs --table [--out <dir>]
//   node experiments/operator-theory/covariance-coverage.mjs --check            the end to end
// Environment: SDN_MODULES_ROOT the read-only root holding XM's registered installs (space-data-network-modules-r2); SDN_AP_ROOT the read-only
// clone at the registered build's commit (space-data-network-modules-pin), its git and its SDS 1.278.0 bindings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const ARCHIVE = '/opt/data/sdn-archive/operator-theory', STORED = path.join(ARCHIVE, 'ap/b051'), OUT = process.env.COV_OUT ?? path.join(ARCHIVE, 'covariance-coverage');
const RESULTS = path.join(repo, 'results/ap-truth/covariance-coverage'), PLAN = 'experiments/operator-theory/COVARIANCE-COVERAGE.md';
const SHARDS = 12, WORKERS = 4, LOAD_BELOW = 42, HOURS = 168, HOUR = 3600000, DAY = 86400000;
const BUILD = { module: 'propagator/sdn-ap', version: '0.6.0', modulesCommit: '895b6b38de29bc284b4b50a02425a6c3a5fe81a2', wasmSha256: '0b5280f05176fc755dbfb859fd8028fc495759d7537024c53043f498c91faa63' };
const AP_ROOT = process.env.SDN_AP_ROOT ?? '/Users/tj/software/private/coordinator-d9/space-data-network-modules-pin';
// Each set as ap/b051 ran it: producer environment and arguments, the group kept, the arms flown.
const SETS = {
  truth: { regime: 'T', env: {}, from: '2025-04-01', to: '2025-12-21', xm: false, group: null, arms: ['AP24', 'APRa12'] },
  truth2: { regime: 'S1', env: { XP2F_CONTROL: '1' }, from: '2026-01-01', to: '2026-05-31', xm: true, group: 'S1', arms: ['AP72', 'AP24'] },
};
const REGIMES = { T: 'Strong drag, 2025', S1: 'Near 700 km, 2026' };
const TERMS = ['e', 'i', 'l', 'd'], VARIANTS = ['full', ...TERMS, 'off'];
const TERM_NAME = { e: 'eccentricity (s_e)', i: 'inclination (s_i)', l: 'mean longitude (s_l)', d: 'non-gravitational n-dot (s_d)', mapped: 'mapped fit covariance', floor: 'floor' };
const AXES = ['R', 'I', 'C'];
const GALILEO_HELD = [43567, 37847, 41862, 41174, 43055, 41175], SWARM_GRACE = [39451, 39452, 39453, 43476, 43477], SWARM_GRACE_LAST = '2025-12-28T00:00:00.000Z';
const ISS = { repo: '/Users/tj/software/private/coordinator-d9/sdn-ap-siteA', commit: '7e88e3961405ea585ab5a3e1a982677f1107c79a', path: 'docs/assets/demo/nasa-iss-2026-07-13.oem',
  sha256: 'fbda48d1584bee1f38ea562625280ecfe4e6643f67c417e91f2fc245ee48311f', sigmaKm: 37.8, errorKm: 0.308, sigmaTol: 0.05, errorTol: 0.0005 };
const CHI2_3_95 = 7.814727903251178, HALF_NORMAL_MEDIAN = 0.6744897501960817, BAND = [0.603, 0.754];
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rowsIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const med = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const x = (s.length - 1) / 2; return (s[Math.floor(x)] + s[Math.ceil(x)]) / 2; };
const mean = (v) => { const s = v.filter(Number.isFinite); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
const share = (v, f) => { const s = v.filter(Number.isFinite); return s.length ? s.filter(f).length / s.length : null; };
const sig = (x, n = 6) => (x === null || x === undefined ? null : Number(x.toPrecision(n)));
const fmt = (x) => (x === null || x === undefined ? '' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : Math.abs(x) >= 0.01 ? x.toPrecision(3) : x.toExponential(2));
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });

// ---- the registered build's bindings (SDS 1.278.0) and the module
async function apKit() {
  const req = createRequire(path.join(AP_ROOT, 'propagator/sdn-ap/package.json'));
  const standards = path.dirname(req.resolve('spacedatastandards.org/package.json'));
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const [OCM, OEM, PCF] = await Promise.all(['OCM', 'OEM', 'PCF'].map((c) => import(pathToFileURL(path.join(standards, `lib/js/${c}/main.js`)).href)));
  const sds = JSON.parse(fs.readFileSync(path.join(standards, 'package.json'), 'utf8')).version;
  process.env.SDN_MODULES_GIT = AP_ROOT;
  const { standalone } = await import('./lib/ap.mjs');
  const h = await standalone('propagator/sdn-ap', { modulesCommit: BUILD.modulesCommit, wasmSha256: BUILD.wasmSha256 });
  const TYPE = (name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName: name, wireFormat: 'flatbuffer' });
  const prefixed = (u, id) => String.fromCharCode(...u.subarray(8, 12)) === id;
  const pcf = (t) => { const b = new fb.Builder(1 << 12); PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
  const kit = {
    sds,
    /** A flight's $PCF: OUTPUT at explicit epochs in `frame`. */
    flightPcf: (frame, epochs) => { const t = new PCF.PCFT(); t.OUTPUT = Object.assign(new PCF.PCFOutputT(), { FRAME: PCF.pcfOutputFrame[frame], EPOCHS: epochs }); return pcf(t); },
    /** The demo's fit $PCF (tools/demo/abi.mjs fitConfiguration('AP')). */
    demoFitPcf: () => {
      const t = new PCF.PCFT();
      t.THEORY = PCF.pcfTheory.AP;
      t.FORCES = Object.assign(new PCF.PCFForceModelT(), { EPHEMERIS_SOURCE: '', ATMOSPHERE_MODEL: PCF.pcfAtmosphereFamily.JACCHIA70, WEATHER_SOURCE: PCF.pcfWeatherSource.THEORY_FLUX_MODEL,
        MAXIMUM_DEGREE: 20, HAS_MAXIMUM_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: 31, HAS_MAXIMUM_TESSERAL_DEGREE: true });
      return pcf(t);
    },
    async fit(inputs) {
      const r = await h.invoke({ methodId: 'fit', inputs: inputs.map(([portId, name, payload]) => ({ portId, typeRef: TYPE(name), payload })) });
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
      return { ok: true, ocm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) };
    },
    /** propagate: the answer's bytes. */
    async fly(ocm, flightPcf) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: flightPcf }] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      return new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload);
    },
    /** An answer's first block: [{epoch, r, v, cov (21, lower triangle, the block's axes) | null}]. */
    lines(bytes) {
      const u = new Uint8Array(bytes);
      const o = (prefixed(u, '$OEM') ? OEM.OEM.getSizePrefixedRootAsOEM(new fb.ByteBuffer(u)) : OEM.OEM.getRootAsOEM(new fb.ByteBuffer(u))).unpack();
      const block = o.EPHEMERIS_DATA_BLOCK[0], cov = new Map((block.COVARIANCE_MATRIX_LINES ?? []).map((c) => [c.EPOCH, [c.CX_X, c.CY_X, c.CY_Y, c.CZ_X, c.CZ_Y, c.CZ_Z,
        c.CX_DOT_X, c.CX_DOT_Y, c.CX_DOT_Z, c.CX_DOT_X_DOT, c.CY_DOT_X, c.CY_DOT_Y, c.CY_DOT_Z, c.CY_DOT_X_DOT, c.CY_DOT_Y_DOT,
        c.CZ_DOT_X, c.CZ_DOT_Y, c.CZ_DOT_Z, c.CZ_DOT_X_DOT, c.CZ_DOT_Y_DOT, c.CZ_DOT_Z_DOT]]));
      return block.EPHEMERIS_DATA_LINES.map((l) => ({ epoch: l.EPOCH, r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT], cov: cov.get(l.EPOCH) ?? null }));
    },
    /** The record's COV_PROPAGATION and its fit's stop. */
    covPropagation(ocm) {
      const u = new Uint8Array(ocm);
      const o = (prefixed(u, '$OCM') ? OCM.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(u)) : OCM.OCM.getRootAsOCM(new fb.ByteBuffer(u))).unpack();
      const cp = o.COV_PROPAGATION;
      return { cp: cp ? { ...cp } : null, fitStop: o.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_STOP ?? null, bterm: o.MEAN_ELEMENTS?.BTERM, agom: o.MEAN_ELEMENTS?.AGOM };
    },
    /** A copy of the record with COV_PROPAGATION's fields `zero` set to 0 (none: the unchanged repack), by the 1.278.0 object API, prefixed as given. */
    variant(ocm, zero) {
      const u = new Uint8Array(ocm), pre = prefixed(u, '$OCM');
      const o = (pre ? OCM.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(u)) : OCM.OCM.getRootAsOCM(new fb.ByteBuffer(u))).unpack();
      for (const f of zero) o.COV_PROPAGATION[f] = 0;
      const b = new fb.Builder(u.length + 1024);
      if (pre) OCM.OCM.finishSizePrefixedOCMBuffer(b, o.pack(b)); else OCM.OCM.finishOCMBuffer(b, o.pack(b));
      return b.asUint8Array().slice();
    },
    close: async () => h.destroy?.(),
  };
  return kit;
}
// The record fields each variant sets to 0 (SPEC 12.5; s_d with its share, the module's invariant).
const ZERO = {
  full: null, e: ['NOISE_ECCENTRICITY_PER_DAY'], i: ['NOISE_INCLINATION_PER_DAY'], l: ['NOISE_MEAN_MOTION_RELATIVE'],
  d: ['NOISE_NON_GRAVITATIONAL_RAD_DAY2', 'NON_GRAVITATIONAL_SHARE'],
  off: ['NOISE_ECCENTRICITY_PER_DAY', 'NOISE_INCLINATION_PER_DAY', 'NOISE_MEAN_MOTION_RELATIVE', 'NOISE_NON_GRAVITATIONAL_RAD_DAY2', 'NON_GRAVITATIONAL_SHARE'],
};

// ---- analysis/gp-error-model pair_statistics at XM's pin, with the predicted covariance: per pair errorRtn, predictedRtn (RR, TR, TT, NR, NT, NN), zPredicted, d2Predicted.
async function scorer() {
  const XMC = await import('../xp-atmosphere-merit/common.mjs');
  const modules = XMC.modulesRoot();
  const { bytes, manifest } = XMC.pinned(modules, 'analysis/gp-error-model');
  const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(modules, 'analysis/gp-error-model/package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
  const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')).href);
  return {
    wasmSha256: sha256(bytes), modulesCommit: XMC.build.modulesCommit,
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
const sigmaOf = (p) => [Math.sqrt(p.predictedRtn[0]), Math.sqrt(p.predictedRtn[2]), Math.sqrt(p.predictedRtn[5])];
const varOf = (p) => [p.predictedRtn[0], p.predictedRtn[2], p.predictedRtn[5]];

/** One fitted $OCM flown six ways at `leads` [{h, epoch, r, v}] (truth, in `frame`): per lead the error, each variant's variances, z and d2 (full and off). */
async function coverage(kit, gem, ocm, leads, frame) {
  const epochs = leads.map((l) => l.epoch), fp = kit.flightPcf(frame, epochs);
  const flights = {}, same = { repack: null };
  const original = await kit.fly(ocm, fp);
  same.repack = Buffer.from(await kit.fly(kit.variant(ocm, []), fp)).equals(Buffer.from(original));
  for (const v of VARIANTS) flights[v] = kit.lines(v === 'full' ? original : await kit.fly(kit.variant(ocm, ZERO[v]), fp));
  for (const v of VARIANTS) if (flights[v].length !== leads.length || flights[v].some((s) => !s.cov)) throw new Error(`${v}: ${flights[v].length} of ${leads.length} states, covariance ${flights[v].filter((s) => s.cov).length}`);
  const list = VARIANTS.flatMap((v) => flights[v].map((s, i) => ({ r: s.r, v: s.v, cov: s.cov, tr: leads[i].r, tv: leads[i].v })));
  const stats = await gem.pairs(list), at = (v, i) => stats[VARIANTS.indexOf(v) * leads.length + i];
  return { repackEqual: same.repack, leads: leads.map((l, i) => {
    const f = at('full', i), o = at('off', i);
    return { h: l.h, ...(l.offsetS !== undefined ? { offsetS: l.offsetS } : {}), e: f.errorRtn.map((x) => sig(x, 7)), z: f.zPredicted.map((x) => sig(x)), d2: sig(f.d2Predicted), zOff: o.zPredicted.map((x) => sig(x)), d2Off: sig(o.d2Predicted),
      v: Object.fromEntries(VARIANTS.map((v) => [v, varOf(at(v, i)).map((x) => sig(x, 10))])) };
  }) };
}

// ---- worker: one shard of one set; each stored fit reproduced by the producer's call, its control, its covariance flights.
async function worker(set, k) {
  const s = SETS[set];
  Object.assign(process.env, s.env);
  const X = await import('./lib/xp2.mjs');
  const { config, root, store, XM, windows, iso, ms, rms } = X;
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
  const { apForces, fitPcf, fitWeather, horizonOf, readOcm } = await import('./lib/ap.mjs');
  const m = await openModules(), kit = await apKit(), gem = await scorer();
  const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
  const TERMS31 = { tesseral: 31, zonal: 20 };
  const held = (b, srp) => ({ dragPrior: { form: 'LOG_NORMAL', mean: b, sigma: 1e-6 }, ...(srp ? { srpPrior: srp } : {}) });
  const FIT = { dragPrior: XM.config.fit.dragPrior, srpPrior: XM.config.fit.srpPrior };
  // ap-truth.mjs's arms, as the set ran them
  const ARMS = (s.xm ? [{ name: 'AP72', hours: 72, fit: null }, { name: 'AP24', hours: 24, fit: null }] : [{ name: 'AP24', hours: 24, fit: null }, { name: 'APRa12', hours: 17, drag: 'stored' }])
    .filter((a) => s.arms.includes(a.name));
  const storedB = new Map();
  if (!s.xm) for (const f of fs.readdirSync(path.join(store, 'rows')).filter((n) => n.endsWith('.jsonl'))) for (const l of fs.readFileSync(path.join(store, 'rows', f), 'utf8').split('\n')) if (l) { const r = JSON.parse(l); if (r.arms?.RFa12?.bHeld) storedB.set(r.key, r.arms.RFa12.bHeld); }
  const stored = new Map(rowsIn(path.join(STORED, set)).map((r) => [r.key, r]));
  const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === k;
  const outDir = path.join(OUT, set), outFile = path.join(outDir, `rows-${k}.jsonl`);
  fs.mkdirSync(outDir, { recursive: true });
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  const xmWindows = () => Object.entries(XM.config.groups).flatMap(([group, g]) => g.objects.flatMap((o) => XM.daysOf(XM.config.period.from, XM.config.period.to).map((t) => ({ group, o, cutoffMs: t, date: XM.dateOf(t), key: `${group}|${o.norad}|${XM.dateOf(t)}` }))));
  const list = (s.xm ? xmWindows() : Object.keys(config.spans).flatMap((sp) => windows(sp)))
    .filter((w) => w.date >= s.from && w.date <= s.to && (!s.group || w.group === s.group) && stored.has(w.key) && inShard(w.key) && !done.has(w.key)).slice(0, Number(process.env.COV_LIMIT ?? Infinity));
  for (const w of list) {
    const { o, cutoffMs: D0, key } = w;
    if (GALILEO_HELD.includes(o.norad)) throw new Error(`${key}: a held Galileo satellite`);
    if (SWARM_GRACE.includes(o.norad) && D0 + 7 * DAY > Date.parse(SWARM_GRACE_LAST)) throw new Error(`${key}: Swarm or GRACE-FO truth past ${SWARM_GRACE_LAST}`);
    const row = { key, set, regime: s.regime, group: w.group ?? null, norad: o.norad, name: o.name, cutoff: iso(D0), arms: {} };
    try {
      const after = T.series(o, D0 + 1, D0 + 7 * DAY).lines;
      const first = after.length ? ms(after[0].epoch) : 0;
      const grid = after.filter((l) => (ms(l.epoch) - first) % GRID === 0);
      const bins = Object.fromEntries(LEADS.map((d) => [d, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (d - 1) * DAY && t <= D0 + d * DAY; })]));
      const entered = LEADS.filter((d) => bins[d].length >= MIN_BIN);
      if (!entered.length) throw new Error('no lead bin');
      const scored = entered.flatMap((d) => bins[d]);
      const epochs = scored.map((l) => l.epoch), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((d) => bins[d].length);
      // lead hour h: the first state of the producer's scoring grid at or after cutoff + h hours, within one grid step (COVARIANCE-COVERAGE.md amendment 1)
      const leads = [];
      for (let h = 1, j = 0; h <= HOURS; h += 1) {
        while (j < grid.length && ms(grid[j].epoch) < D0 + h * HOUR) j += 1;
        const l = grid[j];
        if (l && ms(l.epoch) < D0 + h * HOUR + GRID) leads.push({ h, epoch: l.epoch, r: l.r, v: l.v, offsetS: (ms(l.epoch) - D0 - h * HOUR) / 1000 });
      }
      const O = W.rowsO(D0 - 72 * 3600000 - XM.config.conditions.rowsMarginDays * DAY, D0);
      if (O.excluded) throw new Error(O.excluded);
      const spw = fitWeather(O.rows, horizonOf(D0));
      const score = (e) => { const days = {}; let i = 0; entered.forEach((d, j) => { const q = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(q.map((x) => x[c]))); days[d] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
      const arc = (hours) => { const raw = T.series(o, D0 - hours * 3600000, D0).lines; const cov = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return cov >= MIN_COV ? T.thinned(raw).chosen : null; };
      for (const spec of ARMS) {
        const a = { ok: false };
        let f;
        try {
          let fit = spec.fit;
          if (spec.drag) { const b = storedB.get(key); if (!(b > 0)) throw new Error('no positive B'); fit = held(b, FIT.srpPrior); a.bHeld = b; }
          const thin = arc(spec.hours);
          if (!thin) throw new Error('coverage');
          f = await kit.fit([['ephemeris', 'OEM', S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) })],
            ['configuration', 'PCF', fitPcf({ forces: apForces(TERMS31), fit })], ['space_weather', 'SPW', spw]]);
          if (!f.ok) throw new Error(f.error);
          const info = readOcm(f.ocm);
          a.bterm = info.bterm; a.agom = info.agom; a.rms = info.fitRmsKm;
          // the control: the producer's flight and scoring path
          const st = kit.lines(await kit.fly(f.ocm, kit.flightPcf('TEME', epochs)));
          if (st.length !== epochs.length) throw new Error(`propagate returned ${st.length} of ${epochs.length} states`);
          a.days = score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth));
          a.ok = true;
        } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); row.arms[spec.name] = a; continue; }
        try {
          if (!leads.length) throw new Error('no lead hour');
          const cp = kit.covPropagation(f.ocm);
          a.covPropagation = cp.cp; a.fitStop = cp.fitStop;
          const c = await coverage(kit, gem, f.ocm, leads, 'GCRF');
          a.repackEqual = c.repackEqual; a.leads = c.leads;
        } catch (error) { a.coverageError = String(error?.message ?? error).slice(0, 180); }
        row.arms[spec.name] = a;
      }
    } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  }
  console.error(`${set} shard ${k}/${SHARDS}: ${list.length} windows`);
  process.exit(0);
}

// ---- the ISS demo figure: the demo's sample, fitted and flown as tools/demo/abi.mjs does, on the registered build.
async function iss() {
  const text = git(ISS.repo, 'show', `${ISS.commit}:${ISS.path}`);
  if (sha256(text) !== ISS.sha256) throw new Error(`${ISS.path} at ${ISS.commit} is ${sha256(text)}, registered ${ISS.sha256}`);
  const X = await import('./lib/xp2.mjs');
  const S = await import(path.join(X.root, X.config.xm.dir, 'lib/sds.mjs'));
  const kit = await apKit(), gem = await scorer();
  const kv = Object.fromEntries(String(text).split('\n').map((l) => /^([A-Z_]+)\s*=\s*(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  const states = String(text).split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 7 && /^\d{4}-\d\d-\d\dT/.test(p[0]))
    .map((p) => ({ epoch: p[0], r: p.slice(1, 4).map(Number), v: p.slice(4, 7).map(Number) }));
  const msOf = (t) => Date.parse(/Z$/.test(t) ? t : `${t}Z`);
  const halfMs = msOf(states[0].epoch) + (msOf(states.at(-1).epoch) - msOf(states[0].epoch)) / 2;
  const fitLines = states.filter((s) => msOf(s.epoch) <= halfMs);
  const oem = S.oemBytes({ frame: kv.REF_FRAME, object: { name: kv.OBJECT_NAME, id: kv.OBJECT_ID, norad: 0 }, lines: fitLines, useableStart: kv.USEABLE_START_TIME, useableStop: kv.USEABLE_STOP_TIME });
  const f = await kit.fit([['ephemeris', 'OEM', oem], ['configuration', 'PCF', kit.demoFitPcf()]]);
  if (!f.ok) throw new Error(f.error);
  const cp = kit.covPropagation(f.ocm), fitEndMs = msOf(cp.fitStop);
  const later = states.filter((s) => msOf(s.epoch) > fitEndMs);
  const leads = later.map((s) => ({ h: (msOf(s.epoch) - fitEndMs) / HOUR, epoch: s.epoch, r: s.r, v: s.v }));
  const c = await coverage(kit, gem, f.ocm, leads, 'EME2000');
  // the start of the file: the in-track 1-sigma at the first state (the fit's span), from the full flight
  const startFlight = kit.lines(await kit.fly(f.ocm, kit.flightPcf('EME2000', [states[0].epoch])));
  const s0 = (await gem.pairs([{ r: startFlight[0].r, v: startFlight[0].v, cov: startFlight[0].cov, tr: states[0].r, tv: states[0].v }]))[0];
  const last = c.leads.at(-1);
  const out = { file: { path: ISS.path, commit: ISS.commit, sha256: ISS.sha256, frame: kv.REF_FRAME, states: states.length, start: states[0].epoch, stop: states.at(-1).epoch, fitStates: fitLines.length },
    fit: { stop: cp.fitStop, bterm: cp.bterm, agom: cp.agom }, covPropagation: cp.cp, repackEqual: c.repackEqual,
    startSigmaKm: sigmaOf(s0).map((x) => sig(x)), last: { epoch: later.at(-1).epoch, hoursFromStart: (msOf(later.at(-1).epoch) - msOf(states[0].epoch)) / HOUR, hoursAfterFit: last.h,
      sigmaKm: AXES.map((_, a) => sig(Math.sqrt(last.v.full[a]))), errorRicKm: last.e, errorKm: sig(Math.hypot(...last.e), 7), sigmaOffKm: AXES.map((_, a) => sig(Math.sqrt(last.v.off[a]))) },
    leads: c.leads, build: BUILD, sds: kit.sds };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'iss.json'), `${JSON.stringify(out)}\n`);
  console.error(`ISS: in-track 1-sigma ${out.last.sigmaKm[1]} km, error ${out.last.errorKm} km at ${out.last.epoch} (${out.last.hoursFromStart} h from start)`);
  process.exit(0);
}

// ---- run: every shard, niced; a shard starts while fewer than WORKERS run and the 1-minute load is under LOAD_BELOW, or when none runs.
async function run() {
  fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true });
  const manifestFile = path.join(OUT, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    const head = git(repo, 'rev-parse', 'HEAD').toString().trim();
    fs.writeFileSync(manifestFile, `${JSON.stringify({ startedUtc: new Date().toISOString(), commit: head, runner: sha256(fs.readFileSync(new URL(import.meta.url))), build: BUILD,
      modulesRoot: process.env.SDN_MODULES_ROOT ?? null, apRoot: AP_ROOT, hours: HOURS, sets: SETS }, null, 1)}\n`);
  }
  const jobs = [{ set: 'iss', k: 0 }];
  for (let k = 0; k < SHARDS; k += 1) for (const set of Object.keys(SETS)) jobs.push({ set, k });
  const doneFile = (j) => path.join(OUT, 'logs', `${j.set}-${j.k}.done`);
  const pending = jobs.filter((j) => !fs.existsSync(doneFile(j)));
  const running = new Set(), failed = [];
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  while (pending.length || running.size) {
    if (pending.length && running.size < WORKERS && (os.loadavg()[0] < LOAD_BELOW || running.size === 0)) {
      const j = pending.shift(), log = fs.openSync(path.join(OUT, 'logs', `${j.set}-${j.k}.log`), 'a');
      const args = j.set === 'iss' ? ['--iss'] : ['--worker', j.set, '--shard', String(j.k)];
      const child = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=3072', path.join(here, 'covariance-coverage.mjs'), ...args], { cwd: repo, stdio: ['ignore', log, log], env: process.env });
      running.add(child);
      console.error(`${new Date().toISOString()} start ${j.set} ${j.k} pid ${child.pid} load ${os.loadavg()[0].toFixed(1)}`);
      child.on('exit', (code) => { running.delete(child); fs.closeSync(log); if (code === 0) fs.writeFileSync(doneFile(j), `${new Date().toISOString()}\n`); else failed.push(`${j.set} ${j.k} exit ${code}`); console.error(`${new Date().toISOString()} exit ${j.set} ${j.k} ${code}`); });
      await nap(2000);
    } else await nap(10000);
  }
  fs.writeFileSync(path.join(OUT, 'run.json'), `${JSON.stringify({ finishedUtc: new Date().toISOString(), failed }, null, 1)}\n`);
  if (failed.length) { console.error(`failed: ${failed.join('; ')}`); process.exit(1); }
  table(RESULTS);
}

// ---- control: the reproduced fits against ap/b051's stored rows (the registered fields, lead days 1, 2, 3 and 7).
const ARM_FIELDS = ['ok', 'error', 'bterm', 'agom', 'rms', 'bHeld'], CONTROL_DAYS = ['1', '2', '3', '7'];
function control(set, rows) {
  const stored = new Map(rowsIn(path.join(STORED, set)).map((r) => [r.key, r]));
  const out = { windows: rows.length, armsCompared: 0, scalarsCompared: 0, differing: 0, differences: [] };
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const diff = (key, field, a, b) => { out.differing += 1; if (out.differences.length < 20) out.differences.push({ key, field, stored: a ?? null, flown: b ?? null }); };
  for (const r of rows) {
    const a = stored.get(r.key);
    if (!a) { diff(r.key, 'row', null, 'present'); continue; }
    for (const arm of SETS[set].arms) {
      const x = a.arms?.[arm], y = r.arms?.[arm];
      out.armsCompared += 1;
      if (!x || !y) { out.scalarsCompared += 1; if (!!x !== !!y) diff(r.key, arm, x ? 'present' : null, y ? 'present' : null); continue; }
      for (const f of ARM_FIELDS) { if (f === 'error' && x.ok && y.ok) continue; out.scalarsCompared += 1; if (!same(x[f], y[f])) diff(r.key, `${arm}.${f}`, x[f], y[f]); }
      for (const d of CONTROL_DAYS) {
        out.scalarsCompared += 1;
        if (!!x.days?.[d] !== !!y.days?.[d]) { diff(r.key, `${arm}.days.${d}`, x.days?.[d], y.days?.[d]); continue; }
        if (x.days?.[d]) for (const c of ['e', 'r', 't', 'n']) { out.scalarsCompared += 1; if (!same(x.days[d][c], y.days[d][c])) diff(r.key, `${arm}.days.${d}.${c}`, x.days[d][c], y.days[d][c]); }
      }
    }
  }
  return out;
}

// ---- the table, from the rows alone.
const SHARE_LEADS = [12, 24, 72, 168], DAY_LEADS = [24, 72, 168];
/** Per lead: each term's share of each axis's variance, the mapped fit covariance's and the floor's; the sum's departure from 1. */
function sharesOf(L, floor) {
  const full = L.v.full, out = {};
  for (const t of TERMS) out[t] = full.map((x, a) => (x - L.v[t][a]) / x);
  out.floor = full.map((x, a) => floor[a] / x);
  out.mapped = full.map((x, a) => (L.v.off[a] - floor[a]) / x);
  const sum = full.map((_, a) => [...TERMS, 'floor', 'mapped'].reduce((s, k) => s + out[k][a], 0));
  return { shares: out, sumDeparture: Math.max(...sum.map((x) => Math.abs(x - 1))) };
}
const floorOf = (cp) => [cp.FLOOR_UU_KM2, cp.FLOOR_VV_KM2, cp.FLOOR_WW_KM2];
function table(outDir) {
  const sets = {}, controls = {};
  for (const set of Object.keys(SETS)) { sets[set] = rowsIn(path.join(OUT, set)); controls[set] = control(set, sets[set]); }
  const issFile = path.join(OUT, 'iss.json'), issRow = fs.existsSync(issFile) ? JSON.parse(fs.readFileSync(issFile, 'utf8')) : null;
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const cells = [], shares = [], checks = { repackUnequal: 0, maxShareSumDeparture: 0, armsFlown: 0 };
  for (const [set, rows] of Object.entries(sets)) {
    const s = SETS[set];
    for (const arm of s.arms) {
      const flown = rows.map((r) => r.arms?.[arm]).filter((a) => a?.ok && a.leads);
      checks.armsFlown += flown.length;
      checks.repackUnequal += flown.filter((a) => a.repackEqual !== true).length;
      const byH = new Map();
      for (const a of flown) {
        const floor = floorOf(a.covPropagation);
        for (const L of a.leads) {
          const x = byH.get(L.h) ?? byH.set(L.h, []).get(L.h), sh = sharesOf(L, floor);
          checks.maxShareSumDeparture = Math.max(checks.maxShareSumDeparture, sh.sumDeparture);
          x.push({ L, sh: sh.shares });
        }
      }
      for (let h = 1; h <= HOURS; h += 1) {
        const x = byH.get(h) ?? [];
        const cell = { regime: s.regime, set, arm, h, n: x.length, axes: {} };
        AXES.forEach((ax, a) => {
          const z = x.map(({ L }) => Math.abs(L.z[a])), zOff = x.map(({ L }) => Math.abs(L.zOff[a]));
          cell.axes[ax] = { medianAbsZ: sig(med(z)), within1Sigma: sig(share(z, (q) => q <= 1)), medianSigmaKm: sig(med(x.map(({ L }) => Math.sqrt(L.v.full[a])))),
            medianAbsErrorKm: sig(med(x.map(({ L }) => Math.abs(L.e[a])))), medianAbsZNoiseOff: sig(med(zOff)), medianSigmaNoiseOffKm: sig(med(x.map(({ L }) => Math.sqrt(L.v.off[a])))) };
          const m = cell.axes[ax].medianAbsZ;
          cell.axes[ax].widthFactor = m ? sig(HALF_NORMAL_MEDIAN / m, 4) : null;
          cell.axes[ax].band = m === null ? null : m < BAND[0] ? 'too wide' : m > BAND[1] ? 'too narrow' : 'inside';
        });
        cell.meanD2Over3 = sig(mean(x.map(({ L }) => L.d2 / 3)));
        cell.inside95 = sig(share(x.map(({ L }) => L.d2), (q) => q <= CHI2_3_95));
        cell.meanD2Over3NoiseOff = sig(mean(x.map(({ L }) => L.d2Off / 3)));
        cell.inside95NoiseOff = sig(share(x.map(({ L }) => L.d2Off), (q) => q <= CHI2_3_95));
        cells.push(cell);
        if (SHARE_LEADS.includes(h)) shares.push({ regime: s.regime, arm, h, n: x.length, medianShare: Object.fromEntries([...TERMS, 'mapped', 'floor'].map((t) => [t, Object.fromEntries(AXES.map((ax, a) => [ax, sig(med(x.map(({ sh }) => sh[t][a])), 4)]))])) });
      }
    }
  }
  // the growing term: the largest median in-track share at day 1, per regime and arm, and over all
  const day1 = shares.filter((q) => q.h === 24);
  const growing = day1.map((q) => { const [t, v] = Object.entries(q.medianShare).filter(([k]) => TERMS.includes(k)).sort((a, b) => b[1].I - a[1].I)[0]; return { regime: q.regime, arm: q.arm, term: t, name: TERM_NAME[t], inTrackShareDay1: v.I }; });
  const counts = {};
  for (const g of growing) counts[g.term] = (counts[g.term] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const noise = {};
  for (const [set, rows] of Object.entries(sets)) for (const r of rows) for (const [arm, a] of Object.entries(r.arms ?? {})) if (a.covPropagation) {
    const k = `${SETS[set].regime}|${arm}`, x = (noise[k] ??= { regime: SETS[set].regime, arm, values: {} });
    for (const f of ['NOISE_ECCENTRICITY_PER_DAY', 'NOISE_INCLINATION_PER_DAY', 'NOISE_MEAN_MOTION_RELATIVE', 'NON_GRAVITATIONAL_SHARE', 'NOISE_NON_GRAVITATIONAL_RAD_DAY2', 'NOISE_START_MINUTES']) (x.values[f] ??= []).push(a.covPropagation[f]);
  }
  const noiseTable = Object.values(noise).map((x) => ({ regime: x.regime, arm: x.arm, median: Object.fromEntries(Object.entries(x.values).map(([f, v]) => [f, sig(med(v))])) }));
  const result = {
    study: PLAN, task: 'modules-sdn-ap-covariance-growth-coverage-20261105', build: BUILD, startedUtc: manifest.startedUtc, commit: manifest.commit,
    statistic: 'z = error component / propagated 1-sigma per RIC axis (analysis/gp-error-model pair_statistics); calibrated: median |z| 0.674, band [0.603, 0.754]; 3D: mean d2/3 in [0.8, 1.25], 95 % ellipsoid share in [0.93, 0.97]',
    regimes: REGIMES, control: controls, checks, growing: { term: top, name: TERM_NAME[top] ?? null, perArm: growing }, noise: noiseTable, shares, iss: issRow ? { ...issRow, leads: undefined } : null, cells,
  };
  const lines = [`# AP covariance coverage (sdn-ap ${BUILD.version}, wasm ${BUILD.wasmSha256.slice(0, 12)})`, '',
    `Report only (${PLAN}). Coverage z = AP's forward error component over its propagated 1-sigma, per radial (R), in-track (I) and cross-track (C) axis, from \`analysis/gp-error-model\` \`pair_statistics\` on \`propagator/sdn-ap\` ${BUILD.version} flights (modules ${BUILD.modulesCommit.slice(0, 8)}). A calibrated covariance gives median |z| 0.674 (band 0.603 to 0.754); below it the covariance is too wide by the width factor 0.674 / median |z|.`, ''];
  if (issRow) {
    const l = issRow.last;
    lines.push('## The ISS demo figure', '', `The demo's sample (${issRow.file.path}, ${issRow.file.states} states, ${issRow.file.fitStates} fitted), at its last state ${l.epoch} (${fmt(l.hoursFromStart)} h from its start, ${fmt(l.hoursAfterFit)} h after the fit's end): in-track 1-sigma ${l.sigmaKm[1].toFixed(2)} km (${issRow.startSigmaKm[1].toFixed(3)} km at the file's first state), error ${l.errorKm.toFixed(4)} km (in-track ${Math.abs(l.errorRicKm[1]).toFixed(4)} km); with the four process-noise terms off the in-track 1-sigma is ${fmt(l.sigmaOffKm[1])} km.`, '');
  }
  lines.push('## Median |z| by regime, arm, lead and axis', '', '| Regime | Arm | Lead | n | R | I | C | I width factor | I median 1-sigma km | I median error km | mean d2/3 | inside 95 % |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of cells.filter((q) => [12, ...DAY_LEADS].includes(q.h))) lines.push(`| ${REGIMES[c.regime]} | ${c.arm} | ${c.h % 24 ? `${c.h} h` : `day ${c.h / 24}`} | ${c.n} | ${AXES.map((ax) => fmt(c.axes[ax].medianAbsZ)).join(' | ')} | ${fmt(c.axes.I.widthFactor)} | ${fmt(c.axes.I.medianSigmaKm)} | ${fmt(c.axes.I.medianAbsErrorKm)} | ${fmt(c.meanD2Over3)} | ${fmt(c.inside95)} |`);
  lines.push('', 'With the four process-noise terms off (the mapped fit covariance and the floor):', '', '| Regime | Arm | Lead | R | I | C | mean d2/3 | inside 95 % |', '|---|---|---|---:|---:|---:|---:|---:|');
  for (const c of cells.filter((q) => DAY_LEADS.includes(q.h))) lines.push(`| ${REGIMES[c.regime]} | ${c.arm} | day ${c.h / 24} | ${AXES.map((ax) => fmt(c.axes[ax].medianAbsZNoiseOff)).join(' | ')} | ${fmt(c.meanD2Over3NoiseOff)} | ${fmt(c.inside95NoiseOff)} |`);
  lines.push('', '## Which term grows', '', `Median share of the in-track variance by term (each term switched off through the record's COV_PROPAGATION field and flown again; the floor from the record's FLOOR_VV_KM2).`, '',
    '| Regime | Arm | Lead | n | s_e | s_i | s_l | s_d | mapped fit | floor |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const q of shares) lines.push(`| ${REGIMES[q.regime]} | ${q.arm} | ${q.h} h | ${q.n} | ${[...TERMS, 'mapped', 'floor'].map((t) => fmt(q.medianShare[t].I)).join(' | ')} |`);
  lines.push('', `Growing term: ${TERM_NAME[top] ?? 'none'} (largest median in-track share at day 1 in ${counts[top] ?? 0} of ${growing.length} regime-arm cells): ${growing.map((g) => `${REGIMES[g.regime]} ${g.arm} ${g.name} ${fmt(g.inTrackShareDay1)}`).join('; ')}.`, '',
    'Noise sizes the fits wrote (median over windows):', '', '| Regime | Arm | s_e (1/day) | s_i (1/day) | s_l | c | s_d (rad/day^2) | t_a (min) |', '|---|---|---:|---:|---:|---:|---:|---:|');
  for (const x of noiseTable) lines.push(`| ${REGIMES[x.regime]} | ${x.arm} | ${['NOISE_ECCENTRICITY_PER_DAY', 'NOISE_INCLINATION_PER_DAY', 'NOISE_MEAN_MOTION_RELATIVE', 'NON_GRAVITATIONAL_SHARE', 'NOISE_NON_GRAVITATIONAL_RAD_DAY2', 'NOISE_START_MINUTES'].map((f) => fmt(x.median[f])).join(' | ')} |`);
  lines.push('', '## Control', '', `Each stored fit of \`ap/b051\` reproduced by its producer's call on ${BUILD.version}: ${Object.entries(controls).map(([set, c]) => `${set} ${c.windows} windows, ${c.scalarsCompared} scalars compared, ${c.differing} differing`).join('; ')}. Unchanged repack flown byte-equal on ${checks.armsFlown - checks.repackUnequal} of ${checks.armsFlown}; shares sum to 1 within ${checks.maxShareSumDeparture.toExponential(2)}.`, '',
    `Build: \`propagator/sdn-ap\` ${BUILD.version}, wasm SHA-256 \`${BUILD.wasmSha256}\` at modules \`${BUILD.modulesCommit}\`. Rows: \`${OUT}\`, run from this repository at \`${manifest.commit.slice(0, 10)}\`.`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(result, null, 1)}\n`);
  fs.writeFileSync(path.join(outDir, 'README.md'), `${lines.join('\n')}\n`);
  return result;
}

// ---- the end to end.
function check() {
  const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const reg = git(repo, 'log', '--diff-filter=A', '--format=%H %cI', '--', PLAN).toString().trim().split('\n').at(-1).split(' ');
  ok(Date.parse(reg[1]) < Date.parse(manifest.startedUtc), `the registration ${reg[0]?.slice(0, 10)} (${reg[1]}) does not precede the run (${manifest.startedUtc})`);
  ok(manifest.build.wasmSha256 === BUILD.wasmSha256, 'the run names another build');
  for (const set of Object.keys(SETS)) for (const r of rowsIn(path.join(OUT, set))) {
    ok(!GALILEO_HELD.includes(r.norad), `${r.key}: a held Galileo satellite`);
    ok(!(SWARM_GRACE.includes(r.norad) && Date.parse(r.cutoff) + 7 * DAY > Date.parse(SWARM_GRACE_LAST)), `${r.key}: Swarm or GRACE-FO truth past ${SWARM_GRACE_LAST}`);
    ok(!/starlink/i.test(r.name ?? ''), `${r.key}: a Starlink object`);
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'covariance-coverage-'));
  const t = table(scratch);
  for (const f of ['table.json', 'README.md']) ok(fs.existsSync(path.join(RESULTS, f)) && fs.readFileSync(path.join(scratch, f)).equals(fs.readFileSync(path.join(RESULTS, f))), `results/ap-truth/covariance-coverage/${f} does not reproduce from the rows`);
  fs.rmSync(scratch, { recursive: true, force: true });
  for (const [set, c] of Object.entries(t.control)) ok(c.differing === 0 && c.windows > 0, `control ${set}: ${c.differing} differing of ${c.scalarsCompared} (${c.windows} windows)`);
  ok(t.checks.armsFlown > 0 && t.checks.repackUnequal === 0, `the unchanged repack differs on ${t.checks.repackUnequal} of ${t.checks.armsFlown}`);
  ok(t.checks.maxShareSumDeparture <= 1e-6, `the shares depart from 1 by ${t.checks.maxShareSumDeparture}`);
  for (const [set, s] of Object.entries(SETS)) for (const arm of s.arms) for (const h of DAY_LEADS) for (const ax of AXES) {
    const c = t.cells.find((q) => q.set === set && q.arm === arm && q.h === h);
    ok(Number.isFinite(c?.axes?.[ax]?.medianAbsZ), `no median |z| for ${s.regime} ${arm} ${h} h ${ax}`);
  }
  const l = t.iss?.last;
  ok(l && Math.abs(l.sigmaKm[1] - ISS.sigmaKm) <= ISS.sigmaTol && Math.abs(l.errorKm - ISS.errorKm) <= ISS.errorTol, `ISS: in-track 1-sigma ${l?.sigmaKm?.[1]} km, error ${l?.errorKm} km, registered ${ISS.sigmaKm} +- ${ISS.sigmaTol} and ${ISS.errorKm} +- ${ISS.errorTol}`);
  ok(t.growing.term && t.growing.perArm.every((g) => Number.isFinite(g.inTrackShareDay1)), 'no growing term named');
  const d1 = (regime, arm) => t.cells.find((q) => q.regime === regime && q.arm === arm && q.h === 24)?.axes?.I?.medianAbsZ;
  const line = `covariance-coverage: ISS in-track 1-sigma ${l?.sigmaKm?.[1]} km vs error ${l?.errorKm} km; day-1 in-track median |z| ${Object.entries(SETS).flatMap(([, s]) => s.arms.map((a) => `${s.regime} ${a} ${d1(s.regime, a)}`)).join(', ')}; growing term ${t.growing.name}; control ${Object.values(t.control).map((c) => c.differing).join('/')} differing`;
  if (fails.length) { console.log(`FAIL ${line}`); for (const f of fails) console.log(`  ${f}`); process.exit(1); }
  console.log(`PASS ${line}`);
}

if (process.argv.includes('--worker')) await worker(argOf('--worker'), Number(argOf('--shard')));
else if (process.argv.includes('--iss')) await iss();
else if (process.argv.includes('--run')) await run();
else if (process.argv.includes('--table')) { table(argOf('--out') ?? RESULTS); console.log(`table written to ${argOf('--out') ?? RESULTS}`); }
else if (process.argv.includes('--check')) check();
else { console.error('usage: --run | --worker <set> --shard k | --iss | --table [--out dir] | --check'); process.exit(2); }
