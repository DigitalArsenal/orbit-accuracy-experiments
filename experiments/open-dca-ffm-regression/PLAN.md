# XM4: in the path the console flies, does the open DCA predict closer than NRLMSISE-00 alone?

Registered 2026-10-31 (UTC), before any score, under task `experiments-open-dca-ffm-regression-20261031`. XM4 takes XM3's windows,
truth, clusters, leads and scorer (experiments 22313bf; registration c56dbd1; Amendment 1 ee2a513; `experiments/ffm-atmosphere-xm3`)
and flies new arms with no fit, as the console flies FFM-1. `config.json` and `build.json` beside this file are part of the
registration. Nothing here changes after this commit; a change before the first score is a dated amendment at the end, and a change
after it is labeled exploratory.

The task record's title names an older diagnosis of the open DCA in fits. That diagnosis lives in an internal report; this registration
tests the console path. This commit is built on origin/main 22313bf and pushed to
`wip/experiments-open-dca-ffm-regression-20261031/registration`, because local main carries another lane's unlanded commits.

## Question

The owner, verbatim, 2026-10-30: "We should be using teh open DCA density feed right now". 2026-10-31: "something is very wrong with
our methodology or the data, that should not be the case".

The console's FFM-1 mode flies NRLMSISE-00 x exp(s(t)) from the newest `$DCL` record, with no age check. SGP4 stays the console
default. No experiment has tested that path with `$DCL`.

Primary: in group P, does K2 (FFM-1 with the open DCA, read as the console reads it) predict closer than K1 (FFM-1 with NRLMSISE-00
alone)? Secondary: does FFM-1 as flown (K1, K2) predict closer than the public set under SGP4 (P)? The same contrasts in group S1.

## What a pass means

- A pass tests K2's effect on this path for these two groups. It does not make FFM-1 or the DCA the default.
- K2 against K1 reads per lead: the interval of the median d wholly below 0 is a gain at that lead, wholly above 0 is harm, and an
  interval that holds 0 is no detectable effect. "Beats" needs every lead and all three rules.
- Not a fit. The F arms of XM2 and XM3 fit 72 h of precise truth and a free B absorbs s's level. Here nothing absorbs it, so a finding
  from those fits may not transfer in either direction.
- K3 is the null. If K2 and K3 gain alike, the gain comes from the level of exp(s) against a wrong B, not from what the record knows
  about that date.

## What decides what

The coordinator takes K2 against K1 to the owner as the evidence for keeping or removing the DCA from FFM-1. XM4 decides nothing by
itself. SGP4 stays the console default whatever XM4 finds.

## Previously analyzed windows (disclosure)

- These windows were scored for the F, X and P arms in XM, XM2 and XM3. Every cell is published. The registrants have read them.
- The `$DCL` defects are already known. An internal diagnosis on these windows found defects in how current the record is at a
  00:00 UTC cutoff. Its statistics are Planet-derived and stay internal; none is used or quoted here. It is the reason K3 and the
  report-only ISO-week clusters exist. The refusals of 2026-04-09 and 04-10 are public in XM2 and XM3.
- The K arms have never been scored. Before this commit K1 and K2 were flown on XM3's smoke window only (Swarm A, cutoff 2025-12-31,
  outside the period), with no truth after its cutoff and no score, to measure cost and check the equivalences below.
- So XM4 is a new path on known windows, not a fresh sample.

## Known before any score

- K1, K2 and K3 differ only in the `$DCL` frame the module takes. On the smoke window K2 and K1 differ by 0.29, 2.1 and 9.5 km at the
  ends of days 1, 3 and 7.
- V1c (`results/v1c`, public) measured the console's SGP4-seeded FFM-1 against SGP4 alone on E3's test inputs. LEO 400-800 km, median:
  6.45 km against 0.61 km at 24 h, 19.5 km against 0.78 km at 72 h, with no `$DCL`. K1 against P is expected to lose.
- The seed's error is common to K1, K2 and K3, and it grows with time. The K2 against K1 contrast measures s on top of it.
- B from B*: the console's mapping gives B well below C2's seed from published area and mass. Median ratio over the windows' sets:
  0.32 to 0.47 in group P, 0.06 in S1. B* is zero or negative in 38 and 18 of 151 Sentinel-1A and 1C windows; those fly 0.01 m^2/kg.

