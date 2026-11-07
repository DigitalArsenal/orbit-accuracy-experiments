# Registered (second): AP 0.5.1 from SatNOGS Optical angles on the fixed angles lane

Record `experiments-satnogs-optical-ap-registered-2-20261104` (W3 of `graph/programs/ap-sources-program.md`; decisions 1, 5, 7 at
their defaults; the record's two Amendments). Written and committed before any truth row or Space-Track row is read.
`PLAN.sha256` holds this file's SHA-256; `registered.json` (sha256 `911aa0048478b826e377a4e53063fc368788a75c7bb67c5771ef6aea07be99a2`) and `arcs.mjs` (sha256
`aedbc636bb5dcedd3ddb126419e82d29246b83c4d2e59ebffc744d6bfe5f34d4`, byte-equal to the first registration's) are part of the registration.

Data credit: SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0

## The first registration (cited, never edited)

`experiments/satnogs-optical-ap/PLAN.md` (sha256 `a1c9085cead46b29536c9a2cc971d25ce4a047873f9774cb3dcd637231cf3720`; registration commit 5e02327, results commit
8be78e6; `results/satnogs-optical-ap/table.json` sha256 `a7a8be304a71224f9db047475881c43c491ea4f7406c2dd1aed638dfd9839657`), build `7c81bf78` (modules 82f83d9f). It stands
as recorded: 0 of 42 AP cells scored, 42 of 42 B. Its 14 AP failures are the cells expected to change:

| Arc | First registration (all three AP cells) |
|---|---|
| 41240-2026-09-12-2026-09-13 | failure:initial-orbit-refused |
| 41240-2026-09-22-2026-09-23 | failure:initial-orbit-refused |
| 43437-2026-09-25-2026-09-26 | failure:arc-too-short:23.58 |
| 46469-2026-09-23-2026-09-24 | failure:no-converged-revolution-count |
| 46984-2026-09-03-2026-09-06 | failure:no-converged-revolution-count |
| 46984-2026-09-13-2026-09-16 | failure:initial-orbit-refused |
| 46984-2026-09-21-2026-09-26 | failure:no-converged-revolution-count |
| 46984-2026-10-02-2026-10-03 | failure:arc-too-short:3.88 |
| 54754-2026-08-31-2026-09-01 | failure:no-converged-revolution-count |
| 54754-2026-09-21-2026-09-22 | failure:initial-orbit-refused |
| 66514-2026-09-03-2026-09-06 | failure:initial-orbit-refused |
| 66514-2026-09-13-2026-09-16 | failure:initial-orbit-refused |
| 66514-2026-09-21-2026-09-26 | failure:no-converged-revolution-count |
| 66514-2026-10-02-2026-10-03 | failure:arc-too-short:3.89 |

## Question

On the fixed angles lane, does an AP element set fitted from SatNOGS Optical RA/Dec angles alone (no element set anywhere
in the fit) predict the orbit 1, 2 and 3 days ahead better or worse than the Space-Track set current at the arc's end flown
by SGP4?

## Hypotheses (both ways)

- H-lose (expected): the angles-only AP is worse than comparator B at every lead. Amateur angles at 7 to 23 arcsec with NTP
  timing over one to six nights, nearly all from one station; the first registration's B median is 0.48/0.51/0.59 km at
  days 1/2/3.
  A loss is a result.
- H-win: the angles-only AP is at least as good as B (median ratio AP/B at most 1) at a lead.
- Reading, per lead: the ratio of the pooled AP median to the pooled B median over the cells where both are scored (B
  pooled over the same arcs' samples); above 1, AP loses at that lead; at most 1, AP wins. Descriptive only (at most 14
  arcs on 6 objects; no significance test). No common cell at a lead: no ratio; H-lose holds there in the strongest form.

## Objects and arcs

The first registration's: the survey's 12 objects with lawful truth, six of which carry a registered arc; the same 15 arcs,
14 scorable, recomputed by `arcs.mjs` from the captured `tracks.parquet` files (the same 22 session generations; sha256 per
session in `registered.json` (`satnogsInputs`), equal to the first registration's) and the first registration's frozen DORIS
product names (431 names, copied into `registered.json`; names only, no row read; the directory holds the same 431).

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

## Inputs (read-only)

The first registration's: `measurements.parquet` and `stations/station-<id>.json` of each session's one generation, the IERS
finals 2000A file `/opt/data/sdn-archive/reference-states/products/finals2000A.all.20261104T1017Z` (rows 2026-08-01 to 12-31,
`data-source/eop-parser` `parse_finals2000a`), the modules' DE440 2026 excerpt. An arc's rows: every row of the arc's sessions
whose `correlation_object_norad_id` is the object; a station-night: one session and one station, in time order.

## Build

Modules main `2df8f50c` (the angles fix, parts 1 and 2), read-only dists of
`/Users/tj/software/private/coordinator-d9/space-data-network-modules-c` (SDN_MODULES_ROOT; HEAD and origin/main 2df8f50c). The SHA-256 of
every artifact driven, from `git show origin/main:<path>` in that clone (its working tree byte-equal), is in `registered.json`
(`build`):

| Artifact (`dist/isomorphic/module.wasm`) | Version | SHA-256 | First registration |
|---|---|---|---|
| data-source/satnogs-optical-source | 0.1.0 | a23705bb | same |
| flows/angles-only-od | 0.3.0 | 8dceb574 | 0.1.0 |
| flows/observation-od | 0.4.0 | 86681788 | 0.2.0 |
| analysis/optical-astrometry | 0.3.0 | 5d7c1975 | 0.1.0 |
| analysis/estimation | 0.8.0 | b4319ba0 | 0.7.0 |
| propagator/ffm | 2.1.0 | 318db198 | same |
| propagator/sdn-ap | 0.5.1 | d29acd2b | same |
| propagator/sgp4 | 1.4.1 | 2fe246b7 | same |
| data-source/eop-parser | 0.2.0 | 03afedc5 | same |
| foundation/frames | 0.2.0 | 486acaa3 | same |
| analysis/gp-error-model | 0.14.0 | f946bafb | same |

Routing (JS that moves bytes, hashed the same way): `flows/observation-ap/flow.mjs` (the carry mirrors it),
`data-source/satnogs-optical-source/tests/parquet.mjs`, `propagator/sgp4/tests/lib/payloadEncoders.mjs` (B's encoders),
`analysis/gp-error-model/scripts/erm-codec.mjs`; packages from flows/angles-only-od's install: flatbuffers 25.9.23,
spacedatastandards.org 1.276.0, space-data-module-sdk 0.9.12; the DE440 kernel (sha256 e612a959) and the EOP file (sha256
f7c0e9e5), both the first registration's. Build hash (every row carries it), the first registration's rule, sha256 of
JSON(artifacts) + JSON(routing) + kernel sha256 + EOP sha256: `70eb486e3358a2f47460c3af954b2da166131a156a1afd2c7117e881f5efe611`.

Build notes (cited from the record, not results of this registration): part 1's local measurement, 3 of 11 arcs through,
ends 0.29 to 1.39 km from DORIS; part 2's, 6 of 11 (46984-09-13 0.709 km, 66514-09-13 1.392, 66514-09-21 0.287, 46469-09-23
1.565, 46984-09-21 0.413, 54754-09-21 2.121).

## Fit path (one `$OCM` in, nothing else flies)

1. Station-nights to `data-source/satnogs-optical-source` `read_station_night`: the first registration's conversion, default
   ModuleConfig, unchanged. Station 7 (exposure-start, no exposure time declared) and station 12 (frame-arrival, no declared
   offset to mid-exposure) rows stay refused as the source module rules; refusals counted per station-night by name.
2. Station site (the record's second Amendment): each row's `$EOO` carries the site its session's station record publishes,
   so each station-night's `$TDM` states that night's published site (OBSERVER_X/Y/Z); `flows/observation-od` reads one `$GST`
   per station per arc, the first usable night's, as the first registration's harness did. No row is moved to another site;
   an arc that fails on the site fails by name.
3. Initial orbit: `analysis/optical-astrometry` 0.3.0 `initial_orbit` on ALL the arc's usable tracks (every `$TDM`, in time
   order), the EOP stream, and its config port: ModuleConfig `crossingGapSeconds` 120, `crossingObservations` 3.
4. `flows/angles-only-od` 0.3.0 around `flows/observation-od` 0.4.0 `step` (each propagation answered by `propagator/ffm`
   `invoke`, each estimation by `analysis/estimation` 0.8.0 `fit_batch`): `plan` (observations: every usable track; initial:
   the initial orbit; stage: the last selected `$OCM`, none at stage 1; execution: the dynamics template; no seeds) gives one
   `$PRW` per candidate and the stage's tracks; each candidate runs to its end through `step` (a harness guard of 400 step
   calls); `select` takes the converged candidates' `$OCM`s on `candidates` and each one's `$PRW` on `executions`, in the same
   order (a refused candidate sends none) and gives the stage's `$OCM`; select's `report` REASON `complete` ends the arc (at
   most 12 stages). Flow config: the defaults (revolutionOffsetMin -1, revolutionOffsetMax 1, weightedRmsLimit 2,
   minimumArcHours 24). Step config: `angleSigmaArcsec` 23 (only where an observation has no `$EOO`), `minimumArcHours` 0,
   `maximumIterations` 30 (the registered cap), `timeBiasSigmaS.SATNOGS-OPTICAL-0011` 0.010 s and 0.051 s for every other
   station. Step inputs: the stage's `$TDM`s, the `$EOO`s on `uncertainty`, the `$GST` per station on `stations`, the source's
   `$PVN` on `provenance`. Dynamics: the first registration's (RK78, 30 s initial and 120 s maximum step, absolute 1e-10,
   relative 1e-13; EGM2008 20x20 with the EOP; Sun and Moon from the DE440 kernel; no drag, no radiation pressure, no
   solve-for parameter). The estimate's epoch is the initial orbit's (plan's TARGET_EPOCH).
5. Carry, AP fit and flight: the first registration's steps 3 to 5, unchanged (`propagator/ffm` `propagate_oem` 24 h back
   from the fit's end at 60 s, GCRF; `propagator/sdn-ap` 0.5.1 `fit` on that `$OEM`, Jacchia 1970, tesseral to degree 31,
   zonal to 20, the estimate's `$PVN`; the AP `$OCM` flown alone by `propagate` in GCRF at 60 s from the first whole TAI
   minute after the fit's end to 72 h after it). The fit's end is the last usable observation's epoch.

The per-arc stage report (`fit.json`; the README's per-arc table): the initial orbit's method, its report and WEIGHTED_RMS
where given; per stage, its nights, its candidates (revolution offsets) and each candidate's outcome (converged with
WEIGHTED_RMS and RMS, or its refusal), the selected WEIGHTED_RMS or select's refusal; the stage reached; the estimate's
WEIGHTED_RMS and observations used.

No JS physics: the harness reads files, converts rows to typed records, routes them by port and compares numbers.

## Failure names

An arc's three AP cells carry `failure:<name>`, the module's refusal code passed through unchanged:
- `initial_orbit`: `too-few-observations`, `single-crossing`, `no-initial-orbit`, `invalid-angles`;
- `plan` or `select`: `arc-too-short:<hours>`, `no-converged-revolution-count`, `bad-input`; a candidate refused inside its
  fit (observation-od `no-stations`, `no-convergence:<iterations>`; an estimation or FFM refusal) sends nothing to select
  and is listed in the stage report;
- after the angles lane: `carry-refused`, `unregistered-dynamic-parameters`, `ap-fit-refused`, `flight-refused` (the first
  registration's names), the module's code in `refusal`;
- harness: `no-usable-observations` (every row refused), `stages-did-not-end` (12 stages), `loop-did-not-end` (a candidate
  past 400 step calls, a candidate outcome).

## Comparator B (lettered source A, results only)

The first registration's rule, code and inputs, unchanged: the SGP4 set (MEAN_ELEMENT_THEORY SGP4, EPHEMERIS_TYPE 0) with the
latest EPOCH among those whose CREATION_DATE is at or before the fit's end in
`/opt/data/sdn-archive/spacetrack/gp_history/by-creation`, searched over the 10 creation days up to the fit's end; flown by
`propagator/sgp4` `propagate_ephemeris` (TEME) on the same grid, turned to GCRF by `foundation/frames`. Never a seed, never
truth; no record reproduced; only errors committed. The source module and the conversion are unchanged, so each arc's fit
end, B's set and B's grid equal the first registration's: B's 42 cells must equal the first registration's to the digit
(same sets, same truth; the E2E asserts it).

## Truth

The first registration's: IDS DORIS SP3 (SSALTO) under `/opt/data/sdn-archive/hac/ids-doris/ssa/`, the 431 registered names
by prefix; for an epoch the product with the latest begin date whose span holds it; TAI to UTC by the leap-second count;
Earth-fixed to GCRF by `foundation/frames` with the EOP. Read only after this plan's commit.

## Statistic

The first registration's. Forward error only. For each scorable arc and lead day d in 1, 2, 3: every 60 s grid epoch in
((d-1) 24 h, d 24 h] after the fit's end that is a truth epoch; the 3D position error; R, T, N in the truth's RTN axes by
`analysis/gp-error-model` `pair_statistics`. A cell carries the median and the 95th percentile of its samples; it needs truth
at 90 % or more of its grid epochs, else `no-truth`. Per object and pooled: the median and 95th of every sample of the lead
day. AP and B on the same epochs.

## Registered cells

14 scorable arcs x 3 lead days = 42 AP cells and 42 B cells, each a row of `results/satnogs-optical-ap-2/table.json`:
`scored`, `failure:<name>` (AP), `unavailable` (B) or `no-truth`.

## Stop rule

Every refusal anywhere in the chain is a failure of that arc's three AP cells, named as above; never dropped. One run per
arc; no rerun with changed settings in this registration. A harness fault that is not a module refusal (a JS exception, a
host crash) is fixed in the harness and that arc rerun, and the README states it.

## EXCLUDE lists (asserted by check.mjs on every result row)

Swarm 39451, 39452, 39453 and GRACE-FO 43476, 43477 at every date; the six held Galileo 43567, 37847, 41862, 41174, 43055,
41175; every Starlink group (no NORAD of a Starlink name and no Starlink name in any row); operator captures (none read).

## Identity caveat

Object labels are the network's SGP4 correlation (`sgp4-topocentric-v1` against Space-Track and McCants sets): an
association key, never truth. Tracks of a truth object that the gate left unlabeled are not used; the counts are a floor,
and the selection favors objects whose public set is good. Sentinel-6A and 6B fly in tandem; a label swap between them is
possible and would show as a large error.

## Station-site finding (reported, never scored)

The capture's station-11 record changes its site between sessions while the station's rows do not move: optical-bench in
Greece (36.97 N 22.15 E) on 08-30, 08-31, 09-03 to 05, 09-11, 10-10 and 10-12; Drachten (53.11 N 6.11 E) on 09-01, 09-06,
09-24 and 10-17; 52.0 N 4.20 E on 11-03 and 11-04; Dwingeloo (52.83 N 6.38 E) on the others. The README reports it as a
data finding with part 2's Dwingeloo diagnostic (66514-09-03 fits to 0.510 km; SWOT 08-31's WEIGHTED_RMS drops from about
10,000 to 1.5), diagnostic only; no scored arm moves a row.

## Outputs

Products and flight rows under `/opt/data/sdn-archive/operator-theory/ap/satnogs-optical-ap-2/` (nothing else written under
the archive). Committed: `results/satnogs-optical-ap-2/table.json` and `README.md` (the per-object and per-arc tables, failures
by name, the side-by-side against the first registration, the station-site finding, the build note, the credit line). No
captured or derived SatNOGS batch is committed (program decision 5a). Run: 8 workers under nice; a worker starts only with
the 1-minute load under 45 and more than 20 GiB free.

## Forward cycle (stated, not run)

DORIS lags 3 to 4 weeks. A later cycle adds the 2026-10-10 to 11-03 nights (Sentinel-6A and 6B) under a new registration
once their DORIS products are on disk.

## E2E

`node experiments/satnogs-optical-ap-2/check.mjs`: the plan hash equals `PLAN.sha256` as committed, and the plan commit
precedes the run commit (an ancestor, its author date before every fit's start); the arc list recomputed from the captured
tracks equals the registered list (15 arcs, 14 scorable); every scorable arc has one AP `$OCM` flown alone (re-flown from
`ap.ocm` alone, equal to the stored flight) or a named refusal; every scored cell re-scores equal from the stored products;
no EXCLUDE NORAD or Starlink name in any row; every row carries the lead, the build hash and the input class
`observations/CC-BY-SA-4.0`; 42 AP and 42 B cells; comparator B's cells equal the first registration's to the digit.
