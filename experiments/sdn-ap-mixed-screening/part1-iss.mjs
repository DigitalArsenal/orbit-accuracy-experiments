// Part 1b (PLAN.md): SDN-AP, SGP4-XP and SGP4 fitted to the first 24 h of each NASA ISS trajectory file, scored against the first 24 h of
// the newer files that start in the 72 h after the fit, beside NASA's own forecast (the same file). One JSON line per window under
// <store>/rows/iss.s<k>.jsonl (statistics and fitted sets only). Re-running skips windows already present.
//   node experiments/sdn-ap-mixed-screening/part1-iss.mjs [--shard k/n] [--limit n]
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, frozen, readJsonl, g1Dir } from './common.mjs';

frozen();
const I = config.part1.iss;
const H = 3600e3;
const { parseIssOem } = await import(path.join(g1Dir, 'lib/iss-oem.mjs'));
const { archiveHeaders, burnClusters } = await import(path.join(g1Dir, 'lib/iss-windows.mjs'));
const { modulesRoot } = await import(path.join(g1Dir, 'lib/modules.mjs'));
const { openFits, fitSdnap, fitSgp4, statesAt, scoreBins, iso } = await import('./lib/fits.mjs');

const headers = archiveHeaders();
const burns = burnClusters(headers).flatMap((c) => c.members.map((m) => m.tigMs));
const starts = headers.map((h) => h.header.startMs);
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const out = path.join(store, 'rows', `iss.s${k}.jsonl`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const done = new Set(readJsonl(out).map((r) => r.file));
const a = await openFits(modulesRoot());
const cache = new Map();
const statesOf = (i) => { if (!cache.has(i)) { if (cache.size > 12) cache.delete(cache.keys().next().value); cache.set(i, parseIssOem(fs.readFileSync(headers[i].file, 'utf8')).states); } return cache.get(i); };
const lineOf = (s) => ({ epoch: iso(s.ms), r: s.r, v: s.v });
const object = { frame: 'EME2000', name: 'ISS', norad: 25544, originator: 'NASA JSC FOD (ISS trajectory archive)' };
const binOf = (E) => (t) => { const h = (t - E) / H; const b = I.binsHours.findIndex(([lo, hi]) => h > lo && h <= hi); return b < 0 ? null : String(b + 1); };
let count = 0;
for (let i = 0; i < headers.length; i += 1) {
  if (i % n !== k || done.has(headers[i].date)) continue;
  if (args.limit && count >= Number(args.limit)) break;
  const start = starts[i], E = start + I.trackHours * H;
  if (!Number.isFinite(start)) { fs.appendFileSync(out, `${JSON.stringify({ file: headers[i].date, excluded: 'the header has no readable START_TIME' })}\n`); count += 1; continue; }
  const row = { file: headers[i].date, startUtc: iso(start), fitEndUtc: iso(E) };
  const burn = burns.find((t) => t >= start && t <= E + 72 * H);
  if (burn) { fs.appendFileSync(out, `${JSON.stringify({ ...row, excluded: `planned burn ${iso(burn)}` })}\n`); count += 1; continue; }
  // truth: the first 24 h of each newer file starting in (E, E + 72 h], each epoch from the newest such file that starts at or before it
  const newer = starts.map((s, j) => ({ s, j })).filter(({ s }) => s > E && s <= E + 72 * H).sort((x, y) => x.s - y.s);
  const truthBy = new Map();
  for (const { s, j } of newer) for (const st of statesOf(j)) if (st.ms >= s && st.ms <= s + I.truthHours * H && st.ms <= E + 72 * H) truthBy.set(st.ms, { ...lineOf(st), file: headers[j].date });
  const truth = [...truthBy.values()].sort((x, y) => Date.parse(x.epoch) - Date.parse(y.epoch));
  if (!truth.length) { fs.appendFileSync(out, `${JSON.stringify({ ...row, excluded: 'no newer file starts in the 72 h after the fit' })}\n`); count += 1; continue; }
  const own = statesOf(i);
  const track = own.filter((s) => s.ms >= start && s.ms <= E).map(lineOf);
  const epochs = truth.map((t) => Date.parse(t.epoch));
  const forecastBy = new Map(own.map((s) => [s.ms, s]));
  row.truth = { epochs: truth.length, files: [...new Set(truth.map((t) => t.file))] };
  const arms = {};
  arms.sdnap = await fitSdnap(a, object, track, E, 'SDNAP');
  arms.sgp4xp = await fitSdnap(a, object, track, E, 'SGP4XP');
  arms.sgp4 = await fitSgp4(a, object, track, E);
  for (const [name, f] of Object.entries(arms)) {
    if (!f.ok) continue;
    try {
      const fitPred = await statesAt(a, f.omm, track.map((l) => Date.parse(l.epoch)), 'EME2000');
      f.fit = (await scoreBins(a, fitPred, track, () => 'fit')).fit;
      f.bins = await scoreBins(a, await statesAt(a, f.omm, epochs, 'EME2000'), truth, binOf(E));
    } catch (error) { f.ok = false; f.error = `score: ${String(error.message).slice(0, 160)}`; }
  }
  const fc = truth.filter((t) => forecastBy.has(Date.parse(t.epoch)));
  arms.forecast = fc.length ? { ok: true, bins: await scoreBins(a, fc.map((t) => { const s = forecastBy.get(Date.parse(t.epoch)); return { r: s.r, v: s.v }; }), fc, binOf(E)) } : { ok: false, error: 'the file does not reach the truth epochs' };
  fs.appendFileSync(out, `${JSON.stringify({ ...row, arms })}\n`);
  count += 1;
  if (count % 20 === 0) console.error(`iss shard ${k}/${n}: ${count}`);
}
console.error(`iss shard ${k}/${n}: ${count} windows`);
await a.close();
process.exit(0);
