// The result file and the maps of a synthetic-orbit run (run.mjs --report): one JSON (schema sdn-ap-synthetic/2) and one Markdown page.
// The bar (stack #503, the owner 2026-11-11: "never more than 100m between 0-5 days"): D, the largest 3D distance between AP's forecast
// and the truth over 0 to 120 h on the 300 s grid; pass D <= 100 m. The page: the band table (pass, median D, worst D per band), the
// perigee by eccentricity grid, for each inclination band a map of perigee against eccentricity by AP's D and by SGP4-XP's D over AP's,
// the failing cases worst first, the named edge cases, and what the run does not cover.
import fs from 'node:fs';
import path from 'node:path';
import { GRID, BANDS, AM, bandOf, BAR_BANDS, barBandOf } from './cases.mjs';

const PASS_M = 100;
const MODE_TEXT = {
  full: 'All forces on both sides.',
  'no-drag': 'Without drag on both sides: the truth is the full setting without drag on every orbit, and AP fits without its atmosphere.',
  'no-drag-no-radiation': 'Gravity, the solid tide, relativity and the Sun and Moon only: the truth without drag or radiation pressure, AP without its atmosphere and with its radiation term held at 0.',
};
const STATISTIC = 'Each orbit is made up (cases.mjs, seeded). Its state at the fit arc\'s start (the cutoff less 72 h) is the module\'s, from the case\'s mean elements; the truth is the numerical propagator (FFM 2.2.0) flown from that state on a 300 s grid through the 72 h fit arc and 7 days past the cutoff. AP and our SGP4-XP (THEORY SGP4XP, the same module) are fitted to the truth\'s states over the 72 h before the cutoff and flown. D is the largest 3D distance between a forecast and the truth over 0 to 120 h after the cutoff on the truth\'s 300 s grid; pass: AP\'s D is at most 100 m. The daily figures (days) are the root mean square of the 3D distance over the 24 h ending at each day. Both sides see the same space weather: the weather known at the cutoff (GFZ observed, then the NOAA forecast issued before it) drives the truth\'s drag and AP\'s. SGP4-XP is flown as it is in every force mode.';
const TRUTH = {
  L70S: 'FFM 2.2.0: Earth gravity to degree and order 70, NRLMSISE-00 drag on the weather known at the cutoff, sphere radiation pressure with conical shadow, the Sun and Moon, solid Earth tides, general relativity; RK78 at 1e-10 with steps up to 120 s. For orbits with perigee under 2,500 km, all forces on.',
  Ffull: 'FFM 2.2.0: as L70S without drag.',
  'Ffull without radiation pressure': 'FFM 2.2.0: as L70S without drag or radiation pressure.',
};
const regimeOf = (c) => (c.e >= 0.3 ? 'highly elliptical (e 0.3 and above)' : c.n >= 6.4 ? 'low orbit (period under 225 min)' : c.n >= 1.2033 ? 'medium Earth orbit' : c.n >= 0.8022 ? 'geosynchronous (0.8 to 1.2 rev/day)' : 'beyond geosynchronous');
const fmt = (x) => (x == null ? '-' : x >= 10000 ? `${Math.round(x / 1000).toLocaleString('en-US')} km` : x >= 1000 ? `${(x / 1000).toFixed(1)} km` : `${Math.round(x)} m`);
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

