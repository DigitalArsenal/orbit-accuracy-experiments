# SGP4 request-grid correction

2026-11-03: the first six-lead run changed old SGP4 values by up to
2.3 mm in the first comparison. AP, XP and U were exact there. The runner
now preserves the original SGP4 start and stop request from entered days
1, 2, 3 and 7, and requests entered days 4 and 5 separately. No fit,
physics, epoch, truth, coverage rule or acceptance threshold changes.
The interrupted diagnostic rows remain in the archive at diagnostic-grid-v1.
