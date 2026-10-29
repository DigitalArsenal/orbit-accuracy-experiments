# Conjunction screen recall against a brute-force all-pairs reference

Pre-registered experiment ([PLAN](../../experiments/ca-screen-recall/PLAN.md), registered at commit `532bd3d4ec` before the run read the element sets). Run `2026-10-29T21:29:04.072Z`.
2,000 LEO objects of the Space-Track GP snapshot of 2026-10-29, 72 hours from 2026-10-30T00:00:00Z. Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org). Element sets are not reproduced here (README rule 4); only aggregates and the NORAD pairs of defects are.

## Result

**Pass.** All 132 reference events below 1 km were found by the screen at its defaults (recall 1.0).

**A second finding, below:** the screen's built-in SGP4 and the `propagator/sgp4` module disagree by a median 0.40 m and up to 107.2 m in position, more for element sets with a large BSTAR.

Recall of the module's `screen_catalog` against the exhaustive reference, by the reference's miss distance (a reference event is one local minimum of a pair's distance below 5 km):

| Arm | Miss band | Reference events | Found | Recall | 95 % lower bound |
| --- | --- | --- | --- | --- | --- |
| defaults (5 km) | below 1 km | 132 | 132 | 100.00 % | 0.9776 |
| defaults (5 km) | 1 to 5 km | 1,948 | 1,948 | 100.00 % | 0.9985 |
| defaults (5 km) | all | 2,080 | 2,080 | 100.00 % | 0.9986 |
| console (15 km) | below 1 km | 132 | 132 | 100.00 % | 0.9776 |
| console (15 km) | 1 to 5 km | 1,948 | 1,948 | 100.00 % | 0.9985 |
| console (15 km) | all | 2,080 | 2,080 | 100.00 % | 0.9986 |

The reference found 2,525 events: 132 below 1 km and 1,948 from 1 to 5 km inside the window, 445 from 5.0 to 5.5 km (near the threshold, never counted), 0 within 2 s of a window end (counted apart) and 0 outside it.

| Arm | Screen events | Matched | Near-threshold | At a window end | Beyond 5 km (not assessed) | False events | Duplicates | Objects excluded by the screen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| defaults | 2,080 | 2,080 | 0 | 0 | 0 | 0 | 0 | 0 |
| console | 15,004 | 2,080 | 0 | 0 | 12,924 | 0 | 0 | 0 |

## Finding: the screen's SGP4 and the SGP4 module disagree

The screen's built-in SGP4 (the conjunction module's vendored `deps/sgp4/libsgp4`) and `propagator/sgp4` (`foundation/sgp4-str3`), given the same OMM bytes, report different states for the same object at the same instant. At the instants of the screen's 2,080 matched events (4,160 object states) the position differs by a median 0.40 m, a 95th percentile of 5.44 m, a 99th of 9.22 m and at most 107.2 m; the velocity by a median 0.37 mm/s and at most 119.5 mm/s. This comparison has no independent reference, so it does not say which implementation is closer to where an object really was.

The overall comparison above is pre-registered (PLAN.md, propagator parity). The breakdowns below were added after the results were read (PLAN.md, amendment A1): the same states, binned by the size of the element set's BSTAR drag term (absolute value) and by the time from the element epoch to the event.

| Bin | Object states | Objects | Position median (m) | 95th (m) | Max (m) | Velocity max (mm/s) |
| --- | --- | --- | --- | --- | --- | --- |
| BSTAR under 0.001 | 3,155 | 854 | 0.32 | 0.99 | 4.81 | 5.51 |
| BSTAR 0.001 to 0.01 | 987 | 205 | 2.30 | 8.67 | 24.59 | 28.20 |
| BSTAR 0.01 to 0.1 | 15 | 8 | 4.66 | 30.00 | 30.00 | 33.94 |
| BSTAR 0.1 or more | 3 | 3 | 105.55 | 107.20 | 107.20 | 119.50 |
| Time since epoch 1 to 2 days | 645 | 335 | 0.33 | 1.57 | 107.20 | 119.50 |
| Time since epoch 2 to 3 days | 1,295 | 527 | 0.34 | 3.47 | 30.00 | 33.94 |
| Time since epoch 3 to 4 days | 1,569 | 602 | 0.47 | 6.43 | 24.59 | 28.20 |
| Time since epoch 4 days and more | 651 | 347 | 0.59 | 8.14 | 14.64 | 15.99 |

