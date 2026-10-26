// Part 2 (PLAN.md): SDN-AP from laser observations. E6's R fits (normal points of [T - 2 d, T] alone; runs of its steps 12 and 40 under runs/)
// give a GCRF state at each cutoff T; FFM carries it back over [T - 24 h, T] (60 s) and forward to the truth epochs. SDN-AP and SGP4-XP are
// fitted to the 24 h track; with FFM, the public element set (SGP4) and SDN-AP fitted to the truth's own 24 h, every arm is scored on the days
// after T against the NSGF orbit. One JSON line per cutoff under <store>/rows/laser.s<k>.jsonl (phase `arms`). Phase `leads` (A5 point 8, A6
// point 1): the lead records of SGP4-XP (fitted again to the same FFM-carried 24 h, its covariance by sdnap_covariance_at) and of FFM (E6's R
// product's covariance at T carried by propagator/ffm with E6's forces and fixed AGOM), rows under laser-leads.s<k>.jsonl. Phase `gp` (A6 point
// 2): the public set's SGP4 prediction with its three covariances in V1c5's runtime, rows under laser-gp.s<k>.jsonl.
//   node experiments/sdn-ap-mixed-screening/part2-laser.mjs [--phase arms|leads|gp] [--shard k/n] [--limit n]
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, frozen, readJsonl, root, g1Dir } from './common.mjs';

frozen();
const P2 = config.part2;
const H = 3600e3, DAY = 86400e3;
const g1 = (name) => import(path.join(g1Dir, name));
const [{ modulesRoot }, FFM, SRC, W, SDS] = await Promise.all(['lib/modules.mjs', 'lib/ffm.mjs', 'lib/sources.mjs', 'lib/windows.mjs', 'lib/sds.mjs'].map(g1));
const { readSets, setAt } = await import(path.join(root, 'experiments/e4-operator-ephemeris-parity/products.mjs'));
const { ffmEnvironment } = await import(path.join(root, 'experiments/sdn-ap-baselines/lib/environment.mjs'));
const { openFits, fitSdnap, statesAt, scoreBins, iso } = await import('./lib/fits.mjs');

const phase = args.phase ?? 'arms';
if (!['arms', 'leads', 'gp'].includes(phase)) throw new Error(`unknown phase ${phase}`);
const modules = modulesRoot();
const a = await openFits(modules);
const g1Context = await FFM.loadEnvironment(modules, { archive: '/opt/data/sdn-archive', store: path.join('/opt/data/sdn-archive', 'sdn-gp-starlink-ffm-match') });
const env = await ffmEnvironment(modules, g1Context);
const P = g1Context.catalog.prw;
const forces = { THIRD_BODY_IDS: [10, 301], OCEAN_TIDES: P.pcfOceanTideModel.NONE, EARTH_RADIATION: P.pcfEarthRadiationModel.NONE }; // E6's force model: 70 x 70, Sun and Moon, SRP, drag, solid tides, relativity

// E6's R products of the test window
const products = fs.readdirSync(path.join(root, 'runs')).filter((d) => d.startsWith(`e6-40-slr-fit-${P2.e6Window}-`)).flatMap((d) => readJsonl(path.join(root, 'runs', d, 'products.jsonl')))
  .filter((p) => p.variant === P2.e6Variant && Date.parse(p.cutoff) >= Date.parse(P2.window[0]) && Date.parse(p.cutoff) < Date.parse(P2.window[1]))
  .sort((x, y) => x.norad - y.norad || Date.parse(x.cutoff) - Date.parse(y.cutoff));
const targetOf = (norad) => P2.targets.find((t) => JSON.parse(fs.readFileSync(path.join(root, 'experiments/e6-public-observations/config.json'))).slr.targets[t].norad === norad);
// NSGF truth: every NSGF orbit of the target in the reference states, chained (G1's chain: later files hold their own epochs)
const truthCache = new Map();
function truthOf(target) {
  if (truthCache.has(target)) return truthCache.get(target);
  const dirs = fs.readdirSync(SRC.referenceRootDir).filter((d) => d.startsWith(`nsgf.orb.${target}.26`)).sort();
  const files = dirs.map((d) => path.join(SRC.referenceDir(d), fs.readdirSync(SRC.referenceDir(d)).find((f) => f.endsWith('.oem')))).filter(Boolean);
  const series = SRC.chain(files);
  const object = W.withT({ source: `nsgf-${target}`, id: target, norad: series.norad, name: series.name || target, frame: 'GCRF', timeSystem: 'UTC', lines: series.lines });
  truthCache.set(target, { object, files: dirs.length });
  return truthCache.get(target);
}
const thin = (list) => { const step = list.length > 1 ? (Date.parse(list[1].epoch) - Date.parse(list[0].epoch)) / 1000 : 60; const every = Math.max(1, Math.round(P2.thinSeconds / step)); return { chosen: list.filter((_, i) => i % every === 0), every, step }; };
const dayOf = (T) => (t) => { const k = P2.leadDays.find((d) => t > T + (d - 1) * DAY && t <= T + d * DAY); return k ? String(k) : null; };
const sets = new Map();
const setsOf = (norad) => { if (!sets.has(norad)) sets.set(norad, readSets(process.env.SDN_GP_HISTORY ?? '/opt/data/sdn-archive/spacetrack/gp_history/by-creation', '2026-07-01', '2026-09-05', new Set([norad])).get(norad) ?? []); return sets.get(norad); };

