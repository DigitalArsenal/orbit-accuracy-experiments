# XM4: in the path the console flies, does the open DCA predict closer than NRLMSISE-00 alone?

**No, and it does no measurable harm either.** The console's FFM-1 mode seeds each object from SGP4 at the sim time, takes B from the
OMM's B*, and flies with no fit. On that path NRLMSISE-00 x exp(s(t)) from the newest `$DCL` record (K2) and NRLMSISE-00 alone (K1) cannot
be told apart. In group P (Swarm A, B and C, GRACE-FO 1 and 2, 750 windows) K2's median error is within 0.1 % of K1's at days 1, 2, 3 and
7, and every interval holds 0. K2 does not beat K1: rule 1 fails at every lead, rules 2 and 3 pass. No lead reads as a gain and none as
harm. Sentinel-1, the row forms O and H and ISO-week clusters read the same. A signed along-track check, exploratory and not registered, also shows no signal,
and it has little power (see its section).

**FFM-1 as flown loses to the public set under SGP4, by a wide margin.** K1's median error is 3.2, 5.5, 5.8 and 5.3 times P's at days 1,
2, 3 and 7 in group P, and 4.8 to 9.8 times on Sentinel-1. Every interval lies wholly above 0, and rules 1 and 2 fail at every lead.
K1 is closer than P in only 7.5 % to 11.6 % of group P's windows. This repeats V1c's result (`results/v1c`) on another period.

**A pass would not have made FFM-1 or the DCA the default, and this result changes nothing there.** SGP4 stays the console default. The
coordinator takes K2 against K1 to the owner as the evidence for keeping or removing the DCA from FFM-1.

Generated from `results/open-dca-ffm-regression/table.json` (`node experiments/open-dca-ffm-regression/table.mjs`, 1,057 stored windows,
rows digest `15386a1b32d9`). Plan: [PLAN.md](../../experiments/open-dca-ffm-regression/PLAN.md), registered at 2026-10-31T06:28:43-04:00 (commit
16ff820, pushed to origin `wip/experiments-open-dca-ffm-regression-20261031/registration` before any score), runner d1257b8 before any
scored run. Modules 9a05d899b: propagator/ffm 2.0.4 c36f1b14fc233e88, propagator/sgp4 1.4.1 2fe246b716c78a4b; XM-fast's code at 2c7b326
for P and the scorer; XM3 (22313bf) for the windows and P's equality rerun.

## The open DCA on this path (primary)

Group P, rows L, orbit group x ISO week clusters (750 pairs, 66 clusters, 0 failures of either arm):

| Lead | Median e, K2 / K1 (km) | Median ratio | 95 % interval | ISO-week interval | K2 closer in | p95 ratio | Upper bound | Reading |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Day 1 | 2.83 / 2.83 | -0.00 % | -0.05 % to +0.07 % | -0.05 % to +0.07 % | 50.0 % | 1.000 | 1.012 | no detectable effect |
| Day 2 | 8.94 / 8.91 | -0.02 % | -0.18 % to +0.10 % | -0.25 % to +0.17 % | 50.9 % | 1.004 | 1.021 | no detectable effect |
| Day 3 | 17.70 / 17.78 | -0.06 % | -0.30 % to +0.12 % | -0.42 % to +0.24 % | 51.3 % | 1.010 | 1.024 | no detectable effect |
| Day 7 | 89.55 / 90.13 | +0.00 % | -0.40 % to +0.41 % | -0.63 % to +0.70 % | 48.5 % | 0.986 | 1.032 | no detectable effect |

Group S1, rows L (257 to 259 pairs, 21 clusters, 0 failures):

| Lead | Median e, K2 / K1 (km) | Median ratio | 95 % interval | ISO-week interval | K2 closer in | p95 ratio | Upper bound | Reading |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Day 1 | 3.70 / 3.70 | +0.00 % | -0.00 % to +0.00 % | -0.00 % to +0.00 % | 48.6 % | 1.000 | 1.001 | no detectable effect |
| Day 2 | 9.75 / 9.76 | -0.00 % | -0.00 % to +0.00 % | -0.00 % to +0.00 % | 54.3 % | 1.000 | 1.001 | no detectable effect |
| Day 3 | 16.56 / 16.56 | -0.00 % | -0.00 % to +0.00 % | -0.00 % to +0.00 % | 53.5 % | 1.000 | 1.001 | no detectable effect |
| Day 7 | 43.62 / 43.65 | -0.00 % | -0.00 % to +0.00 % | -0.00 % to +0.00 % | 51.0 % | 1.000 | 1.003 | no detectable effect |

