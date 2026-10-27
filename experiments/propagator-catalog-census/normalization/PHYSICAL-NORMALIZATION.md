# Physical normalization admission

Register before converting the direct snapshot into scoring arcs. Preserve the
original census, oracle extension, native inventory and Starlink fidelity run.

Use the frozen module revision cb22348f2c674e8920716af09f7ca2a6a87f5f28 for
reference-states, frames and time. Pin their artifacts, manifests, host adapters,
identity reconciliation and EOP bytes before invoking the conversion. The
Starlink parser correction is a separate pinned input, not a silent module
upgrade. Retain all original samples and covariance in their declared frames.

For all 134 discovered SP3 resources, use the native reference-states module
with exact source NCD descriptors, per-epoch flags and time-valid identifiers.
Retain failures for every resource and object. Use only uncertainty explicitly
present in SP3 records/header; absent uncertainty is unavailable. Do not supply
the old operator reader's placeholder sigma. A native whole-product failure
may be diagnosed per object, with the complete failed and successful object
denominators retained; never choose objects using their later fit residuals.

Retrieve public IERS/USNO finals2000A data directly and preserve HTTP receipt,
issue metadata, SHA-256 and every observation/prediction flag. The native EOP
parser carries provenance to the native frame/time conversion. Require rows
bracketing every converted epoch, with no extrapolation. Report separately any
use of predicted EOP; never relabel predictions as observations. Native
interpolation uses UT1-TAI continuity and the native leap-second table.

The existing native reference conformance criteria remain fixed: Vallado's
published transformation example and SOFA's published matrix tolerances from
the module verification. Admission additionally requires finite and ordered
output, exact identity/source linkage, no unaccounted dropped states, and
explicit uncertainty and source-quality classification. Derivative velocities
use the native degree-9, gap-guarded interpolation, with its stated truncation
diagnostic; zero padding in position-only readers is never a measurement.

For inertial operator products, transform selected actual epochs with native
frames/time. Keep original covariance and its frame even when a downstream
covariance transformation is unavailable; such a case has unavailable converted
covariance, not zero covariance. No host-language orbital transformations.
Earth-fixed operator formats require their own declared frame and native
derivative path before admission. Unresolved identities and formats remain
visible and may not be assigned synthetic global catalog identifiers.

New numerical arcs retain the previously registered 24-hour fit, actual-epoch
sampling, 1/3/7-day leads and 90% coverage requirements. Reconstructed SP3
samples, mixed rapid/ultra-rapid predictions, operator forecasts and daily
operator reconstructions remain separate evidence strata. A single forecast's
continuation measures model closure only. No residual-based exclusions, relaxed
convergence tolerances or covariance-calibration pass from position accuracy.

References: [IERS finals](https://datacenter.iers.org/data/9/finals2000A.all),
[USNO format](https://maia.usno.navy.mil/ser7/readme.finals2000A),
[SOFA Earth Attitude](https://www.iausofa.org/s/sofa_pn_c.pdf),
[SP3-d](https://gssc.esa.int/wp-content/uploads/2018/07/sp3d.pdf).
