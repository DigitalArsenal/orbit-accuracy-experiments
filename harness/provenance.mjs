// Run manifests: enough to say exactly what produced a number.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitState, sha256 } from './modules.mjs';

export const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Read from node_modules directly: some packages do not export package.json.
const packageVersion = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(repoRoot, 'node_modules', name, 'package.json'), 'utf8')).version; } catch { return null; }
};

export function startRun({ experiment, step, configPath, modulesDir, args }) {
  const started = new Date();
  const id = `${experiment}-${step}-${started.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
  const dir = path.join(repoRoot, 'runs', id);
  fs.mkdirSync(dir, { recursive: true });
  const configBytes = fs.readFileSync(configPath);
  const manifest = {
    run: id,
    experiment,
    step,
    command: ['node', ...process.argv.slice(1).map((a) => path.isAbsolute(a) ? path.relative(repoRoot, a) || a : a)],
    args,
    started: started.toISOString(),
    finished: null,
    config: { path: path.relative(repoRoot, configPath), sha256: sha256(configBytes), frozen: JSON.parse(configBytes).frozen === true },
    repository: gitState(repoRoot),
    modulesRepository: { ...gitState(modulesDir) },
    modules: [],
    packages: {
      'space-data-module-sdk': packageVersion('space-data-module-sdk'),
      'spacedatastandards.org': packageVersion('spacedatastandards.org'),
      flatbuffers: packageVersion('flatbuffers'),
    },
    runtime: { node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.cpus().length, loadAverage: os.loadavg() },
    inputs: {},
  };
  return {
    id,
    dir,
    manifest,
    addModule(provenance) { manifest.modules.push(provenance); },
    addInputs(kind, files) { manifest.inputs[kind] = { ...(manifest.inputs[kind] ?? {}), ...files }; },
    write(name, value) {
      const file = path.join(dir, name);
      fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 1)}\n`);
      return file;
    },
    finish(extra = {}) {
      manifest.finished = new Date().toISOString();
      Object.assign(manifest, extra);
      this.write('manifest.json', manifest);
      return manifest;
    },
  };
}
