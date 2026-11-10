// stack #316: the record that carries a forecast (APC, sdn-ap 0.6.7 and later, SPEC 18), per cell, from refly.mjs --ap-only --apc rows.
// Development on windows already read, not a registered result. Aggregates only, plus the list of windows the 5 % rule flags.
//   node experiments/headline-loop/apc.mjs --rows <store>/<sha12>-apc [--group GD] [--windows first|spring|all] [--json out.json] [--md out.md]
//   node experiments/headline-loop/apc.mjs --check     made-up rows: the 5 % rule and the paired ratio
// Per cell (fit, lead), inside the carried span: APC's error (median, p95 km), FFMq's, the ratio of medians and the paired median of
// E_APC / E_FFMq with a 95 % interval over time blocks of fit plus lead; D, the RMS over the lead day of |r_APC - r_FFMq| (the compression
// error, mm: median and p95); the record's bytes and bytes per carried day; the CPU seconds to make it: the module's record build (every
// window), the one-pass re-flight where the cached trajectory's join broke the 5 mm rule, and on a sample the numerical fit and propagation.
// Past the span (1, 3 and 7 days after its end, where truth exists and not after 2026-11-10): APC's error, the theory flying. Every window
// whose APC error is not within 5 % of FFMq's at a lead is listed; so is every window the module refused.
import fs from 'node:fs';
import path from 'node:path';
import { median, quantile, bootstrap } from './lib/stats.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const DAY = { 24: '1', 48: '2', 72: '3', 168: '7' };
const asc = (a, b) => a - b;
/** Windows outside the 5 % rule at a lead: [{ key, arcH, lead, ratio }]. */
export function outside(rows, tol = 0.05) {
  const out = [];
  for (const r of rows) for (const [lead, day] of Object.entries(DAY)) {
    const a = r.arms?.APC?.days?.[day]?.e, q = r.arms?.FFMq?.days?.[day]?.e;
    if (Number.isFinite(a) && q > 0 && Math.abs(a / q - 1) > tol) out.push({ key: r.key, arcH: r.arcH, lead: Number(lead), ratio: a / q });
  }
  return out;
}
export function pairedApc(rows, fit, lead, draws = 1000) {
  const day = DAY[lead], list = rows.filter((r) => r.arcH === fit && r.arms?.APC?.days?.[day]?.e > 0 && r.arms?.FFMq?.days?.[day]?.e > 0);
  if (!list.length) return null;
  const t0 = Math.min(...list.map((r) => Date.parse(r.cutoff)));
  const items = list.map((r) => ({ sat: r.name, block: Math.floor((Date.parse(r.cutoff) - t0) / ((fit + lead) * 3600000)), value: Math.log(r.arms.APC.days[day].e / r.arms.FFMq.days[day].e) }));
  const iv = bootstrap(items, 'paired-median', 'block', draws);
  return { n: items.length, ratio: Math.exp(median(items.map((x) => x.value))), interval: iv ? iv.map(Math.exp) : null };
}

