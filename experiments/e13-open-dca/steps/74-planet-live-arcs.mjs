// E13 step 74 (EXPLORATORY, PLAN.md Amendment S3 item 4): Planet's arcs of the live period, fitted directly under the common reference, NRLMSISE-00. Planet's states come from the archive
// and from the live collector (collect-planet.mjs: each day's final file); an arc is two consecutive states of one Dove 20-28 h apart, read through the orbital energy exactly as the
// splits' arcs are (arcs.mjs energyArc, profile g24lean, Cr*A/m locked), but with HPOP's NRLMSISE-00 drag on the indices as released when the new state's file was published (about
// 22:50 UTC of its day): GFZ's Kp/ap/F10.7 and NOAA SWPC's RSGA through harness/cutoff-environment.mjs releasedSpwRows, which is how the Starlink pairs' Method B reads them. The
// Doves are the 48 of the splits' sample (planet-sample.json). Derived records only (planet-arcs/live-<profile>.jsonl); Planet's files are never committed.
//
//   node steps/74-planet-live-arcs.mjs [--from 2026-10-09] [--to 2099-01-01] [--limit N] [--profile g24lean]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readRsga, releasedSpwRows } from '../../../harness/cutoff-environment.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { gitState } from '../../../harness/modules.mjs';
import { DAY, H, STORE, appendJsonl, config, configPath, amendmentsSha256, energyModulesDir, experimentDir, isoZ, modulesDir, paths, readJson, sha256, sleep } from '../common.mjs';
import { useCommonReferenceModules } from '../common-reference.mjs';
import { cycleEnv } from '../env.mjs';
import { arcsOf, readPlanetSeries } from '../planet-history.mjs';
import { readGfzKp } from '../vendor/full-force.mjs';

const { values } = parseArgs({ options: { from: { type: 'string', default: '2026-10-09' }, to: { type: 'string', default: '2099-01-01' }, limit: { type: 'string' }, profile: { type: 'string' } } });
useCommonReferenceModules();
const { openArcEnv } = await import('../arcs.mjs');
const P = config.planet, profile = values.profile ?? P.arc.profile;
const run = startRun({ experiment: config.experiment, step: '74-planet-live-arcs', configPath, modulesDir: modulesDir(), args: values });
run.addInputs('amendments', { 'amendments.json': amendmentsSha256 });
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

const sample = readJson(path.join(experimentDir, 'planet-sample.json'));
const hwids = [...sample.calibration, ...sample.heldOut];
const liveDir = path.join(STORE, 'planet-live');
const outFile = path.join(paths.planetArcs, `live-${profile}.jsonl`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.hwid}|${r.ttA}`; }) : []);

const series = readPlanetSeries({ extraDirs: [liveDir], fromDay: new Date(Date.parse(`${values.from}T00:00:00Z`) - 4 * DAY).toISOString().slice(0, 10) });
for (const f of fs.readdirSync(liveDir).filter((n) => /^planet_\d{8}\.states$/.test(n))) run.addInputs('planet-live', { [f]: sha256(fs.readFileSync(path.join(liveDir, f))) });
const jobs = [];
for (const hwid of hwids) for (const arc of arcsOf(series.get(hwid) ?? [], { minHours: P.arc.minHours, maxHours: P.arc.maxHours })) {
  const day = arc.a.epochTt.slice(0, 10);
  if (day >= values.from && day <= values.to) jobs.push({ hwid, ...arc });
}
jobs.sort((x, y) => x.a.ttMs - y.a.ttMs || x.hwid.localeCompare(y.hwid));
const mine = jobs.slice(0, values.limit ? Number(values.limit) : Infinity);
log(`live arcs ${values.from}..: ${hwids.length} Doves, ${jobs.length} arcs, ${mine.filter((j) => !done.has(`${j.hwid}|${j.a.ttMs}`)).length} left; profile ${profile}`);

// the indices as released: GFZ (the newest merged history + nowcast file) and SWPC's RSGA
const environment = cycleEnv().envConfig;
const gfz = readGfzKp(environment.gfzKp);
const rsga = readRsga([environment.swpcRsga].flat(), environment.rsgaCacheDir);
run.addInputs('gfz', { [path.basename(environment.gfzKp)]: gfz.sha256 });
let cutoffMs = 0, issue = null;
const env = await openArcEnv({ profile, atmosphere: 'NRLMSISE00', eopFinals: environment.eopFinals, spaceWeather: (fromMs, toMs) => { const r = releasedSpwRows(gfz, rsga, cutoffMs, fromMs, toMs); issue = r.issue; return r.rows; } });
for (const [family, files] of Object.entries(env.inputs)) if (family !== 'set') run.addInputs(family, files);
run.addModule({ ...env.modules['analysis/density-calibration'].provenance, checkout: energyModulesDir(), checkoutState: gitState(energyModulesDir()) });

const last = new Map();
let n = 0;
const started = performance.now();
for (const j of mine) {
  const key = `${j.hwid}|${j.a.ttMs}`;
  if (done.has(key)) continue;
  while (os.loadavg()[0] > config.compute.pauseAboveLoad1m) await sleep(60e3);
  try {
    const A = await env.toUtcGcrf(j.a), B = await env.toUtcGcrf(j.b);
    // the new state is known when its day's file is published, about 22:50 UTC (collect-planet.mjs); a state later than that is in the next day's file
    const dayStart = Math.floor(B.ms / DAY) * DAY;
    cutoffMs = dayStart + 22.85 * H;
    if (cutoffMs < B.ms) cutoffMs += DAY;
    const b0 = last.get(j.hwid) ?? (j.a.ballisticKgPerM2 > 0 ? 1 / j.a.ballisticKgPerM2 : P.arc.cdAreaOverMass0);
    const r = await env.energyArc(A, B, { b0, cr: P.arc.crAreaOverMass, sigma: P.arc.sigma, tolerance: 1e-3, maxIterations: 6 });
    if (r.B > 0) last.set(j.hwid, r.B);
    appendJsonl(outFile, { hwid: j.hwid, ttA: j.a.ttMs, ttB: j.b.ttMs, utcA: isoZ(A.ms), utcB: isoZ(B.ms), hours: j.hours, cdAreaOverMass: r.B, sigmaB: r.sigmaB, energyMismatchJkg: r.energyMismatchJkg, energySensitivity: r.energySensitivity,
      iterations: r.iterations, hpopCalls: r.hpopCalls, seconds: r.seconds, steps: r.steps, altitudeKm: r.altitudeKm, nonPositive: !!r.nonPositive, planetBallistic: { a: j.a.ballisticKgPerM2, b: j.b.ballisticKgPerM2 },
      profile, atmosphere: 'NRLMSISE00', crAreaOverMass: P.arc.crAreaOverMass, startedFrom: b0, cutoffUtc: isoZ(cutoffMs), spaceWeatherIssue: issue });
  } catch (error) {
    appendJsonl(outFile, { hwid: j.hwid, ttA: j.a.ttMs, ttB: j.b.ttMs, error: String(error.message ?? error).slice(0, 300), profile, atmosphere: 'NRLMSISE00' });
    log(`${j.hwid} ${isoZ(j.a.ttMs)}: ${String(error.message ?? error).slice(0, 160)}`);
  }
  if (++n % 10 === 0) log(`${n} arcs in ${((performance.now() - started) / 1000).toFixed(0)} s (${((performance.now() - started) / 1000 / n).toFixed(1)} s each); at ${isoZ(j.a.ttMs).slice(0, 10)}`);
}
log(`done: ${n} arcs`);
run.finish({ arcs: n, out: outFile });
await env.destroy();
