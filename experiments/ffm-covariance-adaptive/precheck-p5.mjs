// P5 (PLAN.md section 5): the hand-off, 0 refusals. On C3's chain and the pin, per class the 20 cal/val windows with the lowest SHA-256 of C3S|p5|<class>|<norad>|<E> and at least 3 leads: the fit, then C2's
// end-to-end path (lib/products.mjs ffmNoiseCovariances: FFM carries k_e x A5's covariance from the fit epoch to t_in, then from t_in with PROCESS_NOISE q = [q_RN, q_T, q_RN], 600 s, to the leads). Any refusal
// fails. Reported: the end-to-end covariance plus the floor and density term against the composition from the terms, in d2/3 (gp-error-model pair_statistics). FFM: RK78, relative tolerance 1e-10, steps up to
// 120 s; fit track 600 s; outputs at the leads.
//   node experiments/ffm-covariance-adaptive/precheck-p5.mjs --shard k/n
//   node experiments/ffm-covariance-adaptive/precheck-p5.mjs --receipt
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, registered, Opened, writeReceipt, c2Results, root, sha256, iso, readJsonl, HOUR } from './common.mjs';
import { arcsOf, windowOf } from './lib/chain.mjs';
import { settingsFor } from './lib/open.mjs';
import { pC2, scaled } from './lib/model.mjs';

registered();
const opened = new Opened();
const dirOut = path.join(store, 'p5');
fs.mkdirSync(dirOut, { recursive: true });

// Exclusion 5 (section 1): a window that meets B1's dropped day, 2026-05-09, is refused and counted, with no fill: FFM needs a space-weather row for every day of the arc and the day before it, and the arc runs t_in - 24 h to t_in + 72 h.
// It is outside the hand-off this check tests, so it does not take one of the 20 places, and a refusal of that kind is listed apart.
const GAP = Date.parse('2026-05-09T00:00:00Z');
const hitsGap = (tInMs) => { const from = Math.floor((tInMs - 24 * HOUR) / (24 * HOUR)) - 1, to = Math.floor((tInMs + 72 * HOUR) / (24 * HOUR)), day = GAP / (24 * HOUR); return day >= from && day <= to; };

if (args.receipt) {
  const rows = fs.readdirSync(dirOut).filter((f) => f.startsWith('rows.s')).sort().flatMap((f) => readJsonl(path.join(dirOut, f)));
  const gapRefusal = (r) => r.refused && /space-weather-out-of-range/.test(r.refused) && r.tIn && hitsGap(Date.parse(r.tIn));
  const per = Object.fromEntries(['R3', 'R2-M', 'R2-O'].map((cls) => { const x = rows.filter((r) => r.cls === cls), ok = x.filter((r) => !r.refused && !r.excluded); return [cls, { windows: x.length - x.filter(gapRefusal).length, refused: x.filter((r) => r.refused && !gapRefusal(r)).map((r) => `${r.norad} ${r.E}: ${r.refused}`), exclusion5: x.filter(gapRefusal).map((r) => `${r.norad} ${r.E}: ${r.refused}`), excluded: x.filter((r) => r.excluded).length, maxAbsDeltaD2over3: ok.length ? Math.max(...ok.flatMap((r) => r.absDelta)) : null, maxRelVariance: ok.length ? Math.max(...ok.flatMap((r) => r.relVariance)) : null }]; }));
  const refused = Object.values(per).reduce((a, x) => a + x.refused.length, 0);
  console.log(writeReceipt('precheck-P5', { plan: 'section 5 P5', perClass: per, outcome: refused === 0 ? 'pass: 0 refusals' : `FAIL: ${refused} refusals` }, opened));
  console.log(JSON.stringify(per));
  process.exit(0);
}

