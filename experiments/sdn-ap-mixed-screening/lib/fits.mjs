// The fits and predictions every part of B2 uses, through the modules (G1's wrappers): propagator/sdn-ap `fit` with THEORY SDNAP or SGP4XP,
// analysis/gp-error-model `fit_elements` for SGP4, the states of a fitted set by propagator/sdn-ap, frames by foundation/frames, and G1's
// scorer (gp-error-model pair_statistics in the truth's RTN axes). JavaScript moves records and counts.
import fs from 'node:fs';
import path from 'node:path';
import { config, g1Dir } from '../common.mjs';

process.env.SDNGP_SNAPSHOT = config.modules.sdnapWasmSha256.slice(0, 12); // G1's openSdngp runs this snapshot of its store
const g1 = (name) => import(path.join(g1Dir, name));
const [B, W, F, S, PCF] = await Promise.all(['lib/baselines.mjs', 'lib/windows.mjs', 'lib/frames.mjs', 'lib/sds.mjs', 'lib/pcf.mjs'].map(g1));
export const { iso, ms } = W;
const T = (name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName: name, wireFormat: 'flatbuffer' });
const OEM_FRAME = { EME2000: 'EME2000', GCRF: 'GCRF', TEME: 'TEMEOFDATE' };
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const short = (e) => String(e?.message ?? e).slice(0, 200);

/** The modules, opened once; the space-weather table of an arc from B1's environment (config.environment), sliced two days either side. */
export async function openFits(modules) {
  const b = await B.openBaselines(modules, { sdngp: true });
  if (b.sdngp.provenance.wasmSha256 !== config.modules.sdnapWasmSha256) throw new Error(`SDN-AP snapshot ${b.sdngp.provenance.wasmSha256} is not the registered build`);
  const env = JSON.parse(fs.readFileSync(config.environment.file, 'utf8'));
  const odRequire = (await import('node:module')).createRequire(path.join(modules, 'analysis/od/package.json'));
  const { pathToFileURL } = await import('node:url');
  const P = await import(pathToFileURL(path.join(path.dirname(odRequire.resolve('spacedatastandards.org/package.json')), 'lib/js/PRW/main.js')));
  const fb = await import(pathToFileURL(odRequire.resolve('flatbuffers')));
  const rows = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(Buffer.from(env.inputs.space_weather, 'base64')))).unpack().SPACE_WEATHER.ROWS;
  const weatherFor = (fromMs, toMs) => {
    const lo = new Date(fromMs - 2 * 86400e3).toISOString().slice(0, 10), hi = new Date(toMs + 2 * 86400e3).toISOString().slice(0, 10);
    const b2 = new fb.Builder(1 << 16);
    b2.finishSizePrefixed(Object.assign(new P.PRWT(), { SPACE_WEATHER: Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: rows.filter((r) => r.DATE >= lo && r.DATE <= hi) }) }).pack(b2), '$PRW');
    return b2.asUint8Array().slice();
  };
  return { b, weatherFor, close: () => b.close() };
}

/** An object's block for the SDN-AP fit (G1's sdngpOem: the fit interval declared, the frame declared). */
const block = (object, lines, stopFit) => B.sdngpOem(object, lines, stopFit);

