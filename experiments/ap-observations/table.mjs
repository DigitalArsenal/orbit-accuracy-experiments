// The tables of PLAN.md from the store's rows: results/ap-observations/table.json and README.md (B2's medians beside).
//   node experiments/ap-observations/table.mjs
import fs from 'node:fs';
import path from 'node:path';
import { config, store, results, quantile, keyOf } from './lib.mjs';

export const ARMS = { ap: 'AP from normal points (flow)', apNsgf: 'AP fitted to the NSGF orbit', ffm: 'FFM estimate', sgp4: 'SGP4 (public set)' };
const B2 = { ap: 'sdnap', apNsgf: 'sdnapTruth', ffm: 'ffm', sgp4: 'sgp4' };

export function readRows(dir = store) {
  const rows = fs.readdirSync(path.join(dir, 'rows')).filter((f) => /^w\d+\.jsonl$/.test(f)).sort()
    .flatMap((f) => fs.readFileSync(path.join(dir, 'rows', f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const order = new Map(config.cutoffs.map((c, i) => [keyOf(c), i]));
  return rows.sort((a, b) => order.get(keyOf(a)) - order.get(keyOf(b)));
}
/** Per arm: scored / attempted, per day median, 95th and n over cutoffs, failures by name. */
export function summarize(rows, values = (row, arm) => row.arms[arm]) {
  const out = {};
  for (const arm of Object.keys(ARMS)) {
    const got = rows.map((r) => ({ r, a: values(r, arm) }));
    const days = {};
    for (const d of config.leadDays) {
      const xs = got.filter(({ a }) => a?.ok && a.days?.[d]).map(({ a }) => a.days[d].rmsKm);
      days[d] = { medianKm: quantile(xs, 0.5), p95Km: quantile(xs, 0.95), n: xs.length };
    }
    out[arm] = { scored: got.filter(({ a }) => a?.ok).length, attempted: rows.length, days,
      failures: got.filter(({ a }) => !a?.ok).map(({ r, a }) => ({ target: r.target, cutoff: r.cutoff, refused: a?.refused ?? 'no row' })) };
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const rows = readRows();
  if (rows.length !== config.cutoffs.length) throw new Error(`${rows.length} rows of ${config.cutoffs.length} cutoffs`);
  const arms = summarize(rows);
  const table = { experiment: config.experiment, task: config.task, modulesCommit: config.modules.commit, versions: config.modules.versions, cutoffs: rows.length,
    statistic: 'per cutoff and lead day: RMS of the 3D position error (compare_to_reference against NSGF, B2 thinning and coverage); across cutoffs: median, 95th percentile (linear), n',
    arms, b2MedianKm: config.b2.medianKm };
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(path.join(results, 'table.json'), `${JSON.stringify(table, null, 1)}\n`);
  const f = (x) => (x === null ? 'n/a' : x < 0.01 ? x.toFixed(4) : x < 1 ? x.toFixed(3) : x.toPrecision(3));
  const cell = (d) => `${f(d.medianKm)} (95th ${f(d.p95Km)}) n ${d.n}`;
  const lines = [
    '# AP from ILRS normal points through the modules flow (B2 part 2\'s window)', '',
    `Registered in \`experiments/ap-observations/PLAN.md\` before any run. Modules main ${config.modules.commit.slice(0, 12)}: flows/observation-ap ${config.modules.versions['flows/observation-ap']}, ` +
    `flows/observation-od ${config.modules.versions['flows/observation-od']}, analysis/estimation ${config.modules.versions['analysis/estimation']}, propagator/ffm ${config.modules.versions['propagator/ffm']}, ` +
    `propagator/sdn-ap ${config.modules.versions['propagator/sdn-ap']}, propagator/sgp4 ${config.modules.versions['propagator/sgp4']}, analysis/reference-states ${config.modules.versions['analysis/reference-states']}; ` +
    'every artifact SHA-256 in `experiments/ap-observations/config.json`. B2 part 2 ran on the withdrawn build with its fit and carry in experiment JavaScript; here every step is a module.', '',
    `Five laser spheres (Starlette, Stella, LARETS, WESTPAC, LARES), ${rows.length} cutoffs, 2026-07-18 to 08-28. Arc: the normal points of the 48 h before the cutoff. ` +
    'Error: per cutoff and day after the cutoff, the RMS of the 3D position error against the NSGF orbit; across cutoffs the median and the 95th percentile, km. ' +
    'NSGF computes its orbits from the same ILRS normal points: the truth is an anchor, not independent.', '',
    '| Arm | Scored / attempted | Day 1 | Day 2 | Day 3 | B2 median, days 1 / 2 / 3 |', '| --- | --: | --- | --- | --- | --- |',
    ...Object.entries(ARMS).map(([k, name]) => `| ${name} | ${arms[k].scored} / ${arms[k].attempted} | ${config.leadDays.map((d) => cell(arms[k].days[d])).join(' | ')} | ${config.b2.medianKm[B2[k]].map(f).join(' / ')} |`), '',
    'A refusal of any module counts as a failure of that arm and is not dropped. Each median is over the cutoffs its arm scored (the AP and FFM arms lack the refused cutoffs); n counts the cutoffs with that day covered.', '',
    ...Object.entries(ARMS).flatMap(([k, name]) => (arms[k].failures.length ? [`Failures, ${name} (${arms[k].failures.length}):`, '',
      ...Object.entries(arms[k].failures.reduce((m, x) => { const code = String(x.refused).match(/^[a-z][a-z-]*(?=:)/)?.[0] ?? String(x.refused); (m[code] ??= []).push(`${x.target} ${x.cutoff.slice(0, 10)}`); return m; }, {}))
        .map(([code, list]) => `- \`${code}\` (${list.length}): ${list.join(', ')}`), ''] : [])),
    'Sources: ILRS normal points from the EUROLAS Data Center, DGFI-TUM (Pearlman et al. 2019; Noll et al. 2019); ILRS weekly station solutions; IERS EOP 20 C04; NSGF rapid orbits (ILRS). ' +
    'The SGP4 arm uses public element sets; no element set is reproduced.', '',
  ];
  fs.writeFileSync(path.join(results, 'README.md'), lines.join('\n'));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(arms).map(([k, a]) => [k, { scored: a.scored, days: a.days, failures: a.failures.length }]))));
}
