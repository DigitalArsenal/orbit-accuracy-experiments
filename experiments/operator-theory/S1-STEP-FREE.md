# S1-STEP-FREE: FFM against AP on step-free Sentinel-1 windows nobody has read

Written 2026-11-04 under `experiments-ffm-maneuver-flags-20261104`, before any fit, flight or truth read of these windows. Not yet run: its runner is the next step, and it is registered by the commit that adds this file. Report: `results/operator-theory/s1-step-free`.

## Why

The FFM-losses study (`results/ffm-losses-to-ap`, F5) found FFM's Sentinel-1 losses at day 7 from a 24 h fit gathered in windows whose truth steps up (a burn). `results/operator-theory/maneuver-flags` measures, on the 2026 windows already read, that FFM still loses 75 % of the step-free ones (median FFM/AP 2.20). This tests the record's statement on windows no one has read.

## Windows

Sentinel-1A (NORAD 39634) and Sentinel-1C (62261), Copernicus POEORB through the reader AP5.md used (`xp-atmosphere-merit/lib/truth.mjs`, the truth gate), cutoff 00:00 UTC every day from 2025-10-05 to 2025-12-28: 85 cutoffs each, 170 windows. No row of them is in any store at registration. Nothing of C2 is read: Sentinel-1D, TerraSAR-X and every cutoff from 2026-06-01 are out.

## Arms and scoring

XM's (AP5.md, `truth-compare.mjs`): the 24 h arc before the cutoff thinned to 300 s, coverage 0.9; as-issued weather; the 300 s grid of the 7 days after, a day's bin entering with 260 of its 288 epochs; the error a bin's 3D RMS.

- FFM: `truth-compare.mjs`'s `F24` (CHEAPER.md: 40x40, NRLMSISE-00, solid tides, drag area over mass fitted from 0.01).
- AP: `propagator/sdn-ap` 0.5.1 (`lib/build.mjs` PIN, the site's AP), one `$OCM` fitted to the same arc and flown alone, as `remeasure` flew AP5's windows into `ap/b051`.

## The flag, fixed here

`lib/steps.mjs` at the registration commit: revolution time means of `foundation/orbits`' osculating semimajor axis; the change between the 12 revolutions after and the 12 before, 24 within 2.2 days; less the median change 1 to 3 days either side; a step at 8 m or more, the largest within 12 revolutions. A window is step-free when no step falls in [cutoff - 24 h, cutoff + 168 h] and the detector covers that span; flagged windows are reported apart and not tested.

## Statement

On the step-free windows with both arms scored at day 7: FFM's error exceeds AP's in fewer than half (share below 0.50) and the median of FFM/AP is below 1. Both must hold. With fewer than 30 step-free windows the test is inconclusive and says so. The share and the median are reported with a 95 % interval (windows drawn by satellite and day, 2,000 draws, seed 20261104), report only.

## Disclosure

The thresholds are the record's (`graph/tasks/experiments-ffm-maneuver-flags-20261104.md`), not tuned: 50 %, 1, 8 m. The detector's rule was written after reading the 2026 windows' truth, and so was the measured 75 % above.
