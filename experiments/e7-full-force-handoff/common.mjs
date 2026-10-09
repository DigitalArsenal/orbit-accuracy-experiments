// Shared by E7's steps: configuration, the window lock, element sets, truth,
// the environment inputs and the modules. Bookkeeping only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { loadModule, modulesRoot, sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { kernelFrame } from '../../harness/prw.mjs';
import { c04Records, eopFrame } from '../../harness/eop.mjs';
import { readElementSets, epochMs, shiftDay } from '../../harness/gp-archive.mjs';
import { jb2008Frame, jb2008Rows, readGfzKp, readSetIndices, spaceWeatherFrame, spwRows } from '../../harness/full-force.mjs';
import { Products } from '../e3-combined-catalog/truth.mjs';
import { estimationCodec } from '../e2-catalog-covariance/estimation-wire.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;
export const isoUtc = (ms) => new Date(ms).toISOString().replace('Z', '');

// The test window stays locked until PLAN.md and config.json are frozen by a
// commit: `frozen` must be true and both files committed and unchanged here.
// Returns the freeze commit for the test window, null otherwise.
export function assertWindowReadable(name) {
  if (name !== 'test') return null;
  if (config.frozen !== true) throw new Error('the test window is locked until config.json is frozen (PLAN.md section 8)');
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error('the test window is locked: PLAN.md or config.json differs from its committed state');
  const commit = git('log', '-1', '--format=%H', '--', path.relative(repoRoot, configPath));
  if (!commit) throw new Error('the test window is locked: config.json is not committed');
  return commit;
}

export function cli(extra = {}) {
  const { values } = parseArgs({
    options: {
      window: { type: 'string', default: 'dev' },
      modules: { type: 'string' },
      archive: { type: 'string' },
      reference: { type: 'string' },
      regimes: { type: 'string' },
      ...extra,
    },
  });
  const window = config.windows[values.window];
  if (!window) throw new Error(`unknown window ${values.window}; one of ${Object.keys(config.windows).join(', ')}`);
  const freezeCommit = assertWindowReadable(values.window);
  return {
    values,
    freezeCommit,
    window: { name: values.window, from: window[0], to: window[1] },
    modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
    reference: path.resolve(values.reference ?? process.env.SDN_REFERENCE_STATES ?? config.inputs.reference),
    regimes: values.regimes ? values.regimes.split(',') : Object.keys(config.regimes),
  };
}

// Truth for each regime (analysis/reference-states output) and its objects.
export function regimeTruth(referenceDir, names) {
  const out = {};
  for (const name of names) {
    const regime = config.regimes[name];
    const products = new Products(referenceDir, regime.truthPrefixes);
    const objects = regime.objects
      ? Object.keys(regime.objects).map(Number).filter((n) => products.entries(n).length)
      : products.objects().filter((n) => products.entries(n).some((e) => e.comment.includes(regime.select)));
    out[name] = { regime, products, objects: objects.sort((a, b) => a - b) };
  }
  return out;
}

