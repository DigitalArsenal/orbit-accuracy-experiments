// Amendment A10: the aggregation of the events rows (M22, M23, M28, M24, M25) of one build into tables.json and the markdown of section 16. Counting and ordering only; every number comes from the rows.
import fs from 'node:fs';
import path from 'node:path';
import { quantile } from './windows.mjs';
import { buildRows } from './sdngp-rows.mjs';
import { store } from '../common.mjs';
import { CELLS, LADDER } from './events-cells.mjs';
import { PLANTED_CASES, ARC_HOURS } from './events-plant.mjs';

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
  return { files: new Set(rows.map((r) => r.file)).size, filesInArchive: burns?.files?.count ?? null, clusters: burns?.clusters?.length ?? null, notScored: burns?.notScored ?? null, pre: burnGroup('burn-pre'), post: burnGroup('burn-post'),
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



/** The diagnostic of the ISS pre-burn windows (amendments A12c and A12d): the stretch before the burn, 48 h across it, the stretch after it and a tight window. */
function m24b(dir) {
  const rows = rowsOf(dir, 'm24b');
  if (!rows.length) return null;
  const lam = (d) => Number(/Lambda ([\d.e+]+)/.exec(d.algorithm ?? '')?.[1]);
  const t = (iso) => Date.parse(`${String(iso).replace(/Z?$/, 'Z')}`);
  return ['sub-before', 'sub-across', 'sub-after', 'sub-tight', 'sub-p6', 'sub-p8', 'sub-p24'].map((kind) => {
    const rs = rows.filter((r) => r.kind === kind), ok = rs.filter((r) => r.ok), det = ok.filter((r) => r.detections.length);
    const off = (r) => (t(r.detections[0].epoch) - t(r.tigUtc)) / 3600e3, pos = (r) => (t(r.detections[0].epoch) - t(r.startUtc)) / (t(r.stopUtc) - t(r.startUtc)), mag = (r) => Math.hypot(...r.detections[0].dvMS);
    const hits = det.filter((r) => Math.abs(off(r)) <= HIT_MIN / 60), elsewhere = det.filter((r) => Math.abs(off(r)) > HIT_MIN / 60);
    return { kind, windows: rs.length, skipped: count(rs.filter((r) => r.skipped).map((r) => String(r.skipped).replace(/\d+ states/, 'few states').replace(/cluster \d+/, 'cluster'))), scored: ok.length, refused: rs.filter((r) => r.ok === false).length,
      withDetection: det.length, hits: hits.length, elsewhere: elsewhere.length, none: ok.length - det.length, offsetHours: { median: q(elsewhere.map(off), 0.5), p10: q(elsewhere.map(off), 0.1), p90: q(elsewhere.map(off), 0.9) },
      position: { median: q(det.map(pos), 0.5), p10: q(det.map(pos), 0.1), p90: q(det.map(pos), 0.9) }, dvMS: q(det.map(mag), 0.5), lambda: q(det.map((r) => lam(r.detections[0])), 0.5), hitDvOverPlanned: q(hits.map((r) => mag(r) / r.plannedDvMS), 0.5), hitDvOverPlannedSpread: { p10: q(hits.map((r) => mag(r) / r.plannedDvMS), 0.1), p90: q(hits.map((r) => mag(r) / r.plannedDvMS), 0.9) },
      hitEpochErrorMin: { median: q(hits.map((r) => off(r) * 60), 0.5), p10: q(hits.map((r) => off(r) * 60), 0.1), p90: q(hits.map((r) => off(r) * 60), 0.9) }, hitVShare: q(hits.map((r) => Math.abs(r.detections[0].dvMS[1]) / mag(r)), 0.5) };
  });
}


// ---- M27 (amendment A14): the detector against the forecast delta-V outages of the GPS NANUs and the QZSS NAQUs ----
const M27_TOL_H = 6, M27_MERGE_H = 6;
function m27(dir, resultsDir) {
  const rows = rowsOf(dir, 'm27');
  const file = path.join(resultsDir, 'gnss-notice-events.json');
  if (!rows.length || !fs.existsSync(file)) return null;
  const notices = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t = (iso) => Date.parse(iso), H = 3600e3;
  const lam = (d) => Number(/Lambda ([\d.e+]+)/.exec(d.algorithm ?? '')?.[1]);
  return ['gps', 'qzss'].map((system) => {
    const srows = rows.filter((r) => r.system === system), ev = notices[system];
    const sats = [...new Set(srows.map((r) => r.norad))].sort((a, c) => a - c);
    const perSat = sats.map((norad) => {
      const rs = srows.filter((r) => r.norad === norad).sort((a, c) => (a.startUtc < c.startUtc ? -1 : 1)), ok = rs.filter((r) => r.ok);
      const svn = rs[0].svn;
      // the union of the answered windows (contiguous stretches), the distinct detections (merged within 6 h)
      const spans = ok.map((r) => [t(r.startUtc), t(r.stopUtc)]).sort((a, c) => a[0] - c[0]);
      const union = []; for (const sp of spans) { const last = union.at(-1); if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]); else union.push([...sp]); }
      const dets = ok.flatMap((r) => r.detections.map((d) => ({ ms: t(`${d.epoch.replace(/Z?$/, 'Z')}`), mag: Math.hypot(...d.dvMS), lambda: lam(d), vShare: Math.abs(d.dvMS[1]) / Math.hypot(...d.dvMS) }))).sort((a, c) => a.ms - c.ms);
      const distinct = []; for (const d of dets) if (!distinct.length || d.ms - distinct.at(-1).ms > M27_MERGE_H * H) distinct.push(d);
      const covered = (a, b) => union.some(([u, v]) => u <= a && v >= b);
      const years = union.reduce((s2, [u, v]) => s2 + (v - u), 0) / (365.25 * 86400e3);
      const outages = ev.deltaV.filter((e) => e.svn === svn).map((e) => ({ f: [t(e.forecast.start), t(e.forecast.stop)], a: e.actual ? [t(e.actual.start), t(e.actual.stop)] : null, number: e.number }));
      const inAny = (ms, list, tol) => list.some(([a, b]) => ms >= a - tol * H && ms <= b + tol * H);
      const scoreable = outages.filter((o) => covered(o.f[0] - M27_TOL_H * H, o.f[1] + M27_TOL_H * H));
      const dvWindows = outages.map((o) => o.f);
      // amendment A14b: the off-notice window rate. The same window (the interval plus or minus 6 h) at every whole hour of the answered span where it lies inside the answered windows and overlaps no forecast window (+-6 h) of this satellite: the share that holds a distinct detection.
      const hasDetection = (a, b) => { let lo = 0, hi = distinct.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (distinct[mid].ms < a) lo = mid + 1; else hi = mid; } return lo < distinct.length && distinct[lo].ms <= b; };
      const offNotice = (width) => {
        let n = 0, hit = 0;
        for (const [u, v] of union) for (let st = Math.ceil(u / H) * H; st + width <= v; st += H) {
          if (dvWindows.some(([a, b]) => st < b + M27_TOL_H * H && st + width > a - M27_TOL_H * H)) continue;
          n++; if (hasDetection(st, st + width)) hit++;
        }
        return { n, hit, rate: n ? hit / n : null };
      };
      const eventRows = scoreable.map((o) => {
        const hitF = distinct.filter((d) => inAny(d.ms, [o.f], M27_TOL_H)), hitA = o.a ? distinct.filter((d) => inAny(d.ms, [o.a], M27_TOL_H)) : [];
        const nullF = offNotice(o.f[1] - o.f[0] + 2 * M27_TOL_H * H), nullA = o.a ? offNotice(o.a[1] - o.a[0] + 2 * M27_TOL_H * H) : { n: 0, rate: null };
        return { number: o.number, forecastHours: (o.f[1] - o.f[0]) / H, actualHours: o.a ? (o.a[1] - o.a[0]) / H : null, hitForecast: hitF.length > 0, hitActual: o.a ? hitA.length > 0 : null, offsetHours: hitA.length ? (hitA[0].ms - o.a[0]) / H : null, mag: hitF[0]?.mag ?? null,
          nullForecast: nullF, nullActual: nullA, widthForecast: o.f[1] - o.f[0] + 2 * M27_TOL_H * H, widthActual: o.a ? o.a[1] - o.a[0] + 2 * M27_TOL_H * H : null };
      });
      // amendment A14c: window-level rates. A window holds an outage when it contains the whole actual interval; it is clear when it overlaps no forecast window (+-6 h) of its satellite.
      const okWins = ok.map((r) => ({ a: t(r.startUtc), b: t(r.stopUtc), dets: r.detections.map((d) => t(`${d.epoch.replace(/Z?$/, 'Z')}`)) }));
      const holdOf = (w) => outages.filter((o) => o.a && w.a <= o.a[0] && w.b >= o.a[1]);
      const holding = okWins.filter((w) => holdOf(w).length), clearWins = okWins.filter((w) => !dvWindows.some(([a, b]) => w.a < b + M27_TOL_H * H && w.b > a - M27_TOL_H * H));
      const windowLevel = { holding: holding.length, holdingWithDetection: holding.filter((w) => w.dets.length).length, holdingDetectionInActual: holding.filter((w) => holdOf(w).some((o) => w.dets.some((d) => inAny(d, [o.a], M27_TOL_H)))).length, clear: clearWins.length, clearWithDetection: clearWins.filter((w) => w.dets.length).length };
      // amendment A14c item 3: where the detections lie in their windows (0 first state, 1 last)
      const positions = ok.flatMap((r) => r.detections.map((d) => (t(`${d.epoch.replace(/Z?$/, 'Z')}`) - t(r.startUtc)) / (t(r.stopUtc) - t(r.startUtc))));
      // the outages that cannot be scored, by reason (amendment A14b)
      const firstStart = rs.length ? t(rs[0].startUtc) : null, lastStop = rs.length ? Math.max(...rs.map((r) => t(r.stopUtc))) : null;
      const reasonOf = (o) => {
        const a = o.f[0] - M27_TOL_H * H, b = o.f[1] + M27_TOL_H * H;
        if (a < firstStart) return 'before the first day of the product';
        if (b > lastStop) return 'after the last day of the product';
        const touching = rs.filter((r) => t(r.stopUtc) > a && t(r.startUtc) < b);
        if (touching.some((r) => /a gap of/.test(r.skipped ?? ''))) return 'a day without states of the satellite';
        return 'no states';
      };
      const unscoreable = count(outages.filter((o) => !scoreable.includes(o)).map(reasonOf));
      const otherWindows = ev.other.filter((o) => o.svn === svn).map((o) => [t(o.start), t(o.stop)]);
      const falseAlarms = distinct.filter((d) => !inAny(d.ms, dvWindows, M27_TOL_H));
      const chance = (() => { // the share of the covered time inside a forecast window (+-6 h): the hit probability of a detection at a random epoch
        let inside = 0, total = 0;
        for (const [u, v] of union) { total += v - u; for (const [a, b] of dvWindows) inside += Math.max(0, Math.min(v, b + M27_TOL_H * H) - Math.max(u, a - M27_TOL_H * H)); }
        return total ? inside / total : 0;
      })();
      const DAY_MS = 86400e3, BOUNDARY = 86382e3; // the daily files begin at 23:59:42 UTC (GPS time 00:00:00)
      const nearBoundary = (ms) => { const x = (((ms % DAY_MS) - BOUNDARY) % DAY_MS + DAY_MS) % DAY_MS; return Math.min(x, DAY_MS - x) <= 2 * H; };
      return { norad, name: rs[0].name, svn, windows: rs.length, answered: ok.length, skipped: rs.filter((r) => r.skipped).length, refused: rs.filter((r) => r.ok === false).length, withDetection: ok.filter((r) => r.detections.length).length, years, distinct: distinct.length,
        falseAlarms: falseAlarms.length, falseAlarmsInOtherOutage: falseAlarms.filter((d) => inAny(d.ms, otherWindows, M27_TOL_H)).length, falseAlarmsNearBoundary: falseAlarms.filter((d) => nearBoundary(d.ms)).length, outages: outages.length, scoreable: scoreable.length, unscoreable, windowLevel, positions, events: eventRows, placements: offNotice, chance, dvMS: distinct.map((d) => d.mag), lambda: distinct.map((d) => d.lambda), perObjectDay: years ? distinct.length / (years * 365.25) : null };
    });
    const eventsAll = perSat.flatMap((p) => p.events);
    const years = perSat.reduce((s2, p) => s2 + p.years, 0);
    // the expected number of detected outages under the off-notice rates, and the probability of at least the observed number (exact, independent outages)
    const poissonBinomialHead = (ps, k) => { let dist = [1]; for (const pr of ps) { const next = new Array(dist.length + 1).fill(0); dist.forEach((w, i) => { next[i] += w * (1 - pr); next[i + 1] += w * pr; }); dist = next; } return dist.slice(0, k + 1).reduce((x, y) => x + y, 0); };
    const poissonBinomialTail = (ps, k) => { let dist = [1]; for (const pr of ps) { const next = new Array(dist.length + 1).fill(0); dist.forEach((w, i) => { next[i] += w * (1 - pr); next[i + 1] += w * pr; }); dist = next; } return dist.slice(k).reduce((x, y) => x + y, 0); };
    const nullTest = (events, hitKey, nullKey) => { const used = events.filter((e) => e[nullKey].rate !== null && e[hitKey] !== null); const ps = used.map((e) => e[nullKey].rate), obs = used.filter((e) => e[hitKey]).length; return { outages: used.length, undefinedRate: events.filter((e) => e[hitKey] !== null).length - used.length, expected: ps.reduce((x, y) => x + y, 0), observed: obs, tail: used.length ? poissonBinomialTail(ps, obs) : null, head: used.length ? poissonBinomialHead(ps, obs) : null, placementsMedian: q(used.map((e) => e[nullKey].n), 0.5), rateMedian: q(ps, 0.5) }; };
    // the same placements pooled over all the satellites of the system with an orbit series (amendment A14b item 3)
    const pooledCache = new Map();
    const pooledRate = (width) => { const key = Math.round(width / H); if (!pooledCache.has(key)) { let n = 0, hit = 0; for (const p of perSat) { const r = p.placements(width); n += r.n; hit += r.hit; } pooledCache.set(key, { n, rate: n ? hit / n : null }); } return pooledCache.get(key); };
    const pooledTest = (events, hitKey, widthKey) => { const used = events.filter((e) => e[hitKey] !== null && e[widthKey] !== null).map((e) => ({ hit: e[hitKey], ...pooledRate(e[widthKey]) })).filter((x) => x.rate !== null); const ps = used.map((x) => x.rate), obs = used.filter((x) => x.hit).length; return { outages: used.length, expected: ps.reduce((x, y) => x + y, 0), observed: obs, tail: used.length ? poissonBinomialTail(ps, obs) : null, head: used.length ? poissonBinomialHead(ps, obs) : null, placementsMedian: q(used.map((x) => x.n), 0.5), rateMedian: q(ps, 0.5) }; };
    const offNoticeSystem = { forecast: nullTest(eventsAll, 'hitForecast', 'nullForecast'), actual: nullTest(eventsAll, 'hitActual', 'nullActual'), pooledForecast: pooledTest(eventsAll, 'hitForecast', 'widthForecast'), pooledActual: pooledTest(eventsAll, 'hitActual', 'widthActual') };
    const unscoreable = perSat.reduce((acc, p) => { for (const [k, v] of Object.entries(p.unscoreable)) acc[k] = (acc[k] ?? 0) + v; return acc; }, {});
    const windowLevel = perSat.reduce((acc, p) => { for (const [k, v] of Object.entries(p.windowLevel)) acc[k] = (acc[k] ?? 0) + v; return acc; }, {});
    const allPositions = perSat.flatMap((p) => p.positions), position = { n: allPositions.length, firstSixth: allPositions.filter((x) => x < 1 / 6).length, median: q(allPositions, 0.5) };
    const perSatNull = (p) => ({ forecast: nullTest(p.events, 'hitForecast', 'nullForecast'), actual: nullTest(p.events, 'hitActual', 'nullActual') });
    const refused = count(srows.filter((r) => r.ok === false).map((r) => nameOf(r.error)));
    return { system, name: system === 'gps' ? 'GPS' : 'QZSS', satellites: sats.length, windows: srows.length, answered: srows.filter((r) => r.ok).length, skipped: srows.filter((r) => r.skipped).length, refused, windowsWithDetection: srows.filter((r) => r.ok && r.detections.length).length,
      outagesInNotices: ev.deltaV.length, outagesWithoutOrbit: ev.deltaV.filter((e) => !perSat.some((p) => p.svn === e.svn)).length, scoreable: eventsAll.length, hitForecast: eventsAll.filter((e) => e.hitForecast).length, withActual: eventsAll.filter((e) => e.hitActual !== null).length, hitActual: eventsAll.filter((e) => e.hitActual === true).length,
      offsetHours: { median: q(eventsAll.filter((e) => e.offsetHours !== null).map((e) => e.offsetHours), 0.5), p10: q(eventsAll.filter((e) => e.offsetHours !== null).map((e) => e.offsetHours), 0.1), p90: q(eventsAll.filter((e) => e.offsetHours !== null).map((e) => e.offsetHours), 0.9) },
      forecastHours: q(eventsAll.map((e) => e.forecastHours), 0.5), actualHours: q(eventsAll.filter((e) => e.actualHours !== null).map((e) => e.actualHours), 0.5),
      objectYears: years, distinctDetections: perSat.reduce((s2, p) => s2 + p.distinct, 0), falseAlarms: perSat.reduce((s2, p) => s2 + p.falseAlarms, 0), falseAlarmsInOtherOutage: perSat.reduce((s2, p) => s2 + p.falseAlarmsInOtherOutage, 0), falseAlarmsNearBoundary: perSat.reduce((s2, p) => s2 + p.falseAlarmsNearBoundary, 0),
      chanceHit: q(perSat.filter((p) => p.outages).map((p) => p.chance), 0.5), dvMS: stats(perSat.flatMap((p) => p.dvMS)), offNotice: offNoticeSystem, unscoreable, windowLevel, position, perObjectDay: years ? perSat.reduce((s2, p) => s2 + p.distinct, 0) / (years * 365.25) : null,
      hitDvMS: stats(eventsAll.filter((e) => e.mag !== null).map((e) => e.mag)),
      perSatellite: perSat.map(({ dvMS, lambda, events, placements, positions, ...rest }) => ({ ...rest, hits: events.filter((e) => e.hitForecast).length, offNotice: perSatNull({ events }) })) };
  }).filter((g) => g.windows);
}