The differences grow steeply with BSTAR and more slowly with the time since the element epoch. The ten largest, by NORAD id:

| NORAD | Name | Position (m) | Velocity (mm/s) | BSTAR | Time since element epoch | Event TCA (UTC) |
| --- | --- | --- | --- | --- | --- | --- |
| 67024 | STARLINK-36192 | 107.20 | 119.50 | 0.1 or more | 1 to 2 days | 2026-10-30T01:23:31.049Z |
| 67087 | STARLINK-35842 | 105.55 | 117.89 | 0.1 or more | 1 to 2 days | 2026-10-30T11:24:00.684Z |
| 53018 | STARLINK-4279 | 30.00 | 33.94 | 0.01 to 0.1 | 2 to 3 days | 2026-10-31T02:06:05.752Z |
| 61542 | STARLINK-11322 | 24.59 | 28.20 | 0.001 to 0.01 | 3 to 4 days | 2026-11-01T08:38:44.616Z |
| 61542 | STARLINK-11322 | 23.76 | 26.93 | 0.001 to 0.01 | 3 to 4 days | 2026-11-01T06:21:05.196Z |
| 63059 | STARLINK-11509 | 22.15 | 25.32 | 0.001 to 0.01 | 3 to 4 days | 2026-10-30T19:30:32.192Z |
| 100756 | STARLINK-38321 | 17.15 | 19.50 | 0.001 to 0.01 | 2 to 3 days | 2026-10-31T18:40:31.805Z |
| 63556 | STARLINK-11626 | 16.34 | 18.60 | 0.001 to 0.01 | 2 to 3 days | 2026-10-31T01:18:59.859Z |
| 63556 | STARLINK-11626 | 16.32 | 18.81 | 0.001 to 0.01 | 2 to 3 days | 2026-10-31T02:04:43.909Z |
| 63059 | STARLINK-11509 | 16.13 | 18.48 | 0.001 to 0.01 | 2 to 3 days | 2026-10-30T08:39:23.573Z |

**It explains the largest miss differences.** The screen's miss distance is the distance of its two states; the reference's, of the module's two. At 2,080 of the 2,080 matched events the two differ by no more than the sum of the two objects' state differences (plus 1 m for the milliseconds between the two TCAs). All 61 events whose miss differs by more than 5 m involve an object with a BSTAR of 0.001 or more, and in them the miss difference is a median 0.74 (at most 0.98) of that sum. The ten largest miss differences:

