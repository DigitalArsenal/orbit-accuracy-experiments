# E5 — A public stand-in for the Dynamic Calibration of the Atmosphere

Plan. Status: **frozen** by the commit that
sets `"frozen": true` in [`config.json`](config.json); that commit's SHA is
recorded in every later run manifest. Until then the code refuses the test
windows (`common.mjs`, `assertWindowReadable`). Before the freeze only the
validation window was read: to exercise the code, and in one first pass of
the density endpoint whose result led to the disclosed change in section 2
(the forecast's relaxation level). The choices of section 5 are made by its
rules on runs made after the freeze.

Graph task: `e5-density-calibration-20261009`. Lane: claude-e5. Modules:
`analysis/density-calibration` at space-data-network-modules `b9141a4e`
(branch `task/e5-density-20261009`); `analysis/estimation` `fit_batch` from
`task/modules-estimation-batch-fit-20261009` (`986811e7`), until it lands.

## 1. Question

The Space Force's High Accuracy Satellite Drag Model (HASDM) is Jacchia's
thermosphere with a Dynamic Calibration of the Atmosphere (DCA): every few
hours it estimates global corrections to the model's exospheric
temperatures, as low-order spherical harmonics in latitude and local solar
time, from the drag observed on about 75 calibration satellites, and
predicts them forward with the solar and geomagnetic indices (Storz,
Bowman, Branson, Casali and Tobiska 2005, *Adv. Space Res.* 36(12),
2497–2505, doi:10.1016/j.asr.2005.02.020). Its calibration-satellite
tracking is not public.

How much of HASDM's accuracy can a calibration built only from public data
recover, measured (a) as density against held-out accelerometer and
precise-orbit densities, and (b) as the position error of held-out LEO
satellites propagated with each density model, 1, 3 and 7 days ahead?

## 2. Variants

| ID | Density | Drivers | Where |
| --- | --- | --- | --- |
| D0 | JB2008 (Bowman et al. 2008) as published | SET `SOLFSMY.TXT` and `DTCFILE.TXT` (2026-10-09 copies) | `propagator/hpop` (propagation); `analysis/density-calibration` `evaluate` (densities), the same `lib/jb2008.h` |
| D1 | NRLMSISE-00 (Picone et al. 2002), `gtd7d` | GFZ Kp/ap/Ap/F10.7 as daily `$SPW` rows: F10.7 of the previous day, its 81-day centred mean, the daily Ap | `propagator/hpop` (execution and `ATMOSPHERE_REQUEST`) |
| D2 | JB2008 + a DCA-like correction | SET indices; the correction dT(latitude, local solar time) added to JB2008's DSTDTC | `analysis/density-calibration` (`calibrate`, `evaluate`, new); `propagator/hpop` with every hourly DTC raised by the global term |
| D3 | HASDM (SET HASDM database, interpolated to the samples by Licata et al. 2021) | — | Historical windows only (data, Zenodo 10.5281/zenodo.4602380, CC BY 4.0) |
| D4 | WAM-IPE | — | Not run in this plan (section 8) |

**The D2 calibration** (the public stand-in for DCA), per 3-hour bin:
minimise Σ w (ln ρ_obs − ln ρ_JB2008(dT))² / s² + Σ_k a_k² / σ_l², with
dT = Σ P_l^m(sin φ)(a_lm cos mh + b_lm sin mh) (Schmidt semi-normalized,
h the hour angle from the Sun) up to degree L, s = 0.1 (log density),
σ_l = 150, 75, 50 K for degrees 0, 1, 2, Gauss–Newton with a 4 robust-sigma
edit, at least 60 samples per bin. The observations are the densities of the
calibration satellites (below) every 30 s. Inside the module, JB2008 is
driven exactly as hpop drives it, and a constant dT is the same model as
hpop with every DTC raised by dT (module test).

**The D2 forecast** from an issue time t0: the nowcast c_now is the mean of
the coefficients of the bins that ended in the 12 h before t0 (latency 0);
the level c̄ is the mean of the bins available in the 27 days before t0; the
forecast is c̄ + (c_now − c̄) exp(−(t − t0)/τ), or c_now held (τ = ∞). Before
t0 (the fit span), D2 uses each bin's own coefficients (analysis mode).

*Pre-freeze change, disclosed:* a first pass on the validation window used a
forecast decaying to zero, c_now exp(−(t − t0)/τ). It discarded the
calibration's mean offset (JB2008 about 10 % high on the validation
satellites) and so lost to D0 after a day. The relaxation to the 27-day
level replaced it before the freeze; the candidate τ values did not change.
The degree selection (analysis mode) does not depend on the forecast.