"Median ratio" is the median of e_K2 / e_K1 per pair. "Upper bound" is rule 2's: the interval's upper end for the ratio of p95s, against 1.10.

The null and the other row forms (median ratio, group P):

| Contrast | Day 1 | Day 2 | Day 3 | Day 7 | Reading at every lead |
| --- | ---: | ---: | ---: | ---: | --- |
| K2 / K1, rows L (the verdict) | -0.00 % | -0.02 % | -0.06 % | +0.00 % | no detectable effect |
| K2 / K3, rows L (against the null) | -0.01 % | -0.07 % | -0.09 % | -0.04 % | no detectable effect |
| K3 / K1, rows L (the null) | +0.01 % | +0.01 % | +0.00 % | +0.00 % | no detectable effect |
| K2o / K1o, rows O | -0.00 % | -0.00 % | -0.05 % | +0.01 % | no detectable effect |
| K2h / K1h, rows H | -0.00 % | -0.02 % | -0.04 % | +0.00 % | no detectable effect |

The same in group S1:

| Contrast | Day 1 | Day 2 | Day 3 | Day 7 | Reading at every lead |
| --- | ---: | ---: | ---: | ---: | --- |
| K2 / K1, rows L (the verdict) | +0.00 % | -0.00 % | -0.00 % | -0.00 % | no detectable effect |
| K2 / K3, rows L (against the null) | -0.00 % | -0.00 % | -0.00 % | -0.00 % | no detectable effect |
| K3 / K1, rows L (the null) | +0.00 % | +0.00 % | +0.00 % | -0.00 % | no detectable effect |
| K2o / K1o, rows O | +0.00 % | -0.00 % | -0.00 % | -0.00 % | no detectable effect |
| K2h / K1h, rows H | +0.00 % | -0.00 % | -0.00 % | -0.00 % | no detectable effect |

K3 flies another date's record, its node times moved onto the cutoff (20 days away). K2 and K3 cannot be told apart. So nothing here shows
the record's date-specific content reaching the prediction, and nothing shows it doing damage.

**EXPLORATORY (not registered, from the rows; it changes no cell).** The arms do differ window by window. In group P, K2 moves a window's
error by a median 0.55 %, 1.03 %, 1.31 % and 1.88 % at days 1, 2, 3 and 7, and by more than 5 % in 5 %, 15 %, 19 % and 23 % of windows. The
moves go either way: the mean of d is -0.01 %, -0.10 %, -0.10 % and +0.05 %. K3 moves windows about as far (0.47 %, 0.98 %, 1.36 %, 1.79 %).

**What this test cannot say.** It cannot say whether s is physically right. The arms' error is almost entirely along-track (median share of
the 3D RMS 0.998 to 1.000), it is far larger than s's effect, and median d cannot see a correct but small correction whose sign is random
against that error. The signed check below asks that question directly, and the path shows no signal.

## FFM-1 as flown against public SGP4 (secondary)

Group P:

| Lead | Median e, K1 / P (km) | Median ratio | 95 % interval | K1 closer in | p95 ratio | Upper bound | Rules 1, 2, 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Day 1 | 2.83 / 0.76 | +216 % | +181 % to +262 % | 11.6 % | 5.384 | 6.454 | no, no, yes |
| Day 2 | 8.91 / 1.31 | +453 % | +394 % to +508 % | 7.5 % | 4.938 | 6.210 | no, no, yes |
| Day 3 | 17.78 / 2.45 | +484 % | +388 % to +556 % | 8.9 % | 4.028 | 5.184 | no, no, yes |
| Day 7 | 90.13 / 15.35 | +428 % | +356 % to +551 % | 9.7 % | 2.933 | 3.643 | no, no, yes |

K2 against P reads the same (harm at every lead; median ratio +215 %, +462 %, +480 % and +433 %).

Group S1:

