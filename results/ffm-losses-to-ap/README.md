# FFM losses to AP: the study of 2026-11-04 (exploratory)

**Exploratory.** Every window here was already scored by AP6 and AP7 (`experiments/operator-theory`), so every finding below is a lead for a registration, never a pass; nothing here moves a verdict or the site. Owner 2026-11-03: "really analyze the cases where FFM is showing less accurate than AP, that should never happen unless there's a maneuver."

**Provenance.** Paired window-leads of the AP 0.4.11 stores (`/opt/data/sdn-archive/operator-theory/ap/b0411/{truth,truth2,compare-truth,compare-truth2,regimes,regimes-hx,regimes-wa}`), FFM `propagator/ffm` 2.0.4 (wasm SHA-256 c36f1b14fc233e88725d57724c3bae7ad025cfdd9d8d4520c3bcccd0f8a816b2), `analysis/estimation` 0.7.0 (7a555ca5b3ed0b021dd5b7986bd73dd8f8dc5125a2aa7943e3b3e983320d6bcd), AP 0.4.11 at modules a0f33bc545. Three regime analyses (`drag-leo.json`, `high-orbit.json`, `heo.json`), three skeptic reviews (`*-skeptic.json`), one synthesis (this file); 181 bounded FFM reruns. `summary.md` and `cells.json` are the per-cell pairing (n, share FFM worse, median FFM/AP, the worst windows).

**Data rights.** Result rows only. No truth value, no element set, no held row (Stella, the C2 objects, Starlink, the held Galileo) and no operator capture content is reproduced; window keys name public objects and dates, and the errors are already public in `results/ap-truth`. The lettered sources stay lettered.

**Fixes filed on the graph:** `experiments-ffm-harness-forces-20261104`, `modules-ffm-rk78-error-control-20261104`, `experiments-ffm-ecom2-srp-fit-20261104`, `experiments-ffm-maneuver-flags-20261104`, `experiments-heo-truth-nodes-20261104`.

---


Owner, 11-03: "really analyze the cases where FFM is showing less accurate than AP, that should never happen unless there's a maneuver."

This is exploratory. Every window was already scored in AP6 and AP7, so each finding is a lead for a registration, never a pass. Inputs:
- `pairs.json`, `cells.json`.
- Three regime analyses with their skeptic reviews: `drag-leo/`, `high-orbit/`, `heo/` under this directory.
- My reconciliation scripts in `scratchpad/ffm-losses-report/`:
  - `reconcile-drag.py`
  - `reconcile-all.py`
  - `s1-steps.py`, which uses the skeptic's `skeptic-drag/steps.json`.

Builds:
- FFM `propagator/ffm` 2.0.4, wasm SHA-256 `c36f1b14…16b2`.
- `analysis/estimation` 0.7.0, `7a555ca5…6bcd`.
- AP 0.4.11, build a0f33bc545.
- The canonical checkout's working-tree wasm is 2.0.3 (`6fdc5309…`). No run used it.

Rerun budgets used:
- drag-leo: 60 (58 completed).
- high-orbit: 60, plus 18 by the skeptic.
- heo: 61.

Where the analyst and the skeptic disagree, the skeptic reading is taken unless the analyst's evidence is cited.

## 1. Answer

1. FFM is worse than AP in **6,666 of 20,564** paired window-leads (32 %). This count excludes Stella (C2 held) and counts HX once. 1,998 of the losses (30 %) are within 10 % (FFM/AP < 1.1).
2. Shares, skeptic reading:

   | Class | Rows | Share |
   |---|---:|---:|
   | Weather (shared density error) | 4,168 | 62.5 % |
   | Maneuver | 1,180 | 17.7 % |
   | Force model | 586 | 8.8 % |
   | Unexplained | 532 | 8.0 % |
   | Settings | 180 | 2.7 % |
   | Scoring | 20 | 0.3 % |
   | Estimator | 0 | 0 |

   The analyst reading was force 48.1, weather 23.4, estimator 8.8, maneuver 8.8, unexplained 7.9, settings 2.7, scoring 0.3 (%). Among the 4,668 losses at a ratio of 1.1 or more: weather 67.5, maneuver 13.6, force 7.7, unexplained 7.7, settings 3.2, scoring 0.3 (%).
