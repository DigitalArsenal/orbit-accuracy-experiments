# Registered: AP 0.5.1 from SatNOGS Optical angles on the objects with lawful DORIS truth

Record `experiments-satnogs-optical-ap-registered-20261104` (W3 of `graph/programs/ap-sources-program.md`; decisions 1, 5, 7 at
their defaults). Written and committed before any truth row or Space-Track row is read. `PLAN.sha256` holds this file's
SHA-256; `registered.json` (sha256 `ee0958ec3402fb170fe32b0d8597e8e89e093de2b823a760ae69635aeb6d9f6c`) and `arcs.mjs` (sha256 `aedbc636bb5dcedd3ddb126419e82d29246b83c4d2e59ebffc744d6bfe5f34d4`) are part of the registration.

Data credit: SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0

## Question

Does an AP element set fitted from SatNOGS Optical RA/Dec angles alone (no element set anywhere in the fit) predict the
orbit 1, 2 and 3 days ahead better or worse than the Space-Track set current at the arc's end flown by SGP4?

## Hypotheses (both ways)

- H-lose (expected): the angles-only AP is worse than comparator B at every lead. E6 found SatNOGS Doppler 2.7 to 10.7 times
  worse than SGP4; amateur angles at 7 to 23 arcsec with NTP timing are expected to lose too. A loss is a result.
- H-win: the angles-only AP is at least as good as B (median ratio AP/B at most 1) at a lead.
- Reading, per lead: the ratio of the pooled AP median to the pooled B median over the cells where both are scored; above 1,
  AP loses at that lead; at most 1, AP wins. Descriptive only (14 arcs on 6 objects; no significance test).

## Objects and arcs

From `experiments/satnogs-optical-survey/coverage.json`, recomputed by `arcs.mjs` from the captured `tracks.parquet` files
and the DORIS product names frozen in `registered.json` (`dorisProductNames`; names only, no row read): 15 arcs of 24 h or
more over consecutive nights with truth; 14 have at least 72 h of DORIS truth after the arc's last track.

| Arc | Object | Nights | Hours | Truth after (h) | Scorable |
|---|---|---|---|---|---|
| 41240-2026-09-12-2026-09-13 | Jason-3 (41240) | 2 | 24.3 | 433.2 | yes |
| 41240-2026-09-22-2026-09-23 | Jason-3 (41240) | 2 | 28.1 | 190.7 | yes |
| 43437-2026-09-25-2026-09-26 | Sentinel-3B (43437) | 2 | 25.2 | 506.7 | yes |
| 46469-2026-09-23-2026-09-24 | HY-2C (46469) | 2 | 27.9 | 403.9 | yes |
| 46469-2026-10-09-2026-10-11 | HY-2C (46469) | 3 | 41.4 | 3.3 | no: want of truth: under 72 h of DORIS truth after the arc |
| 46984-2026-09-03-2026-09-06 | Sentinel-6A (46984) | 4 | 73.2 | 766 | yes |
| 46984-2026-09-13-2026-09-16 | Sentinel-6A (46984) | 4 | 71.3 | 528 | yes |
| 46984-2026-09-21-2026-09-26 | Sentinel-6A (46984) | 6 | 118 | 288.1 | yes |
| 46984-2026-10-02-2026-10-03 | Sentinel-6A (46984) | 2 | 30.1 | 117.5 | yes |
| 54754-2026-08-31-2026-09-01 | SWOT (54754) | 2 | 24 | 890.7 | yes |
| 54754-2026-09-21-2026-09-22 | SWOT (54754) | 2 | 24 | 381.2 | yes |
| 66514-2026-09-03-2026-09-06 | Sentinel-6B (66514) | 4 | 73.2 | 766 | yes |
| 66514-2026-09-13-2026-09-16 | Sentinel-6B (66514) | 4 | 71.3 | 528 | yes |
| 66514-2026-09-21-2026-09-26 | Sentinel-6B (66514) | 6 | 118 | 288.1 | yes |
| 66514-2026-10-02-2026-10-03 | Sentinel-6B (66514) | 2 | 30.1 | 117.5 | yes |

Nine objects enter the survey's truth list; six carry a registered arc (Sentinel-6B, Sentinel-6A, HY-2C, SWOT, Jason-3,
Sentinel-3B). GPS 26407 and 28190 (one point each) and Ajisai (7 points) do not enter. HY-2C 2026-10-09..11 is excluded for
want of truth (3.3 h after it).

## Inputs (read-only)

