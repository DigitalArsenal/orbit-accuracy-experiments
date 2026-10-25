// Modules published by the site. Importing this list performs no build work.
export const moduleList = ['propagator/ffm', 'foundation/time', 'analysis/vcm-adapter', 'analysis/epoch-state', 'foundation/orbits',
  'foundation/frames', 'files/orbit-products', 'analysis/conjunction-assessment',
  // The orbit-determination pages (site/src/od).
  'analysis/observation-simulator', 'analysis/access', 'analysis/association', 'analysis/estimation',
  // The catalog paper's section 4 and 5 pages.
  'analysis/maneuver-detection', 'analysis/od', 'propagator/sgp4'];
// Modules published from an exact commit of the modules repository, whatever
// commit the rest are built from, and checked against their SHA-256.
export const pinnedModules = [
  { path: 'propagator/sdn-ap', commit: '2c03c36ba38c4b9215af2ab7096e70b2b5c26171', wasmSha256: '74fbb9a89082c23f70aae061435f2bc1db0c716e07cc6054b1eef41ad2028f81' },
];
