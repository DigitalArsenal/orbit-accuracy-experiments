# SGP4 request-grid correction

2026-11-03: the first six-lead run changed old SGP4 values by up to
2.3 mm in the first comparison. AP, XP and U were exact there. The runner
now preserves the original SGP4 start and stop request from entered days
1, 2, 3 and 7, and requests entered days 4 and 5 separately. No fit,
physics, epoch, truth, coverage rule or acceptance threshold changes.
The interrupted diagnostic rows remain in the archive at diagnostic-grid-v1.

2026-11-03 resume 4: the expanded audit found 200 USSF scalar differences,
up to 0.0000020110402893513957 km. U now preserves the original [1,2,3,7]
request grid, just as S does, and flies [4,5] separately from the same fit.
Affected prior rows must be replayed and reproduce exactly before acceptance.

Before the first FFM flight, its original and added grids are also requested
separately from the identical fit, preserving the old integrator query path.

2026-11-03 resume 5: the coordinator accepts the Space Force library's
measured query-order dependence up to 1 m per U scalar, with count and
maximum reported, as registered in FIVE-DAY.md. AP, XP, S and F retain
exact equality. This replaces the preceding U exact-replay requirement.
