// Shared by E7v2's steps: configuration (handed to E7's helpers, which E7v2
// reuses), the window lock, element sets, the environment inputs at an
// information cutoff, and the per-class coefficient and force rules.
// Bookkeeping only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { loadModule, modulesRoot, sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { PRW_TYPE, kernelFrame } from '../../harness/prw.mjs';
import { c04Records, finalsRecords } from '../../harness/eop.mjs';
import { readElementSets, epochMs, shiftDay } from '../../harness/gp-archive.mjs';
import { jb2008Frame, jb2008Rows, readGfzKp, readSetIndices, spaceWeatherFrame } from '../../harness/full-force.mjs';
import { readRsga, releasedEopRecords, releasedJb2008Rows, releasedSpwRows } from '../../harness/cutoff-environment.mjs';
import { estimationCodec } from '../e2-catalog-covariance/estimation-wire.mjs';
import { configure } from '../e7-full-force-handoff/common.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
// E7's helpers (methods, debias, maneuvers, correlation, e1, analysis) read
// their settings from this configuration, which keeps E7's keys.
configure(config);
export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;
export const isoUtc = (ms) => new Date(ms).toISOString().replace('Z', '');
export const utcMs = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);

// A locked window (test, confirm) stays closed until PLAN.md and config.json
// are frozen by a commit: `frozen` true and both files committed and
// unchanged here. Returns the freeze commit for a locked window, else null.
export function assertWindowReadable(name) {
  if (!config.lockedWindows.includes(name)) return null;
  if (config.frozen !== true) throw new Error(`the ${name} window is locked until config.json is frozen (PLAN.md section 4)`);
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`the ${name} window is locked: PLAN.md or config.json differs from its committed state`);
  const commit = git('log', '-1', '--format=%H', '--', path.relative(repoRoot, configPath));
  if (!commit) throw new Error(`the ${name} window is locked: config.json is not committed`);
  return commit;
}

export function cli(extra = {}) {
  const { values } = parseArgs({
    options: {
      window: { type: 'string', default: 'dev' },
      modules: { type: 'string' },
      archive: { type: 'string' },
      classes: { type: 'string' },
      ...extra,
    },
  });
  const window = config.windows[values.window];
  if (!window) throw new Error(`unknown window ${values.window}; one of ${Object.keys(config.windows).join(', ')}`);
  const freezeCommit = assertWindowReadable(values.window);
  return {
    values,
    freezeCommit,
    window: { name: values.window, from: window[0], to: window[1], selectionDate: config.selectionDates[values.window] },
    modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
    references: config.inputs.references,
    classes: values.classes ? values.classes.split(',') : Object.keys(config.classes),
  };
}

export const classOf = (name) => {
  const c = config.classes[name];
  if (!c) throw new Error(`unknown class ${name}`);
  return c;
};

