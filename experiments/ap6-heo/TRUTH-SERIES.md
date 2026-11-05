# TESS truth series

Every TESS window (HE) and both TESS worked examples read one series: the MAST definitive kernels `TESS_EPH_DEF_*.bsp` through
`experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs` (`spkObjectSeries`; states by files/orbit-products `read_container`, epochs by
foundation/time), newer files taking over from their first state (13:00 UTC).

## Cause

The kernels (SPK type 9, degree 7) store a state every minute, but only one in ten is an orbit state. The nine between lie on the straight
line between those ten-minute nodes, position and velocity alike: their second differences are zero to the kernel's precision. On the 300 s
lattice the fits and the scorer use, every other state is such a chord point, inside the orbit by GM/r^2 x 600^2 / 8 (0.45 km at 200,000 km,
1.1 km at the span's lowest perigee, 127,000 km). Each forecast's offset from that series alternates sample to sample by the same amount, whatever the propagator: the
examples' first-axis wiggle (second differences 1,129, 643 and 287 m at samples 500, 1,500 and 2,500 of `truth-highly-elliptical-tess`).
SGP4's own error hides it. The offset frame is not involved: the radial axis depends on the reference position alone. The time scale is
not involved: the nodes sit on the ten-minute UTC lattice to the microsecond.

## Fix

The reader keeps each segment's nodes (`nodeRows`): a record whose position and velocity second differences with both neighbors are below
1 mm and 1 um/s is on a chord and dropped; the rest are the nodes, at one cadence and phase, and a segment's end records are kept on that
phase. A kernel with no chord records (THEMIS, Chandra) is read as before. The TESS series becomes one state every 600 s; the scorer's
grid follows the product's spacing, and the example writer's eight-point Lagrange fills its 300 s lattice from the nodes.

## Registered bound

On equally spaced states h apart, |r(+h) - 2r + r(-h) - (v(+h) - v(-h)) h/2| <= 5 m. The truncation term h^4/12 |d2a/dt2| is below
1 mm for TESS at h <= 600 s; the kernels' velocity steps (about 1 cm/s at apsides) add at most dv h/2 = 3 m at 600 s. A triple that straddles
a solution switch holds the step between two definitive solutions (12 to 221 m over the span), not the orbit's curvature: those are counted
and sized apart, as are the example lattice's stencils within four nodes of one. The joins are reported, not removed.

E2E: `node experiments/ap6-heo/truth-series.e2e.mjs`.
