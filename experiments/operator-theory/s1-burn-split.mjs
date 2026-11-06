// PER-REV-FLAG.md, amendment of 2026-11-06 (Sentinel-1 split), report only: the near-700 km FFM/AP cells' Sentinel-1 windows split by the covariance-model
// catalog (COVARIANCE-MODEL.md amendment 3, ac438c3a; its 4 m truth steps, validated on Sentinel-1: 26 of 26 known burns, 0 false alarms on quiet windows) into
// burn-affected (a step in [cutoff - fit, cutoff + lead]) and burn-free (no step there and the catalog covers it); the paired FFM/AP ratio on each, with its 95 %
// interval over object-week clusters. Catalog rule as covariance-model.mjs applies it: steps shifted 2 h earlier, a span is covered when the checked spans leave no
// gap over 2 h. Statistics on stored rows only.
//   node experiments/operator-theory/s1-burn-split.mjs --out results/operator-theory/per-rev-flag/split
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { median, pct, asc, rand } from './lib/compare.mjs';
import { HELD_ROW, HELD_NORADS } from './lib/pairs.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT) throw new Error('--out');
const HOUR = 3600000, A = '/opt/data/sdn-archive/operator-theory', CAT = path.join(A, 'covariance-model/steps');
// The stores: the near-700 km cells' windows (AP5's 2026 Sentinel-1 rows), FFM on propagator/ffm 2.2.0 (the FFM rerun's store the landed cells read), AP sdn-ap 0.5.1.
export const STORES = { windows: path.join(A, 'ap/b0411/truth2'), ffm: path.join(A, 'ap/ffm220/compare-truth2'), ap: path.join(A, 'ap/b051/truth2') };
// The catalog files, fixed by SHA-256 at registration.
export const CATALOG = {
  'trS1-39634.json': 'f21d25b9bf42381a12c415d71a6992aa389e957eb56f4000b6a003b0520d4eb1',
  'trS1-62261.json': 'd058dad7759febce8b6ad6794f0116f05ec79efddc85edf9e2bfa39ff26a8f05',
};
export const RULE = { shiftMs: 2 * HOUR, gapMs: 2 * HOUR, draws: 10000, minWindows: 10, explainedUpper: 1.1, s1CutoffBefore: '2026-06-01' };
const FITS = [24, 72], DAYS = ['1', '2', '3', '7'];

const catalog = new Map();
for (const [file, sha] of Object.entries(CATALOG)) {
  const bytes = fs.readFileSync(path.join(CAT, file));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== sha) throw new Error(`${file}: not the registered catalog`);
  const c = JSON.parse(bytes.toString('utf8')), e = catalog.get(c.norad) ?? { steps: [], checked: [] };
  e.steps.push(...c.steps.map((x) => Date.parse(x.t) - RULE.shiftMs)); e.checked.push(...c.checked.map(([a, b]) => [Date.parse(a), Date.parse(b)]));
  catalog.set(c.norad, e);
}
for (const e of catalog.values()) { e.steps.sort((a, b) => a - b); e.checked.sort((a, b) => a[0] - b[0]); }
/** A window-cell's part: 'burn' when a step lies in [a, b], 'free' when none does and the checked spans cover it, else 'unchecked'. */
const partOf = (norad, a, b) => {
  const e = catalog.get(norad);
  if (e.steps.some((t) => t >= a && t <= b)) return 'burn';
  let at = a;
  for (const [x, y] of e.checked) { if (y < at) continue; if (x > at + RULE.gapMs) return 'unchecked'; at = Math.max(at, y); if (at >= b - RULE.gapMs) return 'free'; }
  return at >= b - RULE.gapMs ? 'free' : 'unchecked';
};

