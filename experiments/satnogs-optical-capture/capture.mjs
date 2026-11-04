#!/usr/bin/env node
// capture.mjs: the SatNOGS Optical daily dumps into <ARCHIVE_ROOT>/hac/satnogs-optical.
// Astrometric RA/Dec measurements, TDM v2, tracks, IOD lines and station JSON from the network's public products
// host. Licence CC BY-SA 4.0; credit "SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0".
//
//   ARCHIVE_ROOT=/opt/data/sdn-archive node capture.mjs [--sessions 2026-11-03,2026-11-02]
//
// Reads products/index.json with If-None-Match. For each session whose manifest_sha256 is not yet captured it
// fetches manifest.json (sha256 must equal the index's manifest_sha256) and every product the manifest names
// (sha256 and bytes must equal the manifest), and writes
//   hac/satnogs-optical/session_date=<D>/generations/<generation_id>/{manifest.json, <products>}
// manifest.json is written last: a generation directory without it is incomplete and is redone. The newest two
// generations of a session are kept. One row per file in hac/satnogs-optical/provenance.jsonl.
// Requests go only to the host of INDEX_URL (default the products host). Never requested: /api/v1/elements,
// object residuals, the radio feed (hac/satnogs is not touched), CelesTrak, Space-Track. No login, no token.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = process.env.ARCHIVE_ROOT ?? '/opt/data/sdn-archive';
const INDEX_URL = process.env.INDEX_URL ?? 'https://pub-ace0a918977843e5a065d3239b3ae105.r2.dev/products/index.json';
const DIR = path.join(ROOT, 'hac', 'satnogs-optical');
const REL = 'hac/satnogs-optical';
const PROVENANCE = path.join(DIR, 'provenance.jsonl');
const ETAG_FILE = path.join(DIR, '.index-etag');
const KEEP_GENERATIONS = 2;
const LICENCE = 'CC-BY-SA-4.0';
const LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const CREDIT = 'SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0';
const AGENT = 'sdn-satnogs-optical-capture/1';
const SESSION = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const { values } = parseArgs({ options: { sessions: { type: 'string' } } });
const only = values.sessions ? new Set(values.sessions.split(',')) : null;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const origin = new URL(INDEX_URL).origin;

const curl = (args, timeoutS) => execFileSync('curl', ['-sS', '-f', '-m', String(timeoutS), '-A', AGENT, ...args], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
async function withRetry(label, fn) {
  try { return fn(); } catch (first) {
    console.error(`${label}: ${first.message.split('\n')[0]}; retry in 30 s`);
    await sleep(30000);
    return fn();
  }
}

// Index, conditional on the stored ETag.
fs.mkdirSync(DIR, { recursive: true });
const headersFile = path.join(DIR, '.index-headers.part');
const etag = fs.existsSync(ETAG_FILE) ? fs.readFileSync(ETAG_FILE, 'utf8').trim() : '';
const indexArgs = ['-D', headersFile, '-w', '\n%{http_code}', ...(etag && !only ? ['-H', `If-None-Match: ${etag}`] : []), INDEX_URL];
const raw = (await withRetry('index', () => curl(indexArgs, 120))).toString('utf8');
const code = raw.slice(raw.lastIndexOf('\n') + 1);
const newEtag = (fs.readFileSync(headersFile, 'utf8').match(/^etag:\s*(.+?)\s*$/im) ?? [])[1] ?? '';
fs.rmSync(headersFile);
const summary = { downloads: 0, bytes: 0, sessions_new: 0, sessions_skipped: 0, failed: 0, provenance_rows: 0, pruned_generations: 0 };
const finish = (note) => {
  console.log(`capture: ${JSON.stringify({ ...summary, note })}`);
  process.exit(summary.failed ? 1 : 0);
};
if (code === '304') finish('index unchanged');
const index = JSON.parse(raw.slice(0, raw.lastIndexOf('\n')));
if (index.licence?.spdx !== LICENCE || index.licence?.credit !== CREDIT) {
  console.error('licence block of the index changed; refusing to capture');
  summary.failed = 1;
  finish('licence changed');
}
const prefix = index.prefix;
if (!/^[a-z0-9_-]+$/.test(prefix)) throw new Error(`bad prefix ${prefix}`);

const generationsOf = (session) => {
  const dir = path.join(DIR, `session_date=${session}`, 'generations');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => HEX64.test(n)).map((n) => path.join(dir, n)) : [];
};

