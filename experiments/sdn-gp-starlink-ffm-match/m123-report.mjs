// Step 9: the M1 to M3 report (amendments A7 to A7d): aggregates <store>/m123/<family>/<id>.json into
// results/sdn-gp-starlink-ffm-match/m123.json and m123.md (the section the README includes). Medians and 90th percentiles
// over windows; nothing here propagates or fits.
//   node experiments/sdn-gp-starlink-ffm-match/m123-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { store, results, write } from './common.mjs';
import { quantile } from './lib/windows.mjs';

const root = path.join(store, 'm123');
const load = () => fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'claims')
  .flatMap((d) => fs.readdirSync(path.join(root, d.name)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(root, d.name, f)))));

// DESIGN.md 2d.3 (design estimates at the orbits it names): A_22 and the RMS of the m-daily set, metres.
const PREDICTED = {
  'starlink-550km': { label: 'Starlink 550 km shell (53 deg, 15.0 to 15.2 rev/day)', a22: 454, set: 384 },
  'starlink-inc0': { label: 'Starlink below 48 deg (43 deg shell)', a22: 332, set: 332 },
  'starlink-inc1': { label: 'Starlink 48 to 60 deg (53 deg shell)', a22: 454, set: 384 },
  'starlink-inc2': { label: 'Starlink 60 to 85 deg (70 deg shell)', a22: 627, set: 519 },
  'starlink-inc3': { label: 'Starlink 85 deg and above (97.6 deg shell)', a22: 707, set: 535 },
  iss: { label: 'ISS (51.64 deg)', a22: 459, set: 394 },
  lageos1: { label: 'LAGEOS-1 (109.84 deg)', a22: 153, set: 110 },
  lageos2: { label: 'LAGEOS-2 (52.66 deg)', a22: null, set: null },
};
const ORDER = ['starlink', 'starlink-550km', 'starlink-inc0', 'starlink-inc1', 'starlink-inc2', 'starlink-inc3', 'iss', 'lageos1', 'lageos2'];
const LABEL = { starlink: 'Starlink, all clean truths', ...Object.fromEntries(Object.entries(PREDICTED).map(([k, v]) => [k, v.label])) };

const arm = (r, v, l, a) => { const x = r.variants?.[v]?.[l]?.[a]; return x?.ok ? x : null; };
const sgp4Fixed = (r, v) => { const x = r.variants?.[v]?.sgp4Fixed; return x?.ok ? x : null; };
const finite = (v) => Number.isFinite(v);
const med = (a) => quantile(a.filter(finite), 0.5);
const p90 = (a) => quantile(a.filter(finite), 0.9);
const f = (v, d = 0) => (finite(v) ? v.toFixed(d) : '-');
const stat = (list, fn) => { const v = list.map(fn).filter(finite); return { n: v.length, median: med(v), p90: p90(v) }; };
const inTrackM = (x) => (x ? x.fitRic[1] * 1000 : NaN);
const fitM = (x) => (x ? x.fitRmsKm * 1000 : NaN);
const dayKm = (x, k) => (x?.days?.[k] ? x.days[k].rmsKm : NaN);
const quad = (a, b) => (finite(a) && finite(b) ? Math.sqrt(Math.max(0, a * a - b * b)) : NaN);

function groupRows(rows) {
  const groups = Object.fromEntries(ORDER.map((g) => [g, []]));
  for (const r of rows) {
    if (r.family === 'starlink') {
      groups.starlink.push(r);
      const inc = /inc(\d)/.exec(r.stratum ?? '')?.[1];
      if (inc !== undefined) groups[`starlink-inc${inc}`]?.push(r);
      const n = arm(r, 'full', 'h24', 'sgp4')?.meanMotion;
      if (inc === '1' && n >= 15.0 && n <= 15.2) groups['starlink-550km'].push(r);
    } else groups[r.family]?.push(r);
  }
  return groups;
}

