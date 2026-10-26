# Complete public-ephemeris propagator census

Registered 2026-10-26 before reading orbital states for this extension. The
ten-spacecraft published-reference experiment is a pilot, not evidence of
catalog-wide coverage. The owner requires every public spacecraft ephemeris
source being pulled for the combined catalog, without a spacecraft sample.

## Population and accounting

Start with every entry in the pinned 17-source provider registry, every returned
page of source inventory, and all existing agency-reference and operator-capture
archives. Census metadata and source/file hashes define a reproducible snapshot.
There is no spacecraft, source, pagination, or per-pull resource cap. A private
commercial feed is recorded as such rather than counted as public truth. A
registry entry alone is not evidence of successful acquisition.

Record per source: advertised resources, acquired files, parsed records, unique
spacecraft, data-quality class, eligible fits and horizons, completed arms,
failures, and missing/unsupported cases. Every discovered object stays in the
denominator. Distinguish unavailable ingestion from unsupported decoding,
insufficient history, absent future reference and numerical failures. Report
both source/object counts and deduplicated spacecraft counts; do not count one
spacecraft repeatedly to imply a larger population.

The census covers every discovered file and object. Numerical comparisons use
one latest eligible arc per source/object, selected from metadata before scoring:
maximize the available registered lead (7, then 3, then 1 day), then choose the
latest UTC issue with a preceding 24-hour fit. Sources with no eligible arc stay
visible. This samples forecast dates, not spacecraft. Historical periods may
already have appeared in other studies; each forecast remains held out from
its own fit.

## Evidence and numerical method

Reuse the prior study's immutable module pin, three configurations, full force
model, estimators, 10-minute fit cadence, 30-minute score cadence, 90% coverage,
45-second reference matching, causal-date weather, covariance propagation and
scoring rules. Do not cut physics or relax criteria to accelerate the census.
Use native modules for all propagation, physical frame/time conversion and
covariance geometry. Apply the existing truth gate and retain every rejection.

Precise reconstructed orbits support trajectory-accuracy measurements. Operator
near-epoch heads from subsequent versions support separately labeled
operator-reconstruction comparisons. A provider's future forecast is not
independent physical truth: within-product continuation is labeled model closure
and never pooled with reconstructed-orbit accuracy. GP/OMM-only sources remain
in the catalog census but cannot establish high-accuracy truth by themselves.
Do not splice sources, frames, time scales, uncertainties or predicted and
reconstructed portions without explicit provenance. Missing reference covariance
is reported. Maneuvers remain unless the pre-existing truth gate rejects the
underlying state; no residual-based selection is allowed.

Report accuracy and uncertainty by source, evidence class, regime and horizon.
Keep all failure rates beside paired common-support comparisons. Retain the
prior study's sample-size and object-cluster statistical rules. Runtime cost is
descriptive on this shared host; accuracy improvements do not need to justify
their speed cost. Existing Pc integral validation is separate evidence and does
not certify the enlarged population's covariance or operational collision risk.

## Execution and completion

1. Commit this plan and config before state access; freeze a complete census.
2. Reconcile live provider inventories with local archives, retaining every gap.
3. Run each eligible object through all arms using resumable, bounded workers.
4. Publish aggregate coverage, accuracy, covariance, failure and runtime reports;
   keep ephemerides, elements and per-epoch results local.
5. Replay real source paths and verify complete denominator accounting through
   one E2E, run the component gate, push and verify remote main.

An incomplete source or still-running batch is not a completed all-catalog
accuracy result. Record progress and blockers explicitly; never call the census
complete merely because its available or easy subset finished. Production
collectors, source retention and deployment are unchanged by this experiment.
