// The break test, the burn detector's second detector (stack issue 574). The first detector flags a 6 h piece whose position closure exceeds
// max(floor, median + 10 x 1.4826 x MAD) of the pieces before it, so on an object whose reference is noisy (the WAAS broadcast ephemeris closes
// to about 100 m over 6 h pieces) its threshold is about 700 m and a step of 11 to 51 mm/s is below it. This test reads the fit instead: the
// numerical setting with no empirical term (a sphere, Ffull) is fitted to every arc of LENGTH hours at a stride of STRIDE hours, each weighed at
// the floor sigma (10 m), and an arc CLOSES where its weighted RMS is at most CLOSE (1.5). A step in the arc keeps it from closing: a run of failing
// arcs (each one stride after the one before) holds an event if the arc one stride before the run closed; the arc one stride after the run, if it
// closed and has ended by a cutoff, closes the event. A gap (an arc with no truth, no coverage or no fit) neither closes nor fails, and severs both.
// The file written holds the ARCS (start, end, weighted RMS, null with a reason where the fit or its data are missing) and the rule's constants,
// never the events: a cutoff reads the events its arcs show with only the arcs that end at or before it (lib/arms.mjs breakEventsAsOf, whose
// comment gives the rule exactly). As read at a cutoff a run of up to MAX_RUN failing arcs is an event and a run that reaches MAX_RUN + 1 is a
// drift, so an event can be withdrawn when the next arc ends. The events join the object's burns in lib/arms.mjs knownBurns (<group>/<satellite>.breaks.json beside <satellite>.burns.json):
// the arc rule reads each as a burn known at the end of its first failing arc. The summary line counts the events at the period's end.
//   node experiments/burn-detector/breaks.mjs --group WA --satellite "<name>" --out <dir> [--length 24 --stride 12 --close 1.5 --max-run 3 --lead 4]
// Reads the archive and the store only; the file named is the one thing written. SDN_MODULES_ROOT names the modules checkout, as for pieces.mjs.
import fs from 'node:fs';
import path from 'node:path';
const D = await import('./lib/detector.mjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const g = args.group, name = args.satellite, out = args.out;
if (!g || !name || !out) throw new Error('usage: breaks.mjs --group <g> --satellite <name> --out <dir> [--length 24 --stride 12 --close 1.5 --max-run 3 --lead 4]');
const lengthH = Number(args.length ?? 24), strideH = Number(args.stride ?? 12), close = Number(args.close ?? 1.5), maxRun = Number(args['max-run'] ?? 3), leadDays = Number(args.lead ?? 4);
const ws = D.windowsOf(g, { second: true }).filter((w) => w.name === name);
if (!ws.length) throw new Error(`no windows for ${g} ${name}`);
const norad = ws.find((w) => w.norad)?.norad ?? null;
// the sphere of the group's full setting: the five-term setting with its terms removed (the terms absorb the thrust this test looks for)
const full = D.FULL_SETTING[g], arm = /^E5/.test(full) ? 'Ffull' : full, settings = D.SETTINGS[arm];
const F = await D.F.openFfm(), axes = await D.openAxesFor(g);
const HOUR = D.HOUR, STRIDE = strideH * HOUR;
const byStart = new Map();
for (const [a, b] of D.spansOf(ws.map((w) => ({ ...w, arcs: [Math.max(...w.arcs) + leadDays * 24] })))) {
  // the truth is read for each arc alone: a day the store lacks, after an arc's end, costs the arcs that need it and no other, and an arc whose
  // data are missing is written with a null weighted RMS (a gap: neither closing nor failing), never dropped
  for (let s = Math.ceil(a / STRIDE) * STRIDE; s + lengthH * HOUR <= b; s += STRIDE) {
    if (byStart.has(s)) continue;
    const e = s + lengthH * HOUR;
    let wrms = null, why = null;
    try {
      const lines = await D.truthSeries(g, name, norad, s - HOUR, e + HOUR, axes), thin = lines.length ? D.W.arcOf(lines.filter((l) => l.t >= s && l.t <= e), lengthH) : null;
      if (!thin) why = 'no coverage';
      else { const f = await F.fit(thin, settings, e, settings.forces.drag ? D.weatherAsOf(e) : null); wrms = Number.isFinite(f.weightedRms) ? f.weightedRms : null; if (wrms == null) why = 'the fit gave no weighted RMS'; }
    } catch (err) { why = String(err?.message ?? err).slice(0, 120); }
    byStart.set(s, { start: s, end: e, wrms, ...(why ? { gap: why } : {}) });
  }
}
const arcs = [...byStart.values()].sort((p, q) => p.start - q.start);
const file = path.join(out, g === 'HE72' ? 'HE' : g, `${D.slugOf(name)}.breaks.json`);
const doc = { group: g, name, norad, setting: arm, sigmaM: settings.sigmaM, lengthH, strideH, closeWeightedRms: close, maxRun, arcs: arcs.map((x) => ({ start: D.iso(x.start), end: D.iso(x.end), wrms: x.wrms == null ? null : Math.round(x.wrms * 1e4) / 1e4, ...(x.gap ? { gap: x.gap } : {}) })) };
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(doc)}\n`);
// the events the whole file shows (a cutoff at the period's end): no window of the row saw all of them at its own cutoff
const events = D.A.breakEventsAsOf(doc, Infinity);
console.log(JSON.stringify({ group: g, satellite: name, arcs: arcs.length, failing: arcs.filter((x) => Number.isFinite(x.wrms) && x.wrms > close).length, gaps: arcs.filter((x) => x.gap).length, eventsAtPeriodEnd: events.length }));
await F.close();
process.exit(0);
