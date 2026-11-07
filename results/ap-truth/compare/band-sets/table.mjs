// The fitted sets behind cells.json's precise-orbit rows against sdn-ap 0.6.4's class rule (sdn-ap-site-module-0-6-4-20261106). Arithmetic on the logged sets only.
//   node results/ap-truth/compare/band-sets/table.mjs           writes table.json and README.md
//   node results/ap-truth/compare/band-sets/table.mjs --check   exit 1 unless both reproduce and no logged set is in the band
// A set flies differently on 0.6.4 only when wide_set (propagator/sdn-ap/src/tesseral.inc at modules cfd750eb8) changes its answer:
// wide_set(cls, e0) = e0 > (cls == 0 ? 0.05 : 0.3), against 0.6.3's e0 > 0.3, with cls = res::band_of(n0). So: class 0 and 0.05 < e <= 0.3.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const STORES = { 'rows-regimes.jsonl': 'regimes, regimes-hx, regimes-wa', 'rows-2026.jsonl': 'truth2', 'rows-2025.jsonl': 'truth' };
const REVDAY = (2 * Math.PI) / 1440;
/** res::band_of of a mean motion in rev/day; the limits are resonance.inc's, in rad/min. */
const bandOf = (revDay) => {
  const n = revDay * REVDAY;
  if (n > 0.0035003818 && n < 0.0052505727) return 1;
  if (n >= 0.0070007636 && n <= 0.0105011454) return 2;
  if (n > 0.0105011454 && n <= 0.015751718) return 3;
  if (n >= 0.0052505727 && n <= 0.007875859) return 4;
  return 0;
};
const wide063 = (cls, e) => e > 0.3;
const wide064 = (cls, e) => e > (cls === 0 ? 0.05 : 0.3);
const COVERAGE = {
  LS: 'every window, AP and whiteroom XP', DO: 'every window, AP and whiteroom XP', GD: 'every window, AP and whiteroom XP', GE: 'every window, AP and whiteroom XP',
  IG: 'every window, AP and whiteroom XP', HE: 'every window, AP and whiteroom XP', HX: 'every window, AP and whiteroom XP', WA: 'every window, AP and whiteroom XP',
};
const sampled = (name) => (/GRACE/.test(name) ? 'every window, AP alone' : 'every fifth window (cutoff day number divisible by 5), AP alone');

