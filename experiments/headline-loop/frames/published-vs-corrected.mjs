// stack #386: AP's and the whiteroom XP's medians per precise-orbit cell on the published path (sdn-ap TEME turned to GCRF by
// foundation/frames) and on the corrected path (sdn-ap's own GCRF output), side by side, at the heights where the frame matters. Each pair is
// formed on the windows both paths scored (the count printed); the published cell (results/ap-truth/compare/cells.json) is beside them.
// Development windows, read before. Aggregates only.
//   node experiments/headline-loop/frames/published-vs-corrected.mjs [--store /opt/data/sdn-archive/headline-loop] [--windows all|first]
//        [--md out.md] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(HERE, '../../..');
const STORE = args.store ?? '/opt/data/sdn-archive/headline-loop', which = args.windows ?? 'all';
const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
const load = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean)) : [])
  .filter((r) => !r.error && r.arms?.AP?.days && (which === 'all' || !r.period));
const index = (rows) => new Map(rows.map((r) => [`${r.key}|${r.arcH}`, r]));
const AP = { teme: index(load(path.join(STORE, 'f0b8352a43f3'))), gcrf: index(load(path.join(STORE, 'f0b8352a43f3-gcrf'))) };
const XP = { teme: index(load(path.join(STORE, 'f0b8352a43f3-xp-teme'))), gcrf: index(load(path.join(STORE, 'f0b8352a43f3-xp-gcrf'))) };
const published = JSON.parse(fs.readFileSync(path.join(REPO, 'results/ap-truth/compare/cells.json'), 'utf8')).rows.filter((r) => r.reference === 'truth' && r.level === 'regime');
const GROUPS = { GN: 'Medium Earth orbit', GE: 'Geostationary', IG: 'Inclined geosynchronous', GD: 'Laser geodetic', HE: 'Highly elliptical', HX: 'Highly elliptical, THEMIS and Chandra' };
const DAY = { 24: '1', 48: '2', 72: '3', 168: '7' };
const med = (v) => { const s = [...v].sort((a, b) => a - b); if (!s.length) return null; const m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const pair = (paths, g, fit, lead) => {
  const day = DAY[lead], keys = [...paths.teme.keys()].filter((k) => { const r = paths.teme.get(k); return r.group === g && r.arcH === fit && Number.isFinite(r.arms.AP.days[day]?.e) && Number.isFinite(paths.gcrf.get(k)?.arms?.AP?.days?.[day]?.e); });
  return keys.length ? { n: keys.length, teme: med(keys.map((k) => paths.teme.get(k).arms.AP.days[day].e)), gcrf: med(keys.map((k) => paths.gcrf.get(k).arms.AP.days[day].e)) } : null;
};
const out = [];
for (const [g, label] of Object.entries(GROUPS)) for (const p of published.filter((x) => x.regime === label).sort((a, b) => a.fit - b.fit || a.lead - b.lead)) {
  out.push({ regime: label, fit: p.fit, lead: p.lead, published: { n: p.n, AP: p.arms.AP?.[0] ?? null, XP: p.arms.XP?.[0] ?? null }, AP: pair(AP, g, p.fit, p.lead), XP: pair(XP, g, p.fit, p.lead) });
}
const m = (x) => (x === null || x === undefined ? '-' : (x * 1000).toFixed(x * 1000 >= 100 ? 0 : 2));
const lines = [
  `# AP and the whiteroom XP on the published and the corrected frame path (stack #386), ${which} windows`, '',
  'Medians in m. Published path: sdn-ap TEME turned to GCRF by foundation/frames (the published cells, and the re-flight that reproduces them); corrected: sdn-ap\'s own GCRF output. Each re-flown pair on the windows both scored (n). The published cell beside them (its own windows). Development windows, read before.', '',
  '| Regime | fit h | lead h | published cell AP (n) | AP published path | AP corrected | AP change | published cell XP | XP published path | XP corrected | XP change | n |',
  '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
  ...out.map((c) => `| ${c.regime} | ${c.fit} | ${c.lead} | ${m(c.published.AP)} (${c.published.n}) | ${m(c.AP?.teme)} | ${m(c.AP?.gcrf)} | ${c.AP ? `${((c.AP.gcrf / c.AP.teme - 1) * 100).toFixed(1)} %` : '-'} | ${m(c.published.XP)} | ${m(c.XP?.teme)} | ${m(c.XP?.gcrf)} | ${c.XP ? `${((c.XP.gcrf / c.XP.teme - 1) * 100).toFixed(1)} %` : '-'} | ${c.AP?.n ?? '-'}${c.XP && c.XP.n !== c.AP?.n ? ` / ${c.XP.n}` : ''} |`),
];
if (args.json) fs.writeFileSync(args.json, JSON.stringify(out, null, 1));
if (args.md) fs.writeFileSync(args.md, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
