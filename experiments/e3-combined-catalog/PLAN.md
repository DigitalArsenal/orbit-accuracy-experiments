# E3 — A catalog combined from several sources, against precise orbits

Plan. Status: **frozen** by the commit that sets `"frozen": true` in
[`config.json`](config.json); every later run records that commit. Before
it the code refused the test window. The harness was exercised on the train
window before the freeze (section 6); no test-window record was read.

Graph task: `experiments-e3-combined-catalog-20261009` (parent
`whitepaper-apps-catalog-evidence-20261009`).

## 1. Question

How accurate is each source the Space Data Network can combine into a
catalog, how accurate is a catalog combined from them under the
Evidence-Supported ASO Catalog's rules (section 7 of that paper: select by
evidence; combine only independent lineages), and where does accuracy stop:
what dominates the remaining error, and where does combining stop helping?

Accuracy means position error against an independent precise orbit, in the
reference state's RTN axes, at 0, 1, 3 and 7 days after the catalog is
issued.

## 2. Sources and what each can be tested on

The owner chose four source families. Before any test-window data was read,
each was checked for objects that also have a precise orbit:

| Source | Level (paper §1) | Lineage | Objects with a precise orbit | Use in E3 |
| --- | --- | --- | --- | --- |
| Space-Track GP history (`/opt/data/sdn-archive/spacetrack/gp_history`) | 3 | US Space Surveillance Network | All 48 | **ST**: scored |
| CelesTrak GP | 3 | Republishes Space-Track GP | All 48 | Lineage check only (section 3) |
| CelesTrak supplemental GP | 3 | Operator or CPF data | Not captured for these objects | Not scored (section 3) |
| Vimpel orbit tables (editions 2026-09-07 and 2026-09-21, kept by the SDN vimpel node) | 2 | JSC Vimpel optical network | **None**: its 13,889 rows are high-orbit objects in Vimpel's own numbering; none of the 986 rows of its `datefirst` crosswalk names a truth object | Coverage only |
| SDN node records: ESA ultra-rapid GNSS orbits (`ESA0OPSULT`) | 2 | GNSS ground network | 32 GPS satellites | **URA**, and **HPOP-URA** (HPOP from its state) |
| SDN node records: IGS ultra-rapid orbits kept by the `gps-precise` node, issues of 2026-09-08..09-14 | 2 | GNSS ground network | 32 GPS satellites | **URA-IGS**, sensitivity only |
| SDN node records: gcat, mccants catalog nodes | — | — | No orbit records (their stores hold catalog, entity-group and provenance records) | Not used |
| SDN node records: CPF predictions kept by the `cpf` node | 2 | ESA | Galileo only, which has no truth here | Not used |

The 30 Vimpel "snapshots" on the node are two editions retrieved
repeatedly (SHA-256 in `config.json`). The ESA ultra-rapid files come from
ESA's public server; the node-kept IGS files were read from the node's
block store and checked against the SHA-256 the node recorded.