- Measurements: `/opt/data/sdn-archive/hac/satnogs-optical/session_date=<D>/generations/<id>/measurements.parquet` and
  `stations/station-<id>.json`, one generation per session, sha256 per session in `registered.json` (`satnogsInputs`).
- An arc's rows: every `measurements.parquet` row of the arc's sessions whose `correlation_object_norad_id` is the object;
  one station-night = the object's rows of one session and one station, in time order.
- Earth orientation: `/opt/data/sdn-archive/reference-states/products/finals2000A.all.20261104T1017Z` (IERS finals 2000A;
  sha256 in `registered.json`), parsed by `data-source/eop-parser` `parse_finals2000a`.
- Ephemeris kernel: the modules' DE440 2026 excerpt `files/orbit-products/tests/fixtures/de440/de440-2026.bsp`.

## Build

Modules main `82f83d9f`, read-only dists of `/Users/tj/software/private/coordinator-d9/space-data-network-modules-c`
(SDN_MODULES_ROOT). The SHA-256 of every artifact driven is in `registered.json` (`build.artifacts`): satnogs-optical-source
0.1.0, flows/angles-only-od 0.1.0, flows/observation-od 0.2.0 (manifest), analysis/optical-astrometry 0.1.0,
analysis/estimation 0.7.0, propagator/ffm 2.1.0, propagator/sdn-ap 0.5.1, propagator/sgp4 1.4.1, data-source/eop-parser 0.2.0,
foundation/frames 0.2.0, analysis/gp-error-model (RTN scorer). Build hash (every row carries it): `build.hash` =
`7c81bf7835f3258b1550eb74fa4f18f164b6f0c7f2ab4aea25cd8bf04b951116`. The record's title says sdn-ap 0.5.0; modules main 82f83d9f ships
0.5.1 (the brief's version); 0.5.1 is registered.

## Fit path (one `$OCM` in, nothing else flies)

1. `data-source/satnogs-optical-source` `read_station_night` per station-night: the harness converts the rows as the
   module's E2E does (one `$TDM` of the night's tracks, `INTEGRATION_REF` from `epoch_refers_to`, `INTEGRATION_INTERVAL` 0:
   no exposure time is declared in any station file; one `$EOO` per row: sigma, site, `bias_applied_ms`). Rows the module
   refuses (frame-arrival; exposure-start without an exposure; quarantined) are refused by name and counted per
   station-night; a station-night refused whole is listed as unusable with the reason. Default ModuleConfig.
2. `flows/angles-only-od` `plan`/`select` around `flows/observation-od` `step` (each step's propagation answered by
   `propagator/ffm` `invoke`, its estimation by `analysis/estimation` `fit_batch`), seeded by
   `analysis/optical-astrometry` `initial_orbit` on the arc's first track (the earliest `$TDM`), revolution counts
   N0-1, N0, N0+1 at stage 2 as the flow plans them. Flow config: the defaults (revolutionOffsetMin -1, revolutionOffsetMax 1,
   weightedRmsLimit 2, minimumArcHours 24). Step config: `angleSigmaArcsec` 23 (used only where an observation has no
   `$EOO`; the `$EOO` sigma rules), `minimumArcHours` 0, `maximumIterations` 30, `timeBiasSigmaS.SATNOGS-OPTICAL-0011`
   0.010 and 0.051 s for every other station (stations 7 and 15 at the survey's 51 ms; any other station at the larger
   value). Inputs: the `$TDM` per track, the `$EOO` on `uncertainty`, the `$GST` per station on `stations`, the source's
   `$PVN` on `provenance`. Dynamics (execution request): RK78 (30 s initial, 120 s maximum step, absolute 1e-10,
   relative 1e-13), EGM2008 20x20 with the EOP, Sun and Moon point masses from the DE440 kernel, no drag, no radiation
   pressure, no solve-for parameter. TARGET_EPOCH: the last observation fitted (the fit's end).
3. Carry (as `flows/observation-ap` does for laser): `propagator/ffm` `propagate_oem` from the estimate, the same dynamics,
   24 h back from the fit's end at 60 s, GCRF.
4. `propagator/sdn-ap` 0.5.1 `fit`: the carried `$OEM`, `$PCF` THEORY AP, FORCES ATMOSPHERE_MODEL Jacchia 1970 on the
   theory's flux model (no `$SPW` rows), tesseral to degree 31, zonal to 20 (the laser flow's E2E statement), the estimate's
   `$PVN` on `provenance`. Output: one AP `$OCM`.
5. Flight: `propagator/sdn-ap` `propagate` of that `$OCM` alone with a `$PCF` OUTPUT in GCRF at 60 s from the first truth
   epoch after the fit's end to 72 h after the fit's end.

