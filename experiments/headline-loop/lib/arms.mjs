// The re-flight's arms. AP: the theory alone, fitted to the truth arc with the published $PCF (or a stated variant) and flown, on the module build
// given. FFM: named settings (lib/ffm.mjs), fitted to the same arc and flown; the configured arm cached per window with its trajectory over the fit
// arc plus 7 days. APC (the record with a carried forecast): reserved; it runs only when the AP build declares the method named by --apc-method.
// Module calls only; JavaScript moves bytes, and forms the per-epoch difference |r_AP - r_FFM| of two module states for the D statistic.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO, MODULES_ROOT } from './env.mjs';
import { root, XP2F, DAY, iso, ms, rms, byDay } from './windows.mjs';
import { SETTINGS, openFfm } from './ffm.mjs';

const OT = path.join(REPO, 'experiments/operator-theory');
const APL = await import(path.join(OT, 'lib/ap.mjs'));
const { openAxes } = await import(path.join(OT, 'lib/host.mjs'));
const { FFM_220 } = await import(path.join(OT, 'lib/build.mjs'));
const XM3 = await import(path.join(OT, 'lib/xm3.mjs'));
export const S = await import(path.join(root, XP2F.xm.dir, 'lib/sds.mjs'));
const { openModules } = await import(path.join(root, XP2F.xm.dir, 'lib/modules.mjs'));

export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const STORE_ROOT = process.env.HEADLINE_LOOP_STORE ?? '/opt/data/sdn-archive/headline-loop';

// PCF_AP / PCF_AP_VACUUM of all-regimes.mjs (ap-truth.mjs's fit for the XM groups is the same: FORCES 31, 20, NRLMSISE-00 on the as-issued rows,
// FIT unset); "vacuum" is the theory's own Jacchia 1970. AP_WIDE (BUD-4): FIT.DRAG_PRIOR log-normal median 0.01, sigma of the log 10 ln 10.
export const PCF = {
  AP: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20 }), fit: null }),
  AP_VACUUM: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20, atmosphere: false }), fit: null }),
  AP_WIDE: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20 }), fit: { dragPrior: { form: 'LOG_NORMAL', mean: 0.01, sigma: 10 * Math.log(10) } } }),
  // BUD-3: AP on a conservative-force model orbit, drag and radiation pinned off by their priors (B 0 +- 1e-12, S 0 +- 1e-9)
  AP_FLOOR: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20, atmosphere: false }), fit: { dragPrior: { form: 'GAUSSIAN_SIGNED', mean: 0, sigma: 1e-12 }, srpPrior: { form: 'GAUSSIAN_SIGNED', mean: 0, sigma: 1e-9 } } }),
  // the whiteroom XP: the same module with the theory's own (stock) forces, as all-regimes.mjs PCF_XP
  XP: APL.fitPcf({ forces: {}, fit: null }),
};

/** A fit $PCF naming the forecast the record carries (sdn-ap 0.6.7 and later, SPEC 18.4): S.pcfBytes's encoding (every FORCES scalar on
 *  the wire, ATMOSPHERE_MODEL stated) plus OUTPUT START_TIME and STOP_TIME. forces: APL.apForces(...). */
export function carriedPcf({ forces, startIso, stopIso }) {
  const P = S.PCF, fb = S.flatbuffers;
  const t = new P.PCFT();
  t.THEORY = P.pcfTheory.AP;
  const enumOf = { WEATHER_SOURCE: P.pcfWeatherSource, ATMOSPHERE_MODEL: P.pcfAtmosphereFamily, DENSITY_CORRECTION: P.pcfDensityCorrection };
  const f = Object.assign(new P.PCFForceModelT(), { EPHEMERIS_SOURCE: '' });
  for (const [k, v] of Object.entries({ ATMOSPHERE_MODEL: 'JACCHIA70', ...forces })) f[k] = enumOf[k] ? enumOf[k][v] : v;
  const pack = f.pack.bind(f);
  f.pack = (b) => {
    const offset = b.addFieldOffset;
    b.addFieldOffset = function (slot, value, d) { if (value !== d) offset.call(this, slot, value, d); };
    b.forceDefaults(true);
    try { return pack(b); } finally { b.forceDefaults(false); b.addFieldOffset = offset; }
  };
  t.FORCES = f;
  t.OUTPUT = Object.assign(new P.PCFOutputT(), { START_TIME: startIso, STOP_TIME: stopIso });
  const b = new fb.Builder(512);
  P.PCF.finishPCFBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
}
export const AP_FORCES = { AP: APL.apForces({ tesseral: 31, zonal: 20 }), AP_VACUUM: APL.apForces({ tesseral: 31, zonal: 20, atmosphere: false }) };

