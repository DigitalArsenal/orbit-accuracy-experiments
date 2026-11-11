// The burn detector, step 3 for one satellite (after burns.mjs): whether its orbit is ballistic between impulses, strictly as of each
// cutoff. On pieces burn-free by its list (judged, not flagged as of their own end, and clear of every burn and candidate), the first six
// and the rest spread over the span (--n in all, default 12), each piece is flown again from the positions alone: the start state fitted
// by analysis/estimation to the truth's positions over the piece's first hour (the force terms as of the piece's end held by a tight
// prior), flown over the piece, the closure taken in position. Where a truth's velocities are noisier than its positions this
// closure is the orbit's own; where it stays far above the bar, the orbit holds thrust between impulses. The list keeps each pair with its
// end (positionsOnly); lib/arms.mjs notBallistic reads the verdict as of a cutoff from the pairs that ended by then.
//   node experiments/burn-detector/ballistic.mjs --group WA --satellite "SES-15" --out <dir> [--tag .L2] [--n 12] [--fit-minutes 60]
import fs from 'node:fs';
import path from 'node:path';
const D = await import('./lib/detector.mjs');
const { apriori } = await import(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../headline-loop/lib/settings.mjs'));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const g = args.group, name = args.satellite, out = args.out;
if (!g || !name || !out) throw new Error('usage: ballistic.mjs --group <g> --satellite <name> --out <dir> [--tag .L2] [--n 12]');
const tag = args.tag ?? '', n = Number(args.n ?? 12), slug = D.slugOf(name), dir = path.join(out, g);
const listFile = path.join(dir, `${slug}.burns.json`), L = JSON.parse(fs.readFileSync(listFile, 'utf8'));
const byNominal = new Map();
for (const r of fs.readFileSync(path.join(dir, `${slug}${tag}.pieces.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) if (!byNominal.has(r.nominal) || (byNominal.get(r.nominal).error && !r.error)) byNominal.set(r.nominal, r);
const ok = [...byNominal.values()].filter((r) => !r.gap && !r.error).sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
const flagged = new Set(L.flaggedPieces), spans = L.burns.map((b) => [Date.parse(b.extentFrom ?? b.from), Date.parse(b.extentTo ?? b.to)]);
const ws = D.windowsOf(g, { second: true }).filter((w) => w.name === name), norad = ws.find((w) => w.norad)?.norad ?? null;
const arm = D.FULL_SETTING[g], base = D.SETTINGS[arm], terms = D.fittedTerms(g, name), ffm = await D.F.openFfm(), axes = await D.openAxesFor(g);
// only pieces that start after the object's first fit: before it the flights carry the setting's starting terms, and the test would judge
// those terms, not the orbit
const firstFit = terms[0]?.cutoffMs ?? Infinity;
const clear = ok.filter((p, i) => i >= L.rule.minPrior && Date.parse(p.start) >= firstFit && !flagged.has(p.nominal) && !spans.some(([a, b]) => a < Date.parse(p.end) && b > Date.parse(p.start)));
const rest = clear.slice(6), pick = [...clear.slice(0, 6), ...rest.filter((_, i) => i % Math.max(1, Math.floor(rest.length / Math.max(1, n - 6))) === 0).slice(0, Math.max(0, n - 6))];
const pairs = [];
for (const p of pick) {
  const s0 = Date.parse(p.start), e0 = Date.parse(p.end);
  const T = D.indexTruth(await D.truthSeries(g, name, norad, s0 - D.HOUR, e0 + D.HOUR, axes));
  const i0 = T.at.get(s0), i1 = T.at.get(e0);
  if (i0 === undefined || i1 === undefined) continue;
  const params = D.termsAsOf(terms, base, e0, L.rule.termsDays ?? D.TERMS_DAYS), rows = base.forces.drag ? D.weatherAsOf(e0) : null;
  const settings = { ...base, parameters: params, apriori: apriori(params.map((q) => Math.max(Math.abs(q.value), 1e-9) * 1e-6)), maximumIterations: 20, correctionTolerance: 1e-4, sigmaM: 0.01 };
  // the positions over the piece's first --fit-minutes (default 60), one every 300 s or more: two positions 300 s apart leave the start
  // velocity to a broadcast truth's meter-level position noise (about 3 mm/s, 60 m over 6 h, the size of the bar itself)
  const fitMin = Number(args['fit-minutes'] ?? 60), pts = [i0];
  for (let k = i0 + 1; k < T.s.length && T.s[k].t - T.s[i0].t <= fitMin * 60e3; k += 1) if (T.s[k].t - T.s[pts.at(-1)].t >= 300e3) pts.push(k);
  const j = pts.at(-1), lines = pts.map((k) => ({ epoch: D.iso(T.s[k].t), r: T.s[k].r, v: T.s[k].v }));
  try {
    const f = await ffm.fit(lines, settings, T.s[j].t, rows);
    const product = { epoch: D.iso(s0), state: f.state.slice(0, 6), parameters: params };
    const [a] = await ffm.forecast(product, [D.iso(e0)], base, rows);
    const c = D.closure(T.s[i1], a), velocityDiff = Math.hypot(...[0, 1, 2].map((k) => (f.state[3 + k] / 1000 - T.s[i0].v[k]) * 1e6));
    pairs.push({ nominal: p.nominal, end: p.end, truthVelocityM: p.posM, positionsOnlyM: +Math.hypot(...c.dr).toFixed(3), startVelocityDiffMmS: +velocityDiff.toFixed(3), fitOk: f.ok });
  } catch (e) { pairs.push({ nominal: p.nominal, end: p.end, error: String(e?.message ?? e).slice(0, 160) }); }
}
L.positionsOnly = { rule: 'not ballistic as of a cutoff: the median closure of the positions-only pairs ended by then above barM, with at least minPairs of them', barM: 100, minPairs: 3, pieceHours: ok[0]?.lengthH ?? 6, pairs };
delete L.notBallistic;
fs.writeFileSync(listFile, `${JSON.stringify(L, null, 1)}\n`);
const good = pairs.filter((x) => !x.error).map((x) => x.positionsOnlyM).sort((a, b) => a - b);
console.error(`${g} ${name}: ${good.length} positions-only pairs (${pairs.length - good.length} failed), median ${good.length ? good[good.length >> 1] : null} m, the first ended ${pairs[0]?.end ?? null}`);
await ffm.close();
process.exit(0);
