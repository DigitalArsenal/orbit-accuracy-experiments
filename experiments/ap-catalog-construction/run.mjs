#!/usr/bin/env node
// Entry of experiments/ap-catalog-construction (PLAN.md, config.json). It registers a load hook that hashes every file the run executes
// (SHA-256 of the bytes Node loads); for a registered part (1, 2, H) every such file must match registration.json as it loads, or the
// run stops. The runner itself is lib/main.mjs.
//   node experiments/ap-catalog-construction/run.mjs --check                   end to end on made-up sets and files; every guard tripped
//   node experiments/ap-catalog-construction/run.mjs --part 1|2|H [--shard i/n] a registered part (once; rows to the store)
//   node experiments/ap-catalog-construction/run.mjs --part dev-A|dev-B|dev-H [--shard i/n]   a disclosed dry run (rows under runs/)
//   node experiments/ap-catalog-construction/run.mjs --manifest 1|2|H           the part's archive manifest (listing only)
//   node experiments/ap-catalog-construction/run.mjs --pin                      registration.json (before the registration commit)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const STACK = path.resolve(REPO, '../../..'), SELF = path.relative(STACK, REPO);
// A file's key is the same in every checkout of the stack (Node resolves symbolic links first): the path relative to this repository
// (its node_modules included, wherever that folder really lives), stack:repos/<group>/<repository>/... for a file of another repository
// of the stack, else the absolute path. Two different files under one key stop the run.
const keyOf = (file) => {
  if (file.startsWith(`${REPO}/`)) return path.relative(REPO, file);
  const m = /\/(repos\/(?:main|ancillary)-packages\/.*)$/.exec(file);
  if (!m) return file;
  return m[1].startsWith(`${SELF}/`) ? m[1].slice(SELF.length + 1) : `stack:${m[1]}`;
};
const pathOf = (key) => (key.startsWith('stack:') ? path.join(STACK, key.slice(6)) : path.isAbsolute(key) ? key : path.join(REPO, key));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const loaded = new Map([[keyOf(fileURLToPath(import.meta.url)), sha256(fs.readFileSync(fileURLToPath(import.meta.url)))]]);
let registered = null, expected = null;

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url.startsWith('file:')) {
      const file = fileURLToPath(url), key = keyOf(file);
      const sha = sha256(result.source ?? fs.readFileSync(file));
      if (loaded.has(key) && loaded.get(key) !== sha) throw new Error(`REFUSED: two different files load as ${key}`);
      loaded.set(key, sha);
      if (registered && registered[key] !== sha) throw new Error(`REFUSED: ${key} ${key in registered ? 'differs from its registered bytes' : 'is not registered'}`);
      if (expected && expected.file === file && expected.sha !== sha) throw new Error(`REFUSED: ${key} differs from the bytes the check expects`);
    }
    return result;
  },
});
globalThis.__apcc = { loaded, pathOf, expect: (file, sha) => { expected = file ? { file, sha } : null; } };

const argv = process.argv.slice(2);
const partId = argv.includes('--part') ? argv[argv.indexOf('--part') + 1] : null;
if (['1', '2', 'H'].includes(partId)) {
  const reg = JSON.parse(fs.readFileSync(path.join(HERE, 'registration.json'), 'utf8'));
  registered = reg.files;
  for (const [key, sha] of loaded) if (registered[key] !== sha) throw new Error(`REFUSED: ${key} differs from its registered bytes`);
}
await import(pathToFileURL(path.join(HERE, 'lib/main.mjs')).href);
