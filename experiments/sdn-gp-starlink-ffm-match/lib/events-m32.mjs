// Amendment A12b, M31 and M32 on synthetic FFM-1 batches with a known parent state (lib/m32-truth.mjs): per object the fits of 6, 12 and 24 h from the first file's start (SDN-AP alone, SDN-AP with the
// `launch_set` set as prior, SGP4, SGP4-XP), `launch_set` alone, and the batch-joint fit `launch_batch` of the whole batch, all scored on days 1 to 3 after the fit end against the object's FFM-1 truth. Rows: source m32.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../common.mjs';
import { scoreWindow, fitSdngp, sdngpHeldOut } from './baselines.mjs';
import { launchSet, launchBatch, lamBytes } from './sdngp-events.mjs';
import { M32_DIR, BATCHES, batchObjectsOf, PARENT, EPOCH0, FIRST_FILE_H } from './m32-truth.mjs';
import { slice, iso, ms, DAY } from './windows.mjs';
import { oemBytes } from './sds.mjs';
import { transformState } from './frames.mjs';

export const M32_FIT_HOURS = [6, 12, 24];
const LEAD = config.windows.leadDays;

const lamOf = (index) => lamBytes({ epochUtc: index.parent.epochUtc ?? EPOCH0, aM: index.parent.aKm * 1000, eccentricity: index.parent.e, inclinationDeg: index.parent.iDeg, raanDeg: index.parent.raanDeg, argPeriapsisDeg: 0, argLatitudeDeg: index.parent.argLatitudeDeg, frame: 'GCRF' });
const minStates = (stepS = 60) => Math.floor((config.windows.minimumCoverage * 86400) / stepS);

