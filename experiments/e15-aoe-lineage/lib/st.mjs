// Space-Track element sets, read from gp_history by creation day exactly as E3 reads them (harness/gp-archive.mjs:
// SGP4 mean elements, ephemeris type 0, republished duplicates within 1 s merged and usable from the later creation).
// A set is usable at T when its CREATION_DATE and its EPOCH are at or before T (E3 and its amendment). Element sets never
// leave this machine.
import fs from 'node:fs';
import path from 'node:path';
import { readElementSets, epochMs } from '../../../harness/gp-archive.mjs';
import { PATHS } from '../settings.mjs';
import { config, shiftDay } from './windows.mjs';

// How far the archive's creation windows reach: the end of the newest file ("<from>--<to>.json.gz", or a whole day).
export function stReachesMs(archive = PATHS.gpHistory) {
  const years = fs.readdirSync(archive).filter((n) => /^\d{4}$/.test(n)).sort();
  const names = fs.readdirSync(path.join(archive, years.at(-1))).filter((n) => n.endsWith('.json.gz')).sort();
  let reach = -Infinity;
  for (const n of names.slice(-50)) {
    const m = /--(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z\.json\.gz$/.exec(n);
    const whole = /^(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(n);
    const end = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : whole ? Date.parse(`${whole[1]}T00:00:00Z`) + 86400000 : -Infinity;
    if (end > reach) reach = end;
  }
  return reach;
}

export class StCatalog {
  // Sets whose epoch lies in [fromDay - lookback, toDay], from the creation files up to toDay + creationLagDays.
  constructor(fromDay, toDay, { keep = () => true, archive = PATHS.gpHistory } = {}) {
    const s = config.sources.ST;
    const { sets, files, duplicates } = readElementSets(archive, shiftDay(fromDay, -s.lookbackDays), toDay, {
      keep, lagDays: s.creationLagDays, theory: s.meanElementTheory, ephemerisType: s.ephemerisType, duplicateEpochSeconds: s.duplicateEpochSeconds,
    });
    this.files = files;
    this.duplicates = duplicates;
    this.count = sets.length;
    this.byNorad = new Map();
    for (const x of sets) {
      const set = { source: 'ST', norad: x.norad, id: x.gpId, epoch: x.epoch, epochMs: epochMs(x.epoch), createdMs: epochMs(x.creationDate), creationDate: x.creationDate, elements: x.elements, objectId: x.objectId };
      if (!this.byNorad.has(set.norad)) this.byNorad.set(set.norad, []);
      this.byNorad.get(set.norad).push(set);
    }
    for (const list of this.byNorad.values()) list.sort((a, b) => a.epochMs - b.epochMs || a.createdMs - b.createdMs);
  }

  norads() { return [...this.byNorad.keys()]; }

  // The newest set created and with its epoch at or before T (latest epoch; ties: the later creation).
  latest(norad, T) {
    const list = this.byNorad.get(norad);
    if (!list) return null;
    let best = null;
    for (const s of list) {
      if (s.epochMs > T || s.createdMs > T) continue;
      if (!best || s.epochMs > best.epochMs || (s.epochMs === best.epochMs && s.createdMs > best.createdMs)) best = s;
    }
    return best;
  }

  // The newest creation time in the archive read (whether the archive reaches T).
  newestCreationMs() {
    let m = -Infinity;
    for (const list of this.byNorad.values()) for (const s of list) if (s.createdMs > m) m = s.createdMs;
    return m;
  }
}
