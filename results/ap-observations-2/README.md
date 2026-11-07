# AP from ILRS normal points through the modules flow, second registration (flows/observation-od 0.3.0)

Registered in `experiments/ap-observations-2/PLAN.md` before any run. Modules main 5da8d709375b: flows/observation-ap 0.1.0, flows/observation-od 0.3.0, analysis/estimation 0.7.0, propagator/ffm 2.1.0, propagator/sdn-ap 0.5.1, propagator/sgp4 1.4.1, analysis/reference-states 0.4.0; every artifact SHA-256 in `experiments/ap-observations-2/config.json`. The first registration (`results/ap-observations/`, modules c2f476f6193c) stands as recorded.

Five laser spheres (Starlette, Stella, LARETS, WESTPAC, LARES), 206 cutoffs, 2026-07-18 to 08-28. Arc: the normal points of the 48 h before the cutoff. Error: per cutoff and day after the cutoff, the RMS of the 3D position error against the NSGF orbit; across cutoffs the median and the 95th percentile, km. NSGF computes its orbits from the same ILRS normal points: the truth is an anchor, not independent.

| Arm | Scored / attempted | Day 1 | Day 2 | Day 3 | B2 median, days 1 / 2 / 3 |
| --- | --: | --- | --- | --- | --- |
| AP from normal points (flow) | 200 / 206 | 0.022 (95th 0.081) n 178 | 0.049 (95th 0.242) n 176 | 0.103 (95th 0.539) n 174 | 0.093 / 0.229 / 0.444 |
| AP fitted to the NSGF orbit | 204 / 206 | 0.023 (95th 0.075) n 181 | 0.051 (95th 0.228) n 178 | 0.109 (95th 0.469) n 177 | 0.102 / 0.249 / 0.466 |
| FFM estimate | 200 / 206 | 0.0012 (95th 0.0080) n 178 | 0.0031 (95th 0.029) n 176 | 0.0061 (95th 0.056) n 174 | 0.0080 / 0.011 / 0.015 |
| SGP4 (public set) | 206 / 206 | 0.577 (95th 0.633) n 183 | 0.590 (95th 0.655) n 180 | 0.608 (95th 0.676) n 179 | 0.577 / 0.590 / 0.609 |

A refusal of any module counts as a failure of that arm and is not dropped. Each median is over the cutoffs its arm scored; n counts the cutoffs with that day covered.

Like for like: n 178 / 176 / 174 at days 1 / 2 / 3 here, against B2 part 2's 183 / 180 / 179 (206 scored) and the first registration's 158 / 157 / 152 (175 scored); the 6 refused cutoffs hold 5 / 4 / 5 of the days the truth covers.

## Beside the first registration

| Arm | Scored, first / second | Day 1, first / second | Day 2, first / second | Day 3, first / second |
| --- | --: | --- | --- | --- |
| AP from normal points (flow) | 175 / 200 | 0.021 (95th 0.079) n 158 / 0.022 (95th 0.081) n 178 | 0.047 (95th 0.237) n 157 / 0.049 (95th 0.242) n 176 | 0.097 (95th 0.542) n 152 / 0.103 (95th 0.539) n 174 |
| AP fitted to the NSGF orbit | 204 / 204 | 0.023 (95th 0.075) n 181 / 0.023 (95th 0.075) n 181 | 0.051 (95th 0.228) n 178 / 0.051 (95th 0.228) n 178 | 0.109 (95th 0.469) n 177 / 0.109 (95th 0.469) n 177 |
| FFM estimate | 175 / 200 | 0.0012 (95th 0.0076) n 158 / 0.0012 (95th 0.0080) n 178 | 0.0030 (95th 0.029) n 157 / 0.0031 (95th 0.029) n 176 | 0.0056 (95th 0.052) n 152 / 0.0061 (95th 0.056) n 174 |
| SGP4 (public set) | 206 / 206 | 0.577 (95th 0.633) n 183 / 0.577 (95th 0.633) n 183 | 0.590 (95th 0.655) n 180 / 0.590 (95th 0.655) n 180 | 0.608 (95th 0.676) n 179 / 0.608 (95th 0.676) n 179 |