for (const entry of [...index.sessions].sort((a, b) => a.session.localeCompare(b.session))) {
  const { session } = entry;
  if (!SESSION.test(session) || (only && !only.has(session))) continue;
  const manifestRel = entry.manifest;
  const m = manifestRel.match(/^([a-z0-9_-]+)\/session_date=(\d{4}-\d{2}-\d{2})\/generations\/([0-9a-f]{64})\/manifest\.json$/);
  if (!m || m[1] !== prefix || m[2] !== session || !HEX64.test(entry.manifest_sha256)) {
    console.error(`${session}: index entry refused (manifest path or sha256 malformed)`);
    ++summary.failed;
    continue;
  }
  const genId = m[3];
  const genDir = path.join(DIR, `session_date=${session}`, 'generations', genId);
  const manifestFile = path.join(genDir, 'manifest.json');
  if (fs.existsSync(manifestFile) && sha256(fs.readFileSync(manifestFile)) === entry.manifest_sha256) {
    ++summary.sessions_skipped;
    continue;
  }
  try {
    const manifestUrl = `${origin}/${manifestRel}`;
    const manifestBytes = await withRetry(`${session} manifest`, () => curl([manifestUrl], 120));
    if (sha256(manifestBytes) !== entry.manifest_sha256) throw new Error(`manifest sha256 ${sha256(manifestBytes)} != index ${entry.manifest_sha256}`);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (manifest.generation_id !== genId || manifest.date !== session) throw new Error('manifest generation_id or date differs from its path');
    const rowsFor = [];
    const base = `session_date=${session}/generations/${genId}/`;
    fs.rmSync(genDir, { recursive: true, force: true }); // an incomplete earlier attempt
    for (const product of manifest.products) {
      if (!product.path.startsWith(base) || product.path.includes('..') || !HEX64.test(product.sha256)) throw new Error(`product path or sha256 refused: ${product.path}`);
      const target = path.join(DIR, product.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const url = `${origin}/${prefix}/${product.path}`;
      const retrieved = now();
      await withRetry(product.path, () => curl(['-o', `${target}.part`, url], 900));
      const bytes = fs.readFileSync(`${target}.part`);
      if (bytes.length !== product.bytes) throw new Error(`${product.path}: ${bytes.length} bytes, manifest ${product.bytes}`);
      if (sha256(bytes) !== product.sha256) throw new Error(`${product.path}: sha256 differs from the manifest`);
      fs.renameSync(`${target}.part`, target);
      rowsFor.push({ url, path: `${REL}/${product.path}`, retrieved, sha256: product.sha256, bytes: bytes.length });
      summary.bytes += bytes.length;
      ++summary.downloads;
      await sleep(250);
    }
    const manifestRetrieved = now();
    fs.writeFileSync(`${manifestFile}.part`, manifestBytes);
    fs.renameSync(`${manifestFile}.part`, manifestFile);
    rowsFor.push({ url: manifestUrl, path: `${REL}/${base}manifest.json`, retrieved: manifestRetrieved, sha256: entry.manifest_sha256, bytes: manifestBytes.length });
    summary.bytes += manifestBytes.length;
    ++summary.downloads;
    const lines = rowsFor.map((r) => `${JSON.stringify({
      url: r.url, path: r.path, retrieved: r.retrieved, sha256: r.sha256, bytes: r.bytes, session, generation_id: genId,
      correlation_run_id: manifest.correlation_run_id, manifest_sha256: entry.manifest_sha256,
      licence: LICENCE, licence_url: LICENCE_URL, credit: CREDIT, class: 'publish-with-credit',
    })}\n`).join('');
    fs.appendFileSync(PROVENANCE, lines);
    summary.provenance_rows += rowsFor.length;
    ++summary.sessions_new;
    console.log(`${session} ${genId.slice(0, 8)}: ${rowsFor.length} files`);
    // Keep the newest two complete generations (by the manifest's generated_at).
    const complete = generationsOf(session).filter((d) => fs.existsSync(path.join(d, 'manifest.json')))
      .map((d) => ({ d, at: JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')).generated_at ?? '' }))
      .sort((a, b) => b.at.localeCompare(a.at) || b.d.localeCompare(a.d));
    for (const { d } of complete.slice(KEEP_GENERATIONS)) { fs.rmSync(d, { recursive: true }); ++summary.pruned_generations; }
  } catch (error) {
    console.error(`${session}: ${error.message.split('\n')[0]}`);
    fs.rmSync(genDir, { recursive: true, force: true });
    ++summary.failed;
  }
}
if (!summary.failed && newEtag && !only) fs.writeFileSync(ETAG_FILE, `${newEtag}\n`);
finish('done');
