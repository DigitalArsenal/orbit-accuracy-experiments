// The tables of PLAN.md from the store's rows: results/ap-observations-2/table.json and README.md, the first registration's
// cells beside (its table.json, SHA-256 checked, and its rows, read only), B2's medians and n beside.
//   node experiments/ap-observations-2/table.mjs
import fs from 'node:fs';
import path from 'node:path';
import { config, store, results, firstResults, firstStore, quantile, keyOf, sha256 } from './lib.mjs';

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
/** The first registration's table.json, refused unless its SHA-256 is the one registered. */
export function firstTable() {
  const bytes = fs.readFileSync(path.join(firstResults, 'table.json'));
  if (sha256(bytes) !== config.firstRegistration.table.sha256) throw new Error('results/ap-observations/table.json differs from its registered SHA-256');
  return JSON.parse(bytes);
}
export const codeOf = (refused) => String(refused).match(/^[a-z][a-z-]*(?=:)/)?.[0] ?? String(refused);
/** One fit as a short phrase: iterations, termination when not converged, WEIGHTED_RMS. */
const fitPhrase = (f) => (f.unread ? 'unread' : `${f.iterations}${f.converged ? '' : ` ${f.termination}`}`);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const rows = readRows();
  if (rows.length !== config.cutoffs.length) throw new Error(`${rows.length} rows of ${config.cutoffs.length} cutoffs`);
  const arms = summarize(rows);
  const first = firstTable();
  const firstRows = new Map(readRows(firstStore).map((r) => [keyOf(r), r]));
  const f = (x) => (x === null || x === undefined ? 'n/a' : x < 0.01 ? x.toFixed(4) : x < 1 ? x.toFixed(3) : x.toPrecision(3));
  const cell = (d) => `${f(d.medianKm)} (95th ${f(d.p95Km)}) n ${d.n}`;
  const same = (a, b) => a.scored === b.scored && config.leadDays.every((d) => a.days[d].medianKm === b.days[d].medianKm && a.days[d].p95Km === b.days[d].p95Km && a.days[d].n === b.days[d].n);
  const covered = (days) => config.leadDays.filter((d) => days?.[d]);
  const dayList = (days) => covered(days).map((d) => f(days[d].rmsKm)).join(' / ');
  const meters = (km) => { const m = km * 1000; return m === 0 ? '0 m' : m >= 0.001 ? `${+m.toPrecision(3)} m` : `${m.toExponential(2)} m`; };

  // Per cutoff: the fits, and the outcomes that changed against the first registration.
  const perCutoff = rows.map((r) => ({ target: r.target, cutoff: r.cutoff, ap: r.arms.ap.ok ? 'ok' : codeOf(r.arms.ap.refused), fits: r.fits ?? [],
    estimate: r.estimate ? { iterations: r.estimate.iterations, weightedRms: r.estimate.weightedRms, normalPointsUsed: r.estimate.normalPointsUsed, rangeRmsKm: r.estimate.rangeRmsKm } : null }));
  const outcome = [];
  const moved = { ap: [], ffm: [] };
  for (const r of rows) {
    const o = firstRows.get(keyOf(r));
    if (!o) throw new Error(`${keyOf(r)}: no row in the first registration`);
    for (const arm of ['ap', 'ffm']) {
      if (o.arms[arm].ok && r.arms[arm].ok) for (const d of config.leadDays) if (o.arms[arm].days[d] && r.arms[arm].days[d]) moved[arm].push(Math.abs(r.arms[arm].days[d].rmsKm - o.arms[arm].days[d].rmsKm));
    }
    const was = o.arms.ap.ok ? 'an AP $OCM' : `refused \`${codeOf(o.arms.ap.refused)}\``;
    const fitsNow = (r.fits ?? []).map(fitPhrase).join(' + ');
    if (o.arms.ap.ok !== r.arms.ap.ok || (!r.arms.ap.ok && codeOf(o.arms.ap.refused) !== codeOf(r.arms.ap.refused))) {
      outcome.push({ target: r.target, cutoff: r.cutoff, first: o.arms.ap.ok ? 'ok' : codeOf(o.arms.ap.refused), second: r.arms.ap.ok ? 'ok' : codeOf(r.arms.ap.refused),
        sentence: r.arms.ap.ok
          ? `${r.target} ${r.cutoff.slice(0, 10)}: ${was} in the first; here an AP $OCM (fits ${fitsNow} iterations, WEIGHTED_RMS ${r.estimate.weightedRms.toFixed(3)}), ` +
            (covered(r.arms.ap.days).length ? `at days ${covered(r.arms.ap.days).join(' / ')} AP ${dayList(r.arms.ap.days)} km, FFM ${r.arms.ffm.ok ? `${dayList(r.arms.ffm.days)} km` : `refused (${r.arms.ffm.refused})`}.` : 'no day covered by the truth.')
          : `${r.target} ${r.cutoff.slice(0, 10)}: ${was} in the first; refused \`${codeOf(r.arms.ap.refused)}\` here${fitsNow ? ` (fits ${fitsNow})` : ''}.` });
    }
  }
  // The registration's named cells against their stated expectation (an AP $OCM, or refused again by the same code).
  const named = new Set(config.expectedToChange.map((x) => `${config.targets[x.target].norad}|${x.cutoff}`));
  const expectation = config.expectedToChange.map((x) => {
    const r = rows.find((y) => keyOf(y) === `${config.targets[x.target].norad}|${x.cutoff}`);
    const toOcm = /^an AP/.test(x.expected);
    return { ...x, toOcm, met: Boolean(r) && (toOcm ? r.arms.ap.ok : !r.arms.ap.ok && codeOf(r.arms.ap.refused) === x.refused) };
  });
  const outside = outcome.filter((x) => !named.has(`${config.targets[x.target].norad}|${x.cutoff}`));
  const expectationSentence = `Against the registration's ${expectation.length} named cells: ${expectation.filter((x) => x.toOcm && x.met).length} of the ${expectation.filter((x) => x.toOcm).length} \`no-convergence\` cells became AP $OCMs, ` +
    `${expectation.filter((x) => !x.toOcm && x.met).length} of the ${expectation.filter((x) => !x.toOcm).length} others were refused again by the same code` +
    `${expectation.some((x) => !x.met) ? ` (not as expected: ${expectation.filter((x) => !x.met).map((x) => `${x.target} ${x.cutoff.slice(0, 10)}`).join(', ')})` : ''}; ` +
    `${outside.length ? `${outside.length} cutoffs outside them changed outcome` : 'no cutoff outside them changed outcome'}.`;
  const stat = (xs) => (xs.length ? { n: xs.length, maxKm: Math.max(...xs), medianKm: quantile(xs, 0.5) } : { n: 0 });
  const movedStat = { ap: stat(moved.ap), ffm: stat(moved.ffm) };
  const scoredFits = rows.filter((r) => r.arms.ap.ok).map((r) => r.fits ?? []);
  const range = (xs) => (xs.length ? { min: Math.min(...xs), median: quantile(xs, 0.5), max: Math.max(...xs) } : null);
  const fitStats = { cutoffs: scoredFits.length, twoFits: scoredFits.filter((x) => x.length === 2).length,
    firstFitIterations: range(scoredFits.filter((x) => x.length === 2).map((x) => x[0].iterations)), secondFitIterations: range(scoredFits.map((x) => x.at(-1)?.iterations).filter(Number.isFinite)),
    weightedRms: range(rows.filter((r) => r.arms.ap.ok).map((r) => r.estimate.weightedRms)) };

  const table = { experiment: config.experiment, task: config.task, modulesCommit: config.modules.commit, versions: config.modules.versions, cutoffs: rows.length,
    statistic: 'per cutoff and lead day: RMS of the 3D position error (compare_to_reference against NSGF, B2 thinning and coverage); across cutoffs: median, 95th percentile (linear), n',
    arms, b2MedianKm: config.b2.medianKm, b2N: config.b2.n,
    first: { task: config.firstRegistration.task, modulesCommit: config.firstRegistration.modulesCommit, table: config.firstRegistration.table,
      arms: Object.fromEntries(Object.entries(first.arms).map(([k, a]) => [k, { scored: a.scored, attempted: a.attempted, days: a.days }])) },
    unchangedArms: Object.keys(ARMS).filter((k) => same(arms[k], first.arms[k])),
    outcomesChanged: outcome.map(({ sentence, ...x }) => x), expectation: expectation.map(({ target, cutoff, refused, met }) => ({ target, cutoff, refused, met })), movedWhereBothScored: movedStat, fits: fitStats, perCutoff };
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(path.join(results, 'table.json'), `${JSON.stringify(table, null, 1)}\n`);

  const v = config.modules.versions;
  const ap = arms.ap, fap = first.arms.ap;
  const nList = (a) => config.leadDays.map((d) => a.days[d].n).join(' / ');
  const failureLines = (k) => {
    const byCode = arms[k].failures.reduce((m, x) => { (m[codeOf(x.refused)] ??= []).push(x); return m; }, {});
    return Object.entries(byCode).map(([code, list]) => `- \`${code}\` (${list.length}): ${list.map((x) => {
      const r = rows.find((y) => keyOf(y) === `${config.targets[x.target].norad}|${x.cutoff}`);
      const cause = k === 'ap' && r?.fits?.length ? ` (fits ${r.fits.map(fitPhrase).join(' + ')})` : k === 'ap' && /^arc-too-short:/.test(x.refused) ? ` (${x.refused.split(':')[1]} h)` : '';
      return `${x.target} ${x.cutoff.slice(0, 10)}${cause}`;
    }).join(', ')}`);
  };
  const armSentence = (k) => {
    const a = arms[k], b = first.arms[k];
    if (same(a, b)) return `${ARMS[k]}: every cell equals the first registration's to the digit.`;
    const parts = [];
    if (a.scored !== b.scored) parts.push(`scored ${b.scored} -> ${a.scored}`);
    for (const [label, key] of [['median', 'medianKm'], ['95th', 'p95Km']]) {
      if (config.leadDays.some((d) => a.days[d][key] !== b.days[d][key])) parts.push(`${label} ${config.leadDays.map((d) => f(b.days[d][key])).join(' / ')} -> ${config.leadDays.map((d) => f(a.days[d][key])).join(' / ')} km`);
    }
    if (config.leadDays.some((d) => a.days[d].n !== b.days[d].n)) parts.push(`n ${nList(b)} -> ${nList(a)}`);
    return `${ARMS[k]}: ${parts.join('; ')} (days 1 / 2 / 3).`;
  };
  const lines = [
    '# AP from ILRS normal points through the modules flow, second registration (flows/observation-od 0.3.0)', '',
    `Registered in \`experiments/ap-observations-2/PLAN.md\` before any run. Modules main ${config.modules.commit.slice(0, 12)}: flows/observation-ap ${v['flows/observation-ap']}, ` +
    `flows/observation-od ${v['flows/observation-od']}, analysis/estimation ${v['analysis/estimation']}, propagator/ffm ${v['propagator/ffm']}, propagator/sdn-ap ${v['propagator/sdn-ap']}, ` +
    `propagator/sgp4 ${v['propagator/sgp4']}, analysis/reference-states ${v['analysis/reference-states']}; every artifact SHA-256 in \`experiments/ap-observations-2/config.json\`. ` +
    `The first registration (\`results/ap-observations/\`, modules ${config.firstRegistration.modulesCommit.slice(0, 12)}) stands as recorded.`, '',
    `Five laser spheres (Starlette, Stella, LARETS, WESTPAC, LARES), ${rows.length} cutoffs, 2026-07-18 to 08-28. Arc: the normal points of the 48 h before the cutoff. ` +
    'Error: per cutoff and day after the cutoff, the RMS of the 3D position error against the NSGF orbit; across cutoffs the median and the 95th percentile, km. ' +
    'NSGF computes its orbits from the same ILRS normal points: the truth is an anchor, not independent.', '',
    '| Arm | Scored / attempted | Day 1 | Day 2 | Day 3 | B2 median, days 1 / 2 / 3 |', '| --- | --: | --- | --- | --- | --- |',
    ...Object.entries(ARMS).map(([k, name]) => `| ${name} | ${arms[k].scored} / ${arms[k].attempted} | ${config.leadDays.map((d) => cell(arms[k].days[d])).join(' | ')} | ${config.b2.medianKm[B2[k]].map(f).join(' / ')} |`), '',
    'A refusal of any module counts as a failure of that arm and is not dropped. Each median is over the cutoffs its arm scored; n counts the cutoffs with that day covered.', '',
    `Like for like: n ${nList(ap)} at days 1 / 2 / 3 here, against B2 part 2's ${config.b2.n.sdnap.join(' / ')} (206 scored) and the first registration's ${nList(fap)} (${fap.scored} scored).`, '',
    '## Beside the first registration', '',
    '| Arm | Scored, first / second | Day 1, first / second | Day 2, first / second | Day 3, first / second |', '| --- | --: | --- | --- | --- |',
    ...Object.entries(ARMS).map(([k, name]) => `| ${name} | ${first.arms[k].scored} / ${arms[k].scored} | ${config.leadDays.map((d) => `${cell(first.arms[k].days[d])} / ${cell(arms[k].days[d])}`).join(' | ')} |`), '',
    ...Object.keys(ARMS).map(armSentence), '',
    `Where both registrations scored a cutoff, its day values moved at most ${meters(movedStat.ap.maxKm)} (median ${meters(movedStat.ap.medianKm)}, ${movedStat.ap.n} day values) for AP from normal points and at most ${meters(movedStat.ffm.maxKm)} (median ${meters(movedStat.ffm.medianKm)}, ${movedStat.ffm.n}) for the FFM estimate.`, '',
    `Outcomes that changed (${outcome.length}). ${expectationSentence}`, '',
    ...outcome.map((x) => `- ${x.sentence}`), '',
    '## Fits', '',
    `Each cutoff fits twice (at the first guess's epoch T - 48 h, then at T). Over the ${fitStats.cutoffs} AP $OCMs: first fit ${fitStats.firstFitIterations ? `${fitStats.firstFitIterations.min} to ${fitStats.firstFitIterations.max} iterations (median ${fitStats.firstFitIterations.median})` : 'n/a'}, ` +
    `second fit ${fitStats.secondFitIterations ? `${fitStats.secondFitIterations.min} to ${fitStats.secondFitIterations.max} (median ${fitStats.secondFitIterations.median})` : 'n/a'}; WEIGHTED_RMS ${fitStats.weightedRms ? `${fitStats.weightedRms.min.toFixed(3)} to ${fitStats.weightedRms.max.toFixed(3)} (median ${fitStats.weightedRms.median.toFixed(3)})` : 'n/a'}. ` +
    'Per cutoff in `table.json` `perCutoff`, read from analysis/estimation\'s fit_batch answers.', '',
    ...Object.entries(ARMS).flatMap(([k, name]) => (arms[k].failures.length ? [`Failures, ${name} (${arms[k].failures.length}):`, '', ...failureLines(k), ''] : [])),
    '## Build', '',
    `Modules ${config.modules.commit.slice(0, 12)} from the read-only clone. One artifact differs from the first registration: flows/observation-od \`dist/isomorphic/module.wasm\` ` +
    `(${config.modules.build.observationOd.sha256.slice(0, 12)}; the first's 6373b00cfacf), which carries the RA/Dec angles entry point (22213952a) and the two-fit laser path (0.3.0, 5da8d709). ` +
    'Every other artifact is byte-identical to the first registration\'s. The fits are read from analysis/estimation\'s fit_batch answers with the module\'s own schema codec ' +
    '(`tests/wire.mjs`, hashed) behind a pass-through host; the SGP4 request encoders are a hash-checked copy with that module\'s own lock.', '',
    'Sources: ILRS normal points from the EUROLAS Data Center, DGFI-TUM (Pearlman et al. 2019; Noll et al. 2019); ILRS weekly station solutions; IERS EOP 20 C04; NSGF rapid orbits (ILRS). ' +
    'The SGP4 arm uses public element sets; no element set is reproduced.', '',
  ];
  fs.writeFileSync(path.join(results, 'README.md'), lines.join('\n'));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(arms).map(([k, a]) => [k, { scored: a.scored, days: a.days, failures: a.failures.length }]))));
}
