#!/usr/bin/env node
// One registered arc through the registered fit path (PLAN.md): station-nights -> satnogs-optical-source ->
// optical-astrometry initial_orbit on all the arc's tracks -> angles-only-od plan/select around observation-od step (ffm,
// estimation) -> ffm propagate_oem carry 24 h back from the fit's end at 60 s -> sdn-ap 0.5.1 fit -> one AP $OCM flown
// alone by sdn-ap propagate. Writes OUT/<arc>/: the records and fit.json (the stage report). Routing only: every state
// comes from a module; refusal codes pass through unchanged as failure names.
//   node experiments/satnogs-optical-ap-2/fit.mjs <arc id>
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';
import { generationOf } from './arcs.mjs';

const { flatbuffers, P, PCF, TY, frame, outputs, invoke } = L;
const arcId = process.argv[2];
const arc = L.REG.arcs.find((a) => a.id === arcId && a.scorable);
if (!arc) { console.error(`no scorable registered arc ${arcId}`); process.exit(2); }
const dir = path.join(L.OUT, arc.id);
fs.mkdirSync(dir, { recursive: true });
const log = (s) => { console.log(`[${arc.id}] ${s}`); fs.appendFileSync(path.join(dir, 'log.txt'), `${new Date().toISOString()} ${s}\n`); };
const save = (name, bytes) => fs.writeFileSync(path.join(dir, name), bytes);
const MODULES = ['data-source/satnogs-optical-source', 'data-source/eop-parser', 'analysis/optical-astrometry', 'analysis/estimation', 'propagator/ffm', 'flows/observation-od', 'flows/angles-only-od', 'propagator/sdn-ap'];
const result = { arc: arc.id, norad: arc.norad, build: L.REG.build.hash, inputClass: L.REG.inputClass, started: new Date().toISOString(),
  wasm: Object.fromEntries(MODULES.map((m) => [m, L.sha256(fs.readFileSync(L.wasmPath(m)))])), protocol: L.REG.protocol, stationNights: [] };
const finish = (status) => { result.status = status; result.finished = new Date().toISOString(); fs.writeFileSync(path.join(dir, 'fit.json'), JSON.stringify(result, null, 1)); log(`status ${status}`); process.exit(0); };

const [source, eopParser, optical, estimation, ffm, step, flow, sdnAp] = await Promise.all([
  L.host('data-source/satnogs-optical-source'), L.host('data-source/eop-parser'), L.host('analysis/optical-astrometry'), L.host('analysis/estimation'),
  L.host('propagator/ffm', true), L.host('flows/observation-od'), L.host('flows/angles-only-od'), L.host('propagator/sdn-ap')]);
const eop = await L.earthOrientation(eopParser);
const kernel = L.kernel();

