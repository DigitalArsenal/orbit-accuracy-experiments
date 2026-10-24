// Amendment A10: the aggregation of the events rows (M22, M23, M28, M24, M25) of one build into tables.json and the markdown of section 16. Counting and ordering only; every number comes from the rows.
import fs from 'node:fs';
import path from 'node:path';
import { quantile } from './windows.mjs';
import { buildRows } from './sdngp-rows.mjs';
import { CELLS, LADDER } from './events-cells.mjs';

const q = (list, p) => quantile(list.filter((x) => Number.isFinite(x)), p);
const stats = (list) => ({ n: list.filter((x) => Number.isFinite(x)).length, min: q(list, 0), median: q(list, 0.5), p90: q(list, 0.9), max: q(list, 1) });
const nameOf = (e) => String(e ?? '').split(':')[0].trim() || null;
const DAYS = [1, 2, 3];

/** The rows of one source (empty when none). */
const rowsOf = (dir, source) => (dir ? buildRows(dir, source).filter((r) => r.source === source) : []);
/** The first M24 / M24c rows (amendment A10d): detector scored in an instance with no environment loaded, kept as m24-noenv / m24c-noenv. */
const noEnvironment = (dir, prefix, source) => {
  const rows = dir ? buildRows(dir, prefix).filter((r) => r.source === source) : [];
  if (!rows.length) return null;
  const ok = rows.filter((r) => r.ok), det = ok.flatMap((r) => r.detections);
  const lambda = (d) => Number(/Lambda ([\d.]+)/.exec(d.algorithm ?? '')?.[1]);
  return { windows: rows.length, windowsWithDetection: ok.filter((r) => r.detections.length).length, lambdaMedian: q(det.map(lambda), 0.5) };
};

function m22(dir) {
  const rows = rowsOf(dir, 'm22');
  if (!rows.length) return null;
  const g1 = new Map(buildRows(dir, 'starlink').filter((r) => r.source === 'starlink-ffm' && r.sdngp?.ok).map((r) => [r.norad, r.sdngp.days]));
  const byCase = new Map();
  for (const r of rows) (byCase.get(r.case.id) ?? byCase.set(r.case.id, []).get(r.case.id)).push(r);
  const ctl = byCase.get('ctl') ?? [];
  const sats = new Set(ctl.filter((r) => r.days).map((r) => r.norad));
  const dayMed = (list, k) => q(list.filter((r) => r.days?.[k]).map((r) => r.days[k].rmsKm), 0.5);
  const cases = [...byCase.entries()].filter(([id]) => id !== 'ctl').map(([id, list]) => {
    const ok = list.filter((r) => r.maneuver?.ok && r.days);
    const failures = {}; for (const r of list.filter((x) => !(x.maneuver?.ok && x.days))) { const k = r.truthError ? `truth: ${nameOf(r.truthError)}` : r.fit?.ok === false ? `fit: ${nameOf(r.fit.error)}` : nameOf(r.maneuver?.error); failures[k] = (failures[k] ?? 0) + 1; }
    return { id, kind: list[0].case.kind, axis: list[0].case.axis ?? null, dvMS: list[0].case.dvMS ?? 0, satellites: list.length, scored: ok.length, failures,
      rms: Object.fromEntries(DAYS.map((k) => [k, stats(ok.filter((r) => r.days[k]).map((r) => r.days[k].rmsKm))])),
      excess: Object.fromEntries(DAYS.map((k) => [k, stats(ok.filter((r) => r.days[k] && r.control?.[k]).map((r) => r.days[k].rmsKm - r.control[k].rmsKm))])),
      response: Object.fromEntries(DAYS.map((k) => [k, stats(ok.filter((r) => r.response?.[k] !== undefined).map((r) => r.response[k]))])) };
  });
  return {
    satellites: sats.size, controlMaxDifferenceM: q(ctl.map((r) => r.maxTruthDifferenceM), 1), controlMedianDifferenceM: q(ctl.map((r) => r.maxTruthDifferenceM), 0.5),
    control: Object.fromEntries(DAYS.map((k) => [k, dayMed(ctl, k)])), noManeuverRows: Object.fromEntries(DAYS.map((k) => [k, q([...sats].filter((n) => g1.get(n)?.[k]).map((n) => g1.get(n)[k].rmsKm), 0.5)])),
    controlVsRows: { satellites: [...sats].filter((n) => g1.get(n)).length, maxAbsDifferenceKm: q([...sats].filter((n) => g1.get(n)).flatMap((n) => { const c = ctl.find((r) => r.norad === n); return DAYS.filter((k) => c?.days?.[k] && g1.get(n)[k]).map((k) => Math.abs(c.days[k].rmsKm - g1.get(n)[k].rmsKm)); }), 1) },
    cases,
  };
}

