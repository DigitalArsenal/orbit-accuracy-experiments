// The result file and the maps of a synthetic-orbit run (run.mjs --report): one JSON (schema sdn-ap-synthetic/1) and one Markdown page
// with, for each inclination band, a map of perigee against eccentricity by AP's day-5 distance to the truth and by its speed against
// SGP4-XP; the failing cells worst first; the edge cases; what the run does not cover.
import fs from 'node:fs';
import path from 'node:path';
import { GRID, BANDS, AM, bandOf } from './cases.mjs';

const PASS_M = 100;
const STATISTIC = 'Each orbit is made up (cases.mjs, seeded). Its state at the fit arc\'s start (the cutoff less 72 h) is the module\'s, from the case\'s mean elements; the truth is the numerical propagator (FFM 2.2.0) flown from that state on a 300 s grid through the 72 h fit arc and 7 days past the cutoff. AP and our SGP4-XP (THEORY SGP4XP, the same module) are fitted to the truth\'s states over the 72 h before the cutoff and flown; the distance at a day is the root mean square of the 3D distance to the truth over the 24 h ending at that day. Both sides see the same space weather: the weather known at the cutoff (GFZ observed, then the NOAA forecast issued before it) drives the truth\'s drag and AP\'s. pass: AP\'s day-5 distance under 100 m. apOverXp: AP\'s day-5 distance over SGP4-XP\'s. Cost: microseconds per state of a warm set flown 7 days at 300 s through the module\'s propagate call (the median of three timed flights, interleaved), measured on a shared, loaded machine at the lowest priority, so the ratio is the figure to read, not the microseconds.';
const TRUTH = {
  L70S: 'FFM 2.2.0: Earth gravity to degree and order 70, NRLMSISE-00 drag on the weather known at the cutoff, sphere radiation pressure with conical shadow, the Sun and Moon, solid Earth tides, general relativity; RK78 at 1e-10 with steps up to 120 s. For orbits with perigee under 2,500 km.',
  Ffull: 'FFM 2.2.0: as L70S without drag. For orbits with perigee at or above 2,500 km.',
};
const regimeOf = (c) => (c.e >= 0.3 ? 'highly elliptical (e 0.3 and above)' : c.n >= 6.4 ? 'low orbit (period under 225 min)' : c.n >= 1.2033 ? 'medium Earth orbit' : c.n >= 0.8022 ? 'geosynchronous (0.8 to 1.2 rev/day)' : 'beyond geosynchronous');
const fmt = (x) => (x == null ? '-' : x >= 10000 ? `${Math.round(x / 1000)} km` : x >= 1000 ? `${(x / 1000).toFixed(1)} km` : `${Math.round(x)} m`);
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

