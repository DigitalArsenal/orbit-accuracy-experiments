// Section 16.2: covariance as P(t) = Φ P₀ Φᵀ + Q, and the OCM as the record
// that carries it.
//  1. A CCSDS OCM example, keyword by keyword, with the SDS OCM field each
//     lands in (spacedatastandards.org schema).
//  2. Its Earth-fixed state to GCRF through foundation/frames with the IERS
//     rows of its day, then 24 h of propagator/hpop.
//  3. An initial covariance through HPOP: the module returns Φ and P(t); Φ P₀ Φᵀ
//     formed from them reproduces P(t). P₀ is the sample VCM's, which
//     files/orbit-products also re-expresses as an SDS OCM.
import * as flatbuffers from 'flatbuffers';
import { EOP, EOPT } from 'spacedatastandards.org/lib/js/EOP/main.js';
import { FRM, FRMFrameTransformRequestT, FRMStateVectorT, FRMT, FRMVector3T, RFMCoordinateSystemT, RFMOriginT, frmOperationCode, frmResultStatus,
  frmStateRepresentation, rfmAxisType, rfmOriginKind } from 'spacedatastandards.org/lib/js/FRM/main.js';
import { OCM } from 'spacedatastandards.org/lib/js/OCM/main.js';
import { decodeExecution, executionFrame } from '../../../../harness/prw.mjs';
import { formatMeters } from '../../chart.js';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { HOUR, decodePrw, encodePrw, frameOf, isoMicro, out } from '../../runs.js';
import { flatten, readKvn, sdsField } from '../codec/kvn.js';
import { chart, h, num, panel, table, tiles, note } from '../ui.js';

const FRM_TYPE = { schemaName: 'FRM.fbs', fileIdentifier: '$FRM', rootTypeName: 'FRM' };
const EOP_TYPE = { schemaName: 'EOP.fbs', fileIdentifier: '$EOP', rootTypeName: 'EOP' };
const system = (name, axisType, epoch) => new RFMCoordinateSystemT(name, axisType, new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, 399), 399, epoch, 'UTC', null);
const encode = (finish, root) => { const b = new flatbuffers.Builder(4096); finish(b, root.pack(b)); return b.asUint8Array().slice(); };

