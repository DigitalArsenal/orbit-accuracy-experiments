// PER-REV-FLAG.md, amendment of 2026-11-06: rule (b)'s validation table from the stored rows of per-rev-flag-validate.mjs, each part against its registered pass
// line: known burns (25 of 26 or more), injected steps (95 % or more at 3, 4 and 8 m, Sentinel-1 and geostationary apart; 2 m reported), false alarms on quiet
// windows (5 % or less of those with a typical change of 0.2 m or less). Statistics on stored rows only.
//   node experiments/operator-theory/per-rev-flag-validate-table.mjs --out results/operator-theory/per-rev-flag/validate
import fs from 'node:fs';
import path from 'node:path';
import { HOUR, RULE_B, revDifferences, revFlagB, periodOf } from './lib/steps.mjs';
import { STORE, SIZES_M, windowsOf } from './per-rev-flag-validate.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT) throw new Error('--out');
const read = (d) => { const dir = path.join(STORE, d); return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []; };
const round = (x, k = 3) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(k)));
const near = (steps, t, P) => steps.some((s) => Math.abs(s.t - t) <= P + 3 * HOUR);
const ruleOf = (r, truth = r.truth) => { const P = periodOf(r.truth); return { P, b: revFlagB(revDifferences(r.flight, truth), P, Date.parse(r.cutoff)) }; };

// 1. Known burns.
const known = [...read('known-2025'), ...read('known-2026')];
const knownRows = known.map((r) => {
  if (!r.ok) return { key: r.key, detected: false, why: r.error ?? 'not flown' };
  const { P, b } = ruleOf(r), burn = Date.parse(r.burn), C = Date.parse(r.cutoff);
  const hit = !b.noVerdict && b.steps.some((s) => s.t >= C - 24 * HOUR && s.t <= C + 168 * HOUR && Math.abs(s.t - burn) <= P + 3 * HOUR);
  return { key: r.key, detected: hit, why: b.noVerdict ? 'no verdict' : hit ? null : 'no step near the burn', tauM: round(b.tauM), thetaM: round(b.thetaM, 2), nearestStepM: round(b.steps.reduce((m, s) => (Math.abs(s.t - burn) < Math.abs((m?.t ?? Infinity) - burn) ? s : m), null)?.sizeM, 2) };
});
const knownPart = { registered: windowsOf('known').length, rows: knownRows.length, detected: knownRows.filter((x) => x.detected).length, pass: knownRows.filter((x) => x.detected).length >= 25, missed: knownRows.filter((x) => !x.detected) };

// 2. Injected steps.
const injectPart = {};
for (const [set, label] of [['inject-s1', 'Sentinel-1'], ['inject-geo', 'Geostationary (GFZ)']]) {
  const rows = read(set), used = rows.filter((r) => r.ok && r.injections), bySize = {};
  for (const sizeM of SIZES_M) {
    const out = used.map((r) => {
      const j = r.injections.find((x) => x.sizeM === sizeM), tb = Date.parse(j.tb), base = ruleOf(r), inj = ruleOf(r, j.truth);
      return { detected: !inj.b.noVerdict && near(inj.b.steps, tb, base.P) && !near(base.b.steps, tb, base.P), noVerdict: inj.b.noVerdict, realizedM: j.realizedM };
    });
    const n = out.length, d = out.filter((x) => x.detected).length;
    bySize[sizeM] = { windows: n, detected: d, rate: n ? round(d / n) : null, noVerdict: out.filter((x) => x.noVerdict).length, realizedMedianM: n ? round(out.map((x) => x.realizedM).sort((a, b) => a - b)[n >> 1]) : null };
  }
  const notUsed = rows.filter((r) => !(r.ok && r.injections)).reduce((m, r) => { const k = (r.error ?? 'not flown').replace(/[\d.]+ h$/, '<24 h'); return { ...m, [k]: (m[k] ?? 0) + 1 }; }, {});
  injectPart[set] = { label, rows: rows.length, used: used.length, notUsed, bySize, pass: [3, 4, 8].every((s) => bySize[s].windows > 0 && bySize[s].rate >= 0.95) };
}

// 3. False alarms on quiet windows.
const quiet = read('quiet').filter((r) => r.ok), groups = {};
for (const r of quiet) {
  const { b } = ruleOf(r), s = b.state(24, 168), g = groups[r.group] ??= { windows: 0, noVerdict: 0, eligible: 0, flagged: 0, flaggedKeys: [] };
  g.windows += 1;
  if (s.noVerdict) { g.noVerdict += 1; continue; }
  g.eligible += 1;
  if (s.flagged) { g.flagged += 1; g.flaggedKeys.push(r.key); }
}
const eligible = Object.values(groups).reduce((s, g) => s + g.eligible, 0), flagged = Object.values(groups).reduce((s, g) => s + g.flagged, 0);
const quietPart = { flown: quiet.length, notFlown: read('quiet').length - quiet.length, groups, eligible, flagged, rate: eligible ? round(flagged / eligible) : null, pass: eligible > 0 && flagged / eligible <= 0.05 };

const pass = knownPart.pass && injectPart['inject-s1'].pass && injectPart['inject-geo'].pass && quietPart.pass;
const doc = { registered: 'PER-REV-FLAG.md, amendment of 2026-11-06 (rule (b) and its validation)', rule: RULE_B, known: knownPart, injected: injectPart, quiet: quietPart, pass };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(doc, null, 1)}\n`);
const P = (x) => (x ? 'pass' : 'FAIL');
const md = ['# Rule (b): validation', '', `Registered in \`experiments/operator-theory/PER-REV-FLAG.md\` (amendment of 2026-11-06) with k = ${RULE_B.k}, the ${RULE_B.noVerdictM} m no-verdict line and N = ${RULE_B.N} fixed before any row. Overall: **${pass ? 'passes' : 'fails'}**.`, '',
  '| Part | Measured | Pass line | Result |', '| --- | --- | --- | --- |',
  `| Known burns (Sentinel-1) | ${knownPart.detected} of ${knownPart.registered} detected | 25 of 26 | ${P(knownPart.pass)} |`,
  ...Object.values(injectPart).flatMap((p) => SIZES_M.map((s) => `| Injected ${s} m, ${p.label} | ${p.bySize[s].detected} of ${p.bySize[s].windows} (${p.bySize[s].rate ?? '-'}), no verdict ${p.bySize[s].noVerdict} | ${s >= 3 ? '95 %' : 'reported'} | ${s >= 3 ? P(p.bySize[s].windows > 0 && p.bySize[s].rate >= 0.95) : '-'} |`)),
  `| False alarms, quiet windows | ${flagged} of ${eligible} (${quietPart.rate ?? '-'}); no verdict ${Object.values(groups).reduce((s, g) => s + g.noVerdict, 0)} | 5 % | ${P(quietPart.pass)} |`, '',
  `Known burns missed: ${knownPart.missed.map((m) => `${m.key} (${m.why})`).join('; ') || 'none'}.`, '',
  `Injection windows: Sentinel-1 ${injectPart['inject-s1'].used} of ${injectPart['inject-s1'].rows} used, geostationary ${injectPart['inject-geo'].used} of ${injectPart['inject-geo'].rows} (not used: ${JSON.stringify({ ...injectPart['inject-s1'].notUsed })}; ${JSON.stringify({ ...injectPart['inject-geo'].notUsed })}).`, '',
  `Quiet windows by group: ${Object.entries(groups).map(([k, g]) => `${k} ${g.flagged} of ${g.eligible} flagged, ${g.noVerdict} no verdict`).join('; ')}.`, ''];
fs.writeFileSync(path.join(OUT, 'README.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