| NORAD pair | Band | Reference miss (m) | Miss difference (m) | Objects: state difference (m), BSTAR | Sum of the state differences (m) |
| --- | --- | --- | --- | --- | --- |
| 51126 / 67024 | 1 to 5 km | 4106.5 | -57.96 | 67024: 107.20, 0.1 or more; 51126: 0.22, under 0.001 | 107.41 |
| 62555 / 63059 | 1 to 5 km | 2503.7 | -17.51 | 62555: 9.58, 0.001 to 0.01; 63059: 22.15, 0.001 to 0.01 | 31.73 |
| 58873 / 59554 | 1 to 5 km | 3541.4 | 16.53 | 59554: 8.98, 0.001 to 0.01; 58873: 8.92, 0.001 to 0.01 | 17.90 |
| 59897 / 67034 | 1 to 5 km | 4022.9 | 15.75 | 59897: 13.07, 0.001 to 0.01; 67034: 5.10, 0.001 to 0.01 | 18.16 |
| 100558 / 101004 | 1 to 5 km | 4138.0 | 15.42 | 101004: 12.81, 0.01 to 0.1; 100558: 3.13, 0.001 to 0.01 | 15.94 |
| 100558 / 101004 | 1 to 5 km | 4371.2 | -15.13 | 101004: 13.14, 0.01 to 0.1; 100558: 3.35, 0.001 to 0.01 | 16.49 |
| 58873 / 59554 | 1 to 5 km | 3557.8 | -14.94 | 59554: 8.14, 0.001 to 0.01; 58873: 8.11, 0.001 to 0.01 | 16.25 |
| 59897 / 67034 | 1 to 5 km | 3010.2 | 14.77 | 59897: 14.64, 0.001 to 0.01; 67034: 5.63, 0.001 to 0.01 | 20.26 |
| 58873 / 59554 | 1 to 5 km | 3684.9 | 14.75 | 59554: 8.15, 0.001 to 0.01; 58873: 7.53, 0.001 to 0.01 | 15.68 |
| 100558 / 101004 | 1 to 5 km | 3429.1 | 14.38 | 101004: 12.52, 0.01 to 0.1; 100558: 3.15, 0.001 to 0.01 | 15.67 |

## Defects

None: every reference event was found in every arm, and every screen event below 5 km was matched.

## TCA and miss-distance differences (screen minus reference), matched events

Absolute differences; the reference's TCA has a resolution of 1 ms. Events beyond 1 s or 5 m are flagged.

| Arm, band | Matched | TCA median (s) | TCA 95th (s) | TCA max (s) | Miss median (m) | Miss 95th (m) | Miss max (m) | Mean signed miss (m) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| defaults, below 1 km | 132 | 0.0002 | 0.0005 | 0.0010 | 0.343 | 3.040 | 12.817 | -0.023 |
| defaults, 1 to 5 km | 1,948 | 0.0002 | 0.0007 | 0.8025 | 0.314 | 3.816 | 57.961 | 0.006 |
| defaults, all | 2,080 | 0.0002 | 0.0007 | 0.8025 | 0.316 | 3.741 | 57.961 | 0.004 |
| console, below 1 km | 132 | 0.0002 | 0.0005 | 0.0010 | 0.343 | 3.040 | 12.817 | -0.023 |
| console, 1 to 5 km | 1,948 | 0.0002 | 0.0007 | 0.8025 | 0.314 | 3.816 | 57.961 | 0.006 |
| console, all | 2,080 | 0.0002 | 0.0007 | 0.8025 | 0.316 | 3.741 | 57.961 | 0.004 |

Flagged in defaults: 61 of 2,080.

