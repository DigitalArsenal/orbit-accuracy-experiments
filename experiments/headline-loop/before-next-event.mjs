// The numerical arm's error against the reference before the next event: the judge of a maneuvering satellite, whose reference holds its
// maneuvers, so that the day-5 error (past the next maneuver) judges nothing. For each window and fit arc of the groups, each setting named is
// fitted on the arc the numerical row has (the stored fit's arc, or --starts), flown over the reference's epochs up to the last whole 12 h lead
// before the next event (a burn of the object's list or an event of its break test, after the cutoff), and the 3D distance to the reference at
// that lead is the figure; the largest distance over the leads from 12 h on goes beside it. One JSON line per window, arc and setting.
//   node experiments/headline-loop/before-next-event.mjs --groups WA --burns <lists> [--arcs 72,24] [--settings E5G,E1F] [--starts <json>] [--only <key|arc,...>]
//   --starts: { "<window key>|<arc h>": "<arc start>" }, the arcs after an event where the rule moves them
//   node experiments/headline-loop/before-next-event.mjs --check
import fs from 'node:fs';
import path from 'node:path';
import { usePackages } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
export const LEAD_STEP_H = 12;
/** The last whole lead (h, a multiple of LEAD_STEP_H) before the next event of a cutoff. An event is { edgeMs (its early edge), reportMs (when it
 *  was reported) }; one reported after the cutoff counts, from the later of its edge and the cutoff (an event inside the window's own arc, reported
 *  after the cutoff, has lead 0: there is no whole lead before it). With none, or one past HORIZON_H, the lead is the whole horizon, marked. */
