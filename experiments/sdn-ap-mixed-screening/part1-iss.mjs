// Part 1b (PLAN.md): the arms fitted to the first 24 h of each NASA ISS trajectory file, scored against the first 24 h of the newer files that
// start in the 72 h after the fit. Phase `arms`: SDN-AP, SGP4-XP and SGP4 beside NASA's own forecast (the same file), rows under
// <store>/rows/iss.s<k>.jsonl. Phase `ffm` (amendment A5, A4's settings): analysis/estimation fit_batch answered by propagator/ffm on the same
// track (taken to GCRF by foundation/frames), carried by propagator/ffm to the truth epochs and back to EME2000, scored by the same scorer;
// rows under <store>/rows/iss-ffm.s<k>.jsonl (statistics, the fitted product and its covariance only). Re-running skips windows present.
//   node experiments/sdn-ap-mixed-screening/part1-iss.mjs [--phase arms|ffm] [--shard k/n] [--limit n]
import fs from 'node:fs';
import path from 'node:path';
import { store, args, frozen, readJsonl, g1Dir } from './common.mjs';

frozen();
const { headers, windowOf, object, binOf } = await import('./lib/iss-window.mjs');
const { modulesRoot } = await import(path.join(g1Dir, 'lib/modules.mjs'));
const { openFits, fitSdnap, fitSgp4, statesAt, scoreBins, convert } = await import('./lib/fits.mjs');

const phase = args.phase ?? 'arms';
if (!['arms', 'ffm'].includes(phase)) throw new Error(`unknown phase ${phase}`);
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const out = path.join(store, 'rows', `${phase === 'arms' ? 'iss' : 'iss-ffm'}.s${k}.jsonl`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const done = new Set(readJsonl(out).map((r) => r.file));
const modules = modulesRoot();
const a = await openFits(modules);
const ff = phase === 'ffm' ? await (await import('./lib/ffm-fit.mjs')).openFfmFit(modules) : null;

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

let count = 0;
for (let i = 0; i < headers.length; i += 1) {
  if (i % n !== k || done.has(headers[i].date)) continue;
  if (args.limit && count >= Number(args.limit)) break;
  const w = windowOf(i);
  const row = w.excluded ? { ...w.row, excluded: w.excluded } : { ...w.row, truth: { epochs: w.truth.length, files: [...new Set(w.truth.map((t) => t.file))] }, ...(phase === 'arms' ? { arms: await arms(w) } : { ffm: await ffmArm(w) }) };
  fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
  count += 1;
  if (count % 20 === 0) console.error(`iss ${phase} shard ${k}/${n}: ${count}`);
}
console.error(`iss ${phase} shard ${k}/${n}: ${count} windows`);
await a.close();
await ff?.close();
process.exit(0);
