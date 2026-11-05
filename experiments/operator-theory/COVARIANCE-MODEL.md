# COVARIANCE-MODEL: a process-noise model for AP's DRAG regime, registered before any fit

Registered under `modules-sdn-ap-covariance-noise-model-20261105`, written and pushed before any fit of a form below and before any row of the held-out windows exists. It follows COVARIANCE-COVERAGE.md (sdn-ap 0.6.0 flights) and COVARIANCE-REFIT.md (the 0.6.1 DRAG row, shipped without a realism label: 10 of 18 held-out cells outside the band). The refit's amendment 1 shows the limit is the form of the noise, not its sizes. This record names the facts a form must explain, the candidate forms, a held-out set neither earlier fit has read, the criterion and the selection rule. The SDN-AP session reviews it before `covariance-model.mjs` fits anything.

## 1. Facts the model must explain

From the coverage rows (`/opt/data/sdn-archive/operator-theory/covariance-coverage`, every window already read by the refit), re-weighted to the 0.6.1 row exactly as the refit's `--fit` does (its medians are reproduced). T = strong drag 2025 (Swarm A, B, C, GRACE-FO 1, 2; arms AP24, APRa12), S1 = near 700 km 2026 (Sentinel-1A, 1C; arms AP72, AP24); train / held are the refit's blocks. nu = |n-dot_ng / n| per day, the record's NON_GRAVITATIONAL_RATE_PER_DAY. Growth exponent p: ln(median at day 7 / median at day 1) / ln(167 / 24).

| Fact | Measure | T | S1 |
|---|---|---|---|
| Drag level | median nu (1/day) | 9.05e-6 train, 1.05e-5 held | 8.70e-8 train, 6.72e-8 held |
| F1 cross-track error grows nearly linearly under strong drag, much slower near 700 km | p of median \|e_C\| | 0.85, 0.84 | 0.34, 0.47 |
| F2 one s_i term grows the cross-track 1-sigma the same way in both | p of median sigma_C (0.6.1) | 0.89, 0.88 | 0.85, 0.84 |
| F3 cross-track level differs by regime far less than nu | median \|e_C\| day 1 / day 7 (km) | 0.0125 / 0.0644 train; 0.0102 / 0.0515 held | 0.0081 / 0.0155 train; 0.0081 / 0.0202 held |
| F4 within a regime cross-track does not follow nu | median \|e_C\| day 7 by nu tercile (km) | 0.059, 0.053, 0.063 | 0.018, 0.015, 0.021 |
| F5 cross-track at day 1 is mostly the floor | floor share of sigma_C^2 day 1 | 0.58, 0.60 | 0.65, 0.64 |
| F6 in-track grows faster than the 0.6.1 1-sigma | p of median \|e_I\| / of sigma_I | 1.87 / 1.70 train; 2.08 / 1.75 held | 1.37 / 1.00 train; 1.39 / 1.00 held |
| F7 under strong drag in-track is the n-dot term; near 700 km it is s_l alone | s_d share of sigma_I^2 day 1 / day 7 | 0.30 / 0.95 train; 0.37 / 0.97 held | 2e-5 to 4e-5 / 1e-3 to 2e-3 |
| F8 the relative drag-rate error the errors imply | median \|e_I\| / (nu d^2 / 2), km per (1/day), days 1, 3, 7 | 7.6e4, 5.8e4, 5.5e4 train; 5.9e4, 5.6e4, 6.9e4 held | 5.1e6, 2.4e6, 1.3e6 train; 4.6e6, 2.2e6, 1.3e6 held |
| F9 radial is near the band; its 1-sigma is the floor near 700 km and n-dot under strong drag | share of sigma_R^2 day 7: floor, s_e, s_d | 0.23, 0.05, 0.66 train; 0.11, 0.02, 0.84 held | 0.70, 0.25, 0 |
| F10 season moves the in-track level both ways | held / train median \|e_I\| day 1, day 7 | 1.06, 1.57 | 0.66, 0.69 |
| F11 arc length matters in-track | median \|z_I\| day 1 by arm (0.6.1) | AP24 0.588, APRa12 0.366 | AP72 0.510, AP24 0.381 |

