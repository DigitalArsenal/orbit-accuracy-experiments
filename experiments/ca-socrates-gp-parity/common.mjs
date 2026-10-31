// ca-socrates-gp-parity: paths, the frozen-plan guard, the pinned module, the SOCRATES report and the GP catalog.
// Modules compute; this file moves bytes, parses text and counts. No orbit mechanics here: the only arithmetic
// on times is UTC text to Julian date and TCA minus SOCRATES's days since epoch (both time bookkeeping).
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
export const DAY_S = 86400;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const importFile = (file) => import(pathToFileURL(file).href);
const gitIn = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
// The git store of this repository: the checkout, or EXPERIMENTS_GIT when the run works in a snapshot outside it.
export const gitStore = (...args) => gitIn(process.env.EXPERIMENTS_GIT ?? repo, ...args);

// The files that define a registered run; report.mjs only reads a run's outputs.
export const RUN_SOURCES = ['PLAN.md', 'config.json', 'config.a2.json', 'config.a3.json', 'common.mjs', 'screen.mjs', 'worker.mjs', 'compare.mjs'];

// Amendment A2 (PLAN.md): Parts 1 and 2 again on another pinned CA artifact; nothing else changes.
export const a2 = JSON.parse(fs.readFileSync(path.join(here, 'config.a2.json'), 'utf8'));
// Amendment A3 (PLAN.md): Parts 1 and 2 again, then Part 3, on the build to publish.
export const a3 = JSON.parse(fs.readFileSync(path.join(here, 'config.a3.json'), 'utf8'));
export function modulePin(amendment) {
  if (amendment == null) return config.module;
  if (amendment === 'A2') return a2.module;
  if (amendment === 'A3') return a3.module;
  throw new Error(`unknown amendment ${amendment}`);
}

// Registration is machine-enforced: the plan, configuration and run sources equal their content at the registration
// commit (Amendment A3), and that commit is on origin, before a registered run screens the SOCRATES window or reads its events.
export function frozenPlan() {
  if (config.frozen !== true) throw new Error('config.json is not frozen; refusing the registered window');
  const ref = a3.registration.ref;
  const experimentCommit = gitStore('rev-parse', `refs/remotes/origin/${ref}`).toString().trim();
  const onOrigin = gitStore('ls-remote', 'origin', `refs/heads/${ref}`).toString().split(/\s/)[0];
  if (onOrigin !== experimentCommit) throw new Error(`origin ${ref} is ${onOrigin}, not ${experimentCommit}; push the registration first`);
  const sourceHashes = {};
  for (const file of RUN_SOURCES) sourceHashes[file] = sha256(registeredFile(experimentCommit, file));
  const planCommit = gitStore('log', '-1', '--format=%H', experimentCommit, '--', `experiments/${id}/PLAN.md`).toString().trim();
  return { planCommit, sourceHashes, experimentCommit };
}
// This folder's file, which must equal its content at the registration commit.
export function registeredFile(commit, file) {
  const rel = `experiments/${id}/${file}`;
  const bytes = fs.readFileSync(path.join(here, file));
  let committed;
  try { committed = gitStore('show', `${commit}:${rel}`); } catch { throw new Error(`${rel} is not in the registration ${commit}`); }
  if (!committed.equals(bytes)) throw new Error(`${rel} differs from the registration ${commit}`);
  return bytes;
}

// ---- the modules checkout, pinned by commit -----------------------------------------------------------------

export function modulesRoot(flag) {
  const root = path.resolve(flag ?? process.env.SDN_MODULES_ROOT ?? path.join(repo, '../../main-packages/space-data-network-modules'));
  if (!fs.existsSync(path.join(root, 'analysis/conjunction-assessment'))) throw new Error(`not a space-data-network-modules checkout: ${root}`);
  return root;
}

