# SatNOGS Optical angles to AP 0.5.1: registered result

Data credit: SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0

Registration `experiments/satnogs-optical-ap/PLAN.md` (sha256 `a1c9085cead46b29536c9a2cc971d25ce4a047873f9774cb3dcd637231cf3720`). Build `7c81bf7835f3258b1550eb74fa4f18f164b6f0c7f2ab4aea25cd8bf04b951116` (modules 82f83d9f; artifact hashes in `registered.json`). Input class `observations/CC-BY-SA-4.0`. Results only: no captured or derived batch is published; comparator B is lettered source A (Space-Track), errors only.

## Outcome

0 of 42 AP cells scored; 42 are failures under the stop rule (every one of the 14 arcs failed before an AP set existed). 42 of 42 B cells scored. H-lose holds in the strongest form: the angles-only lane produced no forecast to score; B has a forecast on every arc. No AP/B ratio exists.

## Per object (pooled samples, 60 s at DORIS epochs; 3D km)

| Object | Arcs | AP cells scored | AP failures (by name) | AP day 1/2/3 median | AP day 1/2/3 95th | B day 1/2/3 median | B day 1/2/3 95th |
|---|---|---|---|---|---|---|---|
| Jason-3 (41240) | 2 | 0 | initial-orbit-refused x2 | - / - / - | - / - / - | 0.33 / 0.40 / 0.47 | 0.85 / 0.84 / 0.81 |
| Sentinel-3B (43437) | 1 | 0 | arc-too-short:23.58 x1 | - / - / - | - / - / - | 2.34 / 4.56 / 6.84 | 4.18 / 6.34 / 8.62 |
| HY-2C (46469) | 1 | 0 | no-converged-revolution-count x1 | - / - / - | - / - / - | 0.54 / 0.66 / 0.87 | 1.03 / 1.36 / 1.64 |
| Sentinel-6A (46984) | 4 | 0 | no-converged-revolution-count x2, initial-orbit-refused x1, arc-too-short:3.88 x1 | - / - / - | - / - / - | 0.48 / 0.48 / 0.58 | 1.07 / 1.13 / 1.25 |
| SWOT (54754) | 2 | 0 | no-converged-revolution-count x1, initial-orbit-refused x1 | - / - / - | - / - / - | 0.43 / 0.48 / 0.42 | 1.29 / 1.35 / 1.20 |
| Sentinel-6B (66514) | 4 | 0 | initial-orbit-refused x2, no-converged-revolution-count x1, arc-too-short:3.89 x1 | - / - / - | - / - / - | 0.47 / 0.48 / 0.57 | 1.01 / 1.06 / 1.17 |
| All | 14 | 0 | 14 arcs | - / - / - | - / - / - | 0.48 / 0.51 / 0.59 | 1.97 / 4.19 / 6.44 |

## Per arc

| Arc | Usable tracks / observations | Fit span (h) | AP | B day 1/2/3 median (km) | B day 1/2/3 95th (km) | B set age at fit end (h) |
|---|---|---|---|---|---|---|
| 41240-2026-09-12-2026-09-13 | 3 / 4 | 24.3 | failure:initial-orbit-refused | 0.32 / 0.34 / 0.50 | 0.76 / 0.84 / 0.79 | 2.26 |
| 41240-2026-09-22-2026-09-23 | 5 / 242 | 28.1 | failure:initial-orbit-refused | 0.34 / 0.44 / 0.45 | 0.90 / 0.83 / 0.82 | 11.74 |
| 43437-2026-09-25-2026-09-26 | 2 / 252 | 23.6 | failure:arc-too-short:23.58 | 2.34 / 4.56 / 6.84 | 4.18 / 6.34 / 8.62 | 15.44 |
| 46469-2026-09-23-2026-09-24 | 2 / 742 | 27.9 | failure:no-converged-revolution-count (stages: 1: 1/1 of 1 tracks; 2: 0/0 of 2 tracks) | 0.54 / 0.66 / 0.87 | 1.03 / 1.36 / 1.64 | 5.7 |
| 46984-2026-09-03-2026-09-06 | 4 / 1055 | 48.8 | failure:no-converged-revolution-count (stages: 1: 1/1 of 1 tracks; 2: 0/0 of 3 tracks) | 0.39 / 0.41 / 0.42 | 0.75 / 0.78 / 0.87 | 11.69 |
| 46984-2026-09-13-2026-09-16 | 7 / 1491 | 71.2 | failure:initial-orbit-refused | 0.40 / 0.44 / 0.48 | 0.76 / 0.76 / 0.88 | 21.05 |
| 46984-2026-09-21-2026-09-26 | 16 / 3392 | 118.0 | failure:no-converged-revolution-count (stages: 1: 1/1 of 2 tracks; 2: 0/0 of 4 tracks) | 0.39 / 0.41 / 0.49 | 0.82 / 0.80 / 0.83 | 13.62 |
| 46984-2026-10-02-2026-10-03 | 3 / 642 | 3.9 | failure:arc-too-short:3.88 | 0.81 / 0.88 / 0.94 | 1.27 / 1.33 / 1.51 | 157.95 |
| 54754-2026-08-31-2026-09-01 | 2 / 793 | 24.0 | failure:no-converged-revolution-count (stages: 1: 1/1 of 1 tracks; 2: 0/0 of 2 tracks) | 0.42 / 0.47 / 0.43 | 1.24 / 1.31 / 1.22 | 7.16 |
| 54754-2026-09-21-2026-09-22 | 2 / 370 | 24.0 | failure:initial-orbit-refused | 0.46 / 0.51 / 0.42 | 1.34 / 1.37 / 1.18 | 3.99 |
| 66514-2026-09-03-2026-09-06 | 5 / 1101 | 48.8 | failure:initial-orbit-refused | 0.39 / 0.40 / 0.42 | 0.75 / 0.79 / 0.88 | 11.69 |
| 66514-2026-09-13-2026-09-16 | 8 / 1592 | 71.2 | failure:initial-orbit-refused | 0.40 / 0.44 / 0.50 | 0.76 / 0.81 / 0.88 | 21.05 |
| 66514-2026-09-21-2026-09-26 | 12 / 3151 | 118.0 | failure:no-converged-revolution-count (stages: 1: 1/1 of 1 tracks; 2: 0/0 of 4 tracks) | 0.39 / 0.42 / 0.49 | 0.81 / 0.79 / 0.84 | 13.62 |
| 66514-2026-10-02-2026-10-03 | 3 / 655 | 3.9 | failure:arc-too-short:3.89 | 0.73 / 0.80 / 0.86 | 1.21 / 1.26 / 1.43 | 137.34 |