3. "Never unless a maneuver" does not hold as stated. No loss shows FFM's physics doing worse than AP when FFM is configured like the production catalog. Two FFM-side defects are real:
   - cannonball-only SRP on GNSS and GEO buses (586 force rows);
   - RK78 error control that does not bound the error at a 300 s step (module).
4. The 4,168 P rows are a coin flip on a density error both arms share. Median FFM/AP is 0.72-1.01 in every P cell, and FFM wins 49-67 % of P window-leads. This is not an FFM defect, but it is not settled row by row: 3 reruns for 4,168 rows.
5. Harness fixes remove the settings rows (180) and the scoring rows (20). Module work: an ECOM2 SRP fit and RK78 step control. Unexplained, needing a measurement: S1 F72 tie (342), S1 F24 step-free (77), DO F72 (69), LARETS (25), WA Galaxy 30 (18), TESS 08-31 day 1 (1).

## 2. Mechanisms per regime that survived the skeptic

### 2.1 Low orbit with drag (P, S1, DO, LS): 5,700 losses

| Group | Analyst | Skeptic reading (reconcile-drag.py) |
|---|---|---|
| P 4,213 | force 2,619, weather 1,549, maneuver 45 | weather (shared density) 4,168, maneuver 45 |
| S1 1,158 | estimator 398, unexplained 526, maneuver 234 | maneuver 739, unexplained 419 |
| DO 185 | estimator 158, maneuver 27 | maneuver 116, unexplained 69 |
| LS 144 | settings 119, estimator 14, weather 11 | settings 119, unexplained 25 (LARETS) |

Where the S1 and DO maneuver counts come from:
- S1 maneuver 739:
  - 234 analyst flags;
  - 334 F24 rows with an SMA step in the forecast span;
  - 48 F24 rows with an SMA step in the arc;
  - 123 F72 rows whose in-arc AP-rms flag the storm rule overrode.
- S1 unexplained 419: 342 F72 tie rows and 77 step-free F24 rows.
- DO maneuver 116: 27 analyst flags, 27 storm-overridden flags, and 62 windows where SMA rose 10 m or more over the span.
- DO unexplained 69: 45 F72 steady-decay rows and 24 with no truth SMA.

**P: shared density error (weakened, kept as the reading).**
- Correlation and ratio. ln e of AP and FFM correlate at 0.72 (F24) and 0.94 (F72) at day 7. Median ratio is 0.96-1.00.
- Storms barely discriminate. The day-7 loss rate is 44 to 48 % with or without a storm day at F24, and 44-52 % against 47-52 % at F72.
- AP 0.4.11 flies the same NRLMSISE-00 model, so "force" cannot be an FFM defect.
- Reruns on P|43476|2026-01-06 F24 (drag-leo/rerun-table.md rows 37-56):

  | Variant | Day 7 (km) | Row |
  |---|---:|---:|
  | base | 7.041 | 37 |
  | twin 43477 | 7.026 | 38 |
  | 70x70, 1e-10, 30 s, relativity | 8.104 | 39 |
  | observed weather | 8.145 | 42 |
  | 72 h arc | 2.209 | 40 |
  | B held at 0.00533 | 0.242 | 56 |
  | AP | 0.177 | |

  The held B (0.00533) is AP24's own BTERM, so that row shows hindsight sensitivity only: a 7 % B change moves day 7 by 7 km.
- P|39452|2025-07-12 drops from 11.658 to 5.168 on observed weather (rows 51-52) and still loses to AP's 0.305.
- Not settled: the large-ratio P losses at days 1-2, e.g. P|39451|2025-06-26 day 2 at 0.833 against 0.056 (ratio 15; summary.md). No rerun covers them.

