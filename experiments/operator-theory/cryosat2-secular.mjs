// CRYOSAT2-SECULAR.md: why CryoSat-2 alone shows AP's own secular rate mismatch at 20x20 (inclination, repeat-orbit commensurability,
// fit absorption), and why the fitted forward drift of four 0.6.4 validation cells rose when the short-period model improved (the rate
// absorbing, the arc length, the fitted-rate freedom). Report only. Frame and estimator: the all-regimes record and the secular/zonal
// record's items 1 and 2, unchanged.
//   SDN_MODULES_ROOT=<pinned root> SDNAP_064_WASM=<0.6.4 dist> SDN_AP_HEO_CACHE=<scratch> node cryosat2-secular.mjs --run [--shard k/n]
//   node cryosat2-secular.mjs --table      node cryosat2-secular.mjs --check
// Every state comes from a module (propagator/sdn-ap 0.6.3 and 0.6.4, propagator/ffm 2.2.1, through propagator/sdn-ap/test/lib/
// heo-model-truth.mjs and ocm.mjs); this file moves bytes and does arithmetic (least squares, RMS, the scale a dn).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(HERE, '../..');
const RESULTS = path.join(REPO, 'results/ap-truth/cryosat2-secular');
const LANDED_SZ = path.join(REPO, 'results/ap-truth/secular-zonal-shares');
const REGISTRATION = 'experiments/operator-theory/CRYOSAT2-SECULAR.md';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const RUNNER = sha256(fs.readFileSync(new URL(import.meta.url)));
const argvSave = process.argv; process.argv = process.argv.slice(0, 2);
const AR = await import(pathToFileURL(path.join(HERE, 'tesseral-all-regimes.mjs')).href);
process.argv = argvSave;
const { PIN: AR_PIN, ARMS, attribute, verdictOf, bounds, gridSeconds, arcDays } = AR;
export const PIN = {
  modulesCommit: AR_PIN.modulesCommit,
  sdnAp063: AR_PIN.sdnAp,
  sdnAp064: { version: '0.6.4', wasmSha256: 'e245de29ea050b08244dc9d69fd892ad2473699843b92988fd34a47a466b15f8', source: 'space-data-network-modules-pin tesseral-switch-by-class 9d12e329a6ae7a150276c85cd6ecb39806c4a698 (pre-sign dist)' },
  ffm: AR_PIN.ffm,
};
const RE_KM = 6378.135, MU = 398600.4418, DAY = 86400000, PERIGEE_FLOOR_KM = 200;
const semimajorKm = (n) => Math.cbrt(MU / ((n * 2 * Math.PI / 86400) ** 2));
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const roughness = (series) => { const d2 = []; for (let k = 1; k + 1 < series.length; k += 1) d2.push(Math.hypot(...[0, 1, 2].map((ax) => series[k + 1][ax] - 2 * series[k][ax] + series[k - 1][ax]))); const s = [...d2].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const readRows = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /^rows-\d+\.jsonl$/.test(x)).sort().flatMap((x) => fs.readFileSync(path.join(dir, x), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const CRYO = { name: 'CryoSat-2', n: 14.52, i: 92, raan: 0, argp: 0 };
const JASON = { name: 'Jason-3', n: 12.81, i: 66, raan: 0, argp: 0 }, AJISAI = { name: 'Ajisai', n: 12.44, i: 50, raan: 0, argp: 0 };
const SECONDARY = { name: 'secondary', ...ARMS.secondary }, PRIMARY = { name: 'primary', ...ARMS.primary };
const BFREE = { fitPolicy: { mean: 0, sigma: 0.1, form: 'GAUSSIAN_SIGNED' }, agomPrior: [0, 1e-10] };

/** The 42 registered flights, in order; `dist` names the fit's dist, `flyOn` the flight's (the cross-flights), `arc` the fit's days. */
export function items() {
  const q1 = (id, candidate, change, o) => ({ q: 1, id: `q1:${id}`, candidate, change, regime: { ...CRYO, ...o.orbit }, e: 0.001, arm: SECONDARY, dist: '0.6.3', arc: o.arc ?? arcDays(CRYO.n), bfree: Boolean(o.bfree) });
  const out = [
    q1('base', 'base', 'the registered fixture', {}),
    q1('inclination:86', 'inclination', 'i 86', { orbit: { i: 86 } }), q1('inclination:98', 'inclination', 'i 98', { orbit: { i: 98 } }),
    q1('commensurability:n14.49', 'commensurability', 'n 14.49 (-0.03 rev/day)', { orbit: { n: 14.49 } }), q1('commensurability:n14.55', 'commensurability', 'n 14.55 (+0.03 rev/day)', { orbit: { n: 14.55 } }),
    q1('commensurability:n14.27', 'commensurability', 'n 14.27 (-0.25 rev/day)', { orbit: { n: 14.27 } }), q1('commensurability:n14.77', 'commensurability', 'n 14.77 (+0.25 rev/day)', { orbit: { n: 14.77 } }),
    q1('arc:2d', 'fit absorption', 'arc 2 days', { arc: 2 }), q1('arc:6d', 'fit absorption', 'arc 6 days', { arc: 6 }),
    q1('rate:bfree', 'fit absorption', 'DRAG_PRIOR (0, 0.1, GAUSSIAN_SIGNED)', { bfree: true }),
  ];
  for (const [reg, e] of [[JASON, 0.07], [JASON, 0.1], [AJISAI, 0.1], [AJISAI, 0.15]]) {
    const key = `${reg.name}|${e}`, q2 = (id, o) => ({ q: 2, id: `q2:${key}:${id}`, key, regime: reg, e, arm: PRIMARY, arc: arcDays(reg.n), bfree: false, ...o });
    out.push(q2('fit063', { dist: '0.6.3' }), q2('fit064', { dist: '0.6.4' }), q2('set063-on-064', { dist: '0.6.3', flyOn: '0.6.4', setFrom: `q2:${key}:fit063` }), q2('set064-on-063', { dist: '0.6.4', flyOn: '0.6.3', setFrom: `q2:${key}:fit064` }),
      q2('fit063:arc6d', { dist: '0.6.3', arc: 6 }), q2('fit064:arc6d', { dist: '0.6.4', arc: 6 }), q2('fit063:bfree', { dist: '0.6.3', bfree: true }), q2('fit064:bfree', { dist: '0.6.4', bfree: true }));
  }
  return out;
}

/** A least-squares line and the delete-one-block jackknife of both coefficients (the secular/zonal record's item 1; +-2 SE; none below 3 blocks). */
function lineFit(t, y, blockIds) {
  const fit = (idx) => { let n = 0, st = 0, sy = 0, stt = 0, sty = 0; for (const k of idx) { n += 1; st += t[k]; sy += y[k]; stt += t[k] * t[k]; sty += t[k] * y[k]; } const d = n * stt - st * st; const c1 = (n * sty - st * sy) / d; return [(sy - c1 * st) / n, c1]; };
  const all = t.map((_, k) => k), [c0, c1] = fit(all);
  const blocks = [...new Set(blockIds)], K = blocks.length;
  if (K < 3) return { c0, c1, se: null, K };
  const reps = blocks.map((b) => fit(all.filter((k) => blockIds[k] !== b)));
  const se = (j) => { const v = reps.map((r) => r[j]), m = v.reduce((a, b) => a + b, 0) / K; return Math.sqrt(((K - 1) / K) * v.reduce((a, b) => a + (b - m) ** 2, 0)); };
  return { c0, c1, se: [se(0), se(1)], K };
}
const iv = (x, se) => (se == null ? { point: x, lo: null, hi: null, se: null } : { point: x, lo: x - 2 * se, hi: x + 2 * se, se });
const slim = (x) => ({ rmsM: x.rmsM, maxM: x.maxM, roughM: x.roughM, conditioned: x.conditioned, maxJResolved: x.basis.maxJResolved, jackknife: x.jackknife, shares: x.shares, families: x.families.slice(0, 8) });

if (args.run) {
  const MOD = process.env.SDN_MODULES_ROOT, W064 = process.env.SDNAP_064_WASM;
  if (!MOD) throw new Error('SDN_MODULES_ROOT names the pinned modules root');
  if (!W064) throw new Error('SDNAP_064_WASM names the 0.6.4 dist');
  if (!process.env.SDN_AP_HEO_CACHE) throw new Error('SDN_AP_HEO_CACHE names this lane\'s own cache');
  const W063 = path.join(MOD, 'propagator/sdn-ap/dist/isomorphic/module.wasm'), ffmWasm = path.join(MOD, 'propagator/ffm/dist/isomorphic/module.wasm');
  if (sha256(fs.readFileSync(W063)) !== PIN.sdnAp063.wasmSha256) throw new Error(`${W063} is not sdn-ap ${PIN.sdnAp063.version}`);
  if (sha256(fs.readFileSync(W064)) !== PIN.sdnAp064.wasmSha256) throw new Error(`${W064} is not sdn-ap ${PIN.sdnAp064.version} (pre-sign)`);
  if (sha256(fs.readFileSync(ffmWasm)) !== PIN.ffm.wasmSha256) throw new Error(`${ffmWasm} is not ffm ${PIN.ffm.version}`);
  if (execFileSync('git', ['-C', MOD, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== PIN.modulesCommit) throw new Error(`${MOD} is not at ${PIN.modulesCommit}`);
  process.env.SDNAP_WASM = W063;
  const WASM = { '0.6.3': W063, '0.6.4': W064 };
  const { runModelTruth } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
  const O = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/ocm.mjs')).href);
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json'));
  const { createStandaloneHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
  const { pcfOutputFrame } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js')).href);
  const { OEM } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OEM/OEM.js')).href);
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
  if (SHARDS > 4) throw new Error('at most 4 shards');
  fs.mkdirSync(RESULTS, { recursive: true });
  const outFile = path.join(RESULTS, `rows-${SHARD}.jsonl`);
  const stamp = () => ({ createdUtc: new Date().toISOString(), runner: RUNNER, modulesCommit: PIN.modulesCommit, sdnAp063: PIN.sdnAp063, sdnAp064: PIN.sdnAp064, ffm: PIN.ffm, shard: SHARD });
  const emit = (row) => fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
  const flyers = { '0.6.3': await createStandaloneHarness('browser', W063, { surface: 'command' }), '0.6.4': await createStandaloneHarness('browser', W064, { surface: 'command' }) };
  const fly = async (dist, set, epochs) => { const r = await flyers[dist].invoke({ methodId: 'propagate', inputs: O.flight([set], { output: { EPOCHS: epochs, FRAME: pcfOutputFrame.GCRF } }) }); if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${r.errorMessage}`); return OEM.getRootAsOEM(new fb.ByteBuffer(r.outputs.find((o) => o.portId === 'ephemeris').payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.map((l) => [l.X, l.Y, l.Z]); };
  const setsById = new Map(readRows(RESULTS).filter((r) => r.flown && r.set?.base64).map((r) => [r.id, r.set.base64]));
  // One flight in the all-regimes frame with the secular/zonal record's trend and absorption items on the forward day.
  const flyItem = async (it) => {
    const reg = it.regime, flyOn = it.flyOn ?? it.dist;
    const c = { regime: reg.name, n: reg.n, i: reg.i, raan: reg.raan, argp: reg.argp, e: it.e, perigeeKm: semimajorKm(reg.n) * (1 - it.e) - RE_KM, arcDays: it.arc };
    if (c.perigeeKm < PERIGEE_FLOOR_KM) return { ...c, flown: false, reason: 'below the perigee floor' };
    const gridMinutes = gridSeconds(c.n) / 60;
    const fixture = { name: it.id, n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: 0, drag: false, thirdBody: true, field: it.arm.field, forces: it.arm.caps, fitDays: c.arcDays, hourly: true, gridMinutes, forecastDays: 1, referenceTolerance: 1e-12, referenceMaxStep: 300, modulePath: WASM[flyOn], ...(it.bfree ? BFREE : {}) };
    if (it.setFrom) { const b64 = setsById.get(it.setFrom); if (!b64) throw new Error(`${it.setFrom} has no set yet (fly it first)`); fixture.omm = Buffer.from(b64, 'base64'); }
    const r = await runModelTruth(fixture);
    const set = Buffer.from(r.omm, 'base64');
    const profile = r.profile, tau = profile.map((p) => p.h / 24), rtn = profile.map((p) => [p.r, p.t, p.n]), err3 = profile.map((p) => p.e);
    const epochs = r.referenceStates.map((_, k) => iso(Date.parse(`${r.epoch}Z`) + Math.round((c.arcDays + (k + 1) * gridMinutes / 1440) * DAY)));
    const withCaps = r.flown.map((s) => s.slice(0, 3));
    const zonalOnly = await fly(flyOn, O.repackOcm(set, (t) => { t.PERTURBATIONS.MAXIMUM_TESSERAL_DEGREE = 0; }), epochs);
    const A = rms(withCaps.map((p, k) => Math.hypot(...p.map((x, ax) => (x - zonalOnly[k][ax]) * 1000))));
    const b = bounds(A);
    const forward = { samples: profile.length, gridSeconds: gridSeconds(c.n), rmsM: rms(err3), maxM: Math.max(...err3), roughM: roughness(rtn), ...attribute(tau, rtn, r.fitted.n, 1, 1 / r.fitted.n) };
    // the in-arc leg for the verdict only (the registered three-way reading needs it); its shares are not read here
    const arcOem = OEM.getRootAsOEM(new fb.ByteBuffer((await runModelTruth({ ...fixture, omm: undefined, fitInput: true })).ephemeris.payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
    const arcFlown = await fly(flyOn, set, arcOem.map((l) => l.EPOCH));
    const arcRtn = arcOem.map((l, k) => AR.rtnOf([arcFlown[k][0] - l.X, arcFlown[k][1] - l.Y, arcFlown[k][2] - l.Z], [l.X, l.Y, l.Z], [l.X_DOT, l.Y_DOT, l.Z_DOT]));
    const arcTau = arcOem.map((l) => (Date.parse(`${l.EPOCH}Z`) - Date.parse(`${arcOem[0].EPOCH}Z`)) / DAY);
    const arcNorm = arcRtn.map((p) => Math.hypot(...p));
    const inArc = { samples: arcRtn.length, rmsM: rms(arcNorm), maxM: Math.max(...arcNorm), fitRmsKm: r.fitted.wrms, ...attribute(arcTau, arcRtn, r.fitted.n, c.arcDays, 1) };
    // items 1 and 2: the trend line per RTN axis (delete-one-revolution jackknife) and the absorption reading
    const blockIds = tau.map((t) => Math.floor(t * r.fitted.n));
    const lines = [0, 1, 2].map((ax) => lineFit(tau, rtn.map((q) => q[ax]), blockIds));
    const trend = { revolutions: lines[0].K, R0: iv(lines[0].c0, lines[0].se?.[0]), T1: iv(lines[1].c1, lines[1].se?.[1]), T0: iv(lines[1].c0, lines[1].se?.[0]), N1: iv(lines[2].c1, lines[2].se?.[1]), unit: 'm, m/day' };
    const nRad = 2 * Math.PI * r.fitted.n, Ta = -1.5 * nRad * trend.R0.point, Tr = trend.T1.point - Ta;
    const seTr = lines[1].se ? Math.hypot(lines[1].se[1], 1.5 * nRad * lines[0].se[0]) : null;
    const absorption = { Ta_mPerDay: Ta, Tr: iv(Tr, seTr), reading: seTr == null ? 'no interval' : Math.abs(Tr) <= 2 * seTr ? 'fit absorption (semi-major axis)' : `secular rate mismatch of ${f(Tr)} m/day`, radialBiasAtFixedMeanMotion: Math.abs(trend.T1.point) < Math.abs(Ta) / 3 };
    return { ...c, flown: true, dist: it.dist, flyOn, setFrom: it.setFrom ?? null, arm: it.arm.name, field: it.arm.field, caps: it.arm.caps, fitPolicy: it.bfree ? BFREE : { drag: [0, 1e-10, 'GAUSSIAN_SIGNED'], srp: [0, 1e-10] }, fitted: r.fitted, aKm: semimajorKm(r.fitted.n), A_m: A, bounds: b, forward: slim(forward), inArc: { rmsM: inArc.rmsM, maxM: inArc.maxM, fitRmsKm: inArc.fitRmsKm, conditioned: inArc.conditioned }, ...verdictOf(forward, inArc, b), trend, absorption, kernelSha256: r.kernelSha256, set: { sha256: sha256(set), bytes: set.length, base64: set.toString('base64') } };
  };
  const done = new Set(readRows(RESULTS).map((r) => r.id));
  const mine = items().filter((_, k) => k % SHARDS === SHARD);
  // the cross-flights need their set: a shard that owns one waits for the fit row of another shard (short polls)
  const pending = [...mine];
  while (pending.length) {
    const it = pending.shift();
    if (done.has(it.id)) continue;
    if (it.setFrom && !setsById.has(it.setFrom)) {
      const src = readRows(RESULTS).find((r) => r.id === it.setFrom);
      if (src?.flown && src.set?.base64) setsById.set(it.setFrom, src.set.base64);
      else if (src && !src.flown) { emit({ id: it.id, q: it.q, key: it.key, candidate: it.candidate, change: it.change, ...stamp(), flown: false, error: `withheld: ${it.setFrom} did not fly` }); continue; }
      else { pending.push(it); if (pending.every((p) => p.setFrom)) await new Promise((res) => setTimeout(res, 15000)); continue; }
    }
    const t0 = Date.now();
    try {
      const row = await flyItem(it);
      if (row.flown) setsById.set(it.id, row.set.base64);
      emit({ id: it.id, q: it.q, key: it.key, candidate: it.candidate, change: it.change, ...row, ...stamp(), seconds: (Date.now() - t0) / 1000 });
      console.log(it.id, row.flown ? `${row.verdict} fwd ${f(row.forward.rmsM)} m sec ${f(row.forward.shares.secular.rmsM)} tess ${f(row.forward.shares.tesseral.rmsM)} R0 ${f(row.trend.R0.point)} [${f(row.trend.R0.lo)}, ${f(row.trend.R0.hi)}] T1 ${f(row.trend.T1.point)} [${f(row.trend.T1.lo)}, ${f(row.trend.T1.hi)}] n ${row.fitted.n.toFixed(9)} B ${row.fitted.bterm.toExponential(2)} ${row.absorption.reading}` : row.reason, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } catch (error) {
      emit({ id: it.id, q: it.q, key: it.key, candidate: it.candidate, change: it.change, ...stamp(), flown: false, error: String(error?.message ?? error).slice(0, 300), seconds: (Date.now() - t0) / 1000 });
      console.log(it.id, 'ERROR', String(error?.message ?? error).slice(0, 300));
    }
  }
  for (const h of Object.values(flyers)) await h.close?.();
  process.exit(0);
}

const seD = (a, b) => (a?.se != null && b?.se != null ? Math.hypot(a.se, b.se) : null);
/** The strong and weak readings of a cell's T1 against the base's. */
function readT1(cell, base) {
  if (!cell || !base) return { state: 'unmeasured' };
  const D = cell.point - base.point, se = seD(cell, base);
  const moved = se != null && Math.abs(D) > 2 * se;
  const baseExcludes0 = base.lo != null && (base.lo > 0 || base.hi < 0), cellIncludes0 = cell.lo != null && cell.lo <= 0 && cell.hi >= 0;
  const removed = baseExcludes0 && cellIncludes0 && Math.abs(cell.point) < Math.abs(base.point) / 2;
  const reversed = baseExcludes0 && cell.lo != null && (cell.lo > 0 || cell.hi < 0) && Math.sign(cell.point) !== Math.sign(base.point);
  return { state: 'read', D, lo: se == null ? null : D - 2 * se, hi: se == null ? null : D + 2 * se, se, moved, removed, reversed, label: se == null ? 'no interval' : moved ? `moved (${f(D)} m/day [${f(D - 2 * se)}, ${f(D + 2 * se)}])${reversed ? ', reversed' : ''}` : removed ? `removed within the spread (${f(cell.point)} m/day [${f(cell.lo)}, ${f(cell.hi)}])` : `not moved (${f(D)} m/day [${f(D - 2 * se)}, ${f(D + 2 * se)}])` };
}
const beyond = (x, a, b) => { const se = seD(a, b); return { value: x, se, lo: se == null ? null : x - 2 * se, hi: se == null ? null : x + 2 * se, beyond: se != null && Math.abs(x) > 2 * se }; };
const cellOf = (byId, id) => { const r = byId.get(id); if (!r) return { state: 'unmeasured' }; if (!r.flown) return { state: r.reason ? r.reason : 'withheld (error)', error: r.error }; return { state: 'flown', ...r }; };
const pick = (r) => (r.state === 'flown' ? { verdict: r.verdict, fitted: { n: r.fitted.n, e: r.fitted.e, bterm: r.fitted.bterm, wrms: r.fitted.wrms }, aKm: r.aKm, forwardRmsM: r.forward.rmsM, shares: { secular: r.forward.shares.secular.rmsM, zonal: r.forward.shares.zonal.rmsM, tesseral: r.forward.shares.tesseral.rmsM }, R0: r.trend.R0, T1: r.trend.T1, N1: r.trend.N1, revolutions: r.trend.revolutions, Ta: r.absorption.Ta_mPerDay, Tr: r.absorption.Tr, absorption: r.absorption.reading, radialBias: r.absorption.radialBiasAtFixedMeanMotion, setSha256: r.set.sha256, dist: r.dist, flyOn: r.flyOn } : { state: r.state, error: r.error });

export function table(outDir = RESULTS) {
  const rows = readRows(RESULTS), byId = new Map(rows.map((r) => [r.id, r]));
  const all = items();
  // Question 1
  const base = cellOf(byId, 'q1:base');
  const landedSec = readRows(LANDED_SZ).find((r) => r.id === 'reflight:secondary:CryoSat-2');
  const reproduction = base.state === 'flown' && landedSec?.trend ? { landedT1: landedSec.trend.T1.point, landedR0: landedSec.trend.R0.point, T1: base.trend.T1.point, R0: base.trend.R0.point, dT1: base.trend.T1.point - landedSec.trend.T1.point, dR0: base.trend.R0.point - landedSec.trend.R0.point } : null;
  if (reproduction) reproduction.reproduces = Math.abs(reproduction.dT1) <= 0.01 && Math.abs(reproduction.dR0) <= 0.01;
  const q1cells = all.filter((it) => it.q === 1 && it.id !== 'q1:base').map((it) => { const c = cellOf(byId, it.id); const t1 = c.state === 'flown' && base.state === 'flown' ? readT1(c.trend.T1, base.trend.T1) : { state: c.state, error: c.error }; const r0 = c.state === 'flown' && base.state === 'flown' ? readT1(c.trend.R0, base.trend.R0) : { state: c.state }; return { id: it.id, candidate: it.candidate, change: it.change, ...pick(c), readT1: t1, readR0: { state: r0.state, D: r0.D, lo: r0.lo, hi: r0.hi, moved: r0.moved } }; });
  const candidates = ['inclination', 'commensurability', 'fit absorption'].map((name) => { const cells = q1cells.filter((c) => c.candidate === name); const moved = cells.filter((c) => c.readT1.moved), removed = cells.filter((c) => c.readT1.removed), unread = cells.filter((c) => c.readT1.state !== 'read'); const verdict = moved.length ? `carries it${moved.length === 1 ? ' (one cell)' : ''}: ${moved.map((c) => `${c.change}: D ${f(c.readT1.D)} m/day [${f(c.readT1.lo)}, ${f(c.readT1.hi)}]${c.readT1.reversed ? ', reversed' : ''}`).join('; ')}` : removed.length ? `removes it within the spread: ${removed.map((c) => `${c.change}: T1 ${f(c.T1.point)} [${f(c.T1.lo)}, ${f(c.T1.hi)}]`).join('; ')}` : unread.length === cells.length ? 'unmeasured' : 'does not carry it'; return { candidate: name, cells: cells.map((c) => c.id), moved: moved.map((c) => c.id), removed: removed.map((c) => c.id), unread: unread.map((c) => c.id), verdict }; });
  const carriers = candidates.filter((c) => c.moved.length);
  const q1 = { base: pick(base), reproduction, cells: q1cells, candidates, answer: base.state !== 'flown' ? 'unmeasured (base not flown)' : carriers.length ? `carried by ${carriers.map((c) => `${c.candidate} (${c.verdict})`).join('; ')}` : `not separable: no candidate moves T1 beyond the spread${candidates.some((c) => c.removed.length) ? `; weak readings: ${candidates.filter((c) => c.removed.length).map((c) => `${c.candidate} ${c.verdict}`).join('; ')}` : ''}` };
  // Question 2
  const q2 = [[JASON, 0.07], [JASON, 0.1], [AJISAI, 0.1], [AJISAI, 0.15]].map(([reg, e]) => {
    const key = `${reg.name}|${e}`, g = (id) => cellOf(byId, `q2:${key}:${id}`);
    const A3 = g('fit063'), B4 = g('fit064'), A4 = g('set063-on-064'), B3 = g('set064-on-063'), A6 = g('fit063:arc6d'), B6 = g('fit064:arc6d'), Ab = g('fit063:bfree'), Bb = g('fit064:bfree');
    const flights = { fit063: pick(A3), fit064: pick(B4), set063on064: pick(A4), set064on063: pick(B3), fit063arc6d: pick(A6), fit064arc6d: pick(B6), fit063bfree: pick(Ab), fit064bfree: pick(Bb) };
    const ok = (...xs) => xs.every((x) => x.state === 'flown');
    const T = (x) => x.trend.T1;
    const read = {};
    if (ok(A3, B4)) { read.change = beyond(T(B4).point - T(A3).point, T(B4), T(A3)); read.rateElement_mPerDay = (B4.fitted.n - A3.fitted.n) * 2 * Math.PI * A3.aKm * 1000; read.sign = Math.sign(T(B4).point) !== Math.sign(T(A3).point) ? 'changed sign' : Math.abs(T(B4).point) > Math.abs(T(A3).point) ? 'grew in magnitude' : 'shrank in magnitude'; read.secularShare = [A3.forward.shares.secular.rmsM, B4.forward.shares.secular.rmsM]; read.forwardRms = [A3.forward.rmsM, B4.forward.rmsM]; }
    if (ok(A3, B4, A4, B3)) {
      read.setEffect = beyond(T(B4).point - T(A4).point, T(B4), T(A4)); read.modelEffect = beyond(T(A4).point - T(A3).point, T(A4), T(A3));
      read.setEffectOn063 = beyond(T(B3).point - T(A3).point, T(B3), T(A3)); read.modelEffectOnB = beyond(T(B4).point - T(B3).point, T(B4), T(B3));
      read.rateAbsorbs = read.setEffect.beyond && !read.modelEffect.beyond ? 'the rate absorbs' : !read.setEffect.beyond && read.modelEffect.beyond ? 'the model carries it' : read.setEffect.beyond && read.modelEffect.beyond ? 'both' : 'neither (within the spread)';
    }
    if (ok(B4, B6)) read.arc064 = { ...beyond(Math.abs(T(B6).point) - Math.abs(T(B4).point), T(B6), T(B4)), holds: Math.abs(T(B6).point) < Math.abs(T(B4).point) && Math.abs(T(B6).point - T(B4).point) > 2 * seD(T(B6), T(B4)) };
    if (ok(A3, A6)) read.arc063 = { ...beyond(Math.abs(T(A6).point) - Math.abs(T(A3).point), T(A6), T(A3)), holds: Math.abs(T(A6).point) < Math.abs(T(A3).point) && Math.abs(T(A6).point - T(A3).point) > 2 * seD(T(A6), T(A3)) };
    if (ok(B4, Bb)) read.bfree064 = { ...beyond(Math.abs(T(Bb).point) - Math.abs(T(B4).point), T(Bb), T(B4)), holds: Math.abs(T(Bb).point) < Math.abs(T(B4).point) && Math.abs(T(Bb).point - T(B4).point) > 2 * seD(T(Bb), T(B4)), bterm: Bb.fitted.bterm };
    if (ok(A3, Ab)) read.bfree063 = { ...beyond(Math.abs(T(Ab).point) - Math.abs(T(A3).point), T(Ab), T(A3)), holds: Math.abs(T(Ab).point) < Math.abs(T(A3).point) && Math.abs(T(Ab).point - T(A3).point) > 2 * seD(T(Ab), T(A3)), bterm: Ab.fitted.bterm };
    const holds = [read.rateAbsorbs === 'the rate absorbs' || read.rateAbsorbs === 'both' ? 'the rate absorbs' : null, read.rateAbsorbs === 'the model carries it' || read.rateAbsorbs === 'both' ? 'the model carries it' : null, read.arc064?.holds ? 'arc length' : null, read.bfree064?.holds ? 'fitted-rate freedom' : null].filter(Boolean);
    const measured = ok(A3, B4, A4, B3, B6, Bb);
    return { key, regime: reg.name, e, flights, read, holds, answer: !measured ? `unmeasured (${Object.entries({ fit063: A3, fit064: B4, set063on064: A4, set064on063: B3, fit064arc6d: B6, fit064bfree: Bb }).filter(([, x]) => x.state !== 'flown').map(([k, x]) => `${k}: ${x.state}`).join(', ')})` : holds.length ? holds.join('; ') : 'not separable' };
  });
  const q2summary = { rateAbsorbs: q2.filter((c) => c.holds.includes('the rate absorbs')).map((c) => c.key), modelCarries: q2.filter((c) => c.holds.includes('the model carries it')).map((c) => c.key), arcLength: q2.filter((c) => c.holds.includes('arc length')).map((c) => c.key), rateFreedom: q2.filter((c) => c.holds.includes('fitted-rate freedom')).map((c) => c.key), notSeparable: q2.filter((c) => c.answer === 'not separable').map((c) => c.key), unmeasured: q2.filter((c) => c.answer.startsWith('unmeasured')).map((c) => c.key) };
  const out = { registration: REGISTRATION, pins: PIN, rows: rows.length, flown: rows.filter((r) => r.flown).length, registered: all.length, q1, q2: { cells: q2, summary: q2summary } };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(out, null, 1)}\n`);
  const ivs = (x) => (x ? (x.lo != null ? `${f(x.point)} [${f(x.lo)}, ${f(x.hi)}]` : `${f(x.point)} [no interval]`) : '-');
  const bey = (x) => (x ? `${f(x.value)} [${f(x.lo)}, ${f(x.hi)}]${x.beyond ? ' beyond' : ' within'}` : '-');
  const cellLine = (c) => (c.T1 ? `| ${c.id} | ${c.candidate} | ${c.change} | ${f(c.fitted.n, 7)} / ${c.fitted.bterm.toExponential(2)} | ${f(c.forwardRmsM)} | ${f(c.shares.secular)} / ${f(c.shares.zonal)} / ${f(c.shares.tesseral)} | ${ivs(c.R0)} | ${ivs(c.T1)} | ${f(c.Ta)} | ${ivs(c.Tr)} | ${c.absorption}${c.radialBias ? '; radial bias at fixed mean motion' : ''} | ${c.readT1.label ?? c.readT1.state} | ${c.readR0.state === 'read' ? `${c.readR0.moved ? 'moved' : 'not moved'} (${f(c.readR0.D)} m [${f(c.readR0.lo)}, ${f(c.readR0.hi)}])` : '-'} |` : `| ${c.id} | ${c.candidate} | ${c.change} | ${c.state}${c.error ? `: ${c.error}` : ''} | | | | | | | | | |`);
  const fl = (name, x) => (x.T1 ? `| ${name} | ${x.dist} | ${x.flyOn} | ${f(x.fitted.n, 9)} / ${f(x.fitted.e, 5)} / ${x.fitted.bterm.toExponential(2)} / ${x.fitted.wrms == null ? '-' : f(x.fitted.wrms * 1000, 1)} | ${f(x.forwardRmsM)} | ${f(x.shares.secular)} / ${f(x.shares.zonal)} / ${f(x.shares.tesseral)} | ${ivs(x.R0)} | ${ivs(x.T1)} | ${ivs(x.Tr)} | ${x.absorption} | ${x.verdict} |` : `| ${name} | | | ${x.state}${x.error ? `: ${x.error}` : ''} | | | | | | | |`);
  const md = [`# CryoSat-2's secular rate mismatch and the fitted forward drift under a better model`, '',
    `Registration: ${REGISTRATION}. Frame: the all-regimes record (fixture, reference propagator/ffm ${PIN.ffm.version} ${PIN.ffm.wasmSha256.slice(0, 12)}, fit, forward day, attribution); estimator: the secular/zonal record's items 1 and 2 (R0, T1 with the delete-one-revolution jackknife, +-2 SE; T_a = -(3/2) n R0, T_r = T1 - T_a). Dists: propagator/sdn-ap ${PIN.sdnAp063.version} ${PIN.sdnAp063.wasmSha256.slice(0, 12)} and ${PIN.sdnAp064.version} ${PIN.sdnAp064.wasmSha256.slice(0, 12)} (pre-sign); modules ${PIN.modulesCommit.slice(0, 9)}. Rows ${out.rows}, flown ${out.flown}, registered flights ${out.registered}. Shares are forward-day RMS (m): secular / zonal / tesseral.`, '',
    `## Question 1: why CryoSat-2 alone (20x20 both sides, e 0.001)`,
    `Answer: ${q1.answer}.`,
    reproduction ? `Base reproduction against the landed secondary re-flight: T1 ${f(reproduction.T1)} against ${f(reproduction.landedT1)} m/day (difference ${f(reproduction.dT1, 4)}), R0 ${f(reproduction.R0)} against ${f(reproduction.landedR0)} m (difference ${f(reproduction.dR0, 4)}): ${reproduction.reproduces ? 'reproduces' : 'REPRODUCTION FIGURE stated, not within 0.01'}.` : 'Base reproduction: unmeasured.',
    '', ...candidates.map((c) => `- ${c.candidate}: ${c.verdict}${c.unread.length ? ` (unread: ${c.unread.join(', ')})` : ''}`), '',
    `| Cell | Candidate | Change | Fitted n (rev/day) / BTERM | Forward RMS (m) | Shares sec / zon / tess (m) | R0 (m) | T1 (m/day) | T_a | T_r | Absorption reading | T1 against the base | R0 against the base |`, `| --- | --- | --- | --- | --: | --- | --: | --: | --: | --: | --- | --- | --- |`,
    base.state === 'flown' ? cellLine({ id: 'q1:base', candidate: 'base', change: 'the registered fixture', ...q1.base, readT1: { label: '-' }, readR0: { state: '-' } }) : `| q1:base | base | the registered fixture | ${base.state}${base.error ? `: ${base.error}` : ''} | | | | | | | | | |`,
    ...q1cells.map(cellLine), '',
    `## Question 2: why the fitted forward drift moved when the model improved (31x31 against caps 31 / 20; the four 0.6.4 validation cells)`,
    `Summary: the rate absorbs in ${q2summary.rateAbsorbs.join(', ') || 'none'}; the model carries it in ${q2summary.modelCarries.join(', ') || 'none'}; arc length reduces the drift in ${q2summary.arcLength.join(', ') || 'none'}; the fitted-rate freedom reduces it in ${q2summary.rateFreedom.join(', ') || 'none'}; not separable: ${q2summary.notSeparable.join(', ') || 'none'}; unmeasured: ${q2summary.unmeasured.join(', ') || 'none'}.`, '',
    ...q2.flatMap((c) => [`### ${c.key}: ${c.answer}`,
      c.read.change ? `T1 0.6.3 fit ${ivs(c.flights.fit063.T1)} -> 0.6.4 fit ${ivs(c.flights.fit064.T1)} m/day: change ${bey(c.read.change)}, ${c.read.sign}; the fitted mean motion's element reading a dn ${f(c.read.rateElement_mPerDay)} m/day; secular share ${f(c.read.secularShare[0])} -> ${f(c.read.secularShare[1])} m; forward RMS ${f(c.read.forwardRms[0])} -> ${f(c.read.forwardRms[1])} m.` : 'Change: unmeasured.',
      c.read.setEffect ? `Decomposition on 0.6.4: set effect (B on 0.6.4 minus A on 0.6.4) ${bey(c.read.setEffect)}; model effect (A on 0.6.4 minus A on 0.6.3) ${bey(c.read.modelEffect)}: ${c.read.rateAbsorbs}. On 0.6.3: set effect (B on 0.6.3 minus A on 0.6.3) ${bey(c.read.setEffectOn063)}; model effect on B (B on 0.6.4 minus B on 0.6.3) ${bey(c.read.modelEffectOnB)}.` : 'Decomposition: unmeasured.',
      `Arc 6 days: |T1| change on 0.6.4 ${bey(c.read.arc064)}${c.read.arc064 ? (c.read.arc064.holds ? ' (reduces)' : ' (does not reduce)') : ''}; on 0.6.3 ${bey(c.read.arc063)}. BTERM free: |T1| change on 0.6.4 ${bey(c.read.bfree064)}${c.read.bfree064 ? ` (${c.read.bfree064.holds ? 'reduces' : 'does not reduce'}; fitted BTERM ${c.read.bfree064.bterm.toExponential(3)} m^2/kg)` : ''}; on 0.6.3 ${bey(c.read.bfree063)}${c.read.bfree063 ? ` (fitted BTERM ${c.read.bfree063.bterm.toExponential(3)})` : ''}.`, '',
      `| Flight | Fit dist | Flown on | Fitted n / e / BTERM / fit RMS (m) | Forward RMS (m) | Shares sec / zon / tess (m) | R0 (m) | T1 (m/day) | T_r | Absorption reading | Verdict |`, `| --- | --- | --- | --- | --: | --- | --: | --: | --: | --- | --- |`,
      ...Object.entries(c.flights).map(([k, x]) => fl(k, x)), ''])].join('\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), md);
  return out;
}

if (args.table) { const t = table(args.out ?? RESULTS); console.log(JSON.stringify({ q1: t.q1.answer, reproduction: t.q1.reproduction, q2: t.q2.summary, rows: t.rows, flown: t.flown }, null, 1)); process.exit(0); }

if (args.check) {
  let failures = 0;
  const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a]).toString('utf8').trim();
  const rows = readRows(RESULTS);
  const regSha = git('log', '--reverse', '--format=%H', '--', REGISTRATION).split('\n')[0];
  const regAt = Date.parse(git('show', '-s', '--format=%cI', regSha));
  const first = rows.map((r) => r.createdUtc).sort()[0];
  check(rows.length > 0 && regAt < Date.parse(first), `registration ${regSha.slice(0, 8)} (${git('show', '-s', '--format=%cI', regSha)}) precedes the first of ${rows.length} rows (${first})`);
  check(rows.every((r) => r.sdnAp063?.wasmSha256 === PIN.sdnAp063.wasmSha256 && r.sdnAp064?.wasmSha256 === PIN.sdnAp064.wasmSha256 && r.ffm?.wasmSha256 === PIN.ffm.wasmSha256 && r.modulesCommit === PIN.modulesCommit), `every row on sdn-ap 0.6.3 ${PIN.sdnAp063.wasmSha256.slice(0, 12)}, 0.6.4 ${PIN.sdnAp064.wasmSha256.slice(0, 12)}, ffm ${PIN.ffm.wasmSha256.slice(0, 12)}, modules ${PIN.modulesCommit.slice(0, 9)}`);
  const ids = new Set(rows.map((r) => r.id)), all = items();
  check(all.every((it) => ids.has(it.id)), `every one of the ${all.length} registered flights carries a row (missing: ${all.filter((it) => !ids.has(it.id)).map((it) => it.id).join(', ') || 'none'})`);
  const flown = rows.filter((r) => r.flown);
  check(flown.every((r) => r.trend?.T1 && r.absorption?.reading && r.forward?.shares && r.fitted && r.set?.sha256) && rows.filter((r) => !r.flown).every((r) => r.error || r.reason), `${flown.length} flown rows carry the trend, absorption, shares, fitted set and set hash; ${rows.length - flown.length} withheld rows carry their reason`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cryosat2-secular-'));
  const t = table(tmp);
  check(['table.json', 'README.md'].every((n) => fs.existsSync(path.join(RESULTS, n)) && fs.readFileSync(path.join(tmp, n)).equals(fs.readFileSync(path.join(RESULTS, n)))), `results/ap-truth/cryosat2-secular/table.json and README.md reproduce from the rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
  check(t.q1.reproduction && (t.q1.reproduction.reproduces || Number.isFinite(t.q1.reproduction.dT1)), `the base reproduces the landed re-flight or states its reproduction figure (dT1 ${f(t.q1.reproduction?.dT1, 4)} m/day, dR0 ${f(t.q1.reproduction?.dR0, 4)} m)`);
  check(!t.q1.answer.startsWith('unmeasured'), `question 1 answered: ${t.q1.answer}`);
  check(t.q2.summary.unmeasured.length === 0, `question 2 answered in every cell: ${t.q2.cells.map((c) => `${c.key}: ${c.answer}`).join('; ')}`);
  console.log(failures ? `FAIL (${failures})` : 'PASS');
  process.exit(failures ? 1 : 0);
}
