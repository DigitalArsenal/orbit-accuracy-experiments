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
