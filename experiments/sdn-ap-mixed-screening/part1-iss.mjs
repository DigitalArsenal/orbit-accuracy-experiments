// Part 1b (PLAN.md): the arms fitted to the first 24 h of each NASA ISS trajectory file, scored against the first 24 h of the newer files that
// start in the 72 h after the fit. Phase `arms`: SDN-AP, SGP4-XP and SGP4 beside NASA's own forecast (the same file), rows under
// <store>/rows/iss.s<k>.jsonl. Phase `ffm` (amendment A5, A4's settings): analysis/estimation fit_batch answered by propagator/ffm on the same
// track (taken to GCRF by foundation/frames), carried by propagator/ffm to the truth epochs and back to EME2000, scored by the same scorer;
// rows under <store>/rows/iss-ffm.s<k>.jsonl (statistics, the fitted product and its covariance only). Phase `leads` (A5 point 8): the lead
// records of SGP4-XP and FFM (state, covariance, error and d² at the truth epoch nearest E + L) and of NASA's forecast (error only) for the
// conjunction contrast, from the stored fits; rows under <store>/rows/iss-leads.s<k>.jsonl. Phase `gp` (A6 point 2): the public set's SGP4
// prediction with V1c5 frozen, uncalibrated and V1c4 best covariances at the same lead epochs, in V1c5's runtime; rows under
// <store>/rows/iss-gp.s<k>.jsonl. Re-running skips windows present.
//   node experiments/sdn-ap-mixed-screening/part1-iss.mjs [--phase arms|ffm|leads|gp] [--shard k/n] [--limit n]
import fs from 'node:fs';
import path from 'node:path';
import { store, args, frozen, readJsonl, g1Dir, config } from './common.mjs';

frozen();
const { headers, windowOf, object, binOf } = await import('./lib/iss-window.mjs');
const { modulesRoot } = await import(path.join(g1Dir, 'lib/modules.mjs'));
const { openFits, fitSdnap, fitSgp4, statesAt, scoreBins, convert } = await import('./lib/fits.mjs');

const phase = args.phase ?? 'arms';
if (!['arms', 'ffm', 'leads', 'gp', 'ffm3', 'ffm3score', 'leads3'].includes(phase)) throw new Error(`unknown phase ${phase}`);
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
// A13's iss-ffm3 (part 1 point 2): fit_batch version 3 on the same GCRF track; --max-evals 60 --only <dates> is the contingency rerun
const evals60 = phase === 'ffm3' && Number(args['max-evals']) === config.a12.fit.contingencyMaximumIterations;
const only = args.only ? new Set(String(args.only).split(',')) : null;
const out = path.join(store, 'rows', `${{ arms: 'iss', ffm: 'iss-ffm', leads: 'iss-leads', gp: 'iss-gp', ffm3: evals60 ? 'iss-ffm3-60' : 'iss-ffm3', ffm3score: 'iss-ffm3-score', leads3: 'iss-leads3' }[phase]}.s${k}.jsonl`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const done = new Set(readJsonl(out).map((r) => r.file));
const modules = modulesRoot();
const a = await openFits(modules);
const ff = ['ffm', 'leads'].includes(phase) ? await (await import('./lib/ffm-fit.mjs')).openFfmFit(modules) : null;
const v3 = ['ffm3', 'ffm3score', 'leads3'].includes(phase) ? await (await import('./lib/a12.mjs')).openV3() : null;
const gp = phase === 'gp' ? await (await import('./lib/gp-secondary.mjs')).openGp() : null;
const loaded = gp ? gp.load(new Set([object.norad]), Math.min(...headers.map((h) => h.header.startMs).filter(Number.isFinite)), Date.now()) : null;
const stored = (prefix) => new Map(fs.readdirSync(path.join(store, 'rows')).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).flatMap((f) => readJsonl(path.join(store, 'rows', f))).map((r) => [r.file, r]));
const fitsOf = phase === 'leads' ? { arms: stored('iss.'), ffm: stored('iss-ffm.') } : null;

