# AP on data it was not tuned on

Registered 2026-11-02, before any AP fit of these windows, days or satellites. `ap-verdict.mjs`, `cycle-ap.sh`, `ap-truth.mjs`, `lib/ap.mjs` and `lib/compare.mjs` beside this file are part of the registration.

The owner, 2026-11-02, verbatim: "restart 'AP' which is really XP2, the idea of replacing parts of XP to get a better answer. add back the tesserals and anything else that will help, going forward we will call this AP, not XP2".

## What was already read

Explorations chose the settings below and prove nothing: 18 low and 29 high CPF targets on 2026-10-24 to 11-01; the back-test's first 100 Starlinks; xp2-fit-design's 270 windows of 2025-01-01 to 03-31 on Swarm A, B and C. The term ladder of the FFM trajectory in `propagator/sdn-ap/test`, and the old theory's earlier tests in `results/sdn-gp-starlink-ffm-match`, informed them too.

The data below were read for other arms, never for AP: xp2-fit-design's later windows for its own arms, CONFIRM's satellites for its arms, the 54 days of CHEAPER.md for its arms (its verdict was not read when this was written). No AP fit touched them before this registration, and nothing here was chosen from those other arms' results on them.

## The build and the settings, fixed

`propagator/sdn-ap` at modules 783133149abb8949e30cac32398bb624369f3a8f, wasm SHA-256 0b021c575466642cd661cd39dcb911de89b63c8430ae9ac2d94c84c7539f8c6a.

AP: `FORCES` `MAXIMUM_TESSERAL_DEGREE` 31, `MAXIMUM_DEGREE` 20, NRLMSISE-00 on daily weather (`ENABLE_DRAG`, `ATMOSPHERE_MODEL` NRLMSISE00, `WEATHER_SOURCE` RECORDS, `WEATHER_EXTENSION` HOLD_LAST), `FIT` unset, so the module's own priors. `XP` is the same build with `FORCES` and `FIT` unset, which is XP bit for bit, so it fits solar pressure as AP does. The earlier vendor table's XP arm held it at 0.01 m^2/kg, which understated XP above the drag regime.

## Part T: against precise orbits

xp2-fit-design's truth, grid, as-issued weather, coverage rule and failure rule, unchanged. Windows: its primary span, 2025-10-04 to 12-21 on Swarm A, B, C and GRACE-FO 1, 2 (395), and its extension from 2025-04-01 to 09-30 on Swarm A, B, C (549): 944 windows. Leads: days 1, 2, 3, 7.

| Arm | Elements from | Drag from |
|---|---|---|
| `AP24` | AP fitted to the last 24 h | that fit |
| `APRa12` | AP fitted to the last 17 h, solar pressure held as in RFa12 | RFa12's stored 12 h FFM value, held |

Stored rows give `P` (the newest public set on SGP4), `X2` and `RFa12` on the same windows at the older pinned build.

With d = ln(e_arm / e_ref) per window, clusters the ISO week of the cutoff, a 10,000-draw cluster bootstrap and 97.5 % percentile intervals. Rule 1: the interval of the median d lies below 0. Rule 2: the upper bound of the interval of ln(p95_arm / p95_ref) is below ln 1.10. Rule 3: at most 1 % of pairs failed. A failed arm counts d = +Infinity.

A fixed sequence; a statement is tested only if every earlier one passed.

1. `AP24` beats `P`: rules 1, 2 and 3 at days 1, 2, 3 and 7.
2. `AP24` beats `RFa12`: rule 1 at days 1 and 2.
3. `APRa12` beats `AP24`: rule 1 at days 1 and 2.

The site's figures come from `APRa12` if statement 3 passes, else `AP24`, whichever the outcome of the others, labeled by what passed. Report only: each arm by span, by satellite group, with Ap at least 40 in the 72 h before the cutoff, and against `X2`.

## Part L: low orbits that do not thrust

CHEAPER.md's 54 days, centers, targets, group `low`, reference, weather and its stored listing. Arms: `A-AP@48`, `A-XP@48`, `A-AP@72`, `A-XP@72`. Rules: `lib/compare.mjs`, with at least 30 pairs, 8 objects and 3 start days, an arm with more than 10 % of pairs failed cannot claim.

Claim: the interval of `A-AP@48` less `A-XP@48` lies below zero at both 72 h and 168 h. Report only: 72 h fits; AP against FFM at CHEAPER's settings, by pair.

## Part H: orbits above 8,400 km

The same days, groups `navigation` and `geodetic`. No gain is claimed from exploration. For AP to replace XP everywhere it must not lose: the top of the interval of `A-AP@72` less `A-XP@72` is at most 0.005 km at 72 h and 0.020 km at 168 h on `navigation`. `geodetic` holds fewer than 8 objects, so it is report only.

## Part S: Starlink

CONFIRM.md's satellites, positions 401 to 800, every finished capture, its pairs and reference; 16 h fits, as-issued weather as CONFIRM. Reads only the `.ocm` state vectors CONFIRM already reads: no other satellite, no covariance, no `json.gz`. Arm `A-AP`; its controls come from CONFIRM's stored rows by pair.

Claim: the interval of `A-AP` less `X0@16` lies below zero at both 24 h and 48 h, with CONFIRM's minimum counts: the 24 h verdict after the 11-02 capture is scored, the 48 h after the 11-03. Report only: against `X2@16` and `F-NRLMSISE00@16`.

## Limits

- Part T's fits read precise products, published after the fact; it answers theory and fit, not what a service fed by anything else would get. The pool is mostly Swarm.
- Parts L, H and S score against the operator's own later solution, not independent truth. Parts L and H use hindsight weather, as CHEAPER.md: it flatters AP against XP only through the atmosphere, on the few targets below 700 km.
- Part S is one operator in one storm stretch, and SpaceX's thrust is unknown to every arm.

No arm, window, margin or rule changes after this registration. A result here changes no default by itself.
