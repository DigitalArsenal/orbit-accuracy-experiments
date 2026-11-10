// Print rep.mjs rows: per window and arm, error against truth and against FFM by lead day, the arc fit, coefficients.
//   node experiments/headline-loop/diagnosis/show.mjs <rows.jsonl> [...]
import fs from 'node:fs';
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '-');
for (const file of process.argv.slice(2)) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    console.log(`${r.key} arc ${r.arcH} h ${r.error ?? ''} FFM ${r.ffm ? `${r.ffm.settings} B ${r.ffm.B ?? '-'} S ${f3(r.ffm.S)} ${r.ffm.termination}` : ''}`);
    for (const [k, a] of Object.entries(r.arms)) {
      if (a.error) { console.log(`  ${k.padEnd(14)} ERR ${a.error}`); continue; }
      const d = a.days ?? {}, v = a.vsF ?? {};
      const g = (x, k2, c = 'e') => f3(x[k2]?.[c]);
      console.log(`  ${k.padEnd(14)} truth ${g(d, 1)} ${g(d, 2)} ${g(d, 3)} ${g(d, 7)} | vsF ${g(v, 1)} ${g(v, 3)} ${g(v, 7)} | d3 rtn ${g(d, 3, 'r')} ${g(d, 3, 't')} ${g(d, 3, 'n')} mt ${g(d, 3, 'mt')} | arc ${f3(a.arc?.e)} vsF ${f3(a.arcVsF?.e)} rms ${f3(a.rms)} S ${f3(a.agom ?? a.S)} B ${f3(a.bterm ?? a.B)} ${a.s ? `${a.s.toFixed(0)}s` : ''}`);
    }
  }
}
