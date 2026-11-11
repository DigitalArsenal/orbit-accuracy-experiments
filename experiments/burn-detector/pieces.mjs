// The burn detector, step 1 for one satellite of one row (lib/detector.mjs): the pieces of its truth over the union of its windows' spans,
// each flown from the truth's own state at its start with the row's full numerical setting and judged as of its own end (force terms of
// the fits up to then, the weather as issued then). Appends to <out>/<group>/<satellite>[.L<length>].pieces.jsonl; a piece already there is
// not flown again. The lists stay outside this repository.
//   node experiments/burn-detector/pieces.mjs --group S1 --satellite "Sentinel-1A" --out <dir> [--second] [--length 6 --stride 3]
import fs from 'node:fs';
import path from 'node:path';
const D = await import('./lib/detector.mjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const g = args.group, name = args.satellite, out = args.out;
if (!g || !name || !out) throw new Error('usage: pieces.mjs --group <g> --satellite <name> --out <dir> [--second] [--length 6 --stride 3]');
const lengthH = Number(args.length ?? 6), strideH = Number(args.stride ?? 3);
const ws = D.windowsOf(g, { second: !!args.second }).filter((w) => w.name === name);
if (!ws.length) throw new Error(`no windows for ${g} ${name}`);
const norad = ws.find((w) => w.norad)?.norad ?? null;
fs.mkdirSync(path.join(out, g), { recursive: true });
const file = path.join(out, g, `${D.slugOf(name)}${lengthH === 6 && strideH === 3 ? '' : `.L${lengthH}`}.pieces.jsonl`);
const done = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error).map((r) => r.nominal) : []);
const arm = D.FULL_SETTING[g], ctx = { ffm: await D.F.openFfm(), settings: D.SETTINGS[arm], terms: D.fittedTerms(g, name) };
const axes = await D.openAxesFor(g);
const t0 = Date.now();
let n = 0;
for (const [a, b] of D.spansOf(ws)) {
  const all = D.startsFor(a, b, strideH).filter((s) => !done.has(D.iso(s))), per = Math.round(240 / strideH);
  for (let k = 0; k < all.length; k += per) {
    const starts = all.slice(k, k + per);
    const lines = await D.truthSeries(g, name, norad, starts[0] - D.HOUR, starts.at(-1) + lengthH * D.HOUR + D.HOUR, axes);
    const write = (row) => { fs.appendFileSync(file, `${JSON.stringify({ group: g, name, norad, arm, asOf: 'piece end', lengthH, strideH, ...row })}\n`); n += 1; };
    if (!lines.length) { for (const s of starts) write({ nominal: D.iso(s), gap: true, note: 'no truth in this stretch' }); continue; }
    const T = D.indexTruth(lines);
    await D.pieces(ctx, T, starts, { lengthH, onRow: (row) => write({ truthStepS: T.stepMs / 1000, ...row }) });
    console.error(`${g} ${name}: through ${D.iso(starts.at(-1))}, ${n} pieces, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
await ctx.ffm.close();
console.error(`${g} ${name}: done, ${n} pieces in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(0);
