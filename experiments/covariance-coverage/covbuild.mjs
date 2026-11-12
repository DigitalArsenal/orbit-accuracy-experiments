// One build's stated covariance against its own errors on the window set. Each window is fitted by the build's own fit (the truth arc
// thinned as the scoreboard thins it, the $PCF the build's version gives or --caps, the weather issued at the cutoff) and flown by its
// propagate in GCRF with its COVARIANCE_MATRIX_LINES on the scored epochs; errors and stated covariance in the truth's R, T, N axes by
// analysis/gp-error-model pair_statistics.
//   node covbuild.mjs <out> <build sha12> <shard k/n> [--caps T,Z]
// --caps T,Z: every record fitted at tesseral degree T and zonal degree Z (FORCES.MAXIMUM_TESSERAL_DEGREE, MAXIMUM_DEGREE), its other
// forces the row's own $PCF's.
// Rows: <out>/covbuild-<sha12>[-capsT-Z]-<k>of<n>.jsonl, one per window: line, group, arcH, cutoff, pcf, cp (the record's
// COV_PROPAGATION as written), fitRmsKm, and every 30 min of the scored days: epochsS (seconds after the cutoff), e [R, T, N] km,
// v [R, T, N] km^2 as stated. A window already in the file is skipped, so a stopped shard resumes.
import fs from 'node:fs';
import path from 'node:path';
import { outDir, shardArg, capsArg, capsTag, readJsonl, windowSet, windowOf, strongDragWindows, openBuild } from './lib.mjs';

const out = outDir(process.argv[2]);
const sha12 = process.argv[3];
const [K, N] = shardArg(process.argv[4]);
const CAPS = capsArg();
const { lines } = windowSet(out, K, N);
const M = await openBuild(out, sha12, CAPS);
const byKey = new Map(strongDragWindows().map((w) => [`${w.key}|${w.arcH}`, w]));
const outFile = path.join(out, `covbuild-${sha12}${capsTag(CAPS)}-${K}of${N}.jsonl`);
const done = new Set(readJsonl(outFile).map((r) => r.line));
const t0 = Date.now();
let n = 0;
for (const k of lines) {
  if (done.has(k)) continue;
  const w = windowOf(k, byKey);
  const row = { line: k, key: w?.key, group: w?.group, name: w?.name, arcH: w?.arcH, cutoff: w?.date, build: sha12 };
  try {
    if (!w) throw new Error('unknown window');
    const { ocm, record, pcf, sc } = await M.fitRecord(w);
    row.pcf = pcf; row.cp = record.COV_PROPAGATION; row.fitRmsKm = record.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_RMS_KM ?? null;
    const f = await M.fly(ocm, sc);
    const keep = M.kept(sc, w);
    row.epochsS = M.seconds(sc, w, keep);
    row.e = keep.map((i) => f[i].e); row.v = keep.map((i) => f[i].v);
  } catch (e) { row.error = String(e?.message ?? e).slice(0, 300); }
  fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  n += 1;
  if (n <= 2 || n % 100 === 0) console.error(`  ${n}/${lines.length}${row.error ? ` error ${row.error}` : ''} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await M.destroy();
console.error(`covbuild ${sha12}${capsTag(CAPS)} shard ${K}/${N}: done ${n} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(0);
