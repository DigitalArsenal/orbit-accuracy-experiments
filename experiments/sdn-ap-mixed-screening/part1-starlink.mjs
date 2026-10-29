// Part 1a (PLAN.md, amendments A3 and A5): Starlink, prospective. The operator track (the 24 h before E from the captured first 8 h of the files
// older than F, stored by the capture cycles before the forecast cycle) is fitted by SGP4-XP (phase `fit`) and by FFM (phase `ffm`); the fitted
// set and state, and SpaceX's own forecast for the sample, are scored against the captured first 8 h of the files newer than F (phase `score`)
// in the bins whose truth is complete at the cycle named by --through (A5 point 6), each bin under the coverage rule. The captured states pass
// the truth gate (harness/truth-gate.mjs, A3). Rows under <store>/rows/starlink-fit.s<k>.jsonl, starlink-ffm.s<k>.jsonl and
// starlink-score.<through>.s<k>.jsonl.
//   node experiments/sdn-ap-mixed-screening/part1-starlink.mjs --phase fit|ffm [--shard k/n] [--limit n]
//   node experiments/sdn-ap-mixed-screening/part1-starlink.mjs --phase score --through <cycle id> [--shard k/n] [--limit n]
// Phases `leads` and `gp` (A5 point 8, A6) write the conjunction contrast's lead records at the truth epochs nearest E + L of the truth up to
// --through: SGP4-XP and FFM with their covariances and SpaceX's forecast's error (starlink-leads.s<k>.jsonl), and the public set's SGP4 with
// its three covariances in V1c5's runtime (starlink-gp.s<k>.jsonl).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, store, args, frozen, readJsonl, registeredMs, g1Dir, paced } from './common.mjs';
import { cycleMs, filesOf, track, trackSha } from './lib/capture.mjs';


frozen();
const S = config.part1.starlink;
const H = 3600e3, STEP = S.stepMinutes * 60e3, SEG = S.segmentHours * H, DAY = 24 * H;
const iso = (t) => new Date(t).toISOString();
export { cycleMs };
const finished = new Set(readJsonl(path.join(path.dirname(S.captureRoot), 'cycles.jsonl')).map((c) => c.id)); // a cycle the collector has closed
const cycles = fs.readdirSync(S.captureRoot).filter((d) => /^\d{4}-\d\d-\d\dT/.test(d) && finished.has(d)).sort();
export const forecastCycle = process.env.B2_FORECAST_CYCLE ?? cycles.find((c) => cycleMs(c) > registeredMs());
if (!forecastCycle) throw new Error('no capture cycle after the registration yet');
const before = cycles.filter((c) => cycleMs(c) < cycleMs(forecastCycle)); // the cycles a fit right after the forecast cycle would have read (A5 point 4)

/** The bins whose truth is complete at cycle `through` (A5 point 6): bin k once a cycle has started k days after the forecast cycle. */
export const completeBins = (through) => S.binsHours.map((_, b) => String(b + 1)).filter((b) => cycleMs(through) >= cycleMs(forecastCycle) + Number(b) * DAY - 60e3);


/** Bin coverage (PLAN.md part 1a, A5 point 5): per bin, the truth epochs held, the 10-min epochs files newer than F can cover in it (from the
 *  later of the bin's start and the first newer file's start to its end), and whether it counts (at least minimumCoverage of them). */
function coverage(E, truth, firstNewerStart) {
  return Object.fromEntries(S.binsHours.map(([lo, hi], b) => {
    const start = E + lo * H, end = E + hi * H;
    const coverable = !Number.isFinite(firstNewerStart) || firstNewerStart > end ? 0 : firstNewerStart > start ? Math.floor((end - firstNewerStart) / STEP) + 1 : Math.round((end - start) / STEP);
    const held = truth.filter((l) => { const t = Date.parse(l.epoch); return t > start && t <= end; }).length;
    return [String(b + 1), { held, coverable, counts: coverable > 0 && held >= S.minimumCoverage * coverable }];
  }));
}

