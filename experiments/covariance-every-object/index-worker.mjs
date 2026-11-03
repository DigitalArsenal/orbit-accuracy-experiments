// Pass-1 worker: node index-worker.mjs <k> <n> <outDir>; handles files k, k+n, ... of the dev-span file list.
import fs from 'node:fs'; import path from 'node:path';
import { listFiles, readFile } from './lib/archive.mjs'; import { TRUTH } from './lib/hold.mjs';
const [k, n, outDir] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
const want = new Set(TRUTH.objects.map((o) => o.norad));
const files = listFiles('2022-11-20', '2026-11-03').filter((_, i) => i % n === k);
const out = fs.createWriteStream(path.join(outDir, `part-${k}.jsonl`)), audit = { files: {}, dropped: {} };
for (const f of files) {
  const r = readFile(f, (x) => want.has(x));
  audit.files[path.basename(path.dirname(f)) + '/' + path.basename(f)] = r.sha256;
  for (const [p, c] of Object.entries(r.dropped)) audit.dropped[p] = (audit.dropped[p] ?? 0) + c;
  for (const s of r.sets) out.write(JSON.stringify(s) + '\n');
}
out.end(() => { fs.writeFileSync(path.join(outDir, `audit-${k}.json`), JSON.stringify(audit)); });