| NORAD pair | Band | Reference TCA (UTC) | Reference miss (m) | TCA difference (s) | Miss difference (m) |
| --- | --- | --- | --- | --- | --- |
| 51126 / 67024 | 1 to 5 km | 2026-10-30T01:23:31.055Z | 4106.5 | -0.0066 | -57.961 |
| 62555 / 63059 | 1 to 5 km | 2026-10-30T19:30:32.193Z | 2503.7 | -0.0008 | -17.514 |
| 58873 / 59554 | 1 to 5 km | 2026-11-01T23:37:59.443Z | 3541.4 | 0.0003 | 16.533 |
| 59897 / 67034 | 1 to 5 km | 2026-11-01T18:10:54.124Z | 4022.9 | -0.0002 | 15.754 |
| 100558 / 101004 | 1 to 5 km | 2026-10-30T20:34:53.333Z | 4138.0 | -0.0010 | 15.424 |
| 100558 / 101004 | 1 to 5 km | 2026-10-30T21:20:57.398Z | 4371.2 | -0.0005 | -15.134 |
| 58873 / 59554 | 1 to 5 km | 2026-11-01T18:55:34.359Z | 3557.8 | 0.0002 | -14.939 |
| 59897 / 67034 | 1 to 5 km | 2026-11-01T20:32:05.314Z | 3010.2 | -0.0010 | 14.773 |
| 58873 / 59554 | 1 to 5 km | 2026-11-01T15:00:13.623Z | 3684.9 | -0.0003 | 14.755 |
| 100558 / 101004 | 1 to 5 km | 2026-10-30T19:48:49.431Z | 3429.1 | -0.0005 | 14.378 |
| 58873 / 59554 | 1 to 5 km | 2026-11-01T13:26:05.184Z | 1553.5 | -0.0002 | 14.167 |
| 58873 / 59554 | 1 to 5 km | 2026-11-01T22:03:51.098Z | 1329.2 | 0.0001 | 13.739 |
| 58873 / 59554 | 1 to 5 km | 2026-11-01T20:29:42.737Z | 1413.3 | 0.0001 | -13.397 |
| 58873 / 59554 | 1 to 5 km | 2026-11-01T10:17:48.253Z | 2626.5 | -0.0004 | -13.284 |
| 62099 / 63059 | 1 to 5 km | 2026-10-30T08:39:23.573Z | 4813.6 | -0.0008 | -13.050 |
| 58873 / 59554 | 1 to 5 km | 2026-11-01T08:43:39.762Z | 4638.5 | 0.0002 | -12.858 |
| 58873 / 59554 | below 1 km | 2026-11-01T11:51:56.726Z | 600.4 | 0.0002 | -12.817 |
| 62041 / 66608 | 1 to 5 km | 2026-11-01T18:01:43.922Z | 3441.9 | 0.0000 | -12.446 |
| 62041 / 66608 | 1 to 5 km | 2026-11-01T14:53:27.385Z | 3462.6 | 0.0002 | 11.731 |
| 61927 / 63848 | 1 to 5 km | 2026-11-01T17:24:54.791Z | 1840.7 | -0.0000 | -10.750 |
| 53018 / 58903 | 1 to 5 km | 2026-10-31T02:06:05.749Z | 3804.5 | 0.0023 | -10.433 |
| 61927 / 63848 | 1 to 5 km | 2026-11-01T15:50:46.848Z | 1973.7 | 0.0004 | 10.387 |
| 61542 / 101024 | 1 to 5 km | 2026-11-01T06:21:05.198Z | 1993.5 | -0.0015 | 9.870 |
| 59270 / 59391 | 1 to 5 km | 2026-11-01T20:40:33.358Z | 3937.0 | 0.0008 | 9.814 |
| 59270 / 59391 | 1 to 5 km | 2026-11-01T16:46:06.253Z | 3822.3 | 0.0003 | 9.416 |

Flagged in console: 61 of 2,080.

The same events as in arm defaults.

1 matched event(s) differ in TCA by more than 10 ms (post-hoc): NORAD 69529 / 69530, relative speed 2.91 m/s, TCA -0.802 s, miss -0.457 m. A pair that barely moves relative to itself has a flat minimum, where the TCA is poorly determined and the miss distance is not.

## Probability of collision

The events carry no covariance, so the screen reports the Alfano maximum. Each matched event's value is compared with the module's `alfano_max_probability` at the screen's own miss and combined radius (they must be identical) and at the reference's miss (a difference of a few decimetres in the miss shows as a relative difference in the probability).

| Arm | Compared | At the screen's miss: median / max relative difference | At the reference's miss: median / 95th / max relative difference |
| --- | --- | --- | --- |
| defaults | 2,080 | 0.00e+0 / 0.00e+0 | 2.23e-4 / 3.28e-3 / 4.72e-2 |
| console | 2,080 | 0.00e+0 / 0.00e+0 | 2.23e-4 / 3.28e-3 / 4.72e-2 |

## Cost and settings