**Lineage.** The ESA ultra-rapid orbits and the ESA final orbits used as GPS
truth come from the same analysis centre, network and software. Their
agreement at the issue time is consistency, not independent accuracy, and is
labelled so; the forecast part (after the issue's last data) is a forecast,
but shared models can still make it look better than it is. URA-IGS (the IGS
combination, of several centres) against the ESA truth bounds that effect
for the days it covers. Space-Track and the GNSS products share no data.

## 3. Data

All inputs are local copies with their SHA-256 in each run's manifest.
Nothing is fetched during a scoring run.

**Truth.** Converted by `analysis/reference-states` (unchanged) through
[`truth/fetch-reference-products.mjs`](truth/fetch-reference-products.mjs),
a copy of the modules script with the changes in
[`truth/finals2000a.patch`](truth/finals2000a.patch): IERS finals2000A
observed rows for the Earth orientation, because EOP 20 C04 ends at
2026-09-09 (about 30 days' latency) and the sources start in September; the
EDC SLR directory layout of October 2026; no caching of an HTML page served
as a product; ESA final and ultra-rapid GNSS products by name (BKG is not
reachable from this machine). Output:
`/opt/data/sdn-archive/reference-states/reference-finals2000a`.

| Regime | Objects | Truth product | Stated accuracy |
| --- | --- | --- | --- |
| GPS | the 32 GPS satellites in the ESA products | ESA final orbits (ESA0OPSFIN, 5 min) | IGS final quality, centimetres |
| LEO 400–800 km | Swarm A, B, C; Sentinel-1C, 1D; LARETS | Swarm reduced-dynamic (TU Delft), Sentinel-1 POEORB, NSGF SLR arcs | per product, in each index |
| SLR LEO 800–1500 km | Stella, Starlette, WESTPAC, Ajisai, LARES | NSGF SLR arcs (3.5 days every 4 days) | overlap RMS, in each index |
| SLR MEO | LAGEOS-1, -2, ETALON-1, -2 (ILRS combination, weekly); LARES-2 (NSGF) | as listed | centre RMS or overlap RMS |

Coverage stops where publication stops: Swarm on 2026-08-18, Sentinel-1
around 2026-09-17, the ILRS weekly arcs on 2026-09-19, ESA GNSS finals on
2026-10-03. A target without a reference state within 15 min is not
scored; the counts are reported.

**Check A0.1 (EOP substitution).** For every product converted with both
EOP sources (Sentinel-1, Swarm and ILRS arcs of 2026-08-01..08-15), the
largest position difference between the two conversions at common epochs is
at most 0.10 m.

**Element sets.** Space-Track `gp_history` by creation day, SGP4 mean
elements, ephemeris type 0; a set is usable at time T when its
`CREATION_DATE` is at or before T. Republished duplicates (epochs within
1 s) are merged as in E1, keeping the later creation; a merged set is
therefore usable from its later creation only. Element sets never leave this
machine; only aggregates are committed.

**CelesTrak (lineage check L1).** Step 02 captures CelesTrak's current GP
for the 48 objects under the CelesTrak fetch policy, and L1 compares each
record with the Space-Track record of the same object and epoch: if at least
99 % are identical in every element, CelesTrak GP is the same lineage and
adds nothing to the combination. **The capture on 2026-10-09 failed:**
celestrak.org did not answer from this machine (connection timeout on all
18 requests; the failure is in the capture manifest). L1 is therefore not
measured in this run, and CelesTrak supplemental GP was not captured.

### Windows

The catalog is issued once a day at 00:00:00 GPS time (23:59:42 UTC the day
before), on the GNSS products' grid.

| Window | Issue days | Use |
| --- | --- | --- |
| Train | 2026-08-03 .. 2026-08-24 | Rank the methods for selection and fit the fusion weights; nothing else. |
| Test | 2026-09-07 .. 2026-09-26 | Read once, after the freeze, for every endpoint. |

The gap keeps the windows' 7-day horizons apart.

## 4. Methods

Every orbit computation runs in a module; the harness selects records,
subtracts positions and projects the difference on the reference state's
radial, transverse and normal unit vectors (R = r/|r|, N = r×v/|r×v|,
T = N×R), as V1 takes norms. That projection is the same RTN convention
`analysis/gp-error-model` uses.

| Method | What is served at issue time T for target T + h |
| --- | --- |
| ST-latest | The Space-Track set with the latest epoch among those created at or before T, by SGP4 (`analysis/gp-error-model` `accumulate`, one call per set and reference file, ±2 s age bins around each wanted reference epoch). |
| ST-stack3 | The mean of the errors of the three latest such sets (same lineage). |
| URA | The newest ESA ultra-rapid issue available at T (start + 27 h, by its publication times), when it covers the target (start + 48 h). In practice only h = 0 (6–12 h of prediction). |
| URA-IGS | The same with the IGS ultra-rapid files the node kept. Sensitivity only. |
| HPOP-URA | `propagator/hpop` from the URA state at T: 20×20 EGM2008, Sun and Moon (DE440), cannonball radiation pressure (1500 kg, 20 m², Cr 1.3, as V1), IERS 2010 solid tides and relativity, finals2000A Earth orientation, RK78 at 1e-13. h ≥ 1 day. |
| SEL | Evidence-weighted selection: among ST-latest, URA and HPOP-URA where applicable, the method with the lowest train-window median 3D error for the regime and horizon (at least 30 train samples). |
| FUS | Fusion across independent lineages: the SEL-ranked best applicable method of each lineage (SSN; GNSS network), combined per RTN axis with weights 1/σ², σ² the train-window mean square of that axis after a 5-robust-sigma clip. Where only one lineage applies, FUS is SEL. |

The baseline is ST-latest: what a catalog that republishes the newest
element set serves. CelesTrak GP, if L1 holds, is ST-latest.

## 5. Endpoints and decision rules

Statistics per window, method, regime and horizon: samples, objects, days;
median and 95th percentile of the 3D error with 95 % intervals from a
two-way (object × day) pigeonhole bootstrap, 2,000 resamples, seed
20261009; RMS per RTN axis and each axis's share of the squared error after
a 5-robust-sigma clip on the 3D error.

Paired comparisons use the samples where both methods exist; the ratio of
medians and its pigeonhole interval.

| ID | Statement | Supported when (test window) |
| --- | --- | --- |
| H1 | Combining the sources improves on the best public element set in GPS. | SEL / ST-latest upper bound < 1 at every horizon. |
| H1-HAC | The combined GPS catalog is ten times better than ST-latest at 0 and 1 day. | SEL / ST-latest upper bound ≤ 0.1 at h = 0 and 1. |
| H2 | Fusion improves on selection. | FUS / SEL upper bound < 0.95; per regime and horizon. |
| H3 | Stacking the three latest same-lineage sets improves on the latest. | ST-stack3 / ST-latest upper bound < 1; per regime and horizon. |
| L1 | CelesTrak GP is Space-Track GP. | At least 99 % identical records. Not measured in this run. |

For the regimes in which only ST has data (LEO, SLR LEO, SLR MEO), SEL and
FUS are ST-latest by construction; their accuracy there is the limit the
available sources set, and is reported as such.

**Limits reported.** For each regime and horizon: the accuracy of the best
method; the share of squared error per RTN axis (what dominates); FUS / SEL
(where combining stops helping); the truth products' stated accuracy (the
floor of any measurement here); coverage (samples lost to missing truth,
missing sources or failed calls).

**Also reported, descriptive.** The Space-Track per-record errors by age
from each set's own epoch (0, 1, 3, 7 days), per regime; URA-IGS beside URA.
Every train-window number, labelled train.

## 6. Acceptance of the harness

- **A0.1** as in section 3.
- **A0.2 (no duplicate reference states).** Every wanted ST target falls in
  a bin holding exactly one reference state; the count of bins with n ≠ 1 is
  reported and must be 0.
- The harness was run on two train days before the freeze to check the
  above and the plumbing; no test-window record was read.

## 7. Threats to validity

- **Shared lineage of URA and the GPS truth** (section 2).
- **Truth gaps** remove LEO (Swarm after 08-18, Sentinel-1 after about
  09-17) and SLR MEO (after 09-19) samples from late test issue days; counts
  are reported, nothing is imputed.
- **Manoeuvres** are not removed. Medians are robust to them; the 95th
  percentile is not, and says so.
- **Availability times** of ultra-rapid issues follow ESA's publication
  pattern (about start + 25.7 h, rule start + 27 h), not per-file
  timestamps.
- **One GPS physical model**: HPOP's cannonball radiation pressure is crude
  for GPS (V1: 29 m median at 24 h); HPOP-URA errors at 3 and 7 days
  measure that model, not the limit of a better one.
- **Twenty test days.** Intervals account for clustering by object and day,
  not for a different season or solar activity.

## 8. Outputs

`runs/<run-id>/` (ignored): per-sample tables, `manifest.json`,
`metrics.json`. Committed: `results/e3/<run-id>/` with the manifest and the
metrics, and `results/e3/README.md`, generated from the metrics by step 20,
never typed.

## Amendments

Dated changes, with their reasons; amendments after the freeze are reported
with the results.

- **2026-10-09, after the freeze, before any test-window result.** The first
  test-window scoring run stopped with an error from `analysis/gp-error-model`
  (an age bin below zero): some Space-Track sets were created at or before
  the issue time with an epoch after it. SGP4 scoring is forward only, so a
  set is usable at issue time T when it was created **and** has its epoch at
  or before T. The train and test windows were both rerun with this rule; no
  test-window number was produced before the change.