/** The FFM-carried 24 h before T (60 s, GCRF km) of an R product, and the FFM context of its arc. */
async function trackOf(p, T, row) {
  const trackEpochs = Array.from({ length: P2.trackHours * 3600 / P2.trackStepSeconds + 1 }, (_, j) => T - P2.trackHours * H + j * P2.trackStepSeconds * 1000);
  const ctx = { ...g1Context, inputs: env.inputsFor(T - P2.trackHours * H - DAY, T + 4 * DAY) };
  const back = await FFM.propagate(modules, ctx, { epoch: iso(T), state: p.state, cdAm: row.b, crAm: row.agom, epochs: trackEpochs, forces });
  return { ctx, track: back.samples.map((s) => ({ epoch: iso(s.ms), r: s.state.slice(0, 3).map((x) => x / 1000), v: s.state.slice(3, 6).map((x) => x / 1000) })) };
}
const ff = phase === 'leads' ? await (await import('./lib/ffm-fit.mjs')).openFfmFit(modules) : null;
const G = phase === 'gp' ? await import('./lib/gp-secondary.mjs') : null;
const gp = G ? await G.openGp() : null;
const loaded = gp ? gp.load(new Set(products.map((p) => p.norad)), Math.min(...products.map((p) => Date.parse(p.cutoff))), Math.max(...products.map((p) => Date.parse(p.cutoff)))) : null;

/** A5's lead records of one cutoff: SGP4-XP refitted to the FFM-carried 24 h and E6's R product with its covariance (A6 point 1). The lead
 *  epochs are the NSGF truth's own (`held`; the 300 s thinning is the accuracy scorer's, and its grid can miss T + L by more than 150 s). */
async function leadRecords(p, T, row, held, object) {
  const { leadLines, sgp4xpLeads, ffmLeads } = await import('./lib/leads.mjs');
  const leads = leadLines(held, T, config.a5.ca.leadToleranceSeconds.laser);
  const out = { leads: leads.map((x) => x.L) };
  const { track } = await trackOf(p, T, row);
  const f = await fitSdnap(a, object, track, T, 'SGP4XP');
  out.sgp4xp = f.ok ? await sgp4xpLeads(a, f.omm, leads, 'GCRF') : { error: f.error };
  // As E6 carries its products (anchored.mjs): from the fit epoch, the fitted state and conditioned(fit covariance x max(1, reduced chi-square))
  // (fitCovariance is already scaled), so the scale here is 1; the product's own covariance at T is not symmetric enough for propagator/ffm
  const { conditioned } = await import(path.join(root, 'experiments/e6-public-observations/fit.mjs'));
  const product = { epoch: p.fitEpoch, state: p.fitState, parameters: p.parameters, covariance: conditioned(p.fitCovariance), reducedChiSquare: 1 };
  out.ffm = await ffmLeads(a, (prod, ms, covariance) => ff.predict(prod, p.norad, ms, T, 'starlink', { covariance, forces: p.forces, fixed: p.fixed }), product, leads, 'GCRF');
  return out;
}

