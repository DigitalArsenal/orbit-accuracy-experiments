# Screening scale: CPU and events against the number of objects (report-only)

Registration: `SCREENING-SCALE.md`. N is an index, the current catalog = 1. `counts.jsonl` holds the raw counts for the whitepaper only; the site, the chart and marketing never read it.

## Fit of ln(value) on ln(N index)

| Series | Quantity | n | p | Interval | P(1\|1) | P(2\|1) | P(2\|2) | P(1\|2) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| ladder | cpu | 10 | 1.377 | 1.244 to 1.511 | 0.96 | 0.00 | 0.95 | 0.00 | undecided |
| ladder | events | 10 | 2.024 | 1.998 to 2.051 | 0.95 | 0.00 | 0.95 | 0.00 | p = 2 |
| ladder | propagation | 10 | 1.083 | 1.027 to 1.139 | 0.95 | 0.00 | 0.94 | 0.00 | undecided |
| ladder | search | 10 | 1.442 | 1.345 to 1.540 | 0.96 | 0.00 | 0.95 | 0.00 | undecided |
| ladder | refine | 10 | 2.031 | 1.821 to 2.242 | 0.95 | 0.00 | 0.95 | 0.00 | p = 2 |
| dates | cpu | 8 | 2.961 | 1.875 to 4.047 | 0.44 | 0.02 | 0.46 | 0.02 | undecided |
| dates | events | 8 | 5.337 | 2.676 to 7.998 | 0.09 | 0.02 | 0.09 | 0.02 | undecided |

P(a\|b): the share of 2000 simulated fits at a true p = b that the three-way rule calls "p = a".

## Runs

| Case | Index | CPU total s | Propagation s | Search s | Refine s | Index s | Host s | Wall s | Events | Propagation share |
|---|---|---|---|---|---|---|---|---|---|---|
| current-full-r1 | 1.0000 | 834.6 | 202.4 | 374.4 | 159.0 | 40.4 | 58.3 | 268.6 | 1069553 | 0.243 |
| current-full-r2 | 1.0000 | 834.0 | 203.4 | 367.9 | 154.4 | 41.1 | 67.2 | 204.3 | 1069553 | 0.244 |
| current-full-r3 | 1.0000 | 836.9 | 208.5 | 374.3 | 152.1 | 39.2 | 62.8 | 191.8 | 1069553 | 0.249 |
| date-2022-12-21 | 0.7379 | 317.9 | 116.4 | 158.7 | 21.5 | 8.9 | 12.5 | 71.0 | 195199 | 0.366 |
| date-2023-06-21 | 0.7621 | 333.5 | 120.1 | 167.3 | 24.4 | 9.6 | 12.1 | 76.4 | 194860 | 0.360 |
| date-2023-12-21 | 0.7790 | 347.8 | 122.7 | 175.8 | 25.3 | 9.9 | 14.1 | 76.5 | 217894 | 0.353 |
| date-2024-06-21 | 0.7979 | 355.1 | 122.8 | 182.0 | 26.2 | 10.7 | 13.5 | 122.4 | 190288 | 0.346 |
| date-2024-12-21 | 0.8209 | 367.7 | 129.3 | 190.1 | 24.1 | 11.3 | 12.9 | 106.2 | 201604 | 0.352 |
| date-2025-06-21 | 0.8436 | 386.8 | 133.8 | 201.7 | 26.5 | 11.7 | 13.2 | 94.3 | 222839 | 0.346 |
| date-2025-12-21 | 0.9001 | 443.4 | 142.1 | 229.3 | 37.1 | 14.0 | 20.8 | 110.2 | 324247 | 0.320 |
| ladder-1-2-s1 | 0.5000 | 226.3 | 82.7 | 107.7 | 21.3 | 4.4 | 10.2 | 50.5 | 263796 | 0.366 |
| ladder-1-2-s2 | 0.5000 | 221.5 | 82.0 | 104.6 | 21.7 | 4.4 | 8.9 | 43.0 | 260897 | 0.370 |
| ladder-1-2-s3 | 0.5000 | 229.0 | 82.9 | 107.7 | 22.6 | 4.5 | 11.3 | 49.7 | 272200 | 0.362 |
| ladder-1-4-s1 | 0.2500 | 88.9 | 39.2 | 39.7 | 5.5 | 1.2 | 3.3 | 21.3 | 64589 | 0.441 |
| ladder-1-4-s2 | 0.2500 | 90.6 | 40.2 | 40.8 | 5.5 | 1.1 | 3.0 | 20.7 | 65972 | 0.444 |
| ladder-1-4-s3 | 0.2500 | 90.3 | 40.2 | 40.1 | 5.7 | 1.1 | 3.1 | 21.2 | 67011 | 0.446 |
| ladder-1-8-s1 | 0.1250 | 39.2 | 19.6 | 16.2 | 1.6 | 0.4 | 1.3 | 10.0 | 16091 | 0.499 |
| ladder-1-8-s2 | 0.1250 | 40.7 | 20.2 | 16.7 | 1.8 | 0.5 | 1.6 | 11.1 | 15310 | 0.495 |
| ladder-1-8-s3 | 0.1250 | 39.1 | 19.6 | 16.1 | 1.7 | 0.4 | 1.3 | 9.8 | 16473 | 0.501 |

