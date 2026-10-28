import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, '../..');
export const results = path.join(repo, 'results/propagator-ca-frontier');
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const config = read(path.join(here, 'config.json'));
export const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 32 << 20 });
export const textGit = (root, ...args) => git(root, ...args).toString().trim();
export const cpu = () => { const t = process.threadCpuUsage(); return t.user + t.system; };
export const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function options() {
  const { values } = parseArgs({ options: {
    modules: { type: 'string' }, rows: { type: 'string', default: config.ca.rowsRoot },
    run: { type: 'string' }, check: { type: 'boolean', default: false },
    quick: { type: 'boolean', default: false },
  } });
  return { ...values, modules: values.modules || process.env.SDN_MODULES_ROOT };
}

export function frozenPlan() {
  if (config.frozen !== true) throw new Error('Plan is not frozen; refusing experiment inputs');
  const relative = 'experiments/propagator-ca-frontier/config.json';
  const bytes = fs.readFileSync(path.join(repo, relative));
  if (!git(repo, 'show', `HEAD:${relative}`).equals(bytes)) throw new Error('Configuration is not committed');
  const commit = textGit(repo, 'log', '-1', '--format=%H', '--', relative);
  if (!commit) throw new Error('Missing frozen-plan commit');
  const planFile = 'experiments/propagator-ca-frontier/PLAN.md';
  const planBytes = fs.readFileSync(path.join(repo, planFile));
  if (!git(repo, 'show', `HEAD:${planFile}`).equals(planBytes)) throw new Error('Plan/amendment is not committed');
  return { commit, configSha256: sha(bytes), planCommit: textGit(repo, 'log', '-1', '--format=%H', '--', planFile), planSha256: sha(planBytes) };
}

export function pinnedModules(root) {
  if (!root) throw new Error('Pass --modules <checkout at the configured commit> or SDN_MODULES_ROOT');
  root = fs.realpathSync(root);
  if (process.version !== config.node) throw new Error(`Runtime pin: need ${config.node}, have ${process.version}`);
  const commit = textGit(root, 'rev-parse', 'HEAD');
  if (commit !== config.moduleCommit) throw new Error(`Module commit differs: ${commit}`);
  const artifacts = {};
  for (const [file, expected] of Object.entries(config.modules)) {
    const actual = sha(fs.readFileSync(path.join(root, file)));
    if (actual !== expected) throw new Error(`Artifact hash differs: ${file}`);
    artifacts[file] = actual;
  }
  const helpers = [
    'propagator/sdn-ap/test/lib/module.mjs', 'propagator/sdn-ap/test/lib/tle.mjs', 'propagator/sgp4-xp/tests/lib/tle.mjs',
    'propagator/sgp4-xp/third_party/ussf-sgp4/Sgp4Prop.xp.js',
    config.ffm.benchmark,
  ];
  const sourceHashes = {};
  for (const file of helpers) {
    const actual = fs.readFileSync(path.join(root, file));
    if (!actual.equals(git(root, 'show', `${commit}:${file}`))) throw new Error(`Module helper differs: ${file}`);
    sourceHashes[file] = sha(actual);
  }
  const packages = {};
  for (const component of ['sdn-ap', 'ffm']) {
    const base = path.join(root, 'propagator', component);
    packages[component] = { lockSha256: sha(fs.readFileSync(path.join(base, 'package-lock.json'))) };
    for (const name of ['space-data-module-sdk', 'spacedatastandards.org']) {
      packages[component][name] = read(path.join(base, 'node_modules', name, 'package.json')).version;
    }
  }
  return { root, commit, artifacts, sourceHashes, packages };
}

export function newRun(kind, opts, modules) {
  const plan = frozenPlan();
  const id = opts.run || `${kind}-${new Date().toISOString().replaceAll(':', '-')}`;
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('Run id must be a filename');
  const dir = path.join(repo, 'runs/propagator-ca-frontier', id);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    experiment: config.id, kind, startedAt: new Date().toISOString(),
    command: [process.execPath, ...process.argv.slice(1)], plan,
    experimentCommit: textGit(repo, 'rev-parse', 'HEAD'),
    experimentSourceHashes: Object.fromEntries(fs.readdirSync(here).filter((f) => f.endsWith('.mjs')).sort()
      .map((f) => [f, sha(fs.readFileSync(path.join(here, f)))])),
    modules: modules || null, runtime: { node: process.version, v8: process.versions.v8 },
    host: { model: os.cpus()[0]?.model, logicalCpus: os.availableParallelism(), loadStart: os.loadavg() },
    inputs: {},
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { dir, manifest };
}

export function finishRun(run, metrics, filename) {
  const bytes = JSON.stringify(metrics, null, 2) + '\n';
  fs.writeFileSync(path.join(run.dir, filename), bytes);
  Object.assign(run.manifest, { completedAt: new Date().toISOString(), output: { file: filename, sha256: sha(bytes) } });
  run.manifest.host.loadEnd = os.loadavg();
  fs.writeFileSync(path.join(run.dir, 'manifest.json'), JSON.stringify(run.manifest, null, 2) + '\n');
  return path.join(run.dir, filename);
}