// ---- M27b (amendment A17): the detector across the omitted days of the GPS series, with controls, and planted impulses across a hole ----
function m27b(dir, resultsDir) {
  const rows = rowsOf(dir, 'm27b');
  const file = path.join(resultsDir, 'gnss-notice-events.json');
  if (!rows.length || !fs.existsSync(file)) return null;
  const notices = JSON.parse(fs.readFileSync(file, 'utf8')).gps;
  const H = 3600e3, TOL = 6 * H, t = (iso) => Date.parse(`${String(iso).replace(/Z?$/, 'Z')}`);
  const lam = (d) => Number(/Lambda ([\d.e+]+)/.exec(d.algorithm ?? '')?.[1]);
  const overlaps = (a0, a1, b0, b1) => a0 < b1 && a1 > b0;
  const one = (r) => {
    const hole = [t(r.holeFromUtc), t(r.holeToUtc)], start = t(r.startUtc), stop = t(r.stopUtc);
    const dets = (r.ok ? r.detections : []).map((d) => ({ ms: t(d.epoch), mag: Math.hypot(...d.dvMS), pos: (t(d.epoch) - start) / (stop - start), lambda: lam(d) }));
    const dv = notices.deltaV.filter((e) => e.svn === r.svn && overlaps(t(e.forecast.start), t(e.forecast.stop), hole[0], hole[1]));
    const group = r.kind === 'control' ? 'control' : dv.length ? 'deltaV' : notices.other.some((o) => o.svn === r.svn && overlaps(t(o.start), t(o.stop), hole[0], hole[1])) ? 'other' : 'none';
    const actual = dv.filter((e) => e.actual).map((e) => [t(e.actual.start), t(e.actual.stop)]);
    return { r, group, hole, dets, start, stop, svn: r.svn, norad: r.norad,
      detected: dets.length > 0, located: dets.some((d) => d.ms >= hole[0] - TOL && d.ms <= hole[1] + TOL), inside: dets.some((d) => d.ms >= hole[0] && d.ms <= hole[1]),
      hasActual: actual.length > 0, inActual: actual.some(([a0, a1]) => dets.some((d) => d.ms >= a0 - TOL && d.ms <= a1 + TOL)) };
  };
  const windows = rows.filter((r) => r.kind === 'omitted-day' || r.kind === 'control').map(one);
  const answered = (g) => windows.filter((w) => w.group === g && w.r.ok);
  const holeRows = rows.filter((r) => r.kind === 'hole');
  const stat = (g) => {
    const all = windows.filter((w) => w.group === g), ok = all.filter((w) => w.r.ok), det = ok.filter((w) => w.detected), dets = ok.flatMap((w) => w.dets.map((d) => ({ ...d, off: (d.ms - w.hole[0]) / H })));
    return { windows: all.length, answered: ok.length, refused: count(all.filter((w) => w.r.ok === false).map((w) => nameOf(w.r.error))), detected: det.length, located: ok.filter((w) => w.located).length, inside: ok.filter((w) => w.inside).length,
      withActual: ok.filter((w) => w.hasActual).length, inActual: ok.filter((w) => w.hasActual && w.inActual).length,
      offsetHours: { median: q(dets.map((d) => d.off), 0.5), p10: q(dets.map((d) => d.off), 0.1), p90: q(dets.map((d) => d.off), 0.9) },
      position: { n: dets.length, firstSixth: dets.filter((d) => d.pos < 1 / 6).length, lastSixth: dets.filter((d) => d.pos > 5 / 6).length, median: q(dets.map((d) => d.pos), 0.5) },
      dvMS: stats(dets.map((d) => d.mag)), lambdaMedian: q(dets.map((d) => d.lambda), 0.5) };
  };
  const control = stat('control');
  const pDet = control.answered ? control.detected / control.answered : null, pLoc = control.answered ? control.located / control.answered : null;
  const tail = (n, p, k, upper) => { if (p === null || !n) return null; let dist = [1]; for (let i = 0; i < n; i++) { const next = new Array(dist.length + 1).fill(0); dist.forEach((w, j) => { next[j] += w * (1 - p); next[j + 1] += w * p; }); dist = next; } return upper ? dist.slice(k).reduce((x, y) => x + y, 0) : dist.slice(0, k + 1).reduce((x, y) => x + y, 0); };
  const groups = Object.fromEntries(['deltaV', 'other', 'none'].map((g) => { const x = stat(g); return [g, { ...x,
    expectedDetected: x.answered * (pDet ?? 0), expectedLocated: x.answered * (pLoc ?? 0),
    detectedAtLeast: tail(x.answered, pDet, x.detected, true), detectedAtMost: tail(x.answered, pDet, x.detected, false), locatedAtLeast: tail(x.answered, pLoc, x.located, true), locatedAtMost: tail(x.answered, pLoc, x.located, false) }]; }));
  // the false alarms of the controls, counted as in M27: distinct detections (merged within 6 h) over the covered time of the answered control windows
  const sats = [...new Set(answered('control').map((w) => w.norad))];
  let years = 0, distinct = 0;
  for (const n of sats) {
    const ws = answered('control').filter((w) => w.norad === n).sort((a, c) => a.start - c.start), spans = [];
    for (const w of ws) { const last = spans.at(-1); if (last && w.start <= last[1]) last[1] = Math.max(last[1], w.stop); else spans.push([w.start, w.stop]); }
    years += spans.reduce((a, [u, v]) => a + (v - u), 0) / (365.25 * 86400e3);
    const ds = ws.flatMap((w) => w.dets.map((d) => d.ms)).sort((a, c) => a - c); const merged = []; for (const d of ds) if (!merged.length || d - merged.at(-1) > 6 * H) merged.push(d);
    distinct += merged.length;
  }
  return { windows: windows.length, holesSkipped: count(holeRows.map((r) => String(r.skipped).replace(/^a hole of (\d+) h .*/, (m, h) => `a hole of ${Math.round(h / 24)} days`).replace(/^a flank of.*/, 'a flank of fewer than 24 h or with a gap'))),
    control: { ...control, rateDetected: pDet, rateLocated: pLoc, objectYears: years, distinct, falseAlarmsPerObjectYear: years ? distinct / years : null }, groups };
}

function m27bp(dir) {
  const rows = rowsOf(dir, 'm27bp');
  if (!rows.length) return null;
  const H = 3600e3, t = (iso) => Date.parse(`${String(iso).replace(/Z?$/, 'Z')}`);
  const cases = PLANTED_CASES.map((id) => {
    const rs = rows.filter((r) => r.case === id), ok = rs.filter((r) => r.ok), planted = /^imp-([UVW])-([\d.]+)$/.exec(id);
    const per = ok.map((r) => { const d = r.detections[0] ?? null; return { detected: r.detections.length > 0, located: r.detections.some((x) => t(x.epoch) >= t(r.holeFromUtc) - 6 * H && t(x.epoch) <= t(r.holeToUtc) + 6 * H), err: d ? (t(d.epoch) - t(r.tbUtc)) / H : null, ratio: d && planted ? Math.hypot(...d.dvMS) / Number(planted[2]) : null }; });
    return { id, axis: planted ? planted[1] : null, planted: planted ? Number(planted[2]) : null, arcs: rs.length, answered: ok.length, refused: count(rs.filter((r) => r.ok === false).map((r) => nameOf(r.error))), detected: per.filter((x) => x.detected).length, located: per.filter((x) => x.located).length,
      epochErrorHours: { median: q(per.map((x) => x.err), 0.5), p10: q(per.map((x) => x.err), 0.1), p90: q(per.map((x) => x.err), 0.9) }, dvRatio: { median: q(per.map((x) => x.ratio), 0.5), p10: q(per.map((x) => x.ratio), 0.1), p90: q(per.map((x) => x.ratio), 0.9) } };
  });
  return { arcs: rows.length, holeHours: [18, 42], cases };
}