// The artifact is read with git show at the registered commit, never from the working tree, and its SHA-256 must be the
// registered one. The host helpers come from git archive at that commit into workDir/modules (no clone, no worktree), with the
// checkout's installed packages linked read-only: later commits or uncommitted work in the shared checkout cannot change what
// runs. The helpers' hashes and the packages' versions must be the registered ones.
export function pinnedTree(checkout, root, commit, tree) {
  fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(path.join(root, tree))) {
    execFileSync('tar', ['-x', '-C', root], { input: gitIn(checkout, 'archive', commit, tree), maxBuffer: 256 << 20 });
    fs.symlinkSync(path.join(checkout, tree, 'node_modules'), path.join(root, tree, 'node_modules'));
  }
  return root;
}
export function pinnedModule(checkout, workDir, pin = config.module) {
  const m = pin;
  const wasm = gitIn(checkout, 'show', `${m.commit}:${m.wasmPath}`);
  if (sha256(wasm) !== m.wasmSha256) throw new Error(`${m.wasmPath} at ${m.commit} is ${sha256(wasm)}, not ${m.wasmSha256}`);
  const root = pinnedTree(checkout, path.join(workDir, 'modules'), m.commit, 'analysis/conjunction-assessment');
  for (const [rel, hash] of Object.entries(m.hostFiles)) {
    if (sha256(fs.readFileSync(path.join(root, rel))) !== hash) throw new Error(`${rel} at ${m.commit} is not the registered file`);
  }
  const file = path.join(workDir, 'conjunction-assessment.module.wasm');
  fs.writeFileSync(file, wasm);
  const ca = path.join(root, 'analysis/conjunction-assessment');
  const packages = Object.fromEntries(['space-data-module-sdk', 'spacedatastandards.org', 'flatbuffers', 'flatc-wasm']
    .map((p) => [p, JSON.parse(fs.readFileSync(path.join(ca, 'node_modules', p, 'package.json'), 'utf8')).version]));
  for (const [p, v] of Object.entries(m.packages)) if (packages[p] !== v) throw new Error(`${p} is ${packages[p]}, registered ${v}`);
  return { file, wasmSha256: m.wasmSha256, commit: m.commit, packages, root };
}

// ---- the excluded port -----------------------------------------------------------------------------------------

// The console arm's own record of an object propagator/sgp4 could not sample over the span (the console skips it).
export const NOT_SAMPLED = 'propagator/sgp4 could not sample it over the window';

// One record of the module's `excluded` port, read from its COMMENT, the contract of CA 0.13.0 and later (the module's
// README, "Objects screened in part or excluded"). The port lists an object screened in part as well as one excluded, so
// a listed object is not an excluded object. A COMMENT of no known form stops the run: it is never read as an exclusion.
const ISO = '(\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z)';
const COVERAGE = `COVERAGE_START=${ISO}; COVERAGE_END=${ISO}$`;
const coverage = (m) => ({ coverageStart: m[1], coverageEnd: m[2] });
const FORMS = [
  ['refused-from-start', new RegExp(`^Excluded from conjunction screening; SGP4 refuses it from the window start\\. LAST_VALID=NONE; FIRST_REFUSAL=${ISO}; REFUSAL=([\\s\\S]+)$`), (m) => ({ firstRefusal: m[1], refusal: m[2] })],
  ['refused-part-way', new RegExp(`^Screened until LAST_VALID; SGP4 refuses it from FIRST_REFUSAL\\. LAST_VALID=${ISO}; FIRST_REFUSAL=${ISO}; REFUSAL=([\\s\\S]+)$`), (m) => ({ lastValid: m[1], firstRefusal: m[2], refusal: m[3] })],
  ['no-coverage', new RegExp(`^Excluded from conjunction screening; its trajectory does not cover the window\\. ${COVERAGE}`), coverage],
  ['coverage-ends', new RegExp(`^Screened until COVERAGE_END; its trajectory ends inside the window\\. ${COVERAGE}`), coverage],
  ['coverage-starts', new RegExp(`^Screened from COVERAGE_START; its trajectory starts inside the window\\. ${COVERAGE}`), coverage],
  ['coverage-part', new RegExp(`^Screened from COVERAGE_START until COVERAGE_END; its trajectory covers part of the window\\. ${COVERAGE}`), coverage],
];
export function parseListing(comment) {
  if (comment === NOT_SAMPLED) return { form: 'not-sampled' };
  for (const [form, pattern, fields] of FORMS) {
    const m = pattern.exec(comment ?? '');
    if (m) return { form, ...fields(m) };
  }
  throw new Error(`an excluded record of no known form: ${comment}`);
}

