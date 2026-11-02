// COMPARE.md: joins SGP4's rows to Part L's stored arms by pair on low orbits, adds the cost run and each build's version and hash, and writes results/ap-truth/compare/. Statistics only.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/compare-table.mjs --out results/ap-truth/compare
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SEED, binOf, rand, pct, asc, round, compare } from './lib/compare.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
const MODULES = process.env.SDN_MODULES_ROOT;
if (!OUT || !MODULES) throw new Error('--out and SDN_MODULES_ROOT');
const ROOT = '/opt/data/sdn-archive/operator-theory', AP = path.join(ROOT, 'ap'), NEW = path.join(AP, 'b040');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const key = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
const low = (r) => r.source.endsWith('-leo');

const rows = rowsIn(path.join(NEW, 'laser', 'forward')).filter(low);
const stores = [new Map(rows.map((r) => [key(r), r])), ...[path.join(AP, 'laser', 'forward'), path.join(ROOT, 'cheaper', 'forward'), path.join(NEW, 'laser-sgp4')].map((d) => new Map(rowsIn(d).filter(low).map((r) => [key(r), r])))];
const km = (r, arm) => { for (const s of stores) { const v = s.get(key(r))?.arms[arm]?.km; if (Number.isFinite(v)) return v; } return undefined; };

const ARMS = { SGP4: 'S@48', XP: 'A-XP@48', AP: 'A-APn@48', FFM20: 'F-M20@48', FFM40: 'F-M40@48' };
const CONTRASTS = ['SGP4', 'XP', 'FFM20', 'FFM40'];
const random = rand(SEED);
const leads = {};
for (const lead of [24, 72, 120, 168]) {
  const cell = rows.filter((r) => binOf(r.leadHours) === lead).map((r) => ({ ...r, day: r.olderStart.slice(0, 10) }));
  const arms = {}, less = {};
  for (const [name, arm] of Object.entries(ARMS)) {
    const v = cell.map((r) => km(r, arm)).filter(Number.isFinite).sort(asc);
    arms[name] = { n: v.length, failed: cell.length - v.length, median: pct(v, 0.5), p95: pct(v, 0.95) };
  }
  for (const other of CONTRASTS) {
    const pairs = cell.filter((r) => Number.isFinite(km(r, ARMS.AP)) && Number.isFinite(km(r, ARMS[other]))).map((r) => ({ d: km(r, ARMS.AP) - km(r, ARMS[other]), object: r.norad, day: r.day }));
    const c = compare(pairs, random);
    less[other] = { median: c.median, interval: c.interval };
  }
  leads[lead] = { pairs: cell.length, arms, apLess: less };
}
const sgp24 = Object.fromEntries(Object.keys(leads).map((lead) => {
  const v = rows.filter((r) => binOf(r.leadHours) === Number(lead)).map((r) => km(r, 'S@24')).filter(Number.isFinite).sort(asc);
  return [lead, { n: v.length, median: pct(v, 0.5), p95: pct(v, 0.95) }];
}));

const costRows = jsonl(path.join(NEW, 'compare-costs', 'rows.jsonl'));
const counted = costRows.filter((r) => !r.warmUp && Object.keys(ARMS).every((a) => Number.isFinite(r.arms[a]?.fitSeconds)));
const costs = { files: counted.length, leftOut: costRows.filter((r) => !r.warmUp).length - counted.length, flightDays: round(pct(counted.map((r) => r.flightDays).sort(asc), 0.5), 3), flightStates: pct(counted.map((r) => r.flightStates).sort(asc), 0.5), fitStates: pct(counted.map((r) => r.fitStates).sort(asc), 0.5), arms: {} };
for (const a of Object.keys(ARMS)) {
  costs.arms[a] = { fitSeconds: pct(counted.map((r) => r.arms[a].fitSeconds).sort(asc), 0.5), flightSeconds: pct(counted.map((r) => r.arms[a].flightSeconds).sort(asc), 0.5) };
}