/** The registered arms of one window (SDN-AP, SGP4-XP, SGP4, NASA's forecast). */
async function arms(w) {
  const { E, track, truth, epochs, forecastBy } = w;
  const out = {};
  out.sdnap = await fitSdnap(a, object, track, E, 'SDNAP');
  out.sgp4xp = await fitSdnap(a, object, track, E, 'SGP4XP');
  out.sgp4 = await fitSgp4(a, object, track, E);
  for (const f of Object.values(out)) {
    if (!f.ok) continue;
    try {
      const fitPred = await statesAt(a, f.omm, track.map((l) => Date.parse(l.epoch)), 'EME2000');
      f.fit = (await scoreBins(a, fitPred, track, () => 'fit')).fit;
      f.bins = await scoreBins(a, await statesAt(a, f.omm, epochs, 'EME2000'), truth, binOf(E));
    } catch (error) { f.ok = false; f.error = `score: ${String(error.message).slice(0, 160)}`; }
  }
  const fc = truth.filter((t) => forecastBy.has(Date.parse(t.epoch)));
  out.forecast = fc.length ? { ok: true, bins: await scoreBins(a, fc.map((t) => { const s = forecastBy.get(Date.parse(t.epoch)); return { r: s.r, v: s.v }; }), fc, binOf(E)) } : { ok: false, error: 'the file does not reach the truth epochs' };
  return out;
}

/** A5's FFM arm of one window: the fit on the track in GCRF, the prediction back in EME2000, the same scorer. */
async function ffmArm(w) {
  const { E, track, truth, epochs } = w;
  const gcrf = (await convert(a, track, 'EME2000', 'GCRF')).map((s, i) => ({ epoch: track[i].epoch, ...s }));
  const fit = await ff.fit(object.norad, gcrf, E, 'iss');
  if (!fit.ok) return fit;
  const back = async (ms) => convert(a, (await ff.predict(fit, object.norad, ms, E, 'iss')).map((s, i) => ({ epoch: new Date(ms[i]).toISOString(), ...s })), 'GCRF', 'EME2000');
  try {
    fit.fit = (await scoreBins(a, await back(track.map((l) => Date.parse(l.epoch))), track, () => 'fit')).fit;
    fit.bins = await scoreBins(a, await back(epochs), truth, binOf(E));
  } catch (error) { return { ...fit, ok: false, error: `score: ${String(error.message).slice(0, 160)}` }; }
  return fit;
}

/** A13's iss-ffm3 fit of one window (the fit only, as C2's iss-fit rows record it). */
async function ffm3Fit(w) {
  const { fitV3 } = await import('../../harness/ffm-fit-v3.mjs');
  const { issSettingsV3, fitInput } = await import('./lib/a12.mjs');
  const gcrf = (await convert(a, w.track, 'EME2000', 'GCRF')).map((s, i) => ({ epoch: w.track[i].epoch, ...s }));
  const settings = issSettingsV3(Number(args['max-evals'] ?? config.a12.fit.maximumIterations));
  const { points, reference } = fitInput(gcrf);
  const t0 = Date.now();
  const f = await fitV3(v3.ctxFor(Date.parse(gcrf[0].epoch), w.E + 72 * 3600e3), points, reference, settings);
  return { maximumIterations: settings.maximumIterations, fit: { ok: f.ok, termination: f.termination ?? null, error: f.error ?? null, epoch: f.epoch, state: f.state, parameters: f.parameters, boundStatus: f.boundStatus, reducedChiSquare: f.reducedChiSquare,
    measurements: f.measurements, rejected: f.rejected, iterations: f.iterations, rejectedTrials: f.rejectedTrials, refusedTrials: f.refusedTrials, refusedRounds: f.refusedRounds, refusal: f.refusal ?? null, ffmCalls: f.ffmCalls, covariance: f.covariance, seconds: (Date.now() - t0) / 1000 },
    provenance: { estimation: v3.provenance.estimation.wasmSha256, ffm: v3.provenance.ffm.wasmSha256 } };
}

