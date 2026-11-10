// stack #316: AP builds compared per cell on the same windows, each re-flown AP-only (refly.mjs --ap-only) beside a base run. Development on
// windows already read, not a registered result. Aggregates only.
//   node experiments/headline-loop/candidates.mjs --base <store>/<base sha12> --control <store>/<sha12> --candidates a=<dir>,b=<dir>,...
//        --group GD [--windows first|spring|all] [--json out.json] [--md out.md]
//   node experiments/headline-loop/candidates.mjs --check     made-up rows: the paired ratio, its interval and the worse-than-control flag
// Per cell (fit, lead), on each build's windows:
//   AP's median and 95th percentile (km) for the base, the control and every candidate;
//   each candidate over the control: the paired median of E_cand / E_control on the windows both scored, with a 95 % interval over time
//   blocks of fit plus lead; flagged when the interval lies wholly above 1 (worse than the control);
//   against FFMq: D (the median RMS over the lead day of |r_AP - r_FFMq|, m) and the satellite-balanced exp(median ln(E_AP / E_FFMq)) with its
//   two-way interval (goal.md).
// Per build and fit arc: the fitted B and S against FFMq's where both exist (median ln(B_AP / B_FFM), median S_AP - S_FFM in m2/kg), and the
// count of fits refused (the module returned an error) and not converged (the $OCM's CONVERGED false).
import fs from 'node:fs';
import path from 'node:path';
import { median, quantile, bootstrap, scoreCells } from './lib/stats.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const DAY = { 24: '1', 48: '2', 72: '3', 168: '7' };
const asc = (a, b) => a - b;
const e = (r, day) => r?.arms?.AP?.days?.[day]?.e;

/** The paired ratio of build X over build Y on their common windows: { n, ratio, interval } (interval over time blocks of fit + lead). */
export function paired(rowsX, rowsY, fit, lead, draws = 1000) {
  const day = DAY[lead], y = new Map(rowsY.filter((r) => r.arcH === fit && Number.isFinite(e(r, day))).map((r) => [r.key, r]));
  const list = rowsX.filter((r) => r.arcH === fit && Number.isFinite(e(r, day)) && y.has(r.key) && e(r, day) > 0 && e(y.get(r.key), day) > 0);
  if (!list.length) return { n: 0, ratio: null, interval: null };
  const t0 = Math.min(...list.map((r) => Date.parse(r.cutoff)));
  const items = list.map((r) => ({ sat: r.name, block: Math.floor((Date.parse(r.cutoff) - t0) / ((fit + lead) * 3600000)), value: Math.log(e(r, day) / e(y.get(r.key), day)) }));
  const iv = bootstrap(items, 'paired-median', 'block', draws);
  return { n: items.length, ratio: Math.exp(median(items.map((x) => x.value))), interval: iv ? iv.map(Math.exp) : null };
}
export const worse = (p) => !!p.interval && p.interval[0] > 1;

