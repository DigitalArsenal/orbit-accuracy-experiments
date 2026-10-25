// The run directory and its manifest: every input hash, module provenance, file hash and invocation, checkpointed as it grows.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { sha256, gitState } from '../../harness/modules.mjs';

export class Run {
  constructor({ root, dir, config, registration, runtimeProvenance }) {
    this.root = root; this.dir = dir; this.manifestFile = path.join(dir, 'manifest.json');
    fs.mkdirSync(dir, { recursive: true });
    const configSha256 = sha256(fs.readFileSync(path.join(root, 'experiments/v1c5-rescore/config.json')));
    this.manifest = fs.existsSync(this.manifestFile) ? JSON.parse(fs.readFileSync(this.manifestFile)) : {
      run: path.basename(dir), registration, started: new Date().toISOString(), configSha256, repository: gitState(root),
      runtime: { node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.cpus().length },
      provision: runtimeProvenance, workers: config.workers, threads: 1, inputs: {}, modules: {}, files: {}, invocations: [], peakDispatchLoad: 0 };
    assert.equal(this.manifest.configSha256, configSha256, 'config.json changed since this run started');
  }
  get inputs() { return this.manifest.inputs; }
  get modules() { return this.manifest.modules; }
  get files() { return this.manifest.files; }
  get peakDispatchLoad() { return this.manifest.peakDispatchLoad; }
  set peakDispatchLoad(v) { this.manifest.peakDispatchLoad = v; }
  invoke(stage) { this.manifest.invocations.push({ stage, started: new Date().toISOString(), repository: gitState(this.root) }); this.checkpoint(); }
  checkpoint() { fs.writeFileSync(this.manifestFile, JSON.stringify(this.manifest, null, 2) + '\n'); }
  // Writes a run file (text, bytes or JSON) and records its hash.
  write(name, value) {
    const file = path.join(this.dir, name);
    fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n');
    this.files[name] = sha256(fs.readFileSync(file)); this.checkpoint(); return file;
  }
  // Reads an input and records (or verifies) its hash.
  input(kind, file) {
    const bytes = fs.readFileSync(file), hash = sha256(bytes), prior = this.inputs[kind]?.[file];
    if (prior) assert.equal(hash, prior, `input changed: ${file}`);
    (this.inputs[kind] ??= {})[file] = hash; return bytes;
  }
  note(kind, file, hash) { const prior = this.inputs[kind]?.[file]; if (prior) assert.equal(hash, prior, `input changed: ${file}`); (this.inputs[kind] ??= {})[file] = hash; }
}
