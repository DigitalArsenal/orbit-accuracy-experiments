// Registers one sdn-ap build for covbuild.mjs and covterms.mjs: its module.wasm under <out>/builds/<sha12>/ with build.json (commit,
// SHA-256, version). The version picks the build's $PCF (headline-loop lib/arms.mjs apPcfFor).
//   node build.mjs <out> file <module.wasm> <its SHA-256> <commit> <version>      a build handed over as a file, its SHA-256 checked
//   node build.mjs <out> git <modules checkout> <commit> [SHA-256 prefix]         propagator/sdn-ap/dist/isomorphic/module.wasm at a commit
// Prints the sha12 the other steps take.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { outDir, VERSION } from './lib.mjs';

const out = outDir(process.argv[2]);
const [how, a, b, c, d] = process.argv.slice(3);
let bytes, build;
if (how === 'file') {
  bytes = fs.readFileSync(a);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha !== b) throw new Error(`${a}: SHA-256 ${sha}, given ${b}`);
  if (!c || !d) throw new Error('file <module.wasm> <SHA-256> <commit> <version>');
  build = { commit: c, sha256: sha, version: d, from: path.basename(a) };
} else if (how === 'git') {
  bytes = execFileSync('git', ['-C', a, 'show', `${b}:propagator/sdn-ap/dist/isomorphic/module.wasm`], { maxBuffer: 1 << 28 });
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (c && !sha.startsWith(c)) throw new Error(`${b}: SHA-256 ${sha}, expected ${c}...`);
  const commit = execFileSync('git', ['-C', a, 'rev-parse', b]).toString().trim();
  const version = JSON.parse(execFileSync('git', ['-C', a, 'show', `${b}:propagator/sdn-ap/package.json`]).toString()).version;
  build = { commit, sha256: sha, version };
} else throw new Error('build.mjs <out> file <module.wasm> <SHA-256> <commit> <version> | git <modules checkout> <commit> [SHA-256 prefix]');
// the version picks the build's $PCF (apPcfFor's gates); one they cannot read would fit every record as the oldest version does
if (!VERSION.test(build.version)) throw new Error(`version ${JSON.stringify(build.version)} is not X.Y.Z (the package version, e.g. 0.6.42)`);
const dir = path.join(out, 'builds', build.sha256.slice(0, 12));
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'module.wasm'), bytes);
fs.writeFileSync(path.join(dir, 'build.json'), JSON.stringify(build, null, 1));
console.log(build.sha256.slice(0, 12), build.commit, build.version);