// Whether the listing says its object was not screened at this Julian date, inside the listing's own call. Before
// LAST_VALID (or inside its coverage) the object was screened.
export function notScreenedAt(listing, jd) {
  const ms = (jd - 2440587.5) * DAY_S * 1000;
  switch (listing.form) {
    case 'refused-part-way': return ms >= Date.parse(listing.firstRefusal);
    case 'coverage-ends': case 'coverage-starts': case 'coverage-part': return ms < Date.parse(listing.coverageStart) || ms > Date.parse(listing.coverageEnd);
    default: return true;
  }
}
export const listingWords = (l) => ({
  'refused-from-start': `SGP4 refuses it from the call's start (${l.refusal})`,
  'refused-part-way': `SGP4 refuses it from ${l.firstRefusal} (${l.refusal})`,
  'no-coverage': 'its trajectory does not cover the call',
  'coverage-ends': `its trajectory ends at ${l.coverageEnd}`, 'coverage-starts': `its trajectory starts at ${l.coverageStart}`, 'coverage-part': `its trajectory covers ${l.coverageStart} to ${l.coverageEnd}`,
  'not-sampled': 'the console path could not sample it over the span',
}[l.form]);

// ---- time bookkeeping -----------------------------------------------------------------------------------------

export const utcMs = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
export const msToJd = (ms) => ms / (DAY_S * 1000) + 2440587.5;
export const jdToIso = (jd) => new Date(Math.round((jd - 2440587.5) * DAY_S * 1000)).toISOString();

// ---- the SOCRATES report --------------------------------------------------------------------------------------

// RFC 4180 rows with a header; SOCRATES quotes names that hold commas.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const statusOf = (name) => /\[(.)\]\s*$/.exec(name)?.[1] ?? null;
const baseName = (name) => name.replace(/\s*\[.\]\s*$/, '');

// Every row: the pair as SOCRATES lists it (object 1 is the active payload), TCA (UTC, ms), range (km, 3 decimals),
// relative speed (km/s, 3 decimals), MAX_PROB, DILUTION (km), and each object's days since epoch (3 decimals).
export function readSocrates() {
  const s = config.socrates;
  const bytes = fs.readFileSync(s.file);
  if (sha256(bytes) !== s.sha256) throw new Error(`SOCRATES report changed: ${s.file}`);
  const [header, ...body] = parseCsv(bytes.toString('utf8'));
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const h of ['NORAD_CAT_ID_1', 'OBJECT_NAME_1', 'DSE_1', 'NORAD_CAT_ID_2', 'OBJECT_NAME_2', 'DSE_2', 'TCA', 'TCA_RANGE', 'TCA_RELATIVE_SPEED', 'MAX_PROB', 'DILUTION']) {
    if (!(h in col)) throw new Error(`SOCRATES report lacks ${h}`);
  }
  const rows = body.map((r, i) => {
    const tcaMs = utcMs(r[col.TCA]);
    return {
      i, a: Number(r[col.NORAD_CAT_ID_1]), aName: baseName(r[col.OBJECT_NAME_1]), aStatus: statusOf(r[col.OBJECT_NAME_1]), aDse: Number(r[col.DSE_1]),
      b: Number(r[col.NORAD_CAT_ID_2]), bName: baseName(r[col.OBJECT_NAME_2]), bStatus: statusOf(r[col.OBJECT_NAME_2]), bDse: Number(r[col.DSE_2]),
      tcaText: r[col.TCA], tcaMs, tcaJd: msToJd(tcaMs), rangeM: Number(r[col.TCA_RANGE]) * 1000, speedMS: Number(r[col.TCA_RELATIVE_SPEED]) * 1000,
      maxProb: Number(r[col.MAX_PROB]), dilutionM: Number(r[col.DILUTION]) * 1000,
    };
  });
  if (rows.length !== s.rows) throw new Error(`SOCRATES report has ${rows.length} rows, not ${s.rows}`);
  return rows;
}

