// Loads SDN modules through the space-data-module-sdk harness and records
// exactly what was loaded. Every orbit computation in this repository runs
// inside a module; this file only moves bytes in and out.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export const json = (portId, value) => ({
  portId,
  payload: Buffer.from(JSON.stringify(value)),
  typeRef: { schemaName: 'application/json' },
});

// The modules checkout: --modules, then SDN_MODULES_ROOT, then the configured
// path relative to this repository (its place in the stack).
export function modulesRoot({ flag, configured, repoRoot }) {
  const root = path.resolve(flag ?? process.env.SDN_MODULES_ROOT ?? path.join(repoRoot, configured));
  if (!fs.existsSync(path.join(root, 'analysis')) || !fs.existsSync(path.join(root, 'propagator'))) {
    throw new Error(`not a space-data-network-modules checkout: ${root} (pass --modules or set SDN_MODULES_ROOT)`);
  }
  return root;
}

// {commit, dirty} for a git checkout, or {commit: null, reason} when git
// cannot answer (no repository yet, or a checkout git cannot read here).
export function gitState(dir) {
  try {
    const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const status = execFileSync('git', ['-C', dir, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { commit, dirty: status.trim().length > 0 };
  } catch (error) {
    return { commit: null, reason: String(error.stderr ?? error.message).split('\n')[0] };
  }
}

// A module's artifact and manifest, by its path in the modules checkout
// (for example 'analysis/gp-error-model').
export async function loadModule(root, relative) {
  const dir = path.join(root, relative);
  const wasm = fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm'));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8'));
  const harness = await createBrowserModuleHarness({ wasmSource: wasm, manifest, surface: 'direct' });
  const provenance = {
    path: relative,
    pluginId: manifest.pluginId,
    version: manifest.version,
    wasmSha256: sha256(wasm),
    manifestSha256: sha256(Buffer.from(JSON.stringify(manifest))),
  };
  return {
    provenance,
    // Raw SDK response; throws on a non-zero status.
    async invoke(methodId, inputs) {
      const response = await harness.invoke({ methodId, inputs });
      if (response.statusCode !== 0) {
        throw new Error(`${relative} ${methodId}: ${response.errorCode ?? response.statusCode}: ${response.errorMessage}`);
      }
      return response;
    },
    // The named output port's payload parsed as JSON.
    async invokeJson(methodId, inputs, portId) {
      const response = await this.invoke(methodId, inputs);
      const frame = portId ? response.outputs.find((f) => f.portId === portId) : response.outputs[0];
      if (!frame) throw new Error(`${relative} ${methodId}: no output ${portId ?? '(first)'}`);
      return JSON.parse(Buffer.from(frame.payload).toString('utf8'));
    },
    destroy: () => harness.destroy(),
  };
}
