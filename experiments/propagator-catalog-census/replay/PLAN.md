# Execution amendment — 2026-10-27: replay the complete numerical population

The earlier long-lived encoder produced memory-bound and indirect-function
failures before process isolation was introduced. Retrying only failures would
leave successful outputs from the same process lifetime unaudited. Re-execute
the entire frozen census into a separate run, retaining the original outcomes.
Every metadata-eligible source/object runs in a fresh child, through the existing
isolation worker and unchanged `processObject`, module artifacts, physical
models, estimator settings, force configuration, tolerances and scoring.
Metadata exclusions use the same registered selector. There is no spacecraft
cap, failure-based selection, timeout or numerical shortcut.

Freeze this amendment before reading its numerical results. The source run is
`catalog-epochs`; the replay run is `catalog-epochs-full-replay`. Immutable census,
weather and execution manifests are linked or copied from the source run and
verified against their recorded hashes. No prior outcome or per-arm checkpoint
is imported. Interrupted replay checkpoints may resume only under the same
numerical and amendment identities. Four fresh workers run concurrently.

All old and new arm statuses remain available. Compare every paired successful
fit and score, excluding timing, and report all differences and status
transitions. Numerical differences in previously successful outputs require
investigation; they must not be hidden by aggregate ratios. Physical fitting,
covariance and invalid-force failures remain failures unless the unchanged
module succeeds on replay. Repeated runtime failures remain visible.

Verification uses the existing full-census hash/accounting/native-lineage E2E
on the replay run and the existing direct-feed archive E2E. It additionally
proves the unchanged execution identity, complete denominator, fresh-process
provenance, and deterministic equality of all previously successful paired
fit/score results. Generate an explicit replay amendment in the aggregate report.
This amendment does not resolve missing formats, source inventory reconciliation,
Space Force XP availability, or covariance calibration.
