// XM5, exploratory: written after the outcome was known; it decides nothing, has no interval and is not part of the registration or of
// table.json. From XM3's stored rows and the M rows, group P: the median error by storm contact, by cutoff around the January storm, and
// each object's fitted B in arcs holding a storm day against its arcs holding none; the failed fit; the cost by group.
//   node experiments/ffm-tail-cause/explore.mjs      writes results/ffm-tail-cause/exploratory.json
import fs from 'node:fs';
import path from 'node:path';
import { config, results, root, XM3, xm3Rows } from './common.mjs';
import { storedRows } from './table.mjs';

const { config: C3, median, ms, dateOf, DAY } = XM3;
const W = await import(path.join(root, C3.xm.dir, 'lib/weather.mjs'));
const LEADS = C3.scoring.leadDays;
const X3 = await xm3Rows(), rows = storedRows();
const M = new Map(rows.map((r) => [r.key, r]));
const P = [...X3.values()].filter((r) => r.group === 'P' && r.arms?.F2 && !r.arms.F2.notRun);
const e = (a, lead) => (a?.ok && a.days?.[lead] ? a.days[lead].rmsKm : Infinity);
const med = (set, arm, lead) => median(set.map((r) => e(arm(r), lead)));
const F2O = (r) => r.arms.F2, F2M = (r) => M.get(r.key).arms.F2, Pub = (r) => r.P;
const medians = (set, lead) => ({ windows: set.length, F2O: med(set, F2O, lead), F2M: med(set, F2M, lead), P: med(set, Pub, lead) });

const anyStorm = (D0, from, to) => { for (let k = from; k <= to; k += 1) if (W.stormDay(dateOf(D0 + k * DAY))) return true; return false; };
const contact = (D0, lead) => { const arc = anyStorm(D0, -3, -1), forecast = anyStorm(D0, 0, lead - 1); return arc && forecast ? 'both' : arc ? 'arc' : forecast ? 'forecast' : 'neither'; };
const byContact = Object.fromEntries(LEADS.map((lead) => {
  const groups = {};
  for (const r of P) (groups[contact(ms(r.cutoff), lead)] ??= []).push(r);
  return [lead, Object.fromEntries(Object.entries(groups).sort().map(([c, set]) => [c, medians(set, lead)]))];
}));

const byCutoff = {};
for (let t = Date.parse('2026-01-17T00:00:00Z'); t <= Date.parse('2026-01-28T00:00:00Z'); t += DAY) {
  const set = P.filter((r) => r.cutoff.startsWith(dateOf(t)));
  byCutoff[dateOf(t)] = Object.fromEntries(LEADS.map((lead) => [lead, medians(set, lead)]));
}

const bOf = (a) => a?.fit?.parameters?.find((p) => p.kind === 'DRAG_AREA_OVER_MASS')?.value;
const finiteMedian = (v) => median(v.filter(Number.isFinite));
const bByObject = Object.fromEntries(C3.groups.P.objects.map((o) => {
  const set = P.filter((r) => r.norad === o.norad);
  const stormArc = (r) => anyStorm(ms(r.cutoff), -3, -1);
  const baseO = finiteMedian(set.filter((r) => !stormArc(r)).map((r) => bOf(F2O(r)))), baseM = finiteMedian(set.filter((r) => !stormArc(r)).map((r) => bOf(F2M(r))));
  const storm = set.filter(stormArc);
  return [o.norad, { name: o.name, noStormMedianBF2O: baseO, noStormMedianBF2M: baseM, stormArcWindows: storm.length, medianLnBAgainstNoStormF2O: finiteMedian(storm.map((r) => Math.log(bOf(F2O(r)) / baseO))), medianLnBAgainstNoStormF2M: finiteMedian(storm.map((r) => Math.log(bOf(F2M(r)) / baseM))) }];
}));

const failed = rows.filter((r) => !r.arms?.F2?.ok).map((r) => ({ key: r.key, name: r.name, error: r.arms.F2.error, rounds: r.arms.F2.fit?.iterations, rejectedTrials: r.arms.F2.fit?.rejectedTrials, reducedChiSquare: r.arms.F2.fit?.reducedChiSquare, underO: { rounds: X3.get(r.key).arms.F2.fit.iterations, reducedChiSquare: X3.get(r.key).arms.F2.fit.reducedChiSquare } }));

fs.mkdirSync(results, { recursive: true });
const out = { experiment: config.experiment, id: config.id, note: 'exploratory, written after the outcome; decides nothing', byContact, byCutoff, bByObject, failed };
fs.writeFileSync(path.join(results, 'exploratory.json'), `${JSON.stringify(out, null, 1)}\n`);

// The cost, printed only.
const sum = (set, get) => set.reduce((s, r) => s + (get(r) ?? 0), 0);
for (const group of Object.keys(C3.groups)) {
  const set = rows.filter((r) => r.group === group);
  console.error(`${group}: ${set.length} windows, wall ${(sum(set, (r) => r.timing?.wallSeconds) / 3600).toFixed(2)} worker-hours; mean fit ${(sum(set, (r) => r.timing?.F2?.fitMs) / 1000 / set.length).toFixed(1)} s, mean forecast ${(sum(set, (r) => r.timing?.F2?.forecastMs) / 1000 / set.length).toFixed(1)} s, mean window ${(sum(set, (r) => r.timing?.wallSeconds) / set.length).toFixed(1)} s`);
}
process.exit(0);
