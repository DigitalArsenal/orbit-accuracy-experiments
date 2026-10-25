# GP-history OD: how SDN-AP does from the data a catalog user actually has

Registered 2026-10-25 (task experiments-sdn-ap-gp-history-od-20261025); frozen by the first commit of this
plan, `config.json` and `windows.json`, before any window is fitted or scored. Requested for the SDN-AP
whitepaper's expert review: the held-out accuracy of section 12.3 fits SDN-AP to precise ephemerides, which a
catalog user does not have. A user has the public element-set history. This experiment asks what SDN-AP and
SGP4-XP do from that.

No score of any window of this experiment had been computed or read when this plan was committed. What was
read: the identities (source, object, NORAD id, start) of the section 12.3 windows, to list them
(`register.mjs`); the whitepaper's published section 12.3 table, which this experiment does not alter.

## Question

For the objects of whitepaper section 12.3 that have public element-set histories, how large is the 3D error
over days 1 to 3 of an orbit predicted from the preceding history, for

1. **SGP4 on the latest element set** published at the window's information cutoff (the baseline a catalog
   user has without doing anything);
2. **SGP4-XP fitted to pseudo-observations** built from the preceding history;
3. **SDN-AP fitted to the same pseudo-observations**,

scored against the same precise orbits as section 12.3?

## Windows

Every window of section 12.3's precise-orbit sources whose object has a NORAD id in the public catalog, with
the same start times, listed in `windows.json` (916 windows, sha256 `a64bc41e18177bd4b052658ee6dae1174f5497e73699d784b90f4f996c9123b2`):

| Regime | Windows | Objects | Truth (as section 12.3) |
| --- | --: | --: | --- |
| LEO, Starlink | 239 | 239 | FFM-1 propagation of fits to the operator's ephemerides |
| LEO, ISS | 15 | 1 | NASA trajectory files |
| LEO, laser-ranged | 210 | 7 | ILRS NSGF orbits |
| MEO, GNSS | 108 | 14 | ESA final orbits (2024); GFZ rapid orbits (October 2026) |
| MEO, laser-ranged | 60 | 4 | ILRS orbits |
| IGSO, BeiDou and QZSS | 150 | 12 | GFZ MGEX rapid orbits |
| GEO, BeiDou and QZSS | 95 | 9 | GFZ MGEX rapid orbits |
| HEO, TESS | 39 | 1 | TESS definitive ephemeris, MAST |

The list is the set of attempted windows of the G1 row files (24 h fit), whatever their section 12.3 outcome,
so no window is chosen or dropped by how it scored. It therefore differs a little from section 12.3's counts,
which count scored windows. THEMIS and Chandra (windows before the local history begins), the Moon-orbiting,
cislunar and heliocentric objects (no public element sets) are not in this experiment.

Section 12.3 fits the first 24 h of each window's truth and scores the days after it. **Here the information
cutoff E is the end of that 24 h: the same instant at which section 12.3's fit ends and its scored days begin.**
All three arms therefore predict the same target, the three days (E + (k-1) d, E + k d], k = 1, 2, 3, from
information available at E. (The truth inside the first 24 h is never used.)

## Inputs

**Element-set history.** Space-Track GP history in the local SDN archive (creation-day files from 2022-11-20),
read only on this machine. Sets with MEAN_ELEMENT_THEORY SGP4 and EPHEMERIS_TYPE 0. A set is available at E when
its CREATION_DATE is not after E and its EPOCH is not after E; sets with the same EPOCH are one set, the latest
created winning. A window needs at least 7 days of archive history before E.

**Pseudo-observations** (the construction of whitepaper section 12.5's reentry fits, `lib/gp-pseudo.mjs` of
the G1 experiment): the SGP4 module's `propagate_ephemeris` gives each available set's states over the interval
(epoch of the previous set, epoch of the set], at most 48 h back (the first set, 6 h), every 300 s and at the
set's epoch, each from that set alone, in TEME, km and km/s, UTC. The series is the union of these intervals
over the 120 h before E. A window with fewer than 48 states is skipped and counted. A set the module cannot
propagate contributes nothing and is counted.

**Space weather.** The daily table of the G1 run's saved environment (GFZ and NOAA SWPC), as the reentry fits
use it. Earth orientation as the modules take it. The density correction is none (s = 0), no ballistic prior.

## Arms

All through the modules, as built at the pinned commit; JavaScript builds records and counts.

- **SGP4, latest set (baseline).** The latest available set at E (greatest EPOCH), scored by
  `analysis/gp-error-model` `element_residuals` against the window's truth ephemeris, the call that scores the
  SGP4 baseline of the G1 experiment.
- **SGP4-XP fit.** `propagator/sgp4-xp` `fit` on the pseudo-observations (an $OEM block in TEME, USEABLE_STOP E).
  The fitted set is propagated by the module to the truth epochs.
- **SDN-AP fit.** `propagator/sdn-ap` `fit` ($PCF THEORY SDNAP, the module chooses its span from up to 120 h)
  on the same $OEM, with the daily space-weather table. The fitted set is propagated by the module to the
  truth epochs. The build is pinned: modules commit `25203a0ce7e4c9f7c2772f25f0f05a9ca8ec227c`, wasm
  SHA-256 beginning `80867b356130`; the run is refused on any other build.

A fit that fails or does not converge is a result: it is counted, reported per regime and arm, and has no error
value. The truth's frame handling is the G1 experiment's (`foundation/frames` for TEME to the truth's axes).

## Scoring

Day k's error is the 3D RMS, in km, of the arm's position against the truth over the day's truth states,
thinned to one per 300 s (`gp-error-model` `pair_statistics`), counted only when the truth has at least 90 % of
that day's states (the G1 rule). A window's **day 1 to 3 error** is the root mean square of its three day
errors, `sqrt((d1^2 + d2^2 + d3^2) / 3)`; a window is **complete** for an arm when the arm scored all three days.

## Outputs

`results/sdn-ap-gp-history-od/table.json` and `table.md`, generated by `tables.mjs` from the local rows (one
row per window and arm: identifiers, counts, errors; no element set, no pseudo-observation):

- per regime and arm: windows attempted, with a history, fitted, scored, complete; the **median** of the
  day 1 to 3 error over complete windows, its **10th and 90th percentiles**, and a **bootstrap 95 % interval of
  the median** (10,000 resamples of the regime's complete windows with replacement, seed 20261025, percentile
  method; no interval for fewer than 5 complete windows); also the per-day medians (days 1, 2, 3) over the
  windows that scored the day;
- the number of distinct objects behind each cell, and, for regimes of 5 or more objects, a second interval that
  resamples objects and then their windows, because the windows of one object are not independent;
- paired on the windows complete for all three arms: the median of each fitted arm's error divided by the
  baseline's, with its bootstrap interval;
- for context, the section 12.3 precise-fit SDN-AP median on the same windows, read from the committed G1 rows
  after the scores above are written.

The table's JSON schema is `schema` in the file itself (`sdn-ap-gp-history-od/1`). The SDN-AP site build reads
`table.json`. Space-Track data is results only: nothing in this repository holds a GP row or a pseudo-observation.

## Not claimed

The Starlink truth shares the theory's density model (as section 12.3 states), so its row measures the
mean-element approximation against full-force integration from a catalog fit. Windows of the same object are
correlated; the object-level interval says so. Sets created after E are never used, but an element set is
itself a fit by the catalog operator: what this measures is what a user of the public catalog gets, not the
operator's own accuracy. No threshold is tested; the tables are descriptive.

## Amendments

(none)
