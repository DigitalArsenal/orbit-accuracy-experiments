// The break test, the burn detector's second detector (stack issue 574). The first detector flags a 6 h piece whose position closure exceeds
// max(floor, median + 10 x 1.4826 x MAD) of the pieces before it, so on an object whose reference is noisy (the WAAS broadcast ephemeris closes
// to about 100 m over 6 h pieces) its threshold is about 700 m and a step of 11 to 51 mm/s is below it. This test reads the fit instead: the
// numerical setting with no empirical term (a sphere, Ffull) is fitted to every arc of LENGTH hours at a stride of STRIDE hours, each weighed at
// the floor sigma (10 m), and an arc CLOSES where its weighted RMS is at most CLOSE (1.5). A step in the arc keeps it from closing; an arc that
// closes on both sides of a time and not across it holds an event there. A run of failing arcs after an arc that closes holds an event between the
// end of the arc that closed before it and the start of the first arc that closed after it, inside every failing arc; a run of more than
// MAX_RUN arcs is a drift (continuous thrust, or a model that does not fit), listed apart and never an event.
// Each event is known at the end of the first arc that failed (data before it only), and joins the object's list in lib/arms.mjs knownBurns
// (<group>/<satellite>.breaks.json beside <satellite>.burns.json): the arc rule reads it as a burn.
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
const CHUNK = 10 * D.DAY;
for (const [a, b] of D.spansOf(ws.map((w) => ({ ...w, arcs: [Math.max(...w.arcs) + leadDays * 24] })))) {
  // the truth is read ten days at a time (as pieces.mjs does), a chunk's arcs being those that start in it
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
        arcs.push({ start: s, end: e, wrms: f.weightedRms, closes: Number.isFinite(f.weightedRms) && f.weightedRms <= close });
      } catch (err) { arcs.push({ start: s, end: e, wrms: null, closes: false, error: String(err?.message ?? err).slice(0, 120) }); }
    }
  }
}
arcs.sort((p, q) => p.start - q.start);
const events = [], drifts = [];
for (let i = 0; i < arcs.length;) {
  if (arcs[i].closes) { i += 1; continue; }
  let j = i;
  while (j + 1 < arcs.length && !arcs[j + 1].closes && arcs[j + 1].start - arcs[j].start === STRIDE) j += 1;
  const prev = i > 0 && arcs[i - 1].closes && arcs[i].start - arcs[i - 1].start === STRIDE ? arcs[i - 1] : null;
  const next = j + 1 < arcs.length && arcs[j + 1].closes && arcs[j + 1].start - arcs[j].start === STRIDE ? arcs[j + 1] : null;
  const run = arcs.slice(i, j + 1), worst = Math.max(...run.map((x) => x.wrms ?? 0));
  const from = Math.max(prev ? prev.end : -Infinity, arcs[j].start), to = Math.min(next ? next.start : Infinity, arcs[i].end);
  if (run.length > maxRun) drifts.push({ from: D.iso(arcs[i].start), to: D.iso(arcs[j].end), arcs: run.length, worstWrms: Math.round(worst * 100) / 100 });
  else if (from <= to) events.push({ from: D.iso(from), to: D.iso(to), extentFrom: D.iso(from), extentTo: D.iso(to), reportTime: D.iso(arcs[i].end), source: 'break test', arcsFailing: run.length, worstWrms: Math.round(worst * 100) / 100, closedBefore: !!prev, closedAfter: !!next });
  i = j + 1;
}
const file = path.join(out, g === 'HE72' ? 'HE' : g, `${D.slugOf(name)}.breaks.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify({ group: g, name, norad, setting: arm, sigmaM: settings.sigmaM, lengthH, strideH, closeWeightedRms: close, maxRun, arcs: arcs.length, failing: arcs.filter((x) => !x.closes).length, events, drifts })}\n`);
console.log(JSON.stringify({ group: g, satellite: name, arcs: arcs.length, failing: arcs.filter((x) => !x.closes).length, events: events.length, drifts: drifts.length }));
await F.close();
process.exit(0);