## The path as flown (console code)

Lines at spaceaware-ui 3643d429, OrbPro 8d815e2246 and modules 9a05d899b.

| Step | As the console does it | Where |
| --- | --- | --- |
| Start epoch | the sim time; here the cutoff | sdn-js/spaceaware-ui `engine/catalogPropagation.ts:204-205`, `:235-236` |
| Seed | SGP4 at that time: `propagateAllStateVectors` -> `plugin_propagate_batch` -> `plugin_propagate`; TEME to Earth-fixed by GMST (IAU 82) of the UTC Julian date, no UT1-UTC and no polar motion | `catalogPropagation.ts:129`, OrbPro `propagator.sgp4/index.js:3410`, modules `propagator/sgp4/src/cpp/src/sgp4_plugin.cpp:1756-1784,3744,3777-3788` |
| Into GCRF | that state is read as ITRF and taken to GCRF with the catalog's Earth orientation | `plugin_init_states_ecef`, `propagator/ffm/src/ffm_plugin.cpp:1717-1747` |
| B | the OMM's B*: Cd A/m = 2 B* / 0.15696615 m^2/kg; B* <= 0 flies 0.01 | OrbPro `propagator.ffm/catalogConfiguration.js:185-192`, `ffm_plugin.cpp:1299-1300,3245-3248` |
| AGOM | Cr A/m = 0.02 m^2/kg, every object | `ffm_plugin.cpp:1300` |
| Forces | FFM-1 as `fullForceRequest` sets it with no `catalogForces`: EGM2008 70 x 70; Sun, Moon, Venus, Mars, Jupiter from the kernel; cannonball radiation pressure with the conical shadow; Knocke Earth radiation at 15 degrees; NRLMSISE-00; IERS 2010 solid tides; FES2004 ocean tides 30 x 30; IERS 2010 relativity. The module must report profile FFM-1 | `catalogConfiguration.js:116-121`, `propagator/ffm/catalog-configuration.mjs:59-85`, `catalogPropagation.ts:221-243,250` |
| Integrator | resident: GJ8 PEC on the TT grid by perigee (below 450 km 15 s, 450-650 km 12 s, above 24 s); RK78 startup, relative 1e-14, absolute 1e-11 m and m/s, initial 30 s, minimum 0.01 s, maximum 120 s; 300 s Chebyshev segments | `catalog-configuration.mjs:30`, `propagator/ffm/lib/ffm_run.h:33-41` |
| Space weather | every row of the lane's current batch, by DATE; F10.7 of day d - 1, CENTER81 and Ap of day d; Kp unread (winds off) | `data/ffmEnvironment.ts:271-277`, `prw_environment.h:113-146` |
| `$DCL` | the current batch's newest record by CREATED_AT_MS. No age check, no refusal; a refused issue publishes nothing, so the older record stays newest | `ffmEnvironment.ts:209-236`, `catalogPropagation.ts:242` |
| s(t) | linear in UTC between nodes, held outside them; no further decay | `propagator/ffm/src/cpp/include/ffm/density_correction.h:60-61` |

The calls, in the shard worker's order (OrbPro `propagator.ffm/ffmFrameWorker.js`): `plugin_init`, `plugin_configure_catalog`,
`plugin_set_grid_stagger(1)`, `plugin_set_ephemeris_retention(0.02)`, `plugin_init_states_ecef`, `plugin_set_visibility_mask`, then
`plugin_ensure_coverage` before each read. XM4 reads `plugin_eval_catalog_states_gcrf` at the scored epochs: the same prepared
segments the console's `plugin_eval_states` turns to Earth-fixed, with no frame added to the score.

Checks made on XM3's smoke window before this commit, repeated by `--smoke` (no truth, no score):
- the records XM4 frames are byte-identical (SHA-256, 32,733,472 bytes) to OrbPro's own `prepareCatalogConfiguration` on the same
  inputs, K2's record included;
