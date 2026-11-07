// The maneuver flag, end to end (experiments-ffm-maneuver-flags-20261104): the record's windows recomputed from their truth through the readers and lib/steps.mjs equal
// results/operator-theory/maneuver-flags/flags.json; Sentinel-1, altimetry and WAAS as measured; a step-free Sentinel-1 window; the published tables carry the flag;
// results/ap-truth/compare/cells.json reproduces with its counts; every published example has no step inside its fit and carries its burn counts; the holds.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/maneuver-flags.e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { config, root, XM } from './lib/xp2.mjs';
import { STATIC, WA_CUTOFFS } from './lib/regimes.mjs';
import { HELD_NORADS } from './lib/pairs.mjs';
import { DAY, HOUR, LOW, openElements, revolutions, lowSteps, geoSteps, windowState, windowSteps } from './lib/steps.mjs';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const RESULTS = path.join(repo, 'results/operator-theory/maneuver-flags'), COMPARE = path.join(repo, 'results/ap-truth/compare');
const EXAMPLES_IN = ['/opt/data/sdn-archive/operator-theory/ap/b0411/compare-examples-full', '/opt/data/sdn-archive/operator-theory/ap/b051/compare-examples-burn-free'];
let failures = 0;
const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
const flags = JSON.parse(fs.readFileSync(path.join(RESULTS, 'flags.json'), 'utf8'));
const W = new Map(flags.windows.map((w) => [w.key, w]));
const iso = (t) => new Date(t).toISOString().slice(0, 16), r1 = (x) => Math.round(x * 10) / 10;
const el = await openElements();
/** One window's flag as maneuver-flags.mjs writes it (lib/steps.mjs windowSteps). */
const flagOf = (d, key) => windowSteps(d, Date.parse(`${W.get(key).cutoff}T00:00:00Z`));
const same = (key, mine) => JSON.stringify(mine) === JSON.stringify({ steps: W.get(key).steps, unchecked: W.get(key).unchecked });

