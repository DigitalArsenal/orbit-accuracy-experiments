# AP 0.4.0 against AP 0.3.0, on data this build has not touched

Registered 2026-11-02, before any fit of this build on these windows, days or satellites. `cycle-ap4.sh`, `ap4-verdict.mjs`, `ap-truth.mjs`, `arms.mjs`, `score.mjs`, `explore.mjs`, `lib/ap.mjs` and `lib/compare.mjs` beside this file are part of the registration.

The owner, 2026-11-02, verbatim: "restart 'AP' which is really XP2, the idea of replacing parts of XP to get a better answer. add back the tesserals and anything else that will help, going forward we will call this AP, not XP2".

## The build

`propagator/sdn-ap` 0.4.0 at modules 148f3b9f20b8c62d57dce677b1049464a71049df, wasm SHA-256 715ef2fee512e9c91aacf1c977151dbb1eb83c6b1fa0e1a160cba3304a876ec0. `FORCES` 31, 20, NRLMSISE-00, `FIT` unset, exactly as AP.md. Over 0.3.0 it adds, in SPEC 16: every first-order tesseral term to degree 12 and near-resonant terms to 31, at output time, and each state carried to TEME of its date.

## What was already read

Explorations chose these and prove nothing: the spectrum of AP against FFM's own 96 h on a handful of CPF targets of 2026-10-24 (`residual.mjs`, not committed, a reading tool), and forward errors on `vendors`' 9 days of 2026-10-24 to 11-01. There, median km at 24, 72, 120 and 168 h:

| Group, fit | Arm | 24 h | 72 h | 120 h | 168 h |
|---|---|---:|---:|---:|---:|
| Low, 48 h | 0.3.0 | 0.060 | 0.086 | 0.184 | 0.297 |
| Low, 48 h | 0.4.0 | 0.018 | 0.048 | 0.184 | 0.285 |
| Navigation, 72 h | 0.3.0 | 0.028 | 0.042 | 0.085 | 0.133 |
| Navigation, 72 h | 0.4.0 | 0.022 | 0.026 | 0.052 | 0.110 |

The windows, days and satellites below were read for AP 0.3.0 and for other arms, so those arms' results are known. No fit of this build touched them. Each statement below is this build against the same arm of 0.3.0, by pair.

## Part T: against precise orbits

AP.md's Part T: its 944 windows, truth, grid, as-issued weather, coverage rule and statistics. Arms `AP24n` and `APRa12n` are that part's `AP24` and `APRa12` at this build. d = ln(e_new / e_old) per window; clusters the ISO week of the cutoff; a 10,000-draw cluster bootstrap; 97.5 % percentile intervals. Rule 1: the interval of the median d lies below 0. Rule 2: the upper bound of the interval of ln(p95_new / p95_old) is below ln 1.10. Rule 3: at most 1 % of pairs failed; a failed arm counts d = +Infinity, a window under 90 % of its arc's states leaves the cell, counted.

1. `APRa12n` beats `APRa12`: rule 1 at day 1; rules 2 and 3 at days 1, 2, 3 and 7.
2. Tested only if 1 passed: `AP24n` beats `AP24`: rule 1 at day 1; rules 2 and 3 at days 1, 2, 3 and 7.

## Part N: near 700 km and medium Earth orbit

AP2.md's windows, truth and statistics. Arms `AP72n` and `AP24n`.

- `S1`: `AP72n` beats `P`: rules 1, 2 and 3 at days 1, 2, 3 and 7. This is the statement `AP72` failed at 0.3.0, on rule 2 at days 1 and 2.
- `GN`: `AP72n` beats `AP72`: rule 1 at days 1 and 3; rules 2 and 3 at days 1, 2, 3 and 7.

Report only: `AP24n` in `S1`, every arm in `P`.

## Part L: laser-ranging orbits

CHEAPER.md's 54 days, centers, targets, groups, reference, weather and stored listing. Arms `A-APn@48`, `A-APn@72`. Rules: `lib/compare.mjs`, at least 30 pairs, 8 objects and 3 start days; an arm with more than 10 % of pairs failed cannot claim. Controls: AP.md's stored `A-AP@48`, `A-AP@72`, by pair.

- `low`: the interval of `A-APn@48` less `A-AP@48` lies below zero at both 24 h and 72 h.
- `navigation`: the interval of `A-APn@72` less `A-AP@72` lies below zero at both 72 h and 168 h.

Report only: every other lead and fit, `geodetic`, and against FFM at CHEAPER's settings.

## Part S: Starlink

Report only. AP.md's Part S satellites and pairs, 16 h fits, reading only the `.ocm` state vectors CONFIRM.md already reads. `A-APn` against `A-AP` and `X0@16`, by pair. The exploration gave no reason to expect a gain: SpaceX's thrust is unknown to every arm and dominates at these leads.

## What moves on a pass

A new version replaces the old one everywhere, so the site moves to 0.4.0 only as a whole: if statement 1 and both of Part L's claims pass. Then every row of its table comes from this build's registered arms, labeled by what passed. If not, the site stays at 0.3.0 and does not offer 0.4.0.

## Limits

- Part T's fits read precise products, published after the fact. The pool is mostly Swarm. Near drag this strong, day 7 is the density forecast: nothing here is expected to move it.
- Part L's reference is the center's next prediction, not independent truth, and its weather is hindsight.
- The same data have been read for the arm each statement compares against. It tests this build's terms, not fresh days.

No arm, window, margin or rule changes after this registration.
