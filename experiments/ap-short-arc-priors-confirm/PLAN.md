# Registered confirmation: the sdn-ap 0.4.7 short-arc AGOM prior on unread 24 h windows

Registered 2026-11-03 under task `experiments-ap-short-arc-priors-confirm-20261103`, before any window of this task was fitted or scored. `config.json` beside this file holds the same numbers for the code and is frozen with it. `lib/confirm-runner.mjs`, `run.mjs`, `run.sh`, `table.mjs` and `check.mjs` are part of the registration: they are committed after this file and before the first scored row, and every row's manifest records their SHA-256 and the commit that holds them. The runner is a fork of `ap-heo-frame-confirm/lib/confirm-runner.mjs` (that task's manifests hash the original) with two added truth readers; the statistics and the check are that task's `lib/table-lib.mjs` and `lib/check-lib.mjs`.

## Question

sdn-ap 0.4.7 (modules `dcae63613`) gives a fit interval under 36 h the Space Force AGOM prior, Gaussian 0 +- 0.1 m^2/kg, when `SRP_PRIOR` is unset; 36 h and longer keep 0 +- 0.05. On AP5's GNSS windows (24 h fits, five satellites, 2026-01-01 to 05-31; read, exploratory) the median paired day-3 error of whiteroom XP less Space Force XP went from +56.107 m to -4.097 m (n 748); 72 h fits are unchanged. Not measured there: AP fits on 24 h GNSS arcs, LEO 24 h arcs, and the 24 h span an eccentric orbit gets by default. Does the gain hold on GNSS windows never read, and does the prior leave AP and the LEO and eccentric 24 h fits where they were?

## Builds

Pinned by the SHA-256 of the wasm as `git show` gives it at the modules commit. The runner refuses any file that differs.

| Name | sdn-ap | Modules commit | SHA-256 |
|---|---|---|---|
| `A45`, `X45` | 0.4.5 | `c1d5d218b16f5bbb3ea184582f3c08fddd81657a` | `04169197971b5e15db8b7a7762e7cb4500a5d43617be60d0e8f6aaf99d287360` |
| `AP`, `XP` | 0.4.7 | `dcae6361375f0af27dc82859e29c5632df8af401` | `c2bf019f84e5fb35af052723d45ff12a41e25ee1126fea13cbb0459ac02e177f` |

