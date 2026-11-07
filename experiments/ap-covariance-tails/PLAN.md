# AP covariance tails: registration

Task `experiments-ap-covariance-tails-20261107`. Report-only: no module change, no site change, no covariance form selected. Written and pushed to a WIP ref before any tail statistic is computed. A deviation is an amendment at the end of this file, dated, with its reason. Registration chain: merged, never rebased.

## Question

The site states AP's covariance as a median: held-out median |z| 0.32 to 0.91 against a calibrated 0.674, 8 of 18 cells inside the band, "right to within about a factor of two" (`results/ap-truth/covariance-refit`). Conjunction decisions are made in the tails. What do the tails show on the same windows, and how much of the verdict is Swarm?

## What was read before this registration (disclosed)

`results/ap-truth/covariance-refit/README.md` and `table.json`, which print per-cell shares within 1 and 2 sigma and diagonal d2 figures on these windows; `results/ap-truth/covariance-model/README.md`, which prints 2-sigma shares on blocks overlapping them. So the 2-sigma picture is partly known; this plan is not blind to it. Of the rows, only structure and counts: field names, and rows per satellite and block with no error or variance value. Share beyond 3 sigma, full-block Mahalanobis, and every per-satellite figure have not been computed by this lane.

Facts from those counts, fixed here because they shape the design:

- Strong drag held-out (2025-08-21 to 12-21): Swarm A, B, C 120 windows each, cutoffs from 2025-08-21; GRACE-FO 1, 2 79 windows each, cutoffs from 2025-10-04. Swarm is 360 of 518 windows.
- Strong drag training (2025-04-01 to 08-10): Swarm A, B, C only, 132 windows each. GRACE-FO has no training window. The refit's strong-drag half of the loss saw no GRACE-FO; GRACE-FO's held-out windows are out of sample by satellite as well as by time.
- Near 700 km held-out (2026-03-26 to 05-31): Sentinel-1A, 1C, 67 windows each, not all arms flown.
- Cutoffs are daily, and two arms fly each window. Samples at one lead are therefore strongly dependent.

## Rows, read-only

**A1, primary.** `/opt/data/sdn-archive/operator-theory/covariance-model/{trT,trS1}/rows-*.jsonl`: the coverage study's own windows, keys and arms re-flown on the shipped `propagator/sdn-ap` 0.6.1, wasm SHA-256 `05dd4a6600fb4c65d5841e1f49dc26df64fca7c14f1084644cafcfa875fe0a87` (the refit's fitted row as a build), 17 digits, the full RIC position block per flight (COVARIANCE-MODEL.md amendment 2, fit control 0 differing scalars). This is the only store that supports a true Mahalanobis distance on these windows.

**A0, control.** `/opt/data/sdn-archive/operator-theory/covariance-coverage/{truth,truth2}/rows-*.jsonl` (0.6.0, wasm `0b5280f05176`) re-weighted to the row in `results/ap-truth/covariance-refit/table.json`: literally what the refit reported. Diagonal only, 10 digits. Reported beside A1 per axis. The rows keep no cross-axis term, so A0 gets no Mahalanobis figure; its Sum z^2 is printed labeled "diagonal, not Mahalanobis".

Both are restricted to the refit's held-out cutoffs, plus its training cutoffs for the post-hoc arm only. Same window, arm and lead keys in both; any mismatch is counted and printed.