- Screen (`screen_catalog`, 8 module threads, coarse step 60 s, refinement tolerance 0.001 s): arm defaults, threshold 5 km, 1 call: 22.4 s, 1,999,000 pairs screened, 384,424 k-d tree candidates, 5,045,127 encounters refined, 8,642,000 propagations; arm console, threshold 15 km, 3 calls: 369.0 s, 5,997,000 pairs screened, 966,666 k-d tree candidates, 15,370,085 encounters refined, 8,646,000 propagations.
- Reference (SGP4 module, sample step 10 s, refinement steps 1 s, 0.05 s, 0.001 s; SGP4 has no integrator, one thread): dense pass 187 s over 25,927 samples of 2,000 objects, 815,132 pair samples below 100 km, 297,766 candidates, kept 8,227 after s1, 3,031 after s2, 2,525 after s3; refinement 36 s in 309,313 module calls.
- Guards: largest object speed 7.974 km/s (registered bound 8.5 km/s); the module's ephemeris lines against its single-epoch states: at most 0.000 m; one instant answered twice at a chunk boundary differs by at most 0.321 m.
- Subset: 27,685 eligible objects, ranked by SHA-256 of `ca-screen-recall-20261029:<NORAD_CAT_ID>`, first 2,000; list SHA-256 `1c339a56875a9a3d0889a671b9d6928b82ea81c1a3718a60a2b7c41e1b42a83c`.

## Findings on the modules

- A single 72 h `screen_catalog` call at the console's 15 km threshold trapped in the module (WebAssembly `unreachable`) in a pre-freeze probe, where 24 h calls complete; a refusal would be the right answer to memory exhaustion. This is why the console arm runs as 24 h calls (PLAN.md, Disclosures).
- The `propagator/sgp4` isomorphic artifact lays its response payload arena out on 4 bytes, which the current module SDK decoder rejects; the harness pads the copy, bytes unchanged (PLAN.md, Disclosures).

## Provenance

- Snapshot `spacetrack/gp/2026/2026-10-29.json.gz`, SHA-256 `a0ff07183325e857180a822e6799713f66cbbfa28ed82f6d9996e02672020a9d`, 32,823 records.
- space-data-network-modules commit `44ce9d27a1214c8a4740b5f30d831b0e6a7248f0`; artifacts read from that commit, not from a working tree: conjunction-assessment 0.9.0 `15e7e8df0225ebf0fa5d6cbe22fdebe612b022bfcae1631594924e3239b090bd`, propagator/sgp4 1.3.1 `d9fdd0575d8dc84fa418d1ec4a5e0f14c9a02683eaeec0904b53a0a18b239a97`.
- Packages: space-data-module-sdk 0.9.12, spacedatastandards.org 1.271.0 (screen) and 1.140.0 (SGP4 answers). Node v25.4.0, 28 logical CPUs, 1-minute load average 23.8 at the start and 54.3 at the end (the host was shared).
- Experiment commit `532bd3d4ec`; run sources: PLAN.md `98b191b674ef`, config.json `29f61ff9428b`, common.mjs `c152c6086cc7`, access.mjs `090e17a4818f`, reference.mjs `71b71f9d88b6`, compare.mjs `685cea16de5f`, run.mjs `5b0da75b6adf`.
- Files: `metrics.json`, `manifest.json`, `parity-diagnostic.json` (post-hoc) and `replay.json` in this folder; the subset, the reference events, the screen events and the matches stay under `runs/` (element-set-derived).

## What this does and does not show

- It shows whether the screen finds what an exhaustive search over the same SGP4 element sets finds, and how closely their TCA, miss distance and Pc agree. It does not measure accuracy against where objects were: both sides use the same element sets.
- One snapshot, one 2,000-object subset, one 72-hour window; `screen_catalog` (the single-call screen), not the resident windowed screen the console uses; only events below 5 km are assessed.
- A recall of 1.0 over 132 events below 1 km excludes, at 95 %, a miss rate above 2.24 % in that band.
- A recall of 1.0 over all 2,080 events below 5 km excludes, at 95 %, a miss rate above 0.14 %.