/** `only`: batch ids to score (default all four). */
export async function scoreBatches({ b, sink, only = null }) {
  for (const batch of BATCHES) {
    if (only && !only.includes(batch.id)) continue;
    const indexFile = path.join(M32_DIR, batch.id, 'index.json');
    if (!fs.existsSync(indexFile)) continue;
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const objects = await batchObjectsOf(index);
    const first = ms(index.firstUtc);
    const lam = lamOf(index);
    // launch_set alone: the parent's set, the same for every object of the batch, days 1 to 3 after the first file's start (no fit)
    const ls = await launchSet(b.sdngp, { launch: lam });
    for (const o of objects) {
      if (!sink.mine()) continue;
      const key = `m32|${o.object.id}|${iso(first)}|0`;
      if (sink.has(key)) continue;
      const base = { source: 'm32', id: o.object.id, batch: batch.id, k: o.k, norad: o.object.norad, startUtc: iso(first), fitSeconds: 0, sigmaMS: index.sigmaMS, trueBEff: o.record.cdAm, trueDvMS: o.record.dvMS, build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
      if (!ls.ok) { sink.append({ ...base, kind: 'launch-set', ok: false, error: ls.error }); continue; }
      const lines = slice(o.object, first, first + 4 * DAY);
      const held = await sdngpHeldOut(b, o.object, lines, first, LEAD, minStates(), { omm: ls.omm, unpacked: ls.unpacked });
      sink.append({ ...base, kind: 'launch-set', ok: !held.error, ...(held.error ? { error: held.error } : { days: held.days }), epoch: ls.unpacked.EPOCH, bEff: Number(ls.unpacked.USER_DEFINED_PARAMETERS?.find((p) => /B_EFF$/.test(p.PARAM_NAME) && !/SIGMA/.test(p.PARAM_NAME))?.PARAM_VALUE ?? NaN) });
    }
    // `launch_batch` reads TEME ephemerides: the first 24 h of every object, converted once (foundation/frames), cut per fit length below
    let teme = null;
    const temeBlocks = async (stopFit) => {
      teme ??= await Promise.all(objects.map(async (o) => { const lines = []; for (const l of slice(o.object, first, first + Math.max(...M32_FIT_HOURS) * 3600e3)) { const t = await transformState(b.frames, 'GCRF', 'TEME', l.epoch, [...l.r, ...l.v]); lines.push({ epoch: l.epoch, ms: ms(l.epoch), r: t.slice(0, 3), v: t.slice(3, 6) }); } return lines; }));
      return teme.map((all, i) => { const lines = all.filter((l) => l.ms <= stopFit); return oemBytes({ originator: 'G1 A12b', block: { frame: 'TEMEOFDATE', frameName: 'TEME', timeSystem: 'UTC', object: { name: objects[i].object.name, id: '', norad: objects[i].object.norad }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch, useableStart: lines[0].epoch, useableStop: lines.at(-1).epoch }, sizePrefixed: false }); });
    };
    for (const hours of M32_FIT_HOURS) {
      const stopFit = first + hours * 3600e3;
      // per object: SDN-AP, SGP4, SGP4-XP (the G1 windows at this fit length), and SDN-AP with the launch set as prior
      for (const o of objects) {
        if (!sink.mine()) continue;
        const base = { batch: batch.id, k: o.k, hours, sigmaMS: index.sigmaMS, trueBEff: o.record.cdAm, trueDvMS: o.record.dvMS };
        if (!sink.has(`m32|${o.object.id}|${iso(first)}|${hours * 3600}`)) {
          const row = await scoreWindow(b, o.object, first, { fitSeconds: hours * 3600, leadDays: LEAD, minCoverage: config.windows.minimumCoverage, arms: 'both', sdngp: true });
          if (row) sink.append({ ...row, source: 'm32', kind: 'object', ...base });
        }
        const priorKey = `m32|${o.object.id}+prior|${iso(first)}|${hours * 3600}`;
        if (ls.ok && !sink.has(priorKey)) {
          const lines = slice(o.object, first, stopFit + 4 * DAY);
          const fit = await fitSdngp(b, o.object, lines, first, stopFit, LEAD, minStates(), { prior: ls.omm });
          sink.append({ source: 'm32', id: `${o.object.id}+prior`, norad: o.object.norad, startUtc: iso(first), fitSeconds: hours * 3600, kind: 'object-prior', sdngp: fit, ...base });
        }
      }
      // the batch-joint fit
      const jointKey = `m32|${batch.id}+joint|${iso(first)}|${hours * 3600}`;
      if (sink.mine() && !sink.has(jointKey)) {
        const t = performance.now();
        const joint = await launchBatch(b.sdngp, { oems: await temeBlocks(stopFit), launch: lam, weatherTable: b.weatherTable });
        const row = { source: 'm32', id: `${batch.id}+joint`, batch: batch.id, kind: 'batch-joint', startUtc: iso(first), fitSeconds: hours * 3600, hours, sigmaMS: index.sigmaMS, objects: objects.length, ms: performance.now() - t, build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
        if (!joint.ok) { sink.append({ ...row, ok: false, error: joint.error }); continue; }
        const scored = [];
        for (const [i, set] of joint.sets.entries()) {
          const o = objects[i];
          if (!o) { scored.push({ index: i, extra: true }); continue; }
          const lines = slice(o.object, first, stopFit + 4 * DAY);
          const held = await sdngpHeldOut(b, o.object, lines, stopFit, LEAD, minStates(), { omm: set.omm, unpacked: set.unpacked });
          const param = (re) => Number(set.unpacked.USER_DEFINED_PARAMETERS?.find((p) => re.test(p.PARAM_NAME))?.PARAM_VALUE ?? NaN);
          scored.push({ k: o.k, ...(held.error ? { error: held.error } : { days: held.days }), bEff: param(/B_EFF$/), name: set.unpacked.OBJECT_NAME ?? null, norad: set.unpacked.NORAD_CAT_ID ?? null, epoch: set.unpacked.EPOCH });
        }
        sink.append({ ...row, ok: true, sets: joint.sets.length, scored });
      }
    }
  }
}
