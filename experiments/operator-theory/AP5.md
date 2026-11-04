# AP beside XP, SGP4 and FFM against precise orbits

Registered 2026-11-02, before XP with its own priors, SGP4 or these FFM settings were fitted to any window below. `truth-compare.mjs`, `cycle-ap5.sh` and `ap5-verdict.mjs` beside this file are part of the registration.

The owner, 2026-11-02, verbatim: "also have the truth and links to the data from each provider".

## What this adds

`AP.md` registered AP against XP only against each center's next prediction, with hindsight weather. Against precise orbits AP has only been compared with public element sets and with its own earlier builds. This runs XP, SGP4 and FFM on AP's own windows, with the same truth, grid, coverage rule and as-issued weather, so each is compared with AP by pair.

## What was already read

AP 0.4.0's rows on these windows are read (`AP4.md`). So are public element sets and an XP arm with solar pressure held at 0.01 m^2/kg, on the same windows (`results/xp2-fit-design`, `results/xp-atmosphere-merit`). XP with solar pressure free has not been fitted to them, nor have SGP4 or these FFM settings.

## Arms

Each is fitted to the arc that ends at the cutoff and reads nothing after it.

| Arm | Build and settings |
|---|---|
| `AP24`, `AP72` | AP 0.4.0's stored rows from `AP4.md`: `FORCES` 31, 20, NRLMSISE-00 on as-issued weather |
| `XP24`, `XP72` | `propagator/sdn-ap` 0.4.0, wasm 715ef2fee512, `FORCES` and `FIT` unset, which is XP bit for bit, so it fits solar pressure as AP does |
| `S24`, `S72` | `analysis/gp-error-model` fits, `propagator/sgp4` flies, as `COMPARE.md` |
| `F24`, `F72` | `analysis/estimation` 0.7.0 fits, `propagator/ffm` 2.0.4 flies, `CHEAPER.md`'s settings unchanged. Low orbit and near 700 km: 40x40, tides, tolerance 1e-8, steps to 120 s, NRLMSISE-00 on the same as-issued rows. Medium Earth orbit: 20x20, no drag, tolerance 1e-8, steps to 300 s |

Seeds are `CHEAPER.md`'s, the same for every object. An SGP4 set flies on SGP4 and nothing else. FFM's fit reads precise states, never an element set.

## Windows

- Part T: `AP.md`'s 944 strong-drag windows, 2025-04-01 to 2025-12-21. Arc 24 h.
- Part N: `AP2.md`'s windows, 2026-01-01 to 2026-05-31: `P` (the same satellites), `S1` (near 700 km), `GN` (medium Earth orbit). Arcs 24 h and 72 h.

Swarm and GRACE-FO truth after 2026-10-31, C2's hold-out from 2026-06-01 and every operator capture are not read.

## Statements

Part T's statistics from `AP.md`: d = ln(e_AP / e_other) per window; clusters the ISO week of the cutoff; a 10,000-draw cluster bootstrap; 97.5 % percentile intervals. Rule 1: the interval of the median d lies below 0. Rule 2: the upper bound of the interval of ln(p95_AP / p95_other) is below ln 1.10. Rule 3: at most 1 % of AP's pairs failed; a failed AP counts d = +Infinity; a window where the other arm failed leaves the cell, counted. A window whose arc or truth is too sparse for an arm leaves that arm's cell, counted.

1. Part T: `AP24` beats `XP24`: rule 1 at days 1, 2, 3 and 7; rules 2 and 3 at days 1, 2, 3 and 7.
2. Part N, `P`: `AP24` beats `XP24`: the same.
3. Part N, `S1`: `AP72` beats `XP72`: rule 1 at days 1 and 3; rules 2 and 3 at days 1, 2, 3 and 7.
4. Part N, `GN`: `AP72` beats `XP72`: rule 1 at days 1 and 3; rules 2 and 3 at days 1, 2, 3 and 7.

Report only: every contrast with `S` and `F`, every other arc.

## Limits

- Every fit reads precise products, published after the fact.
- The windows were read for AP and for an XP arm with solar pressure held, so a pass here tests XP's fit freedom on known ground, not fresh days.
- FFM's settings were chosen by `CHEAPER.md` on laser-ranging predictions in 2026, and are not tuned to these satellites. Published mass and area would likely help it.

No arm, window, margin or rule changes after this registration.

## Re-measured 2026-11-04 on one $OCM in, report only

Build: modules ea824356, `propagator/sdn-ap` 0.5.1 (wasm d29acd2b5d92) and `propagator/sgp4-xp` 0.2.1 (816fd137d761), replacing this registration's AP 0.4.0 (715ef2fee512) and the Space Force XP's sgp4-xp 0.1.1. `ap-truth.mjs` and `truth-compare.mjs` fitted every arm below as one `$OCM` and flew it alone, on these windows, truth, grid and as-issued weather, into `ap/b051` (`lib/remeasure.mjs`, `results/remeasure-0-5-1.md`).

- `AP24` and `AP72`: every row equals AP 0.4.18's (`ap/b0418`, AP9.md) byte for byte, 944 Part T windows and 1812 Part N windows. 0.5.1 changes how a set enters and leaves the module, not its numbers; this registration's 0.4.0 rows stand as registered, and AP7.md and AP9.md read the later builds.
- `XP24` and `XP72`: every row equals AP7.md's 0.4.11 rerun (`ap/b0411`) byte for byte, 944 and 1812 windows.
- `S` and `F` are not rerun: neither flies `sdn-ap` or `sgp4-xp`.
- The Space Force XP moved with sgp4-xp 0.2.1, which flies whole integrator steps. Median km, 0.1.1 / 0.2.1:

| Group | Fit | Windows | Day 1 | Day 2 | Day 3 | Day 7 |
|---|---|---:|---:|---:|---:|---:|
| T | 24 h | 944 | 1.72 / 1.72 | 5.58 / 5.57 | 12.4 / 12.4 | 63.9 / 63.9 |
| P | 24 h | 750 | 1.74 / 1.74 | 5.84 / 5.83 | 12.4 / 12.4 | 65.3 / 65.3 |
| P | 72 h | 750 | 0.874 / 0.876 | 1.79 / 1.79 | 3.53 / 3.53 | 20.4 / 20.2 |
| S1 | 24 h | 300 | 2.63 / 2.63 | 8.90 / 8.91 | 19.3 / 19.3 | 98.5 / 99.4 |
| S1 | 72 h | 300 | 0.690 / 0.689 | 0.934 / 0.935 | 1.36 / 1.35 | 4.34 / 4.35 |
| GN | 24 h | 750 | 0.053 / 0.053 | 0.100 / 0.100 | 0.149 / 0.148 | 0.363 / 0.352 |
| GN | 72 h | 750 | 0.041 / 0.041 | 0.058 / 0.057 | 0.076 / 0.074 | 0.166 / 0.152 |

No statement above reads the Space Force XP; no verdict changes.
