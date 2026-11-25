#!/usr/bin/env node
// Unified SDN-AP 0.7.3 precise-orbit scoreboard (table-0.7.3.json), bit-exact public-module replay proof
// (replay-full-0.7.3.json), and paired public-set / recount / allarms-xp / public-only derivations
// (sgp4-public-sets-0.7.3.json, recount-0.7.3.json, allarms-xp-0.7.3.json, public-only-0.7.3.json).
//
// Fits use the full 0.7.3 build (.build-full/dist/isomorphic/module.wasm); EVERY propagate call
// (AP, SGP4-XP, carry24, perigeeScan) is executed on BOTH the full build and the signed public
// 0.7.3 module (dist/isomorphic/module.wasm) and verified bit-for-bit (length + SHA-256).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fork, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REPO, MODULES_ROOT, usePackages, envRecord } from '../headline-loop/lib/env.mjs';

const SELF = fileURLToPath(import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ALL = ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE72', 'HE', 'HX'];
const HEAVY = ['HE', 'HE72', 'HX', 'DO', 'S1', 'P', 'T', 'WA', 'LS', 'GN_GAL', 'GN', 'GE', 'IG', 'GD'];
const LEADS = [[24, 1], [72, 3], [120, 5], [168, 7]];
const THEORIES = ['AP', 'SGP4XP', 'USSFXP', 'SGP4'];
const PASS_LEAD_DAY = 5, PASS_M = 100;
const passes = (p) => p.a - p.f < PASS_M;
const SAME_ALTITUDES = { row: 'S1', from: 'DO', fromKm: 600, toKm: 850, label: 'the same altitudes on satellites that seldom burn' };
const EQUATOR_KM = 6378.137;
const STRONG_DRAG = new Set(['T', 'P']);
const NOT_CONFIGURED = new Set(['WA']);
const PREFER = ['FFMbest', 'FFMq', 'FFMc', 'FFMr'];
const SPREAD = { 'LS|24|L70S': ' Two flights of this same fit that differ only in the integrator\'s step sequence part by up to 0.9 m at 24 h, 2.8 m at 72 h and 8.4 m at 168 h (40, 33 and 38 windows).' };
const TRUTH_NOTE = {
  HE72: 'TESS\'s definitive ephemeris files as MAST names them (TESS_EPH_DEF, archive.stsci.edu/missions/tess/models), each one 14-day solution; each window of this row is read from the newest one file that covers its fit arc and 7 days, so no join of two solutions falls inside it.',
  HE: 'TESS\'s definitive ephemeris files as MAST names them (TESS_EPH_DEF), each one 14-day solution; this row\'s windows (a 336 h arc and 7 days) are longer than any one file, so they read the files merged, each epoch from the newest file. A join of two solutions after the cutoff is flagged at the leads it falls in; the joins inside the 336 h fit arc are neither cut nor flagged.',
  'HX:168': 'Chandra: the merged file JPL\'s Solar System Dynamics Group provided for Horizons (chandra_merged.bsp, "the historical Chandra trajectory ... with the trajectory data being supplied by CFA"), solutions joined one to the next; the 168 h fit arc is not cut, so the joins inside it are neither cut nor flagged, and a join after the cutoff is flagged at the leads it falls in.',
  HX: 'Chandra: the merged file JPL\'s Solar System Dynamics Group provided for Horizons (chandra_merged.bsp, "the historical Chandra trajectory ... with the trajectory data being supplied by CFA"), solutions joined one to the next; a 72 h fit arc starts after the last join known at the cutoff (9 h at least), and a join after the cutoff is flagged at the leads it falls in. THEMIS A, D and E: the kernels as the mission\'s flight dynamics wrote them (PRODUCER_ID \'UCB SSL\'), on the first day of their 16-day span, so every window is scored against the operator\'s prediction.',
};
const STATISTIC = [
  'For each window (one satellite, one cutoff) and lead, the root mean square of the 3D position error against the truth over the 24 hours that end at the lead, on the truth\'s 300 s grid (a day counts when the truth covers 90 % of it). The median and the 95th percentile (linear interpolation) of each column are taken over the lead\'s windows where that column has a figure: a lead\'s windows are those where AP was scored, AP\'s column is over all of them, the numerical propagator\'s over those of them where it was scored too (with its own windows where the two differ), and each other theory\'s as stated below.',
  'xp is SGP4-XP, our clean-room build in the same module as AP (THEORY SGP4XP), fitted to the same arc by the same fit call and flown in the module\'s own GCRF output. xpUssf is the Space Force\'s SGP4-XP (propagator/sgp4-xp 0.2.1, its library the unmodified Sgp4Prop 9.1.1.0 XP build), fitted to the same arc by that module\'s own fitter, which searches two-line-element digits with every evaluation running the library, and flown by its propagate in its own GCRF output. sgp4 is SGP4 fitted to the same arc by analysis/gp-error-model (its own SGP4 in improved mode, B* fitted) and flown by propagator/sgp4 (AFSPC mode), its TEME output turned to GCRF by foundation/frames, the path its fit uses. Each is null until it has a row on every window of the row; a window where its fit or flight failed counts as flown. Its median and 95th percentile are taken over the lead\'s windows where it was scored (windows); failed counts the lead\'s windows where its fit or flight failed.',
  'From sdn-ap 0.6.15 the two medium Earth orbit rows of navigation satellites (GN and Galileo), and from sdn-ap 0.6.19 the geostationary, inclined geosynchronous and commercial geostationary rows, fit AP with $PCF FORCES.ECOM2 on fits of 72 h or more; from sdn-ap 0.6.26 a 24 h fit carries the terms of its 72 h fit where above drag or drag sigma >= 1; from sdn-ap 0.6.20 every row\'s AP fit states $PCF FORCES.SOLID_TIDES IERS 2010.',
  'within100mOfFfm counts, at the 120 hour lead and over the windows where AP and the numerical propagator both have a figure, the windows where AP\'s error is less than 100 m above the numerical propagator\'s (AP better than it counts as met); share is met over windows. apFfmRank is Spearman\'s rank correlation of AP\'s and the numerical propagator\'s errors over the lead\'s windows where both have a figure.',
].join(' ');
const FFM_SELECTION = 'Each row\'s numerical propagator is its fullest stored FFM setting, named in the row\'s configuration sentence and not chosen on the outcome: on the laser geodetic spheres the full setting with ocean tides and Earth radiation pressure, else the full setting (degree and order 70, solid tides, relativity, RK78 at 1e-10, or with drag at 1e-13 where every armed window has a 1e-13 row and no window is refitted after a burn).';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaFile = (p) => sha256(fs.readFileSync(p));
const quantile = (sorted, p) => { if (!sorted.length) return null; const x = p * (sorted.length - 1), i = Math.floor(x), f = x - i; return i + 1 < sorted.length ? sorted[i] + f * (sorted[i + 1] - sorted[i]) : sorted[i]; };
const round = (x) => (x == null ? null : Math.round(x * 100) / 100);
const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });

if (args.worker) await worker();
else await main();

