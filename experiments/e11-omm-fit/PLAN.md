# E11 — Our OMM against CelesTrak's Supplemental GP, fitted to the same operator ephemeris

Owner, 2026-10-10: "We should be doing both; fit to OMM and get a better RMS
than Celestrak supplimental GP, and ALSO do the HPOP." The HPOP half is E4
amendment A5/A6. This experiment is the OMM half.

## 1. Question

For each operator that publishes an ephemeris, the question is whether an SGP4
mean-element set (OMM) fitted by the SDN modules to that ephemeris (OMM-fit)
does better than CelesTrak's Supplemental GP set (SupGP), which CelesTrak fits
to the same ephemeris. It is asked in two ways:

- **(a)** over the span CelesTrak fits;
- **(b)** in prediction beyond it.

**Baseline (c):** Space-Track's OMM at the same information cutoff.

## 2. Products

- **SupGP:** CelesTrak's set, as fetched by the collector
  (`fetch/collect-supgp.sh`). The collector archives the sets under
  `/opt/data/sdn-archive/celestrak/supgp/<group>/<UTC>.{json,rms.txt}`, with
  provenance. It obeys the CelesTrak fetch policy: serial requests ≥ 2.5 s
  apart, the 3-hour ledger, 60 s backoff with one retry, and a halt after 30
  failures.
- **OMM-fit, CelesTrak window:** `analysis/gp-error-model` `fit_elements`
  (0.2.0), fitted on CelesTrak's window for the paired SupGP set, with the
  epoch at the SupGP EPOCH and B* fitted. It is the apples-to-apples
  counterpart of SupGP.
- **OMM-fit, product:** the candidate chosen on dev and validation (section 5)
  from the pre-registered grid. The grid is anchored at the version's issue
  time (its first state at or after `created`):
  - spans of 6, 12, 24 and 48 h, and to the end of the file;
  - B* fitted, or held at the Space-Track value;
  - one 24-h fit with the operator's covariance weights (SpaceX MEME UVW).

  Every candidate is computed for every captured version (section 4), so the
  choice needs no raw data.
- **HPOP OCM:** A5's `harness/ephemeris-fit.mjs` (experiments 405779d,
  modules f6ec6918). It is full force, with one OCM per manoeuvre-free segment.
  It serves as the truth reference (section 4).
- **Space-Track OMM:** the latest set with EPOCH ≤ T_c and CREATION_DATE ≤ T_c,
  where T_c is the version's `created` / CREATION_DATE.

All fits report exact statistics on every point of their window:
- N and span;
- 3D RMS;
- per-coordinate RMS (3D / √3, CelesTrak's rms.txt convention, checked in
  section 4);
- R/T/N RMS;
- maxima;
- the half-split closure (fit the first half by time, score every point of the
  second half; owner, 2026-10-10).

## 3. Groups and data

Operator ephemerides are captured in memory only. The owner's rule is that no
raw ephemeris is ever written to disk, so only derived OMM/OCM records and
statistics are persisted (`capture/capture.mjs`, `capture/capture-hpop.mjs`,
`/opt/data/sdn-archive/operator-ephemerides/README.md`).

| Group | Operator source | Capture | SupGP pairing |
| --- | --- | --- | --- |
| Starlink | SpaceX MEME (EME2000, 60 s, 3 d, UVW covariance), a fixed sample of 150 NORADs (`starlink-sample.txt`, seed `e11-starlink-sample-20261010`) | Every version, by name. Superseded versions stay downloadable. | The version with the latest start at or before the SupGP EPOCH. The window is [EPOCH, EPOCH + 12 h]. |
| ISS | NASA OEM (EME2000, 4 min, 15 d) | Every version | The OEM current when the SupGP snapshot is fetched. The window is [segment EPOCH, + 6 h]. |
| CSS | CMS OEM via the css-tiangong provider node | When processed | As ISS |
| Space-Track-hosted operators (OneWeb, Kuiper, Iridium, Telesat, Orbcomm, AST, EUMETSAT, SES) | Fitted in memory by the operator-OD archiver lane. Derived OMM/OCM under `/opt/data/operator-od/`. | When available | Same rules, by EPOCH |

- **Analysed groups:** a group enters the hypothesis tests if its test window
  has at least 10 objects or 20 paired sets that pass the gate. Otherwise it is
  reported descriptively.
- **GNSS, GLONASS, CPF, Intelsat and Planet:** not captured by E11.
  - CelesTrak fits GPS to the SEM almanac. No almanac propagator module exists.
  - CelesTrak fits Intelsat to the IESS-412 11-parameter files.
  - Planet publishes one state per satellite.

  They are listed in the results as not analysed, with the reason.

## 4. Pairing, the rms gate and truth

- **The rms gate (frame-error guard).** For every pair, the recomputed SupGP
  per-coordinate RMS on CelesTrak's window must match CelesTrak's published RMS
  within max(0.005 km, 10 %). A pair that trips the gate is excluded and
  counted.
  - The convention was established before the freeze, on the 11:54Z snapshot
    (calibration, not test):
    - ISS: 60 of 60 segments within 0.010 km;
    - Starlink, 12-h window: median |Δ| 0.0017 km over 111 passing pairs, and
      24 % of pairs trip, probably because CelesTrak used a version the
      registry did not see.
  - Reading SpaceX's MEME as TEME gives errors of about 31 km.