Readings. F8: with a n of about 6.5e5 km/day for both orbits, strong drag implies a relative n-dot error of 0.08 to 0.12 (the 0.6.1 c is 0.112), steady with lead in training and rising from day 3 to day 7 in the held block, where nu is 16 % higher but the day-7 in-track error 57 % higher (F10): the drag-rate error grows with lead. Near 700 km the same ratio is 2 to 8 and falls with lead: the in-track error there is not proportional to nu; it is a mean-longitude error growing as about d^1.4 (F6), which the module's s_l (d^1) and its n-dot term (d^2, but sized by nu, about 1e-7 there) cannot shape. F1 to F5: the strong-drag cross-track error behaves as a rate error in the orbit plane (d^0.85) at about 3.5 times the near-700 km rate, with nu 125 times larger (q = ln 3.5 / ln 125, about 0.26, if it is a power of nu), and within each regime it does not follow nu, so a term linear in nu (the refit's diagnostic b) over-separates the regimes; near 700 km the cross-track error is mostly constant (the floor) plus slow growth, so a larger cross-track floor with a smaller s_i fits it while one floor scale for all axes cannot (the refit's diagnostic c scaled R, I and C together). Of the 0.6.1 held-out cells, those outside [0.603, 0.754]: T I day 1 0.468, T C days 1, 3, 7 0.781, 0.874, 0.794, T I day 7 0.910; S1 I days 1, 3 0.322, 0.487, S1 C days 3, 7 0.560, 0.380, S1 R day 7 0.852.

Precision. The rows print each variance to about 10 significant digits. Near 700 km the 0.6.0 n-dot term's share of the in-track variance at hours 1 and 24 has median 2.3e-10 and minimum 0: its column cannot be recovered there by differencing, so a form that raises the n-dot term on those windows is evaluated by flight (section 2).

## 2. Candidate forms

Notation: d lead days from t_a (the module's noise start, the fit arc's end); L = t_a / 1440, the arc span in days (the epoch is the arc's first state: t_a medians 1015, 1435 and 4317 min for the 17 h, 24 h and 72 h arms); nu as above, nu_0 = 1e-6 per day; n in rad/day. The base M0 is the 0.6.1 form: s_e, s_i, s_l, c, k_F (5 parameters), each term a column g = J(t) dp with dp proportional to its size and to d (s_e, s_i, s_l) or to d and d^2 (n-dot), so its variance on each axis is size^2 times a fixed per-sample number.

Components (parameters added):

| Id | Axis it targets | Form | Adds | Per set or in time |
|---|---|---|---|---|
| X1 | C | s_i + c_i nu (the refit's diagnostic b, rerun on the new held-out) | c_i | per set |
| X2 | C | s_i (nu / nu_0)^q_i, s_i the size at nu_0 | q_i | per set |
| X3 | R, I, C | the floor scale per axis: k_FU, k_FV, k_FW in place of k_F (UVW cross terms scaled by the geometric mean of their two axes) | 2 | per set |
| T1 | I | mean-longitude rate error with shape d^p_l: d lambda = s_l n d^p_l, p_l in [0.5, 2.5] | p_l | in time |
| T2 | I | s_l by arc length: s_l (L / 1 day)^-m | m | per set |
| T3 | I, R | drag-rate error growing with lead: the n-dot column times (1 + d / tau), 1 / tau >= 0 | tau | in time |
| T4 | I, R | an n-dot noise independent of nu: s_d = sqrt((c nu n)^2 + s_a^2) | s_a | per set |
| T5 | I, R | the drag share by drag level: c (nu / nu_0)^q_d | q_d | per set |
| S | all | a second DRAG row below a perigee of 600 km (every T window lies below, every S1 window above) | 5 | per set |

Forms, in the registered order of simplicity (first the count of components changed, then whether the module record needs new fields, then parameters):

| Form | Components | Parameters | New record fields | Evaluated by |
|---|---|---:|---|---|
| F0 | M0 refitted on all training rows | 5 | no | re-weighting |
| F1 | M0 + X2 | 6 | no | re-weighting |
| F2 | M0 + X1 | 6 | no | re-weighting |
| F3 | M0 + X3 | 7 | no | re-weighting |
| F4 | M0 + X2 + X3 | 8 | no | re-weighting |
| F5 | M0 + X2 + X3 + T2 | 9 | no | re-weighting |
| F6 | M0 + X2 + X3 + T5 | 9 | no | re-weighting where resolved, else flight |
| F7 | M0 + X2 + X3 + T4 | 9 | no | flight on near-700 km and weak-drag windows |
| F8 | M0 + X2 + X3 + T1 | 9 | yes (p_l) | re-weighting |
| F9 | M0 + X2 + X3 + T3 | 9 | yes (tau) | re-weighting |
| F10 | M0 + X2 + X3 + T1 + T3 | 10 | yes (p_l, tau) | re-weighting |
| F11 | M0 + X2 + X3 + T2 + T4 | 10 | no | as F7 |
| F12 | S (two M0 rows) | 10 | no | re-weighting |

Which are linear in the row terms. Every component above scales one term's column g(t) by a factor that depends only on the set (nu, L, regime) or on d: X1, X2, T2, T4, T5 and S multiply a term's variance by a per-window constant rho; T1 and T3 by a per-lead factor (d^(p_l - 1))^2 and (1 + d / tau)^2; X3 scales the floor per axis. So each axis variance under any form is exactly

v_a' = v_off,a + (k_a - 1) F_a + sum over k of rho_k(window, d) (v_full,a - v_k,a),

the refit's identity with rho_k free to vary by window and lead (k_a the form's floor scale on axis a, F_a the row's FLOOR on that axis). The identity is used only where it is resolved: a sample whose term difference |v_full,a - v_k,a| is below 1e-4 v_full,a while rho_k > 1 is re-flown, never dropped. A flight sets, in a copy of the fitted $OCM's COV_PROPAGATION, the term's size the form gives at that window and lead (per lead for T1 and T3, one flight per lead), and for an n-dot size keeps the module's invariant by setting NON_GRAVITATIONAL_SHARE to s_d' / (nu n); a window with nu = 0 cannot carry T4 by this route and is counted and reported. This is the coverage study's switch method; the unchanged copy must fly byte-equal. No form changes a state, a fit or the column directions; a form that would (a new direction, a changed t_a, a term on the node alone) is not in this registration.

## 3. Training and held-out windows

Training: every coverage-study row (both of the refit's blocks and its 50 guard windows; strong drag 2025 and near 700 km 2026, both arms each), already read. The forms are fitted on these only.

Held-out, windows neither earlier fit has read. Excluding every window of the refit's training, held-out and guard sets (all of `covariance-coverage`):

- Strong drag: `operator-theory/ap/b051/truth2` group P (Swarm A, B, C, GRACE-FO 1, 2), cutoffs 2026-01-01 to 2026-05-31, 755 keys, arms AP72 and AP24 (750 fitted each). A third season block, and the first strong-drag windows on 72 h arcs (a test of T2 and F11). Truth read through 2026-06-07, before the 2026-10-31 hold; cutoffs before C2's 2026-06-01 cut.
- Near 700 km: none remains. All 302 stored S1 keys (2026-01-01 to 05-31) are in the refit's sets, and S1 cutoffs from 2026-06-01 are C2's. The honest alternative registered here: the AP6 regimes set `operator-theory/ap/b051/regimes`, groups DO and LS, cutoffs 2025-10-10 to 2025-12-19 (15 per object), arms AP24 and AP72, a window counted near 700 km when its fitted set's perigee height (computed by the module and written in the new rows) lies in 650 to 850 km. By catalog orbit this is expected to hold CryoSat-2, SARAL, Sentinel-3A, Sentinel-3B, LARETS, Starlette, Stella and WESTPAC (8 objects, up to 240 window-arms); the rule, not the list, decides.
- Weak drag (no-harm guard): the remaining DO and LS windows of that set with perigee 850 to 2500 km (Jason-3, Sentinel-6, SWOT, Haiyang-2C, 2D, Ajisai, LARES and the like).

The held-out rows are new covariance flights: the producers' stored fits reproduced by their own calls (`ap-truth.mjs --xm` for P, `all-regimes.mjs` for DO and LS) under the coverage study's control (0 differing scalars), each flown with the shipped 0.6.1 build and the coverage study's six flights. Two additions to the row: the full RIC position block (6 numbers) of every flight, and every variance at 17 significant digits, so the 3D figure uses the full block and the precision rule rarely re-flies.

Disclosure: P 2026 and the DO and LS windows were in the 0.6.0 DRAG row's minimax fit (`b040/compare-truth2`, `b040/truth2`, `b040/regimes`; the mean d^2/3 in 3D, a different form and criterion). That row enters here only as the sizes the rows are flown with, which the identity removes exactly. Under the strict reading (no window any earlier noise fit read) no stored DRAG window remains; the further alternatives, not used unless the session rules: Sentinel-1A and 1C cutoffs 2025-10-04 to 2025-12-21 (precise orbits from 2025-10-01 are in the archive; a new producer run; whether the producer's truth reader holds them is not established), Sentinel-1D (orbits 2026-01-09 to 09-18 in the archive; not in any stored set; whether C2 holds it is not established). No Starlink group, held Galileo satellite, operator capture or C2 row is read; `--check` refuses any.

Minimum: a regime's cell (both arms pooled, one lead) needs 30 window-arms. A required regime with fewer at any of days 1, 3 and 7 is reported, not decided, and the verdict says so.

## 4. Criterion and selection rule

Loss (training): the refit's, unchanged: per regime (T, S1) the mean over R, I, C and lead hours 1 to 167 of (ln(median |z| / 0.674))^2, both arms pooled, the regimes averaged. Solver: Nelder-Mead on the natural logs of the positive parameters and on q_i, q_d, p_l, m directly; starts at the 0.6.1 row with every added parameter at its neutral value (c_i 0 by ln 1e-12, q 0, p_l 1, m 0, 1 / tau 1e-4 per day, s_a 1e-12, k_a = k_F) and at three registered offsets per added parameter (q_i 0.25, 0.5, 1; q_d -0.5, -1, 0.5; p_l 1.25, 1.5, 2; m 0.5, 1, 1.5; 1 / tau 0.1, 0.3, 1; s_a 1e-6, 1e-5, 1e-4 rad/day^2; c_i 0.01, 0.1, 1; k_a x 3, 10); 4,000 evaluations each at most, simplex steps ln 10 (0.25 for q, p_l, m); the lowest loss is the form's fit. Each form is fitted once; nothing is re-tuned after a held-out row is read.

Pass (held-out), per required regime (strong drag 2026; near 700 km), both arms pooled: median |z| inside [0.603, 0.754] on R, I and C separately at lead hours 24, 72 and 167 (18 cells). No-harm (weak drag): on each of its 9 cells, |ln(median |z| / 0.674)| no larger than under 0.6.1, or inside the band. Reported beside every cell, not deciding: the share with |z| <= 1 and <= 2 (calibrated 0.683 and 0.954; their images of the median band for a Gaussian, [0.629, 0.736] and [0.926, 0.975]; a cell whose 2-sigma share is below 0.90 is labeled heavy-tailed), and in 3D the mean d^2/3 and the share inside the 95 % ellipsoid (SPEC 12.7: [0.8, 1.25], [0.93, 0.97]) from the full position block. Reading taken: the record's acceptance names the medians; the shares are reported, not required. The session may make them required before any fit.

Selection, written now: the first form in section 2's order that passes held-out and no-harm is selected (the simplest; among equal order the fewest parameters). If none passes, nothing ships, the module stays at 0.6.1 with no realism label, and the report names the form with the smallest worst held-out |ln(median |z| / 0.674)| and its failing cells.

## 5. Module implementation and its E2E

`src/covariance.inc`. `Noise` gains the selected form's constants (for the leading forms: q_i, k_FU, k_FV, k_FW; T2's m; T4's s_a; T5's q_d); `kNoiseAP[0]` takes the fitted values; `kNoiseAP[1]` and `kNoiseXP` take the neutral values that reproduce their present sizes (q 0, k per axis equal to their k_F), so their sets are unchanged. Per-set forms (F1 to F7, F11, F12) are applied in `noise_of` when the set is written: s_i' = s_i (nu / nu_0)^q_i into NOISE_INCLINATION_PER_DAY, s_l by L into NOISE_MEAN_MOTION_RELATIVE, the n-dot size into NOISE_NON_GRAVITATIONAL_RAD_DAY2 with NON_GRAVITATIONAL_SHARE set to keep the invariant, the per-axis floor scale into FLOOR_* (the $OCM carries the floor scaled); `eval` and the reader do not change, and the record's schema does not change. Time-shaped forms (F8 to F10) change `eval` (the column at d times d^(p_l - 1) or (1 + d / tau)) and need p_l or tau in COV_PROPAGATION: a new field of OCMCovariancePropagation, an SDS release (after the SDS oracle's ruling; no rename) and the reader in the same push. The $PCF carries nothing: the noise is the module's table, as now. SPEC 12.5 is rewritten with the form, its table and the held-out cells; the README's covariance paragraph follows.

Version: 0.6.2 or later, one binary change shared with `modules-sdn-ap-tesseral-series-ripple-20261105` if both are ready (that change moves states only above e 0.3; every window here is below it, so neither change moves the other's evidence); otherwise whichever lands first is 0.6.2 and the other the next. Flown states stay byte-identical; set bytes change only in COV_PROPAGATION.

E2E `test/covariance-realism.e2e.mjs`: from the held-out inputs exported to `/opt/data/sdn-archive/operator-theory/covariance-model/held-out/` (per window and arm the producer's $OEM, $PCF and $SPW bytes, the truth at lead hours 24, 72 and 167 in GCRF, the stored fit's BTERM, AGOM and RMS as the control), the built module fits each window, the control matches, `propagate` flies the covariance at the three leads, `pair_statistics` gives z per axis; it prints, per regime (strong drag 2026, near 700 km, weak drag), axis and day, the median |z| of 0.6.1 (from the export's stored row) and of the build, the 1- and 2-sigma shares and the 3D figures, and asserts: the 18 required cells inside [0.603, 0.754], the 9 no-harm cells, the selected constants read back from a fitted set's COV_PROPAGATION, and the demo's ISS figure printed (in-track 1-sigma and error at 2026-07-14T00:00Z).

## End to end

`node experiments/operator-theory/covariance-model.mjs --check`: this registration's commit precedes the held-out rows' manifest; no training row is a held-out window and none is a hold-out; the held-out rows' control shows 0 differing scalars and the unchanged copy flies byte-equal; re-weighting at the 0.6.0 sizes reproduces the rows' full variances (relative 1e-6) and every re-flown sample is counted; table.json and README.md under `results/ap-truth/covariance-model` reproduce from the rows; the selected form, or none, is named with its held-out medians and verdicts.