Run-to-run range of the total CPU over the three full-catalog repeats: 0.3 percent of the median.

## Propagation share by theory

| Theory | Flown | Covered share of the catalog | Propagation share of the screen CPU | Note |
|---|---|---|---|---|
| SGP4 | yes | 1.0000 | 0.244 | range over cases 0.243 to 0.501; zero-cost propagator bound 1.32x |
| SGP4-XP | no | 0.3839 | - | covered share below one half of the catalog: not flown, not extrapolated |
| AP | no | 0.0000 | - | covered share below one half of the catalog: not flown, not extrapolated |
| FFM | no | 0.3388 | - | covered share below one half of the catalog: not flown, not extrapolated |

## Timing arm: propagation CPU per state at 7 days x 60 s, the cost benchmark's own flights (median over a regime's windows, microseconds)

| Arm | Build | pooled | Low orbit, laser spheres | Low orbit, altimetry | Laser geodetic | Geostationary | Inclined geosynchronous | Strong drag, 2026 | Near 700 km | Medium Earth orbit |
|---|---|---|---|---|---|---|---|---|---|---|
| SGP4 | sgp4 1.4.1 | 1.95 (n 25) | 3.69 (n 3) | 1.88 (n 4) | 2.02 (n 4) | 2.70 (n 4) | 2.56 (n 1) | 1.81 (n 4) | 1.80 (n 2) | 1.91 (n 3) |
| XP | sdn-ap 0.6.3 | 21.47 (n 28) | 23.98 (n 3) | 22.17 (n 4) | 20.21 (n 4) | 20.32 (n 4) | 19.96 (n 4) | 20.77 (n 4) | 25.51 (n 2) | 21.05 (n 3) |
| XPU | sgp4-xp 0.2.2 | 25.27 (n 28) | 39.61 (n 3) | 42.83 (n 4) | 16.66 (n 4) | 21.52 (n 4) | 25.15 (n 4) | 39.60 (n 4) | 24.39 (n 2) | 18.19 (n 3) |
| AP | sdn-ap 0.6.3 | 334.59 (n 28) | 356.06 (n 3) | 354.95 (n 4) | 289.17 (n 4) | 35.72 (n 4) | 37.51 (n 4) | 376.25 (n 4) | 360.80 (n 2) | 340.02 (n 3) |
| FFM20 | ffm 2.2.1 | 233.53 (n 28) | 598.18 (n 3) | 573.55 (n 4) | 229.57 (n 4) | 196.76 (n 4) | 196.21 (n 4) | 546.75 (n 4) | 460.62 (n 2) | 195.63 (n 3) |
| FFM40 | ffm 2.2.1 | 1055.24 (n 13) | 1111.49 (n 3) | 1049.40 (n 4) | - | - | - | 1068.89 (n 4) | 898.96 (n 2) | - |

