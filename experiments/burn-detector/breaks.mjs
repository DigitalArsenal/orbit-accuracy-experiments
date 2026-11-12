// The break test, the burn detector's second detector (stack issue 574). The first detector flags a 6 h piece whose position closure exceeds
// max(floor, median + 10 x 1.4826 x MAD) of the pieces before it, so on an object whose reference is noisy (the WAAS broadcast ephemeris closes
// to about 100 m over 6 h pieces) its threshold is about 700 m and a step of 11 to 51 mm/s is below it. This test reads the fit instead: the
// numerical setting with no empirical term (a sphere, Ffull) is fitted to every arc of LENGTH hours at a stride of STRIDE hours, each weighed at
// the floor sigma (10 m), and an arc CLOSES where its weighted RMS is at most CLOSE (1.5). A step in the arc keeps it from closing; an arc that
// closes on both sides of a time and not across it holds an event there.
// The file written holds the ARCS (start, end, weighted RMS, null where the fit failed) and the rule's constants, never the events: a cutoff reads
// the events its arcs show with only the arcs that end at or before it (lib/arms.mjs breakEventsAsOf), so an event, its extent and whether a run
// of failing arcs is a drift (more than MAX_RUN arcs) are what the data before the cutoff show. The events join the object's burns in lib/arms.mjs
// knownBurns (<group>/<satellite>.breaks.json beside <satellite>.burns.json): the arc rule reads each as a burn known at the end of its first
// failing arc. The summary line counts the events the whole file shows.
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
const arcs = [];
const CHUNK = 3 * D.DAY; // a read the store cannot serve whole (before its first day) loses its three days, not ten
for (const [a, b] of D.spansOf(ws.map((w) => ({ ...w, arcs: [Math.max(...w.arcs) + leadDays * 24] })))) {
  // the truth is read three days at a time, a chunk's arcs being those that start in it
  for (let c0 = Math.ceil(a / STRIDE) * STRIDE; c0 < b; c0 += CHUNK) {
    const c1 = Math.min(b, c0 + CHUNK + lengthH * HOUR);
    let lines;
    try { lines = await D.truthSeries(g, name, norad, c0 - HOUR, c1 + HOUR, axes); } catch { continue; }
    if (!lines.length) continue;
    for (let s = c0; s < c0 + CHUNK && s + lengthH * HOUR <= c1; s += STRIDE) {
      const e = s + lengthH * HOUR, thin = D.W.arcOf(lines.filter((l) => l.t >= s && l.t <= e), lengthH);
      if (!thin) continue;
      try {
        const f = await F.fit(thin, settings, e, settings.forces.drag ? D.weatherAsOf(e) : null);
        arcs.push({ start: s, end: e, wrms: Number.isFinite(f.weightedRms) ? f.weightedRms : null });
      } catch (err) { arcs.push({ start: s, end: e, wrms: null, error: String(err?.message ?? err).slice(0, 120) }); }
    }
  }
}
arcs.sort((p, q) => p.start - q.start);
const file = path.join(out, g === 'HE72' ? 'HE' : g, `${D.slugOf(name)}.breaks.json`);
const doc = { group: g, name, norad, setting: arm, sigmaM: settings.sigmaM, lengthH, strideH, closeWeightedRms: close, maxRun, arcs: arcs.map((x) => ({ start: D.iso(x.start), end: D.iso(x.end), wrms: x.wrms == null ? null : Math.round(x.wrms * 1e4) / 1e4 })) };
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(doc)}\n`);
const events = D.A.breakEventsAsOf(doc, Infinity);
console.log(JSON.stringify({ group: g, satellite: name, arcs: arcs.length, failing: arcs.filter((x) => Number.isFinite(x.wrms) && x.wrms > close).length, failedFits: arcs.filter((x) => !Number.isFinite(x.wrms)).length, events: events.length }));
await F.close();
process.exit(0);
