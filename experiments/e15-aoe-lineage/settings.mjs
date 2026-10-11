// E15's operating settings: paths, politeness, compute limits. The experiment's numbers (windows, horizons, rules,
// statistics) are in config.json, which is frozen; nothing here decides a result.
import path from 'node:path';
import { repoRoot } from '../../harness/provenance.mjs';

export const USER_AGENT = 'sdn-e15-aoe-lineage/1.0';

export const PATHS = {
  // AOE element sets (SpaceMapper channel KY): <aoe>/<YYYY>/<YYYY-MM-DD>/orbits-KY/{records.jsonl, run.json}
  aoe: '/opt/data/sdn-archive/hac/spacemapper-aoe',
  // AOE's own catalog, monthly (descriptive coverage only): <aoe>/<YYYY>/<YYYY-MM>/{AOE,MIXED}/records.jsonl
  // Space-Track gp_history by creation day; read as E3 does, never redistributed.
  gpHistory: '/opt/data/sdn-archive/spacetrack/gp_history/by-creation',
  // CelesTrak SupGP from the collector archive (identity crosswalks for GEO; SupGP beside both, descriptive).
  supgp: '/opt/data/sdn-archive/celestrak/supgp',
  // IERS Earth orientation archived daily (latest.json names the newest finals2000A).
  eop: '/opt/data/sdn-archive/hac',
  // gp-error-model 0.2.0 (element_residuals), branch task/omm-fit-20261010, read-only: the build the SupGP pass ran.
  scoreModules: '/Users/tj/software/worktrees/space-data-network-modules--omm-fit-20261010',
  // Readers (operator files, SP3, Earth orientation, frames): the canonical modules checkout (main), read-only.
  readerModules: '/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules',
  // Converted reference products (analysis/reference-states output) already on this machine, E3's and E14's, and E15's own.
  reference: [
    '/opt/data/sdn-archive/reference-states/reference-finals2000a',
    '/opt/data/sdn-archive/reference-states/reference',
    '/opt/data/sdn-archive/reference-states/reference-leo-pod-2',
    '/opt/data/sdn-archive/e14-covariance-realism/reference',
    '/opt/data/sdn-archive/e15-aoe-lineage/reference',
  ],
  // E15's own store outside the repository: name registries, logs, the runner's state. No operator bytes.
  store: '/opt/data/sdn-archive/e15-aoe-lineage',
  // Residual rows (derived from Space-Track and operator data): ignored by git, never committed.
  rows: process.env.E15_ROWS ?? path.join(repoRoot, 'runs', 'e15-rows'),
  secrets: '/opt/data/sdn-archive/.secrets',
};

// Operator hosts: at most 8 requests in flight per host (owner); E15 uses 4, as E11, E13 and E14 poll the same hosts.
// A host that answers 403 or 429 is disabled for the run.
export const HTTP = { perHost: 4 };

// Compute (coordinator): at most 6 workers; no new work while the 1-minute load is above 45; 15 GiB disk floor.
export const COMPUTE = { maxWorkers: 6, pauseAboveLoad1m: 45, minFreeGiB: 15, pauseMs: 60000 };

// Spire via the EUMETSAT Data Store: a few hourly products a day, at most 300 MB, deleted after use.
export const SPIRE = { collection: 'EO:EUM:DAT:0374', maxBytesPerDay: 300e6, maxProductsPerDay: 6 };