// CelesTrak's SATCAT (fetched the day after the run): ops status and object type, for the population rules.
export function readSatcat() {
  const s = config.satcat;
  const bytes = fs.readFileSync(s.file);
  if (sha256(bytes) !== s.sha256) throw new Error(`SATCAT changed: ${s.file}`);
  const [header, ...body] = parseCsv(bytes.toString('utf8'));
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const out = new Map();
  for (const r of body) out.set(Number(r[col.NORAD_CAT_ID]), { name: r[col.OBJECT_NAME], type: r[col.OBJECT_TYPE], status: r[col.OPS_STATUS_CODE] || null, decay: r[col.DECAY_DATE] || null });
  return out;
}

// ---- the GP catalog -------------------------------------------------------------------------------------------

// Space-Track's current gp snapshot taken 10 minutes after the window start, with every element set created after
// the registered cut replaced by that object's registered earlier edition (read from the gp_history file that
// holds it, by GP_ID). An object with no edition at or before the cut would be dropped; none is registered.
export function readCatalog() {
  const c = config.catalog;
  const gz = fs.readFileSync(path.join(c.archiveRoot, c.snapshot));
  if (sha256(gz) !== c.snapshotSha256) throw new Error(`snapshot changed: ${c.snapshot}`);
  const json = zlib.gunzipSync(gz);
  if (sha256(json) !== c.snapshotJsonSha256) throw new Error('snapshot JSON hash differs');
  const snapshot = JSON.parse(json);
  if (snapshot.length !== c.snapshotRecords) throw new Error(`snapshot has ${snapshot.length} records, not ${c.snapshotRecords}`);
  const late = snapshot.filter((g) => g.CREATION_DATE > c.cutUtc).map((g) => String(g.NORAD_CAT_ID)).sort();
  const registered = Object.keys(c.replacements).sort();
  if (JSON.stringify(late) !== JSON.stringify(registered)) throw new Error(`records created after the cut are ${late.join(',')}, registered ${registered.join(',')}`);
  const byFile = new Map();
  for (const [norad, r] of Object.entries(c.replacements)) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push([norad, r]);
  }
  const replacement = new Map();
  for (const [file, list] of byFile) {
    const gzh = fs.readFileSync(path.join(c.archiveRoot, file));
    if (sha256(gzh) !== list[0][1].fileSha256) throw new Error(`gp_history file changed: ${file}`);
    const records = JSON.parse(zlib.gunzipSync(gzh));
    for (const [norad, r] of list) {
      const g = records.find((x) => String(x.GP_ID) === r.gpId && String(x.NORAD_CAT_ID) === norad);
      if (!g || !(g.CREATION_DATE <= c.cutUtc)) throw new Error(`replacement ${r.gpId} for ${norad} not found at or before the cut in ${file}`);
      replacement.set(norad, g);
    }
  }
  const rows = snapshot.map((g) => replacement.get(String(g.NORAD_CAT_ID)) ?? g);
  return { rows, replaced: [...replacement.keys()].map(Number) };
}

// One SDS $OMM per object from the provider's fields as delivered (strings to numbers, nothing else).
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

// ---- editions -----------------------------------------------------------------------------------------------

// An object's edition matches when every SOCRATES row naming it gives TCA minus the catalog epoch within the
// rounding of SOCRATES's three decimals (0.0005 d, plus 1 ms of TCA text) of its days since epoch.
export function editionClasses(reportRows, catalogRows) {
  const epochJd = new Map(catalogRows.map((g) => [Number(g.NORAD_CAT_ID), msToJd(utcMs(g.EPOCH))]));
  const seen = new Map();
  for (const r of reportRows) {
    for (const [n, dse] of [[r.a, r.aDse], [r.b, r.bDse]]) {
      if (!seen.has(n)) seen.set(n, { rows: 0, maxDeltaDays: 0, absent: !epochJd.has(n) });
      const o = seen.get(n);
      o.rows++;
      if (!o.absent) o.maxDeltaDays = Math.max(o.maxDeltaDays, Math.abs((r.tcaJd - epochJd.get(n)) - dse));
    }
  }
  const tol = config.editions.dseToleranceDays;
  const matched = new Set(), mismatched = new Map(), absent = new Set();
  for (const [n, o] of seen) {
    if (o.absent) absent.add(n);
    else if (o.maxDeltaDays <= tol) matched.add(n);
    else mismatched.set(n, o.maxDeltaDays);
  }
  return { objects: seen.size, matched, mismatched, absent };
}