**D2 in the propagation endpoint** uses the global term a00(t) only, because
hpop's JB2008 takes one DSTDTC per instant: JB2008 with DTC(t) + a00(t). The
spatial terms are scored in the density endpoint.

**Calibration satellites and leakage.** A satellite never calibrates its own
prediction. Swarm A and C fly side by side, so neither calibrates the other.

| Held-out target | Calibrators |
| --- | --- |
| GRACE-FO 1 (densities) | Swarm A, B, C |
| Swarm B (densities and orbit) | Swarm A, C, GRACE-FO 1 |
| Swarm C (densities and orbit); Swarm A (orbit) | Swarm B, GRACE-FO 1 |
| Sentinel-1A/1C/1D, Starlette, Stella, LARETS, WESTPAC (orbit) | Swarm A, B, C, GRACE-FO 1 |
| CHAMP (historical) | GRACE-A |
| GRACE-A (historical) | CHAMP |

## 3. Data

All inputs are local copies with their SHA-256 in each run manifest; nothing
is fetched during a run. Provenance files sit beside each download.

| Input | Source | Terms |
| --- | --- | --- |
| Swarm A/B/C densities from precise orbits (DNSxPOD, 30 s), 2026-01-01..07-31 | ESA Swarm dissemination server, `Level2daily/Latest_baselines/DNS/POD` (van den IJssel et al. 2020) | ESA EO data terms |
| GRACE-FO 1 accelerometer densities (TOLEOS DNS1ACC, 10 s), 2026-01-01..04-30 | same server, `Multimission/GRACE-FO/DNS` (Siemes et al. 2023) | ESA EO data terms |
| CHAMP and GRACE-A densities (Mehta et al. 2017 drag coefficients, `Density_New`) with HASDM and JB2008 interpolated to each sample | Licata, Mehta, Tobiska and Bowman (2021), Zenodo 10.5281/zenodo.4602380 | CC BY 4.0 |
| Precise orbits (truth): Swarm A/B/C (TU Delft reduced-dynamic SP3), Sentinel-1A/1C/1D (POEORB), NSGF SLR arcs (Starlette, Stella, LARETS, WESTPAC) | through `analysis/reference-states` (`fetch-reference-products.mjs`, EOP 20 C04) into `/opt/data/sdn-archive/reference-states/reference` | ESA, Copernicus, ILRS |
| JB2008 indices | SET `SOLFSMY.TXT`, `DTCFILE.TXT` (45-day lag; definitive values) | SET; cite Bowman et al. 2008 |
| Kp, ap, Ap, F10.7 | GFZ `Kp_ap_Ap_SN_F107_since_1932.txt` (Matzka et al. 2021) | CC BY 4.0 |
| EOP | IERS EOP 20 C04 | IERS |
| Sun and Moon | DE440 excerpt for 2026 (modules fixture) | JPL |

No Space-Track data is used.

### Windows (issue days t0 = 00:00 UTC)

