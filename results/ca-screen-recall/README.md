# Conjunction screen recall against a brute-force all-pairs reference

**Does CA 0.17.0 find every event the exhaustive search finds? Yes.** All 2,080 reference events below 5 km were found, 132 of 132 below 1 km; 0 false events.

Amendment A2 of the pre-registered experiment ([PLAN](../../experiments/ca-screen-recall/PLAN.md), registered at commit `63f98fd082` before the run). The same test, data and pass rule as the [0.9.0 result](README-0.9.0.md), on the build to publish. Run `2026-11-03T10:16:42.102Z`.
2,000 LEO objects of the Space-Track GP snapshot of 2026-10-29, 72 hours from 2026-10-30T00:00:00Z. Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org). Element sets are not reproduced here (README rule 4); only aggregates and the NORAD pairs of defects are.

## Result

**Pass.** All 132 reference events below 1 km were found by the screen at its defaults (recall 1.0).

| Build | Below 1 km | 1 to 5 km | Misses, both arms | False events, both arms | Matched events beyond 1 s or 5 m | Failed pair evaluations | Objects on the excluded port | Reference events out of the denominator |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 0.9.0 | 132 / 132 | 1,948 / 1,948 | 0 | 0 | 61 | 0 | 0 | 0 |
| 0.17.0 | 132 / 132 | 1,948 / 1,948 | 0 | 0 | 0 | 0 | 0 (none) | 0 |

