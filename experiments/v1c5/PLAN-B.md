# V1c5 — registration B: candidates, tiers and selection

Registered 2026-10-26, frozen by the first commit of this file and `candidates.json`, after the training arcs and flags of registration A
exist (3,286 arcs, 412 flagged by the event rule) and before any candidate is fitted, cross-validated or scored. No test state has been read:
the test window's element sets, flags, arcs and truth are collected only after the selection and every final model are pushed.

## 1. Candidates (`candidates.json`, 57, in this order)

Name `<base>-<method>/<tiering>/<claim>`.

- **Bases** (V1c3's covariance sources, WASM): N = `object_covariance`; F = N plus the E14 S3-KC population evaluated at age zero in the
  predicted RTN axes (added only when N is EMPIRICAL); P = the E14 population at actual age.
- **Methods** (`fit_calibration`, WASM): `none`; `scalar-mle` (k² = mean d²/3, the maximum-likelihood common scale, driven by the mean and so by the
  tail); `coverage` (k² = the d² quantile at 95 % over its χ²₃ value: a quantile, so insensitive to the tail beyond it); `axes-mle` (one factor per
  RTN axis). Fitted per calibration group and nominal horizon (1, 6, 12, 24, 48, 72 h), at least 30 samples from 3 objects, else factor 1 labelled
  INSUFFICIENT. A candidate with method `none` is the uncalibrated base.
- **Tierings** (what a calibration group is):
  - `single`: the class (GPS; LEO 400-800 km; SLR LEO 800-1500 km; SLR MEO), V1c4's candidates.
  - `flag`: **the pre-registered inflation for event-flagged objects.** An arc flagged by the causal event rule (registration A section 3) is
    calibrated in its own pooled group FLAGGED (all classes together, per horizon), fitted on the training flagged samples by the candidate's
    method on the candidate's base covariance; the other arcs are calibrated by their class on unflagged samples only. The FLAGGED factors are
    the inflation (a factor above 1 when flagged arcs are overconfident, as in V1c4: mean d²/3 44 to 135).
  - `risk`: **the mixture scale.** As `flag`, and the unflagged arcs whose custody is stretched (longest recent gap or age of the newest set at
    least 2/3 of the event rule's threshold: at least 2 days at the 3-day floor; `candidates.json` `risk`) form a second pooled group HIGH, with
    its own factors per horizon. Two latent scales of one class (a regular stream and a stretched one) are each calibrated, so the heavy
    tail the stretched stream carries stops inflating the regular one.
- **Claims:** `ALL` (every sample is claimed and counted) or `UNFLAGGED` (the unflagged arcs' samples are claimed; flagged arcs are scored and
  reported apart, V1c4's treatment). The cells are the paper's: 4 classes x 6 horizons, by the rule of registration A section 1.

## 2. Cross-validation and selection (training only)

Rolling origin with purge, as V1c4: for evaluation fold k (F3, F4, F5, F6, F7, F8) a candidate is fitted on the arcs of earlier folds, keeping only
samples whose target precedes fold k's first issue time, and scored on every sample of fold k; the fold's score is the number of REALISTIC
cells of 24 on the claimed population. **Selection, registered order of keys: (1) the highest minimum fold count (the worst fold); (2)
the highest mean over folds; (3) the lowest mean INSUFFICIENT cells; (4) the lowest mean summed squared normalized violation of the two bounds
(V1c3's formula, 1e12 for nonfinite or insufficient cells); (5) registered order.** `UNFLAGGED` candidates are eligible only if flagged arcs are at
most 20 % of training arcs (they are 12.5 %). Each candidate is then fitted once on all training arcs (F1-F8); `selection.json`, every model (`.erm`)
and the ranking are committed and pushed before the test is read. Nothing changes after test access.

## 3. Test and endpoints

All 57 candidates, with their frozen fits, are scored once on the test. **Headline: realistic cells of 24 for the selected candidate on its claimed
population**, with its cells over all, unflagged and flagged samples, per class and horizon (`results/v1c5/table.json`, the table the mixed-scenario
experiment and the paper read), the classes and horizons REALISTIC (the only cells that may be labelled realistic), and the GPS and SLR MEO tails by
object. INSUFFICIENT cells count as not realistic.

## 4. Development looks before this registration

Training arcs and flags only (scripts in `experiments/v1c5/dev/`, outputs below; nothing of the test window, nothing fitted or scored):

1. **Tail mass.** Uncalibrated base F, d²/3: GPS median 0.38-0.41 in every tier, 95th percentile 1.7 to 2.0 in unflagged arcs, but the mean is 11-16
   (unflagged, regular custody), 46-80 (stretched custody) and 1,400-1,600 (flagged), and the top 1 % of samples carry 76-95 % of the summed d² in
   every tier. The other classes have no such tail (LEO 400-800 km mean 0.8-1.6, SLR LEO 0.55-0.78, SLR MEO 0.09-0.25 apart from item 3).
2. **The GPS tail is only partly flaggable.** 81 GPS arcs have a sample with d²/3 above 100; 48 % of them are flagged (13 % of all GPS arcs are). Their
   custody numbers (age, longest gap, detector events) are not separable from the others' except a longer median gap (2.7 against 1.8 days). Per object
   the pattern is an unobserved burn: the error grows 20 to 50 km a day for days while the published sets carry the old orbit, then drops when a fresh
   set arrives (36585, 68791, 28190, 32260, 62339, 38833, 45854, 35752). A tier cannot make the mean of such a class realistic; it can make the
   covariance of the stretched stream larger.
3. **Etalon-2 (NORAD 20026).** In F8 the arcs issued 2026-10-02 and 10-03 show errors of 7,552 and 13,580 km at truth epochs from 2026-10-05, 0.1-0.3 km
   before it, the same error from two issue times at one epoch; the converted ILRS weekly products (261003 and 261010) are continuous at their
   boundary (2,919 km step against 2,880 and 2,967 km within the files). The cause is not established. Nothing is excluded on truth (V1c4's rule); those
   samples sit in the SLR MEO cells of training and, probably, are the cause of V1c4's SLR MEO means near 3e8 (its window held the same products).

## 5. Not claimed

The GPS class will probably stay unrealistic on the mean criterion whatever the tier; the experiment reports it and does not exclude its tail. Cell
success does not certify an object; twelve test days have few events and few objects per class. The 2/3 risk threshold and the pooled tiers are the
registered choices; they were not tuned on the cross-validation scores (none exist).
