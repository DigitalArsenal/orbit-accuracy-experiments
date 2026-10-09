// Maneuvers in an object's OMM history (PLAN.md section 4), by
// analysis/maneuver-detection `detect_maneuvers`, which takes each element
// set's trajectory as an $OEM block.
//
// The trajectories are SGP4's, computed by analysis/gp-error-model
// `accumulate`: it returns SGP4 (TEME -> GCRF) minus a comparison state, in
// the comparison state's RTN axes, at the comparison epochs. The comparison
// here is a fixed carrier state, r = (7000, 0, 0) km and v = (0, 7.5, 0)
// km/s, at every grid epoch: its R, T, N axes are the GCRF x, y and z axes,
// so the module's error is the SGP4 GCRF state minus the carrier, and adding
// the carrier back is a translation, not a computation. `accumulate` is
// forward only, so each block runs from its set's epoch forward, past the next
// set's epoch. Framing and bookkeeping only.
import * as flatbuffers from 'flatbuffers';
import * as OEMS from 'spacedatastandards.org/lib/js/OEM/main.js';
import * as MNVS from 'spacedatastandards.org/lib/js/MNV/main.js';
import { json } from '../../harness/modules.mjs';
import { ommFrame, OEM_TYPE } from '../../harness/records.mjs';
import { config, DAY_MS } from './common.mjs';

const CARRIER = [7000, 0, 0, 0, 7.5, 0];
const isoMs = (ms) => `${new Date(ms).toISOString().slice(0, 23)}000Z`;

export class ManeuverHistory {
  // sets: the object's published sets in epoch order; template: an unpacked
  // $OEM of the object (its truth), whose header frames the blocks.
  constructor(ctx, regimeName, sets, template) {
    const m = config.maneuvers;
    Object.assign(this, { ctx, sets, template, step: m.gridSeconds[regimeName], span: m.blockSpanDays[regimeName] });
    this.trajectories = new Map();  // gpId -> Float64Array [r, v] per grid step (km, km/s) | null
  }

  spanFor(i) {
    const next = this.sets[i + 1];
    const gap = next ? (next.epochMs - this.sets[i].epochMs) / DAY_MS : 0;
    return Math.min(config.maneuvers.maximumBlockSpanDays, Math.max(this.span, 1.25 * gap + this.step / 86400));
  }

  async trajectory(i) {
    const set = this.sets[i];
    if (this.trajectories.has(set.gpId)) return this.trajectories.get(set.gpId);
    const n = Math.floor(this.spanFor(i) * 86400 / this.step) + 1;
    const block = this.template.EPHEMERIS_DATA_BLOCK[0];
    const line0 = block.EPHEMERIS_DATA_LINES[0];
    const lines = [];
    for (let k = 0; k < n; ++k) {
      const l = Object.assign(Object.create(Object.getPrototypeOf(line0)), line0);
      Object.assign(l, { EPOCH: isoMs(set.epochMs + 1 + k * this.step * 1000), X: CARRIER[0], Y: CARRIER[1], Z: CARRIER[2], X_DOT: CARRIER[3], Y_DOT: CARRIER[4], Z_DOT: CARRIER[5] });
      for (const a of ['X_DDOT', 'Y_DDOT', 'Z_DDOT']) if (a in l) l[a] = 0;
      lines.push(l);
    }
    const oem = Object.assign(Object.create(Object.getPrototypeOf(this.template)), this.template, {
      EPHEMERIS_DATA_BLOCK: [Object.assign(Object.create(Object.getPrototypeOf(block)), block, {
        EPHEMERIS_DATA_LINES: lines, COVARIANCE_MATRIX_LINES: [], START_TIME: lines[0].EPOCH, STOP_TIME: lines.at(-1).EPOCH, COMMENT: `carrier for ${set.gpId}` })],
    });
    const b = new flatbuffers.Builder(1 << 20);
    OEMS.OEM.finishSizePrefixedOEMBuffer(b, oem.pack(b));
    const frame = { portId: 'reference', typeRef: OEM_TYPE, payload: b.asUint8Array().slice() };
    // Bin k holds grid epoch k, 1 ms after the (millisecond-floored) epoch
    // plus k steps: within +-1 s of k steps, so one epoch per bin.
    const half = 1 / 86400;
    const bins = Array.from({ length: n }, (_, k) => [Math.max(0, k * this.step / 86400 - half), k * this.step / 86400 + half]);
    const acc = await this.ctx['gp-error-model'].invokeJson('accumulate', [ommFrame([set]), frame, json('options', { ageBinsDays: bins, referenceStepSeconds: 0 })], 'accumulator');
    const out = new Float64Array(6 * n);
    let ok = 0;
    for (const s of acc.strata) {
      if (s.n !== 1) continue;
      for (let c = 0; c < 6; ++c) out[6 * s.age + c] = CARRIER[c] + s.sum[c];
      ++ok;
    }
    const value = ok === n ? { data: out, n, startMs: set.epochMs + 1 } : null;
    this.trajectories.set(set.gpId, value);
    return value;
  }

  // Detected maneuvers among the sets at these indices (epoch order):
  // {events: [{timeMs, dvInTrack, dvCrossTrack, characterization}], blocks}.
  async detect(indices) {
    const blocks = [];
    for (const i of indices) {
      const t = await this.trajectory(i);
      if (!t) continue;
      const tb = this.template.EPHEMERIS_DATA_BLOCK[0];
      const b = new OEMS.ephemerisDataBlockT();
      b.OBJECT = tb.OBJECT;
      b.COMMENT = `GP_ID ${this.sets[i].gpId} EPOCH ${this.sets[i].epoch}`;
      b.CENTER_NAME = 'EARTH';
      b.REFERENCE_FRAME = tb.REFERENCE_FRAME;
      b.TIME_SYSTEM = tb.TIME_SYSTEM;
      b.START_TIME = isoMs(t.startMs);
      b.STOP_TIME = isoMs(t.startMs + (t.n - 1) * this.step * 1000);
      b.STEP_SIZE = this.step;
      b.EPHEMERIS_DATA = Array.from(t.data);
      blocks.push(b);
    }
    if (blocks.length < 2 * config.maneuvers.options.median_sets + 1) return { events: [], blocks: blocks.length };
    const m = new OEMS.OEMT();
    m.CREATION_DATE = isoMs(this.sets[indices.at(-1)].epochMs);
    m.EPHEMERIS_DATA_BLOCK = blocks;
    const builder = new flatbuffers.Builder(1 << 22);
    OEMS.OEM.finishOEMBuffer(builder, m.pack(builder));
    const response = await this.ctx['maneuver-detection'].invoke('detect_maneuvers', [
      { portId: 'ephemerides', payload: Buffer.from(builder.asUint8Array()), typeRef: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' } },
      json('options', config.maneuvers.options),
    ]);
    const events = response.outputs.filter((f) => f.portId === 'maneuvers').map((f) => {
      const e = MNVS.MNV.getRootAsMNV(new flatbuffers.ByteBuffer(new Uint8Array(f.payload))).unpack();
      return { timeMs: Date.parse(e.EVENT_START_TIME.replace(/Z?$/, 'Z')), dvInTrack: e.DELTA_VEL_U * 1000, dvCrossTrack: e.DELTA_VEL_V * 1000,
        characterization: MNVS.maneuverCharacterization[e.CHARACTERIZATION] ?? String(e.CHARACTERIZATION) };
    });
    return { events, blocks: blocks.length };
  }
}
