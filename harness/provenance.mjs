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

// `resume`: the id of an unfinished run to continue (a long run split across
// invocations). It must have the same config bytes; modules are checked as they
// are added. Each invocation is listed under `invocations`.
export function startRun({ experiment, step, configPath, modulesDir, args, resume }) {
  const started = new Date();
  const configBytes = fs.readFileSync(configPath);
  if (resume) {
    const dir = path.join(repoRoot, 'runs', resume);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (manifest.finished) throw new Error(`${resume} is finished; start a new run`);
    if (manifest.config.sha256 !== sha256(configBytes)) throw new Error(`${resume} used other config bytes`);
    const state = gitState(modulesDir);
    if (state.commit !== manifest.modulesRepository.commit || state.dirty !== manifest.modulesRepository.dirty) throw new Error(`${resume} used another modules checkout state`);
    manifest.invocations.push({ started: started.toISOString(), args });
    return runHandle(resume, dir, manifest, true);
  }
  const id = `${experiment}-${step}-${started.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
  const dir = path.join(repoRoot, 'runs', id);
  fs.mkdirSync(dir, { recursive: true });
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
    invocations: [{ started: started.toISOString(), args }],
  };
  return runHandle(id, dir, manifest, false);
}

function runHandle(id, dir, manifest, resumed) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return {
    id,
    dir,
    manifest,
    resumed,
    addModule(provenance) {
      const known = manifest.modules.find((m) => m.path === provenance.path);
      if (known && !same(known, provenance)) throw new Error(`${id}: ${provenance.path} differs from the artifact the run started with`);
      if (!known) manifest.modules.push(provenance);
    },
    addInputs(kind, files) {
      for (const [name, hash] of Object.entries(files)) {
        const known = manifest.inputs[kind]?.[name];
        if (known && known !== hash) throw new Error(`${id}: input ${kind}/${name} changed`);
      }
      manifest.inputs[kind] = { ...(manifest.inputs[kind] ?? {}), ...files };
    },
    // Saves the manifest without finishing the run.
    checkpoint() { this.write('manifest.json', manifest); },
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