Recall of the module's `screen_catalog` against the exhaustive reference, by the reference's miss distance (a reference event is one local minimum of a pair's distance below 5 km):

| Arm | Miss band | Reference events | Found | Recall | 95 % lower bound |
| --- | --- | --- | --- | --- | --- |
| defaults (5 km) | below 1 km | 132 | 132 | 100.00 % | 0.9776 |
| defaults (5 km) | 1 to 5 km | 1,948 | 1,948 | 100.00 % | 0.9985 |
| defaults (5 km) | all | 2,080 | 2,080 | 100.00 % | 0.9986 |
| console (15 km) | below 1 km | 132 | 132 | 100.00 % | 0.9776 |
| console (15 km) | 1 to 5 km | 1,948 | 1,948 | 100.00 % | 0.9985 |
| console (15 km) | all | 2,080 | 2,080 | 100.00 % | 0.9986 |

The reference found 2,525 events: 132 below 1 km and 1,948 from 1 to 5 km inside the window, 445 from 5.0 to 5.5 km (near the threshold, never counted), 0 within 2 s of a window end (counted apart) and 0 outside it. Its events are byte-identical to the 0.9.0 run's (SHA-256 `8a8f862cbd37`): the reference did not move.

| Arm | Screen events | Matched | Near-threshold | At a window end | Beyond 5 km (not assessed) | False events | Duplicates | Objects on the excluded port |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| defaults | 2,080 | 2,080 | 0 | 0 | 0 | 0 | 0 | 0 |
| console | 15,003 | 2,080 | 0 | 0 | 12,923 | 0 | 0 | 0 |

## What moved between builds, event by event

The screen's events on 0.17.0 against 0.9.0, paired one to one by NORAD pair and TCA within 60 s, nearest first. Between these builds the screen's SGP4 changed (CA 0.11.0), so every value may move; an event that appears or disappears is the result to read.

| Arm | Events on 0.9.0 | Events on 0.17.0 | Paired | Only on 0.9.0 | Only on 0.17.0 | \|ΔTCA\| median / p95 / max (s) | \|Δmiss\| median / p95 / max (m) | \|Δspeed\| max (m/s) |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| defaults | 2,080 | 2,080 | 2,080 | 0 | 0 | 0.0000 / 0.0005 / 0.8195 | 0.324 / 3.764 / 57.911 | 0.0006 |
| console | 15,004 | 15,003 | 15,003 | 1 | 0 | 0.0000 / 0.0004 / 3.6862 | 0.275 / 3.271 / 268.745 | 0.0158 |

| Arm | Side | NORAD pair | TCA (UTC) | Miss (m) | Speed (m/s) |
| --- | --- | --- | --- | ---: | ---: |
| console | only on 0.9.0 | 60417 / 67574 | 2026-11-01T13:40:54.697Z | 14999.3 | 14220.8 |

## The screen's SGP4 against the SGP4 module

The screen's states against `propagator/sgp4` 1.3.1 at the screen's TCAs, given the same OMM bytes (pre-registered, PLAN.md, propagator parity; it has no independent reference, so it does not say which is closer to where an object was). At 4,160 object states the position differs by a median 0.0756 m, a 95th percentile of 0.1374 m, a 99th of 0.1490 m and at most 0.1525 m; the velocity by a median 0.08407 mm/s and at most 0.17038 mm/s. On 0.9.0, with the screen's vendored libsgp4: median 0.40 m, at most 107.2 m. Since CA 0.11.0 the screen runs `foundation/sgp4-str3` in AFSPC mode; `propagator/sgp4` 1.3.1 runs it in improved mode.

## Objects on the excluded port

Since CA 0.13.0 the port lists an object screened in part as well as one excluded (the module's README). A reference event leaves the denominator only when a listing of its own call says its object was not screened at its TCA.

- Arm defaults: 0 objects, 0 records (none); reference events out of the denominator: 0 (none).
- Arm console: 0 objects, 0 records (none); reference events out of the denominator: 0 (none).

**Proof by a fabricated listing** (`listing-proof.mjs`, part of the E2E): 5 invented reference events below 1 km, 2 of them dropped by the screen while their object was still screened. The harness of `5612dc1`, which read every listed object as excluded, answers 1 of 1, pass, 0 misses: a false pass. This harness answers 1 of 3, fail, 2 misses.

## Defects

None: every reference event was found in every arm, and every screen event below 5 km was matched.

## TCA and miss-distance differences (screen minus reference), matched events

Absolute differences; the reference's TCA has a resolution of 1 ms. Events beyond 1 s or 5 m are flagged.

| Arm, band | Matched | TCA median (s) | TCA 95th (s) | TCA max (s) | Miss median (m) | Miss 95th (m) | Miss max (m) | Mean signed miss (m) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| defaults, below 1 km | 132 | 0.0003 | 0.0005 | 0.0005 | 0.031 | 0.150 | 0.183 | -0.001 |
| defaults, 1 to 5 km | 1,948 | 0.0002 | 0.0005 | 0.0170 | 0.023 | 0.146 | 0.244 | -0.003 |
| defaults, all | 2,080 | 0.0002 | 0.0005 | 0.0170 | 0.023 | 0.146 | 0.244 | -0.003 |
| console, below 1 km | 132 | 0.0003 | 0.0005 | 0.0005 | 0.031 | 0.150 | 0.183 | -0.001 |
| console, 1 to 5 km | 1,948 | 0.0002 | 0.0005 | 0.0170 | 0.023 | 0.146 | 0.244 | -0.003 |
| console, all | 2,080 | 0.0002 | 0.0005 | 0.0170 | 0.023 | 0.146 | 0.244 | -0.003 |

Flagged in defaults: 0 of 2,080.

Flagged in console: 0 of 2,080.

## Probability of collision

The events carry no covariance, so the screen reports the Alfano maximum. Each matched event's value is compared with the module's `alfano_max_probability` at the screen's own miss and combined radius (they must be identical) and at the reference's miss (a difference of a few decimeters in the miss shows as a relative difference in the probability).

| Arm | Compared | At the screen's miss: median / max relative difference | At the reference's miss: median / 95th / max relative difference |
| --- | --- | --- | --- |
| defaults | 2,080 | 0.00e+0 / 0.00e+0 | 1.56e-5 / 1.65e-4 / 2.96e-3 |
| console | 2,080 | 0.00e+0 / 0.00e+0 | 1.56e-5 / 1.65e-4 / 2.96e-3 |

## Cost and settings

- Screen (`screen_catalog`, 8 module threads, coarse step 60 s, refinement tolerance 0.001 s): arm defaults, threshold 5 km, 1 call: 26.9 s, 1,999,000 pairs screened, 384,438 k-d tree candidates, 5,045,312 encounters refined, 8,642,000 propagations; arm console, threshold 15 km, 3 calls: 288.0 s, 5,997,000 pairs screened, 966,728 k-d tree candidates, 15,371,135 encounters refined, 8,646,000 propagations.
- Reference (SGP4 module, sample step 10 s, refinement steps 1 s, 0.05 s, 0.001 s; SGP4 has no integrator, one thread): dense pass 221 s over 25,927 samples of 2,000 objects, 815,132 pair samples below 100 km, 297,766 candidates, kept 8,227 after s1, 3,031 after s2, 2,525 after s3; refinement 43 s in 309,313 module calls.
- Guards: largest object speed 7.974 km/s (registered bound 8.5 km/s); the module's ephemeris lines against its single-epoch states: at most 0.000 m; one instant answered twice at a chunk boundary differs by at most 0.321 m.
- Subset: 27,685 eligible objects, ranked by SHA-256 of `ca-screen-recall-20261029:<NORAD_CAT_ID>`, first 2,000; list SHA-256 `1c339a56875a9a3d0889a671b9d6928b82ea81c1a3718a60a2b7c41e1b42a83c`.

## Provenance

- Snapshot `spacetrack/gp/2026/2026-10-29.json.gz`, SHA-256 `a0ff07183325e857180a822e6799713f66cbbfa28ed82f6d9996e02672020a9d`, 32,823 records.
- space-data-network-modules, artifacts read with `git show`, not from a working tree: conjunction-assessment 0.17.0 at `fbda894501f32210b77c74b53bcad036ce7a1b07`, `0cc09d7b1399b5037392004327b40c70f76d3150ddfcd303636039a77d936a6a`; propagator/sgp4 1.3.1 at `44ce9d27a1214c8a4740b5f30d831b0e6a7248f0`, `d9fdd0575d8dc84fa418d1ec4a5e0f14c9a02683eaeec0904b53a0a18b239a97`.
- Packages: space-data-module-sdk 0.9.12, spacedatastandards.org 1.271.0 (screen) and 1.140.0 (SGP4 answers). Node v25.4.0, 28 logical CPUs, 1-minute load average 36.3 at the start and 66.5 at the end (the host was shared).
- Experiment commit `63f98fd082`; run sources: PLAN.md `dd6dc4147fd8`, config.json `29f61ff9428b`, config.a2.json `9f7a28fe5e3d`, common.mjs `bf6c4444ad36`, access.mjs `2c55a952155f`, reference.mjs `71b71f9d88b6`, compare.mjs `19c0b9a3f2ef`, run.mjs `6ab05315be7f`.
- Files: `metrics.a2.json`, `manifest.a2.json`, `moved.a2.json`, `replay.a2.json` and `listing-proof.a2.json` in this folder, with the 0.9.0 run's `metrics.json`, `manifest.json`, `parity-diagnostic.json` and `replay.json` beside them; the subset, the reference events, the screen events and the matches stay under `runs/` (element-set-derived).

## What this does and does not show

- It shows whether the screen finds what an exhaustive search over the same SGP4 element sets finds, and how closely their TCA, miss distance and Pc agree. It does not measure accuracy against where objects were: both sides use the same element sets.
- One snapshot, one 2,000-object subset, one 72-hour window; `screen_catalog` (the single-call screen), not the resident windowed screen the console uses; only events below 5 km are assessed.
- A recall of 1.0 over 132 events below 1 km excludes, at 95 %, a miss rate above 2.24 % in that band.
- A recall of 1.0 over all 2,080 events below 5 km excludes, at 95 %, a miss rate above 0.14 %.