AP from normal points (flow): scored 175 -> 200; median 0.021 / 0.047 / 0.097 -> 0.022 / 0.049 / 0.103 km; 95th 0.079 / 0.237 / 0.542 -> 0.081 / 0.242 / 0.539 km; n 158 / 157 / 152 -> 178 / 176 / 174 (days 1 / 2 / 3).
AP fitted to the NSGF orbit: every cell equals the first registration's to the digit.
FFM estimate: scored 175 -> 200; median 0.0012 / 0.0030 / 0.0056 -> 0.0012 / 0.0031 / 0.0061 km; 95th 0.0076 / 0.029 / 0.052 -> 0.0080 / 0.029 / 0.056 km; n 158 / 157 / 152 -> 178 / 176 / 174 (days 1 / 2 / 3).
SGP4 (public set): every cell equals the first registration's to the digit.

Where both registrations scored a cutoff, its day values moved at most 0.0828 m (median 1.52e-5 m, 467 day values) for AP from normal points and at most 0.00123 m (median 2.16e-5 m, 467) for the FFM estimate.

Outcomes that changed (25). Against the registration's 31 named cells: 25 of the 25 `no-convergence` cells became AP $OCMs, 6 of the 6 others were refused again by the same code; no cutoff outside them changed outcome.

- starlette 2026-07-18: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 7.404), at days 1 / 3 AP 0.021 / 0.114 km, FFM 0.0007 / 0.0015 km.
- starlette 2026-07-19: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 7.663), at days 2 / 3 AP 0.095 / 0.171 km, FFM 0.017 / 0.030 km.
- starlette 2026-07-20: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 3.108), at days 1 / 2 / 3 AP 0.024 / 0.055 / 0.097 km, FFM 0.0029 / 0.0074 / 0.017 km.
- starlette 2026-07-21: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 3.816), at days 1 / 2 AP 0.018 / 0.029 km, FFM 0.0047 / 0.014 km.
- starlette 2026-07-22: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 5.609), at days 1 / 3 AP 0.028 / 0.137 km, FFM 0.0007 / 0.0053 km.
- starlette 2026-07-24: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 6.346), at days 1 / 2 / 3 AP 0.020 / 0.030 / 0.060 km, FFM 0.0033 / 0.0094 / 0.019 km.
- starlette 2026-07-26: refused `no-convergence` in the first; here an AP $OCM (fits 8 + 6 iterations, WEIGHTED_RMS 2.088), at days 1 / 2 / 3 AP 0.037 / 0.097 / 0.167 km, FFM 0.0008 / 0.0015 / 0.0027 km.
- starlette 2026-07-29: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 3.269), at days 1 / 2 / 3 AP 0.036 / 0.101 / 0.176 km, FFM 0.0018 / 0.0045 / 0.0087 km.
- stella 2026-08-08: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 2.433), at days 1 / 2 / 3 AP 0.031 / 0.056 / 0.114 km, FFM 0.0006 / 0.0018 / 0.0044 km.
- westpac 2026-07-19: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 0.353), at days 2 / 3 AP 0.052 / 0.118 km, FFM 0.0060 / 0.0099 km.
- westpac 2026-07-22: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 1.612), at days 1 / 3 AP 0.022 / 0.026 km, FFM 0.0016 / 0.012 km.
- westpac 2026-07-25: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 2.048), at days 1 / 2 AP 0.022 / 0.056 km, FFM 0.0011 / 0.0027 km.
- westpac 2026-07-27: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 0.182), at days 2 / 3 AP 0.035 / 0.051 km, FFM 0.015 / 0.031 km.
- westpac 2026-08-01: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 0.844), at days 1 / 2 / 3 AP 0.025 / 0.056 / 0.089 km, FFM 0.0026 / 0.0015 / 0.0015 km.
- westpac 2026-08-04: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 0.533), at days 1 / 2 / 3 AP 0.020 / 0.023 / 0.053 km, FFM 0.0021 / 0.0031 / 0.0049 km.
- westpac 2026-08-13: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 0.839), at days 1 / 2 AP 0.021 / 0.029 km, FFM 0.0007 / 0.0014 km.
- westpac 2026-08-15: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 5.230), at day 3 AP 0.068 km, FFM 0.034 km.
- larets 2026-07-19: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 3.297), at days 2 / 3 AP 0.201 / 0.372 km, FFM 0.011 / 0.029 km.
- larets 2026-07-26: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 3.493), at days 1 / 3 AP 0.030 / 0.223 km, FFM 0.0022 / 0.0057 km.
- larets 2026-08-01: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 3.157), at days 1 / 2 / 3 AP 0.084 / 0.297 / 0.665 km, FFM 0.0049 / 0.018 / 0.031 km.
- larets 2026-08-10: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 2.445), at days 1 / 2 / 3 AP 0.055 / 0.226 / 0.515 km, FFM 0.0092 / 0.040 / 0.094 km.
- larets 2026-08-15: refused `no-convergence` in the first; here an AP $OCM (fits 3 + 2 iterations, WEIGHTED_RMS 5.185), at days 1 / 2 / 3 AP 0.095 / 0.263 / 0.471 km, FFM 0.0033 / 0.0085 / 0.024 km.
- larets 2026-08-19: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 2.230), at days 1 / 3 AP 0.066 / 0.366 km, FFM 0.011 / 0.055 km.
- larets 2026-08-21: refused `no-convergence` in the first; here an AP $OCM (fits 4 + 2 iterations, WEIGHTED_RMS 6.126), at days 1 / 2 / 3 AP 0.058 / 0.227 / 0.526 km, FFM 0.0031 / 0.0096 / 0.022 km.
- lares 2026-07-26: refused `no-convergence` in the first; here an AP $OCM (fits 5 + 4 iterations, WEIGHTED_RMS 4.024), at days 1 / 2 / 3 AP 0.013 / 0.015 / 0.033 km, FFM 0.0005 / 0.0006 / 0.0014 km.

