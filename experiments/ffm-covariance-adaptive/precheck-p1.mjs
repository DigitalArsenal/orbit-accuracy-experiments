// P1 (PLAN.md section 5): names, spans, arcs, Last-Modified, the 260926 reissue, and the yield. Cal/val products are read (index and states through the truth gate). Fresh-span products are
// listed by name, size and recorded Last-Modified only, never opened; the 260926 reissue is one HEAD request per sphere. Yield: at least 3 leads under the arc-disjoint rule in at least 80 % of
// cal/val windows. ESA's arc structure: the position jump at the epoch two consecutive daily files share. Records and statistics only.
//   node experiments/ffm-covariance-adaptive/precheck-p1.mjs
import fs from 'node:fs';
import path from 'node:path';
import { config, args, registered, Opened, writeReceipt, grid, DAY, HOUR } from './common.mjs';
import { arcsOf, windowOf, familyOf, arcLines } from './lib/chain.mjs';

registered();
const opened = new Opened();
const A = '/opt/data/sdn-archive';
const C = config.sets, ALLOWED = Date.parse('2026-06-15T00:00:00Z');
const cutoffsOf = (norad, set) => { const s = C[set]; const all = grid(s.from, s.to, s.everyDays); if (familyOf(norad) !== 'ilrsa') return all; const first = Date.parse(`${s.from}T00:00:00Z`), last = Date.parse(`${s.to}T00:00:00Z`), out = []; for (let t = first; t <= last; t += DAY) if (new Date(t).getUTCDay() === 0) out.push(t); return out; };
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const quantiles = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? { min: s[0], median: s[Math.floor(s.length / 2)], max: s.at(-1), n: s.length } : null; };

// ---- cal/val objects: arcs and the windows under the arc-disjoint rule
const perObject = {}, perClass = {};
for (const [cls, list] of Object.entries(config.population.calVal)) {
  perClass[cls] = { windows: 0, excluded: {}, leadCounts: {}, leadsAvailable: Object.fromEntries(config.leads_h.map((L) => [L, 0])), atLeast3: 0, nextAllowedGapH: [] };
  for (const norad of list) {
    const arcs = arcsOf(norad, { fromMs: Date.parse('2025-09-15T00:00:00Z'), toMs: Date.parse('2026-06-15T00:00:00Z'), allowedToMs: ALLOWED, opened });
    const lengths = arcs.map((a) => (a.stop - a.start) / HOUR), stepsH = arcs.slice(1).map((a, i) => (a.stop - arcs[i].stop) / HOUR);
    const r = { family: familyOf(norad), arcs: arcs.length, arcHours: quantiles(lengths), stopStepHours: quantiles(stepsH), sigmaM: quantiles(arcs.map((a) => a.sigma).filter((x) => x !== null)), windows: 0, excluded: {}, atLeast3: 0, unique: 0 };
    const seen = new Set();
    for (const set of ['calibration', 'validation']) for (const E of cutoffsOf(norad, set)) {
      const w = windowOf(norad, arcs, E);
      if (w.excluded) { const why = w.excluded.replace(/\d+\/\d+/, 'n/145'); r.excluded[why] = (r.excluded[why] ?? 0) + 1; perClass[cls].excluded[why] = (perClass[cls].excluded[why] ?? 0) + 1; continue; }
      if (seen.has(w.tIn)) { r.duplicateTIn = (r.duplicateTIn ?? 0) + 1; continue; }
      seen.add(w.tIn);
      r.windows += 1; perClass[cls].windows += 1;
      const n = w.leads.filter((l) => l.line).length;
      perClass[cls].leadCounts[n] = (perClass[cls].leadCounts[n] ?? 0) + 1;
      for (const l of w.leads) if (l.line) perClass[cls].leadsAvailable[l.L] += 1;
      if (n >= config.p1Yield.minLeads) { r.atLeast3 += 1; perClass[cls].atLeast3 += 1; }
      if (w.firstAllowed !== null) perClass[cls].nextAllowedGapH.push((w.firstAllowed - w.tInMs) / HOUR);
    }
    r.yield = r.windows ? r.atLeast3 / r.windows : null;
    perObject[norad] = r;
  }
  perClass[cls].nextAllowedGapH = quantiles(perClass[cls].nextAllowedGapH);
  perClass[cls].yield = perClass[cls].windows ? perClass[cls].atLeast3 / perClass[cls].windows : null;
}

// ---- ESA's arc structure: the jump at the epoch two consecutive daily files share, calibration and validation
const jumps = {};
for (const norad of [...config.population.judged.glonass.c2, ...config.population.judged.galileo.new]) {
  const arcs = arcsOf(norad, { fromMs: Date.parse('2025-10-01T00:00:00Z'), toMs: Date.parse('2026-05-31T00:00:00Z'), allowedToMs: ALLOWED, opened });
  const v = [], dow = Array.from({ length: 7 }, () => []);
  for (let i = 1; i < arcs.length; i += 1) {
    if (arcs[i].start !== arcs[i - 1].stop) continue;
    const a = arcLines(arcs[i - 1]).at(-1), b = arcLines(arcs[i])[0];
    if (a.epoch !== b.epoch) continue;
    const j = Math.hypot(...a.r.map((x, k) => (x - b.r[k]) * 1000));
    v.push(j); dow[new Date(arcs[i].start + 3600e3).getUTCDay()].push(j);
  }
  jumps[norad] = { ...quantiles(v), belowOneMillimeter: v.filter((x) => x < 1e-3).length, medianByDayOfWeek: dow.map((x) => median(x)) };
}
const allJumps = Object.values(jumps);