- reads at the scored bins only and at every 300 s give the same state at all 1,152 scored epochs (difference 0);
- one object alone and two objects in one shard give the same state at all 1,152 scored epochs (difference 0);
- FFM 2.0.3 (6fdc5309, the previous pin) and 2.0.4 (c36f1b14) give the same states on K2's records (difference 0);
- the console's SGP4 bytes (browser-shared 49e26b46) and the bytes P and the seeds use (isomorphic 2fe246b7) give the same Earth-fixed
  seed on four objects (difference 0).

## Arms

| Arm | What | Role |
| --- | --- | --- |
| K1 | FFM-1 as flown, NRLMSISE-00 alone, rows L | the reference of the primary |
| K2 | K1 with the `$DCL` read as the console reads it | the candidate |
| K3 | K2 with another date's record | report only, the null |
| P | the public set under the console's SGP4, rerun with XM's code at 2c7b326, required equal to XM3's stored row | baseline |
| K1o, K2o | K1 and K2 on rows O | report only |
| K1h, K2h | K1 and K2 on rows H | report only |

- K arms share one seed, one B and one AGOM per window; only the listed input differs.
- **The record K2 reads at cutoff D0:** the newest record issued at 00:00 UTC of a day at or before D0 that was not refused, from XM's
  cached `$DCL` answers (XM lib/dca.mjs: analysis/density-calibration, E13's frozen method on the archived arcs). So 2026-04-09 and
  04-10 fly the record of 04-08 held; this counts as flown, not as a failure. XM's cache holds the module's bytes without a size prefix; the catalog path takes the published
  size-prefixed form, so each record is re-framed by the SDS bindings with every field equal (checked).
- **K3's record:** Q is D0 + 20 d when that is in the period, else D0 - 20 d. K3 takes the record K2 reads at Q and moves its node
  times by D0 - Q, values unchanged.
- A refused configuration, a refused or failed coverage call, a state the module leaves zero or a non-finite state fails that arm in
  every bin of that window: a loss (rule 3), never dropped.

## Inputs: as issued, and not

| Input | Taken as | As issued? |
| --- | --- | --- |
| Public set | XM's: the newest by EPOCH with EPOCH and CREATION_DATE at or before the cutoff | Yes. The console's own catalog latency is not modeled. |
| `$DCL` | XM's cache, as above | Replayed. The lane began publishing in 2026-10, so no published record exists for these windows. An issue at the cutoff is the freshest record a daily lane can hold; the lane's own record can be up to 24 h older. |
| Daily F10.7 and Ap | XM's rowsO with XM3's drivers: GFZ, then the RSGA in force, held after its last predicted day through D0 + 8; A1's fill | Yes, but a different source past D0 + 2. The lane uses NOAA's 45-day forecast, which the archive does not hold for these dates. |
| F10.7a (CENTER81) | rows L: the mean over the day and 40 days each side, the lane's rule (`data-source/space-weather/src/space_weather.cpp:31-32`), over the as-issued series above, with the held value standing in for the 45-day forecast | Causal. The lane's series differs past D0 + 2. |
| Earth orientation | B1's finals, XM3's | No: final values, XM3's disclosure. The lane's as-issued USNO editions are not archived for these dates. Effect at 7 days: meters against errors of kilometers. |
| Kernel | DE440s, XM3's file | The console reads the NAIF lane's decade shard of DE440s; not compared byte for byte. |

**Why rows L and not XM3's rows O (the coordinator's ruling, 2026-10-31, before any score).** XM's rowsO carries one trailing 81-day mean for every row. The lane publishes a centered mean, and
E13 solved s against a centered mean. Over the period the trailing mean minus the as-issued centered mean has median +6.8 sfu and
p5 to p95 -12.4 to +25.1 sfu. At sample Swarm B and GRACE-FO seeds the module's drag on O against L is 0.85 to 1.28. A fit absorbs
that level. The console has no fit, so on this path it is as large as s. K1o and K2o report what rows O give.

**Rows H** take the same daily values with the centered mean over GFZ's later file: not causal, reported as the other bound of what a
45-day forecast could give.

## Groups, windows, truth, scoring (XM3's)

