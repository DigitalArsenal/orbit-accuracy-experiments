# XM5: why does F2 lose XM3's tail rule at days 1-3? Observed daily weather closes it only at day 3

**Registered outcome: "closes at one or two of them", day 3 only.** XM3's F2 (our full-force propagator, propagator/ffm, fitted by analysis/estimation to 72 h of precise truth, NRLMSISE-00 on the weather as issued) fails rule 2 against the public Space-Track set under SGP4 (P) on drag-strong LEO at days 1, 2 and 3. On observed weather (F2M) the upper bound of the p95 ratio is 1.21, 1.17 and 0.94 at days 1, 2 and 3, against 1.26, 1.31 and 1.20 as issued (0.78 against 1.05 at day 7), and the limit is 1.10. So weather accounts for the tail at day 3 and the rest stays open. Condition M reads weather nobody had at the cutoff: it tells cause, not skill. It is a sensitivity and moves no registered verdict, so XM3's "no" stands.

**As-issued weather costs F2 about 20 % at the median, at every lead.** F2M against F2 as issued (F2O): -20.3 %, -20.0 %, -20.1 % and -25.9 % at days 1, 2, 3 and 7, every interval wholly below 0; its p95 ratio is 0.86, 0.83, 0.77 and 0.76, and only day 1's interval holds 1. M changes F10.7, Ap and F10.7a together and does not say which of them matters. On Sentinel-1, near 700 km, weather changes nothing: the p95 ratio is 0.98 to 1.01 and the median within 0.1 %.

**One week's cutoffs carry the tail, and observed weather does not move it.** With the cutoffs of ISO week 2026-W04 out (report only; the week stays in the registered test), F2 as issued has bounds 0.97, 1.03, 1.00 and 0.89, all below 1.10. W04 holds 19, 23, 22, 16 of F2's worst 38 at days 1, 2, 3 and 7 as issued, and 20, 21, 21, 16 on observed weather (P: 10, 12, 11, 6). Of the 38, 29, 31, 25, 24 stay in the worst on observed weather. A storm day in the arc marks 115 of the 750 windows and 24, 25, 21, 16 of the 38 as issued, 25, 27, 24, 17 on observed weather (P: 12, 12, 12, 10).

**The tail left at days 1 and 2 sits in arcs that span a storm.** By the registered reading, a tail M leaves in such windows points at the fit under daily Ap or at NRLMSISE-00's storm response, not at the weather forecast. The next test named in the plan, FFM with the 3-hourly ap history (F2H), was not run: propagator/ffm cannot accept one without a module change (below).

