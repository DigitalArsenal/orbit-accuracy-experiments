# XM-fast: does our AP XP with NRLMSISE-00 beat public SGP4 on precise LEO truth?

Registered 2026-10-30, before any score, under task `experiments-xp-atmosphere-merit-20261030`. It revives XM
(`experiments-xp-atmosphere-merit-20261026`, commit 8f29261, never frozen) and keeps XM's fit settings unchanged.
`config.json` and `build.json` beside this file are part of the registration. Nothing here changes after this
commit; a change before the first score is a dated amendment at the end, and a change after it is labeled exploratory.

## Question

The owner, 2026-10-30, verbatim: "I want using SGP4-XP to be the default on console IF we can verify that it beats
SGP4." "I want better fits for us!  I want our new atmospheric model to beat SGP4, which it should with truth / owner
operator data." "OK but I want to use our AP version of XP that substitutes NRLSEIM for Jacchia Rogbertgs"

Primary: does X2 beat P on independent precise LEO truth? Secondary: X2 against X0 (the atmosphere's own effect, drag
groups only), and X3 against P and X0.

## What a pass means

- The X arms fit truth-quality precise products over the 72 h before the cutoff. Those products are not real-time;
  P is the public set available at the cutoff.
- So a pass answers the owner's theory-and-atmosphere question ("with truth / owner operator data"). It does not answer
  the console supply question; operator files (H2 in the program plan) answer that.
- The GN group is a control: above the drag-free altitude X2 must equal X0 bit for bit.

## Arms

| Arm | What | Inputs |
| --- | --- | --- |
| X0 | propagator/sdn-ap SGP4XP as published: Jacchia 1970 on the generic flux model | none |
| X2 | SGP4XP with `$PCF` FORCES ENABLE_DRAG true, ATMOSPHERE_MODEL NRLMSISE00, WEATHER_SOURCE RECORDS, WEATHER_EXTENSION HOLD_LAST (the candidate) | `$SPW` rows |
| X3 | X2 with DENSITY_CORRECTION DCA_COMMON_MODE: NRLMSISE-00 times the open-DCA common mode (secondary) | rows, `$DCL` |
| P | the newest public Space-Track set (by EPOCH) with EPOCH and CREATION_DATE at or before the cutoff, under the console's SGP4: propagator/sgp4 (foundation/sgp4-str3, AFSPC mode) | the set |

Every X arm is fitted and propagated with the same `$PCF` and inputs. X1 of XM (Jacchia 1970 on rows) is not run.

## Fit (XM's settings, fixed)

- propagator/sdn-ap `fit`, THEORY SGP4XP. FIT.DRAG_PRIOR LOG_NORMAL, MEAN 0.01 m^2/kg (the median of BTERM), SIGMA ln 10
  (the standard deviation of ln BTERM). FIT.SRP_PRIOR GAUSSIAN_SIGNED 0.01 m^2/kg, sigma 1e-9: AGOM is held at 0.01.
  Every other FIT field at its `$PCF` default.
- Arcs: 72 h (primary) and 24 h (secondary) of the truth ending at the cutoff, REFERENCE_FRAME GCRF,
  USEABLE_START_TIME the arc's first state, USEABLE_STOP_TIME the cutoff. The set's epoch is the arc's first state.