| Lead | Median e, K1 / P (km) | Median ratio | 95 % interval | K1 closer in | p95 ratio | Upper bound | Rules 1, 2, 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Day 1 | 3.70 / 0.73 | +376 % | +334 % to +407 % | 15.1 % | 3.329 | 4.793 | no, no, yes |
| Day 2 | 9.76 / 1.00 | +767 % | +566 % to +871 % | 6.2 % | 5.677 | 7.771 | no, no, yes |
| Day 3 | 16.56 / 1.33 | +884 % | +661 % to +1062 % | 4.7 % | 5.235 | 7.946 | no, no, yes |
| Day 7 | 43.65 / 4.15 | +725 % | +534 % to +875 % | 6.6 % | 4.199 | 5.558 | no, no, yes |

K2 against P on S1 reads the same. Rows O and H do not change this: K1o and K1h stay within 5 % of K1's median error at every lead in group P.

**Beside XM3's fit (group P).** The same module with a fit to 72 h of precise truth, a free B and XM3's force settings:

| Lead | XM3 F3 / F2 (fit, median ratio) | XM4 K2 / K1 (no fit) | XM3 F2 / P (fit) | XM4 K1 / P (no fit) |
| --- | ---: | ---: | ---: | ---: |
| Day 1 | +10.6 % | -0.0 % | -60.9 % | +216 % |
| Day 2 | +10.4 % | -0.0 % | -29.2 % | +453 % |
| Day 3 | +7.8 % | -0.1 % | -17.5 % | +484 % |
| Day 7 | +4.9 % | +0.0 % | -14.2 % | +428 % |

XM3's F3 / F2 column is the open DCA in a fit, with its 10 refused windows as losses. XM4 flies an older record there instead.

**Inference, not a registered test: what is wrong on this path is the unfitted seed.** The along-track share and the agreement across arms point
there. The SGP4 state is not an orbit of FFM-1's dynamics, and B from B* is 0.32 to 0.47 of C2's seed in group P (0.06 to 0.07 in S1). Median error
reaches about 90 km by day 7 in group P, whichever atmosphere flies. The signed check below sharpens this: see "K1's error has a sign". B from the windows' public sets:

| Object | Windows | B* at or below 0 | Median B (m^2/kg) | Median B / C2 seed |
| --- | ---: | ---: | ---: | ---: |
| Swarm B | 150 | 0 | 0.00192 | 0.32 |
| Swarm A | 150 | 0 | 0.00275 | 0.46 |
| Swarm C | 150 | 0 | 0.00275 | 0.46 |
| Sentinel-1A | 135 | 33 | 0.00068 | 0.07 |
| GRACE-FO 1 | 150 | 0 | 0.00166 | 0.47 |
| GRACE-FO 2 | 150 | 0 | 0.00165 | 0.47 |
| Sentinel-1C | 135 | 18 | 0.00058 | 0.06 |

## Signed along-track check (exploratory, not registered)

The coordinator asked for it after reading the table above, and it moves no registered cell, rule or verdict. [SIGNED.md](../../experiments/open-dca-ffm-regression/SIGNED.md)
states what would count, written before any signed number (a237bb7 on the wip branch). Its text says it was pushed before the run. In fact my first push failed on a
shell refspec error: the commit is dated 11:01:01Z, the workers started at 11:01:02Z, and the push landed at 11:01:15Z, with no row written and no number read. K1, K2 and K3
were flown again in all 1,020 flown windows and equal their stored digests.

It regresses K2 - K1's along-track displacement on truth - K1 across a group's windows at one lead, with K3's displacement as the null and ISO-week intervals.
gamma above 0 means the displacement points toward the truth, and gamma is the share of K1's window-to-window along-track error it removes.

Group P:

