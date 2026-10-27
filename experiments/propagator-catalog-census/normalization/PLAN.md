# Direct-feed normalization and population reconciliation

Registered 2026-10-27 before this extension decodes orbital states. Preserve the
completed frozen census and its reference extension. Use all 11,771 resources
in the retained direct-20261026-r2 discovery queue, all 17 registry entries and
the existing archive census. No spacecraft, file or per-source sample cap.

## Accounting and identity

Hash the queue, receipts and raw bytes; retain every download error and access
restriction. Report URL aliases, identical content, repeated versions and
source/object identities separately from unique resolved spacecraft. Match
numeric identifiers only when supplied by the source or an explicitly pinned
crosswalk. Preserve unresolved identifiers and collisions; never invent a
NORAD ID or resolve a spacecraft by a loose name match.

Recheck the two failed anonymous resources separately, retaining both the old
failure and the new retrieval outcome. The four credential-required registry
entries retain their existing archived coverage and explicit access gaps. No
credential files, production node, deployment or service restart is involved.

## Native readers and physical meaning

Reuse already-validated readers and frame/time modules at the census's frozen
module revision. File decompression, fixed-format parsing adapters and typed
wire framing may run in the host; orbital propagation, differentiation,
interpolation and physical frame/time conversion remain native. Preserve the
source's frame, time scale, units, covariance and validity flags until each
conversion is proven. Unknown frame/time semantics remain an explicit failure.
Never derive a covariance from stated positional digits or model agreement.

Inventory every state/block and source-declared identity first. High-accuracy
reconstructed products, mixed rapid products, operator forecasts, operator
near-epoch reconstructions, catalog TLEs, and coarse center-of-box information
have different evidential meanings. A single forecast's continuation can only
measure model closure. It cannot become independent physical truth merely
because a parser returned states. Separate reconstructed and predicted SP3
flags explicitly; keep mixed/unknown classification where the file is unclear.

## Fixed validation and admission criteria

- All discovered resources have one terminal normalization/accounting record.
  Unsupported formats and read failures remain in every population denominator.
- No out-of-bounds or nonfinite decoded state, silent identity loss, unknown
  unit assumption, or undeclared time/frame conversion is admitted.
- Native readers retain their existing authoritative conformance criteria;
  parser changes require their original independent reference E2E. Do not
  replace those tests with self-generated golden values.
- GCRF/UTC/SI normalization uses the frozen native modules and bounded,
  provenance-recorded EOP/time inputs. Preserve missing covariance as missing.
- Reuse existing normalized source bytes when their raw-product hash matches;
  do not recompute completed scientific results. For newly admitted arcs,
  retain the original 24-hour fit, actual-epoch sampling, source chronology,
  truth gate, held-out horizons and 90% coverage criteria.
- Report accuracy, covariance calibration and collision-risk validation
  separately. Source completeness never substitutes for numerical correctness.

## Reproduction

Commit executable adapters and input identities before full numerical scoring.
Persist raw receipts and normalized bytes locally with hashes; publish aggregate
coverage, identity and failure reports only. Verify complete accounting and
replay actual reader paths for every admitted format. Unsupported or unavailable
evidence is not a pass and does not close the broader catalog goal.
