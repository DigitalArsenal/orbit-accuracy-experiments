// The models: one per paper section that makes a computational or
// quantitative claim. `heading` is the section's heading text in the paper's
// markdown; the build slugs it as docs/build-whitepapers.mjs does and checks
// the paper has it. `model` names site/src/models/<paper>/<model>.js (or
// `source`, a paper directory, when the section moved papers), or
// site/src/od/<model>.js with `dir: 'od'` (the orbit-determination scenario
// of site/build-od.mjs). `url` keeps a page's address when its section moves.
// `modules`: what the page runs (SDN modules by path, or a package).
export const PAPERS = {
  'evidence-supported-aso-catalog': 'Evidence-Supported ASO Catalog',
  'fast-conjunction-assessment': 'Fast All-vs-All Conjunction Screening',
  'provenance-and-security': 'Provenance and Security in Space Data Network',
  'adversarial-security': 'Persistent Adversarial Security',
};

const CATALOG = 'evidence-supported-aso-catalog';
const SCREEN = 'fast-conjunction-assessment';
const PROVENANCE = 'provenance-and-security';
const SECURITY = 'adversarial-security';
const SIMULATION = ['analysis/observation-simulator', 'foundation/frames', 'propagator/hpop'];

export const MODELS = [
  // Evidence-Supported ASO Catalog
  { paper: CATALOG, heading: '2 Evidence model', url: 'models/evidence-supported-aso-catalog/2-evidence-model-and-records.html', dir: 'od', model: 'batch-fit', title: 'A solution from observations, with its covariance',
    claim: 'Radar, optical and RF observations of a GPS satellite, their measurement models, HPOP’s dynamics and a weighted least-squares fit: the solution and its covariance against the IGS orbit.',
    modules: [...SIMULATION, 'analysis/estimation'] },
  { paper: CATALOG, heading: 'Vimpel osculating elements', model: 'osculating-elements', title: 'Osculating elements to a J2000 state',
    claim: 'Osculating elements convert to a Cartesian state at the same epoch: no propagation.', modules: ['foundation/orbits'] },
  { paper: CATALOG, heading: 'The handoff contract', model: 'handoff', title: 'An OMM handed to a numerical propagator',
    claim: 'SGP4 at zero elapsed time, TEME to GCRF with a round-trip check, then HPOP from that state.', modules: ['analysis/epoch-state', 'propagator/hpop', 'foundation/time'] },
  { paper: CATALOG, heading: 'Levels of measurement of OMM elements', model: 'tle-quantization', title: 'What one OMM digit is worth',
    claim: 'One encoding increment of each OMM field moves the SGP4 state by a bounded amount: about 12 m for the angles.', modules: ['analysis/epoch-state', 'propagator/hpop'] },
  { paper: CATALOG, heading: '5.1 GNSS and laser-ranged satellites', model: 'gnss', title: 'A GPS orbit from its analysis-centre state, beside the OMM',
    claim: 'The analysis-centre state carried a week by HPOP against the IGS final orbit, beside where the public OMM’s position lies (E3’s medians).',
    modules: ['propagator/hpop'] },
  { paper: CATALOG, heading: '5.2 Operator- and provider-ephemeris objects', model: 'operator-ephemeris', title: 'The ISS’s operator ephemeris against the public products',
    claim: 'SGP4 on the latest public OMM and HPOP from its epoch state: each one’s median offset from NASA’s own trajectory, by horizon (E4).',
    modules: [] },
  { paper: CATALOG, heading: '5.5 Maneuver detection', model: 'maneuver', title: 'The ISS reboost the detector found',
    claim: 'The reboost of 25 September 2026, found in the public element sets, checked against NASA’s next trajectory, and where it put the station a day later.',
    modules: ['analysis/maneuver-detection', 'propagator/hpop', 'foundation/frames'] },
  { paper: CATALOG, heading: '6 Uncertainty', model: 'ocm-covariance', title: 'Covariance through HPOP’s state-transition matrix',
    claim: 'P(t) = Φ P₀ Φᵀ: an initial covariance carried a day by HPOP’s state-transition matrix; the OCM is its carrier.', modules: ['files/orbit-products', 'foundation/frames', 'propagator/hpop'] },
  { paper: CATALOG, heading: 'Agreement with Orekit', model: 'orekit', title: 'HPOP against Orekit 13.1',
    claim: 'Matched cases on five orbits, identical states, forces and constants, compared hourly over a day; any one re-runs here from its exact request.', modules: ['propagator/hpop'] },
  { paper: CATALOG, heading: 'Accuracy against precise orbits', model: 'precise-orbits', title: 'HPOP against precise orbits',
    claim: 'From a precise state, every modeled force: about 5 m after a day for the laser-ranged spheres.', modules: ['propagator/hpop-v1', 'foundation/time'] },
  { paper: CATALOG, heading: '8 Association and selection', dir: 'od', model: 'association', title: 'Associating observations with the catalog',
    claim: 'Each observation gated against every catalog prediction by its Mahalanobis distance, assigned scan by scan; what fits nothing is an uncorrelated track.',
    modules: ['analysis/observation-simulator', 'analysis/association'] },
  { paper: CATALOG, heading: '9 SP message interchange', model: 'vcm', title: 'VCM fields, read, propagated, written',
    claim: 'The adapter reads a VCM into a PRW request, HPOP carries its 7×7 covariance, and the adapter writes it back.', modules: ['analysis/vcm-adapter', 'propagator/hpop', 'files/orbit-products'] },
  { paper: CATALOG, heading: '10 Measured accuracy', url: 'models/evidence-supported-aso-catalog/11-measured-accuracy.html', model: 'measured-accuracy', title: 'Measured accuracy, by object class and age',
    claim: 'Median errors against precise orbits: the catalog’s product beside the public OMM, at issue and 1, 3 and 7 days later.', modules: [] },
  { paper: CATALOG, heading: '11 What conjunction assessment consumes', url: 'models/evidence-supported-aso-catalog/12-what-conjunction-assessment-consumes.html', dir: 'od', model: 'conjunction', title: 'A conjunction from fitted covariances',
    claim: 'The fitted orbit and its covariance carried to a close approach; the combined covariance gives the probability of collision.',
    modules: [...SIMULATION, 'analysis/estimation', 'analysis/conjunction-assessment'] },

  // Fast All-vs-All Conjunction Screening
  { paper: SCREEN, heading: '1 The problem', model: 'all-pairs', title: 'All-vs-all is n(n − 1)/2 pairs',
    claim: 'The module screens every pair of a catalog; the count grows with the square of its size.', modules: ['analysis/conjunction-assessment'] },
  { paper: SCREEN, heading: 'Self-bounded motion', model: 'motion-bound', title: 'The bound each sample carries',
    claim: 'An SGP4 sample stays within ½ A h² of its straight line, A = 1.05 μ / r²_min.', modules: ['analysis/conjunction-assessment'] },
  { paper: SCREEN, heading: 'Spatial grid', model: 'spatial-grid', title: 'The grid proposes the candidate pairs',
    claim: 'Each sample’s segment, widened by d/2 + D, is a box; only boxes that overlap in the grid can pass the test.', modules: ['analysis/conjunction-assessment'] },
  { paper: SCREEN, heading: 'Refinement', model: 'refinement', title: 'Refining a close approach',
    claim: 'The TCA and miss distance do not depend on the coarse step that found the encounter.', modules: ['analysis/conjunction-assessment'] },
  { paper: SCREEN, heading: 'Step size', model: 'step-size', title: 'Step size trades sampling for candidates',
    claim: 'The candidate test is exhaustive at any step: every step reports the same conjunctions.', modules: ['analysis/conjunction-assessment'] },
  { paper: SCREEN, heading: '7 Uncertainty and probability of collision', model: 'alfano', title: 'The Alfano maximum probability',
    claim: 'Without covariance, an event reports the largest probability any covariance size could give.', modules: ['analysis/conjunction-assessment'] },
  { paper: SCREEN, heading: 'Covariance probability on screened events', model: 'probability', title: 'A screened pair at TCA, with its covariances',
    claim: 'The empirical model gives each object the covariance of its stratum at the TCA’s prediction age; Foster’s probability follows, and falls past the dilution threshold as the covariance grows.',
    modules: ['analysis/conjunction-assessment'] },
  { paper: SCREEN, heading: 'Propagated and fitted covariance', dir: 'od', model: 'ekf-ukf', title: 'EKF and UKF: covariance through the pass',
    claim: 'Observations of a GPS satellite through an extended and an unscented Kalman filter: how each covariance shrinks, and where they differ.',
    modules: [...SIMULATION, 'analysis/estimation'] },

  // Provenance and Security in Space Data Network
  { paper: PROVENANCE, heading: '3 Publication and reproduction', source: CATALOG, url: 'models/evidence-supported-aso-catalog/10-publication-and-reproduction.html',
    model: 'baseline', title: 'A V1 seed, reproduced here',
    claim: 'The HPOP binary the paper names, served byte for byte, reproduces V1’s committed errors exactly.', modules: ['propagator/hpop-v1', 'foundation/time'] },

  // Persistent Adversarial Security
  { paper: SECURITY, heading: '2.1 Core Mechanism', model: 'one-key', title: 'One key: signatures and addresses',
    claim: 'One key pair signs data and derives the addresses that hold its bond.', modules: ['hd-wallet-wasm'] },
  { paper: SECURITY, heading: '3.1 The Security Bond as a Commitment Device', model: 'bond', title: 'When a bond is credible',
    claim: 'B > P(detection) × C(fraud) + P(¬detection) × G(fraud).', modules: [] },
  { paper: SECURITY, heading: '3.2 M-of-N Funding as Distributed Trust', model: 'payoff', title: 'The bond’s payoff matrix',
    claim: 'Funding the bond pays for honest claimants and does not pay for dishonest ones.', modules: [] },
  { paper: SECURITY, heading: '5.1 Cross-Domain Identity Binding', model: 'binding', title: 'Binding an X.509 key to a wallet key',
    claim: 'A secp256k1 wallet key signs a certificate’s P-256 key; anyone can verify the binding.', modules: ['hd-wallet-wasm'] },
  { paper: SECURITY, heading: '5.3 Key Rotation and Temporal Dynamics', model: 'trust-decay', title: 'Trust decay with key age',
    claim: 'trust_decay(t, T) = max(0, 1 − (t / T)²).', modules: [] },
  { paper: SECURITY, heading: '7. Implementation', model: 'chains', title: 'One seed, six networks',
    claim: 'BIP-32/44 and SLIP-10 derivation from one BIP-39 seed, checked against published vectors.', modules: ['hd-wallet-wasm'] },
];

// GitHub-style heading ids, exactly as docs/build-whitepapers.mjs makes them
// (duplicates numbered in document order).
export function headingIds(markdown) {
  const seen = new Map();
  const ids = new Map();
  let fence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    const m = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/\*\*|__|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    const base = text.toLowerCase().trim().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    if (!ids.has(text)) ids.set(text, n ? `${base}-${n}` : base);
  }
  return ids;
}
