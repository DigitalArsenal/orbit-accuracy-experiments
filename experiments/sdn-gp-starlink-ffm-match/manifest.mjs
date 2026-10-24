// The run manifest of the committed tables: commands, hashes of the plan and config, repository and modules commits, each
// module's WASM SHA-256, package versions, runtime, the environment (EOP, space weather, kernel) and the hash of the
// derived truth set. Output: results/sdn-gp-starlink-ffm-match/manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config, dir, root, store, results, write, sha256 } from './common.mjs';
import { modulesRoot, openModule } from './lib/modules.mjs';
import { sdsVersion } from './lib/sds.mjs';

const git = (cwd, ...a) => { try { return execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
export function manifest() {
  const modules = modulesRoot();
  const wasm = (rel) => { const m = JSON.parse(fs.readFileSync(path.join(modules, rel, 'plugin-manifest.json'), 'utf8')); return { path: rel, version: m.version, wasmSha256: sha256(fs.readFileSync(path.join(modules, rel, 'dist/isomorphic/module.wasm'))) }; };
  const truthDir = path.join(store, 'truth');
  const truth = fs.existsSync(truthDir) ? fs.readdirSync(truthDir).filter((n) => /^\d+\.json$/.test(n)).sort((a, b) => Number(a.replace('.json', '')) - Number(b.replace('.json', ''))).map((n) => { const m = JSON.parse(fs.readFileSync(path.join(truthDir, n))); return [m.norad, m.truth.sha256]; }) : [];
  const env = path.join(store, 'environment/environment.json');
  const envJson = fs.existsSync(env) ? JSON.parse(fs.readFileSync(env, 'utf8')) : null;
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  return {
    experiment: config.experiment,
    commands: ['node experiments/sdn-gp-starlink-ffm-match/population.mjs', 'node experiments/sdn-gp-starlink-ffm-match/truth.mjs --workers N', 'node experiments/sdn-gp-starlink-ffm-match/baselines.mjs', 'node experiments/sdn-gp-starlink-ffm-match/bench.mjs', 'node experiments/sdn-gp-starlink-ffm-match/comspoc.mjs', 'node experiments/sdn-gp-starlink-ffm-match/covariance.mjs', 'node experiments/sdn-gp-starlink-ffm-match/fitlength.mjs --limit 100', 'node experiments/sdn-gp-starlink-ffm-match/fetch-kernels.mjs get <path> --dest spk/missions/<mission> (11 files, 5 s apart)', 'node experiments/sdn-gp-starlink-ffm-match/spk-windows.mjs', 'node experiments/sdn-gp-starlink-ffm-match/refit.mjs --cap 30 --workers 10', 'node experiments/sdn-gp-starlink-ffm-match/newer.mjs --shard k/4 (re-run as newer files arrive)', 'node experiments/sdn-gp-starlink-ffm-match/newer.mjs --truth refit30 --daily-only', 'node experiments/sdn-gp-starlink-ffm-match/m123.mjs --workers 10', 'node experiments/sdn-gp-starlink-ffm-match/m123-report.mjs', 'node experiments/sdn-gp-starlink-ffm-match/inventory.mjs', 'node experiments/sdn-gp-starlink-ffm-match/tables.mjs', 'node experiments/sdn-gp-starlink-ffm-match/manifest.mjs', 'node experiments/sdn-gp-starlink-ffm-match/run.mjs --check'],
    planSha256: sha256(fs.readFileSync(path.join(dir, 'PLAN.md'))), configSha256: sha256(fs.readFileSync(path.join(dir, 'config.json'))),
    repository: { commit: git(root, 'rev-parse', 'HEAD') }, modules: { commit: git(modules, 'rev-parse', 'HEAD'), artifacts: ['propagator/sgp4-xp', 'analysis/gp-error-model', 'analysis/od', 'propagator/ffm', 'files/orbit-products', 'foundation/time', 'foundation/frames'].map(wasm) },
    packages: { ...pkg.dependencies, lockfileSha256: sha256(fs.readFileSync(path.join(dir, 'package-lock.json'))), spacedatastandardsInstalled: sdsVersion },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    environment: envJson && { environmentSha256: sha256(fs.readFileSync(env)), weatherSources: envJson.weatherSources, weatherExtension: envJson.weatherExtension, kernel: envJson.kernel, createdUtc: envJson.createdUtc },
    truthSet: { satellites: truth.length, setSha256: sha256(JSON.stringify(truth)) },
    comspoc: (() => { const f = path.join(config.archive, 'hac/comspoc-spacebook/2026/2026-10-23/run.json'); if (!fs.existsSync(f)) return null; const r = JSON.parse(fs.readFileSync(f, 'utf8')); return { label: 'COMSPOC Spacebook XP (local scoring only)', startedUtc: r.started_utc, terms: r.terms, xpTleSha256: r.files.find((x) => x.file.endsWith('xp-tle.txt.gz'))?.sha256, syncopateObjects: fs.readdirSync(path.join(path.dirname(f), 'syncopate')).filter((n) => n.endsWith('.e.gz')).length }; })(),
    kernels: fs.existsSync(path.join(results, 'kernels.json')) ? JSON.parse(fs.readFileSync(path.join(results, 'kernels.json'), 'utf8')).rows.map((k) => ({ mission: k.mission, file: k.file, bytes: k.bytes, sha256: k.sha256, url: k.url, retrievedUtc: k.retrievedUtc })) : null,
    populationQueueSha256: fs.existsSync(path.join(results, 'population.json')) ? JSON.parse(fs.readFileSync(path.join(results, 'population.json'))).queueSha256 : null,
  };
}
if (process.argv[1] === new URL(import.meta.url).pathname) { write(path.join(results, 'manifest.json'), manifest()); console.log('manifest written'); }
