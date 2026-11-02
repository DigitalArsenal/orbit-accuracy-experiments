# AP fitted to FFM's forecast

Registered 2026-11-02, before any fit of this kind on these days. `ap-ffmfit.mjs --registered`, `cycle-ap3.sh`, `ap3-verdict.mjs` and `lib/compare.mjs` beside this file are part of the registration.

The owner, 2026-11-02, verbatim: "restart 'AP' which is really XP2, the idea of replacing parts of XP to get a better answer. add back the tesserals and anything else that will help, going forward we will call this AP, not XP2".

## The idea

A node fits FFM to the operator's states and carries it across the days the set will fly. AP is fitted to those states, not to the operator's arc. The consumer flies AP, at AP's cost, and follows FFM's forecast as closely as AP's theory can. FFM is seeded from operator states, never from an SGP4 set, so the owner's SGP4 rule is not touched.

## What was already read

An exploration chose this and proves nothing: `ap-ffmfit.mjs` on `vendors`, 18 low and 79 high targets on 2026-10-24 to 11-01, 1,117 pairs, full FFM, 96 h and 180 h windows. Its medians at 24, 72, 120 and 168 h:

| Group | Arm | 24 h | 72 h | 120 h | 168 h |
|---|---|---:|---:|---:|---:|
| Low | AP on the operator's 48 h | 0.060 | 0.086 | 0.184 | 0.297 |
| Low | AP on FFM's 180 h | 0.065 | 0.074 | 0.096 | 0.193 |
| Low | Full FFM | 0.004 | 0.028 | 0.064 | 0.175 |
| High | AP on the operator's 48 h | 0.025 | 0.050 | 0.089 | 0.131 |
| High | AP on FFM's 180 h | 0.041 | 0.035 | 0.045 | 0.062 |
| High | Full FFM | 0.001 | 0.008 | 0.026 | 0.048 |

The 54 days below were read for `A-AP`, `A-XP` and every FFM arm (AP.md Parts L and H, CHEAPER.md): those results are known. No fit to FFM's forecast has touched them. Nothing here was chosen from them except the controls named below, picked as the strongest plain AP there, which makes the test harder.

## Data and build

CHEAPER.md's 54 days, centers, targets, groups, reference and weather, stored FFM fits and stored listing; AP.md's build, wasm SHA-256 0b021c575466642cd661cd39dcb911de89b63c8430ae9ac2d94c84c7539f8c6a, and AP settings: `FORCES` 31, 20, NRLMSISE-00, `FIT` unset.

## Arms

| Name | Fit |
|---|---|
| `APF` | AP fitted to the stored `F-M40@48` (low) or `F-H20@48` (high) carried from the file's first state to 180 h, 300 s grid |
| `A-AP@72`, `A-AP@48` | controls, AP.md's rows by pair: AP fitted to the operator's arc |
| `F-M40@48`, `F-H20@48`, `F-full@48`, `F-Hfull@48` | CHEAPER.md's rows by pair |

## Rules

`lib/compare.mjs`: the paired median and its two-way bootstrap interval, with at least 30 pairs, 8 objects and 3 start days. An arm with more than 10 % of its pairs failed cannot claim.

Claim, in each of `low` and `navigation`, tested apart: the interval of `APF` less `A-AP@72` lies below zero at both 120 h and 168 h.

Report only: 24 h and 72 h, where the exploration shows a loss at 24 h and no clear gain at 72 h; `APF` against `A-AP@48` and against the FFM it was fitted to; `geodetic`, which holds fewer than 8 objects; fit and flight time per file, under load.

## Limits

- The reference is the center's next prediction, not independent truth.
- Hindsight weather, as CHEAPER.md. AP and FFM both read it; a real service would read a forecast.
- `APF` is fitted to 180 h and is not meant to fly past it. Its error inside the first day is larger than AP's on the operator's arc: the fit spreads AP's residual over a week.
- A node pays for FFM. This gives the consumer a cheap flight, not the producer a cheap fit.

No arm, day, margin or rule changes after this registration. A result here changes no module, default or public claim by itself.
