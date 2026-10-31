// C3-A2: the daily NSGF arcs of C3's seven spheres from EDC, anonymously, serially, at most one request per second, into <store>/nsgf/products/ where the modules' converter reads its cache
// (analysis/reference-states scripts/fetch-reference-products.mjs, product slr-daily). A manifest records url, SHA-256, bytes and retrieval time per file. A file present is not fetched again. A failure is listed,
// and tried once more after 60 s; it is not hammered. The converter's sigma needs the next day's arc, so each sphere's range runs one day past the last arc. Nothing is committed or republished.
//   node experiments/ffm-covariance-adaptive/fetch-nsgf.mjs          (stop: touch <store>/nsgf/stop)
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { config, store, registered, sha256, DAY } from './common.mjs';

registered();
const C = config.nsgfArcs, base = path.join(store, 'nsgf'), products = path.join(base, 'products'), manifest = path.join(base, 'manifest.jsonl');
fs.mkdirSync(products, { recursive: true });
const seen = new Set(fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.sha256 || r.status === 404).map((r) => r.url) : []);
const log = (r) => fs.appendFileSync(manifest, `${JSON.stringify(r)}\n`);
const yymmdd = (t) => new Date(t).toISOString().slice(2, 10).replaceAll('-', '');
let last = 0, got = 0, absent = 0, failed = 0, had = 0;
const t00 = Date.now();
async function get(url) {
  const wait = last + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const r = await fetch(url, { headers: { 'user-agent': 'orbit-accuracy-experiments (research; one request per second)' }, signal: AbortSignal.timeout(120e3) });
  last = Date.now();
  return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) };
}
const from = Date.parse(`${C.from}T00:00:00Z`), to = Date.parse(`${C.to}T00:00:00Z`) + DAY;
for (let t = from; t <= to; t += DAY) for (const sat of Object.keys(C.spheres)) {
  if (fs.existsSync(path.join(base, 'stop'))) { console.error('stop file present'); process.exit(3); }
  const d = yymmdd(t), name = `nsgf.orb.${sat}.${d}.v000.sp3.gz`, file = path.join(products, name);
  const url = `${C.source}${sat}/${new Date(t).getUTCFullYear()}/${d}/${name}`;
  if (fs.existsSync(file) || seen.has(url)) { had += 1; continue; }
  let result = null;
  for (let attempt = 1; attempt <= 2 && !result; attempt += 1) {
    try {
      const r = await get(url), retrieved = new Date().toISOString();
      if (r.status === 404) { log({ url, retrieved, status: 404, absent: true }); absent += 1; result = 'absent'; break; }
      if (r.status === 200 && r.bytes[0] === 0x1f && r.bytes[1] === 0x8b) { const tmp = `${file}.${process.pid}.part`; fs.writeFileSync(tmp, r.bytes); fs.renameSync(tmp, file); log({ url, path: `products/${name}`, retrieved, status: 200, sha256: sha256(r.bytes), bytes: r.bytes.length }); got += 1; result = 'ok'; break; }
      log({ url, retrieved, status: r.status, failed: `HTTP ${r.status}, ${r.bytes.length} bytes`, attempt });
    } catch (error) { log({ url, retrieved: new Date().toISOString(), failed: String(error.cause?.code ?? error.message).slice(0, 120), attempt }); }
    if (attempt === 1) await sleep(60e3);
  }
  if (!result) failed += 1;
  if ((got + absent + failed) % 100 === 0) console.error(`${d}: ${got} fetched, ${absent} absent, ${failed} failed, ${((Date.now() - t00) / 60e3).toFixed(1)} min`);
}
console.log(JSON.stringify({ got, absent, failed, had, minutes: (Date.now() - t00) / 60e3 }));
