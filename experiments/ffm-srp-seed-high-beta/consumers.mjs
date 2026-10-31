// The consumer list's measured column, report only (coordinator's rulings, 2026-10-31): fitted over seed where stored rows already show it. No rule attaches to it.
// Read: C2's R1 and R2 calibration and validation rows and iss-fit*, XM2's and XM3's rows. A file's name is checked before it is opened; a row's date is read from the raw line before anything else, and a row after 2026-05-31
// is skipped; of the rest only the satellite's number, fit.parameters and fit.termination are used. Every file opened is in the integrity log. Not read, and marked so in the list: C3-small's rows and results, B2's rows, C2's R3 rows.
//   node experiments/ffm-srp-seed-high-beta/consumers.mjs     results/ffm-srp-seed-high-beta/consumers.json
import fs from 'node:fs';
import path from 'node:path';
import { config, results, root, registered, c3 } from './common.mjs';

const CUT = config.truth.allowedTo;
const C2 = '/opt/data/sdn-archive/ffm-covariance-calibration/rows', XM2 = '/opt/data/sdn-archive/ffm-atmosphere-vs-sgp4/rows', XM3 = '/opt/data/sdn-archive/ffm-atmosphere-xm3/rows';
const ALLOWED = [
  [C2, /^(R1|R2)\.(calibration|validation)(\.O)?\.s\d+\.jsonl$/], [C2, /^iss-fit(60)?\.s\d+\.jsonl$/],
  [XM2, /^O\.(A1|s\d+)\.jsonl$/], [XM3, /^O\.s\d+\.jsonl$/],
];
const opened = new c3.common.Opened();
const skipped = { afterCut: 0, noDate: 0 };

/** The rows of one allowed file, date first: [date, parse()] for rows at or before the cut. */
function* rowsOf(dir, name, dateKey) {
  if (!ALLOWED.some(([d, re]) => d === dir && re.test(name))) throw new Error(`${dir}/${name} is not on the list`);
  const text = fs.readFileSync(opened.add(path.join(dir, name), 'fit.parameters and fit.termination of rows dated to 2026-05-31')).toString();
  const re = new RegExp(`"${dateKey}":"(\\d{4}-\\d{2}-\\d{2})`);
  for (const line of text.split('\n')) {
    if (!line) continue;
    const m = re.exec(line);
    if (!m) { skipped.noDate += 1; continue; }
    if (m[1] > CUT) { skipped.afterCut += 1; continue; }
    yield line;
  }
}
const quantile = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p); return Number((s[i] + (p - i) * ((s[i + 1] ?? s[i]) - s[i])).toPrecision(4)); };
const spread = (a) => ({ median: quantile(a, 0.5), p5: quantile(a, 0.05), p95: quantile(a, 0.95) });

