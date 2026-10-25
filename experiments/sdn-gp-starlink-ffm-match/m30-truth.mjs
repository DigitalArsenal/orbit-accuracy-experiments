// Amendment A11c, M30: the truth that has arrived for the lowering Starlinks: the last TIP message's DECAY_EPOCH (and its window) and the decay message of each object, from the archiver's snapshots, as of the
// newest snapshot in the archive. Results only (times); written to results/sdn-gp-starlink-ffm-match/m30-truth.json, which tables.mjs reads, so that the committed tables do not depend on the archive's changing files.
//   node experiments/sdn-gp-starlink-ffm-match/m30-truth.mjs
import fs from 'node:fs';
import path from 'node:path';
import { write, results } from './common.mjs';
import { readTip, readDecay, SPACETRACK } from './lib/spacetrack-local.mjs';
import { loweringSatellites } from './lib/events-m30.mjs';

const tip = readTip(), decay = readDecay();
const newest = fs.readdirSync(path.join(SPACETRACK, 'tip/2026')).filter((n) => n.endsWith('.json.gz')).sort().at(-1);
const objects = loweringSatellites().map((m) => {
  const k = String(m.norad), list = tip.get(k) ?? [], last = list.at(-1) ?? null, d = decay.get(k) ?? null;
  return { norad: m.norad, tipMessages: list.length, lastTipMsgUtc: last ? new Date(last.msgMs).toISOString() : null, lastTipDecayUtc: last ? new Date(last.decayMs).toISOString() : null, lastTipWindowMin: last?.windowMin ?? null, decayMessage: d?.final ?? null };
});
write(path.join(results, 'm30-truth.json'), { generatedFrom: "Space-Track TIP and decay snapshots of the local archive (results only: times), as of the newest snapshot", newestSnapshot: newest, objects });
console.log(newest, objects.filter((o) => o.tipMessages).length, 'of', objects.length, 'with a TIP message;', objects.filter((o) => o.decayMessage).length, 'with a decay message');