## Fits

Each cutoff fits twice (at the first guess's epoch T - 48 h, then at T). Over the 200 AP $OCMs: first fit 3 to 8 iterations (median 4), second fit 2 to 6 (median 2); WEIGHTED_RMS 0.103 to 8.682 (median 3.630). Per cutoff in `table.json` `perCutoff`, read from analysis/estimation's fit_batch answers.

Failures, AP from normal points (flow) (6):

- `arc-too-short` (5): westpac 2026-07-18 (20.70 h), westpac 2026-07-26 (23.73 h), westpac 2026-08-07 (23.66 h), westpac 2026-08-17 (5.85 h), westpac 2026-08-22 (20.59 h)
- `no NSGF state at 2026-07-19T00:00:00.000000Z` (1): westpac 2026-07-21

Failures, AP fitted to the NSGF orbit (2):

- `1 NSGF states in the 24 h before T` (2): westpac 2026-07-20, westpac 2026-08-17

Failures, FFM estimate (6):

- `no estimate (the flow refused)` (6): westpac 2026-07-18, westpac 2026-07-21, westpac 2026-07-26, westpac 2026-08-07, westpac 2026-08-17, westpac 2026-08-22

## Build

Modules 5da8d709375b from the read-only clone. One artifact differs from the first registration: flows/observation-od `dist/isomorphic/module.wasm` (d5cc1246c597; the first's 6373b00cfacf), which carries the RA/Dec angles entry point (22213952a) and the two-fit laser path (0.3.0, 5da8d709). Every other artifact is byte-identical to the first registration's. The fits are read from analysis/estimation's fit_batch answers with the module's own schema codec (`tests/wire.mjs`, hashed) behind a pass-through host; the SGP4 request encoders are a hash-checked copy with that module's own lock.

Sources: ILRS normal points from the EUROLAS Data Center, DGFI-TUM (Pearlman et al. 2019; Noll et al. 2019); ILRS weekly station solutions; IERS EOP 20 C04; NSGF rapid orbits (ILRS). The SGP4 arm uses public element sets; no element set is reproduced.