function summarize(g, rs) {
  const out = { group: g, windows: rs.length };
  const share = (a, l = 'h24', x = 'xp') => stat(rs, (r) => quad(inTrackM(arm(r, 'full', l, x)), inTrackM(arm(r, 'zonal', l, x))));
  out.floor = {};
  for (const x of ['xp', 'sgp4']) {
    out.floor[x] = {
      full: stat(rs, (r) => inTrackM(arm(r, 'full', 'h24', x))), zonal: stat(rs, (r) => inTrackM(arm(r, 'zonal', 'h24', x))),
      tess2: stat(rs, (r) => inTrackM(arm(r, 'tess2', 'h24', x))), tess6: stat(rs, (r) => inTrackM(arm(r, 'tess6', 'h24', x))),
      order14: stat(rs, (r) => inTrackM(arm(r, 'order14', 'h24', x))), order15: stat(rs, (r) => inTrackM(arm(r, 'order15', 'h24', x))),
      fit3dFull: stat(rs, (r) => fitM(arm(r, 'full', 'h24', x))), fit3dZonal: stat(rs, (r) => fitM(arm(r, 'zonal', 'h24', x))),
      share: stat(rs, (r) => quad(inTrackM(arm(r, 'full', 'h24', x)), inTrackM(arm(r, 'zonal', 'h24', x)))),
    };
  }
  out.days = {};
  for (const x of ['xp', 'sgp4']) {
    out.days[x] = {};
    for (const v of ['full', 'zonal', 'tess2', 'tess6', 'order14', 'order15', 'full-nodrag', 'zonal-nodrag']) {
      out.days[x][v] = Object.fromEntries([1, 2, 3].map((k) => [k, stat(rs, (r) => dayKm(arm(r, v, 'h24', x), k))]));
    }
    out.days[x].quadShareDay3 = stat(rs, (r) => { const a = dayKm(arm(r, 'full', 'h24', x), 3), b = dayKm(arm(r, 'zonal', 'h24', x), 3); return finite(a) && a > 0 ? quad(a, b) / a : NaN; });
    out.days[x].linearShareDay3 = stat(rs, (r) => { const a = dayKm(arm(r, 'full', 'h24', x), 3), b = dayKm(arm(r, 'zonal', 'h24', x), 3); return finite(a) && finite(b) && a > 0 ? 1 - b / a : NaN; });
    out.days[x].inTrackFullDay3 = stat(rs, (r) => { const a = arm(r, 'full', 'h24', x)?.days?.[3]?.ric?.[1]; return a; });
  }
  out.pairs = {};
  for (const key of ['tess2-zonal', 'tess6-zonal', 'full-zonal', 'full-tess6']) {
    out.pairs[key] = { amplitudeM: stat(rs, (r) => r.pairs?.[key]?.sinusoid?.amplitudeM), periodH: stat(rs, (r) => r.pairs?.[key]?.sinusoid?.periodDays * 24), rawInTrackRmsM: stat(rs, (r) => r.pairs?.[key]?.rtnRmsM?.[1]), residualM: stat(rs, (r) => r.pairs?.[key]?.sinusoid?.rmsResidualM) };
  }
  out.long = {};
  for (const key of ['order15-order14', 'full-order14']) {
    out.long[key] = { absDay: Object.fromEntries([1, 2, 3, 4, 7, 10].map((d) => [d, stat(rs, (r) => Math.abs(r.long?.[key]?.atDaysM?.[d]))])), amplitudeM: stat(rs, (r) => r.long?.[key]?.sinusoid?.amplitudeM), periodD: stat(rs, (r) => r.long?.[key]?.sinusoid?.periodDays), maxAbsM: stat(rs, (r) => r.long?.[key]?.inTrackMaxAbsM), endM: stat(rs, (r) => r.long?.[key]?.inTrackEndM) };
  }
  out.fitLength = {};
  for (const l of ['h21_7', 'h24', 'h34_2']) {
    out.fitLength[l] = {};
    for (const x of ['xp', 'sgp4']) {
      out.fitLength[l][x] = {};
      for (const v of ['full', 'tess2', 'zonal', 'full-nodrag', 'zonal-nodrag']) {
        out.fitLength[l][x][v] = { day1: stat(rs, (r) => dayKm(arm(r, v, l, x), 1)), day3: stat(rs, (r) => dayKm(arm(r, v, l, x), 3)), bterm: x === 'xp' ? { nonZero: rs.filter((r) => finite(arm(r, v, l, x)?.bterm)).length ? rs.filter((r) => arm(r, v, l, x)?.bterm > 0).length / rs.filter((r) => finite(arm(r, v, l, x)?.bterm)).length : NaN, median: med(rs.map((r) => arm(r, v, l, x)?.bterm)) } : null };
      }
      out.fitLength[l][x].j22Day3 = { median: quad(out.fitLength[l][x].tess2.day3.median, out.fitLength[l][x].zonal.day3.median) }; // the quadrature difference of the group medians (A7b rule 3)
      out.fitLength[l][x].fullDay3 = stat(rs, (r) => dayKm(arm(r, 'full', l, x), 3));
    }
  }
  out.absorption = {};
  for (const v of ['full', 'zonal', 'full-nodrag', 'zonal-nodrag']) {
    out.absorption[v] = {
      xpBterm: { median: med(rs.map((r) => arm(r, v, 'h24', 'xp')?.bterm)), absMedian: med(rs.map((r) => Math.abs(arm(r, v, 'h24', 'xp')?.bterm))), nonZero: rs.filter((r) => arm(r, v, 'h24', 'xp')?.bterm > 0).length, n: rs.filter((r) => arm(r, v, 'h24', 'xp')).length },
      xpAgom: { absMedian: med(rs.map((r) => Math.abs(arm(r, v, 'h24', 'xp')?.agom))), nonZero: rs.filter((r) => arm(r, v, 'h24', 'xp')?.agom > 0).length },
      xpNeither: rs.filter((r) => arm(r, v, 'h24', 'xp') && !(arm(r, v, 'h24', 'xp').bterm > 0) && !(arm(r, v, 'h24', 'xp').agom > 0)).length,
      sgp4Bstar: { absMedian: med(rs.map((r) => Math.abs(arm(r, v, 'h24', 'sgp4')?.bstar))), median: med(rs.map((r) => arm(r, v, 'h24', 'sgp4')?.bstar)) },
      sgp4FittedDay3: stat(rs, (r) => dayKm(arm(r, v, 'h24', 'sgp4'), 3)),
      sgp4FixedDay3: stat(rs, (r) => dayKm(sgp4Fixed(r, v), 3)),
      sgp4FixedFitM: stat(rs, (r) => fitM(sgp4Fixed(r, v))),
      sgp4FittedFitM: stat(rs, (r) => fitM(arm(r, v, 'h24', 'sgp4'))),
    };
  }
  out.btermOverTrueB = {
    full: med(rs.map((r) => (r.bEff > 0 ? arm(r, 'full', 'h24', 'xp')?.bterm / r.bEff : NaN))),
    zonal: med(rs.map((r) => (r.bEff > 0 ? arm(r, 'zonal', 'h24', 'xp')?.bterm / r.bEff : NaN))),
    changeAbs: med(rs.map((r) => (r.bEff > 0 ? Math.abs(arm(r, 'full', 'h24', 'xp')?.bterm - arm(r, 'zonal', 'h24', 'xp')?.bterm) / r.bEff : NaN))),
    fullAtZero: rs.filter((r) => r.bEff > 0 && arm(r, 'full', 'h24', 'xp')?.bterm === 0).length,
    fullAboveDouble: rs.filter((r) => r.bEff > 0 && arm(r, 'full', 'h24', 'xp')?.bterm > 2 * r.bEff).length,
    n: rs.filter((r) => r.bEff > 0 && arm(r, 'full', 'h24', 'xp') && arm(r, 'zonal', 'h24', 'xp')).length,
  };
  return out;
}

