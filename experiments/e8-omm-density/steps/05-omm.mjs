#!/usr/bin/env node
// E8 step 05: the element sets a window needs, cached on this machine
// (runs/cache/e8-omm/<window>.json.gz, never committed). For each window:
// the pool period (60 days before the first fit day S = first issue day - 30
// days) and the fit and scoring span (S to 8 days after the last issue day),
// of the coarse candidates (rocket bodies, debris, GCAT spheres, by their
// published perigee and eccentricity) and of every target. 2026 windows read
// Space-Track gp_history by creation day, keeping every published version with
// its CREATION_DATE; historical windows read the 1959-2022 per-object CSVs.
//
//   node experiments/e8-omm-density/steps/05-omm.mjs --window validation|test|historicalTest
import { parseArgs } from 'node:util';
import { startRun } from '../../../harness/provenance.mjs';
import { config, configPath, DAY_MS, dayMs, isHistorical, isoDay, modulesDir, windowSpans } from '../common.mjs';
import { gcat, historicalMembers, satcat, scanCreationDays, scanHistorical, writeCache } from '../omm.mjs';

const { values } = parseArgs({ options: { window: { type: 'string' }, modules: { type: 'string' } } });
const spans = windowSpans(values.window);
const run = startRun({ experiment: config.experiment, step: `05-omm-${values.window}`, configPath, modulesDir: modulesDir(values.modules), args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const historical = isHistorical(values.window);
const sats = satcat(), cat = gcat();
run.addInputs('catalogs', { satcat: sats.sha256, gcat: cat.sha256 });
const spheres = new Set([...cat.map].filter(([, g]) => g.shape === 'Sphere' && g.mass && g.diameter).map(([n]) => n));
const targets = new Set(historical ? Object.keys(config.pool.exclude.historical).map(Number) : Object.keys(config.propagation.targets).map(Number));
const p = config.pool, d = config.decay;

for (const [k, span] of spans.entries()) {
  const S = dayMs(span.from) - d.fitLeadDays * DAY_MS, from = S - p.preWindowDays * DAY_MS, to = dayMs(span.to) + d.scoreDays * DAY_MS;
  const files = {};
  let objects;
  if (!historical) {
    const keep = (norad, g) => targets.has(norad) || ((p.objectTypes.includes(g.OBJECT_TYPE) || spheres.has(norad)) && +g.PERIAPSIS >= 200 && +g.PERIAPSIS < 1100 && +g.ECCENTRICITY < 0.2);
    objects = scanCreationDays(isoDay(from - DAY_MS), isoDay(to + 3 * DAY_MS), keep, files);
    for (const o of objects.values()) o.rows = o.rows.filter((r) => r[0] >= from && r[0] < to);
  } else {
    // Objects in orbit at the pool period's start, launched a year before S.
    const members = historicalMembers();
    const norads = [...sats.map].filter(([n, s]) => members.has(n) && (targets.has(n) || ((p.objectTypes.includes(s.type) || spheres.has(n))
      && s.launch && dayMs(s.launch) <= S - p.minimumAgeDays * DAY_MS && (!s.decay || dayMs(s.decay) > from)))).map(([n]) => n);
    log(`${span.from}: ${norads.length} catalogued candidates in orbit`);
    objects = await scanHistorical(norads, from, to, files);
    for (const o of objects.values()) Object.assign(o, { type: sats.map.get(o.norad)?.type ?? null, launch: sats.map.get(o.norad)?.launch ?? null });
  }
  const name = `${values.window}-${k}`;
  const file = writeCache(name, objects, files);
  run.addInputs('elementSetFiles', files);
  log(`${name} ${span.from}..${span.to}: ${objects.size} objects, ${[...objects.values()].reduce((a, o) => a + o.rows.length, 0)} sets -> ${file}`);
}
run.finish();
log('done');