- The arc's states thinned to every round(300 / step)-th state of the product's own grid (G1). An arc holding less than
  90 % of its states (arc hours x 3600 / the product's step) is not fitted; the window leaves that arc's cells, counted.
- No tuning on scored windows: nothing in the fit is chosen after this commit.

## Conditions

- O (primary, as issued). Rows from the most recent NOAA SWPC RSGA issued at or before the cutoff (at most 72 h old),
  with GFZ observed F10.7 and definitive Ap before it, the trailing 81-day mean, the last row held (lib/weather.mjs
  rowsO, XM's ruling 19). X3 takes the open-DCA nowcast issued at the cutoff (6 h latency, 30-day causal history, 48 h
  forecast decay, held beyond its nodes). A cutoff with no RSGA in force is excluded from O and counted: 2026-01-01
  (no December 2025 RSGA outside the 2025 archive tarball, which the reader does not open).
- M (sensitivity). Observed F10.7 and definitive Ap through the horizon with the true centered mean (rowsM); X3 takes the
  hindcast issued at cutoff + 174 h (7 d + the latency), every arc through the day-7 horizon.

## Groups, clusters, windows

Cutoffs at 00:00 UTC of every day 2026-01-01 to 2026-05-31 (151), one period for every group (integrity cut 2).

| Group | Objects (orbit-group cluster) | Truth | Windows expected (72 h arc, from file spans) |
| --- | --- | --- | --- |
| P, primary | Swarm A and C (one cluster), Swarm B, GRACE-FO 1 and 2 (one cluster) | ESA SP3 COM 10 s; GFZ ISDC RSO 30 s (converted by convert.mjs on 2026-10-26) | 755 |
| S1, secondary | Sentinel-1A and 1C (one cluster) | Copernicus POEORB 10 s | 272 (262 per lead) |
| GN, control | G053, G073, E218, R743, R859 (one cluster each) | ESA0OPSFIN 5 min | 752 |

Satellites that share an orbit form one cluster: they share their density error, so treating them as independent
would narrow the intervals. The per-satellite clustering is a sensitivity only.

## Integrity cuts (each verified at its source; see config.json `integrity`)

1. C2's held-out objects are out entirely (C2 config split.heldOutObject; Galileo by P9): TerraSAR-X, Sentinel-1D, Stella.
2. C2's calibration objects have no cutoff on or after 2026-06-01 (C2 PLAN.md:144). XM's objects among them: Swarm A/B/C,
   GRACE-FO 1/2, Sentinel-1A/1C, R743 and R859. Every group ends at the 2026-05-31 cutoff.
3. The ISS is out: C2 holds it out for 2025-01-01..2026-10-31.
4. No laser-sphere group: XM's window (2026-07-16..08-30) is C2's type-L hold-out.
5. GPCV P0: Swarm and GRACE-FO truth is read only in 2025-12-28..2026-06-08, none in 10-31..11-28.
6. Never read: C2's held-out row files, B2 part 1a and part 5 files, propagator-catalog-census results, operator-capture
   cycle content.

## Scoring

- Grid: the truth's epochs in (cutoff, cutoff + 7 d] whose offset from the first of them is a whole multiple of 300 s.
  Lead day k is (cutoff + (k - 1) d, cutoff + k d], k = 1, 2, 3, 7. A bin enters when the truth holds at least 260 of its
  288 grid epochs, decided by the truth alone.
- Every arm is propagated to the entered bins' epochs: X arms by propagator/sdn-ap `propagate` at the explicit epochs; P by
  propagator/sgp4 `propagate_ephemeris` from the first to the last scored epoch at 300 s. Both in TEME, then to GCRF by
  foundation/frames, the same path for every arm.
- e: the 3D RMS position error of the bin (km) in the truth's RTN axes, by G1's rtnSeries (analysis/gp-error-model
  pair_statistics); the along-track RMS beside it.
- A fit failure, refusal, or a non-finite state at a scored epoch fails the arm in every bin of that window. A failure
  is a loss, never dropped.

## Decision rule (the XD memo's form)

Pairs: per group, arc, condition, contrast and lead, the windows whose bin entered and whose reference arm was
attempted. A window without a public set at or before the cutoff leaves P's pairs, counted. d = ln(e_X2 / e_P); X2
failed: d = +Infinity; else P failed: d = -Infinity (P's loss).

**X2 beats P in a group only if every lead cell (1, 2, 3, 7; 72 h arc, condition O) meets all three:**
1. the 95 % cluster-bootstrap interval of the median d lies wholly below 0;
2. the upper bound of the 95 % interval of ln(p95 of e_X2 / p95 of e_P) is below ln 1.10;
3. X2 fails on at most 1 % of the pairs.

The same form gives X2 against X0 (groups P and S1 only), X3 against P and X3 against X0 (P and S1). Condition M, the
24 h arc and per-satellite clusters are sensitivities with the same form, never the verdict. No pooling across groups.

GN control: X2 and X3 equal X0 bit for bit (every propagated coordinate at every scored epoch) in every GN window. A
difference is a software defect: the run stops and the defect is reported.

## Statistics

Cluster bootstrap: the unit is orbit group x ISO week of the cutoff; 10,000 draws of the cell's clusters with
replacement; the median d and ln(p95 ratio) of each draw's pooled pairs; percentile intervals (2.5 %, 97.5 %).
xorshift128+ (XA's generator) seeded by SHA-256 of `XM-fast|<group>|<arc>|<condition>|<arm>/<ref>|<lead>|<clusters>`.
A NaN statistic counts as +Infinity (against the arm). Reported beside each cell: pairs, clusters, failures of each arm,
the median e of each arm, the median along-track RMS of each arm, the median ratio as a percentage.

## Reproduction

- All fitting and propagation are WASM module calls; JavaScript moves FlatBuffers and does the statistics.
- The modules are those of `build.json`: every wasm read with `git show` at the registered modules commit and SHA-256
  checked. Space-Track, Planet and truth states stay in the local store; results are aggregates.
- E2E (`node experiments/xp-atmosphere-merit/run.mjs --check`): the pinned windows of config.json `check` re-run and
  every stored number compared exactly; the table rebuilt from the stored rows equal to the committed table.json.

## Changes from XM's design (before any score)

The P arm (propagator/sgp4) and the decision rule above replace XM's X3/X0 primary contrast and moving-block bootstrap.
Leads add day 7; M's hindcast moves from + 78 h to + 174 h to cover it. X1, the ISS, laser-sphere and TerraSAR-X windows,
the density probe and the maneuver-screening sensitivity are not run. Cutoffs end 2026-05-31.
