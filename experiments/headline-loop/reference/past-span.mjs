// stack #316: what APC's error past its carried span is made of, on a geosynchronous group. Per window and per bin 1, 3 and 7 days after the
// span's end (8, 10, 14 days after the cutoff), side by side on the same epochs: APC (0.6.7: past the span its theory flies, fitted to FFMq's
// trajectory over the fit arc), the plain AP arm (0.6.5, fitted to the truth arc, flown in GCRF to the same epochs), and FFMq itself flown on
// to them from its own fit; each window split by the project's geosynchronous burn detector (lib/steps.mjs geoSteps: steps of the
// sidereal-day mean semimajor axis or plane, the detector the WAAS flags use) as burn between the cutoff and the bin's end, or burn-free where
// the detector covered that span. Development windows, read before; truth never after 2026-11-10; every state is a module's.
//   node experiments/headline-loop/reference/past-span.mjs --apc <store>/<sha12>-apc [--group GE] [--out file.json]
import fs from 'node:fs';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const E = await import('../lib/env.mjs'); E.usePackages();
const W = await import('../lib/windows.mjs');
const A = await import('../lib/arms.mjs');
const { QUALIFIED } = await import('../lib/settings.mjs');
const STEPS = await import(path.join(E.REPO, 'experiments/operator-theory/lib/steps.mjs'));
const group = args.group ?? 'GE', HORIZON = Date.parse('2026-11-10T00:00:00Z');
const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
const rows = fs.readdirSync(args.apc).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(args.apc, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean)).filter((r) => r.group === group && r.arms?.APC?.ok && r.arms.APC.pastSpan);
const arms = await A.openArms({ apWasm: path.join(E.MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm') });
const el = await STEPS.openElements();
const listed = W.windowsOf([group]), winOf = new Map([...listed.windows, ...listed.spring].map((w) => [w.key, w]));
const dirOf = (g) => path.join(A.STORE_ROOT, 'ffm-cache', A.ffmCacheKey(QUALIFIED[g], 60).key);
const BINS = { 1: '1 day', 3: '3 days', 7: '7 days' };
const detectors = new Map();
const out = [];
for (const name of [...new Set(rows.map((r) => r.name))].sort()) {
  const mine = rows.filter((r) => r.name === name), w0 = winOf.get(mine[0].key);
  const cut = mine.map((r) => Date.parse(r.cutoff)), from = Math.min(...cut) - 4 * W.DAY, to = Math.min(Math.max(...cut) + 15 * W.DAY, HORIZON);
  let det = null;
  try { const t = await W.truthOf({ ...w0, cutoffMs: from }, from, to, arms.axes); det = await STEPS.geoSteps(t.lines, el); } catch (e) { det = { error: String(e.message).slice(0, 120) }; }
  detectors.set(name, det);
  for (const r of mine) {
    const w = winOf.get(r.key), D0 = w.cutoffMs, arc = r.arcH;
    const rec = { key: r.key, arc, bins: {} };
    try {
      const truth = await W.truthOf(w, D0 - arc * W.HOUR - W.HOUR, Math.min(D0 + 14 * W.DAY + W.HOUR, HORIZON), arms.axes);
      const thin = W.arcOf(truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
      const past = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0 + 7 * W.DAY && W.ms(l.epoch) <= Math.min(D0 + 14 * W.DAY, HORIZON)), D0 + 7 * W.DAY);
      if (!past.entered.length) throw new Error('no truth past the span');
      const doc = JSON.parse(fs.readFileSync(path.join(dirOf(group), `${r.key.replace(/[^A-Za-z0-9_.-]+/g, '_')}-${arc}.json`), 'utf8'));
      const ffm = await arms.flyContinuous({ arm: QUALIFIED[group], product: doc.product, epochs: past.epochs, rows: null });
      const ap = await arms.apFitFly({ object: { name: r.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 }, lines: thin, D0, pcf: W.GROUPS[group].vacuum ? A.PCF.AP_VACUUM : A.PCF.AP, spw: W.GROUPS[group].vacuum ? null : W.weatherAt(D0).spw, epochs: past.epochs, frame: 'GCRF' });
      const ffmDays = await arms.score(ffm, past), apDays = await arms.score(ap.states, past);
      const steps = det?.steps ? STEPS.windowSteps(det, D0, { fitHours: arc, leadHours: 14 * 24 }) : null;
      for (const d of Object.keys(BINS)) {
        if (!r.arms.APC.pastSpan[d] || !ffmDays[d]) continue;
        const end = (7 + Number(d)) * 24;
        const burn = steps ? (steps.steps.some((s) => s.hours > 0 && s.hours <= end) ? 'burn' : steps.unchecked.some(([a, b]) => b > 0 && a < end) ? 'unchecked' : 'burn-free') : 'no detector';
        rec.bins[d] = { apcKm: r.arms.APC.pastSpan[d].e, apKm: apDays[d]?.e ?? null, ffmqKm: ffmDays[d].e, burn };
      }
    } catch (e) { rec.error = String(e.message).slice(0, 160); }
    out.push(rec);
    console.error(`${r.key} ${arc} h ${rec.error ?? Object.entries(rec.bins).map(([d, b]) => `+${d}d APC ${b.apcKm.toFixed(3)} AP ${b.apKm?.toFixed(3)} FFMq ${b.ffmqKm.toFixed(3)} km ${b.burn}`).join('; ')}`);
  }
}
const med = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] / 2 + s[Math.ceil((s.length - 1) / 2)] / 2 : null; };
const p95 = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.round(0.95 * (s.length - 1)))] : null; };
const lines = [`APC past the span, ${group}: median / p95 km and window counts per bin, split by the geosynchronous burn detector`, '| after the span | windows | APC (0.6.7 theory) | AP 0.6.5 plain | FFMq flown on |', '|---|---|---|---|---|'];
for (const [d, label] of Object.entries(BINS)) for (const part of ['all (pooled)', 'burn', 'burn-free', 'unchecked']) {
  const b = out.map((x) => x.bins?.[d]).filter((x) => x && (part === 'all (pooled)' || x.burn === part));
  if (!b.length) continue;
  const f = (k) => `${med(b.map((x) => x[k]))?.toFixed(3)} / ${p95(b.map((x) => x[k]))?.toFixed(3)}`;
  lines.push(`| ${label}, ${part} | ${b.length} | ${f('apcKm')} | ${f('apKm')} | ${f('ffmqKm')} |`);
}
const doc = { group, note: 'Development windows, read before; truth never after 2026-11-10.', detectors: Object.fromEntries([...detectors].map(([k, v]) => [k, v?.error ? { error: v.error } : { steps: v.steps.map((s) => ({ t: new Date(s.t).toISOString().slice(0, 16), sizeM: Math.round(s.sizeM * 10) / 10, by: s.by })) }])), windows: out, table: lines };
if (args.out) fs.writeFileSync(args.out, JSON.stringify(doc, null, 1));
console.log(lines.join('\n'));
process.exit(0);