function m23(dir) {
  const rows = rowsOf(dir, 'm23');
  if (!rows.length) return null;
  const byCase = new Map();
  for (const r of rows) (byCase.get(r.case.id) ?? byCase.set(r.case.id, []).get(r.case.id)).push(r);
  const cases = [...byCase.entries()].map(([id, list]) => {
    const arm = (a) => {
      const ok = list.filter((r) => r.arms?.[a]?.ok);
      const failures = {}; for (const r of list.filter((x) => !x.arms?.[a]?.ok)) { const k = r.truthError ? `truth: ${nameOf(r.truthError)}` : r.fit?.ok === false ? `fit: ${nameOf(r.fit.error)}` : nameOf(r.arms?.[a]?.error); failures[k] = (failures[k] ?? 0) + 1; }
      return { scored: ok.length, failures,
        rms: Object.fromEntries(DAYS.map((k) => [k, stats(ok.filter((r) => r.arms[a].days[k]).map((r) => r.arms[a].days[k].rmsKm))])),
        excess: Object.fromEntries(DAYS.map((k) => [k, stats(ok.filter((r) => r.arms[a].days[k] && r.control?.[k]).map((r) => r.arms[a].days[k].rmsKm - r.control[k].rmsKm))])),
        response: Object.fromEntries(DAYS.map((k) => [k, stats(ok.filter((r) => r.arms[a].response?.[k] !== undefined).map((r) => r.arms[a].response[k]))])) };
    };
    const A = arm('A'), B = arm('B');
    return { id, axis: list[0].case.axis, durationMin: list[0].case.durationMin, dvMS: list[0].case.dvMS, satellites: list.length, dLRad: q(list.map((r) => r.dLRad), 0.5), sinc: q(list.map((r) => r.sincHalfDL), 0.5), A, B };
  });
  return { satellites: new Set(rows.map((r) => r.norad)).size, cases };
}

