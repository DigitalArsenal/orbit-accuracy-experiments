// The burn detector, step 1 for one satellite of one row (lib/detector.mjs): the pieces of its truth over the union of its windows' spans,
// each flown from the truth's own state at its start with the row's full numerical setting and judged as of its own end (force terms of
// the fits up to then, the weather as issued then). Appends to <out>/<group>/<satellite>[.L<length>].pieces.jsonl; a piece already there is
// not flown again. Each span starts --lead days early (default 4), so the thresholds judged from earlier pieces exist from its first fit
// arc on (data before a cutoff). The lists stay outside this repository.
//   node experiments/burn-detector/pieces.mjs --group S1 --satellite "Sentinel-1A" --out <dir> [--second] [--length 6 --stride 3] [--lead 4]
import fs from 'node:fs';
import path from 'node:path';
const D = await import('./lib/detector.mjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const g = args.group, name = args.satellite, out = args.out;
if (!g || !name || !out) throw new Error('usage: pieces.mjs --group <g> --satellite <name> --out <dir> [--second] [--length 6 --stride 3]');
const lengthH = Number(args.length ?? 6), strideH = Number(args.stride ?? 3), leadDays = Number(args.lead ?? 4);
const ws = D.windowsOf(g, { second: !!args.second }).filter((w) => w.name === name);
if (!ws.length) throw new Error(`no windows for ${g} ${name}`);
const norad = ws.find((w) => w.norad)?.norad ?? null;
fs.mkdirSync(path.join(out, g), { recursive: true });
const file = path.join(out, g, `${D.slugOf(name)}${lengthH === 6 && strideH === 3 ? '' : `.L${lengthH}`}.pieces.jsonl`);
const done = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error).map((r) => r.nominal) : []);
const arm = D.FULL_SETTING[g], termsDays = Number(args['terms-days'] ?? D.TERMS_DAYS), ctx = { ffm: await D.F.openFfm(), settings: D.SETTINGS[arm], terms: D.fittedTerms(g, name), termsDays };
const axes = await D.openAxesFor(g);
const t0 = Date.now();
let n = 0;
for (const [a, b] of D.spansOf(ws.map((w) => ({ ...w, arcs: [Math.max(...w.arcs) + leadDays * 24] })))) {
  const all = D.startsFor(a, b, strideH).filter((s) => !done.has(D.iso(s))), per = Math.round(240 / strideH);
  for (let k = 0; k < all.length; k += per) {
    const starts = all.slice(k, k + per);
    const write = (row) => { fs.appendFileSync(file, `${JSON.stringify({ group: g, name, norad, arm, asOf: 'piece end', lengthH, strideH, termsDays, ...row })}\n`); n += 1; };
    const truthOf = async (s0, s1) => { try { return await D.truthSeries(g, name, norad, s0 - D.HOUR, s1 + lengthH * D.HOUR + D.HOUR, axes); } catch (e) { return { error: String(e?.message ?? e).slice(0, 160) }; } };
    // a stretch the truth's reader refuses (a day not stored) is read again piece by piece, so only the pieces it touches are gaps
    const whole = await truthOf(starts[0], starts.at(-1));
    for (const part of whole.error ? starts.map((s) => [s]) : [starts]) {
      const lines = whole.error ? await truthOf(part[0], part[0]) : whole;
      if (lines.error || !lines.length) { for (const s of part) write({ nominal: D.iso(s), gap: true, note: lines.error ?? 'no truth in this stretch' }); continue; }
      const T = D.indexTruth(lines);
      await D.pieces(ctx, T, part, { lengthH, onRow: (row) => write({ truthStepS: T.stepMs / 1000, ...row }) });
    }
    console.error(`${g} ${name}: through ${D.iso(starts.at(-1))}, ${n} pieces, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
await ctx.ffm.close();
console.error(`${g} ${name}: done, ${n} pieces in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(0);