if (args.check) {
  // end to end: candidates.mjs on made-up stores (a base, a control, a candidate equal to it and one 1.3 times worse, with fitted B and S, one
  // refused and one unconverged fit); assertions on its --json and --md
  const E = await import('./lib/e2e.mjs');
  const { check, done } = E.checker('CANDIDATES');
  const dir = E.tmp('candidates');
  const withB = (rows) => rows.map((r) => ({ ...r, arms: { ...r.arms, FFMq: { ...r.arms.FFMq, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }, { kind: 'SRP_AREA_OVER_MASS', value: 0.001 }] } } }));
  const base = withB(E.cellRows({ group: 'DO', regime: 'Low orbit, altimetry', arm: 'L70S', ratio: 2, apFit: () => ({ b: 0.02, s: 0.003, converged: true }) }));
  const scaled = (k, fit) => base.map((r) => ({ ...r, arms: { ...r.arms, AP: { ...r.arms.AP, fit, days: Object.fromEntries(Object.entries(r.arms.AP.days).map(([d, v]) => [d, { ...v, e: v.e * k }])) } } }));
  const worse = scaled(1.3, { b: 0.01, s: 0.001, converged: false });
  worse[0] = { ...worse[0], arms: { ...worse[0].arms, AP: { ok: false, error: 'refused' } } };
  const stores = { base: E.writeStore(dir, { rows: base }), control: E.writeStore(dir, { sha256: 'e2e1'.repeat(16), rows: scaled(1, { b: 0.02, s: 0.003, converged: true }) }), a: E.writeStore(dir, { sha256: 'e2e2'.repeat(16), rows: scaled(1, { b: 0.02, s: 0.003, converged: true }) }), b: E.writeStore(dir, { sha256: 'e2e3'.repeat(16), rows: worse }) };
  const r = E.run('candidates.mjs', ['--base', stores.base, '--control', stores.control, '--candidates', `a=${stores.a},b=${stores.b}`, '--group', 'DO', '--json', path.join(dir, 'c.json'), '--md', path.join(dir, 'c.md')]);
  check(r.code === 0, `candidates.mjs exited ${r.code}: ${r.err.slice(-300)}`);
  const j = E.readJson(path.join(dir, 'c.json')), cell = j.cells.find((c) => c.fit === 72 && c.lead === 24);
  check(Math.abs(cell?.builds?.a?.overControl?.ratio - 1) < 1e-9 && !cell.builds.a.overControl.worse, `a over control ${JSON.stringify(cell?.builds?.a?.overControl)}`);
  check(Math.abs(cell?.builds?.b?.overControl?.ratio - 1.3) < 1e-9 && cell.builds.b.overControl.worse && cell.builds.b.overControl.n === 31, `b over control ${JSON.stringify(cell?.builds?.b?.overControl)}`);
  check(j.flagged.length === 4 && j.flagged.every((f) => f.startsWith('b at 72/')), `flagged ${JSON.stringify(j.flagged)}`);
  const f = j.fits[0].builds;
  check(Math.abs(f.control.lnBOverFFM.median - Math.log(2)) < 1e-12 && Math.abs(f.b.lnBOverFFM.median) < 1e-12 && Math.abs(f.control.sMinusFFM.median - 0.002) < 1e-12, `B and S ${JSON.stringify(f)}`);
  check(f.b.refused === 1 && f.b.notConverged === 31 && f.a.refused === 0, `refused ${f.b.refused}, not converged ${f.b.notConverged}`);
  check(/Worse than the control with an interval above 1: b at 72\/24/.test(fs.readFileSync(path.join(dir, 'c.md'), 'utf8')), 'the Markdown flag line');
  fs.rmSync(dir, { recursive: true, force: true });
  done('candidates.mjs run on made-up stores: an equal candidate reads 1.00 and is not flagged; a 1.3 times worse one reads 1.30 on its 31 common windows and is flagged at every lead; ln(B_AP / B_FFM) and S_AP - S_FFM; one refused fit, 31 unconverged; the Markdown flag line');
}

const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
const which = args.windows ?? 'all';
const load = (dir) => fs.readdirSync(dir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean))
  .filter((r) => r.group === args.group && !r.error && (which === 'all' || (which === 'first' ? !r.period : !!r.period)));
const buildOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8'));
const builds = [['base', args.base], ['control', args.control], ...(args.candidates ?? '').split(',').filter(Boolean).map((x) => x.split('='))].map(([label, dir]) => ({ label, dir, build: buildOf(dir), rows: load(dir) }));
const fits = [...new Set(builds[0].rows.map((r) => r.arcH))].sort(asc);
const control = builds.find((b) => b.label === 'control');
const km = (v) => (v === null || v === undefined ? '-' : v.toPrecision(3));
const out = { group: args.group, windows: which, note: 'Development on windows already read; not a registered result.', builds: builds.map((b) => ({ label: b.label, version: b.build.version, sha256: b.build.sha256, rows: b.rows.length })), cells: [], fits: [] };
for (const b of builds) b.cells = scoreCells(b.rows, { ref: 'FFMq', draws: 1000 });
for (const fit of fits) for (const lead of [24, 48, 72, 168]) {
  const day = DAY[lead];
  const cell = { fit, lead, builds: {} };
  for (const b of builds) {
    const v = b.rows.filter((r) => r.arcH === fit).map((r) => e(r, day)).filter(Number.isFinite).sort(asc);
    const s = b.cells.find((c) => c.fit === fit && c.lead === lead);
    cell.builds[b.label] = { n: v.length, medianKm: v.length ? quantile(v, 0.5) : null, p95Km: v.length ? quantile(v, 0.95) : null, dMedianM: s?.D?.medianM ?? null, vsFFMq: s ? { ratio: s.satelliteBalancedRatio, twoWay: s.bootstrapRatio, verdict: s.verdict } : null };
    if (b !== control && b.label !== 'base') { const p = paired(b.rows, control.rows, fit, lead); cell.builds[b.label].overControl = { ...p, worse: worse(p) }; }
  }
  out.cells.push(cell);
}
for (const fit of fits) {
  const per = {};
  for (const b of builds.filter((x) => x.label !== 'base')) {
    const rows = b.rows.filter((r) => r.arcH === fit);
    const ffmPar = (r, kind) => r.arms.FFMq?.parameters?.find((p) => p.kind === kind)?.value;
    const lnB = rows.map((r) => (r.arms.AP?.fit?.b > 0 && ffmPar(r, 'DRAG_AREA_OVER_MASS') > 0 ? Math.log(r.arms.AP.fit.b / ffmPar(r, 'DRAG_AREA_OVER_MASS')) : null)).filter(Number.isFinite);
    const dS = rows.map((r) => (Number.isFinite(r.arms.AP?.fit?.s) && Number.isFinite(ffmPar(r, 'SRP_AREA_OVER_MASS')) ? r.arms.AP.fit.s - ffmPar(r, 'SRP_AREA_OVER_MASS') : null)).filter(Number.isFinite);
    per[b.label] = { windows: rows.length, lnBOverFFM: lnB.length ? { n: lnB.length, median: median(lnB) } : null, sMinusFFM: dS.length ? { n: dS.length, median: median(dS) } : null, refused: rows.filter((r) => r.arms.AP && r.arms.AP.ok === false).length, notConverged: rows.filter((r) => r.arms.AP?.fit?.converged === false).length };
  }
  out.fits.push({ fit, builds: per });
}
const labels = builds.map((b) => b.label), cands = labels.filter((l) => !['base', 'control'].includes(l));
const iv = (x) => (x ? `[${x.map((y) => y.toPrecision(3)).join(', ')}]` : '[none]');
const lines = [
  `# AP builds on ${args.group} (${which} windows): ${builds.map((b) => `${b.label} ${b.build.version} ${b.build.sha256.slice(0, 12)}`).join('; ')}`, '',
  'Development on windows already read; not a registered result. Lead: RMS over the 24 h ending at the lead.', '',
  `| fit / lead | n | median km: ${labels.join(', ')} | p95 km: ${labels.join(', ')} | over control: ${cands.join(', ')} | D m: ${labels.join(', ')} | vs FFMq sat-balanced [two-way]: ${labels.join(', ')} |`,
  '|---|---|---|---|---|---|---|',
  ...out.cells.map((c) => `| ${c.fit} / ${c.lead} | ${labels.map((l) => c.builds[l].n).join(', ')} | ${labels.map((l) => km(c.builds[l].medianKm)).join(', ')} | ${labels.map((l) => km(c.builds[l].p95Km)).join(', ')} | ${cands.map((l) => { const p = c.builds[l].overControl; return p?.ratio ? `${p.ratio.toPrecision(3)} ${iv(p.interval)}${p.worse ? ' WORSE' : ''}` : '-'; }).join('; ')} | ${labels.map((l) => (c.builds[l].dMedianM === null ? '-' : c.builds[l].dMedianM.toPrecision(3))).join(', ')} | ${labels.map((l) => (c.builds[l].vsFFMq?.ratio ? `${c.builds[l].vsFFMq.ratio.toPrecision(3)} ${iv(c.builds[l].vsFFMq.twoWay)}` : '-')).join('; ')} |`),
  '', '| fit | build | windows | median ln(B_AP / B_FFMq) (n) | median S_AP - S_FFMq m2/kg (n) | refused | not converged |', '|---|---|--:|---|---|--:|--:|',
  ...out.fits.flatMap((f) => Object.entries(f.builds).map(([l, x]) => `| ${f.fit} | ${l} | ${x.windows} | ${x.lnBOverFFM ? `${x.lnBOverFFM.median.toFixed(2)} (${x.lnBOverFFM.n})` : '-'} | ${x.sMinusFFM ? `${x.sMinusFFM.median.toExponential(2)} (${x.sMinusFFM.n})` : '-'} | ${x.refused} | ${x.notConverged} |`)),
];
const flagged = out.cells.flatMap((c) => cands.filter((l) => c.builds[l].overControl?.worse).map((l) => `${l} at ${c.fit}/${c.lead}: ${c.builds[l].overControl.ratio.toPrecision(3)} ${iv(c.builds[l].overControl.interval)}`));
lines.push('', flagged.length ? `Worse than the control with an interval above 1: ${flagged.join('; ')}.` : 'No candidate is worse than the control with an interval above 1.');
out.flagged = flagged;
if (args.json) fs.writeFileSync(args.json, JSON.stringify(out, null, 1));
if (args.md) fs.writeFileSync(args.md, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