const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const out = path.join(store, 'rows', `${{ arms: 'laser', leads: 'laser-leads', gp: 'laser-gp' }[phase]}.s${k}.jsonl`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const done = new Set(readJsonl(out).map((r) => `${r.norad}|${r.cutoff}`));
let count = 0;
for (let i = 0; i < products.length; i += 1) {
  const p = products[i];
  if (i % n !== k || done.has(`${p.norad}|${p.cutoff}`)) continue;
  if (args.limit && count >= Number(args.limit)) break;
  const T = Date.parse(p.cutoff), target = targetOf(p.norad);
  const { object: truth } = truthOf(target);
  const row = { norad: p.norad, target, cutoff: p.cutoff, measurements: p.measurements, b: p.parameters?.[0]?.value, agom: p.fixed?.agom };
  const held = W.slice(truth, T + 1, T + Math.max(...P2.leadDays) * DAY);
  const { chosen, every, step } = thin(held);
  const minPerDay = Math.floor((P2.minimumCoverage * 86400) / step);
  const keepDays = (bins) => Object.fromEntries(Object.entries(bins).filter(([, d]) => d.n * every >= minPerDay));
  if (!chosen.length) { fs.appendFileSync(out, `${JSON.stringify({ ...row, excluded: 'no truth after T' })}\n`); count += 1; continue; }
  const epochs = chosen.map((l) => Date.parse(l.epoch));
  const object = { frame: 'GCRF', name: target, norad: p.norad, originator: 'B2 from E6 R' };
  if (phase !== 'arms') {
    if (phase === 'leads') Object.assign(row, await leadRecords(p, T, row, held, object));
    else {
      const { leadLines } = await import('./lib/leads.mjs');
      const leads = leadLines(held, T, config.a5.ca.leadToleranceSeconds.laser);
      const { key, ...rest } = await gp.record({ key: `${p.norad}|${p.cutoff}`, norad: p.norad, cls: G.v1c5Class(p.norad), issueMs: T, leads }, loaded);
      row.gp = rest;
    }
    fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
    count += 1;
    continue;
  }
  row.arms = {};
  try {
    const { ctx, track } = await trackOf(p, T, row);
    const fwd = await FFM.propagate(modules, ctx, { epoch: iso(T), state: p.state, cdAm: row.b, crAm: row.agom, epochs, forces });
    row.arms.ffm = { ok: true, bins: keepDays(await scoreBins(a, fwd.samples.map((s) => ({ r: s.state.slice(0, 3).map((x) => x / 1000), v: s.state.slice(3, 6).map((x) => x / 1000) })), chosen, dayOf(T))) };
    for (const [arm, theory] of [['sdnap', 'SDNAP'], ['sgp4xp', 'SGP4XP']]) {
      const f = await fitSdnap(a, object, track, T, theory);
      row.arms[arm] = f.ok ? { ok: true, moduleFitRmsKm: f.moduleFitRmsKm, bins: keepDays(await scoreBins(a, await statesAt(a, f.omm, epochs, 'GCRF'), chosen, dayOf(T))) } : f;
    }
  } catch (error) { row.arms.error = String(error.message).slice(0, 200); }
  // the public element set: the newest Space-Track set before T (E6's B), SGP4 through propagator/sdn-ap
  const set = setAt(setsOf(p.norad), T);
  if (set) {
    const e = set.elements;
    const omm = SDS.ommBytes({ theory: 'SGP4', epoch: set.epoch, meanMotion: e.MEAN_MOTION, eccentricity: e.ECCENTRICITY, inclination: e.INCLINATION, raan: e.RA_OF_ASC_NODE, argPerigee: e.ARG_OF_PERICENTER, meanAnomaly: e.MEAN_ANOMALY, norad: p.norad, bstar: e.BSTAR, agom: 0 });
    try { row.arms.sgp4 = { ok: true, setEpoch: set.epoch, bins: keepDays(await scoreBins(a, await statesAt(a, Buffer.from(omm).toString('base64'), epochs, 'GCRF'), chosen, dayOf(T))) }; } catch (error) { row.arms.sgp4 = { ok: false, error: String(error.message).slice(0, 160) }; }
  } else row.arms.sgp4 = { ok: false, error: 'no set before T' };
  // the precise-input bound: SDN-AP fitted to the truth's own 24 h before T
  const own = W.slice(truth, T - P2.trackHours * H, T);
  if (own.length > 20) {
    const f = await fitSdnap(a, object, own, T, 'SDNAP');
    row.arms.sdnapTruth = f.ok ? { ok: true, bins: keepDays(await scoreBins(a, await statesAt(a, f.omm, epochs, 'GCRF'), chosen, dayOf(T))) } : f;
  }
  fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
  count += 1;
  if (count % 10 === 0) console.error(`laser shard ${k}/${n}: ${count}`);
}
console.error(`laser ${phase} shard ${k}/${n}: ${count} cutoffs (${products.length} R products)`);
await a.close();
await ff?.close();
await gp?.close();
process.exit(0);