- **Truth for prediction.** At a target time t, truth is the HPOP OCM fitted to
  the latest later version of the same object whose span contains t and whose
  issue time precedes t. This is the version with the smallest prediction age.
  - It is labelled operator-OCM, with that OCM's exact fit RMS reported as its
    representation error.
  - No independent truth exists for Starlink or ISS. For groups added from
    section 3 with independent truth, that truth is used and labelled:
    IGS/ESA/GFZ finals for GNSS, NSGF/ILRS orbits for SLR.
  - Prediction metrics are therefore computed for the HPOP subset only: 40
    Starlink NORADs (`hpopSubset`, salt `e11-hpop-subset-20261010`) and ISS.
    Metric (a) covers the whole sample.
- **Horizons.** 6 h, 1 d, 3 d and 7 d after the end of CelesTrak's window.
  - Each is scored over the hour centred on the horizon (61 points at 60 s).
    The per-pair RMS is the 3D RMS of the prediction-minus-truth difference
    over those points; the per-coordinate RMS is also reported.
  - Every product is scored at the same absolute times.

## 5. Splits and the choice of product

Windows are by the version's issue time:
- **dev:** 2026-10-10T00:00Z to 2026-10-11T00:00Z;
- **validation:** 2026-10-11T00:00Z to 2026-10-12T00:00Z;
- **test:** 2026-10-12T00:00Z to 2026-10-15T12:00Z.

The test window holds the versions issued in it and the SupGP snapshots
fetched in it (the collector runs to 2026-10-15T12:00Z). References are
captured through 2026-10-22T18:00Z.

The product is chosen as follows:
1. **Dev criterion.** The candidate with the lowest median, over dev objects,
   of the 1-day prediction RMS against operator-OCM truth (section 4).
2. **Validation confirms.** The dev choice stands unless another candidate's
   validation median is lower by more than 5 %. In that case the validation
   winner is taken.
3. **Ties** (medians within 1 %) go to the earlier candidate in the grid order
   of `config.json`.

Step 20 writes the choice to `results/e11/selection.json`. That file is
committed before step 40 reads the test window; the frozen files are not
edited. The test window is locked until `frozen` is true and PLAN.md and
config.json are committed and unchanged; the code enforces this in
`common.mjs` `assertWindowReadable`.

## 6. Endpoints, statistics and decision rules

All endpoints are per group, test window only.

- **H1 (fit span).** On CelesTrak's window, OMM-fit (CelesTrak window) has a
  lower per-coordinate RMS than SupGP recomputed on the same points.
  - Statistic: the mean over objects of the per-object mean of
    log(OMM-fit RMS / SupGP RMS).
  - Interval: a cluster bootstrap over objects: 2000 resamples, seed 20261010,
    95 %, percentile.
  - Supported if the upper bound is below 0.
  - Also reported: the CelesTrak-reported RMS next to both, and the fraction of
    pairs where OMM-fit is lower.
- **H2 (prediction).** At each horizon, OMM-fit (product) has a lower
  prediction RMS than SupGP against operator-OCM truth. Same statistic, interval
  and rule.
  - **The 1-day horizon is primary.** 6 h, 3 d and 7 d are secondary, with
    Holm's correction over the three secondary horizons.
  - OMM-fit (CelesTrak window) is reported alongside.
- **Baseline (c).** The same statistic for SupGP / Space-Track and OMM-fit /
  Space-Track.
- **Closure.** The half-split closure of each fit, reported as a measurement:
  median and 90th percentile of its 3D RMS and maximum per group. SGP4 against a
  real ephemeris is expected at the kilometre level.
  - The module's own gate (≤ 1 cm on SGP4-generated data) is tested in
    `analysis/gp-error-model`, not here.
- **Gate and failures.** The number of pairs, gate trips, fit failures and
  superseded or unknown versions, per group.

## 7. Threats to validity

- **Pairing.** CelesTrak's choice of version is inferred, not published.
  Trips are excluded and reported. A wrong pairing that passes the gate would
  bias (a) against SupGP only if the version differs.
- **Truth.** Operator-OCM is the operator's own later prediction, not
  independent truth. Its representation error (the OCM fit RMS) is reported.
  A common operator bias affects both products equally.
- **Precision.** SupGP is published at fixed-column precision. On ISS, rounding
  a full-precision fit to that precision changes the RMS by less than 0.1 m.
- **Sample.** The Starlink sample is 150 of about 11,130 objects, and the HPOP
  subset is 40. Manoeuvres are present in Starlink files. SupGP and OMM-fit
  face them equally on the same window.
- **SGP4 build.** Every set is propagated by the same SGP4: Vallado 2020,
  WGS-72, opsmode i. CelesTrak fits with STK's SGP4.

## 8. Order of work

1. The collector and the in-memory capture, running since 2026-10-10 (collector
   11:54Z, capture 13:01Z).
2. Freeze: this plan and config.json committed with `frozen: true`, before any
   test-window outcome is read.
3. Step 20: dev and validation choice (section 5), written to
   `results/e11/selection.json` and committed.
4. Step 40: test window. H1 and H2, baselines, closure, failures. Then
   `products.jsonl` for E9: the chosen OMM-fit per test version, with
   statistics and the raw sha256.
5. Step 90: report.

## Amendments
