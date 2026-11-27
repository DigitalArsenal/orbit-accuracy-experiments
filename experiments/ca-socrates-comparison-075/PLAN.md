# CelesTrak SOCRATES Plus Comparison (SDN-AP 0.7.5, catalog-builder 0.2.7, CA 0.19.3)

**Status:** Frozen preregistration committed before scoring any Part B1 or Part B2 arm.
**Date:** 2026-11-26
**Modules pinned:**
- `propagator/sdn-ap` `0.7.5` (`a3337aad678ccef996238d2a23aa08eaab1f3dede4a2904078303d732318be5d`, commit `2a4022548`)
- `flows/catalog-builder` `0.2.7` (commit `2a4022548`)
- `analysis/conjunction-assessment` `0.19.3` (`ebab8b970166063e5066b2037e0ef38b3cf6ef80743947ee21a7a9eef34b6beb`, commit `67b57bf82`)

## Objective

Answer two distinct questions about how SDN-AP compares with CelesTrak SOCRATES Plus, without mixing them:

1. **Comparison A (Engine parity on identical Space-Track GP):** On the full 7-day, 5 km CelesTrak SOCRATES Plus run (`2026-10-28T17:00:00Z` to `2026-11-04T17:00:00Z`, 193,952 rows, 16,818 active primaries, 32,815 catalog objects, exact matched GP editions cut at `2026-10-28T16:06:35Z`), does `CA 0.19.3` reproduce every SOCRATES Plus GP-on-GP event (`126,077` primary + `67,844` numbered `>= 100000` + `31` boundary rows) within `|Δmiss| <= 5 m`, `|Δspeed| <= 5 m/s`, `|ΔTCA| <= 10 ms` (NLRV), and match the verified `CA 0.12.0`/`0.17.0` 958,800-event baseline?
2. **Comparison B (Published SOCRATES Plus vs Space-Track GP → SGP4-XP, Space-Track GP → SDN-AP 0.7.5, CelesTrak SupGP → SGP4, and SpaceX Ephemeris → SGP4-XP / SDN-AP 0.7.5):**
   - **Part B1 — Full 7-day `2026-10-28T17:00:00Z` SOCRATES Plus run (100% Space-Track public GP, zero operator data):**
     - Score 7-day position accuracy (days 1, 3, 5, 7 median, p95, per-satellite win rate, satellite-cluster 95% CIs) across every active satellite inside the SOCRATES catalog that has full 7-day independent cm-accurate precise orbits (`ESA0OPSFIN` GNSS + `Sentinel-1C`/`Sentinel-1D` Copernicus POEORB) for: (a) SOCRATES Plus's exact Space-Track GP edition on SGP4, (b) Space-Track GP history (`CREATION_DATE <= 2026-10-28T16:06:35Z`) → SGP4-XP, (c) Space-Track GP history (`<= 2026-10-28T16:06:35Z`) → SDN-AP 0.7.5.
     - Score primary-satellite position error at TCA on all `29` published `2026-10-28` SOCRATES Plus conjunction rows involving `Sentinel-1C` (`62261`) or `Sentinel-1D` (`66315`) against Copernicus POEORB truth.
     - Audit `spacetrack/cdm_public` over `2026-10-28T17:00:00Z..2026-11-04T17:00:00Z` to measure active-payload overlap with SOCRATES Plus (documenting that `cdm_public` is overwhelmingly non-active-payload debris/rocket-body conjunctions outside SOCRATES Plus's active-payload scope).
   - **Part B2 — Multi-Arm Scored Screening on Archived `2026-11-22` CelesTrak SOCRATES Plus Run (`2026-11-21T10:00:00Z .. 2026-11-26T10:00:00Z`, 5 full elapsed days; 100.0% `24,551/24,551` GP edition match, exact SOCRATES GP cut `<= 2026-11-21T08:56:21Z`):**
     - **Truth-independence disclosure:** On Starlink pairs, the post-event reference trajectory is stitched from SpaceX's own subsequent 8-hourly ephemeris cycles (`2026-11-21T08:57Z .. 2026-11-26T16:57Z`, always taking the nearest freshly published cycle covering each segment, 0–8 h freshness). This is **operator ephemeris self-consistency**, NOT independent laser/radar/GNSS tracking, and is explicitly labeled as such in every output and table. Independent tracking truth on this same window is measured separately on `GFZ0OPSRAP`/`GFZ0MGXRAP` GNSS rapid precise orbits (`2026-11-21..25`).
     - **Independent reference screen (no selection bias):** Screen the stitched post-event SpaceX reference trajectories across all SpaceX-covered Starlinks over `0–24 h` (`2026-11-21T10:00:00Z .. 2026-11-22T10:00:00Z`), `0–72 h` (`.. 2026-11-24T10:00:00Z`), and `0–120 h` (`.. 2026-11-26T10:00:00Z`) at 1 km and 5 km thresholds so events missed by ALL arms (including published SOCRATES Plus) are captured in the truth denominator.
     - **Exact SOCRATES Plus population filter:** Restrict primary conjunction scoring to the EXACT SOCRATES Plus active-payload pair set among the SpaceX-covered Starlinks — i.e., pairs where at least one member has `NORAD_CAT_ID >= 100000` OR at least one member is not `[+]` operational status (matching SOCRATES Plus's published rule that operational `[+]`/`[+]` intra-Starlink pairs `< 100000` are excluded). Report all-Starlink-pair totals separately for completeness.
     - **Six strictly causal arms (ALL inputs published strictly BEFORE `2026-11-21T10:00:00Z`):**
       1. `socratesPublished`: Archived CelesTrak SOCRATES Plus `sort-minRange.csv.gz` (`2026-11-22`, SHA-256 `36366daa...`, `191,778` rows, 100.0% `24,551/24,551` GP match, GP cut `<= 2026-11-21T08:56:21Z`).
       2. `sgp4Control`: Our `CA 0.19.3` SGP4 screen on the matched Space-Track GP editions (`CREATION_DATE <= 2026-11-21T08:56:21Z`).
       3. `supGpSgp4`: CelesTrak Supplemental GP (`hac/celestrak-supgp/2026/2026-11-21/starlink/022001Z.json.gz` & `gps/022001Z.json.gz`, published `2026-11-21T02:20:01Z`, 7 h 40 m BEFORE `T0`) flown on SGP4 (`CA 0.19.3`).
       4. `gpSgp4Xp`: Space-Track GP history (`<= 2026-11-21T08:56:21Z`) → `catalog-builder 0.2.7` → `SGP4-XP` (`sdn-ap 0.7.5`).
       5. `gpSdnAp`: Space-Track GP history (`<= 2026-11-21T08:56:21Z`) → `catalog-builder 0.2.7` → `SDN-AP 0.7.5`.
       6. `spacexSgp4Xp` & `spacexSdnAp`: SpaceX pre-T0 ephemeris cycle `2026-11-21T08-57-57-947Z` (published 1 h 02 m BEFORE `T0`) → `catalog-builder 0.2.7` → `SGP4-XP` and `SDN-AP 0.7.5`.
     - **Matching & scoring rules (frozen before scoring):**
       - Same unordered NORAD pair and `|TCA_arm - TCA_truth| <= 60 s`, one-to-one nearest first.
       - Events within `60 s` of window boundaries are counted apart and excluded from recall/precision denominators.
       - Score BOTH `< 1 km` and `< 5 km` thresholds over `0–24 h` (day 1), `0–72 h` (days 1–3), and `0–120 h` (days 1–5):
         - True Positives (hits), False Negatives (misses), Recall %, False Positives (false warnings), Precision %, F1.
         - Predicted vs reference miss-distance error (`|miss_arm - miss_truth|`, median & p95) on matched events.
         - Paired cluster bootstrap 95% CIs (`B = 500`, resampled by primary NORAD ID cluster) on Recall, Precision, False Warnings, and deltas vs published SOCRATES Plus and vs `gpSgp4Xp` / `spacexSgp4Xp`.
     - **Independent tracking truth on `2026-11-20..25`:**
       - `GFZ0OPSRAP` / `GFZ0MGXRAP` GNSS rapid precise orbits (`2026-11-20..25`), scoring `sgp4Control`, `supGpSgp4` (GPS + GLONASS), `gpSgp4Xp`, and `gpSdnAp` on days 1, 3, and 5 (median, p95, per-satellite wins).
       - `spacetrack/cdm_public` (`2026-11-20..26`) overlap audit (labeled *CDM agreement, not independent truth*).

## Non-Negotiable Integrity Rules
- Zero CelesTrak network calls; 100% locally archived data under `/opt/data/sdn-archive/`.
- Strict publication-time causality (`CREATION_DATE <= cutUtc < T0` for GP, `issueUtc < T0` for SupGP and SpaceX ephemeris, forecast-only space weather `<= cutoffDate`).
- Zero synthetic error injection in any Part A, Part B1, or Part B2 score.
- Output aggregate-only JSON (`results/ca-rollup-075/socrates-parity-ca0193.json` and `results/ca-rollup-075/socrates-comparison-0.7.5.json`) with zero raw CelesTrak/Space-Track element sets redistributed.
