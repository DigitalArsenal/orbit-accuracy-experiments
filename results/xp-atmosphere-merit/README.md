# XM-fast: does our AP XP with NRLMSISE-00 beat public SGP4 on precise LEO truth?

**No.** Our AP version of SGP4-XP with NRLMSISE-00 in place of its native atmosphere (X2), fitted to 72 h of precise
truth, does not beat the public Space-Track set under the console's SGP4 (P) on drag-strong precise LEO (Swarm A, B and
C, GRACE-FO 1 and 2). It is worse at days 1, 2 and 3: the median error is 10 %, 17 % and 9 % higher, and each interval
lies wholly above zero. At day 7 it is 8 % lower, but the interval includes zero. Sentinel-1 gives the same answer. By
the registered rule, this evidence does not support making SGP4-XP the console default.

The new atmosphere does make XP itself better. Against native XP (X0, Jacchia 1970 on the generic flux model), X2 cuts
the median error by 4 %, 16 %, 20 % and 24 % at days 1, 2, 3 and 7 on the same drag-strong LEO, and passes the
registered rule at every lead. X3 (NRLMSISE-00 times the open-DCA nowcast) fails on more than 1 % of windows because
the density-correction producer issued no correction on three dates.

Generated from `results/xp-atmosphere-merit/table.json` (`node experiments/xp-atmosphere-merit/table.mjs`, 1,812 stored
windows, rows digest `5ebcddc4f423`). Plan: [PLAN.md](../../experiments/xp-atmosphere-merit/PLAN.md), registered at
2026-10-30T13:35:20-04:00 (commit 59dbe07, pushed to origin before any score). Modules fbda89450, propagator/sdn-ap
49fa4b0f65887a7b, propagator/sgp4 1.4.1 2fe246b716c78a4b.

## What a pass means

- The X arms fit truth-quality precise products over the 72 h before the cutoff. Those products are not real-time;
  P is the public set available at the cutoff.
- So a pass answers the owner's theory-and-atmosphere question ("with truth / owner operator data"). It does not answer
  the console supply question; operator files (H2 in the program plan) answer that.
- The GN group is a control: above the drag-free altitude X2 must equal X0 bit for bit.

## The registered rule

X2 beats P in a group only if every lead cell (days 1, 2, 3 and 7; 72 h arc; as-issued weather O) meets all three:
(1) the 95 % cluster-bootstrap interval of the median ln(e_X2 / e_P) lies wholly below 0; (2) the upper bound of the
interval of ln(p95 of e_X2 / p95 of e_P) is below ln 1.10; (3) X2 fails on at most 1 % of the pairs. e is the 3D RMS
position error of the lead day (km); clusters are orbit group x ISO week (Swarm A and C one orbit group, GRACE-FO 1 and 2
one, Sentinel-1A and 1C one); 10,000 draws.

## Primary: X2 against P (72 h arc, condition O)

Group P, drag-strong precise LEO: 750 pairs in 66 clusters at every lead; no failure of either arm.

| Lead | X2 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio, upper bound | Rules met |
| --- | --: | --: | --: | --- | --: | --- |
| Day 1 | 0.860 | 0.763 | +10.1 % | +7.8 % to +13.5 % | 1.42 | 3 only |
| Day 2 | 1.652 | 1.309 | +16.6 % | +8.0 % to +27.1 % | 1.32 | 3 only |
| Day 3 | 2.942 | 2.454 | +9.3 % | +0.6 % to +21.3 % | 1.22 | 3 only |
| Day 7 | 13.960 | 15.348 | -7.8 % | -15.7 % to +7.1 % | 1.04 | 2 and 3 |

Group S1, Sentinel-1A and 1C (secondary LEO): 257 to 259 pairs in 21 clusters.

| Lead | X2 median (km) | P median (km) | Median paired ratio | 95 % interval | p95 ratio, upper bound | Rules met |
| --- | --: | --: | --: | --- | --: | --- |
| Day 1 | 0.691 | 0.734 | -3.7 % | -8.3 % to -1.8 % | 1.21 | 1 and 3 |
| Day 2 | 0.912 | 1.003 | -2.3 % | -9.2 % to +2.7 % | 1.45 | 3 only |
| Day 3 | 1.393 | 1.333 | -3.8 % | -13.4 % to +10.6 % | 1.28 | 3 only |
| Day 7 | 4.555 | 4.150 | +11.2 % | -11.2 % to +23.2 % | 1.24 | 3 only |

Verdict: X2 does not beat P in group P or in group S1.

## Secondary

- **X2 against X0 (the atmosphere's own effect), group P: passes.** Median paired ratio -4.3 % (interval -5.8 % to
  -2.7 %), -15.6 % (-18.2 % to -11.8 %), -19.9 % (-24.7 % to -15.4 %) and -24.3 % (-28.8 % to -19.5 %) at days 1, 2, 3
  and 7; the p95 ratio's upper bound is 0.86 to 0.97; no failures. Medians: X0 0.879, 1.808, 3.537 and 20.623 km.
- **X2 against X0, group S1: no.** Sentinel-1 flies near 700 km, where the two atmospheres differ little: the median
  paired ratio is within 0.1 % of 1 at every lead.
- **X3 against P: no**, in P and S1 (group P: +12.5 %, +21.3 %, +9.8 %, -3.1 %).
- **X3 against X0, group P: no.** Rules 1 and 2 hold at every lead (-1.9 %, -11.1 %, -14.6 %, -25.4 %), but X3 failed on
  10 of 750 pairs (1.3 %): analysis/density-calibration refused to issue the nowcast on 2026-04-09 and 2026-04-10
  ("stale-fleet": the last supported solve more than 48 h old), and a failure is a loss.