Not opened: `covariance-model/{p26,s1q4,dols}` (the model study's unread held-out rows stay unread), any Starlink, held Galileo, operator capture or C2 row. No Swarm or GRACE-FO truth after 2025-12-28. The runner refuses a row that breaks this. Burn catalog: only `covariance-model/steps/trS1-{39634,62261}.json`.

Nothing is flown. These figures are 0.6.1. That 0.6.3 and 0.6.4 have the same covariance is the site's statement, not tested here.

## Definitions

z_a = e_a / sigma_a on axis a (R, I, C). d2 = e^T P^-1 e with P the 3 x 3 RIC position block of the flight. Control: the module's own `d2` in the row, printed if it is the same quantity, and the difference; any block not positive definite is counted. Regimes and pooling as the refit: T strong drag 2025, S1 near 700 km 2026, both arms pooled; per-arm figures in `table.json`.

Leads: the refit's 1, 6, 12, 24, 48, 72, 120, 167 h; verdict leads 24, 72, 167 h.

## Statistics

1. **Tail shares.** Per regime, axis, lead: share |z| > 2 and > 3, against 4.550 % and 0.270 %.
2. **Mahalanobis.** Per regime, lead: share of d2 beyond the chi-square 3 quantiles 7.815 (5 %), 11.345 (1 %) and 14.156 (0.27 %); mean d2 / 3; median d2 against 2.366; sup |F_emp - F| against chi-square 3, closed form.
3. **Tail scale, the reading of "about a factor of two".** Per regime, axis and verdict lead: the factor on sigma that would put the share at nominal: k2 = the 95.45th percentile of |z| / 2 and k3 = the 99.73rd percentile of |z| / 3, beside the median's k0 = median |z| / 0.6745. The claim holds in the tails on a cell if k lies in [0.5, 2].
4. **Per satellite.** Items 1 to 3 per satellite at the verdict leads, plus the median |z| band verdict.

## Intervals, 95 %, clustered by satellite, never by window

- **B-sat, as asked.** Satellites resampled, enumerated exactly: T 5^5 = 3,125 sequences, S1 2^2 = 4. Percentiles over sequences.
- **B-grp.** Independent groups resampled, enumerated exactly: T {Swarm A, C}, {Swarm B}, {GRACE-FO 1, 2} = 27 sequences. S1 {Sentinel-1A, 1C} is one group (same plane, phased half an orbit), so it has no between-group interval and says so.
- **B-hier, the decision interval.** Two stages, 4,000 draws, mulberry32 seed 20261107: resample groups, then within each drawn group resample 7-day cutoff blocks, the same block for every satellite in the group so the pair's dependence survives. Between-satellite enumeration alone is falsely narrow where the satellites happen to agree.

Few clusters make all three coarse: S1 has 2 satellites and 1 group, T 5 and 3. This is stated beside the figures. A percentile interval over 3 groups does not have its nominal coverage.

**Decision rule.** Against a reference, a cell is "heavier" if B-hier's lower bound exceeds it, "lighter" if the upper bound is below it, otherwise "not decidable". No other wording.

## Effective sample size

Cluster = independent group x 7-day cutoff block, the same groups as B-grp; 7 days is the longest lead, so windows within a cluster share atmosphere. Per cell and statistic, for an indicator with share p over n samples: Var(p) = g/(g-1) x sum over clusters (sum (I - p))^2 / n^2, n_eff = p (1 - p) / Var(p). Printed beside n arm-samples, windows, satellites, groups and clusters g. For p = 0, n_eff is undefined and printed as such, with the bound 3 / g. For the median: I = |z| <= the cell's median, n_eff at p = 0.5.

Beside it, the size of the test:

- The expected count at n_eff for a calibrated Gaussian (n_eff x 0.0027 for 3 sigma). Under 5 is named as "too few to resolve".
- For the 18 median cells, a calibrated covariance's chance to land inside [0.603, 0.754] at n_eff: normal approximation, SE = 0.787 / sqrt(n_eff).
- The sum of those chances: the expected cells inside out of 18 for a calibrated covariance, beside the observed count.

## Swarm

Stated first: Swarm's share of T's windows and samples, of the 18 cells, and of T's training (all of it).

Readings of the 18-cell band verdict and of the tail shares at verdict leads; S1 is unchanged in all of them:

- **V-all.** As the refit pooled.
- **V-swarm.** T on Swarm only.
- **V-grace.** T on GRACE-FO only.
- **V-common.** T on cutoffs from 2025-10-04 only, pooled, then Swarm and GRACE-FO separately on that span, because Swarm's extra six weeks are a different season.
- **V-one, the reduced verdict.** Swarm A, B, C are one independent group. Sample weights make Swarm's total equal GRACE-FO's. Weighted median and weighted shares; B-hier reduced to week blocks within fixed groups.
- **V-three.** {A, C}, {B}, {GRACE-FO} equal weight, the physically defensible alternative, because Swarm B flies a different plane and height.

The reduced verdict is V-one. Also printed: cells that flip between V-all and V-one, and the largest share of a cell's |z| > 3 samples coming from one group-week, the concentration in a single event.

## Near 700 km burns

Primary reading uncensored, as the refit reported it. Second reading: burn-censored by the model study's amendments 3 and 4 rule and catalog (a window-arm is dropped if a step or unchecked stretch lies in its arc; a lead is scored only if none lies in (cutoff, lead]), any cell under 30 window-arms "not decidable". Strong drag cannot be censored: no maneuver record is held (amendment 4), so any Swarm or GRACE-FO maneuver is inside these shares. Stated beside the figures.

## Post-hoc arm: exploratory, not a calibration

Labeled post-hoc wherever it appears. Written before the arm is computed, but after the 2-sigma picture above, so it is not a registered test. Strong drag only, 0.6.1 rows.

- Scale the cross-track sigma by one constant k: P' = D P D, D = diag(1, 1, k), every lead.
- **Measured on one part:** the refit's training block, both arms, lead hours 24, 72, 167 pooled, Swarm only by construction.
- Two factors, both reported, neither chosen: k_tail = the 95.45th percentile of |z_C| / 2, k_median = median |z_C| / 0.6745.
- **Tested on windows that fit never saw:** the refit's held-out block, read as (a) all, (b) Swarm, (c) GRACE-FO, the last on satellites the factor has also never seen. Per lead 24, 72, 167: share |z_C| > 2 and > 3, the share of d2 beyond the three chi-square quantiles, B-hier intervals, the decision rule.
- No form selected, no table written, nothing proposed for a module. The held-out block's 2-sigma shares were already public when this arm was designed.

## What these rows cannot support

- A burn-censored strong-drag reading (no maneuver record held).
- More than a coarse between-group interval (3 groups, 1 near 700 km).
- Any claim beyond the two regimes.
- A statement about regimes the post-hoc arm did not touch.

## Report

`results/ap-covariance-tails/table.json` and `README.md`, written only by `run.mjs`, from the rows alone; first line of the README is the verdict. A bad result is a valid result; nothing here is tuned toward a pass.

## End to end

`node experiments/ap-covariance-tails/run.mjs --check`:

- This PLAN's first commit precedes the results' first commit and is an ancestor of it.
- `table.json` and `README.md` reproduce byte-equal from the rows.
- A0's 18 held-out medians equal `results/ap-truth/covariance-refit/table.json` at its printed precision and give 8 of 18 inside.
- Hold-out rows 0, and no file of `p26`, `s1q4` or `dols` opened.
- Arm-sample counts equal the refit's per cell.

It prints the numbers: the 18-cell counts for A0, A1 and V-one, and the 2 and 3 sigma shares at the verdict leads.

## Amendment 1, 2026-11-06, after reading the first run (written to scratch, not committed)

Timing: every item here was written after the registered tables above were read. None changes a registered figure. The first run's counts stand; items 2 to 4 are post-read diagnostics and are labeled so in the report. Nothing here selects a covariance form.

1. **Correction to the decision rule.** A percentile interval cannot bound a share with few or no hits: a zero-hit cell's interval is [0, 0] whatever its n, so the registered rule printed "lighter" where the data cannot say so. From here "lighter" also needs a calibrated expected count of at least 5 at the cell's n_eff, and a zero-hit cell is "not decidable". "Heavier" is unchanged. The report prints how many cells this moved, and the registered reading stays in `table.json` as `rawDecision`.
2. **Whole-covariance factor (post-read).** Beside k2 and k3 per axis: the factor on the whole covariance that puts d2's share at nominal, sqrt(95th percentile of d2 / 7.815) and sqrt(99.73rd percentile of d2 / 14.156). Reason: the first run showed d2 far past chi-square 3 in strong drag at days 5 and 7 while each axis stays near nominal.
3. **Why the joint and the axes disagree (post-read, explanation only).** Per regime and lead: d2 beside Sum z^2 from the same flights; rho(R, I) and 1 - rho^2; sigma_R given I against the radial residual after the block's own R-on-I slope; a least-squares fit of e_R on 1, e_I and e_I^2, whose quadratic term is compared with -1 / (2r), the curvature of the orbit in straight axes; d2 with e_I^2 / (2r) removed from e_R. r is a nominal radius, 6,878 km strong drag and 7,071 km near 700 km: a size estimate, not a state, used nowhere else.
4. **R-C plane (post-read).** d2 of the R-C sub-block against chi-square 2 (5.991 and 11.829), with B-hier and the decision rule, to show whether the joint miss is confined to the R-I plane. No statement about collision probability follows from it.

Also read after the first run, for the report's wording only: the pooled reduced verdict rises because Swarm and GRACE-FO lie on opposite sides of the band on the cross-track axis, so the report prints each flip with both groups' medians.
