# Cheaper FFM settings, on days nobody had read

## Reading

FFM does not need its full settings to keep its accuracy. On 54 days of laser-ranging predictions it was never tuned on, low orbits lose nothing at 40x40 gravity with tides, tolerance 1e-8 and steps to 120 s, at about half the cost per file. Orbits above 8,400 km lose nothing on navigation satellites at 20x20, tolerance 1e-8 and steps to 300 s, at about a tenth of the cost. Every registered claim passed.

What it means: the step size matters more than the force model in low orbit. The same 20x20 run with steps to 300 s, the setting of an earlier test here, is 2.26 km off at day 7, and 0.54 km with steps to 120 s. The earlier finding that cheap FFM lost at low altitude was that integrator setting, not the forces.

What it does not mean: the reference is each center's next prediction, not independent truth, and agreement may partly mean sharing a force model with that center. The weather is observed history, so the FFM arms knew the weather of the prediction stretch. Most of these targets do not thrust, so this says nothing about what Starlink needs.

## Test

Registered before any of these files was fitted: `experiments/operator-theory/CHEAPER.md`, with `cycle-cheaper.sh`, `cheaper.mjs` and `lib/compare.mjs`. 19,399 pairs on 2026-03-01 to 05-03, 16 centers, fits on the first 48 h of each file, reference the first 3 h of a newer file of the same object from the same center. Tables: `table.md`, `table.json`. Medians over pairs, km.

| Group | Arm | Gravity | Tides, relativity | Tolerance, longest step | 72 h | 168 h | Fit, s | Flight, s |
|---|---|---|---|---|---:|---:|---:|---:|
| Low, 17 satellites | Full FFM | 70x70 | both | 1e-10, 120 s | 0.034 | 0.169 | 11.7 | 11.0 |
| Low | `F-M40` | 40x40 | tides | 1e-8, 120 s | 0.035 | 0.173 | 5.7 | 5.3 |
| Low | `F-M20` | 20x20 | neither | 1e-8, 120 s | 0.065 | 0.539 | 3.2 | 2.6 |
| Low | `F-old` | 20x20 | neither | 1e-8, 300 s | 0.416 | 2.262 | 2.6 | 2.0 |
| Low | Plain XP | | | | 0.621 | 1.254 | 0.14 | 0.05 |
| Navigation, 28 satellites | Full FFM | 70x70 | both | 1e-10, 120 s | 0.011 | 0.118 | 7.0 | 9.7 |
| Navigation | `F-H20` | 20x20 | neither | 1e-8, 300 s | 0.011 | 0.119 | 0.69 | 0.76 |
| Navigation | Plain XP, solar pressure held | | | | 0.178 | 0.547 | 0.06 | 0.02 |

Times are medians per file within one run under load: read them as ratios, not as benchmarks.

## Verdicts

| Arm | Group | Beats plain XP at 72 h and 168 h | Top of the interval against full FFM, against the margin | Claim |
|---|---|---|---|---|
| `F-M40` | Low | Yes | 0.000 of 0.020 at 72 h, 0.003 of 0.100 at 168 h | Yes |
| `F-M20` | Low | Yes | 0.029 of 0.050 at 72 h, 0.385 of 0.500 at 168 h | Yes |
| `F-H20` | Navigation | Yes | 0.000 of 0.005 at 72 h, 0.000 of 0.020 at 168 h | Yes |
| `F-H20` | Geodetic, 4 satellites | | | Report only: 0.004 and 0.018 km at 72 h and 168 h, full FFM 0.001 and 0.003 |

`F-old` had to lose for any of this to count: `F-old` less `F-M20` at 168 h is 2.003 km [1.882, 2.114], so it lost, and the integrator explanation holds.

## Corrections

- **Plain XP above the drag regime is understated here.** This control holds solar pressure at 0.01 m^2/kg while FFM fits it. Against XP with solar pressure free, from AP.md's run on the same pairs, `F-H20` still wins at 48 h fits: less 0.046 km [0.037, 0.055] at 72 h and 0.085 km [0.066, 0.106] at 168 h. At XP's 72 h fits it wins by 0.026 km [0.022, 0.028] and 0.050 km [0.033, 0.066]. The verdict stands on the fair control, with smaller gains than the table above shows.
- 54 of 1,531 low files failed on FFM and AP: one satellite, `nanoffb`, whose newest file is dated before the weather table starts. It forms no pairs, so no cell is touched. `F-old` failed on one more.

## AP against these settings

Report only, by pair, from `results/ap-truth`: AP 0.3.0 fitted to the same 48 h on low orbits is 0.086 and 0.484 km at 72 h and 168 h; AP 0.4.0 is 0.060 and 0.484 km. That is level with `F-M20` at 168 h (AP less it -0.029 km [-0.241, 0.034]) and behind `F-M40` (0.051 km [0.010, 0.206]). AP costs about 0.6 s to fit and 0.2 s to fly in its own run, so on low orbits it reaches `F-M20`'s accuracy at about a fifth of the fit and a tenth of the flight. `F-M40` stays the closest cheap setting. Above the drag regime `F-H20` beats AP by 0.025 km [0.021, 0.028] and 0.050 km [0.034, 0.064] at AP's 72 h fit, at about ten times AP's cost.
