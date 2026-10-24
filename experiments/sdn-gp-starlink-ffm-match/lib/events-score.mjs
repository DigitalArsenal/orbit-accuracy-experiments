// Amendment A10: the scoring of M22 (impulse map) and M23 (finite burns) for one satellite on one build (b = opened baselines with the SDN-AP module), against the FFM-1 truths of events-truth.mjs.
// `sink` takes the rows (append, has); `only` limits the cases (a replay).
import { read } from '../common.mjs';
import { rtnSeries } from './baselines.mjs';
import { transformState } from './frames.mjs';
import { oemBytes, OMM } from './sds.mjs';
import { maneuver, rootOf } from './sdngp-events.mjs';
import { CASES, STEP_S, FIT_HOURS, readTruthFlat, loadTruth, truthPaths, caseStates, t0Of, tbOf, sampleMs, unit } from './events.mjs';
import { iso, ms } from './windows.mjs';

const MAP0 = { id: 'map0', kind: 'map0' };
const rms = (v) => (v.length ? Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length) : null);
const dayOfK = (k) => Math.ceil((k + 1) / (86400 / STEP_S)); // k is 0-based: k = 0 is t_b + 300 s

/** The G1 fit of the first 24 h of a registered truth: { fit, object, lines }. */
export async function g1Fit(b, meta, flat) {
  const t0 = t0Of(meta), stopFit = tbOf(meta), n = FIT_HOURS * 60;
  const lines = Array.from({ length: n + 1 }, (_, i) => ({ epoch: iso(t0 + i * 60000), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] }));
  const bytes = oemBytes({ originator: 'G1 FFM-1', block: { frame: 'GCRF', frameName: 'GCRF', timeSystem: 'UTC', object: { name: `STARLINK-${meta.norad}`, id: '', norad: meta.norad }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch, useableStart: lines[0].epoch, useableStop: iso(stopFit) }, sizePrefixed: false });
  return b.sdngp.fit(bytes, { weatherTable: b.weatherTable });
}

/** GCRF states [{ r, v }] of a set at the sample epochs: the batch entry (TEME) and foundation/frames, as for the rows. */
async function gcrfStates(b, omm, setEpochMs, epochs) {
  const teme = await b.sdngp.states(omm, epochs.map((t) => (t - setEpochMs) / 60000));
  if (teme.some((x) => x.status !== 0)) throw new Error(`sdngp propagate status ${teme.find((x) => x.status !== 0).status}`);
  const out = [];
  for (let i = 0; i < epochs.length; i += 1) { const t = await transformState(b.frames, 'TEME', 'GCRF', iso(epochs[i]), [...teme[i].r, ...teme[i].v]); out.push({ r: t.slice(0, 3), v: t.slice(3, 6) }); }
  return out;
}

/** Days 1 to 3 of one predicted series against its truth: RTN RMS (pair_statistics) over the scored samples, and the vector errors (GCRF km) for the response. */
async function scoreCase(b, predicted, truth) {
  const keep = truth.map((s, k) => (Number.isFinite(s.r[0]) ? k : -1)).filter((k) => k >= 0);
  const rtn = await rtnSeries(b, keep.map((k) => predicted[k]), keep.map((k) => truth[k]));
  const days = {};
  for (const d of [1, 2, 3]) {
    const e = keep.map((k, i) => ({ k, e: rtn[i] })).filter((x) => dayOfK(x.k) === d).map((x) => x.e);
    if (!e.length) continue;
    const ric = [0, 1, 2].map((c) => rms(e.map((v) => v[c])));
    days[d] = { rmsKm: Math.hypot(...ric), ric, n: e.length };
  }
  const err = predicted.map((p, k) => (Number.isFinite(truth[k].r[0]) ? [p.r[0] - truth[k].r[0], p.r[1] - truth[k].r[1], p.r[2] - truth[k].r[2]] : null));
  return { days, err };
}

/** The response error by day: RMS of |err_case - err_control| over the samples both have. */
function response(errCase, errCtl) {
  const out = {};
  for (const d of [1, 2, 3]) {
    const v = errCase.map((e, k) => (e && errCtl[k] && dayOfK(k) === d ? Math.hypot(e[0] - errCtl[k][0], e[1] - errCtl[k][1], e[2] - errCtl[k][2]) : null)).filter((x) => x !== null);
    if (v.length) out[d] = rms(v);
  }
  return out;
}

