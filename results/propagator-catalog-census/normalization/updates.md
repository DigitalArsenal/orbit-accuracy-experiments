# Direct-feed reconciliation checkpoints

The [original inventory](README.md) is immutable evidence of its pinned reader.
The following amendments resolve specific gaps without relabeling that old
reader or restarting completed model comparisons. Overall scientific comparison
and operational covariance calibration remain incomplete.

- [Starlink source fidelity](starlink-fidelity.json): all 11,163 products,
  47,989,471 state/covariance epochs, 287,936,826 state components and
  1,007,778,891 covariance components matched the source. The independent
  verifier rehashed every input and output and reconciled the native inventory.
  Module commit `cc64880aee735ed7b3cdf36d7a3d1fabbbf463c4` preserves EME2000,
  UTC and declared covariance axes. This is a reader-fidelity pass, not a
  calibration or collision-probability pass.
- [SP3 physical conversion](sp3-physical.json): all 134 resources accounted
  for; 6,613 source/object rows converted and one retained missing-uncertainty
  failure. There are 2,731,165 converted states and 1,057,728 samples explicitly
  marked as predictions. SOFA matrix error is `2.6645352591003757e-15`, below
  the fixed `1e-12` criterion. Prediction flags and EOP quality stay intact.
- [Identity reconciliation](identity-summary.json) and
  [prior-work coverage](prior-work-coverage.json) retain source-local IDs,
  numeric candidates, duplicate/version distinctions and prior failures.
  Planet's candidate catalog crosswalk is unverified; a zero catalog field
  does not identify a spacecraft. Hardware IDs remain the source identity.
- [SES's explicit listing/TLE history](ses-identity-history.json) resolves
  40 downloaded products. SES-17's ephemeris and TLE both returned HTTP 403.
  Multiple dated TLE sets are accepted only when all have the same valid
  catalog identity; the original strict-parser outcomes remain available.

The collector's `energyEarthOrientation` note applies to its separate energy
diagnostic. Its stored position truth uses the native EME2000-to-GCRF frame-bias
transform, which does not need Earth orientation. The coverage audit records
this distinction; it does not attribute the energy convention to position
residuals. Historical operator-head comparisons retain their original epochs
and cannot be presented as results on the newer direct-feed snapshot.

The separately landed FFM covariance correction is
`5746b0f53504d4d8a83c4ec7921f4a34b85901a6` (2.0.1). A real fitted matrix
rejected by the old mixed-unit tolerance has positive 70-digit Cholesky pivots.
The corrected validator preserves the input while checking a dimensionless
matrix; independent force-free propagation and invalid-input checks pass in
browser and WasmEdge. This does not repair empirical calibration by itself.
The [registered bounded-fit arm](../../../experiments/propagator-catalog-census/ffm-bounded/PLAN.md)
evaluates all previously admitted arcs with physical coefficient bounds and
the same convergence tolerance. Original census results remain unchanged.

Reproduce the fidelity verification with
`node experiments/propagator-catalog-census/normalization/verify-starlink.mjs`;
the other JSON records identify their scripts, frozen inputs and source hashes.
No production service was deployed or restarted for these checkpoints.
