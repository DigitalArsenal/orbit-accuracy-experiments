# COVARIANCE-REFIT: AP's DRAG process-noise table fitted to a per-axis realism criterion

Registered under `modules-sdn-ap-covariance-noise-refit-20261105`, written and pushed before any row of the coverage study is read by this record. It builds on COVARIANCE-COVERAGE.md (experiments 66adda2f): AP 0.6.0's propagated 1-sigma is 274 to 530 times too wide in-track and about 1,000 to 7,600 times radially at day 1; the old DRAG table (SPEC 12.5, `kNoiseAP[0]`) was fitted by minimax on the mean d^2/3, which is blind to the width of each axis. Owner priority: covariance realism over set accuracy. The module change follows in `propagator/sdn-ap` 0.6.1.

## Rows

The coverage study's rows, `/opt/data/sdn-archive/operator-theory/covariance-coverage/{truth,truth2}/rows-*.jsonl` (sdn-ap 0.6.0, wasm `0b5280f05176`, modules 895b6b38), read-only. Per window and arm, per lead hour h = 1 to 167 after the fit's end: the forward error in radial, in-track and cross-track (R, I, C; `analysis/gp-error-model` `pair_statistics`, axes from the truth) and each axis's propagated variance from six flights: full; s_e off; s_i off; s_l off; s_d off; all four off. Each row also carries the record's COV_PROPAGATION (the noise sizes it was flown with and the floor). A window or arm without leads is skipped. No hold-out is read: the rows hold no Starlink, held Galileo, operator or C2 window, and no Swarm or GRACE-FO truth after 2025-12-28.

## Training and held-out windows

Two regimes, both arms of each pooled: strong drag 2025 (set `truth`: Swarm A, B, C, GRACE-FO 1, 2; arms AP24, APRa12) and near 700 km 2026 (set `truth2` group S1: Sentinel-1A, 1C; arms AP72, AP24). The satellites fly in pairs (Swarm A and C, GRACE-FO 1 and 2) and the second regime has two, so the sets are disjoint by cutoff: each regime's period in two contiguous blocks with a 10-day guard (a 72 h arc plus a 7-day lead), so that no truth state of a held-out window lies in any training window's arc or lead.

| Regime | Training cutoffs | Held-out cutoffs |
|---|---|---|
| Strong drag, 2025 | 2025-04-01 to 2025-08-10 | 2025-08-21 to 2025-12-21 |
| Near 700 km, 2026 | 2026-01-01 to 2026-03-15 | 2026-03-26 to 2026-05-31 |

The fit reads only training rows. The held-out rows give the predicted after-coverage in this study; the module's realism E2E re-runs the held-out windows on the shipped build.

## Criterion

Per window and axis a: z_a = e_a / sigma_a, the error component over the propagated 1-sigma. Calibrated: median |z_a| = 0.674; band [0.603, 0.754], the one-axis image of SPEC 12.7's 3D band (0.674 x sqrt of [0.8, 1.25]). The loss is, per regime, the mean over axes R, I, C and lead hours 1 to 167 of (ln(median |z_a| / 0.674))^2, the median over the regime's training windows of both arms at that lead; the two regimes' losses are averaged. Pass, on the held-out windows, per regime: median |z| inside [0.603, 0.754] on R, I and C separately at days 1, 3 and 7 (lead hours 24, 72, 167; 167 as the coverage study's day 7). Reported beside it: per axis the share of samples with |z| <= 1 (calibrated 0.683) and <= 2 (0.954); in 3D the mean d^2/3 and the share inside the 95 % ellipsoid (SPEC 12.7: [0.8, 1.25] and [0.93, 0.97]); in this study d^2 is the sum of z_a^2 over the axes (the rows keep no cross-axis covariance), in the module's E2E the full position block's.

## Terms

Five, solved jointly: s_e, s_i, s_l, c (the DRAG row of the AP table, s_d = c |n-dot_ng|) and k_F, a scale of the floor (SPEC 12.4). s_i is the cross-track term and the criterion covers C, so it is solved with the record's four. The process noise enters P(t) as the sum of g g^T with g linear in each size (`src/covariance.inc` `eval`), and the floor adds; so each axis variance at a new table is exactly, per sample,

