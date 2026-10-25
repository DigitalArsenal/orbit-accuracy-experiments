# V1c4 — pre-registered console covariance calibration: temporal cross-validation, a causal event rule, a fresh test

Frozen registration, 2026-10-23. No V1c4 fit, selection, score or test read preceded this plan. V1, V1c, V1c2 and V1c3 are
immutable; V1c3's harness is imported unchanged. Failures remain results.

## 1. Why

V1c3 selected SGP4 F-coverage (14/24 training cells) and FFM-1 coverage (10/24); on its test they confirmed 4/24 and 3/24, while
unselected families did better (F-scalar-mle 7/24, F-axes-mle 7/24). Two causes were measured:

1. **Selection overfit.** The winner was the candidate with the most realistic cells *on the weeks that fitted it*.
2. **GPS event tail.** Three objects (36585, 68791, 62339) carry 99 % of the summed GPS d². Development look (section 10): in V1c3's
   recorded arcs their error at +1 h grows 48-73 km/day for 7-9 days and then drops to 1-3 km. The element-set stream of each shows
   the cause: a 3-8 day gap in sets (or sets carrying the old orbit forward) after an unobserved burn. A fresh set ends it.

## 2. Data

Rules are V1c3's (V1c2's, E3's): latest public OMM created and dated at or before the issue time (00:00:00 GPS = 23:59:42 UTC the day
before), its 31-day history, 45-day creation lookback, targets at 1, 6, 12, 24, 48, 72 h, first reference state at or after the target within
900 s, nothing excluded on truth, missing inputs counted. Classes: E3's four (GPS: the satellites named in the ESA final products;
LEO 400-800 km; SLR LEO 800-1500 km; SLR MEO), plus **the five COSMIC-2 satellites with archived orbits (NORAD 44349, 44350, 44351, 44353, 44358) in LEO 400-800 km**:
after 2026-09-26 the archive holds no other LEO truth than LARETS and Sentinel-1 to 2026-10-03, so without them the class cannot reach
three objects with 30 samples. Their truth is UCAR's near-real-time orbits (archive reference-leo-pod-2, CC BY 4.0, E8/E16 use).

