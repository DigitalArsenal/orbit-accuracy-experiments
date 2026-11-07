# Alerts per real conjunction, per theory (registration)

Task experiments-alerts-per-conjunction-20261106. Report-only. Registered before any row; the runner `alerts-per-conjunction.mjs` refuses to fly on a dirty or uncommitted registration. Outputs are under `results/two-exponentials/alerts-per-conjunction/`.

Label, on every table and chart: **real geometry and real forecast errors, simulated pairing. No covariance anywhere; this is not a collision-probability result.** Arm 1 adds: input precise orbits. Arm 2 adds: input public element sets.

## Question

If a screen must catch a stated share of the encounters whose true miss is under 1 km, and it has only a theory's forecast to judge by, how many alerts does it raise per true event?

## Definitions

- Encounter: a close approach in the screen below. Its true miss is the screen's miss distance. A true event is an encounter with a true miss under 1 km.
- Forecast miss: `|m + P (eA - eB)|`, where `m` is the miss vector at closest approach, `P` the projection on the plane normal to the relative velocity, and `eA`, `eB` a forecast error drawn for each object, independently, in that object's radial, in-track and cross-track axes at closest approach. An error along the relative velocity moves the time of closest approach, not the miss.
- Alert radius: the smallest radius holding the stated share of true events' forecast misses. Alert: an encounter of any true miss whose forecast miss is at or inside the radius. Alerts per true event: alerts divided by true events. A perfect forecast gives about 1. Statistics only: every state comes from the module; the arithmetic here rotates and counts.
- Primary radius rule: one radius per regime pair, as a screen sets its volume by regime, so that one rare regime's tail does not set the radius of the whole catalog. A pair with under 100 true events joins one shared "sparse" class. The single radius for all events is reported beside it. The primary reading is 99 percent, 3 days ahead.

## The geometry: the B2 screen

- The screen of `SCREENING-SCALE.md`, unchanged: `analysis/conjunction-assessment` 0.18.4, wasm SHA-256 `fe7533e9168c65f31b5d98ea90bafb76024a5e035df5c7f34d252da44718bfec` and the same pinned host files, SGP4 on the GP snapshot `2026-11-05` (SHA-256 `b6317649...`), 7 days from 2026-11-06 00:00 UTC, 28 windows of 6 hours, coarse step 60 s, 8 module threads, the phased path. B2 stored counts and a digest, no event, so tier t0 flies that screen again keeping each event's states. It must equal B2's landed event set: the same count and event-set digest `ef114fe59487d57ffc7c92be81fe22d01f443c564e3fce362897837ebb8f4eb7`, or no table is written. Only SGP4 flew this geometry. The "true" miss is SGP4's, used as a realistic population of encounters, not as a claim about what happened in orbit.
- Beyond 5 km. A forecast with errors of many km raises alerts from encounters whose true miss is far above 5 km, which the B2 screen does not hold. The same screen is flown at wider thresholds on B2's seeded thinning (rank by SHA-256 of `screening-scale-20261106:<seed>:<NORAD>`), seeds 1, 2, 3:

| Tier | Fraction | Threshold km | Keeps true miss km | Weight per encounter |
|---|---|---|---:|---|
| t0 | 1 | 5 | 0 to 5 | 1 |
| t1 | 1/8 | 50 | 5 to 50 | N(N-1) / k(k-1) |
| t2 | 1/64 | 300 | 50 to 300 | N(N-1) / k(k-1) |
| t3 | 1/256 | 1000 | 300 to 1000 | N(N-1) / k(k-1) |

  Closure, stated: t1 seed 1's events under 5 km against B2's `ladder-1-8-s1` count (16,091) on the same objects, within 1 percent; each tier's weighted count in the band it shares with the tier below it, against that tier's. A radius beyond 1000 km counts only what the tiers hold: its alerts read "at least". Event states stay in scratch; only aggregates are committed.
- Object regime: from each object's GP mean motion, eccentricity and inclination (perigee height with Earth radius 6378.137 km):