Failure names: `initial-orbit-refused` = analysis/optical-astrometry `initial_orbit` on the arc's first track answered `no-initial-orbit` (Gooding, no start converged); `no-converged-revolution-count` = stage 1 (night 1) converged but at stage 2 every candidate revolution count's Gooding seed through nights 1 and 2 was refused (`no-initial-orbit`), so no candidate was fitted; `arc-too-short:<h>` = after the refused rows the usable observations span under 24 h.

## Station-nights

49 station-nights over the 14 arcs, 17298 rows; 9 unusable (every row refused by satnogs-optical-source), 1816 rows:

| Arc | Session | Station | Rows | Epoch convention | Why |
|---|---|---|---|---|---|
| 43437-2026-09-25-2026-09-26 | 2026-09-26 | 7 | 102 | exposure-start | exposure-start with no exposure time declared |
| 46984-2026-09-03-2026-09-06 | 2026-09-03 | 12 | 276 | frame-arrival | frame-arrival: no declared offset to mid-exposure |
| 46984-2026-09-13-2026-09-16 | 2026-09-13 | 7 | 199 | exposure-start | exposure-start with no exposure time declared |
| 46984-2026-09-21-2026-09-26 | 2026-09-23 | 7 | 152 | exposure-start | exposure-start with no exposure time declared |
| 46984-2026-10-02-2026-10-03 | 2026-10-03 | 7 | 40 | exposure-start | exposure-start with no exposure time declared |
| 66514-2026-09-03-2026-09-06 | 2026-09-03 | 12 | 522 | frame-arrival | frame-arrival: no declared offset to mid-exposure |
| 66514-2026-09-13-2026-09-16 | 2026-09-13 | 7 | 190 | exposure-start | exposure-start with no exposure time declared |
| 66514-2026-09-21-2026-09-26 | 2026-09-23 | 7 | 209 | exposure-start | exposure-start with no exposure time declared |
| 66514-2026-10-02-2026-10-03 | 2026-10-03 | 7 | 126 | exposure-start | exposure-start with no exposure time declared |

Every usable row is station 11 (dwingeloo, exposure-mid) except one station 4 row (Jason-3, 2026-09-12). No row was quarantined.

## Build note

Modules main 82f83d9f, read-only dists: data-source/satnogs-optical-source 0.1.0, flows/angles-only-od 0.1.0, flows/observation-od 0.2.0, analysis/optical-astrometry 0.1.0, analysis/estimation 0.7.0, propagator/ffm 2.1.0, propagator/sdn-ap 0.5.1, propagator/sgp4 1.4.1, data-source/eop-parser 0.2.0, foundation/frames 0.2.0, analysis/gp-error-model. The record title says sdn-ap 0.5.0; 0.5.1 is the version at 82f83d9f and was registered. No AP fit or flight ran: every arc stopped in the angles lane. The angles-only-od estimate epoch is the initial orbit's (the flow sets TARGET_EPOCH); the registered carry would have flown it to the fit's end. Comparator B is the Space-Track gp_history set by creation day (the `spacetrack/gp` snapshots begin 2026-09-26).

## Caveats

- Identity: object labels are the network's SGP4 correlation, an association key; counts are a floor. Sentinel-6A and 6B fly in tandem.
- 14 arcs on 6 objects; descriptive only.
- DORIS lags 3 to 4 weeks: a second cycle after 2026-11-15 adds the forward arcs (about 25 nights on Sentinel-6A and 6B, 2026-10-10 to 11-03) under a new registration.
