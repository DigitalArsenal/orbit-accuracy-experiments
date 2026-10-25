// Part 1a (PLAN.md): Starlink, prospective. The operator track (the 24 h before E from the captured first 8 h of the files older than F) is
// fitted by SDN-AP and SGP4-XP (phase `fit`) and by FFM (phase `ffm`, amendment A3); the fitted sets and state, and SpaceX's own forecast
// for the sample, are scored against the captured first 8 h of the files newer than F (phase `score`, once the capture cycles reach
// E + 72 h). The captured states pass the truth gate (harness/truth-gate.mjs, A3). Rows under <store>/rows/starlink-<phase>.s<k>.jsonl.
//   node experiments/sdn-ap-mixed-screening/part1-starlink.mjs --phase fit|ffm|score [--shard k/n] [--limit n]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, store, args, frozen, readJsonl, registeredMs, g1Dir, root } from './common.mjs';

const { gate } = await import(path.join(root, 'harness/truth-gate.mjs'));

frozen();
const S = config.part1.starlink;
const H = 3600e3, STEP = S.stepMinutes * 60e3, SEG = S.segmentHours * H;
const iso = (t) => new Date(t).toISOString();
const cycleMs = (id) => Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z'));
const cycles = fs.readdirSync(S.captureRoot).filter((d) => /^\d{4}-\d\d-\d\dT/.test(d)).sort();
const forecastCycle = process.env.B2_FORECAST_CYCLE ?? cycles.find((c) => cycleMs(c) > registeredMs());
if (!forecastCycle) throw new Error('no capture cycle after the registration yet');

/** Every captured file of one satellite, one entry per file (by SHA-256): { start, sha, cycle, states: Map(ms -> [x, y, z, vx, vy, vz] km, km/s),
 *  gated: the states the truth gate dropped }; the gate's product is the capture's (operator-capture/<cycle>/<file SHA-256, 16 hex>). */
function filesOf(norad) {
  const byFile = new Map();
  for (const c of cycles) {
    const f = path.join(S.captureRoot, c, `${norad}.json.gz`);
    if (!fs.existsSync(f)) continue;
    let d;
    try { d = JSON.parse(zlib.gunzipSync(fs.readFileSync(f))); } catch { continue; }
    if (!d.source?.sha256 || !(d.truth ?? []).length || byFile.has(d.source.sha256)) continue; // a cycle that stored no states of the file does not hold it
    const { kept, dropped } = gate(d.truth, { product: `operator-capture/${c}/${d.source.sha256.slice(0, 16)}`, norad, epochOf: (s) => s.ms, positionOf: (s) => s.stateM.slice(0, 3).map((x) => x / 1000) });
    byFile.set(d.source.sha256, { start: Date.parse(d.source.startUtc), sha: d.source.sha256, cycle: c, gated: dropped.length, states: new Map(kept.map((s) => [s.ms, s.stateM.map((x) => x / 1000)])) });
  }
  return [...byFile.values()].sort((a, b) => a.start - b.start);
}