// 1. Sentinel-1A, 2026-05-03, 24 h fit: the burn of 2026-05-06 on the truth's revolution time means (20 days of truth about the window).
{
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const o = XM.config.groups.S1.objects.find((x) => x.norad === 39634), lines = [];
  for (let t = Date.parse('2026-04-26T00:00:00Z'); t < Date.parse('2026-05-16T00:00:00Z'); t += DAY) lines.push(...T.series(o, t, t + DAY - 1).lines);
  const revs = await revolutions(lines, el), d = lowSteps(revs), key = 'S1|39634|2026-05-03';
  check(same(key, flagOf(d, key)), `${key}: its flag recomputed from the truth equals flags.json (${JSON.stringify(W.get(key).steps)}, unchecked ${JSON.stringify(W.get(key).unchecked)} h)`);
  const near = lowSteps(revs, { ...LOW, minM: 5 }).steps.filter((s) => s.t > Date.parse('2026-05-05T12:00:00Z') && s.t < Date.parse('2026-05-07T00:00:00Z'));
  const b = near[0], s24 = windowState(W.get(key), 24, 168);
  check(near.length === 1 && iso(b.t) === '2026-05-06T03:03' && Math.abs(b.sizeM - 7.86) < 0.05 && !s24.flagged,
    `${key} F24: the 2026-05-06 burn is +${b ? b.sizeM.toFixed(1) : '?'} m against the drift at ${b ? iso(b.t) : '?'} (+${b ? b.changeM.toFixed(1) : '?'} m before it), under the 8 m rule: not flagged, and its fit arc holds the truth's 2026-05-01 hole (the record: flagged by +12.5 m at 04:42, the study's per-state means; measured 15.3 m against 3.6 m rev-to-rev scatter on time means)`);
}
// 2. Sentinel-3A, 2025-11-09: its altimetry truth, every file of the series.
{
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const s = STATIC.filter((x) => x.group === 'DO').map((x) => SRC.chain(x.files())).find((c) => c.name === 'SENTINEL 3A');
  const d = lowSteps(await revolutions(s.lines, el)), key = 'DO|SENTINEL 3A|2025-11-09', w = W.get(key), st = windowState(w, 24, 168);
  const step = w.steps.find((x) => x.t.startsWith('2025-11-13'));
  check(same(key, flagOf(d, key)) && st.flagged && st.inForecast && step && step.sizeM === 33.2, `${key} F24 day 7: flagged in the forecast span, +${step?.sizeM} m at ${step?.t} (${step?.hours} h; the record: +27 m on 11-12/13), recomputed from the truth`);
  const storm = w.stormDays.some((x) => x >= '2025-11-08' && x <= '2025-11-16');
  check(storm && st.flagged, `${key}: a storm (GFZ Ap 30 or more on ${w.stormDays.join(', ')}) and a burn in the span: its class is maneuver (lib/steps.mjs classOf), which the study's storm-first order filed as estimator`);
}
// 3. Galaxy 30, 2026-10-24: the WAAS broadcast, hourly.
{
  const { SBAS, series } = await import('./lib/sbas.mjs');
  const [prn] = Object.entries(SBAS).find(([, x]) => x.name === 'GALAXY 30 (G-30)');
  const g = await geoSteps(await series(Number(prn), WA_CUTOFFS[0] - 3 * DAY, WA_CUTOFFS.at(-1) + 8 * DAY), el);
  const key = 'WA|GALAXY 30 (G-30)|2026-10-24', w = W.get(key), st = windowState(w, 24, 168), burn = w.steps.find((x) => x.t === '2026-10-25T10:56');
  const at1256 = g.rows.find((x) => iso(x.t) === '2026-10-25T12:56');
  check(same(key, flagOf(g, key)) && st.flagged && burn && burn.sizeM === 227.2 && Math.round(at1256.daM) === 218,
    `${key} F24: flagged, the hourly burn +${burn?.sizeM} m at 2026-10-25T10:56 (residual ${r1(g.steps.find((x) => iso(x.t) === '2026-10-25T10:56').residualM)} m, 4 x the median ${r1(g.medianResidualM)} m); the hour the record names, 12:56, holds +${Math.round(at1256.daM)} m, under the study's 272 m peak rule`);
}
await el.close();
// 4. A step-free Sentinel-1 window.
{
  const key = 'S1|39634|2026-03-24', st = windowState(W.get(key), 24, 168);
  check(st.stepFree && !W.get(key).steps.length && !W.get(key).unchecked.length, `${key} F24 to day 7: step-free (no step, the detector covered the fit arc and all 168 h)`);
}
// 5. The published tables carry the flag; cells.json reproduces from the stored rows with its counts.
{
  const md = fs.readFileSync(path.join(RESULTS, 'table.md'), 'utf8'), t = JSON.parse(fs.readFileSync(path.join(RESULTS, 'table.json'), 'utf8')).tables;
  const s1 = t.find((c) => c.group === 'S1' && c.fit === 24 && c.day === 7);
  check(/\| Flagged \(in fit, in forecast\) \| Step-free \| Unchecked \|/.test(md) && t.length === 24 && t.every((c) => c.windows === c.flagged + c.stepFree + c.unchecked),
    `table.md and table.json carry flagged, step-free and unchecked columns (24 cells; Near 700 km F24 day 7: ${s1.flagged} flagged, ${s1.stepFree} step-free, ${s1.unchecked} unchecked of ${s1.windows})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maneuver-flags-'));
  execFileSync(process.execPath, [path.join(here, 'compare-cells.mjs'), '--out', path.join(tmp, 'cells.json'), '--examples', EXAMPLES_IN.join(',')], { stdio: ['ignore', 'ignore', 'inherit'] });
  const cells = JSON.parse(fs.readFileSync(path.join(COMPARE, 'cells.json'), 'utf8'));
  check(fs.readFileSync(path.join(tmp, 'cells.json')).equals(fs.readFileSync(path.join(COMPARE, 'cells.json'))), `results/ap-truth/compare/cells.json reproduces from the stored rows and flags.json (${cells.rows.length} rows)`);
  const tested = cells.rows.filter((r) => Number.isInteger(r.burnsInFit) && Number.isInteger(r.burnsInForecast)), labels = new Set(tested.map((r) => r.regime));
  const near = cells.rows.find((r) => r.reference === 'truth' && r.level === 'regime' && r.regime === 'Near 700 km' && r.fit === 24 && r.lead === 168);
  check(tested.length === 128 && labels.size === 2 && labels.has('Near 700 km') && labels.has('Low orbit, altimetry') && cells.rows.every((r) => 'burnsInFit' in r && 'burnsInForecast' in r),
    `every cells.json row has burnsInFit and burnsInForecast: counts on the ${tested.length} Sentinel-1 and altimetry rows (Near 700 km, 24 h fit, day 7: ${near.burnsInFit} in the fit, ${near.burnsInForecast} in the forecast of ${near.n}), null elsewhere`);
  // 6. The examples: published, reproduced, burn-free fits, their counts.
  const out = path.join(COMPARE, 'examples');
  let said = '';
  try { said = execFileSync(process.execPath, [path.join(here, 'compare-examples-publish.mjs'), '--in', EXAMPLES_IN.join(','), '--out', out, '--check'], { stdio: ['ignore', 'pipe', 'inherit'] }).toString('utf8'); } catch (error) { said = String(error.stdout ?? error.message); }
  check(/COMPARE EXAMPLES CHECK PASS/.test(said), `compare-examples-publish.mjs --check: ${said.trim().split('\n').at(-1)} (from ${EXAMPLES_IN.map((d) => path.basename(d)).join(' and ')})`);
  if (!fs.existsSync(path.join(out, 'index.json'))) { console.log('MANEUVER FLAGS E2E FAIL: no published examples'); process.exit(1); }
  const index = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8')), live = index.filter((e) => !e.held && !e.dropped);
  const docs = live.map((e) => JSON.parse(fs.readFileSync(path.join(out, `${e.id}.json`), 'utf8')));
  const holed = (d) => d.epochsSeconds.some((t, i) => i > 0 && t - d.epochsSeconds[i - 1] > 2 * (d.epochsSeconds[1] - d.epochsSeconds[0]) && d.epochsSeconds[i - 1] / 3600 < d.fitHours);
  const inFit = docs.filter((d) => d.steps.some((s) => s.hour < d.fitHours) || holed(d));
  check(!inFit.length && docs.every((d) => Number.isInteger(d.burnsInFit) && Number.isInteger(d.burnsInForecast) && d.burnsInFit === 0), `${docs.length} published examples: none with a step or a reference hole inside its fit (${inFit.map((d) => d.id).join(', ') || 'none'}), each with burnsInFit 0 and burnsInForecast (${docs.filter((d) => d.burnsInForecast).length} with a burn after the fit)${index.some((e) => e.dropped) ? `; dropped: ${index.filter((e) => e.dropped).map((e) => e.id).join(', ')}` : ''}`);
  const moved = { 'best-near-700-km': '2026-05-08', 'truth-near-700-km-sentinel-1a': '2026-01-18', 'truth-near-700-km-sentinel-1c': '2026-04-19', 'next-gfz-low-orbit': '2026-03-13' };
  const now = Object.fromEntries(Object.keys(moved).map((id) => { const d = docs.find((x) => x.id === id); return [id, d ? (d.cutoff ?? d.start).slice(0, 10) : index.find((x) => x.id === id)?.dropped ? 'dropped' : 'missing']; }));
  check(Object.entries(moved).every(([id, was]) => now[id] !== was && now[id] !== 'missing'), `the four examples whose fit held a step or a hole were picked again: ${Object.entries(moved).map(([id, was]) => `${id} ${was} -> ${now[id]}`).join('; ')}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  // 7. The holds.
  const heldNames = /stella|terrasar|sentinel-1d|lageos ?1\b|starlink|swarm|grace/i;
  const heldIn = flags.windows.filter((w) => heldNames.test(w.name) || HELD_NORADS.has(Number(w.key.split('|')[1])) || (w.group === 'S1' && w.cutoff >= '2026-06-01'));
  const ex = new Set(flags.exclude.norads);
  check(!heldIn.length && [22824, 31698, 66315, 8820, 43567, 37847, 41862, 41174, 43055, 41175, 39451, 39452, 39453, 43476, 43477].every((n) => ex.has(n)) && flags.exclude.s1CutoffBefore === '2026-06-01'
    && index.filter((e) => /starlink/i.test(e.id)).every((e) => e.held) && !fs.readdirSync(out).some((f) => /starlink/i.test(f)),
    `held objects never read: no window of C2's held objects, Swarm, GRACE-FO or a Sentinel-1 cutoff from 2026-06-01 (EXCLUDE asserted, ${ex.size} catalog numbers); the Starlink example is held, not parsed (${index.filter((e) => e.held).map((e) => e.id).join(', ')})`);
}
console.log(failures ? `MANEUVER FLAGS E2E FAIL: ${failures}` : 'MANEUVER FLAGS E2E PASS');
process.exit(failures ? 1 : 0);
