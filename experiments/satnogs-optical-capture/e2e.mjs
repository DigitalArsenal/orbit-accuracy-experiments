#!/usr/bin/env node
// E2E for capture.mjs. Part A captures session 2026-11-03 from the SatNOGS Optical products host into a scratch
// archive root and checks it against the manifest. Part B replays those bytes from a local server to test the
// conditional index request, generation retention and the refusal of a corrupted byte.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parquetRows } from './parquet-rows.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CAPTURE = path.join(here, 'capture.mjs');
const SESSION = '2026-11-03';
const CREDIT = 'SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const scratch = fs.mkdtempSync(path.join(process.env.E2E_SCRATCH ?? os.tmpdir(), 'satnogs-optical-capture-e2e-'));
const checks = [];
const figures = {};
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  if (!ok) console.error(`FAIL ${name}: ${detail}`);
};

function run(root, extraEnv, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CAPTURE, ...args], { env: { ...process.env, ARCHIVE_ROOT: root, ...extraEnv } });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      const line = out.trim().split('\n').filter((l) => l.startsWith('capture: ')).at(-1);
      resolve({ code, err, summary: line ? JSON.parse(line.slice('capture: '.length)) : null });
    });
  });
}
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const provenance = (root) => {
  const file = path.join(root, 'hac/satnogs-optical/provenance.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};

try {
  // Part A: the real host.
  const rootA = path.join(scratch, 'a');
  const a1 = await run(rootA, {}, ['--sessions', SESSION]);
  check('A1 exit 0', a1.code === 0, a1.err);
  const sessionDir = path.join(rootA, 'hac/satnogs-optical', `session_date=${SESSION}/generations`);
  const gens = fs.readdirSync(sessionDir);
  check('A1 one generation', gens.length === 1, gens.join());
  const genId = gens[0], genDir = path.join(sessionDir, genId);
  const files = walk(genDir);
  check('A1 12 files', files.length === 12 && a1.summary.downloads === 12, `${files.length} files, ${a1.summary.downloads} downloads`);
  const manifest = JSON.parse(fs.readFileSync(path.join(genDir, 'manifest.json'), 'utf8'));
  let shaOk = 0;
  for (const p of manifest.products) {
    const f = path.join(rootA, 'hac/satnogs-optical', p.path);
    if (sha256(fs.readFileSync(f)) === p.sha256 && fs.statSync(f).size === p.bytes) ++shaOk;
  }
  check('A1 every product sha256 equals the manifest', shaOk === manifest.products.length && shaOk === 11, `${shaOk} of ${manifest.products.length}`);
  const measurementsRows = parquetRows(path.join(genDir, 'measurements.parquet'));
  const tracksRows = parquetRows(path.join(genDir, 'tracks.parquet'));
  check('A1 measurements rows = manifest metrics', measurementsRows === manifest.metrics.measurements, `${measurementsRows} vs ${manifest.metrics.measurements}`);
  check('A1 tracks rows = manifest metrics', tracksRows === manifest.metrics.tracks, `${tracksRows} vs ${manifest.metrics.tracks}`);
  if (genId.startsWith('3f038700')) {
    check('A1 generation 3f038700: 62,928 measurements', measurementsRows === 62928, String(measurementsRows));
    check('A1 generation 3f038700: 544 tracks', tracksRows === 544, String(tracksRows));
  }
  Object.assign(figures, { files: files.length, measurements: measurementsRows, tracks: tracksRows });
  const rows = provenance(rootA);
  const manifestSha = sha256(fs.readFileSync(path.join(genDir, 'manifest.json')));
  check('A1 12 provenance rows', rows.length === 12 && a1.summary.provenance_rows === 12, String(rows.length));
  check('A1 provenance licence, credit, class', rows.every((r) => r.licence === 'CC-BY-SA-4.0' && r.credit === CREDIT && r.class === 'publish-with-credit' && r.licence_url === 'https://creativecommons.org/licenses/by-sa/4.0/'), 'row fields');
  check('A1 provenance session, generation, manifest sha', rows.every((r) => r.session === SESSION && r.generation_id === genId && r.manifest_sha256 === manifestSha && r.correlation_run_id === manifest.correlation_run_id), 'row fields');
  check('A1 provenance sha256 and bytes equal the files', rows.every((r) => { const b = fs.readFileSync(path.join(rootA, r.path)); return sha256(b) === r.sha256 && b.length === r.bytes; }), 'row files');
  check('A1 no request path outside the products', rows.every((r) => r.url.startsWith('https://pub-ace0a918977843e5a065d3239b3ae105.r2.dev/products/') && !/elements|residuals/.test(r.url)), 'urls');
  check('A1 only hac/satnogs-optical written', fs.readdirSync(path.join(rootA, 'hac')).join() === 'satnogs-optical' && fs.readdirSync(rootA).join() === 'hac', fs.readdirSync(rootA).join());
  const a2 = await run(rootA, {}, ['--sessions', SESSION]);
  check('A2 second run 0 downloads', a2.code === 0 && a2.summary.downloads === 0 && a2.summary.sessions_skipped === 1 && provenance(rootA).length === 12, JSON.stringify(a2.summary));

  // Part B: replay from a local server.
  const served = new Map();
  let indexEntries = [];
  const indexBody = () => Buffer.from(JSON.stringify({
    count: indexEntries.length, prefix: 'products', sessions: indexEntries,
    licence: { spdx: 'CC-BY-SA-4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/', credit: CREDIT },
  }));
  const requested = [];
  const server = http.createServer((req, res) => {
    requested.push(req.url);
    if (req.url === '/products/index.json') {
      const body = indexBody(), tag = `"${sha256(body).slice(0, 32)}"`;
      if (req.headers['if-none-match'] === tag) { res.writeHead(304, { ETag: tag }); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', ETag: tag });
      res.end(body);
      return;
    }
    const body = served.get(decodeURIComponent(req.url));
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200);
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = { INDEX_URL: `http://127.0.0.1:${server.address().port}/products/index.json` };

  // A generation replayed from the captured bytes under a new id; `corrupt` flips one byte of measurements.parquet.
  const generation = (n, corrupt = false) => {
    const gid = sha256(`generation-${n}`);
    const m = JSON.parse(JSON.stringify(manifest));
    const from = `session_date=${SESSION}/generations/${genId}/`, to = `session_date=${SESSION}/generations/${gid}/`;
    m.generation_id = gid;
    m.generated_at = `2026-11-04T0${n}:00:00Z`;
    for (const p of m.products) {
      const bytes = Buffer.from(fs.readFileSync(path.join(rootA, 'hac/satnogs-optical', p.path)));
      if (corrupt && p.path.endsWith('measurements.parquet')) bytes[bytes.length >> 1] ^= 0x01;
      p.path = p.path.replace(from, to);
      served.set(`/products/${p.path}`, bytes);
    }
    const mb = Buffer.from(JSON.stringify(m));
    served.set(`/products/${to}manifest.json`, mb);
    indexEntries = [{ session: SESSION, manifest: `products/${to}manifest.json`, manifest_sha256: sha256(mb) }];
    return gid;
  };

  const rootB = path.join(scratch, 'b');
  const g1 = generation(1);
  const b1 = await run(rootB, env);
  check('B1 mirror capture 12 downloads', b1.code === 0 && b1.summary.downloads === 12, JSON.stringify(b1.summary));
  const before = requested.length;
  const b2 = await run(rootB, env);
  check('B2 ETag unchanged: 304, 0 downloads, one request', b2.summary.note === 'index unchanged' && b2.summary.downloads === 0 && requested.length - before === 1, `${b2.summary?.note} ${requested.length - before} requests`);
  const g2 = generation(2);
  const b3 = await run(rootB, env);
  const gensDir = path.join(rootB, 'hac/satnogs-optical', `session_date=${SESSION}/generations`);
  check('B3 second generation: both kept', b3.summary.downloads === 12 && fs.readdirSync(gensDir).sort().join() === [g1, g2].sort().join(), fs.readdirSync(gensDir).join());
  const g3 = generation(3);
  const b4 = await run(rootB, env);
  check('B4 third generation: newest two kept', b4.summary.pruned_generations === 1 && fs.readdirSync(gensDir).sort().join() === [g2, g3].sort().join(), fs.readdirSync(gensDir).join());
  check('B4 provenance keeps all 36 rows', provenance(rootB).length === 36, String(provenance(rootB).length));

  const rootC = path.join(scratch, 'c');
  const g4 = generation(4, true);
  const c1 = await run(rootC, env);
  const cDir = path.join(rootC, 'hac/satnogs-optical', `session_date=${SESSION}/generations`);
  check('C1 corrupted byte refused', c1.code === 1 && c1.summary.failed === 1 && /sha256 differs/.test(c1.err), `${c1.code} ${c1.err.trim().split('\n').at(-1)}`);
  check('C1 nothing kept: no generation dir, no provenance row, no ETag', !fs.existsSync(path.join(cDir, g4)) && provenance(rootC).length === 0 && !fs.existsSync(path.join(rootC, 'hac/satnogs-optical/.index-etag')), 'leftovers');
  server.close();
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.ok);
console.log(`e2e: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length} checks; session ${SESSION}: ${figures.files} files, ${figures.measurements} measurements, ${figures.tracks} tracks, provenance rows ${figures.files}`);
process.exit(failed.length ? 1 : 0);
