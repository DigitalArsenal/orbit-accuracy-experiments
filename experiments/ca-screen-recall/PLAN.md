# Recall of the conjunction screen against a brute-force all-pairs reference

Frozen configuration: `config.json`. This plan, the configuration and the run sources (`common.mjs`, `access.mjs`,
`reference.mjs`, `compare.mjs`, `run.mjs`) are committed and pushed to origin/main before the registered run reads the
element sets; `run.mjs` refuses to run otherwise. The task is `experiments-ca-screen-recall-allpairs-20261029`.

## Question

The Fast Conjunction Screening whitepaper says the screen "finds every pair that comes within 5 km", and it checks its
windowed screen against the module's single-call screen, `screen_catalog` of `analysis/conjunction-assessment`. Does
`screen_catalog` itself find every close approach below 5 km that an exhaustive search over the same element sets finds?
And do the TCA, the miss distance and the probability of collision (Pc) it reports agree with the exhaustive search's?

This measures **recall against a reference**, not accuracy. Both sides propagate the same OMM element sets with SGP4, so
nothing here says how close either is to where an object really was. A pair the screen and the reference both lose
because of a shared defect in the element-set parse would not be seen.

## Data

- One Space-Track GP snapshot from the SDN archive, as served and gzipped:
  `/opt/data/sdn-archive/spacetrack/gp/2026/2026-10-29.json.gz`, SHA-256
  `a0ff07183325e857180a822e6799713f66cbbfa28ed82f6d9996e02672020a9d` (JSON SHA-256
  `db2c924e9317b4aaacfb157f4e5d8b2305280aa6a750b1abd1deb5daf82a54d2`), 32,823 records, `CREATION_DATE` 2026-10-29.
  The archive holds Space-Track daily GP; its CelesTrak directory holds only supplemental (operator) GP, which is not used.
- Licence (`data/licenses.json`, id `space-track`): Space-Track User Agreement, with USSPACECOM's blanket approval to
  redistribute basic SSA data (element sets) with citation. This repository keeps element sets on this machine (README
  rule 4): `runs/` is ignored and `results/` holds aggregates, manifests and the NORAD pairs of any defect. Citation:
  Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org).
- Nothing from any B2 or C2 result, operator capture, operator ephemeris or mixed-screening input is read.

## Subset and window

- **Eligible**: the record's `MEAN_ELEMENT_THEORY` is SGP4, `EPHEMERIS_TYPE` 0, `CENTER_NAME` EARTH, `REF_FRAME` TEME,
  `TIME_SYSTEM` UTC, `DECAY_DATE` null; the provider's `APOAPSIS` is at most 2,000 km and `PERIAPSIS` at least 300 km
  (altitudes as served); and `EPOCH` is no later than the window start and no more than 7 days before it.
- **Subset**: the eligible objects ranked by the ascending SHA-256 hex digest of the string
  `ca-screen-recall-20261029:<NORAD_CAT_ID>` (decimal, no padding); the first 2,000. The ranking uses no module output.
- **Window**: 2026-10-30T00:00:00Z (JD 2461343.5) for 72 hours (259,200 s). Every element epoch precedes it, so every
  propagation runs forward.
- Each object is encoded once as an SDS `$OMM` (`ommBytes` in `common.mjs`) and **the same bytes** go to the screen
  (`catalog` port, one frame per object) and to the SGP4 module (`ingest_omm`).

## Modules, pinned

Physics runs in two built WASM modules of `space-data-network-modules`, **read with `git show` from commit
`44ce9d27a1214c8a4740b5f30d831b0e6a7248f0`** (2026-10-29 16:22:59 -0400, "space-weather 0.3.0 ...") and never from a
working tree: the shared checkout holds another lane's uncommitted build of the conjunction module (CA 0.10.0), which is
not under test. `run.mjs` refuses an artifact whose SHA-256 differs from the one registered here.