const rows = Object.keys(STORES).flatMap((file) => fs.readFileSync(path.join(HERE, file), 'utf8').split('\n').filter(Boolean).map((l) => ({ ...JSON.parse(l), file })));
const groups = new Map();
for (const r of rows) {
  const year = r.file === 'rows-2026.jsonl' ? '2026' : r.file === 'rows-2025.jsonl' ? '2025' : '';
  const id = `${r.group || 'P'}|${r.name}|${year}`;
  if (!groups.has(id)) groups.set(id, { group: r.group || 'P', name: r.name, norad: r.norad, year, windows: new Set(), sets: 0, arms: new Set(), classes: new Set(), nMin: Infinity, nMax: -Infinity, eMin: Infinity, eMax: -Infinity, inBand: 0 });
  const g = groups.get(id), cls = bandOf(r.n);
  g.windows.add(r.key); g.sets += 1; g.arms.add(r.arm); g.classes.add(cls);
  g.nMin = Math.min(g.nMin, r.n); g.nMax = Math.max(g.nMax, r.n); g.eMin = Math.min(g.eMin, r.e); g.eMax = Math.max(g.eMax, r.e);
  if (wide063(cls, r.e) !== wide064(cls, r.e)) g.inBand += 1;
}
const satellites = [...groups.values()].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name) || a.year.localeCompare(b.year)).map((g) => ({
  group: g.group, name: g.name, norad: g.norad, year: g.year || undefined, coverage: COVERAGE[g.group] ?? sampled(g.name), windows: g.windows.size, sets: g.sets, arms: [...g.arms].sort(),
  class: [...g.classes].sort(), nRevDay: [g.nMin, g.nMax], e: [g.eMin, g.eMax], inBand: g.inBand,
}));
const totals = { sets: rows.length, windows: new Set(rows.map((r) => r.key)).size, inBand: satellites.reduce((s, g) => s + g.inBand, 0), largestClass0EBelowBand: Math.max(...rows.filter((r) => bandOf(r.n) === 0 && r.e <= 0.05).map((r) => r.e)), smallestClass0EAboveBand: Math.min(...rows.filter((r) => bandOf(r.n) === 0 && r.e > 0.3).map((r) => r.e)) };
const doc = {
  what: 'The AP fits behind the precise-orbit rows of cells.json, each window fitted again and the set\'s MEAN_ELEMENTS read, against sdn-ap 0.6.4\'s class rule. No flight.',
  build: 'Fitted on propagator/sdn-ap 0.5.1 (modules ea824356, dist d29acd2b5d92), the build the cells were flown on, by each store\'s own runner (all-regimes.mjs, ap-truth.mjs) with the fit\'s result logged in place of its flight (the two .patch files). The THEMIS and Chandra rows flew on 0.6.3; their sets here are 0.5.1\'s fits, above 0.3 on both.',
  rule: 'propagator/sdn-ap/src/tesseral.inc at modules cfd750eb8: wide_set(cls, e0) = e0 > (cls == 0 ? 0.05 : 0.3), cls = res::band_of(n0). A set moves only where that answer differs from 0.6.3\'s e0 > 0.3: class 0 with 0.05 < e <= 0.3.',
  coverage: 'Read at every window, AP and whiteroom XP arms: LS, DO, GD, GE, IG, HE, HX, WA (the regimes, regimes-hx and regimes-wa stores); GRACE-FO (Research satellite 1 and 2) at every window, AP arm alone. Sampled, every fifth window, AP arm alone: Swarm, Sentinel-1 and the medium Earth orbit satellites. Whiteroom XP on the truth and truth2 stores is not read here. A window whose arc had too little coverage has no set, as in its store.',
  totals,
  satellites,
};
const f = (x, d) => x.toFixed(d), range = ([a, b], d) => (f(a, d) === f(b, d) ? f(a, d) : `${f(a, d)} to ${f(b, d)}`);
const readme = `# Fitted sets against sdn-ap 0.6.4's class rule

${doc.what}

Build: ${doc.build}

Rule: ${doc.rule}

Coverage: ${doc.coverage}

${totals.sets} sets from ${totals.windows} windows; ${totals.inBand} in the band. The largest class 0 eccentricity below the band is ${f(totals.largestClass0EBelowBand, 4)}, the smallest above it ${f(totals.smallestClass0EAboveBand, 4)}.

| Group | Satellite | Year | Coverage | Windows | Sets | Class | n (rev/day) | e | In band |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${satellites.map((s) => `| ${s.group} | ${s.name} | ${s.year ?? ''} | ${s.coverage} | ${s.windows} | ${s.sets} | ${s.class.join(', ')} | ${range(s.nRevDay, 4)} | ${range(s.e, 5)} | ${s.inBand} |`).join('\n')}

\`table.mjs --check\` reproduces this file and table.json from the rows-*.jsonl beside it.
`;
const json = `${JSON.stringify(doc, null, 1)}\n`;
if (process.argv.includes('--check')) {
  const faults = [];
  if (fs.readFileSync(path.join(HERE, 'table.json'), 'utf8') !== json) faults.push('table.json does not reproduce');
  if (fs.readFileSync(path.join(HERE, 'README.md'), 'utf8') !== readme) faults.push('README.md does not reproduce');
  if (totals.inBand !== 0) faults.push(`${totals.inBand} sets in the band`);
  console.log(faults.length ? `BAND SETS: FAIL\n${faults.join('\n')}` : `BAND SETS: PASS (${totals.sets} sets, ${totals.windows} windows, 0 in the band)`);
  process.exit(faults.length ? 1 : 0);
}
fs.writeFileSync(path.join(HERE, 'table.json'), json);
fs.writeFileSync(path.join(HERE, 'README.md'), readme);
console.log(totals);
