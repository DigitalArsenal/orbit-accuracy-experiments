import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, options, newRun, finishRun, git, repo, sha } from './lib.mjs';

export function auditCa(opts) {
  const run = newRun('ca', opts);
  const source = (file, expected) => {
    const bytes = git(repo, 'show', `${config.ca.sourceCommit}:${file}`);
    if (sha(bytes) !== expected) throw new Error(`B2 source hash differs: ${file}`);
    run.manifest.inputs[file] = { commit: config.ca.sourceCommit, sha256: expected };
    return JSON.parse(bytes);
  };
  const originalConfig = source(config.ca.configPath, config.ca.configSha256);
  const table = source(config.ca.tablePath, config.ca.tableSha256);
  const m = originalConfig.a4.metrics;
  if (m.hardBodyRadiusM !== config.ca.hardBodyRadiusM || m.hitKm * 1000 !== config.ca.proximityRadiusM ||
      m.quietPc !== config.ca.quietPc || m.alertPc !== config.ca.alertPc) throw new Error('Endpoint parameters differ');
  const result = { exploratory: true, originalResultsUnchanged: true, hardBodyRadiusM: m.hardBodyRadiusM,
    proximityRadiusM: m.hitKm * 1000, quietPc: m.quietPc, alertPc: m.alertPc,
    groups: {}, checks: { registeredRatesReproduced: 0, sourceRows: 0 },
    historicalAccuracy: { moduleCommit: table.modulesCommit, wasmSha256: table.sdnapWasmSha256,
      rows: table.rows.filter((r) => ['iss', 'laser'].includes(r.id)).map((r) => ({ id: r.id, objects: r.objects,
        arms: Object.fromEntries(['ffm', 'sgp4xp'].map((arm) => [arm, r.arms[arm]])) })) },
    historicalCovarianceRealism: Object.fromEntries(['iss', 'laser'].map((group) => [group,
      Object.fromEntries(['ffm', 'sgp4xp'].map((arm) => [arm, table.ca[group].realism[arm]]))])),
    limitations: [
      'Post-hoc diagnostic of already-seen B2 outputs, not confirmatory evidence.',
      'Misses were log-uniform from 10 m to 10 km, with constructed geometry and reused orbital errors.',
      'No draws below 10 m: the collision stratum is only 10–20 m, not the full collision disk.',
      'One ISS and five laser objects; encounter counts are not independent-object counts.',
      'Conditional rates describe the selected synthetic population, not operational collision frequencies.',
      'Changing the event radius alone does not establish Pc calibration; population selection also matters.',
      'Covariance-realism failures remain independently of the event-definition mismatch.',
    ] };
  for (const [file, expected] of Object.entries(config.ca.files)) {
    const bytes = fs.readFileSync(path.join(opts.rows, file));
    if (sha(bytes) !== expected) throw new Error(`Archive input changed: ${file}`);
    run.manifest.inputs[file] = { sha256: expected };
    const [, group, cls] = file.split('.');
    const all = bytes.toString().trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const validPc = (p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;
    const rows = all.filter((r) => ['ffm', 'sgp4xp'].every((a) => validPc(r.arms?.[a]?.pc)));
    if (rows.some((r) => !Number.isFinite(r.trueMissM) || r.trueMissM < 0)) throw new Error('Invalid true miss');
    const item = { formed: all.length, paired: rows.length, excludedInvalidOrMissingPc: all.length - rows.length,
      primaryObjects: new Set(rows.map((r) => r.primaryObject)).size, reproduction: {}, strata: {},
      originalVerdict: table.ca[group].classes[cls].verdict };
    const bands = [
      ['inside-HBR', (x) => x < m.hardBodyRadiusM],
      ['HBR-to-200m', (x) => x >= m.hardBodyRadiusM && x < m.hitKm * 1000],
      ['200m-through-5km', (x) => x >= m.hitKm * 1000 && x <= config.ca.farM],
      ['above-5km', (x) => x > config.ca.farM],
    ];
    for (const [label, belongs] of bands) {
      const selected = rows.filter((r) => belongs(r.trueMissM));
      item.strata[label] = { denominator: selected.length, arms: {} };
      for (const arm of ['ffm', 'sgp4xp']) {
        const counts = { green: 0, yellow: 0, red: 0 };
        for (const r of selected) counts[r.arms[arm].pc < m.quietPc ? 'green' : r.arms[arm].pc >= m.alertPc ? 'red' : 'yellow']++;
        item.strata[label].arms[arm] = { ...counts,
          greenConditional: selected.length ? counts.green / selected.length : null,
          redConditional: selected.length ? counts.red / selected.length : null };
      }
    }
    for (const arm of ['ffm', 'sgp4xp']) {
      const inside = item.strata['inside-HBR'].arms[arm].green;
      const outside = item.strata['HBR-to-200m'].arms[arm].green;
      const published = table.ca[group].classes[cls].arms[arm].missedAlert.value;
      const reproduced = (inside + outside) / rows.length;
      if (Math.abs(reproduced - published) > 1e-15) throw new Error(`Registered rate differs: ${group}/${cls}/${arm}`);
      item.reproduction[arm] = { published, reproduced, denominator: rows.length,
        greenBelow200M: inside + outside, greenInsideHbr: inside, greenOutsideHbrBelow200M: outside,
        fractionOfProximityMissesOutsideHbr: inside + outside ? outside / (inside + outside) : null };
      result.checks.registeredRatesReproduced++;
    }
    if (Object.values(item.strata).reduce((n, s) => n + s.denominator, 0) !== rows.length) throw new Error('Strata do not partition input');
    result.groups[`${group}-${cls}`] = item;
    result.checks.sourceRows += all.length;
  }
  const output = finishRun(run, result, 'ca.json');
  console.log(JSON.stringify({ output, ...result.checks }));
  return { result, manifest: run.manifest, dir: run.dir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) auditCa(options());
