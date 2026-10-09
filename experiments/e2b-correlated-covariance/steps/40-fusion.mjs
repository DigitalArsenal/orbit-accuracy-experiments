#!/usr/bin/env node
// E2b step 40: fusion candidates against precise orbits (PLAN.md section 6).
// At each issue time T (00:00 UTC each day of the window) and object, the
// candidates are the object's three latest element sets usable at T (created
// and with epoch at or before T, E3's rule); each is propagated by SGP4 to the
// first precise-orbit epoch at or after T + h (common_epoch, origin the
// precise state). Rows: runs/<id>/fusion.jsonl.gz {regime, norad, issue, h,
// epoch, missing?, candidates: [[epoch, created, ageDays, rtn]] latest first}.
//
//   node experiments/e2b-correlated-covariance/steps/40-fusion.mjs --window train --regime GPS
import path from 'node:path';
import { json } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { cli, config, configPath, regimeObjects, regimeReference, windowSets, isoMs, loadGp, jsonlWriter, trim, DAY_MS } from '../common.mjs';

const { values, regimes, window, modules, archive, reference: referenceDir, objects: only } = cli();
const run = startRun({ experiment: config.experiment, step: `40-fusion-${window.name}-${regimes.join('+')}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await loadGp(modules, run);
const out = jsonlWriter(path.join(run.dir, 'fusion.jsonl.gz'));
const F = config.fusion, CHUNK = config.measurement.chunkDays;
const horizon = (Math.max(...F.horizonsDays) + 1) * DAY_MS;
const counts = {};
for (const name of regimes) {
  const regime = config.regimes[name];
  const reference = regimeReference(referenceDir, name);
  const objects = regimeObjects(referenceDir, name).filter((n) => !only || only.has(n));
  const { byObject, files } = windowSets(archive, referenceDir, window, objects);
  run.addInputs('gpHistory', files);
  const c = counts[name] = { objects: objects.length, issues: 0, targets: 0, missingTargets: 0, withoutCandidates: 0, calls: 0 };
  for (const norad of objects) {
    const sets = byObject.get(norad) ?? [];
    for (let chunk = window.lo; chunk < window.hi; chunk += CHUNK * DAY_MS) {
      const chunkEnd = Math.min(chunk + CHUNK * DAY_MS, window.hi);
      const targets = [], meta = [], members = new Map();
      for (let T = chunk + F.issueHourUtc * 3600000; T < chunkEnd; T += DAY_MS) {
        const usable = sets.filter((s) => s.ms <= T && s.createdMs <= T).sort((a, b) => b.ms - a.ms).slice(0, F.candidates);
        if (!usable.length) { ++c.withoutCandidates; continue; }
        ++c.issues;
        for (const s of usable) members.set(s.epoch, s);
        for (const h of F.horizonsDays) {
          const t = T + h * DAY_MS;
          targets.push({ norad, epoch: isoMs(t), afterSeconds: reference.stepAt(norad, t) ?? regime.samplingSeconds,
            sets: usable.map((s) => s.epoch), origin: 'reference' });
          meta.push({ T, h, usable });
        }
      }
      if (!targets.length) continue;
      c.targets += targets.length;
      const frames = reference.frames(norad, chunk, chunkEnd + horizon);
      if (!frames.length) { c.missingTargets += targets.length; continue; }
      const result = await gp.invokeJson('common_epoch', [ommFrame([...members.values()]), ...frames, json('options', { targets })], 'differences');
      ++c.calls;
      result.targets.forEach((r, k) => {
        const { T, h, usable } = meta[k];
        const row = { regime: name, norad, issue: isoMs(T), h, epoch: r.epoch };
        if (r.missing || !r.sets || r.sets.length !== usable.length) { row.missing = r.missing ?? 'candidate not propagated'; ++c.missingTargets; out.write(row); return; }
        row.candidates = usable.map((s, i) => [s.epoch, s.creationDate, Number(r.sets[i].ageDays.toPrecision(12)), trim(r.sets[i].rtn)]);
        out.write(row);
      });
      run.addInputs('reference', reference.read);
      reference.dropCache();
    }
  }
  log(`${name}: ${JSON.stringify(c)}`);
}
const rows = await out.close();
run.write('counts.json', counts);
run.finish({ counts, rows });
await gp.destroy();
log(`done: ${rows} rows`);