## Sensitivities (not the verdict)

| Configuration | Group P, X2 against P (days 1, 2, 3, 7) | Verdict | Group P, X2 against X0 |
| --- | --- | --- | --- |
| Measured weather M, 72 h | +8.0 %, +9.9 %, -1.9 %, -17.3 % (day 7 meets all three rules) | no | passes (-5.5 %, -20.7 %, -30.7 %, -38.1 %) |
| As issued O, 24 h arc | +89 %, +232 %, +273 %, +271 % | no | no (within 0.3 % of 1) |
| O, 72 h, satellite x ISO week clusters | as the primary (110 clusters) | no | passes |

With observed weather through the horizon, X2 beats P at day 7 but still loses at days 1 and 2. A 24 h arc does not
determine the drag term. X3 against X0 passes under M: the hindcast was refused on one date (2026-04-02), 5 of 755 pairs
(0.7 %).

## GN control (GNSS MEO)

X2 and X3 equal X0 bit for bit wherever both ran: 5,970 comparisons of the propagated TEME states over 755 windows and two
arcs, 0 differences. 34 arm runs produced no states: 30 X3 runs without a `$DCL` (the refusals above), and X2 and X3 of
one window (E218 43058, cutoff 2026-05-15, 72 h arc), which propagator/sdn-ap refused with space-weather-out-of-range
although the rows begin on 2026-05-10, two days before the arc's first state's day (2026-05-12); X0 ran. That refusal is
reported as a possible module defect; no LEO window shows it. X2 against P passes in GN (median ratio -89 % to -65 %):
fits to ESA final orbits against public sets, the fitting advantage this test holds constant, not the atmosphere's.

## Windows

| Group | Registered and run | 72 h arc below 90 % coverage | Out of O (no RSGA in force) | Pairs, 72 h, O |
| --- | --: | --: | --: | --: |
| P | 755 | 0 | 5 (2026-01-01) | 750 |
| S1 | 302 | 30 | 2 | 257 to 259 |
| GN | 755 | 3 | 5 | 746 |

Every window had a public set at or before its cutoff and every P propagation succeeded; no window errored. Cutoffs
2026-01-01 to 2026-05-31. Out of scope by the integrity cuts (config.json `integrity`): TerraSAR-X and Sentinel-1D (C2
holds them out by object), every C2 calibration object from cutoff 2026-06-01 on (C2 PLAN.md:144), the ISS (C2 holds it
out for 2025-01-01..2026-10-31) and the laser-ranged spheres (C2's type-L hold-out); E205 has no ESA final orbit after
2025-10-26. No C2 held-out row file, B2 part 1a or part 5 file, propagator-catalog-census result or operator-capture
cycle content was read.

## Cost

A 72 h fit (864 states at 300 s) took a median 0.41 s with NRLMSISE-00 and 0.17 s with native Jacchia 1970 (group P;
24 h: 0.14 s and 0.06 s); owner Mac Studio, the SDK browser host, 8 concurrent workers. SGP4XP integrates on its own grid
(the `$PCF` INTEGRATOR is refused); the fit stops when the relative cost decrease falls below 1e-10, at most 30
iterations a stage; propagation output at the 300 s scoring epochs. A whole window (10 fits, 11 propagations to 1,152
epochs and the scorer) took a median 7.4 s in P, 7.2 s in S1 and 5.0 s in GN; the 1,812 windows took 3.1 worker-hours,
24 min on 8 workers.

## Disclosures

- Before the runner commit (0898fda), five windows of the pinned date 2026-03-10 (P 39452, P 43476, S1 39634, GN 28874,
  GN 37869) were run to verify the code, and their numbers were seen. PLAN.md, config.json and build.json did not change
  after the registration commit.
- Two harness defects were fixed before the scored run. G1's `lib/baselines.mjs` imports a package the canonical
  checkout does not install, so its `rtnSeries` and placeholder covariance are inlined verbatim. propagator/sgp4 prints
  its 300 s sample epochs microseconds either side of the second (float64 Julian dates), so each is matched to the
  nearest millisecond: P is evaluated within about 11 microseconds of the scored epoch (under 0.1 m at 7.6 km/s).
- The control's first coding counted an arm that produced no states as a difference. The registered control compares
  propagated coordinates, so `table.mjs` was corrected after the run to compare states where both arms ran and to list
  the runs without states. No verdict cell depends on it.

## Reproduction

```
node experiments/xp-atmosphere-merit/run.mjs --launch 8 --prep public   # Space-Track sets by creation day, local store
node experiments/xp-atmosphere-merit/run.mjs --launch 8                 # every window, 8 detached workers, PIDs in logs/
node experiments/xp-atmosphere-merit/table.mjs                          # this table
node experiments/xp-atmosphere-merit/run.mjs --check                    # E2E: pinned windows replayed exactly, table rebuilt
```

Every wasm is read with `git show` at modules fbda89450 and SHA-256 checked (`build.json`); all fitting and propagation
are module calls.

## Data and terms

Results use every dataset the run read; only aggregates are published. Space-Track.org GP element sets (USSPACECOM,
18 SDS) stay in the local store. ESA Swarm precise orbits (SP3 COM) and ESA/ESOC final GNSS orbits; GFZ ISDC GRACE-FO
rapid science orbits; contains modified Copernicus Sentinel data 2026 (Sentinel-1 POEORB). GFZ Kp, ap, Ap and F10.7:
CC BY 4.0, Matzka et al. (2021), doi:10.5880/Kp.0001. NOAA SWPC RSGA: US Government work. The open-DCA `$DCL`: a derived
aggregate of Planet Labs PBC ephemerides, https://ephemerides.planet-labs.com/, CC BY-NC 4.0 (Planet states and arcs stay
local).