const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l && !HELD_ROW.test(l)).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => jsonl(path.join(dir, f)));
const byKey = (dir) => new Map(rowsIn(dir).map((r) => [r.key, r]));
const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;
const round = (x, k = 3) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(k)));
const members = rowsIn(STORES.windows).filter((r) => r.group === 'S1' && !r.error);
for (const r of members) if (HELD_NORADS.has(Number(r.norad)) || r.cutoff.slice(0, 10) >= RULE.s1CutoffBefore) throw new Error(`${r.key}: held`);
const ffm = byKey(STORES.ffm), ap = byKey(STORES.ap);
const isoWeek = (d) => { const t = new Date(`${d}T00:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `${t.getUTCFullYear()}-W${1 + Math.round((t - first) / (7 * 86400000))}`; };
const ratio = (w) => (w.length ? round(Math.exp(median(w.map((x) => Math.log(x.f / x.a))))) : null);
const interval = (tag, w) => {
  if (!w.length) return null;
  const by = new Map();
  for (const x of w) { const c = `${x.name}|${isoWeek(x.cutoff.slice(0, 10))}`; (by.get(c) ?? by.set(c, []).get(c)).push(Math.log(x.f / x.a)); }
  const clusters = [...by.values()], random = rand(parseInt(crypto.createHash('sha256').update(`PERREV-SPLIT|${tag}`).digest('hex').slice(0, 8), 16)), meds = [];
  for (let t = 0; t < RULE.draws; t += 1) { const draw = []; for (let i = 0; i < clusters.length; i += 1) draw.push(...clusters[Math.floor(random() * clusters.length)]); meds.push(median(draw)); }
  meds.sort(asc);
  return [round(Math.exp(pct(meds, 0.025))), round(Math.exp(pct(meds, 0.975)))];
};
/** The registered reading of a cell's burn-free part. */
const reading = (n, ci) => (n < RULE.minWindows ? `no reading: ${n} burn-free windows, under ${RULE.minWindows}`
  : ci[1] <= RULE.explainedUpper ? `explained by burns: ${n} burn-free windows, interval upper bound ${ci[1]} at or below ${RULE.explainedUpper}`
    : ci[0] > 1 ? `candidate FFM defect, its own record: ${n} burn-free windows, interval lower bound ${ci[0]} above 1`
      : `undecided: ${n} burn-free windows, interval [${ci.join(', ')}]`);

const cells = [];
for (const fit of FITS) for (const day of DAYS) {
  const lead = Number(day) * 24;
  const w = members.map((r) => ({ name: r.name, norad: r.norad, cutoff: r.cutoff, f: e(ffm.get(r.key), `F${fit}`, day), a: e(ap.get(r.key), `AP${fit}`, day) })).filter((x) => [x.f, x.a].every((v) => Number.isFinite(v) && v > 0));
  for (const x of w) { const c = Date.parse(x.cutoff); x.part = partOf(x.norad, c - fit * HOUR, c + lead * HOUR); }
  const part = (p) => w.filter((x) => x.part === p), free = part('free'), burn = part('burn'), ciFree = interval(`${fit}|${day}|free`, free);
  cells.push({ regime: 'Near 700 km', satellites: 'Sentinel-1A, Sentinel-1C', fit, lead, windows: w.length, burnAffected: burn.length, burnFree: free.length, unchecked: part('unchecked').length,
    ratioAll: ratio(w), intervalAll: interval(`${fit}|${day}|all`, w), ratioBurn: ratio(burn), intervalBurn: interval(`${fit}|${day}|burn`, burn), ratioFree: ratio(free), intervalFree: ciFree,
    reading: reading(free.length, ciFree ?? [Infinity, Infinity]) });
}
const doc = { registered: 'PER-REV-FLAG.md, amendment of 2026-11-06 (Sentinel-1 split)', catalog: { record: 'COVARIANCE-MODEL.md amendment 3 (ac438c3a), amendment 4 (0da3ecd3)', files: CATALOG, rule: RULE }, stores: STORES,
  statistic: 'exp(median by window of ln(FFM / AP)); 95 % interval over object-week clusters, 10,000 draws, seed SHA-256 of PERREV-SPLIT|<fit>|<day>|<part>', altimetry: 'no verdict (the catalog is validated on Sentinel-1 only)', cells };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(doc, null, 1)}\n`);
const I = (v) => (v ? `[${v.join(', ')}]` : '-');
const md = ['# Near 700 km: FFM against AP on Sentinel-1, burn-affected and burn-free', '', 'Report only, registered in `experiments/operator-theory/PER-REV-FLAG.md` (amendment of 2026-11-06, Sentinel-1 split) before any split was read. Burns from the covariance-model catalog (4 m truth steps, validated on Sentinel-1). Altimetry windows get no verdict.', '',
  '| Fit, h | Lead, h | Windows | Burn-affected | Burn-free | Unchecked | FFM/AP all | FFM/AP burn-affected | FFM/AP burn-free | Reading |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...cells.map((c) => `| ${c.fit} | ${c.lead} | ${c.windows} | ${c.burnAffected} | ${c.burnFree} | ${c.unchecked} | ${c.ratioAll ?? '-'} ${I(c.intervalAll)} | ${c.ratioBurn ?? '-'} ${I(c.intervalBurn)} | ${c.ratioFree ?? '-'} ${I(c.intervalFree)} | ${c.reading} |`), ''];
fs.writeFileSync(path.join(OUT, 'README.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
