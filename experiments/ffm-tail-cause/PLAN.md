# XM5: why does F2 lose XM3's tail rule at days 1-3? Observed weather against as-issued, and FFM's daily Ap against 3-hourly

Registered 2026-10-31 (UTC), before any score under condition M, under task `experiments-ffm-tail-cause-20261031`. XM5 is XM3
(`experiments-ffm-atmosphere-xm3-20261031`: registration c56dbd1, runner 3af42a8, amendment 1 ee2a513, results 22313bf) with one
change: the weather. Its windows, cuts, clusters, leads, fit settings, forces, integrator, Earth orientation, kernel, public-set
extraction and scorer are XM3's, read from XM3's config.json and code at 22313bf, unchanged. This file and `config.json` are the
registration. Nothing here changes after this commit; a change before the first score is a dated amendment at the end, and a change
after it is labeled exploratory.

## Question

The owner, 2026-10-30, verbatim: "I want our new atmospheric model to beat SGP4, which it should with truth / owner operator data."

XM3: F2 (propagator/ffm fitted by analysis/estimation 0.7.0 to 72 h of precise truth, NRLMSISE-00 on the as-issued weather) against
the public set under SGP4 (P), group P, 750 pairs: medians -60.9, -29.2, -17.5 and -14.2 % at days 1, 2, 3 and 7, no failures. Only
rule 2 fails, at days 1-3: the upper bound of the p95 ratio is 1.26, 1.31 and 1.20 against 1.10 (1.05 at day 7). XM3's exploratory
hypothesis: the as-issued rows miss the January storm and the fit absorbs it in B.

1. Does the tail close on observed weather (condition M)?
2. FFM reads daily Ap, and NRLMSISE-00 can take a 3-hourly ap history. Does the module accept one?
3. Tail accounting, on both conditions, report only: the p95 ratio and its bound with ISO week 2026-W04 out, the worst 5 % of F2's
   windows by ISO week and by Ap at the cutoff, and whether they are worst for P as well.

**This is a sensitivity.** M reads weather nobody had at the cutoff, so it tells cause, not skill. It moves no registered verdict:
XM3's "no" stands. No result here is written as "beats SGP4".

## Previously analyzed windows (disclosure)

- These windows were scored in XM2 and XM3, under O. Every row and cell is published and the registrants have read them.
- The worst-window list was read before this registration: XM3's exploratory paragraph (19, 23 and 22 of F2's worst 38 at days 1, 2
  and 3 in W04, against 10, 12 and 11 of P's).
- F2 has never been scored under M on these windows. XM2 and XM3 did not run M; XM3's smoke test read M's rows outside the period
  with no truth after its cutoff; XM scored its X arms under M.
- For this registration the weather rows of both conditions were read, with the eight 3-hourly ap of the January week (below). No
  truth and no F2M error was read.
- The definition of "closes" was written knowing O's bounds.

## Arms

| Arm | What | Source |
| --- | --- | --- |
| F2M | XM3's F2 with condition M's rows in the fit and the forecast | run here |
| F2O | XM3's F2 under condition O | XM3's stored rows (digest 1af3adb87236), read only; a sample rerun to equality first |
| P | XM3's P | XM3's stored rows, read only; the same sample |
| F2H | F2M with the 3-hourly ap history | not run: it needs a module change (Question 2) |

## Weather: the only change

M is XM's `rowsM`, as XM3 registered it: from GFZ's `Kp_ap_Ap_SN_F107_since_1932.txt` (retrieved 2026-10-09, SHA-256 b1887ab89a92...,
config.json), the observed F10.7, the daily Ap and the true centered 81-day mean of F10.7, with XM3's driver rule (a day through
D0 + 8 with no row takes the last row at or before it). propagator/ffm reads, on UTC day d, the F10.7 of d - 1, the 81-day mean and
Ap of d.

**Coverage.** The file holds every day of 2025-12-20..2026-06-10 with Ap and ap1 to ap8, and its Kp is definitive on all of them, so
it covers every arc and horizon. One gap: no F10.7 on 2026-05-09. `rowsM` drops that day, so the driver rule gives 05-09 all of
05-08's values, Ap 12 where GFZ has 4. The 11 cutoffs 05-03..05-13 read it (05-01 and 05-02 hold it past their rows and never read it,
their last scored epoch being on 05-08). Disclosed, not corrected: it is XM3's rule, on a quiet day.

**What M changes against O, from the rows, no score** (150 cutoffs, on the days propagator/ffm reads: Ap and F10.7a of D0 - 3..D0 + 6, F10.7
of D0 - 4..D0 + 5):

