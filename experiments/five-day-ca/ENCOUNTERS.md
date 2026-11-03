# Synthetic encounter execution — 2026-11-03

Report only. Before any encounter draw, freeze seed labels
five-day-ca|<group>|<arc>|<k>, hashed SHA-256 to the existing deterministic
PRNG. Draw 20,000 encounters per group and arc, uniformly selecting one of
lead days [1,2,3,4,5,7], then a primary window and a different-object secondary
window from that same group/day/arc. Use the same draws for any paired arms.
Draw crossing angle uniformly over 10–170 degrees, true miss log-uniformly
from 10 m to 5 km, and its in-plane angle uniformly over 0–2 pi, in that order.
A13's common R axis is z; transverse velocity directions are
(cos(theta/2), -sin(theta/2), 0) and (cos(theta/2), sin(theta/2), 0).
Rotate each actual signed endpoint RTN error into that geometry, subtract
the primary error from the secondary, and add the true miss vector.
Use the module's Foster disk integral at HBR 20 m.

Hit is true miss <20 m. Alert is Pc >=1e-4. Report missed alerts both per
encounter and conditional on a hit; false alerts both per encounter and
conditional on a non-hit. Here false alert means alert with true miss >=20 m,
not A13's separate >5 km proximity endpoint (the registered support ends at
5 km). Report mean Brier loss and negative log score. An impossible hit
with Pc=0 has infinite log loss; do not clip it into a finite score. This
artificial miss population is not an estimate of operational collision rates.

S uses its window's three axis RMS values as diagonal variances, explicitly
labeled RMS STAND-IN. It uses the signed module error at the last valid
epoch in that lead bin; RMS magnitude is never substituted for that vector.
The current implementation can report S fit x fit where those archived
vectors exist, with missing-vector and insufficient-secondary counts.
It does not use FFM errors for S, nor fit covariance before carrying it.
AP, XP, FFM, U and GP results remain unmeasured until their required error
and carried-covariance products exist. The full task E2E must fail while
those products or paired score intervals remain missing; a partial S table
is not completion of the synthetic-encounter acceptance.

## Resume 5 execution amendment — 2026-11-03

COVARIANCE.md replaces the partial-S execution status above. The task's
specified covariance arms are AP, XP, FFM, S and GP. No U covariance is
specified; U remains in the forecast and reach tables. No U covariance is
invented. Every registered window stays in the draw pool, including failed
fits and absent truth, with missing primary/secondary products counted.

## A13 pair classes — 2026-11-03, before calibrated encounter draws

Execute both A13 classes on identical registered draws: fit x fit (the
secondary uses the primary's arm) and fit x GP (the secondary always uses
its cutoff-available public GP set). In either class the GP primary is the
GP x GP reference. Report the class beside every rate and paired score;
its repeated GP reference is identified, not pooled as independent data.
The old partial S table covered fit x fit only. This completes the requested
A13 comparison without changing windows, geometry, seeds or thresholds.

## Common comparison axes — 2026-11-03, before calibrated encounter draws

Form C2/C3 covariance in the predicted state's RTN axes, as calibrated.
Retain the module's predicted and truth states, then use gp-error-model
pair_statistics to rotate the completed covariance and signed error into
truth RTN before applying the common encounter geometry. This matches A13's
lead-record convention and keeps every paired arm in the same frame. S and
GP already use truth RTN. No JavaScript frame rotation is introduced.
