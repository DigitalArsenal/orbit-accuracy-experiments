// Modules published by the site. Importing this list performs no build work.
export const moduleList = ['propagator/ffm', 'foundation/time', 'analysis/vcm-adapter', 'analysis/epoch-state', 'foundation/orbits',
  'foundation/frames', 'files/orbit-products', 'analysis/conjunction-assessment',
  // The orbit-determination pages (site/src/od).
  'analysis/observation-simulator', 'analysis/access', 'analysis/association', 'analysis/estimation',
  // The catalog paper's section 4 and 5 pages.
  'analysis/maneuver-detection', 'analysis/od', 'propagator/sgp4'];
// Modules published from an exact commit of the modules repository, whatever
// commit the rest are built from, and checked against their SHA-256: the
// SDN-AP paper's pages run the build the paper's site pins.
export const pinnedModules = [
  { path: 'propagator/sdn-ap', commit: '3212a4b29c8cb5e9f33d356f9278e386bde062f1', wasmSha256: '0e06d0090e62cfd2ada62e524e21dfe42284243fc26a3b32aa0847dc9ea36140' },
];
