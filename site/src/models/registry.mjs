// The models: one per paper section that makes a computational or
// quantitative claim. `heading` is the section's heading text in the paper's
// markdown; the build slugs it as docs/build-whitepapers.mjs does and checks
// the paper has it. `model` names site/src/models/<paper>/<model>.js.
// `modules`: what the page runs (SDN modules by path, or a package).
export const PAPERS = {
  'evidence-supported-aso-catalog': 'Evidence-Supported ASO Catalog',
  'fast-conjunction-assessment': 'Fast All-vs-All Conjunction Screening',
  'adversarial-security': 'Persistent Adversarial Security',
};

export const MODELS = [
  // Evidence-Supported ASO Catalog
  { paper: 'evidence-supported-aso-catalog', heading: 'Vimpel osculating elements', model: 'osculating-elements', title: 'Osculating elements to a J2000 state',
    claim: 'Osculating elements convert to a Cartesian state at the same epoch: no propagation.', modules: ['foundation/orbits'] },
  { paper: 'evidence-supported-aso-catalog', heading: 'The handoff contract', model: 'handoff', title: 'An OMM handed to a numerical propagator',
    claim: 'SGP4 at zero elapsed time, TEME to GCRF with a round-trip check, then HPOP from that state.', modules: ['analysis/epoch-state', 'propagator/hpop', 'foundation/time'] },
  { paper: 'evidence-supported-aso-catalog', heading: 'Levels of measurement of OMM elements', model: 'tle-quantization', title: 'What one OMM digit is worth',
    claim: 'One encoding increment of each OMM field moves the SGP4 state by a bounded amount: about 12 m for the angles.', modules: ['analysis/epoch-state', 'propagator/hpop'] },
  { paper: 'evidence-supported-aso-catalog', heading: '16.2 Uncertainty estimation and propagation', model: 'ocm-covariance', title: 'OCM fields, and covariance through the STM',
    claim: 'P(t) = Φ P₀ Φᵀ: an initial covariance carried by HPOP’s state-transition matrix; the OCM is its carrier.', modules: ['files/orbit-products', 'foundation/frames', 'propagator/hpop'] },
  { paper: 'evidence-supported-aso-catalog', heading: '17.1 Agreement with Orekit', model: 'orekit', title: 'HPOP against Orekit 13.1',
    claim: '63 matched cases agree within 15 mm over a day; any one re-runs here from its exact request.', modules: ['propagator/hpop'] },
  { paper: 'evidence-supported-aso-catalog', heading: '17.2 Accuracy against precise orbits', model: 'precise-orbits', title: 'HPOP against precise orbits',
    claim: 'From a precise state, every modeled force: about 5 m after a day for the SLR spheres.', modules: ['propagator/hpop', 'foundation/time'] },
  { paper: 'evidence-supported-aso-catalog', heading: '17.3 Vector Covariance Message parity', model: 'vcm', title: 'VCM fields, read, propagated, written',
    claim: 'The adapter reads a VCM into a PRW request, HPOP carries its 7×7 covariance, and the adapter writes it back.', modules: ['analysis/vcm-adapter', 'propagator/hpop', 'files/orbit-products'] },
  { paper: 'evidence-supported-aso-catalog', heading: '17 Measured propagation evidence', model: 'experiments', title: 'E1, E2 and E3 results',
    claim: 'Each experiment’s committed metrics, when its run is published.', modules: [] },
  { paper: 'evidence-supported-aso-catalog', heading: '17.4 Evidence baseline and reproduction', model: 'baseline', title: 'The binaries this page runs',
    claim: 'The HPOP binary the paper names is the one this site serves, byte for byte.', modules: ['propagator/hpop'] },

  // Fast All-vs-All Conjunction Screening
  { paper: 'fast-conjunction-assessment', heading: '1 The problem', model: 'all-pairs', title: 'All-vs-all is n(n − 1)/2 pairs',
    claim: 'The module screens every pair of a catalog; the count grows with the square of its size.', modules: ['analysis/conjunction-assessment'] },
  { paper: 'fast-conjunction-assessment', heading: 'Self-bounded motion', model: 'motion-bound', title: 'The bound each sample carries',
    claim: 'An SGP4 sample stays within ½ A h² of its straight line, A = 1.05 μ / r²_min.', modules: ['analysis/conjunction-assessment'] },
  { paper: 'fast-conjunction-assessment', heading: 'Step size', model: 'step-size', title: 'Step size trades sampling for candidates',
    claim: 'The candidate test is exhaustive at any step: every step reports the same conjunctions.', modules: ['analysis/conjunction-assessment'] },
  { paper: 'fast-conjunction-assessment', heading: 'Refinement', model: 'refinement', title: 'Refining a close approach',
    claim: 'The TCA and miss distance do not depend on the coarse step that found the encounter.', modules: ['analysis/conjunction-assessment'] },
  { paper: 'fast-conjunction-assessment', heading: '7 Uncertainty and probability of collision', model: 'alfano', title: 'The Alfano maximum probability',
    claim: 'Without covariance, an event reports the largest probability any covariance size could give.', modules: ['analysis/conjunction-assessment'] },
  { paper: 'fast-conjunction-assessment', heading: 'Covariance probability on screened events', model: 'probability', title: 'Probability and dilution',
    claim: 'With covariance, Foster’s probability; it falls as the covariance grows past the dilution threshold.', modules: ['analysis/conjunction-assessment'] },

  // Persistent Adversarial Security
  { paper: 'adversarial-security', heading: '2.1 Core Mechanism', model: 'one-key', title: 'One key: signatures and addresses',
    claim: 'One key pair signs data and derives the addresses that hold its bond.', modules: ['hd-wallet-wasm'] },
  { paper: 'adversarial-security', heading: '3.1 The Security Bond as a Commitment Device', model: 'bond', title: 'When a bond is credible',
    claim: 'B > P(detection) × C(fraud) + P(¬detection) × G(fraud).', modules: [] },
  { paper: 'adversarial-security', heading: '3.2 M-of-N Funding as Distributed Trust', model: 'payoff', title: 'The bond’s payoff matrix',
    claim: 'Funding the bond pays for honest claimants and does not pay for dishonest ones.', modules: [] },
  { paper: 'adversarial-security', heading: '5.1 Cross-Domain Identity Binding', model: 'binding', title: 'Binding an X.509 key to a wallet key',
    claim: 'A secp256k1 wallet key signs a certificate’s P-256 key; anyone can verify the binding.', modules: ['hd-wallet-wasm'] },
  { paper: 'adversarial-security', heading: '5.3 Key Rotation and Temporal Dynamics', model: 'trust-decay', title: 'Trust decay with key age',
    claim: 'trust_decay(t, T) = max(0, 1 − (t / T)²).', modules: [] },
  { paper: 'adversarial-security', heading: '7. Implementation', model: 'chains', title: 'One seed, six networks',
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