/** The FFM cache's version key: the FFM and estimation builds, the environment (kernel, Earth orientation), the arm's settings and the trajectory
 *  step. A different build, environment, setting or step is a different key, so no cache is ever mixed. */
export function ffmCacheKey(arm, trajStepS) {
  const env = XM3.config.environment;
  const doc = { v: 2, ffm: FFM_220.wasmSha256, estimation: XM3.build.wasmSha256['analysis/estimation'], kernel: env.kernel.sha256, eop: env.earthOrientation.sha256, arm, settings: SETTINGS[arm], trajStepS };
  return { key: `${arm}-${sha256(JSON.stringify(doc)).slice(0, 12)}`, doc };
}

/** The AP build of a wasm file: its SHA-256 and the version its module folder names. */
export function apBuildOf(file, version) {
  const bytes = fs.readFileSync(file);
  let v = version;
  if (!v) for (const p of ['../../plugin-manifest.json', '../../package.json']) { try { v = JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), p), 'utf8')).version; if (v) break; } catch {} }
  return { module: 'propagator/sdn-ap', version: v ?? 'unknown', sha256: sha256(bytes), file };
}

const dayRms = (a, b, sc) => { // RMS over each lead day of |r_a - r_b| (km), two module states per epoch
  const d = a.map((s, i) => Math.hypot(s.r[0] - b[i].r[0], s.r[1] - b[i].r[1], s.r[2] - b[i].r[2]));
  const out = {}; let i = 0;
  sc.entered.forEach((k, j) => { out[k] = rms(d.slice(i, i + sc.sizes[j])); i += sc.sizes[j]; });
  return out;
};

