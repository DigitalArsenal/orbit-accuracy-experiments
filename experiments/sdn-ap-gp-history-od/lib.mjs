// The truth objects of the registered windows (the G1 experiment's own sources) and the scoring of the three arms. JavaScript builds records,
// calls modules and counts; every orbit, frame and error computation is a module's.
import fs from 'node:fs';
import path from 'node:path';
import { config as g1, store as g1Store } from '../sdn-gp-starlink-ffm-match/common.mjs';
import * as sources from '../sdn-gp-starlink-ffm-match/lib/sources.mjs';
import { A8, spkObjectSeries } from '../sdn-gp-starlink-ffm-match/lib/spk-sources.mjs';
import { openContainers } from '../sdn-gp-starlink-ffm-match/lib/containers.mjs';
import { openTime } from '../sdn-gp-starlink-ffm-match/lib/timeconv.mjs';
import { frame, oemBytes, ommBytes, readOmm, readOem, blockLines } from '../sdn-gp-starlink-ffm-match/lib/sds.mjs';
import { sdngpHeldOut, rtnSeries, propagateSet } from '../sdn-gp-starlink-ffm-match/lib/baselines.mjs';
import { DAY, iso, ms, slice, withT } from '../sdn-gp-starlink-ffm-match/lib/windows.mjs';
import { config, store, FIT_MS } from './common.mjs';

const P = g1.precise, A4 = sources.MGEX_A4;
const OEM_FRAME = { EME2000: 'EME2000', GCRF: 'GCRF', ITRF: 'ITRF2000', TEME: 'TEMEOFDATE' };
const ISS_DAILY_FROM = Date.parse('2026-10-21T00:00:00Z');

/** The G1 source plans (baselines.mjs): the objects of each row source. */
const plans = {
  iss: () => sources.iss(),
  'iss-daily': () => sources.iss({ file: path.join(g1.archive, 'operator-ephemerides/daily/2026-10-23/iss-oem.txt.gz') }),
  gnss: () => sources.gnss(P.gnss),
  'gnss-rapid': () => sources.gnssRapid(),
  'mgex-geo': () => sources.mgex({ klass: 'geo', ...A4 }),
  'mgex-igso': () => sources.mgex({ klass: 'igso', ...A4 }),
  'mgex-geo-rapid': () => sources.mgexRapid({ klass: 'geo' }),
  'mgex-igso-rapid': () => sources.mgexRapid({ klass: 'igso' }),
  'slr-high': () => P.slrHigh.targets.flatMap((target) => sources.slrHigh({ target, weeks: P.slrHigh.weeks })),
  'slr-low': () => P.slrLow.targets.flatMap((target) => sources.slrLow({ target, arcs: P.slrLow.arcs })),
  'slr-low-current': () => P.slrLow.targets.flatMap((target) => sources.slrLowCurrent({ target })),
  'slr-high-current': () => P.slrHigh.targets.flatMap((target) => sources.slrHighCurrent({ target })),
};

