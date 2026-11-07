# Catalog growth: on-orbit index (report-only)

Registration: `CATALOG-GROWTH.md`. Index = objects with a live element set (epoch within 30 days before 1 January 00:00 UTC, not decayed) relative to the base year (2000 = 1 unless the table states another). `counts.jsonl` holds the counts for the whitepaper only; the site, the chart and marketing never read it.

## Index by year

| Year | PAYLOAD | ROCKET BODY | DEBRIS | UNKNOWN | ALL |
|---|---|---|---|---|---|
| 2000 | 1.000 | 1.000 | 1.000 | - | 1.000 |
| 2001 | 1.029 | 1.004 | 1.024 | - | 1.022 |
| 2002 | 1.041 | 0.991 | 1.011 | - | 1.017 |
| 2003 | 1.060 | 0.988 | 1.010 | - | 1.022 |
| 2004 | 1.069 | 0.995 | 1.027 | - | 1.034 |
| 2005 | 1.104 | 1.008 | 1.058 | - | 1.063 |
| 2006 | 1.120 | 1.016 | 1.074 | - | 1.077 |
| 2007 | 1.146 | 1.036 | 1.155 | - | 1.131 |
| 2008 | 1.178 | 1.055 | 1.674 | - | 1.411 |
| 2009 | 1.214 | 1.080 | 1.757 | - | 1.469 |
| 2010 | 1.251 | 1.099 | 2.273 | - | 1.749 |
| 2011 | 1.273 | 1.122 | 2.387 | - | 1.820 |
| 2012 | 1.302 | 1.136 | 2.354 | - | 1.814 |
| 2013 | 1.333 | 1.155 | 2.428 | - | 1.864 |
| 2014 | 1.392 | 1.165 | 2.372 | - | 1.856 |
| 2015 | 1.454 | 1.179 | 2.390 | - | 1.886 |
| 2016 | 1.518 | 1.207 | 2.415 | - | 1.923 |
| 2017 | 1.578 | 1.228 | 2.468 | - | 1.973 |
| 2018 | 1.740 | 1.249 | 2.623 | - | 2.105 |
| 2019 | 1.855 | 1.300 | 2.628 | 1.000 | 2.223 |
| 2020 | 2.038 | 1.389 | 2.666 | 0.946 | 2.311 |
| 2021 | 2.512 | 1.400 | 2.832 | 1.422 | 2.576 |
| 2022 | 3.170 | 1.421 | 3.117 | 1.403 | 2.924 |
| 2023 | 3.958 | 1.452 | 2.880 | 1.468 | 3.050 |
| 2024 | 4.854 | 1.471 | 2.673 | 1.122 | 3.192 |
| 2025 | 5.545 | 1.479 | 2.573 | 1.335 | 3.366 |
| 2026 | 6.950 | 1.496 | 2.437 | 1.051 | 3.703 |

Base year: PAYLOAD 2000, ROCKET BODY 2000, DEBRIS 2000, UNKNOWN 2019, ALL 2000.

## Time per era (95 percent interval) and verdict

Pass chances: P(E|E) and P(L|E) at a true exponential; P(L|L) and P(E|L) at a true linear (2000 trials per cell).

| Type | Era | n | Kind | Years | Interval | Delta AIC | P(E\|E) | P(L\|E) | P(L\|L) | P(E\|L) | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PAYLOAD | 2000-2009 | 10 | doubling | 34.0 | 30.9 to 37.7 | 3.42 | 0.188 | 0.079 | 0.145 | 0.053 | undecided |
| PAYLOAD | 2010-2017 | 8 | doubling | 20.2 | 17.5 to 23.9 | 2.72 | 0.18 | 0.088 | 0.141 | 0.071 | undecided |
| PAYLOAD | 2018-2026 | 9 | doubling | 3.8 | 3.4 to 4.2 | 15.04 | 0.979 | 0.004 | 0.815 | 0.062 | exponential (growth) |
| PAYLOAD | 2000-2026 | 27 | doubling | 11.0 | 9.1 to 14.0 | 43.96 | 0.958 | 0.014 | 0.801 | 0.091 | exponential (growth) |
| ROCKET BODY | 2000-2009 | 10 | doubling | 84.1 | 55.5 to 173.2 | 0.35 | 0 | 0 | 0 | 0 | undecided |
| ROCKET BODY | 2010-2017 | 8 | doubling | 46.2 | 41.9 to 51.3 | 1.04 | 0.06 | 0.03 | 0.046 | 0.027 | undecided |
| ROCKET BODY | 2018-2026 | 9 | doubling | 33.0 | 24.9 to 48.8 | -1.62 | 0.004 | 0.003 | 0.01 | 0.004 | undecided |
| ROCKET BODY | 2000-2026 | 27 | doubling | 38.9 | 35.9 to 42.4 | 11.30 | 0.653 | 0.077 | 0.593 | 0.08 | undecided |
| DEBRIS | 2000-2009 | 10 | doubling | 12.2 | 7.6 to 30.3 | 3.88 | 0.199 | 0.057 | 0.253 | 0.073 | undecided |
| DEBRIS | 2010-2017 | 8 | doubling | 88.5 | 49.5 to 420.7 | -0.17 | 0 | 0 | 0 | 0 | undecided |
| DEBRIS | 2018-2026 | 9 | halving | 123.7 | - to 24.2 | 0.50 | 0.001 | 0 | 0.001 | 0 | undecided |
| DEBRIS | 2000-2026 | 27 | doubling | 14.8 | 12.3 to 18.6 | -8.47 | 0.875 | 0.04 | 0.833 | 0.062 | linear |
| UNKNOWN | 2000-2009 | 0 | - | - | - | - | - | - | - | - | undecided |
| UNKNOWN | 2010-2017 | 0 | - | - | - | - | - | - | - | - | undecided |
| UNKNOWN | 2018-2026 | 8 | doubling | 41.5 | 8.0 to none | 0.03 | 0.039 | 0.009 | 0.035 | 0.008 | undecided |
| UNKNOWN | 2000-2026 | 8 | doubling | 41.5 | 8.0 to none | 0.03 | 0.044 | 0.008 | 0.041 | 0.007 | undecided |
| ALL | 2000-2009 | 10 | doubling | 17.8 | 11.7 to 36.9 | 2.75 | 0.071 | 0.027 | 0.1 | 0.028 | undecided |
| ALL | 2010-2017 | 8 | doubling | 47.3 | 37.3 to 64.5 | -0.04 | 0.001 | 0 | 0.003 | 0.001 | undecided |
| ALL | 2018-2026 | 9 | doubling | 9.6 | 8.6 to 10.9 | 0.14 | 0.649 | 0.105 | 0.653 | 0.091 | undecided |
| ALL | 2000-2026 | 27 | doubling | 13.5 | 12.5 to 14.7 | 25.55 | 0.994 | 0.001 | 0.971 | 0.013 | exponential (growth) |
