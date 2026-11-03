# Registered confirmation: the sdn-ap 0.4.6 frame fix on unread highly elliptical windows

Registered 2026-11-03 under task `experiments-ap-heo-frame-confirm-20261103`, before any unread window was fitted or scored. `config.json` beside this file holds the same numbers for the code and is frozen with it. `lib/confirm-runner.mjs`, `lib/cutoffs.mjs`, `lib/table-lib.mjs`, `run.mjs`, `run.sh`, `table.mjs` and `check.mjs` are part of the registration: they are committed after this file and before the first scored row, and every row's manifest records their SHA-256 and the commit that holds them.

## Question

sdn-ap 0.4.6 (modules `8a5a9df96`) keeps the native TEME-of-date convention in the nonresonant long-period branch (epoch period of at least 1100 minutes) instead of rotating its states from the epoch axes. On AP6's seven TESS windows (read, exploratory) the paired day-3 AP less XP went from +420.105792 m to -0.000784 m. Does it hold on windows never read, and does the change leave the other regimes alone?

## Builds

Pinned by the SHA-256 of the wasm as `git show` gives it at the modules commit. The runner refuses any file that differs.

| Name | sdn-ap | Modules commit | SHA-256 |
|---|---|---|---|
| `A45` | 0.4.5 | `c1d5d218b16f5bbb3ea184582f3c08fddd81657a` | `04169197971b5e15db8b7a7762e7cb4500a5d43617be60d0e8f6aaf99d287360` |
| `A46` | 0.4.6 | `8a5a9df96a0c3778313b4b9006394d01ca3a2414` | `b881f337d95718aafeaf78dbd60a4926eb199935eae7467da1345d5ee456e3f7` |
| `AP`, `XP` | 0.4.7 | `dcae6361375f0af27dc82859e29c5632df8af401` | `c2bf019f84e5fb35af052723d45ff12a41e25ee1126fea13cbb0459ac02e177f` |

Space Force XP (`U`): `propagator/sgp4-xp` wasm `f61b15c4fd658817e3e43c7818da18c4d08d453ad28e9d704b0cd11b616b7deb`. The harness is AP6's (`truth-compare.mjs` and `all-regimes.mjs`: truth, 300 s grid, 90 % coverage rule, lead bins, scoring by `gp-error-model` in the truth's RTN axes), with its libraries hashed in `config.json` `sources`. 0.4.7 changes only arcs under 36 h, so on these 72 h fits `AP` and `A46` should agree to the last digit; the difference is printed.

## Arms

All fits are 72 h ending at the cutoff, read nothing after it, and are scored on days 1, 3 and 7 from the fit's end.

- `AP`: 0.4.7 with `FORCES` tesseral 31, zonal 20, NRLMSISE-00 on as-issued weather (no atmosphere and no weather in the vacuum groups HE, HX, HEr). `A46` and `A45` are the same settings on the other builds.
- `XP`: the whiteroom XP, 0.4.7 with `FORCES` and `FIT` unset.
- `U`: Space Force XP, fitted and flown by `propagator/sgp4-xp`, HE and HX only.
- `F`: FFM at `CHEAPER.md`'s settings by altitude (20x20, no drag, solar pressure fitted above 8,400 km), HE and HX only. HEr runs `AP`, `A46`, `A45` and `XP`; GD, LS, DO, GN, IG and GE run `AP`, `A46` and `A45`.

## Windows

Unread means no (object, cutoff) pair has been fitted or scored by any AP, XP or Space Force XP arm at any build. The truth products themselves were read by other tests; the disclosure is below.

| Group | Truth | Objects | Cutoffs (00:00 UTC) |
|---|---|---|---|
| `HE` | TESS definitive ephemeris (MAST), archive through 2026-09-17 13:00 | TESS | 2026-07-03 to 07-06, 2026-09-10 to 09-14 (9) |
| `HX` | Chandra, NAIF merged kernel, weekly segments 2014-12 to 2015-08 | Chandra | every 3 days, 2014-12-05 to 2015-07-27 (79) |
| `GD` | ILRS combined (LAGEOS-2, Etalon-1, Etalon-2) and NSGF (LARES-2) orbits | 4 | every 7 days, 2026-01-08 to 03-12 |
| `LS` | NSGF orbits | Ajisai, Starlette, WESTPAC, LARES, Larets | every 5 days, 2026-01-08 to 03-09 |
| `DO` | CNES DORIS orbits | Jason-3, Sentinel-3A, 3B, 6A, 6B, SARAL, SWOT, CryoSat-2, HY-2C, HY-2D | every 5 days, 2026-01-08 to 03-09 |
| `GN` | ESA final orbits | every GPS, GLONASS and Galileo satellite with files, the held excluded | every 14 days, 2025-01-08 to 06-25 |

