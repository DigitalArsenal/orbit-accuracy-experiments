import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '../..');
export const results = path.join(root, 'results/propagator-published-truth');
export const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
export const config = read(path.join(here, 'config.json'));
export const artifacts = {...config.modules,'foundation/time/dist/isomorphic/module.wasm':'61abbb27a8358b05a1141bb983fcf1f6b5a89ba41793dece0bccf1678a4d02ed'};
export const DAY = 86400000, iso = t => new Date(t).toISOString();
export const sha = x => createHash('sha256').update(x).digest('hex');
export const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { maxBuffer: 32 << 20 });
export const cpu = () => { const c = process.cpuUsage(); return (c.user + c.system) / 1e6; };
export const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); };
export function options() {
  const { values } = parseArgs({ options: { modules: { type: 'string' }, run: { type: 'string', default: 'registered' }, only: { type: 'string' }, replay: { type: 'boolean', default: false } } });
  values.modules ||= process.env.SDN_MODULES_ROOT;
  if (!values.modules) throw new Error('--modules is required');
  if (!/^[a-zA-Z0-9._-]+$/.test(values.run)) throw new Error('invalid run name');
  return values;
}
export function guard(modules) {
  if (!config.frozen || process.version !== config.node) throw new Error('frozen plan/runtime pin differs');
  const plan = {};
  for (const f of ['PLAN.md', 'config.json']) {
    const rel = `experiments/${config.id}/${f}`, bytes = fs.readFileSync(path.join(here, f));
    if (!git(root, 'show', `HEAD:${rel}`).equals(bytes)) throw new Error(`uncommitted plan/config: ${f}`);
    plan[f] = { sha256: sha(bytes), commit: git(root, 'log', '-1', '--format=%H', '--', rel).toString().trim() };
  }
  if (git(modules, 'rev-parse', 'HEAD').toString().trim() !== config.moduleCommit) throw new Error('module commit differs');
  for (const [p, hash] of Object.entries(artifacts)) if (sha(fs.readFileSync(path.join(modules, p))) !== hash) throw new Error(`artifact differs: ${p}`);
  for (const [f, h] of [[config.environment, config.environmentSha256], [config.kernel, config.kernelSha256], [config.weather.file, config.weather.sha256]]) if (sha(fs.readFileSync(f)) !== h) throw new Error(`input pin differs: ${f}`);
  return plan;
}
export function newRun(opts) {
  const plan = guard(opts.modules), dir = path.join(root, 'runs', config.id, opts.run);
  for(const file of fs.readdirSync(here).filter(f=>f.endsWith('.mjs'))){
    if(!git(root,'show',`HEAD:experiments/${config.id}/${file}`).equals(fs.readFileSync(path.join(here,file))))throw new Error(`uncommitted run source: ${file}`);
  }
  if (fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error(`run already exists: ${opts.run}`);
  fs.mkdirSync(dir, { recursive: true });
  const modules = fs.realpathSync(opts.modules);
  const manifest = { experiment: config.id, command: [process.execPath, ...process.argv.slice(1)], startedUtc: iso(Date.now()), plan,
    experimentCommit: git(root, 'rev-parse', 'HEAD').toString().trim(), moduleCommit: config.moduleCommit, artifacts,
    sourceHashes: Object.fromEntries(fs.readdirSync(here).filter(f => f.endsWith('.mjs')).sort().map(f => [f, sha(fs.readFileSync(path.join(here, f)))])),
    runtime: { node: process.version, v8: process.versions.v8 }, host: { cpu: os.cpus()[0].model, cpus: os.availableParallelism(), loadStart: os.loadavg() },
    packages: {}, inputs: {}, helperHashes: {} };
  for (const relative of ['', 'propagator/sdn-ap', 'propagator/ffm', 'analysis/conjunction-assessment']) {
    const base = relative ? path.join(modules, relative) : root;
    manifest.packages[relative || 'experiment'] = { lockSha256: sha(fs.readFileSync(path.join(base, 'package-lock.json'))) };
    for (const pkg of ['space-data-module-sdk', 'spacedatastandards.org']) manifest.packages[relative || 'experiment'][pkg] = read(path.join(base, 'node_modules', pkg, 'package.json')).version;
  }
  const record = file => { manifest.inputs[file] = sha(fs.readFileSync(file)); };
  for (const f of [config.environment, config.kernel, config.weather.file]) record(f);
  for (const rel of ['propagator/ffm/catalog.mjs', 'analysis/gp-error-model/scripts/erm-codec.mjs']) {
    const bytes = fs.readFileSync(path.join(modules, rel));
    if (!git(modules, 'show', `HEAD:${rel}`).equals(bytes)) throw new Error(`modified module helper: ${rel}`);
    manifest.helperHashes[`modules:${rel}`] = sha(bytes);
  }
  for (const rel of ['harness/records.mjs', 'harness/reference.mjs', 'harness/truth-gate.mjs', 'harness/modules.mjs', 'harness/ffm-execution.mjs', 'harness/prw.mjs', 'harness/time.mjs', 'experiments/truth-gate/flags.json', 'experiments/e6-public-observations/fit.mjs', 'experiments/e2-catalog-covariance/estimation-wire.mjs', 'experiments/e2-catalog-covariance/product.mjs']) {
    const bytes = fs.readFileSync(path.join(root, rel));
    if (!git(root, 'show', `HEAD:${rel}`).equals(bytes)) throw new Error(`modified imported helper: ${rel}`);
    manifest.helperHashes[rel] = sha(bytes);
  }
  const save = () => write(path.join(dir, 'manifest.json'), manifest);
  save();
  return { dir, modules, manifest, record, save, finish() { manifest.completedUtc = iso(Date.now()); manifest.host.loadEnd = os.loadavg(); save(); } };
}
