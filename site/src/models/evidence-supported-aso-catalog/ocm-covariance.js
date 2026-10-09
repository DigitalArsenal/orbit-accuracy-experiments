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
import { EOPT } from 'spacedatastandards.org/lib/js/EOP/main.js';
import { OCM } from 'spacedatastandards.org/lib/js/OCM/main.js';
import { decodeExecution, executionFrame } from '../../../../harness/prw.mjs';
import { formatMeters } from '../../chart.js';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { HOUR, decodePrw, encodePrw, frameOf, isoMicro, out, resampled } from '../../runs.js';
import { transformState } from '../codec/frames.js';
import { flatten, readKvn, sdsField } from '../codec/kvn.js';
import { chart, h, num, panel, table, tiles, note } from '../ui.js';
import { magnification, rtn, rtnCovariance, scene3d, v3 } from '../scene.js';


export default async function run(ctx) {
  const fields = panel(ctx.root, 'A CCSDS OCM, field by field');
  const state = panel(ctx.root, 'Its state, to GCRF and forward a day');
  const cov = panel(ctx.root, 'P(t) = Φ P₀ Φᵀ through HPOP');
  const view = scene3d(ctx, { title: 'The covariance HPOP carries for a day', caption: '1σ position ellipsoids along the orbit, magnified' });
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
    const { r: r0, v: v0 } = await transformState(frames, { from: 'ITRF', to: 'GCRF', epochIso: utcIso, r: [x, y, z], v: [vx, vy, vz], eopRows });
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
    // The orbit (the same request every 2 min) and P(t)'s position block as
    // ellipsoids where HPOP reports it.
    const inputs = [frameOf('request', encodePrw(prw)), frameOf('earth_orientation', out(read, 'earth_orientation'))];
    const track = await resampled(hpop, inputs, Array.from({ length: 720 }, (_, k) => (k + 1) * 120));
    const block = (values) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => values[i * n + j] / 1e6));  // km²
    const state = (st) => ({ r: [st.POSITION.X, st.POSITION.Y, st.POSITION.Z].map((x) => x / 1000), v: [st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z].map((x) => x / 1000) });
    const initial = state(prw.EXECUTION_REQUEST.INITIAL.STATE);
    // Each P(t) in the radial, in-track and cross-track axes of its own
    // state, nested at the 24 h state: the growth, not the travel.
    const shown = [{ hours: 0, ...initial, P: block(P0.VALUES) }, ...result.SAMPLES.map((sample, k) => ({ hours: [1, 3, 6, 12, 18, 24][k], ...state(sample.STATE.STATE), P: block(sample.COVARIANCE.VALUES) }))]
      .map((e) => ({ ...e, Prtn: rtnCovariance(rtn(e.r, e.v), e.P) }));
    const end = shown.at(-1), basis = rtn(end.r, end.v);
    const inTrack = Math.sqrt(end.Prtn[4]), across = Math.sqrt(Math.max(end.Prtn[0], end.Prtn[8]));
    const mag = magnification(inTrack, 1600);
    const thin = Math.max(1, 10 ** Math.round(Math.log10((0.3 * inTrack) / across)));
    await view.draw((g) => {
      g.track(track, { color: 'muted', alpha: 0.5, width: 1, subdivide: 2, frame: false });
      shown.forEach((e, k) => {
        const share = k / (shown.length - 1);
        g.covariance(end.r, basis, e.Prtn, mag.k, { thin: thin, color: k === shown.length - 1 ? 'accent' : 'cyan', alpha: 0.12 + 0.2 * share, outline: k === shown.length - 1 || k === 0, frame: k === shown.length - 1 });
        const tip = v3.add(end.r, v3.scale(basis[1], Math.sqrt(e.Prtn[4]) * mag.k));
        if (k === shown.length - 1) g.label(tip, `${e.hours ? `${e.hours} h` : 'P₀'} · ${formatMeters(Math.sqrt(e.Prtn[4]) * 1000)}`, { color: k === shown.length - 1 ? 'accent' : 'text', size: 11, above: true });
      });
      g.axes(end.r, basis, inTrack * mag.k * 1.25, ['Radial', 'In-track', 'Cross-track'], { color: 'muted' });
      g.point(end.r, { color: 'sat', size: 7 });
      g.view({ direction: v3.unit(v3.add(v3.add(v3.scale(basis[0], 0.55), v3.scale(basis[2], 0.75)), v3.scale(basis[1], -0.3))), includeEarth: false });
    }, { frame: 'GCRF', epochMs: epochMs + 24 * HOUR, caption: `GCRF at 24 h; 1σ ellipsoids from P₀ to 24 h, ${mag.label}${thin > 1 ? `, the shorter axes a further ×${thin}` : ''}`,
      legend: [['accent', 'P(24 h)', 'solid'], ['cyan', 'P₀, 1, 3, 6, 12, 18 h', 'solid'], ['muted', 'HPOP, 24 h']] });
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
