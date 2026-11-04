# SatNOGS Optical: records to file next

Filed by the coordinator, children of `mode-conjunction` (W3), after `REPORT.md`. Each record is at most 2 h with one
E2E that asserts a specific outcome. Rules on all: one `$OCM` in the fit path; no JS physics; no `USER_DEFINED_PARAMETERS`;
configuration through a typed FlatBuffer message; zero backward compatibility; held data held (Swarm and GRACE-FO after
2026-10-31, six Galileo 43567 37847 41862 41174 43055 41175, every Starlink group, operator captures) with EXCLUDE lists
asserted; SGP4 sets never truth, never seed another theory; American spelling. Credit line, verbatim, wherever the data or
a result from it appears: `SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0`.

| # | Record (suggested id) | Component | Depends on | Hours | E2E asserts |
|---|---|---|---|---|---|
| R1 | `experiments-satnogs-optical-capture-20261104` | experiments + archive (coordinator installs) | none | 2 | 12 files of session 2026-11-03 match the manifest sha256; parquet rows = 62,928; 12 provenance rows |
| R2 | `modules-satnogs-optical-source-20261104` | modules `data-source/satnogs-optical-source` | R1 | 2 | Sentinel-6B night 2026-09-21: `$TDM` observation count equals the parquet rows; licence tags present |
| R3 | `modules-angles-only-od-flow-20261104` | modules `flows` + `analysis/estimation` | R2 | 2 | simulated Sentinel-6B arc recovers its orbit with no element set in the inputs |
| R4 | `experiments-satnogs-optical-ap-registered-20261104` | experiments | R1, R2, R3 | 2 (register), then run | plan hash frozen; 14 scorable arcs; EXCLUDE lists; no truth row read before the plan commit |
| R5 | `sdn-ap-site-observations-satnogs-optical-20261104` | sdn-ap site | R4, `sdn-ap-site-observations-entry-20261104` | 1.5 | credit line on the page; every number equals the registered result JSON |

## R1 `experiments-satnogs-optical-capture-20261104`: capture collector

**Change.** `experiments/satnogs-optical-capture/capture.mjs` (installed by the coordinator beside `bin/truth-backfill.sh`,
daily at 07:30Z after the 06:27Z dump, plus a re-poll at 19:30Z for late republications). It reads
`https://pub-ace0a918977843e5a065d3239b3ae105.r2.dev/products/index.json` with `If-None-Match`; for each session whose
`manifest_sha256` is new it fetches `manifest.json` and every product it names (parquet, tracks, TDM, IOD, station JSON),
checks each sha256, and writes
`/opt/data/sdn-archive/hac/satnogs-optical/session_date=<D>/generations/<generation_id>/...`. It never reads a recursive
Parquet wildcard, keeps the newest two generations per session, and never touches `hac/satnogs` (radio). One row per file
in `hac/satnogs-optical/provenance.jsonl`: `url`, `path`, `retrieved`, `sha256`, `bytes`, `session`, `generation_id`,
`correlation_run_id`, `manifest_sha256`, `licence: "CC-BY-SA-4.0"`, `licence_url`, `credit`, `class: "publish-with-credit"`.
No `/api/v1/elements` request, no login, no token. Backfill: 71 sessions, 951 MB (about 17 MB a night, 6 GB a year).
The collector is also added to the seal manifest feeds (`reference-states/seal/`).

**E2E** (`node experiments/satnogs-optical-capture/e2e.mjs`, root redirected to scratch): capture session 2026-11-03;
assert 12 files, every sha256 equals the manifest, `measurements.parquet` has `metrics.measurements` rows (62,928 for
generation `3f038700...`), `tracks.parquet` 544 rows, 12 provenance rows each with licence `CC-BY-SA-4.0` and the credit
line; a second run makes 0 downloads (ETag and `manifest_sha256` unchanged); a corrupted byte in a copy is refused.

## R2 `modules-satnogs-optical-source-20261104`: source module

**Why a module and not only `read_tdm`.** The dump's TDM lacks the per-observation sigma and the site, names an
object only when identified, and tags `exposure-start` epochs; `files/ccsds-messages` `read_tdm` parses the RADEC rows
(ANGLE_1/ANGLE_2) but cannot supply what the file does not state. `analysis/optical-astrometry` reduces frames, which the
network does not publish; it is not the route. `analysis/estimation` reads `$TDM` angles with the station from
`OBSERVER_X/Y/Z`, UTC epochs, and refuses a missing `TIMETAG_REF`.

**Change.** `data-source/satnogs-optical-source`: input one station-night of `measurements.parquet` rows (converted by the
caller to a typed `$SDN` batch record; the module has no Parquet reader) plus the station JSON site; output per
object-track `$TDM` (RADEC, `TIMETAG_REF = RECEIVE`, epochs moved to mid-exposure by `epoch_refers_to` and the
exposure time, `OBSERVER_X/Y/Z` from the site, the per-row sigma carried as `$EOO` uncertainty) and a typed station
timing record (declared sigma and bias) for the estimator's consider parameters. The licence travels in the
`IngestRequest` tags: `license=CC-BY-SA-4.0`, `license_url`, `credit`, `source=satnogs-optical`, `class=publish-with-credit`.
Configuration (minimum measurements per track, quarantine handling, object filter) arrives as a typed FlatBuffer
configuration message on a port, no JSON settings. Quarantined rows are refused by name. Marketing catalog entry or `notListed` reason.