export const HORIZON_H = 168;
export const leadBefore = (cutoffMs, events) => {
  const next = events.filter((e) => e.reportMs > cutoffMs).map((e) => Math.max(e.edgeMs, cutoffMs)).sort((a, b) => a - b)[0], cap = Math.floor(HORIZON_H / LEAD_STEP_H) * LEAD_STEP_H;
  if (next === undefined) return { leadH: cap, mark: 'no later event: the figure is over the whole span of the reference' };
  const h = Math.floor((next - cutoffMs) / (LEAD_STEP_H * 3600e3)) * LEAD_STEP_H;
  return h > cap ? { leadH: cap, mark: 'the next event lies past the horizon: the figure is over the whole span of the reference' } : { leadH: h, mark: null };
};
if (args.check) {
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${a} !== ${b}`); };
  const D0 = Date.parse('2026-01-10T00:00:00Z'), H = 3600e3;
  const ev = (edge, report = edge) => ({ edgeMs: D0 + edge * H, reportMs: D0 + report * H });
  eq(leadBefore(D0, [ev(40)]).leadH, 36, 'the last whole lead before an event 40 h on');
  eq(leadBefore(D0, [ev(11)]).leadH, 0, 'an event under one step on');
  eq(leadBefore(D0, [ev(100), ev(30)]).leadH, 24, 'the nearer of two events');
  eq(leadBefore(D0, [ev(-5)]).leadH, 168, 'an event reported before the cutoff is not a later event: the whole span, marked');
  eq(/no later event/.test(leadBefore(D0, [ev(-5)]).mark), true, 'the mark of a window with no later event');
  eq(leadBefore(D0, [ev(500)]).leadH, 168, 'an event past the horizon: the whole span');
  eq(leadBefore(D0, [ev(40)]).mark, null, 'no mark where an event ends the lead');
  eq(leadBefore(D0, [ev(0, 10)]).leadH, 0, 'an event whose early edge is the cutoff and that is reported later ends the lead at 0');
  eq(leadBefore(D0, [ev(-8, 4), ev(60)]).leadH, 0, 'an event inside the arc, reported after the cutoff, counts from the cutoff');
  console.log('before-next-event.mjs --check: PASS');
  process.exit(0);
}
usePackages();
const W = await import('./lib/windows.mjs');
const A = await import('./lib/arms.mjs');
const { openFfm, SETTINGS } = await import('./lib/ffm.mjs');
const HOUR = 3600e3, DAY = 864e5, TRAJ = path.join(A.STORE_ROOT, 'numerical-trajectories');
const read = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const groups = (args.groups ?? 'WA').split(','), arcs = (args.arcs ?? '72,24').split(',').map(Number), settings = (args.settings ?? 'E5G,E1F').split(',');
const only = args.only ? new Set(args.only.split(',')) : null, STARTS = args.starts ? JSON.parse(fs.readFileSync(args.starts, 'utf8')) : {};
// every burn of the list and event of the break test (read at the period's end, for the measure; a burn's early edge is its extent's start, a break event's
// the end of the last arc that closed): the lead stops before it, from the cutoff where it was reported after it
const eventsOf = (g, name) => A.knownBurns(args.burns, g, name, Infinity).map((b) => ({ edgeMs: Date.parse(b.extentFrom ?? b.from), reportMs: Date.parse(b.reportTime ?? b.extentFrom ?? b.from) }));
const arms = await A.openArms({}), F = await openFfm();
const last = new Map();
for (const x of read(path.join(TRAJ, 'manifest.jsonl'))) if (groups.includes(x.group) && arcs.includes(x.arcH) && x.file && x.source !== 'none' && x.source !== 'failed') last.set(`${x.key}|${x.arcH}`, x);
const wins = new Map(groups.flatMap((g) => { const a = W.windowsOf([g]); return [...a.windows, ...a.second].map((w) => [w.key, w]); }));
const iso = (t) => new Date(t).toISOString(), r1 = (x) => Math.round(x * 10) / 10;
for (const man of last.values()) {
  const [g, name] = man.key.split('|'), wk = `${man.key}|${man.arcH}`, D0 = Date.parse(man.cutoff), w = wins.get(man.key);
  if (only && !only.has(wk)) continue;
  const { leadH, mark } = leadBefore(D0, eventsOf(g, name)), start = STARTS[wk] ? Date.parse(STARTS[wk]) : Date.parse(man.check?.arcStart ?? iso(D0 - man.arcH * HOUR));
  const head = { key: man.key, arcH: man.arcH, arcStart: iso(start), arcHours: r1((D0 - start) / HOUR), leadH, ...(mark ? { mark } : {}) };
  if (leadH < LEAD_STEP_H) { console.log(JSON.stringify({ ...head, note: 'no whole 12 h lead before the next event' })); continue; }
  try {
    const truth = await W.truthOf(w, D0 - man.arcH * HOUR - HOUR, D0 + 7 * DAY + HOUR, arms.axes), sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
    const thin = W.arcOf(truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= start && t <= D0; }), (D0 - start) / HOUR);
    const ref = truth.lines.filter((l) => { const t = W.ms(l.epoch); return t > D0 && t <= D0 + leadH * HOUR; });
    for (const s of settings) {
      const out = { ...head, setting: s };
      try {
        const f = await arms.ffm({ thin, D0, rows: null, sc, arm: s, sigmaM: A.objectSigmaM(args.burns, g, name, D0) });
        const fc = await F.forecast(f.product, ref.map((l) => l.epoch), SETTINGS[s], null);
        const d = fc.map((x, k) => ({ h: (W.ms(ref[k].epoch) - D0) / HOUR, e: Math.hypot(...[0, 1, 2].map((j) => (x.r[j] - ref[k].r[j]) * 1000)) }));
        const at = d.filter((x) => x.h >= leadH - 0.5).sort((a, b) => b.h - a.h)[0], big = d.filter((x) => x.h >= LEAD_STEP_H);
        Object.assign(out, { weightedRms: f.weightedRms, errAtLeadM: at ? r1(at.e) : null, errMaxFrom12hM: big.length ? r1(Math.max(...big.map((x) => x.e))) : null });
      } catch (e) { out.error = String(e?.message ?? e).slice(0, 200); }
      console.log(JSON.stringify(out));
    }
  } catch (e) { console.log(JSON.stringify({ ...head, error: String(e?.message ?? e).slice(0, 200) })); }
}
await arms.close(); await F.close();
process.exit(0);