// ---- 1. station-nights -> the source module (the first registration's conversion; each session's station record) ----
const REF = { 'exposure-mid': 'MIDDLE', 'exposure-start': 'START' };
const day = (s, n) => new Date(Date.parse(s) + n * 86400000).toISOString().slice(0, 10);
const tdms = [], eoos = [], gsts = new Map();
let pvn = null;
for (let s = arc.firstSession; s <= arc.lastSession; s = day(s, 1)) {
  const g = generationOf(s);
  const pq = L.readParquet(path.join(g, 'measurements.parquet'));
  const C = pq.columns;
  const rows = [...Array(pq.rows).keys()].filter((i) => C.correlation_object_norad_id[i] === arc.norad && C.session[i] === s)
    .map((i) => Object.fromEntries(Object.keys(C).map((k) => [k, C[k][i]])));
  const stations = [...new Set(rows.map((r) => r.station_id))].sort((a, b) => a - b);
  for (const st of stations) {
    const input = rows.filter((r) => r.station_id === st).sort((a, b) => (a.t_utc < b.t_utc ? -1 : a.t_utc > b.t_utc ? 1 : 0));
    const sn = { session: s, station: st, rows: input.length, epochRefersTo: [...new Set(input.map((r) => r.epoch_refers_to))] };
    result.stationNights.push(sn);
    const stationFile = path.join(g, 'stations', `station-${st}.json`);
    if (!fs.existsSync(stationFile)) { sn.unusable = 'no station file'; log(`${s} station ${st}: ${input.length} rows, no station file`); continue; }
    const station = JSON.parse(fs.readFileSync(stationFile, 'utf8'));
    sn.site = { name: station.station.name, lat: station.station.site.lat, lon: station.station.site.lon, heightM: station.station.site.height_m };
    // The module E2E's conversion (tests/source.e2e.mjs batch): a segment per run of track, epoch convention, quarantine.
    const tdm = new L.TDMT();
    tdm.CREATION_DATE = station.generated_utc.replace(/Z$/, '');
    tdm.ORIGINATOR = 'LIBRE_SPACE_FOUNDATION';
    const frames = [];
    let seg = null, key = '';
    for (const r of input) {
      const k = `${r.track_id}|${r.epoch_refers_to}|${r.quarantined}`;
      if (k !== key) {
        seg = new L.TDMSegmentT();
        Object.assign(seg, { TIME_SYSTEM: 'UTC', PARTICIPANT_1: `SATNOGS-OPTICAL-${String(r.station_id).padStart(4, '0')}`, PARTICIPANT_2: String(r.correlation_object_norad_id),
          MODE: 'SEQUENTIAL', PATH: '2,1', ANGLE_TYPE: 'RADEC', REFERENCE_FRAME: r.frame === 'ICRS' ? 'ICRF' : r.frame, TRACK_ID: String(r.track_id),
          INTEGRATION_REF: REF[r.epoch_refers_to] ?? null, INTEGRATION_INTERVAL: 0, DATA_QUALITY: r.quarantined ? 'DEGRADED' : 'RAW' });
        tdm.SEGMENTS.push(seg);
        key = k;
      }
      const epoch = L.isoUs(r.t_utc);
      seg.OBSERVATIONS.push(new L.TDMObservationT('ANGLE_1', epoch, r.ra_deg), new L.TDMObservationT('ANGLE_2', epoch, r.dec_deg));
      const e = new L.EOOT();
      Object.assign(e, { ID: r.measurement_client_uuid, OB_TIME: epoch, IMAGE_SET_ID: String(r.track_id), SENSOR_ID: String(r.station_id), ORIG_SENSOR_ID: station.station.name,
        NORAD_CAT_ID: r.correlation_object_norad_id ?? 0, UCT: false, RA: r.ra_deg, DECLINATION: r.dec_deg,
        RA_UNC: r.sigma_ra_arcsec / 3600, DECLINATION_UNC: r.sigma_dec_arcsec / 3600, SENLAT: station.station.site.lat, SENLON: station.station.site.lon,
        SENALT: station.station.site.height_m / 1000, TIMING_BIAS: (r.bias_applied_ms ?? 0) / 1000, EXP_DURATION: 0, SNR: r.snr ?? 0 });
      const b = new flatbuffers.Builder(1024);
      L.EOO.finishEOOBuffer(b, e.pack(b));
      frames.push(frame('measurements', TY.EOO, b.asUint8Array().slice()));
    }
    const b = new flatbuffers.Builder(1 << 20);
    L.TDM.finishTDMBuffer(b, tdm.pack(b));
    const r = await invoke(source, 'read_station_night', [frame('angles', TY.TDM, b.asUint8Array().slice()), ...frames]);
    if (r.error) { sn.unusable = `refused: ${r.error.slice(0, 300)}`; log(`${s} station ${st}: ${input.length} rows refused whole: ${r.error.slice(0, 200)}`); continue; }
    const notice = L.decodeFlowNotice(outputs(r, 'report')[0]);
    const refused = notice.items.filter((x) => x.startsWith('refused.'));
    const reasons = {};
    for (const x of refused) { const why = x.split('=').slice(1).join('=').split(/[:\s]/)[0] || 'refused'; reasons[why] = (reasons[why] ?? 0) + 1; }
    const obs = outputs(r, 'observations'), unc = outputs(r, 'uncertainty');
    sn.tracks = obs.length; sn.observations = unc.length; sn.refused = refused.length; sn.refusedReasons = reasons;
    if (!obs.length) sn.unusable = `every row refused: ${JSON.stringify(reasons)}`;
    log(`${s} station ${st}: ${input.length} rows (${sn.epochRefersTo.join(',')}), ${obs.length} tracks, ${unc.length} observations, refused ${refused.length} ${JSON.stringify(reasons)}`);
    tdms.push(...obs); eoos.push(...unc);
    if (obs.length) {
      const id = `SATNOGS-OPTICAL-${String(st).padStart(4, '0')}`;
      if (!gsts.has(id)) { gsts.set(id, outputs(r, 'stations')[0]); sn.gst = true; }  // one $GST per station per arc: the first usable night's
      pvn ??= outputs(r, 'provenance')[0];
    }
  }
}
const firstEpoch = (bytes) => L.TDM.getRootAsTDM(new flatbuffers.ByteBuffer(bytes)).unpack().SEGMENTS[0].OBSERVATIONS[0].EPOCH;
const lastEpoch = (bytes) => L.TDM.getRootAsTDM(new flatbuffers.ByteBuffer(bytes)).unpack().SEGMENTS[0].OBSERVATIONS.at(-1).EPOCH;
tdms.sort((a, b) => (L.nsOf(firstEpoch(a)) < L.nsOf(firstEpoch(b)) ? -1 : 1));
result.tracks = tdms.length; result.observations = eoos.length; result.rows = result.stationNights.reduce((n, s) => n + s.rows, 0);
if (!tdms.length) finish('failure:no-usable-observations');
const fitEnd = tdms.map((t) => L.nsOf(lastEpoch(t))).reduce((m, x) => (x > m ? x : m), 0n);
result.fitStart = L.isoNs(L.nsOf(firstEpoch(tdms[0]))); result.fitEnd = L.isoNs(fitEnd);
result.fitHours = Number(fitEnd - L.nsOf(firstEpoch(tdms[0]))) / 3.6e12;
log(`${tdms.length} tracks, ${eoos.length} observations, ${result.fitStart} to ${result.fitEnd} (${result.fitHours.toFixed(1)} h)`);

