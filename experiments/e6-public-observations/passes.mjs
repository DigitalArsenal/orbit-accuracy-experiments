// One SatNOGS pass from waterfall to range-rate measurements (PLAN.md §4.1).
// The waterfall is Doppler-corrected in real time with the observation's
// element set: the station tuned f_t(t) = f0 (1 - rr_set(t) / c), so the
// track's offset is df(t) = f(t) - f_t(t) and the received frequency is
// f_t(t) + df(t). rr_set(t) (and the station's GCRF position) come from
// analysis/association, given propagator/sgp4's states of that same set as a
// prediction: the measurement is then rr(t) = rr_set(t - lag) - df(t) c / f0,
// with the tuning lag calibrated on dev (config). The arithmetic here is the
// first-order Doppler relation the station itself used; every orbit,
// frame and range-rate value is a module's.
import { readWaterfall, extractTrack } from './waterfall.mjs';
import { earthFixedStates, parseTwoLine } from './sgp4.mjs';
import { decodeRfo, jsonFrame, predictionFrame, rfoBytes, rfoFrame } from './records.mjs';

export const C = 299792458;
const iso = (ms) => new Date(ms).toISOString();

// The time tag of waterfall second s: from the image's UTC axis when it has
// one; otherwise the recording is taken to end on the scheduled end, so it
// began (scheduled - recorded) seconds late.
export const tagMs = (obs, scale, s) => (scale.utcOfBottom ?? Date.parse(obs.start) + ((Date.parse(obs.end) - Date.parse(obs.start)) / 1000 - scale.recordedSeconds) * 1000) + s * 1000;

export function waterfallTrack(png, obs, extraction) {
  const durationSeconds = (Date.parse(obs.end) - Date.parse(obs.start)) / 1000;
  const w = readWaterfall(png, { durationSeconds, startMs: Date.parse(obs.start), ...extraction.image });
  const track = extractTrack(w, extraction.track);
  return { scale: w.scale, ...track };
}

// rr_set at each instant (ms) for one station, from the observation's own
// element set, through association's report: predicted range rate and the
// sensor's GCRF position. -> [{rangeRate (m/s), sensorGcrf [m]}]
export async function setRangeRates({ association, sgp4, eop }, obs, instants) {
  const set = parseTwoLine(obs.tle1, obs.tle2);
  const lo = Math.min(...instants) - 120000, hi = Math.max(...instants) + 120000;
  const grid = [];
  for (let t = Math.floor(lo / 10000) * 10000; t <= hi; t += 10000) grid.push(t);
  const states = await earthFixedStates(sgp4, set, grid);
  const lower = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c <= r; c++) lower.push(r === c ? (r < 3 ? 1 : 1e-6) : 0);
  const prediction = predictionFrame({
    norad: set.norad, frame: 'ITRF2000', states: grid.map((t, i) => ({ epoch: iso(t), state: states[i] })),
    covariances: [{ epoch: iso(grid[0]), lower }, { epoch: iso(grid.at(-1)), lower }],
  });
  return predictedRangeRates(association, prediction, eop, obs, instants, set.norad);
}

// Range rate from a station to a predicted object at each instant (ms),
// through association's report, with the station's GCRF position.
// prediction: an $OEM frame (with covariance) of object `norad`.
export async function predictedRangeRates(association, prediction, eop, obs, instants, norad) {
  const f0 = obs.observation_frequency / 1e6;
  const records = instants.map((t, i) => rfoFrame(rfoBytes({
    OB_TIME: iso(t), FREQUENCY: f0, FREQUENCY_UNC: 1e-6, NOMINAL_FREQUENCY: f0, SENLAT: obs.station_lat, SENLON: obs.station_lng, SENALT: obs.station_alt / 1000,
    ID_SENSOR: String(obs.ground_station), TRACK_ID: `${obs.id}:${i}`,
  })));
  const response = await association.invoke('associate_observations', [...records, prediction, eop,
    jsonFrame('options', { scan: 'observation', geometry: true, max_candidates: 1 })]);
  const report = JSON.parse(Buffer.from(response.outputs.find((f) => f.portId === 'report').payload));
  if (report.observations.length !== instants.length) throw new Error(`association: ${report.observations.length} of ${instants.length} observations reported`);
  return report.observations.map((o) => {
    const c = o.candidates.find((x) => x.object.norad_cat_id === norad);
    if (!c) throw new Error(`association: no prediction of ${norad} at ${o.time}`);
    return { rangeRate: c.predicted.range_rate_km_s * 1000, sensorGcrf: o.sensor_gcrf_km.map((v) => v * 1000), objectGcrf: [...c.position_gcrf_km, ...c.velocity_gcrf_km_s].map((v) => v * 1000) };
  });
}

// The pass's measurements: per track bin {time (ISO UTC), rangeRate (m/s,
// before the per-pass bias), sigma (m/s), station GCRF position [m] and
// velocity [m/s], rrSet, rrSetRate (m/s^2), dfHz, sigmaHz, rfo (bytes)}.
// lagSeconds: the calibrated tuning lag (rr_set is taken at t - lag).
export async function passMeasurements(ctx, obs, track, { lagSeconds, sigmaScale }) {
  const f0 = obs.observation_frequency;
  const tags = track.points.map((p) => tagMs(obs, track.scale, p.tMean));
  // rr_set at t - 1 s, t, t + 1 s: its rate (for the lag) and the station's
  // velocity, as central differences of the module's values.
  const instants = tags.flatMap((t) => [t - 1000, t, t + 1000]);
  const rr = await setRangeRates(ctx, obs, instants);
  return track.points.map((p, k) => {
    const [a, b, c] = rr.slice(3 * k, 3 * k + 3);
    const rate = (c.rangeRate - a.rangeRate) / 2;
    const rrSet = b.rangeRate - lagSeconds * rate;
    const rangeRate = rrSet - p.hz * C / f0;
    const sigma = sigmaScale * p.sigmaHz * C / f0;
    const frequency = f0 * (1 - rrSet / C) + p.hz;
    return {
      time: iso(tags[k]), segment: p.segment, rangeRate, sigma, dfHz: p.hz, sigmaHz: p.sigmaHz, rrSet, rrSetRate: rate,
      station: b.sensorGcrf, stationVelocity: [0, 1, 2].map((i) => (c.sensorGcrf[i] - a.sensorGcrf[i]) / 2),
      rfo: rfoBytes({
        OB_TIME: iso(tags[k]), FREQUENCY: frequency / 1e6, FREQUENCY_UNC: sigmaScale * p.sigmaHz / 1e6, NOMINAL_FREQUENCY: f0 / 1e6, SENLAT: obs.station_lat, SENLON: obs.station_lng,
        SENALT: obs.station_alt / 1000, ID_SENSOR: String(obs.ground_station), ORIG_SENSOR_ID: obs.station_name, SAT_NO: obs.norad_cat_id,
        TRACK_ID: String(obs.id), URL: `https://network.satnogs.org/observations/${obs.id}/`, RAW_FILE_URI: obs.waterfall,
        TAGS: ['SOURCE=SatNOGS Network (CC BY-SA 4.0)', `TRANSMITTER=${obs.transmitter_uuid}`, `SEGMENT=${p.segment}`, 'FREQUENCY_UNC=track-bin scatter, before the dev noise scale'],
      }),
    };
  });
}

export { decodeRfo };
