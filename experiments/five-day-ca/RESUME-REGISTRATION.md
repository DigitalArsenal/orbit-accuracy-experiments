# Restored registration reconciliation — 2026-11-03

The coordinator restored the specification after the earlier run. Day-4 and
day-5 states were already flown and read in that run. The existing
FIVE-DAY.md and REGISTRATION-FAILURE.md document its incomplete registration.
The earlier read cannot become prospective evidence by adding this document.
No new state has been flown during this resume.

The resume explicitly requires a disclosure and the restored registration in
FIVE-DAY.md, but also explicitly prohibits modifying any tracked file. That
file is tracked, and guard.mjs checks its exact original contents at 28dd8bb.
This new file preserves the complete restored specification without changing
tracked files or weakening that guard. It does not claim to satisfy the
required FIVE-DAY.md amendment. Further propagation is blocked on resolution
of that edit constraint, not on permission to read the supplied specification.
The instruction to continue on local main without reset or rebase is honored.

The restored definition supersedes any earlier informal CA formula: circular
zero-miss Pc is 1 - exp(-HBR^2/(2 sigma^2)); anisotropic Pc is the full in-plane
Gaussian disk integral. (HBR/sigma)^2/(2e) is not that ceiling. Synthetic draws,
covariance choices, statistics, holds and acceptance are exactly those below.
No covariance was refitted and no new encounter was generated.

## Restored task record (verbatim)

---
id: experiments-five-day-ca-forecast-20261103
title: Five-day CA forecast (owner 2026-11-02): AP, XP, SGP4 and FFM at 1, 2, 3, 4, 5 and 7 days past the fit's end in every regime with truth; the Pc each pair class can reach against the GP error model by age; alert rates on synthetic encounters under each arm's covariance
state: claimed
priority: 1
components: [orbit-accuracy-experiments]
consumes: []
needs: []
parent: mode-conjunction
paths: [orbit-accuracy-experiments:experiments/five-day-ca, orbit-accuracy-experiments:results/five-day-ca]
claimed_by: codex-fiveday-d9
ripple: false
source: 
updated: 2026-11-03T01:45:59.971Z
end_to_end: cmd env SDN_MODULES_ROOT=/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules node experiments/five-day-ca/check.mjs
---

# Five-day CA forecast

Owner, 2026-11-02, verbatim: "The horizon pas the 72h is where I wanted to measure this anyway, I want to know up to a 5 day CA forecast."

## Objective
Measure, per regime and arm, the forecast error at 1, 2, 3, 4, 5 and 7 days past the fit's end, and what it means for a conjunction screen at those leads: the Pc each pair class can reach against the GP error model by age, and alert rates on synthetic encounters under each arm's covariance.

## What exists
- Stores /opt/data/sdn-archive/operator-theory/ap/b040/{compare-truth,compare-truth2,regimes,ussf-truth,ussf-truth2,ussf-regimes}: rows score days 1, 2, 3 and 7 only (experiments/xp-atmosphere-merit/config.json scoring.leadDays, read by experiments/operator-theory/truth-compare.mjs:23 and all-regimes.mjs:26). Days 4 and 5 have never been scored: unread.
- Medians at day 3 / day 7, 72 h fits (3D, m): drag LEO P: FFM 2,144 / 12,183, XP 3,533 / 20,615, SGP4-fit 3,542 / 20,473; Sentinel-1: FFM 930 / 3,336, XP 1,383 / 4,807; laser spheres LS: FFM 53 / 117, AP 80 / 283, XP 624 / 1,010, SGP4-fit 824 / 2,885; altimetry DO: FFM 95 / 843, AP 498 / 2,261, XP 960 / 3,597; geodetic GD: FFM 3 / 17, AP 16 / 24, XP 108 / 146; IGSO: FFM 7 / 30, AP 37 / 64, XP 79 / 164; GEO: AP 52 / 237, FFM 64 / 280, XP 70 / 225; TESS HE: XP 1,386 / 6,541, AP 2,009 / 7,605, FFM 2,210 / 5,115.
- GP (SGP4, Space-Track sets) robust sigma along-track by age, /opt/data/sdn-archive/gp-error-model/2026-08/model.json: LEO 600-800 km 927 m (2-3 d), 1,905 m (3-5 d), 4,917 m (5-7 d), CALIBRATED there with scale 0.72 / 0.68 / 0.51; LEO 800-1200 km 364 / 575 / 1,173 m (uncalibrated, 2 objects); GEO 1,562 / 2,560 / 5,369 m.
- Pc ceiling (zero miss): circular case 1 - exp(-HBR^2 / (2 sigma^2)) ~ HBR^2 / (2 sigma^2); anisotropic case the exact 2D Gaussian integral over the HBR disk with the full in-plane covariance (R and T axes; crossing geometry), never (HBR/sigma)^2 / (2e): that factor 1/e belongs to Alfano's maximum over sigma at a fixed miss, the statistic the console shows, which is reported beside the ceiling, not in its place. Limits for Pc 1e-4, circular: sigma_pair under 707 / 1,414 / 2,121 m at HBR 10 / 20 / 30 m. sigma_pair = sqrt(s1^2 + s2^2), set by the worse member. HBR set {10, 20, 50, 100} m; 10 m is the console default (CQR_generated.h:1243), 20 m is A13's.

