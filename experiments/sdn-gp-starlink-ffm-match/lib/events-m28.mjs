// Amendment A10, M28 (DESIGN 5.5): synthetic decays by FFM-1 (lib/decay.mjs), nodes along each decay, the SDN-GP fit at a node scored against the truth after it, the module's `reentry` against FFM-1's
// own stop. FFM-1 integrates, the SDN-GP module fits, propagates and hands off; this file picks nodes, calls both and counts.
import fs from 'node:fs';
import path from 'node:path';
import { config, read, sha256 } from '../common.mjs';
import { EVENTS } from './events.mjs';
import { CELLS, LADDER, BLOCKS, STEP_S, CAP_DAYS } from './events-cells.mjs';
import { LEVELS, DECAY_START, decayTrack, decayContext } from './decay.mjs';
import { atmosphere, propagateEvents } from './ffm-events.mjs';
import { openOrbits, GM_FFM } from './orbits.mjs';
import { oemBytes, OMM } from './sds.mjs';
import { transformState } from './frames.mjs';
import { rtnSeries } from './baselines.mjs';
import { modulesRoot } from './modules.mjs';
import { loadEnvironment } from './ffm.mjs';
import { reentry as sdngpReentry, rootOf } from './sdngp-events.mjs';
import { iso, ms } from './windows.mjs';
import { store } from '../common.mjs';
import { syntheticWeather } from './ffm-events.mjs';

export { CELLS, LADDER, BLOCKS, STEP_S, CAP_DAYS };
const R_EQ = 6378.137;
const dir = path.join(EVENTS, 'm28');
const paths = (cell) => ({ bin: path.join(dir, `${cell.id}.f64`), json: path.join(dir, `${cell.id}.json`) });
const rms = (v) => (v.length ? Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length) : null);

