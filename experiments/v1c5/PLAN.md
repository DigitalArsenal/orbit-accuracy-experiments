# V1c5 — realistic SGP4/GP uncertainty for mixed-catalog screening

Registration A, 2026-10-26 (task console-covariance-calibration-v1c5-20261025), frozen by the first commit of this file and `config.json`.
Registration B (the candidates, their tiers and the selection rule: `candidates.json` and `PLAN-B.md`) is committed and pushed after the
training arcs exist and before any candidate is fitted or scored. The test is read only after both selection files are pushed.

Owner position (2026-10-25): "We are trying to compete on accuracy with owner operator ephemerides and observations, while having them
in the same scenario with SGP4 and assigning a realistic and appropriate uncertainty to SGP4 to allow for accurate screening." The
calibrated SGP4/GP covariance is the input of the mixed-scenario screening experiment (experiments-sdn-ap-mixed-scenario-screening).

## 1. Why a V1c5

V1c4 (experiments f307d648, `results/v1c4`) selected by cross-validation and confirmed 3 of 24 cells for SGP4 on a fresh window; the
unselected candidates reached 7 of 24 at most. Measured causes (V1c4 README): GPS overconfident at every horizon with a median d²/3 of
0.01 to 0.03 (a few objects carry the summed d²: errors that grow for days after an unobserved burn, then drop when a fresh set arrives);
SLR MEO overconfident or failing coverage; LEO 400-800 km never realistic (coverage 0.93 to 0.99); samples of flagged arcs overconfident at
every horizon (mean d²/3 44 to 135, coverage 0.83 to 0.90); the selection key (mean realistic cells on the folds that fitted it) overfit.
V1c5 changes the candidates and the selection key, not the rule: mean d²/3 in [0.8, 1.25], 95 % coverage in [0.93, 0.97], at least 30
samples from 3 objects, object-cluster bootstrap (2,000 resamples, seed 20261017), V1c2's and E14's code unchanged.

## 2. Scope

SGP4/GP mode only (the owner's screening claim is about SGP4 objects); FFM-1 is not part of V1c5. All covariance arithmetic, calibration and
d² run in `analysis/gp-error-model` WASM (the pinned V1c4 runtime: modules f1c7b894, truth tools 5f09ba9b, SDS 1.249.0); JavaScript selects,
counts, ranks and computes the bootstrap. No physics in JavaScript. Raw element sets, truth and per-sample tables stay in the durable run
directory; the repository holds aggregates, models and the manifest.

## 3. Data (V1c4 PLAN sections 2 and 3 apply unchanged except as stated here)

- **Training:** issue days 2026-08-03 to 2026-10-03 in eight weekly folds: F1 Aug 3-9, F2 Aug 10-16, F3 Aug 17-23, F4 Aug 24-30, F5 Aug 31-Sep 6,
  F6 Sep 7-13, F7 Sep 14-20, **F8 Sep 27-Oct 3** (V1c4's test week joins training; Sep 21-26 stays out as in V1c4). Every target precedes
  2026-10-07T00:00Z (`trainingTargetBefore`). F1-F7 read E3's converted archive truth, F8 the refreshed truth below.
- **Test:** issue days **2026-10-09 through 2026-10-20** (12 days), never read by V1 to V1c4 or any V1c5 step. The first test issue time
  (2026-10-08T23:59:42Z) follows every training issue and target time (the last training target precedes 10-07T00:00Z). Truth for 2026-09-26
  to 2026-10-23 was not in the archive: it is fetched, with E3's conversion script (`e3-combined-catalog/truth/fetch-reference-products.mjs`,
  truth tools at 5f09ba9b), IERS finals2000A of 2026-10-21 (observed rows to 2026-10-20; later targets have no Earth orientation and are
  missing horizons, retained and counted), products `gps-esa,slr,slr-daily,sentinel1,swarm` (run as two invocations over one cache, the first four and then swarm), into the durable run directory
  `/opt/data/sdn-archive/v1c5/truth/`, **keeping the download cache** (`truth/download-cache`) and the fetch log, so the refreshed truth can be rebuilt
  byte for byte. Swarm A, B, C (LEO, 460-510 km, ESA dissemination server) is added to V1c4's product list because COSMIC-2 and Sentinel-1
  truth end before the window and the class LEO 400-800 km would otherwise have none; E3's registry already counts Swarm in that class for
  training. Before this plan only the names of the fetched files were read.
- **Events:** the causal rule of V1c4 section 3 (custody gap G >= max(3 days, 3 median gaps) in the object's own element-set stream, or a
  maneuver found by `analysis/maneuver-detection` 0.8.0 within 7 days before the issue time), unchanged and evaluated by the same code for
  training and test. Truth is never read by it.
- **Durable run directory:** `/opt/data/sdn-archive/v1c5/` (not a worktree): `runtime/` (the provisioned pins), `truth/` (cache, log and
  refreshed reference states), the arcs, flags, scores and `manifest.json`. `run.mjs --check` re-derives from it; the repository carries a
  committed-artifact check for machines without it (as V1c4 amendment A1).
- Workers: at most 6 single-thread workers; a lane dispatches while the 1-minute load is below 64 minus its index (the machine is shared
  and the owner's rule is to use it); disk floor 30 GiB. No unit suites, Docker, production SSH or deployment.

## 4. Stages and what each may read

A. **Collect** (this registration): SGP4 arcs (covariance bases N, F, P at 6 horizons, as V1c3's worker) and event flags for all training pairs
   (F1-F8). Raw only; nothing is fitted, scored or counted.
B. **Candidates and selection** (`PLAN-B.md`, `candidates.json`): registered after looking at the training arcs (section 5) and before any
   candidate is fitted. Cross-validation, the selection and every final fit use training arcs only, and are pushed before C.
C. **Test:** the test window's element sets, flags, arcs and truth are read only after B's selection and models are pushed; every candidate
   is scored once with its frozen fit; nothing is tuned after.

## 5. Development looks before this registration

V1c4's published README and metrics were read (not its raw run, which is gone): the failure pattern in section 1. The durable run directory,
the Swarm product list and the fold layout were set from file names and index time spans. No V1c5 arc was collected and no candidate was
fitted, scored or counted when this plan was committed. Registration B will list every look at training arcs made to design the tiers.

## 6. Not claimed

The test cannot separate per-object realism; twelve days have few maneuvers and few objects per class (some cells will be INSUFFICIENT, and
count as not realistic). Cell success does not certify an object. The non-causal environment is not used (SGP4 mode only). The realism of a
cell holds for the mix of objects of that cell in that window.
