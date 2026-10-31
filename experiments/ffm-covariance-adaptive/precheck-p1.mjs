// P1 (PLAN.md section 5): names, spans, arcs, Last-Modified, the 260926 reissue, and the yield. Cal/val products are read (index and states through the truth gate). Fresh-span products are
// listed by name, size and recorded Last-Modified only, never opened; the 260926 reissue is one HEAD request per sphere. Yield: at least 3 leads under the arc-disjoint rule in at least 80 % of
// cal/val windows. ESA's arc structure: the position jump at the epoch two consecutive daily files share. Records and statistics only.
//   node experiments/ffm-covariance-adaptive/precheck-p1.mjs
//   node experiments/ffm-covariance-adaptive/precheck-p1.mjs --nsgf      C3-A2 point 2: the yield and lead coverage of R2 and LARES-2 on the daily arcs, nothing else
import fs from 'node:fs';
import path from 'node:path';
import { config, args, registered, Opened, writeReceipt, grid, store, readJsonl, c2Results, results, sha256, iso, DAY, HOUR } from './common.mjs';
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
    if (args.nsgf && familyOf(norad) !== 'nsgf') continue;
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

if (args.nsgf) {
  const before = JSON.parse(fs.readFileSync(path.join(results, 'precheck-P1.json')));
  const yieldR2 = perClass.R2.yield, lares2 = perObject[53105];
  const receipt = { plan: 'C3-A2 point 2: P1 on the daily arcs', rule: config.p1Yield, perClass: { R2: perClass.R2, 'LARES-2': perClass.R3 }, perObject,
    yield: { R2: yieldR2, 'LARES-2': lares2.yield, r2Outcome: yieldR2 >= config.p1Yield.minWindows ? 'R2 reported as registered' : 'R2 is a consistency check', lares2Passes: lares2.yield >= config.p1Yield.minWindows },
    onC2sThinnedArcs: { R2: before.yield.R2, 'LARES-2': before.perObject[53105].yield } };
  console.log(writeReceipt('precheck-P1-nsgf', receipt, opened));
  console.log(JSON.stringify({ yield: receipt.yield, before: receipt.onC2sThinnedArcs, R2: { windows: perClass.R2.windows, leads: perClass.R2.leadsAvailable, leadCounts: perClass.R2.leadCounts, gap: perClass.R2.nextAllowedGapH, excluded: perClass.R2.excluded }, lares2: { windows: lares2.windows, leads: perClass.R3.leadsAvailable, leadCounts: perClass.R3.leadCounts, gap: perClass.R3.nextAllowedGapH, excluded: lares2.excluded } }));
  process.exit(0);
}

