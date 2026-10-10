// E13 step 12: how much the assumed Cr*A/m (PLAN.md section 4.2: 0.0135 m^2/kg for every Dove) moves the fitted Cd*A/m. On dev arcs chosen by a fixed
// stride, the arc is read again with Cr*A/m times 0.5 and times 1.5; the change in ln Cd*A/m is reported (it is measured, not tuned).
//
//   node steps/12-cr-sensitivity.mjs [--count 20] [--out FILE]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { quantile } from '../../../harness/stats.mjs';
import { config, configPath, modulesDir, paths, amendmentsSha256 } from '../common.mjs';
import { arcsOf, readPlanetSeries } from '../planet-history.mjs';
import { openArcEnv } from '../arcs.mjs';

const { values } = parseArgs({ options: { count: { type: 'string', default: '20' }, out: { type: 'string' } } });
const P = config.planet;
const run = startRun({ experiment: config.experiment, step: '12-cr-sensitivity', configPath, modulesDir: modulesDir(), args: values });
run.addInputs('amendments', { 'amendments.json': amendmentsSha256 });
const log = (m) => console.log(`[${run.id}] ${m}`);
const rows = fs.readFileSync(path.join(paths.planetArcs, `dev-${P.arc.profile}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error && !r.nonPositive);
const count = Number(values.count), stride = Math.floor(rows.length / count);
const chosen = Array.from({ length: count }, (_, i) => rows[i * stride]);
const series = readPlanetSeries({ fromDay: P.split.dev[0], toDay: P.split.dev[1] });
const env = await openArcEnv({ profile: P.arc.profile });
const out = [];
for (const r of chosen) {
  const states = series.get(r.hwid), i = states.findIndex((s) => s.ttMs === r.ttA);
  const [A, B] = await Promise.all([env.toUtcGcrf(states[i]), env.toUtcGcrf(states[i + 1])]);
  const res = {};
  for (const [label, factor] of [['x0.5', 0.5], ['x1', 1], ['x1.5', 1.5]]) {
    const f = await env.energyArc(A, B, { b0: r.cdAreaOverMass, cr: P.arc.crAreaOverMass * factor, sigma: P.arc.sigma });
    res[label] = f.B;
  }
  out.push({ hwid: r.hwid, utcA: r.utcA, B: res['x1'], lnLow: Math.log(res['x0.5'] / res['x1']), lnHigh: Math.log(res['x1.5'] / res['x1']), fromRecord: Math.log(res['x1'] / r.cdAreaOverMass) });
  log(`${r.hwid} ${r.utcA.slice(0, 10)}: B ${res['x1'].toFixed(5)}, Cr x0.5 ${(100 * Math.log(res['x0.5'] / res['x1'])).toFixed(2)} %, x1.5 ${(100 * Math.log(res['x1.5'] / res['x1'])).toFixed(2)} %`);
}
const abs = (k) => out.map((o) => Math.abs(o[k]));
const summary = { arcs: out.length, medianAbsLnChangeLow: quantile(abs('lnLow'), 0.5), maxAbsLnChangeLow: Math.max(...abs('lnLow')), medianAbsLnChangeHigh: quantile(abs('lnHigh'), 0.5), maxAbsLnChangeHigh: Math.max(...abs('lnHigh')),
  meanLnChangeHigh: out.reduce((a, o) => a + o.lnHigh, 0) / out.length, maxAbsReproduction: Math.max(...abs('fromRecord')) };
log(`Cr*A/m x0.5: median |change in ln B| ${(100 * summary.medianAbsLnChangeLow).toFixed(2)} %, max ${(100 * summary.maxAbsLnChangeLow).toFixed(2)} %; x1.5: median ${(100 * summary.medianAbsLnChangeHigh).toFixed(2)} %, max ${(100 * summary.maxAbsLnChangeHigh).toFixed(2)} %; reproduction of the stored B: max ${(100 * summary.maxAbsReproduction).toFixed(2)} %`);
const file = values.out ?? path.join(run.dir, 'cr-sensitivity.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify({ summary, arcs: out }, null, 1)}\n`);
run.finish(summary);
await env.destroy();