// A13's iss-ffm3 products of record: the 40-evaluation fit, replaced by its 60-evaluation rerun where one exists (C2-A3 point 3)
const ffm3Of = ['ffm3score', 'leads3'].includes(phase) ? (() => { const re = stored('iss-ffm3-60.'); return new Map([...stored('iss-ffm3.')].map(([f, r]) => [f, re.get(f) ?? r])); })() : null;
const issLeadsOf = phase === 'leads3' ? stored('iss-leads.') : null;
const A13 = phase === 'leads3' ? await import('./lib/a13.mjs') : null, cal = A13 ? await A13.openA13() : null;
const carry3 = async (product, ms, E, covariance = null) => {
  const { propagateV3 } = await import('../../harness/ffm-fit-v3.mjs');
  const { issSettingsV3 } = await import('./lib/a12.mjs');
  const s = issSettingsV3();
  const st = await propagateV3(v3.ctxFor(Date.parse(product.epoch), E + 72 * 3600e3), product, ms.map((t) => new Date(t).toISOString()), s, covariance);
  return st.map((x) => ({ r: x.state.slice(0, 3).map((q) => q / 1000), v: x.state.slice(3, 6).map((q) => q / 1000), ...(covariance ? { covariance: x.covariance, n: x.n } : {}) }));
};
/** A13: iss-ffm3's accuracy (labeled in-sample: the planner read A5's ISS rows), the registered scorer and bins. */
async function ffm3Score(w) {
  const r = ffm3Of.get(w.row.file);
  if (!r?.fit?.ok) return { ffm3: { ok: false, error: r ? r.fit?.termination ?? r.fit?.error ?? r.excluded : 'no iss-ffm3 row' } };
  const back = async (ms) => convert(a, (await carry3(r.fit, ms, w.E)).map((s, i) => ({ epoch: new Date(ms[i]).toISOString(), ...s })), 'GCRF', 'EME2000');
  try { return { ffm3: { ok: true, label: 'in-sample', bins: await scoreBins(a, await back(w.epochs), w.truth, binOf(w.E)) } }; } catch (error) { return { ffm3: { ok: false, error: `score: ${String(error.message).slice(0, 160)}` } }; }
}
/** A13: the lead records of iss-ffm3 (A5's covariance) and their calibrated records (class I), and SGP4-XP's calibrated records (class I)
 *  beside the registered SGP4-XP and forecast records (rows/iss-leads, A5). */
async function leads3(w) {
  const { leadLines, ffmLeads } = await import('./lib/leads.mjs');
  const leads = leadLines(w.truth, w.E, config.a5.ca.leadToleranceSeconds.iss);
  const reg = issLeadsOf.get(w.row.file) ?? {};
  const out = { leads: leads.map((x) => x.L), sgp4xp: reg.sgp4xp ?? { error: 'no registered lead row' }, forecast: reg.forecast ?? {} };
  const r = ffm3Of.get(w.row.file);
  if (!r?.fit?.ok) out.ffm3 = { error: r ? r.fit?.termination ?? r.fit?.error ?? r.excluded : 'no iss-ffm3 row' };
  else {
    try { out.ffm3 = await ffmLeads(a, (product, ms, covariance) => carry3(product, ms, w.E, covariance), r.fit, leads, 'EME2000'); } catch (error) { out.ffm3 = { error: `refused by propagator/ffm: ${error.message}` }; }
    if (!out.ffm3.error) try {
      const gcrf = (await convert(a, leads.map(({ line }) => line), 'EME2000', 'GCRF')).map((s, i) => ({ L: leads[i].L, line: { epoch: leads[i].line.epoch, ...s } }));
      const { issSettingsV3 } = await import('./lib/a12.mjs');
      const s = issSettingsV3();
      out.ffm3Cal = (await cal.ffmCal(v3.ctxFor(Date.parse(r.fit.epoch), w.E + 72 * 3600e3), r.fit, w.E, gcrf, { forces: s.forces, integrator: s.integrator, fixed: {} }, out.ffm3, { ffm3Cal: A13.CLASS.iss })).ffm3Cal;
    } catch (error) { out.ffm3Cal = { error: String(error.message).slice(0, 200) }; }
  }
  out.sgp4xpCal = out.sgp4xp.error ? { error: 'no SGP4-XP records' } : await cal.xpCal(Object.fromEntries(Object.entries(out.sgp4xp).filter(([k]) => /^\d+$/.test(k))), A13.CLASS.iss);
  return out;
}

