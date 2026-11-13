// Where each axis's stated variance comes from, term by term, by the module itself. The record's COV_PROPAGATION carries the
// process-noise sizes and the floor (sdn-ap SPEC 12.4 and 12.5): s_e (eccentricity vector), s_i (inclination vector), s_l (mean motion),
// s_d = c |n-dot_ng| (the drag rate; c and s_d scaled together, as the module requires) and the floor F (six UVW entries, km^2).
// P(t) = J P_p J' + Q(t) + F, Q a sum of one outer product per size: so each term's variance on each axis is (var(2) - var(1)) / 3 from
// one flight with that size doubled. The floor is not separable this way (the carried state block is read back as COVARIANCE - F, so a
// larger F also shrinks it): it stays in the remainder with the fit's own part.
//   node covterms.mjs <out> <build sha12> <shard k/n> [--caps T,Z]
// Rows: <out>/covterms-<sha12>[-capsT-Z]-<k>of<n>.jsonl, one per window: line, group, arcH, cutoff, pcf, sizes (COV_PROPAGATION as
// written), the record's mean elements and fit statistics, and every 30 min of the scored days: epochsS, e [R, T, N] km, v [R, T, N] km^2
// as stated, terms { drag, sl, se, si } [R, T, N] km^2.
import fs from 'node:fs';
import path from 'node:path';
import { outDir, shardArg, capsArg, capsTag, readJsonl, windowSet, windowOf, strongDragWindows, openBuild } from './lib.mjs';

const out = outDir(process.argv[2]);
const sha12 = process.argv[3];
const [K, N] = shardArg(process.argv[4]);
const CAPS = capsArg();
const { lines } = windowSet(out, K, N);
const M = await openBuild(out, sha12, CAPS);
const TERMS = {
  drag: (cp) => { cp.NOISE_NON_GRAVITATIONAL_RAD_DAY2 *= 2; cp.NON_GRAVITATIONAL_SHARE *= 2; },
  sl: (cp) => { cp.NOISE_MEAN_MOTION_RELATIVE *= 2; },
  se: (cp) => { cp.NOISE_ECCENTRICITY_PER_DAY *= 2; },
  si: (cp) => { cp.NOISE_INCLINATION_PER_DAY *= 2; },
};
const byKey = new Map(strongDragWindows().map((w) => [`${w.key}|${w.arcH}`, w]));
const outFile = path.join(out, `covterms-${sha12}${capsTag(CAPS)}-${K}of${N}.jsonl`);
const done = new Set(readJsonl(outFile).map((r) => r.line));
const t0 = Date.now();
let n = 0;
for (const k of lines) {
  if (done.has(k)) continue;
  const w = windowOf(k, byKey);
  const row = { line: k, key: w?.key, group: w?.group, name: w?.name, arcH: w?.arcH, cutoff: w?.date };
  try {
    if (!w) throw new Error('unknown window');
    const { ocm, record, pcf, fitProcess, sc } = await M.fitRecord(w);
    row.sizes = record.COV_PROPAGATION; row.pcf = pcf; row.fitProcess = fitProcess;
    const me = record.MEAN_ELEMENTS, st = record.ORBIT_DETERMINATION?.FIT_STATISTICS;
    Object.assign(row, { build: sha12, version: M.build.version, meanMotion: me.MEAN_MOTION, ecc: me.ECCENTRICITY, inc: me.INCLINATION, sma: me.SEMI_MAJOR_AXIS, bterm: me.BTERM, agom: me.AGOM, fitRmsKm: st?.FIT_RMS_KM, fitStates: st?.FIT_STATES });
    // the base flies the record repacked unedited, as every doubled flight is repacked: a field the bindings drop cannot land in a term
    const base = await M.fly(M.editRecord(ocm, () => {}), sc);
    const terms = {};
    for (const [name, fn] of Object.entries(TERMS)) {
      try { const x = await M.fly(M.editRecord(ocm, fn), sc); terms[name] = x.map((s, i) => s.v.map((v, a) => (v - base[i].v[a]) / 3)); } catch (e) { row[`${name}Error`] = String(e?.message ?? e).slice(0, 160); }
    }
    const keep = M.kept(sc, w);
    row.epochsS = M.seconds(sc, w, keep);
    row.e = keep.map((i) => base[i].e); row.v = keep.map((i) => base[i].v);
    row.terms = Object.fromEntries(Object.entries(terms).map(([nm, t]) => [nm, keep.map((i) => t[i])]));
  } catch (e) { row.error = String(e?.message ?? e).slice(0, 300); }
  fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  n += 1;
  if (n <= 2 || n % 20 === 0) console.error(`  ${n}/${lines.length}${row.error ? ` error ${row.error}` : ''} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await M.destroy();
console.error(`covterms ${sha12}${capsTag(CAPS)} shard ${K}/${N}: done ${n} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(0);
