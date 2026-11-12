// The burn detector, step 2 for one satellite of one row (lib/detector.mjs), from its pieces (pieces.mjs), strictly as of each piece's end E:
//   1. the position flag: a piece is flagged when its closure exceeds max(floor, median + 10 x 1.4826 x MAD) of the pieces that ended before
//      E (judged only with --min-prior of them, default 16);
//   2. the velocity levels of the search, per halving depth: calibration pieces, burn-free by the flag as of their own end (the first six of
//      the span and the rest spread over it, --calib in all), each split in halves to depth 4 by flights from the truth; as of E,
//      Vthr(depth) = max(vfloor, 1.5 x the largest closure at that depth over the calibration pieces that ended before E) (judged only with
//      --min-calib of them, default 5);
//   3. each flagged piece searched with the levels as of its end: halves above them are split again down to about 90 s or two truth steps; a
//      flagged piece with no half above them is unlocalized (a spread force error), never a burn;
//   4. the intervals within 10 min of each other are one burn. It is known at R = the later of the end of the earliest piece that localizes
//      it and the end of its extent plus 20 min, where its velocity change from both sides of the extent (truth states no later than R, the
//      weather and force terms as of R) holds from states 10 and 20 min further out; a burn that does not hold is tried again with each
//      later piece that finds it, and stays a rejected candidate if it never holds.
// Writes <out>/<group>/<satellite>.burns.json (every candidate, with its report time; the list's own rule: asOf) and <satellite>.mnv (one
// size-prefixed $MNV per burn, STATUS DETECTED). The lists stay outside this repository.
//   node experiments/burn-detector/burns.mjs --group S1 --satellite "Sentinel-1A" --out <dir> --floor 10 [--tag .L2] [--calib 30] [--vfloor 0.2] [--flag-vel]
import fs from 'node:fs';
import path from 'node:path';
const D = await import('./lib/detector.mjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const g = args.group, name = args.satellite, out = args.out, floor = Number(args.floor);
if (!g || !name || !out || !Number.isFinite(floor)) throw new Error('usage: burns.mjs --group <g> --satellite <name> --out <dir> --floor <m> [--tag .L2] [--calib 30] [--vfloor 0.2]');
const tag = args.tag ?? '', nCalib = Number(args.calib ?? 30), vFloor = Number(args.vfloor ?? 0.2), minPrior = Number(args['min-prior'] ?? 16), minCalib = Number(args['min-calib'] ?? 5);
const slug = D.slugOf(name), dir = path.join(out, g), piecesFile = `${slug}${tag}.pieces.jsonl`;
const byNominal = new Map();
for (const r of fs.readFileSync(path.join(dir, piecesFile), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) if (!byNominal.has(r.nominal) || (byNominal.get(r.nominal).error && !r.error)) byNominal.set(r.nominal, r);
const all = [...byNominal.values()], ok = all.filter((r) => !r.gap && !r.error).map((r) => ({ ...r, E: Date.parse(r.end) })).sort((a, b) => a.E - b.E);
const median = (v) => { const s = v.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// 1. the position flag as of each piece's end; with --flag-vel the same rule on the piece's velocity closure as well (an orbit far from
//    the Earth, where a firing shows in the velocity long before it grows in position), and a calibration piece quiet in both
const flagVel = args['flag-vel'] === 'true';
const madRule = (v) => { const med = median(v); return med + 10 * 1.4826 * median(v.map((x) => Math.abs(x - med))); };
for (let i = 0; i < ok.length; i += 1) {
  const prior = ok.filter((p) => p.E < ok[i].E);
  ok[i].judged = prior.length >= minPrior;
  if (!ok[i].judged) continue;
  ok[i].thr = Math.max(floor, madRule(prior.map((p) => p.posM)));
  ok[i].vthr = flagVel ? Math.max(vFloor, madRule(prior.map((p) => p.velMmS).filter(Number.isFinite))) : Infinity;
  ok[i].flagged = ok[i].posM > ok[i].thr || ok[i].velMmS > ok[i].vthr;
}
const ws = D.windowsOf(g, { second: true }).filter((w) => w.name === name), norad = ws.find((w) => w.norad)?.norad ?? null;
// the force terms' pool: the pieces' own (--terms-days at pieces.mjs), so the search flies what the flag flew
const termsDays = ok[0]?.termsDays ?? D.TERMS_DAYS;
const arm = D.FULL_SETTING[g], ctx = { ffm: await D.F.openFfm(), settings: D.SETTINGS[arm], terms: D.fittedTerms(g, name), termsDays };
const axes = await D.openAxesFor(g);
const truthAround = async (fromMs, toMs) => D.indexTruth(await D.truthSeries(g, name, norad, fromMs - D.HOUR, toMs + D.HOUR, axes));
// 2. the calibration pieces: burn-free as of their own end, the first six and the rest spread over the span
// (every row pieces.mjs writes for a flown piece carries velMmS; a row without it counts as quiet in velocity)
const quiet = ok.filter((p) => p.judged && p.posM < p.thr / 2 && (p.velMmS ?? 0) < p.vthr / 2);
const spread = quiet.slice(6).filter((_, i, s) => i % Math.max(1, Math.floor(s.length / Math.max(1, nCalib - 6))) === 0).slice(0, Math.max(0, nCalib - 6));
const calib = [];
for (const p of [...quiet.slice(0, 6), ...spread]) {
  const T = await truthAround(Date.parse(p.start), p.E);
  calib.push({ E: p.E, byDepth: await D.calibrate(ctx, T, T.at.get(Date.parse(p.start)), T.at.get(p.E)) });
}
const levelsAt = (E) => {
  const prior = calib.filter((c) => c.E < E);
  if (prior.length < minCalib) return null;
  return Object.fromEntries([1, 2, 3, 4].map((d) => [d, Math.max(vFloor, 1.5 * Math.max(0, ...prior.map((c) => c.byDepth[d] ?? 0)))]));
};
// 3 and 4. the search, piece by piece in the order they end, and each event's report time
const events = [], unlocalized = [], unjudged = { pieces: ok.filter((p) => !p.judged).length, flaggedWithoutLevels: 0 };
for (const p of ok.filter((x) => x.flagged)) {
  const levels = levelsAt(p.E);
  if (!levels) { unjudged.flaggedWithoutLevels += 1; continue; }
  const vAt = (d) => levels[Math.max(1, Math.min(4, d))];
  const T = await truthAround(Date.parse(p.start), p.E);
  for (const f of await D.searchBurns(ctx, T, T.at.get(Date.parse(p.start)), T.at.get(p.E), vAt)) {
    if (f.unlocalized) { unlocalized.push({ piece: p.nominal, from: D.iso(f.from), to: D.iso(f.to), halves: f.halves }); continue; }
    let ev = events.find((e) => f.from <= e.to + 10 * 60e3 && f.to >= e.from - 10 * 60e3);
    if (!ev) { ev = { from: f.from, to: f.to, found: [], pieces: [], known: null, attempts: [] }; events.push(ev); }
    ev.found.push({ ...f, E: p.E }); if (!ev.pieces.includes(p.nominal)) ev.pieces.push(p.nominal);
    ev.from = Math.min(ev.from, f.from); ev.to = Math.max(ev.to, f.to);
  }
  // each event found by this piece and not yet known: try it as of now
  for (const ev of events.filter((e) => !e.known && e.found.some((f) => f.E === p.E))) {
    const sofar = ev.found.filter((f) => f.E <= p.E), from = Math.min(...sofar.map((f) => f.from)), to = Math.max(...sofar.map((f) => f.to));
    const best = sofar.slice().sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
    const R = Math.max(p.E, to + 20 * 60e3);
    const Tr = await truthAround(from - 30 * 60e3, R);
    const refined = await D.refineAsOf(ctx, Tr, from, to, R);
    const attempt = { piece: p.nominal, reportTime: D.iso(R), extentFrom: D.iso(from), extentTo: D.iso(to), best, refined };
    ev.attempts.push(attempt);
    // a seam of the truth (lib/detector.mjs seamOf) is never a burn and is not tried again
    const seam = D.seamOf(refined);
    if (seam) { ev.known = attempt; ev.seam = seam; } else if (refined.consistent) ev.known = attempt;
  }
}
const record = (ev) => {
  const a = ev.known ?? ev.attempts.at(-1), b = a.best;
  return { burn: D.iso((b.from + b.to) / 2), from: D.iso(b.from), to: D.iso(b.to), extentFrom: a.extentFrom, extentTo: a.extentTo, reportTime: a.reportTime, firstPiece: ev.attempts[0].piece,
    pieces: ev.pieces, attempts: ev.attempts.length, sizeMmS: +b.v.toFixed(3), dvRtnMmS: b.dv.map((x) => +x.toFixed(3)), acrossGap: !!b.acrossGap, refined: a.refined };
};
const burns = events.filter((e) => e.attempts.length && !e.seam).map(record).sort((a, b) => a.burn.localeCompare(b.burn));
const seams = events.filter((e) => e.seam).map((e) => { const { burn, ...rest } = record(e); return { at: burn, ...rest, seamTest: e.seam }; }).sort((a, b) => a.at.localeCompare(b.at));
// the object's piece closure: the median of the position closure over all its flown pieces, with its MAD and 90th and 99th percentiles, and the
// last threshold the flag rule gave. The median is the weight of the object's reference in a numerical fit (lib/arms.mjs objectSigmaM:
// sigma = max(10 m, medianM)), the reference's own noise where the object is not thrusting. Written for every list made here.
const positionClosure = D.positionClosureOf(ok, floor);
const doc = { group: g, name, norad, arm, asOf: 'each burn is known at its reportTime, made from nothing later', piecesFile, lengthH: ok[0]?.lengthH ?? 6, strideH: ok[0]?.strideH ?? 3,
  pieces: all.length, flown: ok.length, positionClosure, gapPieces: all.filter((r) => r.gap).length, errorPieces: all.filter((r) => r.error).length, unjudged,
  rule: { floorM: floor, flagVelocity: flagVel, termsDays, minPrior, minCalib, vFloorMmS: vFloor, calibrationPieces: calib.length, seam: D.SEAM }, flaggedPieces: ok.filter((p) => p.flagged).map((p) => p.nominal), burns, seams, unlocalized };
fs.writeFileSync(path.join(dir, `${slug}.burns.json`), `${JSON.stringify(doc, null, 1)}\n`);
// the typed records: one $MNV per burn that holds
const algorithm = 'burn detector (stack issue 462): pieces of the precise orbit flown by the full numerical setting from its own states, as of each piece\'s end; flagged pieces halved by flights to about 90 s; velocity change from both sides of the extent';
const stateModel = `propagator/ffm ${ctx.ffm.provenance?.ffm?.version ?? ''} ${arm}`.trim();
const mnv = burns.filter((b) => b.refined.consistent).map((b) => D.mnvBytes({ id: `${slug}-${b.extentFrom}`, satNo: norad, name, burn: b, algorithm, stateModel }));
fs.writeFileSync(path.join(dir, `${slug}.mnv`), Buffer.concat(mnv.map((x) => Buffer.from(x))));
console.error(`${g} ${name}: ${ok.length} pieces (${unjudged.pieces} before enough prior pieces), ${doc.flaggedPieces.length} flagged (${unjudged.flaggedWithoutLevels} before enough calibration), ${burns.filter((b) => b.refined.consistent).length} burns, ${burns.filter((b) => !b.refined.consistent).length} rejected candidates, ${seams.length} seams of the truth, ${unlocalized.length} unlocalized intervals; ${mnv.length} $MNV records`);
await ctx.ffm.close();
process.exit(0);
