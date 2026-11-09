# Long timing of SGP4, XP and AP flights and fits (BENCHMARK.md amendments 2026-11-06 and 2026-11-09)

Each timed call holds at least 1.2 s of CPU (the same flight or fit repeated inside the call), five measurements per window, across SGP4, XP whiteroom (`sdn-ap 0.6.5`), XP Space Force (`sgp4-xp 0.2.2`), and AP (`sdn-ap 0.6.5`). Rows: `rows.jsonl`. Load through the run: 8.16 to 50.6.

## AP over the arm, the page's statistic (median over eight regimes of AP's regime median over the arm's)

| Arm | Phase and step | Registered (single call) | Long timing | Spread across the five measurements, median |
|---|---|---|---|---|
| SGP4 | flight, 300 s | 2.6x | 2.6x | 8.2 % |
| SGP4 | flight, 60 s | 2.0x | 2.3x | 6.9 % |
| SGP4 | fit | 1.0x | 1.0x | 1.8 % |
| XPU | flight, 300 s | 0.27x | 0.17x | 1.9 % |
| XPU | flight, 60 s | 0.18x | 0.17x | 3.1 % |
| XPU | fit | 0.05x | 0.05x | 1.2 % |
| XP | flight, 300 s | 0.30x | 0.23x | 5.0 % |
| XP | flight, 60 s | 0.22x | 0.23x | 5.8 % |
| XP | fit | 0.53x | 0.51x | 4.1 % |

Registered at 60 s means the single-call flights of the screening-scale study (`sdn-ap 0.6.5`). Values below 1.00x mean AP (`sdn-ap 0.6.5`) is faster than the comparator arm. The fit is not step-dependent.