| Module | Version | Artifact | SHA-256 |
| --- | --- | --- | --- |
| `analysis/conjunction-assessment` (`screen_catalog`, `alfano_max_probability`) | 0.9.0 | `dist/isomorphic/module.wasm` | `15e7e8df0225ebf0fa5d6cbe22fdebe612b022bfcae1631594924e3239b090bd` |
| `propagator/sgp4` (`com.orbpro.sgp4`: `propagate_ephemeris`, `propagate_state`) | 1.3.1 | `dist/isomorphic/module.wasm` | `d9fdd0575d8dc84fa418d1ec4a5e0f14c9a02683eaeec0904b53a0a18b239a97` |

The test libraries the run imports to build requests and read answers (`analysis/conjunction-assessment/tests/lib/cqr.mjs`,
`conjunctionCommandHarness.mjs`, `wasmedgeWasiThreadsRunner.mjs`, and `propagator/sgp4/tests/lib`) must equal that
commit's (`git diff --quiet`). The installed packages they load (module SDK,
spacedatastandards.org, flatbuffers, flatc-wasm) are dependencies, not build outputs of this repository; their versions
are in the manifest and the report.

## The screen under test

`screen_catalog` over the 2,000 objects, all against all, evaluation frame TEME, run as the pinned isomorphic WASM
through the SDK's browser-module harness with 8 module threads (the result does not depend on the thread count). Every
call runs on a fresh module instance. The module answers in chunks of events until `FINAL_CHUNK`; all chunks are read.

- **defaults**: the request schema's defaults, which are also the whitepaper's run: threshold 5 km, coarse step 60 s,
  refinement tolerance 0.001 s, combined hard-body radius 10 m, k-d tree, dynamic window and perigee filter on,
  `ALFANO_MAXIMUM`, as **one call over the 72 hours**. If that call fails (the module holds every encounter of a call in
  its linear memory), the failure is recorded as a finding and the arm is repeated as three consecutive 24 h calls, whose
  events are merged (events of one pair closer than 1 s across a window boundary are one). **The pass rule applies to
  this arm.**
- **console**: the same settings with the console's default threshold, 15 km, and its default window, 24 h: three
  consecutive 24 h calls, merged the same way. Its events from 5 to 15 km are outside the reference's scope and are only
  counted.

## The reference (the experiment's method, not shipped code)

Positions come only from the module's SGP4 (WASM): `propagator/sgp4`, `propagate_ephemeris` (TEME, km and km/s), on the
same OMM bytes the screen reads. JavaScript here orders requests, differences two module-produced positions, compares the
distance with its neighbours in time and counts. It re-propagates through the module at finer steps to refine each
candidate minimum. **The reference uses none of the screen's filters**: no apogee/perigee (altitude overlap) prefilter, no
orbit-path test, no time-window pruning, no motion bound and no spatial tree.

1. **Dense pass.** Every sample `start + k * 10 s`, `k = -3 ... 25,923` (three extra samples each side), for every one of
   the 1,999,000 pairs: the distance of the two module positions. A pair is a **candidate** at `k` when its sampled
   distance `d_k` is a local minimum, `d_k < d_{k-1}` and `d_k <= d_{k+1}`, and `d_k` is below the bound B = 100 km.
   *Why B is safe*: a pair whose true minimum is below the retention distance (5.5 km) is sampled within 5 s of it, at
   most `hypot(5.5 km, v_rel * 5 s)` apart, where `v_rel` is twice the largest object speed. The speed bound is 8.5 km/s
   (the 2,000-km, 300-km orbit family tops out near 8.2 km/s) and the run aborts if any module state exceeds it. The
   bound is 87.2 km with a 2 km margin for the curvature of the relative path; B = 100 km clears it, and `reference.mjs`
   checks the inequality.
2. **Refinement** of each candidate (pair, `k`), asking the module for the pair's states again:
   s1, 21 lines at 1 s over `[t_{k-1}, t_{k+1}]`; s2, 41 lines at 0.05 s centred on s1's smallest distance; s3, 101 lines
   at 0.001 s centred on s2's smallest. After s1 and s2 a candidate is kept only if its smallest distance is below
   `hypot(5.5 km, v_rel * step / 2)` plus a margin (1.0 km after s1, 0.5 km after s2): a minimum below 5.5 km cannot be
   missed by sampling at that step. After s3 it is a **reference event** if its smallest distance is below 5.5 km; its TCA
   is that line's time (resolution 1 ms) and its miss distance that line's distance (an error of at most 8 m for
   misses below 100 m, at most 0.3 m above). Events of one pair closer than 0.5 s in time are merged.
