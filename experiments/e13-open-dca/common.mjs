// Shared by E13's steps and its collector: configuration, the derived store's
// paths, small file helpers and the logger. No orbit computation lives here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { modulesRoot } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';

export const experimentDir = path.dirname(fileURLToPath(import.meta.url));
export const configPath = path.join(experimentDir, 'config.json');
export const amendmentsPath = path.join(experimentDir, 'amendments.json');
// config.json is frozen and never edited (AGENTS.md); the parameter values of PLAN.md's amendments are in amendments.json and are merged over it, in order.
const merge = (base, over) => {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base && base[k] !== null && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  return out;
};
const amendments = fs.existsSync(amendmentsPath) ? JSON.parse(fs.readFileSync(amendmentsPath, 'utf8')) : {};
export const config = Object.entries(amendments).filter(([k]) => /^[RS]\d+$/.test(k)).reduce((c, [, a]) => merge(c, a.overrides ?? {}), JSON.parse(fs.readFileSync(configPath, 'utf8')));
export const amendmentsSha256 = fs.existsSync(amendmentsPath) ? crypto.createHash('sha256').update(fs.readFileSync(amendmentsPath)).digest('hex') : null;

// Derived records only (owner rule: no raw operator ephemeris on disk); outside every repository.
export const STORE = process.env.E13_STORE ?? config.store;
export const paths = {
  records: path.join(STORE, 'records'),            // records/<norad>/<startUTC>.json: one head fit per file version
  index: path.join(STORE, 'index.jsonl'),          // one line per stored record
  polls: path.join(STORE, 'manifest-polls.jsonl'), // one line per manifest poll
  failures: path.join(STORE, 'failures.jsonl'),
  sample: path.join(STORE, 'sample.json'),
  status: path.join(STORE, 'collector.status.json'),
  pid: path.join(STORE, 'collector.pid'),
  log: path.join(STORE, 'collector.log'),
  stop: path.join(STORE, 'collector.stop'),
  inputs: path.join(STORE, 'inputs'),              // per-cycle merged space-weather inputs, kept for provenance
  guards: path.join(STORE, 'guards'),
  planetArcs: path.join(STORE, 'planet-arcs'),   // one JSONL per split and profile: the drag of every satellite-day
  pairs: path.join(STORE, 'pairs'),                // pairs/<norad>/<t1>.json: the mismatch between two consecutive versions of one satellite
  pairIndex: path.join(STORE, 'pairs.jsonl'),
};

export const H = 3600e3;
export const DAY = 86400e3;
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const isoZ = (ms) => new Date(ms).toISOString();
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const compactUtc = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

// The modules checkout is an absolute path in the configuration (the build E4 A6 and E11 pin); E13_MODULES or a flag overrides it.
export const modulesDir = (flag) => modulesRoot({ flag: flag ?? process.env.E13_MODULES ?? config.inputs.modules, configured: config.inputs.modules, repoRoot });

// The modules checkout that holds analysis/density-calibration with the orbital-energy methods (E13_ENERGY_MODULES or a flag overrides it).
export const energyModulesDir = (flag) => modulesRoot({ flag: flag ?? process.env.E13_ENERGY_MODULES ?? config.inputs.energyModules, configured: config.inputs.energyModules, repoRoot });

export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, file);
}
export function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}
export const stamp = () => new Date().toISOString().slice(11, 19);
export function logger(prefix = '') { return (message) => console.log(`${stamp()} ${prefix}${message}`); }

// The class assumption for the locked Cr*A/m (m^2/kg): an ASSUMPTION, not a measured value.
export const crAreaOverMassFor = (norad) => (norad < 56000 ? config.starlink.srpLock.norad_lt_56000_crAreaOverMass : config.starlink.srpLock.norad_ge_56000_crAreaOverMass);
