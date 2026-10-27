# Space Force reference extension to the frozen catalog census

Registered 2026-10-27 before evaluating this extension. Preserve the completed
catalog run and its full process replay. The separate SDN-AP conformance study
already established a working USSF Sgp4Prop 9.9 black-box interface; do not
repeat that study or treat the earlier pilot WASM failure as current access
evidence. This extension measures the reference on the census's actual arcs.

## Population and fixed inputs

Use every one of the frozen census's 57,413 source/object identities and the
same selected arcs, modules commit cb22348f2c674e8920716af09f7ca2a6a87f5f28,
truth gate, fit cadence, scoring epochs, horizons and source classifications.
No object cap or residual-based selection. Preserve metadata exclusions,
unsupported formats, partial reference failures and all failed fits explicitly.
This does not close the separate direct-feed normalization/coverage gaps.

Reuse the original and replay outcomes for the completed XP/AP/FFM arms. Those
outcomes did not retain complete fitted element sets. Reconstruct only the
registered XP fit needed to obtain the missing reference input; require its
epoch, comment, BTERM and AGOM to equal the existing completed outcome before
admitting the new comparison. Save reconstructed elements locally for replay.
Do not rerun FFM or overwrite any previous outcome or source.

## Reference and comparable inputs

The unmodified USSF 9.9 native Apple-silicon library is accessed only through
the established black-box harness (closed-modules commit
7eaa8ab0e3fe7bb046919c7ba2e4df2fefa0f60f). Its published package SHA-256 is
fe686600c4d0089bef14f63a347ae011e34369afa4afcdc651f90efa597b430d.
Never read its internals or redistribute the package or private harness.

That interface consumes type-4 TLE text. Serialize the recovered XP fit using
the already-pinned public conformance helper, then give the same quantized
elements and exact minutes from their quantized epoch to both implementations.
Use a synthetic five-digit identifier only for this interface; keep the real
source/object identity unchanged in all records. Reject unrepresentable TLE
fields explicitly. Evaluate whiteroom XP from the same quantized element row,
separately from the existing full-precision fit results, so text precision
cannot masquerade as a propagator difference.

The official states are TEME, km and km/s. Transform and score using the frozen
native frame and error-statistics modules, at the original actual UTC epochs.
Retain each library error, absent state, epoch and every paired denominator.
USSF supplies no propagated covariance here: report it as unavailable, never
borrow the whiteroom covariance or infer calibration from state agreement.

## Numerical and statistical criteria fixed before scoring

- Exact recovered-fit metadata agreement is an input reproducibility gate.
- Exact sample counts/epochs and finite valid states are required per result.
- The existing conformance study's 1 m per-sample strict bound is reported for
  this corpus; every exceedance remains visible and requires investigation.
  Do not import a conformance exception without establishing its conditions.
  State agreement is separate from accuracy against reference ephemerides.
- Preserve the census's existing position/RIC error definitions and paired
  object-cluster bootstrap (2,000 resamples, 95% intervals); no retuning to the
  new results. Report horizon/source/evidence denominators and common support.
- Do not combine operator reconstruction, independent reconstructed truth,
  model closure or unknown reference covariance into a truth-calibrated claim.
- Runtime measurements are descriptive: native USSF and browser-hosted WASM
  are different execution environments. No speed superiority claim follows
  from that comparison, and accuracy is not traded for throughput.

## Reproduction and completion

Freeze code/input hashes in a separate extension manifest. Write resumable,
per-object outcomes and local fitted inputs; never reuse an outcome from a
different manifest. Verify all identities, source files and per-arm status
accounting, replay actual reference calls for each available reader lineage,
and reproduce aggregate values before landing. Published results contain
aggregates and provenance; orbital inputs and provider binaries stay local.

This extension is a checkpoint within the all-catalog goal. Incomplete source
normalization, covariance calibration and conjunction model validity remain
explicitly unfinished after a successful reference comparison.

## Adapter preflight amendment

The first nine-lineage preflight produced no accepted accuracy results: the
existing covariance-statistics method requires a predicted covariance. Use the
same pinned native frame module's state transform into a truth-centered RTN
frame to calculate geometric residuals without any covariance input. The
same-frame Cartesian distance follows the completed conformance harness's
definition. Keep the failed preflight separately; retain all criteria and
population rules. A nonrepresentable type-4 element set remains a visible
interface failure, not an excluded spacecraft.

The second preflight traced the CNES interface failure to the public test
writer's assumption of a normalized five-digit mantissa: a small fitted AGOM
required a two-digit exponent, shifting the fixed-width fields. Preserve the
failed preflight and interrupt the new full runner before native workers begin.
Encode subnormal TLE numbers with leading mantissa zeroes and exponent -9;
round only below half the format's least representable 1e-14 to zero. This is
the declared text quantization, applied identically to both XP implementations.
Overflow remains an explicit error. The registered orbit/uncertainty criteria
are unchanged; this amendment fixes serialization, not fit parameters.