**S1: the estimator class is refuted. The losses are station keeping, which is the owner's exemption.**
- The fitted B is well determined:
  - formal sigma about 7 %;
  - it agrees with both 72 h fits (FFM 0.0075-0.0097, AP72 0.0076);
  - holding B at 0.002 fits the arc 6-8x worse (arc along-track rms 6.8 against 0.8 m; rerun rows 3 and 44).
- Truth SMA is a sawtooth: decay of 2-3 m/day, then steps of +8 to +28 m every 3-5 days (skeptic-drag/steps.json). Monthly median SMA is flat within 5 m from 2025-12 to 2026-06.
- AP's win comes from its altitude-band starting median BTERM of 0.002 (fit_oem.inc:374-384; AP24 BTERM p10-p90 0.001975-0.002053). That value happens to match zero net decay; the AP fit barely moves it.
- S1 F24 day-7 loss rate against the SMA change over the span (skeptic, dsma-rows.json):

  | SMA change over span | FFM worse |
  |---|---:|
  | fell more than 12 m | 19 % (median ratio 0.36) |
  | -12 to -6 m | 77 % |
  | -6 to 0 m | 77 % |
  | 0 to 6 m | 87 % |
  | above 6 m | 92 % |

  I reproduced 151 of the 180 day-7 estimator rows sitting in spans where SMA held (change of -6 m or more).
- My step split (s1-steps.py), S1 F24:

  | Lead | Step in forecast span: worse (median ratio) | No step: worse (median ratio), n |
  |---|---|---|
  | d1 | 40 % (0.33) | 13 % (0.18), 149 |
  | d2 | 60 % (1.17) | 30 % (0.32), 102 |
  | d3 | 64 % (1.30) | 42 % (0.70), 76 |
  | d7 | 82 % (2.07) | 43 % (0.83), 14 |

- Signature window S1|39634|2026-05-03 F24: FFM beats AP 7x, 3.5x and 3.1x at days 1-3, then loses 28x at day 7 after the 05-06T04:42 step of +12.5 m.
- S1 F72 is a tie: median ratio 0.98-1.05 at every lead, and steps barely discriminate (no step 49-65 % worse; step in span 65-78 %).
- Burns inside the arc drive B to bound 0:
  - S1|39634|2026-03-06 F72: arc along-track rms 263 m (row 6);
  - S1|62261|2026-01-12 F72: 146 m, with steps at 01-10T03:19 (+15.1 m) and 01-11 (+8.8 m) (row 18).
- Within 5 % of base, so ruled out as causes on S1|62261|2026-04-08 (base 4.075):
  - observed weather 4.197;
  - 70x70 / 1e-10 / 30 s / relativity 4.411;
  - free SRP 4.054;
  - FES2004 ocean tides plus Knocke Earth radiation 4.028.

**DO: F24 losses are maneuvers. F72 steady-decay losses are unexplained.**
- DO|SENTINEL 3A|2025-11-09: SMA steps +27 m between 11-12 and 11-13. FFM wins 7.5x, 7x and 9.5x at days 1-3, then loses day 7 at 6.24 against 0.46 km.
- DO F24 day 7: FFM is worse in 90 % of windows where SMA rose 10 m or more, and in 0-6 % of the rest.
- F72 with no burn: DO|SARAL|2025-10-20, DO|SARAL|2025-10-25 and DO|SENTINEL 3B|2025-10-25.
  - FFM 0.66, 1.15 and 1.47 km against AP72 0.09, 0.16 and 0.11.
  - FFM F24 wins about 6x on the same windows.
  - Holding B at 0.007 makes it worse (row 45: 4.80).
- Ruled out within 2 %:
  - free SRP (rows 23, 28, 32, 34);
  - tides plus Earth radiation (rows 54, 60);
  - observed weather (row 47: 6.885, worse).