- **Training:** issue days 2026-08-03 through 2026-09-20 in seven weekly folds, F1 Aug 3-9, F2 Aug 10-16, F3 Aug 17-23, F4 Aug 24-30,
  F5 Aug 31-Sep 6, F6 Sep 7-13, F7 Sep 14-20. Every target precedes 2026-09-24T00:00Z. These include V1c3's training and V1c2/V1c3's
  test weeks (used as training here, never as V1c4's test). Truth: E3's converted archive products.
- **Test:** issue days **2026-09-27 through 2026-10-08** (12 days), never read by V1, V1c, V1c2, V1c3 or any V1c4 step. The first test issue
  time (2026-09-26T23:59:42Z) follows every training issue and target time. Truth products for the window did not exist in the
  archive (the newest SLR, Sentinel-1 and Swarm products ended before it); they were fetched on 2026-10-23 with E3's own conversion
  script (`e3-combined-catalog/truth/fetch-reference-products.mjs`, modules `reference-states`, `orbit-products`, `eop-parser` at
  5f09ba9b, the commit E3's script copy is taken from) with IERS finals2000A of 2026-10-21 (observed rows to 2026-10-20), `--from 2026-09-26 --to 2026-10-20`,
  `--products gps-esa,slr,slr-daily,sentinel1`. Before this plan only file names and index time spans of that output were read, to name
  the window; no state was compared with any element set. Products reach: GPS to 2026-10-18, NSGF to 2026-10-19, ILRS combined to
  2026-10-10, Sentinel-1 to 2026-10-03, COSMIC-2 to 2026-10-07. Missing horizons are retained and counted.
- Space weather and Earth orientation for FFM-1: GFZ history (2026-10-09 file) then GFZ nowcast (2026-10-20 file) for later days, NOAA
  45-day forecast of 2026-10-21 for absent centered-average dates; IERS finals2000A of 2026-10-21. Observed drivers of the arc days are
  used as in V1c3 (a non-causal environment shared by training and test).

## 3. Event rule (causal; the object's own element-set stream only)

At issue time T, with the sets created and dated at or before T and epoch within 45 days before T (de-duplicated as E3 does):

- **Custody gap.** G = the largest of the age of the newest set at T and the gaps between consecutive epochs whose later epoch is
  within 7 days before T. m = the median gap over the 45 days (1 day when fewer than 5 sets). Flag when **G >= max(3 days, 3 m)**.
- **Recent maneuver.** `analysis/maneuver-detection` 0.8.0 (`detect_maneuvers`, defaults: detectors D1 and D2 merged, no error model),
  its propagation queries answered by `propagator/sgp4` `propagate_ephemeris` (one block per set, 60 s, 2 neighbour sets), run on those
  sets when there are at least 8. Flag when **an event time lies within 7 days before T**. A refused detector run counts as no event and
  is counted.

An arc is **flagged** when either holds. The rule never reads truth. It is evaluated for every pair, once, by the same code for training
and test. Treatment: **a separate label with no realism claim** (section 5, arm UNFLAGGED). Reported for every candidate: flag share per
class, and cells over all, unflagged and flagged samples.

## 4. Candidates

SGP4 bases (V1c3's): N = `object_covariance`; F = N plus the E14 S3-KC population evaluated at age zero in the predicted RTN axes (added
only when N is EMPIRICAL); P = the E14 population at actual age. Methods: none, scalar-mle, coverage (.95), axes-mle, fitted per class x
nominal horizon, at least 30 samples from 3 objects, else factor 1 labelled INSUFFICIENT; fit and score axes as in V1c3. **Arms:** ALL
(the event rule off: every sample fits and is claimed) and UNFLAGGED (on: flagged arcs are excluded from the fit and from the claimed
cells; their samples are scored and reported apart). 12 x 2 = 24 SGP4 candidates, named `<base>-<method>/<arm>`.

FFM-1: seeded from the selected SGP4 candidate (its base's terms at issue scaled by that candidate's final 1-hour class factors, left
endpoint hold), transported by the FFM-1 resident STM per term, no process noise; methods none, scalar-mle, coverage, axes-mle x the two
arms: 8 candidates. All math (covariances, calibration, STM, d²) runs in `gp-error-model` and FFM WASM; JavaScript selects, counts and
computes the bootstrap. Every fitted model is a typed `$ERM` MODEL (`e14-factors`). Reference scored on the test, never selected: V1c3's
published SGP4 F-coverage model.

## 5. Cross-validation and selection (training only)

Rolling origin with purge. For evaluation fold k, a candidate is fitted on the arcs of earlier folds, keeping only samples whose target time
precedes fold k's first issue time, and scored on every sample of fold k. SGP4 evaluation folds F3-F7 (fits on 2-6 weeks); FFM arcs are
collected for F3-F7 and its evaluation folds are F5-F7 (fits on 2-4 weeks). A fold's score is the number of REALISTIC cells of 24 on the
arm's claimed population (ALL: every sample; UNFLAGGED: unflagged arcs), by the paper's rule with V1c2's/E14's code unchanged: mean d²/3
in [0.8, 1.25], 95 % coverage in [0.93, 0.97], at least 30 samples from 3 objects, 2,000 object-cluster resamples, seed 20261017.

**Selection (per mode), registered order of keys:** (1) highest mean over evaluation folds of realistic cells; (2) highest minimum fold
count; (3) lowest mean INSUFFICIENT cells; (4) lowest mean summed squared normalized violation of the two bounds (V1c3's formula, 1e12 for
nonfinite or insufficient cells); (5) registered order (bases N, F, P; methods none, scalar-mle, coverage, axes-mle; arm ALL first).
UNFLAGGED candidates are eligible only if flagged arcs are at most 20 % of training arcs. The SGP4 selection is made and pushed before FFM
training starts; each candidate is then **fitted once on all training weeks** (SGP4 F1-F7, FFM F3-F7) and all models, tables and both
selections are committed and pushed before the test is read. Nothing changes after test access.

## 6. Test and endpoints

All 24 SGP4 and 8 FFM candidates, with their frozen final fits, and the V1c3 reference are scored on the test. **Headline per mode: realistic
cells of 24 for the selected candidate on its claimed population**, with its cells over all samples, unflagged and flagged samples
separately (flagged cells pooled by horizon, by the same rule), the flag share, and its effect on GPS (cells and mean/median d²/3 over all
versus unflagged samples). Cells that cannot reach 30 samples from 3 objects are INSUFFICIENT and counted as not realistic. The output is
the selected typed MODEL records and, per mode, the classes and horizons REALISTIC on the test: the only cells the console may label
realistic. Cell success does not certify an object.

## 7. Controls and tolerances

V1c3's: covariance symmetry 1e-10 relative, zero-time STM covariance 1e-8, identity calibration 1e-10, sum of transported terms against one
pair_statistics 1e-8, native WasmEdge 0.16.4 / headless browser parity of `gp-error-model` on recorded training inputs (the frozen FFM
artifact's exception instructions are rejected by native AOT: inherited, owned by ffm-memory-measured-sizing-20261022). Docker is waived by
the owner's 2026-10-22 ruling. Added: V1c4's SGP4 arcs for V1c3's training pairs (2026-08-03 to 08-20) equal V1c3's recorded arcs exactly
(provisioning replay); `--check` re-derives V1c3's published test cells for F-coverage (4/24) and FFM-1 coverage (3/24) from V1c3's recorded
run; the event rule's flags re-derive for the 40 pairs with the smallest SHA-256 of their key.

## 8. Provisioning and execution

Modules artifacts, codec, FFM helpers and SGP4 client bindings come from space-data-network-modules f1c7b894 (V1c3's commit; every byte
equals V1c3's recorded hashes), `spacedatastandards.org` 1.249.0 from npm (integrity and file-tree hash pinned), by `provision.mjs`; all
pins are in `config.json`. Artifacts are the frozen V1c2 set plus `analysis/maneuver-detection`. Raw OMM, truth and per-sample tables stay
under ignored `runs/`; only aggregates, models and the manifest are committed. At most 6 single-thread workers; lane i dispatches only while
the 1-minute load is below 20 - i (ceiling 21); disk floor 20 GiB. No unit suites, speed rerun, Docker, production SSH or deployment.
E2E: `node experiments/v1c4-console-covariance-calibration/run.mjs --check`.

## 9. Not claimed

The test cannot separate per-object realism; one 12-day window has few maneuvers and few objects per class. The E14 population prior has an
older fit and a broader published validation window (it overlaps this test's first days); it is not independent. The unobserved burn
itself is not predictable: the rule flags the objects whose custody has lapsed, not the first sample.

## 10. Development looks before this registration

V1c3's published results and its recorded run (arcs of 2026-08-03..08-24 and 09-07..09-26, both V1c4 training) were read to find the tail
mechanism and to choose the custody thresholds (floor 3 days, factor 3, window 7 days from five variants by flag share and share of
d² flagged); the detector was run causally on object 36585 (its event is first seen at issue 2026-09-16, a week after the burn: it does not
catch the tail, and is kept because the task asks for the modules' detection); truth products were listed by name and time span. No V1c4
candidate was fitted or scored, no cell was counted, and no test state was read.