function m28(dir) {
  const rows = rowsOf(dir, 'm28');
  if (!rows.length) return null;
  const cells = CELLS.map((cell) => {
    const list = rows.filter((r) => r.cell.id === cell.id).sort((a, c) => c.level - a.level);
    if (!list.length) return { cell, nodes: 0 };
    const first = (pred) => list.find(pred)?.level ?? null;
    const firstNode = (pred) => list.find(pred) ?? null;
    const err1 = (r) => r.blocks?.[0]?.rmsKm ?? (r.blocks?.[0]?.failed ? Infinity : null);
    const trips = { C1: firstNode((r) => r.truth.C1), C2: firstNode((r) => r.truth.C2), C3: firstNode((r) => r.truth.C3), any: firstNode((r) => r.truth.C1 || r.truth.C2 || r.truth.C3), error1km: firstNode((r) => err1(r) > 1), error10km: firstNode((r) => err1(r) > 10) };
    const lead = Object.fromEntries(Object.entries(trips).map(([k, r]) => [k, r ? r.truth.leadHours : null]));
    const ho = list.find((r) => r.reentry?.ok && r.reentry.handoff);
    return { cell, nodes: list.length, dropped: list[0].droppedLevels, stopUtc: list[0].stopUtc, capped: list[0].capped,
      fitted: list.filter((r) => r.fit?.ok).length, refused: list.filter((r) => r.fit && !r.fit.ok).map((r) => `${r.level}: ${nameOf(r.fit.error)}`),
      firstLevel: { C1: first((r) => r.truth.C1), C2: first((r) => r.truth.C2), C3: first((r) => r.truth.C3), any: first((r) => r.truth.C1 || r.truth.C2 || r.truth.C3), error1km: first((r) => err1(r) > 1), error10km: first((r) => err1(r) > 10) }, leadHoursAtFirst: lead,
      reentryRefused: list.filter((r) => r.reentry && !r.reentry.ok).map((r) => `${r.level}: ${nameOf(r.reentry.error)}`),
      handoffLeadHours: list.filter((r) => r.reentry?.ok && r.reentry.handoff?.epoch && r.truth.leadHours !== null).map((r) => ({ level: r.level, leadHours: r.truth.leadHours - (Date.parse(`${r.reentry.handoff.epoch.replace(/Z$/, '')}Z`) - Date.parse(r.nodeUtc)) / 3600e3, hpKm: r.reentry.handoff.truth?.hpKm ?? null, e: r.reentry.handoff.truth?.e ?? null })),
      firstHandoff: ho ? { level: ho.level } : null };
  });
  // the cells where a criterion trips at a higher level than the error crosses 1 km and 10 km (before), at the same node, or lower (after), and where one of them never happens
  const order = (c, k, thr) => { const a = c.firstLevel[k], e = c.firstLevel[thr]; return a === null && e === null ? 'neither' : a === null ? 'criterion never' : e === null ? 'error never' : a > e ? 'before' : a === e ? 'same' : 'after'; };
  const precedence = Object.fromEntries(['C1', 'C2', 'C3', 'any'].map((k) => [k, Object.fromEntries(['error1km', 'error10km'].map((thr) => { const cnt = {}; for (const c of cells.filter((x) => x.nodes)) { const o = order(c, k, thr); cnt[o] = (cnt[o] ?? 0) + 1; } return [thr, cnt]; }))]));
  const byLevel = LADDER.map((level) => {
    const list = rows.filter((r) => r.level === level);
    if (!list.length) return null;
    const b = (i) => list.filter((r) => r.blocks?.[i]?.rmsKm !== undefined).map((r) => r.blocks[i].rmsKm);
    return { level, nodes: list.length, fitted: list.filter((r) => r.fit?.ok).length, eps1: stats(list.map((r) => r.truth.eps1)), hp: stats(list.map((r) => r.truth.hpKm)), e: stats(list.map((r) => r.truth.e)), daRevKm: stats(list.map((r) => Math.abs(r.truth.daRevKm))),
      leadHours: stats(list.map((r) => r.truth.leadHours)), fitRms: stats(list.filter((r) => r.fit?.ok).map((r) => r.fit.fitRmsKm)), blocks: [0, 1, 2, 3].map((i) => ({ ...stats(b(i)), failed: list.filter((r) => r.blocks?.[i]?.failed).length })),
      share: { C1: list.filter((r) => r.truth.C1).length / list.length, C2: list.filter((r) => r.truth.C2).length / list.length, C3: list.filter((r) => r.truth.C3).length / list.length } };
  }).filter(Boolean);
  const bins = [['over 48 h', (h) => h > 48], ['12 to 48 h', (h) => h > 12 && h <= 48], ['under 12 h', (h) => h <= 12]];
  const reentry = bins.map(([name, test]) => {
    const list = rows.filter((r) => r.reentry?.ok && r.reentry.errorHours !== undefined && r.truth.leadHours !== null && test(r.truth.leadHours));
    return { lead: name, nodes: list.length, errorHours: stats(list.map((r) => r.reentry.errorHours)), absErrorHours: stats(list.map((r) => Math.abs(r.reentry.errorHours))), relativeToLead: stats(list.map((r) => Math.abs(r.reentry.errorHours) / r.truth.leadHours)),
      uncHours: stats(list.map((r) => r.reentry.uncHours)), inWindow: list.filter((r) => r.reentry.inWindow === true).length, windowKnown: list.filter((r) => r.reentry.inWindow !== null && r.reentry.inWindow !== undefined).length,
      handoffFfmErrorHours: stats(list.filter((r) => r.reentry.handoffFfm?.errorHours !== undefined).map((r) => r.reentry.handoffFfm.errorHours)) };
  });
  const failures = {}; for (const r of rows.filter((x) => x.reentry && !x.reentry.ok)) failures[nameOf(r.reentry.error)] = (failures[nameOf(r.reentry.error)] ?? 0) + 1;
  return { cells, precedence, byLevel, reentry, rows: rows.length, fitRefused: rows.filter((r) => r.fit && !r.fit.ok).length, reentryRefusals: failures };
}

function m24(dir) {
  const rows = rowsOf(dir, 'm24');
  if (!rows.length) return null;
  const ok = rows.filter((r) => r.ok);
  const det = ok.flatMap((r) => r.detections.map((d) => ({ ...d, file: r.file, windowStart: r.startUtc })));
  const lambda = (d) => Number(/Lambda ([\d.]+)/.exec(d.algorithm ?? '')?.[1]);
  const days = new Set(rows.map((r) => r.startUtc.slice(0, 10))).size;
  return { windows: rows.length, ok: ok.length, refused: rows.filter((r) => !r.ok).map((r) => nameOf(r.error)), windowsWithDetection: ok.filter((r) => r.detections.length).length, detections: det.length,
    distinctEpochs: new Set(det.map((d) => String(d.epoch).slice(0, 16))).size, dvMS: stats(det.map((d) => Math.hypot(...d.dvMS))), lambda: stats(det.map(lambda)), windowDays: days, objectDays: 29,
    falseAlarmsPerObjectYear: new Set(det.map((d) => String(d.epoch).slice(0, 16))).size / (29 / 365.25), noEnvironment: noEnvironment(dir, 'm24-noenv', 'm24') };
}

const HIT_MIN = 92; // one orbit
const DV_BINS = [['0.1 to 0.3 m/s', 0, 0.35], ['0.4 to 0.6 m/s', 0.35, 0.65], ['0.7 to 1.0 m/s', 0.65, 1.05], ['above 1.0 m/s', 1.05, Infinity]];

