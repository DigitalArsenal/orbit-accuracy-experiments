#!/usr/bin/env node
// E8 step 25: the DESTOPy cross-check (PLAN.md section 4, descriptive).
// DESTOPy (Gondelach and Linares; github.com/pengmun/DESTOPy, MIT) ran outside
// the product path, in a scratch environment, and wrote its density estimate at
// every 30 s sample of the held-out satellites over the validation window
// (CSV: utc_iso, unix_s, lat_deg, lon_deg, alt_km, rho_destopy[, rho_rom_prior]).
// This step scores those densities with E8's orbit-mean protocol beside D0
// and D5a (a step 10 validation analysis run), on the same samples.
//
//   node .../25-destopy.mjs --dir DESTOPY_OUT --analysis RUN
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { sha256 } from '../../../harness/modules.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { config, configPath, DAY_MS, dayMs, gfzDays, HOUR_MS, isoDay, loadModules, maxKp, modulesDir, readRun, regimeOf, runConfigHash, setIndices, windowSpans } from '../common.mjs';
import { samples } from '../../e5-density-calibration/densities.mjs';
import { analysisCorrection } from '../correction.mjs';
import { definitiveRows, jb2008, orbitMeans } from '../density-eval.mjs';

const { values } = parseArgs({ options: { dir: { type: 'string' }, analysis: { type: 'string' }, modules: { type: 'string' } } });
const [span] = windowSpans('validation');
const run = startRun({ experiment: config.experiment, step: '25-destopy-validation', configPath, modulesDir: modulesDir(values.modules), args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const { loaded } = await loadModules(run, ['analysis/density-calibration'], values);
const dc = loaded['analysis/density-calibration'];
run.addInputs('set', setIndices().sha256);
run.addInputs('gfz', { kp: gfzDays().sha256 });
const fit = readRun(values.analysis, 'estimates.json');
if (fit.window !== 'validation' || fit.mode !== 'analysis') throw new Error(`${values.analysis} is not a validation analysis run`);
run.addInputs('estimates', { [values.analysis]: runConfigHash(values.analysis) });
const tag = `D5a-K${fit.perBin}-${fit.structure}`;
const runInfo = fs.existsSync(path.join(values.dir, 'run.json')) ? JSON.parse(fs.readFileSync(path.join(values.dir, 'run.json'), 'utf8')) : null;

const rows = [];
for (const { target } of config.density.heldOut['2026']) {
  const file = path.join(values.dir, `densities-${target}.csv.gz`);
  if (!fs.existsSync(file)) { log(`${target}: no DESTOPy file`); continue; }
  const raw = fs.readFileSync(file);
  run.addInputs('destopy', { [path.basename(file)]: sha256(raw) });
  const lines = zlib.gunzipSync(raw).toString('utf8').trim().split('\n');
  const head = lines[0].split(',');
  const col = Object.fromEntries(head.map((c, i) => [c.trim(), i]));
  const byTime = new Map(), prior = new Map();
  for (const line of lines.slice(1)) {
    const v = line.split(',');
    const t = Math.round(Number(v[col.unix_s]) * 1000);
    byTime.set(t, Number(v[col.rho_destopy]));
    if (col.rho_rom_prior !== undefined) prior.set(t, Number(v[col.rho_rom_prior]));
  }
  const from = dayMs(span.from), to = dayMs(span.to) + 7 * DAY_MS;
  const s = samples(target, from - 2 * HOUR_MS, to + 2 * HOUR_MS, (name, hash) => run.addInputs('densities', { [name]: hash }));
  const models = { D0: await jb2008(dc, s, null, definitiveRows), [tag]: await jb2008(dc, s, analysisCorrection(fit.spans[0].fits[0]), definitiveRows),
    DESTOPy: s.t.map((t) => byTime.get(t) ?? null) };
  if (prior.size) models['DESTOPy prior'] = s.t.map((t) => prior.get(t) ?? null);
  const periodS = config.density.orbitAverage.periodSeconds[target];
  for (const m of orbitMeans(s, models, periodS, from, to)) {
    const kp = maxKp(m.s - 3 * HOUR_MS, m.s + 1);
    for (const [variant, v] of Object.entries(m.models)) rows.push({ target, s: m.s, day: isoDay(m.s), kp, regime: regimeOf(kp), variant, lnRatio: Math.log(m.obs / v) });
  }
  log(`${target}: ${byTime.size} DESTOPy samples, ${rows.filter((r) => r.target === target && r.variant === 'DESTOPy').length} orbit means`);
}
run.write('density-rows.json', { window: 'validation', destopy: runInfo, analysis: values.analysis, rows });
run.finish({ rows: rows.length });
log('done');