export async function openArms({ apWasm, apcMethod = null }) {
  const entry = createRequire(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  const ap = await createStandaloneHarness('browser', apWasm, { surface: 'direct' });
  const methods = new Set((ap.manifest?.methods ?? []).map((x) => x.methodId ?? x.id ?? x.name));
  const m = await openModules();
  const F = await openFfm();
  const axes = await openAxes();
  const invoke = async (methodId, inputs) => {
    const r = await ap.invoke({ methodId, inputs });
    if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
    return r;
  };
  // frame 'TEME' (the published harness: the module's TEME, turned to GCRF by foundation/frames) or 'GCRF' (the module's own GCRF output)
  const gcrfFlightPcf = (epochs) => {
    const t = new S.PCF.PCFT();
    t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs });
    const b = new S.flatbuffers.Builder(1 << 12);
    S.PCF.PCF.finishPCFBuffer(b, t.pack(b));
    return b.asUint8Array().slice();
  };
  const flyAp = async (ocm, epochs, frame = 'TEME') => {
    const r = await invoke('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: frame === 'GCRF' ? gcrfFlightPcf(epochs) : S.flightPcfBytes(epochs) }]);
    const lines = S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
    if (lines.length !== epochs.length) throw new Error(`propagate returned ${lines.length} of ${epochs.length}`);
    return frame === 'GCRF' ? lines.map((l) => ({ r: l.r, v: l.v })) : m.toAxes(lines, epochs, 'GCRF');
  };
  const fitAp = async (method, oem, pcf, spw) => {
    const r = await invoke(method, [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: spw }] : [])]);
    return new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload);
  };
  return {
    axes,
    ffmProvenance: F.provenance,
    apcAvailable: !!apcMethod && methods.has(apcMethod),
    /** AP: a $PCF on the truth arc, the record flown on the scored epochs: { ok, rms, days, states (GCRF, for D) }. */
    async ap({ object, thin, D0, pcf, spw, sc, frame = 'TEME' }) {
      const t0 = performance.now();
      const ocm = await fitAp('fit', S.oemBytes({ frame: 'GCRF', object, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }), pcf, spw);
      const info = APL.readOcm(ocm);
      const states = await flyAp(ocm, sc.epochs, frame);
      const fit = { b: info.bterm, s: info.agom, sigmaLnB: info.sigmaLnB, iterations: info.iterations, converged: info.o.ORBIT_DETERMINATION?.FIT_STATISTICS?.CONVERGED ?? null };
      return { ok: true, rms: info.fitRmsKm, fit, days: byDay(await m.rtn(states, sc.truth), sc.entered, sc.sizes), states, s: (performance.now() - t0) / 1000 };
    },
    /** AP fitted to given arc lines (GCRF) and flown on the given epochs: { rms (km), states }. */
    async apFitFly({ object, lines, D0, pcf, spw = null, epochs, frame = 'TEME' }) {
      const ocm = await fitAp('fit', S.oemBytes({ frame: 'GCRF', object, lines, useableStart: lines[0].epoch, useableStop: iso(D0) }), pcf, spw);
      return { rms: APL.readOcm(ocm).fitRmsKm, states: await flyAp(ocm, epochs, frame) };
    },
    /** The record that carries a forecast (SPEC 18): fit to a GCRF block (the theory fitted on the block up to D0, the forecast START to STOP
     *  carried as Chebyshev segments): { ocm, bytes, segments, maxResidualKm, cpuS, wallS } (CPU of this process over the module's fit). */
    async carriedRecord({ object, block, D0, startIso, stopIso, forces, spw = null }) {
      const pcf = carriedPcf({ forces, startIso, stopIso });
      const oem = S.oemBytes({ frame: 'GCRF', object, lines: block, useableStart: block[0].epoch, useableStop: iso(D0) });
      const c0 = process.cpuUsage(), t0 = performance.now();
      const ocm = await fitAp('fit', oem, pcf, spw);
      const c = process.cpuUsage(c0), wallS = (performance.now() - t0) / 1000;
      const o = APL.readOcm(ocm).o;
      const seg = o.POLYNOMIAL_POSITION_RECORDS ?? [];
      return { ocm, bytes: ocm.length, segments: seg.length, maxResidualKm: seg.length ? Math.max(...seg.map((x) => x.MAX_POSITION_RESIDUAL ?? 0)) : null, cpuS: (c.user + c.system) / 1e6, wallS };
    },
    /** A record flown at the given epochs (GCRF states). */
    flyRecord: (ocm, epochs, frame = 'TEME') => flyAp(ocm, epochs, frame),
    /** Module states scored against a scoredOf grid's truth: RMS per lead day (e, r, t, n km). */
    score: async (states, sc) => byDay(await m.rtn(states, sc.truth), sc.entered, sc.sizes),
    /** A fitted FFM product flown at the given epochs in one pass: each 9,000-state chunk starts from the last state of the one before, so
     *  the states are one integration (the cache's trajectory starts every chunk from the fit epoch, and two integrations of different
     *  step sequences can part by meters at the chunk's join). [{epoch, r, v}] GCRF km. */
    async flyContinuous({ arm, product, epochs, rows }) {
      const settings = SETTINGS[arm], out = [];
      let p = product;
      for (let i = 0; i < epochs.length; i += 9000) {
        const chunk = epochs.slice(i, i + 9000);
        const s = await F.forecast(p, chunk, settings, rows);
        s.forEach((x, j) => out.push({ epoch: chunk[j], r: x.r, v: x.v }));
        const last = s.at(-1);
        p = { epoch: chunk.at(-1), state: [...last.r, ...last.v].map((x) => x * 1000), parameters: product.parameters };
      }
      return out;
    },
    /** The making cost of the numerical part (referee's test 6): the arm's fit, then its flight at the given epochs in one pass (each
     *  chunk started from the last state of the one before), each as this process's CPU seconds. */
    async ffmCost({ arm, thin, D0, rows, epochs }) {
      const settings = SETTINGS[arm], cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1e6; };
      let c0 = cpu();
      const f = await F.fit(thin, settings, D0, rows);
      const fitCpuS = cpu() - c0;
      c0 = cpu();
      let product = { epoch: f.epoch, state: f.state, parameters: f.parameters }, n = 0;
      for (let i = 0; i < epochs.length; i += 9000) {
        const chunk = epochs.slice(i, i + 9000);
        const s = await F.forecast(product, chunk, settings, rows);
        n += s.length;
        const last = s.at(-1);
        product = { epoch: chunk.at(-1), state: [...last.r, ...last.v].map((x) => x * 1000), parameters: f.parameters };
      }
      return { fitCpuS, propagationCpuS: cpu() - c0, states: n };
    },
    /** BUD-3's model orbit: a fitted state flown with conservative forces alone (SETTINGS.Fcons) at the given epochs. */
    async modelOrbit(product, epochs) { return F.forecast({ epoch: product.epoch, state: product.state, parameters: [] }, epochs, SETTINGS.Fcons, null); },
    /** APC: the record made by the module from a cached FFM trajectory (arc start to cutoff + 7 d), flown on the scored epochs. Reserved. */
    async apc({ object, traj, pcf, spw, sc }) {
      const t0 = performance.now();
      const ocm = await fitAp(apcMethod, S.oemBytes({ frame: 'GCRF', object, lines: traj, useableStart: traj[0].epoch, useableStop: traj.at(-1).epoch }), pcf, spw);
      const states = await flyAp(ocm, sc.epochs);
      return { ok: true, days: byDay(await m.rtn(states, sc.truth), sc.entered, sc.sizes), states, s: (performance.now() - t0) / 1000 };
    },
    /** One FFM arm: fitted to the arc, flown on the scored epochs; with cacheDir, cached (json: the product and the scored states) so a later AP
     *  build reads it instead of fitting again, and with trajStepS also flown over the arc plus 7 days at that step (Float64 binary). */
    async ffm({ arm, thin, D0, rows, sc, cacheDir = null, cacheName = null, trajStepS = null, halfTolerance = false, cacheOnly = false }) {
      const base = cacheDir ? path.join(cacheDir, cacheName) : null;
      if (base && fs.existsSync(`${base}.json`)) {
        const doc = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
        if (doc.trajectory && !fs.existsSync(path.join(cacheDir, doc.trajectory.file))) throw new Error(`cache ${base}.json has no trajectory file`);
        return { ...doc, states: doc.states.map((r) => ({ r })), cached: true };
      }
      if (cacheOnly) throw new Error(`no cached ${arm} for ${cacheName}: an AP-only re-flight never fits FFM`);
      const t0 = performance.now();
      const settings = halfTolerance ? { ...SETTINGS[arm], integrator: { ...SETTINGS[arm].integrator, tolerance: SETTINGS[arm].integrator.tolerance / 2 } } : SETTINGS[arm];
      const f = await F.fit(thin, settings, D0, rows);
      const product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
      const scored = await F.forecast(product, sc.epochs, settings, rows);
      const days = byDay(await m.rtn(scored, sc.truth), sc.entered, sc.sizes);
      const doc = { arm, product, termination: f.termination, fitOk: f.ok, weightedRms: f.weightedRms, iterations: f.iterations, days, s: 0 };
      if (base && trajStepS) {
        const from = ms(thin[0].epoch), to = D0 + 7 * DAY, step = trajStepS * 1000, ep = [];
        for (let t = from; t <= to; t += step) ep.push(new Date(t).toISOString());
        const tr = await F.forecast(product, ep, settings, rows);
        const bin = new Float64Array(tr.length * 6);
        tr.forEach((s, i) => { bin.set(s.r, 6 * i); bin.set(s.v, 6 * i + 3); });
        doc.trajectory = { file: `${path.basename(base)}.bin`, frame: 'GCRF', from: ep[0], stepS: trajStepS, count: ep.length, layout: 'Float64 x, y, z km, vx, vy, vz km/s per state' };
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(`${base}.bin.tmp`, Buffer.from(bin.buffer)); fs.renameSync(`${base}.bin.tmp`, `${base}.bin`);
      }
      doc.s = (performance.now() - t0) / 1000;
      const states = scored.map((x) => ({ r: x.r }));
      if (base) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(`${base}.json.tmp`, JSON.stringify({ ...doc, states: scored.map((x) => x.r) })); fs.renameSync(`${base}.json.tmp`, `${base}.json`); }
      return { ...doc, states, cached: false };
    },
    /** A cached trajectory as [{epoch, r, v}]. */
    trajectoryOf(cacheDir, doc) {
      const b = fs.readFileSync(path.join(cacheDir, doc.trajectory.file));
      const f = new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8), from = Date.parse(doc.trajectory.from);
      return Array.from({ length: doc.trajectory.count }, (_, i) => ({ epoch: new Date(from + i * doc.trajectory.stepS * 1000).toISOString(), r: [...f.subarray(6 * i, 6 * i + 3)], v: [...f.subarray(6 * i + 3, 6 * i + 6)] }));
    },
    dayRms,
    async close() { await axes.close(); await F.close(); await m.close(); await ap.destroy?.(); },
  };
}