Space Force XP (`U`): `propagator/sgp4-xp` wasm `f61b15c4fd658817e3e43c7818da18c4d08d453ad28e9d704b0cd11b616b7deb`. The harness is AP5's and AP6's (truth, 300 s grid, 90 % coverage rule, lead bins, scoring by `gp-error-model` in the truth's RTN axes), its libraries hashed in `config.json` `sources`.

## Arms

All fits are 24 h ending at the cutoff, read nothing after it, and are scored on days 1, 3 and 7 from the fit's end.

- `AP`: 0.4.7 with `FORCES` tesseral 31, zonal 20, NRLMSISE-00 on as-issued weather (no atmosphere and no weather in the vacuum group HC). `A45` is the same settings on 0.4.5.
- `XP`: the whiteroom XP, 0.4.7 with `FORCES` and `FIT` unset. `X45` is the same on 0.4.5: the fitter before the prior.
- `U`: Space Force XP, fitted and flown by `propagator/sgp4-xp`, on GNSS and the control only.

## Windows

Unread means no (object, cutoff) pair has been fitted or scored by any AP, XP or Space Force XP arm at any build. The truth products themselves were read by other tests; the disclosure is below.

| Group | Truth | Objects | Cutoffs (00:00 UTC) |
|---|---|---|---|
| `NG` | ESA final orbits | every GPS satellite with files | every 5 days, 2025-07-04 to 12-16 (34) |
| `NR` | ESA final orbits | every GLONASS satellite with files | every 5 days, 2025-07-04 to 12-16 (34) |
| `NE` | ESA final orbits | every Galileo satellite with files, the six held excluded | every 5 days, 2025-07-04 to 12-16 (34) |
| `S1` | Copernicus POEORB | Sentinel-1A, Sentinel-1C | every 3 days, 2025-10-04 to 12-18 (26) |
| `LS` | NSGF orbits | Ajisai, Starlette, WESTPAC, LARES, Larets | every 5 days, 2026-03-20 to 05-24 (14) |
| `DO` | CNES DORIS orbits | Jason-3, Sentinel-3A, 3B, 6A, 6B, SARAL, SWOT, CryoSat-2, HY-2C, HY-2D | every 5 days, 2026-03-20 to 05-24 (14) |
| `HC` | Chandra, NAIF merged kernel, weekly segments | Chandra (eccentric: perigee near 16,000 km, apogee near 133,000 km) | every 2 days, 2018-10-18 to 2019-01-10 (43) |

The eccentric group is Chandra alone; TESS's windows are the sibling task's. GNSS is the three constellations with ESA files, 2025-07 to 12, after AP5's 2026-01-01 to 05-31 and before C2's hold-out. The windows of `ap-heo-frame-confirm` (GNSS 2025-01-08 to 07-02; LS, DO 2026-01-08 to 03-16; Chandra 2014-12 to 2015-08) share no truth with these.

Control, read, report only: `GNr`, AP5's five GNSS satellites (NORAD 28874, 41019, 43058, 37869, 44850), daily cutoffs 2026-01-01 to 05-24 (the module's 748 windows ran to 05-31; the last week is dropped to keep C2's hold-out unread), arms `XP`, `X45`, `U`.

## Holds

No Swarm or GRACE-FO truth is read. Held by object, all dates: the six held Galileo satellites (NORAD 43567, 37847, 41862, 41174, 43055, 41175), TerraSAR-X, Sentinel-1D, Stella, LAGEOS-1. C2's time hold-out: no group scores truth on or after 2026-06-01; the runner refuses a window whose day 7 passes it. No C2 rows, no operator capture, no Starlink, no restricted path, no network fetch.

## Statements

Per window the paired error is the 3D RMS of the bin (km), `e`. Cluster bootstrap: ISO week of the cutoff, 10,000 draws, seed from SHA-256, 95 % percentile interval. A window whose arm fails for coverage leaves the statement. In G2 and G3 a failed `AP` or `XP` fit counts as a loss (+infinity), as in AP5; anywhere else a failed arm leaves the window. All are counted and printed. The verdict is the point criterion; the interval and whether it lies wholly inside the criterion are printed with it.

1. **G1.** Pooled GPS, GLONASS and Galileo, day 3: (a) the median over windows of `XP` less `U` is within 10 m of zero, and (b) the gain against the 0.4.5 fitter, median(`X45` less `U`) less median(`XP` less `U`), is at least 29 m. Both must hold. The read result was a gain of 60.204 m; 29 m is its half.
2. **G2.** For GPS, GLONASS, Galileo, the three pooled, Sentinel-1, LS, DO and Chandra, days 1, 3 and 7: the median over windows of e(`AP`) / e(`A45`) is at most 1.05.
3. **G3.** For Sentinel-1, LS, DO and Chandra, days 1, 3 and 7: the same for e(`XP`) / e(`X45`).

Report only: G1 for each constellation alone; the control `GNr` against the module's +56.107 m and -4.097 m; `AP`, `A45`, `XP` and `X45` each less `U` on GNSS; `XP` less `X45` and `AP` less `A45` on GNSS; medians and 95th percentiles of every arm by group and day.

## Already read

AP5 and XM read GNSS (five satellites), Swarm, GRACE-FO and Sentinel-1 for 2026-01 to 05 with XP and AP; AP6 and the 2026-11-03 gap diagnosis read LS, DO, GD, IG, GE for 2025-10 to 12, TESS 2026-07 to 09, THEMIS 2013-02 and Chandra 2018-03 to 04; the 0.4.7 prior was measured on AP5's GNSS windows. None of the windows above was fitted or scored by an AP, XP or Space Force XP arm. The ESA final, POEORB, NSGF, DORIS and NAIF products were read by earlier tests with element sets, FFM and the old SDN-AP theory on other windows; C2's SGP4-XP fits are on Swarm, GRACE-FO, COSMIC-2, the ISS and the type-L spheres. This lane smoke-tested its runner on read windows only (Sentinel-1A and 1C 2026-02-03 and G053 and G073 2026-02-03 against AP5's stored rows with the 0.4.0 wasm, to the last digit). No unread window was read.

## Limits

- Every fit reads precise products published after the fact.
- GNSS is the statement; the LEO and eccentric groups are non-regression checks of one prior, not accuracy claims. Chandra is one orbit.
- A 24 h fit of a 63.5 h orbit covers a fraction of a revolution: HC measures the default span, not a good fit.
- The control runs cutoffs to 2026-05-24 where the module's ran to 05-31, so it will not reproduce the module's figures to the digit.

No arm, window, margin or rule changes after this registration. A deviation is an amendment section at the end of this file, dated, with its reason, and is reported with the results.

## Amendments

1. 2026-11-03, before any window of this task was fitted or scored: the runner fork also carries the fix of `ap-heo-frame-confirm`'s amendment 1 (a kernel sampled less often than the 300 s grid keeps every state; one at the grid or faster keeps the lattice as before). Nothing else of the registration changes.