| Rule, first match | Regime | Fit hours |
|---|---|---:|
| e >= 0.1 | Highly elliptical, THEMIS and Chandra | 72 |
| perigee < 600 km | Strong drag, 2025 and 2026, pooled | 24 |
| perigee 600 to 750 km | Near 700 km | 72 |
| perigee 750 to 2000 km | Low orbit, altimetry | 72 |
| perigee 2000 to 15000 km | Laser geodetic | 72 |
| perigee 15000 to 30000 km | Medium Earth orbit | 72 |
| perigee >= 30000 km, inclination < 5 deg | Geostationary | 72 |
| perigee >= 30000 km | Inclined geosynchronous | 72 |

  The fit per regime is the site's front table (`TC_CUTS`). Sensitivity: perigee 750 to 2000 km on the laser-sphere rows (`Low orbit, laser spheres`, fit 72) instead of altimetry.

## The errors, arm 1: fits to precise orbits

Each window's stored radial, in-track and cross-track RMS for lead day k, the stretch (k-1, k] days after the fit's end, with a random sign on each component (the stores hold RMS, not signed errors). Stores are those of `compare-cells.mjs`; `--check` holds the median of each arm's 3D error to the matching landed cell of `results/ap-truth/compare/cells.json`, at days 1 and 3.

| Theory | Store, under `/opt/data/sdn-archive/operator-theory` | Build, as `cells.json` names it |
|---|---|---|
| SGP4, refit to truth | `ap/b0411/{compare-truth,compare-truth2,regimes}` arm S | analysis/gp-error-model 0.11.0, propagator/sgp4 1.4.1 |
| XP, whiteroom | `ap/b0411/{compare-truth,compare-truth2,regimes}` arm XP | flown on sdn-ap 0.4.11; equal on 0.5.1, 0.6.3, 0.6.4 by the proofs in `cells.json` provenance |
| XP, Space Force | `ap/b051/{ussf-truth,ussf-truth2,ussf-regimes,ussf-regimes-hx}` arm U | propagator/sgp4-xp 0.2.1 |
| AP | `ap/b051/{truth,truth2,regimes}` and `ap/b063/regimes-hx` arm AP | flown on sdn-ap 0.5.1, THEMIS and Chandra on 0.6.3; named 0.6.4 by the identities in `cells.json` provenance |
| FFM | `ap/ffm220/{compare-truth,compare-truth2,regimes}` arm F | propagator/ffm 2.2.0, RK78, analysis/estimation 0.7.0; 40x40 in strong drag, near 700 km, altimetry, laser spheres; 20x20 elsewhere |

Lead days 1 and 3 fly all five theories. Lead day 5 exists only in `day-leads/{truth,truth2,regimes,compare-truth,compare-truth2}` (`DAY-LEADS-RESCORE.md`, sdn-ap 0.5.1): AP and whiteroom XP alone, and no THEMIS and Chandra rows, so encounters with a highly elliptical object are left out of day 5 and their share is stated. SGP4, FFM and the Space Force XP have no day 5: it is reported as not measured and is not interpolated.

Burns are in the rows, as landed. Sensitivity at 3 days: near 700 km and altimetry without the windows `results/operator-theory/maneuver-flags` flags with a burn in the fit or the forecast.

Same-window. The theories flew the same windows where a window key holds all of them, and not everywhere (`cells.json`: 49 against 60 forecasts at inclined geosynchronous). The primary reading uses each theory's whole cell as landed. A bootstrap replicate resamples window keys jointly, so a key missing from a theory drops from that theory alone. The README states each regime's share of keys common to all five. Sensitivity at 3 days: only the keys common to all five.

Holds: no Starlink group is parsed, no held Galileo satellite (43567, 37847, 41862, 41174, 43055, 41175), no operator capture, no C2 row; Swarm and GRACE-FO truth never after 2026-10-31. The loader refuses a row that breaks these. The rows are the small set of satellites with precise orbits, carried by regime to every object in the catalog. Starlink and most of the low catalog therefore fly the errors of Swarm and GRACE-FO.

## The errors, arm 2: public element sets

SGP4 on the latest public set at the cutoff, `sgp4-latest` of `/opt/data/sdn-archive/sdn-ap-gp-history-od/rows` (`results/sdn-ap-gp-history-od`), against precise orbits. Lead days 1 and 3; day 5 is not measured. Lines with regime `leo-starlink` are dropped as text before parsing.