class Tally {
  constructor() { this.by = new Map(); }
  add(id, fit, seeds) {
    const e = this.by.get(id) ?? { terminations: {}, agom: [], b: [], agomAtZero: 0, bAtZero: 0 };
    this.by.set(id, e);
    const t = fit?.termination ?? 'none';
    e.terminations[t] = (e.terminations[t] ?? 0) + 1;
    if (t !== 'CONVERGED') return;
    for (const p of fit.parameters ?? []) {
      if (p.kind === 'SRP_AREA_OVER_MASS') { e.agom.push(p.value / seeds.agom); if (p.value === 0) e.agomAtZero += 1; }
      if (p.kind === 'DRAG_AREA_OVER_MASS') { e.b.push(p.value / seeds.b); if (p.value === 0) e.bAtZero += 1; }
    }
  }
  out(nameOf = (id) => String(id)) {
    return [...this.by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, e]) => ({ id, name: nameOf(id), fits: Object.values(e.terminations).reduce((s, x) => s + x, 0), terminations: e.terminations, agomOverSeed: spread(e.agom), bOverSeed: spread(e.b), agomAtZero: e.agomAtZero, bAtZero: e.bAtZero }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  registered();
  const seedsFile = opened.read(path.join(root, 'results/ffm-covariance-calibration/seeds-R1R2.json'), 'C2 seeds (published)');
  const seedTable = new Map(JSON.parse(seedsFile).objects.map((o) => [o.norad, { agom: o.agomSeed, b: o.bSeed, name: o.name }]));
  const nameOf = (id) => seedTable.get(Number(id))?.name ?? String(id);
  const out = {};
  // C2's R1 and R2: weather M and O apart
  for (const cls of ['R1', 'R2']) for (const [label, re] of [[cls, new RegExp(`^${cls}\\.(calibration|validation)\\.s\\d+\\.jsonl$`)], [`${cls}-O`, new RegExp(`^${cls}\\.(calibration|validation)\\.O\\.s\\d+\\.jsonl$`)]]) {
    const t = new Tally();
    for (const f of fs.readdirSync(C2).filter((n) => re.test(n)).sort()) for (const line of rowsOf(C2, f, 'E')) {
      const r = JSON.parse(line), s = seedTable.get(r.norad);
      if (!s) throw new Error(`no seed for ${r.norad}`);
      t.add(r.norad, r.fit, s);
    }
    out[label] = t.out(nameOf);
  }
  // ISS: A5's generic seeds at 100 %
  const issSeeds = JSON.parse(fs.readFileSync(path.join(root, 'experiments/sdn-ap-mixed-screening/config.json'))).a5.issFfm.seeds;
  for (const [label, re] of [['ISS, iss-fit', /^iss-fit\.s\d+\.jsonl$/], ['ISS, iss-fit60', /^iss-fit60\.s\d+\.jsonl$/]]) {
    const t = new Tally();
    for (const f of fs.readdirSync(C2).filter((n) => re.test(n)).sort()) for (const line of rowsOf(C2, f, 'E')) { const r = JSON.parse(line); if (r.fit) t.add('ISS', r.fit, { agom: issSeeds.SRP_AREA_OVER_MASS, b: issSeeds.DRAG_AREA_OVER_MASS }); }
    out[label] = t.out();
  }
  // XM2 and XM3: F2 and F3, one row per key, an amendment's row over the first
  for (const [label, dir] of [['XM2', XM2], ['XM3', XM3]]) {
    const latest = new Map(), keep = (r, a) => latest.set(`${r.key}|${a}`, { norad: r.norad, fit: r.arms?.[a]?.fit ?? null });
    const files = fs.readdirSync(dir).filter((n) => ALLOWED.some(([d, re]) => d === dir && re.test(n))).sort((a, b) => (a === 'O.A1.jsonl') - (b === 'O.A1.jsonl') || (a < b ? -1 : 1));
    for (const f of files) for (const line of rowsOf(dir, f, 'cutoff')) { const r = JSON.parse(line); for (const a of ['F2', 'F3']) if (r.arms?.[a]?.fit) keep(r, a); }
    for (const a of ['F2', 'F3']) {
      const t = new Tally();
      for (const [k, v] of latest) if (k.endsWith(`|${a}`)) t.add(v.norad, v.fit, seedTable.get(v.norad));
      out[`${label}-${a}`] = t.out(nameOf);
    }
  }
  fs.mkdirSync(results, { recursive: true });
  const body = { rule: 'report only; file names checked first; a row\'s date read first; rows after the cut skipped; only the satellite\'s number, fit.parameters and fit.termination used', cut: CUT, skipped, consumers: out, notRead: ['C3-small rows and results', 'B2 sdn-ap-mixed-screening/rows', 'C2 R3 rows'], opened: opened.summary('consumers') };
  fs.writeFileSync(path.join(results, 'consumers.json'), `${JSON.stringify(body, null, 1)}\n`);
  console.log(JSON.stringify({ skipped, opened: body.opened.files, keys: Object.keys(out) }));
}