export function truthResolver(modules) {
  const cache = new Map();
  let spk = null;
  const planObjects = (name) => { if (!cache.has(name)) cache.set(name, new Map(plans[name]().map((o) => [o.id, o]))); return cache.get(name); };
  return {
    async object(w) {
      if (w.source === 'starlink-ffm') {
        const norad = w.norad;
        const meta = JSON.parse(fs.readFileSync(path.join(g1Store, 'truth', `${norad}.json`), 'utf8'));
        const flat = new Float64Array(new Uint8Array(fs.readFileSync(path.join(g1Store, 'truth', `${norad}.f64`))).buffer);
        const t0 = ms(meta.truth.epochUtc);
        return withT({ source: 'starlink-ffm', id: w.id, norad, name: `STARLINK-${norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
          lines: Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: iso(t0 + i * g1.truth.cadenceSeconds * 1000), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
      }
      if (w.source === 'heo-tess') {
        if (!spk) {
          const dir = path.join(g1.archive, 'hac/mast-tess/models');
          const names = fs.readdirSync(dir).filter((f) => /^TESS_EPH_DEF_\d{7}_\d+\.bsp$/.test(f)).sort();
          const containers = await openContainers(modules), time = await openTime(modules);
          spk = { containers, time, tess: await spkObjectSeries(modules, { files: names.map((f) => path.join(dir, f)), source: 'heo-tess', id: 'TESS (-95)', name: 'TESS', norad: A8.tess.norad, fromUtc: A8.tess.span[0], toUtc: A8.tess.span[1], stride: A8.tess.stride, containers, time }) };
        }
        return spk.tess;
      }
      const plan = w.source === 'iss' && Date.parse(w.startUtc) >= ISS_DAILY_FROM ? 'iss-daily' : w.source;
      const object = planObjects(plan).get(w.id);
      if (!object) throw new Error(`no truth object ${plan} ${w.id}`);
      return object;
    },
    async close() { if (spk) { await spk.containers.destroy(); await spk.time.destroy(); } },
  };
}

// ---- element-set history ----
const utc = (s) => Date.parse(`${String(s).replace(/Z?$/, 'Z')}`);
export const historyOf = (norad) => {
  const file = path.join(store, 'sets', `${norad}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
};
/** The sets available at E: created and epoch not after E, one per epoch (the latest created wins), in epoch order. */
export function availableSets(history, eMs) {
  const byEpoch = new Map();
  for (const r of history) {
    if (utc(r.CREATION_DATE) > eMs || utc(r.EPOCH) > eMs) continue;
    const prev = byEpoch.get(r.EPOCH);
    if (!prev || r.CREATION_DATE > prev.CREATION_DATE) byEpoch.set(r.EPOCH, r);
  }
  return [...byEpoch.values()].sort((a, b) => (a.EPOCH < b.EPOCH ? -1 : 1));
}
const gpOmm = (s) => ommBytes({ theory: 'SGP4', epoch: s.EPOCH, meanMotion: Number(s.MEAN_MOTION), eccentricity: Number(s.ECCENTRICITY), inclination: Number(s.INCLINATION), raan: Number(s.RA_OF_ASC_NODE),
  argPerigee: Number(s.ARG_OF_PERICENTER), meanAnomaly: Number(s.MEAN_ANOMALY), norad: Number(s.NORAD_CAT_ID), bstar: Number(s.BSTAR) });

// ---- scoring ----
const dayOf = (t, stopFit, leadDays) => leadDays.find((k) => t > stopFit + (k - 1) * DAY && t <= stopFit + k * DAY);
const rms = (values) => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
const thinned = (list, strideSeconds) => { const step = list.length > 1 ? (ms(list[1].epoch) - ms(list[0].epoch)) / 1000 : 60; const every = Math.max(1, Math.round(strideSeconds / step)); return { every, list: list.filter((_, i) => i % every === 0) }; };

/** The truth side of a window: lines after E (through day 3), the median step, the per-day state minimum. */
export function heldOf(object, eMs, cfg = config.window) {
  const lines = slice(object, eMs + 1, eMs + Math.max(...cfg.leadDays) * DAY);
  if (lines.length < 20) return null;
  const gaps = lines.slice(1, 60).map((l, i) => ms(l.epoch) - ms(lines[i].epoch)).sort((a, b) => a - b);
  const stepSeconds = gaps[Math.floor(gaps.length / 2)] / 1000;
  return { lines, stepSeconds, minStatesPerDay: Math.floor((cfg.minimumCoverage * 86400) / stepSeconds) };
}

/** Day errors of predicted states against held truth lines: { k: { rmsKm, n } } for the days with enough states. */
async function dayErrors(b, predictedAt, held, eMs, cfg = config.window) {
  const { every, list } = thinned(held.lines, cfg.rtnStrideSeconds);
  const predicted = await predictedAt(list);
  const series = await rtnSeries(b, predicted.map((p) => ({ r: p.r, v: p.v })), list.map((l) => ({ r: l.r, v: l.v })));
  const byDay = {};
  series.forEach((e, i) => { const k = dayOf(ms(list[i].epoch), eMs, cfg.leadDays); if (k) (byDay[k] ??= []).push(e); });
  const days = {};
  for (const [k, e] of Object.entries(byDay)) if (e.length * every >= held.minStatesPerDay) days[k] = { rmsKm: Math.hypot(...[0, 1, 2].map((c) => rms(e.map((v) => v[c])))), n: e.length };
  return days;
}

/** SGP4-XP fitted to the pseudo-observation $OEM, scored on the held truth. */
export async function xpArm(b, object, pseudo, held, eMs) {
  let fit;
  try { fit = await b.xp.call('fit', [frame('ephemeris', 'OEM', pseudo.sized)]); } catch (error) { return { ok: false, error: String(error.message).slice(0, 200) }; }
  const omm = readOmm(fit.elements);
  const axes = object.frame === 'EME2000' ? 'EME2000' : 'GCRF';
  try {
    const days = await dayErrors(b, async (list) => propagateSet(b, fit.elements, list.map((l) => ms(l.epoch)), axes), held, eMs);
    return { ok: true, days, meanMotion: omm.MEAN_MOTION, eccentricity: omm.ECCENTRICITY, inclination: omm.INCLINATION };
  } catch (error) { return { ok: false, error: `score: ${String(error.message).slice(0, 160)}` }; }
}

/** SDN-AP fitted to the pseudo-observation $OEM, scored on the held truth. */
export async function sdnapArm(b, object, pseudo, held, eMs, weather) {
  let fit;
  try { fit = await b.sdngp.fit(pseudo.plain, { weatherTable: weather }); } catch (error) { return { ok: false, error: String(error.message).slice(0, 200) }; }
  if (!fit.ok) return { ok: false, error: fit.error };
  const scored = await sdngpHeldOut(b, object, held.lines, eMs, config.window.leadDays, held.minStatesPerDay, { omm: fit.omm, unpacked: fit.unpacked });
  if (scored.error) return { ok: false, error: scored.error, fitRmsKm: fit.fitRmsKm };
  const days = Object.fromEntries(Object.entries(scored.days).map(([k, v]) => [k, { rmsKm: v.rmsKm, n: v.n }]));
  const span = /span ([\d.]+) h/.exec(fit.comment ?? '')?.[1] ?? null;
  return { ok: true, days, fitRmsKm: fit.fitRmsKm, spanHours: span === null ? null : Number(span), meanMotion: fit.unpacked.MEAN_MOTION, eccentricity: fit.unpacked.ECCENTRICITY };
}

/** The latest set at E propagated by SGP4 (gp-error-model element_residuals), scored against the held truth ephemeris. */
export async function baselineArm(b, object, set, held, eMs) {
  const bytes = oemBytes({ originator: object.originator ?? 'G1', creation: object.creation ?? '', block: { frame: OEM_FRAME[object.frame] ?? object.frame, timeSystem: object.timeSystem ?? 'UTC', object: { name: object.name, id: object.objectId ?? '', norad: object.norad },
    lines: held.lines, start: held.lines[0].epoch, stop: held.lines.at(-1).epoch } });
  const windows = config.window.leadDays.map((k) => ({ from: iso(eMs + (k - 1) * DAY + 1), to: iso(eMs + k * DAY), label: String(k) }));
  try {
    const r = await b.gem.call('element_residuals', [{ portId: 'elements', payload: gpOmm(set), typeRef: { schemaName: 'OMM.fbs', fileIdentifier: '$OMM', rootTypeName: 'OMM', wireFormat: 'flatbuffer' } }, frame('ephemeris', 'OEM', bytes),
      b.erm.frame('options', 'residualRequests', { requests: [{ norad: object.norad, set: set.EPOCH, windows }] })]);
    const result = b.erm.decode(r.residuals).results[0];
    const days = {};
    for (const w of result.windows) if (w.n >= held.minStatesPerDay) days[w.label] = { rmsKm: w.rms3dKm, n: w.n };
    return { ok: true, days, setEpoch: set.EPOCH };
  } catch (error) { return { ok: false, error: String(error.message).slice(0, 200) }; }
}

/** The pseudo-observation $OEM (TEME) of a window from interval states: { states, sized, plain } (sized for SGP4-XP, plain for SDN-AP), the $OEMs null when there are too few states. */
export function pseudoOem(object, states, eMs) {
  const cfg = config.pseudoObservations;
  // amendment A1: a state less than 1 s after the one before it is dropped (the module returns a grid state and the set's own epoch a millisecond apart; SGP4-XP needs strictly increasing epochs)
  const chosen = [];
  for (const s of states) if (s.ms > eMs - cfg.historyHours * 3600e3 && s.ms <= eMs + 1 && (!chosen.length || s.ms - chosen.at(-1).ms >= 1000)) chosen.push(s);
  if (chosen.length < cfg.minimumStates) return { states: chosen.length, sized: null, plain: null };
  const lines = chosen.map((s) => ({ epoch: iso(s.ms), r: s.r, v: s.v }));
  const block = { frame: cfg.frame, frameName: 'TEME', timeSystem: 'UTC', object: { name: object.name, id: object.objectId ?? '', norad: object.norad }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch, useableStart: lines[0].epoch, useableStop: iso(eMs) };
  return { states: chosen.length, sized: oemBytes({ originator: 'GPH-OD', block }), plain: oemBytes({ originator: 'GPH-OD', block: { ...block, useableStart: undefined }, sizePrefixed: false }) };
}
export { propagateSet };