// ---- fresh-span inventory: names, sizes, recorded Last-Modified; nothing opened
const fresh = { ilrsa: [], nsgfCddis: [], esa: [], ilrsaCache: [], edcExtension: { products: 0 } };
const statOf = (f) => { const s = fs.statSync(f); return { bytes: s.size, mtime: s.mtime.toISOString().slice(0, 10) }; };
const RS = path.join(A, 'reference-states/products');
for (const n of fs.readdirSync(RS)) {
  const m = /^ilrsa\.orb\.([a-z0-9]+)\.(\d{6})\./.exec(n);
  if (m && m[2] >= '260905') fresh.ilrsa.push({ name: n, source: 'reference-states/products', ...statOf(path.join(RS, n)) });
  const e = /^ESA0OPSFIN_2026(\d{3})/.exec(n);
  if (e && Number(e[1]) >= 267) fresh.esa.push({ name: n, source: 'reference-states/products', ...statOf(path.join(RS, n)) });
}
const CACHE = path.join(A, 'v1c5/truth/download-cache/products');
if (fs.existsSync(CACHE)) for (const n of fs.readdirSync(CACHE)) {
  if (/^ilrsa\.orb/.test(n)) fresh.ilrsaCache.push({ name: n, source: 'v1c5 cache', ...statOf(path.join(CACHE, n)) });
  if (/^ESA0OPSFIN/.test(n)) fresh.esa.push({ name: n, source: 'v1c5 cache', ...statOf(path.join(CACHE, n)) });
}
const CD = path.join(A, 'hac/ilrs-cddis/cddis/slr/products/orbits');
const lastModified = [];
for (const kind of ['TRF', 'rapid']) { const base = path.join(CD, kind); if (!fs.existsSync(base)) continue; for (const sat of fs.readdirSync(base)) { const y = path.join(base, sat, '2026'); if (!fs.existsSync(y)) continue; for (const d of fs.readdirSync(y)) { const dir = path.join(y, d); if (!fs.statSync(dir).isDirectory()) continue; for (const f of fs.readdirSync(dir)) { if (!f.endsWith('.provenance.json')) continue; const p = JSON.parse(opened.read(path.join(dir, f), 'CDDIS provenance')); const name = f.replace('.provenance.json', ''); lastModified.push({ name, kind, bytes: p.bytes, lastModified: p.lastModified ?? null, retrieved: p.retrieved_utc }); } } } }
const lagDays = lastModified.filter((x) => /^ilrsa/.test(x.name) && x.lastModified).map((x) => { const d = /\.(\d{6})\./.exec(x.name)[1], end = Date.UTC(2000 + Number(d.slice(0, 2)), Number(d.slice(2, 4)) - 1, Number(d.slice(4, 6)), 23, 58); return (Date.parse(x.lastModified) - end) / DAY; });
const extension = fs.readdirSync(`${A}/ffm-covariance-calibration/hac/ilrs-edc/nsgf-rapid`).length;

// ---- the 260926 reissue: HEAD only
const reissue = [];
if (!args.offline) for (const sat of ['lageos1', 'lageos2', 'etalon1', 'etalon2']) {
  const url = `https://edc.dgfi.tum.de/pub/slr/products/orbits/TRF/${sat}/2026/260926/ilrsa.orb.${sat}.260926.v80.sp3.gz`;
  try { const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(60e3), headers: { 'user-agent': 'orbit-accuracy-experiments (research)' } }); reissue.push({ sat, status: r.status, bytes: Number(r.headers.get('content-length')), lastModified: r.headers.get('last-modified') }); } catch (error) { reissue.push({ sat, error: String(error.message).slice(0, 120) }); }
  await new Promise((res) => { setTimeout(res, 5000); });
}

const yieldR2 = perClass.R2?.yield ?? 0;
const receipt = {
  plan: 'section 5 P1', perClass, perObject,
  esaArcs: { rule: 'position jump at the epoch two consecutive daily ESA0OPSFIN files share (m), cal/val days', satellites: allJumps.length, medianOfMedians: median(allJumps.map((x) => x.median)), smallestMedian: Math.min(...allJumps.map((x) => x.median)), largestMax: Math.max(...allJumps.map((x) => x.max)), boundaries: allJumps.reduce((s, x) => s + x.n, 0), belowOneMillimeter: allJumps.reduce((s, x) => s + x.belowOneMillimeter, 0), perSatellite: jumps },
  fresh: { ilrsa: fresh.ilrsa, ilrsaCache: fresh.ilrsaCache, esaFiles: fresh.esa.length, esaRange: [fresh.esa.map((x) => x.name).sort()[0], fresh.esa.map((x) => x.name).sort().at(-1)], cddisProvenance: lastModified, ilrsaLastModifiedLagDays: quantiles(lagDays), extensionProductsPerSphereDirs: extension },
  stub260926: { onDisk: fresh.ilrsa.filter((x) => x.name.includes('.260926.')), reissue },
  yield: { rule: config.p1Yield, R3: perClass.R3?.yield, R2: yieldR2, r2Outcome: yieldR2 >= config.p1Yield.minWindows ? 'R2 reported as registered' : 'R2 is a consistency check' },
};
console.log(writeReceipt('precheck-P1', receipt, opened));
console.log(JSON.stringify({ perClass, esa: { ...receipt.esaArcs, perSatellite: undefined }, stub: receipt.stub260926, lag: receipt.fresh.ilrsaLastModifiedLagDays, yield: receipt.yield }));
process.exit(0);
