// Group summaries of resid.mjs and compress.mjs JSON outputs (one or both): per group and fit arc, medians over windows.
//   node experiments/headline-loop/diagnosis/summarize.mjs --resid resid.json --compress compress.json [--arm R7-z]
import fs from 'node:fs';
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : null; };
const resid = opt('resid') ? JSON.parse(fs.readFileSync(opt('resid'), 'utf8')) : [];
const comp = opt('compress') ? JSON.parse(fs.readFileSync(opt('compress'), 'utf8')) : [];
const ARM = opt('arm');
const med = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const m1 = (x) => (x === null || x === undefined ? '-' : (x * 1000).toFixed(1));
const groupOf = (r) => `${r.key.split('|')[0]} ${r.arcH} h ${r.arm}`;
const groups = new Map();
for (const r of resid) { if (ARM && r.arm !== ARM) continue; const g = groupOf(r); (groups.get(g) ?? groups.set(g, { resid: [], comp: [] }).get(g)).resid.push(r); }
for (const r of comp) { if (ARM && r.arm !== ARM) continue; const g = groupOf(r); (groups.get(g) ?? groups.set(g, { resid: [], comp: [] }).get(g)).comp.push(r); }
const BINS = [0, 1, 2, 3, 5, 7];
for (const [g, { resid: R, comp: C }] of [...groups.entries()].sort()) {
  console.log(`\n### ${g}  (${R.length || C.length} windows)`);
  if (R.length) {
    const bin = (sel) => BINS.map((b) => m1(med(R.map((r) => sel(r)?.[b])))).join(' | ');
    console.log(`| m, median over windows | arc | d1 | d2 | d3 | d5 | d7 |\n| --- | --: | --: | --: | --: | --: | --: |`);
    console.log(`| residual RMS 3D | ${bin((r) => Object.fromEntries(Object.entries(r.raw).map(([k, v]) => [k, v.e])))} |`);
    console.log(`| residual R / T / N RMS | ${BINS.map((b) => ['r', 't', 'n'].map((c) => m1(med(R.map((r) => r.raw[b]?.[c])))).join(' / ')).join(' | ')} |`);
    console.log(`| residual max 3D | ${bin((r) => Object.fromEntries(Object.entries(r.raw).map(([k, v]) => [k, v.mx])))} |`);
    console.log(`| target: half FFM vs truth | ${BINS.map((b) => m1(med(R.map((r) => r.target?.[b])))).join(' | ')} |`);
    for (const [d, K, a] of [[2, 0, 0], [2, 1, 0], [2, 2, 1], [2, 3, 1], [3, 4, 2], [3, 8, 2]]) {
      const pick = R.map((r) => r.series.find((s) => s.d === d && s.K === K && s.a === a)).filter(Boolean);
      if (!pick.length) continue;
      console.log(`| series d${d} K${K} a${a} (${pick[0].coefficients} numbers) | ${BINS.map((b) => m1(med(pick.map((s) => s.bins[b])))).join(' | ')} |`);
    }
    for (const [name, sel] of [['6 initial conditions', 'ic6'], ['+ 3 constant accelerations (9)', 'ic6const3'], ['+ 9 empirical (15)', 'ic6emp9']]) {
      const pick = R.map((r) => r.empirical?.[sel]).filter(Boolean);
      if (pick.length) console.log(`| ${name} | ${BINS.map((b) => m1(med(pick.map((s) => s[b]?.e)))).join(' | ')} |`);
    }
    const meet = R.filter((r) => r.smallestMeetingTarget).map((r) => r.smallestMeetingTarget.coefficients);
    console.log(`series meeting the target in every lead bin: ${meet.length} of ${R.length} windows${meet.length ? `, median ${med(meet)} numbers` : ''}`);
    // spectrum: the most frequent top-3 labels per axis with median amplitude
    for (const ax of ['R', 'T', 'N']) {
      const counts = new Map();
      for (const r of R) for (const l of (r.spectrum.find((s) => s.axis === ax)?.top ?? []).slice(0, 3)) { const c = counts.get(l.label) ?? []; c.push(l.amp); counts.set(l.label, c); }
      const top = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || med(b[1]) - med(a[1])).slice(0, 4);
      console.log(`  ${ax} lines (windows where in the top 3, median amplitude m): ${top.map(([k, v]) => `${k} ${v.length}/${R.length} ${m1(med(v))}`).join('; ')}`);
    }
    console.log(`  trend (quadratic fit slope, m per half span) R/T/N: ${['R', 'T', 'N'].map((ax) => m1(med(R.map((r) => Math.abs(r.spectrum.find((s) => s.axis === ax)?.trend.a1))))).join(' / ')}`);
  }
  if (C.length) {
    for (const [k, label] of [['A', 'AP + harmonics of n and Earth rotation'], ['B', 'AP + piecewise Chebyshev correction'], ['C', 'FFM position as piecewise Chebyshev, no theory']]) {
      const ok = C.filter((c) => c.best[k]);
      const perDay = ok.map((c) => c.best[k].coefficients / c.days);
      console.log(`  ${label}: meets target in ${ok.length} of ${C.length} windows; median ${med(ok.map((c) => c.best[k].coefficients)) ?? '-'} numbers (${perDay.length ? med(perDay).toFixed(0) : '-'} per day of span)${ok.length ? `; typical choice ${ok.map((c) => (k === 'A' ? `K${c.best[k].K}M${c.best[k].M}a${c.best[k].a}` : `L${(+c.best[k].Lh).toFixed(1)}h p${c.best[k].p}`)).slice(0, 3).join(', ')}` : ''}`);
    }
    for (const x of [[2, 2, 1, 2], [3, 3, 1, 2], [4, 4, 2, 3]]) {
      const pick = C.map((c) => c.A.find((a) => a.K === x[0] && a.M === x[1] && a.a === x[2] && a.d === x[3])).filter(Boolean);
      if (pick.length) console.log(`  A K${x[0]} M${x[1]} a${x[2]} (${pick[0].coefficients}) held-out m: ${BINS.map((b) => m1(med(pick.map((s) => s.bins[b])))).join(' | ')}`);
    }
  }
}