export default async function run(ctx) {
  const fields = panel(ctx.root, 'A CCSDS OCM, field by field');
  const state = panel(ctx.root, 'Its state, to GCRF and forward a day');
  const cov = panel(ctx.root, 'P(t) = Φ P₀ Φᵀ through HPOP');
  const covChart = chart(ctx.root, 'Position sigmas along the propagation', 'From HPOP’s covariance, RTN, P₀ of the sample VCM');
  const asOcm = panel(ctx.root, 'The same P₀’s message, as an SDS OCM');

  const [text, schema] = await Promise.all([ctx.fetchText('./data/ocm/ccsds-ocm-example-2.txt'), ctx.fetchJson('./data/sds/OCM.json')]);
  const kvn = readKvn(text);

  await ctx.run('Mapping the message to SDS OCM fields', async () => {
    const entry = (key, value) => h('div', { class: 'kv' }, h('code', {}, key), h('span', {}, value));
    const rows = kvn.rows.filter((r) => r.key !== 'COMMENT').map((r) => {
      const f = sdsField(schema, 'OCM', r.block, r.key);
      return [{ text: entry(r.key, `${r.value}${r.units ? ` ${r.units}` : ''}`), class: 'wrap' }, f ? { text: f.path, class: 'left mono wrap', title: f.doc } : { text: 'no SDS field', class: 'left' }];
    });
    for (const d of kvn.data) rows.push([{ text: entry(`${d.block} data line`, d.values.join(' ')), class: 'wrap' }, { text: d.block === 'TRAJ' ? 'STATE_DATA[]; its epoch, METADATA.EPOCH_TZERO + offset' : `${d.block} data`, class: 'left mono wrap' }]);
    table(fields, ['Keyword = value', `SDS OCM field (${schema.version})`], rows);
    const mapped = rows.filter((r) => r[1].text !== 'no SDS field').length;
    note(fields, `The CCSDS 502.0-B-3 example message (OSPREY 5), as Orekit 13.1 ships it. ${mapped} of ${rows.length} entries have an SDS field; hover a path for its schema documentation.`);
  });

  await ctx.run('foundation/frames: EFG to GCRF; propagator/hpop: 24 h', async () => {
    const meta = Object.fromEntries(kvn.rows.map((r) => [r.key, r.value]));
    const line = kvn.data.find((d) => d.block === 'TRAJ').values;
    // The message's clock is UT1; its own UT1 − UTC gives the UTC instant.
    const ut1Ms = Date.parse(`${line[0]}Z`);
    const utcIso = isoMicro(ut1Ms - Number(meta.UT1MUTC_AT_TZERO) * 1000);
    const [x, y, z, vx, vy, vz] = line.slice(1, 7).map(Number);
    const eopRows = (await ctx.fetchJson('./data/eop/eop-1998-12.json')).map((row) => Object.assign(new EOPT(), row));
    const frames = await ctx.module('foundation/frames');
    const request = encode(FRM.finishFRMBuffer, new FRMT(new FRMFrameTransformRequestT(frmOperationCode.STATE_TRANSFORM, null, null, 0, 0, null,
      system('ITRF', rfmAxisType.BODY_FIXED, utcIso), system('GCRF', rfmAxisType.ICRF, utcIso),
      new FRMStateVectorT(frmStateRepresentation.CARTESIAN, [x, y, z, vx, vy, vz].map((v) => v * 1000), new FRMVector3T(x * 1000, y * 1000, z * 1000), new FRMVector3T(vx * 1000, vy * 1000, vz * 1000), 'ITRF', utcIso, 'UTC', 3.986004415e14),
      frmStateRepresentation.CARTESIAN, utcIso, 'UTC', null), null));
    const response = await frames.invoke('transform_frame_position', [{ portId: 'request', typeRef: FRM_TYPE, payload: request },
      ...eopRows.map((row) => ({ portId: 'earth_orientation', typeRef: EOP_TYPE, payload: encode(EOP.finishEOPBuffer, row) }))]);
    const result = FRM.getRootAsFRM(new flatbuffers.ByteBuffer(response.outputs[0].payload)).FRAME_TRANSFORM_RESULT();
    if (result.STATUS() !== frmResultStatus.OK) throw new Error(`foundation/frames: ${result.ERROR_MESSAGE()}`);
    const t = result.TARGET_STATE();
    const r0 = [t.POSITION().X(), t.POSITION().Y(), t.POSITION().Z()].map((v) => v / 1000);
    const v0 = [t.VELOCITY().X(), t.VELOCITY().Y(), t.VELOCITY().Z()].map((v) => v / 1000);
    const hpop = await ctx.module('propagator/hpop');
    const epochMs = Date.parse(`${utcIso}Z`);
    const samples = Array.from({ length: 24 }, (_, k) => isoMicro(epochMs + (k + 1) * HOUR));
    const eop = await ctx.fetchBytes('./data/eop/eop-1998-12.prw');
    const run = decodeExecution(await hpop.invoke('invoke', [executionFrame({ epoch: utcIso, timeScale: 'UTC', position: r0, velocity: v0, samples, target: samples.at(-1),
      integrator: { algorithm: 'RK78', tolerance: 1e-12 }, forces: { degree: 20, order: 20 } }), frameOf('earth_orientation', eop)]));
    const radius = (p) => Math.hypot(...p);
    table(state, ['', 'X', 'Y', 'Z'], [
      ['EFG (km)', num(x, 7), num(y, 7), num(z, 7)], ['GCRF (km)', num(r0[0], 9), num(r0[1], 9), num(r0[2], 9)],
      ['GCRF (km/s)', num(v0[0], 7), num(v0[1], 7), num(v0[2], 7)], ['+24 h, GCRF (km)', ...run.final.position.map((v) => num(v, 9))],
    ]);
    tiles(state, [['Epoch (UTC)', utcIso.slice(0, 23)], ['|r| at epoch', `${num(radius(r0), 7)} km`], ['|r| EFG', `${num(Math.hypot(x, y, z), 7)} km`], ['HPOP steps', num(run.final.steps)]]);
    note(state, `Rotation preserves |r|: EFG and GCRF radii differ by ${formatMeters(Math.abs(radius(r0) - Math.hypot(x, y, z)) * 1000, 3)}. HPOP: EGM2008 20×20 in Earth-fixed axes with the same IERS rows, no Sun, Moon, drag or radiation pressure.`);
  });

  await ctx.run('analysis/vcm-adapter and propagator/hpop: Φ and P(t)', async () => {
    const [adapter, hpop, products] = await Promise.all([ctx.module('analysis/vcm-adapter'), ctx.module('propagator/hpop'), ctx.module('files/orbit-products')]);
    const vcmText = await ctx.fetchText('./data/vcm/sample-vcm.txt');
    const read = await adapter.invoke('read', [{ portId: 'message', payload: new TextEncoder().encode(vcmText) },
      { portId: 'options', payload: new TextEncoder().encode(JSON.stringify({ ephemerisSource: 'Analytical', arcSeconds: 86400 })) }]);
    const prw = decodePrw(out(read, 'request'));
    const report = JSON.parse(new TextDecoder().decode(out(read, 'report')));
    const epochMs = Date.parse(`${report.epochUtc}Z`);
    prw.EXECUTION_REQUEST.SAMPLE_EPOCHS = [1, 3, 6, 12, 18, 24].map((h) => Object.assign(new P.TIMInstantT(), { TIME_SYSTEM: P.timingStandard.UTC, EPOCH_FORMAT: P.timEpochRepresentation.ISO8601, ISO8601: isoMicro(epochMs + h * HOUR) }));
    const response = await hpop.invoke('invoke', [frameOf('request', encodePrw(prw)), frameOf('earth_orientation', out(read, 'earth_orientation'))]);
    const result = decodePrw(out(response, 'response')).EXECUTION_RESULT;
    const P0 = prw.EXECUTION_REQUEST.INITIAL_COVARIANCE ?? prw.EXECUTION_REQUEST.INITIAL.COVARIANCE;
    const n = P0.DIMENSION;
    const mul = (A, B, tb = false) => Array.from({ length: n * n }, (_, q) => { const i = Math.floor(q / n), j = q % n; let s = 0; for (let k = 0; k < n; k++) s += A[i * n + k] * (tb ? B[j * n + k] : B[k * n + j]); return s; });
    const rows = [], sig = [];
    let worst = 0;
    for (const [k, sample] of result.SAMPLES.entries()) {
      const F = sample.STM.VALUES, C = sample.COVARIANCE.VALUES;
      const R = mul(mul(F, P0.VALUES), F, true);
      let w = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) w = Math.max(w, Math.abs(R[i * n + j] - C[i * n + j]) / Math.sqrt(C[i * n + i] * C[j * n + j]));
      worst = Math.max(worst, w);
      const st = sample.STATE.STATE;
      const r = [st.POSITION.X, st.POSITION.Y, st.POSITION.Z], v = [st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z];
      const unit = (a) => a.map((c) => c / Math.hypot(...a));
      const u = unit(r), wv = unit([r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]]);
      const tv = [wv[1] * u[2] - wv[2] * u[1], wv[2] * u[0] - wv[0] * u[2], wv[0] * u[1] - wv[1] * u[0]];
      const sigma = (a) => Math.sqrt(a.reduce((acc, ai, i) => acc + a.reduce((s, aj, j) => s + ai * C[i * n + j] * aj, 0), 0));
      const hours = [1, 3, 6, 12, 18, 24][k];
      sig.push([hours, sigma(u), sigma(tv), sigma(wv)]);
      rows.push([`${hours} h`, formatMeters(sigma(u)), formatMeters(sigma(tv)), formatMeters(sigma(wv)), num(w, 2)]);
    }
    table(cov, ['Age', 'Radial σ', 'In-track σ', 'Cross-track σ', 'max |ΦP₀Φᵀ − P| / σσ'], rows);
    tiles(cov, [['Dimension', `${n} (state + B)`], ['Process noise Q', result.SAMPLES[0].PROCESS_NOISE ? 'declared' : 'none'], ['Largest residual', num(worst, 2)]]);
    covChart.draw({ series: [
      { name: 'Radial', color: 'var(--series-muted)', points: sig.map((s) => [s[0], s[1]]), label: true },
      { name: 'Cross-track', color: 'var(--cyan)', points: sig.map((s) => [s[0], s[3]]), label: true },
      { name: 'In-track', color: 'var(--accent)', points: sig.map((s) => [s[0], s[2]]), label: true },
    ], x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (x) => `${x} h` } });
    // The VCM re-expressed by files/orbit-products as an SDS OCM record.
    const vcmFrame = read.outputs.find((o) => o.portId === 'vcm');
    const ocmBytes = out(await products.invoke('vcm_to_ocm', [{ portId: 'vcm', payload: vcmFrame.payload, typeRef: vcmFrame.typeRef }]), 'orbit');
    let ocm;
    try { ocm = OCM.getSizePrefixedRootAsOCM(new flatbuffers.ByteBuffer(ocmBytes)).unpack(); } catch { ocm = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(ocmBytes)).unpack(); }
    table(asOcm, ['SDS OCM field', 'Value'], flatten(ocm).map(([k, v]) => [{ text: k, class: 'left mono wrap' }, { text: v, class: 'wrap mono' }]));
    note(asOcm, 'Fields at their schema defaults are not listed. The VCM’s equinoctial covariance travels as user-defined parameters; HPOP takes the adapter’s Cartesian form.');
    return `HPOP’s covariance equals Φ P₀ Φᵀ formed from its own Φ to ${num(worst, 2)} of the sigmas; with no process noise declared, Q = 0.`;
  });
}
