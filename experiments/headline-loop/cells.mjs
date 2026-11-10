// stack #316: a re-flight's cells in the published cells.json schema (results/ap-truth/compare/cells.json, compare-cells.mjs), the 72 precise-orbit
// regime cells, each on the windows this re-flight scored. Aggregates only.
//   node experiments/headline-loop/cells.mjs --rows <store>/<ap sha12> [--out results/headline-loop/<version>-<sha12>/cells.json]
//   node experiments/headline-loop/cells.mjs --check     made-up rows: arms tuples, burn counts, columns
// Columns: AP re-flown; FFMfull the qualified reference (goal.md: the registered full settings with the radiation model fitted for the satellite;
// refly.mjs FFMq); FFMconfigured the arm the round-0 referee flew (FFMc); FFM20 or FFM40 the reduced setting the published cells flew (FFMr), each
// re-flown; SGP4, XP (whiteroom) and XPU (Space Force) are not re-flown: their stored per-window rows (the published cells' stores) are read on the
// windows re-flown here. burnsInFit and burnsInForecast are recounted on those windows from results/operator-theory/maneuver-flags; the worked
// example is the published cell's.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OT = path.join(REPO, 'experiments/operator-theory');
const { pct, asc } = await import(path.join(OT, 'lib/compare.mjs'));
const { windowState } = await import(path.join(OT, 'lib/steps.mjs'));
const { HELD_ROW } = await import(path.join(OT, 'lib/pairs.mjs'));
const { SETTINGS } = await import('./lib/settings.mjs');
const LABELS = { T: 'Strong drag, 2025', P: 'Strong drag, 2026', S1: 'Near 700 km', GN: 'Medium Earth orbit', LS: 'Low orbit, laser spheres', DO: 'Low orbit, altimetry', GD: 'Laser geodetic', IG: 'Inclined geosynchronous', GE: 'Geostationary', HE: 'Highly elliptical', HX: 'Highly elliptical, THEMIS and Chandra' };
const GROUP_OF = Object.fromEntries(Object.entries(LABELS).map(([g, l]) => [l, g]));
export const COLUMNS = { SGP4: 'SGP4', XP: 'XP, whiteroom', XPU: 'XP, Space Force', AP: 'AP', FFMfull: 'FFM full, radiation model fitted', FFMconfigured: 'FFM as the round-0 referee configured it', FFM20: 'FFM 20×20 (published setting)', FFM40: 'FFM 40×40 (published setting)' };
const ARM_OF = { FFMfull: 'FFMq', FFMconfigured: 'FFMc' };
const round = (x) => (x === null || x === undefined ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));
const tuple = (v) => { const s = v.filter(Number.isFinite).sort(asc); return s.length ? [round(pct(s, 0.5)), round(pct(s, 0.95)), s.length] : null; };
const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;

/** One cell from re-flown rows (one group, one fit) and the stored per-window rows: arms, settings, burn counts. */
export function cellOf({ rows, fit, lead, stored, flags }) {
  const day = String(lead / 24);
  const list = rows.filter((r) => !r.error && r.arcH === fit && Number.isFinite(e(r, 'AP', day)));
  const arms = {}, settings = {};
  const add = (column, read) => { const t = tuple(list.map(read)); if (t) arms[column] = t; };
  add('SGP4', (r) => e(stored.cmp(r), `S${fit}`, day));
  add('XP', (r) => e(stored.cmp(r), `XP${fit}`, day));
  add('XPU', (r) => e(stored.ussf(r), `U${fit}`, day));
  add('AP', (r) => e(r, 'AP', day));
  for (const [column, arm] of Object.entries(ARM_OF)) { add(column, (r) => e(r, arm, day)); const a = list.find((r) => r.arms[arm]?.arm)?.arms[arm].arm; if (arms[column] && a) settings[column] = { arm: a, describe: SETTINGS[a]?.describe ?? null }; }
  const reduced = list.find((r) => r.arms.FFMr?.arm)?.arms.FFMr.arm, rcol = reduced === 'F20' ? 'FFM20' : 'FFM40';
  add(rcol, (r) => e(r, 'FFMr', day));
  if (arms[rcol]) settings[rcol] = { arm: reduced, describe: SETTINGS[reduced]?.describe ?? null };
  const fl = list.map((r) => flags.get(r.key));
  const burnsCounts = fl.length && fl.every(Boolean) ? (() => { const at = fl.map((w) => windowState(w, fit, lead)); return { burnsInFit: at.filter((x) => x.inFit).length, burnsInForecast: at.filter((x) => x.inForecast).length }; })() : { burnsInFit: null, burnsInForecast: null };
  return { n: list.length, ...burnsCounts, arms, settings, satellites: new Set(list.map((r) => r.name)).size };
}

