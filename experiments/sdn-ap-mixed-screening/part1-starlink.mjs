// Part 1a (PLAN.md, amendments A3 and A5): Starlink, prospective. The operator track (the 24 h before E from the captured first 8 h of the files
// older than F, stored by the capture cycles before the forecast cycle) is fitted by SGP4-XP (phase `fit`) and by FFM (phase `ffm`); the fitted
// set and state, and SpaceX's own forecast for the sample, are scored against the captured first 8 h of the files newer than F (phase `score`)
// in the bins whose truth is complete at the cycle named by --through (A5 point 6), each bin under the coverage rule. The captured states pass
// the truth gate (harness/truth-gate.mjs, A3). Rows under <store>/rows/starlink-fit.s<k>.jsonl, starlink-ffm.s<k>.jsonl and
// starlink-score.<through>.s<k>.jsonl.
//   node experiments/sdn-ap-mixed-screening/part1-starlink.mjs --phase fit|ffm [--shard k/n] [--limit n]
//   node experiments/sdn-ap-mixed-screening/part1-starlink.mjs --phase score --through <cycle id> [--shard k/n] [--limit n]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, store, args, frozen, readJsonl, registeredMs, g1Dir, root, sha256 } from './common.mjs';

const { gate } = await import(path.join(root, 'harness/truth-gate.mjs'));

frozen();
const S = config.part1.starlink;
const H = 3600e3, STEP = S.stepMinutes * 60e3, SEG = S.segmentHours * H, DAY = 24 * H;
const iso = (t) => new Date(t).toISOString();
export const cycleMs = (id) => Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z'));
const finished = new Set(readJsonl(path.join(path.dirname(S.captureRoot), 'cycles.jsonl')).map((c) => c.id)); // a cycle the collector has closed
const cycles = fs.readdirSync(S.captureRoot).filter((d) => /^\d{4}-\d\d-\d\dT/.test(d) && finished.has(d)).sort();
export const forecastCycle = process.env.B2_FORECAST_CYCLE ?? cycles.find((c) => cycleMs(c) > registeredMs());
if (!forecastCycle) throw new Error('no capture cycle after the registration yet');
const before = cycles.filter((c) => cycleMs(c) < cycleMs(forecastCycle)); // the cycles a fit right after the forecast cycle would have read (A5 point 4)

/** The bins whose truth is complete at cycle `through` (A5 point 6): bin k once a cycle has started k days after the forecast cycle. */
export const completeBins = (through) => S.binsHours.map((_, b) => String(b + 1)).filter((b) => cycleMs(through) >= cycleMs(forecastCycle) + Number(b) * DAY - 60e3);

/** Every captured file of one satellite in `within` (cycle ids), one entry per file (by SHA-256): { start, sha, cycle, states: Map(ms -> [x, y, z,
 *  vx, vy, vz] km, km/s), gated: the states the truth gate dropped }; the gate's product is the capture's (operator-capture/<cycle>/<SHA-256, 16 hex>). */
function filesOf(norad, within) {
  const byFile = new Map();
  for (const c of within) {
    const f = path.join(S.captureRoot, c, `${norad}.json.gz`);
    if (!fs.existsSync(f)) continue;
    let d;
    try { d = JSON.parse(zlib.gunzipSync(fs.readFileSync(f))); } catch { continue; }
    if (!d.source?.sha256 || !(d.truth ?? []).length || byFile.has(d.source.sha256)) continue; // a cycle that stored no states of the file does not hold it
    const { kept, dropped } = gate(d.truth, { product: `operator-capture/${c}/${d.source.sha256.slice(0, 16)}`, norad, epochOf: (s) => s.ms, positionOf: (s) => s.stateM.slice(0, 3).map((x) => x / 1000) });
    byFile.set(d.source.sha256, { start: Date.parse(d.source.startUtc), sha: d.source.sha256, cycle: c, gated: dropped.length, states: new Map(kept.map((s) => [s.ms, s.stateM.map((x) => x / 1000)])) });
  }
  return [...byFile.values()].sort((a, b) => a.start - b.start); // ties keep the capture order: the later capture is the newer file
}

/** The states in [from, to] ((from, to] when openLow) of `files`, each epoch from the newest file that starts at or before it (A5 point 5): a
 *  file's state at t counts within its first segment hours and only when no newer file of the set starts in (its start, t]. `dropped` counts
 *  the states that rule removes and no newer file holds at the same epoch (the states the reader at 2c2c4d4 kept). */