| Input | Largest difference | Median | p95 | Max |
| --- | --- | --: | --: | --: |
| Ap, arc days | per cutoff | 2 | 11 | 24 |
| Ap, forecast days | per cutoff | 16 | 58 | 139 |
| F10.7 | per day (sfu) | 2.6 | 31.5 | 111.8 |
| F10.7a, O's trailing mean against M's centered mean | per day (sfu) | 8.8 | 17.6 | 20.4 |

So, before any score:
- M changes three inputs together and cannot say which one matters.
- O's arc rows already hold nearly the observed Ap, so M changes mostly the forecast. It is a weak test of "the fit absorbs it in B".
  At the cutoffs 01-22..01-25, four of W04's seven, Ap changes by at most 4 over the arc and 15 over days 1-3.
- GFZ gives F10.7 231.8 sfu for 2026-01-18, where the RSGA's observed line gives 148. FFM reads it on 01-19, beside Ap 73: under M at
  the 10 cutoffs 01-13..01-22, under O at 01-20..01-22.
- Daily Ap spreads 01-19's 73 over the whole day. Its 3-hourly ap was at most 18 until 18:00 UTC, then 236 and 300. M keeps that.

## Windows and truth

XM3's: every window with an F2 attempt under O. Group P (primary): 750, Swarm A, B, C and GRACE-FO 1, 2, cutoffs 2026-01-02..05-31.
Group S1 (report): 270, Sentinel-1A and 1C, 257 to 259 pairs per lead. Not run: the 7 windows of the cutoff 2026-01-01, out of O so
with no pair. Truth, the 300 s grid, lead bins (1, 2, 3, 7), e and the scorer are XM3's. A run-time guard compares every M row with
XM3's row (bins, entered, arc) and with XM's stored M row (the rows' count and span); a difference stops the run as a software defect.

**The sample, before any M window.** XM3's three check windows (P|39452|2026-03-10, S1|39634|2026-03-10, P|43476|2026-02-13) and the
first 9 eligible windows by SHA-256 of `XM5|sample|<key>`, rerun under O: P and F2 must equal XM3's stored rows byte for byte, with
the bins, the arc, the rows and the held and filled days (amendment 1's span). `--launch` refuses without that receipt.

## Statistics

XM3's bootstrap, code copied unchanged: clusters orbit group x ISO week, 10,000 draws, percentile 95 % intervals, failures as
+Infinity. Group P and group S1 at every lead; no pooling.

| Cell | Contrast | Clusters | Seed label | Role |
| --- | --- | --- | --- | --- |
| C1 | F2M against P, rules 1, 2, 3 | orbit | `XM2\|<group>\|72\|M\|F2/P\|<lead>\|orbit` (XM3's form for M) | decides the outcome below |
| C2 | F2M against P | satellite | the same with `satellite` | report |
| C3 | F2M against F2O, median and p95 ratio, paired | orbit | `XM5\|<group>\|72\|M/O\|F2\|<lead>\|orbit` | the weather's own effect |
| C4 | F2O against P | orbit, satellite | XM3's | must equal XM3's committed cell in every number |
| C5 | F2O and F2M against P, cutoffs of 2026-W04 out (35 windows in P, 14 in S1) | orbit | `XM5\|<group>\|72\|<O or M>\|F2/P\|<lead>\|orbit\|noW04` | report |

**Tail accounting, report only** (per group, condition and lead, no intervals):
- The worst 5 %: the ceil(0.05 n) windows of largest e (38 of 750; a failure is largest; ties by key), F2's and P's. Under O the W04
  counts must give XM3's published 19, 23, 22 and 10, 12, 11.
- Counted by ISO week, by cutoff date, by Ap at the cutoff and by storm contact, each beside its count among all n windows.
- Ap at the cutoff: GFZ's daily Ap of D0 - 1 (the arc's last day) and of D0 (the first forecast day), and O's as-issued Ap of D0; bins
  0-14, 15-29, 30-49, 50 and above.
- Storm contact, by XM's `stormDay` (Ap >= 50 or any Kp >= 6): a storm day in the arc's days D0 - 3..D0 - 1, in the forecast's days
  D0..D0 + k - 1 at lead k, in both, or in neither.
- Worst for P as well: the share of F2's worst 5 % also in P's worst 5 % (chance is 5 %), P's median percentile in those windows, and
  the share where F2's e exceeds P's.
- The shift: how many of F2O's worst 5 % stay in F2M's, and the median e_F2M / e_F2O inside them.
- B: the fitted B of F2O and F2M against the object's seed (median ln(B / seed)) in each worst 5 % and in all windows, and the median
  |ln(B of F2M / B of F2O)|, because the hypothesis names B.

## What each outcome means (written before any score)

"Closes" means C1's upper bound of the p95 ratio is below 1.10 in group P at days 1, 2 and 3. Day 7 is reported; its bound under O is
already 1.05.

| Outcome | Reading | Where it points |
| --- | --- | --- |
| Closes at all of days 1-3 | The tail needs weather M knows and O does not, so as-issued weather is the cause | The weather forecast. M does not say which of F10.7, Ap and F10.7a; splitting them is a new registration. F2 on real inputs still fails rule 2 |
| Closes at one or two of them | Weather accounts for the tail at those leads only; every bound's movement is reported | The forecast for those leads; the rest stays open |
| Leaves it at all three | Knowing the daily rows exactly does not close the tail: as-issued daily weather is not the main cause | Elsewhere, ranked by the accounting below |
| C3's p95 interval wholly above 0 at any of days 1-3 (overrides "leaves") | The observed daily rows make the tail worse than the forecast rows, so weather is not cleared | How the inputs are represented: daily Ap over a whole storm day, the 231.8 sfu row. Question 2's arm is the next test, not the forecast |

Then the accounting says where a tail M leaves comes from:
- Worst windows whose arc spans a storm, with M unchanged there: the fit's B under daily Ap, or NRLMSISE-00's storm response. F2H is
  the next test.
- Worst windows with no storm contact: not weather. The fit, an unmodeled maneuver or the truth.
- At least 50 % of F2's worst also P's worst: a shared cause, such as a maneuver or a hard week, not FFM's. At most 15 %: specific to
  F2. Between: mixed.
- C5 under O below 1.10 at days 1-3: one week's cutoffs carry the tail. Cutoffs of W03 whose horizon crosses the storm stay in, so
  this is not "without the storm". Above 1.10 at any of them: the tail is broader than that week.

## Question 2 (answered from the source at modules 9a05d899b, before any score)

The module does not accept it, so F2H is not run; a module change needs the coordinator's GO and its own registration.
- `propagator/ffm/lib/astrodynamics.cpp:4732-4734` sets every switch to 1, switch 9 included; `:4754` `msisInput.ap = weather.Ap`;
  `:4755` `msisInput.ap_a = nullptr`. F2's drag and its density gradient both reach it (`lib/force_models.cpp:695`,
  `lib/force_partials.cpp:262`).
- `propagator/ffm/src/cpp/include/ffm/prw_environment.h:115` holds apDaily and kp[8] per day; `:128` reads AP_AVG alone; `:142` sets
  `out.Ap`. AP1 to AP8 are never read.
- The $SPW path carries them: `schema/SPW/main.fbs:61-82`, filled by `data-source/space-weather/src/space_weather.cpp:178`. XM's rows
  and XM3's encoder stop at AP_AVG (`experiments/xp-atmosphere-merit/lib/weather.mjs:24,131`,
  `experiments/ffm-atmosphere-xm3/lib/ffm.mjs:122`).