/** Generate (cached) the 300 s track of every cell of this shard. */
export async function decayTruths(modules, context, { shard: [k, n] }) {
  for (const [i, cell] of CELLS.entries()) {
    if (i % n !== k) continue;
    const p = paths(cell);
    if (fs.existsSync(p.json)) continue;
    const t = await decayTrack(modules, context, { level: cell.level, cdAm: cell.B, h0: cell.h0, e0: cell.e0, stepS: STEP_S, chunkDays: 10, capDays: CAP_DAYS });
    const flat = new Float64Array(t.samples.length * 6);
    t.samples.forEach((s, j) => s.state.forEach((x, c) => { flat[j * 6 + c] = x / 1000; }));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${p.bin}.part`, Buffer.from(flat.buffer)); fs.renameSync(`${p.bin}.part`, p.bin);
    fs.writeFileSync(p.json, `${JSON.stringify({ cell, t0Utc: DECAY_START, stepS: STEP_S, samples: t.samples.length, stopUtc: t.reentry?.epochUtc ?? null, stopHeightKm: t.reentry?.heightKm ?? null, capped: t.capped, level: LEVELS[cell.level], seconds: t.seconds, sha256: sha256(fs.readFileSync(p.bin)), createdUtc: new Date().toISOString() }, null, 1)}\n`);
    console.error(`m28 ${cell.id}: ${t.samples.length} samples, ${t.capped ? 'capped' : `FFM-1 stop ${t.reentry.epochUtc}`}, ${t.seconds.toFixed(0)} s`);
  }
}

/** Revolution means along a track: osculating a, e, perigee radius and a e by foundation/orbits, with prefix sums. */
async function elements(orbits, flat, n, t0) {
  const a = new Float64Array(n), e = new Float64Array(n);
  for (let j = 0; j < n; j += 1) {
    const k = await orbits.toKeplerian({ epoch: iso(t0 + j * STEP_S * 1000), r: [flat[j * 6], flat[j * 6 + 1], flat[j * 6 + 2]], v: [flat[j * 6 + 3], flat[j * 6 + 4], flat[j * 6 + 5]] });
    a[j] = k.a; e[j] = k.e;
  }
  const prefix = (f) => { const p = new Float64Array(n + 1); for (let j = 0; j < n; j += 1) p[j + 1] = p[j] + f(j); return p; };
  return { a, e, pa: prefix((j) => a[j]), pe: prefix((j) => e[j]), prp: prefix((j) => a[j] * (1 - e[j])), pae: prefix((j) => a[j] * e[j]) };
}
const meanOver = (p, lo, hi) => (p[hi + 1] - p[lo]) / (hi - lo + 1);
const nodalSamples = (a) => Math.round((2 * Math.PI * Math.sqrt((a * a * a) / GM_FFM)) / STEP_S);

/** The truth quantities of one sample's revolution (over the last nodal period and the one before it). */
function revolution(el, i) {
  const N = nodalSamples(el.a[i]);
  if (i < 2 * N) return null;
  const a1 = meanOver(el.pa, i - N + 1, i), a0 = meanOver(el.pa, i - 2 * N + 1, i - N);
  const ae1 = meanOver(el.pae, i - N + 1, i), ae0 = meanOver(el.pae, i - 2 * N + 1, i - N);
  return { N, hp: meanOver(el.prp, i - N + 1, i) - R_EQ, e: meanOver(el.pe, i - N + 1, i), a: a1, daRev: a1 - a0, dAeRev: ae1 - ae0, ae: ae1 };
}

/**
 * The nodes of a track: for each ladder level the first sample (two periods from the start) whose revolution-mean perigee height is below it; one node per sample. A node with less than
 * 6 h (72 samples) of truth before it is dropped and counted.
 */
export function findNodes(el, n) {
  const nodes = [], dropped = [], taken = new Set();
  let i = 0;
  for (const level of LADDER) {
    for (; i < n; i += 1) {
      const r = revolution(el, i);
      if (r && r.hp < level) break;
    }
    if (i >= n) break;
    if (i < 72) { dropped.push(level); continue; }
    if (!taken.has(i)) { nodes.push({ level, i }); taken.add(i); }
  }
  return { nodes, dropped };
}

/** TEME states of a set at epochs -> GCRF [{ r, v }]; stops at the first failed propagation (the rest null). */
async function gcrfStates(b, omm, setEpochMs, epochs) {
  const teme = await b.sdngp.states(omm, epochs.map((t) => (t - setEpochMs) / 60000));
  const out = [];
  for (let k = 0; k < epochs.length; k += 1) {
    if (teme[k].status !== 0) { out.push(...Array(epochs.length - k).fill(null)); break; }
    const t = await transformState(b.frames, 'TEME', 'GCRF', iso(epochs[k]), [...teme[k].r, ...teme[k].v]);
    out.push({ r: t.slice(0, 3), v: t.slice(3, 6) });
  }
  return out;
}

export async function scoreCell(b, sink, modules, context0, orbits, cell, only = null) {
  const p = paths(cell);
  if (!fs.existsSync(p.json)) { console.error(`m28 ${cell.id}: no track yet`); return false; }
  const meta = read(p.json), flat = new Float64Array(new Uint8Array(fs.readFileSync(p.bin)).buffer), n = meta.samples, t0 = ms(meta.t0Utc);
  const stopMs = meta.stopUtc ? Date.parse(meta.stopUtc) : null, level = LEVELS[cell.level];
  const context = decayContext(context0, cell.level, CAP_DAYS + 20);
  const weather = syntheticWeather(context0, { ...level, startDate: '2025-10-23', days: CAP_DAYS + 20 }).payload;
  const el = await elements(orbits, flat, n, t0);
  const { nodes, dropped } = findNodes(el, n);
  const base = { source: 'm28', cell, build: b.sdngp.provenance.wasmSha256.slice(0, 12), startUtc: meta.t0Utc, fitSeconds: 0, stopUtc: meta.stopUtc, capped: meta.capped, samples: n, droppedLevels: dropped };
  const rowsPerCell = [];
  for (const { level: lv, i } of nodes) {
    if (only && !only.includes(lv)) continue;
    const key = `${cell.id} ${lv}`;
    if (sink.has(`m28|${key}|${meta.t0Utc}|0`)) continue;
    const rev = revolution(el, i), tNode = t0 + i * STEP_S * 1000;
    const [atmM, atmP] = await atmosphere(modules, context, [-1, 1].map((d) => ({ epochMs: tNode, altKm: rev.hp + d, f107: level.f107, ap: level.ap })));
    const H = 2 / Math.log(atmM.densityKgM3 / atmP.densityKgM3);
    const eps1 = (2 * Math.abs(rev.daRev)) / H;
    const truth = { hpKm: rev.hp, e: rev.e, daRevKm: rev.daRev, scaleHeightKm: H, eps1, C1: eps1 > 0.05, C2: rev.hp < 180, C3: Math.abs(rev.dAeRev) / rev.ae > 0.01 && rev.e > 0.01, leadHours: stopMs ? (stopMs - tNode) / 3600e3 : null };
    const row = { ...base, id: key, level: lv, nodeUtc: iso(tNode), node: i, truth };
    // SDN-GP fitted on the truth up to the node (the module chooses its span)
    const j0 = Math.max(0, i - 1440);
    const lines = Array.from({ length: i - j0 + 1 }, (_, q) => { const j = j0 + q; return { epoch: iso(t0 + j * STEP_S * 1000), r: [flat[j * 6], flat[j * 6 + 1], flat[j * 6 + 2]], v: [flat[j * 6 + 3], flat[j * 6 + 4], flat[j * 6 + 5]] }; });
    const bytes = oemBytes({ originator: 'G1 FFM-1', block: { frame: 'GCRF', frameName: 'GCRF', timeSystem: 'UTC', object: { name: cell.id, id: '', norad: 0 }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch, useableStop: iso(tNode) }, sizePrefixed: false });
    const fit = await b.sdngp.fit(bytes, { weatherTable: weather });
    if (!fit.ok) { sink.append({ ...row, fit: { ok: false, error: fit.error } }); continue; }
    const setEpoch = ms(fit.unpacked.EPOCH);
    row.fit = { ok: true, fitRmsKm: fit.fitRmsKm, bEff: Number(fit.params.SDNGP_B_EFF), meanMotion: fit.unpacked.MEAN_MOTION, eccentricity: fit.unpacked.ECCENTRICITY, spanHours: /span ([\d.]+) h/.exec(fit.comment ?? '')?.[1] ?? null, states: fit.statesFitted };
    // the next 12 h against the truth, in four blocks
    const K = Math.min(144, n - 1 - i);
    if (K > 0) {
      const epochs = Array.from({ length: K }, (_, q) => tNode + (q + 1) * STEP_S * 1000);
      try {
        const pred = await gcrfStates(b, fit.omm, setEpoch, epochs);
        const valid = pred.map((x, q) => (x ? q : -1)).filter((q) => q >= 0);
        const truthStates = valid.map((q) => { const j = i + 1 + q; return { r: [flat[j * 6], flat[j * 6 + 1], flat[j * 6 + 2]], v: [flat[j * 6 + 3], flat[j * 6 + 4], flat[j * 6 + 5]] }; });
        const rtn = valid.length ? await rtnSeries(b, valid.map((q) => pred[q]), truthStates) : [];
        row.blocks = BLOCKS.map(([lo, hi]) => {
          const e = valid.map((q, w) => ({ k: q + 1, e: rtn[w] })).filter((x) => x.k >= lo && x.k <= hi).map((x) => x.e);
          const expected = Math.min(hi, K) - lo + 1;
          if (expected <= 0) return null;
          if (e.length < expected) return { failed: true, n: e.length, expected };
          const ric = [0, 1, 2].map((c) => rms(e.map((v) => v[c])));
          return { rmsKm: Math.hypot(...ric), ric, n: e.length, expected };
        });
        row.propagated = { requested: K, valid: valid.length };
      } catch (error) { row.blocks = null; row.propagated = { error: String(error.message).slice(0, 200) }; }
    }
    // the module's reentry on the same set
    const t1 = performance.now();
    const re = await sdngpReentry(b.sdngp, { omm: fit.omm, weatherTable: weather });
    if (!re.ok) row.reentry = { ok: false, error: re.error };
    else {
      const r = re.rdm, s = r.INITIAL_STATE;
      const handoff = s ? { epoch: s.EPOCH, frame: s.REF_FRAME, state: [s.X, s.Y, s.Z, s.X_DOT, s.Y_DOT, s.Z_DOT] } : null;
      if (handoff) { // the truth at the hand-off epoch: the revolution-mean perigee height and eccentricity of the nearest sample
        const ih = Math.round((ms(handoff.epoch) - t0) / (STEP_S * 1000)), rh = ih >= 0 && ih < n ? revolution(el, ih) : null;
        handoff.truth = rh ? { hpKm: rh.hp, e: rh.e } : null;
      }
      row.reentry = { ok: true, ms: performance.now() - t1, epoch: r.REENTRY_EPOCH, uncHours: r.REENTRY_EPOCH_UNC, windowStart: r.REENTRY_WINDOW_START, windowEnd: r.REENTRY_WINDOW_END, orbitLifetimeDays: r.ORBIT_LIFETIME, lifetimeWindowDays: [r.ORBIT_LIFETIME_WINDOW_START, r.ORBIT_LIFETIME_WINDOW_END], altitudeKm: r.REENTRY_ALTITUDE, ballisticCoeff: r.BALLISTIC_COEFF, comment: r.COMMENT ?? null, handoff };
      if (stopMs && r.REENTRY_EPOCH) {
        row.reentry.errorHours = (Date.parse(`${r.REENTRY_EPOCH.replace(/Z$/, '')}Z`) - stopMs) / 3600e3;
        row.reentry.inWindow = r.REENTRY_WINDOW_START && r.REENTRY_WINDOW_END ? stopMs >= Date.parse(`${r.REENTRY_WINDOW_START.replace(/Z$/, '')}Z`) && stopMs <= Date.parse(`${r.REENTRY_WINDOW_END.replace(/Z$/, '')}Z`) : null;
      }
      // the hand-off state alone: FFM-1 (the cell's true B and weather) from it to its own stop
      if (handoff && stopMs) {
        try {
          let st = handoff.state;
          if (/TEME/i.test(handoff.frame ?? '')) st = await transformState(b.frames, 'TEME', 'GCRF', iso(ms(handoff.epoch)), st);
          const ho = ms(handoff.epoch);
          const r2 = await propagateEvents(modules, context, { epoch: iso(ho), state: st.map((x) => x * 1000), cdAm: cell.B, crAm: 0.02, epochs: [ho + 400 * 86400000], integrator: config.truth.integrator });
          row.reentry.handoffFfm = r2.reentry ? { stopUtc: r2.reentry.epochUtc, errorHours: (Date.parse(r2.reentry.epochUtc) - stopMs) / 3600e3 } : { ok: r2.ok, error: r2.error };
        } catch (error) { row.reentry.handoffFfm = { error: String(error.message).slice(0, 200) }; }
      }
    }
    sink.append(row);
    rowsPerCell.push(key);
  }
  console.error(`m28 ${cell.id}: ${nodes.length} nodes, ${rowsPerCell.length} new rows`);
  return true;
}

export async function scoreCells({ b, sink, shard, limit }) {
  const modules = modulesRoot();
  const context0 = await loadEnvironment(modules, { archive: config.archive, store });
  const orbits = await openOrbits(modules);
  let done = 0;
  try {
    for (const cell of CELLS) {
      if (!sink.mine()) continue;
      if (done >= limit) break;
      if (await scoreCell(b, sink, modules, context0, orbits, cell)) done += 1;
    }
  } finally { await orbits.destroy(); }
}