/** The detector on FFM-1 arcs with a planted impulse (amendment A11e): the pipeline check of M24 on the archive. */
function m24p(dir) {
  const rows = rowsOf(dir, 'm24p');
  if (!rows.length) return null;
  const ok = rows.filter((r) => r.ok);
  const cases = PLANTED_CASES.map((id) => {
    const rs = ok.filter((r) => r.case === id), planted = /^imp-([UVW])-([\d.]+)$/.exec(id);
    const axis = planted ? 'UVW'.indexOf(planted[1]) : null, dv = planted ? Number(planted[2]) : null;
    const scored = rs.map((r) => {
      const d = r.detections[0] ?? null, te = d ? Date.parse(`${d.epoch.replace(/Z?$/, 'Z')}`) : null, errMin = d ? (te - Date.parse(r.tbUtc)) / 60000 : null, mag = d ? Math.hypot(...d.dvMS) : null;
      return { d, errMin, hit: d !== null && Math.abs(errMin) <= HIT_MIN, ratio: d && dv ? mag / dv : null, axisShare: d && axis !== null ? Math.abs(d.dvMS[axis]) / mag : null, firstTenth: d ? (te - Date.parse(r.startUtc)) / (r.fitSeconds * 1000) < 0.1 : null };
    });
    const hits = scored.filter((x) => x.hit), det = scored.filter((x) => x.d);
    return { id, axis: planted ? planted[1] : null, dvMS: dv, arcs: rs.length, hits: hits.length, elsewhere: det.length - hits.length, none: scored.length - det.length,
      epochErrorMin: { median: q(hits.map((x) => x.errMin), 0.5), p10: q(hits.map((x) => x.errMin), 0.1), p90: q(hits.map((x) => x.errMin), 0.9) },
      dvRatio: { median: q(hits.map((x) => x.ratio), 0.5), p10: q(hits.map((x) => x.ratio), 0.1), p90: q(hits.map((x) => x.ratio), 0.9) }, axisShare: q(hits.map((x) => x.axisShare), 0.5),
      firstTenth: det.filter((x) => x.firstTenth).length, detections: det.length };
  });
  return { arcs: ok.length, refused: rows.filter((r) => !r.ok).length, satellites: new Set(ok.map((r) => r.norad)).size, arcHours: ARC_HOURS, cases };
}

// ---- M29 (amendment A11b): real reentries ----
const TAU_BINS = [['over 7 d', 168, Infinity], ['3 to 7 d', 72, 168], ['1 to 3 d', 24, 72], ['12 to 24 h', 12, 24], ['6 to 12 h', 6, 12], ['3 to 6 h', 3, 6], ['under 3 h', 0, 3]];
const share = (list, test) => (list.length ? list.filter(test).length / list.length : null);
const count = (list) => { const out = {}; for (const x of list) out[x] = (out[x] ?? 0) + 1; return out; };

/** The statistics of the scored predictions (reentry answered) of one group of rows. */
function reentryStats(rs) {
  const p = rs.map((r) => ({ r, err: r.reentry.errHours, abs: Math.abs(r.reentry.errHours), sigma: r.reentry.uncHours, lead: r.reentry.leadHours, tau: r.tauHours }));
  const rule = p.filter((x) => x.lead > 0), ruleShare = share(p, (x) => x.lead > 0 && x.abs <= 0.2 * x.lead);
  const k = ruleShare === null ? null : q(p.filter((x) => x.sigma > 0).map((x) => x.abs / x.sigma), ruleShare);
  return { n: p.length, objects: new Set(p.map((x) => x.r.norad)).size, errMedian: q(p.map((x) => x.err), 0.5), absMedian: q(p.map((x) => x.abs), 0.5), absP90: q(p.map((x) => x.abs), 0.9),
    absOverTau: q(p.map((x) => x.abs / x.tau), 0.5), sigmaOverTau: q(p.map((x) => x.sigma / x.tau), 0.5), sigmaMedian: q(p.map((x) => x.sigma), 0.5),
    within1: share(p, (x) => x.abs <= x.sigma), within2: share(p, (x) => x.abs <= 2 * x.sigma), inWindow: share(p.filter((x) => x.r.reentry.inWindow !== null), (x) => x.r.reentry.inWindow === true),
    ruleShare, equalCoverageK: k, kWindowOverRule: k === null ? null : q(rule.filter((x) => x.sigma > 0).map((x) => (k * x.sigma) / (0.2 * x.lead)), 0.5) };
}

function m29(dir) {
  const rows = rowsOf(dir, 'm29');
  if (!rows.length) return null;
  const sample = (truthSource) => {
    const all = rows.filter((r) => r.truthSource === truthSource), skipped = all.filter((r) => r.skipped), attempted = all.filter((r) => !r.skipped);
    const scored = attempted.filter((r) => r.reentry?.ok);
    const fitRefused = attempted.filter((r) => r.fit && !r.fit.ok), reentryRefused = attempted.filter((r) => r.fit?.ok && r.reentry && !r.reentry.ok);
    const bins = TAU_BINS.map(([name, lo, hi]) => {
      const inBin = (r) => r.tauHours >= lo && r.tauHours < hi, a = attempted.filter(inBin), sc = scored.filter(inBin);
      return { name, attempted: a.length, fitRefused: count(a.filter((r) => r.fit && !r.fit.ok).map((r) => nameOf(r.fit.error))), reentryRefused: count(a.filter((r) => r.fit?.ok && r.reentry && !r.reentry.ok).map((r) => nameOf(r.reentry.error))), ...(sc.length ? reentryStats(sc) : { n: 0 }) };
    });
    // comparators
    const cmp = scored.filter((r) => (truthSource === 'cords-observed' ? r.aerospace : r.tip));
    return { objects: new Set(all.map((r) => r.norad)).size, objectsWithoutSets: new Set(skipped.filter((r) => /element sets/.test(r.skipped)).map((r) => r.norad)).size, predictions: attempted.length, skipped: skipped.length, scored: scored.length,
      fitRefused: count(fitRefused.map((r) => nameOf(r.fit.error))), reentryRefused: count(reentryRefused.map((r) => nameOf(r.reentry.error))), failedSetsMedian: q(attempted.map((r) => r.failedSets ?? 0), 0.5),
      all: scored.length ? reentryStats(scored) : { n: 0 }, starlink: scored.some((r) => /^STARLINK/.test(r.name)) ? reentryStats(scored.filter((r) => /^STARLINK/.test(r.name))) : null, other: scored.some((r) => !/^STARLINK/.test(r.name)) ? reentryStats(scored.filter((r) => !/^STARLINK/.test(r.name))) : null,
      starlinkObjects: new Set(all.filter((r) => /^STARLINK/.test(r.name)).map((r) => r.norad)).size, bins, comparatorRows: cmp.length };
  };
  const C = sample('cords-observed'), T = sample('tip-final');
  // Aerospace at its own element-set epoch (sample C): one row per object
  const aero = rows.filter((r) => r.truthSource === 'cords-observed' && r.aerospace && !r.skipped).map((r) => ({
    norad: r.norad, name: r.name, tauHours: r.tauHours, aerospaceErr: r.aerospace.errHours, aerospaceHalf: r.aerospace.uncertaintyHours, aerospaceIn: r.aerospace.inWindow,
    sdnap: r.reentry?.ok ? { err: r.reentry.errHours, sigma: r.reentry.uncHours, in1: Math.abs(r.reentry.errHours) <= r.reentry.uncHours, in2: Math.abs(r.reentry.errHours) <= 2 * r.reentry.uncHours } : { refused: nameOf((r.fit && !r.fit.ok ? r.fit.error : r.reentry?.error) ?? 'unanswered') } }));
  const aeroBoth = aero.filter((x) => x.sdnap.err !== undefined);
  const aerospace = { objects: aero.length, answered: aeroBoth.length, refused: count(aero.filter((x) => x.sdnap.refused).map((x) => x.sdnap.refused)),
    aerospaceAbsMedian: q(aeroBoth.map((x) => Math.abs(x.aerospaceErr)), 0.5), sdnapAbsMedian: q(aeroBoth.map((x) => Math.abs(x.sdnap.err)), 0.5), sdnapCloser: aeroBoth.filter((x) => Math.abs(x.sdnap.err) < Math.abs(x.aerospaceErr)).length,
    aerospaceInside: aero.filter((x) => x.aerospaceIn).length, sdnapIn1: aeroBoth.filter((x) => x.sdnap.in1).length, sdnapIn2: aeroBoth.filter((x) => x.sdnap.in2).length,
    halfWidthOverTau: q(aero.map((x) => x.aerospaceHalf / x.tauHours), 0.5), sdnapSigmaOverTau: q(aeroBoth.map((x) => x.sdnap.sigma / x.tauHours), 0.5),
    objectsDetail: aero.sort((a, c) => a.tauHours - c.tauHours) };
  // Space-Track TIP at the same epochs (sample T): the latest message before the prediction epoch
  const tipRows = rows.filter((r) => r.truthSource === 'tip-final' && !r.skipped && r.tip);
  const tipBoth = tipRows.filter((r) => r.reentry?.ok);
  const tipByBin = TAU_BINS.map(([name, lo, hi]) => {
    const inBin = (r) => r.tauHours >= lo && r.tauHours < hi, withTip = rows.filter((r) => r.truthSource === 'tip-final' && !r.skipped && inBin(r) && r.reentry?.ok), b = tipBoth.filter(inBin);
    return { name, answered: withTip.length, withTip: b.length, tipAbsMedian: q(b.map((r) => Math.abs(r.tip.errHours)), 0.5), sdnapAbsMedian: q(b.map((r) => Math.abs(r.reentry.errHours)), 0.5), tipInside: share(b, (r) => Math.abs(r.tip.errHours) * 60 <= r.tip.windowMin), sdnapIn2: share(b, (r) => Math.abs(r.reentry.errHours) <= 2 * r.reentry.uncHours), sdnapCloser: b.filter((r) => Math.abs(r.reentry.errHours) < Math.abs(r.tip.errHours)).length };
  });
  return { build: path.basename(dir), C, T, aerospace, tip: { predictionsWithTip: tipRows.length, byBin: tipByBin } };
}

// ---- M30 (amendment A11c): controlled deorbits, the part the build covers ----
function m30(dir, resultsDir) {
  const rows = rowsOf(dir, 'm30');
  if (!rows.length) return null;
  const file = path.join(resultsDir, 'm30-truth.json');
  const truth = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null, byObject = new Map((truth?.objects ?? []).map((o) => [o.norad, o]));
  const variants = ['default', 'rule', 'free'].map((variant) => {
    const rs = rows.filter((r) => r.variant === variant), ok = rs.filter((r) => r.reentry?.ok);
    const scored = ok.flatMap((r) => { const o = byObject.get(r.norad); return o?.lastTipDecayUtc && o.decayMessage ? [{ r, err: (Date.parse(`${r.reentry.epoch.replace(/Z?$/, 'Z')}`) - Date.parse(o.lastTipDecayUtc)) / 3600e3 }] : []; });
    return { variant, rows: rs.length, fitOk: rs.filter((r) => r.fit?.ok).length, reentryOk: ok.length, refused: count(rs.filter((r) => r.reentry && !r.reentry.ok).map((r) => nameOf(r.reentry.error))),
      lifetimeDays: stats(ok.map((r) => r.reentry.orbitLifetimeDays)), sigmaHours: stats(ok.map((r) => r.reentry.uncHours)), bEff: stats(rs.filter((r) => r.fit?.ok).map((r) => r.fit.bEff)),
      scored: scored.length, errHours: stats(scored.map((x) => x.err)), within1: share(scored, (x) => Math.abs(x.err) <= x.r.reentry.uncHours), within2: share(scored, (x) => Math.abs(x.err) <= 2 * x.r.reentry.uncHours) };
  });
  const issued = rows.map((r) => r.issuedUtc).sort();
  const predictions = rows.filter((r) => r.variant === 'default' && r.reentry?.ok).map((r) => ({ norad: r.norad, bEffFfm: r.bEffFfm, issuedUtc: r.issuedUtc, epoch: r.reentry.epoch, uncHours: r.reentry.uncHours, windowStart: r.reentry.windowStart, windowEnd: r.reentry.windowEnd, lifetimeDays: r.reentry.orbitLifetimeDays,
    tipMessages: byObject.get(r.norad)?.tipMessages ?? null, decayMessage: byObject.get(r.norad)?.decayMessage ?? null, lastTipDecayUtc: byObject.get(r.norad)?.lastTipDecayUtc ?? null })).sort((a, c) => (a.epoch < c.epoch ? -1 : 1));
  return { satellites: new Set(rows.map((r) => r.norad)).size, issuedFirst: issued[0], issuedLast: issued.at(-1), snapshot: truth?.newestSnapshot ?? null, objectsWithTip: (truth?.objects ?? []).filter((o) => o.tipMessages).length, objectsWithDecay: (truth?.objects ?? []).filter((o) => o.decayMessage).length, variants, predictions };
}

