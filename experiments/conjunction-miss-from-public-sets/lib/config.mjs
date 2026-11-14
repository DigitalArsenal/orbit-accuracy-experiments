import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(HERE, '../..');
export const STACK = path.resolve(REPO, '../../..');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The configuration of a run: --config <file> (default config.json beside the scripts); SDN_ARCHIVE_ROOT overrides the archive root. */
export function readConfig(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--config');
  const file = i >= 0 ? path.resolve(argv[i + 1]) : path.join(HERE, 'config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.file = file;
  config.configSha256 = sha256(fs.readFileSync(file));
  if (config.frozen !== true) throw new Error('config.json is not frozen: a step never reads a test window while the plan is not frozen');
  config.archiveRoot = process.env.SDN_ARCHIVE_ROOT || config.archive.root; // an empty value is not a root
  config.storeDir = path.resolve(process.env.CONJ_STORE ?? (path.isAbsolute(config.store) ? config.store : path.join(REPO, config.store)));
  // the registered configuration is this folder's own config.json: its SHA-256 must be the one in MANIFEST.sha256 and no option may change the run
  config.registered = fs.realpathSync(file) === fs.realpathSync(path.join(HERE, 'config.json'));
  if (config.registered) {
    const line = fs.readFileSync(path.join(HERE, 'MANIFEST.sha256'), 'utf8').split('\n').find((l) => l.endsWith('/config.json'));
    if (!line || line.split(/\s+/)[0] !== config.configSha256) throw new Error('config.json differs from its line in MANIFEST.sha256: the registered configuration is refused');
    if (process.env.SDN_MODULES_ROOT) throw new Error('SDN_MODULES_ROOT is set: a non-default modules root is refused with the registered configuration');
    if (argv.includes('--limit')) throw new Error('--limit is refused with the registered configuration');
  }
  if (config.looks) {
    const indices = argv.flatMap((arg, j) => arg === '--look' ? [j] : []);
    if (indices.length !== 1 || !['1', '2', '3'].includes(argv[indices[0] + 1])) throw new Error('--look N is required (1, 2 or 3)');
    const matches = config.looks.filter((look) => look.number === Number(argv[indices[0] + 1]));
    if (matches.length !== 1) throw new Error('the selected look is absent or repeated in the configuration');
    config.look = matches[0];
    config.runDateUtc = config.look.runDateUtc;
    config.messages = { ...config.messages, through: config.look.runDateUtc, createdBefore: config.look.createdBefore };
    config.window = { ...config.window, finalTo: config.look.finalTo };
    config.sets = { ...config.sets, createdBefore: config.look.createdBefore };
    config.statistics = { ...config.statistics, interval: config.look.interval, minimumPrimaryEvents: config.look.minimumPrimaryEvents,
      seed: config.statistics.seed + config.look.seedOffset };
  } else if (argv.includes('--look')) throw new Error('--look requires a configuration with registered looks');
  return config;
}
/** The shard of a run, "i/n" (default "0/1"). */
export const shardOf = (argv = process.argv.slice(2)) => (argv.includes('--shard') ? argv[argv.indexOf('--shard') + 1] : '0/1');

/** The module's bytes: SDN_AP_WASM, else the path in the configuration. Refuses any other SHA-256 than the registered one. */
export function modulePath(config) {
  return process.env[config.module.wasmPathEnv] ?? path.resolve(REPO, config.module.wasmPath);
}
export function verifyModule(config) {
  const file = modulePath(config);
  const got = sha256(fs.readFileSync(file));
  if (got !== config.module.wasmSha256) throw new Error(`the module at ${file} has SHA-256 ${got}; this experiment registers ${config.module.wasmSha256} (sdn-ap ${config.module.version})`);
  return file;
}
export const SDS = path.join(STACK, 'repos/main-packages/spacedatastandards.org/lib/js');