Cutoffs at 00:00 UTC of every day 2026-01-01 to 2026-05-31. Group P (Swarm A and C one cluster, Swarm B, GRACE-FO 1 and 2 one cluster)
and group S1 (Sentinel-1A and 1C). Windows out of condition O (cutoff 2026-01-01) and S1's 30 windows below XM3's arc coverage stay
out, counted, so each K cell pairs the windows of XM3's F2 against P cell: 750 in P, 270 in S1. Lead bins 1, 2, 3 and 7; at least 260
of 288 grid epochs at 300 s; e is the 3D RMS position error of the bin in the truth's RTN axes by analysis/gp-error-model, the
along-track RMS beside it; every arm against the same GCRF truth at the same epochs. Integrity cuts: XM3's, unchanged, and C3-small's
rows are never read.

## Decision rule (XM3's)

d = ln(e_arm / e_ref); arm failed: +Infinity; else reference failed: -Infinity. An arm beats its reference in a group only if every lead
cell (1, 2, 3, 7) meets all three:
1. the 95 % cluster-bootstrap interval of the median d lies wholly below 0;
2. the upper bound of the 95 % interval of ln(p95 of e_arm / p95 of e_ref) is below ln 1.10;
3. the arm fails on at most 1 % of the pairs.

Primary: K2 against K1 in group P. Secondary: K1 against P and K2 against P in group P; the same three in S1. No pooling across groups.

## Statistics (XM3's)

Cluster bootstrap, 10,000 draws, percentile intervals, xorshift128+ seeded by SHA-256 of `XM4|<group>|O|<arm>/<ref>|<lead>|<clusters>`.
Registered clusters: orbit group x ISO week. Beside every cell, report only: ISO-week clusters. Reported per cell: pairs, clusters,
failures, median e and along-track RMS of each arm, the median ratio as a percentage.

## Report only (decides nothing)

- K3 against K1 and K2 against K3.
- K1o, K2o, K1h and K2h: K2 against K1 and each against P on rows O and rows H.
- XM3's F3 against F2 and F2 against P beside K2 against K1 and K1 against P (its committed table, SHA-256 checked).
- The windows that flew an older record, B* zero or below, and the B distribution.

## Reproduction

- All propagation is WASM module calls; JavaScript moves FlatBuffers, means daily values and does the statistics.
- `build.json`: modules 9a05d899b as XM3. Wasm by `git show`, SHA-256 checked: propagator/ffm 2.0.4 c36f1b14, propagator/sgp4 1.4.1
  2fe246b7. The console's chain today: stack origin/main pins OrbPro 8d815e2246, which pins modules 9a05d899b, whose FFM OrbPro
  packages unchanged (`dist/isomorphic/module.wasm`): c36f1b14, the bytes XM4 flies. The deployed release's plaintext cannot be read
  from here.
- XM's code (2c7b326) imported unchanged. P is rerun in every window and compared with XM3's stored row; a difference is a software
  defect and stops the run.
- Registration guard: `frozen()` compares PLAN.md, config.json, build.json and the run's sources with their blobs at HEAD, or at the
  commit named by `XM4_GUARD_REF` while this work stays on the wip branch.
- Smoke before the first scored window: the checks above. E2E (`node experiments/open-dca-ffm-regression/run.mjs --check`): the pinned
  windows P|39452|2026-03-10, S1|39634|2026-03-10 and P|39451|2026-04-09 (K2 on the held record of 04-08) re-run and every stored
  number compared exactly; the table rebuilt from the stored rows equal to the committed table.json. Rows stay local; nothing from
  Planet states enters a commit.

## Expected cost (owner Mac Studio, one-minute load 26 on 28 logical CPUs)

One K arm of 7 days: GJ8 PEC at 12 to 24 s, RK78 startup at relative 1e-14 and absolute 1e-11 m and m/s, 300 s Chebyshev segments,
1,152 outputs at 300 s: 0.13 s setup and 0.55 s coverage and reads. P: SGP4 to 7 days at 300 s 0.02 s, TEME to GCRF 0.34 s. One scoring
0.08 s. Seven K arms and P: about 6 s per window, 1.7 worker-hours, about 15 min on 8 workers. Store about 0.02 GB.