/** Epochs in [from, to] from `files`, each from the newest file that starts at or before it and holds it within its first segment hours. */
function track(files, from, to, openLow) {
  const out = new Map();
  for (const f of [...files].sort((a, b) => b.start - a.start)) {
    for (const [t, s] of f.states) {
      if ((openLow ? t <= from : t < from) || t > to || t - f.start > SEG || t < f.start || out.has(t)) continue;
      // the newest file holding t wins: a newer file that starts at or before t was visited first
      out.set(t, { epoch: iso(t), r: s.slice(0, 3), v: s.slice(3, 6), file: f.sha.slice(0, 12) });
    }
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
}

/** The window of one satellite: F, E, the operator track, the truth, the maneuver evidence. */
export function windowOf(norad) {
  const files = filesOf(norad);
  const fc = path.join(S.captureRoot, forecastCycle, `${norad}.json.gz`);
  if (!fs.existsSync(fc)) return { norad, excluded: 'not in the forecast cycle' };
  const F = JSON.parse(zlib.gunzipSync(fs.readFileSync(fc))).source;
  const Fstart = Date.parse(F.startUtc), E = Fstart;
  const older = files.filter((f) => f.start < Fstart), newer = files.filter((f) => f.start > Fstart);
  const fit = track(older, E - S.trackHours * H, E, false);
  const truth = track(newer, E, E + 72 * H, true);
  // maneuver evidence: epochs two truth files both hold within their first segment hours
  let worstKm = 0;
  for (const a of newer) for (const b of newer) {
    if (b.start <= a.start) continue;
    for (const [t, s] of b.states) { const o = a.states.get(t); if (o && t - a.start <= SEG && t > E) worstKm = Math.max(worstKm, Math.hypot(s[0] - o[0], s[1] - o[1], s[2] - o[2])); }
  }
  const gated = { track: older.reduce((n, f) => n + f.gated, 0), truth: newer.reduce((n, f) => n + f.gated, 0) };
  return { norad, F: { sha: F.sha256, startUtc: F.startUtc, cycle: forecastCycle }, E, fit, truth, newerFiles: newer.length, olderFiles: older.length, coverage: fit.length / (S.trackHours * 60 / S.stepMinutes + 1), worstOverlapKm: worstKm, gated };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { modulesRoot } = await import(path.join(g1Dir, 'lib/modules.mjs'));
  const { openFits, fitSdnap, statesAt, convert, scoreBins } = await import('./lib/fits.mjs');
  const phase = args.phase ?? 'fit';
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
  const norads = fs.readdirSync(path.join(S.captureRoot, forecastCycle)).filter((f) => /^\d+\.json\.gz$/.test(f)).map((f) => Number(f.split('.')[0])).sort((a, b) => a - b);
  const out = path.join(store, 'rows', `starlink-${phase}.s${k}.jsonl`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const done = new Set(readJsonl(out).map((r) => r.norad));
  const modules = modulesRoot();
  const a = phase === 'ffm' ? null : await openFits(modules);
  const ff = phase === 'fit' ? null : await (await import('./lib/ffm-fit.mjs')).openFfmFit(modules);
  const object = (norad) => ({ frame: 'GCRF', name: `STARLINK ${norad}`, norad, originator: 'SpaceX via operator-capture' });
  const rowsOf = (prefix) => new Map(fs.readdirSync(path.join(store, 'rows')).filter((f) => f.startsWith(prefix)).flatMap((f) => readJsonl(path.join(store, 'rows', f))).map((r) => [r.norad, r]));
  const fits = phase === 'score' ? rowsOf('starlink-fit.') : null, ffmFits = phase === 'score' ? rowsOf('starlink-ffm.') : null;
  const binOf = (E) => (t) => { const h = (t - E) / H; const b = S.binsHours.findIndex(([lo, hi]) => h > lo && h <= hi); return b < 0 ? null : String(b + 1); };
  let count = 0;
  for (let i = 0; i < norads.length; i += 1) {
    const norad = norads[i];
    if (i % n !== k || done.has(norad)) continue;
    if (args.limit && count >= Number(args.limit)) break;
    const w = windowOf(norad);
    let row;
    if (w.excluded) row = { norad, excluded: w.excluded };
    else if (phase === 'fit' || phase === 'ffm') {
      row = { norad, F: w.F, E: iso(w.E), coverage: w.coverage, olderFiles: w.olderFiles, gated: w.gated.track };
      if (w.coverage < S.minimumCoverage) row.excluded = `operator track ${w.fit.length} epochs`;
      else if (phase === 'ffm') row.ffm = await ff.fit(norad, w.fit, w.E);
      else {
        row.sdnap = await fitSdnap(a, object(norad), w.fit, w.E, 'SDNAP');
        row.sgp4xp = await fitSdnap(a, object(norad), w.fit, w.E, 'SGP4XP');
      }
    } else {
      const f = fits.get(norad);
      row = { norad, E: iso(w.E), truthEpochs: w.truth.length, newerFiles: w.newerFiles, worstOverlapKm: w.worstOverlapKm, maneuverEvident: w.worstOverlapKm >= S.maneuverEvidentKm, gated: w.gated.truth };
      if (!f || f.excluded || f.F?.sha !== w.F.sha) row.excluded = f ? (f.excluded ?? 'the forecast file changed since the fit') : 'no fit row';
      else if (!w.truth.length) row.excluded = 'no truth';
      else {
        const epochs = w.truth.map((l) => Date.parse(l.epoch));
        row.arms = {};
        for (const arm of ['sdnap', 'sgp4xp']) {
          if (!f[arm]?.ok) { row.arms[arm] = { ok: false, error: f[arm]?.error }; continue; }
          try { row.arms[arm] = { ok: true, bins: await scoreBins(a, await statesAt(a, f[arm].omm, epochs, 'GCRF'), w.truth, binOf(w.E)) }; } catch (error) { row.arms[arm] = { ok: false, error: String(error.message).slice(0, 160) }; }
        }
        // the FFM arm (A3): its fit on the same track, carried forward by propagator/ffm
        const g = ffmFits.get(norad);
        if (!g || g.excluded || g.F?.sha !== w.F.sha || !g.ffm?.ok) row.arms.ffm = { ok: false, error: !g ? 'no FFM fit row' : g.excluded ?? (g.F?.sha !== w.F.sha ? 'the forecast file changed since the fit' : g.ffm?.error) };
        else {
          try { row.arms.ffm = { ok: true, bins: await scoreBins(a, await ff.predict(g.ffm, norad, epochs, w.E), w.truth, binOf(w.E)) }; } catch (error) { row.arms.ffm = { ok: false, error: String(error.message).slice(0, 160) }; }
        }
        const fcFile = path.join(store, 'forecast', `${norad}.json`);
        if (fs.existsSync(fcFile)) {
          const fc = JSON.parse(fs.readFileSync(fcFile));
          if (fc.error || Date.parse(fc.firstEpoch) !== Date.parse(w.F.startUtc)) row.arms.forecast = { ok: false, error: fc.error ?? 'the fetched file is not F' };
          else {
            const by = new Map(fc.states.map((s) => [Date.parse(s.epoch), s]));
            const pairs = w.truth.filter((l) => by.has(Date.parse(l.epoch)));
            const gcrf = await convert(a, pairs.map((l) => by.get(Date.parse(l.epoch))), 'EME2000', 'GCRF');
            row.arms.forecast = pairs.length ? { ok: true, bins: await scoreBins(a, gcrf, pairs, binOf(w.E)) } : { ok: false, error: 'no common epochs' };
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
