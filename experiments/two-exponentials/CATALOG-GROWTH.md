# Catalog growth: on-orbit index by year (registration)

Task experiments-catalog-growth-20261106. Report-only. Registered before any row is computed; the runner refuses to fly on a dirty or uncommitted registration. The runner is `catalog-growth.mjs`; outputs are under `results/two-exponentials/catalog-growth/`.

## Question

Is the number of objects on orbit growing exponentially, linearly, or is the data unable to say, per object type and per era?

## Inputs (archive only; no network)

1. `/opt/data/sdn-archive/historical/space-track-gp-history-1959-2022-11-22/Archives2.zip`: one CSV per object (`Archives2/satNNNNNNNNN.csv`, 54,714 files), element sets with epochs 1959-05-23 through 2022-11-22. Fields used: EPOCH, NORAD_CAT_ID. The CSV has no object-type field.
2. `/opt/data/sdn-archive/spacetrack/gp_history/by-creation/{2022,2023,2024,2025,2026}/*.json.gz`: element sets by creation day (2022-11-20 onward). Fields used: EPOCH, NORAD_CAT_ID. Files read are the creation days 2022-12-02 through 2023-01-03 for the 2023 date, the same span around each later year-end (2023-12-02 to 2024-01-03, 2024-12-02 to 2025-01-03, 2025-12-02 to 2026-01-03), and nothing else. These records carry an OBJECT_TYPE field; it is not used, so one label source covers all years.
3. `/opt/data/sdn-archive/spacetrack/satcat/2026/2026-11-05.json.gz`: the SATCAT snapshot. Fields used: NORAD_CAT_ID, OBJECT_TYPE (as the source labels it: PAYLOAD, ROCKET BODY, DEBRIS, UNKNOWN), DECAY. The label is the snapshot's, applied to every year. The elements are never back-dated: only the label comes from the snapshot.

The Archives2 window for every date up to 2022-01-01 and the gp_history window for 2023-01-01 and later do not overlap in time except where the 2022-01-01 date uses Archives2 (epochs through 2021-12-31) and the 2023-01-01 date uses gp_history (epochs 2022-12-02 to 2022-12-31). No other source is read. The decay files, TIP messages and every restricted path are not read.

## Index definition

Sampling dates: 1 January 00:00 UTC of each year 2000 through 2026 (27 dates). An object is on orbit at date t if it has at least one element set with epoch in [t - 30 days, t) (N = 30 days, epoch recency, so 2 December to 31 December of the prior year) and its SATCAT DECAY date is empty or on or after t. The count of live objects at t of type T is c(T, t). The index is c(T, t) / c(T, 2000-01-01), base year 2000 = 1. A type whose 2000 count is below 20 takes as its base the first sampled year with a count of at least 20, stated in the table. Counts are written to `counts.jsonl` for the whitepaper only; the site, chart and marketing never read it.

## Type partition

PAYLOAD, ROCKET BODY, DEBRIS, UNKNOWN as SATCAT labels them; an object that has a live set but no SATCAT row counts as UNKNOWN. ALL is the sum of the four. Each row of the table is one type.

## Eras

Fixed before any archive row was read: 2000-2009, 2010-2017, 2018-2026, and the whole span 2000-2026. The first two are the decade and the eight years before the turn the prior reports; 2018 is the prior's turn year (SDN-AP's SATCAT read) and the era runs to the last sampled date, 2026. Era points are the sampled years inside the era (10, 8, 9 and 27 points). x = year - 2000.

## Fits

Per type and era, ordinary least squares on the index y:

- Log-linear: ln y = a + b x. Doubling time D = ln 2 / b years when b > 0 (halving time when b < 0, reported as such).
- Linear: y = c + s x.

Interval on D: from the slope's standard error with the Student t quantile at n - 2 degrees of freedom (95 percent); D interval = ln 2 / (b +/- t se); when the lower slope bound is not above zero the upper D bound is reported as "none" (unbounded). No bootstrap.

## Test

The statistic is Delta = AIC_linear - AIC_exponential, both on the index scale, with the Jacobian of the log: AIC_exp = n ln(RSS_log / n) + 2 sum ln y_i + 6; AIC_lin = n ln(RSS_lin / n) + 6 (three parameters each: two coefficients and the variance). Delta > 0 favors the exponential, Delta < 0 the linear. A reading is called when |Delta| >= 2.

Pass chance, sized per cell by simulation (2000 trials, fixed seed, same n as the cell, same x values):

- True exponential: y_i = exp(a + b x_i + e_i), e_i normal with the cell's log-fit residual standard deviation, a and b from the cell's log fit.
- True linear: y_i = c + s x_i + e_i, e_i normal with the cell's linear-fit residual standard deviation, c and s from the cell's linear fit; a trial with any y_i not above zero is redrawn.

The table reports, per cell, P(exponential called | true exponential), P(linear called | true exponential), P(linear called | true linear), P(exponential called | true linear). Each remaining probability is "undecided".

## Three-way rule (per type and era)

- exponential: Delta >= 2 and P(exponential called | true exponential) >= 0.80 and P(exponential called | true linear) <= 0.10.
- linear: Delta <= -2 and P(linear called | true linear) >= 0.80 and P(linear called | true exponential) <= 0.10.
- undecided: anything else (including a cell whose simulation shows the test cannot separate the two).

An exponential verdict states its direction (growth or decline) from the sign of b. The chart and every claim use the verdict as printed, per type and era; no verdict is stated for a cell the rule marks undecided.

## Prior (a prior and nothing more)

SDN-AP's crude SATCAT read (launched by year Y and not decayed by Y, 2000 = 1): payloads 1.0 in 2000, 1.61 in 2018, 2.07 in 2020, 5.5 in 2025, doubling about 3.5 to 3.9 years since 2018; all objects 1.08 in 2018, 1.51 in 2025. Fragments are back-dated to the parent launch in SATCAT, so that read is wrong for debris; this archive-based study decides. Nothing here is tuned toward or away from the prior.

## Outputs

- `rows.jsonl`: one row per date and type, index only.
- `counts.jsonl`: counts per date and type; the site never reads this file.
- `table.json` and `README.md`: index by year and type; doubling time per era with interval; verdict per type and era with the pass chances.
- `chart.json`: index series per type, base year, doublings (log2 of the index); values only, no count.
- `--check`: registration committed before the first row; the table reproducing byte for byte from the rows; a verdict stated for every cell.
