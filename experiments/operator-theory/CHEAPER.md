# Confirming the cheaper FFM settings, on older files nobody has read

Registered 2026-11-02, before any file in these windows was fitted or scored under this test. `cycle-cheaper.sh`, `cheaper.mjs` and `lib/compare.mjs` beside this file are part of the registration.

The owner, 2026-11-01, verbatim: "OK so cheaper FFM might be the way to go".

Three explorations chose the settings below and prove nothing: `vendors-lite`, `vendors-ladder` and `vendors-integrator`, on CPF files of 2026-10-24 to 2026-11-01. Their reading: on low orbits, tolerance 1e-8 with steps to 300 s lost 0.048 km times days squared in-track at every gravity degree; steps to 120 s removed it at any tolerance from 1e-8 to 1e-11. This test asks whether that holds on other days.

## Data

CPF files from EDC's archive, read by `lib/vendors.mjs` with VENDORS.md's targets, draw, center split at 8,400 km and exclusions, with a stored listing so no worker asks EDC for one. One pass per day, each reading the newest file dated before that day:

2026-03-01 to 03-09, 03-12 to 03-20, 03-23 to 03-31, 04-03 to 04-11, 04-14 to 04-22, 04-25 to 05-03: 54 days, fixed before looking at them. All end well before C2's time hold-out, which starts 2026-06-01.

Fits use the first 48 h of the file. The reference is the first 3 h of a newer file of the same object from the same center, as everywhere in this program.

## Arms

| Regime | Name | Gravity | Tides, relativity | Tolerance, longest step |
|---|---|---|---|---|
| all | `X0@48` | plain XP, the control | | |
| low | `F-full@48` | 70x70 | both | 1e-10, 120 s: the registered FFM |
| low | `F-M40@48` | 40x40 | tides | 1e-8, 120 s |
| low | `F-M20@48` | 20x20 | neither | 1e-8, 120 s |
| low | `F-old@48` | 20x20 | neither | 1e-8, 300 s: the setting that failed |
| high | `F-Hfull@48` | 70x70 | both | 1e-10, 120 s: the registered FFM |
| high | `F-H20@48` | 20x20 | neither | 1e-8, 300 s |

Low orbits fit drag with solar pressure held, and high orbits fit solar pressure with no drag, as VENDORS.md.

## Groups

`low`: every target below 8,400 km. `navigation`: targets above it named BeiDou, Galileo, GLONASS, GPS, NavIC or QZSS. `geodetic`: the other targets above it, LAGEOS and Etalon. Centers are pooled within a group, because the question is the setting, not the operator. An object predicted by several centers is one object in the bootstrap. Each center's medians are printed beside the pooled table.

## Rules

`lib/compare.mjs`, the same code as `table.mjs`: the paired median and its two-way bootstrap interval, with at least 30 pairs, 8 objects and 3 start days. An arm with more than 10 % of its pairs failed cannot claim. Leads are the 72 h and 168 h bins.

An arm needs both claims at both leads:

1. **Beats plain XP:** the interval of arm less `X0@48` lies below zero.
2. **Keeps full FFM:** the top of the interval of arm less full FFM is at most the margin.

| Arm | Group | Margin at 72 h, km | Margin at 168 h, km |
|---|---|---:|---:|
| `F-M40@48` | low | 0.020 | 0.100 |
| `F-M20@48` | low | 0.050 | 0.500 |
| `F-H20@48` | navigation | 0.005 | 0.020 |
| `F-H20@48` | geodetic | 0.010 | 0.050 |

`F-old@48` makes no claim. It must lose: the interval of `F-old@48` less `F-M20@48` at 168 h lies above zero. If it does not, the integrator explanation failed on these days, and no setting here is recommended, whatever its own cells say.

The geodetic group holds fewer than 8 objects, so it can only be report only.

Fit and flight time per file are printed, per arm, as ratios within one run under load. They are not benchmarks.

## Limits

- The reference is the center's next prediction, not independent truth. Agreement may partly mean sharing a force model with that center.
- The weather is GFZ's observed history, since no issued forecasts are stored for these days. FFM arms therefore know the weather of the prediction stretch, and plain XP uses none. This does not touch the comparison with full FFM, but it flatters FFM against XP where drag matters, mostly the few targets below 700 km.
- Most of these targets do not thrust. Starlink's thrust hides these differences, so nothing here says what Starlink needs.

No arm, day, margin or rule changes after this registration. A result here changes no module, default or public claim by itself.