## Scope
New directory experiments/five-day-ca (registration FIVE-DAY.md, runner five-day.mjs, lib/ca-reach.mjs, check.mjs) and results/five-day-ca. It imports experiments/operator-theory/lib read-only and changes nothing registered there; xp-atmosphere-merit/config.json is not edited (its leadDays are AP5's registration): the runner passes leads [1, 2, 3, 4, 5, 7].

## Registration (stage 1, committed before any day-4 or day-5 row is read)
- Groups, truth, cutoffs and arcs exactly as AP5.md (P, S1, GN; 24 h and 72 h) and AP6.md (LS, DO, GD, IG, GE, HE, HX; 72 h; LS and DO also 24 h). Arms AP, XP, S, F as there; U (Space Force XP) where its module runs.
- Holds: Swarm and GRACE-FO truth after 2026-10-31, the six held Galileo satellites, every Starlink group, C2's rows and every operator capture are not read (memory operator-theory-program-2026-11-01).
- Leads count from the fit's end (the cutoff). A lead day enters when 90 % of its grid states exist.
- Statistics per group, arm, arc and day: median and p10-p90 of the 3D RMS, RMS per RTN axis, the 95 % bootstrap interval of the median, n. Paired AP-XP, F-XP and XP-S differences as AP5 rules 1-3, at days 4 and 5 as new statements. Days 1, 2, 3 and 7 must reproduce the stored rows (same fits); a difference is a defect, not a result.
- CA reach: for each group, day, HBR in {10, 20, 50, 100} m and pair class (fit x fit same arm; fit x GP with the GP covariance from the error model's age bin and the group's altitude band, scaled where the stratum is CALIBRATED and labeled where it is not; GP x GP): the zero-miss ceiling (anisotropic, in-plane R and T) per window, sigma from each window's own R/T error for fit arms and from the model for GP, and the fraction of windows whose ceiling reaches 1e-4 and 1e-5; Alfano's maximum beside it. Report only.
- Synthetic encounters as A13 part 4 and propagator-ca-frontier: each window's real error vector against a drawn true miss (log-uniform 10 m to 5 km), hit = true miss under HBR 20 m; Pc under each arm's covariance: XP the C2 fairness constants (ffm-covariance-calibration, frozen 2026-10-29); FFM the C3-small constants for R2 and R3 and C2's elsewhere; AP its shipped covariance (propagator/sdn-ap covariance.inc flies XP's noise: label UNVERIFIED); S none (RMS stand-in, labeled); GP the error-model covariance by age. Endpoints by day: missed-alert and false-alert rates at Pc 1e-4, log and Brier scores, paired differences with bootstrap intervals. No threshold tested; every row reported.

## Acceptance
- results/five-day-ca/README.md with every table above; aggregates only under results (no Space-Track record redistributed).
- check.mjs: every group x arm x arc has rows at days 1, 2, 3, 4, 5 and 7 or a counted exclusion; days 1, 2, 3 and 7 match the b040 stores; the registration commit predates the first day-4 or day-5 row.
- One paragraph in the README: at 5 days, which pair classes can show a Pc at all, per HBR, and which arm changes that.

## Cost and lane
Per window: SGP4 0.1 s, XP 0.15 s, AP 0.9 s, FFM 3 s fit plus 2-4 s per 5 flight days (compare-costs rows). About 2,700 windows: XP, S and AP under 1 h single-threaded; FFM about 6 h single-threaded, 12 workers about 30 min; run by group if the 2 h box binds. Claude lane (harness JS; every state comes from the modules, no JS physics).
