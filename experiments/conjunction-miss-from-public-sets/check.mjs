// Verifies the frozen files, the standards bindings, the module, the weather forecaster and the environment before a run.
//   node check.mjs [--config config.json]
// Every line of MANIFEST.sha256 (SHA-256 and a path relative to the repository root) is compared with the file; every binding file of BINDINGS.sha256 and the
// closure of the files they import are hashed at the path the repository's libraries import them from; the module's bytes are compared with the registered
// SHA-256 (SDN_AP_WASM, else the configuration's path); the weather forecaster's bytes are compared with theirs; the installed versions of the packages are
// compared with package-lock.json, and the Node and numpy versions with the registered ones. Exits 1 on any difference.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readConfig, HERE, REPO, SDS, sha256, verifyModule } from './lib/module.mjs';

const config = readConfig();
let bad = 0;
const fail = (text) => { bad += 1; console.log(text); };

const manifest = fs.readFileSync(path.join(HERE, 'MANIFEST.sha256'), 'utf8').split('\n').filter(Boolean);
for (const line of manifest) {
  const [want, file] = line.split(/\s+/);
  const p = path.join(REPO, file);
  const got = fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null;
  if (got !== want) fail(`DIFFERENT ${file}: ${got ?? 'absent'}, registered ${want}`);
}
console.log(`${manifest.length} manifest lines checked`);

// the standards bindings
const lines = fs.readFileSync(path.join(HERE, 'BINDINGS.sha256'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
const closureLine = lines.find((l) => l.startsWith('closure '));
const entries = lines.filter((l) => !l.startsWith('closure ')).map((l) => l.split(/\s+/));
for (const [want, rel] of entries) {
  const p = path.join(SDS, rel);
  const got = fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null;
  if (got !== want) fail(`BINDING ${rel}: ${got ?? 'absent'}, registered ${want}`);
}
const seen = new Set();
const visit = (rel) => {
  if (seen.has(rel)) return;
  seen.add(rel);
  const p = path.join(SDS, rel);
  if (!fs.existsSync(p)) return;
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)) visit(path.normalize(path.join(path.dirname(rel), m[1])));
};
for (const [, rel] of entries) visit(rel);
const text = [...seen].sort().map((rel) => `${fs.existsSync(path.join(SDS, rel)) ? sha256(fs.readFileSync(path.join(SDS, rel))) : 'absent'}  ${rel}\n`).join('');
const [, closureWant, countWant] = closureLine.split(/\s+/);
if (sha256(text) !== closureWant || String(seen.size) !== countWant) fail(`BINDINGS closure: ${sha256(text)} over ${seen.size} files, registered ${closureWant} over ${countWant}`);
console.log(`${entries.length} binding entry files and the closure of ${seen.size} files checked at ${path.relative(REPO, SDS)}`);

// the module and the forecaster
try { console.log(`module ${verifyModule(config)}: SHA-256 as registered (sdn-ap ${config.module.version}, commit ${config.module.repositoryCommit})`); } catch (error) { fail(`MODULE ${error.message}`); }
const fc = path.join(REPO, config.weatherForecaster.file);
const got = fs.existsSync(fc) ? sha256(fs.readFileSync(fc)) : null;
if (got !== config.weatherForecaster.sha256) fail(`FORECASTER ${config.weatherForecaster.file}: ${got ?? 'absent'}, registered ${config.weatherForecaster.sha256}`);
else console.log('weather forecaster: SHA-256 as registered');

// packages, Node and numpy
const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8')).packages;
for (const pkg of ['space-data-module-sdk', 'flatbuffers', 'spacedatastandards.org']) {
  const p = path.join(REPO, 'node_modules', pkg, 'package.json');
  const have = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).version : null;
  if (have !== lock[`node_modules/${pkg}`]?.version) fail(`PACKAGE ${pkg}: installed ${have ?? 'absent'}, locked ${lock[`node_modules/${pkg}`]?.version}`);
}
if (process.version !== `v${config.environment.node}`) fail(`NODE ${process.version}, registered v${config.environment.node}`);
try {
  const v = execFileSync('python3', ['-c', 'import sys, numpy; print(sys.version.split()[0], numpy.__version__)'], { encoding: 'utf8' }).trim().split(' ');
  console.log(`python ${v[0]} numpy ${v[1]}`);
  if (v[1] !== config.environment.numpy) fail(`NUMPY ${v[1]}, registered ${config.environment.numpy}`);
} catch { fail('python3 with numpy: absent'); }
console.log(`node ${process.version}`);
process.exit(bad ? 1 : 0);