if (args.check) {
  // end to end: apc.mjs on a made-up APC store (records equal to FFMq within 0.1 %, one 6 % off at day 1, one refused); assertions on --json, --md
  const E = await import('./lib/e2e.mjs');
  const { check, done } = E.checker('APC');
  const rows = E.cellRows({ group: 'GD', regime: 'Laser geodetic' }).map((r, i) => {
    const k = i === 3 ? 1.06 : 1.001, q = r.arms.FFMq.days;
    const apc = i === 5 ? { ok: false, error: 'carry-tolerance' } : { ok: true, frame: 'GCRF', days: Object.fromEntries(Object.entries(q).map(([d, v]) => [d, { ...v, e: v.e * (d === '1' ? k : 1.001) }])), dVsFFMq: { 1: 2e-6, 2: 2e-6, 3: 2e-6, 7: 2e-6 }, dVsBlock: { 1: 2e-6, 2: 2e-6, 3: 2e-6, 7: 2e-6 }, bytes: 36000, segments: 20, spanDays: 7, buildCpuS: 3, ...(i % 10 === 0 ? { cost: { fitCpuS: 9, propagationCpuS: 21 } } : {}), pastSpan: { 1: { e: 0.012 }, 3: { e: 0.016 }, 7: { e: 0.02 } } };
    return { ...r, arms: { FFMq: r.arms.FFMq, APC: apc } };
  });
  const dir = E.tmp('apc'), A = E.writeStore(dir, { rows, extra: { arm: 'APC' } });
  const r = E.run('apc.mjs', ['--rows', A, '--json', path.join(dir, 'a.json'), '--md', path.join(dir, 'a.md')]);
  check(r.code === 0, `apc.mjs exited ${r.code}: ${r.err.slice(-300)}`);
  const j = E.readJson(path.join(dir, 'a.json')), c = j.cells.find((x) => x.fit === 72 && x.lead === 24);
  check(c?.n === 31 && Math.abs(c.ratioOfMedians - 1.001) < 1e-3 && Math.abs(c.dMm[0] - 2) < 1e-9 && c.bytes === 36000 && Math.abs(c.bytesPerDay - 36000 / 7) < 1e-6, `cell ${JSON.stringify(c)}`);
  check(c?.cpuS?.build === 3 && c.cpuS.sampled === 4 && c.cpuS.fit === 9 && c.cpuS.propagation === 21, `cost ${JSON.stringify(c?.cpuS)}`);
  check(j.outside.length === 1 && j.outside[0].key === rows[3].key && j.outside[0].lead === 24 && j.refused.length === 1 && j.refused[0].key === rows[5].key, `outside ${JSON.stringify(j.outside)}, refused ${JSON.stringify(j.refused)}`);
  check(j.past.find((p) => p.after === '3 days')?.apcKm?.[0] === 0.016, 'past the span');
  check(/Windows outside 5 % of FFMq at a lead: GD\|S0\|/.test(fs.readFileSync(path.join(dir, 'a.md'), 'utf8')), 'the Markdown list');
  fs.rmSync(dir, { recursive: true, force: true });
  done('apc.mjs run on a made-up store: the cell ratio, D, bytes and making cost; the one window 6 % off at day 1 listed, the refused one listed; past the span; the Markdown list');
}

const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
const which = args.windows ?? 'all';
const all = fs.readdirSync(args.rows).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(args.rows, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean))
  .filter((r) => (!args.group || r.group === args.group) && (which === 'all' || (which === 'first' ? !r.period : !!r.period)));