Generated from `results/ffm-tail-cause/table.json` (`node experiments/ffm-tail-cause/table.mjs`, 1,020 stored M windows, rows digest `8134ce0a14d3`, XM3's rows digest `1af3adb87236`). Plan: [PLAN.md](../../experiments/ffm-tail-cause/PLAN.md), registered at commit 6ce0295 (pushed to origin `wip/experiments-ffm-tail-cause-20261031/registration` at 2026-10-31T10:28:52Z, before any score under M; its blobs are commit 06c8df1), runner 4ee6e2e (pushed 10:33:29Z, before the sample and any scored run; its blobs are 57fdd5c), no amendment. XM3 at 22313bf imported unchanged. Modules 9a05d899b: propagator/ffm 2.0.4 c36f1b14fc233e88, analysis/estimation 0.7.0 7a555ca5b3ed0b02.

## These windows were analyzed before

XM5 runs F2 on observed weather on the windows XM3 scored as issued (groups P and S1, cutoffs 2026-01-02 to 2026-05-31). Every XM2 and XM3 row and cell was published and read by the registrants, and the worst-window list was read before the registration. F2 had never been scored under M on these windows. The weather rows of both conditions were read for the registration, with the 3-hourly ap of the January week; the plan records what they showed before any score. The definition of "closes" was written knowing O's bounds. XM5 is a look for cause on known windows, not a fresh sample.

## What this is not

M is not as-issued. It reads GFZ's observed F10.7, definitive Ap and the true centered 81-day mean of F10.7, retrieved 2026-10-09, in the fit and through the 7-day horizon. No row here is a claim about FFM against SGP4 on inputs available at a cutoff. C1 below uses the form of XM3's three rules, and it meets them at days 3 and 7; that is a reading of cause, not a verdict.

## Group P, drag-strong precise LEO (primary)

750 pairs in 66 clusters at every lead. F2O and P are XM3's stored rows; F2M is run here. Medians of e in km; rule 2's limit is 1.10.

| Lead | F2O median | F2M median | P median | F2O vs P | F2M vs P | 95 % interval | F2O p95 ratio | F2M p95 ratio | F2O bound | F2M bound | F2M failures | F2M vs F2O | 95 % interval | F2M / F2O p95 ratio |
| --- | --: | --: | --: | --: | --: | --- | --: | --: | --: | --: | --: | --: | --- | --- |
| Day 1 | 0.310 | 0.218 | 0.763 | -60.9 % | -72.3 % | -76.6 % to -65.8 % | 0.94 | 0.81 | 1.26 | **1.21** | 1 of 750 | -20.3 % | -26.1 % to -17.0 % | 0.86 (0.78 to 1.06) |
| Day 2 | 1.025 | 0.719 | 1.309 | -29.2 % | -49.4 % | -55.1 % to -44.5 % | 0.93 | 0.77 | 1.31 | **1.17** | 1 of 750 | -20.0 % | -29.1 % to -16.5 % | 0.83 (0.69 to 0.98) |
| Day 3 | 2.161 | 1.618 | 2.454 | -17.5 % | -40.1 % | -47.5 % to -35.2 % | 0.90 | 0.69 | 1.20 | **0.94** | 1 of 750 | -20.1 % | -28.0 % to -15.5 % | 0.77 (0.67 to 0.91) |
| Day 7 | 11.955 | 10.332 | 15.348 | -14.2 % | -40.4 % | -45.8 % to -31.3 % | 0.80 | 0.60 | 1.05 | **0.78** | 1 of 750 | -25.9 % | -30.4 % to -21.0 % | 0.76 (0.61 to 0.91) |

The outcome in the plan's words: closes at day 3 of days 1 to 3. C3's p95 interval is not wholly above 0 at any of them, so the row "observed daily rows make the tail worse" does not apply.

With satellite x ISO week clusters (report; 110 clusters), the bounds are 1.07, 1.09, 0.85 and 0.71 on observed weather and 1.16, 1.25, 1.05 and 0.98 as issued. The registered clusters are orbit group x ISO week; the choice moves days 1 and 2 across 1.10 on observed weather, so those two days are close.

**Cutoffs of 2026-W04 out** (35 windows, three clusters; report only). Cutoffs of W03 whose horizon crosses the storm stay in, so this is not "without the storm".

| Lead | Pairs | F2O vs P | F2M vs P | F2O p95 ratio | F2M p95 ratio | F2O bound | F2M bound |
| --- | --: | --: | --: | --: | --: | --: | --: |
| Day 1 | 715 | -62.1 % | -73.6 % | 0.75 | 0.69 | 0.97 | 0.89 |
| Day 2 | 715 | -32.0 % | -50.9 % | 0.86 | 0.67 | 1.03 | 0.80 |
| Day 3 | 715 | -21.3 % | -42.6 % | 0.80 | 0.60 | 1.00 | 0.72 |
| Day 7 | 715 | -16.5 % | -42.1 % | 0.70 | 0.54 | 0.89 | 0.67 |

## Group S1, Sentinel-1A and 1C (report)

21 clusters.

| Lead | Pairs | F2O median | F2M median | P median | F2O vs P | F2M vs P | 95 % interval | F2O bound | F2M bound | F2M failures | F2M / F2O p95 ratio |
| --- | --: | --: | --: | --: | --: | --: | --- | --: | --: | --: | --- |
| Day 1 | 259 | 0.181 | 0.175 | 0.734 | -76.3 % | -76.5 % | -83.9 % to -71.8 % | 1.18 | 1.17 | 0 | 1.00 (0.98 to 1.01) |
| Day 2 | 258 | 0.501 | 0.503 | 1.003 | -53.6 % | -53.2 % | -68.4 % to -40.9 % | 1.39 | 1.38 | 0 | 0.98 (0.97 to 1.04) |
| Day 3 | 258 | 0.945 | 0.938 | 1.333 | -40.9 % | -39.9 % | -52.6 % to -20.1 % | 1.08 | 1.09 | 0 | 1.01 (0.87 to 1.04) |
| Day 7 | 257 | 3.317 | 3.529 | 4.150 | -12.6 % | -10.2 % | -18.9 % to -0.7 % | 1.12 | 1.10 | 0 | 1.00 (0.95 to 1.13) |

Weather has no effect here. With W04's cutoffs out, the bounds are 1.09, 1.06, 1.12 and 1.09 as issued and 1.10, 1.06, 1.13 and 1.23 on observed weather. W04 holds 4, 4, 5, 5 of F2O's worst 13 and 2, 3, 6, 8 of P's; 13, 13, 12, 13 of F2O's worst 13 stay under M.

## Tail accounting, group P (report only, no intervals)

Worst 5 %: the 38 windows of largest e at each lead. Each cell gives F2O, F2M and P, at days 1, 2, 3 and 7 by column. Under O the W04 counts equal XM3's published 19, 23, 22 and 10, 12, 11, as required. A storm day is XM's `stormDay` (Ap >= 50 or any Kp >= 6).

| Worst 38 by | Day 1 | Day 2 | Day 3 | Day 7 |
| --- | --- | --- | --- | --- |
| ISO week 2026-W04 (35 of 750 windows) | 19, 20, 10 | 23, 21, 12 | 22, 21, 11 | 16, 16, 6 |
| A storm day in the arc (115 of 750) | 24, 25, 12 | 25, 27, 12 | 21, 24, 12 | 16, 17, 10 |
| A storm day only in the forecast (30, 60, 90, 200) | 0, 3, 3 | 3, 1, 5 | 7, 1, 6 | 10, 9, 13 |
| No storm contact (605, 575, 545, 435) | 14, 10, 23 | 10, 10, 21 | 10, 13, 20 | 12, 12, 15 |
| GFZ Ap of D0 - 1 at 50 or above (20 of 750) | 14, 14, 12 | 17, 17, 10 | 15, 17, 8 | 9, 11, 4 |
| GFZ Ap of D0 at 50 or above (20 of 750) | 9, 10, 10 | 13, 11, 12 | 14, 10, 11 | 10, 7, 6 |
| As-issued Ap of D0 at 30 or above (70 of 750) | 18, 20, 16 | 19, 23, 12 | 18, 20, 12 | 15, 14, 10 |

Each cell below gives F2O, then F2M, where it gives two.

| Worst for P as well, and the shift | Day 1 | Day 2 | Day 3 | Day 7 |
| --- | --- | --- | --- | --- |
| Also in P's worst 38 (chance is 5 %) | 11 (29 %), 10 (26 %) | 14 (37 %), 13 (34 %) | 16 (42 %), 14 (37 %) | 17 (45 %), 13 (34 %) |
| P's median percentile in those windows | 67, 75 | 81, 80 | 88, 79 | 94, 87 |
| Share of them where F2's e exceeds P's | 71 %, 74 % | 63 %, 66 % | 55 %, 61 % | 42 %, 53 % |
| The same share over all 750 | 14 %, 10 % | 34 %, 25 % | 40 %, 29 % | 44 %, 31 % |
| F2O's worst 38 that stay in F2M's | 29 | 31 | 25 | 24 |
| Median e of F2M / e of F2O inside them | 0.90 | 0.87 | 0.80 | 0.68 |

- **Shared with P:** between the plan's 15 % and 50 % at every lead, so "mixed". Storm-week windows are hard for both, but more than half of F2's worst windows are not P's worst.
- **B against its seed:** median ln(B / seed) over all windows is 0.26 as issued and 0.34 on observed weather; M moves B by a median 0.089 in |ln ratio|. In F2O's worst windows at day 1 it is 0.22 and 0.29, moved by 0.057, less than over all windows.

## Exploratory (written after the outcome; decides nothing)

`node experiments/ffm-tail-cause/explore.mjs` writes these to `results/ffm-tail-cause/exploratory.json`. No intervals. Each cell gives F2O, F2M and P, median e in km.

| Storm contact (windows) | Day 1 | Day 2 | Day 3 | Day 7 |
| --- | --- | --- | --- | --- |
| No storm contact | 0.27, 0.19, 0.76 (605) | 0.86, 0.62, 1.28 (575) | 1.81, 1.30, 2.40 (545) | 11.07, 9.67, 15.39 (435) |
| Storm only in the forecast | 0.23, 0.32, 0.87 (30) | 1.28, 0.74, 1.47 (60) | 2.41, 1.72, 2.77 (90) | 11.72, 10.75, 13.12 (200) |
| Storm only in the arc | 0.62, 0.44, 0.75 (90) | 1.91, 1.33, 1.35 (90) | 3.68, 2.48, 2.40 (90) | 23.06, 11.20, 13.76 (75) |
| Storm in both | 1.37, 1.11, 0.98 (25) | 4.45, 4.03, 1.64 (25) | 7.82, 7.28, 5.62 (25) | 28.20, 16.19, 30.15 (40) |

| Cutoff | Day 1 | Day 2 | Day 3 | Day 7 |
| --- | --- | --- | --- | --- |
| 2026-01-19 | 0.12, 0.50, 0.87 | 2.91, 0.93, 3.60 | 10.95, 2.98, 11.44 | 60.60, 22.53, 61.41 |
| 2026-01-20 | 1.47, 1.22, 3.06 | 7.25, 6.09, 10.54 | 15.21, 12.46, 20.34 | 63.27, 50.21, 75.06 |
| 2026-01-21 | 3.01, 2.75, 4.65 | 6.69, 5.89, 9.09 | 10.33, 8.73, 13.27 | 38.56, 30.40, 20.83 |
| 2026-01-22 | 1.82, 1.65, 0.69 | 5.99, 5.43, 2.04 | 11.15, 10.68, 4.56 | 34.07, 34.63, 18.64 |
| 2026-01-23 | 0.98, 1.18, 0.70 | 1.68, 2.42, 0.88 | 1.80, 3.16, 1.28 | 5.02, 5.06, 9.90 |
| 2026-01-24 | 0.93, 0.94, 0.76 | 3.31, 3.31, 0.94 | 7.56, 7.51, 1.05 | 44.25, 45.59, 4.40 |
| 2026-01-25 | 0.82, 0.75, 0.81 | 2.91, 2.54, 1.45 | 6.40, 5.63, 2.42 | 34.67, 33.20, 8.22 |
| 2026-01-26 | 0.45, 0.46, 0.67 | 1.68, 1.62, 0.80 | 3.78, 3.67, 1.19 | 16.26, 21.14, 3.36 |

- With no storm contact, F2 is well below P on both conditions.
- From the cutoff 2026-01-22, P falls back toward its usual error, while F2 stays above P at days 2 and 3 through 01-26, on either condition. As the plan noted before any score, M changes Ap by at most 15 over days 1 to 3 at the cutoffs 01-22 to 01-25, so it could not help there.
- **B does not look like the absorber at the median.** Per object, the median ln(B / the object's no-storm median) in arcs holding a storm day is at most 0.037 as issued and 0.053 on observed weather. The hypothesis that the fit absorbs the storm in B gets no support from this; the fit could still absorb it in the state, and this does not test that.
- **Not tested here:** whether a shorter arc, the 3-hourly ap or the model's response to F10.7 accounts for the post-storm tail.

## Fits

| Group | Arm | Fits | CONVERGED | MAXIMUM_ITERATIONS | Median rounds | Most rounds |
| --- | --- | --: | --: | --: | --: | --: |
| P | F2O | 750 | 750 | 0 | 3 | 21 |
| P | F2M | 750 | 749 | 1 | 3 | 40 |
| S1 | F2O | 270 | 270 | 0 | 3 | 18 |
| S1 | F2M | 270 | 270 | 0 | 3 | 20 |

**One fit failed: Swarm B (NORAD 39451), cutoff 2026-04-18, condition M** (`P|39451|2026-04-18`). It ended MAXIMUM_ITERATIONS at 40 rounds with 26 rejected trials and a reduced chi-square of 0.069; under O the same window converged in 3 rounds at 2.30. It counts as a failure (+Infinity), and rule 3's form allows 7. It looks like the noise-floor case analysis/estimation 0.7.0 was written for, at a chi-square that low, but that is not tested here.

## Question 2: FFM's daily Ap against 3-hourly

Answered from the source at modules 9a05d899b; the file and line references are in the plan. FFM cannot take a 3-hourly ap history: `lib/astrodynamics.cpp:4732-4755` leaves switch 9 at 1 and `ap_a` null, and `prw_environment.h:128` reads only AP_AVG. The $SPW records carry AP1 to AP8 and `data-source/space-weather` fills them. F2H needs a module change and its own registration, so it was not run.

## Cost

Owner Mac Studio, 8 workers beside other lanes' load (load average 47 at launch), the experiments' SDK browser host. 1,020 windows took 16.9 worker-hours, 2 h 13 min (10:42 to 12:55 UTC), where the plan expected 12.2 from XM3's timing on a lighter load. A window is one F2 and the scorer. A fit took a median 33.7 s in group P and 14.8 s on Sentinel-1 (means 41.3 s and 20.9 s): analysis/estimation rounds (a median 3), each one propagator/ffm run of 72 h at RK78 (relative tolerance 1e-10, absolute 1e-7 m and m/s, initial step 60 s, steps up to 120 s) with the 8 x 8 STM, output at the 864 arc states (300 s). A forecast took a median 26.3 s and 12.3 s (means 27.3 s and 12.9 s): 10 days at the same settings, no STM, output at the 1,152 scored epochs (300 s). 1.7 MB on disk.

## Disclosures

- The registration and runner were built on origin/main 22313bf and pushed to `wip/` before any M score, then committed on main with the same blobs once the checkout was free of another lane's unlanded commits.
- The sample passed before the first M window: all 12 windows rerun under O equal XM3's stored rows byte for byte (P, F2, the bins, the arc, the rows, the held and filled days). Every M row passed the guard against XM3's and XM's rows; no row errored and no defect stopped the run.
- Before the runner commit, the table code ran on synthetic M rows copied from XM3's F2, to check it. Only the C4 reproduction, the published W04 counts and identity checks were read from that; C5 and the accounting under O were first read with the real table.
- During the run no row was read. Nothing in the plan, the rule or the code changed after the registration and runner commits.
- The exploratory section was written after the outcome was known. It conditions on the result and has no interval.
- Sixteen C4 cells equal XM3's committed cells in every number.

## Reproduction

```
node experiments/ffm-tail-cause/run.mjs --sample      # the 12 windows under O, equal to XM3's rows, before any M window
node experiments/ffm-tail-cause/run.mjs --launch 8    # every window under M, 8 detached workers, PIDs in logs/
node experiments/ffm-tail-cause/table.mjs             # this table
node experiments/ffm-tail-cause/explore.mjs           # the exploratory numbers
node experiments/ffm-tail-cause/run.mjs --check       # E2E: pinned windows replayed exactly, table rebuilt
```

Every wasm is read with `git show` at modules 9a05d899b and SHA-256 checked; all fitting and propagation are module calls. XM3's code (experiments/ffm-atmosphere-xm3 at 22313bf) and XM's (2c7b326) are imported unchanged and checked by `git diff --quiet`; XM3's rows and table are read only, their digests checked.

## Data and terms

Results use every dataset the run read; only aggregates are published. Space-Track.org GP element sets (USSPACECOM, 18 SDS) stay in the local store. ESA Swarm precise orbits (SP3 COM); GFZ ISDC GRACE-FO rapid science orbits; contains modified Copernicus Sentinel data 2026 (Sentinel-1 POEORB). GFZ Kp, ap, Ap and F10.7: CC BY 4.0, Matzka et al. (2021), doi:10.5880/Kp.0001. NOAA SWPC RSGA: US Government work. IERS EOP (finals.all): IERS Earth Orientation Center. JPL DE440s: NASA JPL.
