# E15 — AOE as a second lineage: accuracy against independent orbits, and combining it with Space-Track

Pre-registered 2026-10-11, before any AOE element set was compared with any reference orbit. Owner 2026-10-11: "roll them into this combined catalog and do some tests". Graph task `experiments-e15-aoe-lineage-20261011`.

## 1. Question

How accurate are the element sets of the AOE catalog (SpaceMapper's own library, `channel=KY`) against independent orbits, beside Space-Track's? Is AOE a lineage independent of the US Space Surveillance Network? Where it is, does a catalog combined from the two under E3's rules (select by evidence; fuse only independent lineages) beat either one, by regime and horizon?

Accuracy is position error against the reference orbit, in the reference state's RTN axes, at 0, 1, 3 and 7 days after issue.

## 2. Sources

| Source | Lineage | Use |
| --- | --- | --- |
| AOE `channel=KY` element sets: one daily batch (epoch 00:00 UTC, written about 01:05 UTC), snapshot daily from SpaceMapper's public pages (`hac/spacemapper-aoe/<day>/orbits-KY/records.jsonl`) | SpaceMapper / Kaiyun ground and space sensors | **AOE**: scored |
| Space-Track `gp_history` by creation day | US Space Surveillance Network | **ST**: scored |
| CelesTrak supplemental GP (collector archive, to 2026-10-15) | Operator data | Described where captured; not combined |

A set is usable at issue time T when it was available and its epoch is at or before T. For AOE, availability is our snapshot's retrieval time; for ST, `CREATION_DATE`, with E3's merge of republished duplicates. AOE objects without a NORAD number (AOE ids ≥ 100000) have no ST counterpart. They are counted, not scored.

## 3. Truth

Reference orbits are produced by someone other than either lineage. An operator file is read in memory and never written; only residual records are kept. The rules are those of the SupGP pass (`experiments/supgp-omm`).

| Regime | Objects | Reference | Notes |
| --- | --- | --- | --- |
| LEO-SL | Starlink in both catalogs | SpaceX ephemerides: the state from a version published at or before t whose start is within 1 h of t | Fresh orbit determination near each file's start; the blended forecast after the start is not truth |
| ISS | 25544 | NASA OEM, same rule | |
| CSS | Tiangong core and modules | CMSE weekly OEM | Chinese operator; independence from AOE checked as in L2 |
| LEO-PL | Planet | Planet OEMs | |
| LEO-SP | Spire LEMUR (and PlanetiQ where present) | The receiver's orbit carried in each EUMETSAT commercial radio-occultation L1B file (`data/receiver/orbit/centre_of_mass`, TOD, about 11 states per occultation; `orbit_predicted` states excluded) | Spire's own GNSS-based orbit; third-party licence: read in memory, residuals only |
| GEO | Intelsat, SES | IESS-412 files | |
| GNSS | GPS, GLONASS, Galileo, BeiDou | ESA rapid or final SP3; GFZ MGEX | Centimetres; the floor of this measurement |
| LEO-POD, SLR | Sentinel-1/3/6, Swarm, GRACE-FO; SLR targets | `analysis/reference-states` products as E3 and E14 convert them | Published with a lag of days to weeks; scored when published |

A target without a reference state within 15 min is not scored; counts are reported. All orbit computation runs in modules: SGP4 through `analysis/gp-error-model` (`element_residuals`, `accumulate`), and frames through `analysis/reference-states`.

## 4. Windows

The issue time is T = day D at 04:00 UTC. The AOE batch of day D, and ST sets created by then, are available at T.

| Window | Issue days | Use |
| --- | --- | --- |
| Train | 2026-10-11 .. 2026-10-14 | Rank methods for selection; fit fusion weights; L2 |
| Test | 2026-10-15 .. 2026-10-28 | Read once, after truth for the 7-day horizon is in, for every endpoint |

## 5. Methods

| Method | Served at T for target T + h |
| --- | --- |
| AOE-latest | The newest usable AOE set, by SGP4 |
| ST-latest | The newest usable ST set, by SGP4 (E3) |
| SEL | Of AOE-latest and ST-latest, the one with the lower train-window median 3D error for the regime and horizon (at least 30 train samples, else ST-latest) |
| FUS | Per RTN axis, AOE-latest and ST-latest weighted by 1/σ², with σ² the train-window mean square after a 5-robust-sigma clip; only where L2 holds |

## 6. Endpoints

Statistics as in E3: median and 95th percentile of the 3D error, with 95 % intervals from a two-way (object × day) pigeonhole bootstrap (2,000 resamples, seed 20261011); RMS per RTN axis and each axis's share after a 5-robust-sigma clip; samples, objects, days.

| ID | Statement | Supported when (test window) |
| --- | --- | --- |
| H1 | AOE and ST differ in accuracy | The interval of AOE-latest / ST-latest (ratio of medians, paired samples) excludes 1; the direction is reported per regime and horizon |
| L2 | AOE is a lineage independent of ST | In the train window, the median per-object Pearson correlation of along-track errors (AOE vs ST, h = 0) is below 0.8, per regime. Where it is not, FUS is not applied there |
| H2 | Combining helps | SEL / best single method: upper bound < 1. FUS / SEL: upper bound < 0.95 (E3's H2), where L2 holds |

Also reported, descriptive:
- coverage: objects in AOE only, ST only, or both, per regime;
- AOE's per-snapshot completeness against the site's own total;
- error by age from each set's epoch;
- SupGP beside both where captured.

## 7. Threats to validity

- **AOE may ingest US data.** L2 tests this per regime, but agreement can also come from shared physics: SGP4, and the same truth-limited objects.
- **Truth is mostly cooperative objects.** Operator and precise orbits cover active satellites. Debris and rocket bodies, most of either catalog, have no truth here; results speak to the objects scored.
- **Manoeuvres** (Starlink, ISS, CSS) are not removed. Medians are robust to them; the 95th percentile is not.
- **Snapshot gaps.** A missed daily AOE snapshot means AOE-latest serves an older set, as a real catalog would. Snapshot times are in the manifests.
- **Fourteen test days** in one season; intervals cover clustering by object and day, not other solar conditions.

## 8. Prior art

No published accuracy assessment of SpaceMapper/AOE element sets was found. Searched: SpaceMapper's own documentation; the China Aerospace Studies Institute analysis of 2025-10-06; the 2026 Substack extraction of its catalog, which reports counts only.

Element-set accuracy against precise orbits is established for the US catalog (Kelso 2007; Flohrer et al. 2008; Vallado et al. 2006). This repository's E3 and SupGP pass measure Space-Track and CelesTrak the same way.

New here:
- an independent measurement of a non-US public catalog against reference orbits;
- the first two-lineage combination in LEO from public data. E3 could only select in LEO: its one other source, Vimpel, overlapped no truth object.

## 9. Data

- AOE pages and records stay on this machine. SpaceMapper states no licence. Only aggregates are committed.
- Space-Track sets never leave this machine (E3).
- Operator files are never stored (data-licence policy).

## 10. Outputs

`runs/<run-id>/` (ignored): residual tables, `manifest.json`, `metrics.json`.

Committed: `results/e15/<run-id>/` (manifest, metrics) and `results/e15/README.md`, generated from the metrics.

## Amendments

Dated changes, with their reasons; amendments after the freeze are reported with the results.

- **2026-10-11, before any result.** Added LEO-SP: Spire receiver orbits from EUMETSAT's commercial radio-occultation files. The account was opened the same day, and these are the only reference orbits for Spire's satellites, which both catalogs carry.
- **2026-10-11, before any result: A1, AOE availability.** Section 2 makes our snapshot's retrieval time the availability of an AOE set; section 4 says the AOE batch of day D is available at T = D 04:00. They disagree whenever our snapshot finishes after T. The 2026-10-11 snapshot started at 03:59:31 UTC (the 02:05 UTC schedule begins the next day) and runs to about 07:15 UTC, so by retrieval time all but about 160 records of the first train day would be unusable at T. An AOE set is therefore usable at T when its `ctime` (AOE's own write time, about 01:05 UTC for the daily batch) and its epoch are at or before T and our snapshot of that day holds it, as a Space-Track set is usable from its `CREATION_DATE`. Retrieval times stay in the manifests; per issue day the report counts the AOE-latest sets our snapshot had not yet retrieved at T.
- **2026-10-11, before any result: A2, L2 needs three days per object.** The correlation of two points is ±1, so an object enters L2's median only with at least three issue days on which AOE-latest and ST-latest both have an h = 0 sample. A regime with no such object has L2 not measured, and FUS is not applied there.
- **2026-10-11, before any result: A3, two regimes in the last truth row.** LEO-POD (Sentinel-1/3/6, Swarm, GRACE-FO) and SLR (the ILRS targets, LEO to MEO) are separate regimes, as in E3.
- **2026-10-11, before any result: A4, which truth state.** The reference state of target T + h is the first state at or after T + h and no later than T + h + 15 min (E3's rule). Where section 3 gives no version rule (CSS, LEO-PL, LEO-SP, GEO, GNSS, LEO-POD, SLR), the version used is the one with the latest start at or before T + h among those read: the freshest orbit determination. GNSS takes GPS and GLONASS from ESA's rapid SP3 (the final when ESA has no rapid file for the day) and Galileo and BeiDou from GFZ's MGEX rapid product. For LEO-SL, "published" is the file's HTTP Last-Modified; for the ISS, the OEM's `CREATION_DATE`. Every residual row records the version, its start, its publication time and the truth's age at the target.
- **2026-10-11, before any result: A5, AOE writes sets every three hours.** The pages stored by 05:50 UTC on 2026-10-11 (13,803 records) show that AOE writes element sets every three hours (`ctime` at hh:04 UTC, hh = 01, 04, … 22), each with an epoch on a whole hour, and keeps an object's last set until it writes a new one: epochs span the previous two weeks, and a few hundred records change in each cycle. Section 2's "one daily batch (epoch 00:00 UTC, written about 01:05 UTC)" described the first records seen; A1's parenthetical inherits it. The rule of A1 stands: a set is usable at T when its `ctime` and its epoch are at or before T and one of our snapshots holds it, and AOE-latest is the newest such set across our snapshots. A set written after T (for example at 04:04 or 07:04 UTC on 2026-10-11, during that day's snapshot) is not usable at T. A daily snapshot sees each object's set as of its retrieval; sets written and replaced between two snapshots are never seen.