| Lead | gamma K2 | gamma K3 (null) | K2 minus K3 | Same sign, K2 / K3 | Reading |
| --- | ---: | ---: | ---: | ---: | --- |
| Day 1 | -0.0002 [-0.0024, +0.0007] | +0.0000 [-0.0011, +0.0003] | -0.0002 [-0.0017, +0.0012] | 51.6 / 47.2 % | no signal |
| Day 2 | -0.0011 [-0.0059, +0.0019] | -0.0005 [-0.0034, +0.0015] | -0.0006 [-0.0038, +0.0032] | 51.1 / 48.4 % | no signal |
| Day 3 | -0.0017 [-0.0086, +0.0037] | -0.0016 [-0.0058, +0.0023] | -0.0001 [-0.0053, +0.0058] | 51.3 / 48.8 % | no signal |
| Day 7 | -0.0038 [-0.0162, +0.0102] | -0.0074 [-0.0154, +0.0012] | +0.0036 [-0.0099, +0.0173] | 48.5 / 48.1 % | no signal |

Group S1:

| Lead | gamma K2 | gamma K3 (null) | K2 minus K3 | Same sign, K2 / K3 | Reading |
| --- | ---: | ---: | ---: | ---: | --- |
| Day 1 | -0.0000 [-0.0001, +0.0000] | -0.0000 [-0.0000, +0.0000] | -0.0000 [-0.0001, +0.0000] | 47.5 / 47.1 % | no signal |
| Day 2 | -0.0000 [-0.0001, +0.0000] | -0.0000 [-0.0001, +0.0000] | -0.0000 [-0.0001, +0.0001] | 54.3 / 50.0 % | no signal |
| Day 3 | -0.0001 [-0.0002, +0.0000] | +0.0000 [-0.0000, +0.0001] | -0.0001 [-0.0002, +0.0000] | 53.9 / 48.4 % | no signal |
| Day 7 | -0.0002 [-0.0004, +0.0001] | +0.0001 [-0.0001, +0.0003] | -0.0002 [-0.0006, +0.0001] | 51.4 / 50.2 % | no signal |

**No signal in all 8 cells.** In group P, K2's displacement removes at most about 1 % of K1's window-to-window along-track error at any lead (upper bounds
+0.07 %, +0.19 %, +0.37 % and +1.02 %). It agrees in sign with K1's error about as often as chance, and K3 does as well.

**That does not show s is wrong.** The reverse slope, truth - K1 on K2 - K1, would be about 1 or more for a correct displacement. Its intervals in group P are
[-20.5, 16.0], [-8.3, 6.4], [-5.2, 4.6] and [-3.4, 3.2], which hold both 0 and 1. The check has little power: this path shows
no signal, which is not the same as s carrying none.

**K1's error has a sign.** The means SIGNED.md lists beside the slopes, with the spread added after reading them:

| Group | Lead | Truth ahead of K1 | Mean of truth - K1 (km) | Spread, sd (km) |
| --- | --- | ---: | ---: | ---: |
| P | Day 1 | 59.9 % | +1.4 | 7.1 |
| P | Day 2 | 72.0 % | +6.5 | 13.1 |
| P | Day 3 | 79.3 % | +15.9 | 20.8 |
| P | Day 7 | 93.3 % | +95.3 | 67.1 |
| S1 | Day 1 | 57.9 % | +0.8 | 3.8 |
| S1 | Day 2 | 50.8 % | +1.4 | 10.9 |
| S1 | Day 3 | 50.0 % | +1.7 | 18.2 |
| S1 | Day 7 | 51.0 % | +4.1 | 47.3 |

- In group P K1 lags the truth, in more windows at each lead, and the lag grows faster than linearly. By day 7 the mean lag exceeds the spread. At days 1, 2 and 3 the spread exceeds the mean.
- On S1 the sign is close to even at days 2, 3 and 7.

**Flown B against a fit to precise truth.** Added after reading the cells: the flown B against XM3's F2 fitted B on the same windows.

| Object | Windows with a fitted B above 0 | Fits at B = 0 | Median flown B (m^2/kg) | Median fitted B (m^2/kg) | Median flown / fitted |
| --- | ---: | ---: | ---: | ---: | ---: |
| Swarm B | 150 | 0 | 0.00192 | 0.00701 | 0.27 |
| Swarm A | 150 | 0 | 0.00275 | 0.00730 | 0.37 |
| Swarm C | 150 | 0 | 0.00275 | 0.00728 | 0.38 |
| GRACE-FO 1 | 150 | 0 | 0.00166 | 0.00504 | 0.32 |
| GRACE-FO 2 | 150 | 0 | 0.00165 | 0.00507 | 0.33 |
| Sentinel-1A | 79 | 56 | 0.00061 | 0.00800 | 0.08 |
| Sentinel-1C | 78 | 57 | 0.00055 | 0.00812 | 0.07 |