function track(files, from, to, openLow) {
  const out = new Map();
  let dropped = 0;
  files.forEach((f, i) => {
    const newer = files.slice(i + 1), next = newer[0]?.start ?? Infinity;
    for (const [t, s] of f.states) {
      if ((openLow ? t <= from : t < from) || t > to || t < f.start || t - f.start > SEG) continue;
      if (t >= next) { if (!newer.some((g) => t >= g.start && t - g.start <= SEG && g.states.has(t))) dropped += 1; continue; }
      out.set(t, { epoch: iso(t), r: s.slice(0, 3), v: s.slice(3, 6), file: f.sha.slice(0, 12) });
    }
  });
  return { lines: [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l), dropped };
}
const trackSha = (lines) => sha256(Buffer.from(JSON.stringify(lines.map((l) => [l.epoch, l.r, l.v]))));

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
  const phase = args.phase ?? 'fit';
  if (!['fit', 'ffm', 'score'].includes(phase)) throw new Error(`unknown phase ${phase}`);
  const through = phase === 'score' ? args.through : null;
  if (phase === 'score' && !cycles.includes(through)) throw new Error('--through names a closed capture cycle');
  const scored = phase === 'score' ? completeBins(through) : [];
  if (phase === 'score' && !scored.length) throw new Error(`no bin is complete at ${through}`);
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
  const norads = fs.readdirSync(path.join(S.captureRoot, forecastCycle)).filter((f) => /^\d+\.json\.gz$/.test(f)).map((f) => Number(f.split('.')[0])).sort((a, b) => a - b);
  const out = path.join(store, 'rows', phase === 'score' ? `starlink-score.${through}.s${k}.jsonl` : `starlink-${phase}.s${k}.jsonl`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const done = new Set(readJsonl(out).map((r) => r.norad));
  const modules = modulesRoot();
  const a = phase === 'ffm' ? null : await openFits(modules);
  const ff = phase === 'fit' ? null : await (await import('./lib/ffm-fit.mjs')).openFfmFit(modules);
  const object = (norad) => ({ frame: 'GCRF', name: `STARLINK ${norad}`, norad, originator: 'SpaceX via operator-capture' });
  const rowsOf = (prefix) => new Map(fs.readdirSync(path.join(store, 'rows')).filter((f) => f.startsWith(prefix)).flatMap((f) => readJsonl(path.join(store, 'rows', f))).map((r) => [r.norad, r]));
  const fits = phase === 'score' ? rowsOf('starlink-fit.') : null, ffmFits = phase === 'score' ? rowsOf('starlink-ffm.') : null;
  const fitIdentity = (w) => ({ norad: w.norad, F: w.F, E: iso(w.E), coverage: w.coverage, olderFiles: w.olderFiles, gated: w.gated.track, track: w.track, trackFrom: `the capture cycles before ${forecastCycle}` });
  const changed = (w, f) => (f.F?.sha !== w.F.sha ? 'the forecast file changed since the fit' : f.track?.sha !== w.track.sha ? 'the track changed since the fit' : null);
  let count = 0;
  for (let i = 0; i < norads.length; i += 1) {
    const norad = norads[i];
    if (i % n !== k || done.has(norad)) continue;
    if (args.limit && count >= Number(args.limit)) break;
    const w = windowOf(norad, through ?? cycles.at(-1));
    let row;
    if (w.excluded) row = { norad, excluded: w.excluded };
    else if (phase === 'fit' || phase === 'ffm') {
      row = fitIdentity(w);
      if (w.coverage < S.minimumCoverage) row.excluded = `operator track ${w.fit.length} epochs`;
      else if (phase === 'ffm') row.ffm = await ff.fit(norad, w.fit, w.E);
      else row.sgp4xp = await fitSdnap(a, object(norad), w.fit, w.E, 'SGP4XP');
    } else {
      // the score of the complete bins that the coverage rule counts
      const counted = scored.filter((b) => w.bins[b].counts);
      const binOf = (t) => { const h = (t - w.E) / H; const b = String(S.binsHours.findIndex(([lo, hi]) => h > lo && h <= hi) + 1); return counted.includes(b) ? b : null; };
      row = { norad, E: iso(w.E), through, binsComplete: scored, bins: w.bins, truthEpochs: w.truth.length, truthDropped: w.truthDropped, newerFiles: w.newerFiles, worstOverlapKm: w.worstOverlapKm, overlapEpochs: w.overlapEpochs, maneuverEvident: w.worstOverlapKm >= S.maneuverEvidentKm, gated: w.gated.truth };
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
  process.exit(0);
}
