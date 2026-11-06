// PER-REV-FLAG.md, amendment of 2026-11-06 (c): rule (c)'s validation table from the stored rows of per-rev-flag-c.mjs, each part against its registered pass
// line: known burns (80 of 84 or more within 13 h), injected steps (95 % or more of the used windows at 3, 4 and 8 m, pooled near 700 km; 2 m reported), false
// alarms (5 % or less of the quiet windows with a verdict). Statistics on stored rows only.
//   node experiments/operator-theory/per-rev-flag-c-table.mjs --out results/operator-theory/per-rev-flag/c
import fs from 'node:fs';
import path from 'node:path';
import { HOUR, RULE_C, revDifferences, revFlagC, periodOf } from './lib/steps.mjs';
import { STORE, SIZES_M, TOLERANCE_H, windowsOf } from './per-rev-flag-c.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT) throw new Error('--out');
const read = (d) => { const dir = path.join(STORE, d); return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []; };
const round = (x, k = 3) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(k)));
const TOL = TOLERANCE_H * HOUR, near = (steps, t) => steps.some((s) => Math.abs(s.t - t) <= TOL);
const ruleOf = (r, truth = r.truth) => revFlagC(revDifferences(r.flight, truth), periodOf(r.truth), Date.parse(r.cutoff));
const family = (r) => (r.group === 'S1' ? 'Sentinel-1' : r.group === 'DO' ? 'altimetry' : 'spheres');

// 1. Known burns: every registered window, a missing or failed row counted as missed.
const knownRows = new Map(read('known').map((r) => [r.key, r]));
const known = windowsOf('known').map((w) => {
  const r = knownRows.get(w.key);
  if (!r?.ok) return { key: w.key, family: w.group === 'S1' ? 'Sentinel-1' : 'altimetry', detected: false, why: r?.error ?? 'not flown' };
  const c = ruleOf(r), detected = !c.noVerdict && near(c.steps, w.burn);
  const nearest = c.steps.reduce((m, s) => (!m || Math.abs(s.t - w.burn) < Math.abs(m.t - w.burn) ? s : m), null);
  return { key: w.key, family: family(r), detected, why: c.noVerdict ? 'no verdict' : detected ? null : 'no step within 13 h', nearestHours: nearest ? round((nearest.t - w.burn) / HOUR, 1) : null, nearestM: nearest ? round(nearest.sizeM, 2) : null, tauM: round(c.tauM) };
});
const knownDetected = known.filter((x) => x.detected).length;
const knownPart = { windows: known.length, detected: knownDetected, rate: round(knownDetected / known.length), pass: knownDetected >= Math.ceil(0.95 * known.length),
  byFamily: Object.fromEntries(['Sentinel-1', 'altimetry'].map((f) => [f, { windows: known.filter((x) => x.family === f).length, detected: known.filter((x) => x.family === f && x.detected).length }])), missed: known.filter((x) => !x.detected) };

// 2. Injected steps on the used windows.
const injectRows = new Map(read('inject').map((r) => [r.key, r]));
const registered = windowsOf('inject'), used = registered.map((w) => injectRows.get(w.key)).filter((r) => r?.ok && r.injections);
const bySize = {};
for (const sizeM of SIZES_M) {
  const out = used.map((r) => {
    const j = r.injections.find((x) => x.sizeM === sizeM), tb = Date.parse(j.tb), base = ruleOf(r), inj = ruleOf(r, j.truth);
    return { family: family(r), detected: !inj.noVerdict && near(inj.steps, tb) && !near(base.steps, tb), noVerdict: inj.noVerdict, realizedM: j.realizedM };
  });
  const cell = (v) => ({ windows: v.length, detected: v.filter((x) => x.detected).length, rate: v.length ? round(v.filter((x) => x.detected).length / v.length) : null, noVerdict: v.filter((x) => x.noVerdict).length });
  bySize[sizeM] = { ...cell(out), sentinel1: cell(out.filter((x) => x.family === 'Sentinel-1')), altimetry: cell(out.filter((x) => x.family === 'altimetry')), realizedMedianM: out.length ? round(out.map((x) => x.realizedM).sort((a, b) => a - b)[out.length >> 1]) : null };
}
const notUsed = registered.filter((w) => !(injectRows.get(w.key)?.ok && injectRows.get(w.key)?.injections)).reduce((m, w) => { const k = (injectRows.get(w.key)?.error ?? 'not flown').replace(/[\d.]+ h$/, 'under 30 h'); return { ...m, [k]: (m[k] ?? 0) + 1 }; }, {});
const injectPart = { registered: registered.length, used: used.length, notUsed, bySize, pass: [3, 4, 8].every((s) => bySize[s].windows > 0 && bySize[s].rate >= 0.95) };