**LS: settings stands, with caveats.**
- SRP is held at 0.02 m²/kg below 8,400 km (all-regimes.mjs:39, truth-compare.mjs:32). The spheres' Cr·A/m is 0.0003-0.0055.
- Reruns, day 7 (km):

  | Window | Stored | Fixed | Row | AP |
  |---|---:|---:|---:|---:|
  | LS\|LARES\|2025-12-19 F24 | 0.200 | 0.024 | 4 | 0.034 |
  | LS\|LARES\|2025-12-14 F72 | 0.118 | 0.008 | 19 | 0.021 |
  | LS\|STARLETTE\|2025-10-15 F24 | 0.546 | 0.209 (0.088 with B also held) | 7 (49) | 0.080 |
  | LS\|AJISAI\|2025-12-04 F24 | 0.106 | 0.049 | 59 | 0.106 |

- Starlette still loses after the fix. Ajisai started from a tie.
- The class rests on 5 of 57 window-arms.
- LARETS (25 rows) is unexplained. LS|LARETS|2025-11-09 F72 gives 0.532 with the real SRP (row 13) and 0.573 on observed weather (row 57), against AP 0.044.

### 2.2 High orbit, no drag (GD, GE, IG, GN, WA): 939 losses

Skeptic reading: force 586, maneuver 276, settings 59, unexplained 18. The analyst had force 585, maneuver 276, settings 59, estimator 19.

**GD (59): two harness settings plus a module defect.** The analyst's "step 300 s alone" is refuted as the sole cause.
- Solid tides are off in ffmHigh (all-regimes.mjs:37-41, truth-compare.mjs:34-38), and that is the larger term. Tides on with a fixed 60 s step (skeptic):

  | Window | Base d7 (m) | Tides + 60 s d7 (m) | AP d7 (m) |
  |---|---:|---:|---:|
  | GD\|LAGEOS 1\|2025-11-01 | 39.8 | 1.9 | 18.8 |
  | GD\|LAGEOS 2\|2025-11-08 | 44.0 | 1.0 | 13.8 |

  Fit chi-square falls 8-110x.
- Tides with a 30 s step (analyst, high-orbit/reruns.md), day 7:
  - LAGEOS 2 2025-10-25: 3.7 against AP 8.2;
  - LARES-2 2025-11-08: 3.7 against AP 24.4;
  - LAGEOS 1 2025-11-08: 7.2 against AP 7.5;
  - LAGEOS 1 2025-11-22: 6.5 against AP 5.3, still a loss.
- The step fix alone fails on 2 windows: GD|LAGEOS 2|2025-11-08 with a 120 s step gives 16.7 against 13.8, and GD|LAGEOS 2|2025-12-06 with a 60 s step gives 17.1 against 16.5.
- Module defect: at max step 300 s, tolerance 1e-10 still gives 20.8 m at day 7 on LAGEOS 1 2025-11-22 (rows-test tol10), against 3.8 m with a fixed 60 s step. A two-body flight drifts 6.3/13.0/32.0 m at days 1/3/7 (diverge2-lageos1-1122.json). So RK78 error control does not bound the error.
  - Untested candidate: the GJ8 PEC substitution (ffm_run.h:93-103), which replaces the requested RK78 with a fixed grid when the forces are cannonball, conical shadow and no ECOM2.
- Etalon (11.3 h period) never loses at day 7 (0 of 22).
- 46 of 59 GD rows were classed by group, not rerun.

**GE (53) and IG (41): force, cannonball SRP (weakened).**
- Fitting ECOM2 Y0, B0, B1c and B1s beats AP at every lead on 9 analyst windows and 2 skeptic windows.
- GE|C020 BDS-2G|2025-10-08, days 1/2/3/7 (m):
  - ECOM2: 3.2/7.4/11.4/62.0
  - AP: 19.8/26.8/36.8/92.3
  - stored FFM: 16.0/35.1/64.7/262.1
- Skeptic windows, day 7: GE C020 2025-10-12 at 29.9 against 143.5; IG J002 2025-10-08 at 25.1 against 180.3.
- Does not fix C020 10-08 day 7:
  - Y0 alone: 183 m;
  - constant in-track term: 169.5 m;
  - full settings: 261.5 m.