// ---- ESA's arc structure: the jump at the epoch two consecutive daily files share, per axis in the earlier file's RTN (gp-error-model pair_statistics), cal/val days, the whole GNSS population. Truth only: no forecast
// of any satellite is computed for this, C2's six Galileo included. And C2's forecast sigma at each lead, from the class fit and terms of three windows per calibration satellite (lowest SHA-256 of
// C3S|p1|<norad>|<E>), R3's frozen constants; FFM RK78, relative tolerance 1e-10, steps up to 120 s, fit track 600 s, outputs at the leads and the 600 s noise grid.
const { openSession } = await import('./run.mjs');
const { settingsFor } = await import('./lib/open.mjs');
const { windowTermsRef } = await import('./lib/terms.mjs');
const { pC2, AXES } = await import('./lib/model.mjs');
const S = await openSession(opened, { fromMs: Date.parse('2025-09-15T00:00:00Z'), toMs: Date.parse('2026-06-15T00:00:00Z'), allowedToMs: ALLOWED });
const FZ = JSON.parse(fs.readFileSync(path.join(c2Results, 'frozen-constants.json')));
if (sha256(fs.readFileSync(path.join(c2Results, 'frozen-constants.json'))) !== config.c2.constantsSha256) throw new Error('C2 constants differ from the registration');
const P = config.population.judged, GLO = [...P.glonass.c2, ...P.glonass.new], GAL = [...P.galileo.new, ...P.galileo.c2Six];
const constellationOf = (n) => (GLO.includes(n) ? 'GLONASS' : 'Galileo');
const jumps = { GLONASS: [[], [], []], Galileo: [[], [], []] }, jump3d = {}, perSatellite = {};
const PLACEHOLDER = [1, 0, 1, 0, 0, 1];
for (const norad of [...GLO, ...GAL]) {
  const arcs = arcsOf(norad, { fromMs: Date.parse('2025-10-01T00:00:00Z'), toMs: Date.parse('2026-05-31T00:00:00Z'), allowedToMs: ALLOWED, opened });
  const list = [], dow = Array.from({ length: 7 }, () => []);
  for (let i = 1; i < arcs.length; i += 1) {
    if (arcs[i].start !== arcs[i - 1].stop) continue;
    const a = arcLines(arcs[i - 1]).at(-1), b = arcLines(arcs[i])[0];
    if (a.epoch !== b.epoch) continue;
    list.push({ predicted: { position: a.r.map((x) => x * 1000), velocity: a.v.map((x) => x * 1000), covariance: PLACEHOLDER, covarianceAxes: 'RTN' }, truth: { position: b.r.map((x) => x * 1000), velocity: b.v.map((x) => x * 1000) }, dow: new Date(arcs[i].start + 3600e3).getUTCDay() });
  }
  const st = [];
  for (let i = 0; i < list.length; i += 2000) st.push(...await S.pairs.stats(list.slice(i, i + 2000).map(({ predicted, truth }) => ({ predicted, truth })), 'predicted'));
  const c = constellationOf(norad), v = [];
  st.forEach((x, i) => { x.errorRtn.forEach((e, k) => jumps[c][k].push(Math.abs(e))); const j = Math.hypot(...x.errorRtn); v.push(j); dow[list[i].dow].push(j); });
  jump3d[norad] = v;
  perSatellite[norad] = { ...quantiles(v), belowOneMillimeter: v.filter((x) => x < 1e-3).length, medianByDayOfWeek: dow.map((x) => median(x)) };
}
const p95 = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)]; };
// C2's forecast sigma per satellite class, axis and lead
const sigmaFile = path.join(store, 'p1', 'sigma.jsonl');
fs.mkdirSync(path.dirname(sigmaFile), { recursive: true });
const haveSigma = new Set(readJsonl(sigmaFile).map((r) => `${r.norad}|${r.E}`));
for (const norad of config.population.calVal.R3) {
  const cands = ['calibration', 'validation'].flatMap((set) => cutoffsOf(norad, set)).map((E) => ({ E, h: sha256(Buffer.from(`C3S|p1|${norad}|${iso(E)}`)) })).sort((a, b) => (a.h < b.h ? -1 : 1));
  let used = 0;
  for (const { E } of cands) {
    if (used >= 3) break;
    if (haveSigma.has(`${norad}|${iso(E)}`)) { used += 1; continue; }
    const win = windowOf(norad, S.arcsFor(norad), E, { leadToleranceSeconds: 150 });
    if (win.excluded || win.leads.filter((l) => l.line).length < 2) continue;
    const settings = settingsFor('R3', S.seedOf(norad), false, S.B2C), fi = { points: win.track.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) })), reference: { epoch: win.track[0].epoch, state: [...win.track[0].r, ...win.track[0].v].map((x) => x * 1000) } };
    try {
      const ctx = S.chain.ctxFor(win.tInMs - 24 * HOUR, win.tInMs + 72 * HOUR);
      const f = await S.fitV3(ctx, fi.points, fi.reference, settings);
      if (!f.ok) continue;
      const t = await windowTermsRef(ctx, S.pairs, f, win.tInMs, win.leads.map((l) => ({ ...l, ref: null })), settings);
      fs.appendFileSync(sigmaFile, `${JSON.stringify({ norad, E: iso(E), sigma: t.leads.map((l) => ({ L: l.L, rtn: AXES.map((k) => Math.sqrt(pC2(FZ.classes.R3.parameters, l.terms)[k])) })) })}\n`);
      used += 1;
    } catch (error) { console.error(norad, iso(E), String(error.message).slice(0, 160)); }
  }
}
const sig = readJsonl(sigmaFile);
const sigmaOf = (test, L) => [0, 1, 2].map((k) => median(sig.filter((r) => test(r.norad)).flatMap((r) => r.sigma.filter((x) => x.L === L).map((x) => x.rtn[k]))));
const AX = ['R', 'T', 'N'];
const esaShare = [];
for (const [name, test, sets] of [['GLONASS', (n) => GLO.includes(n), [jumps.GLONASS]], ['Galileo', (n) => GAL.includes(n), [jumps.Galileo]], ['whole population', (n) => GLO.includes(n) || GAL.includes(n), [jumps.GLONASS, jumps.Galileo]]]) {
  for (let k = 0; k < 3; k += 1) {
    const p = p95(sets.flatMap((j) => j[k]));
    for (const L of config.p1Esa.leads_h) { const sg = sigmaOf(test, L)[k]; esaShare.push({ population: name, axis: AX[k], L, p95JumpM: p, sharedErrorM: p / Math.SQRT2, sigmaFM: sg, ratio: (p / Math.SQRT2) / sg, d2ShiftBound: 2 * (p / Math.SQRT2) / sg }); }
  }
}
const allJumps = Object.values(perSatellite);
const sigmaPerLead = Object.fromEntries([['LAGEOS-2', (n) => n === 22195], ['LARES-2', (n) => n === 53105], ['Etalon', (n) => n === 19751 || n === 20026], ['GLONASS', (n) => GLO.includes(n)], ['Galileo', (n) => GAL.includes(n)]].map(([name, t]) => [name, Object.fromEntries(config.leads_h.map((L) => [L, sigmaOf(t, L)]))]));

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