3. **Events**. Reference events below 5,000 m are the reference; those from 5,000 to 5,500 m are *near-threshold* (they
   absorb differences of a metre across the threshold).
4. **Guards, recorded in the manifest**: every object is answered in every chunk; the module's line `i` is at
   `start + i * step` (checked against `propagate_state` at those instants, at most 1 m); the 90-interval chunks repeat
   their boundary sample, and the two answers' difference is recorded.

## Comparison

- **Placement.** An event's TCA is *in* the window, at its *edge* (within 2 s of either end), or *out*. Out events are
  not counted. Edge events are counted apart and never enter a denominator.
- **Exclusions.** Objects in the screen's `excluded` output are removed from the reference's events and listed.
- **Matching.** A reference event and a screen event match if they are the same NORAD pair and their TCAs differ by at most
  60 s, one to one, in order of increasing TCA difference.
- **Recall** = reference events matched / reference events in the window, by the reference's miss distance:
  below 1 km, from 1 to 5 km, and all. With a one-sided exact (Clopper-Pearson) 95 % lower bound. Matching counts the
  screen event whatever miss it reports.
- **False events**: screen events below 5 km in the window with no reference event of the pair within 60 s, other than
  near-threshold matches, edge events and events beyond 5 km. A second event within 60 s of a matched one is listed
  with that reason.
- **TCA and miss-distance differences** over matched events: median, 95th and 99th percentiles and maximum of the
  absolute differences, by band; events beyond 1 s or 5 m are listed (up to 25).
- **Pc.** The screen's `MAXIMUM_PROBABILITY` (Alfano maximum; the elements carry no covariance) against the module's
  `alfano_max_probability` at (a) the screen's own miss and combined radius, which must be identical, and (b) the
  reference's miss. Relative differences are reported.
