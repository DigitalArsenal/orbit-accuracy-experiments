# AP from ILRS normal points through the modules flow (B2 part 2's window)

Registered in `experiments/ap-observations/PLAN.md` before any run. Modules main c2f476f6193c: flows/observation-ap 0.1.0, flows/observation-od 0.1.1, analysis/estimation 0.7.0, propagator/ffm 2.1.0, propagator/sdn-ap 0.5.1, propagator/sgp4 1.4.1, analysis/reference-states 0.4.0; every artifact SHA-256 in `experiments/ap-observations/config.json`. B2 part 2 ran on the withdrawn build with its fit and carry in experiment JavaScript; here every step is a module.

Five laser spheres (Starlette, Stella, LARETS, WESTPAC, LARES), 206 cutoffs, 2026-07-18 to 08-28. Arc: the normal points of the 48 h before the cutoff. Error: per cutoff and day after the cutoff, the RMS of the 3D position error against the NSGF orbit; across cutoffs the median and the 95th percentile, km. NSGF computes its orbits from the same ILRS normal points: the truth is an anchor, not independent.

| Arm | Scored / attempted | Day 1 | Day 2 | Day 3 | B2 median, days 1 / 2 / 3 |
| --- | --: | --- | --- | --- | --- |
| AP from normal points (flow) | 175 / 206 | 0.021 (95th 0.079) n 158 | 0.047 (95th 0.237) n 157 | 0.097 (95th 0.542) n 152 | 0.093 / 0.229 / 0.444 |
| AP fitted to the NSGF orbit | 204 / 206 | 0.023 (95th 0.075) n 181 | 0.051 (95th 0.228) n 178 | 0.109 (95th 0.469) n 177 | 0.102 / 0.249 / 0.466 |
| FFM estimate | 175 / 206 | 0.0012 (95th 0.0076) n 158 | 0.0030 (95th 0.029) n 157 | 0.0056 (95th 0.052) n 152 | 0.0080 / 0.011 / 0.015 |
| SGP4 (public set) | 206 / 206 | 0.577 (95th 0.633) n 183 | 0.590 (95th 0.655) n 180 | 0.608 (95th 0.676) n 179 | 0.577 / 0.590 / 0.609 |

A refusal of any module counts as a failure of that arm and is not dropped. Each median is over the cutoffs its arm scored (the AP and FFM arms lack the refused cutoffs); n counts the cutoffs with that day covered.

Failures, AP from normal points (flow) (31):

- `no-convergence` (25): starlette 2026-07-18, starlette 2026-07-19, starlette 2026-07-20, starlette 2026-07-21, starlette 2026-07-22, starlette 2026-07-24, starlette 2026-07-26, starlette 2026-07-29, stella 2026-08-08, westpac 2026-07-19, westpac 2026-07-22, westpac 2026-07-25, westpac 2026-07-27, westpac 2026-08-01, westpac 2026-08-04, westpac 2026-08-13, westpac 2026-08-15, larets 2026-07-19, larets 2026-07-26, larets 2026-08-01, larets 2026-08-10, larets 2026-08-15, larets 2026-08-19, larets 2026-08-21, lares 2026-07-26
- `arc-too-short` (5): westpac 2026-07-18, westpac 2026-07-26, westpac 2026-08-07, westpac 2026-08-17, westpac 2026-08-22
- `no NSGF state at 2026-07-19T00:00:00.000000Z` (1): westpac 2026-07-21

Failures, AP fitted to the NSGF orbit (2):

- `1 NSGF states in the 24 h before T` (2): westpac 2026-07-20, westpac 2026-08-17

Failures, FFM estimate (31):

- `no estimate (the flow refused)` (31): starlette 2026-07-18, starlette 2026-07-19, starlette 2026-07-20, starlette 2026-07-21, starlette 2026-07-22, starlette 2026-07-24, starlette 2026-07-26, starlette 2026-07-29, stella 2026-08-08, westpac 2026-07-18, westpac 2026-07-19, westpac 2026-07-21, westpac 2026-07-22, westpac 2026-07-25, westpac 2026-07-26, westpac 2026-07-27, westpac 2026-08-01, westpac 2026-08-04, westpac 2026-08-07, westpac 2026-08-13, westpac 2026-08-15, westpac 2026-08-17, westpac 2026-08-22, larets 2026-07-19, larets 2026-07-26, larets 2026-08-01, larets 2026-08-10, larets 2026-08-15, larets 2026-08-19, larets 2026-08-21, lares 2026-07-26

Sources: ILRS normal points from the EUROLAS Data Center, DGFI-TUM (Pearlman et al. 2019; Noll et al. 2019); ILRS weekly station solutions; IERS EOP 20 C04; NSGF rapid orbits (ILRS). The SGP4 arm uses public element sets; no element set is reproduced.