Four windows per regime (the benchmark's), 32 pooled: the pooled figure is not the catalog's regime mix. FFM 40x40 flies below 8,400 km only. A window an arm refused or failed is absent from n.

## Reading the figures

Absolute CPU figures (the Runs and Timing tables) were taken under load and are not for the page; the absolute figures are the quiet rows of the Quiet-window check. Page wording for the AP/FFM ratio in low orbit: about 1/3 (0.34 to 0.37 on the quiet check's two windows, the laser-sphere and altimetry subset: `LS|LARETS|2025-10-25` and `DO|SENTINEL 3B|2025-11-29`).

## AP against FFM per regime, at the 60 s step of a screen

| Regime | Comparator | AP us/state (loaded) | FFM us/state (loaded) | AP / FFM | f (screen with AP over screen with FFM) | Doublings | Years at 3.8 | Years at 9.6 (undecided) |
|---|---|---|---|---|---|---|---|---|
| Low orbit, laser spheres | FFM40 | 356.1 | 1111.5 | 0.32 | 0.32 to 0.32 | 1.51 to 1.51 | 5.8 to 5.7 | 14.5 to 14.5 |
| Low orbit, altimetry | FFM40 | 354.9 | 1049.4 | 0.34 | 0.34 to 0.34 | 1.44 to 1.44 | 5.5 to 5.5 | 13.8 to 13.8 |
| Strong drag, 2026 | FFM40 | 376.2 | 1068.9 | 0.35 | 0.35 to 0.35 | 1.39 to 1.39 | 5.3 to 5.3 | 13.3 to 13.3 |
| Near 700 km | FFM40 | 360.8 | 899.0 | 0.40 | 0.40 to 0.40 | 1.21 to 1.21 | 4.6 to 4.6 | 11.7 to 11.6 |
| Laser geodetic | FFM20 | 289.2 | 229.6 | 1.26 | 1.26 to 1.26 | no gain against FFM 20x20 here; AP costs 1.26 times as much | no gain against FFM 20x20 here; AP costs 1.26 times as much | no gain against FFM 20x20 here; AP costs 1.26 times as much |
| Medium Earth orbit | FFM20 | 340.0 | 195.6 | 1.74 | 1.73 to 1.73 | no gain against FFM 20x20 here; AP costs 1.74 times as much | no gain against FFM 20x20 here; AP costs 1.74 times as much | no gain against FFM 20x20 here; AP costs 1.74 times as much |
| Geostationary | FFM20 | 35.7 | 196.8 | 0.18 | 0.19 to 0.19 | 2.24 to 2.22 | 8.5 to 8.4 | 21.5 to 21.3 |
| Inclined geosynchronous | FFM20 | 37.5 | 196.2 | 0.19 | 0.20 to 0.20 | 2.17 to 2.15 | 8.2 to 8.2 | 20.8 to 20.7 |

Every ratio is at the 60 s step of a screen. At 300 s per object-day the benchmark has AP at about 1/8 of FFM; at 60 s it is about 1/3 in low orbit, because AP's cost follows the number of output states and FFM's mostly follows its integration steps. AP is cheaper than the FFM it nearly matches in low orbit; the AP / SGP4 ratio is not printed: the quiet re-run of SGP4 on two windows disagreed with the loaded rows by more than the line (flights too short), and it will be re-measured with a longer flight, so no ratio stands here; against FFM 20x20 in MEO and for laser geodetic satellites AP costs more. Doublings use the propagation-phase p of the ladder, 1.08 (1.03 to 1.14); where AP costs more than the comparator the table says so and gives no doublings (the signed values are in table.json for the whitepaper). AP is propagator/sdn-ap 0.6.3, FFM is propagator/ffm 2.2.1.

## Derived totals: share of propagation s with each theory

| Theory | Regime | s (band) |
|---|---|---|
| XP | pooled | 0.766 to 0.919 |
| XP | Low orbit, laser spheres | 0.843 to 0.926 |
| XP | Low orbit, altimetry | 0.762 to 0.921 |
| XP | Laser geodetic | 0.768 to 0.914 |
| XP | Geostationary | 0.804 to 0.914 |
| XP | Inclined geosynchronous | 0.797 to 0.913 |
| XP | Strong drag, 2026 | 0.754 to 0.916 |
| XP | Near 700 km | 0.760 to 0.931 |
| XP | Medium Earth orbit | 0.762 to 0.917 |
| XPU | pooled | 0.772 to 0.930 |
| XPU | Low orbit, laser spheres | 0.860 to 0.954 |
| XPU | Low orbit, altimetry | 0.781 to 0.957 |
| XPU | Laser geodetic | 0.760 to 0.897 |
| XPU | Geostationary | 0.807 to 0.919 |
| XPU | Inclined geosynchronous | 0.807 to 0.930 |
| XPU | Strong drag, 2026 | 0.773 to 0.954 |
| XPU | Near 700 km | 0.758 to 0.928 |
| XPU | Medium Earth orbit | 0.756 to 0.905 |
| AP | pooled | 0.804 to 0.994 |
| AP | Low orbit, laser spheres | 0.885 to 0.995 |
| AP | Low orbit, altimetry | 0.799 to 0.995 |
| AP | Laser geodetic | 0.810 to 0.993 |
| AP | Geostationary | 0.824 to 0.949 |
| AP | Inclined geosynchronous | 0.819 to 0.952 |
| AP | Strong drag, 2026 | 0.793 to 0.995 |
| AP | Near 700 km | 0.791 to 0.995 |
| AP | Medium Earth orbit | 0.801 to 0.994 |
| FFM20 | pooled | 0.803 to 0.992 |
| FFM20 | Low orbit, laser spheres | 0.886 to 0.997 |
| FFM20 | Low orbit, altimetry | 0.800 to 0.997 |
| FFM20 | Laser geodetic | 0.809 to 0.992 |
| FFM20 | Geostationary | 0.847 to 0.990 |
| FFM20 | Inclined geosynchronous | 0.841 to 0.990 |
| FFM20 | Strong drag, 2026 | 0.794 to 0.997 |
| FFM20 | Near 700 km | 0.792 to 0.996 |
| FFM20 | Medium Earth orbit | 0.799 to 0.990 |
| FFM40 | pooled | 0.806 to 0.998 |
| FFM40 | Low orbit, laser spheres | 0.887 to 0.998 |
| FFM40 | Low orbit, altimetry | 0.801 to 0.998 |
| FFM40 | Strong drag, 2026 | 0.795 to 0.998 |
| FFM40 | Near 700 km | 0.793 to 0.998 |

Derived from measured parts; only SGP4 flew the whole screen. Search, index and host CPU are SGP4 as measured at each N; propagation is the arm's measured CPU per state in that regime times N times 10,080 (FFM: its 10,000-state flight per state); refine is a band (lower: as measured with SGP4; upper: scaled by the arm's CPU per state over SGP4's in the regime). Hidden assumption: candidate and event counts are held at SGP4's; whether better accuracy allows a smaller threshold is another study.

## Case order

Pearson correlation of ln(N index) with the 1-minute load (mean of start and end) across the 19 screen rows: 0.242; with the start time: 0.183. Load across the rows: 98.1 to 147.3.

## Quiet-window check

Quiet window: load at or below 28 for 30 minutes, then the re-runs (started 2026-11-06T23:25:23Z, ended 2026-11-06T23:28:42Z, load at end 13.7). Agreement line 10 percent. Worst relative difference: 31.8 percent: they DISAGREE beyond the line; the absolute figures and s are read from the quiet rows.

| Case | Phase | Quiet CPU s | Loaded CPU s | Quiet / loaded - 1 |
|---|---|---|---|---|
| ladder-1-8-s1 | propagation | 16.64 | 19.55 | -14.9 % |
| ladder-1-8-s1 | search | 13.47 | 16.23 | -17.0 % |
| ladder-1-8-s1 | refine | 1.55 | 1.62 | -4.2 % |
| ladder-1-8-s1 | total | 33.17 | 39.17 | -15.3 % |
| ladder-1-2-s1 | propagation | 73.88 | 82.72 | -10.7 % |
| ladder-1-2-s1 | search | 95.38 | 107.70 | -11.4 % |
| ladder-1-2-s1 | refine | 19.68 | 21.27 | -7.4 % |
| ladder-1-2-s1 | total | 203.46 | 226.29 | -10.1 % |
| current-full-r1 | propagation | 173.64 | 202.43 | -14.2 % |
| current-full-r1 | search | 322.39 | 374.45 | -13.9 % |
| current-full-r1 | refine | 140.47 | 158.98 | -11.6 % |
| current-full-r1 | total | 729.32 | 834.60 | -12.6 % |

| Timing arm (two windows) | Quiet us | Loaded us | Difference |
|---|---|---|---|
| SGP4 | not printed: flights too short, to be re-measured | | |
| AP | 348.03 | 356.86 | -2.5 % |
| FFM40 | 930.27 | 1055.24 | -11.8 % |

| Ratio | Quiet | Loaded | Difference |
|---|---|---|---|
| AP/FFM40 | 0.3741 | 0.3382 | 10.6 % |
| AP/SGP4 | not printed: to be re-measured with a longer SGP4 flight | | |

## Reading

With SGP4, propagation is about a quarter of the screen. With a more accurate propagator, it is nearly all of it, so per-state cost decides the horsepower. AP over FFM, CPU per state at the 60 s step of a screen: Low orbit, laser spheres 0.32 (FFM40); Low orbit, altimetry 0.34 (FFM40); Strong drag, 2026 0.35 (FFM40); Near 700 km 0.40 (FFM40); Laser geodetic 1.26x (FFM20); Medium Earth orbit 1.74x (FFM20); Geostationary 0.18 (FFM20); Inclined geosynchronous 0.19 (FFM20). With p = 1.08 (1.03 to 1.14, the propagation-phase fit), the screen cost with AP against the same screen with FFM is a factor f of 0.32 to 0.32 (Low orbit, laser spheres); 0.34 to 0.34 (Low orbit, altimetry); 0.35 to 0.35 (Strong drag, 2026); 0.40 to 0.40 (Near 700 km); 1.26 to 1.26 (Laser geodetic); 1.73 to 1.73 (Medium Earth orbit); 0.19 to 0.19 (Geostationary); 0.20 to 0.20 (Inclined geosynchronous); a factor below 1 buys log2(1 / f) / p doublings of the object count (a factor above 1 is no gain), years at 3.8 (payload) and 9.6 (all objects, undecided) in the table.

## Real dates: not drawn

The real-dates series (seven past dates at N 0.74 to 0.90 of the current catalog, and the current catalog) is not drawn and carries no exponent: from 195 thousand events at the past dates, 324 thousand at 2025-12, to 1.07 million at the current catalog (3.3x for 11 percent more objects, where the ladder predicts about 1.2x). The statement is the ladder's: events grow as N^2. Diagnosis (two archive queries, no screen re-run; raw numbers in diagnosis-counts.json, which the site never reads). (1) Construction: the current catalog rebuilt by the date construction (newest set per object from the by-creation files of the 30 days before the window start, epoch in the last 30 days) holds the same objects as the snapshot-based one: 32,862 shared, 86 only in the rebuild, 1 only in the snapshot (0.3 percent). The date construction and the snapshot do not differ, and the population filter, the set ages (median 0.6 days at 2025-12, 1.3 days now; 90th percentile 2.3 and 2.2 days) and the by-creation coverage are not the cause. (2) Composition: the objects between 400 and 500 km (mean-motion altitude) are 2.16 times as many in the current catalog as at 2025-12-21, those between 500 and 560 km are 0.27 times as many, and the rest of the altitude bands move by under 1.1 times except 600 to 800 km (1.11) and below 400 km (1.05). The construction is not the cause; the composition changed sharply (objects concentrated into a lower, narrower shell); how much of the event jump that carries is not yet measured. It is not a scaling exponent: the dates differ in composition as well as in size, so no fit of events on N across them measures how screening work grows with N. Events by altitude band were not measured (it needs screen runs, held). Until they are, the dates series is not drawn.

## Parity guard

Phased path and fused path on parity-1-8-s1: events 16091 and 16091, event-set digests equal.

## Verdict

With SGP4, propagation is about a quarter of the screen. With a more accurate propagator, it is nearly all of it, so per-state cost decides the horsepower. Ladder p = 1.38 (1.24 to 1.51) on CPU: undecided; events p = 2.02 (2.00 to 2.05): p = 2; propagation p = 1.08. The real-dates series is not drawn and not a scaling statement (diagnosis below). SGP4 propagation takes 24.4 percent of its screen CPU at the full catalog.
