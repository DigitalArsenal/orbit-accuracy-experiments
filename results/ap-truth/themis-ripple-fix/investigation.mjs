// Amendment 8: the fit-sensitivity table from the investigation's rows. node investigation.mjs [store]
import fs from 'node:fs';
import path from 'node:path';

const STORE = process.argv[2] ?? '/opt/data/sdn-archive/operator-theory/themis-ripple-fix/fit-investigation';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const rows = fs.readdirSync(STORE).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(STORE, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => r.ok);
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
function bootstrap(v) {
  let s = 20261106 >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const meds = [];
  for (let b = 0; b < 10000; b += 1) meds.push(median(v.map(() => v[Math.floor(rnd() * v.length)])));
  meds.sort((a, b) => a - b);
  return [meds[250], meds[9750]];
}
const base = new Map(rows.filter((r) => r.arm === 'base').map((r) => [r.key, r]));
const out = [];
for (const arm of [...new Set(rows.map((r) => r.arm))]) {
  const rs = rows.filter((r) => r.arm === arm && base.has(r.key));
  const paired = (k) => { const v = rs.map((r) => r.days[k].e / base.get(r.key).days[k].e); return { median: median(v), interval: bootstrap(v) }; };
  const d = (f) => median(rs.map((r) => Math.abs(f(r) - f(base.get(r.key)))));
  out.push({
    arm, windows: rs.length, roughM: median(rs.map((r) => r.rough)),
    day: Object.fromEntries([1, 3, 7].map((k) => [k, median(rs.map((r) => r.days[k].e))])),
    ratio: Object.fromEntries([1, 3, 7].map((k) => [k, paired(k)])),
    fitRmsKm: median(rs.map((r) => r.fit?.rmsKm)), iterations: median(rs.map((r) => r.fit?.iterations)), fitSeconds: median(rs.map((r) => r.fitSeconds)),
    dElements: { e: d((r) => r.elements.e), iDeg: d((r) => r.elements.i), nRevDay: d((r) => r.elements.n), argpDeg: d((r) => r.elements.argp), maDeg: d((r) => r.elements.ma), raanDeg: d((r) => r.elements.raan) },
    perWindow: rs.map((r) => ({ key: r.key, d3: r.days[3].e, base3: base.get(r.key).days[3].e, fitRmsKm: r.fit?.rmsKm, baseFitRmsKm: base.get(r.key).fit?.rmsKm, iterations: r.fit?.iterations })),
  });
}
fs.writeFileSync(path.join(HERE, 'investigation.json'), `${JSON.stringify(out, null, 1)}\n`);
for (const o of out) console.log(`${o.arm} n=${o.windows} rough ${o.roughM?.toFixed(3)} d1/3/7 ${[1, 3, 7].map((k) => o.day[k].toFixed(1)).join('/')} ratio d1/3/7 ${[1, 3, 7].map((k) => `${o.ratio[k].median.toFixed(3)} [${o.ratio[k].interval.map((x) => x.toFixed(3)).join(', ')}]`).join(' ')} fitRMS ${o.fitRmsKm?.toFixed(4)} km it ${o.iterations} fit ${o.fitSeconds?.toFixed(1)} s dE ${o.dElements.e?.toExponential(2)} dMA ${o.dElements.maDeg?.toExponential(2)}`);