export function build() {
  const rows = load();
  const groups = groupRows(rows);
  const summaries = ORDER.filter((g) => groups[g].length).map((g) => summarize(g, groups[g]));
  const starlink = rows.filter((r) => r.family === 'starlink');
  const determinism = { windows: starlink.filter((r) => finite(r.registeredMaxAbsKm)).length, maxAbsKm: Math.max(...starlink.map((r) => r.registeredMaxAbsKm).filter(finite)) };
  const failed = rows.flatMap((r) => Object.entries(r.variants).filter(([, v]) => v.error).map(([k, v]) => ({ family: r.family, id: r.id, variant: k, error: v.error })));
  const get = (g) => summaries.find((s) => s.group === g);
  const rules = decide(get, groups);
  const bterm = Object.fromEntries(['h21_7', 'h24', 'h34_2'].map((l) => {
    const fits = rows.flatMap((r) => Object.keys(r.variants ?? {}).map((v) => arm(r, v, l, 'xp'))).filter(Boolean);
    return [l, { fits: fits.length, bterm: fits.filter((x) => x.bterm > 0).length, agom: fits.filter((x) => x.agom > 0).length }];
  }));
  return { generated: 'from <store>/m123', xpDragTerms: bterm, windows: rows.length, counts: Object.fromEntries(ORDER.map((g) => [g, groups[g].length])), determinism, failed: failed.length, failedList: failed.slice(0, 10), summaries, rules };
}