// ---- 2. initial orbit on ALL the arc's tracks (config port), then angles-only-od plan/select ----
const odOf = (bytes) => L.OCM.getRootAsOCM(new flatbuffers.ByteBuffer(bytes)).unpack();
const initial = await invoke(optical, 'initial_orbit', [...tdms.map((p) => frame('angles', TY.TDM, p)), frame('earth_orientation', TY.EOP, eop.stream),
  frame('config', TY.MCFG, L.encodeModuleConfig(L.REG.protocol.initialOrbit.config))]);
if (initial.error) { result.initialOrbit = { refusal: initial.error.slice(0, 400) }; result.refusal = `initial_orbit: ${initial.error.slice(0, 400)}`; finish(`failure:${initial.code}`); }
const initialOcm = outputs(initial, 'orbit')[0];
save('initial.ocm', initialOcm);
{
  const o = odOf(initialOcm), od = o.ORBIT_DETERMINATION;
  result.initialOrbit = { epoch: o.STATE_EPOCHS[0], method: od?.OD_ALGORITHM ?? null, residualRmsArcsec: od?.OD_RESIDUAL_RMS ?? null, observationsUsed: od?.OD_OBSERVATIONS_USED ?? null,
    items: L.decodeFlowNotice(outputs(initial, 'report')[0]).items };
  log(`initial_orbit at ${result.initialOrbit.epoch} (${result.initialOrbit.method}): ${JSON.stringify(result.initialOrbit.items).slice(0, 600)}`);
}
const template = L.prw('EXECUTION_REQUEST', L.executionRequest([0, 0, 0, 0, 0, 0], result.fitStart, result.fitStart, arc.norad));
const sigma = L.REG.protocol.step.timeBiasSigmaS;
const timing = Object.fromEntries([...gsts.keys()].map((id) => [`timeBiasSigmaS.${id}`, sigma[id] ?? sigma.other]));
const stepConfig = L.encodeModuleConfig({ ...L.REG.protocol.step.config, ...timing });
const extras = [...eoos.map((p) => frame('uncertainty', TY.EOO, p)), ...[...gsts.values()].map((p) => frame('stations', TY.GST, p)), frame('provenance', TY.PVN, pvn)];
const ffmInputs = (request) => [frame('request', TY.PRW, request), frame('kernel', TY.PRW, kernel), frame('earth_orientation', TY.PRW, eop.prw)];
let fitCalls = 0;
async function fit(observations, execution) {
  const fixed = [...observations.map((p) => frame('observations', TY.TDM, p)), frame('earth_orientation', TY.PRW, eop.prw),
    frame('execution', TY.PRW, execution), frame('config', TY.MCFG, stepConfig), ...extras];
  let sent = null, res = null, samples = null, rounds = 0;
  for (let calls = 0; calls < L.REG.protocol.step.maximumStepCalls; ++calls) {
    const r = await invoke(step, 'step', [...fixed, ...(sent ? [frame('estimation', TY.EST, sent)] : []),
      ...(res ? [frame('result', TY.EST, res)] : []), ...(samples ? [frame('samples', TY.PRW, samples)] : [])]);
    if (r.error) return { error: r.error, rounds };
    const [ocm] = outputs(r, 'ocm'), [propagation] = outputs(r, 'propagation'), [next] = outputs(r, 'estimation');
    if (ocm) return { ocm, rounds };
    if (propagation) {
      const p = await invoke(ffm, 'invoke', ffmInputs(propagation));
      if (p.error) return { error: `propagator/ffm ${p.error}`, rounds };
      samples = outputs(p, 'response')[0];
      continue;
    }
    if (!next) return { error: 'observation-od step emitted nothing', rounds };
    sent = next; samples = null;
    const est = await invoke(estimation, 'fit_batch', [frame('request', TY.EST, sent)]);
    if (est.error) return { error: `analysis/estimation ${est.error}`, rounds };
    res = outputs(est, 'result')[0];
    ++rounds; ++fitCalls;
  }
  return { error: `loop-did-not-end: ${L.REG.protocol.step.maximumStepCalls} step calls`, rounds };
}
const stages = [];
async function solve() {
  const common = [...tdms.map((p) => frame('observations', TY.TDM, p)), frame('initial', TY.OCM, initialOcm)];
  let stage = null;
  for (let s = 1; s <= L.REG.protocol.flow.maximumStages; ++s) {
    const stageIn = stage ? [frame('stage', TY.OCM, stage)] : [];
    const planned = await invoke(flow, 'plan', [...common, ...stageIn, frame('execution', TY.PRW, template)]);
    if (planned.error) { stages.push({ stage: s, planRefusal: planned.error.slice(0, 400) }); return { error: planned.error, code: planned.code }; }
    const plan = L.decodeFlowNotice(outputs(planned, 'report')[0]);
    log(`stage ${s}: plan ${plan.reason} ${JSON.stringify(plan.items)}`);
    if (plan.reason === 'complete') return { ocm: stage };
    const candidates = outputs(planned, 'execution'), observations = outputs(planned, 'observations');
    const offsets = plan.items.filter((x) => x.startsWith('candidate revolution offset ')).map((x) => Number(x.split(' ').at(-1)));
    const entry = { stage: s, nights: (plan.items.find((x) => x.startsWith('stage nights ')) ?? '').slice(13), tracks: observations.length, plan: plan.items, candidates: [] };
    stages.push(entry);
    const ocms = [], kept = [];
    for (const [c, execution] of candidates.entries()) {
      const t = Date.now(), f = await fit(observations, execution);
      const note = { candidate: c + 1, revolutionOffset: offsets[c] ?? null, rounds: f.rounds, seconds: Math.round((Date.now() - t) / 100) / 10 };
      if (f.ocm) { const od = odOf(f.ocm).ORBIT_DETERMINATION; Object.assign(note, { outcome: 'converged', weightedRms: od.WEIGHTED_RMS, residualRmsArcsec: od.OD_RESIDUAL_RMS, observationsUsed: od.OD_OBSERVATIONS_USED }); }
      else note.outcome = f.error.slice(0, 300);
      log(`stage ${s}: candidate ${c + 1}/${candidates.length}${note.revolutionOffset !== null ? ` (offset ${note.revolutionOffset})` : ''} over ${observations.length} tracks: ${note.outcome}${f.ocm ? ` WEIGHTED_RMS ${note.weightedRms.toFixed(3)} RMS ${note.residualRmsArcsec.toFixed(1)} arcsec` : ''} (${f.rounds} fit_batch, ${note.seconds} s)`);
      entry.candidates.push(note);
      if (f.ocm) { ocms.push(f.ocm); kept.push(execution); }
    }
    const chosen = await invoke(flow, 'select', [...common, ...stageIn, ...ocms.map((p) => frame('candidates', TY.OCM, p)), ...kept.map((p) => frame('executions', TY.PRW, p))]);
    if (chosen.error) { entry.selectRefusal = chosen.error.slice(0, 400); log(`stage ${s}: select refused: ${chosen.error.slice(0, 300)}`); return { error: chosen.error, code: chosen.code }; }
    stage = outputs(chosen, 'selected')[0];
    const report = L.decodeFlowNotice(outputs(chosen, 'report')[0]);
    entry.selected = { weightedRms: odOf(stage).ORBIT_DETERMINATION.WEIGHTED_RMS, reason: report.reason, items: report.items };
    log(`stage ${s}: select ${report.reason}, WEIGHTED_RMS ${entry.selected.weightedRms.toFixed(3)} ${JSON.stringify(report.items).slice(0, 400)}`);
    if (report.reason === 'complete') return { ocm: stage };
  }
  return { error: `stages-did-not-end: ${L.REG.protocol.flow.maximumStages} stages`, code: 'stages-did-not-end' };
}
const t0 = Date.now();
const solved = await solve();
result.stages = stages; result.stageReached = stages.length; result.fitBatchCalls = fitCalls; result.odSeconds = (Date.now() - t0) / 1000;
if (solved.error) { result.refusal = solved.error.slice(0, 400); finish(`failure:${solved.code}`); }
save('estimate.ocm', solved.ocm);
const est = odOf(solved.ocm);
const od = est.ORBIT_DETERMINATION;
result.estimate = { epoch: est.STATE_EPOCHS[0], observationsUsed: od.OD_OBSERVATIONS_USED, residualRmsArcsec: od.OD_RESIDUAL_RMS, weightedRms: od.WEIGHTED_RMS, converged: od.FIT_STATISTICS?.CONVERGED ?? null };
log(`estimate at ${est.STATE_EPOCHS[0]}: ${od.OD_OBSERVATIONS_USED} observations, RMS ${od.OD_RESIDUAL_RMS.toFixed(2)} arcsec, WEIGHTED_RMS ${od.WEIGHTED_RMS.toFixed(3)}`);