if (args.check) {
  // end to end: cells.mjs on a made-up store, with Near 700 km rows on real window keys (so the stored SGP4 and XP rows and the maneuver
  // flags are read) and laser geodetic rows on made-up keys; assertions on cells.json and cells-first-pass.json
  const E = await import('./lib/e2e.mjs');
  const { check, done } = E.checker('CELLS');
  const flagKeys = JSON.parse(fs.readFileSync(path.join(REPO, 'results/operator-theory/maneuver-flags/flags.json'), 'utf8')).windows.filter((w) => w.group === 'S1' && !/2026-0[3-5]/.test(w.key)).slice(0, 8).map((w) => w.key);
  const s1 = E.cellRows({ group: 'S1', regime: 'Near 700 km', fit: 24, sats: flagKeys.length, blocks: 1, arm: 'L70S' }).map((r, i) => ({ ...r, key: flagKeys[i], name: flagKeys[i].split('|')[1], cutoff: `${flagKeys[i].split('|')[2]}T00:00:00.000Z` }));
  const gd = [...E.cellRows({ group: 'GD', regime: 'Laser geodetic' }), ...E.cellRows({ group: 'GD', regime: 'Laser geodetic', blocks: 1, start: '2026-03-03', period: '2026-03..05' })];
  const dir = E.tmp('cells'), out = path.join(dir, 'out'), A = E.writeStore(dir, { rows: [...s1, ...gd, { key: 'GD|X|2025-10-01', group: 'GD', arcH: 72, error: 'coverage', arms: {} }] });
  const r = E.run('cells.mjs', ['--rows', A, '--out', out]);
  check(r.code === 0, `cells.mjs exited ${r.code}: ${r.err.slice(-300)}`);
  const all = E.readJson(path.join(out, 'cells.json')), first = E.readJson(path.join(out, 'cells-first-pass.json'));
  const at = (doc, regime, fit, lead) => doc.rows.find((x) => x.regime === regime && x.fit === fit && x.lead === lead);
  const g = at(all, 'Laser geodetic', 72, 24), g1 = at(first, 'Laser geodetic', 72, 24), s = at(all, 'Near 700 km', 24, 24);
  check(all.rows.length === 72 && first.rows.length === 72, `rows ${all.rows.length}, ${first.rows.length} (the published 72)`);
  check(g?.n === 40 && g1?.n === 32 && g.satellites === 8, `laser geodetic n ${g?.n} (all), ${g1?.n} (first pass), ${g?.satellites} satellites`);
  const apMed = Number(g?.arms?.AP?.[0]), qMed = Number(g?.arms?.FFMfull?.[0]);
  check(g?.arms?.AP?.[2] === 40 && Math.abs(apMed / qMed - 1.5) < 0.05 && g.arms.FFM20?.[2] === 40 && g.settings?.FFMfull?.arm === 'Ffull', `laser geodetic arms ${JSON.stringify(g?.arms)}`);
  check(g?.burnsInFit === null && g.paired?.verdict === 'shown under 2' && Math.abs(g.paired.ratio[0] - 1.5) < 1e-3, `laser geodetic burns ${g?.burnsInFit}, paired ${JSON.stringify(g?.paired)}`);
  check(s && s.n === flagKeys.length && Number.isInteger(s.burnsInFit) && s.burnsInFit <= s.n && Array.isArray(s.arms.SGP4) && Array.isArray(s.arms.XP), `Near 700 km on real keys: n ${s?.n}, burns ${s?.burnsInFit}, SGP4 ${JSON.stringify(s?.arms?.SGP4)}, XP ${JSON.stringify(s?.arms?.XP)}`);
  check(/RMS over the 24 h ending at the lead/.test(all.fields) && /second pass/.test(all.provenance) && /First pass/.test(first.provenance), 'fields or provenance');
  fs.rmSync(dir, { recursive: true, force: true });
  done('cells.mjs run on a made-up store: the 72 published cells in both files; counts on all windows and on the first pass; AP 1.5 times FFMfull with the reduced column; paired verdict; a coverage error left out; on real window keys the stored SGP4 and XP and the burn flags are read, on made-up keys burns are null');
}