export async function scoreSatellite({ b, sink, kind, meta, only = null }) {
  const source = kind;
  const norad = meta.norad, id = `STARLINK (${norad})`, tb = tbOf(meta), epochs = sampleMs(meta), flat = readTruthFlat(meta);
  const ctlIndex = read(truthPaths('m22', norad).json), ctlAll = loadTruth('m22', norad);
  const ctlTruth = caseStates(ctlAll, CASES.m22.findIndex((c) => c.kind === 'control'));
  const fit = await g1Fit(b, meta, flat);
  const base = { source, norad, id, startUtc: meta.truth.epochUtc, fitSeconds: FIT_HOURS * 3600, tbUtc: iso(tb), build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
  if (!fit.ok) { for (const c of CASES[kind]) sink.append({ ...base, id: `${id} ${c.id}`, case: c, fit: { ok: false, error: fit.error } }); return; }
  const setEpoch = ms(fit.unpacked.EPOCH);
  const fitInfo = { ok: true, fitRmsKm: fit.fitRmsKm, bEff: Number(fit.params.SDNGP_B_EFF), meanMotion: fit.unpacked.MEAN_MOTION, epoch: fit.unpacked.EPOCH, span: /span ([\d.]+) h/.exec(fit.comment ?? '')?.[1] ?? null };
  const control = await scoreCase(b, await gcrfStates(b, fit.omm, setEpoch, epochs), ctlTruth);
  const nRadS = (fit.unpacked.MEAN_MOTION * 2 * Math.PI) / 86400;
  if (kind === 'm22') {
    const all = ctlAll;
    for (const c of [...CASES.m22, MAP0]) { // MAP0 (amendment A10b): the map applied with a zero delta-v, scored against the control's truth: the round-trip floor of the map
      const ci = c.kind === 'map0' ? 0 : CASES.m22.indexOf(c);
      if (only && !only.includes(c.id)) continue;
      const key = `${id} ${c.id}`;
      if (sink.has(`${source}|${key}|${base.startUtc}|${base.fitSeconds}`)) continue;
      const t = ctlIndex.cases[ci];
      if (t.error) { sink.append({ ...base, id: key, case: c, fit: fitInfo, truthError: t.error }); continue; }
      if (c.kind === 'control') { sink.append({ ...base, id: key, case: c, fit: fitInfo, days: control.days, maxTruthDifferenceM: t.maxDifferenceM }); continue; }
      const dv = c.kind === 'map0' ? [0, 0, 0] : unit(c.axis).map((x) => (x * c.dvMS) / 1000);
      const t1 = performance.now();
      const man = await maneuver(b.sdngp, { omm: fit.omm, burns: [{ startUtc: iso(tb), dvKmS: dv }], weatherTable: b.weatherTable });
      if (!man.ok) { sink.append({ ...base, id: key, case: c, fit: fitInfo, maneuver: { ok: false, error: man.error } }); continue; }
      const post = man.elements[0];
      const postEpoch = ms(rootOf(OMM.OMM, 'OMM', post).unpack().EPOCH);
      const scored = await scoreCase(b, await gcrfStates(b, post, postEpoch, epochs), caseStates(all, ci));
      sink.append({ ...base, id: key, case: c, fit: fitInfo, maneuver: { ok: true, postEpoch: iso(postEpoch), maneuverMs: performance.now() - t1 }, days: scored.days, response: response(scored.err, control.err), control: control.days });
    }
    return;
  }
  // m23: two arms per burn
  const all = loadTruth('m23', norad), idx = read(truthPaths('m23', norad).json);
  for (const [ci, c] of CASES.m23.entries()) {
    if (only && !only.includes(c.id)) continue;
    const key = `${id} ${c.id}`;
    if (sink.has(`${source}|${key}|${base.startUtc}|${base.fitSeconds}`)) continue;
    if (idx.cases[ci].error) { sink.append({ ...base, id: key, case: c, fit: fitInfo, truthError: idx.cases[ci].error }); continue; }
    const D = c.durationMin * 60, te = tb + D * 1000, dv = unit(c.axis).map((x) => (x * c.dvMS) / 1000), truth = caseStates(all, ci);
    const dL = nRadS * D;
    const row = { ...base, id: key, case: c, fit: fitInfo, dLRad: dL, sincHalfDL: Math.sin(dL / 2) / (dL / 2), control: control.days, arms: {} };
    for (const [arm, burn] of [['A', { startUtc: iso(tb), endUtc: iso(te), dvKmS: dv }], ['B', { startUtc: iso(tb + (D * 1000) / 2), dvKmS: dv }]]) {
      const man = await maneuver(b.sdngp, { omm: fit.omm, burns: [burn], weatherTable: b.weatherTable });
      if (!man.ok) { row.arms[arm] = { ok: false, error: man.error }; continue; }
      const post = man.elements[0];
      const postEpoch = ms(rootOf(OMM.OMM, 'OMM', post).unpack().EPOCH);
      const scored = await scoreCase(b, await gcrfStates(b, post, postEpoch, epochs), truth);
      row.arms[arm] = { ok: true, postEpoch: iso(postEpoch), days: scored.days, response: response(scored.err, control.err) };
    }
    sink.append(row);
  }
}