// ---- the 260926 reissue: one GET per sphere, the size alone, the bytes discarded
const reissue = [];
if (!args.offline) for (const sat of ['lageos1', 'lageos2', 'etalon1', 'etalon2']) {
  const url = `https://edc.dgfi.tum.de/pub/slr/products/orbits/TRF/${sat}/2026/260926/ilrsa.orb.${sat}.260926.v80.sp3.gz`;
  try { const r = await fetch(url, { signal: AbortSignal.timeout(120e3), headers: { 'user-agent': 'orbit-accuracy-experiments (research)' } }); const n = (await r.arrayBuffer()).byteLength; reissue.push({ sat, status: r.status, bytes: n, lastModified: r.headers.get('last-modified'), stub: n < 1024 }); } catch (error) { reissue.push({ sat, error: String(error.message).slice(0, 120) }); }
  await new Promise((res) => { setTimeout(res, 5000); });
}

const yieldR2 = perClass.R2?.yield ?? 0;
const receipt = {
  plan: 'section 5 P1', perClass, perObject,
  esaArcs: { rule: 'position jump at the epoch two consecutive daily ESA0OPSFIN files share (m), cal/val days, the whole GNSS population', satellites: allJumps.length, medianOfMedians: median(allJumps.map((x) => x.median)), smallestMedian: Math.min(...allJumps.map((x) => x.median)), largestMax: Math.max(...allJumps.map((x) => x.max)), boundaries: allJumps.reduce((a, x) => a + x.n, 0), belowOneMillimeter: allJumps.reduce((a, x) => a + x.belowOneMillimeter, 0), perSatellite },
  esaShare: { rule: config.p1Esa, sigmaSample: { windows: sig.length, rule: 'three windows per calibration satellite, lowest SHA-256 of C3S|p1|<norad>|<E>', note: 'C2 six Galileo and the ten new GLONASS have no calibration windows: their constellation median stands in' }, rows: esaShare, largestRatio: Math.max(...esaShare.map((x) => x.ratio)), overLimit: esaShare.filter((x) => x.ratio > config.p1Esa.stopAbove).length, of: esaShare.length }, sigmaPerLead,
  fresh: { ilrsa: fresh.ilrsa, ilrsaCache: fresh.ilrsaCache, esaFiles: fresh.esa.length, esaRange: [fresh.esa.map((x) => x.name).sort()[0], fresh.esa.map((x) => x.name).sort().at(-1)], cddisProvenance: lastModified, ilrsaLastModifiedLagDays: quantiles(lagDays), extensionProductsPerSphereDirs: extension },
  stub260926: { onDisk: fresh.ilrsa.filter((x) => x.name.includes('.260926.')), reissue },
  yield: { rule: config.p1Yield, R3: perClass.R3?.yield, R2: yieldR2, r2Outcome: yieldR2 >= config.p1Yield.minWindows ? 'R2 reported as registered' : 'R2 is a consistency check' },
};
console.log(writeReceipt('precheck-P1', receipt, opened));
console.log(JSON.stringify({ perClass, esa: { ...receipt.esaArcs, perSatellite: undefined }, share: receipt.esaShare, sigmaPerLead, stub: receipt.stub260926.reissue, lag: receipt.fresh.ilrsaLastModifiedLagDays, yield: receipt.yield }));
process.exit(0);
