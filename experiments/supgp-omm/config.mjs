// Settings of the all-SupGP OMM pass (task supgp-omm-20261010). Everything the
// pass decides by a number is here; nothing else in the directory hardcodes one.
import os from 'node:os';

export const USER_AGENT = 'sdn-supgp-omm/1.0';

export const PATHS = {
  // CelesTrak SupGP: read from our collector archive only. This code never
  // contacts celestrak.org.
  supgp: '/opt/data/sdn-archive/celestrak/supgp',
  // Derived records go under a sibling of E11's derived/ tree.
  derived: '/opt/data/sdn-archive/operator-ephemerides/derived-supgp',
  // IERS Earth orientation, archived daily (latest.json names the newest finals2000A).
  eop: '/opt/data/sdn-archive/hac',
  // The fitter (gp-error-model 0.2.0, branch task/omm-fit-20261010): its built artifact, read-only.
  fitModules: '/Users/tj/software/worktrees/space-data-network-modules--omm-fit-20261010',
  // Readers: the canonical modules checkout (main).
  readerModules: '/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules',
};

// Politeness (owner): at most 8 concurrent requests per operator host; a host
// that answers 403 or 429 is disabled for the run.
export const HTTP = { perHostConcurrency: 8, timeoutMs: 120000, retries: 3, backoffMs: [1000, 3000, 9000], prepareAttempts: 3, prepareWaitMs: 30000 };

// At most 6 worker threads (the machine is shared with another heavy lane).
export const MAX_WORKERS = 6;
export const DEFAULT_WORKERS = Math.min(MAX_WORKERS, Math.max(1, os.availableParallelism() - 1));

// The rms gate (E11): the recomputed SupGP per-coordinate RMS must reproduce
// CelesTrak's published value within max(5 m, 10 %). It is the frame guard and
// the version-pairing test. A "clean" pass is within 2 %.
export const GATE = { absoluteKm: 0.005, relative: 0.1, clean: 0.02 };

// The fit (E11): SGP4 mean elements, B* fitted, tolerance and iteration cap.
export const FIT = { tolerance: 1e-10, maxIterations: 100 };

// Starlink MEME: 60 s states, three days, about 472 bytes a state.
export const MEME = { stepSeconds: 60, spanHours: 72, bytesPerState: 480, headerBytes: 400, spareStates: 3 };
