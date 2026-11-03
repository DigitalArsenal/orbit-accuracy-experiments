// node s2-shard.mjs <null|power> <seed> <count> <inner> <cells.json> <out>: one shard of the S2.1 null permutations or power replicates; writes the hit share.
import fs from 'node:fs'; import { s21Null, s21Power } from './lib/s2.mjs';
const [kind, seed, count, inner, cellsFile, out] = process.argv.slice(2), rows = JSON.parse(fs.readFileSync(cellsFile));
const share = kind === 'null' ? s21Null(rows, { perms: Number(count), inner: Number(inner), seed: Number(seed) }) : s21Power(rows, { reps: Number(count), inner: Number(inner), seed: Number(seed) });
fs.writeFileSync(out, JSON.stringify({ kind, count: Number(count), share }));