const dir = args.rows;
if (!dir) throw new Error('--rows <store>/<ap sha12>');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l && !HELD_ROW.test(l)).map((l) => JSON.parse(l));
const rowsIn = (d, re = /^rows(-\d+)?\.jsonl$/) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => re.test(f)).flatMap((f) => jsonl(path.join(d, f))) : []);
const mine = rowsIn(dir, /^rows-truth-.*\.jsonl$/);
const build = JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8'));
const ARCHIVE = '/opt/data/sdn-archive/operator-theory/ap';
const by = (...dirs) => new Map(dirs.flatMap((d) => rowsIn(path.join(ARCHIVE, d))).map((r) => [r.key, r]));
const cmpT = by('b0411/compare-truth'), cmpP = by('b0411/compare-truth2'), cmpR = by('b0411/regimes');
const uT = by('b051/ussf-truth'), uP = by('b051/ussf-truth2'), uR = by('b051/ussf-regimes', 'b051/ussf-regimes-hx');
const stored = {
  cmp: (r) => (r.group === 'T' ? cmpT : ['P', 'S1', 'GN'].includes(r.group) ? cmpP : cmpR).get(r.key),
  ussf: (r) => (r.group === 'T' ? uT : ['P', 'S1', 'GN'].includes(r.group) ? uP : uR).get(r.key),
};
const flags = new Map(JSON.parse(fs.readFileSync(path.join(REPO, 'results/operator-theory/maneuver-flags/flags.json'), 'utf8')).windows.map((w) => [w.key, w]));
const published = JSON.parse(fs.readFileSync(path.join(REPO, 'results/ap-truth/compare/cells.json'), 'utf8'));
const cells72 = published.rows.filter((r) => r.reference === 'truth' && r.level === 'regime');
const env = mine.find((r) => r.env)?.env ?? {};
const modulesCommit = (() => { try { return execFileSync('git', ['-C', path.resolve(REPO, '../../main-packages/space-data-network-modules'), 'rev-parse', 'HEAD']).toString().trim(); } catch { return null; } })();
const apKey = `${build.module}@${build.sha256.slice(0, 12)}`;
const ffmKeys = env.ffm ? [`analysis/estimation@${env.ffm.estimation.sha256.slice(0, 12)}`, `propagator/ffm@${env.ffm.ffm.sha256.slice(0, 12)}`] : [];
const builds = { [apKey]: { module: build.module, version: build.version, ...(modulesCommit ? { commit: modulesCommit } : {}), sha256: build.sha256 } };
if (env.ffm) { builds[ffmKeys[0]] = { module: 'analysis/estimation', version: env.ffm.estimation.version, sha256: env.ffm.estimation.sha256 }; builds[ffmKeys[1]] = { module: 'propagator/ffm', version: env.ffm.ffm.version, sha256: env.ffm.ffm.sha256 }; }
const { scoreCells, LEAD_DEFINITION } = await import('./lib/stats.mjs');
const PERIOD_NOTE = {
  all: 'All windows: the published cells\' own window sets, nothing after 2026-11-10; those touching 2026-03..05 were flown in a second pass (rows flagged period). The precise-orbit windows of March to May 2026 were read by the builds that made the published cells and are read again here; the catalog studies\' reservation of those months concerns public element sets, which this harness does not read.',
  first: 'First pass: the published cells\' own windows less those whose fit arc or 7-day forecast touches 2026-03-01 to 05-31.',
};
function cellsDoc(mine, which) {
const scored = scoreCells(mine, { ref: 'FFMq', draws: 1000 });
const out = [];
for (const p of cells72) {
  const g = GROUP_OF[p.regime];
  const c = cellOf({ rows: mine.filter((r) => r.group === g), fit: p.fit, lead: p.lead, stored, flags });
  const s = scored.find((x) => x.group === g && x.fit === p.fit && x.lead === p.lead);
  const tri = (est, iv) => (Number.isFinite(est) ? [round(est), ...(iv ? iv.map(round) : [null, null])] : null);
  c.paired = s ? { reference: 'FFMfull', windows: s.windowsScoredByBoth, ratio: tri(s.pairedMedianRatio, s.pairedRatioBlock), excessKm: tri(s.pairedMedianExcessKm, s.pairedExcessBlockKm), rankCorrelation: s.rankCorrelation === null ? null : Number(s.rankCorrelation.toFixed(3)), dM: s.D ? [round(s.D.medianM), round(s.D.p95M)] : null, satelliteBalancedRatio: tri(s.satelliteBalancedRatio, s.bootstrapRatio), verdict: s.verdict } : null;
  const build = {}, integrator = {};
  for (const column of Object.keys(c.arms)) {
    if (column === 'AP') build.AP = [apKey];
    else if (column.startsWith('FFM')) { build[column] = ffmKeys; integrator[column] = 'RK78'; }
    else { build[column] = p.build[column]; for (const k of p.build[column] ?? []) builds[k] ??= published.builds[k]; }
  }
  out.push({ reference: 'truth', level: 'regime', regime: p.regime, provider: 'All', satellite: 'All', fit: p.fit, lead: p.lead, n: c.n, satellites: c.satellites, burnsInFit: c.burnsInFit, burnsInForecast: c.burnsInForecast, input: 'precise-orbit', build, integrator, settings: c.settings, arms: c.arms, paired: c.paired, published: { n: p.n, AP: p.arms.AP ?? null, FFM: Object.entries(p.arms).find(([k]) => k.startsWith('FFM'))?.[1] ?? null }, ...(p.example ? { example: p.example } : {}) });
}
return {
  provenance: `Re-flown on ${build.module} ${build.version} (${build.sha256.slice(0, 12)}) on ${new Date().toISOString().slice(0, 10)} by the loop harness (experiments/headline-loop: refly.mjs, cells.mjs). Development windows, read before. ${PERIOD_NOTE[which]} Not registered.`,
  windows: which,
  registered: null,
  columns: COLUMNS,
  fields: `input: precise-orbit (a precise orbit product). build: column to the keys of builds, each module build by SHA-256. integrator: for each FFM column, the integrator its fits and flights ran (lib/ffm.mjs, RK78); settings: for each FFM column, the setting flown and its forces, tolerance and fitted parameters (experiments/headline-loop/lib/settings.mjs). arms: column to [median km, 95th percentile km, forecasts], each column over the windows it scored. lead: hours past the end of the fit at which the scored day ends; each figure is the ${LEAD_DEFINITION}. burnsInFit, burnsInForecast: of the n windows, those with a step of the truth's mean semimajor axis of 8 m or more in the fit arc, and in the forecast span to the lead (results/operator-theory/maneuver-flags); null where a window has no detector run. satellites: distinct satellites among the n windows. paired: AP against FFMfull on the windows both scored: the paired median ratio and the paired median excess (AP minus FFMfull, km), each [estimate, 2.5 %, 97.5 %] over time blocks of fit plus lead; the rank correlation of the two arms' errors; dM, the RMS over the lead day of the distance between the two forecasts [median, 95th percentile] in m; the satellite-balanced ratio with its two-way interval, and the verdict by both intervals (score.mjs). published: the published cell's n and its AP and FFM tuples. The SGP4, XP and XPU tuples are the published stores' per-window values on the windows re-flown here.`,
  builds,
  env: { packages: env.packages ?? null, xmHosts: env.xmHosts ?? null, xmHostsInstalled: env.xmHostsInstalled ?? null },
  rows: out,
};
}
// cells.json on all windows, cells-first-pass.json on the first pass alone; n and satellites per cell in both
const outDir = args.out ?? path.join(REPO, 'results/headline-loop', `${build.version}-${build.sha256.slice(0, 12)}`);
fs.mkdirSync(outDir, { recursive: true });
for (const [which, file, list] of [['all', 'cells.json', mine], ['first', 'cells-first-pass.json', mine.filter((r) => !r.period)]]) {
  const doc = cellsDoc(list, which);
  fs.writeFileSync(path.join(outDir, file), `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`cells (${which}): ${doc.rows.length} rows to ${path.join(outDir, file)}; ${doc.rows.filter((r) => r.n).length} with windows`);
}
