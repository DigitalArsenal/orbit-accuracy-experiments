# XM4's signed along-track check: exploratory, not registered

Written 2026-10-31, before any signed number was computed, at the coordinator's request after reading XM4's registered table. Pushed to
`wip/experiments-open-dca-ffm-regression-20261031/registration` before the run. It moves no registered cell, no rule and no verdict.

## Why

Median d cannot see a correct but small correction whose sign is random against a larger error. K2 against K1 reads no detectable effect, and
K3 reads the same. This check asks a question that median d cannot: does K2's displacement point toward the truth?

## The statistic

Rows L; the same windows, lead bins and epochs as the registered cells. K1, K2 and K3 are flown again and each must equal its stored GCRF digest
(a difference stops the run). All components are along-track in the truth's RTN axes, by analysis/gp-error-model `pair_statistics`, XM's scorer. For
each window and entered lead bin, over the bin's epochs:

- y = the mean of (truth - K1);
- x2 = the mean of (K2 - K1), the displacement of K2;
- x3 = the mean of (K3 - K1), the displacement of K3, the null.

Across a group's windows at one lead:

- **gamma:** the slope of the regression of x on y, with an intercept. 0 means the displacement is unrelated to K1's error. Above 0 means it points
  toward the truth, and gamma is the share of K1's window-to-window along-track error it removes. gamma2 is K2's, gamma3 is K3's.
- **The difference:** gamma2 - gamma3, paired within each draw.
- **Intervals:** 95 % percentile, ISO-week cluster bootstrap of the group's windows, 10,000 draws, xorshift128+ seeded by SHA-256 of
  `XM4-signed|<group>|<lead>`.

Beside them, each with its interval, for reading only:

- gamma through the origin, which keeps the mean level of the displacement;
- beta, the reverse slope of y on x. It can exceed 1, because the flown B is below the physical B;
- the share of windows where x and y have the same sign (50 % is no information);
- Spearman's rank correlation of x and y, because a few windows can dominate a slope;
- the means of y, x2 and x3.

## What would count

Per lead and group (P and S1), on gamma with an intercept:

| Reading | gamma2's interval | gamma2 - gamma3's interval |
| --- | --- | --- |
| **Date-specific signal:** K2 points toward the truth and another date's record does not do as well | wholly above 0 | wholly above 0 |
| **Signal, not date-specific:** K2 points toward the truth, and the null does as well | wholly above 0 | holds 0 |
| **No signal** | holds 0 | |
| **Wrong way** | wholly below 0 | |

- gamma through the origin reads the level. If it lies above 0 for K2 and K3 alike while the slopes with an intercept hold 0, that is the mean level of
  exp(s) against a B that is too low, not what the record knows about the date.
- There are 8 cells (4 leads x 2 groups) and no multiplicity correction. A pattern across leads in group P counts for more than one lead. One lead alone
  counts for little.
- A firm date-specific signal would say the record carries information on this path that the seed error hides. It would not make K2 predict closer: the
  registered table stands. A firm no signal would say that this path shows none, not that s is wrong. It decides nothing by itself; the coordinator takes it
  to the owner beside the registered table.