/** M31 (amendment A11c): the capture of the new batch (summary written by m31-capture.mjs --summary; derived values only). */
function m31(resultsDir) {
  const file = path.join(resultsDir, 'm31-capture.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}


// ---- M31 and M32 (amendment A12b) ----
const armDays = (rs, pick) => Object.fromEntries([1, 2, 3].map((k) => { const v = rs.map((r) => pick(r)?.days?.[k]?.rmsKm).filter(Number.isFinite); return [k, { n: v.length, median: q(v, 0.5), p90: q(v, 0.9) }]; }));
const bEffOf = (a) => (a?.ok ? a.bEff : null);

/** M31 on the captured batch: per fit length the three arms by day, and the SDN-AP B_eff against its 24 h value. */
function m31captured(dir) {
  const rows = rowsOf(dir, 'm31');
  if (!rows.length) return null;
  const hours = [...new Set(rows.map((r) => r.hours))].sort((a, c) => a - c);
  const by24 = new Map(rows.filter((r) => r.hours === 24 && r.sdngp?.ok).map((r) => [r.norad, r.sdngp.bEff]));
  return {
    satellites: new Set(rows.map((r) => r.norad)).size,
    hours: hours.map((h) => {
      const rs = rows.filter((r) => r.hours === h), sd = rs.filter((r) => r.sdngp?.ok);
      const ratio = sd.filter((r) => by24.has(r.norad) && by24.get(r.norad) > 0).map((r) => r.sdngp.bEff / by24.get(r.norad));
      return { hours: h, windows: rs.length, sdnap: armDays(rs, (r) => r.sdngp), xp: armDays(rs, (r) => r.xp), sgp4: armDays(rs, (r) => r.sgp4),
        fitRms: q(sd.map((r) => r.sdngp.fitRmsKm), 0.5), bEff: { n: sd.length, median: q(sd.map((r) => r.sdngp.bEff), 0.5), min: q(sd.map((r) => r.sdngp.bEff), 0), max: q(sd.map((r) => r.sdngp.bEff), 1) },
        bEffRatio24: { n: ratio.length, median: q(ratio, 0.5), p10: q(ratio, 0.1), p90: q(ratio, 0.9) }, bEffSigma: q(sd.map((r) => r.sdngp.bEffSigma), 0.5),
        refused: count([...rs.filter((r) => r.sdngp && !r.sdngp.ok).map((r) => `sdn-ap ${nameOf(r.sdngp.error)}`), ...rs.filter((r) => r.xp && !r.xp.ok).map((r) => `xp ${nameOf(r.xp.error)}`), ...rs.filter((r) => r.sgp4 && !r.sgp4.ok).map((r) => `sgp4 ${nameOf(r.sgp4.error)}`)]) };
    }),
  };
}

/** M32 on the synthetic batches, pooled by separation sigma: the arms by fit length and day, the paired joint minus per-object, and the B_eff error. */
function m32(dir) {
  const rows = rowsOf(dir, 'm32');
  if (!rows.length) return null;
  const groups = [...new Set(rows.filter((r) => r.sigmaMS !== undefined).map((r) => r.sigmaMS))].sort((a, c) => c - a);
  return groups.map((sigma) => {
    const g = rows.filter((r) => r.sigmaMS === sigma);
    const objects = g.filter((r) => r.kind === 'object'), priors = g.filter((r) => r.kind === 'object-prior'), joints = g.filter((r) => r.kind === 'batch-joint'), sets = g.filter((r) => r.kind === 'launch-set');
    const hours = [...new Set(objects.map((r) => r.hours))].sort((a, c) => a - c);
    const jointScored = (h) => joints.filter((r) => r.hours === h && r.ok).flatMap((r) => r.scored.filter((x) => x.days).map((x) => ({ batch: r.batch, k: x.k, days: x.days, bEff: x.bEff, name: x.name })));
    return { sigmaMS: sigma, batches: [...new Set(g.map((r) => r.batch))].sort(), objects: new Set(objects.map((r) => `${r.batch}-${r.k}`)).size,
      launchSet: { ok: sets.filter((r) => r.ok).length, windows: sets.length, refused: count(sets.filter((r) => !r.ok).map((r) => nameOf(r.error))), days: armDays(sets.filter((r) => r.ok), (r) => r) },
      hours: hours.map((h) => {
        const o = objects.filter((r) => r.hours === h), p = priors.filter((r) => r.hours === h), j = joints.filter((r) => r.hours === h), js = jointScored(h);
        const perKey = new Map(o.filter((r) => r.sdngp?.ok).map((r) => [`${r.batch}-${r.k}`, r]));
        const jointKey = js.map((x) => ({ ...x, key: `${x.batch}-${x.k}` }));
        const paired = [1, 2, 3].map((k) => { const d = jointKey.filter((x) => perKey.get(x.key)?.sdngp.days?.[k] && x.days[k]).map((x) => x.days[k].rmsKm - perKey.get(x.key).sdngp.days[k].rmsKm); return { day: k, n: d.length, medianDiff: q(d, 0.5), jointBetter: d.filter((x) => x < 0).length }; });
        const rel = (v, truth) => Math.abs(v / truth - 1);
        const bErr = (list) => q(list.filter((x) => Number.isFinite(x)), 0.5);
        return { hours: h, objectsWindows: o.length, sdnap: armDays(o, (r) => r.sdngp), xp: armDays(o, (r) => r.xp), sgp4: armDays(o, (r) => r.sgp4), prior: armDays(p, (r) => r.sdngp),
          joint: { calls: j.length, ok: j.filter((r) => r.ok).length, refused: count(j.filter((r) => !r.ok).map((r) => nameOf(r.error))), objects: js.length, days: Object.fromEntries([1, 2, 3].map((k) => { const v = js.map((x) => x.days[k]?.rmsKm).filter(Number.isFinite); return [k, { n: v.length, median: q(v, 0.5), p90: q(v, 0.9) }]; })),
            namesMatch: js.filter((x) => x.name && /^BATCH-/.test(x.name)).length, setsPerCall: q(j.filter((r) => r.ok).map((r) => r.sets), 0.5) },
          paired, perObjectRefused: count(o.filter((r) => r.sdngp && !r.sdngp.ok).map((r) => nameOf(r.sdngp.error))),
          bEffError: { sdnap: bErr(o.filter((r) => r.sdngp?.ok).map((r) => rel(r.sdngp.bEff, r.trueBEff))), prior: bErr(p.filter((r) => r.sdngp?.ok).map((r) => rel(r.sdngp.bEff, r.trueBEff))),
            joint: bErr(j.filter((r) => r.ok).flatMap((r) => r.scored.filter((x) => x.days).map((x) => { const t = o.find((y) => y.batch === r.batch && y.k === x.k)?.trueBEff; return t ? rel(x.bEff, t) : NaN; }))) } };
      }) };
  });
}

/** The methods the build's manifest declares (the snapshot copy of its plugin-manifest.json), in manifest order; null when the snapshot is not in the store. */
export const methodsOf = (build) => { try { return JSON.parse(fs.readFileSync(path.join(store, 'sdngp-snapshot', build, 'plugin-manifest.json'), 'utf8')).methods.map((x) => x.methodId); } catch { return null; } };
/** `only`: for a build that has not run every source, the sources its events-focus.json names (amendment A15); the other rows of its directory are not read, so the tables do not move while the build runs the rest. */
/** The name of the fit method of a build from its method list: `fit` (one method, theory in the $PCF) from b9bc708baa50 on, `fit_sdnap` after the rename, `fit_sdngp` before it. */
export const fitMethodOf = (methods) => (!methods ? 'fit' : methods.includes('fit_sdnap') ? 'fit_sdnap' : methods.includes('fit_sdngp') ? 'fit_sdngp' : 'fit');
const studyOf = (dir, resultsDir, only = null) => {
  const on = (name, fn) => (!only || only.includes(name) ? fn() : null);
  return { build: path.basename(dir), methods: methodsOf(path.basename(dir)), m22: on('m22', () => m22(dir)), m23: on('m23', () => m23(dir)), m28: on('m28', () => m28(dir)), m24: on('m24', () => m24(dir)), m24c: on('m24c', () => m24c(dir)), m24a: on('m24a', () => m24a(dir, resultsDir)), m24p: on('m24p', () => m24p(dir)), m24b: on('m24b', () => m24b(dir)),
    m27: on('m27', () => m27(dir, resultsDir)), m27b: on('m27b', () => m27b(dir, resultsDir)), m27bp: on('m27bp', () => m27bp(dir)), m25: on('m25', () => m25(dir, resultsDir)), m29: on('m29', () => m29(dir)), m30: on('m30', () => m30(dir, resultsDir)), m31: on('m31', () => m31(resultsDir)), m31captured: on('m31', () => m31captured(dir)), m32: on('m32', () => m32(dir)) };
};

/** The events measurements of a build and, when given, of the earlier complete builds (oldest first; `previous` is the last of them), for the tables that stand the builds side by side.
 *  `laterDirs`: builds after the headline that have not run every source (amendment A15): each is a study of its own, whose `previous` is the build before it and whose `history` holds all the builds before it. */
export function eventsStudy(dir, resultsDir, earlierDirs = [], laterDirs = []) {
  if (!dir) return null;
  const history = earlierDirs.map((d) => studyOf(d, resultsDir)).filter((x) => x.m24 || x.m24c || x.m24a || x.m22);
  const headline = studyOf(dir, resultsDir);
  const later = [];
  for (const d of laterDirs) {
    const focus = JSON.parse(fs.readFileSync(path.join(d, 'events-focus.json'), 'utf8')); // the sources this build has run and the rows they hold when the file was written
    for (const [source, n] of Object.entries(focus.rows)) { const have = rowsOf(d, source).length; if (have !== n) throw new Error(`${path.basename(d)}: ${source} holds ${have} rows, events-focus.json says ${n}`); }
    const x = studyOf(d, resultsDir, focus.sources);
    if (!(x.m24 || x.m24c || x.m24a || x.m24b || x.m24p || x.m27 || x.m27b || x.m29 || x.m30)) continue;
    const before = [...history, headline, ...later], entry = { ...x };
    for (const [k, v] of Object.entries({ previous: before.at(-1), history: before, later: [] })) Object.defineProperty(entry, k, { value: v, enumerable: false }); // reachable for the tables, not written twice into tables.json
    later.push(entry);
  }
  return { ...headline, previous: history.at(-1) ?? null, history, later };
}

// ---- markdown (section 16) ----
const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(d));
const AX = { U: 'U (radial)', V: 'V (in-track)', W: 'W (cross-track)' };

export function eventsMarkdown(e, opts = {}) {
  if (!e) return [];
  const L = [];
  const later = opts.later ? [] : (e.later ?? []); // builds after this one that have run only some sources: they join the tables that stand the builds side by side
  if (opts.later) L.push(`### 16d. Build ${e.build}, the next build of the module (amendment A15)`, '',
    `Build ${e.build} (side B's source commit ${opts.sourceCommit ? opts.sourceCommit.slice(0, 7) : ''}) has run the sources of amendment A15 (${opts.sources ?? ''}). The tables that stand the builds side by side (the ISS pre-burn windows, M27, the detector across builds, M30's predictions) carry it in section 16b; the tables below are its own, with the comparison against build ${e.previous?.build ?? ''}. Its methods are ${e.methods ? `${e.methods.slice(0, -1).join(', ')} and ${e.methods.at(-1)}` : 'in its manifest'}.`, '');
  else L.push('### 16b. Maneuvers, the reentry hand-off, ISS and lunar maneuver detection', '',
    `Build ${e.build}. The truths of M22, M23 and M28 are FFM-1 (propagator/ffm), not the module's own Cowell integration: impulses and finite burns planted in its typed request, synthetic decays integrated to its own stop at 100 km geodetic altitude.`, '',
    'Not run: M26 (the Starlink detector against the files\' own states: the raw files are not kept), M33 (the thrust-onset test needs files of an orbit raise, which the captured batch has not begun) and the BeiDou part of M27 (the BeiDou orbit notices of the CSNO test and assessment center did not answer from this host; the BeiDou site\'s advisories are upgrade and maintenance outages, not orbit notices).', '');
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
      '| Lead | Nodes | Error median | Absolute error, median | Absolute error, max | Absolute error over lead (median) | Uncertainty (median, h) | T100 inside the window | FFM-1 from the hand-off state, error median (h) |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: |',
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
      `${m.filesInArchive ?? m.files} OEM files in the archive (NASA JSC FOD TOPO; dated folders 2020 to 2026, fetched 2026-10-24; ${m.files} give a window), ${m.clusters} distinct planned burns (header events with a delta-v above zero, TIGs within 12 h taken as one burn)${m.notScored?.length ? `, ${m.notScored.length} not scored (no file with 12 h of states before the burn and 24 h after)` : ''}. TIG and delta-v are the headers' planned values, not measurements of the executed burns. Each window is 72 h, every state (TEME by foundation/frames), \`detect_maneuvers\` with the daily space weather of the years loaded (\`load_environment\`). A detection within ${HIT_MIN} min (one orbit) of TIG is a hit; the epoch error is the detected epoch less TIG, the delta-v ratio the detected |delta-v| over the planned one (median [10th, 90th percentile] over the hits):`, '',
      '| Window | Windows | Hits | Detection elsewhere | No detection | Epoch error (min) | Absolute delta-v over planned | Absolute delta-v error (m/s) | V share of delta-v |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: |',
      row('pre-burn file (burn still to come)', m.pre), row('post-burn file (burn behind its start)', m.post), '',
      'Hits by planned delta-v (pre-burn files / post-burn files):', '', '| Planned delta-v | Pre: windows | Pre: hits | Post: windows | Post: hits |', '| --- | --: | --: | --: | --: |',
      ...m.pre.bins.map((b, i) => `| ${b.name} | ${b.windows} | ${b.hits} | ${m.post.bins[i].windows} | ${m.post.bins[i].hits} |`), '',
      `Burn-free windows (the leading 72 h of every file whose header lists no burn in or within an hour of it): ${m.free.windows} windows (${m.free.refused} refused) covering ${f(m.free.coverageYears, 2)} object-years; ${m.free.windowsWithDetection} windows reported a burn (${m.free.detections} detections, ${m.free.distinctEpochs} distinct epochs merged within 6 h; delta-v median ${f(m.free.dvMS.median, 3)} m/s, maximum ${f(m.free.dvMS.max, 3)} m/s; Lambda median ${f(m.free.lambda.median, 0)}): ${f(m.free.falseAlarmsPerObjectYear, 1)} false alarms per object-year.`, '');
  }
  if (e.m24p) {
    const m = e.m24p;
    L.push('#### M24, pipeline check: impulses planted in FFM-1 arcs (amendment A11e)', '',
      `${m.satellites} registered Starlink truths, arcs of ${m.arcHours} h: the registered truth for the first 24 h (every fifth state), then the first 36 h after t_b of an M22 case (the control, or the impulse FFM-1 planted at t_b), every 300 s, TEME by foundation/frames, \`detect_maneuvers\` with the saved weather loaded. The burn is at 24 h and its size and axis are exact. A detection within ${HIT_MIN} min of t_b is a hit; the delta-v ratio and the planted-axis share are medians over the hits:`, '',
      '| Planted at 24 h | Arcs | Hits | Detection elsewhere | No detection | Epoch error (min), median [10th, 90th] | Absolute delta-v over planted | Planted-axis share of delta-v | Detections in the first tenth of the arc |', '| --- | --: | --: | --: | --: | --- | --: | --: | --: |',
      ...m.cases.map((c) => `| ${c.axis ? `${AX[c.axis]} ${c.dvMS} m/s` : 'none (control)'} | ${c.arcs} | ${c.hits} | ${c.elsewhere} | ${c.none} | ${c.hits && c.axis ? `${f(c.epochErrorMin.median, 1)} [${f(c.epochErrorMin.p10, 1)}, ${f(c.epochErrorMin.p90, 1)}]` : ''} | ${f(c.dvRatio.median, 2)} | ${f(c.axisShare, 2)} | ${c.firstTenth} of ${c.detections} |`), '');
  }
  if (e.m24b) {
    const name = { 'sub-before': 'the stretch before the burn (TIG - 36 h to TIG - 2 h; no burn in it)', 'sub-across': '48 h across the burn (TIG - 12 h to TIG + 36 h)', 'sub-after': 'the stretch after the burn (TIG + 2 h to TIG + 38 h; no burn in it)', 'sub-tight': 'a tight window (TIG - 4 h to TIG + 24 h)', 'sub-p6': 'TIG - 6 h to TIG + 24 h', 'sub-p8': 'TIG - 8 h to TIG + 24 h', 'sub-p24': 'TIG - 24 h to TIG + 24 h' };
    const part = (b, label) => b.map((x) => `| ${label} | ${name[x.kind]} | ${x.scored} of ${x.windows} (${Object.keys(x.skipped).length ? Object.entries(x.skipped).map(([k, v]) => `${v} skipped: ${k}`).join('; ') : 'none skipped'}) | ${x.withDetection} | ${x.kind === 'sub-before' || x.kind === 'sub-after' ? 'not applicable' : `${x.hits} / ${x.elsewhere} / ${x.none}`} | ${x.withDetection ? `${f(x.position.median, 2)} [${f(x.position.p10, 2)}, ${f(x.position.p90, 2)}]` : ''} | ${x.elsewhere ? `${f(x.offsetHours.median, 1)} [${f(x.offsetHours.p10, 1)}, ${f(x.offsetHours.p90, 1)}]` : ''} | ${x.withDetection ? f(x.dvMS, 2) : ''} | ${x.hits ? `${f(x.hitEpochErrorMin.median, 1)} [${f(x.hitEpochErrorMin.p10, 1)}, ${f(x.hitEpochErrorMin.p90, 1)}]` : ''} | ${x.hits ? `${f(x.hitDvOverPlanned, 2)} [${f(x.hitDvOverPlannedSpread.p10, 2)}, ${f(x.hitDvOverPlannedSpread.p90, 2)}]` : ''} |`);
    L.push('#### The ISS pre-burn windows, diagnostic (amendments A12c and A12d)', '',
      'The same 99 planned burns of the pre-burn files, windows cut around each burn on the same states, weather and rules. The stretches before and after the burn hold no planned burn (a detection in them is a false alarm); the other two hold the burn. Position is the place of the detection in the window (0 start, 1 end); offset is the detected epoch less TIG for the detections not within 92 min of it:', '',
      `| Build | Window | Scored | Windows with a detection | Hits / elsewhere / none | Position, median [10th, 90th] | Offset from TIG (h), median [10th, 90th] | Absolute delta-v, median (m/s) | Hits: epoch error (min), median [10th, 90th] | Hits: delta-v over planned, median [10th, 90th] |`, '| --- | --- | --- | --: | --- | --- | --- | --: | --- | --- |',
      ...(opts.later ? [] : e.history.filter((x) => x.m24b).flatMap((x) => part(x.m24b, x.build))), ...part(e.m24b, e.build), ...later.filter((x) => x.m24b).flatMap((x) => part(x.m24b, x.build)), '');
  }
  if (e.m27) {
    const builds = [...(opts.later ? [] : e.history.filter((x) => x.m27)), e, ...later.filter((x) => x.m27)];
    const rate = (x, y) => (y ? f(x / y, 1) : '');
    const pv = (x) => (x === null || x === undefined ? '' : x < 0.001 ? '< 0.001' : f(x, 3));
    const nullCell = (t) => (t.outages ? `${f(t.expected, t.expected < 1 ? 3 : 1)} of ${t.outages}, observed ${t.observed}, P(at least) ${pv(t.tail)}, P(at most) ${pv(t.head)}` : '');
    const scoring = (b, g) => `| ${b.build} | ${g.name} | ${g.satellites} | ${g.answered} of ${g.windows} (${g.skipped} skipped${Object.keys(g.refused).length ? `, refused ${Object.entries(g.refused).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}) | ${g.outagesInNotices} / ${g.outagesInNotices - g.outagesWithoutOrbit} / ${g.scoreable} | ${g.hitForecast} of ${g.scoreable} | ${nullCell(g.offNotice.forecast)} | ${nullCell(g.offNotice.pooledForecast)} | ${g.hitActual} of ${g.withActual} | ${nullCell(g.offNotice.actual)} | ${nullCell(g.offNotice.pooledActual)} | ${g.offsetHours.median !== null ? `${f(g.offsetHours.median, 1)} [${f(g.offsetHours.p10, 1)}, ${f(g.offsetHours.p90, 1)}]` : ''} | ${g.hitDvMS.n ? `${f(g.hitDvMS.median, 3)} / ${f(g.hitDvMS.max, 3)}` : ''} |`;
    const detections = (b, g) => `| ${b.build} | ${g.name} | ${g.windowsWithDetection} of ${g.answered} | ${g.distinctDetections} (${f(g.perObjectDay, 2)} per object-day) | ${g.falseAlarms} (${rate(g.falseAlarms, g.objectYears)} per object-year over ${f(g.objectYears, 2)}) | ${g.falseAlarmsInOtherOutage} / ${g.falseAlarmsNearBoundary} | ${f(g.dvMS.median, 3)} / ${f(g.dvMS.max, 3)} | ${Math.round(g.chanceHit * 100)} % |`;
    L.push('#### M27. GPS and QZSS station keeping against the NANUs and NAQUs (amendments A14 and A14b)', '',
      'The detector on 72 h windows every 24 h of the GPS satellites (ESA final orbits, 2026-001 to 2026-266) and the QZSS satellites (GFZ multi-GNSS rapid orbits, 2026-004 to 2026-273), against the forecast delta-V outages of the GPS NANUs (97 of 2026) and the QZSS NAQUs (261 of 2026). An outage is detected when a distinct detection (merged within 6 h) lies inside its forecast window plus or minus 6 h; the actual interval is the summary notice\'s. The baseline of a detection (A14b) is the off-notice window rate: the same window placed at every whole hour of the satellite\'s answered span where it overlaps no announced outage (plus or minus 6 h), the share of placements that hold a distinct detection; the cell gives the number of outages expected detected under those rates (the satellite\'s own, and the same placements pooled over the system\'s satellites), the number observed, and the probability of at least that many (independent outages, exact). False alarms are distinct detections outside every forecast window plus or minus 6 h of their satellite; the last two columns count those inside another outage notice\'s window and within 2 h of a daily-file boundary. The chance level is the share of a satellite\'s covered time inside its forecast windows plus or minus 6 h, the hit probability of one detection at a random epoch (A14; median over the satellites with outages). BeiDou is not scored: its notices were not reachable (see section 1).', '',
      '| Build | System | Satellites | Windows answered | Outages: notices / with orbits / scoreable | Detected, forecast window | Expected under the satellite\'s own off-notice rate | Expected under the pooled rate | Detected, actual interval | Own rate | Pooled rate | Offset from the actual start (h), median [10th, 90th] | Delta-v of the detections inside forecast windows (m/s), median / maximum |', '| --- | --- | --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...builds.flatMap((b) => b.m27.map((g) => scoring(b, g))), '',
      '| Build | System | Windows with a detection | Distinct detections | False alarms | In another outage / near a file boundary | Delta-v (m/s), median / maximum | Chance level (A14) |', '| --- | --- | --- | --- | --- | --- | --- | --: |',
      ...builds.flatMap((b) => b.m27.map((g) => detections(b, g))), '');
    const pct0 = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '');
    const wl = (b, g) => `| ${b.build} | ${g.name} | ${g.windowLevel.holding} | ${g.windowLevel.holdingWithDetection} (${pct0(g.windowLevel.holdingWithDetection, g.windowLevel.holding)}) | ${g.windowLevel.holdingDetectionInActual} (${pct0(g.windowLevel.holdingDetectionInActual, g.windowLevel.holding)}) | ${g.windowLevel.clear} | ${g.windowLevel.clearWithDetection} (${pct0(g.windowLevel.clearWithDetection, g.windowLevel.clear)}) | ${g.position.n ? `${g.position.firstSixth} of ${g.position.n} (${pct0(g.position.firstSixth, g.position.n)}); median ${f(g.position.median, 2)}` : ''} |`;
    L.push('Window-level rates (A14c): a window holds an outage when it contains the whole actual interval; it is clear when it overlaps no forecast window plus or minus 6 h of its satellite. The last column is where the detections lie in their windows (0 the first state, 1 the last): the detections in the first sixth, and the median position:', '',
      '| Build | System | Windows holding an outage | With a detection | With a detection inside the actual interval plus or minus 6 h | Clear windows | With a detection | Detections in the first sixth of their window; median position |', '| --- | --- | --: | --- | --- | --: | --- | --- |',
      ...builds.flatMap((b) => b.m27.filter((g) => g.windowLevel.holding || g.windowLevel.clear).map((g) => wl(b, g))), '');
    const reasons = e.m27.filter((x) => Object.keys(x.unscoreable).length || x.outagesWithoutOrbit);
    if (reasons.length) L.push(`Outages that cannot be scored (build ${e.build}; they depend on the orbit product, not on the build): ${reasons.map((x) => `${x.name}: ${[...(x.outagesWithoutOrbit ? [`${x.outagesWithoutOrbit} of a satellite without an orbit series`] : []), ...Object.entries(x.unscoreable).map(([k, v]) => `${v} ${k}`)].join(', ')}`).join('; ')}.`, '');
    const g = (e.m27.find((x) => x.system === 'qzss')?.perSatellite ?? []).concat(e.m27.find((x) => x.system === 'gps')?.perSatellite.filter((x) => x.outages) ?? []);
    if (g.length) L.push(`Per satellite with outages in the notices (build ${e.build}):`, '', '| Satellite | Orbit series (object-years) | Outages | Scoreable | Detected (forecast window) | Expected under the off-notice rate | Distinct detections (per object-day) | False alarms | Chance level (A14) |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: |',
      ...g.map((x) => `| ${x.name} | ${f(x.years, 2)} | ${x.outages} | ${x.scoreable} | ${x.hits} | ${x.offNotice.forecast.outages ? f(x.offNotice.forecast.expected, 1) : ''} | ${x.distinct} (${f(x.perObjectDay, 2)}) | ${x.falseAlarms} | ${Math.round(x.chance * 100)} % |`), '');
  }
  if (e.m27b) {
    const builds = [...(opts.later ? [] : e.history.filter((x) => x.m27b)), e, ...later.filter((x) => x.m27b)];
    const pv = (x) => (x === null || x === undefined ? '' : x < 0.001 ? '< 0.001' : f(x, 3)), pc0 = (a, b) => { if (!b) return ''; const x = (100 * a) / b; return `${x === 0 || x >= 10 ? Math.round(x) : x >= 1 ? x.toFixed(1) : x.toFixed(2)} %`; };
    const near = (n, of, expected, tailUp, tailDown) => `${n} of ${of}${expected === null || expected === undefined ? '' : `; expected ${f(expected, expected < 1 ? 3 : 1)}, P(at least) ${pv(tailUp)}, P(at most) ${pv(tailDown)}`}`;
    const rowsOf27 = (b) => {
      const gps = b.m27?.find((x) => x.system === 'gps'), qz = b.m27?.find((x) => x.system === 'qzss'), m = b.m27b, d = m.groups.deltaV, c = m.control, o = [m.groups.other, m.groups.none];
      const out = [];
      if (gps) out.push(`| ${b.build} | GPS, gap-free windows (M27) | ${gps.answered} | ${gps.windowsWithDetection} (${pc0(gps.windowsWithDetection, gps.answered)}) | ${gps.distinctDetections} | ${f(gps.falseAlarms / gps.objectYears, 1)} | ${gps.scoreable} | ${near(gps.hitForecast, gps.scoreable, gps.offNotice.pooledForecast.expected, gps.offNotice.pooledForecast.tail, gps.offNotice.pooledForecast.head)} | ${gps.hitActual} of ${gps.withActual}; expected ${f(gps.offNotice.pooledActual.expected, 3)} |`);
      out.push(`| ${b.build} | GPS, clear windows with a day cut out (M27b controls) | ${c.answered} | ${c.detected} (${pc0(c.detected, c.answered)}) | ${c.distinct} | ${f(c.falseAlarmsPerObjectYear, 1)} | | located in the hole plus or minus 6 h: ${c.located} (${pc0(c.located, c.answered)}) | |`);
      out.push(`| ${b.build} | GPS, omitted days with a delta-V outage (M27b) | ${d.answered} | ${d.detected} (${pc0(d.detected, d.answered)}); expected ${f(d.expectedDetected, 3)}, P(at least) ${pv(d.detectedAtLeast)}, P(at most) ${pv(d.detectedAtMost)} | | | ${d.answered} | ${near(d.located, d.answered, d.expectedLocated, d.locatedAtLeast, d.locatedAtMost)} | ${d.inActual} of ${d.withActual} |`);
      out.push(`| ${b.build} | GPS, omitted days with another notice or none (M27b) | ${o[0].answered + o[1].answered} | ${o[0].detected + o[1].detected} (${pc0(o[0].detected + o[1].detected, o[0].answered + o[1].answered)}) | | | | located: ${o[0].located + o[1].located} | |`);
      if (qz) out.push(`| ${b.build} | QZSS, gap-free windows (M27) | ${qz.answered} | ${qz.windowsWithDetection} (${pc0(qz.windowsWithDetection, qz.answered)}) | ${qz.distinctDetections} | ${f(qz.falseAlarms / qz.objectYears, 0)} | ${qz.scoreable} | ${near(qz.hitForecast, qz.scoreable, qz.offNotice.pooledForecast.expected, qz.offNotice.pooledForecast.tail, qz.offNotice.pooledForecast.head)} | ${qz.hitActual} of ${qz.withActual}; expected ${f(qz.offNotice.pooledActual.expected, 1)}, P(at most) ${pv(qz.offNotice.pooledActual.head)} |`);
      return out;
    };
    L.push('#### M27b. The detector across the omitted days of the GPS series (amendment A17)', '',
      'The ESA final orbits omit a satellite on the day it maneuvers: 16 of the 24 delta-V outages of the 2026 NANUs fall on a hole of exactly one day with 24 h of states on each side (A14). The omitted-day window is those two flanks (578 states) in one `detect_maneuvers` call; a hole of any other length, or one with a short flank, is not windowed (counted below). The controls are the clear windows of M27 (no delta-V outage plus or minus 6 h) with the middle day cut out, so the same call sees the same geometry on burn-free data; their rates are the chance level of the omitted-day windows (pooled over the GPS satellites; exact binomial tails). A window is located when a detection lies inside the hole plus or minus 6 h. False alarms are distinct detections (merged within 6 h) per object-year of covered time. One table holds the false-alarm rates and the hits of M27 and M27b side by side:', '',
      '| Build | Case | Windows answered | Windows with a detection | Distinct detections | False alarms per object-year | Outages scoreable | Detected near the outage (forecast window for M27; located in the hole for M27b) | Detected in the actual interval |', '| --- | --- | --: | --- | --: | --: | --: | --- | --- |',
      ...builds.flatMap(rowsOf27), '');
    const detail = (b, label, g) => `| ${b.build} | ${label} | ${g.windows} | ${g.answered}${Object.keys(g.refused).length ? ` (refused ${Object.entries(g.refused).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''} | ${g.detected} | ${g.located} | ${g.inside} | ${g.offsetHours.median !== null ? `${f(g.offsetHours.median, 1)} [${f(g.offsetHours.p10, 1)}, ${f(g.offsetHours.p90, 1)}]` : ''} | ${g.position.n ? `${g.position.firstSixth} / ${g.position.lastSixth} of ${g.position.n}; median ${f(g.position.median, 2)}` : ''} | ${g.dvMS.n ? `${f(g.dvMS.median, 3)} / ${f(g.dvMS.max, 3)}` : ''} |`;
    L.push('Detail (epoch relative to the start of the hole; position in the window, 0 the first state and 1 the last; delta-v in m/s):', '',
      '| Build | Windows | Count | Answered | Detected | Located (hole plus or minus 6 h) | Inside the hole | Epoch from the start of the hole (h), median [10th, 90th] | Detections in the first / last sixth of the window | Delta-v, median / maximum |', '| --- | --- | --: | --- | --: | --: | --: | --- | --- | --- |',
      ...builds.flatMap((b) => [detail(b, 'omitted days with a delta-V outage', b.m27b.groups.deltaV), detail(b, 'omitted days with another notice', b.m27b.groups.other), detail(b, 'omitted days with no notice', b.m27b.groups.none), detail(b, 'controls', b.m27b.control)]), '');
    L.push(`Holes of the GPS series that were not windowed (build ${e.build}): ${Object.entries(e.m27b.holesSkipped).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}.`, '');
    if (e.m27bp) {
      const pl = (id, x) => x?.m24p?.cases.find((c) => c.id === id);
      L.push('Planted impulses across a hole (rows `m27bp`): the 48 arcs of each case of A11e (60 h, the impulse at 24 h) with the states strictly between 18 h and 42 h removed. Located: a detection inside the hole plus or minus 6 h (12 h to 48 h of the arc); the epoch error is the detected epoch less the impulse epoch; the last column is the same case without a hole (A11e: hits within 92 min of the impulse).', '',
        '| Build | Planted at 24 h | Arcs | Answered | Detected | Located | Epoch error (h), median [10th, 90th] | Absolute delta-v over planted, median [10th, 90th] | Without a hole: hits within 92 min of 48 |', '| --- | --- | --: | --: | --: | --: | --- | --- | --: |',
        ...builds.filter((b) => b.m27bp).flatMap((b) => b.m27bp.cases.map((c) => `| ${b.build} | ${c.planted === null ? 'none (control)' : `${AX[c.axis]} ${c.planted} m/s`} | ${c.arcs} | ${c.answered}${Object.keys(c.refused).length ? ` (refused ${Object.entries(c.refused).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''} | ${c.detected} | ${c.located} | ${c.detected ? `${f(c.epochErrorHours.median, 1)} [${f(c.epochErrorHours.p10, 1)}, ${f(c.epochErrorHours.p90, 1)}]` : ''} | ${c.planted !== null && c.detected ? `${f(c.dvRatio.median, 2)} [${f(c.dvRatio.p10, 2)}, ${f(c.dvRatio.p90, 2)}]` : ''} | ${pl(c.id, b) ? (c.planted === null ? `${pl(c.id, b).detections} detected` : pl(c.id, b).hits) : ''} |`)), '');
    }
  }
  if (e.previous && !opts.later && (e.previous.m24c || e.previous.m24a || e.previous.m24)) {
    const builds = [...e.history.filter((x) => x.m24 || x.m24c || x.m24a), e, ...later.filter((x) => x.m24 || x.m24c || x.m24a)];
    const cells = [
      ['ISS, NASA files without a reboost (M24): windows with a detection', (x) => (x.m24 ? `${x.m24.windowsWithDetection} of ${x.m24.windows}` : '')],
      ['Burn-free FFM-1 Starlink arcs (M24c): windows with a detection', (x) => (x.m24c ? `${x.m24c.windowsWithDetection} of ${x.m24c.windows}` : '')],
      ['Burn-free FFM-1 Starlink arcs: false alarms per object-year', (x) => (x.m24c ? f(x.m24c.falseAlarmsPerObjectYear, 1) : '')],
      ['ISS archive, burn-free windows with a detection', (x) => (x.m24a ? `${x.m24a.free.windowsWithDetection} of ${x.m24a.free.windows}` : '')],
      ['ISS archive, burn-free: false alarms per object-year', (x) => (x.m24a ? f(x.m24a.free.falseAlarmsPerObjectYear, 1) : '')],
      ['ISS archive, 72 h pre-burn windows: hits / detection elsewhere / none', (x) => (x.m24a ? `${x.m24a.pre.hits} / ${x.m24a.pre.wrongEpoch} / ${x.m24a.pre.none} of ${x.m24a.pre.windows}` : '')],
      ['ISS archive, 72 h pre-burn hits: epoch error (min), median; absolute delta-v over planned, median', (x) => (x.m24a && x.m24a.pre.hits ? `${f(x.m24a.pre.epochErrorMin.median, 1)}; ${f(x.m24a.pre.dvRatio.median, 2)}` : '')],
      ['ISS archive, 72 h post-burn windows: hits / elsewhere / none', (x) => (x.m24a ? `${x.m24a.post.hits} / ${x.m24a.post.wrongEpoch} / ${x.m24a.post.none} of ${x.m24a.post.windows}` : '')],
      ...['sub-tight', 'sub-p6', 'sub-p8', 'sub-across', 'sub-p24'].map((kind) => [`ISS archive diagnostic, ${{ 'sub-tight': 'TIG - 4 h to TIG + 24 h', 'sub-p6': 'TIG - 6 h to TIG + 24 h', 'sub-p8': 'TIG - 8 h to TIG + 24 h', 'sub-across': 'TIG - 12 h to TIG + 36 h', 'sub-p24': 'TIG - 24 h to TIG + 24 h' }[kind]}: hits of the windows scored`, (x) => { const k = x.m24b?.find((y) => y.kind === kind); return k && k.scored ? `${k.hits} of ${k.scored}` : ''; }]),
      ...PLANTED_CASES.map((id) => [`Planted arcs, ${id === 'ctl' ? 'control: detections (of 48)' : `${id}: hits within ${HIT_MIN} min (of 48)`}`, (x) => { const c = x.m24p?.cases.find((y) => y.id === id); return c ? (id === 'ctl' ? `${c.detections}` : `${c.hits}`) : ''; }]),
    ];
    L.push(`#### The detector across builds`, '', `| Measurement | ${builds.map((x) => x.build).join(' | ')} |`, `| --- | ${builds.map(() => '--:').join(' | ')} |`, ...cells.map(([label, fn]) => `| ${label} | ${builds.map(fn).join(' | ')} |`), '');
  }
  if (e.m25) {
    L.push('#### M25. LRO and Danuri against the truth-side maneuver list', '',
      'The module\'s treatment of each Moon-centered window (the whole arc, a segment, a refusal by name) against the maneuvers of the list (`lunar-maneuvers.json`) inside the fit span, inside the held-out days only, or none. A segment starts at the arc start plus USER_DEFINED_SDNGP_MANEUVER_BEFORE_SECONDS; the lag is that start minus the last listed maneuver in the fit span (positive: the segment starts after it).', '',
      '| Body | Windows | Listed maneuvers | In the fit span: whole / segment / refused | Held-out days only: whole / segment / refused | None: whole / segment / refused | Lag (h): median [min, max] | Segment after / before the last maneuver | Day 3 median: whole / segment |', '| --- | --: | --: | --- | --- | --- | --- | --- | --- |',
      ...e.m25.map((b) => `| ${b.pack === 'lro-lunar' ? 'LRO' : 'Danuri'} | ${b.windows} | ${b.maneuversListed} | ${b.inFitSpan.whole} / ${b.inFitSpan.segment} / ${b.inFitSpan.refused} | ${b.heldOutOnly.whole} / ${b.heldOutOnly.segment} / ${b.heldOutOnly.refused} | ${b.none.whole} / ${b.none.segment} / ${b.none.refused} | ${f(b.lagHours.median, 1)} [${f(b.lagHours.min, 1)}, ${f(b.lagHours.max, 1)}] | ${b.segmentStartsAfterLast} / ${b.segmentStartsBeforeLast} | ${f(b.day3.whole)} / ${f(b.day3.segment)} |`), '');
  }
  if (e.previous) { // the previous complete build beside this one (amendment A12): previous -> now
    const p = e.previous, arrow = (a, c, d = 3) => `${f(a, d)} -> ${f(c, d)}`;
    if (p.m22 && e.m22) {
      const prev = new Map(p.m22.cases.map((c) => [c.id, c]));
      L.push(`#### M22, M23, M28 and M25, build ${p.build} -> build ${e.build}`, '', `M22, the impulse map (median over satellites; excess over the control of the same satellite, day 3, km; response error, day 3, km; the control's own day 1 / 2 / 3 median RMS ${DAYS.map((k) => arrow(p.m22.control[k], e.m22.control[k])).join(', ')} km):`, '',
        '| Case | Scored | Excess day 1 | Excess day 3 | Response day 3 |', '| --- | --: | --: | --: | --: |',
        ...e.m22.cases.map((c) => { const o = prev.get(c.id); return `| ${c.kind === 'map0' ? 'zero delta-v through the map' : `${AX[c.axis]} ${c.dvMS} m/s`} | ${o ? `${o.scored} -> ` : ''}${c.scored} | ${o ? arrow(o.excess[1].median, c.excess[1].median) : f(c.excess[1].median)} | ${o ? arrow(o.excess[3].median, c.excess[3].median) : f(c.excess[3].median)} | ${o ? arrow(o.response[3].median, c.response[3].median) : f(c.response[3].median)} |`; }), '');
    }
    if (p.m23 && e.m23) {
      const prev = new Map(p.m23.cases.map((c) => [c.id, c]));
      L.push('M23, finite burns along V with 1 m/s (arm A: the module\'s finite-burn map; arm B: the centroid impulse; excess over the control, day 3, median km; response error, day 3 of arm A):', '',
        '| Duration | Excess day 3, arm A | Excess day 3, arm B | Response day 3, arm A |', '| --: | --: | --: | --: |',
        ...e.m23.cases.filter((c) => c.axis === 'V' && c.dvMS === 1).map((c) => { const o = prev.get(c.id); return `| ${c.durationMin} min | ${o ? arrow(o.A.excess[3].median, c.A.excess[3].median) : f(c.A.excess[3].median)} | ${o ? arrow(o.B.excess[3].median, c.B.excess[3].median) : f(c.B.excess[3].median)} | ${o ? arrow(o.A.response[3].median, c.A.response[3].median) : f(c.A.response[3].median)} |`; }), '');
    }
    if (p.m28 && e.m28) {
      const n = (o, k) => o?.[k] ?? 0, pp = p.m28.precedence.any, np = e.m28.precedence.any;
      L.push(`M28, the hand-off: a criterion trips at a higher level than the one where the 0 to 3 h error first exceeds 1 km in ${n(pp.error1km, 'before')} -> ${n(np.error1km, 'before')} cells, at the same node in ${n(pp.error1km, 'same')} -> ${n(np.error1km, 'same')} and after it in ${n(pp.error1km, 'after')} -> ${n(np.error1km, 'after')}; fits refused ${p.m28.fitRefused} -> ${e.m28.fitRefused}; \`reentry\` refused ${Object.values(p.m28.reentryRefusals).reduce((a, v) => a + v, 0)} -> ${Object.values(e.m28.reentryRefusals).reduce((a, v) => a + v, 0)} of ${e.m28.rows} nodes. REENTRY_EPOCH less FFM-1's stop at 100 km (median hours; absolute error median; T100 inside the window):`, '',
        '| Lead | Nodes | Error median | Absolute error median | Uncertainty median (h) | T100 inside the window |', '| --- | --: | --: | --: | --: | --: |',
        ...e.m28.reentry.map((r, i) => { const o = p.m28.reentry[i]; return `| ${r.lead} | ${o.nodes} -> ${r.nodes} | ${arrow(o.errorHours.median, r.errorHours.median, 2)} | ${arrow(o.absErrorHours.median, r.absErrorHours.median, 2)} | ${arrow(o.uncHours.median, r.uncHours.median, 2)} | ${o.inWindow} of ${o.windowKnown} -> ${r.inWindow} of ${r.windowKnown} |`; }), '');
    }
    if (p.m25 && e.m25) L.push(`M25, the Moon-centered windows in the fit span of a listed maneuver (whole / segment / refused): ${e.m25.map((b) => { const o = p.m25.find((x) => x.pack === b.pack); return `${b.pack === 'lro-lunar' ? 'LRO' : 'Danuri'} ${o ? `${o.inFitSpan.whole} / ${o.inFitSpan.segment} / ${o.inFitSpan.refused} -> ` : ''}${b.inFitSpan.whole} / ${b.inFitSpan.segment} / ${b.inFitSpan.refused}`; }).join('; ')}; windows with no listed maneuver in the fit span treated as a segment or refused: ${e.m25.map((b) => { const o = p.m25.find((x) => x.pack === b.pack); const cnt = (x) => x.heldOutOnly.segment + x.heldOutOnly.refused + x.none.segment + x.none.refused; return `${b.pack === 'lro-lunar' ? 'LRO' : 'Danuri'} ${o ? `${cnt(o)} -> ` : ''}${cnt(b)}`; }).join('; ')}.`, '');
  }
  if (e.m29 || e.m30 || e.m31) L.push('### 16c. Real reentries, controlled deorbits and first sets (amendment A11)', '');
  if (e.m29) {
    const m = e.m29, pc = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '' : `${Math.round(x * 100)} %`);
    const named = (o) => (Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ') : 'none');
    const accuracy = (g) => ['| Time to go | Predictions | Answered (objects) | Median error (h) | Median absolute error (h) | 90th percentile absolute error (h) | Median absolute error over time to go |', '| --- | --: | --: | --: | --: | --: | --: |',
      ...g.bins.map((b) => `| ${b.name} | ${b.attempted} | ${b.n}${b.n ? ` (${b.objects})` : ''} | ${f(b.errMedian, 2)} | ${f(b.absMedian, 2)} | ${f(b.absP90, 2)} | ${f(b.absOverTau, 3)} |`),
      `| all | ${g.predictions} | ${g.all.n} (${g.all.objects}) | ${f(g.all.errMedian, 2)} | ${f(g.all.absMedian, 2)} | ${f(g.all.absP90, 2)} | ${f(g.all.absOverTau, 3)} |`];
    const coverage = (g) => ['| Time to go | Answered | Median sigma (h) | Median sigma / time to go | Within 1 sigma (68 %) | Within 2 sigma (95 %) | Inside the module\'s window | Within the 20 % rule | Equal-coverage k | k sigma over the rule\'s window (median) |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |',
      ...g.bins.filter((b) => b.n).map((b) => `| ${b.name} | ${b.n} | ${f(b.sigmaMedian, 2)} | ${f(b.sigmaOverTau, 3)} | ${pc(b.within1)} | ${pc(b.within2)} | ${pc(b.inWindow)} | ${pc(b.ruleShare)} | ${f(b.equalCoverageK, 2)} | ${f(b.kWindowOverRule, 2)} |`),
      `| all | ${g.all.n} | ${f(g.all.sigmaMedian, 2)} | ${f(g.all.sigmaOverTau, 3)} | ${pc(g.all.within1)} | ${pc(g.all.within2)} | ${pc(g.all.inWindow)} | ${pc(g.all.ruleShare)} | ${f(g.all.equalCoverageK, 2)} | ${f(g.all.kWindowOverRule, 2)} |`];
    const refusals = (g) => { const bins = g.bins.filter((b) => b.attempted > b.n).map((b) => `${b.name}: ${b.attempted - b.n} of ${b.attempted} (${named({ ...b.fitRefused, ...b.reentryRefused })})`); return `Not answered: fit refused ${named(g.fitRefused)}; \`reentry\` refused ${named(g.reentryRefused)}${bins.length ? `; by time to go, ${bins.join('; ')}` : ''}${g.skipped ? `; ${g.skipped} predictions skipped (fewer than 48 pseudo-observation states or fewer than two element sets: ${g.objectsWithoutSets} objects)` : ''}.`; };
    L.push('#### M29. Real reentries', '',
      `Build ${m.build}. Predictions at element-set epochs from 14 days before the reentry (4 h apart or more): the pseudo-observations of the object's element-set history up to the epoch (the last 120 h; the SGP4 module propagates each set over the interval it speaks for, 300 s states) go to \`${fitMethodOf(m.methods ?? e.methods)}\` (the module chooses the span) and the set to \`reentry\` with the daily space weather of the years. Time to go is the true one (truth less the prediction epoch); the error is REENTRY_EPOCH less the truth and sigma is REENTRY_EPOCH_UNC (68.27 %). The 20 % rule is |error| <= 0.2 (REENTRY_EPOCH less the epoch); the equal-coverage k is the multiple of sigma that covers the same share of the predictions in the bin as the rule does, and k sigma over the rule's window is below 1 where the module's window is narrower at equal coverage. The space weather is the observed daily values of the years (GFZ Kp, ap, Ap and F10.7 up to 2026-09-12, the saved table after it), which include the days after each prediction epoch: a forecast issued at the epoch would be less exact, so the comparison with Aerospace and with the TIP messages, which use forecasts, favors SDN-AP in that one respect.`, '');
    if (m.C.predictions) L.push(`**Sample C: ${m.C.objects} objects with an observed reentry in the CORDS spreadsheet** (${m.C.starlinkObjects} Starlinks, ${m.C.objects - m.C.starlinkObjects} other objects; truth: the observed time, minute precision), ${m.C.predictions} predictions.`, '', ...accuracy(m.C), '', ...coverage(m.C), '', refusals(m.C), '');
    if (m.T.predictions) L.push(`**Sample T: ${m.T.objects} objects with a Space-Track decay message and a last TIP message before the archive's last snapshot** (${m.T.starlinkObjects} Starlinks; truth: that message's DECAY_EPOCH, a window of about a minute: Space-Track's settled time, not an observation), ${m.T.predictions} predictions.`, '', ...accuracy(m.T), '', ...coverage(m.T), '', refusals(m.T), '');
    if (m.C.starlink && m.C.other) L.push(`By kind (all times to go): sample C Starlinks ${m.C.starlink.n} answered, within 1 sigma ${pc(m.C.starlink.within1)}, 2 sigma ${pc(m.C.starlink.within2)}, median |error| ${f(m.C.starlink.absMedian, 2)} h; other objects ${m.C.other.n}, ${pc(m.C.other.within1)}, ${pc(m.C.other.within2)}, ${f(m.C.other.absMedian, 2)} h${m.T.starlink && m.T.other ? `; sample T Starlinks ${m.T.starlink.n}, ${pc(m.T.starlink.within1)}, ${pc(m.T.starlink.within2)}, ${f(m.T.starlink.absMedian, 2)} h; other objects ${m.T.other.n}, ${pc(m.T.other.within1)}, ${pc(m.T.other.within2)}, ${f(m.T.other.absMedian, 2)} h` : ''}.`, '');
    const a = m.aerospace;
    if (a.objects) L.push(`**Against Aerospace's prediction at its own element-set epoch** (sample C; ${a.objects} objects, SDN-AP answered ${a.answered}${Object.keys(a.refused).length ? `, refused: ${named(a.refused)}` : ''}): the observed time lies inside Aerospace's stated window for ${a.aerospaceInside} of ${a.objects} and inside SDN-AP's 1 sigma and 2 sigma for ${a.sdnapIn1} and ${a.sdnapIn2} of ${a.answered}; median |error| ${f(a.aerospaceAbsMedian, 2)} h (Aerospace) against ${f(a.sdnapAbsMedian, 2)} h (SDN-AP), SDN-AP closer for ${a.sdnapCloser} of ${a.answered}; median window half-width over time to go ${f(a.halfWidthOverTau, 3)} (Aerospace) against ${f(a.sdnapSigmaOverTau, 3)} (SDN-AP sigma). Aerospace's values are the spreadsheet's (a prediction and its stated plus or minus); the table gives errors and widths only:`, '',
      '| Object | Time to go (h) | Aerospace error (h) | Aerospace plus or minus (h) | SDN-AP error (h) | SDN-AP sigma (h) |', '| --- | --: | --: | --: | --: | --: |',
      ...a.objectsDetail.map((x) => `| ${x.norad} | ${f(x.tauHours, 1)} | ${f(x.aerospaceErr, 2)} | ${f(x.aerospaceHalf, 2)} | ${x.sdnap.err !== undefined ? f(x.sdnap.err, 2) : `refused (${x.sdnap.refused})`} | ${x.sdnap.err !== undefined ? f(x.sdnap.sigma, 2) : ''} |`), '');
    if (m.tip.predictionsWithTip) L.push(`**Against Space-Track's TIP message in force at the same epoch** (sample T; the latest message before the epoch, ${m.tip.predictionsWithTip} predictions have one; the truth is the last message, so the comparison is exact only in the sense of that series):`, '',
      '| Time to go | Answered | With a TIP message | TIP median absolute error (h) | SDN-AP median absolute error on the same (h) | Truth inside the TIP window | Truth inside SDN-AP 2 sigma | SDN-AP closer |', '| --- | --: | --: | --: | --: | --: | --: | --: |',
      ...m.tip.byBin.filter((b) => b.withTip).map((b) => `| ${b.name} | ${b.answered} | ${b.withTip} | ${f(b.tipAbsMedian, 2)} | ${f(b.sdnapAbsMedian, 2)} | ${pc(b.tipInside)} | ${pc(b.sdnapIn2)} | ${b.sdnapCloser} of ${b.withTip} |`), '');
  }
  if (e.m30) {
    const m = e.m30, lab = { default: 'as shipped', rule: 'rule (B_eff above 0.5 replaced by tau0)', free: 'free B_eff' };
    L.push('#### M30. Controlled deorbits (what build ' + e.build + ' covers)', '',
      `Not covered: the residual series (theory plus the operator's Chebyshev residual inside its span) and a burn model with its stop epoch are not methods of the build (its methods are ${e.methods ? `${e.methods.slice(0, -1).join(', ')} and ${e.methods.at(-1)}` : 'in its manifest'}). Covered and shown in section 2b: the lowering Starlinks' held-out errors for the three settings. Covered here: \`reentry\` on the set fitted to the first 24 h of each of the ${m.satellites} Starlinks with B_eff above 0.5 m2/kg, issued ${m.issuedFirst.slice(0, 16)} to ${m.issuedLast.slice(0, 16)} UTC, to be scored against Space-Track's TIP and decay messages as they arrive. As of the archive's newest snapshot (${m.snapshot ?? 'none'}) ${m.objectsWithTip} of the ${m.satellites} have a TIP message and ${m.objectsWithDecay} a decay message.`, '',
      '| Setting | Fits | `reentry` answered | Refused | Predicted lifetime (days), median [min, max] | Sigma (h), median | Scored | Within 1 / 2 sigma |', '| --- | --: | --: | --- | --- | --: | --: | --- |',
      ...m.variants.map((v) => `| ${lab[v.variant]} | ${v.fitOk} | ${v.reentryOk} | ${Object.keys(v.refused).length ? Object.entries(v.refused).map(([k, c]) => `${k} ${c}`).join(', ') : 'none'} | ${v.reentryOk ? `${f(v.lifetimeDays.median, 1)} [${f(v.lifetimeDays.min, 1)}, ${f(v.lifetimeDays.max, 1)}]` : ''} | ${f(v.sigmaHours.median, 1)} | ${v.scored} | ${v.scored ? `${pc(v.within1)} / ${pc(v.within2)}` : ''} |`), '',
      ...(opts.later ? [] : ['The predictions of every build (the shipped setting; the free setting gives the same epochs), frozen in this table when it was committed; a dash is a refusal by name (above) or a build that issued none:', '']),
      ...(opts.later ? [] : (() => {
        const builds = [...e.history.filter((x) => x.m30), e, ...later.filter((x) => x.m30)];
        const status = (x) => (x.decayMessage && x.lastTipDecayUtc ? `decayed ${x.lastTipDecayUtc.slice(0, 16)}` : x.tipMessages ? `${x.tipMessages} TIP messages, last ${x.lastTipDecayUtc.slice(0, 16)}` : 'none yet');
        const byBuild = builds.map((b) => new Map(b.m30.predictions.map((x) => [x.norad, x])));
        const objects = [...new Set(byBuild.flatMap((mp) => [...mp.keys()]))].sort((a, c) => Math.min(...byBuild.map((mp) => mp.get(a)?.epoch ?? '9')) < Math.min(...byBuild.map((mp) => mp.get(c)?.epoch ?? '9')) ? -1 : 1);
        const first = (n) => byBuild.map((mp) => mp.get(n)).find(Boolean);
        return [`| Object | B_eff (FFM-1 fit, m2/kg) | ${builds.map((b) => `${b.build}: predicted reentry (UTC), sigma (h)`).join(' | ')} | Space-Track TIP / decay |`, `| --- | --: | ${builds.map(() => '---').join(' | ')} | --- |`,
          ...objects.map((n) => `| ${n} | ${f(first(n).bEffFfm, 2)} | ${byBuild.map((mp) => { const x = mp.get(n); return x ? `${x.epoch.slice(0, 16)}, ${f(x.uncHours, 1)}` : '-'; }).join(' | ')} | ${status(first(n))} |`),
          '', `Issued (UTC): ${builds.map((b) => `${b.build} ${b.m30.issuedFirst.slice(0, 16)} to ${b.m30.issuedLast.slice(0, 16)}`).join('; ')}.`, ''];
      })()));
  }
  if (e.m31) {
    const m = e.m31;
    L.push('#### M31. First sets of a new batch', '',
      `The method is covered by the build (\`launch_set\` makes the set from the insertion orbit; \`${fitMethodOf(e.methods)}\` takes an early ephemeris with that set as \`prior\`). The data are not held: the capture cycles keep derived products only, so the cycle of 2026-10-24T05:01Z, in which the new batch appeared (${m.satellites} satellites, provisional ids ${m.firstId} to ${m.lastId}), holds no first state, and the server serves each satellite's current file only. The clock was started with the current files (created ${m.fileCreated.min.slice(0, 16)} to ${m.fileCreated.max.slice(0, 16)} UTC, processed ${m.processed.first.slice(0, 16)} to ${m.processed.last.slice(0, 16)} UTC, one request at a time, kept in memory only): ${m.captured} of ${m.satellites} processed as the registered Starlinks are (fit by analysis/od, FFM-1 for 96 h, derived values kept). The per-object fits of 6, 12 and 24 h inside the files' own later states follow (amendment A12b); \`launch_set\` and \`launch_batch\` need the batch's parent state, which the files do not carry, and are measured on synthetic batches below; the scoring on newer files (days 1 to 3 after the fit end) is registered in A11c for 2026-10-25 to 2026-10-28 and is not run.`, '',
      `The states of the captured files start ${m.fileStart.min.slice(0, 16)} to ${m.fileStart.max.slice(0, 16)} UTC. Fit of the first 24 h against SpaceX's states: RMS median ${f(m.fitRmsKm.median, 2)} km (90th percentile ${f(m.fitRmsKm.p90, 2)}); B_eff median ${f(m.bEff.median, 4)} m2/kg; at the zero bound: ${m.bEffZeroBound}. Held-out RMS against the FFM-1 truth, days 1 / 2 / 3, median (km): SGP4-XP ${[1, 2, 3].map((k) => f(m.xpDays[k].median, 1)).join(' / ')}; SGP4 ${[1, 2, 3].map((k) => f(m.sgp4Days[k].median, 1)).join(' / ')}. What M31 needs from the capture: the first state (only) of every new id kept at first sight, with the file's hash.`, '');
  }
  if (e.previous) {
    const p = e.previous, arrow = (a, c, d = 3) => `${f(a, d)} -> ${f(c, d)}`;
    if (p.m29 && e.m29) {
      const row = (name, a, c) => (a?.scored || c?.scored ? `${name}: answered ${a?.scored ?? 0} of ${a?.predictions ?? 0} -> ${c?.scored ?? 0} of ${c?.predictions ?? 0}, within 1 sigma ${a?.scored ? Math.round(a.all.within1 * 100) : ''} % -> ${c?.scored ? Math.round(c.all.within1 * 100) : ''} %, within 2 sigma ${a?.scored ? Math.round(a.all.within2 * 100) : ''} % -> ${c?.scored ? Math.round(c.all.within2 * 100) : ''} %, median absolute error ${a?.scored ? f(a.all.absMedian, 1) : ''} -> ${c?.scored ? f(c.all.absMedian, 1) : ''} h` : '');
      L.push(`M29, build ${p.build} -> build ${e.build}: ${[row('sample C', p.m29.C, e.m29.C), row('sample T', p.m29.T, e.m29.T)].filter(Boolean).join('; ')}.`, '');
    }
    if (p.m30 && e.m30) {
      const pv = p.m30.variants.find((v) => v.variant === 'default'), nv = e.m30.variants.find((v) => v.variant === 'default'), pr = p.m30.variants.find((v) => v.variant === 'rule'), nr = e.m30.variants.find((v) => v.variant === 'rule');
      L.push(`M30, build ${p.build} -> build ${e.build}: \`reentry\` answered ${pv.reentryOk} -> ${nv.reentryOk} of ${nv.rows} at the shipped setting (predicted lifetime median ${arrow(pv.lifetimeDays.median, nv.lifetimeDays.median, 1)} days), and ${pr.reentryOk} -> ${nr.reentryOk} at the rule setting (${Object.keys(nr.refused).join(', ') || 'none refused'}); both builds' predictions are frozen in the rows with their issue times.`, '');
    }
  }
  if (e.m31captured) {
    const m = e.m31captured, cell = (a, k) => (a[k].n ? `${f(a[k].median)} (${f(a[k].p90)})` : '');
    L.push('**M31 on the captured batch: per-object fits of the first 6, 12 and 24 h** (amendment A12b; ' + m.satellites + ' satellites; held-out days 1 to 3 after the fit end inside each file\'s own planned states as FFM-1 carries them, not newer files; median and 90th percentile of the 3D RMS, km):', '',
      '| Fit length | Arm | Day 1 | Day 2 | Day 3 |', '| --: | --- | --: | --: | --: |',
      ...m.hours.flatMap((h) => [['SDN-AP', h.sdnap], ['SGP4-XP', h.xp], ['SGP4', h.sgp4]].map(([name, a]) => `| ${h.hours} h | ${name} | ${[1, 2, 3].map((k) => cell(a, k)).join(' | ')} |`)), '',
      '| Fit length | SDN-AP fit RMS (km, median) | B_eff (m2/kg): median [min, max] | Median sigma of B_eff, share of B_eff | B_eff over its 24 h value: median [10th, 90th percentile] | Refused |', '| --: | --: | --- | --: | --- | --- |',
      ...m.hours.map((h) => `| ${h.hours} h | ${f(h.fitRms)} | ${f(h.bEff.median, 4)} [${f(h.bEff.min, 4)}, ${f(h.bEff.max, 4)}] | ${f((100 * h.bEffSigma) / h.bEff.median, 2)} % | ${f(h.bEffRatio24.median, 2)} [${f(h.bEffRatio24.p10, 2)}, ${f(h.bEffRatio24.p90, 2)}] | ${Object.keys(h.refused).length ? Object.entries(h.refused).map(([k, v]) => `${k} ${v}`).join(', ') : 'none'} |`), '');
  }
  if (e.m32 && e.m32.length) {
    const cell = (a, k) => (a[k].n ? `${f(a[k].median)} (${f(a[k].p90)})` : '');
    L.push('#### M31 and M32 on synthetic FFM-1 batches with a known parent state (amendment A12b)', '',
      'Batches of 27 objects released from one circular parent orbit (6,630 km, 70 degrees), each with its own separation delta-v and ballistic coefficient; FFM-1 truth; the parent state given to the module is exact. Arms: SDN-AP per object (A), SDN-AP per object with the `launch_set` set as prior (B), `launch_set` alone (C), the batch-joint fit `launch_batch` (D), SGP4-XP and SGP4 per object (E). Median and 90th percentile of the 3D RMS (km) over the objects of the group, days 1 to 3 after the fit end (C: after the first file\'s start):', '');
    for (const g of e.m32) {
      L.push(`**Separation sigma ${g.sigmaMS} m/s per axis** (batches ${g.batches.join(', ')}; ${g.objects} objects): \`launch_set\` alone, ${g.launchSet.ok} of ${g.launchSet.windows} answered, days 1 / 2 / 3: ${[1, 2, 3].map((k) => cell(g.launchSet.days, k)).join(' / ')}.`, '',
        '| Fit length | Arm | Day 1 | Day 2 | Day 3 |', '| --: | --- | --: | --: | --: |',
        ...g.hours.flatMap((h) => [['A SDN-AP per object', h.sdnap], ['B SDN-AP with launch_set prior', h.prior], ['D launch_batch (joint)', h.joint.days], ['E SGP4-XP', h.xp], ['E SGP4', h.sgp4]].map(([name, a]) => `| ${h.hours} h | ${name} | ${[1, 2, 3].map((k) => cell(a, k)).join(' | ')} |`)), '',
        '| Fit length | Joint minus per-object (D - A), median km: day 1 / 2 / 3 | Objects where D is lower: day 1 / 2 / 3 | Relative B_eff error, median: A / B / D | Joint calls answered | Names matched |', '| --: | --- | --- | --- | --- | --: |',
        ...g.hours.map((h) => `| ${h.hours} h | ${h.paired.map((x) => f(x.medianDiff)).join(' / ')} | ${h.paired.map((x) => `${x.jointBetter} of ${x.n}`).join(' / ')} | ${f(h.bEffError.sdnap, 3)} / ${f(h.bEffError.prior, 3)} / ${f(h.bEffError.joint, 3)} | ${h.joint.ok} of ${h.joint.calls}${Object.keys(h.joint.refused).length ? ` (${Object.entries(h.joint.refused).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''} | ${h.joint.namesMatch} of ${h.joint.objects} |`), '');
    }
  }
  return L;
}