v_a' = v_off,a + (k_F - 1) F_a + sum over k in (e, i, l, d) of rho_k (v_full,a - v_k,a), with rho_k = (s_k' / s_k)^2 and rho_d = (c' / c)^2

against the sizes the row was flown with (F_a the record's FLOOR_UU, FLOOR_VV, FLOOR_WW for R, I, C; the coverage study's shares summed to 1 within 3.3e-7 under this decomposition). No orbit is fitted and no state flown in the fit: it re-weights the module's own variances. The ABOVE row and the SGP4XP table are not in these windows and stay as they are.

## Solver

Nelder-Mead on the natural logs of the five terms, deterministic: starts at the 0.6.0 row (k_F 1) and at that row with s_e, s_l and c each divided by 100, 1,000 and 10,000 (k_F 1, s_i 1, 10 and 100 times); 4,000 evaluations each at most, simplex steps of ln 10; the lowest loss of all starts is the table. The values are printed with 17 significant digits.

## Run and outputs

`node experiments/operator-theory/covariance-refit.mjs --fit` writes `results/ap-truth/covariance-refit/table.json` and `README.md` from the rows alone: the 0.6.0 row and the fitted one; per regime, arm (and both pooled), set (training, held-out), axis and lead hour 1 to 167 the median |z|, the shares within 1 and 2 sigma, before and after; the 3D figures; the loss of each start. `--export` writes the held-out windows' module inputs to `/opt/data/sdn-archive/operator-theory/covariance-refit/held-out/` for the module's E2E: per window and arm the fit's $OEM, $PCF and $SPW bytes as the producer built them (the coverage study's worker path, no fit run), the truth states at the lead hours 24, 72 and 167 in GCRF, and the stored 0.6.0 fit's BTERM, AGOM and RMS as the control; and the ISS demo sample's fit inputs and its last state. Run under `nice -n 10` with at most 6 workers while the 1-minute load is under 42.

## End to end

`node experiments/operator-theory/covariance-refit.mjs --check`: this registration's commit precedes the results' commit; no training row lies in a held-out block or its guard and none is a hold-out; table.json and README.md reproduce from the rows; the re-weighted variances with the 0.6.0 row reproduce the rows' full variances (relative 1e-6) and with all terms at 0 and k_F 1 the noise-off ones; the fitted table, the training loss and the held-out per-regime, per-axis medians at days 1, 3 and 7 are printed with their band verdicts.

## Amendment 1, 2026-11-05, after the fit

The registered fit's held-out verdict is FAIL (results/ap-truth/covariance-refit): the fitted row takes AP's day-1 width from 274 to 530 times too wide in-track and about 1,000 to 7,600 times radially to held-out medians |z| of 0.32 to 0.91 at days 1, 3 and 7 (0.26 to 1.71 over every lead hour, both sets), but 10 of the 18 held-out cells (two regimes, three axes, days 1, 3 and 7) lie outside [0.603, 0.754]. By the record's rule no table ships and the module is unchanged; `--export` is not run. Three diagnostics, first run in the lane's scratch after the fit and now written by `--fit` from the same rows (report only, never a table): (a) each regime with its own row, by the registered loss and solver on its own training windows; (b) one row with the cross-track size growing with the non-gravitational rate, s_i + c_i |n-dot_ng / n|, a form the module does not have; (c) the near-700 km cross-track median |z| at day 7 wherever the strong-drag one is inside the band, over a grid of s_i and k_F. None meets the held-out band.

## Amendment 2, 2026-11-05, rulings after amendment 1

This report lands with the record's acceptance line "realism E2E PASS" not met. By the SDN-AP session's later ruling the fitted row (s_e, s_i, s_l, c, with k_F applied to the floor) ships as `propagator/sdn-ap` 0.6.1 without a realism label; that module's E2E reports the held-out cells of 0.6.0 and 0.6.1 side by side and does not claim the band. README.md's ISS figure is a prediction by re-weighting; the module's E2E measures it on the built module.