/** propagator/sdn-ap `fit` with THEORY `theory` (SDNAP or SGP4XP) on `lines` (km, km/s in object.frame), the fit interval up to stopFit: { ok, omm (bytes), fitRmsKm, comment } or { ok: false, error }. */
export async function fitSdnap(a, object, lines, stopFit, theory) {
  const inputs = [{ portId: 'ephemeris', typeRef: T('OEM'), payload: block(object, lines, stopFit) }, { portId: 'configuration', typeRef: PCF.PCF_TYPE, payload: PCF.pcfBytes({ theory }) },
    { portId: 'space_weather_table', typeRef: T('PRW'), payload: a.weatherFor(Date.parse(lines[0].epoch), stopFit + 4 * 86400e3) }];
  const t0 = performance.now();
  let r;
  try { r = await a.b.sdngp.raw.h.invoke({ methodId: 'fit', inputs }); } catch (error) { return { ok: false, error: short(error) }; }
  const fitMs = performance.now() - t0;
  if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 160)}`, fitMs };
  const omm = new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload);
  const u = S.OMM.OMM.getRootAsOMM(new S.flatbuffers.ByteBuffer(omm)).unpack();
  const m = /fit RMS ([\d.]+) km/.exec(u.COMMENT ?? '');
  return { ok: true, omm: Buffer.from(omm).toString('base64'), epoch: u.EPOCH, theory: u.MEAN_ELEMENT_THEORY ?? null, moduleFitRmsKm: m ? Number(m[1]) : null, fitMs };
}

/** analysis/gp-error-model `fit_elements` (six mean elements and B*, epoch at the first state, no closure) on lines up to stopFit: { ok, omm } or { ok: false }. */
export async function fitSgp4(a, object, lines, stopFit) {
  const { b } = a;
  const bytes = S.oemBytes({ originator: object.originator ?? 'B2', creation: '', block: { frame: OEM_FRAME[object.frame] ?? object.frame, timeSystem: 'UTC', object: { name: object.name, id: '', norad: object.norad }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch } });
  let fit, f;
  try {
    fit = await b.gem.call('fit_elements', [S.frame('ephemeris', 'OEM', bytes), b.erm.frame('options', 'fitOptions', { from: lines[0].epoch, to: iso(stopFit), epoch: 'first', fitBstar: true, closure: false })]);
    f = b.erm.decode(fit.report).fits?.[0];
  } catch (error) { return { ok: false, error: short(error) }; }
  if (!f || !f.converged) return { ok: false, error: f?.error ?? 'not converged' };
  return { ok: true, omm: Buffer.from(fit.elements).toString('base64'), epoch: S.readOmm(fit.elements).EPOCH, moduleFitRmsKm: f.rms.rms3dKm };
}

const readEpoch = (bytes) => {
  const u = new Uint8Array(bytes);
  const prefixed = String.fromCharCode(...u.slice(8, 12)) === '$OMM';
  return (prefixed ? S.OMM.OMM.getSizePrefixedRootAsOMM(new S.flatbuffers.ByteBuffer(u)) : S.OMM.OMM.getRootAsOMM(new S.flatbuffers.ByteBuffer(u))).EPOCH();
};

/** The states of a fitted set (base64 $OMM) at epochs (ms) in `axes` (GCRF or EME2000): TEME by propagator/sdn-ap, then foundation/frames. */
export async function statesAt(a, ommB64, epochsMs, axes) {
  const omm = new Uint8Array(Buffer.from(ommB64, 'base64'));
  const epochMs = ms(readEpoch(omm));
  const states = await a.b.sdngp.states(omm, epochsMs.map((t) => (t - epochMs) / 60000));
  const bad = states.find((x) => x.status !== 0);
  if (bad) throw new Error(`propagator/sdn-ap status ${bad.status}`);
  const out = [];
  for (let i = 0; i < epochsMs.length; i += 1) {
    const t = await F.transformState(a.b.frames, 'TEME', axes, iso(epochsMs[i]), [...states[i].r, ...states[i].v]);
    out.push({ r: t.slice(0, 3), v: t.slice(3, 6) });
  }
  return out;
}

/** States from one axes set to another by foundation/frames: [{epoch, r, v}] -> [{r, v}]. */
export async function convert(a, lines, from, to) {
  if (from === to) return lines.map((l) => ({ r: l.r, v: l.v }));
  const out = [];
  for (const l of lines) { const t = await F.transformState(a.b.frames, from, to, l.epoch, [...l.r, ...l.v]); out.push({ r: t.slice(0, 3), v: t.slice(3, 6) }); }
  return out;
}

/** G1's scorer: predicted [{r, v}] against truth [{epoch, r, v}] (same axes, same epochs), grouped by bin(epochMs) -> key: { key: { rmsKm, n, ric } }. */
export async function scoreBins(a, predicted, truth, binOf) {
  const series = await B.rtnSeries(a.b, predicted, truth);
  const by = {};
  series.forEach((e, i) => { const k = binOf(ms(truth[i].epoch)); if (k != null) (by[k] ??= []).push(e); });
  return Object.fromEntries(Object.entries(by).map(([k, e]) => { const ric = [0, 1, 2].map((c) => rms(e.map((v) => v[c]))); return [k, { rmsKm: Math.hypot(...ric), n: e.length, ric }]; }));
}
