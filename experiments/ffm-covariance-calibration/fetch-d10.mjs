// C2 ruling D10 (C2-A1 point 3 for their use): the public EDC (DGFI-TUM) ILRS data, fetched anonymously, serially, at least 1 s apart:
//   - CRD v2 normal points of the type L spheres, monthly files 2025-10 to 2026-05 (used only for P2 and P3, ruling Q6);
//   - NSGF daily fitted arcs (rapid orbits) of the 7 NSGF spheres after 2026-08-28 (extend held-out by time).
// Files land under <store>/hac/ilrs-edc/ with provenance.jsonl (url, retrieved, sha256, bytes); a file present with its SHA-256 recorded
// is not fetched again. A missing file (HTTP 404) is recorded as absent. Bytes only.
//   node experiments/ffm-covariance-calibration/fetch-d10.mjs [--only npt|nsgf]
import fs from 'node:fs';
import path from 'node:path';
import { store, sha256, args, DAY } from './common.mjs';
import { setTimeout as sleep } from 'node:timers/promises';

const base = path.join(store, 'hac/ilrs-edc');
const prov = path.join(base, 'provenance.jsonl');
fs.mkdirSync(base, { recursive: true });
const seen = new Map(fs.existsSync(prov) ? fs.readFileSync(prov, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [r.url, r]; }) : []);
const EDC = 'https://edc.dgfi.tum.de/pub/slr';
const jobs = [];
if (args.only !== 'nsgf') for (const sat of ['lares', 'starlette', 'stella', 'larets', 'westpac']) for (const ym of ['202510', '202511', '202512', '202601', '202602', '202603', '202604', '202605'])
  jobs.push({ url: `${EDC}/data/npt_crd_v2/${sat}/${ym.slice(0, 4)}/${sat}_${ym}.np2`, rel: `npt_crd_v2/${sat}/${sat}_${ym}.np2` });
if (args.only !== 'npt') {
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  for (const sat of ['ajisai', 'starlette', 'stella', 'larets', 'westpac', 'lares', 'lares2']) for (let t = Date.parse('2026-08-29T00:00:00Z'); t <= today; t += DAY) {
    const d = new Date(t).toISOString(), yymmdd = `${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}`;
    jobs.push({ url: `${EDC}/products/orbits/rapid/${sat}/${d.slice(0, 4)}/${yymmdd}/nsgf.orb.${sat}.${yymmdd}.v000.sp3.gz`, rel: `nsgf-rapid/${sat}/nsgf.orb.${sat}.${yymmdd}.v000.sp3.gz` });
  }
}
let fetched = 0, absent = 0, kept = 0;
for (const j of jobs) {
  const file = path.join(base, j.rel);
  if (seen.has(j.url) && (seen.get(j.url).absent || fs.existsSync(file))) { ++kept; continue; }
  await sleep(1000);
  let res = null;
  for (let attempt = 1; attempt <= 4 && !res; attempt += 1) { try { res = await fetch(j.url, { signal: AbortSignal.timeout(180e3) }); } catch (error) { if (attempt === 4) throw error; await sleep(10e3 * attempt); } }
  const rec = { url: j.url, path: j.rel, retrieved: new Date().toISOString() };
  if (res.status === 404) { fs.appendFileSync(prov, `${JSON.stringify({ ...rec, absent: true, status: 404 })}\n`); ++absent; continue; }
  if (!res.ok) throw new Error(`${j.url}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  fs.appendFileSync(prov, `${JSON.stringify({ ...rec, sha256: sha256(bytes), bytes: bytes.length })}\n`);
  ++fetched;
}
console.log(JSON.stringify({ jobs: jobs.length, fetched, absent, kept, provenance: prov }));