/** M24 on NASA's archive (amendment A11): burn windows (pre and post files) and burn-free windows, scored against the headers' planned TIG and delta-v. */
function m24a(dir, resultsDir) {
  const rows = rowsOf(dir, 'm24a');
  if (!rows.length) return null;
  const file = path.join(resultsDir, 'iss-burns.json');
  const burns = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const ok = rows.filter((r) => r.ok);
  const lam = (d) => Number(/Lambda ([\d.]+)/.exec(d.algorithm ?? '')?.[1]);
  const burnGroup = (kind) => {
    const rs = ok.filter((r) => r.kind === kind && r.plannedDvMS !== undefined);
    const scored = rs.map((r) => {
      const tig = Date.parse(r.tigUtc), d = r.detections[0] ?? null;
      const errMin = d ? (Date.parse(`${d.epoch.replace(/Z?$/, 'Z')}`) - tig) / 60000 : null;
      const mag = d ? Math.hypot(...d.dvMS) : null;
      return { r, d, errMin, hit: d !== null && Math.abs(errMin) <= HIT_MIN, mag, ratio: d ? mag / r.plannedDvMS : null, vShare: d ? Math.abs(d.dvMS[1]) / mag : null, planned: r.plannedDvMS, multi: (r.otherBurns ?? []).length > 0 };
    });
    const hits = scored.filter((x) => x.hit);
    const bins = DV_BINS.map(([name, lo, hi]) => { const b = scored.filter((x) => x.planned >= lo && x.planned < hi); return { name, windows: b.length, hits: b.filter((x) => x.hit).length }; });
    return { windows: rs.length, refused: rows.filter((r) => r.kind === kind && !r.ok).length, hits: hits.length, wrongEpoch: scored.filter((x) => x.d && !x.hit).length, none: scored.filter((x) => !x.d).length, multi: scored.filter((x) => x.multi).length,
      epochErrorMin: { median: q(hits.map((x) => x.errMin), 0.5), p10: q(hits.map((x) => x.errMin), 0.1), p90: q(hits.map((x) => x.errMin), 0.9), maxAbs: q(hits.map((x) => Math.abs(x.errMin)), 1) },
      dvRatio: { median: q(hits.map((x) => x.ratio), 0.5), p10: q(hits.map((x) => x.ratio), 0.1), p90: q(hits.map((x) => x.ratio), 0.9) }, dvAbsErrorMS: q(hits.map((x) => Math.abs(x.mag - x.planned)), 0.5), vShare: q(hits.map((x) => x.vShare), 0.5),
      lambda: { median: q(scored.filter((x) => x.d).map((x) => lam(x.d)), 0.5) }, bins };
  };
  const free = ok.filter((r) => r.kind === 'free');
  const det = free.flatMap((r) => r.detections.map((d) => ({ ms: Date.parse(`${d.epoch.replace(/Z?$/, 'Z')}`), mag: Math.hypot(...d.dvMS), lambda: lam(d) }))).sort((a, b) => a.ms - b.ms);
  const distinct = []; for (const d of det) if (!distinct.length || d.ms - distinct.at(-1).ms > 6 * 3600e3) distinct.push(d);
  const spans = free.map((r) => [Date.parse(r.startUtc), Date.parse(r.stopUtc)]).sort((a, b) => a[0] - b[0]);
  let covered = 0, end = -Infinity; for (const [a, b] of spans) { if (b > end) { covered += b - Math.max(a, end); end = b; } }
  const years = covered / (365.25 * 86400e3);
  return { files: new Set(rows.map((r) => r.file)).size, clusters: burns?.clusters?.length ?? null, notScored: burns?.notScored ?? null, pre: burnGroup('burn-pre'), post: burnGroup('burn-post'),
    free: { windows: free.length, refused: rows.filter((r) => r.kind === 'free' && !r.ok).length, windowsWithDetection: free.filter((r) => r.detections.length).length, detections: det.length, distinctEpochs: distinct.length, coverageYears: years, falseAlarmsPerObjectYear: distinct.length / years,
      dvMS: stats(det.map((d) => d.mag)), lambda: stats(det.map((d) => d.lambda)) } };
}

/**
 * M25: the module's treatment of each Moon-centered window against the truth-side maneuver list (lunar-maneuvers.json, amendment A9f). A segment starts at the arc start plus
 * USER_DEFINED_SDNGP_MANEUVER_BEFORE_SECONDS (the rows of the previous build show it: a 72 h arc with a listed maneuver 45.5 h after its start has 172,800 s); the lag is that start minus the
 * last listed maneuver inside the fit span (positive: the segment starts after it).
 */