- Not explained: why FFM's cannonball loses to AP's cannonball at the same AGOM (0.02448 against 0.02458). Numerics are excluded: 60 s steps, full settings and base agree within 0.6 m.
- Regression: GE|C229 BDS-3G|2025-10-12 is a window FFM wins. Its day 7 goes from 11.4 to 42.5 m with ECOM2 (AP 70.9).
- Maneuver, 6 rows, stands: C011 2025-10-12 and C018 on 10-06, 10-08 and 10-10. Both arms are off by 40-210 km and the ratio is 1.000-1.001.
- GE|C231 BDS-3G|2025-10-08 day 3 moves to force. Both arms err by 16.1 and 17.6 m, and the burn (10-04T23:43) falls before the arc.
- No IG row was tested for a maneuver.

**GN (498): force.**
- E218 Galileo FOC (334 rows) stands. It cites results/ffm-galileo-y-bias. Day 7 with Y0 held at +6.85e-10 (m):

  | Arc | Held Y0 | AP | Stored FFM |
  |---|---:|---:|---:|
  | 72 h, 2026-04-16 | 7.2 | 40.0 | 135.0 |
  | 72 h, 2026-04-14 | 8.7 | 48.9 | 165.0 |
  | 24 h, 2026-04-16 | 6.4 | 40.1 | 98.1 |

  A fixed 60 s step gives 135.0 and adding tides 132.5, so numerics and tides are ruled out.
- GPS and GLONASS (164 rows), weakened: ECOM2 ran on one window each.
  - 28874 2026-01-03: day 7 1.9 against AP 15.6 (stored 35.7).
  - 37869 2026-05-28: 13.7 against 33.4 (stored 61.2).
  - Never run on 41019 or 44850.
- No GN row had a maneuver test; tables.md prints "untested" as 0. 113 of 498 rows have a ratio under 1.05.

**WA (288): ties under thrust.**
- 269 maneuver rows stand: 260 have a ratio under 1.02. The arms differ by meters while the errors are kilometers (SES-15 day 7: a 21.4 m difference against a 30.2 km AP error).
- SES-15's class rests only on its median daily SMA swing of 452 m.
- The 19 "burn-free estimator" rows on Galaxy 30:
  - Refuted on WA|GALAXY 30 (G-30)|2026-10-24 day 3: a +218 m step at 2026-10-25T12:56 fell under the 272 m threshold. That row is now maneuver.
  - Holding SRP on 2026-10-02 left day 3 at 42.6 against AP 29.7.
  - ECOM2 made 2026-10-16 worse.
  - The remaining 18 rows are unexplained.

### 2.3 HEO (HE TESS, HX THEMIS and Chandra): 27 losses (72 h arms, HX counted once)

Skeptic reading: scoring 20, maneuver 4, settings 2, unexplained 1.

**TESS chord states (14 rows): scoring, plus a co-present maneuver.**
- MAST TESS definitive kernels store a state every 60 s, but only every 10th state is a real orbit point. The nine between lie on a straight line between nodes, so mid-chord points sit radially inside the orbit by 0.94 km near perigee and 0.13 km at apogee.
- Refitting both arms on the 10-minute nodes:
  - FFM-worse falls from 19 to 5 of 28 window-leads;
  - the day-1 median FFM/AP falls from 1.33 to 0.77.
- Skeptic:
  - Every one of these windows also holds a velocity step in the arc or within 40 min of the cutoff.
  - On node truth, FFM's day 7 gets worse (HE|TESS|2026-08-10: 8.59 to 18.05 km).
  - Chords alone are enough for a loss. A post-step chord arc on 08-10 gives FFM 0.659/1.937/3.988/22.07 against AP 0.636/1.810/3.616/19.10.