// ---- 3. the carry: 24 h back from the fit's end at 60 s (flows/observation-ap carryRequest, mirrored) ----
const exec = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(template)).unpack().EXECUTION_REQUEST;
const s6 = est.STATE_DATA, st = exec.INITIAL.STATE;
st.POSITION = Object.assign(new P.FRMVector3T(), { X: s6[0] * 1000, Y: s6[1] * 1000, Z: s6[2] * 1000 });
st.VELOCITY = Object.assign(new P.FRMVector3T(), { X: s6[3] * 1000, Y: s6[4] * 1000, Z: s6[5] * 1000 });
st.EPOCH = est.STATE_EPOCHS[0];
if ((od.OD_DYNAMIC_PARAMETERS ?? []).length) { result.refusal = 'estimate carries dynamic parameters; none registered'; finish('failure:unregistered-dynamic-parameters'); }
Object.assign(exec, { DYNAMIC_PARAMETERS: [], SAMPLE_EPOCHS: [] });
const endIso = L.isoNs(fitEnd);
exec.TARGET_EPOCH.ISO8601 = endIso;
const carryReq = (() => { const b = new flatbuffers.Builder(1 << 14); P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { EXECUTION_REQUEST: exec }).pack(b)); return b.asUint8Array().slice(); })();
const carryOut = L.pcf({ OUTPUT: Object.assign(new PCF.PCFOutputT(), { FRAME: PCF.pcfOutputFrame.GCRF,
  START_TIME: L.isoNs(fitEnd - 24n * 3600n * 1_000_000_000n), STOP_TIME: endIso, STEP_SECONDS: 60 }) });
