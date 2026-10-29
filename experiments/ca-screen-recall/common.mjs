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
export const id = config.id;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const git = (...args) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
export const importFile = (file) => import(pathToFileURL(file).href);
export const DAY_S = 86400;

// The files that define a registered run. Everything else in this folder (report, verify) is read-only on the run.
export const RUN_SOURCES = ['PLAN.md', 'config.json', 'common.mjs', 'access.mjs', 'reference.mjs', 'compare.mjs', 'run.mjs'];

// The modules checkout: --modules, then SDN_MODULES_ROOT, then its place in the stack.
export function modulesRoot(flag) {
  const root = path.resolve(flag ?? process.env.SDN_MODULES_ROOT ?? path.join(repo, '../../main-packages/space-data-network-modules'));
  if (!fs.existsSync(path.join(root, 'analysis/conjunction-assessment')) || !fs.existsSync(path.join(root, 'propagator/sgp4'))) {
    throw new Error(`not a space-data-network-modules checkout: ${root} (pass --modules or set SDN_MODULES_ROOT)`);
  }
  return root;
}

// The modules, pinned by commit. Artifacts and manifests are read with `git show` from the pinned commit and checked
// against their registered SHA-256; the working tree's build outputs are never read. The helper sources the run imports
// (test libraries, not build outputs) must equal the commit's.
export function pinnedModules(root) {
  const pin = config.modules, run = (...args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  try { run('cat-file', '-e', `${pin.commit}^{commit}`); } catch { throw new Error(`modules commit ${pin.commit} is not in ${root}`); }
  try { run('diff', '--quiet', pin.commit, '--', ...pin.sources); } catch { throw new Error(`${pin.sources.join(', ')} differ from modules commit ${pin.commit}`); }
  const show = (rel) => run('show', `${pin.commit}:${rel}`);
  const artifact = (rel) => {
    const bytes = show(rel);
    if (sha256(bytes) !== pin.artifacts[rel]) throw new Error(`${rel} at ${pin.commit} has another SHA-256 than registered`);
    return bytes;
  };
  const head = (() => { try { return { commit: run('rev-parse', 'HEAD').toString().trim(), dirty: run('status', '--porcelain', '--untracked-files=no').length > 0 }; } catch { return null; } })();
  return { commit: pin.commit, artifacts: pin.artifacts, show, artifact, head };
}

// Registration is machine-enforced: the plan, configuration and run sources must equal their committed content,
// and the plan's commit must be on origin/main, before a registered run reads the element sets.
export function frozenPlan() {
  if (config.frozen !== true) throw new Error('config.json is not frozen; refusing to read the element sets');
  const sourceHashes = {};
  for (const file of RUN_SOURCES) {
    const rel = `experiments/${id}/${file}`;
    const bytes = fs.readFileSync(path.join(here, file));
    let committed;
    try { committed = git('show', `HEAD:${rel}`); } catch { throw new Error(`${rel} is not committed`); }
    if (!committed.equals(bytes)) throw new Error(`${rel} differs from HEAD; commit it before the run`);
    sourceHashes[file] = sha256(bytes);
  }
  const planCommit = git('log', '-1', '--format=%H', '--', `experiments/${id}/PLAN.md`).toString().trim();
  try { git('merge-base', '--is-ancestor', planCommit, 'origin/main'); } catch { throw new Error(`plan commit ${planCommit} is not on origin/main; push PLAN.md first`); }
  return { planCommit, sourceHashes, experimentCommit: git('rev-parse', 'HEAD').toString().trim() };
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
