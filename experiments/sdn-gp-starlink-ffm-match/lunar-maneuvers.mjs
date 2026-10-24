// Amendment A9f: maneuver epochs in the lunar truth (LRO, Danuri), from the truth alone and fixed before any scoring. Each pack's states at 5 min go through
// foundation/orbits `cartesian_to_keplerian` (GM of the Moon 4902.800118 km3/s2, DE440); the osculating semi-major axis is averaged over one orbital period (N = round(T / 300 s)
// samples, T from the median axis); the step S(t) is the mean over the next period minus the mean over the previous one; |S| above median(|S|) + 6 x 1.4826 x MAD(|S|) marks a
// maneuver, hits less than two periods apart merge, the epoch is the cluster's peak, and the indicative delta-v is n |delta a| / 2 (n = 2 pi / T, circular orbit).
// Output: results/sdn-gp-starlink-ffm-match/lunar-maneuvers.json (epochs, delta a and delta v; no states).
//   node experiments/sdn-gp-starlink-ffm-match/lunar-maneuvers.mjs
import path from 'node:path';
import { frozen, results, write } from './common.mjs';
import { modulesRoot, openModule } from './lib/modules.mjs';
import { readPack } from './lib/packs.mjs';
import { oemBytes, OMM, flatbuffers, TYPES } from './lib/sds.mjs';
import { quantile } from './lib/windows.mjs';

const GM_MOON = 4902.800118; // km3/s2, DE440
const STRIDE = 5, SAMPLE_S = 300, K = 6;
const AXES = { 'lro-lunar': 'J2000', 'danuri-lunar': 'ICRF' };

frozen();
const orbits = await openModule(modulesRoot(), 'foundation/orbits');
const gm = (() => { const t = new OMM.OMMT(); t.CCSDS_OMM_VERS = 3.0; t.GM = GM_MOON; const b = new flatbuffers.Builder(256); OMM.OMM.finishOMMBuffer(b, t.pack(b)); return b.asUint8Array(); })();
const context = { portId: 'gravity_context', payload: Buffer.from(gm), typeRef: TYPES.OMM };
const packs = {};
for (const pack of Object.keys(AXES)) {
  const { object } = readPack(pack);
  const t = [], a = [];
  for (let i = 0; i < object.lines.length; i += STRIDE) {
    const l = object.lines[i];
    const oem = oemBytes({ block: { frame: AXES[pack], center: 'MOON', object: { name: pack, norad: 0 }, lines: [l], start: l.epoch, stop: l.epoch }, sizePrefixed: false });
    const out = await orbits.call('cartesian_to_keplerian', [{ portId: 'cartesian_state', payload: Buffer.from(oem), typeRef: TYPES.OEM }, context]);
    t.push(object.t[i]); a.push(OMM.OMM.getRootAsOMM(new flatbuffers.ByteBuffer(new Uint8Array(out.mean_elements))).unpack().SEMI_MAJOR_AXIS);
  }
  const aMedian = quantile(a, 0.5), periodS = 2 * Math.PI * Math.sqrt(aMedian ** 3 / GM_MOON), N = Math.round(periodS / SAMPLE_S);
  const cum = [0]; for (const v of a) cum.push(cum[cum.length - 1] + v);
  const S = [];
  for (let i = N; i + N <= a.length; i += 1) S.push([t[i], (cum[i + N] - cum[i]) / N - (cum[i] - cum[i - N]) / N]);
  const abs = S.map((x) => Math.abs(x[1])), med = quantile(abs, 0.5), sigma = 1.4826 * quantile(abs.map((v) => Math.abs(v - med)), 0.5), threshold = med + K * sigma;
  const events = [];
  for (const [ti, si] of S) {
    if (Math.abs(si) <= threshold) continue;
    const last = events.at(-1);
    if (last && ti - last.lastHitMs < 2 * periodS * 1000) { last.lastHitMs = ti; if (Math.abs(si) > Math.abs(last.deltaAKm)) { last.deltaAKm = si; last.epochMs = ti; } } else events.push({ epochMs: ti, deltaAKm: si, lastHitMs: ti });
  }
  const n = (2 * Math.PI) / periodS;
  packs[pack] = {
    samples: a.length, sampleSeconds: SAMPLE_S, semiMajorAxisMedianKm: aMedian, periodSeconds: periodS, orbitSamples: N,
    stepStatistic: { medianAbsKm: med, madSigmaKm: sigma, thresholdKm: threshold, k: K },
    events: events.map((e) => ({ epochUtc: new Date(e.epochMs).toISOString(), deltaAKm: e.deltaAKm, deltaVCmPerS: (n * Math.abs(e.deltaAKm) * 1000 / 2) * 100 })),
  };
  console.error(`${pack}: ${a.length} samples, period ${periodS.toFixed(0)} s, threshold ${(threshold * 1000).toFixed(1)} m, ${events.length} maneuver(s)`);
}
await orbits.destroy();
write(path.join(results, 'lunar-maneuvers.json'), { generatedFrom: 'the lunar truth packs (derived from public NAIF and JPL Horizons data); epochs and steps only, no states', method: 'amendment A9f', gmMoonKm3S2: GM_MOON, packs });
process.exit(0);