**E2E.** Session 2026-09-21, Sentinel-6B (NORAD 66514), the first night of the 6-night arc: the module output has exactly
as many observations as `measurements.parquet` rows for that object and night (to be read from the capture; recorded in
the task at filing), the first observation's RA and Dec equal the parquet row to 1e-9 degrees, the epoch moved by the
declared `epoch_refers_to` offset, the `IngestRequest` tags equal the licence strings, and a quarantined row is refused with its name.

## R3 `modules-angles-only-od-flow-20261104`: the angles lane without an SGP4 prior (D3, default)

**Change.** A flow `source -> initial orbit -> batch -> $OCM` with no element-set input anywhere in it: initial orbit
by Gooding's angles-only method on `analysis/lambert-izzo` (the method now inside `analysis/optical-astrometry`,
factored out or called through its port), then `analysis/estimation` `fit_batch` with the FFM propagator on the arc's
`$TDM` angles, per-station time bias and the site as consider parameters, arcs of 24 h or more (several tracks per
night, revolution count resolved across the nightly gap by trying the candidate period set and taking the best
chi-square). Output a Cartesian `$OCM` that `sdn-ap` fit reads (the one-`$OCM` pipeline). Hard failure named (`no-converged-revolution-count`)
rather than a guess.

**E2E.** Observation-simulator angles for a Sentinel-6B-like orbit seen from stations 11 and 15 on the same six nights with
the sigma and timing noise of `coverage.json` (23 arcsec, 10 and 51 ms): the flow returns a converged `$OCM` whose
position error at the arc end is below a bound set by the first dry run on the simulation before any real row is read
(recorded in the task), and the same flow with a deliberately wrong revolution count returns the named failure.

## R4 `experiments-satnogs-optical-ap-registered-20261104`: registered test on objects with lawful truth

**Registration (2 h, before any truth row is read).** `PLAN.md` frozen and hashed with: the object list from
`coverage.json` (nine objects, Sentinel-6A and 6B carrying most; GNSS and Ajisai have too few points); the 15 arcs of 24 h or
more of which 14 have at least 72 h of truth after the arc (HY-2C 2026-10-09..11 excluded for want of truth); truth =
DORIS SP3, NORAD to file by prefix (`ssas6a`, `ssas6b`, `ssah2c`, `ssah2d`, `ssaswo`, `ssacs2`, `ssaja3`, `ssas3a`, `ssas3b` as in `coverage.json`); fit =
R3 flow to an `$OCM`, flown by `sdn-ap` 0.5.0 (module flight) and by nothing else; leads 1, 2 and 3 days from the
arc's last track (a lead counts from the fit's end); forward error only, 3D in the truth's RTN axes; comparator B =
the Space-Track set current at the arc's end flown by SGP4 (lettered source A, results only), sets never seed the angles
lane; hypotheses stated both ways (the angles-only AP is expected to be worse than B: E6 found SatNOGS Doppler 2.7 to
10.7 times worse; registered so a loss is a result); hold-outs excluded and asserted (EXCLUDE lists above, plus all
Starlink); a stop rule: arcs where R3 reports no converged revolution count are counted as failures, not dropped.
Identity is an association key only: the registration also names the selection effect (labels come from an SGP4 gate)
and states the object counts as a floor.
The run reads the truth only after the plan commit; the DORIS files for the nights after 2026-10-09 arrive with a 3 to 4
week lag, so a second cycle after 2026-11-15 adds the forward arcs (about 25 nights on Sentinel-6B and 6A from 10-10 to 11-03).

**E2E.** `node experiments/satnogs-optical-ap/check.mjs`: the plan hash equals the committed hash; the arc list recomputed
from the captured tracks equals the registered list (15 arcs, 14 scorable); no EXCLUDE NORAD or Starlink name in any
result row; every result row has a lead, a build hash and an input class `observations/CC-BY-SA-4.0`; the number of scored
cells equals the registered number.

## R5 `sdn-ap-site-observations-satnogs-optical-20261104`: site entry

**Change.** One entry on the observations page (shared with `sdn-ap-site-observations-entry-20261104`): SatNOGS Optical
by name with the credit line verbatim and the licence link; the registered result table from R4 (measured only, no future
tense), the object and arc counts, what the data are (astrometric RA/Dec from amateur stations, timing by NTP), the
identity-label caveat; no captured or derived batch is served (D19 default (a)); the marketing catalog entry or its
`notListed` reason; `visual_impact: sdn-ap site observations page` and `visual_checks` for the entry at desktop and phone widths.

**E2E.** Headless page check: the credit line string and licence URL are present; each number on the entry equals the
R4 result JSON; the page loads no SatNOGS URL at view time; the redaction gate passes on the published JSON.

## Decisions that stay with the owner

- D5 stays default (a): results credited, captured and derived batches local. Option (b), publishing derived batches under
  CC BY-SA 4.0, would let the site serve the arcs; blocks nothing above.
- D8 stays default: SatNOGS Doppler and SeeSat-L dropped.
- Objects without a name here: GPS 26407 and 28190 carry one point each and do not enter R4.

## Not proposed

- Identifying the 24,218 unlabeled tracks by predicting each truth object (DORIS, SP3) and matching angles: would raise
  the floor on nights with truth but is a selection method of its own; file only after R4 reports.
- Frames and crops (`/api/v1/tracks/{id}/crop`): not in the dumps; `analysis/optical-astrometry` has no input here.
- `/api/v1/elements` and `/api/v1/objects/{norad}/residuals`: redistribute CelesTrak and Space-Track material; not read.
