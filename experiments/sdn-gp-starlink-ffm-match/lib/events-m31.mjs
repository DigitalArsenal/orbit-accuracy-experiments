// Amendment A12b, M31 on the captured batch (the 27 satellites first seen 2026-10-24T05:01Z; provisional ids 799501701 to 799501727): fits of 6, 12 and 24 h from the first state of each satellite's file,
// held-out days 1 to 3 after the fit end inside the file's FFM-1 trajectory, SDN-AP beside SGP4 and SGP4-XP. These are the same-file windows of the G1 rows at the fit lengths of A12b; the scoring on newer files
// (A11c) is a later step. Rows: source m31.
import { config } from '../common.mjs';
import { scoreWindow } from './baselines.mjs';
import { batchObjects } from './m31-objects.mjs';
import { iso } from './windows.mjs';

export const M31_FIT_HOURS = [6, 12, 24];

export async function scoreCaptured({ b, sink, only = null }) {
  for (const { meta, object, t0 } of batchObjects()) {
    if (only && !only.includes(meta.norad)) continue;
    for (const hours of M31_FIT_HOURS) {
      if (!sink.mine()) continue;
      if (sink.has(`m31|${object.id}|${iso(t0)}|${hours * 3600}`)) continue;
      const row = await scoreWindow(b, object, t0, { fitSeconds: hours * 3600, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage, arms: 'both', sdngp: true });
      if (row) sink.append({ ...row, source: 'm31', kind: 'captured', hours });
    }
  }
}