/** A5's lead records of one window from its stored fits: SGP4-XP and FFM with covariance, NASA's forecast error only. */
async function leadRecords(w) {
  const { leadLines, sgp4xpLeads, ffmLeads, stateLeads } = await import('./lib/leads.mjs');
  const leads = leadLines(w.truth, w.E, config.a5.ca.leadToleranceSeconds.iss);
  const f = fitsOf.arms.get(w.row.file)?.arms, g = fitsOf.ffm.get(w.row.file)?.ffm;
  const out = { leads: leads.map((x) => x.L) };
  out.sgp4xp = f?.sgp4xp?.ok ? await sgp4xpLeads(a, f.sgp4xp.omm, leads, 'EME2000') : { error: f ? 'no SGP4-XP fit' : 'no stored row' };
  out.ffm = g?.ok ? await ffmLeads(a, (product, ms, covariance) => ff.predict(product, object.norad, ms, w.E, 'iss', { covariance }), g, leads, 'EME2000') : { error: g ? g.error ?? 'no FFM fit' : 'no FFM row' };
  const fc = leads.filter(({ line }) => w.forecastBy.has(Date.parse(line.epoch)));
  out.forecast = await stateLeads(a, fc.map(({ line }) => { const s = w.forecastBy.get(Date.parse(line.epoch)); return { r: s.r, v: s.v }; }), fc);
  return out;
}

/** A6's GP record of one window: the public set's SGP4 prediction and its three covariances at the lead epochs (the truth taken to GCRF). */
async function gpRecord(w) {
  const { leadLines } = await import('./lib/leads.mjs');
  const leads = leadLines(w.truth, w.E, config.a5.ca.leadToleranceSeconds.iss);
  const gcrf = leads.length ? await convert(a, leads.map(({ line }) => line), 'EME2000', 'GCRF') : [];
  const r = await gp.record({ key: w.row.file, norad: object.norad, cls: 'LEO 400-800 km', issueMs: w.E, leads: leads.map(({ L, line }, i) => ({ L, line: { epoch: line.epoch, ...gcrf[i] } })) }, loaded);
  const { key, ...rest } = r;
  return { gp: rest };
}

let count = 0;
for (let i = 0; i < headers.length; i += 1) {
  if (i % n !== k || done.has(headers[i].date) || (only && !only.has(headers[i].date))) continue;
  if (args.limit && count >= Number(args.limit)) break;
  const w = windowOf(i);
  const row = w.excluded ? { ...w.row, excluded: w.excluded } : { ...w.row, truth: { epochs: w.truth.length, files: [...new Set(w.truth.map((t) => t.file))] }, ...(phase === 'arms' ? { arms: await arms(w) } : phase === 'ffm' ? { ffm: await ffmArm(w) } : phase === 'leads' ? await leadRecords(w) : phase === 'ffm3' ? await ffm3Fit(w) : phase === 'ffm3score' ? await ffm3Score(w) : phase === 'leads3' ? await leads3(w) : await gpRecord(w)) };
  fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
  count += 1;
  if (count % 20 === 0) console.error(`iss ${phase} shard ${k}/${n}: ${count}`);
}
console.error(`iss ${phase} shard ${k}/${n}: ${count} windows`);
await a.close();
await ff?.close();
await gp?.close();
await v3?.close();
await cal?.close();
process.exit(0);