export async function report(ctx, args) {
  const { commit, version, wasmSha, rowsFile, seed, gridStep, all, mode, guard } = ctx;
  const out = args.out;
  if (!out) throw new Error('--report needs --out <dir>');
  const byHash = new Map((fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []).filter((r) => r.wasmSha256 === wasmSha).map((r) => [r.caseHash, r]));
  const { createHash } = await import('node:crypto');
  const hashOf = (c) => createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0, 16);
  const rows = all.cases.map((c) => ({ c, r: byHash.get(hashOf(c)) ?? null }));
  const harnesses = [...new Set(rows.filter((x) => x.r).map((x) => x.r.harness))];
  const theory = (r, t) => (r?.[t] ? { pcf: r[t].pcf, fitRmsM: r[t].fitRmsM ?? null, maxDistance: r[t].maxDistance ?? null, days: r[t].days ?? null, error: r[t].error ?? null } : null);
  const items = rows.map(({ c, r }) => {
    const ap = theory(r, 'ap'), xp = theory(r, 'xp'), D = ap?.maxDistance?.maxM ?? null, X = xp?.maxDistance?.maxM ?? null;
    return { id: c.id, kind: c.kind, name: c.name ?? null, band: barBandOf(c), regime: regimeOf(c), am: c.am, elements: r?.elements ?? { n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, hpKm: c.hpKm, haKm: c.haKm, cutoff: c.cutoff },
      truth: r?.truth ?? null, flown: !!r, error: r?.error ?? null, ap, xp, D, xpD: X, pass: D == null ? null : D <= PASS_M, xpOverAp: D && X ? Math.round((X / D) * 100) / 100 : null, costUsPerState: r?.costUsPerState ?? null };
  });
  const scored = items.filter((x) => x.D != null);
  const bandRow = (xs) => { const s = xs.filter((x) => x.D != null); return { orbits: xs.length, scored: s.length, pass: s.filter((x) => x.pass).length, share: s.length ? Math.round((s.filter((x) => x.pass).length / s.length) * 1000) / 1000 : null, medianDM: median(s.map((x) => x.D)), worstDM: s.length ? Math.max(...s.map((x) => x.D)) : null, medianFirstOver100mH: median(s.map((x) => x.ap.maxDistance.firstOver100mH).filter((v) => v != null)), xpPass: s.filter((x) => x.xpD != null && x.xpD <= PASS_M).length, xpMedianDM: median(s.map((x) => x.xpD)) }; };
  const bands = Object.fromEntries(BAR_BANDS.map((b) => [b, bandRow(items.filter((x) => x.band === b))]));
  const failing = scored.filter((x) => !x.pass).sort((a, b) => b.D - a.D).map((x) => ({ id: x.id, kind: x.kind, name: x.name, band: x.band, hpKm: x.elements.hpKm, e: x.elements.e, i: x.elements.i, am: x.am, apDM: x.D, apAtH: x.ap.maxDistance.atH, apFirstOver100mH: x.ap.maxDistance.firstOver100mH, xpDM: x.xpD, apFitRmsM: x.ap.fitRmsM, truth: x.truth?.setting }));
  const wall = rows.filter((x) => x.r).map((x) => x.r.wallS);
  const doc = {
    schema: 'sdn-ap-synthetic/2', measured: new Date().toISOString().slice(0, 10), mode, modeText: MODE_TEXT[mode], guard,
    module: { version, modulesCommit: commit, wasmSha256: wasmSha }, harness: { repo: 'orbit-accuracy-experiments', commits: harnesses, command: `node experiments/synthetic-orbits/run.mjs --modules-commit ${commit} --seed ${seed} --grid-step ${gridStep}${guard ? ' --guard' : ''}${mode === 'no-drag' ? ' --no-drag' : mode === 'no-drag-no-radiation' ? ' --no-drag --no-radiation' : ''}` },
    seed, gridStep, statistic: STATISTIC, truthSettings: TRUTH, areaToMass: Object.fromEntries(Object.entries(AM).map(([k, v]) => [k, { areaOverMassM2Kg: v, dragTerm: 2.2 * v, radiationTerm: 1.2 * v }])),
    grid: GRID, inclinationBands: BANDS, cost: { orbitsFlown: wall.length, wallSecondsSum: Math.round(wall.reduce((s, x) => s + x, 0)), medianWallS: median(wall) },
    bands, failing, cases: items, notCovered: notCoveredOf(all, items),
  };
  fs.mkdirSync(out, { recursive: true });
  const base = path.join(out, `synthetic-${version}-seed${seed}-${mode}${guard ? '-guard' : ''}`);
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(doc, null, 1)}\n`);
  fs.writeFileSync(`${base}.md`, page(doc, items));
  console.error(`report: ${base}.json and .md; ${scored.length} scored of ${items.length}; ${failing.length} above 100 m`);
  for (const [b, x] of Object.entries(bands)) console.error(`  ${b}: ${x.pass}/${x.scored} pass, median D ${fmt(x.medianDM)}, worst ${fmt(x.worstDM)}`);
  process.exit(0);
}

function notCoveredOf(all, items) {
  const left = all.notCovered.map((x) => (x.edge ? `${x.edge}: ${x.why}` : `grid cell perigee ${x.hpKm} km, e ${x.e}, i ${x.i}: ${x.why}`));
  const truth = items.filter((x) => x.flown && !x.ap).map((x) => `${x.id}: the truth could not be flown past the fit arc and a day${x.truth?.decayedAtH != null ? ` (decay at ${x.truth.decayedAtH} h)` : ''}${x.truth?.error ? ` (${x.truth.error})` : ''}${x.error ? ` (${x.error})` : ''}`);
  const fits = items.filter((x) => x.ap?.error).map((x) => `${x.id}: AP's fit or flight failed (${x.ap.error})`);
  const notFlown = items.filter((x) => !x.flown).map((x) => `${x.id}: not flown in this run`);
  return [
    'One cutoff and one draw of the other angles per grid cell: the Sun\'s and Moon\'s geometry is sampled across the grid, not swept within a cell.',
    'The grid is a typical satellite (A/m 0.01 m2/kg); the dense sphere and light debris fly only on the area-to-mass subset (72 orbits) and the named edge cases.',
    'The truth has no ocean tides, Earth radiation pressure, attitude or maneuvers; the fit arc is 72 h only (no 24 h fits); the weather is the as-issued weather of the cutoff on both sides, so the weather forecast\'s own error is not in these figures.',
    'Apogees beyond the Moon\'s distance (384,400 km) are not flown.',
    ...left, ...truth, ...fits, ...notFlown,
  ];
}