const REPOSITORY = 'https://github.com/DigitalArsenal/space-data-network-modules';
const build = (role, rel, commit, sha256) => {
  const bytes = execFileSync('git', ['-C', MODULES, 'show', `${commit}:${rel}/dist/isomorphic/module.wasm`], { maxBuffer: 256 * 1024 * 1024 });
  const found = crypto.createHash('sha256').update(bytes).digest('hex');
  if (found !== sha256) throw new Error(`${rel} at ${commit} is ${found}, registered ${sha256}`);
  const manifest = JSON.parse(execFileSync('git', ['-C', MODULES, 'show', `${commit}:${rel}/plugin-manifest.json`], { maxBuffer: 16 * 1024 * 1024 }).toString('utf8'));
  return { role, module: rel, version: manifest.version, commit, sha256, source: `${REPOSITORY}/tree/${commit}/${rel}` };
};
const XM = 'fbda894501f32210b77c74b53bcad036ce7a1b07', XM3 = '9a05d899b95242b358939ab1d68a776170a6b167';
const builds = {
  SGP4: [build('Flight', 'propagator/sgp4', XM, '2fe246b716c78a4b947cd95e70e126b7a738cbbb9775e5196f07b1fe551f4643'), build('Fit', 'analysis/gp-error-model', XM, '8e13eddbd5ccc3e0ee121f3b851e8314e426715cf5517823aa8d925566ef0e19')],
  XP: [build('Fit and flight, FORCES and FIT unset', 'propagator/sdn-ap', '783133149abb8949e30cac32398bb624369f3a8f', '0b021c575466642cd661cd39dcb911de89b63c8430ae9ac2d94c84c7539f8c6a')],
  AP: [build('Fit and flight', 'propagator/sdn-ap', '148f3b9f20b8c62d57dce677b1049464a71049df', '715ef2fee512e9c91aacf1c977151dbb1eb83c6b1fa0e1a160cba3304a876ec0')],
  FFM: [build('Flight', 'propagator/ffm', XM3, 'c36f1b14fc233e88725d57724c3bae7ad025cfdd9d8d4520c3bcccd0f8a816b2'), build('Fit', 'analysis/estimation', XM3, '7a555ca5b3ed0b021dd5b7986bd73dd8f8dc5125a2aa7943e3b3e983320d6bcd')],
  Frames: [build('Frames, every arm', 'foundation/frames', XM, '486acaa334705b97d3a975b8a3d90f4bfd2428af77c6b5086c970ed1f24e27a4')],
};

const table = { registered: 'experiments/operator-theory/COMPARE.md', reading: 'report only', pairs: rows.length, objects: new Set(rows.map((r) => r.norad)).size, startDays: new Set(rows.map((r) => r.olderStart.slice(0, 10))).size, firstStart: rows.map((r) => r.olderStart.slice(0, 10)).sort()[0], lastStart: rows.map((r) => r.olderStart.slice(0, 10)).sort().at(-1), leads, sgp4Fit24h: sgp24, costs, builds };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(table, null, 1)}\n`);

const fig = (x) => (x >= 10 ? round(x, 1) : x >= 1 ? round(x, 2) : round(x, 3));
const md = ['# AP beside SGP4, XP and FFM, low orbit, 48 h fits', '', `${rows.length} pairs, ${table.objects} objects, ${table.startDays} start days. Median km, 95th in brackets.`, '', '| Lead | SGP4 | XP | AP 0.4.0 | FFM 20x20 | FFM 40x40 |', '|---|---:|---:|---:|---:|---:|'];
for (const [lead, c] of Object.entries(leads)) md.push(`| ${lead} h | ${Object.keys(ARMS).map((a) => `${fig(c.arms[a].median)} (${fig(c.arms[a].p95)})`).join(' | ')} |`);
md.push(`| Fit, s | ${Object.keys(ARMS).map((a) => round(costs.arms[a].fitSeconds, 3)).join(' | ')} |`, `| Flight, s | ${Object.keys(ARMS).map((a) => round(costs.arms[a].flightSeconds, 3)).join(' | ')} |`, '', '## AP less each, by pair: median km, interval', '', '| Lead | SGP4 | XP | FFM 20x20 | FFM 40x40 |', '|---|---|---|---|---|');
for (const [lead, c] of Object.entries(leads)) md.push(`| ${lead} h | ${CONTRASTS.map((o) => `${c.apLess[o].median} ${c.apLess[o].interval ? `[${c.apLess[o].interval[0]}, ${c.apLess[o].interval[1]}]` : '(too few)'}`).join(' | ')} |`);
md.push('', '## SGP4 fitted to 24 h, for comparison', '', '| Lead | Median km | 95th km |', '|---|---:|---:|');
for (const [lead, c] of Object.entries(sgp24)) md.push(`| ${lead} h | ${fig(c.median)} | ${fig(c.p95)} |`);
fs.writeFileSync(path.join(OUT, 'table.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