function m25(dir, resultsDir) {
  const file = path.join(resultsDir, 'lunar-maneuvers.json');
  if (!dir || !fs.existsSync(file)) return null;
  const list = JSON.parse(fs.readFileSync(file, 'utf8')).packs;
  const rows = buildRows(dir, 'lunar').filter((r) => r.sdngp && ['lro-lunar', 'danuri-lunar'].includes(r.source));
  if (!rows.length) return null;
  const treat = (sd) => (!sd?.ok ? 'refused' : sd.params?.SDNGP_MANEUVER_BEFORE_SECONDS !== undefined ? 'segment' : 'whole');
  return ['lro-lunar', 'danuri-lunar'].map((pack) => {
    const events = list[pack].events.map((e) => ({ ...e, ms: Date.parse(e.epochUtc) }));
    const ws = rows.filter((r) => r.source === pack).map((r) => {
      const start = Date.parse(r.startUtc), fitEnd = start + r.fitSeconds * 1000, end = fitEnd + 3 * 86400e3;
      const inFit = events.filter((e) => e.ms >= start && e.ms <= fitEnd), inHeld = events.filter((e) => e.ms > fitEnd && e.ms <= end);
      const t = treat(r.sdngp), mb = r.sdngp.maneuverBeforeSeconds ?? Number(r.sdngp.params?.SDNGP_MANEUVER_BEFORE_SECONDS);
      const segStart = t === 'segment' && Number.isFinite(mb) ? start + mb * 1000 : null;
      const lag = segStart !== null && inFit.length ? (segStart - inFit.at(-1).ms) / 3600e3 : null;
      return { t, inFit: inFit.length > 0, inHeldOnly: inFit.length === 0 && inHeld.length > 0, lagHours: lag, day3: r.sdngp.days?.[3]?.rmsKm ?? null };
    });
    const grp = (f) => ws.filter(f);
    const split = (g) => ({ windows: g.length, whole: g.filter((w) => w.t === 'whole').length, segment: g.filter((w) => w.t === 'segment').length, refused: g.filter((w) => w.t === 'refused').length });
    const withFit = grp((w) => w.inFit);
    return { pack, windows: ws.length, maneuversListed: events.length, inFitSpan: split(withFit), heldOutOnly: split(grp((w) => w.inHeldOnly)), none: split(grp((w) => !w.inFit && !w.inHeldOnly)),
      lagHours: stats(withFit.map((w) => w.lagHours)), segmentStartsAfterLast: withFit.filter((w) => w.lagHours !== null && w.lagHours >= 0).length, segmentStartsBeforeLast: withFit.filter((w) => w.lagHours !== null && w.lagHours < 0).length,
      day3: { whole: q(ws.filter((w) => w.t === 'whole').map((w) => w.day3), 0.5), segment: q(ws.filter((w) => w.t === 'segment').map((w) => w.day3), 0.5) } };
  });
}

function m24c(dir) {
  const rows = rowsOf(dir, 'm24c');
  if (!rows.length) return null;
  const ok = rows.filter((r) => r.ok), det = ok.flatMap((r) => r.detections.map((d) => ({ ...d, norad: r.norad })));
  const lambda = (d) => Number(/Lambda ([\d.]+)/.exec(d.algorithm ?? '')?.[1]);
  const sats = new Set(rows.map((r) => r.norad)).size, objectDays = sats * 4;
  const distinct = new Set(det.map((d) => `${d.norad}|${String(d.epoch).slice(0, 16)}`)).size;
  return { windows: rows.length, ok: ok.length, refused: rows.filter((r) => !r.ok).map((r) => nameOf(r.error)), satellites: sats, windowsWithDetection: ok.filter((r) => r.detections.length).length, detections: det.length, distinctEpochs: distinct,
    dvMS: stats(det.map((d) => Math.hypot(...d.dvMS))), lambda: stats(det.map(lambda)), objectDays, falseAlarmsPerObjectYear: distinct / (objectDays / 365.25), noEnvironment: noEnvironment(dir, 'm24c-noenv', 'm24c') };
}

export function eventsStudy(dir, resultsDir) { return dir ? { build: path.basename(dir), m22: m22(dir), m23: m23(dir), m28: m28(dir), m24: m24(dir), m24c: m24c(dir), m24a: m24a(dir, resultsDir), m25: m25(dir, resultsDir) } : null; }

// ---- markdown (section 16) ----
const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(d));
const AX = { U: 'U (radial)', V: 'V (in-track)', W: 'W (cross-track)' };

