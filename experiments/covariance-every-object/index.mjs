// Pass 1: index the dev truth NORADs' sets (predicate applied at decode) with 8 workers under nice. Output under AR only.
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), dir = path.join(OUT, 'dev-index'); fs.mkdirSync(dir, { recursive: true });
const N = 8;
await Promise.all(Array.from({ length: N }, (_, k) => new Promise((res, rej) => {
  const p = spawn('nice', ['-n', '10', process.execPath, path.join(here, 'index-worker.mjs'), String(k), String(N), dir], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`worker ${k} exit ${c}`))));
})));
console.log('done');
