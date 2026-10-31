// C3-small's modules (build.json): every wasm and manifest read with git show at its commit, SHA-256 checked, and written once to <store>/build/<chain>/, the layout
// harness/modules.mjs loads from; never a working tree. `pin` is the verdict's chain, `c2` C2's chain (P4 only). Host files the codecs read come from the modules checkout,
// required equal to the pin commit. Encoding and routing only; every orbit computation is a module's.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, store, build, sha256 } from '../common.mjs';

export const MODULES = process.env.SDN_MODULES_ROOT ?? path.resolve(root, '../../main-packages/space-data-network-modules');
const git = (...a) => execFileSync('git', ['-C', MODULES, ...a], { maxBuffer: 1 << 28 });

function writeOnce(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const t = `${file}.${process.pid}.part`;
  fs.writeFileSync(t, bytes);
  fs.renameSync(t, file);
}
/** The chain's build directory, created from git and checked; a wrong byte throws. */
export function materialize(chain) {
  const out = path.join(store, 'build', chain);
  for (const [rel, m] of Object.entries(build[chain].modules)) {
    const wf = path.join(out, rel, 'dist/isomorphic/module.wasm'), mf = path.join(out, rel, 'plugin-manifest.json');
    if (!fs.existsSync(wf) || sha256(fs.readFileSync(wf)) !== m.wasmSha256) {
      const b = git('show', `${m.commit}:${rel}/dist/isomorphic/module.wasm`);
      if (sha256(b) !== m.wasmSha256) throw new Error(`${rel} at ${m.commit}: wasm ${sha256(b)} is not build.json's ${m.wasmSha256}`);
      writeOnce(wf, b);
    }
    if (!fs.existsSync(mf) || sha256(fs.readFileSync(mf)) !== m.manifestSha256) {
      const b = git('show', `${m.commit}:${rel}/plugin-manifest.json`);
      if (sha256(b) !== m.manifestSha256) throw new Error(`${rel} at ${m.commit}: manifest is not build.json's`);
      writeOnce(mf, b);
    }
  }
  return out;
}

/** A host file from the modules checkout: its committed bytes at the pin must equal the working copy. */
export function hostFile(rel) {
  const f = path.join(MODULES, rel);
  if (!git('show', `${build.pin.commit}:${rel}`).equals(fs.readFileSync(f))) throw new Error(`${f} differs from modules ${build.pin.commit}`);
  return f;
}

/** gp-error-model of a chain, without propagator/sgp4-xp: { provenance, stats, noise, dcp } as C2's lib/pairs.mjs gives them. */
export async function openPairs(chain = 'pin') {
  const dir = materialize(chain);
  const { openModule } = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/modules.mjs'));
  const erm = await import(hostFile('analysis/gp-error-model/scripts/erm-codec.mjs'));
  const gem = await openModule(dir, 'analysis/gp-error-model', { fresh: true });
  return {
    chain, provenance: gem.provenance, erm, gem,
    async statsRaw(pairs, axesFrom = 'truth') { const framed = pairs.map((p, i) => ({ id: String(i), ...p })); return (await gem.call('pair_statistics', [erm.frame('pairs', 'pairs', { axesFrom, pairs: framed })])).statistics; },
    async stats(pairs, axesFrom = 'truth') { return erm.decode(await this.statsRaw(pairs, axesFrom)).pairs; },
    async noiseRaw(request) { return (await gem.call('noise_responses', [erm.frame('request', 'noise', request)])).responses; },
    async noise(request) { return erm.decode(await this.noiseRaw(request)); },
    async dcpRaw(request) { return (await gem.call('dcp_covariance', [erm.frame('request', 'dcp', request)])).dcp; },
    async dcp(request) { return erm.decode(await this.dcpRaw(request)); },
    close: async () => {},
  };
}
