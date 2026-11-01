# Confirming what looked better than XP, on satellites nobody has read

Registered 2026-11-01, before any of these satellites was fitted or scored. `explore.mjs --confirm` beside this file is part of the registration.

The owner, 2026-11-01, verbatim: "What else can we try to do something better than XP?"

`explore.mjs` tried candidates on 100 of the back-test's satellites, whose results had already been read. Those numbers chose the candidates below and prove nothing. This test asks whether they hold on fresh satellites.

## Satellites and data

As `BACKTEST.md`, with the same exclusions (E13b's held-out group, V2's 500, the forward test's 60), the same SHA-256 order, and positions 401 to 800 of that order. Every finished capture from `2026-10-30T05-01-35-297Z` on. Only state vectors are read. The same limits apply: SpaceX's later solution is the reference, not independent truth, and the head holds 16 h.

## Arms

The control is `X0@16`, plain XP fitted to the 16 h head.

| Name | Fit |
|---|---|
| `X0@16` | control: SGP4-XP, built-in atmosphere |
| `X2@16` | XP2, weather as issued |
| `X2flat` | XP2 with the last observed day of weather held flat, no forecast |
| `X0st`, `X2st` | XP and XP2 fitted to the first hours of the two earlier files and then this file, from the third file of a satellite on |
| `RFz` | drag from FFM on the last 12 h, elements from the 16 h with that drag held. Where FFM's drag is below 1e-4 m^2/kg, 1e-4 is held, so nothing is refused |
| `F-NRLMSISE00@16` | full FFM 70x70 |
| `F-lite` | FFM at 20x20, Sun and Moon, solar pressure and NRLMSISE-00, no tides or relativity, tolerance 1e-8, steps to 300 s |

Left out because the exploration showed no clear gain: XP with signed drag, FFM with one along-track term in place of drag. XP2 on hindsight weather is left out because no forecast can use it.

## Rules

`table.mjs`'s, unchanged, with each arm against `X0@16` read from the paired median and its two-way bootstrap interval. A claim that an arm beats plain XP needs the interval below zero at both 24 h and 48 h, each with at least 30 pairs, 8 objects and 3 start days. Three start days reach 24 h with the capture of 2026-11-02 and 48 h with the capture of 2026-11-03. Before that every cell is report only. The heavy tail of the stitched fits is printed: a fit that crosses a maneuver or a change between files is not removed.

No arm, sample or rule changes because of an interim table. A result here changes no module, default or public claim by itself. XP2's weather is not judged here: Starlink thrusts, so the same arms go to Planet next, by a separate registration.
