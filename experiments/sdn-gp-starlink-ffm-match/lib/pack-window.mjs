// One window of a truth pack through the SDN-AP module's methods only (amendments A9f and A9h). The pack's states of the fit span and of the held-out days go in as one $OEM block (CENTER_NAME
// the pack's center, the pack's axes declared, UTC, the fit span as the useable interval) to the module's fit method (`fit` from build b9bc708baa50 on), with no environment and no prior; the set is propagated by `propagate` on a grid block that
// names the set's own center (ICRF axes for the Moon-centered and segment sets, GCRF axes for a set the module fits on its standard Earth path), one explicit epoch per scored pack state; the
// states are scored by score-pack.mjs (gp-error-model pair_statistics in the pack's axes, radial / in-track / cross-track by held-out day). `thin` keeps every thin-th held-out state (the lunar
// windows of A9f keep every fifth; the cislunar and heliocentric windows of A9h keep every state). Predicted and truth states are paired by epoch within 5 ms, because the packs carry 1 ms
// time-stamp jitter from the TDB to UTC conversion; the row records the held-out states of the pack and the states requested, returned, matched and unmatched.
import { oemBytes } from './sds.mjs';
import { DAY, iso, slice } from './windows.mjs';
import { readPack } from './packs.mjs';
import { RULES } from '../regime-windows.mjs';
import { scorePack } from '../score-pack.mjs';

const H = 3600000;
export const axesOf = (meta) => (/ICRF/.test(meta.axes ?? '') ? 'ICRF' : 'J2000'); // as regime-windows.mjs labels the packs
const nameOf = (error) => String(error ?? '').split(':')[0].trim();

/** { source, id, norad, startUtc, fitSeconds, fitHours, states, heldOutStates, sdngp: {...} } for one window of a pack. */
export async function packWindow(b, loaded, pack, startMs, fitHours, { thin = 1 } = {}) {
  const rule = RULES[pack], { meta, object } = loaded;
  const stop = startMs + fitHours * H;
  const lines = slice(object, startMs, stop + rule.leadDays.at(-1) * DAY);
  const heldAll = slice(object, stop + 1, stop + rule.leadDays.at(-1) * DAY);
  const held = heldAll.filter((_, i) => i % thin === 0);
  const frame = axesOf(meta), center = meta.center.toUpperCase();
  const block = (extra) => ({ frame, frameName: frame, center, timeSystem: 'UTC', object: { name: meta.name, id: '', norad: 0 }, ...extra });
  const base = { source: pack, id: pack, norad: 0, startUtc: iso(startMs), fitSeconds: fitHours * 3600, fitHours, states: lines.length, heldOutStates: heldAll.length };
  let fit;
  try {
    fit = await b.sdngp.fit(oemBytes({ originator: 'G1 truth pack', block: block({ lines, start: lines[0].epoch, stop: lines.at(-1).epoch, useableStart: lines[0].epoch, useableStop: iso(stop) }), sizePrefixed: false }));
  } catch (error) { return { ...base, sdngp: { ok: false, error: String(error.message).slice(0, 200), errorName: 'exception', treatment: 'failed' } }; }
  if (!fit.ok) return { ...base, sdngp: { ok: false, error: fit.error, errorName: nameOf(fit.error), treatment: 'refused' } };
  const u = fit.unpacked, regime = fit.params.SDNGP_REGIME ?? null;
  const gridFrame = regime ? 'ICRF' : 'GCRF'; // the segment and Moon-centered sets answer in ICRF axes; a standard Earth set can be asked for GCRF
  const grid = oemBytes({ originator: 'G1', block: { ...block({ lines: held.map((l) => ({ epoch: l.epoch, r: [0, 0, 0], v: [0, 0, 0] })), start: held[0].epoch, stop: held.at(-1).epoch }), frame: gridFrame, frameName: gridFrame, center: u.CENTER_NAME ?? center }, sizePrefixed: false });
  const prop = await b.sdngp.propagateGrid(fit.omm, grid);
  if (!prop.ok) return { ...base, sdngp: { ok: false, error: `propagate: ${prop.error}`, errorName: `propagate:${nameOf(prop.error)}`, fitRmsKm: fit.fitRmsKm, treatment: 'failed' } };
  const predicted = prop.blocks[0];
  const scored = await scorePack(b, { pack, startMs, fitHours, leadDays: rule.leadDays, predicted, predictedCenter: prop.center, loaded });
  const spanMatch = /span ([\d.]+) h/.exec(fit.comment ?? ''), fromMatch = /states fitted from ([\d.]+) h/.exec(fit.comment ?? '');
  const carried = fit.params.SDNGP_MANEUVER_BEFORE_SECONDS;
  return { ...base, sdngp: {
    ok: true, fitRmsKm: fit.fitRmsKm, fitMaxKm: fit.fitMaxKm, heldOutRmsKm: fit.heldOutRmsKm, iterations: fit.iterations, fitStates: fit.statesFitted, spanHours: spanMatch ? Number(spanMatch[1]) : fromMatch ? fitHours - Number(fromMatch[1]) : null, // a segment's comment says where in the arc the segment starts: its length is the rest of the fit span
    regime, treatment: carried === undefined ? 'whole' : 'segment', maneuverBeforeSeconds: carried === undefined ? null : Number(carried), arcEndSeconds: fit.params.SDNGP_ARC_END_SECONDS === undefined ? null : Number(fit.params.SDNGP_ARC_END_SECONDS),
    days: Object.fromEntries(Object.entries(scored.byDay).filter(([, d]) => d).map(([k, d]) => [k, { rmsKm: d.rmsKm, n: d.n, ric: d.ric, directKm: d.directKm }])),
    requested: held.length, returned: predicted.length, matched: scored.matched, unmatched: scored.unmatched, centerCheck: scored.centerCheck, recordBytes: fit.omm.length,
    module: b.sdngp.provenance.wasmSha256.slice(0, 12), params: fit.params, comment: fit.comment,
  } };
}

export { readPack };
