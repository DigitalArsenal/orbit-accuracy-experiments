# Long timing of SGP4 and XP flights and fits (BENCHMARK.md amendment 2026-11-06)

Each timed call holds at least 1.2 s of CPU (the same flight or fit repeated inside the call), five measurements per window; AP keeps its rows. Rows: `rows.jsonl`. Load through the run: 8.66 to 14.46.

## AP over the arm, the page's statistic (median over eight regimes of AP's regime median over the arm's)

| Arm | Phase and step | Registered (single call) | Long timing | Spread across the five measurements, median |
|---|---|---|---|---|
| SGP4 | flight, 300 s | 106x | 212x | 8.2 % |
| SGP4 | flight, 60 s | 160x | 184x | 6.9 % |
| SGP4 | fit | 22x | 26x | 1.8 % |
| XPU | flight, 300 s | 11x | 9.9x | 1.9 % |
| XPU | flight, 60 s | 9.2x | 9.9x | 3.1 % |
| XPU | fit | 0.7x | 0.7x | 1.2 % |
| XP | flight, 300 s | 15x | 15x | 4.4 % |
| XP | flight, 60 s | 15x | 16x | 4.9 % |
| XP | fit | 11x | 10x | 3.3 % |

Registered at 60 s means the single-call flights of the screening-scale study (loaded). The fit is not step-dependent.