In group P the flown B is about a third of the fitted B. Too little drag makes an orbit lag, which is the sign seen here. About 42 % of Sentinel-1's fits sit at B = 0, so its ratio is not a usable reference.

**Inference, not a registered test.** Two things are wrong on this path. In group P the one-signed lag that grows faster than linearly points at too little drag from B*, and it is the largest part of the error by day 7. At days 1, 2 and 3, and at every lead on S1, the spread is the larger part, which points at the seed state. A B this low also scales K2's displacement down, which is part of why the DCA barely shows here. A scale on B* was not tested: one chosen on these windows would be tuning on scored windows.

## These windows were analyzed before

XM, XM2 and XM3 scored these windows for the F, X and P arms, and an internal diagnosis studied the `$DCL` on them. Its statistics are
Planet-derived and stay internal; none is quoted here. It is why K3 and the ISO-week clusters exist. The K arms had never been scored. So XM4 is
a new path on known windows, not a fresh sample.

## Inputs, as issued and not

- **Public set:** the newest by EPOCH with EPOCH and CREATION_DATE at or before the cutoff. The console's own catalog latency is not modeled.
- **`$DCL`:** replayed. The lane began publishing in 2026-10, so no published record exists for these windows. XM's cached answers are the
  module's solve issued at 00:00 UTC of the cutoff, the freshest a daily lane can hold. Where XM refused (2026-04-09 and 04-10), K2 flies the
  record of 04-08 held, as the console would: 14 windows, counted as flown.
- **Daily F10.7 and Ap:** XM's as-issued rows, the RSGA held past D0 + 2. The lane uses NOAA's 45-day forecast, not archived for these dates.
- **F10.7a:** rows L (the verdict): the lane's centered 81-day mean over the as-issued series, held value in place of the 45-day forecast. Rows O
  (XM3's trailing mean) and rows H (the centered mean over GFZ's later file, not causal) are report only.
- **Earth orientation:** finals, as XM3, not the editions as issued; the effect at 7 days is meters against errors of kilometers.
- **Kernel:** DE440s; the console reads the NAIF lane's decade shard, not compared byte for byte.
- **Bytes:** stack origin/main pins OrbPro 8d815e2246, which pins modules 9a05d899b, so the console's FFM is c36f1b14, the bytes flown here. The
  deployed release's plaintext cannot be read from here.

## The path was checked before the first score

On XM3's smoke window (Swarm A, cutoff 2025-12-31, outside the period, no truth after it, nothing scored), repeated by `--smoke`:

- the records are SHA-identical to OrbPro's own `prepareCatalogConfiguration` on the same inputs (32,733,472 bytes);
- reads at the bins and at every 300 s agree at all 1,152 epochs (difference 0);
- one object alone and two in one shard agree at all 1,152 epochs (difference 0);
- FFM 2.0.3, the previous pin, and 2.0.4 agree on K2's records (difference 0);
- the console's SGP4 bytes (browser-shared 49e26b46) and the bytes used here give the same Earth-fixed seed on four objects.

In every one of the 1,057 windows P, the lead bins, the condition's record and XM's `$DCL` answer equal XM3's stored row exactly (0 defects). All
K arms flew: 0 failures, 0 errors.

## Cost

One K arm over 7 days: GJ8 PEC on the TT grid by perigee (12 to 24 s here), RK78 startup at relative 1e-14 and absolute 1e-11 (m, m/s), initial step 30 s,
minimum 0.01 s, maximum 120 s; 300 s Chebyshev segments; 1,152 outputs at 300 s. About 0.17 s setup and 0.73 s coverage and reads on the Mac Studio under load.
The run: seven K arms and P in each window, 2.6 worker-hours, 20 min on 8 workers.

## Reproduce

`node experiments/open-dca-ffm-regression/run.mjs --check` re-runs the pinned windows (P|39452|2026-03-10, S1|39634|2026-03-10, P|39451|2026-04-09, the last on the held
record) and compares every stored number exactly, then rebuilds the table against this commit's `table.json`. Rows stay local.