const carry = await invoke(ffm, 'propagate_oem', [frame('request', TY.PRW, carryReq), frame('configuration', TY.PCF, carryOut), frame('kernel', TY.PRW, kernel), frame('earth_orientation', TY.PRW, eop.prw)]);
if (carry.error) { result.refusal = `ffm propagate_oem: ${carry.error}`; finish('failure:carry-refused'); }
const ephemeris = outputs(carry, 'ephemeris')[0];
save('carry.oem', ephemeris);
const lines = L.OEM.getRootAsOEM(new flatbuffers.ByteBuffer(ephemeris)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
result.carry = { states: lines.length, first: lines[0]?.EPOCH, last: lines.at(-1)?.EPOCH };
log(`carry: ${lines.length} states ${lines[0]?.EPOCH} to ${lines.at(-1)?.EPOCH}`);

// ---- 4. sdn-ap fit ----
const pvnOf = (() => { const b = new flatbuffers.Builder(512); b.finish(est.PROVENANCE.pack(b), '$PVN'); return b.asUint8Array().slice(); })();
const apConfig = L.pcf({ THEORY: PCF.pcfTheory.AP, FORCES: Object.assign(new PCF.PCFForceModelT(), { EPHEMERIS_SOURCE: '',
  ATMOSPHERE_MODEL: PCF.pcfAtmosphereFamily.JACCHIA70, HAS_MAXIMUM_TESSERAL_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: 31, HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: 20 }) });
const apFit = await invoke(sdnAp, 'fit', [frame('ephemeris', TY.OEM, ephemeris), frame('configuration', TY.PCF, apConfig), frame('provenance', TY.PVN, pvnOf)]);
if (apFit.error) { result.refusal = `sdn-ap fit: ${apFit.error}`; finish('failure:ap-fit-refused'); }
const apOcm = outputs(apFit, 'elements')[0];
save('ap.ocm', apOcm);
const ap = odOf(apOcm), fs2 = ap.ORBIT_DETERMINATION.FIT_STATISTICS;
result.ap = { epoch: ap.MEAN_ELEMENTS?.EPOCH, fitRmsKm: fs2.FIT_RMS_KM, fitStates: fs2.FIT_STATES, converged: fs2.CONVERGED, bterm: ap.MEAN_ELEMENTS?.BTERM, pvnSourceKind: L.pvnSourceKind[ap.PROVENANCE?.SOURCE_KIND] };
log(`AP: FIT_RMS ${(fs2.FIT_RMS_KM * 1000).toFixed(1)} m over ${fs2.FIT_STATES} states, CONVERGED ${fs2.CONVERGED}`);

// ---- 5. flight: the AP $OCM alone, GCRF, 60 s from the first whole TAI minute after the fit's end (DORIS SP3 epochs) to +72 h ----
const flightConfig = L.flightConfig(fitEnd);
const flown = await invoke(sdnAp, 'propagate', [frame('ocm', TY.OCM, apOcm), frame('configuration', TY.PCF, flightConfig.pcf)]);
if (flown.error) { result.refusal = `sdn-ap propagate: ${flown.error}`; finish('failure:flight-refused'); }
save('flight.oem', outputs(flown, 'ephemeris')[0]);
result.flight = { start: flightConfig.start, stop: flightConfig.stop };
await Promise.all([source, eopParser, optical, estimation, ffm, step, flow, sdnAp].map((h) => h.destroy?.()));
finish('fitted');
