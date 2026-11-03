// Fresh-truth sources per regime, latencies and interlocks (PLAN.md section 4), and the open-date formula.
import { BINS } from './bins.mjs';
export const WINDOW = { issueFrom: '2026-11-10', issueTo: '2026-12-06', floor: '2026-12-21' };
const D = 86400000;
const ts = (s) => Date.parse(`${s}T00:00:00Z`);
export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
// products: name, latency in days, needs O5
export const PRODUCTS = {
  'LEO-L': [],
  'LEO-M': [{ name: 'DORIS (CryoSat-2, SARAL, Sentinel-3A/B)', latencyDays: 17, o5: true }, { name: 'Sentinel-1A POEORB', latencyDays: 20, o5: true }],
  'LEO-H': [{ name: 'DORIS (SWOT, HY-2C/D, Jason-3, Sentinel-6A/B)', latencyDays: 17, o5: true }],
  MEO: [{ name: 'ESA finals', latencyDays: 14, o5: true, interlock: '2027-01-20' }, { name: 'ILRS combined', latencyDays: 11, o5: true, interlock: '2027-01-20' }],
  GEO: [{ name: 'ESA finals (BeiDou GEO/IGSO, QZS-3)', latencyDays: 14, o5: true, interlock: '2027-01-20' }, { name: 'WAAS MT9 (needs a module converter)', latencyDays: 1, o5: false, pendingConverter: true }],
  HEO: [],
};
export function openDate(regime, b) {
  const upper = BINS[b][1];
  let open = ts(WINDOW.floor);
  const parts = [{ name: 'floor', date: WINDOW.floor }];
  for (const p of PRODUCTS[regime]) {
    const d = ts(WINDOW.issueTo) + (upper + p.latencyDays) * D;
    parts.push({ name: p.name, date: iso(d) });
    open = Math.max(open, d);
    if (p.interlock) { parts.push({ name: `${p.name} interlock (C3 R3 record, later of 12-21 and 2027-01-20)`, date: p.interlock }); open = Math.max(open, ts(p.interlock)); }
  }
  return { date: iso(open), parts };
}

export const OUTCOMES = ['TESTABLE', 'NOT TESTABLE', 'NO LAWFUL TRUTH'];
// The freeze-time outcome of a stratum record under owner answers {o4, o5} and a label rule ('S1' registered, 'S1p' powered
// rule of amendment 1): {outcome, reasons}.
export function outcomeOf(regime, rec, owner, rule = 'S1') {
  if ((regime === 'LEO-L' && !owner.o4) || regime === 'HEO') return { outcome: 'NO LAWFUL TRUTH', reasons: [regime === 'HEO' ? 'no usable dev truth (one object, 5 rows)' : 'Swarm, GRACE-FO and ISS truth are held (O4 default no)'] };
  if (!rec || rec.oc === undefined || rec.oc === null) return { outcome: 'NOT TESTABLE', reasons: ['no frozen cell'] };
  const v = rule === 'S1p' ? { oc: rec.s1p.oc, ocPass: rec.s1p.ocPass, cMin: rec.s1p.cMin } : { oc: rec.oc, ocPass: rec.ocPass, cMin: rec.cMin };
  const reasons = [];
  if (!owner.o5) reasons.push('O5 not granted: no lawful fresh truth for the regime\'s products');
  if (!v.ocPass) reasons.push(`operating characteristics fail under ${rule}: P(label | correct) ${v.oc[0]}, x0.7 ${v.oc[1]}${rule === 'S1' ? `, x1.4 ${v.oc[2]}` : ''}`);
  if (v.cMin === null) reasons.push('no cluster count up to the available passes the operating characteristics (C_min undefined)');
  else if (rec.clusters < v.cMin) reasons.push(`clusters ${rec.clusters} < C_min ${v.cMin}`);
  if (rec.nFresh < 100) reasons.push(`expected n ${rec.nFresh} < 100`);
  if (rec.nEff < 60) reasons.push(`n_eff ${Math.round(rec.nEff)} < 60`);
  if (rec.timeBlocks < 6) reasons.push(`time blocks ${rec.timeBlocks} < 6`);
  if (regime === 'GEO' && !owner.o5) reasons.push('GEO fresh truth is WAAS alone (one longitude sector, module converter pending): sectors < 2');
  return { outcome: reasons.length ? 'NOT TESTABLE' : 'TESTABLE', reasons };
}
