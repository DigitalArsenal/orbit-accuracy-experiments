# AP 0.4.11 against AP 0.4.0, on AP4.md's data

Registered 2026-11-03, before any fit of this build on these windows, days or satellites. `cycle-ap7.sh` and `ap7-verdict.mjs` beside this file are part of the registration, with the files AP4.md names.

The owner, 2026-11-03, on whether to register a rerun of the full-precision build on the same truth windows, with the site moving only on a pass: "yes".

## The build

`propagator/sdn-ap` 0.4.11 at modules a0f33bc545d76f47d679c7854c6963fb8efcf799, wasm SHA-256 e4edacb03daff4eaba47263010c27009a6d888259c0d8f028605cebf4d655610, the committed `dist/isomorphic/module.wasm`. `FORCES` 31, 20, NRLMSISE-00, `FIT` unset, exactly as AP4.md. Over 0.4.0, from its changelog, it:

- keeps the fit's full precision in AP sets instead of rounding to two-line-element digits (0.4.9);
- holds the epoch resonance class in flight (0.4.3) and adds half-day tesseral terms through degree 31 (0.4.2);
- adds the third bodies' averaged terms of degree 4 to 10, and their short-period terms of degree 2 to 10 (0.4.8, 0.4.11);
- shares the long-period frame policy (0.4.6) and adds a one-day step for GEO (0.4.4);
- gives short arcs whose AGOM prior is unset the Space Force's AGOM prior (0.4.7);
- adds process noise to the covariance (0.4.1), which no statement here reads.

0.4.9 was the build the owner was offered. Main moved to 0.4.11 before this registration, and a new version replaces the old one everywhere, so this tests 0.4.11.

## What was already read

These windows, days and satellites were read for AP 0.4.0, 0.3.0 and other arms, so those results are known. The module's own lanes ran exploratory replays of this build's changes on AP6.md's laser-geodetic, IGSO, GEO and TESS windows, and on the Space Force archive. None of those are the windows here. No fit of 0.4.9 to 0.4.11 has touched Parts T, N, L or S below. One disclosed exception, outside them: before this was written, a smoke test flew both builds on 6 Swarm windows of 2025-01-06 to 01-09, from xp2-fit-design's extension span, before Part T's first cutoff. It checked that the output frame had not moved with 0.4.6. It had not: the builds agreed to within about 1 % at every day, on both arms. It changed no arm, setting, window or rule. Each statement is this build against the same arm of 0.4.0, by pair.

## Part T: against precise orbits

AP4.md's Part T: AP.md's 944 windows, truth, grid, as-issued weather and coverage rule. AP4.md's statistics: d = ln(e_new / e_old) per window, clusters by the ISO week of the cutoff, a 10,000-draw cluster bootstrap, 97.5 % percentile intervals. Rules 2 and 3 are AP4.md's. Rule 1n, not losing, is new here: the upper bound of the interval of the median d lies below ln 1.02.

1. `APRa12` at 0.4.11 does not lose to 0.4.0: rule 1n, 2 and 3 at days 1, 2, 3 and 7.
2. `AP24` the same.

Report only: AP4.md's rule 1, beating 0.4.0, at each day. In this drag regime most of the changes move little, and the AGOM prior may move the 24 h arm either way.

## Part N: near 700 km and medium Earth orbit

AP4.md's Part N windows, truth and statistics. Arms `AP72` and `AP24`.

- `GN`: `AP72` at 0.4.11 beats 0.4.0: rule 1 at days 1 and 3; rules 2 and 3 at days 1, 2, 3 and 7. At 26,000 km a rounding of 1e-4 degrees is about 45 m, against 0.4.0's median of 22 m at day 1.
- `S1`: `AP72` at 0.4.11 does not lose to 0.4.0: rules 1n, 2 and 3 at days 1, 2, 3 and 7.

Report only: `AP72` in `S1` against `P`, the statement 0.3.0 and 0.4.0 failed; `AP24` in `S1`; every arm in `P`.

## Part L: laser-ranging orbits

AP4.md's Part L: CHEAPER.md's 54 days, centers, targets, groups, reference, weather and stored listing. Arms `A-APm@48`, `A-APm@72`, controls 0.4.0's stored `A-APn@48`, `A-APn@72`, by pair. Rules: `lib/compare.mjs`, at least 30 pairs, 8 objects and 3 start days; an arm with more than 10 % of pairs failed cannot claim.

- `navigation`: the interval of `A-APm@72` less `A-APn@72` lies below zero at both 72 h and 168 h.
- `low`: does not lose: the upper bound of the interval of `A-APm@48` less `A-APn@48` is below 0.005 km at both 24 h and 72 h. This is AP.md's Part H margin at 72 h.

Report only: every other lead and fit, `geodetic`, and against FFM at CHEAPER's settings.

## Part S: Starlink

Report only. AP.md's Part S pairs through the 2026-11-03 05:00 capture, 16 h fits, reading only the `.ocm` state vectors CONFIRM.md already reads. `A-APm` against `A-APn` and `X0@16`, by pair.

## What moves on a pass

The site moves to 0.4.11 only as a whole, and only if statements 1 and 2, `GN`, `S1` and both of Part L's claims pass. Then AP's arm is rerun at this build, report only, wherever the site shows AP: AP6.md's regimes, the HEO and WAAS groups, GEO-TRUTH.md's part F, and the worked examples and costs. Every AP figure on the site then comes from 0.4.11, and 0.4.0 is not offered. If any of them fails, the site stays at 0.4.0, and says why.

## Limits

- Part T's fits read precise products, published after the fact. The pool is mostly Swarm, where day 7 is the density forecast.
- Part L's reference is the center's next prediction, not independent truth, and its weather is hindsight.
- The same data have been read for the arm each statement compares against. This tests the build's changes, not fresh days.
- The 2 % and 0.005 km margins allow a small loss. They are set here, before any result.

No arm, window, margin or rule changes after this registration.
