## Reading

These are the analyst's words, written after the table was generated. The numbers they cite are the table's.

**Verdict.** No arm improves accuracy in any group, under either condition. In L1, L2 and I, every A1, A2 and A3 arm fails
the registered test: its day-3 paired-ratio interval against A0 does not lie wholly below 1. The median paired ratio is
1.000 in every cell.

**Why the atmosphere barely enters.** The fit ends with BTERM <= 0 in:

- 50 % of L1 windows;
- 56 % of L2 windows;
- 43 % of ISS windows.

SGP4XP applies no drag at BTERM <= 0, so in those windows every atmosphere gives the same states. Two post hoc checks,
not registered:

- Where both fits keep drag, the laser groups' median paired ratios stay 1.000.
- The ISS's operational arms come out 1.4 to 1.6 % better. A2 O at day 3: 0.986 [0.979, 0.992], on 196 windows.

That ISS gain is hypothesis-generating only. It is far smaller than the gap between our fit and the public set.

**Negative control (GNSS).** The control passes. A1 and A2, under both conditions, equal A0 exactly on all 108 windows:
the largest relative difference is 0, and the fitted sets are identical. Above 2,500 km every atmosphere is the theory's
1e-20 kg/m^3, so the plumbing is clean. A3 did not run: no $DCL exists for those dates.

**Our XP fit against the public set.**

- **L1 (laser spheres).** A0 is 784 / 1,218 / 1,718 m and P is 577 / 590 / 608 m. These reproduce B2 part 2's
  784 / 1,220 / 1,720 m and 577 / 590 / 609 m. A0 / P is 1.38, 2.11 and 2.89.
- **ISS.** A0 / P is 1.73, 2.09 and 2.48.
- **L2.** Our fit is level with P: 1.01 and 1.07 at days 1 and 2.
- **N.** XP fitted to precise GNSS orbits is 13 to 35 times closer than the public sets.

So the fit procedure is a confound for the laser spheres and the ISS, and it is a larger effect than any atmosphere.

**Why the fit loses (Part D).**

- **Laser spheres: the short arc, and aliasing of unmodeled short-period terms into the mean elements.**
  - The 72 h span cuts day 3 from 1,718 m to 626 m. Its paired ratio against D0 is 0.42 [0.33, 0.59], which closes
    the gap to P (608 m) to 1.13 [1.01, 1.19].
  - The fit RMS rises with the span, from 0.52 to 0.56 km. This is the signature of aliasing: the residual is the
    theory's truncation. A 24 h arc folds it into the mean motion; a longer arc averages it out. The 7-day span gives
    the same result (day 3 665 m).
  - The parameters are not the cause:
    - fixing AGOM at the public value, or both parameters at the public or the physical values, changes day 3 by 0 %
      to +11 %;
    - BTERM's formal sigma (0.038 m^2/kg) is about the prior's 0.05, so BTERM is unobservable in 24 h;
    - rho(BTERM, AGOM) is about 0, and the multiple correlation with the state is 0.12.
  - The SSN-like sparse cadence is worse: day 3 2.6 km.
  - The epoch placement leaves the day-3 paired ratio at 1.00. The medians move: the middle to 1.95 km, the end to
    1.63 km.
  - The finite-difference columns change nothing. The fallback never engages, because the analytic fit stops on its
    relative-decrease test.
- **ISS: something else, the BTERM trap.**
  - The fit's drag column is the theory's n-dot per unit BTERM at the trial BTERM, which is identically zero once
    BTERM <= 0. A fit that crosses zero cannot come back, and the 0 +- 0.05 prior holds it near 0.
  - Post hoc, the 221 windows that end in the trap are 11.4 / 24.6 / 46.0 km. The 298 windows that keep drag are
    3.5 / 7.4 / 14.9 km, against P's 2.8 / 5.1 / 9.0 km on the same windows.
  - Moving the epoch to the arc middle cuts the trap from 43 % of the fits to 14 %. It also cuts the medians by about
    a third, to day 1 3.96 km and day 3 16.4 km.
  - The ISS span variants are not a clean test. They stitch NASA's predicted segments, and their fit RMS is 1.8 and
    7.6 km.
  - Fixing BTERM at the public set's B*-derived value is worse, because SGP4's B* is not XP's BTERM.

**Deviations.**

- **F10.7 source.** F10.7 is the GFZ file's observed DRAO flux for every window, not NOAA SWPC's: the archive's SWPC
  daily data cover only 2024 to 2026. On the 771 days both hold, the median difference is 0.3 sfu, and 754 days are
  within 1 sfu. The largest, 181 sfu, is on flare days.
- **Epoch placement.** The module places the fitted set's epoch at the arc start, not at the arc end. That is D0, and
  Part D measured the middle and the end.
- **D-np was not run.** No XP provider answers analysis/estimation's state-and-transition-matrix queries.
- **The pipeline was tried first.** It ran on four windows in a scratch store that was then discarded. The run
  recomputed every window.
