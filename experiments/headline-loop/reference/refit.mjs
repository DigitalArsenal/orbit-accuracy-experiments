// stack #396: the reference's fit on a window, at its setting and at half its integrator tolerance, side by side: the fitted state's epoch,
// the fitted drag and radiation terms, the weighted fit RMS (and in m, times the setting's sigma), the termination and iterations, and the
// error against truth by lead day. The cached fit is the one the scored flight (every published FFMq figure) used.
//   node experiments/headline-loop/reference/refit.mjs --keys "LS|LARETS|2025-10-10;HX|THEMIS A|2013-02-17" [--out file.json]
import fs from 'node:fs';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const E = await import('../lib/env.mjs'); E.usePackages();
const W = await import('../lib/windows.mjs');
const A = await import('../lib/arms.mjs');
const { QUALIFIED, SETTINGS } = await import('../lib/settings.mjs');
const arms = await A.openArms({ apWasm: path.join(E.MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm') });
const listed = W.windowsOf(['T', 'P', 'S1', 'GN', 'GN_GAL', 'LS', 'DO', 'GD', 'IG', 'GE', 'HE', 'HX', 'WA']);
const winOf = new Map([...listed.windows, ...listed.spring].map((w) => [w.key, w]));
const out = [];
for (const key of args.keys.split(';')) {
  const w = winOf.get(key), D0 = w.cutoffMs, arc = Math.max(...w.arcs), q = QUALIFIED[w.group], G = W.GROUPS[w.group];
  const dir = path.join(A.STORE_ROOT, 'ffm-cache', A.ffmCacheKey(q, 60).key), doc = JSON.parse(fs.readFileSync(path.join(dir, `${key.replace(/[^A-Za-z0-9_.-]+/g, '_')}-${arc}.json`), 'utf8'));
  const truth = await W.truthOf(w, D0 - arc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
  const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
  const thin = W.arcOf(truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
  const wx = G.vacuum ? null : W.weatherAt(D0);
  const half = await arms.ffm({ arm: q, thin, D0, rows: wx?.ffm, sc, halfTolerance: true });
  const sig = SETTINGS[q].sigmaM;
  const one = (label, f) => ({ label, epoch: f.product.epoch, parameters: Object.fromEntries(f.product.parameters.map((p) => [p.kind, p.value])), weightedRms: f.weightedRms, fitRmsM: f.weightedRms * sig, termination: f.termination, fitOk: f.fitOk, iterations: f.iterations ?? null, errorKm: Object.fromEntries(Object.entries(f.days).map(([d, v]) => [d, v.e])) });
  const rec = { key, arc, arm: q, tolerance: SETTINGS[q].integrator.tolerance, fits: [one('setting (cached; the scored flight used it)', doc), one('half tolerance', half)] };
  out.push(rec);
  console.log(`${key} ${arc} h ${q}`);
  for (const f of rec.fits) console.log(`  ${f.label}: ${Object.entries(f.parameters).map(([k, v]) => `${k} ${v.toExponential(4)}`).join(', ')}; fit RMS ${f.fitRmsM.toFixed(3)} m; ${f.termination} after ${f.iterations ?? '?'} iterations; error km ${Object.entries(f.errorKm).map(([d, e]) => `d${d} ${e.toFixed(4)}`).join(' ')}`);
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 1));
process.exit(0);
