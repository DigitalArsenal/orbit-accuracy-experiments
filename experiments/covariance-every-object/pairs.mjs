// Dev pairs for the truth objects: 8 workers under nice. Per-object rows stay under AR; the manifest records each file's SHA-256.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs'; import { TRUTH } from './lib/hold.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), dir = path.join(OUT, 'dev-pairs'); fs.mkdirSync(dir, { recursive: true });
const N = 8;
await Promise.all(Array.from({ length: N }, (_, k) => new Promise((res, rej) => {
  const p = spawn('nice', ['-n', '10', process.execPath, path.join(here, 'pairs-worker.mjs'), String(k), String(N), dir], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`worker ${k} exit ${c}`))));
})));
const manifest = {};
for (const o of TRUTH.objects) manifest[`${o.norad}.jsonl`] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, `${o.norad}.jsonl`))).digest('hex');
fs.writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify(manifest, null, 1));
console.log('done', Object.keys(manifest).length);