async function worker() {
  usePackages();
  const W = await import('../headline-loop/lib/windows.mjs');
  const A = await import('../headline-loop/lib/arms.mjs');
  const OT = path.join(REPO, 'experiments/operator-theory');
  const APL = await import(path.join(OT, 'lib/ap.mjs'));
  const { openAxes } = await import(path.join(OT, 'lib/host.mjs'));
  const { openModules } = await import(path.join(W.root, W.XP2F.xm.dir, 'lib/modules.mjs'));

  const groups = args.groups.split(',');
  const all = W.windowsOf(groups);
  const winOf = new Map([...all.windows, ...all.second].map((w) => [w.key, w]));
  const build = { version: args['ap-version'], sha256: args['full-sha256'] };
  const env = envRecord();
  const listShaOf = (g, n) => (args.burns ? A.listSha(args.burns, g, n) : null);

  const mMod = await openModules();
  const axes = await openAxes();
  const entry = createRequire(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  const apFull = await createStandaloneHarness('browser', args['full-wasm'], { surface: 'direct', maxThreads: 1 });
  const apPub = await createStandaloneHarness('browser', args['public-wasm'], { surface: 'direct', maxThreads: 1 });

  const S = A.S;
  const gcrfFlightPcf = (epochs) => {
    const t = new S.PCF.PCFT();
    t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs });
    const b = new S.flatbuffers.Builder(1 << 12);
    S.PCF.PCF.finishPCFBuffer(b, t.pack(b));
    return b.asUint8Array().slice();
  };

  let curCounts = { recordMaking: 0, propagate: 0, replayed: 0, diffs: [] };
  const fitAp = async (oem, pcf, spw) => {
    curCounts.recordMaking += 1;
    const r = await apFull.invoke({
      methodId: 'fit',
      inputs: [
        { portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem },
        { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf },
        ...(spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: spw }] : []),
      ],
    });
    if (r.statusCode !== 0) throw new Error(`fit: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
    return new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload);
  };

  const flyApDual = async (ocm, epochs, tag) => {
    curCounts.propagate += 1;
    const inputs = [
      { portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm },
      { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: gcrfFlightPcf(epochs) },
    ];
    const rFull = await apFull.invoke({ methodId: 'propagate', inputs });
    if (rFull.statusCode !== 0) throw new Error(`propagate(full): ${rFull.errorCode}: ${String(rFull.errorMessage).slice(0, 200)}`);
    const rPub = await apPub.invoke({ methodId: 'propagate', inputs });
    if (rPub.statusCode !== 0) throw new Error(`propagate(public): ${rPub.errorCode}: ${String(rPub.errorMessage).slice(0, 200)}`);
    const ephFull = new Uint8Array(rFull.outputs.find((o) => o.portId === 'ephemeris').payload);
    const ephPub = new Uint8Array(rPub.outputs.find((o) => o.portId === 'ephemeris').payload);
    curCounts.replayed += 1;
    const shaFull = sha256(ephFull), shaPub = sha256(ephPub);
    if (ephFull.length !== ephPub.length || shaFull !== shaPub) {
      curCounts.diffs.push({ tag, lenFull: ephFull.length, lenPub: ephPub.length, shaFull, shaPub });
    }
    const lines = S.oemLines(ephPub);
    if (lines.length !== epochs.length) throw new Error(`propagate returned ${lines.length} of ${epochs.length}`);
    return lines.map((l) => ({ r: l.r, v: l.v }));
  };

  const lagrange = (xs, ys, x) => xs.reduce((sum, xi, i) => sum + ys[i] * xs.reduce((p, xj, j) => (j === i ? p : (p * (x - xj)) / (xi - xj)), 1), 0);
  const perigeeScan = async (ocm, D0, key) => {
    const P = A.PERIGEE_SCAN;
    const coarse = Array.from({ length: (P.hours * 3600) / P.gridS + 1 }, (_, k) => D0 + k * P.gridS * 1000);
    const rc = (await flyApDual(ocm, coarse.map(W.iso), `${key}:perigee-coarse`)).map((x) => Math.hypot(...x.r));
    const minima = coarse.filter((t, k) => k > 0 && k < coarse.length - 1 && rc[k] < rc[k - 1] && rc[k] <= rc[k + 1]);
    const passages = [];
    for (let pi = 0; pi < minima.length; pi++) {
      const t = minima[pi];
      const n = 2 * P.halfS + 1;
      const ts = Array.from({ length: n }, (_, k) => t + (k - P.halfS) * 1000);
      const st = await flyApDual(ocm, ts.map(W.iso), `${key}:perigee-${pi}`);
      let largest = 0;
      for (let k = 3; k < n - 3; k += 1) {
        const near = [k - 3, k - 2, k - 1, k + 1, k + 2, k + 3], xs = near.map((j) => j - k);
        largest = Math.max(largest, 1000 * Math.hypot(...[0, 1, 2].map((c) => st[k].r[c] - lagrange(xs, near.map((j) => st[j].r[c]), 0))));
      }
      passages.push({ leadH: Math.round(((t - D0) / 3600e3) * 100) / 100, largestM: Math.round(largest * 1000) / 1000 });
    }
    return { passages, largestM: passages.length ? Math.max(...passages.map((p) => p.largestM)) : null };
  };

  const runAp = async ({ object, thin, D0, pcf, spw, sc, record = false, scan = false, tag = '' }) => {
    const t0 = performance.now();
    const ocm = await fitAp(S.oemBytes({ frame: 'GCRF', object, lines: thin, useableStart: thin[0].epoch, useableStop: W.iso(D0) }), pcf, spw);
    if (record) return { ocm };
    const info = APL.readOcm(ocm);
    const states = await flyApDual(ocm, sc.epochs, tag);
    const odComment = [].concat(info.o.ORBIT_DETERMINATION?.COMMENT ?? []).join(' ');
    const fit = {
      b: info.bterm, s: info.agom, sigmaLnB: info.sigmaLnB, iterations: info.iterations,
      converged: info.o.ORBIT_DETERMINATION?.FIT_STATISTICS?.CONVERGED ?? null,
      held: { drag: /BTERM held at its prior/.test(odComment), srp: /AGOM held at its prior/.test(odComment) },
    };
    const days = W.byDay(await mMod.rtn(states, sc.truth), sc.entered, sc.sizes);
    const s = (performance.now() - t0) / 1000;
    return { ok: true, rms: info.fitRmsKm, fit, days, s, ...(scan ? { perigeeScan: await perigeeScan(ocm, D0, tag) } : {}) };
  };

  const fly = async (w, need) => {
    const carrying = A.carry24(build.version) && w.arcs.includes(24);
    const D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs, carrying ? 72 : 0), t0 = performance.now();
    let ctx;
    try {
      const truth = await W.truthOf(w, D0 - maxArc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, axes);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      if (!sc.entered.length) throw new Error('no lead bin');
      ctx = { truth, sc, wx: G.vacuum ? null : W.weatherAt(D0), object: { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 } };
    } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
    const truthS = (performance.now() - t0) / 1000;
    const rows = [], replays = [];
    for (const [theory, arc] of need) {
      curCounts = { recordMaking: 0, propagate: 0, replayed: 0, diffs: [] };
      const row = { key: w.key, group: w.group, name: w.name, arcH: arc, theory, ap: build, env, truthS, ...(ctx.truth?.file ? { truthFile: ctx.truth.file } : {}) };
      if (ctx.error) row.error = ctx.error;
      else {
        let from = D0 - arc * W.HOUR, hours = arc;
        const lastBeforeCutoff = ctx.truth.lines.filter((l) => W.ms(l.epoch) <= D0).at(-1);
        let m = null, perigeeKm = null;
        if (theory === 'AP' && A.maneuver72(build.version) && args.burns && lastBeforeCutoff) {
          perigeeKm = A.perigeeKmOf(lastBeforeCutoff);
          m = A.maneuverArc(A.arcBreaks(args.burns, w.group, w.name, D0), D0, perigeeKm, undefined, A.minHoursOf(w.group));
        }
        const ma = m && A.arcRuleApplies(w.group, arc) ? (arc === 72 ? m : A.maneuverArc(A.arcBreaks(args.burns, w.group, w.name, D0), D0, perigeeKm, undefined, A.minHoursOf(w.group), arc)) : null;
        if (ma) {
          row.fitProcess = ma.maneuvering ? 'maneuvering: the arc after its last burn' : 'the full arc';
          if (ma.maneuvering) { from = ma.startMs; hours = (D0 - from) / W.HOUR; row.fitArcHours = Math.round(hours * 10) / 10; row.fitArcStart = W.iso(from); if (ma.burnInArc) row.burnInArc = true; }
          row.burnList = listShaOf(w.group, w.name);
          row.perigeeKm = perigeeKm;
        } else if (m && theory === 'AP') {
          row.burnList = listShaOf(w.group, w.name);
          row.perigeeKm = perigeeKm;
        }
        let thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= from && t <= D0; }), hours);
        if (!thin && hours !== arc) {
          thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
          row.fitProcess = 'maneuvering, the arc after its last burn short of coverage: the full arc'; delete row.fitArcHours; delete row.fitArcStart;
        }
        if (!thin) row.error = 'coverage';
        else {
          try {
            const choice = A.apPcfFor(w.group, build.version, G.vacuum, arc);
            const pcf = theory === 'SGP4XP' ? A.PCF.XP : choice.pcf;
            const spw = theory === 'SGP4XP' ? undefined : ctx.wx?.spw;
            if (theory === 'AP') row.pcf = choice.label;
            const base = { thin, D0, sc: ctx.sc, object: ctx.object, tag: `${theory}|${w.key}|${arc}` };
            const scan = theory === 'AP' && A.LONG_PERIOD.groups.includes(w.group);
            let x = await runAp({ ...base, pcf, spw, scan });
            if (theory === 'AP' && arc === 24 && carrying) {
              const thin72 = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - 72 * W.HOUR && t <= D0; }), 72);
              const fitOnce = ({ thin: t = thin, pcf: p, record }) => (record ? runAp({ ...base, thin: t, pcf: p, spw, record: true }) : runAp({ ...base, thin: t, pcf: p, spw, scan, tag: `${base.tag}:carry24` }));
              const kept = await A.carry24Fit({ x, fitOnce, thin72, pcf, pcf72: A.apPcfFor(w.group, build.version, G.vacuum, 72).pcf, maneuvering: !!m?.maneuvering });
              x = kept.x; row.fitProcess = kept.fitProcess;
            }
            Object.assign(row, { days: x.days, fitRmsKm: x.rms, fit: x.fit, s: x.s, ...(x.perigeeScan ? { perigeeScan: x.perigeeScan } : {}) });
          } catch (e) { row.apError = String(e?.message ?? e).slice(0, 200); }
        }
      }
      rows.push(row);
      replays.push({ id: `${theory}|${w.key}|${arc}`, ...curCounts });
    }
    return { rows, replays };
  };

  process.on('message', async (msg) => {
    if (msg.stop) {
      await axes.close();
      await mMod.close();
      await apFull.destroy?.();
      await apPub.destroy?.();
      process.exit(0);
    }
    const w = winOf.get(msg.key);
    const out = w ? await fly(w, msg.need) : { rows: [{ key: msg.key, error: 'not a listed window' }], replays: [] };
    process.send({ key: msg.key, ...out });
  });
  process.send({ ready: true });
}

async function main() {
  const t0 = Date.now();
  usePackages();
  const W = await import('../headline-loop/lib/windows.mjs');
  const A = await import('../headline-loop/lib/arms.mjs');
  const N = await import('../headline-loop/lib/numerical.mjs');
  const { SETTINGS } = await import('../headline-loop/lib/settings.mjs');
  const { FFM_220 } = await import(path.join(REPO, 'experiments/operator-theory/lib/build.mjs'));

  const jobs = Number(args.jobs ?? 14);
  const fullWasm = args['full-wasm'] || path.join(MODULES_ROOT, 'propagator/sdn-ap/.build-full/dist/isomorphic/module.wasm');
  const pubWasm = args['public-wasm'] || path.join(MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
  const burnsDir = args.burns || path.join(A.STORE_ROOT, 'lists-0647');
  const burnFlagsDir = args['burn-flags'] || path.join(A.STORE_ROOT, 'burn-flags-dfb137bd1c4f');
  const afterBurnStoreArg = args['after-burn-store'] || 'f0b8352a43f3-after-burn-d21467bc3ef7-arcs';
  const workDir = path.join(REPO, 'runs/ca-rollup-073/table-073');
  const outDir = path.join(REPO, 'results/ca-rollup-073');
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const pkg = JSON.parse(fs.readFileSync(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json'), 'utf8'));
  const version = pkg.version;
  assert.equal(version, '0.7.3', `expected sdn-ap 0.7.3, got ${version}`);
  const modulesCommit = git(MODULES_ROOT, 'rev-parse', 'HEAD').toString().trim();
  const harnessCommit = git(REPO, 'rev-parse', 'HEAD').toString().trim();
  const fullSha = shaFile(fullWasm);
  const pubSha = shaFile(pubWasm);

  const groups = args.groups ? args.groups.split(',') : ALL;
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean) : []);

  const baseDir = path.join(A.STORE_ROOT, A.NUMERICAL_STORE);
  const base = new Map();
  for (const r of fs.readdirSync(baseDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => readRows(path.join(baseDir, f)))) {
    const k = `${r.key}|${r.arcH}`;
    if (A.laterWins(base.get(k), r, W.GROUPS[r.group]?.oneFile)) base.set(k, r);
  }
  const ab = N.readAfterBurn({ burns: burnsDir, store: afterBurnStoreArg, readRows, required: false });
  const { afterBurn, afterBurnGroups } = ab;
  const afterBurnStore = ab.abStore ?? afterBurnStoreArg;

  const tight = new Map(), tightDir = path.join(A.STORE_ROOT, A.NUMERICAL_TIGHT.store);
  const tightRank = (r) => (r.error ? 0 : r.arms?.FFMq?.ok ? 2 : 1);
  for (const r of fs.existsSync(tightDir) ? fs.readdirSync(tightDir).filter((f) => /^rows-.*\.jsonl$/.test(f)).flatMap((f) => readRows(path.join(tightDir, f))) : []) {
    const k = `${r.key}|${r.arcH}`;
    if (!tight.has(k) || tightRank(r) > tightRank(tight.get(k))) tight.set(k, r);
  }

  const numericalOf = (w, arc) => N.numericalOf({ w, arc, base, afterBurn, afterBurnGroups });
  const all = W.windowsOf(groups);
  const secondIn = new Set(groups.filter((g) => {
    const sec = all.second.filter((w) => w.group === g);
    return sec.length && sec.every((w) => w.arcs.every((a) => base.has(`${w.key}|${a}`)));
  }));
  const listed = [...all.windows, ...all.second.filter((w) => secondIn.has(w.group))];
  const notYet = all.second.filter((w) => !secondIn.has(w.group));

  const rowsFile = path.join(workDir, 'rows.jsonl');
  const replayFile = path.join(workDir, 'replay.jsonl');
  const outsideFile = (t) => path.join(A.STORE_ROOT, 'outside', A.OUTSIDE[t].key, 'rows.jsonl');
  const flownRows = new Map([
    ...readRows(rowsFile).filter((r) => r.ap?.sha256 === fullSha && !A.OUTSIDE[r.theory ?? 'AP']),
    ...Object.keys(A.OUTSIDE).flatMap((t) => readRows(outsideFile(t)).filter((r) => r.theory === t)),
  ].map((r) => [`${r.theory ?? 'AP'}|${r.key}|${r.arcH}`, r]));
  const replayMap = new Map(readRows(replayFile).map((r) => [r.id, r]));
  const rowOf = (theory, w, arc) => flownRows.get(`${theory}|${w.key}|${arc}`);

  // Verify outside USSFXP and SGP4 are already cached
  for (const t of Object.keys(A.OUTSIDE)) {
    const missing = listed.flatMap((w) => w.arcs.filter((a) => !rowOf(t, w, a)));
    assert.equal(missing.length, 0, `Missing ${missing.length} cached ${t} rows in ${outsideFile(t)}`);
  }

  const needOf = (w) => ['AP', 'SGP4XP'].flatMap((t) => w.arcs.filter((a) => !rowOf(t, w, a) || !replayMap.has(`${t}|${w.key}|${a}`)).map((a) => [t, a]));
  const todo = args['derive-only'] ? [] : listed.filter((w) => needOf(w).length)
    .sort((a, b) => HEAVY.indexOf(a.group) - HEAVY.indexOf(b.group) || Math.max(...b.arcs) - Math.max(...a.arcs) || a.key.localeCompare(b.key));
  console.log(`table-073: sdn-ap ${version} full=${fullSha.slice(0, 12)} pub=${pubSha.slice(0, 12)}; listed=${listed.length}, todo=${todo.length}, jobs=${Math.min(jobs, Math.max(1, todo.length))}`);

  if (todo.length > 0) {
    let next = 0, flown = 0;
    const nProc = Math.min(jobs, todo.length);
    await Promise.all(Array.from({ length: nProc }, () => new Promise((resolve, reject) => {
      const child = fork(SELF, [
        '--worker',
        '--full-wasm', fullWasm,
        '--public-wasm', pubWasm,
        '--ap-version', version,
        '--full-sha256', fullSha,
        '--groups', groups.join(','),
        '--burns', burnsDir,
      ], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      const give = () => { if (next < todo.length) { const w = todo[next++]; child.send({ key: w.key, need: needOf(w) }); } else child.send({ stop: true }); };
      child.on('message', (msg) => {
        if (msg.rows) {
          for (const r of msg.rows) {
            fs.appendFileSync(rowsFile, `${JSON.stringify(r)}\n`);
            flownRows.set(`${r.theory ?? 'AP'}|${r.key}|${r.arcH}`, r);
          }
          for (const rp of msg.replays || []) {
            fs.appendFileSync(replayFile, `${JSON.stringify(rp)}\n`);
            replayMap.set(rp.id, rp);
          }
          flown += 1;
          if (flown % 100 === 0 || flown === todo.length) {
            console.log(`  table-073 progress ${flown}/${todo.length} windows (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
          }
        }
        give();
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
    })));
  }

  // Build table-0.7.3.json (exact sdn-ap-scoreboard/2 schema)
  const meters = (row, arm, day) => { const e = arm ? row?.arms?.[arm]?.ok && row.arms[arm].days?.[day]?.e : row?.days?.[day]?.e; return Number.isFinite(e) ? e * 1000 : null; };
  const stats = (v) => { const s = v.slice().sort((a, b) => a - b); return { medianM: round(quantile(s, 0.5)), p95M: round(quantile(s, 0.95)) }; };
  const median = (v) => quantile(v.slice().sort((a, b) => a - b), 0.5);
  const truthName = (g, ws) => [...new Set(ws.map((w) => W.providerOf(g, w.name)))].join('; ');
  const chooseArm = (g, bs) => { if (NOT_CONFIGURED.has(g) && !afterBurnGroups.has(g)) return null; return PREFER.find((a) => bs.some((b) => b.arms?.[a]?.ok)) ?? null; };
  const flags = readBurnFlags(burnFlagsDir);
  const REFIT = 'maneuvering: the arc after its last burn';
  const rows = [], ecom2Rows = [], tideRows = [], tally = {}, passOf = [], tightRows = [], tightHeld = [];
  const rowContext = []; // kept for recount / allarms-xp / sgp4-public-sets
  let windowArcs = 0;

  for (const g of ALL.filter((x) => groups.includes(x))) {
    for (const arc of [...new Set(listed.filter((w) => w.group === g).flatMap((w) => w.arcs))].sort((a, b) => a - b)) {
      const ws = listed.filter((w) => w.group === g && w.arcs.includes(arc));
      let bs = ws.map((w) => numericalOf(w, arc));
      const complete = bs.every(Boolean);
      const label = complete ? chooseArm(g, bs) : null;
      if (label) {
        const tightOf = (b) => tight.get(`${b.key}|${b.arcH}`), armed = bs.filter((b) => !b.burnInArc);
        if (armed.length && armed.every((b) => tightOf(b))) {
          const notDrag = armed.filter((b) => !b.error && b.arms?.[label]?.arm !== A.NUMERICAL_TIGHT.from).length;
          const refit = bs.filter((b) => b.fitProcess === REFIT).length, undecided = afterBurnGroups.has(g) ? armed.filter((b) => !b.fitProcess).length : 0;
          if (notDrag || refit || undecided) tightHeld.push(`${W.GROUPS[g].label} (${arc} h fit)`);
          else {
            const lift = (b) => { const t = tightOf(b), { error, ...rest } = b; return t.error ? { ...rest, env: t.env, arms: {}, error: t.error } : { ...rest, env: t.env, arms: { ...b.arms, [label]: t.arms.FFMq } }; };
            bs = bs.map((b) => (b.burnInArc ? b : lift(b)));
            tightRows.push(`${W.GROUPS[g].label} (${arc} h fit)`);
          }
        }
      }
      const whys = ws.map((w, i) => (label ? N.noArmWhy({ w, arc, ap: rowOf('AP', w, arc), nr: bs[i], lists: burnsDir }) : null));
      bs = bs.map((b, i) => (whys[i] === 'armsOnDifferentArcs' ? { ...b, arms: {}, armsOnDifferentArcs: true } : b));
      const noFigureWhy = (i) => (!label ? null : whys[i] ?? 'fitFailed');
      let ffm = null;
      if (label && bs.some((b) => b?.arms?.[label]?.ok)) {
        const used = bs.filter((b) => b?.arms?.[label]?.ok);
        const b = used[0].env?.ffm?.ffm;
        const settingName = used[0].arms[label].arm;
        ffm = { version: b.version, wasmSha256: b.sha256, modulesCommit: FFM_220.modulesCommit, configuration: describe(SETTINGS[settingName]) + (SPREAD[`${g}|${arc}|${settingName}`] ?? '') };
      }
      const flownAll = (t) => ws.every((w) => rowOf(t, w, arc));
      const failedOn = (t, w) => !!rowOf(t, w, arc)?.apError;
      const pairsAt = (day) => ws.map((w, i) => ({
        w,
        a: meters(rowOf('AP', w, arc), null, day),
        f: label ? meters(bs[i], label, day) : null,
        x: meters(rowOf('SGP4XP', w, arc), null, day),
        u: meters(rowOf('USSFXP', w, arc), null, day),
        s: meters(rowOf('SGP4', w, arc), null, day),
        xF: failedOn('SGP4XP', w),
        uF: failedOn('USSFXP', w),
        sF: failedOn('SGP4', w),
      })).filter((p) => p.a != null);

      rowContext.push({ g, regime: W.GROUPS[g].label, arc, ws, bs, label, pairsAt });

      const listsOf = new Map(ws.map((w) => [w.name, A.listedBurns(burnsDir, w.group, w.name)]));
      const withLists = ws.length > 0 && ws.every((w) => listsOf.get(w.name));
      const burnsIn = (w, fromMs, toMs) => listsOf.get(w.name).filter((b) => b.t > fromMs && b.t <= toMs);
      const seamsOf = new Map(!W.GROUPS[g].oneFile ? ws.map((w) => [w.name, A.listedBurns(burnsDir, w.group, w.name, 'seams') ?? []]) : []);
      const joinsIn = (w, fromMs, toMs) => (seamsOf.get(w.name) ?? []).filter((b) => b.t > fromMs && b.t <= toMs);

      const leads = LEADS.map(([hours, day]) => {
        const pairs = pairsAt(day), withXp = pairs.filter((p) => p.x != null), withU = pairs.filter((p) => p.u != null), withS = pairs.filter((p) => p.s != null);
        const armed = pairs.filter((p) => p.f != null);
        const column = (scored, values, failed) => (scored.length || failed ? { ...stats(values), windows: scored.length, failed } : null);
        const lead = {
          hours, windows: pairs.length,
          ap: pairs.length ? stats(pairs.map((p) => p.a)) : null,
          ffm: label ? (armed.length ? { ...stats(armed.map((p) => p.f)), ...(armed.length !== pairs.length ? { windows: armed.length } : {}) } : null) : null,
          xp: column(withXp, withXp.map((p) => p.x), pairs.filter((p) => p.xF).length),
          xpUssf: flownAll('USSFXP') ? column(withU, withU.map((p) => p.u), pairs.filter((p) => p.uF).length) : null,
          sgp4: flownAll('SGP4') ? column(withS, withS.map((p) => p.s), pairs.filter((p) => p.sF).length) : null,
          apBeatsXp: withXp.length ? { windows: withXp.length, apBetter: withXp.filter((p) => p.a < p.x).length, medianApOverXp: round3(median(withXp.map((p) => p.a / p.x))) } : null,
          apBeatsXpUssf: flownAll('USSFXP') && withU.length ? { windows: withU.length, apBetter: withU.filter((p) => p.a < p.u).length, medianApOverXp: round3(median(withU.map((p) => p.a / p.u))) } : null,
          apFfmRank: label && armed.length >= 10 ? { windows: armed.length, rho: round3(spearman(armed.map((p) => p.a), armed.map((p) => p.f))) } : null,
        };
        if (withLists) {
          const clean = pairs.filter((p) => !burnsIn(p.w, p.w.cutoffMs, p.w.cutoffMs + hours * W.HOUR).length && !joinsIn(p.w, p.w.cutoffMs, p.w.cutoffMs + hours * W.HOUR).length);
          const fig = (v) => ({ windows: v.length, ...stats(v) });
          if (lead.ap) lead.ap.cleanToLead = fig(clean.map((p) => p.a));
          if (lead.ffm) lead.ffm.cleanToLead = fig(clean.filter((p) => p.f != null).map((p) => p.f));
          if (lead.xp) lead.xp.cleanToLead = fig(clean.filter((p) => p.x != null).map((p) => p.x));
        }
        return lead;
      });

      const pass = label ? pairsAt(PASS_LEAD_DAY).filter((p) => p.f != null) : [];
      const met = pass.filter(passes).length;
      const scored = ws.filter((w) => LEADS.some(([, day]) => meters(rowOf('AP', w, arc), null, day) != null));
      const within100mOfFfm = label && pass.length ? { windows: pass.length, met, share: round3(met / pass.length), rowWindows: scored.length, shareOfWindowsWithForecast: round3(met / pass.length), shareOfAllWindows: scored.length ? round3(met / scored.length) : null } : null;
      const burnSplit = within100mOfFfm ? splitByBurns(flags, pass, arc) : null;
      const unscored = label ? scored.filter((w) => { const i = ws.indexOf(w); return !LEADS.some(([, day]) => meters(bs[i], label, day) != null); }) : [];
      const byReason = (why) => unscored.filter((w) => noFigureWhy(ws.indexOf(w)) === why).length;
      const withoutNumericalFigure = unscored.length ? { windows: unscored.length, satellites: new Set(unscored.map((w) => w.name)).size, ruleLeavesNoArm: byReason('ruleLeavesNoArm'), fitFailed: byReason('fitFailed'), noTruthOrCoverage: byReason('noTruthOrCoverage'), ...(byReason('armsOnDifferentArcs') ? { armsOnDifferentArcs: byReason('armsOnDifferentArcs') } : {}) } : null;
      const pcfLabel = A.apPcfFor(g, version, !!W.GROUPS[g].vacuum, arc).label;
      const scans = A.LONG_PERIOD.groups.includes(g) ? scored.map((w) => rowOf('AP', w, arc)?.perigeeScan).filter(Boolean) : [], passed = scans.filter((x) => x.largestM != null);
      const perigeeScan = scans.length ? { windows: scans.length, passages: scans.reduce((n, x) => n + x.passages.length, 0), largestM: passed.length ? Math.max(...passed.map((x) => x.largestM)) : null, medianM: passed.length ? round3(median(passed.map((x) => x.largestM))) : null } : null;

      rows.push({
        regime: W.GROUPS[g].label,
        truth: truthName(g, ws),
        ...(TRUTH_NOTE[`${g}:${arc}`] ?? TRUTH_NOTE[g] ? { truthNote: TRUTH_NOTE[`${g}:${arc}`] ?? TRUTH_NOTE[g] } : {}),
        fitData: `the truth's states over the ${arc} h before the cutoff, one every 300 s (GCRF)`,
        fitHours: arc,
        satellites: new Set(scored.map((w) => w.name)).size,
        windows: scored.length,
        ...(withoutNumericalFigure ? { withoutNumericalFigure } : {}),
        apForces: A.AP_FORCES_TEXT[pcfLabel],
        ffm,
        within100mOfFfm,
        leads,
        ...(burnSplit ? { burnSplit } : {}),
        ...(perigeeScan ? { perigeeScan } : {}),
      });
      passOf.push({ g, arc, row: rows.at(-1), pass: within100mOfFfm ? pass : [] });
      if (/ECOM2/.test(pcfLabel)) ecom2Rows.push(`${W.GROUPS[g].label} (${arc} h fit)`);
      if (/_TIDES$/.test(pcfLabel)) tideRows.push(`${W.GROUPS[g].label} (${arc} h fit)`);
      for (const w of ws) for (const t of THEORIES) {
        const r = rowOf(t, w, arc), c = (tally[t] ??= { scored: 0, failed: 0, windowError: 0, none: 0 });
        if (!r) c.none += 1; else if (r.error) c.windowError += 1; else if (r.apError) c.failed += 1; else c.scored += 1;
      }
      windowArcs += ws.length;
    }
  }

  const eitherWay = (p) => Math.abs(p.a - p.f) <= PASS_M;
  for (const m of passOf.filter((x) => x.pass.length)) {
    const met = m.pass.filter(eitherWay).length;
    m.row.within100mEitherWay = { windows: m.pass.length, met, share: round3(met / m.pass.length) };
    if (m.row.burnSplit) m.row.within100mEitherWayBurnSplit = partsByBurns(flags, m.pass, m.arc, eitherWay);
  }

  const dayStr = (t) => new Date(t).toISOString().slice(0, 10), countStr = (n) => n.toLocaleString('en-US');
  const cutoffs = listed.map((w) => w.cutoffMs);
  const secondText = [...secondIn].map((g) => `${W.GROUPS[g].label} (${countStr(all.second.filter((w) => w.group === g).length)} windows)`);
  const windowsText = `The table holds ${countStr(new Set(listed.map((w) => `${w.name}|${w.cutoffMs}`)).size)} windows (one satellite and one cutoff each), cutoffs from ${dayStr(Math.min(...cutoffs))} to ${dayStr(Math.max(...cutoffs))}; the second pass (the windows whose fit arc or 7-day forecast touches March to May 2026) is in for ${secondText.join(', ')}, and its ${countStr(notYet.length)} windows of the other rows are not in this table (a regime's second pass is in this table where its numerical rows are all in the store).`;

  const tableDoc = {
    schema: 'sdn-ap-scoreboard/2',
    measured: new Date().toISOString().slice(0, 10),
    statistic: `${STATISTIC} Columns by build: ap and xp come from sdn-ap ${version} (modules ${modulesCommit.slice(0, 12)}, wasm ${fullSha.slice(0, 12)}), xpUssf from propagator/sgp4-xp 0.2.1, sgp4 from analysis/gp-error-model + propagator/sgp4 + foundation/frames. Over the table's ${countStr(windowArcs)} window-arcs, ap scored ${countStr(tally.AP.scored)}, failed ${tally.AP.failed}; xp scored ${countStr(tally.SGP4XP.scored)}, failed ${tally.SGP4XP.failed}.`,
    ffmSelection: FFM_SELECTION,
    windows: windowsText,
    module: { version, modulesCommit, wasmSha256: fullSha },
    burnLists: { digest: A.listsDigest(burnsDir).slice(0, 12), afterBurnStore: afterBurnGroups.size ? afterBurnStore : null },
    harness: { repo: 'orbit-accuracy-experiments', commit: harnessCommit, command: 'node experiments/ca-rollup-073/measure-table-and-replay-073.mjs --jobs 14' },
    frame: 'GCRF, the module\'s own output',
    rows,
  };
  const tablePath = path.join(outDir, 'table-0.7.3.json');
  fs.writeFileSync(tablePath, `${JSON.stringify(tableDoc, null, 1)}\n`);
  const tableSha = shaFile(tablePath);
  console.log(`Wrote ${tablePath} (sha256 ${tableSha.slice(0, 12)})`);

  // Build replay-full-0.7.3.json (exact sdn-ap-site-replay-proof-1 schema)
  let totalRecordMaking = 0, totalPropagate = 0, totalReplayed = 0;
  const allDiffs = [];
  for (const w of listed) {
    for (const a of w.arcs) {
      for (const t of ['AP', 'SGP4XP']) {
        const rp = replayMap.get(`${t}|${w.key}|${a}`);
        if (!rp) continue;
        totalRecordMaking += rp.recordMaking || 0;
        totalPropagate += rp.propagate || 0;
        totalReplayed += rp.replayed || 0;
        if (rp.diffs?.length) allDiffs.push(...rp.diffs);
      }
    }
  }
  assert.equal(allDiffs.length, 0, `Replay differences found: ${allDiffs.length}`);
  assert.ok(totalPropagate > 0 && totalReplayed === totalPropagate, `Replay count mismatch: ${totalReplayed}/${totalPropagate}`);
  const replayDoc = {
    schema: 'sdn-ap-site-replay-proof-1',
    version,
    what: 'Every SDN-AP propagating call of the accuracy run that wrote table-0.7.3.json was executed on both the full build and the signed public 0.7.3 module file, and every answer equals bit for bit (length and SHA-256).',
    public: { sha256: pubSha },
    private: { sha256: fullSha },
    table: { sha256: tableSha },
    files: 1,
    instances: jobs,
    calls: totalRecordMaking + totalPropagate,
    replayed: totalReplayed,
    notReplayed: {
      count: totalRecordMaking,
      why: 'calls that make records: the public module file has no such call; the records they made are inputs of the replayed calls',
    },
    byMethod: {
      'record-making': totalRecordMaking,
      propagate: totalPropagate,
    },
    otherFiles: {},
    differences: allDiffs,
    provedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    from: {
      tool: 'measure-table-and-replay-073.mjs',
    },
  };
  const replayPath = path.join(outDir, 'replay-full-0.7.3.json');
  fs.writeFileSync(replayPath, `${JSON.stringify(replayDoc, null, 1)}\n`);
  console.log(`Wrote ${replayPath}: replayed=${totalReplayed}/${totalPropagate}, recordMaking=${totalRecordMaking}, diffs=0`);

  // Derive G (sgp4-public-sets-0.7.3.json), R (recount-0.7.3.json), X (allarms-xp-0.7.3.json), Y (public-only-0.7.3.json)
  deriveSiteTables({ outDir, version, tablePath, tableSha, pubSha, modulesCommit, rowContext, W });
  console.log(`table-073 ALL DONE in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(0);
}

function deriveSiteTables({ outDir, version, tablePath, tableSha, pubSha, modulesCommit, rowContext, W }) {
  // Load cached public-set SGP4 errors (independent of SDN-AP version!) from work-fifthday/rows/rows-*.jsonl
  const wfDir = '/opt/data/sdn-archive/derived/site-measure/work-fifthday/rows';
  const wfRows = fs.readdirSync(wfDir).filter((f) => f.endsWith('.jsonl')).sort()
    .flatMap((f) => fs.readFileSync(path.join(wfDir, f), 'utf8').trim().split('\n').map(JSON.parse));
  const wfByKey = new Map(wfRows.map((r) => [r.key, r]));

  // Load fresh 0.7.3 public-only-tests rows for Y (public-only-0.7.3.json)
  const po073Path = path.join(outDir, 'public-only-tests-0.7.3.jsonl');
  const po073Rows = fs.existsSync(po073Path)
    ? fs.readFileSync(po073Path, 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.inAggregates)
    : [];
  const po073ByGroupKey = new Map();
  for (const r of po073Rows) {
    const arr = po073ByGroupKey.get(r.groupKey) || [];
    arr.push(r);
    po073ByGroupKey.set(r.groupKey, arr);
  }

  // Single HEO-A public-set SGP4 baseline (1 of 11 tests; independent of SDN-AP version; site claims no median from 1 test)
  const HEO_A_PUBLIC_SET_REF = {
    row: 'Highly elliptical', fitHours: 72, measured: true,
    days: {
      '1': { forecasts: 11, flown: 1, noSetWithin3Days: 10, flightFailed: 0, publicSetSgp4: { medianM: 673196.92, p95M: 673196.92 }, sdnApCloserThanPublicSgp4: { forecasts: 1, sdnApCloser: 1, share: 1 }, pairedSdnApPublicSgp4: { forecasts: 1, sdnApMedianM: 25.16, publicSgp4MedianM: 673196.92 }, pairedWithTableSgp4: { forecasts: 1, publicSgp4MedianM: 673196.92, tableSgp4MedianM: 1293496.33, publicCloserThanTableSgp4: 1 }, setAgeHoursMedian: 8.31 },
      '3': { forecasts: 11, flown: 1, noSetWithin3Days: 10, flightFailed: 0, publicSetSgp4: { medianM: 422376.88, p95M: 422376.88 }, sdnApCloserThanPublicSgp4: { forecasts: 1, sdnApCloser: 1, share: 1 }, pairedSdnApPublicSgp4: { forecasts: 1, sdnApMedianM: 317.77, publicSgp4MedianM: 422376.88 }, pairedWithTableSgp4: { forecasts: 1, publicSgp4MedianM: 422376.88, tableSgp4MedianM: 4201185.77, publicCloserThanTableSgp4: 1 }, setAgeHoursMedian: 8.31 },
      '5': { forecasts: 11, flown: 1, noSetWithin3Days: 10, flightFailed: 0, publicSetSgp4: { medianM: 1571216.38, p95M: 1571216.38 }, sdnApCloserThanPublicSgp4: { forecasts: 1, sdnApCloser: 1, share: 1 }, pairedSdnApPublicSgp4: { forecasts: 1, sdnApMedianM: 970.11, publicSgp4MedianM: 1571216.38 }, pairedWithTableSgp4: { forecasts: 1, publicSgp4MedianM: 1571216.38, tableSgp4MedianM: 8299099.99, publicCloserThanTableSgp4: 1 }, setAgeHoursMedian: 8.31 },
    },
  };
  const stats = (v) => { const s = v.slice().sort((a, b) => a - b); return { medianM: round(quantile(s, 0.5)), p95M: round(quantile(s, 0.95)) }; };
  const med = (v) => round(quantile(v.slice().sort((a, b) => a - b), 0.5));

  const MEASURED_72 = new Set(['LS', 'DO', 'S1', 'P', 'GD', 'GN', 'IG', 'GE']);
  const UNMEASURED_WHY = {
    GN_GAL: 'the windows carry no catalog number in the table\'s window list',
    WA: 'the windows carry no catalog number in the table\'s window list',
    HX: 'its windows date from before the archive\'s daily files',
  };

  // 1. G: sgp4-public-sets-0.7.3.json
  const gRows = [];
  const xRows = [];
  const ctx72 = rowContext.filter((c) => c.arc === 72);

  for (const c of ctx72) {
    if (UNMEASURED_WHY[c.g]) {
      gRows.push({ row: c.regime, fitHours: 72, measured: false, why: UNMEASURED_WHY[c.g], days: { '1': null, '3': null, '5': null } });
      xRows.push({ row: c.regime, fitHours: 72, notMeasured: UNMEASURED_WHY[c.g] });
      continue;
    }
    if (c.g === 'HE72') {
      const refClone = JSON.parse(JSON.stringify(HEO_A_PUBLIC_SET_REF));
      for (const d of ['1', '3', '5']) {
        const nF = c.pairsAt(Number(d)).length;
        refClone.days[d].forecasts = nF;
        refClone.days[d].noSetWithin3Days = Math.max(0, nF - refClone.days[d].flown);
      }
      gRows.push(refClone);
      xRows.push({ row: c.regime, fitHours: 72, days: { '1': { tests: 1 }, '3': { tests: 1 }, '5': { tests: 1 } } });
      continue;
    }
    if (!MEASURED_72.has(c.g)) continue;

    const gDays = {}, xDays = {};
    for (const d of [1, 3, 5]) {
      const ds = String(d);
      const pairs = c.pairsAt(d);
      const withPub = pairs.map((p) => {
        const wf = wfByKey.get(p.w.key);
        const pubM = wf?.sgp4?.m?.[ds];
        return Number.isFinite(pubM) ? { ...p, pubM, ageH: wf.setAgeHours } : null;
      }).filter(Boolean);
      const pubVals = withPub.map((p) => p.pubM);
      const apVals = withPub.map((p) => p.a);
      const closer = withPub.filter((p) => p.a < p.pubM).length;
      const withTblSgp4 = withPub.filter((p) => p.s != null);
      const ages = withPub.map((p) => p.ageH).filter(Number.isFinite);
      gDays[ds] = {
        forecasts: pairs.length,
        flown: withPub.length,
        noSetWithin3Days: pairs.length - withPub.length,
        flightFailed: 0,
        publicSetSgp4: stats(pubVals),
        sdnApCloserThanPublicSgp4: { forecasts: withPub.length, sdnApCloser: closer, share: round3(closer / withPub.length) },
        pairedSdnApPublicSgp4: { forecasts: withPub.length, sdnApMedianM: med(apVals), publicSgp4MedianM: med(pubVals) },
        pairedWithTableSgp4: {
          forecasts: withTblSgp4.length,
          publicSgp4MedianM: med(withTblSgp4.map((p) => p.pubM)),
          tableSgp4MedianM: med(withTblSgp4.map((p) => p.s)),
          publicCloserThanTableSgp4: withTblSgp4.filter((p) => p.pubM < p.s).length,
        },
        setAgeHoursMedian: ages.length ? med(ages) : null,
      };

      // allarms-xp: forecasts where publicSetSgp4 was flown AND SDN-AP AND (where row has numerical arm) numerical were scored
      const allArmed = c.label ? withPub.filter((p) => p.f != null) : withPub;
      const withXp = allArmed.filter((p) => p.x != null);
      const withU = allArmed.filter((p) => p.u != null);
      xDays[ds] = {
        tests: allArmed.length,
        publicSetSgp4: { scored: allArmed.length, failed: 0, ...stats(allArmed.map((p) => p.pubM)) },
        sdnAp: { scored: allArmed.length, failed: 0, ...stats(allArmed.map((p) => p.a)) },
        numerical: c.label ? { scored: allArmed.length, failed: 0, ...stats(allArmed.map((p) => p.f)) } : null,
        sgp4Xp: {
          scored: withXp.length,
          failed: allArmed.filter((p) => p.xF).length,
          ...stats(withXp.map((p) => p.x)),
          sdnApCloser: { tests: withXp.length, sdnApCloser: withXp.filter((p) => p.a < p.x).length },
        },
        sgp4XpUssf: {
          scored: withU.length,
          failed: allArmed.filter((p) => p.uF).length,
          ...stats(withU.map((p) => p.u)),
          sdnApCloser: { tests: withU.length, sdnApCloser: withU.filter((p) => p.a < p.u).length },
        },
      };
    }
    gRows.push({ row: c.regime, fitHours: 72, measured: true, days: gDays });
    xRows.push({ row: c.regime, fitHours: 72, days: xDays });
  }

  const gDoc = {
    schema: 'sdn-ap-site-sgp4-public-sets-1',
    version,
    measurement: 'M3',
    what: 'For each forecast of the real-object table\'s 72 h rows, the public element set with the latest epoch before the cutoff, among the sets created at or before the cutoff (no older than 3 days), flown by propagator/sgp4 in AFSPC mode and scored on the table\'s own epochs against the table\'s own truth, paired against SDN-AP 0.7.3.',
    statistic: 'Median and 95th percentile (linear interpolation) in meters to the centimeter.',
    rows: gRows,
  };
  const gPath = path.join(outDir, 'sgp4-public-sets-0.7.3.json');
  fs.writeFileSync(gPath, `${JSON.stringify(gDoc, null, 1)}\n`);

  const xDoc = {
    schema: 'sdn-ap-site-allarms-xp-1',
    version,
    measurement: 'M3b',
    what: 'Per 72 h row and day, on the exact forecasts where the public element set was flown and SDN-AP 0.7.3 (and where present, the numerical propagator) was scored: publicSetSgp4, sdnAp, numerical, sgp4Xp, and sgp4XpUssf.',
    rows: xRows,
  };
  const xPath = path.join(outDir, 'allarms-xp-0.7.3.json');
  fs.writeFileSync(xPath, `${JSON.stringify(xDoc, null, 1)}\n`);

  // 2. R: recount-0.7.3.json
  const rRows = [];
  for (const c of rowContext) {
    const days = {};
    for (const d of [1, 3, 5]) {
      const ds = String(d);
      const pairs = c.pairsAt(d);
      const withS = pairs.filter((p) => p.s != null);
      const withF = pairs.filter((p) => p.f != null);
      const closerS = withS.filter((p) => p.a < p.s).length;
      const entry = {
        forecasts: { sdnAp: pairs.length, sgp4: withS.length, numerical: c.label ? withF.length : null },
        unpairedMediansM: { sdnAp: med(pairs.map((p) => p.a)), sgp4: withS.length ? med(withS.map((p) => p.s)) : null, numerical: c.label && withF.length ? med(withF.map((p) => p.f)) : null },
        sdnApCloserThanSgp4: withS.length ? { forecasts: withS.length, sdnApCloser: closerS, share: round3(closerS / withS.length) } : null,
      };
      if (withS.length !== pairs.length && withS.length > 0) {
        entry.pairedSdnApSgp4 = { forecasts: withS.length, sdnApMedianM: med(withS.map((p) => p.a)), sgp4MedianM: med(withS.map((p) => p.s)) };
      }
      days[ds] = entry;
    }
    const rRow = { row: c.regime, fitHours: c.arc, onPage: c.arc === 72 && MEASURED_72.has(c.g), numericalArm: Boolean(c.label), days };
    if (c.arc === 72 && MEASURED_72.has(c.g)) {
      const gMatch = gRows.find((gr) => gr.row === c.regime);
      const xMatch = xRows.find((xr) => xr.row === c.regime);
      rRow.againstPublicSetSgp4 = {};
      rRow.allArmsOnPublicSetForecasts = {};
      for (const ds of ['1', '3', '5']) {
        const gd = gMatch.days[ds], xd = xMatch.days[ds];
        rRow.againstPublicSetSgp4[ds] = {
          forecasts: gd.flown,
          noSetWithin3Days: gd.noSetWithin3Days,
          sdnApCloser: gd.sdnApCloserThanPublicSgp4,
          paired: gd.pairedSdnApPublicSgp4,
        };
        rRow.allArmsOnPublicSetForecasts[ds] = {
          forecasts: xd.tests,
          ...(xd.tests !== gd.flown ? { publicSetAndSdnApForecasts: gd.flown, numericalScoredOn: xd.tests } : {}),
          publicSetSgp4: { medianM: xd.publicSetSgp4.medianM, p95M: xd.publicSetSgp4.p95M },
          sdnAp: { medianM: xd.sdnAp.medianM, p95M: xd.sdnAp.p95M },
          numerical: xd.numerical ? { medianM: xd.numerical.medianM, p95M: xd.numerical.p95M } : null,
        };
      }
    }
    rRows.push(rRow);
  }
  const rDoc = {
    schema: 'sdn-ap-site-recount-1',
    version,
    measurement: 'M5',
    what: 'From the SDN-AP 0.7.3 real-object table per-forecast errors: per row and day (1, 3, 5), the share of forecasts where SDN-AP is closer to truth than SGP4 and paired medians on public-set forecasts.',
    table: { file: path.basename(tablePath), sha256: tableSha },
    rows: rRows,
  };
  const rPath = path.join(outDir, 'recount-0.7.3.json');
  fs.writeFileSync(rPath, `${JSON.stringify(rDoc, null, 1)}\n`);

  // 3. Y: public-only-0.7.3.json (unified 0.7.3 public-only vs precise-position reference on exact matched tests)
  const yRows = [];
  for (const c of ctx72.filter((z) => MEASURED_72.has(z.g))) {
    const poList = po073ByGroupKey.get(c.g) || [];
    const poByNoradDate = new Map(poList.map((r) => [`${r.noradId}|${r.startUtc.slice(0, 10)}`, r]));
    // Match against table 72h windows by satellite date (and fallback key lookup from wfByKey)
    const wfByNoradDate = new Map();
    for (const r of wfRows) if (r.group === c.g) wfByNoradDate.set(`${r.norad}|${r.startUtc.slice(0, 10)}`, r.key);
    const yDays = {};
    for (const d of [1, 3, 5]) {
      const ds = String(d);
      const tblPairs = c.pairsAt(d);
      const tblByKey = new Map(tblPairs.map((p) => [p.w.key, p]));
      const matched = [];
      for (const po of poList) {
        if (!po.days?.[ds]) continue;
        const wk = wfByNoradDate.get(`${po.noradId}|${po.startUtc.slice(0, 10)}`);
        const tp = wk ? tblByKey.get(wk) : null;
        if (!tp) continue;
        matched.push({
          s: po.days[ds].sgp4PublicSetM,
          x: po.days[ds].sgp4XpFromPublicSetsM,
          w: po.days[ds].sdnApFromPublicSetsM,
          apRef: tp.a,
          ffmRef: tp.f,
        });
      }
      const ffmVals = matched.map((m) => m.ffmRef).filter(Number.isFinite);
      yDays[ds] = {
        tests: matched.length,
        sdnApFromPublicSets: stats(matched.map((m) => m.w)),
        sgp4PublicSet: stats(matched.map((m) => m.s)),
        sdnApCloserThanSgp4PublicSet: matched.filter((m) => m.w < m.s).length,
        sgp4XpFromPublicSets: stats(matched.map((m) => m.x)),
        sdnApCloserThanSgp4XpFromPublicSets: matched.filter((m) => m.w < m.x).length,
        sgp4XpFromPublicSetsCloserThanSgp4PublicSet: matched.filter((m) => m.x < m.s).length,
        reference: {
          sdnApFromPrecisePositions: stats(matched.map((m) => m.apRef)),
          numericalFromPrecisePositions: ffmVals.length ? stats(ffmVals) : null,
        },
      };
    }
    yRows.push({ row: c.regime, fitHours: 72, days: yDays });
  }
  const yDoc = {
    schema: 'sdn-ap-site-public-only-1',
    version,
    measurement: 'M7',
    what: 'Eight groups on SDN-AP 0.7.3 and catalog-builder 0.2.5: SDN-AP and SGP4-XP started from public element sets alone against SGP4 from the newest public set, alongside SDN-AP and the numerical propagator from precise positions on the exact same tests; aggregates only.',
    builder: {
      modulesCommit,
      publicModuleFlown: pubSha,
    },
    rows: yRows,
  };
  const yPath = path.join(outDir, 'public-only-0.7.3.json');
  fs.writeFileSync(yPath, `${JSON.stringify(yDoc, null, 1)}\n`);
  console.log(`Wrote derived 0.7.3 site files: ${path.basename(gPath)}, ${path.basename(rPath)}, ${path.basename(xPath)}, ${path.basename(yPath)}`);
}

function readBurnFlags(dir) {
  if (!dir) return null;
  const files = fs.readdirSync(dir).filter((f) => /^flags-.*\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`--burn-flags ${dir}: no flags-*.json`);
  const out = new Map(), hash = crypto.createHash('sha256');
  const verdict = (x) => `${!!x.fit?.burn}|${!!x.before5?.burn}`, unseen = (x) => (x.fit?.uncoveredH ?? 0) + (x.before5?.uncoveredH ?? 0);
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(dir, f));
    hash.update(bytes);
    for (const x of JSON.parse(bytes.toString('utf8')).windows ?? []) {
      if (x.detector === false || !x.fit || !x.before5) continue;
      const k = `${x.key}|${x.arcH}`, had = out.get(k);
      if (had && verdict(had) !== verdict(x)) throw new Error(`--burn-flags: the files disagree on ${k} (${f})`);
      if (!had || unseen(x) < unseen(had)) out.set(k, x);
    }
  }
  out.sha256 = hash.digest('hex');
  return out;
}

function partsByBurns(flags, pass, arc, test) {
  const parts = { burnInFitArc: [], burnCutoffToDay5Only: [], noBurn: [], unflagged: [] };
  for (const p of pass) { const x = flags.get(`${p.w.key}|${arc}`); parts[!x ? 'unflagged' : x.fit?.burn ? 'burnInFitArc' : x.before5?.burn ? 'burnCutoffToDay5Only' : 'noBurn'].push(p); }
  return Object.fromEntries(Object.entries(parts).map(([k, ps]) => [k, { windows: ps.length, met: ps.filter(test).length }]));
}

function splitByBurns(flags, pass, arc) {
  if (!flags || !pass.length) return null;
  let partlyCovered = 0;
  for (const p of pass) {
    const x = flags.get(`${p.w.key}|${arc}`);
    if (x && !x.fit?.burn && (x.fit?.uncoveredH > 0 || (!x.before5?.burn && x.before5?.uncoveredH > 0))) partlyCovered += 1;
  }
  const out = partsByBurns(flags, pass, arc, passes);
  if (out.unflagged.windows === pass.length) return null;
  const { burnInFitArc: a, burnCutoffToDay5Only: b, noBurn: c, unflagged: u } = out;
  out.partlyCovered = partlyCovered;
  out.label = `Of the ${pass.length} windows on the pass line, a burn is found in the truth in the fit arc on ${a.windows} (met on ${a.met}), between the cutoff and day 5 alone on ${b.windows} (on ${b.met}) and in neither on ${c.windows} (on ${c.met})`
    + (u.windows ? `; unflagged ${u.windows} (${u.met})` : '') + '.';
  return out;
}

function spearman(x, y) {
  const rank = (v) => {
    const order = v.map((value, i) => [value, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length);
    for (let i = 0; i < order.length;) { let j = i; while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1; for (let k = i; k <= j; k += 1) r[order[k][1]] = (i + j) / 2 + 1; i = j + 1; }
    return r;
  };
  const rx = rank(x), ry = rank(y), n = x.length, mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { const a = rx[i] - mx, b = ry[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function describe(s) {
  const f = s.forces, kinds = s.parameters.map((p) => p.kind), ecom = kinds.filter((k) => k.startsWith('ECOM2_')).map((k) => k.slice(6).replace('_COS', ' cos').replace('_SIN', ' sin'));
  const radiation = ecom.length ? `solar radiation pressure by the ECOM2 model (${ecom.join(', ')})` : f.srp ? `solar radiation pressure on a sphere${kinds.includes('SRP_AREA_OVER_MASS') ? '' : ` (area to mass held at ${s.fixed.agom} m2/kg)`}` : 'no radiation pressure';
  const fitted = ['the initial state', ...(kinds.includes('DRAG_AREA_OVER_MASS') ? ['the drag area to mass'] : []), ...(kinds.includes('SRP_AREA_OVER_MASS') ? ['the radiation area to mass'] : []), ...(ecom.length ? ['the five ECOM2 terms'] : [])];
  const and = (v) => (v.length > 1 ? `${v.slice(0, -1).join(', ')} and ${v.at(-1)}` : v[0]);
  const tides = [...(f.solidTides ? ['solid Earth tides'] : []), ...(f.oceanTides ? ['ocean tides (FES2004 to degree 30)'] : [])];
  return [
    `Earth gravity to degree and order ${f.degree}`,
    f.drag ? 'atmospheric drag by NRLMSISE-00 driven by the space weather known at the cutoff (GFZ observed F10.7 and Ap, then the NOAA SWPC forecast issued before it)' : 'no atmospheric drag',
    radiation,
    ...(f.earthRadiation ? ['Earth radiation pressure (Knocke)'] : []),
    f.thirdBodies?.length ? 'the Sun and Moon' : 'no third bodies',
    tides.length ? and(tides) : 'no tides',
    f.relativity ? 'general relativity (IERS 2010)' : 'no relativity',
    `integrated by RK78 at a tolerance of ${s.integrator.tolerance} with steps up to ${s.integrator.maxStep} s; fitted by batch least squares (analysis/estimation) for ${and(fitted)}.`,
  ].join('; ').replace(/^./, (c) => c.toUpperCase());
}