export function eventsMarkdown(e) {
  if (!e) return [];
  const L = [];
  L.push('### 16b. Maneuvers, the reentry hand-off, ISS and lunar maneuver detection', '',
    `Build ${e.build}. The truths of M22, M23 and M28 are FFM-1 (propagator/ffm), not the module's own Cowell integration: impulses and finite burns planted in its typed request, synthetic decays integrated to its own stop at 100 km geodetic altitude.`, '');
  if (e.m22) {
    const m = e.m22;
    L.push('#### M22. The impulse map', '',
      `${m.satellites} registered Starlink truths (every fifth in NORAD order). Each is fitted as in the G1 rows (first 24 h), \`maneuver\` applies one impulse of the stated size at the fit end t_b, and days 1 to 3 after t_b are scored against FFM-1 restarted 60 s before t_b with the same impulse planted. The control restarts FFM-1 without an impulse and reproduces the registered truth to ${f(m.controlMedianDifferenceM, 3)} m (median) and ${f(m.controlMaxDifferenceM, 3)} m (largest) over the 864 samples; its day 1 / 2 / 3 median RMS is ${DAYS.map((k) => f(m.control[k])).join(' / ')} km against ${DAYS.map((k) => f(m.noManeuverRows[k])).join(' / ')} km for the no-maneuver rows of this build for the same satellites (largest difference per satellite and day ${f(m.controlVsRows.maxAbsDifferenceKm, 4)} km over ${m.controlVsRows.satellites}).`, '',
      'Median 3D RMS by day (km), the excess over the control of the same satellite (median; 90th percentile) and the response error (RMS over the day of the difference between the maneuvered and unmaneuvered SDN-AP trajectories, less the same difference of FFM-1: median; maximum):', '',
      '| Case | Satellites | Day 1 | Day 2 | Day 3 | Excess day 1 | Excess day 2 | Excess day 3 | Response day 1 | Response day 3 |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |',
      ...m.cases.map((c) => `| ${c.kind === 'map0' ? 'zero delta-v through the map' : `${AX[c.axis]} ${c.dvMS} m/s`} | ${c.scored} of ${c.satellites} | ${DAYS.map((k) => f(c.rms[k].median)).join(' | ')} | ${[1, 2, 3].map((k) => `${f(c.excess[k].median)} (${f(c.excess[k].p90)})`).join(' | ')} | ${f(c.response[1].median)} (${f(c.response[1].max)}) | ${f(c.response[3].median)} (${f(c.response[3].max)}) |`), '',
      ...(m.cases.some((c) => Object.keys(c.failures).length) ? [`Refusals and failures by name: ${m.cases.filter((c) => Object.keys(c.failures).length).map((c) => `${c.id} ${Object.entries(c.failures).map(([k, v]) => `${k} ${v}`).join(', ')}`).join('; ')}.`, ''] : []));
  }
  if (e.m23) {
    const m = e.m23;
    L.push('#### M23. Finite burns', '',
      `${m.satellites} satellites (every tenth). Burns of 1 to 60 min along U, V or W at constant acceleration in the RTN axes from t_b, with total delta-v of 0.1 or 1 m/s; FFM-1 in two stages. Arm A: the module's finite-burn map (\`maneuver\` with EVENT_START_TIME t_b and EVENT_END_TIME t_b + D: the eccentricity-vector and plane changes scaled by sinc(dL/2)); arm B: a centroid impulse (EVENT_START_TIME t_b + D/2, no duration). Excess over the control of the same satellite, median km (the states inside the burn are not scored); sinc(dL/2) is printed for orientation, from the fit's mean motion:`, '',
      '| Burn | Satellites A / B | dL (rad) | sinc(dL/2) | Excess day 1 A / B | Excess day 3 A / B | Response day 3 A / B (median; max of A) |', '| --- | --: | --: | --: | --- | --- | --- |',
      ...m.cases.map((c) => `| ${AX[c.axis]} ${c.durationMin} min ${c.dvMS} m/s | ${c.A.scored} / ${c.B.scored} | ${f(c.dLRad, 2)} | ${f(c.sinc, 3)} | ${f(c.A.excess[1].median)} / ${f(c.B.excess[1].median)} | ${f(c.A.excess[3].median)} / ${f(c.B.excess[3].median)} | ${f(c.A.response[3].median)} / ${f(c.B.response[3].median)} (${f(c.A.response[3].max)}) |`), '');
  }
  if (e.m28) {
    const m = e.m28;
    L.push('#### M28. The hand-off criteria and the reentry epoch', '',
      `${m.cells.filter((c) => c.nodes).length} synthetic decays integrated by FFM-1 to its stop at 100 km (T100), ${m.rows} nodes in all (the first sample at which the revolution-mean perigee height falls below a level of the ladder), the SDN-AP set fitted on the truth up to the node (the module chooses its span), scored on the next 12 h in four 3 h blocks, and \`reentry\` on the same set. eps1 is 2 |da_rev| / H with H FFM-1's NRLMSISE-00 density scale height at the perigee; the module's own H is not exposed. By level, pooled over the cells (median of the nodes; block errors are the median 3D RMS in km):`, '',
      '| Level (km) | Nodes (fitted) | h_p | e | da_rev (km) | eps1 | C1 / C2 / C3 tripped | Fit RMS | Block 1 | Block 2 | Block 3 | Block 4 |', '| --: | --: | --: | --: | --: | --: | --- | --: | --: | --: | --: | --: |',
      ...m.byLevel.map((g) => `| ${g.level} | ${g.nodes} (${g.fitted}) | ${f(g.hp.median, 1)} | ${f(g.e.median, 4)} | ${f(g.daRevKm.median)} | ${f(g.eps1.median, 4)} | ${['C1', 'C2', 'C3'].map((c) => `${Math.round(g.share[c] * 100)} %`).join(' / ')} | ${f(g.fitRms.median)} | ${g.blocks.map((x) => `${f(x.median)}${x.failed ? ` (${x.failed} failed)` : ''}`).join(' | ')} |`), '',
      'By cell: T100, the first level at which each criterion trips on the truth, and the first level at which the block-1 error exceeds 1 km and 10 km (a criterion is useful when its level is above the error\'s):', '',
      '| Cell | T100 (days) | Nodes (fitted) | C1 | C2 | C3 | Any | Error over 1 km | Error over 10 km | Hand-off lead before T100 at the first node (h) |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |',
      ...m.cells.filter((c) => c.nodes).map((c) => `| ${c.cell.id} | ${c.stopUtc ? f((Date.parse(c.stopUtc) - Date.parse('2025-10-24T00:00:00Z')) / 86400000, 1) : 'capped'} | ${c.nodes} (${c.fitted}) | ${['C1', 'C2', 'C3', 'any'].map((k) => c.firstLevel[k] ?? 'never').join(' | ')} | ${c.firstLevel.error1km ?? 'never'} | ${c.firstLevel.error10km ?? 'never'} | ${c.handoffLeadHours[0] ? f(c.handoffLeadHours[0].leadHours, 1) : ''} |`), '',
      'The module\'s reentry epoch (at 80 km) against FFM-1\'s stop at 100 km, by lead time before T100 (signed hours, REENTRY_EPOCH - T100; the descent between the two altitudes is not removed):', '',
      '| Lead | Nodes | Error median | |Error| median | |Error| max | |Error| / lead (median) | Uncertainty (median, h) | T100 inside the window | FFM-1 from the hand-off state, error median (h) |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: |',
      ...m.reentry.map((r) => `| ${r.lead} | ${r.nodes} | ${f(r.errorHours.median, 2)} | ${f(r.absErrorHours.median, 2)} | ${f(r.absErrorHours.max, 2)} | ${f(r.relativeToLead.median, 4)} | ${f(r.uncHours.median, 2)} | ${r.inWindow} of ${r.windowKnown} | ${f(r.handoffFfmErrorHours.median, 2)} |`), '',
      `Fits refused: ${m.fitRefused}. \`reentry\` refused: ${Object.keys(m.reentryRefusals).length ? Object.entries(m.reentryRefusals).map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}. Cells not completed: ${m.cells.filter((c) => !c.nodes).map((c) => c.cell.id).join(', ') || 'none'}.`, '');
  }
  if (e.m24) {
    const m = e.m24;
    L.push('#### M24. The ISS ephemerides through `detect_maneuvers`', '',
      `The two distinct NASA OEM files in the archive (created 2026-10-07 and 2026-10-21; 15 days each, 29 object-days together) hold no reboost: the event table of the first lists docking, departure and launch events with delta-v 0.0, the second carries none. ${m.windows} windows of 72 h (every 24 h, every 240 s state, TEME by foundation/frames): ${m.ok} answered, ${m.refused.length} refused (${m.refused.join(', ') || 'none'}); ${m.windowsWithDetection} windows reported a burn (${m.detections} detections at ${m.distinctEpochs} distinct epochs; delta-v median ${f(m.dvMS.median, 3)} m/s, maximum ${f(m.dvMS.max, 3)} m/s; Lambda median ${f(m.lambda.median, 0)}). Every detection is a false alarm: ${f(m.falseAlarmsPerObjectYear, 1)} per object-year over the distinct epochs. The detector ran with the saved space-weather table loaded (\`load_environment\`, amendment A10d)${m.noEnvironment ? `; in an instance with no environment loaded the same windows gave ${m.noEnvironment.windowsWithDetection} of ${m.noEnvironment.windows} with a detection (Lambda median ${f(m.noEnvironment.lambdaMedian, 0)})` : ''}. Detection of real reboosts and the errors of delta-v and epoch need the NASA archive of past OEM headers (TIG, DV, HA, HP), which the local archive does not hold.`, '');
    if (e.m24c) { const c = e.m24c; L.push(`Control on burn-free FFM-1 arcs (A10c): ${c.windows} windows of 72 h on ${c.satellites} registered Starlink truths (one integration from one state, 300 s states): ${c.windowsWithDetection} windows reported a burn (${c.detections} detections at ${c.distinctEpochs} distinct epochs${c.detections ? `; delta-v median ${f(c.dvMS.median, 3)} m/s, maximum ${f(c.dvMS.max, 3)} m/s; Lambda median ${f(c.lambda.median, 0)}` : ''}), ${f(c.falseAlarmsPerObjectYear, 1)} per object-year over ${c.objectDays} object-days; refused: ${c.refused.length ? c.refused.join(', ') : 'none'}${c.noEnvironment ? `; with no environment loaded: ${c.noEnvironment.windowsWithDetection} of ${c.noEnvironment.windows} (Lambda median ${f(c.noEnvironment.lambdaMedian, 0)})` : ''}.`, ''); }
  }
  if (e.m24a) {
    const m = e.m24a;
    const row = (name, g) => `| ${name} | ${g.windows} | ${g.hits} | ${g.wrongEpoch} | ${g.none} | ${f(g.epochErrorMin.median, 1)} [${f(g.epochErrorMin.p10, 1)}, ${f(g.epochErrorMin.p90, 1)}] | ${f(g.dvRatio.median, 2)} [${f(g.dvRatio.p10, 2)}, ${f(g.dvRatio.p90, 2)}] | ${f(g.dvAbsErrorMS, 2)} | ${f(g.vShare, 2)} |`;
    L.push('#### M24 on NASA\'s ISS archive (amendment A11)', '',
      `${m.files} OEM files of the archive (NASA JSC FOD TOPO; dated folders 2020 to 2026, fetched 2026-10-24), ${m.clusters} distinct planned burns (header events with a delta-v above zero, TIGs within 12 h taken as one burn)${m.notScored?.length ? `, ${m.notScored.length} not scored (no file with 12 h of states before the burn and 24 h after)` : ''}. TIG and delta-v are the headers' planned values, not measurements of the executed burns. Each window is 72 h, every state (TEME by foundation/frames), \`detect_maneuvers\` with the daily space weather of the years loaded (\`load_environment\`). A detection within ${HIT_MIN} min (one orbit) of TIG is a hit; the epoch error is the detected epoch less TIG, the delta-v ratio the detected |delta-v| over the planned one (median [10th, 90th percentile] over the hits):`, '',
      '| Window | Windows | Hits | Detection elsewhere | No detection | Epoch error (min) | |Delta-v| / planned | |Delta-v| error (m/s) | V share of delta-v |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: |',
      row('pre-burn file (burn still to come)', m.pre), row('post-burn file (burn behind its start)', m.post), '',
      'Hits by planned delta-v (pre-burn files / post-burn files):', '', '| Planned delta-v | Pre: windows | Pre: hits | Post: windows | Post: hits |', '| --- | --: | --: | --: | --: |',
      ...m.pre.bins.map((b, i) => `| ${b.name} | ${b.windows} | ${b.hits} | ${m.post.bins[i].windows} | ${m.post.bins[i].hits} |`), '',
      `Burn-free windows (the leading 72 h of every file whose header lists no burn in or within an hour of it): ${m.free.windows} windows (${m.free.refused} refused) covering ${f(m.free.coverageYears, 2)} object-years; ${m.free.windowsWithDetection} windows reported a burn (${m.free.detections} detections, ${m.free.distinctEpochs} distinct epochs merged within 6 h; delta-v median ${f(m.free.dvMS.median, 3)} m/s, maximum ${f(m.free.dvMS.max, 3)} m/s; Lambda median ${f(m.free.lambda.median, 0)}): ${f(m.free.falseAlarmsPerObjectYear, 1)} false alarms per object-year.`, '');
  }
  if (e.m25) {
    L.push('#### M25. LRO and Danuri against the truth-side maneuver list', '',
      'The module\'s treatment of each Moon-centered window (the whole arc, a segment, a refusal by name) against the maneuvers of the list (`lunar-maneuvers.json`) inside the fit span, inside the held-out days only, or none. A segment starts at the arc start plus USER_DEFINED_SDNGP_MANEUVER_BEFORE_SECONDS; the lag is that start minus the last listed maneuver in the fit span (positive: the segment starts after it).', '',
      '| Body | Windows | Listed maneuvers | In the fit span: whole / segment / refused | Held-out days only: whole / segment / refused | None: whole / segment / refused | Lag (h): median [min, max] | Segment after / before the last maneuver | Day 3 median: whole / segment |', '| --- | --: | --: | --- | --- | --- | --- | --- | --- |',
      ...e.m25.map((b) => `| ${b.pack === 'lro-lunar' ? 'LRO' : 'Danuri'} | ${b.windows} | ${b.maneuversListed} | ${b.inFitSpan.whole} / ${b.inFitSpan.segment} / ${b.inFitSpan.refused} | ${b.heldOutOnly.whole} / ${b.heldOutOnly.segment} / ${b.heldOutOnly.refused} | ${b.none.whole} / ${b.none.segment} / ${b.none.refused} | ${f(b.lagHours.median, 1)} [${f(b.lagHours.min, 1)}, ${f(b.lagHours.max, 1)}] | ${b.segmentStartsAfterLast} / ${b.segmentStartsBeforeLast} | ${f(b.day3.whole)} / ${f(b.day3.segment)} |`), '');
  }
  return L;
}