// The decision rules of A7b.
function decide(get, groups) {
  const out = [];
  // (1) the tesseral share of the XP in-track fit RMS is within 25 % of the predicted floor
  const starGroup = groups['starlink-550km'].length >= 6 ? 'starlink-550km' : 'starlink-inc1';
  const r1 = [starGroup, 'iss', 'lageos1'].map((g) => {
    const s = get(g);
    const share = s?.floor.xp.share.median, predicted = PREDICTED[g].set;
    return { group: g, windows: s?.windows ?? 0, measuredM: share, predictedM: predicted, ratio: share / predicted, pass: finite(share) && Math.abs(share / predicted - 1) <= 0.25 };
  });
  out.push({ rule: '1 floor', detail: r1, pass: r1.every((x) => x.pass) });
  // (2) absorption
  const r2a = ['starlink', 'iss'].map((g) => {
    const s = get(g);
    const a = s?.absorption['full-nodrag'].xpBterm.absMedian, b = s?.absorption['zonal-nodrag'].xpBterm.absMedian;
    return { group: g, fullNoDrag: a, zonalNoDrag: b, ratio: a / b, pass: finite(a) && (b === 0 ? a > 0 : a / b >= 3) };
  });
  const r2b = [['starlink', 'full-nodrag'], ['iss', 'full-nodrag'], ['lageos1', 'full'], ['lageos2', 'full']].map(([g, v]) => {
    const s = get(g);
    const fitted = s?.absorption[v].sgp4FittedDay3.median, fixed = s?.absorption[v].sgp4FixedDay3.median;
    return { group: g, variant: v, fittedDay3Km: fitted, fixedDay3Km: fixed, pass: finite(fitted) && finite(fixed) && fixed < fitted };
  });
  out.push({ rule: '2 absorption', xpBterm: r2a, sgp4FixedBstar: r2b, pass: r2a.every((x) => x.pass) && r2b.every((x) => x.pass) });
  // (3) fit length: the J22 (tess2 minus zonal) share of the XP day-3 error falls by at least 25 % at 21.7 h
  const r3 = ['starlink-inc1', 'iss'].map((g) => {
    const s = get(g);
    const a = s?.fitLength.h24.xp.j22Day3.median, b = s?.fitLength.h21_7.xp.j22Day3.median;
    return { group: g, h24: a, h21_7: b, h34_2: s?.fitLength.h34_2.xp.j22Day3.median, change: b / a - 1, tess2At21_7: s?.fitLength.h21_7.xp.tess2.day3.median, zonalAt21_7: s?.fitLength.h21_7.xp.zonal.day3.median, pass: finite(a) && finite(b) && b <= 0.75 * a };
  });
  out.push({ rule: '3 fit length', detail: r3, pass: r3.every((x) => x.pass) });
  return out;
}