TESS: the archive's last definitive file is `TESS_EPH_DEF_2026260_21.bsp` (data to 2026-09-17 13:00; MAST's listing of 2026-10-24 shows none later). Cutoffs 2026-09-11 to 09-14 have no day-7 bin; they leave those cells, counted. Windows after 2026-09-17 need a MAST fetch of definitive files later than day-of-year 260; this lane fetches nothing. Cutoffs 2026-07-03 to 07-06 lie before AP6's first fitted state (2026-07-13).

Controls that cannot be unread, report only: `HEr` (AP6's seven TESS windows, 2026-07-27 to 09-07, the replay of the module's table), `IG` and `GE` (BeiDou and QZSS, AP6's windows 2025-10-04 to 10-12: the archive holds 20 days of GFZ rapid orbits of 2025 and AP6's windows span them; the 12 days of October 2026 allow two windows, the last of them on predicted Earth orientation, and are not used).

## Holds

No Swarm or GRACE-FO truth is read. Held by object, all dates: the six held Galileo satellites (NORAD 43567, 37847, 41862, 41174, 43055, 41175), TerraSAR-X, Sentinel-1D, Stella, LAGEOS-1. C2's time hold-out: no group except TESS (not a C2 object) scores truth on or after 2026-06-01; the runner refuses a window whose day 7 passes it. No C2 rows, no operator capture, no Starlink, no restricted path, no network fetch.

## Statements

Per window the paired error is the 3D RMS of the bin (km), `e`. Cluster bootstrap: ISO week of the cutoff, 10,000 draws, seed from SHA-256, 95 % percentile interval. A window whose arm fails for coverage leaves the statement. In H2 and H3 a failed `AP` or `A46` fit counts as a loss (+infinity), as in AP5; anywhere else a failed arm leaves the window. All are counted and printed. The verdict is the point criterion; the interval and whether it lies wholly inside the criterion are printed with it.

1. **H1.** Pooled HE and HX: the median over windows of `AP` less `XP` at day 3 is within 50 m of zero.
2. **H2.** Pooled HE and HX, days 1, 3 and 7: `AP` is not worse than `XP` by AP5 rule 1 reversed. `AP` is worse at a day only if the 97.5 % interval of the median ln(e_AP / e_XP) lies wholly above zero and the median `AP` less `XP` there exceeds 50 m. The second condition is added because the two differ by meters on errors of kilometers; a bare reversed rule 1 would call a 0.01 % offset a loss.
3. **H3.** For GD, LS, DO, GN and HX, days 1, 3 and 7: the median over windows of e(`A46`) / e(`A45`) is at most 1.05. The same for IG and GE on AP6's read windows, report only. `A46` is the 0.4.6 subject; `AP` (0.4.7) is printed beside it.

Report only: HE and HX alone; `A45` less `XP` on HE and HX (the fix's effect on unread ground); HEr's `AP` less `XP` and `A45` less `XP` against the module's table (-0.000784 m and +420.105792 m); `AP` less `A46` on every group; `AP` less `U` and less `F`; medians and 95th percentiles of every arm by group and day.

## Already read, and the smoke test

AP6 and the 2026-11-03 gap diagnosis read TESS 2026-07-27 to 09-14 (fits from 2026-07-13, scoring to 2026-09-14), THEMIS 2013-02 and Chandra 2018-03 to 04, and the groups LS, DO, GD, IG, GE of 2025-10 to 12. The module's `heo-frame` test read AP6's seven TESS windows. HE's cutoffs 2026-09-10 to 09-14 score their fit arcs' days inside AP6's scored span (2026-09-07 to 09-14) as truth; their fits and their days after 2026-09-14 are new. The ESA final, NSGF, ILRS, DORIS and NAIF products were read by earlier tests with element sets, FFM and the old SDN-AP theory on other windows, never by an AP, XP or Space Force XP fit on these windows (C2's SGP4-XP fits are on Swarm, GRACE-FO, COSMIC-2, the ISS and the type-L spheres of 2026-06 to 08). This lane smoke-tested its runner on seven read windows only (TESS 2026-07-27 and 08-03, LARES 2025-11-24, Jason-3 2025-10-20, Etalon-1 2025-11-01, C005 2025-10-06, G053 2026-01-07); with the 0.4.0 wasm it reproduced AP6's and AP5's stored rows to the last digit. No unread window was read.

## Limits

- Every fit reads precise products published after the fact.
- HE is nine windows of one satellite and HX one satellite over seven months: the statements are about two orbits, not a catalog.
- GD, LS, DO and GN are regimes the fix is built not to touch; `A46` should equal `A45` there to the last digit, and a difference is a defect.
- Chandra's merged kernel joins weekly solutions; a state jump at a join is truth, as in AP6.

No arm, window, margin or rule changes after this registration. A deviation is an amendment section at the end of this file, dated, with its reason, and is reported with the results.