// Element sets with epochs in [from - marginDays, to + afterDays] for the
// objects, cached in runs/cache (element sets never leave this machine).
export function windowSets(archive, window, objects, marginDays, afterDays = 9) {
  const from = shiftDay(window.from, -marginDays), to = shiftDay(window.to, afterDays);
  const key = sha256(Buffer.from(JSON.stringify({ from, to, objects: [...objects].sort((a, b) => a - b), e: config.elementSets }))).slice(0, 16);
  const file = path.join(repoRoot, 'runs', 'cache', `e7v2-sets-${window.name}-${key}.json.gz`);
  if (fs.existsSync(file)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const read = readElementSets(archive, from, to, {
    keep: (n) => objects.has(n), theory: config.elementSets.meanElementTheory, ephemerisType: config.elementSets.ephemerisType,
    duplicateEpochSeconds: config.elementSets.duplicateEpochSeconds, lagDays: config.elementSets.creationLagDays,
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = { sets: read.sets, files: read.files, duplicates: read.duplicates };
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(out)));
  return out;
}

export function setsByObjectOf(sets) {
  const out = new Map();
  for (const s of sets) {
    s.epochMs = epochMs(s.epoch);
    s.createdMs = utcMs(s.creationDate);
    if (!out.has(s.norad)) out.set(s.norad, []);
    out.get(s.norad).push(s);
  }
  for (const list of out.values()) list.sort((a, b) => a.epochMs - b.epochMs);
  return out;
}

// Cd*A/m from an OMM's B* (negative taken as 0).
export const bstarB = (set) => Math.max(0, set.elements.BSTAR) * config.bstar.toCdAreaOverMass;

// The fixed coefficients of an object (PLAN.md section 6): {agom (Cr*A/m),
// b (Cd*A/m, the a priori B0), boxWing?}. gnss: readGnssMetadata output.
export function coefficients(className, norad, set, gnss = null) {
  const c = classOf(className);
  const p = config.physical;
  const bFromBstar = bstarB(set);
  const o = p[c.srp.physicalKey ?? String(norad)];
  const sphereArea = o?.diameterM ? Math.PI * (o.diameterM / 2) ** 2 : null;
  const nominalB = o ? p.cd * (o.dragAreaM2 ?? sphereArea ?? 0) / o.massKg : null;
  const b = c.bRule === 'nominal' && nominalB !== null ? nominalB : bFromBstar;
  let agom;
  if (c.srp.model === 'physical' || c.srp.physicalKey) agom = o.cr * (o.srpAreaM2 ?? o.areaM2 ?? sphereArea) / o.massKg;
  else if (c.srp.model === 'cannonball-from-b') agom = c.srp.ratio * b;
  else if (c.srp.agomBySystem) agom = c.srp.agomBySystem[gnss?.at(norad, set.epochMs)?.svn?.[0]] ?? Object.values(c.srp.agomBySystem)[0];
  else agom = c.srp.agom;
  const out = { agom, b, bstarB: bFromBstar, nominalB };
  if (c.srp.model === 'boxwing-or-cannonball' && gnss) {
    const meta = gnss.at(norad, set.epochMs);
    if (meta?.boxWing && meta.massKg) out.boxWing = { block: meta.boxWing, massKg: meta.massKg };
  }
  return out;
}

// The force configuration of a product: the class's, with the product's
// atmosphere (NRLMSISE-00 with released drivers, or JB2008 for the DCA
// stand-in).
export function forcesOf(className, spec) {
  const f = classOf(className).forces;
  if (!f.drag) return { ...f };
  return { ...f, atmosphere: spec.atmosphere === 'JB2008-DCA' ? 'JB2008' : config.drivers.operationalAtmosphere };
}

// Fails fast unless the propagator and estimator are the binaries the plan names.
export function assertBinaries(loaded) {
  const want = config.modulesBinary;
  const hpop = loaded['propagator/hpop'].provenance.wasmSha256;
  if (hpop !== want.hpopWasmSha256) throw new Error(`propagator/hpop WASM ${hpop} is not the binary config.json names (${want.hpopWasmSha256})`);
  const est = loaded['analysis/estimation']?.provenance.wasmSha256;
  if (est && est !== want.estimationWasmSha256) throw new Error(`analysis/estimation WASM ${est} is not the binary config.json names (${want.estimationWasmSha256})`);
}

// Modules and the environment inputs. EOP: C04 rows, then finals2000A rows
// after C04's last day.
export async function context(modules, run, { estimation = false, maneuvers = false } = {}) {
  const kernelPath = path.join(repoRoot, config.inputs.kernel.path);
  if (!fs.existsSync(kernelPath)) throw new Error(`DE440s kernel missing: fetch ${config.inputs.kernel.url} to ${config.inputs.kernel.path}`);
  const kernelBytes = fs.readFileSync(kernelPath);
  if (sha256(kernelBytes) !== config.inputs.kernel.sha256) throw new Error('DE440s kernel bytes differ from the pinned SHA-256');
  run.addInputs('kernel', { [path.basename(kernelPath)]: config.inputs.kernel.sha256 });
  const names = ['analysis/epoch-state', 'analysis/gp-error-model', 'propagator/hpop', 'data-source/eop-parser', 'foundation/frames',
    ...(estimation ? ['analysis/estimation'] : []), ...(maneuvers ? ['analysis/maneuver-detection'] : [])];
  const loaded = {};
  for (const name of names) { loaded[name] = await loadModule(modules, name); run.addModule(loaded[name].provenance); }
  assertBinaries(loaded);
  const c04 = await c04Records(loaded['data-source/eop-parser'], config.inputs.eopC04);
  const finals = await finalsRecords(loaded['data-source/eop-parser'], config.inputs.eopFinals);
  const lastC04 = Math.max(...c04.records.map((r) => r.mjd));
  const eop = { records: [...c04.records, ...finals.records.filter((r) => r.mjd > lastC04)].sort((a, b) => a.mjd - b.mjd) };
  run.addInputs('eop', { [path.basename(config.inputs.eopC04)]: c04.sha256, [path.basename(config.inputs.eopFinals)]: finals.sha256 });
  const set = readSetIndices(config.inputs.solfsmy, config.inputs.dtcfile);
  run.addInputs('jb2008', { 'SOLFSMY.TXT': set.sha256.solfsmy, 'DTCFILE.TXT': set.sha256.dtcfile });
  const gfz = readGfzKp(config.inputs.gfzKp);
  run.addInputs('spaceWeather', { [path.basename(config.inputs.gfzKp)]: gfz.sha256 });
  const rsga = readRsga(config.inputs.swpcRsga, path.join(repoRoot, 'runs', 'cache', 'rsga'));
  run.addInputs('swpcRsga', rsga.files);
  const kernel = kernelFrame(kernelBytes);
  const codec = estimation ? await estimationCodec(modules, path.join(repoRoot, 'node_modules/space-data-module-sdk/schemas/orbpro')) : null;
  const mjd = (ms) => Math.floor(ms / DAY_MS) + 40587;
  const c = config.cutoff;
  const eopFrame = (records) => {
    const b = new fb.Builder(1 << 16);
    P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { EARTH_ORIENTATION: Object.assign(new P.PRWEarthOrientationT(), { ROWS: records.map((r) => r.row) }) }).pack(b));
    return { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: b.asUint8Array().slice() };
  };
  return {
    ...Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k.split('/')[1], v])),
    codec,
    // The environment frames for a propagation over [fromMs, toMs].
    // drivers 'released': what was public at cutoffMs (PLAN.md section 6);
    // request.dca {a00(tMs)}: JB2008 with SET's drivers to the day before the
    // cutoff, then held, plus E5's a00 (PLAN.md section 7).
    inputsFor(fromMs, toMs, forces, { drivers, cutoffMs, dca = null }) {
      if (drivers !== 'released') throw new Error(`unknown drivers ${drivers}`);
      const from = mjd(fromMs) - 2, to = mjd(toMs) + 2;
      const frames = [kernel, eopFrame(releasedEopRecords(eop.records, cutoffMs, c.eopLatencyDays, from, to))];
      if (forces.drag && forces.atmosphere === 'JB2008') {
        if (!dca) throw new Error('JB2008 runs only as the DCA stand-in here');
        const a = fromMs - 6 * DAY_MS, b = toMs + 2 * DAY_MS;
        const rows = releasedJb2008Rows(jb2008Rows, set, a, b, cutoffMs, config.dca.driverLatencyDays);
        frames.push(jb2008Frame(rows.map((r) => {
          const day = Date.parse(`${r.DATE}T00:00:00Z`);
          return { ...r, DTC_HOURLY_K: r.DTC_HOURLY_K.map((v, h) => v + dca.a00(day + h * HOUR_MS)) };
        })));
      }
      if (forces.drag && forces.atmosphere === 'NRLMSISE00') {
        const a = fromMs - 2 * DAY_MS, b = toMs + 2 * DAY_MS;
        frames.push(spaceWeatherFrame(releasedSpwRows(gfz, rsga, cutoffMs, a, b).rows));
      }
      return frames;
    },
    async destroy() { for (const m of Object.values(loaded)) await m.destroy(); },
  };
}