// Element sets with epochs in [from - margin, to + 8 d] for the objects,
// cached in runs/cache (element sets never leave this machine).
export function windowSets(archive, window, objects, marginDays) {
  const from = shiftDay(window.from, -marginDays), to = shiftDay(window.to, 1);
  const key = sha256(Buffer.from(JSON.stringify({ from, to, objects: [...objects].sort((a, b) => a - b), e: config.elementSets }))).slice(0, 16);
  const file = path.join(repoRoot, 'runs', 'cache', `e7-sets-${window.name}-${key}.json.gz`);
  if (fs.existsSync(file)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const read = readElementSets(archive, from, to, {
    keep: (n) => objects.has(n), theory: config.elementSets.meanElementTheory, ephemerisType: config.elementSets.ephemerisType,
    duplicateEpochSeconds: config.elementSets.duplicateEpochSeconds, lagDays: config.elementSets.creationLagDays,
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({ sets: read.sets, files: read.files, duplicates: read.duplicates })));
  return { sets: read.sets, files: read.files, duplicates: read.duplicates };
}

// The samples of a window: for each object of a regime and each product time
// (window start + k * stride, 00:00 UTC), the object's latest element set with
// its epoch at or before that time and no more than sampleMaxAgeDays older.
// Targets: the first truth state at or after epoch + h, within the tolerance.
export function schedule(window, truthByRegime, setsByObject) {
  const samples = [];
  const lo = Date.parse(`${window.from}T00:00:00Z`), hi = Date.parse(`${window.to}T00:00:00Z`);
  const tol = config.targetToleranceSeconds * 1000;
  for (const [name, { regime, products, objects }] of Object.entries(truthByRegime)) {
    const stride = regime.strideDays[window.name];
    for (const norad of objects) {
      const mine = setsByObject.get(norad) ?? [];
      const used = new Set();
      for (let t = lo; t <= hi; t += stride * DAY_MS) {
        const k = mine.findLastIndex((s) => s.epochMs <= t);
        if (k < 0 || t - mine[k].epochMs > config.sampleMaxAgeDays * DAY_MS || used.has(mine[k].gpId)) continue;
        used.add(mine[k].gpId);
        const set = mine[k];
        const targets = config.horizonsHours.map((h) => {
          const s = products.firstAtOrAfter(norad, set.epochMs + h * HOUR_MS, tol);
          return s ? { h, ms: s.ms, epoch: s.epoch, r: s.r, v: s.v, file: s.entry.file } : { h, missing: true };
        });
        samples.push({ regime: name, norad, scheduled: isoUtc(t), gpId: set.gpId, epoch: set.epoch, epochMs: set.epochMs, index: k, targets });
      }
      products.dropCache();
    }
  }
  return samples;
}

export function setsByObjectOf(sets) {
  const out = new Map();
  for (const s of sets) {
    s.epochMs = epochMs(s.epoch);
    if (!out.has(s.norad)) out.set(s.norad, []);
    out.get(s.norad).push(s);
  }
  for (const list of out.values()) list.sort((a, b) => a.epochMs - b.epochMs);
  return out;
}

// Coefficients of an object for H-epoch: Cr*A/m nominal (m^2/kg), or for GPS
// blocks with a published box-wing that model at the SINEX mass (`gnss`, a
// readGpsMetadata result); Cd*A/m by rule.
export function coefficients(regimeName, norad, set, bRule, gnss = null) {
  const p = config.physical;
  const o = regimeName === 'GPS' ? p.GPS : p[String(norad)];
  const sphereArea = o.diameterM ? Math.PI * (o.diameterM / 2) ** 2 : null;
  const agom = o.cr * (o.srpAreaM2 ?? o.areaM2 ?? sphereArea) / o.massKg;
  const nominalB = p.cd * (o.dragAreaM2 ?? sphereArea ?? 0) / o.massKg;
  const bstarB = Math.max(0, set.elements.BSTAR) * config.bstar.toCdAreaOverMass;
  const meta = regimeName === 'GPS' && gnss ? gnss.at(norad, set.epochMs) : null;
  const boxWing = meta?.boxWing && meta.massKg ? { block: meta.boxWing, massKg: meta.massKg } : null;
  return { agom, b: bRule === 'nominal' ? nominalB : bstarB, nominalB, bstarB, ...(boxWing ? { boxWing } : {}), ...(meta ? { gpsBlock: meta.block } : {}) };
}

// Modules and fixed environment inputs.
export async function context(modules, run, { estimation = false } = {}) {
  const kernelPath = path.join(repoRoot, config.inputs.kernel.path);
  if (!fs.existsSync(kernelPath)) throw new Error(`DE440s kernel missing: fetch ${config.inputs.kernel.url} to ${config.inputs.kernel.path}`);
  const kernelBytes = fs.readFileSync(kernelPath);
  if (sha256(kernelBytes) !== config.inputs.kernel.sha256) throw new Error('DE440s kernel bytes differ from the pinned SHA-256');
  run.addInputs('kernel', { [path.basename(kernelPath)]: config.inputs.kernel.sha256 });
  const names = ['analysis/epoch-state', 'analysis/gp-error-model', 'propagator/hpop', 'data-source/eop-parser', 'foundation/frames', ...(estimation ? ['analysis/estimation'] : [])];
  const loaded = {};
  for (const name of names) { loaded[name] = await loadModule(modules, name); run.addModule(loaded[name].provenance); }
  const eop = await c04Records(loaded['data-source/eop-parser'], config.inputs.eopC04);
  run.addInputs('eop', { [path.basename(config.inputs.eopC04)]: eop.sha256 });
  const set = readSetIndices(config.inputs.solfsmy, config.inputs.dtcfile);
  run.addInputs('jb2008', { 'SOLFSMY.TXT': set.sha256.solfsmy, 'DTCFILE.TXT': set.sha256.dtcfile });
  const gfz = readGfzKp(config.inputs.gfzKp);
  run.addInputs('spaceWeather', { [path.basename(config.inputs.gfzKp)]: gfz.sha256 });
  const kernel = kernelFrame(kernelBytes);
  const codec = estimation ? await estimationCodec(modules, path.join(repoRoot, 'node_modules/space-data-module-sdk/schemas/orbpro')) : null;
  const mjd = (ms) => Math.floor(ms / DAY_MS) + 40587;
  return {
    ...Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k.split('/')[1], v])),
    codec,
    // The environment frames for a propagation over [fromMs, toMs]; drivers
    // persist after persistFromMs when given (JB2008 only).
    inputsFor(fromMs, toMs, forces, persistFromMs = null) {
      const frames = [kernel, eopFrame(eop.records, mjd(fromMs) - 2, mjd(toMs) + 2)];
      if (forces.drag && forces.atmosphere === 'JB2008') frames.push(jb2008Frame(jb2008Rows(set, fromMs - 6 * DAY_MS, toMs + 2 * DAY_MS, persistFromMs)));
      if (forces.drag && forces.atmosphere === 'NRLMSISE00') frames.push(spaceWeatherFrame(spwRows(gfz, fromMs - 2 * DAY_MS, toMs + 2 * DAY_MS)));
      return frames;
    },
    async destroy() { for (const m of Object.values(loaded)) await m.destroy(); },
  };
}