const build = JSON.parse(fs.readFileSync(path.join(args.rows, 'build.json'), 'utf8'));
const ok = all.filter((r) => !r.error && r.arms?.APC?.ok);
const refused = all.filter((r) => !r.error && r.arms?.APC && !r.arms.APC.ok).map((r) => ({ key: r.key, arcH: r.arcH, error: r.arms.APC.error }));
const med = (v) => (v.length ? quantile([...v].sort(asc), 0.5) : null), p95 = (v) => (v.length ? quantile([...v].sort(asc), 0.95) : null);
const out = { build: { version: build.version, sha256: build.sha256 }, group: args.group ?? 'all', windows: which, note: 'Development on windows already read; not a registered result.', cells: [], past: [], outside: outside(ok), refused };
const groups = [...new Set(ok.map((r) => r.group))];
for (const g of groups) for (const fit of [...new Set(ok.filter((r) => r.group === g).map((r) => r.arcH))].sort(asc)) {
  const rows = ok.filter((r) => r.group === g && r.arcH === fit);
  const cost = rows.filter((r) => r.arms.APC.cost), refly = rows.filter((r) => r.arms.APC.reflyCpuS !== null && r.arms.APC.reflyCpuS !== undefined);
  for (const lead of [24, 48, 72, 168]) {
    const day = DAY[lead], v = rows.filter((r) => r.arms.APC.days?.[day] && r.arms.FFMq?.days?.[day]);
    if (!v.length) continue;
    const a = v.map((r) => r.arms.APC.days[day].e), q = v.map((r) => r.arms.FFMq.days[day].e), d = v.map((r) => r.arms.APC.dVsFFMq?.[day]).filter(Number.isFinite), db = v.map((r) => r.arms.APC.dVsBlock?.[day]).filter(Number.isFinite);
    out.cells.push({ group: g, regime: v[0].regime, fit, lead, n: v.length, apcKm: [med(a), p95(a)], ffmqKm: [med(q), p95(q)], ratioOfMedians: med(a) / med(q), paired: pairedApc(rows, fit, lead), dMm: [med(d) * 1e6, p95(d) * 1e6], dBlockMm: db.length ? [med(db) * 1e6, p95(db) * 1e6] : null,
      bytes: med(rows.map((r) => r.arms.APC.bytes)), bytesPerDay: med(rows.map((r) => r.arms.APC.bytes / r.arms.APC.spanDays)),
      cpuS: { build: med(rows.map((r) => r.arms.APC.buildCpuS)), reflown: refly.length, refly: med(refly.map((r) => r.arms.APC.reflyCpuS)), sampled: cost.length, fit: med(cost.map((r) => r.arms.APC.cost.fitCpuS)), propagation: med(cost.map((r) => r.arms.APC.cost.propagationCpuS)) } });
  }
  for (const [label, day] of [['1 day', '1'], ['3 days', '3'], ['7 days', '7']]) {
    const v = rows.map((r) => r.arms.APC.pastSpan?.[day]?.e).filter(Number.isFinite);
    out.past.push({ group: g, regime: rows[0].regime, fit, after: label, n: v.length, apcKm: v.length ? [med(v), p95(v)] : null });
  }
}
const f = (x, p = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : Number(x).toPrecision(p));
const lines = [
  `# APC, the record that carries the forecast: ${build.version} (${build.sha256.slice(0, 12)})${args.group ? `, ${args.group}` : ''} (${which} windows)`, '',
  'Development on windows already read; not a registered result. Inside the carried span (cutoff to 7 days); lead: RMS over the 24 h ending at the lead. Flown in the module\'s GCRF output.', '',
  '| Regime | fit h | lead h | n | APC km median / p95 | FFMq km median / p95 | ratio of medians | paired APC / FFMq [blocks] | D vs FFMq mm median / p95 | compression D vs block mm median / p95 | bytes (per day) | CPU s: record build; one-pass re-flight (n); FFM fit / propagation (sampled n) |',
  '|---|--:|--:|--:|---|---|--:|---|---|---|---|---|',
  ...out.cells.map((c) => `| ${c.regime} | ${c.fit} | ${c.lead} | ${c.n} | ${f(c.apcKm[0])} / ${f(c.apcKm[1])} | ${f(c.ffmqKm[0])} / ${f(c.ffmqKm[1])} | ${f(c.ratioOfMedians, 4)} | ${c.paired ? `${f(c.paired.ratio, 4)} [${c.paired.interval ? c.paired.interval.map((x) => f(x, 4)).join(', ') : 'none'}]` : '-'} | ${f(c.dMm[0])} / ${f(c.dMm[1])} | ${c.dBlockMm ? `${f(c.dBlockMm[0])} / ${f(c.dBlockMm[1])}` : '-'} | ${f(c.bytes, 5)} (${f(c.bytesPerDay, 4)}) | ${f(c.cpuS.build)}; ${c.cpuS.reflown ? `${f(c.cpuS.refly)} (${c.cpuS.reflown})` : '-'}; ${c.cpuS.sampled ? `${f(c.cpuS.fit)} / ${f(c.cpuS.propagation)} (${c.cpuS.sampled})` : '-'} |`),
  '', '## Past the span (the theory flies; the headline does not apply)', '', '| Regime | fit h | after the span | n | APC km median / p95 |', '|---|--:|---|--:|---|',
  ...out.past.map((p) => `| ${p.regime} | ${p.fit} | ${p.after} | ${p.n} | ${p.apcKm ? `${f(p.apcKm[0])} / ${f(p.apcKm[1])}` : '-'} |`),
  '', `Windows outside 5 % of FFMq at a lead: ${out.outside.length ? out.outside.map((o) => `${o.key} ${o.arcH} h, ${o.lead} h: ${f(o.ratio, 4)}`).join('; ') : 'none'}.`,
  `Refused by the module: ${refused.length ? refused.map((r) => `${r.key} ${r.arcH} h (${String(r.error).slice(0, 80)})`).join('; ') : 'none'}.`,
];
if (args.json) fs.writeFileSync(args.json, JSON.stringify(out, null, 1));
if (args.md) fs.writeFileSync(args.md, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