/** The window of one satellite: F, E, the operator track (the registered one, and the one every cycle present gives), the truth up to cycle
 *  `through`, its coverage, the maneuver evidence. */
export function windowOf(norad, through = cycles.at(-1)) {
  const fc = path.join(S.captureRoot, forecastCycle, `${norad}.json.gz`);
  if (!fs.existsSync(fc)) return { norad, excluded: 'not in the forecast cycle' };
  const F = JSON.parse(zlib.gunzipSync(fs.readFileSync(fc))).source;
  const Fstart = Date.parse(F.startUtc), E = Fstart;
  const files = filesOf(norad, cycles.filter((c) => cycleMs(c) <= cycleMs(through)));
  const older = filesOf(norad, before).filter((f) => f.start < Fstart), olderAll = files.filter((f) => f.start < Fstart), newer = files.filter((f) => f.start > Fstart);
  const fit = track(older, E - S.trackHours * H, E, false), fitAll = track(olderAll, E - S.trackHours * H, E, false);
  const truth = track(newer, E, E + 72 * H, true);
  // maneuver evidence (registered): epochs of the truth span that two truth files both hold within their first segment hours
  let worstKm = 0, overlapEpochs = 0;
  for (const a of newer) for (const b of newer) {
    if (b.start <= a.start) continue;
    for (const [t, s] of b.states) { const o = a.states.get(t); if (o && t - a.start <= SEG && t > E && t <= E + 72 * H) { overlapEpochs += 1; worstKm = Math.max(worstKm, Math.hypot(s[0] - o[0], s[1] - o[1], s[2] - o[2])); } }
  }
  return {
    norad, F: { sha: F.sha256, startUtc: F.startUtc, cycle: forecastCycle }, E, fit: fit.lines, truth: truth.lines, newerFiles: newer.length, olderFiles: older.length,
    coverage: fit.lines.length / (S.trackHours * 60 / S.stepMinutes + 1), bins: coverage(E, truth.lines, newer[0]?.start ?? NaN), worstOverlapKm: worstKm, overlapEpochs,
    track: { sha: trackSha(fit.lines), shaAllCycles: trackSha(fitAll.lines), states: fit.lines.length, statesAllCycles: fitAll.lines.length, dropped: fit.dropped },
    truthDropped: truth.dropped, gated: { track: older.reduce((n, f) => n + f.gated, 0), truth: newer.reduce((n, f) => n + f.gated, 0) },
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { modulesRoot } = await import(path.join(g1Dir, 'lib/modules.mjs'));
  const { openFits, fitSdnap, statesAt, convert, scoreBins } = await import('./lib/fits.mjs');
  // `explore` (post-score, exploratory; coordinator ruling 2026-10-29): the score phase on bins 2 and 3 under E''s registered relaxed rule
  // (A12 point 7: at least 60 % of the bin's coverable epochs, no gap over 8 h, states within the first and the last 2 h), never bin 1
  const explore = args.phase === 'explore';
  const phase = explore ? 'score' : args.phase ?? 'fit';
  if (!['fit', 'ffm', 'score', 'leads', 'gp', 'ffm3', 'xpln'].includes(phase)) throw new Error(`unknown phase ${phase}`);
  if (phase === 'ffm3' || phase === 'xpln') { // A12: the new arms' fits through the fit-only reader, never windowOf
    const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
    await (await import('./lib/a12-arms.mjs')).fitPhase(phase, { k, n, limit: args.limit ? Number(args.limit) : null, maximumIterations: Number(args['max-evals'] ?? config.a12.fit.maximumIterations), only: args.only ? new Set(String(args.only).split(',').map(Number)) : null });
    process.exit(0);
  }
  const late = ['score', 'leads', 'gp'].includes(phase);
  const through = late ? args.through : null;
  if (late && !cycles.includes(through)) throw new Error('--through names a closed capture cycle');
  const scored = late ? completeBins(through) : [];
  if (late && !scored.length) throw new Error(`no bin is complete at ${through}`);
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
  const norads = fs.readdirSync(path.join(S.captureRoot, forecastCycle)).filter((f) => /^\d+\.json\.gz$/.test(f)).map((f) => Number(f.split('.')[0])).sort((a, b) => a - b);
  const out = path.join(store, 'rows', phase === 'score' ? `starlink-score${explore ? '-explore' : ''}.${through}.s${k}.jsonl` : `starlink-${phase}.s${k}.jsonl`);
  const mine = norads.filter((_, i) => i % n === k);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const done = new Set(readJsonl(out).map((r) => r.norad));
  const modules = modulesRoot();
  const a = phase === 'ffm' ? null : await openFits(modules);
  const ff = ['ffm', 'score', 'leads'].includes(phase) ? await (await import('./lib/ffm-fit.mjs')).openFfmFit(modules) : null;
  const G = phase === 'gp' ? await import('./lib/gp-secondary.mjs') : null;
  const gp = G ? await G.openGp() : null;
  let loaded = null; // the shard's sets, read once its windows' prediction starts are known
  const object = (norad) => ({ frame: 'GCRF', name: `STARLINK ${norad}`, norad, originator: 'SpaceX via operator-capture' });
  const rowsOf = (prefix) => new Map(fs.readdirSync(path.join(store, 'rows')).filter((f) => f.startsWith(prefix)).flatMap((f) => readJsonl(path.join(store, 'rows', f))).map((r) => [r.norad, r]));
  const fits = late ? rowsOf('starlink-fit.') : null, ffmFits = late ? rowsOf('starlink-ffm.') : null;
  // A12's arms (ffm3: fit_batch version 3 with the selected profile; XP-LN) beside the registered ones
  const ffm3Fits = late ? new Map((await import('./lib/a12-arms.mjs')).ffm3Merged((p) => [...rowsOf(p).values()]).map((r) => [r.norad, r])) : null, xplnFits = late ? rowsOf('starlink-xpln.') : null;
  const arms = ['score', 'leads'].includes(phase) ? await (await import('./lib/a12-arms.mjs')).openArms() : null;
  const L5 = late && phase !== 'score' ? await import('./lib/leads.mjs') : null;
  const tolerance = config.a5.ca.leadToleranceSeconds.starlink;
  const fitIdentity = (w) => ({ norad: w.norad, F: w.F, E: iso(w.E), coverage: w.coverage, olderFiles: w.olderFiles, gated: w.gated.track, track: w.track, trackFrom: `the capture cycles before ${forecastCycle}` });
  const changed = (w, f) => (f.F?.sha !== w.F.sha ? 'the forecast file changed since the fit' : f.track?.sha !== w.track.sha ? 'the track changed since the fit' : null);
  let count = 0;
  for (let i = 0; i < norads.length; i += 1) {
    const norad = norads[i];
    if (i % n !== k || done.has(norad)) continue;
    if (args.limit && count >= Number(args.limit)) break;
    if (count % 50 === 0) await paced();
    const w = windowOf(norad, through ?? cycles.at(-1));
    let row;
    if (w.excluded) row = { norad, excluded: w.excluded };
    else if (phase === 'leads' || phase === 'gp') {
      // the lead epochs in the complete bins (A5 point 6)
      const last = w.E + Math.max(...scored.map((b) => S.binsHours[Number(b) - 1][1])) * H;
      const leads = L5.leadLines(w.truth, w.E, tolerance).filter(({ line }) => Date.parse(line.epoch) <= last);
      const f = fits.get(norad), g = ffmFits.get(norad);
      row = { norad, E: iso(w.E), through, leads: leads.map((x) => x.L) };
      if (!f || f.excluded || changed(w, f)) row.excluded = f ? (f.excluded ?? changed(w, f)) : 'no fit row';
      else if (phase === 'leads') {
        row.sgp4xp = f.sgp4xp?.ok ? await L5.sgp4xpLeads(a, f.sgp4xp.omm, leads, 'GCRF') : { error: f.sgp4xp?.error ?? 'no SGP4-XP fit' };
        row.ffm = g && !g.excluded && !changed(w, g) && g.ffm?.ok ? await L5.ffmLeads(a, (product, ms, covariance) => ff.predict(product, norad, ms, w.E, 'starlink', { covariance }), g.ffm, leads, 'GCRF') : { error: g?.ffm?.error ?? g?.excluded ?? 'no FFM fit' };
        const g3 = ffm3Fits.get(norad); // A12: the FFM arm of record for the contrast
        row.ffm3 = g3 && !changed(w, g3) && g3.ffm3?.ok ? await L5.ffmLeads(a, (product, ms, covariance) => arms.ffm3(product, ms, w.E, covariance), g3.ffm3, leads, 'GCRF') : { error: g3?.ffm3?.error ?? 'no ffm3 fit' };
        const fcFile = path.join(store, 'forecast', `${norad}.json`);
        if (fs.existsSync(fcFile)) {
          const fc = JSON.parse(fs.readFileSync(fcFile));
          if (!fc.error && Date.parse(fc.firstEpoch) === Date.parse(w.F.startUtc)) {
            const by = new Map(fc.states.map((x) => [Date.parse(x.epoch), x]));
            const at = leads.filter(({ line }) => by.has(Date.parse(line.epoch)));
            row.forecast = await L5.stateLeads(a, await convert(a, at.map(({ line }) => by.get(Date.parse(line.epoch))), 'EME2000', 'GCRF'), at);
          }
        }
      } else {
        loaded ??= gp.load(new Set(mine), cycleMs(forecastCycle) - DAY, cycleMs(forecastCycle)); // every E lies in the 8 h before the forecast cycle
        const { key, ...rest } = await gp.record({ key: String(norad), norad, cls: G.v1c5Class(norad), issueMs: w.E, leads }, loaded);
        row.gp = rest;
      }
    } else if (phase === 'fit' || phase === 'ffm') {
      row = fitIdentity(w);
      if (w.coverage < S.minimumCoverage) row.excluded = `operator track ${w.fit.length} epochs`;
      else if (phase === 'ffm') row.ffm = await ff.fit(norad, w.fit, w.E);
      else row.sgp4xp = await fitSdnap(a, object(norad), w.fit, w.E, 'SGP4XP');
    } else {
      // the score of the complete bins that the coverage rule counts
      const relaxed = (b) => { // E''s rule on the bin's coverable span
        const [lo, hi] = S.binsHours[Number(b) - 1], end = w.E + hi * H, full = Math.round((hi - lo) * 60 / S.stepMinutes), cov = w.bins[b].coverable;
        const start = cov >= full ? w.E + lo * H : end - (cov - 1) * STEP;
        const t = w.truth.map((l) => Date.parse(l.epoch)).filter((x) => x > w.E + lo * H && x <= end);
        const E2 = config.a12.selection.datasets.eprime;
        return cov > 0 && t.length >= E2.minimumCoverage * cov && t[0] <= start + E2.edgeHours * H && t.at(-1) >= end - E2.edgeHours * H && t.every((x, i) => !i || x - t[i - 1] <= E2.maximumGapHours * H);
      };
      const counted = explore ? scored.filter((b) => b !== '1' && relaxed(b)) : scored.filter((b) => w.bins[b].counts);
      const binOf = (t) => { const h = (t - w.E) / H; const b = String(S.binsHours.findIndex(([lo, hi]) => h > lo && h <= hi) + 1); return counted.includes(b) ? b : null; };
      // the track's mean distance from Earth's center (km), for A10's exploratory breakdown by shell
      const trackMeanRadiusKm = w.fit.length ? w.fit.reduce((t, l) => t + Math.hypot(...l.r), 0) / w.fit.length : null;
      row = { norad, E: iso(w.E), through, binsComplete: scored, bins: w.bins, truthEpochs: w.truth.length, truthDropped: w.truthDropped, newerFiles: w.newerFiles, worstOverlapKm: w.worstOverlapKm, overlapEpochs: w.overlapEpochs, maneuverEvident: w.worstOverlapKm >= S.maneuverEvidentKm, gated: w.gated.truth, trackMeanRadiusKm };
      if (explore) row.relaxedCounted = counted;
      const f = fits.get(norad), g = ffmFits.get(norad);
      if (!f || f.excluded || changed(w, f)) row.excluded = f ? (f.excluded ?? changed(w, f)) : 'no fit row';
      else if (!counted.length) row.excluded = 'no complete bin meets the coverage rule';
      else {
        const truth = w.truth.filter((l) => binOf(Date.parse(l.epoch)) !== null);
        const epochs = truth.map((l) => Date.parse(l.epoch));
        row.arms = {};
        if (!f.sgp4xp?.ok) row.arms.sgp4xp = { ok: false, error: f.sgp4xp?.error };
        else {
          try { row.arms.sgp4xp = { ok: true, bins: await scoreBins(a, await statesAt(a, f.sgp4xp.omm, epochs, 'GCRF'), truth, binOf) }; } catch (error) { row.arms.sgp4xp = { ok: false, error: String(error.message).slice(0, 160) }; }
        }
        // the FFM arm (A3): its fit on the same track, carried forward by propagator/ffm
        if (!g || g.excluded || changed(w, g) || !g.ffm?.ok) row.arms.ffm = { ok: false, error: !g ? 'no FFM fit row' : g.excluded ?? changed(w, g) ?? g.ffm?.error };
        else {
          try { row.arms.ffm = { ok: true, bins: await scoreBins(a, await ff.predict(g.ffm, norad, epochs, w.E), truth, binOf) }; } catch (error) { row.arms.ffm = { ok: false, error: String(error.message).slice(0, 160) }; }
        }
        // A12's arms: ffm3 carried by the same propagator/ffm (T when estimated), XP-LN by its own build
        const g3 = ffm3Fits.get(norad), gx = xplnFits.get(norad);
        if (!g3 || changed(w, g3) || !g3.ffm3?.ok) row.arms.ffm3 = { ok: false, error: !g3 ? 'no ffm3 fit row' : changed(w, g3) ?? g3.ffm3?.error };
        else {
          try { row.arms.ffm3 = { ok: true, bins: await scoreBins(a, await arms.ffm3(g3.ffm3, epochs, w.E), truth, binOf) }; } catch (error) { row.arms.ffm3 = { ok: false, error: String(error.message).slice(0, 160) }; }
        }
        if (!gx || changed(w, gx) || !gx.xpln?.ok) row.arms.xpln = { ok: false, error: !gx ? 'no XP-LN fit row' : changed(w, gx) ?? gx.xpln?.error };
        else {
          try { row.arms.xpln = { ok: true, bins: await scoreBins(a, await arms.xpln(gx.xpln.omm, epochs), truth, binOf) }; } catch (error) { row.arms.xpln = { ok: false, error: String(error.message).slice(0, 160) }; }
        }
        const fcFile = path.join(store, 'forecast', `${norad}.json`);
        if (fs.existsSync(fcFile)) {
          const fc = JSON.parse(fs.readFileSync(fcFile));
          if (fc.error || Date.parse(fc.firstEpoch) !== Date.parse(w.F.startUtc)) row.arms.forecast = { ok: false, error: fc.error ?? 'the fetched file is not F' };
          else {
            const by = new Map(fc.states.map((s) => [Date.parse(s.epoch), s]));
            const pairs = truth.filter((l) => by.has(Date.parse(l.epoch)));
            const gcrf = await convert(a, pairs.map((l) => by.get(Date.parse(l.epoch))), 'EME2000', 'GCRF');
            row.arms.forecast = pairs.length ? { ok: true, bins: await scoreBins(a, gcrf, pairs, binOf) } : { ok: false, error: 'no common epochs' };
          }
        }
      }
    }
    fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
    count += 1;
    if (count % 50 === 0) console.error(`starlink ${phase} shard ${k}/${n}: ${count}`);
  }
  console.error(`starlink ${phase} shard ${k}/${n}: ${count} satellites`);
  await a?.close();
  await ff?.close();
  await gp?.close();
  await arms?.close();
  process.exit(0);
}