No JS physics: the harness reads files, converts rows to typed records, routes them by port and compares numbers.

## Comparator B (lettered source A, results only)

The Space-Track set current at the fit's end: from `/opt/data/sdn-archive/spacetrack/gp_history/by-creation` (Space-Track
GP history by creation day), the SGP4 set (MEAN_ELEMENT_THEORY SGP4, EPHEMERIS_TYPE 0) of the object with the latest EPOCH
among those whose CREATION_DATE is at or before the fit's end, searched over the 10 creation days up to the fit's end. The
brief names `spacetrack/gp`; its daily snapshots begin 2026-09-26, after 10 of the 14 arcs end, so the creation-day history
(the same Space-Track GP class) is the conservative reading of "current at the arc's end". Flown by `propagator/sgp4`
`propagate_ephemeris` (TEME) on the same grid, turned to GCRF by `foundation/frames`. A set never seeds the angles lane and is
never truth; no record is reproduced or redistributed; only errors are committed. No set found: the B cell is
`unavailable`, named.

## Truth

IDS DORIS SP3 (SSALTO) under `/opt/data/sdn-archive/hac/ids-doris/ssa/` by file prefix: ssas6a, ssas6b, ssah2c, ssah2d,
ssaswo, ssacs2, ssaja3, ssas3a, ssas3b (the survey's truth class `doris-sp3`). For an epoch, the product with the latest
begin date whose span holds it. Positions (and velocities where the file has them), time system from the file header
(GPS to UTC by the leap-second count, a label), Earth-fixed to GCRF by `foundation/frames` with the EOP. Truth is read only
after this plan's commit.

## Statistic

Forward error only. For each scorable arc and lead day d in 1, 2, 3: every 60 s grid epoch in ((d-1) 24 h, d 24 h] after
the fit's end that is a truth epoch; the 3D position error (axis-invariant), with R, T, N components in the truth's RTN
axes by `analysis/gp-error-model` `pair_statistics` (axes from the truth). A cell (arc, day) carries the median and the 95th
percentile of its samples; a cell needs truth at 90 % or more of its grid epochs, else `no-truth`. Per object and pooled:
the median and 95th of every sample of that lead day. AP and B on the same epochs.

## Registered cells

14 scorable arcs x 3 lead days = 42 AP cells and 42 B cells. Every cell appears in `results/satnogs-optical-ap/table.json`
as a row: `scored`, `failure:<name>` (AP), `unavailable` (B) or `no-truth`.

## Stop rule

A refusal anywhere in the chain (`arc-too-short:<h>` after refused rows, `no-converged-revolution-count`, an initial
orbit refused, a fit or flight refusal) makes that arc's three AP cells failures named by the refusal; never dropped. One
run per arc; no rerun with changed settings in this registration.

## EXCLUDE lists (asserted by check.mjs on every result row)

Swarm 39451, 39452, 39453 and GRACE-FO 43476, 43477 at every date; the six held Galileo 43567, 37847, 41862, 41174, 43055,
41175; every Starlink group (no NORAD of a Starlink name and no Starlink name in any row); operator captures (none read).

## Identity caveat

Object labels are the network's SGP4 correlation (`sgp4-topocentric-v1` against Space-Track and McCants sets): an
association key, never truth. Tracks of a truth object that the gate left unlabeled are not used; the object and arc counts
are a floor, and the selection favors objects whose public set is good. Sentinel-6A and 6B fly in tandem; a label swap
between them is possible and would show as a large error.

## Outputs

Products and flight rows under `/opt/data/sdn-archive/operator-theory/ap/satnogs-optical-ap/` (nothing else written under the
archive). Committed: `results/satnogs-optical-ap/table.json` and `README.md` (counts, failures by name, medians and 95ths
beside B, the build note, the credit line). Run: 8 workers under nice, a worker starts only with the 1-minute load under 45
and disk above 20 GiB.

## Second cycle (stated, not run now)

DORIS lags 3 to 4 weeks. After 2026-11-15 a second cycle adds the forward arcs (about 25 nights on Sentinel-6A and 6B from
2026-10-10 to 11-03) under a new registration.

## E2E

`node experiments/satnogs-optical-ap/check.mjs`: the plan hash equals `PLAN.sha256`; the arc list recomputed from the
captured tracks equals the registered list (15 arcs, 14 scorable); no EXCLUDE NORAD or Starlink name in any result row;
every result row has a lead, the build hash and the input class `observations/CC-BY-SA-4.0`; the number of cells equals
the registered 42 AP and 42 B.