const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const out = path.join(dirOut, `rows.s${k}.jsonl`);
const done = new Set(fs.readdirSync(dirOut).filter((f) => f.startsWith('rows.s')).flatMap((f) => readJsonl(path.join(dirOut, f))).map((r) => `${r.cls}|${r.norad}|${r.E}`));
const { openSession, cutoffsOf } = await import('./run.mjs');
const { ffmNoiseCovariances } = await import(path.join(root, 'experiments/ffm-covariance-calibration/lib/products.mjs'));
const { windowTermsRef } = await import('./lib/terms.mjs');
const FZ = JSON.parse(fs.readFileSync(path.join(c2Results, 'frozen-constants.json'))).classes;
const SPAN = { fromMs: Date.parse('2025-09-20T00:00:00Z'), toMs: Date.parse('2026-06-15T00:00:00Z'), allowedToMs: Date.parse('2026-06-15T00:00:00Z') };
const S = await openSession(opened, SPAN);
const fitInput = (lines) => ({ points: lines.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) })), reference: { epoch: lines[0].epoch, state: [...lines[0].r, ...lines[0].v].map((x) => x * 1000) } });
const CL = { R3: { norads: config.population.calVal.R3, key: 'R3', fit: 'R3', weather: 'M' }, 'R2-M': { norads: config.population.calVal.R2, key: 'R2', fit: 'R2', weather: 'M' }, 'R2-O': { norads: config.population.calVal.R2, key: 'R2-O', fit: 'R2', weather: 'O' } };
const arcsCache = new Map();
const arcsFor = (norad) => { if (!arcsCache.has(norad)) arcsCache.set(norad, arcsOf(norad, { ...SPAN, opened })); return arcsCache.get(norad); };
const tasks = [], gapWindows = [];
for (const [cls, c] of Object.entries(CL)) {
  const cand = c.norads.flatMap((norad) => ['calibration', 'validation'].flatMap((set) => cutoffsOf(norad, set)).map((E) => ({ cls, norad, E, h: sha256(Buffer.from(`C3S|p5|${cls}|${norad}|${iso(E)}`)) }))).sort((a, b) => (a.h < b.h ? -1 : 1));
  let used = 0;
  for (const t of cand) { if (used >= 20) break; const w = windowOf(t.norad, arcsFor(t.norad), t.E, { leadToleranceSeconds: 150 }); if (w.excluded || w.leads.filter((l) => l.line).length < 3) continue; if (hitsGap(w.tInMs)) { gapWindows.push(`${t.cls} ${t.norad} ${iso(t.E)}`); continue; } tasks.push(t); used += 1; }
}
for (let i = 0; i < tasks.length; i += 1) {
  const { cls, norad, E } = tasks[i];
  if (i % n !== k || done.has(`${cls}|${norad}|${iso(E)}`)) continue;
  const c = CL[cls], win = windowOf(norad, arcsFor(norad), E, { leadToleranceSeconds: 150 });
  const rec = { cls, norad, E: iso(E), tIn: win.tIn };
  const settings = settingsFor(c.fit, S.seedOf(norad), c.fit !== 'R3', S.B2C), p = FZ[c.key].parameters, fi = fitInput(win.track);
  try {
    let ctx = S.chain.ctxFor(win.tInMs - 24 * HOUR, win.tInMs + 72 * HOUR);
    if (c.weather === 'O') { const o = S.WO.inputsO(ctx.inputs, E, win.tInMs + 72 * HOUR); if (o.excluded) { rec.excluded = o.excluded; fs.appendFileSync(out, `${JSON.stringify(rec)}\n`); continue; } ctx = { ...ctx, inputs: o.inputs }; }
    const f = await S.fitV3(ctx, fi.points, fi.reference, settings);
    if (!f.ok) { rec.refused = `fit ${f.termination ?? f.error}`; fs.appendFileSync(out, `${JSON.stringify(rec)}\n`); continue; }
    const leads = win.leads.filter((l) => l.line);
    const t = await windowTermsRef(ctx, S.pairs, f, win.tInMs, leads.map((l) => ({ ...l, ref: null })), settings);
    const e2e = await ffmNoiseCovariances(ctx, S.pairs, f, win.tInMs, leads, settings, [p.q_RN ?? 0, p.q_T ?? 0, p.q_RN ?? 0], p.k_e);
    const P0 = [7e6, 0, 0], V0 = [0, 7.5e3, 0];
    const floor = (m, l) => { const o = [...m]; o[0] += (p.f_R ?? 0) ** 2; o[2] += (p.f_T ?? 0) ** 2; o[5] += (p.f_N ?? 0) ** 2; if (p.s2) { const D = p.tau === 'inf' ? l.terms.Dinf : l.terms.D1; for (let q = 0; q < 6; q += 1) o[q] += p.s2 * D[q]; } return o; };
    const a = t.leads.map((l) => scaled(pC2(p, l.terms), 1)), b = e2e.map((x, q) => floor(x.rtn, t.leads[q]));
    const d2 = async (cov, l) => (await S.pairs.stats([{ predicted: { position: P0, velocity: V0, covariance: cov, covarianceAxes: 'RTN' }, truth: { position: P0.map((x, q) => x - l.errRtnM[q]), velocity: V0 } }], 'predicted'))[0];
    rec.absDelta = []; rec.relVariance = [];
    for (let q = 0; q < t.leads.length; q += 1) { const x = await d2(a[q], t.leads[q]), y = await d2(b[q], t.leads[q]); rec.absDelta.push(Math.abs((x.d2Predicted ?? x.d2Combined) - (y.d2Predicted ?? y.d2Combined)) / 3); rec.relVariance.push(Math.max(...[0, 2, 5].map((j) => Math.abs(a[q][j] - b[q][j]) / a[q][j]))); }
  } catch (error) { rec.refused = String(error.message).slice(0, 240); }
  fs.appendFileSync(out, `${JSON.stringify(rec)}\n`);
  console.error(cls, norad, iso(E).slice(0, 10), rec.refused ?? rec.excluded ?? `ok dd ${Math.max(...rec.absDelta).toExponential(2)} rel ${Math.max(...rec.relVariance).toExponential(2)}`);
}
process.exit(0);
