# SatNOGS Optical survey

Read-only, 2026-11-04. Every fact below was read from a public SatNOGS Optical page or file on that date;
nothing was written under `/opt/data/sdn-archive`. Samples sit in the lane's scratch only. Not fetched:
`/api/v1/elements` (redistributed CelesTrak and Space-Track sets), CelesTrak, Space-Track, any login.
`coverage.json` is built by `build-coverage.py` from the 71 `tracks.parquet` files of the index.

## What the network publishes

SatNOGS Optical (a Libre Space Foundation project, https://optical.satnogs.org) publishes **astrometric measurements**,
not images: a station turns each satellite trail into RA, Dec, a time and an uncertainty per point
(https://optical.satnogs.org/ home page; https://optical.satnogs.org/data). One nightly "dump" per session (the UTC
date a night started) holds, per session:

| Product | Format | What it carries |
|---|---|---|
| `measurements.parquet` | Apache Parquet, one row per measurement | `t_utc`, `ra_deg`, `dec_deg` (ICRS, decimal degrees), `sigma_ra_arcsec`, `sigma_dec_arcsec`, `mag`, `snr`, pixel x/y, `timing_source`, `timing_sync_state`, `timing_sigma_ms`, `epoch_refers_to`, `bias_applied_ms`, plate-solution fit (`cal_wcs_rms_arcsec`, `cal_nstars`, `cal_solver`, `cal_distortion`), `config_version`, `quarantined`, the correlation (`correlation_object_norad_id`, `advisory_norad_id`, `advisory_elset_id`, `correlation_run_id`, `correlation_version`) |
| `tracks.parquet` | Parquet, one row per track | station, first and last epoch, `object_norad_id`, `object_id_class`, `unk_designation`, `stellar`, `tdm_published`, `tdm_observations`, `iod_number`, `correlation_method` and `correlation_elset_id` |
| `tdm/station-<id>-<date>.tdm` | CCSDS TDM v2.0 KVN, one file per station and night, one segment per correlated track | `ANGLE_TYPE = RADEC`, `REFERENCE_FRAME = EME2000`, `TIME_SYSTEM = UTC`, `PARTICIPANT_1 = SATNOGS-OPTICAL-<id>`, `PARTICIPANT_2 = <NORAD>`, `MODE = SEQUENTIAL`, `PATH = 2,1`, `ANGLE_1`/`ANGLE_2` rows |
| `iod/station-<id>-<date>.iod` | IOD lines (visual-observer format), fixed columns | lower precision; unidentified tracks get session-local numbers from 90000 |
| `stations/station-<id>.json` | JSON | site (lat, lon, height, source, sigma), instrument, timing, measured astrometric and timing residuals |
| `manifest.json` | JSON | sha256 and bytes of every product, per-station counts, correlation metrics, epoch collisions, conformance status |

Corrections to the public-sources plan: "TDM v2 RA/Dec station-nights, CC BY-SA 4.0" is **confirmed**, with
five limits. (1) The TDM carries **no per-observation sigma** ("the published TDM does not carry per-observation
uncertainty"; sigma is in the parquet only). (2) It names the station only as `SATNOGS-OPTICAL-<id>`; the site is in
`stations/station-<id>.json`. (3) The TDM states EME2000 where the parquet states ICRS (sub-arcsecond difference, below
the 7 to 23 arcsecond sigma). (4) TDM epochs follow the segment's `epoch_refers_to`: `exposure-start` in the sample
(half an integration early), `exposure-mid` or `frame-arrival` for other stations; read it from the parquet row, not the
TDM. (5) A track with no object identity is **not in the TDM** (163 of 544 tracks on 2026-11-03); the parquet and IOD
carry it. Raw frames are not published (a per-track crop is `GET /api/v1/tracks/{id}/crop`; not used).
The network states "orbit determination from these measurements is not built yet"; `GET /api/v1/orbit-solutions`
returned `count: 0` on 2026-11-04.

## Identity is an SGP4 label

`object_norad_id` is assigned by the network's correlator, `correlation_method = sgp4-topocentric-v1`, against
element sets named in `correlation_elset_id` (`spacetrack-<time>+mccants-<time>`, `celestrak-<date>`, `current.tle`).
Of 55,361 tracks in 71 sessions, 28,540 carry a NORAD id (402 `catalogue`, 161 `analyst`, the rest correlated), 24,218
are unidentified (`UNK-...`; 536,346 measurements) and 2,603 are stellar. The measurements themselves (RA, Dec, time) are
not SGP4 products, but **which tracks are labeled** depends on an SGP4 gate: an object whose public set is poor is more
likely unlabeled. The label is an association key only, never truth, and counts of objects here are a floor.

## Licence

Quoted from https://optical.satnogs.org/data and from `licence` in
https://pub-ace0a918977843e5a065d3239b3ae105.r2.dev/products/index.json (identical in every dump manifest):

> CC BY-SA 4.0 ... reuse and sell freely, credit the source, and share a database built from a substantial part of
> this one on the same terms. An orbit fit, a plot or a paper made from the data owes the credit and nothing else.
> Use anything here, including commercially. Credit the database rather than a station:
> **SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0**

Machine form: `spdx CC-BY-SA-4.0`, `url https://creativecommons.org/licenses/by-sa/4.0/`, `produced_works`: "Outputs
computed from this data (orbit fits, screenings, plots, papers) owe the credit line and carry no share-alike obligation.
Share-alike attaches to a database built from a substantial portion of this one." Every parquet file repeats the
licence and credit in its file metadata and every TDM in its header comments. Element sets "from CelesTrak and
Space-Track are redistributed under their own terms and are not covered"; the dumps do not contain them. The service
code is AGPL-3.0 (https://gitlab.com/librespacefoundation/satnogs-optical): no code from it enters a module.
Consequence for D19: the captured copy is a database under CC BY-SA 4.0 (credit, share-alike if ever redistributed);
fits, scores and plots owe the credit line only. Default (a) stands: results with the source credited, captured and
derived batches local.

## Volume, range, cadence

| Item | Value (2026-11-04) |
|---|---|
| Sessions published | 71, 2026-08-23 through 2026-11-03 (index `count: 71`, https://pub-ace0a918977843e5a065d3239b3ae105.r2.dev/products/index.json; the `/data` page lists the latest 50) |
| Measurements | 3,460,174 (sum of the 71 `tracks.parquet`; the home page says "3,460,174 measurements published since 2026-08-23") |
| Tracks | 55,361 |
| Published bytes, all products | 951 MB (sum of index `bytes`); 17.7 MB for the latest session (parquet 6.6 MB, TDM 6.8 MB, IOD 4.2 MB) |
| Latest session | 2026-11-03: 62,928 measurements, 544 tracks, 3 stations, 294 distinct objects, 158 new unknown targets |
| Per-night range | 150 to 183,937 measurements (median 40,985) |
| Stations registered, with data | 11 registered, 8 with data (below) |
| Distinct identified objects | 8,496 (3,872 on two or more nights, 209 on ten or more) |

**Cadence.** A dump is published when a session's correlation batch closes; the home page shows `last dump
2026-11-04 06:27Z` for session 2026-11-03, about 06:30Z daily. The correlator runs about hourly (`correlation_run_id`
1850 to 1863 inside 6 hours on 2026-11-04) and a session is **regenerated** when a late station uploads or correlation
improves: session 2026-10-12 was republished on 2026-11-04 (23 days late) and 2026-10-10 on 2026-11-02. A manifest has a
new `generation_id` and `manifest_sha256`; "retained generations must not be combined with a recursive Parquet wildcard".
Measurements are immutable per row; a regenerated product "is traceably different, never silently changed".
`products/index.json` is `Cache-Control: public, max-age=300` with an ETag. No keys and no rate limit are stated; this read made fewer than 150 requests.

## How to page it

1. `GET https://pub-ace0a918977843e5a065d3239b3ae105.r2.dev/products/index.json`: every session with `manifest`,
   `manifest_sha256`, `measurements`, `tracks`, `bytes`, `published_at`, `correlation_run_id`.
2. `GET https://optical.satnogs.org/api/v1/dumps/<YYYY-MM-DD>`: the same session from the API, with the product list
   (kind, scope, station, sha256, URL). `GET /api/v1/dumps` lists generations (100 shown; several per session).
3. Fetch the manifest's files and check each sha256. One track on request: `/api/v1/tracks/{id}.tdm`, `.iod`.
4. API base https://optical.satnogs.org/api/v1/ (OpenAPI at `/api/v1/openapi.json`, 50 paths, reads are public and
   unauthenticated); JSON, ISO-8601 UTC, cursor pagination, ETags.

## Stations

Positions are owner-declared unless marked GNSS (`/api/v1/stations`, 2026-11-04).

| Id | Name | Site (lat, lon, height m) | Source | First to last session | Measurements |
|---|---|---|---|---|---|
| 4 | optical-bench1 | 36.9706, 22.1465, 6 | owner | 2026-08-23 to 09-12 | 34,376 |
| 7 | Drachten | 53.1094, 6.1076, 46 | owner | 2026-08-26 to 11-03 | 152,306 |
| 11 | dwingeloo | 52.8344, 6.3785, 10 | owner | 2026-08-26 to 11-03 | 1,774,821 |
| 12 | optical-bench2 | 36.9705, 22.1464, 20.6 | GNSS | 2026-08-31 to 10-12 | 932,673 |
| 13 | Mpakano | 37.2592, 22.5874, 1441 | GNSS | 2026-09-02 | 77,770 |
| 14 | optical-sky-rpihq | 36.9708, 22.1465, 29.7 | GNSS | 2026-09-06 to 09-12 | 3,859 |
| 15 | Satnogs-optical | 52.0000, 4.1980, 1.2 | owner | 2026-09-06 to 11-03 | 484,221 |
| 16 | 5df8906db86b | 52.5274, 13.3240, 50 | owner | 2026-10-08 | 148 |

Stations 2, 3 and 9 have no data. Three stations produce nearly all current nights (7, 11, 15; Netherlands).

## Measurement quality (session 2026-11-03, 62,928 rows)

Median sigma 23 arcsec at station 11 and 22 arcsec at 15, 7 arcsec at station 7 (pixel scale 39.5 arcsec at 7).
Timing is NTP: declared sigma 10 ms (station 11) to 51 ms (7, 15); the network's own check on station 7 measured (session 2026-10-29) a
timing bias of -167 ms and called it `trustworthy: false`, and the astrometric residual against the correlation's set
(which includes that set's error) was 153 arcsec median, 1,046 arcsec RMS. A 100 ms timing error is 0.7 km along track
at LEO. Epoch semantics differ by station (`exposure-mid` 56 %, `frame-arrival` 42 %, `exposure-start` 2 % of that
session's rows). Median identified track: 12 s, 102 measurements; 90th percentile 40 s; longest 450 s.

## Objects observed and lawful truth

`coverage.json` crosses the 8,496 identified objects with the archive's truth: ESA final GNSS SP3
(PRN to NORAD through `igs_satellite_metadata.snx`), ILRS SP3 (11 geodetic spheres), IDS DORIS SP3, Sentinel-1
POEORB (the archive's TESS and THEMIS nodes and the 2025-only COSMIC-2 files cannot match: none of those NORAD ids is
observed). Holds applied: the six Galileo (43567, 37847, 41862, 41174, 43055, 41175: none observed), Swarm and
GRACE-FO excluded at every date (the three Swarm NORAD ids 39451, 39452, 39453 were observed on 2026-09-05, 10-05, 10-14 and 10-31 and are listed
as held, not counted), every Starlink (no Starlink product is read or mapped). A **night** is a session in which
the object has an identified track whose first and last epoch lie inside one truth product.

| NORAD | Object | Truth | Nights seen | Nights with truth | With 20+ measurements | Longest consecutive run | Measurements with truth |
|---|---|---|---|---|---|---|---|
| 66514 | Sentinel-6B | DORIS | 33 | 24 | 23 | 6 nights, 118 h | 10,908 |
| 46984 | Sentinel-6A | DORIS | 28 | 21 | 21 | 6 nights, 118 h | 10,585 |
| 46469 | HY-2C | DORIS | 17 | 10 | 10 | 3 nights, 41 h | 2,998 |
| 54754 | SWOT | DORIS | 9 | 9 | 9 | 2 nights, 24 h | 2,511 |
| 36508 | CryoSat-2 | DORIS | 8 | 6 | 6 | 1 | 1,270 |
| 41240 | Jason-3 | DORIS | 12 | 5 | 2 | 2 nights, 28 h | 248 |
| 43437 | Sentinel-3B | DORIS | 4 | 4 | 4 | 2 nights, 25 h | 725 |
| 41335 | Sentinel-3A | DORIS | 3 | 3 | 3 | 1 | 101 |
| 48621 | HY-2D | DORIS | 2 | 1 | 1 | 1 | 168 |
| 16908 | Ajisai | ILRS | 4 | 4 | 0 | 1 | 7 |
| 26407 | GPS (PRN per file) | GNSS SP3 | 1 | 1 | 0 | 1 | 1 |
| 28190 | GPS (PRN per file) | GNSS SP3 | 1 | 1 | 0 | 1 | 1 |

**12 objects, 89 object-nights, 29,523 measurements with truth; 9 objects and 79 object-nights with 20 or more
measurements.** Not observed at all: ISS, Sentinel-1A/1C/1D, LAGEOS, Etalon, Starlette, Stella, LARES, WESTPAC,
LARETS, COSMIC-2, TESS, THEMIS, GRACE-FO. GNSS satellites are essentially unseen (2 GPS satellites, one point each):
the network is a LEO network. Sentinel-6A and 6B are the standout: about 2 h of passes per night
(median per-night span 1.9 h, up to 3.9 h) from four stations.
Truth lags the nights: DORIS ends 2026-10-09 to 10-18 (3 to 4 weeks), ILRS 2026-10-07 (Ajisai) to about 10-24 (LAGEOS, Etalon weekly arcs), ESA final GNSS 2026-10-30,
Sentinel-1 POD 2026-10-15; the daily truth collectors (O5) keep adding, so the same nights gain truth later.
Arcs of **24 h or more** over consecutive nights with truth: **15** (Sentinel-6B 4, Sentinel-6A 4, HY-2C 2,
SWOT 2, Jason-3 2, Sentinel-3B 1); **14** have at least 72 h of truth after the arc's last track (the 15th, HY-2C
2026-10-09..11, has 3 h). A multi-night arc is one 2-hour cluster per night about 22 h apart: an angles-only
fit must resolve the revolution count across the gaps.

## Findings that bind the next records

1. Format is open and stable (Parquet and TDM v2, sha256-checked, content-addressed generations): a collector is simple.
2. The licence permits the use; share-alike binds the captured database, not the results.
3. The TDM alone cannot feed an estimator: it lacks sigma and the site. A source module must read the parquet or join
   the TDM with the station JSON and the parquet sigma.
4. Observation counts are large (3.5 million) but the truth overlap is small (12 objects, nights on Sentinel-6A/B,
   HY-2C and SWOT carry almost all of it). A registered test is feasible on about nine objects, not on a catalog.
5. Station timing is the largest error in the data at LEO (0.1 s is 0.7 km along track); a fit must carry per-station
   time bias as a consider parameter, as `analysis/optical-astrometry` does for video.
6. Identity is an SGP4 label; unlabeled tracks (48 %) may include truth objects. Identifying by the truth ephemeris itself
   (predict each truth object, match tracks by angles) would add nights, but is a separate, later record.