| Window | Issue days | Contains |
| --- | --- | --- |
| Validation | 2026-04-01..04-21 | Kp 6.3 on 04-03; quiet days |
| Test A (locked) | 2026-01-12..01-26 | the 2026-01-19..21 storm (Kp 8.7, Ap 144) |
| Test B (locked) | 2026-03-15..03-28 | Kp 7 on 03-21..22 |
| Test C (locked) | 2026-06-26..07-08 | Kp 7 on 07-04; GRACE-FO densities end 04-30, so Swarm calibrates alone |
| Historical test (locked) | 2003-10-01..12-31, 2008-01-01..03-31 | the 2003 Halloween storms; solar minimum |

Each arc fits the 24 h before t0 and is scored to t0 + 7 d; calibration
bins run from two days before the first issue day to seven days after the
last.

## 4. Endpoints

**Density.** For each held-out satellite, orbit means of the observed and
model densities over one orbital period centred on each scoring time (every
600 s), over the same valid samples (at least 90 % of the period), and
r = ln(observed / model). Reported per variant: the mean of r (bias) and its
standard deviation σ (the spread a calibration exists to remove), pooled
and per satellite, per regime. D2 in analysis mode (D2a: the concurrent
bin's correction, as the HASDM database is) and in forecast mode (D2f) at
leads 0–1, 1–3 and 3–7 days, with D0 on the same pairs.

**Propagation.** For each issue day and held-out satellite with a precise
orbit: batch least squares (`analysis/estimation` `fit_batch`, answered by
`propagator/hpop`) of the state and B = Cd·A/m to the precise orbit every
180 s over the 24 h before t0 (full states, σ 0.1 m and 0.1 mm/s, Cr·A/m
fixed per satellite in `config.json`), then propagation of the fit to t0 + 1,
3 and 7 d with the same model and the 3D distance to the precise orbit.
Force model: EGM2008 40×40, Sun and Moon (DE440), cannonball radiation
pressure, IERS 2010 solid tides, drag by the variant, IERS EOP 20 C04;
RK78 with tolerance 1e-12 and 120 s maximum step. Regime: the largest
3-hour Kp from t0 to the horizon: quiet < 4, active 4–6, storm ≥ 6.

## 5. Hypotheses and decision rules

Choices made on the validation window, after the freeze, by these rules:
the degree L ∈ {0, 1, 2} with the smallest σ of D2a pooled over the
held-out satellites; then the decay τ ∈ {12 h, 48 h, ∞} with the smallest
median 3-day error of D2 over the validation arcs. Both are recorded in
`results/e5/selection.json` before the test windows are run.

| ID | Hypothesis | Statistic | Supported if |
| --- | --- | --- | --- |
| H1 | The calibration removes density error: D2a has a smaller σ than D0 on held-out satellites (2026 test windows, pooled). | R1 = 1 − σ(D2a)/σ(D0) | R1 ≥ 0.25 and its 95 % lower bound > 0 |
| H2 | The forecast keeps some of it for a day: D2f has a smaller σ than D0 at lead 0–1 d. | R2 = 1 − σ(D2f)/σ(D0), lead 0–1 d | lower bound > 0 |
| H3 | It improves propagation: D2's 3-day error is smaller than D0's on the same arcs. | median over arcs of e(D2)/e(D0) at 3 d | upper bound < 1 |
| H4 | (descriptive) How far the public stand-in is from HASDM on the same samples. | σ(D2a)/σ(D3), historical windows | reported with its interval |

H1–H3 are one family, Holm's procedure at α = 0.05 (one-sided intervals
read from the two-sided 90 % ones). Everything else is descriptive: D1
against D0, D2 at other leads and horizons, per-regime and per-satellite
tables, the 95th percentiles.

**Intervals.** Two-way cluster ("pigeonhole") bootstrap over satellites and
UTC days (Owen 2007), 2,000 resamples, seed 20261009, percentile intervals;
statistics are paired (every variant on the same samples or arcs).

## 6. Acceptance of the new module (before any window is read)

