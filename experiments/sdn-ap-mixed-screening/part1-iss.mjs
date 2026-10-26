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
if (!['arms', 'ffm', 'leads', 'gp'].includes(phase)) throw new Error(`unknown phase ${phase}`);
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const out = path.join(store, 'rows', `${{ arms: 'iss', ffm: 'iss-ffm', leads: 'iss-leads', gp: 'iss-gp' }[phase]}.s${k}.jsonl`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const done = new Set(readJsonl(out).map((r) => r.file));
const modules = modulesRoot();
const a = await openFits(modules);
const ff = ['ffm', 'leads'].includes(phase) ? await (await import('./lib/ffm-fit.mjs')).openFfmFit(modules) : null;
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
  if (i % n !== k || done.has(headers[i].date)) continue;
  if (args.limit && count >= Number(args.limit)) break;
  const w = windowOf(i);
  const row = w.excluded ? { ...w.row, excluded: w.excluded } : { ...w.row, truth: { epochs: w.truth.length, files: [...new Set(w.truth.map((t) => t.file))] }, ...(phase === 'arms' ? { arms: await arms(w) } : phase === 'ffm' ? { ffm: await ffmArm(w) } : phase === 'leads' ? await leadRecords(w) : await gpRecord(w)) };
  fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
  count += 1;
  if (count % 20 === 0) console.error(`iss ${phase} shard ${k}/${n}: ${count}`);
}
console.error(`iss ${phase} shard ${k}/${n}: ${count} windows`);
await a.close();
await ff?.close();
await gp?.close();
process.exit(0);