function page(doc, items) {
  const L = [];
  L.push(`# Synthetic orbits: sdn-ap ${doc.module.version} against the numerical propagator, ${doc.mode}${doc.guard ? ' (guard set)' : ''}`, '');
  L.push(`Modules ${doc.module.modulesCommit.slice(0, 12)} (wasm ${doc.module.wasmSha256.slice(0, 12)}), seed ${doc.seed}, grid step ${doc.gridStep}; ${doc.cost.orbitsFlown} orbits flown, ${Math.round((doc.cost.wallSecondsSum / 3600) * 10) / 10} worker-hours. ${doc.modeText}`, '');
  L.push(doc.statistic, '');
  L.push('## The bar by band (D: the largest distance to the truth over 0 to 120 h; pass at 100 m)', '', '| Band | Orbits | Scored | AP pass | Median D | Worst D | Median first hour above 100 m | SGP4-XP pass | SGP4-XP median D |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [b, x] of Object.entries(doc.bands)) L.push(`| ${b} | ${x.orbits} | ${x.scored} | ${x.pass} (${x.share == null ? '-' : Math.round(x.share * 100)} %) | ${fmt(x.medianDM)} | ${fmt(x.worstDM)} | ${x.medianFirstOver100mH ?? '-'} | ${x.xpPass} | ${fmt(x.xpMedianDM)} |`);
  L.push('');
  const grid = items.filter((x) => x.kind === 'grid' && x.D != null);
  const table = (title, xs, cell) => {
    L.push(title, '', `| Perigee \\ e | ${doc.grid.eccentricity.join(' | ')} |`, `|---|${doc.grid.eccentricity.map(() => '---').join('|')}|`);
    for (const hp of doc.grid.perigeeKm) L.push(`| ${hp.toLocaleString('en-US')} km | ${doc.grid.eccentricity.map((e) => { const ys = xs.filter((x) => x.elements.hpKm === hp && x.elements.e === e); return ys.length ? cell(ys) : ' '; }).join(' | ')} |`);
    L.push('');
  };
  const worst = (ys) => `${fmt(Math.max(...ys.map((x) => x.D)))} (${ys.filter((x) => x.pass).length}/${ys.length})`;
  table('## Perigee by eccentricity, every inclination: AP\'s worst D (orbits within 100 m / orbits)', grid, worst);
  for (const [b, [lo, hi]] of doc.inclinationBands.entries()) {
    const inBand = grid.filter((x) => bandOf(x.elements.i) === b);
    if (!inBand.length) continue;
    const incs = [...new Set(inBand.map((x) => x.elements.i))].sort((p, q) => p - q).join(', ');
    table(`## Inclination ${lo} to ${Math.round(hi)} deg (${incs}): AP's worst D (within 100 m / orbits)`, inBand, worst);
    table(`## Inclination ${lo} to ${Math.round(hi)} deg: SGP4-XP's D over AP's, the median (above 1: AP is closer)`, inBand, (ys) => { const v = median(ys.map((x) => x.xpOverAp)); return v == null ? '-' : String(v); });
  }
  L.push('## Above 100 m, worst first', '', '| Orbit | Band | Perigee | e | i | A/m | AP D | At hour | First above 100 m | SGP4-XP D | AP fit RMS |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const f of doc.failing.slice(0, 60)) L.push(`| ${f.name ?? f.id} | ${f.band} | ${f.hpKm.toLocaleString('en-US')} km | ${f.e} | ${f.i} | ${f.am} | ${fmt(f.apDM)} | ${f.apAtH} | ${f.apFirstOver100mH ?? '-'} | ${fmt(f.xpDM)} | ${fmt(f.apFitRmsM)} |`);
  if (doc.failing.length > 60) L.push('', `${doc.failing.length - 60} more in the result file.`);
  L.push('', '## The named edge cases', '', '| Case | AP D | First above 100 m | AP day 1 / 3 / 5 / 7 | SGP4-XP D | Pass |', '|---|---|---|---|---|---|');
  for (const x of items.filter((y) => y.kind === 'edge')) L.push(`| ${x.name} | ${fmt(x.D)} | ${x.ap?.maxDistance?.firstOver100mH ?? '-'} | ${x.ap?.days ? ['1', '3', '5', '7'].map((d) => fmt(x.ap.days[d])).join(' / ') : x.ap?.error ?? x.error ?? (x.truth?.error ? 'truth not flown' : 'not flown')} | ${fmt(x.xpD)} | ${x.pass == null ? '-' : x.pass ? 'yes' : 'no'} |`);
  L.push('', '## Not covered', '', ...doc.notCovered.map((x) => `- ${x}`), '');
  return L.join('\n');
}
