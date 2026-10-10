# E6 results

The plan is [`experiments/e6-public-observations/PLAN.md`](../../experiments/e6-public-observations/PLAN.md)
(frozen at `285f4bc`, amendments A1–A2). The test window's generated
[REPORT.md](test/REPORT.md) and [metrics.json](test/metrics.json) come
from the step runs whose manifests are in [`test/manifests/`](test/manifests/)
(modules `space-data-network-modules` main `095c20a6`, HPOP `0d1f6264…`,
every artifact's SHA-256 recorded). Dev: [`dev/`](dev/) (calibrations and the
dev report). Inventory: [`inventory.json`](inventory.json). Inputs:
[`data/e6/`](../../data/e6/SOURCES.md).

B is the latest public element set at the cutoff propagated by SGP4. P is
the element-set history alone, fitted by full-force HPOP (the OMM-only
product). F2 adds the SatNOGS range rates; S adds the ILRS laser ranges.
Errors are 3D, in the truth's RTN axes; intervals are 95 %, cluster
bootstrap by object and fit day.

## Laser ranging (Starlette, Stella, LARETS, WESTPAC, LARES; 2026-07-16..08-29)

208 cutoffs, 25,202 normal points in 3,419 passes. Median 3D error, m:

| Horizon | B (OMM + SGP4) | P (OMM history, HPOP) | S (history + laser) | S / B |
| --- | ---: | ---: | ---: | --- |
| 0 | 472 | 1,708 | 7 | 0.015 [0.013, 0.018] |
| 6 h | 345 | 1,840 | 8 | 0.023 [0.019, 0.028] |
| 1 d | 485 | 2,092 | 9 | 0.020 [0.016, 0.024] |
| 3 d | 482 | 2,671 | 17 | 0.036 [0.029, 0.044] |
| 7 d | 685 | 3,414 | 42 | 0.061 [0.049, 0.083] |

- **H5 (anchor) supported at every horizon.** The passes alone (R) give the
  same orbit as S: with laser ranges the element-set history adds nothing.
- **H6 not supported:** S's covariance is too small (mean d²/3 16–21, 95 %
  coverage 0.14–0.18). The range σ (3.7 m, dev) absorbs the unmodelled
  troposphere, but the formal covariance has no term for errors that are
  correlated within a pass or for the drag model, and E6 adds no process
  noise.
- **H7 learning curve** (ratio of medians to B): one pass 0.37 (0 d) to
  1.55 (7 d); two passes 0.21 to 1.21; four passes 0.05 to 0.50; eight
  passes 0.024 to 0.31. One pass beats the element set for a day; four beat
  it at every horizon to 7 days.
- P is worse than B by 3.6–5.5× at every horizon, but its covariance is
  realistic (mean d²/3 0.68–0.83, coverage 0.96–0.98).

## SatNOGS Doppler (ISS; 2026-08-29..09-04, 09-09..10-09)

73 cutoffs; 835 passes (18,711 range rates) extracted from 3,852
observations (4,197 captured; waterfalls fetched for those marked good or
with a signal). Median 3D error, km:

| Horizon | B (OMM + SGP4) | P (OMM history, HPOP) | F2 (history + SatNOGS) | F2 / B | n |
| --- | ---: | ---: | ---: | --- | ---: |
| 0 | 1.23 | 1.47 | 3.50 | 2.67 [0.66, 6.70] | 20 |
| 6 h | 1.10 | 1.61 | 4.95 | 4.49 [1.29, 10.05] | 20 |
| 1 d | 0.45 | 3.62 | 4.86 | 10.70 [1.90, 21.69] | 20 |
| 3 d | 2.56 | 5.73 | 8.47 | 3.32 [1.31, 7.23] | 20 |
| 7 d | 16.48 | 43.76 | 61.82 | 3.87 [2.42, 7.18] | 22 |

- **H1 not supported.** At cutoffs with at least 8 segments F2 is worse than
  B at 6 h, 1, 3 and 7 days, and undecided at 0 (ratio 2.67, interval
  0.66–6.70). The SatNOGS range rates pull the orbit away from the element
  sets rather than toward the truth.
- **H2 not supported:** F2's covariance is far too small (mean d²/3
  570–780, coverage 0).
- **H3:** no number of segments brings F2 below B. With 1, 4 and 16 of the
  most recent segments (every third cutoff) the ratio to B is 1.6–5.8,
  1.6–5.7 and 2.8–6.9 at 0–7 days; with every segment 2.7–10.7. The range
  rates alone (O2) are 4.2–9.6 km at 0–3 days; the variant with one common
  lag (F1, every third cutoff) is also worse than B (2.6–6.1).
- Why: on dev the waterfall offsets fit the truth to the calibrated noise
  only after each segment takes its own frequency bias (median |bias|
  590 Hz), drift (σ 0.38 m/s²) and timing lag (σ 1.07 s, about 8 km of
  along-track). Those per-segment terms leave the orbit's along-track
  position, which is what B already knows to about a kilometre, to the
  priors, and the station biases that remain are correlated within a pass.
  The PNG waterfalls (≈ 77 Hz per pixel) and their time axes (recording
  start known to whole seconds where a UTC axis exists) cannot do better.
- P (the history alone) is worse than B (1.2–7.9× in ratio of medians) and
  its covariance too small at 0–1 day (mean d²/3 4.8–7.6), closer at 3–7
  days (1.7–3.4).

## Element-set state against measurement-anchored state (E7 cross-check)

E7 found full-force HPOP from an element set's epoch state worse than SGP4
from 12–24 h on, because of the epoch state's along-track velocity error.
On the same objects and cutoffs here (medians; ratio of medians to B):

| Arm | Along-track \|T\| at 0 h: B / P / anchored | 1 d: B / anchored | 3 d | 7 d |
| --- | --- | --- | --- | --- |
| Laser (S) | 394 m / 1,099 m / 5.7 m | 485 m / 9 m (0.020) | 482 m / 17 m (0.036) | 685 m / 42 m (0.061) |
| SatNOGS (F2) | 1.22 km / 1.47 km / 3.10 km | 0.45 km / 4.86 km (10.7) | 2.56 km / 8.47 km (3.3) | 16.5 km / 61.8 km (3.9) |

Precise ranges fix the initial state (along-track 6 m) and the
prediction then stays 20–60 times better than SGP4 to 7 days; the element
sets alone fitted by HPOP (P) do not (E7's finding, here at 3.6–5.5× worse
than SGP4 for the laser targets); SatNOGS Doppler from waterfall images does
not fix it either.

## Amateur optical

H4 not supported: 18 IOD lines of objects with public truth in the truth
spans (CryoSat-2 9, SWOT 6, Swarm B 1, Sentinel-3A 1, Sentinel-3B 1) against
the 20 the plan requires, from 8,007 lines on 1,065 objects (SeeSat-L,
June–October 2026). No optical fit was attempted.

## Products for E9

Every fitted variant at every cutoff is a product (GCRF state at the
cutoff with its (6 + 1)² covariance over state and B, the fit-epoch state
and covariance, B and AGOM, the force model, the element sets and segments
used): `runs/<step run>/products.jsonl`, listed with their counts in
`test/metrics.json` (`products`). They derive from Space-Track element sets
and stay on this machine.

<!-- credits:begin (harness/credit-lines.mjs) -->

## Credits

- Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org).

Every source and its terms: [docs/data-licenses.md](../../docs/data-licenses.md#credits-by-experiment).

<!-- credits:end -->
