// ca-screen-recall: paths, the frozen-plan guard, the element-set snapshot and the subset rule.
// Modules compute; this file moves bytes and counts. No orbit mechanics here.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
export const a2 = JSON.parse(fs.readFileSync(path.join(here, 'config.a2.json'), 'utf8'));
export const id = config.id;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
// The git store of this repository: the checkout, or EXPERIMENTS_GIT when the run works in a snapshot outside it.
export const git = (...args) => execFileSync('git', ['-C', process.env.EXPERIMENTS_GIT ?? repo, ...args], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
export const importFile = (file) => import(pathToFileURL(file).href);
export const DAY_S = 86400;

// The files that define a registered run. Everything else in this folder (report, verify) is read-only on the run.
export const RUN_SOURCES = ['PLAN.md', 'config.json', 'config.a2.json', 'common.mjs', 'access.mjs', 'reference.mjs', 'compare.mjs', 'run.mjs'];

// The modules checkout: --modules, then SDN_MODULES_ROOT, then its place in the stack.
export function modulesRoot(flag) {
  const root = path.resolve(flag ?? process.env.SDN_MODULES_ROOT ?? path.join(repo, '../../main-packages/space-data-network-modules'));
  if (!fs.existsSync(path.join(root, 'analysis/conjunction-assessment')) || !fs.existsSync(path.join(root, 'propagator/sgp4'))) {
    throw new Error(`not a space-data-network-modules checkout: ${root} (pass --modules or set SDN_MODULES_ROOT)`);
  }
  return root;
}

// The modules, pinned by commit (Amendment A2: each module at its own). Artifacts and manifests are read with `git show`
// and checked against their registered SHA-256; the helper sources the run imports come from `git archive` at the same
// commit into workDir, with the checkout's installed packages linked read-only, so its working tree is never read.
const PINS = a2.modules.pins;
const moduleOf = (rel) => {
  const key = Object.keys(PINS).find((m) => rel.startsWith(`${m}/`));
  if (!key) throw new Error(`${rel} is in no pinned module`);
  return key;
};
export function pinnedModules(checkout, workDir) {
  const run = (...args) => execFileSync('git', ['-C', checkout, ...args], { maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  const show = (rel) => run('show', `${PINS[moduleOf(rel)].commit}:${rel}`);
  const root = path.join(workDir, 'modules');
  fs.mkdirSync(root, { recursive: true });
  const artifacts = {};
  for (const [tree, pin] of Object.entries(PINS)) {
    const rel = `${tree}/${pin.artifact}`;
    if (sha256(show(rel)) !== pin.sha256) throw new Error(`${rel} at ${pin.commit} has another SHA-256 than registered`);
    artifacts[rel] = pin.sha256;
    if (!fs.existsSync(path.join(root, tree))) {
      execFileSync('tar', ['-x', '-C', root], { input: run('archive', pin.commit, tree), maxBuffer: 256 << 20 });
      fs.symlinkSync(path.join(checkout, tree, 'node_modules'), path.join(root, tree, 'node_modules'));
    }
  }
  const artifact = (rel) => {
    const bytes = show(rel);
    if (sha256(bytes) !== artifacts[rel]) throw new Error(`${rel} has another SHA-256 than registered`);
    return bytes;
  };
  const head = (() => { try { return { commit: run('rev-parse', 'HEAD').toString().trim(), dirty: run('status', '--porcelain', '--untracked-files=no').length > 0 }; } catch { return null; } })();
  return { root, pins: PINS, artifacts, show, artifact, head };
}

// Registration is machine-enforced: the plan, configuration and run sources must equal their content at the registration
// commit (Amendment A2), and that commit must be on origin, before a registered run reads the element sets.
export function frozenPlan() {
  if (config.frozen !== true) throw new Error('config.json is not frozen; refusing to read the element sets');
  const ref = a2.registration.ref;
  const experimentCommit = git('rev-parse', `refs/remotes/origin/${ref}`).toString().trim();
  const onOrigin = git('ls-remote', 'origin', `refs/heads/${ref}`).toString().split(/\s/)[0];
  if (onOrigin !== experimentCommit) throw new Error(`origin ${ref} is ${onOrigin}, not ${experimentCommit}; push the registration first`);
  const sourceHashes = {};
  for (const file of RUN_SOURCES) {
    const rel = `experiments/${id}/${file}`;
    const bytes = fs.readFileSync(path.join(here, file));
    let committed;
    try { committed = git('show', `${experimentCommit}:${rel}`); } catch { throw new Error(`${rel} is not in the registration ${experimentCommit}`); }
    if (!committed.equals(bytes)) throw new Error(`${rel} differs from the registration ${experimentCommit}`);
    sourceHashes[file] = sha256(bytes);
  }
  const planCommit = git('log', '-1', '--format=%H', experimentCommit, '--', `experiments/${id}/PLAN.md`).toString().trim();
  return { planCommit, sourceHashes, experimentCommit };
}

export function readSnapshot(archiveRoot = config.data.archiveRoot) {
  const file = path.join(archiveRoot, config.data.snapshot);
  const gz = fs.readFileSync(file);
  if (sha256(gz) !== config.data.snapshotSha256) throw new Error(`snapshot changed: ${file}`);
  const json = zlib.gunzipSync(gz);
  if (sha256(json) !== config.data.snapshotJsonSha256) throw new Error('snapshot JSON hash differs');
  const rows = JSON.parse(json);
  if (rows.length !== config.data.snapshotRecords) throw new Error(`snapshot has ${rows.length} records, not ${config.data.snapshotRecords}`);
  return { file, rows, sha256: config.data.snapshotSha256 };
}

// The eligible LEO objects, ranked by SHA-256 of seed + ':' + NORAD_CAT_ID; the first `count` are the subset.
// Eligibility reads the provider's own OMM fields only.
export function selectSubset(rows, { seed, count }) {
  const sel = config.selection, startMs = Date.parse(config.window.startUtc);
  const eligible = rows.filter((r) => Object.entries(sel.require).every(([k, v]) => (v === null ? r[k] === null : r[k] === v))
    && Number(r.APOAPSIS) <= sel.apoapsisMaxKm && Number(r.PERIAPSIS) >= sel.periapsisMinKm
    && Date.parse(`${r.EPOCH}Z`) <= startMs && Date.parse(`${r.EPOCH}Z`) >= startMs - sel.epochMaxAgeDays * DAY_S * 1000);
  const ranked = eligible.map((r) => [sha256(`${seed}:${Number(r.NORAD_CAT_ID)}`), r]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (ranked.length < count) throw new Error(`only ${ranked.length} eligible objects for ${count}`);
  return { eligible: eligible.length, objects: ranked.slice(0, count).map(([, r]) => r) };
}

// One SDS $OMM per object, built once; the same bytes go to the screen and to the SGP4 module.
export function ommBytes(flatc, ommSchema, gp) {
  return flatc.generateBinary(ommSchema, JSON.stringify({
    CENTER_NAME: 'EARTH', REFERENCE_FRAME: { REFERENCE_FRAME_type: 'CelestialFrameWrapper', REFERENCE_FRAME: { frame: 'TEMEOFDATE' } },
    TIME_SYSTEM: 'UTC', OBJECT_NAME: gp.OBJECT_NAME, OBJECT_ID: gp.OBJECT_ID, EPOCH: gp.EPOCH,
    MEAN_MOTION: Number(gp.MEAN_MOTION), ECCENTRICITY: Number(gp.ECCENTRICITY), INCLINATION: Number(gp.INCLINATION),
    RA_OF_ASC_NODE: Number(gp.RA_OF_ASC_NODE), ARG_OF_PERICENTER: Number(gp.ARG_OF_PERICENTER), MEAN_ANOMALY: Number(gp.MEAN_ANOMALY),
    EPHEMERIS_TYPE: 'SGP4', CLASSIFICATION_TYPE: gp.CLASSIFICATION_TYPE, NORAD_CAT_ID: Number(gp.NORAD_CAT_ID),
    ELEMENT_SET_NO: Number(gp.ELEMENT_SET_NO), REV_AT_EPOCH: Number(gp.REV_AT_EPOCH), BSTAR: Number(gp.BSTAR),
    MEAN_MOTION_DOT: Number(gp.MEAN_MOTION_DOT), MEAN_MOTION_DDOT: Number(gp.MEAN_MOTION_DDOT),
  }), { sizePrefix: false });
}

export const jdAtOffset = (startJd, seconds) => startJd + seconds / DAY_S;