`analysis/density-calibration` (C++ → WASM, modules repository) passes its
end-to-end tests against independent references: SET's own Fortran JB2008
validation output (2023 day 91, eight hours, 150–600 km, all latitudes and
longitudes: within 0.6 %, the print rounding of its drivers); recovery of a
37 K DSTDTC offset from SET's densities (within 0.1 K of the control); the
Sun's Earth-fixed direction against JPL Horizons' sub-solar point (DE441,
0.02° and 0.003°); a constant correction equal to raising every DTC value.

## 7. Threats to validity

- **Perfect drivers.** Every variant uses definitive indices over the
  prediction span (SET's DTC from Dst, GFZ's Kp). Operational forecasts
  would use predicted indices; that error is not measured here and applies
  to HASDM too. D2's forecast uses no information after t0.
- **Zero latency.** The calibration densities are used as soon as their bin
  ends. Swarm and GRACE-FO densities are published one to three months
  late; an operational stand-in needs a faster source (section 8).
- **Few calibrators.** Three or four satellites in two or three orbital
  planes, against HASDM's ~75 across altitudes. Local-time structure is
  weakly observable in a 3-hour bin; the prior keeps it small.
- **Density scale.** Swarm POD densities and GRACE-FO accelerometer
  densities carry their own drag-coefficient models; D2 inherits their
  scale. The propagation endpoint fits B and is insensitive to a constant
  scale; the density endpoint reports the bias separately from σ.
- **Historical files.** D3 and the historical observations come from one
  published processing (Licata et al. 2021, Mehta et al. 2017 densities);
  their JB2008 column is compared with D0 as a check.
- **Satellite models.** Cannonball radiation pressure with a fixed Cr·A/m;
  B absorbs part of its error. Every variant shares it (paired design).
- **Truth.** Precise orbits at centimetre (Swarm, Sentinel-1) to decimetre
  (NSGF arcs) level, far below the drag errors at 1–7 days.

## 8. Not done here, and why

- **D4, WAM-IPE.** NOAA's WAM-IPE output is public on AWS
  (`noaa-nws-wam-ipe-pds`, 10-minute fixed-height files from 2023-07 to
  2026-03-31); reading and interpolating it needs a grid reader in a module.
  Left for a follow-up.
- **Login-only data that would improve D2:** the full SET HASDM database
  (2000–2025, registration at spacewx.com/hasdm), GRACE-FO GNV1B precise
  orbits (NASA Earthdata login), Space-Track GP history of drag-sensitive
  spheres (local only; aggregates could be published).

## 9. Outputs and provenance

Each run writes `runs/<run-id>/` (ignored by git): rows, `manifest.json`.
Committed under `results/e5/`: the selection, the run manifests and metrics,
and `REPORT.md`, generated from them by `steps/90-report.mjs`. The inputs are
listed in `data/e5/MANIFEST.json` and `data/e5/SOURCES.md`; small ones are
committed under `data/e5/`, the rest prepared as release assets.

## Amendment 1 (2026-10-09, after the freeze, before any test-window run)

`config.json` names the GRACE-A files of the Licata et al. archive
`GRACE_A_Density_YY_DDD_v2.txt`; the archive names them
`graceA_Density_YY_DDD_v2.txt`. `densities.mjs` now finds each day's file by
its directory and `_YY_DDD_v2.txt` suffix. No data was read under the wrong
name (it would have found no files). No other change.

## Amendment 2 (2026-10-09, order of runs)

Section 5 says the selection is recorded before the test windows are run.
The test- and historical-window calibrations (step 10) and density runs
(step 20) were started while the validation propagation runs were still
going, so they ran before `results/e5/selection.json` was committed. They
computed every candidate (degree 0 for the test windows after the validation
density run had chosen it; all three decays), so nothing in them depends on
the selection, and none of their output was read before the selection was
committed (`14aeeac`). The test propagation runs (step 30) started after it,
with the selected degree 0 and decay 12 h only. The validation propagation
runs fitted D0 and D2 only (D1 does not enter the selection).