**Chandra joins (6 rows): scoring.**
- The kernel is weekly predicted solutions whose joins step 2.0-32.8 km and up to 3.97 m/s.
- Within one segment, FFM reproduces the kernel to 2.5e-5 km over days 1-3 (HX|CHANDRA|2018-03-08).
- An arc started after the 04-16 join (HX|CHANDRA|2018-04-19) gives FFM 0.000/0.000/0.000/2.372 against AP 0.107/0.569/1.101/2.737.
- Skeptic: straddling a join does not predict a loss. HX|CHANDRA|2018-04-05 straddles one and FFM wins every lead. HX measures model consistency, not accuracy against independent truth.

**Maneuver (4 rows): TESS 08-17.** A post-step arc gives FFM 0.067/0.100/0.100/0.334 against AP 0.127/0.467/1.023/8.375.
- TESS 08-31 day 1 (0.295 against 0.269) moves to unexplained. Its step comes 6 h after the cutoff, and the margin sits within the 0.011-0.221 km floor where the truth series switches between solutions.

**Settings (2 rows): HX|THEMIS A|2013-02-13 days 2 and 3.**
- all-regimes.mjs:128 picks the settings from the radius of the first scored state. For this window that chose the low-orbit settings: drag on with no weather, SRP held at 0.02, 40x40.
- Forced to the high settings, FFM scores 0.033/0.058/0.083/0.190 against AP 0.147/0.179/0.203/0.937.

**Not counted in the 27 (skeptic):** 18 more losses at the F336 (HE) and F168 (HX) arms of the same rows, which pairs.json does not pair. Examples:
- HE|TESS|2026-08-03 F336 day 1: 2.003 against 0.632;
- HE|TESS|2026-08-31 F336, all four leads;
- 168 h node-truth TESS 08-17 day 7: 13.80 against 1.319.

## 3. Fixes to file

These are graph-ready bodies. File them as children of one parent to stay inside the 15-parent budget. Each fix is a lead for a registration, not a pass.

**F1. experiments: real SRP for the laser spheres**
- Module: experiments/operator-theory, all-regimes.mjs:39 and truth-compare.mjs:32 (ffmLow).
- Change: hold SRP at each object's known Cr·A/m (LARES 0.0003, Starlette 0.0011, Larets 0.0018, Ajisai 0.0055), or estimate it with an a priori.
- end_to_end: LS|LARES|2025-12-19 F24 refit through the harness gives day 7 of 0.030 km or less (rerun row 4: 0.024; AP 0.034).
- Cells: AP6 LS F24 and F72 (report only).
- The registration must show: unseen 2026 LS cutoffs with the seed rule fixed before any fit; FFM loss share and median ratio at d1/2/3/7; Starlette reported apart.

**F2. experiments: solid tides and a period-scaled step in high orbit**
- Module: ffmHigh, all-regimes.mjs:37-41 and truth-compare.mjs:34-38.
- Change: turn solidTides on. Set maxStep to min(300 s, period/100), which is 120 s at LAGEOS. The production catalog already runs 120 s, tolerance 1e-14 and tides (propagator/ffm/catalog-configuration.mjs:30, 72-80).
- end_to_end: GD|LAGEOS 2|2025-11-08, 72 h arc, day 7 of 2 m or less (tides30 and tidesrk60 both 1.0; AP 13.8).
- Cells: AP6/AP7 regimes 72 h GD, d1-7 (d7 is 29 of 54 worse, median 1.55).
- The registration must show: new GD dates, all windows including wins, a paired d7 FFM-minus-AP interval below 0, Etalon unchanged, and no GN cell moving beyond CHEAPER's 0.005/0.020 km margins.

**F3. propagator/ffm: make RK78 error control bound the error**
- Module: propagator/ffm (ffm_run.h:93-103 GJ8 PEC substitution, the RK78 controller).
- Change: the requested tolerance must bound the step error. Do not substitute a fixed GJ grid when a tolerance is requested, or report that it did.
- end_to_end: the fitted LAGEOS 1 2025-11-22 state flown two-body at max step 300 s and tolerance 1e-10 diverges by less than 1 m along-track at day 7 from a 30 s flight. Today: 20.8 m in the harness, 32 m two-body at 1e-8.
- Cells: none directly (F2 works around it); it covers every registration that flies 300 s steps.
- The registration must show: a module test against an analytic Kepler orbit in which the error falls with the tolerance at a fixed max step.

