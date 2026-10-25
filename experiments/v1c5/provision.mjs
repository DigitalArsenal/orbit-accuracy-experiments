#!/usr/bin/env node
// Builds V1c4's runtime from pinned git objects and one npm tarball, and verifies every byte against config.json.
// Nothing is built: the modules' artifacts are committed in space-data-network-modules, and the files the harness needs
// beside them (codec, FFM catalog helpers, SGP4 client bindings, population model, DE440 kernel) are read from the same commit.
//   node provision.mjs --modules-repo <clone of space-data-network-modules> --out <runtime dir> [--sds-tarball <tgz>]
//   node provision.mjs --modules-repo <clone> --pin      # prints the pins to register (development only)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const dir = path.dirname(new URL(import.meta.url).pathname);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const { values } = parseArgs({ options: { 'modules-repo': { type: 'string' }, out: { type: 'string' }, 'sds-tarball': { type: 'string' }, pin: { type: 'boolean' } } });
const git = (repo, args, options = {}) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 1 << 30, ...options });
const blob = (repo, commit, file) => git(repo, ['cat-file', 'blob', `${commit}:${file}`]);

// The files of one module directory the experiment reads, beside dist/isomorphic/module.wasm and plugin-manifest.json.
export const wanted = (repo, commit) => {
  const tree = git(repo, ['ls-tree', '-r', '--name-only', commit, 'propagator/sgp4/tests/lib/generated'], { encoding: 'utf8' }).trim().split('\n');
  const module = id => [`${id}/dist/isomorphic/module.wasm`, `${id}/plugin-manifest.json`];
  return [...['analysis/gp-error-model', 'analysis/maneuver-detection', 'propagator/sgp4', 'propagator/ffm', 'foundation/time', 'data-source/eop-parser'].flatMap(module),
    'analysis/gp-error-model/scripts/erm-codec.mjs', 'analysis/gp-error-model/data/e14-s3-kc.erm',
    'propagator/ffm/catalog.mjs', 'propagator/ffm/catalog-configuration.mjs', 'files/orbit-products/tests/fixtures/de440/de440-2026.bsp', ...tree].sort();
};
export const truthToolFiles = ['analysis/reference-states', 'files/orbit-products', 'data-source/eop-parser'].flatMap(id => [`${id}/dist/isomorphic/module.wasm`, `${id}/plugin-manifest.json`]);

function treeHash(root, files) {
  return sha256(files.map(f => `${f} ${sha256(fs.readFileSync(path.join(root, f)))}\n`).join(''));
}
const walk = (root, relative = '') => fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(root, path.join(relative, e.name)) : [path.join(relative, e.name)]).sort();

export async function provision({ repo, out, sdsTarball, config }) {
  const pins = config.runtime;
  fs.mkdirSync(out, { recursive: true });
  const written = {};
  const extract = (commit, files, root, expected) => {
    for (const f of files) {
      const bytes = blob(repo, commit, f), hash = sha256(bytes);
      assert.equal(hash, expected[f], `pin mismatch: ${commit.slice(0, 8)}:${f}`);
      const target = path.join(root, f);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); written[path.relative(out, target)] = hash;
    }
  };
  extract(pins.modulesCommit, Object.keys(pins.files), out, pins.files);
  extract(pins.truthToolsCommit, Object.keys(pins.truthToolFiles), path.join(out, 'truth-tools'), pins.truthToolFiles);
  // spacedatastandards.org: only the families the helpers import (JS bindings) and the ERM TypeScript bindings the codec bundles.
  const nodeModules = path.join(out, 'node_modules'); fs.mkdirSync(nodeModules, { recursive: true });
  const sdsDir = path.join(nodeModules, 'spacedatastandards.org');
  let tarball = sdsTarball;
  if (!tarball) {
    const scratch = fs.mkdtempSync(path.join(path.dirname(out), 'sds-pack-'));
    execFileSync('npm', ['pack', `spacedatastandards.org@${pins.sds.version}`, '--silent'], { cwd: scratch });
    tarball = path.join(scratch, `spacedatastandards.org-${pins.sds.version}.tgz`);
  }
  const integrity = `sha512-${crypto.createHash('sha512').update(fs.readFileSync(tarball)).digest('base64')}`;
  assert.equal(integrity, pins.sds.integrity, 'spacedatastandards.org tarball integrity');
  fs.rmSync(sdsDir, { recursive: true, force: true }); fs.mkdirSync(sdsDir, { recursive: true });
  execFileSync('tar', ['-xzf', tarball, '-C', sdsDir, '--strip-components=1', ...pins.sds.paths.map(p => `package/${p}`)]);
  const files = walk(sdsDir);
  assert.equal(treeHash(sdsDir, files), pins.sds.treeSha256, 'spacedatastandards.org subset tree hash');
  // The repository's own flatbuffers and esbuild serve the helpers (no second copy of flatbuffers in memory).
  const repoModules = path.resolve(dir, '../../node_modules');
  for (const name of ['flatbuffers', 'esbuild']) {
    const link = path.join(nodeModules, name); fs.rmSync(link, { force: true });
    fs.symlinkSync(path.join(repoModules, name), link);
  }
  fs.writeFileSync(path.join(out, 'PROVENANCE.json'), JSON.stringify({ modulesCommit: pins.modulesCommit, truthToolsCommit: pins.truthToolsCommit, sds: { ...pins.sds, files: files.length },
    files: written, linked: { flatbuffers: JSON.parse(fs.readFileSync(path.join(repoModules, 'flatbuffers/package.json'))).version, esbuild: JSON.parse(fs.readFileSync(path.join(repoModules, 'esbuild/package.json'))).version } }, null, 2) + '\n');
  return { files: Object.keys(written).length, sdsFiles: files.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assert(values['modules-repo'], '--modules-repo is required');
  const repo = path.resolve(values['modules-repo']);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
  if (values.pin) {
    const pins = config.runtime;
    const pin = (commit, files) => Object.fromEntries(files.map(f => [f, sha256(blob(repo, commit, f))]));
    console.log(JSON.stringify({ modulesCommit: pins.modulesCommit, truthToolsCommit: pins.truthToolsCommit, files: pin(pins.modulesCommit, wanted(repo, pins.modulesCommit)), truthToolFiles: pin(pins.truthToolsCommit, truthToolFiles) }, null, 1));
  } else {
    assert(values.out, '--out is required');
    console.log(JSON.stringify(await provision({ repo, out: path.resolve(values.out), sdsTarball: values['sds-tarball'] && path.resolve(values['sds-tarball']), config })));
  }
}