- Only SGP4 is in this arm. That experiment's XP and AP arms fit SGP4-generated states and fly them, which the owner's rule of 2026-11-01 bars from any test.
- Regime map: perigee < 600 km `leo-iss`, the one measurement below 600 km that is not held (one object, 15 windows); 600 to 2000 km `leo-slr`; 2000 to 15000 km `meo-slr`; 15000 to 30000 km `meo-gnss`; geosynchronous `igso-gnss`, `geo-gnss`. Highly elliptical: `heo-tess` has 3 windows of a 13.7-day orbit, so those encounters are left out and their share is stated. Sensitivity: `leo-slr` also below 600 km, because the ISS's reboosts are not a typical object's.
- The rows hold 3D error only. Each draw takes its axes from a random window of arm 1's SGP4 rows at the same lead in the mapped regime (the unit vector of radial, in-track, cross-track). Sensitivity at 3 days: a uniformly random direction.

Arm 2 is on other windows than arm 1. The two are never paired: there is no ratio and no verdict between them, only each arm's figure with its interval.

## Interval

Percentile bootstrap, 400 replicates, seeds fixed by replicate number. Each replicate resamples, per regime and lead, satellites and then windows within each drawn satellite where the regime has 5 or more satellites, and windows only where it has fewer; draws new errors; and takes tiers t1 to t3 from one seed picked at random. The interval therefore covers the error rows, the draws and the thinning. It does not cover the catalog being one week, or the small set of satellites behind each regime. The point figure is replicate 0: the rows as landed, tiers t1 to t3 averaged over the three seeds.

## Three-way rule and pass chances

Per comparator (SGP4, XP whiteroom, XP Space Force, FFM), at the primary reading of arm 1 only, on the ratio alerts(AP) / alerts(comparator) within each replicate:

- AP fewer: the interval's upper bound is below 0.9.
- AP not fewer: the interval's lower bound is at or above 0.9.
- Undecided: anything else. The ratio and its interval are stated whatever the verdict. Every other setting is descriptive, without a verdict. Four verdicts, four chances of a false one.

Pass chances, computed and committed before any real error row is read by the simulation (`sizing.json`): 200 trials of the whole rule, 100 bootstrap replicates each, on a 1/16 subsample of the events, with synthetic errors: per regime a lognormal 3D error through AP's median and 95th percentile in `cells.json` at day 3, the windows per regime as landed, axes 0.1 : 1 : 0.1. The comparator is the same law with its errors multiplied by k: k = 1 for a true ratio of 1, and k from bisection for a true ratio of 0.5. Reported: P(fewer | 1), P(not fewer | 1), P(fewer | 0.5), P(not fewer | 0.5).

## Reading that must be stated

- Errors on the two objects are independent. Real errors in one shell share a density error, which would make them partly cancel; independent draws do not.
- The encounter is treated as straight-line motion. The share of true events under 100 m/s relative speed, where that fails, is stated; a sensitivity leaves them out.
- A true event's radius and its alert draw are independent draws. The realized catch share is stated as a check.
- This study derives no compute ratio. It uses none of B2's fits and none of B2's timing rows.

## Disclosures

Read before this registration: B2's README, rows, tables and diagnosis; `cells.json` and `sigma.json`, including their figures; `results/ap-truth/day-leads/README.md`; `results/sdn-ap-gp-history-od/table.json`, whose printed aggregates included the held Starlink row's published medians (not used here). Row files were opened for field names on one line each, by shape. Plumbing test, not a row: the first 6-hour window on 411 objects at 5, 50 and 300 km, to see that wider thresholds run and to size the tiers; its counts set the fractions above and no figure from it is kept. No alert has been computed.

## Outputs

- `meta.json`: registration commit, sizing commit, builds, tier digests. `counts.jsonl`: raw objects and events per tier, whitepaper only; the site never reads it.
- `sizing.json`, `rows.jsonl` (per replicate), `table.json`, `README.md`, `chart.json`.
- `--check`: registration before the first row, and sizing before the first alert row, by committer dates; t0's digest equal to B2's; arm 1's medians equal to `cells.json`; the table reproducing byte for byte from the rows; alerts per true event per theory with intervals; both arms; the sensitivities.