**F4. experiments: ECOM2 SRP fit for GNSS and GEO/IGSO**
- Module: harness lib/fit.mjs:21 and lib/frame.mjs:20-46. propagator/ffm already accepts the kinds (catalog-configuration.mjs:120-127, force_models.cpp:536-550). A working path is in scratch: high-orbit/scripts/fit2.mjs and host2.mjs.
- Change: fit Y0, B0, B1c and B1s beside the cannonball with about 1e-8 m/s² priors, behind a guard (a prior or a residual test) so C229-like windows do not get worse. For Galileo FOC, a fixed Y0 = +6.85e-10 (results/ffm-galileo-y-bias) is the smaller alternative. Do not apply to 24 h WAAS broadcast arcs.
- end_to_end:
  - GE|C020 BDS-2G|2025-10-08, 72 h, day 7 of 70 m or less (ECOM2 62.0; AP 92.3);
  - GE|C229 BDS-3G|2025-10-12 day 7 no worse than its stored 11.4 m plus a margin fixed beforehand.
- Cells: AP7 truth2 GN 24 h and 72 h (all leads); AP6 regimes GE and IG 72 h, d2-7; GEO-TRUTH BeiDou lines.
- The registration must show: new GN, GE and IG dates scored on every window (wins included); ECOM2 FFM beating both AP and cannonball FFM at d1-7 with paired intervals below 0; an IG maneuver test run first; no harm on Etalon or LAGEOS.

**F5. experiments: maneuver flags for S1 and DO, and the classify order**
- Module: experiments/operator-theory window design and reporting. The detector is skeptic-drag/steps.py (per-rev mean SMA, steps of 8 m or more) plus an SMA change over the span.
- Change: mark windows with a step in the arc or the forecast span and report them apart. A storm flag must not override a maneuver flag (classify.py ordering misfiled 401 rows).
- Not filed: the analyst's log-normal B prior for FFM. The skeptic refuted it: it would tune FFM to the burns.
- end_to_end: S1|39634|2026-05-03 F24 is flagged (step 05-06T04:42, +12.5 m), and step-free S1 F24 day-7 windows are reported apart.
- Cells: AP5 and AP7 Part N S1 F24 and F72; AP6 DO F24 and F72.
- The registration must show: on unseen Sentinel-1 cutoffs (2025, or after the C2 hold), step-free S1 F24 day 7 with FFM loss share under 50 % and median ratio under 1, with detector thresholds fixed before any reading.

**F6. experiments: TESS node truth and step marking**
- Module: the HE reader, all-regimes.mjs:49-54 and :76-81. The same reader serves ap-heo-frame-confirm and ap-gap HE.
- Change: keep only the states not collinear with both neighbors (the 10-minute nodes), grid at 600 s, and mark windows with velocity steps.
- end_to_end: on HE|TESS|2026-08-10 the reader drops 9 of 10 states, and the FFM arc residual is 60 m or less (59 m on nodes).
- Cells: AP6 HE (report only), the site's HEO rows, the ap-gap HE candidate (its 420 m gap was measured on chord truth), ap-heo-frame-confirm HE and HEr.
- The registration must show: unread TESS windows (MAST after day 260) with step-free arc residuals of 10 m or less and a paired day-1 ln(FFM/AP) interval below 0.

**F7. experiments: choose the regime from the orbit**
- Module: all-regimes.mjs:128.
- Change: pick high or low settings from the arc's semimajor axis or median radius, not from the radius of the first scored state.
- end_to_end: HX|THEMIS A|2013-02-13 runs the high settings and scores 0.033/0.058/0.083/0.190 km.
- Cells: HX THEMIS.