## Integrity

XM3's cuts, unchanged: C2's time cut and held-out objects, ISS out, no laser spheres, GPCV P0's truth span. Never read: C2's held-out
row files, B2 part 1a and part 5 files, census results, operator-capture content, C3-small's rows. No tuning on scored windows.

## Reproduction

- All fitting and propagation are WASM module calls; JavaScript moves FlatBuffers and does the statistics.
- The registration and the runner are commits on origin `wip/experiments-ffm-tail-cause-20261031/*`, built on origin/main so they hold only this
  experiment's files; the guards compare the working files with those commits' blobs until the experiment is on main.
- `experiments/ffm-atmosphere-xm3` at 22313bf and XM's code at 2c7b326 imported unchanged, checked by `git diff --quiet`. Wasm by XM3's
  `pinned()`: `git show` at modules 9a05d899b, SHA-256 checked (propagator/ffm 2.0.4 c36f1b14, analysis/estimation 0.7.0 7a555ca5).
- XM3's rows checked against digest 1af3adb87236; its table read by `git show 22313bf`, SHA-256 31232c03c8dd.
- E2E (`node experiments/ffm-tail-cause/run.mjs --check`): P|39452|2026-01-20, S1|39634|2026-03-10 and P|43476|2026-02-13 rerun under M
  and compared exactly with the stored rows; P|39452|2026-03-10 rerun under O against XM3's row; the table rebuilt equal to the
  committed table.json.

## Expected cost (owner Mac Studio)

From XM3's stored F2 timing on these windows: 11.9 worker-hours. A fit is a median 3 rounds (at most 21), each one propagator/ffm run of
72 h at RK78 (relative tolerance 1e-10, absolute 1e-7 m and m/s, initial step 60 s, steps up to 120 s, so at least 2,160 steps) with the
8 x 8 STM, output at the 864 arc states (300 s). A forecast is 10 days at the same settings (at least 7,200 steps), no STM, output at the
1,152 scored epochs (300 s). With reading and scoring, about 12.2 worker-hours: about 1.5 h on 8 workers. About 5 MB on disk.