// 3. False alarms on the quiet windows with a verdict.
const quietRows = new Map(read('quiet').map((r) => [r.key, r]));
const quiet = windowsOf('quiet').map((w) => {
  const r = quietRows.get(w.key);
  if (!r?.ok) return { key: w.key, family: w.group === 'DO' ? 'altimetry' : 'spheres', flown: false, why: r?.error ?? 'not flown' };
  const c = ruleOf(r), s = c.state(24, 168);
  const C0 = Date.parse(r.cutoff), inSpan = c.steps.filter((x) => x.t >= C0 - 24 * HOUR && x.t <= C0 + 168 * HOUR);
  return { key: w.key, family: family(r), flown: true, noVerdict: s.noVerdict, flagged: s.flagged, tauM: round(c.tauM), epochs: inSpan.map((x) => ({ t: new Date(x.t).toISOString().slice(0, 16), sizeM: round(x.sizeM, 2) })) };
});
const eligible = quiet.filter((x) => x.flown && !x.noVerdict), flagged = eligible.filter((x) => x.flagged);
// At least 60 windows with a verdict; at most floor(5 % of them) flagged. Every flag is listed with its epoch for report-only review against operator records.
const allowed = Math.floor(0.05 * eligible.length);
const quietPart = { windows: quiet.length, flown: quiet.filter((x) => x.flown).length, noVerdict: quiet.filter((x) => x.noVerdict).length, eligible: eligible.length, allowed, flagged: flagged.length,
  rate: eligible.length ? round(flagged.length / eligible.length) : null, decided: eligible.length >= 60, pass: eligible.length >= 60 && flagged.length <= allowed,
  flags: flagged.map((x) => ({ key: x.key, epochs: x.epochs })), notFlown: quiet.filter((x) => !x.flown) };

const pass = knownPart.pass && injectPart.pass && quietPart.pass;
const doc = { registered: 'PER-REV-FLAG.md, amendment of 2026-11-06 (c)', rule: RULE_C, toleranceHours: TOLERANCE_H, known: knownPart, injected: injectPart, quiet: quietPart, pass };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(doc, null, 1)}\n`);
const P = (x) => (x ? 'pass' : 'FAIL');
const md = ['# Rule (c): validation near 700 km', '', `Registered in \`experiments/operator-theory/PER-REV-FLAG.md\` (amendment of 2026-11-06 (c)) before any row: persistence over ${RULE_C.spanH} h either side, the typical change and drift away from each candidate, threshold max(${RULE_C.floorM} m, ${RULE_C.k} x the typical change), no verdict above ${RULE_C.noVerdictM} m, known burns within ${TOLERANCE_H} h. Geostationary burn verdicts are parked. Overall: **${pass ? 'passes' : 'fails'}**.`, '',
  '| Part | Measured | Pass line | Result |', '| --- | --- | --- | --- |',
  `| Known burns | ${knownDetected} of ${known.length} (Sentinel-1 ${knownPart.byFamily['Sentinel-1'].detected} of ${knownPart.byFamily['Sentinel-1'].windows}, altimetry ${knownPart.byFamily.altimetry.detected} of ${knownPart.byFamily.altimetry.windows}) | 95 % | ${P(knownPart.pass)} |`,
  ...SIZES_M.map((s) => `| Injected ${s} m | ${bySize[s].detected} of ${bySize[s].windows} (${bySize[s].rate ?? '-'}; Sentinel-1 ${bySize[s].sentinel1.detected} of ${bySize[s].sentinel1.windows}, altimetry ${bySize[s].altimetry.detected} of ${bySize[s].altimetry.windows}), no verdict ${bySize[s].noVerdict} | ${s >= 3 ? '95 %' : 'reported'} | ${s >= 3 ? P(bySize[s].windows > 0 && bySize[s].rate >= 0.95) : '-'} |`),
  `| False alarms | ${flagged.length} of ${eligible.length} with a verdict (${quietPart.rate ?? '-'}); no verdict ${quietPart.noVerdict} of ${quietPart.flown} flown | at most ${allowed} (5 %) of 60 or more | ${quietPart.decided ? P(quietPart.pass) : 'undecided: under 60 windows with a verdict'} |`, '',
  `False-alarm flags, for report-only review against operator records (the count stands as read): ${quietPart.flags.map((f) => `${f.key} at ${f.epochs.map((e) => `${e.t} (${e.sizeM} m)`).join(', ')}`).join('; ') || 'none'}.`, '',
  `Injection windows used: ${used.length} of ${registered.length} (not used: ${JSON.stringify(notUsed)}).`, '',
  `Known burns missed: ${knownPart.missed.map((m) => `${m.key} (${m.why}${m.nearestHours !== null && m.nearestHours !== undefined ? `; nearest step ${m.nearestHours} h, ${m.nearestM} m` : ''})`).join('; ') || 'none'}.`, ''];
fs.writeFileSync(path.join(OUT, 'README.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