**F8. experiments: score Chandra inside one solution**
- Module: lib/regimes.mjs:48 and the scorer's bins.
- Change: score only inside the weekly solution that holds the arc's end, and set cutoffs from the join epochs. Label HX as model consistency.
- end_to_end: HX|CHANDRA|2018-04-19 with the arc after the 04-16 join gives FFM 0.000/0.000/0.000/2.372.
- Cells: HX Chandra, days 1, 2, 3 and 7.

**F9. scratch: pairs bookkeeping (no graph task)**
- Module: scratchpad/ffm-losses/pairs.mjs.
- Change: count HX once, and pair the F336 and F168 arms.
- Check: cells.json HX n is 76, not 152, and the 18 F336/F168 losses are listed.

**F10. experiments: WA burn detection**
- Module: geo-burns.mjs and the WA tables.
- Change: detect burns from hourly peaks below the 272 m threshold, or from residuals. Split WA into burn and burn-free before classing anything as estimator.
- end_to_end: WA|GALAXY 30 (G-30)|2026-10-24 is flagged (+218 m at 2026-10-25T12:56).
- Cells: regimes-wa 24 h and 72 h.

## 4. Unexplained, and the next measurement

| Item | Rows | Next measurement |
|---|---:|---|
| S1 F72 tie (median ratio 0.98-1.05; steps barely discriminate) | 342 | Rerun 10 S1 F72 windows with FFM's reference epoch at the cutoff instead of the arc start (lib/host.mjs:94); report step-free windows apart. |
| S1 F24 step-free losses (no-step windows still lose 30-43 % at d2-d7) | 77 | Lower the step threshold below 8 m. Test any B prior on step-free windows only. |
| DO F72 steady decay (FFM F24 wins 6x on the same windows) | 45 | Rerun SARAL 2025-10-20 and 2025-10-25 and S3B 2025-10-25 with a 24 h arc and the epoch at the cutoff. |
| DO with no truth SMA (HY-2C, HY-2D, S6 Michael Freilich) | 24 | Fix the SMA reader for these objects, then run the maneuver check. |
| LARETS (11-09 storm; loses with the real SRP and on observed weather) | 25 | Rerun with a free SRP from the 0.02 seed and with a 24 h arc. |
| WA Galaxy 30, burn-free not proven | 18 | Run F10's detector, then report burn-free leads with SRP held. |
| TESS 08-31 day 1 (within the solution-switch floor) | 1 | Cross-check against SPICE; settle whether TESS steps are definitive-OD splices or momentum unloading. |
| P per-row mechanism (3 reruns for 4,168 rows) | — | A paired ln-ratio interval per cell as the noise floor. Rerun the 12 worst P F24 d1-d2 windows (summary.md) with B held at a non-hindsight value, e.g. the 30-day median of FFM's own fits. |
| GE: FFM's cannonball loses to AP's at the same AGOM | — | Test aliasing of the once-per-revolution SRP into the osculating state: a once-per-revolution empirical acceleration, or a mean-element epoch. |
| IG and GN maneuvers never tested; ECOM2 not run on 41019 or 44850 | — | Run the burn rule on IG and GN, and ECOM2 on those two satellites. |
| Ocean tides in high orbit refused ("OCEAN_TIDE_MAXIMUM_DEGREE must lie in [2, 50]" at degree 20) | — | Check the PRW JS bindings against FFM 2.0.4's schema (frame.mjs:44 writes the degree but not the order). |
| GJ8 PEC substitution untested for WA and LAGEOS | — | Covered by F3's module test. |
| AP168 beats FFM168 on HE\|TESS\|2026-08-31 (d7 2.626 against 11.527), plus 18 unpaired F336/F168 losses | — | Pair them (F9), then classify. |

Provenance: rerun tables are drag-leo/rerun-table.md, high-orbit/reruns.md plus scratchpad/skeptic-high-orbit/rows1..5.jsonl, and heo/rows.json `reruns`. Analyst class counts are drag-leo/class-cells.json, high-orbit/rows.json and heo/rows.json. Skeptic-reading counts come from scratchpad/ffm-losses-report/reconcile-all.py.
