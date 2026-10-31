# XP2 fit design on unseen dates: does the redesigned fit of SGP4-XP with NRLMSISE-00 beat the public set?

Registered 2026-10-31, before any score, under task `experiments-xp2-fit-design-fresh-20261031`. `config.json` and `build.json` beside this
file are part of the registration. Nothing here changes after this commit; a change before the first score is a dated amendment at the end, and a
change after it is labeled exploratory. The coordinator ruled the design, the interval and the families on 2026-10-31, on the power below.

## Question

The owner, 2026-10-31, verbatim: "XP2 should be beating it, figure out what's wrong." XP2 is our SGP4-XP (propagator/sdn-ap) with
NRLMSISE-00; "it" is the public element set. The diagnosis (exploratory, on XM's spent windows) says the module is not broken and the
loss is the fit design. This experiment is the registered test on dates no X2, R17, RF17 or RFa12 has been scored on.

1. Matched inputs: X2 against S72L, SGP4 refit to the same truth and arc, each with its own fitted drag.
2. RFa12 against P by XM's three-condition rule at days 1, 2, 3, 7. The same for RFa24, RF17 and R17.
3. S17LP: how much of any lead is data age.
4. Arcs ending at the public set's creation time: the parity reading. The set's information time is about its creation, not the cutoff,
   and precise products are not real-time.

Report only: P plus the 12 h term, on stored rows.

## What a pass means

- Every fitted arm reads truth-quality precise products. Those products are not real-time, and P is the public set available at the
  cutoff. So a pass at the cutoff reading answers the theory-and-fit question with zero-latency precise truth. It does not answer the
  console supply question; the console default still needs the operator-data test.
- The parity reading removes the data age, not the data quality: its arcs end when P was created, and they still read precise truth. A
  pass there says this fit design out-predicts the public set given the same orbit-data age and better orbit data.
- No pass here changes a module, the console default or a public claim by itself.

## Previously analyzed

- XM's windows (2026-01-01 to 05-31) are spent. RF17 was chosen on them: the synthesis swept 14 to 48 h arcs and B sources on n 301, then 750,
  with 17.1 h computed from the 12 h line's null. On XM's exact generator RF17 passes XM's rule on all 750, fails on either split half, and
  holds 0 at days 2, 3 and 7 on ISO-week clusters.
- RFa12 was chosen on them too: the critic looked at 12, 24 and 36 h FFM arcs on n 23, 61 and 150, then a second sample of 150 chosen after
  the first result. Pooled (n 300): -7.6, -22.8, -25.4, -23.4 %. Established against RF17 on Swarm A+C only. The critic's 18 h and 48 h looks (n 33)
  are disclosed as well. Both arcs are selected on spent windows, so their leads are expected to shrink.
- C2 fitted FFM and native-XP covariance constants on every second day of 2025-10-03 to 2026-03-31, these objects included. This span is plan H1's dev
  half, so H1 must label it previously analyzed. No C2 fitted constant enters here; the FFM seeds are C2's published area and mass only.
- E13's dev split (2025-11-01 to 12-31) and other experiments read this truth for other questions. None scored X2, R17, RF17, RFa12 or S72L here.
  The diagnosis read only file names and GFZ weather for these dates, so the Ap 137 storm of 2025-11-12 was known.
- Step 0 read, for these dates and before this registration: file names, the RSGA bulletins' parse, and the public sets' dates, never truth. P's median
  age at 00:00 UTC is 6.7 h on the primary span (October 8.8, November 5.5, December 9.0) and 10.2 h on the extension, against 5.4 h on XM's windows
  (January 10.3, February 5.4, March 6.8, April 4.4, May 4.4). The archive holds no set of these five objects created on 2025-11-09 or 11-10, and one
  batch a day on 11-01 to 11-03; Swarm B has none on 12-20. XM's rule stands, unadjusted. The diagnosis says the win comes from older sets, so P's age is an expected source of
  lead on these dates; S17LP and the age terciles exist to show it.
- The term's constants come from XM's windows, one pooled pair over all 750 (the diagnosis used split halves; these dates lie outside both), frozen in config.json.
- Another task (modules-open-dca-issue-rule-lag-20261031) scores another question on 2025-01-01 to 09-30 and reads this store's Swarm truth. Neither reads the other's rows or scores.

## Dates

- Primary span: 00:00 UTC cutoffs 2025-10-04 to 2025-12-21 on Swarm A, B, C and GRACE-FO 1, 2: 79 cutoffs, 395 windows, 12 ISO weeks (W40 has 2 days), 36 orbit-group x
  week clusters. The first full 72 h arc after the truth files begin; day 7 ends 12-28, where XM's truth reads begin.
- Extension: 2025-01-01 to 2025-09-30 on Swarm A, B, C: 273 cutoffs, 819 windows. Together 1,214 windows, 51 ISO weeks, 114 orbit-group x week clusters. GRACE-FO has no local truth files before 2025-09-30, so
  the pool is 87 % Swarm, against 60 % on the primary span alone. The verdict is on the pool; each span and each orbit group is printed beside it, and no group or span is claimed unless its own cells meet the rule.
- Swarm truth for the extension: ESA's reduced-dynamic SP3 COM (newest baseline) with the kinematic files for the stated sigma, public, no credentials, converted under reference-states/reference by fetch-swarm.mjs, the path of the modules script, byte-identical to the archive's conversion on a spent day (2026-03-09, every file). File start days 2024-12-27 to 2025-09-29.
- Weather for the extension: the RSGA bundles of 2024 and 2025, read through a registered data-preparation step, lib/rsga.mjs: XM's parser takes the normalized text. In 2024-12-28 to 2025-09-30, 93 bulletins fail XM's parser: 56 hold only spaces after the slash, which are removed, and 37 hold an observed Ap that is not a number (36 NA, one garbled N60). An observed Ap that is not a number takes the previous day's bulletin's estimate for that day; where that bulletin is absent or has none, the line's Afr would stand in for Ap, and it is needed on none of the 37. A predicted Ap that is NA takes that item's Afr: Afr stands in for Ap on one line, the predicted days 05-17 and 05-18 of the 2025-05-16 bulletin, read only by the 05-17 cutoff. The step prints these counts and lists every line where Afr stands in. Read as is, 41 of the 273 cutoffs would have no bulletin in force and 22 would read one 50 h old; normalized, none is excluded and none is older than 26 h. On the primary span no bulletin needs this; 2025-11-13 is absent, so the 11-14 cutoff reads the 11-12 bulletin, 26 h old, inside XM's 72 h rule.
- Bars: XM's and XM3's windows are spent. C2's hold-out from cutoff 2026-06-01 is barred. Swarm and GRACE-FO truth for 2026-10-31 to 11-28 is barred until E13b scores.
  C2's held-out objects and the ISS are out. Never read: B2 part 1a and part 5 files, census results, operator-capture content, C3-small's rows.

## Arms

All through XM's code at 2c7b326 and XM3's lib/ffm.mjs at ee2a513, unchanged, wasm by `git show` at modules 9a05d899b, SHA-256 checked. No module change.

| Arm | Reading | Elements from | Drag from | Flown by |
| --- | --- | --- | --- | --- |
| P | as XM | the newest public set with EPOCH and CREATION_DATE at or before the cutoff | its B* | propagator/sgp4 AFSPC |
| X2 | cutoff | XP fit to the last 72 h, free (XM's arm) | the same fit | sdn-ap |
| R17 | cutoff | XP fit to the last 17 h | X2's BTERM, held | sdn-ap |
| RF17 | cutoff | XP fit to the last 17 h | FFM fit to the last 72 h, its B held as BTERM | sdn-ap |
| RFa24 | cutoff | XP fit to the last 17 h | FFM fit to the last 24 h | sdn-ap |
| RFa12 | cutoff | XP fit to the last 17 h | FFM fit to the last 12 h | sdn-ap |
| S72L | cutoff | SGP4 `fit_elements` to the last 72 h, epoch at the arc's last state | its own B* | propagator/sgp4 AFSPC |
| S17LF | cutoff, report only | SGP4 `fit_elements` to the last 17 h | S72L's B* | propagator/sgp4 AFSPC |
| S17LP | cutoff | SGP4 `fit_elements` to the last 17 h | P's B* | propagator/sgp4 AFSPC |
| S17LPc | parity, report only | as S17LP, arc ending at the set's creation | P's B* | propagator/sgp4 AFSPC |
| RFa12c | parity | as RFa12, both arcs ending at the set's creation | FFM 12 h ending there | sdn-ap |
| R17c | parity, report only | as R17, both arcs ending there | XP 72 h ending there | sdn-ap |
| RFa24c, RF17c | parity, report only; primary span only | both arcs ending there | FFM 24 h, 72 h ending there | sdn-ap |

- Weather: XM's condition O, as issued, the rows of the cutoff for every arm, parity arms too: RSGA at or before the cutoff, at most 72 h old, GFZ observed before it, trailing 81-day mean, last row held; FFM reads them through XM3's driverRows. Parity arms therefore read bulletins up to 2 h newer than their arc at the median; a set days old sees more. Report only: parity cells restricted to sets created within 6 h of the cutoff.
- XP fit: propagator/sdn-ap `fit`, XM's settings; BTERM held by FIT.DRAG_PRIOR LOG_NORMAL, MEAN the value, SIGMA 1e-6.
- FFM fit: analysis/estimation 0.7.0 `fit_batch` version 3 answered by propagator/ffm 2.0.4, XM3's settings (profile P0, C2's published-dimension seeds, RK78 relative tolerance 1e-10, absolute 1e-7, steps up to 120 s, input 300 s) but for the arc. No FFM forecast.
- SGP4 fit: analysis/gp-error-model `fit_elements` (Levenberg-Marquardt tolerance 1e-10, at most 100 iterations, central differences). It fits in the module's improved mode and flies in AFSPC mode, as the diagnosis did; the smoke step measures the difference on the arc.
- Coverage: XM's: an arc holding under 90 % of its states is not fitted; the window leaves that arm's cells, counted. Every arm is thinned to 300 s as XM.
- Failures: a refused or unconverged fit, a B at or below 0, or a non-finite state fails the arm in every bin of the window: d = +Infinity, a loss, never dropped.

## Scoring and statistics

- As XM: truth grid at 300 s, leads 1, 2, 3, 7, bins with at least 260 of 288 epochs, e the 3D RMS in the truth's RTN axes, d = ln(e_arm / e_ref).
- Clusters: ISO week of the cutoff primary. Orbit group x ISO week beside every cell.
- Rule 1, the interval of the median d wholly below 0. Rule 2, the upper bound of the interval of ln(p95_arm / p95_ref) below ln 1.10. Rule 3, failures at most 1 % of pairs. XM's rule is all three at every lead.
- Interval: the 97.5 % percentile interval of a cluster bootstrap, 10,000 draws, xorshift128+ seeded by SHA-256 of `XP2F|<span>|<arm>/<ref>|<lead>|<clusters>`. It is the one-sided 2.5 % split over the two families below, and it is what brings XM's whole rule to about nominal on XM's rows (below). The 95 % cell is printed beside it.
- X2 against S72L: its rule 1 and its rule 2 are printed separately. That contrast is the owner's direct question and its rule 2 has the lowest power (below).
- False-positive rates are printed beside the verdicts.
- Overall statement, report only: per window the mean d over the four leads, the interval of its median.

### Multiplicity, written before any score

Two families, each a fixed sequence; a statement is tested only if every earlier statement of its family passed. Cells after a stop are printed and labeled "not tested".

- Family M: M1 RF17 against X2, rule 1 at every lead (the diagnosis). M2 X2 against S72L, XM's rule (matched inputs).
- Family F: F1 RFa12 against P, XM's rule. F2 RFa12 against S17LP, rule 1 at every lead (beyond data age). F3 RFa12c against P, XM's rule (parity). F4 RFa24 against P, F5 RF17 against P, F6 R17 against P, XM's rule.

### Report only, printed with the same cells

Each statement by span and by orbit group. By tercile of P's age at the cutoff, so that if these dates flatter the arms the table shows it, and P's age by month. Windows with a 72 h arc holding Ap at least 40. Parity cells restricted to sets created within 6 h of the cutoff. S17LP / P, S72L / P, X2 / P, R17 / S17LF, RF17 / S17LP, RFa12 / RF17. The overall statement of each arm. P plus the term against P, and each arm plus the term against P plus the term.

### False-positive rate, printed for every statement

From the scored rows, with the table: ISO weeks drawn with replacement to the span's own weeks, the same bootstrap inside each simulated span, a seeded generator. Null of rule 1: the arm's errors at the lead scaled so the span's median d is 0. Null of rule 2: scaled so the span's p95 ratio is 1.10. Whole rule: the least favorable null, one lead at a null and the others as scored, the largest over leads and nulls. Printed per statement and per lead, at 97.5 % and 95 %, for both clusterings. A rate above nominal is reported; it changes no verdict.

## What each outcome means

| Outcome | Meaning |
| --- | --- |
| M1 passes | The fit design is what moved X2, on dates the diagnosis never saw. |
| M1 fails | The diagnosis does not replicate at some lead; say which. |
| M2 passes | The owner's expectation holds where inputs match: XP with NRLMSISE-00 out-predicts SGP4 on the same truth and arc. |
| M2 rule 1 passes, rule 2 fails | XP leads at the median at every lead; the named lead's tail is not shown. |
| F1 passes | XP2 with this fit design beats the public set on precise truth at the cutoff reading. |
| F1 fails rule 1 at a lead | RFa12's lead is not shown there; its spent-window lead did not replicate, or the test could not see it (print the interval and the smallest effect it excludes). |
| F1 fails rule 2 only | Median win, tail not shown; no pass. |
| F2 passes | The lead is more than the data age a plain SGP4 fit gets from the same 17 h. |
| F2 holds 0 at a lead | At that lead the lead is data age. XP and NRLMSISE-00 add nothing shown there. |
| S17LP below P | Data age alone beats P; the share is S17LP's median over the arm's. |
| S17LPc holds 0 at every lead | Creation time is P's information time; the parity clock is right. |
| S17LPc below P | P knows less than a plain fit to precise truth at the same time: data quality, so parity is not a level field. |
| S17LPc above P | P knows more than its creation time says; parity favors P. |
| F3 passes | On equal data age, this fit beats P at every lead. The strongest result available without operator data. |
| F3 ties at a lead (its interval holds 0) | On equal data age there is no lead at that lead. Any win there at the cutoff reading belongs to fresher data, and it would need precise data at zero latency to exist. If the interval also lies inside -9.1 to +10 %, say "tie". If it is wider, say "not determined" and print the width: a tie is not a loss, and not a proof of equality. |
| F3 wholly above 0 at a lead | Behind on equal data age: the public set out-predicts this fit there. |
| F4 to F6 pass | That arm passes too; R17 needs no FFM. |
| Everything fails | No claim on these dates; the owner gets the cells, their widths and the false-positive rates. |

## Power, computed before any score

From XM's stored rows (spent), by resampling ISO weeks into spans of this design: 1,500 spans, 600 bootstrap draws each, the span's own day and object counts, windows upsampled inside a slot where the rows are a sample. Percent passing at 97.5 % on ISO-week clusters at the measured effect (half the effect), then the false-positive rate of the whole statement at its least favorable null.

| Statement | This design | Primary span alone |
| --- | --- | --- |
| M1 RF17 / X2, rule 1, 4 leads | 100 (21), 0.7 | 83 (12), 2.9 |
| M2 X2 / S72L, XM's rule (rule 1 alone) | 48 (18), 0.8 (100) | 64 (16), 2.0 (78) |
| F1 RFa12 / P, XM's rule | 84 (23), 3.1 | 23 (3), 1.8 |
| F2 RFa12 / S17LP, rule 1, 4 leads | 99 (34), 5.3 | 56 (11), 6.5 |
| F3 RFa12c / P, XM's rule (rule 1 alone) | 2 (1), 1.0 (23) | 2 (0), 0.7 (6) |
| F4 RFa24 / P, XM's rule | 53 (18), 3.7 | 10 (3), 4.2 |
| F5 RF17 / P, XM's rule | 57 (7), 2.7 | 6 (0), 1.3 |
| F6 R17 / P, XM's rule | 2 (0), 1.2 | 0 (0), 0.3 |

At 95 % F1 is 90 (34), 5.3 and F5 is 68 (13), 4.7. Single-lead rule 1 false-positive rates on the all-row contrasts: up to 6.5 % at 95 %, up to 3.9 % at 97.5 %. Orbit-group x week runs hotter: F5's whole rule at 97.5 % is 5.5 %. RFa12 has 300 rows there and the parity arm 150; RF17 on all 750, on those 300 and on those 150 gives 57, 14 and 3 % on this design, so those two cells are probably pessimistic, the parity cell badly, though those samples also carry a smaller effect. Neither design resolves the half effect. A fail of F3 on this power says little.

## Reproduction

Before any fresh window: the spent-window control runs the runner on XM's windows of both truth kinds, and requires P and X2 equal to XM's stored rows and RF17's B equal to XM3's stored F2 fit, every number; a miss stops the run. It also measures the SGP4 fit's improved-mode difference: S72L flown in AFSPC mode over its own arc against the fit's stated RMS. The table is built only after every window is stored; no cell is read while the run goes, only counts of windows and failures. All fitting and propagation are WASM module calls; JavaScript moves FlatBuffers and does statistics. The term is a statistic on stored output: a fixed 12 h along-track line, one amplitude and phase for all objects, constants frozen from XM's windows in config.json, subtracted from the along-track error at output, and never fed to any fit. Space-Track, Planet and truth states stay in the local store; results are aggregates. E2E: `node experiments/xp2-fit-design/run.mjs --check`: pinned windows re-run and every stored number compared exactly; the table rebuilt from stored rows equal to the committed table.json byte for byte.

## Amendment 1, 2026-10-31, during the run, before any cell was read

A corrigendum; no number changes. config.json `spaceWeather.condition` says rows from cutoff - 75 d. The code, as XM and XM3 have it, reads cutoff - 72 h - 3 d, 6 days. One consequence, for report-only arms: R17c and RF17c fit a 72 h arc ending at the set's creation, and where the set is over about 3 days old that arc starts before the cutoff's rows, so the module refuses, the arm fails and the window counts as its loss, as the rule says. RFa12c (F3) cannot reach this: its 12 h arc would need a set over 5 days old, and the oldest is 79 h. Seen in the failure counts of the run; no score was read.

## Amendment 2, 2026-10-31, during the run, before any cell was read

Amendment 1 misstated the threshold; this corrects it. From the failed arms' set ages, no score read: the modules need rows from the day before the earliest state, so the refusal comes where the set was created about 46 to 49 h before the cutoff, not about 3 days. So far that is the five windows of 2025-11-11, where the archive holds no set created on 11-09 or 11-10, and Swarm B on 12-20 and 12-21. RFa12c's 12 h arc would need a set created over 4.5 days before the cutoff, and the oldest set in these spans is 79 h, so F3 cannot reach it. The table's README gains the failure counts by arm and cause and one disclosure line on two days without F10.7; no cell, rule or statistic changes.