- **Propagator parity.** The screen reports each event's two states (TEME). They are compared with the SGP4 module's
  states at the screen's TCA (arm *defaults*): position and velocity differences. This is the check that the two SGP4
  implementations (the screen's built-in, the standalone module) agree where it matters.

## Decision rule

- **Pass**: on arm *defaults*, every reference event below 1 km has a matched screen event (recall = 1.0 in that band).
- **Defect**: a reference event without a screen event, in any band or arm, is a defect, filed with its NORAD pair, TCA,
  miss distance and the screen's nearest event for the pair. A false event is reported the same way.
- If the reference has no event below 1 km the result is *inconclusive*, not a pass.
- Recall in the 1 to 5 km band, the console arm, differences, Pc and parity are reported, not gated, except that any
  miss is a defect.
- Failures are results: whatever the run finds is reported with the same care.

## Disclosures

- **Pre-freeze probes (2026-10-29)**, to learn the module interfaces and timings. They used other objects than the
  registered subset (seeds `probe-seed-not-registered` and `ca-screen-recall-smoke-not-registered`), overlapping it only
  by chance. They ran the screen alone on 2,000 probe objects for 72 h (29.6 s with 8 threads, 2,039 events), compared
  the screen's states with the SGP4 module's at 10 event times (0.04 to 0.84 m), and ran this harness on a 600-object,
  6-hour slice (6 reference events below 5 km, all found), on 2,000 unregistered objects for 6 hours (108 of 108 found,
  no false event; position difference between the two SGP4 implementations at the 216 event object states: median 0.27 m,
  maximum 13.7 m) and on 1,200 unregistered objects for 27.8 hours (247 of 247 found). The probes and the first smoke run loaded the shared
  checkout's working-tree conjunction artifact, which was by then another lane's uncommitted build (SHA-256
  `9f83a834...`); the smoke run was repeated on the pinned artifact with the same counts. No reference was enumerated for
  the registered subset, and no recall was computed for it or for its window.
- **Memory limit found before the freeze.** One 72 h call at 15 km on 2,000 probe objects ended in a WebAssembly
  `unreachable` trap after 16 s, where a 24 h call at 15 km completed (4,911 events, 115 s; 2,000 objects, coarse step
  60 s, tolerance 0.001 s, 8 threads). A refused request would be the right answer to memory exhaustion; this is
  reported as a finding on the module and is why the console arm runs as 24 h calls.
- **Artifact quirk.** The `propagator/sgp4` isomorphic artifact lays its answer's payload arena out on 4 bytes, and the SDK
  decoder requires 8. `access.mjs` copies the answer behind 0 to 7 bytes of padding until the decoder accepts it; no byte of
  the answer changes. The artifact is not changed by this task.
- **Scope.** One catalog snapshot, one subset, one window. `screen_catalog` is the module's single-call screen; the console
  runs the resident windowed screen (`screen_window`), which this does not test. Only events below 5 km are assessed.
  Zero misses among n events excludes, at 95 %, a miss rate above about 3 / n: 0.15 % for the roughly 2,000 events below
  5 km expected, 3 % for the roughly 100 below 1 km.
- **The console's screen is not tested.** The console runs `screen_window` on a resident index. No driver for
  `screen_window` is committed in `analysis/conjunction-assessment/tests/lib` at the pinned commit (the committed windowed
  driver, `gpu/catalogScreen.mjs`, calls `search_candidates` and `refine_candidates`), so this experiment does not test it;
  the *console* arm is `screen_catalog` at the console's threshold and window length.
- Module numbers are for the artifacts the run loads. Their SHA-256 values, the modules checkout's commit and the SDK versions
  are in the manifest, and the report says so.

## Verification and outputs

`verify.mjs` (the task's end-to-end check) re-checks the stored provenance (plan and sources resolve to the recorded
commits, the stored files match their hashes), regenerates the report from `metrics.json` and requires the same bytes, and
repeats the whole method through the real modules on the first 300 objects of the ranking for the first six hours,
requiring the counts in `results/ca-screen-recall/replay.json`. If the archive or the modules are absent it says so and
exits 3; a skip is not a pass.

Committed: `results/ca-screen-recall/{README.md, metrics.json, manifest.json, replay.json}`. Ignored, under `runs/`: the
subset, the reference events, the screen events and the matches. Time figures in the report name the screen's coarse step
(60 s), tolerance (0.001 s), threshold and thread count, and the reference's sample step (10 s) and refinement steps
(1 s, 0.05 s, 0.001 s); SGP4 has no integrator.

## Amendments

None. A deviation is recorded here, dated, with its reason, and reported in the results.

### A1 (2026-10-29, after the registered run): the end-to-end replay slice

The registered ranking's first 300 objects over the first six hours hold three reference events and none below 1 km, too
few to guard recall. `verify.mjs` therefore repeats the method on the unregistered smoke ranking (seed
`ca-screen-recall-smoke-not-registered`), 2,000 objects for 12 hours, and requires the counts in
`results/ca-screen-recall/replay.json`. The registered run, its subset, its window and its numbers are unchanged;
`config.json` keeps its `replay` block, now unused. `parity-diagnostic.mjs`, added after the registered results were read,
bins the propagator comparison by BSTAR and by time since epoch; its output is labelled post-hoc in the report and is not
part of the pre-registered analysis.

### A2 (2026-10-31, registered before the run on this build): the same test on CA 0.17.0, the harness fixed

Task `experiments-ca-validation-on-0-17-20261031`. Registered on origin
`wip/experiments-ca-validation-on-0-17-20261031/registration` before any result on this build exists.

**Reason.** The result above is on CA 0.9.0. The build to publish is CA 0.17.0, and nothing has re-proved that the releases
between them left recall intact: 0.10.0 pair minima on sampled sources; 0.11.0 full-precision OMMs through `sgp4-str3`;
0.12.0 the radial gate; 0.13.0 an object SGP4 refuses part-way is screened up to its last valid instant; 0.14.0 partial
coverage; 0.15.0 slow Pc; 0.16.0 the memory budget and chunked fallback; 0.17.0 a CSM for covariance events.

**The rules do not change.** The snapshot, the subset, the window, the two arms, the reference and its method, placement,
matching, recall, false events, differences, Pc, parity and the decision rule stand. The pass rule is the same: on arm
*defaults*, every reference event below 1 km has a matched screen event; any miss in any band or arm is a defect.

**What changes.**

1. **The CA build, the one change under test.** `analysis/conjunction-assessment` 0.17.0 at modules
   `fbda894501f32210b77c74b53bcad036ce7a1b07`, `dist/isomorphic/module.wasm` SHA-256
   `0cc09d7b1399b5037392004327b40c70f76d3150ddfcd303636039a77d936a6a` (the same blob at modules main `cfd7ee626`). The
   reference stays on the registered `propagator/sgp4` 1.3.1, `d9fdd057…` at `44ce9d27a`, so its events must be byte-identical
   to the 0.9.0 run's (SHA-256 `8a8f862c…`); that is checked. `propagator/sgp4` 1.3.1 runs improved mode and CA 0.17.0 AFSPC
   mode. Near-Earth sets are reported to agree between the modes to micrometers (modules task `modules-sgp4-one-mode-20261031`); the
   registered parity measure reports what this subset shows.
2. **The harness, for how CA 0.13.0 and later report an object.** The `excluded` port now lists an object screened in part as
   well as one excluded, once per call, in a fixed COMMENT form (the module's README, "Objects screened in part or excluded").
   `run.mjs` dropped every reference event of a listed object, so an unchanged run on 0.13.0 or later could report a false pass:
   an object screened up to its refusal would lose all its reference events, those the screen must find included. The section
   "Comparison", Exclusions, now reads: a reference event leaves the denominator only when a listing **of its own call** says its
   object was not screened at its TCA (TCA at or after FIRST_REFUSAL, or the object refused from the call's start). Each one is
   counted by reason and listed. A COMMENT of no known form stops the run. `listing-proof.mjs` proves this by a fabricated listing:
   a reference event the screen drops while its object is still screened is a miss here and a false pass in the harness of `5612dc1`.
3. **Registration and checkout.** Other lanes have running code and unlanded work in the shared checkouts. So the run works in a
   `git archive` snapshot of origin/main, the guard compares the sources with the registration commit on origin
   (`EXPERIMENTS_GIT` names the git store), and helper sources come from `git archive` at the pinned commits with the installed
   packages linked read-only.
4. **Compute.** The screen starts only when the 1-minute load is below 45, under `nice -n 10`; 8 module threads as registered.

The console arm stays 24 h calls, as registered, though CA 0.16.0 removed the trap that was its reason.

**Reporting.** As before, plus:

- the 0.9.0 row beside this one;
- failed pair evaluations, and objects on the port and reference events out of the denominator per reason;
- what moved between builds, event by event (`diff-builds.mjs`). The screen's SGP4 changed in 0.11.0, so values may move, and an
  event that appears or disappears is the result to read.

The 0.9.0 report stays as `README-0.9.0.md`, unchanged. A difference is a result. Any miss, any false event or any new exclusion
goes to the coordinator with its rows' identifiers, and no rule is amended to pass. A1's E2E slice stands, with its own
`replay.a2.json`.

**Disclosure.** Before this registration, with this harness on 0.17.0: one smoke run of 300 objects of the unregistered smoke
ranking for 1 hour (1 reference event, found). No reference was enumerated for the registered subset on this build.

**Steps.** With `EXPERIMENTS_GIT` and `SDN_MODULES_ROOT` set when working in a snapshot:

1. `run.mjs --run <id>`;
2. `diff-builds.mjs --run <run> --baseline <0.9.0 run>`;
3. `listing-proof.mjs > <file>`, `report.mjs --proof-from <file>`; `run.mjs --smoke --count 2000 --seconds 43200 --out <dir>`, `report.mjs --replay-from <dir>`; `report.mjs --run <run>`;
4. `verify.mjs`, the E2E.