export async function report(ctx, args) {
  const { commit, version, wasmSha, rowsFile, seed, gridStep, all } = ctx;
  const out = args.out;
  if (!out) throw new Error('--report needs --out <dir>');
  const byHash = new Map((fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []).filter((r) => r.wasmSha256 === wasmSha).map((r) => [r.caseHash, r]));
  const { createHash } = await import('node:crypto');
  const hashOf = (c) => createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0, 16);
  const rows = all.cases.map((c) => ({ c, r: byHash.get(hashOf(c)) ?? null }));
  const harnesses = [...new Set(rows.filter((x) => x.r).map((x) => x.r.harness))];
  const d5 = (r, t) => r?.[t]?.days?.['5'] ?? null;
  const item = ({ c, r }) => ({
    id: c.id, kind: c.kind, name: c.name ?? null, regime: regimeOf(c), am: c.am, elements: r?.elements ?? { n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, hpKm: c.hpKm, haKm: c.haKm, cutoff: c.cutoff },
    truth: r?.truth ?? null, flown: !!r, error: r?.error ?? null,
    ap: r?.ap ? { pcf: r.ap.pcf, fitRmsM: r.ap.fitRmsM ?? null, days: r.ap.days ?? null, error: r.ap.error ?? null } : null,
    xp: r?.xp ? { pcf: r.xp.pcf, fitRmsM: r.xp.fitRmsM ?? null, days: r.xp.days ?? null, error: r.xp.error ?? null } : null,
    pass: d5(r, 'ap') == null ? null : d5(r, 'ap') < PASS_M,
    apOverXp: d5(r, 'ap') != null && d5(r, 'xp') ? Math.round((d5(r, 'ap') / d5(r, 'xp')) * 1000) / 1000 : null,
    costUsPerState: r?.costUsPerState ?? null,
    xpCostOverAp: r?.costUsPerState?.ap ? Math.round((r.costUsPerState.xp / r.costUsPerState.ap) * 100) / 100 : null,
  });
  const items = rows.map(item);
  const scored = items.filter((x) => x.ap?.days?.['5'] != null);
  // counts by regime
  const regimes = [...new Set(items.map((x) => x.regime))];
  const counts = Object.fromEntries(regimes.map((g) => {
    const xs = items.filter((x) => x.regime === g), s = xs.filter((x) => x.ap?.days?.['5'] != null);
    return [g, { cases: xs.length, flown: xs.filter((x) => x.flown).length, scored: s.length, truthNotFlown: xs.filter((x) => x.flown && !x.ap).length, apFailed: xs.filter((x) => x.ap?.error).length, pass: s.filter((x) => x.pass).length,
      apCloserThanXp: s.filter((x) => x.apOverXp != null && x.apOverXp < 1).length, withXp: s.filter((x) => x.apOverXp != null).length, medianApDay5M: median(s.map((x) => x.ap.days['5'])), medianXpCostOverAp: median(xs.map((x) => x.xpCostOverAp)) }];
  }));
  // worst first: every scored orbit outside the line, by AP's day-5 distance
  const failing = scored.filter((x) => !x.pass).sort((a, b) => b.ap.days['5'] - a.ap.days['5']).map((x) => ({ id: x.id, kind: x.kind, name: x.name, regime: x.regime, hpKm: x.elements.hpKm, e: x.elements.e, i: x.elements.i, am: x.am, apDay5M: x.ap.days['5'], xpDay5M: x.xp?.days?.['5'] ?? null, apFitRmsM: x.ap.fitRmsM, truth: x.truth?.setting }));
  const wall = rows.filter((x) => x.r).map((x) => x.r.wallS);
  const doc = {
    schema: 'sdn-ap-synthetic/1', measured: new Date().toISOString().slice(0, 10),
    module: { version, modulesCommit: commit, wasmSha256: wasmSha }, harness: { repo: 'orbit-accuracy-experiments', commits: harnesses, command: `node experiments/synthetic-orbits/run.mjs --modules-commit ${commit} --seed ${seed} --grid-step ${gridStep}` },
    seed, gridStep, statistic: STATISTIC, truthSettings: TRUTH, areaToMass: Object.fromEntries(Object.entries(AM).map(([k, v]) => [k, { areaOverMassM2Kg: v, dragTerm: 2.2 * v, radiationTerm: 1.2 * v }])),
    grid: GRID, inclinationBands: BANDS,
    cost: { orbitsFlown: wall.length, wallSecondsSum: Math.round(wall.reduce((s, x) => s + x, 0)), medianWallS: median(wall) },
    counts, failing, cases: items, notCovered: notCoveredOf(all, items),
  };
  fs.mkdirSync(out, { recursive: true });
  const base = path.join(out, `synthetic-${version}-seed${seed}`);
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(doc, null, 1)}\n`);
  fs.writeFileSync(`${base}.md`, page(doc, items));
  console.error(`report: ${base}.json and .md; ${scored.length} scored of ${items.length}; ${failing.length} outside the line`);
  process.exit(0);
}

function notCoveredOf(all, items) {
  const left = all.notCovered.map((x) => (x.edge ? `${x.edge}: ${x.why}` : `grid cell perigee ${x.hpKm} km, e ${x.e}, i ${x.i}: ${x.why}`));
  const truth = items.filter((x) => x.flown && !x.ap).map((x) => `${x.id}: the truth could not be flown past the fit arc and a day${x.truth?.decayedAtH != null ? ` (decay at ${x.truth.decayedAtH} h)` : ''}${x.truth?.error ? ` (${x.truth.error})` : ''}`);
  const notFlown = items.filter((x) => !x.flown).map((x) => `${x.id}: not flown in this run`);
  return [
    'One cutoff and one draw of the other angles per grid cell: the Sun\'s and Moon\'s geometry is sampled across the grid, not swept within a cell.',
    'The grid is a typical satellite (A/m 0.01 m2/kg); the dense sphere and light debris fly only on the area-to-mass subset (72 orbits) and the named edge cases.',
    'The truth has no ocean tides, Earth radiation pressure, attitude or maneuvers; the fit arc is 72 h only (no 24 h fits); the weather is the as-issued weather of the cutoff on both sides, so the weather forecast\'s own error is not in these figures.',
    'Apogees beyond the Moon\'s distance (384,400 km) are not flown.',
    ...left, ...truth, ...notFlown,
  ];
}

function page(doc, items) {
  const L = [];
  L.push(`# Synthetic orbits: sdn-ap ${doc.module.version} against the numerical propagator`, '');
  L.push(`Modules ${doc.module.modulesCommit.slice(0, 12)} (wasm ${doc.module.wasmSha256.slice(0, 12)}), seed ${doc.seed}, grid step ${doc.gridStep}; ${doc.cost.orbitsFlown} orbits flown, ${Math.round(doc.cost.wallSecondsSum / 3600 * 10) / 10} worker-hours.`, '');
  L.push(doc.statistic, '');
  L.push('## Counts by regime', '', '| Regime | Cases | Scored | Within 100 m at day 5 | AP closer than SGP4-XP at day 5 | Median AP day 5 | Median SGP4-XP cost over AP\'s | Truth not flown | AP fit failed |', '|---|---|---|---|---|---|---|---|---|');
  for (const [g, c] of Object.entries(doc.counts)) L.push(`| ${g} | ${c.cases} | ${c.scored} | ${c.pass} | ${c.apCloserThanXp} of ${c.withXp} | ${fmt(c.medianApDay5M)} | ${c.medianXpCostOverAp ?? '-'} | ${c.truthNotFlown} | ${c.apFailed} |`);
  L.push('');
  const grid = items.filter((x) => x.kind === 'grid' && x.ap?.days?.['5'] != null);
  for (const [b, [lo, hi]] of doc.inclinationBands.entries()) {
    const inBand = grid.filter((x) => bandOf(x.elements.i) === b);
    if (!inBand.length) continue;
    const incs = [...new Set(inBand.map((x) => x.elements.i))].sort((a, b2) => a - b2).join(', ');
    for (const [title, cell] of [['AP\'s day-5 distance to the truth, the worst over the band\'s inclinations (orbits within 100 m / orbits)', (xs) => `${fmt(Math.max(...xs.map((x) => x.ap.days['5'])))} (${xs.filter((x) => x.pass).length}/${xs.length})`],
      ['SGP4-XP\'s cost per state over AP\'s, the median over the band\'s inclinations (above 1: AP is faster)', (xs) => { const v = median(xs.map((x) => x.xpCostOverAp)); return v == null ? '-' : String(v); }]]) {
      L.push(`## Inclination ${lo} to ${Math.round(hi)} deg (${incs}): ${title}`, '', `| Perigee \\ e | ${doc.grid.eccentricity.join(' | ')} |`, `|---|${doc.grid.eccentricity.map(() => '---').join('|')}|`);
      for (const hp of doc.grid.perigeeKm) L.push(`| ${hp.toLocaleString('en-US')} km | ${doc.grid.eccentricity.map((e) => { const xs = inBand.filter((x) => x.elements.hpKm === hp && x.elements.e === e); return xs.length ? cell(xs) : ' '; }).join(' | ')} |`);
      L.push('');
    }
  }
  L.push('## Outside the line, worst first', '', '| Orbit | Regime | Perigee | e | i | A/m | AP day 5 | SGP4-XP day 5 | AP fit RMS |', '|---|---|---|---|---|---|---|---|---|');
  for (const f of doc.failing.slice(0, 60)) L.push(`| ${f.name ?? f.id} | ${f.regime} | ${f.hpKm.toLocaleString('en-US')} km | ${f.e} | ${f.i} | ${f.am} | ${fmt(f.apDay5M)} | ${fmt(f.xpDay5M)} | ${fmt(f.apFitRmsM)} |`);
  if (doc.failing.length > 60) L.push('', `${doc.failing.length - 60} more in the result file.`);
  L.push('', '## The named edge cases', '', '| Case | AP day 1 / 3 / 5 / 7 | SGP4-XP day 5 | Within 100 m | SGP4-XP cost over AP\'s |', '|---|---|---|---|---|');
  for (const x of items.filter((y) => y.kind === 'edge')) L.push(`| ${x.name} | ${x.ap?.days ? ['1', '3', '5', '7'].map((d) => fmt(x.ap.days[d])).join(' / ') : x.ap?.error ?? x.error ?? (x.truth?.error ? 'truth not flown' : 'not flown')} | ${fmt(x.xp?.days?.['5'])} | ${x.pass == null ? '-' : x.pass ? 'yes' : 'no'} | ${x.xpCostOverAp ?? '-'} |`);
  L.push('', '## Not covered', '', ...doc.notCovered.map((x) => `- ${x}`), '');
  return L.join('\n');
}
