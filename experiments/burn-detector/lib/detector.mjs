// The burn detector (stack issues 462 and 506): burns found in a precise orbit by the numerical propagator alone, strictly as of a time.
// Each piece of the truth is flown from the truth's own state at its start with the row's full numerical setting (propagator/ffm 2.2.0,
// lib/ffm.mjs of headline-loop) and judged as of its own end E, with nothing from after E: the force terms of the object's stored fits whose
// cutoff is at or before E, the space weather as issued at E (the table's as-issued rows of E's day), and thresholds from the pieces that
// ended before E. A flagged piece is halved by flights from the truth down to about 90 s; a burn is known once the earliest piece that
// localizes it has ended and its delta-v, estimated from both sides with truth states no later than that time, holds from states 10 and
// 20 min further out. Module calls fly every state; JavaScript takes the differences and the frame axes.
import fs from 'node:fs';
import path from 'node:path';
const HL = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../headline-loop');
const E = await import(path.join(HL, 'lib/env.mjs'));
E.usePackages();
export const W = await import(path.join(HL, 'lib/windows.mjs'));
export const A = await import(path.join(HL, 'lib/arms.mjs'));
export const F = await import(path.join(HL, 'lib/ffm.mjs'));
const ST = await import(path.join(HL, 'lib/settings.mjs'));
export const { SETTINGS, FULL_SETTING } = ST;
export const HOUR = 3600e3, DAY = 86400e3;
export const ms = (t) => Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`);
export const iso = (t) => new Date(Math.round(t)).toISOString();
export const slugOf = (name) => name.replace(/[^A-Za-z0-9]+/g, '_');

/** A row's windows (the first pass, and the second with second: true). */
export function windowsOf(g, { second = false } = {}) { const all = W.windowsOf([g]); return [...all.windows, ...(second ? all.second : [])]; }
/** The union of a satellite's window spans (fit arc and 7 days after): [[fromMs, toMs]]. */
export function spansOf(list) {
  const iv = list.map((w) => [w.cutoffMs - Math.max(...w.arcs) * HOUR, w.cutoffMs + 7 * DAY]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of iv) { const m = merged.at(-1); if (m && a <= m[1]) m[1] = Math.max(m[1], b); else merged.push([a, b]); }
  return merged;
}

/** The full setting's stored fits of one object (headline-loop's numerical rows, FFMq): [{ cutoffMs, parameters }], the oldest first. */
export function fittedTerms(g, name) {
  const dir = path.join(A.STORE_ROOT, A.NUMERICAL_STORE), parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^rows-truth-.*\.jsonl$/.test(x))) {
    for (const r of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean)) {
      if (r.group !== g || r.name !== name || r.error) continue;
      const a = r.arms?.FFMq?.sameAs ? r.arms[r.arms.FFMq.sameAs] : r.arms?.FFMq;
      if (a?.ok && a.parameters) out.push({ cutoffMs: Date.parse(r.cutoff), parameters: a.parameters });
    }
  }
  return out.sort((a, b) => a.cutoffMs - b.cutoffMs);
}
const median = (v) => { const s = v.slice().sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** The force terms as of t: per term, the median over the object's fits whose cutoff lies in the `days` up to t (a drag term at its lower
 *  bound left out: that fit absorbed something the dynamics do not hold); with none there, the most recent such fit before t; with none at
 *  all, the setting's own starting values. Nothing from after t. Fourteen days hold several fits of every row, so one fit that took a
 *  station-keeping burn into its radiation terms does not set them (a 3-day pool held one or two such fits on the commercial geostationary
 *  row, and its flights left hundreds of unlocalized intervals). */
export const TERMS_DAYS = 14;
export function termsAsOf(terms, settings, t, days = TERMS_DAYS) {
  const okFit = (x) => x.cutoffMs <= t && !x.parameters.some((p) => p.kind === 'DRAG_AREA_OVER_MASS' && p.value <= 1e-9);
  const near = terms.filter((x) => okFit(x) && x.cutoffMs >= t - days * DAY);
  const pool = near.length ? near : terms.filter(okFit).slice(-1);
  if (!pool.length) return settings.parameters.map((p) => ({ kind: p.kind, value: p.value }));
  return settings.parameters.map((p) => ({ kind: p.kind, value: median(pool.map((x) => x.parameters.find((q) => q.kind === p.kind)?.value).filter(Number.isFinite)) ?? p.value }));
}
/** The space weather as issued at t: the table's as-issued rows of t's day (headline-loop lib/windows.mjs weatherAt), observed only up to it. */
const wxCache = new Map();
export function weatherAsOf(t) {
  const day = Math.floor(t / DAY) * DAY;
  if (day > Date.parse('2026-11-10T00:00:00Z')) throw new Error('weather after 2026-11-10 is never read');
  if (!wxCache.has(day)) wxCache.set(day, W.weatherAt(day).ffm);
  return wxCache.get(day);
}
/** A satellite's truth over [fromMs, toMs] through the table's own reader: [{ t, epoch, r, v }] (km, km/s, GCRF). */
export async function truthSeries(g, name, norad, fromMs, toMs, axes) {
  const tr = await W.truthOf({ key: `${g}|${norad ?? name}|detector`, group: g, name, norad, cutoffMs: toMs, arcs: [24] }, fromMs, toMs, axes);
  return tr.lines.map((l) => ({ t: ms(l.epoch), epoch: l.epoch, r: l.r, v: l.v }));
}
export const openAxesFor = async (g) => (g === 'HE' || g === 'HX' ? (await import(path.join(W.root, 'experiments/operator-theory/lib/host.mjs'))).openAxes() : null);

// ---- vectors and the R, T, N frame (the detector's own arithmetic) ----
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((x, i) => x - b[i]);
const norm = (a) => Math.hypot(...a);
function rtn(r, v, d) {
  const n = (a) => { const m = norm(a); return a.map((x) => x / m); };
  const R = n(r), N = n(cross(r, v)), T = cross(N, R), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [dot(d, R), dot(d, T), dot(d, N)];
}
/** An object's piece closure, the field burns.mjs writes as positionClosure: of the flown pieces (rows with posM, the position closure in m,
 *  and judged, thr where the flag rule judged them): { pieces, medianM, madM, p90M, p99M, floorM, thresholdM (the last judged piece's) }. The
 *  median is the weight of the object's reference in a numerical fit (headline-loop lib/arms.mjs objectSigmaM). */
export function positionClosureOf(pieces, floorM) {
  const v = pieces.map((p) => p.posM).filter(Number.isFinite).sort((a, b) => a - b);
  const med = (s) => { const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }, quant = (q) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  const medianM = v.length ? med(v) : null;
  return { pieces: v.length, medianM, madM: medianM == null ? null : med(v.map((x) => Math.abs(x - medianM)).sort((a, b) => a - b)), p90M: v.length ? quant(0.9) : null, p99M: v.length ? quant(0.99) : null, floorM, thresholdM: pieces.filter((p) => p.judged).at(-1)?.thr ?? null };
}
/** The closure fields of a list (burns.mjs writes both): positionClosure (the summary, positionClosureOf) and pieceClosures, [[end of the piece (ISO),
 *  position closure (m)], ...] by end, one per flown piece. A reader weighs an object at a cutoff from the pieces that end by it
 *  (headline-loop lib/arms.mjs objectSigmaM), so the pieces themselves, not their whole-period median, are what the list carries. */
export function closureFieldsOf(pieces, floorM) {
  const ps = pieces.filter((p) => Number.isFinite(p.posM) && p.end).slice().sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  return { positionClosure: positionClosureOf(ps, floorM), pieceClosures: ps.map((p) => [new Date(Date.parse(p.end)).toISOString(), Math.round(p.posM * 1000) / 1000]) };
}
/** State f against state q (km, km/s):{ dr: R, T, N m, dv: R, T, N mm/s of the relative velocity in the rotating frame (dv - w x dr) }. */
export function closure(q, f) {
  const dr = sub(f.r, q.r), r2 = q.r[0] ** 2 + q.r[1] ** 2 + q.r[2] ** 2, w = cross(q.r, q.v).map((x) => x / r2);
  return { dr: rtn(q.r, q.v, dr).map((x) => x * 1000), dv: rtn(q.r, q.v, sub(sub(f.v, q.v), cross(w, dr))).map((x) => x * 1e6) };
}

// ---- the truth as an index ----
export function indexTruth(lines) {
  const s = lines.slice().sort((a, b) => a.t - b.t), at = new Map(s.map((l, i) => [l.t, i]));
  const steps = s.slice(1, 2001).map((l, i) => l.t - s[i].t).sort((a, b) => a - b);
  return { s, at, stepMs: steps.length ? steps[steps.length >> 1] : 300e3 };
}
export function firstAtOrAfter(T, x) { let lo = 0, hi = T.s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T.s[m].t < x) lo = m + 1; else hi = m; } return lo; }
const lastAtOrBefore = (T, x) => firstAtOrAfter(T, x + 1) - 1;
const midOf = (T, lo, hi) => { const m = firstAtOrAfter(T, (T.s[lo].t + T.s[hi].t) / 2); return m > lo && m < hi ? m : null; };

/** The detector's flights: { ffm (openFfm), settings, terms (fittedTerms) }. One flight of the full setting from a truth state, judged as of asOfMs. */
async function flyStates(ctx, from, epochs, asOfMs) {
  const params = termsAsOf(ctx.terms, ctx.settings, asOfMs, ctx.termsDays), rows = ctx.settings.forces.drag ? weatherAsOf(asOfMs) : null;
  const product = { epoch: iso(from.t), state: [...from.r, ...from.v].map((x) => x * 1000), parameters: params };
  return { params, out: await ctx.ffm.forecast(product, epochs.map(iso), ctx.settings, rows) };
}
/** One flight from truth index i0 to the truth epochs idx, as of the last of them: the closures there. */
async function flyFrom(ctx, T, i0, idx, asOfMs = T.s[idx.at(-1)].t) {
  const { params, out } = await flyStates(ctx, T.s[i0], idx.map((i) => T.s[i].t), asOfMs);
  return { params, c: idx.map((i, k) => ({ t: T.s[i].t, ...closure(T.s[i], out[k]) })) };
}
/** One flight from truth index i0 to i1, as of asOfMs (default i1's time): the closure there, with v = |velocity closure| (mm/s). */
export async function flyClosure(ctx, T, i0, i1, asOfMs) { const { c } = await flyFrom(ctx, T, i0, [i1], asOfMs); return { ...c[0], v: norm(c[0].dv) }; }

/** The pieces starting at the nominal times `starts` (ms), each judged as of its own end: rows { nominal, start, end, n, worstGapS, dr, dv,
 *  posM, velMmS, maxM, params } (times ISO), a gap row where the truth does not cover a piece; every row handed to onRow. */
export async function pieces(ctx, T, starts, { lengthH = 6, sampleS = 300, onRow, skip } = {}) {
  const out = [], emit = (row) => { out.push(row); onRow?.(row); };
  for (const s of starts) {
    if (skip?.has(iso(s))) continue;
    const i0 = firstAtOrAfter(T, s), i1 = lastAtOrBefore(T, s + lengthH * HOUR);
    if (i0 >= T.s.length || i1 <= i0 || T.s[i0].t - s > 0.25 * lengthH * HOUR || s + lengthH * HOUR - T.s[i1].t > 0.25 * lengthH * HOUR) { emit({ nominal: iso(s), gap: true }); continue; }
    const idx = [];
    for (let i = i0 + 1; i <= i1; i += 1) if ((T.s[i].t - T.s[i0].t) % (sampleS * 1000) === 0 || i === i1) idx.push(i);
    let worst = 0; for (let i = i0 + 1; i <= i1; i += 1) worst = Math.max(worst, T.s[i].t - T.s[i - 1].t);
    if (worst > 0.25 * lengthH * HOUR) { emit({ nominal: iso(s), gap: true, worstGapS: worst / 1000 }); continue; }
    try {
      const { params, c } = await flyFrom(ctx, T, i0, idx);
      const last = c.at(-1);
      emit({ nominal: iso(s), start: iso(T.s[i0].t), end: iso(last.t), n: idx.length, worstGapS: worst / 1000, dr: last.dr.map((x) => +x.toFixed(3)), dv: last.dv.map((x) => +x.toFixed(4)),
        posM: +norm(last.dr).toFixed(3), velMmS: +norm(last.dv).toFixed(4), maxM: +Math.max(...c.map((x) => norm(x.dr))).toFixed(3), params: params.map((p) => +p.value.toPrecision(6)) });
    } catch (e) { emit({ nominal: iso(s), error: String(e?.message ?? e).slice(0, 200) }); }
  }
  return out;
}
/** The nominal starts that put every instant of [a, b] in the first half of some piece (stride = half the length). */
export function startsFor(a, b, strideH) { const st = strideH * HOUR, out = []; for (let s = Math.floor(a / st) * st; s <= Math.floor(b / st) * st; s += st) out.push(s); return out; }

/** The calibration of one burn-free piece: its halves to depth 4 (flights from the truth), the largest velocity closure per depth. */
export async function calibrate(ctx, T, lo, hi) {
  const out = {};
  let level = [[lo, hi]];
  for (let d = 1; d <= 4; d += 1) {
    const next = [];
    for (const [a, b] of level) { const m = midOf(T, a, b); if (m !== null) next.push([a, m], [m, b]); }
    for (const [a, b] of next) out[d] = Math.max(out[d] ?? 0, (await flyClosure(ctx, T, a, b)).v);
    level = next;
  }
  return out;
}
/** The search inside [lo, hi] (truth indices): halves whose velocity closure exceeds vAt(depth) are split again, both, down to about 90 s or
 *  two truth steps; where neither half exceeds it the interval is unlocalized (a spread force error, not a burn). */
export async function searchBurns(ctx, T, lo, hi, vAt, d = 0, found = []) {
  const stop = Math.max(90e3, 2 * T.stepMs);
  if (T.s[hi].t - T.s[lo].t <= stop) { const c = await flyClosure(ctx, T, lo, hi); found.push({ from: T.s[lo].t, to: T.s[hi].t, dv: c.dv, v: c.v, depth: d }); return found; }
  const m = midOf(T, lo, hi);
  if (m === null) { const c = await flyClosure(ctx, T, lo, hi); found.push({ from: T.s[lo].t, to: T.s[hi].t, dv: c.dv, v: c.v, depth: d, acrossGap: true }); return found; }
  const a = await flyClosure(ctx, T, lo, m), b = await flyClosure(ctx, T, m, hi);
  const sa = a.v > vAt(d + 1), sb = b.v > vAt(d + 1);
  if (sa) await searchBurns(ctx, T, lo, m, vAt, d + 1, found);
  if (sb) await searchBurns(ctx, T, m, hi, vAt, d + 1, found);
  if (!sa && !sb) found.push({ from: T.s[lo].t, to: T.s[hi].t, unlocalized: true, depth: d, halves: [+a.v.toFixed(4), +b.v.toFixed(4)] });
  return found;
}
/** A burn's delta-v from both sides of its extent [a0, a1], as of reportMs: the truth state at the extent's start flown forward to its middle
 *  (A) and the one at its end flown backward (B), delta-v = B - A in the rotating R, T, N frame of A; and again from truth states 10 and
 *  20 min further out on both sides, none later than reportMs. Consistent where those agree within 30 % of its size. */
export async function refineAsOf(ctx, T, a0, a1, reportMs) {
  const mid = Math.round((a0 + a1) / 2000) * 1000, est = [];
  for (const off of [0, 10, 20]) {
    const i0 = lastAtOrBefore(T, a0 - off * 60e3), i1 = firstAtOrAfter(T, a1 + off * 60e3);
    if (i0 < 0 || i1 >= T.s.length || T.s[i1].t > reportMs) continue;
    const [S0] = (await flyStates(ctx, T.s[i0], [mid], reportMs)).out, [S1] = (await flyStates(ctx, T.s[i1], [mid], reportMs)).out;
    const dr = sub(S1.r, S0.r), r2 = S0.r.reduce((s, x) => s + x * x, 0), w = cross(S0.r, S0.v).map((x) => x / r2);
    est.push({ off, dv: rtn(S0.r, S0.v, sub(sub(S1.v, S0.v), cross(w, dr))).map((x) => x * 1e6), drM: norm(rtn(S0.r, S0.v, dr)) * 1000 });
  }
  if (!est.length || est[0].off !== 0) return { error: 'the extent\'s ends are not on the truth by the report time' };
  const dv = est[0].dv, size = norm(dv), spread = Math.max(0, ...est.slice(1).map((x) => norm(sub(x.dv, dv)))) / Math.max(size, 1e-9);
  return { at: iso(mid), overS: (a1 - a0) / 1000, sizeMmS: +size.toFixed(3), dvRtnMmS: dv.map((x) => +x.toFixed(3)), positionMismatchM: +est[0].drM.toFixed(2),
    alsoFrom: est.slice(1).map((x) => ({ offMin: x.off, sizeMmS: +norm(x.dv).toFixed(3) })), spread: +spread.toFixed(3), consistent: est.length === 3 && spread < 0.3 };
}
export const lastTruthAtOrBefore = lastAtOrBefore;
/** A discontinuity of the truth, not a burn (a seam where two orbit solutions are joined): the two sides of the extent disagree in
 *  position by more than SEAM.floorM, and by more than SEAM.ratio times the most a velocity change of the refined size over the extent can
 *  account for (|dv| x extent / 2). Every burn that holds on the scoreboard's rows is at most 0.81 of that bound. The test's figures, or
 *  null. */
export const SEAM = { floorM: 10, ratio: 2 };
export function seamOf(refined) {
  if (!refined || refined.error || !Number.isFinite(refined.positionMismatchM)) return null;
  const boundM = refined.sizeMmS * 1e-3 * refined.overS / 2;
  if (!(refined.positionMismatchM > SEAM.floorM && refined.positionMismatchM > SEAM.ratio * boundM)) return null;
  return { positionMismatchM: refined.positionMismatchM, boundM: +boundM.toFixed(2), ratio: +(refined.positionMismatchM / Math.max(boundM, 1e-9)).toFixed(1) };
}

// ---- the typed record: one $MNV per burn, by the standards' own generated code ----
const flatbuffers = await import('flatbuffers');
const MNV = await import('spacedatastandards.org/lib/js/MNV/main.js');
/** A detected burn as a size-prefixed $MNV: STATUS DETECTED, REPORT_TIME the time it became known, EVENT_START_TIME and EVENT_END_TIME its
 *  extent, DELTA_VEL_U, _V and _W the refined velocity change (km/s) in the UVW axes of the state before it (U radial, V in-track, W
 *  cross-track: the R, T, N of the refine), in the sense of the burn. */
export function mnvBytes({ id, satNo, name, burn, algorithm, stateModel }) {
  const dv = burn.refined.dvRtnMmS.map((x) => x * 1e-6);
  const t = new MNV.MNVT();
  Object.assign(t, { ID: id, SAT_NO: satNo ?? 0, ON_ORBIT: name, STATUS: MNV.maneuverStatus.DETECTED, REPORT_TIME: burn.reportTime, EVENT_START_TIME: burn.extentFrom, EVENT_END_TIME: burn.extentTo,
    DELTA_VEL: Math.hypot(...dv), DELTA_VEL_U: dv[0], DELTA_VEL_V: dv[1], DELTA_VEL_W: dv[2], STATE_MODEL: stateModel, ALGORITHM: algorithm,
    DESCRIPTION: `velocity change from both sides of the extent; from states ${burn.refined.alsoFrom.map((x) => `${x.offMin} min`).join(' and ')} further out it holds within ${Math.round(burn.refined.spread * 100)} % of its size` });
  const b = new flatbuffers.Builder(1024);
  MNV.MNV.finishSizePrefixedMNVBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
}
/** The records of a size-prefixed $MNV stream, unpacked (MNVT). */
export function readMnv(bytes) {
  const out = [], u8 = new Uint8Array(bytes);
  for (let at = 0; at + 4 <= u8.length;) {
    const size = new DataView(u8.buffer, u8.byteOffset + at, 4).getUint32(0, true);
    const bb = new flatbuffers.ByteBuffer(u8.subarray(at, at + 4 + size));
    out.push(MNV.MNV.getSizePrefixedRootAsMNV(bb).unpack());
    at += 4 + size;
  }
  return out;
}