export function markdown(t) {
  const L = [];
  const s = (g) => t.summaries.find((x) => x.group === g);
  const groups = ORDER.filter((g) => s(g));
  L.push('## 12. The LEO fit floor against zonal-only gravity (DESIGN.md M1 to M3)', '');
  L.push(`Plan amendments A7 to A7d. Each window is one start state: ${t.counts.starlink} clean Starlink truths (converged, 0 < B_eff <= 0.5 m2/kg) at their registered start states, ${t.counts.iss} ISS windows (the registered NASA OEM, state turned EME2000 to GCRF), ${t.counts.lageos1 + t.counts.lageos2} LAGEOS-1 and LAGEOS-2 windows (first state of the weekly ILRS orbits of 2026-07-19 to 2026-08-23, drag off). FFM-1 propagates it for 120 h at 60 s under EGM2008 70x70 (\`full\`) and under FFM's own truncations: \`zonal\` (order 0, the zonals to degree 70), \`tess2\` and \`tess6\` (zonals plus the tesseral and sectorial terms to degree 2 or 6), \`order14\` and \`order15\` (orders up to 14 and 15; their difference is the 15th order alone), and, for Starlink and the ISS, \`full-nodrag\` and \`zonal-nodrag\` (drag off). Everything else in the force model (third bodies, solid and ocean tides, relativity, Earth radiation, SRP, and drag where it is on) is the same in every variant, so a difference between two variants is the gravity terms that were dropped. Every variant is fitted by SGP4 and SGP4-XP over 24 h, 21.7 h and 34.2 h and scored on the three held-out days as in section 1; the difference series between variants are taken by \`pair_statistics\` and summarized by a quadratic plus one least-squares sinusoid. ${t.determinism.windows ? `The \`full\` re-propagation reproduces the registered truth to ${t.determinism.maxAbsKm.toExponential(1)} km (largest difference over ${t.determinism.windows} Starlinks).` : ''} ${t.failed ? `${t.failed} variant runs failed and are left out.` : ''}`, '');

  L.push('### 12a. The fit floor (24 h fit, in-track component of the fit RMS, metres)', '');
  L.push('Medians over windows. Tesseral share = median over windows of sqrt(full^2 - zonal^2). Predicted = RMS of the m-daily set of DESIGN.md 2d.3 (a design estimate at the orbit it names).', '');
  L.push('| Group | Windows | XP full | XP zonal | XP tesseral share | Predicted | Share / predicted | SGP4 full | SGP4 zonal | SGP4 share |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |');
  for (const g of groups) {
    const x = s(g), p = PREDICTED[g]?.set;
    L.push(`| ${LABEL[g]} | ${x.windows} | ${f(x.floor.xp.full.median)} | ${f(x.floor.xp.zonal.median)} | ${f(x.floor.xp.share.median)} | ${p ?? '-'} | ${p ? f(x.floor.xp.share.median / p, 2) : '-'} | ${f(x.floor.sgp4.full.median)} | ${f(x.floor.sgp4.zonal.median)} | ${f(x.floor.sgp4.share.median)} |`);
  }
  L.push('', 'The same fit, 3D RMS of the fit (m), and the in-track floor when only part of the field is kept (XP, 24 h):', '');
  L.push('| Group | 3D full | 3D zonal | in-track tess2 | in-track tess6 | in-track order14 | in-track order15 |', '| --- | --: | --: | --: | --: | --: | --: |');
  for (const g of groups) { const x = s(g); L.push(`| ${LABEL[g]} | ${f(x.floor.xp.fit3dFull.median)} | ${f(x.floor.xp.fit3dZonal.median)} | ${f(x.floor.xp.tess2.median)} | ${f(x.floor.xp.tess6.median)} | ${f(x.floor.xp.order14.median)} | ${f(x.floor.xp.order15.median)} |`); }

  L.push('', '### 12b. Day 1 to 3 with and without the tesseral terms (24 h fit, 3D RMS of the held-out day, km)', '');
  L.push('Cells read day 1 / day 2 / day 3, median over windows. Share = how much of the day-3 error the tesseral terms carry: in quadrature, sqrt(full^2 - zonal^2) / full, and linearly, 1 - zonal / full (per window, then the median).', '');
  L.push('| Group | XP full | XP zonal | XP share (quadrature / linear) | SGP4 full | SGP4 zonal | SGP4 share (quadrature / linear) |', '| --- | --- | --- | --- | --- | --- | --- |');
  const dayCell = (x, v) => [1, 2, 3].map((k) => f(x[v][k].median, 2)).join(' / ');
  for (const g of groups) { const x = s(g); L.push(`| ${LABEL[g]} | ${dayCell(x.days.xp, 'full')} | ${dayCell(x.days.xp, 'zonal')} | ${f(100 * x.days.xp.quadShareDay3.median)} % / ${f(100 * x.days.xp.linearShareDay3.median)} % | ${dayCell(x.days.sgp4, 'full')} | ${dayCell(x.days.sgp4, 'zonal')} | ${f(100 * x.days.sgp4.quadShareDay3.median)} % / ${f(100 * x.days.sgp4.linearShareDay3.median)} % |`); }
  L.push('', 'XP, day 1 / 2 / 3, for the partial fields (km):', '');
  L.push('| Group | tess2 | tess6 | order14 | order15 |', '| --- | --- | --- | --- | --- |');
  for (const g of groups) { const x = s(g); L.push(`| ${LABEL[g]} | ${dayCell(x.days.xp, 'tess2')} | ${dayCell(x.days.xp, 'tess6')} | ${dayCell(x.days.xp, 'order14')} | ${dayCell(x.days.xp, 'order15')} |`); }

  L.push('', '### 12c. The along-track difference series (M1)', '');
  L.push('In-track difference between two FFM-1 propagations of the same start state over 120 h, one state per 5 minutes; quadratic trend removed jointly with a sinusoid whose period is scanned from 8 to 16 h. `tess2 - zonal` is the degree-2 tesseral terms alone (J22 and J21); `tess6 - zonal` the terms to degree 6; `full - zonal` all of them. A_22 is the amplitude DESIGN.md 2d.3 predicts for J22.', '');
  L.push('| Group | A_22 predicted (m) | tess2 - zonal: amplitude (m) / period (h) | tess6 - zonal | full - zonal | residual after the fit, full - zonal (m) |', '| --- | --: | --- | --- | --- | --: |');
  for (const g of groups) { const x = s(g), a = PREDICTED[g]?.a22; const c = (k) => `${f(x.pairs[k].amplitudeM.median)} / ${f(x.pairs[k].periodH.median, 2)}`; L.push(`| ${LABEL[g]} | ${a ?? '-'} | ${c('tess2-zonal')} | ${c('tess6-zonal')} | ${c('full-zonal')} | ${f(x.pairs['full-zonal'].residualM.median)} |`); }
  L.push('', '### 12d. The 15th order (the 15:1 resonance of the 53 degree shell), 10-day arcs', '');
  L.push('In-track difference of `order15` against `order14` (the m = 15 terms alone) and of `full` against `order14`, one state per 5 minutes from the same start state. Columns: the median absolute difference at 1, 2, 3, 4, 7 and 10 days (m), then a quadratic plus one sinusoid scanned from 2 to 12 days (amplitude m / period d; a period at the end of the scan means no clear period in 10 days). DESIGN.md 2d.5 predicts 0.79 km at 6.1 days on the 550 km shell.', '');
  L.push('| Group | Windows | order15 - order14 at 1 / 2 / 3 / 4 / 7 / 10 days (m) | sinusoid | full - order14 at 3 / 10 days (m) |', '| --- | --: | --- | --- | --- |');
  for (const g of groups.filter((q) => q.startsWith('starlink'))) {
    const x = s(g), a = x.long['order15-order14'], b = x.long['full-order14'];
    L.push(`| ${LABEL[g]} | ${a.absDay[1].n} | ${[1, 2, 3, 4, 7, 10].map((d) => f(a.absDay[d].median)).join(' / ')} | ${f(a.amplitudeM.median)} / ${f(a.periodD.median, 1)} | ${f(b.absDay[3].median)} / ${f(b.absDay[10].median)} |`);
  }
  L.push('', '### 12e. Fit length (M2): day 3 at 21.7, 24 and 34.2 h', '');
  L.push('Median 3D RMS of held-out day 3 (km), cells read 21.7 h / 24 h / 34.2 h. J22 share = sqrt(tess2^2 - zonal^2) of the group medians. SGP4-XP returns BTERM = 0 for fit spans of 22 h or less, so 21.7 h closes the drag path as well as the J22 alias (a zero of j_2 for the J22 period); 34.2 h is the second zero of j_2 with the drag path open.', '');
  const trio = (x, arm_, v) => ['h21_7', 'h24', 'h34_2'].map((l) => f(x.fitLength[l][arm_][v].day3.median, 2)).join(' / ');
  const trioJ = (x, arm_) => ['h21_7', 'h24', 'h34_2'].map((l) => f(x.fitLength[l][arm_].j22Day3.median, 2)).join(' / ');
  for (const [armName, title] of [['xp', 'SGP4-XP'], ['sgp4', 'SGP4']]) {
    L.push(`${title}:`, '', '| Group | zonal | tess2 | full | J22 share | full-nodrag | zonal-nodrag |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const g of groups) { const x = s(g); L.push(`| ${LABEL[g]} | ${trio(x, armName, 'zonal')} | ${trio(x, armName, 'tess2')} | ${trio(x, armName, 'full')} | ${trioJ(x, armName)} | ${g.startsWith('lageos') ? '-' : trio(x, armName, 'full-nodrag')} | ${g.startsWith('lageos') ? '-' : trio(x, armName, 'zonal-nodrag')} |`); }
    L.push('');
  }
  L.push(`SGP4-XP fits (all windows and variants) with BTERM above 0: ${['h21_7', 'h24', 'h34_2'].map((l) => `${{ h21_7: '21.7', h24: '24', h34_2: '34.2' }[l]} h ${t.xpDragTerms[l].bterm} of ${t.xpDragTerms[l].fits}`).join(', ')}; with AGOM above 0: ${['h21_7', 'h24', 'h34_2'].map((l) => `${t.xpDragTerms[l].agom}`).join(', ')}.`);
  L.push('', '### 12f. Where the tesseral gravity goes (M3)', '');
  L.push('Drag-free truths (\`full-nodrag\`, \`zonal-nodrag\`; LAGEOS in every variant): any BTERM or B* the fit returns is absorbed gravity (and the small SRP). Median of the absolute fitted value over windows, 24 h fit. SGP4 with B* fixed at its true value, 0, is the M3 test in place of XP, whose `fit` has no fixed-B option; day 3 in km.', '');
  L.push('| Group | Truth | XP BTERM (m2/kg), fits with BTERM > 0 | XP AGOM (m2/kg), fits with AGOM > 0 | XP fits with neither | SGP4 B* fitted | SGP4 day 3, B* fitted | SGP4 day 3, B* fixed at 0 | SGP4 fit RMS (m), fitted / fixed |', '| --- | --- | --- | --- | --: | --: | --: | --: | --- |');
  for (const g of groups) {
    const x = s(g);
    for (const v of g.startsWith('lageos') ? ['full', 'zonal'] : ['full-nodrag', 'zonal-nodrag']) {
      const a = x.absorption[v];
      L.push(`| ${LABEL[g]} | ${v} | ${a.xpBterm.absMedian === undefined || !finite(a.xpBterm.absMedian) ? '-' : a.xpBterm.absMedian.toExponential(2)}, ${a.xpBterm.nonZero} of ${a.xpBterm.n} | ${finite(a.xpAgom.absMedian) ? a.xpAgom.absMedian.toExponential(2) : '-'}, ${a.xpAgom.nonZero} of ${a.xpBterm.n} | ${a.xpNeither} of ${a.xpBterm.n} | ${finite(a.sgp4Bstar.absMedian) ? a.sgp4Bstar.absMedian.toExponential(2) : '-'} | ${f(a.sgp4FittedDay3.median, 2)} | ${f(a.sgp4FixedDay3.median, 2)} | ${f(a.sgp4FittedFitM.median)} / ${f(a.sgp4FixedFitM.median)} |`);
    }
  }
  L.push('', 'With the true drag on (Starlink, B_eff from the operator fit), the 24 h XP BTERM over the true B_eff, median over windows, with the field full and zonal; the median absolute change of BTERM when the tesseral terms are removed, in units of B_eff; and the fits whose BTERM is 0 or above twice B_eff with the full field:', '');
  L.push('| Group | Windows | full | zonal | change | full at 0 | full above 2 B_eff |', '| --- | --: | --: | --: | --: | --: | --: |');
  for (const g of ['starlink', 'starlink-inc0', 'starlink-inc1', 'starlink-inc2', 'starlink-inc3'].filter((q) => s(q))) { const b = s(g).btermOverTrueB; L.push(`| ${LABEL[g]} | ${b.n} | ${f(b.full, 2)} | ${f(b.zonal, 2)} | ${f(b.changeAbs, 2)} | ${b.fullAtZero} | ${b.fullAboveDouble} |`); }
  L.push('');
  const star = s('starlink-550km')?.windows >= 6 ? 'starlink-550km' : 'starlink-inc1';
  const have = [star, 'iss', 'lageos1'].filter((g) => s(g));
  if (have.length) {
    L.push('### 12g. What it means for the fit', '');
    const d3 = (g, v, l = 'h24', a = 'xp') => s(g).fitLength[l][a][v].day3.median;
    L.push(`- **The floor is gravity.** In-track fit RMS of best-case XP with the full field against the zonal field only: ${have.map((g) => `${LABEL[g]} ${f(s(g).floor.xp.full.median)} against ${f(s(g).floor.xp.zonal.median)} m`).join('; ')}. The rest of the force model is the same in both, so the difference is the tesseral and sectorial terms and nothing else.`);
    L.push(`- **Day 3 is gravity.** The held-out day-3 error of the same fits, full field against zonal only: ${have.map((g) => `${LABEL[g]} XP ${f(d3(g, 'full'), 2)} against ${f(d3(g, 'zonal'), 2)} km, SGP4 ${f(d3(g, 'full', 'h24', 'sgp4'), 2)} against ${f(d3(g, 'zonal', 'h24', 'sgp4'), 2)} km`).join('; ')}. The zonal-only values are the ceiling for a theory that carries the m-daily terms and fits the same 24 h.`);
    L.push(`- **J22 alone.** Degree-2 tesserals only (\`tess2\`), XP day 3 at 24 h: ${have.map((g) => `${LABEL[g]} ${f(d3(g, 'tess2'), 2)} km`).join('; ')}.`);
    L.push(`- **A longer fit, no new physics.** XP day 3 at 24 h against 34.2 h (full field): ${have.map((g) => `${LABEL[g]} ${f(d3(g, 'full', 'h24'), 2)} against ${f(d3(g, 'full', 'h34_2'), 2)} km`).join('; ')}; SGP4: ${have.map((g) => `${LABEL[g]} ${f(d3(g, 'full', 'h24', 'sgp4'), 2)} against ${f(d3(g, 'full', 'h34_2', 'sgp4'), 2)} km`).join('; ')}. At 21.7 h XP has no drag term, so the same change is large only where the truth has no drag (\`full-nodrag\`) and is a loss where it has.`);
    L.push('');
  }
  L.push('### 12h. Decision rules of A7b', '');
  for (const r of t.rules) {
    if (r.rule === '1 floor') L.push(`- **Rule 1, floor (${r.pass ? 'holds' : 'fails'}).** Tesseral share of the XP in-track fit RMS against the predicted floor: ${r.detail.map((d) => `${LABEL[d.group]} ${f(d.measuredM)} m against ${d.predictedM} m (${f(d.ratio, 2)}, ${d.windows} windows, ${d.pass ? 'within' : 'outside'} 25 %)`).join('; ')}.`);
    if (r.rule === '2 absorption') L.push(`- **Rule 2, absorption (${r.pass ? 'holds' : 'fails'}).** Median |BTERM| of XP on the drag-free truths, full against zonal: ${r.xpBterm.map((d) => `${LABEL[d.group]} ${finite(d.fullNoDrag) ? d.fullNoDrag.toExponential(2) : '-'} against ${finite(d.zonalNoDrag) ? d.zonalNoDrag.toExponential(2) : '-'} (${d.pass ? 'at least 3 times' : 'less than 3 times'})`).join('; ')}. SGP4 day 3 with B* fixed at 0 against B* fitted: ${r.sgp4FixedBstar.map((d) => `${LABEL[d.group]} ${d.variant} ${f(d.fixedDay3Km, 2)} against ${f(d.fittedDay3Km, 2)} km (${d.pass ? 'lower' : 'not lower'})`).join('; ')}.`);
    if (r.rule === '3 fit length') L.push(`- **Rule 3, fit length (${r.pass ? 'holds' : 'fails'}).** J22 share of the XP day-3 error, 24 h to 21.7 h: ${r.detail.map((d) => `${LABEL[d.group]} ${f(d.h24, 2)} to ${f(d.h21_7, 2)} km (${f(100 * d.change)} %${finite(d.h34_2) ? `; 34.2 h ${f(d.h34_2, 2)} km, ${f(100 * (d.h34_2 / d.h24 - 1))} %` : ''}; ${d.pass ? 'at least 25 % lower' : 'not 25 % lower'}; at 21.7 h the tess2 and zonal truths give ${f(d.tess2At21_7, 2)} and ${f(d.zonalAt21_7, 2)} km, so that change is the loss of XP's drag term as much as the alias)`).join('; ')}.`);
  }
  L.push('');
  return L.join('\n');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const t = build();
  write(path.join(results, 'm123.json'), t);
  fs.writeFileSync(path.join(results, 'm123.md'), `${markdown(t)}\n`);
  console.log(`m123: ${t.windows} windows (${Object.entries(t.counts).map(([k, v]) => `${k} ${v}`).join(', ')}); failed runs ${t.failed}; rules ${t.rules.map((r) => `${r.rule} ${r.pass ? 'hold' : 'fail'}`).join(', ')}`);
}
