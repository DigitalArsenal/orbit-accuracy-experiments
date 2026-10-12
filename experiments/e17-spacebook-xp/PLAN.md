# E17 — A free full-catalog SGP4-XP product and its synthetic covariance against public GP, scored prospectively

Pre-registration. Status: **draft**. The freeze is the commit that sets `"frozen": true` in [`config.json`](config.json),
before any capture is scored. Captures run daily from 2026-10-12 (stack `deployment/spacetrack-archive/spacebook-archive.mjs`).

**Read before the freeze**: the first capture's counts (element sets, ephemerides, truth files) and file headers. **No
Spacebook element set or ephemeris is compared with any truth before the freeze.**

## 1. Question

The High Accuracy Catalog's states are not public, and no public or login-only source carries them for the whole
catalog (`docs/hac-sources.md`, C.21 and H.1). USSF states that SGP4-XP gives accuracy "statistically equivalent" to its
Special Perturbations propagator (quoted by Conkey and Zielinski 2022). USSF's own XP element sets are not public.
COMSPOC's Spacebook serves, without an account, SGP4-XP element sets for the whole catalog and SynCoPate ephemerides
(TEME, 6×6 covariance, 12 days) for any object, as of the request only.

E17 asks:
- **Q1.** Are Spacebook's XP element sets closer to independent truth than the public GP set available at the same moment,
  by orbit class and horizon?
- **Q2.** Is SynCoPate's covariance realistic on independent truth, and is it more realistic than the catalog's
  modeled covariance (`analysis/gp-error-model`, section 2.2 of the catalog paper) for the same objects?

## 2. Prior art and the novel claim

Search of 2026-10-12 in Crossref and the AMOS library. **R** full text read, **A** abstract, **M** metadata only.

| Work | What it found | St |
| --- | --- | --- |
| Payne, Hoots, Butkus, Slatton and Nguyen 2022, AMOS, [10.64861/ohug4581](https://doi.org/10.64861/ohug4581) | SGP4-XP: lunar-solar gravity, resonance, solar radiation pressure, a cis-lunar branch, fuller near-Earth gravity and atmosphere; SGP4 and SGP4-XP both supported operationally | A |
| Conkey and Zielinski 2022, AMOS, [10.64861/bmaw2693](https://doi.org/10.64861/bmaw2693) | Performance and use cases of SGP4-XP against SGP4 and SPEPH; quotes USSF's "statistically equivalent" claim | A |
| Holincheck and Cathell 2021, AMOS, [10.64861/whme5585](https://doi.org/10.64861/whme5585) | XP element sets are not public; pseudo-observations from SGP4 or another ephemeris fit SGP4-XP sets and supply the missing covariance | A |
| Thompson, Gossner, Sais and Cunningham 2019, AMOS, [10.64861/twqd5985](https://doi.org/10.64861/twqd5985) | Fast covariance propagation for two-line element sets | M |
| This repository: SGP4-XP fits (modules `propagator/sgp4-xp` measure), E14 (covariance realism), E16 (epoch correction) | SDN's own XP fits to operator and precise ephemerides; the realism rule; the public-GP ceiling | R |

**Not claimed**: the SGP4-XP theory; fitting XP to pseudo-observations; synthetic covariance for element sets.

**Claimed if measured, and reported either way**: an independent, prospective, multi-class accuracy measurement of a
free full-catalog SGP4-XP product and of its synthetic covariance against operator and precise truth, beside the public
GP sets of the same moment.

## 3. Data

| Arm | Product | Propagator |
| --- | --- | --- |
| GP | Per object, the newest Space-Track GP set with CREATION_DATE before the day's Spacebook request (`spacetrack/gp_history/by-creation`) | SGP4 |
| XP | The day's Spacebook XP set (`hac/comspoc-spacebook/<day>/xp-tle.txt.gz`) | SGP4-XP (`propagator/sgp4-xp`, USSF library) |
| SC | The day's SynCoPate ephemeris and covariance (`syncopate/<norad>.e.gz`) | none: interpolated as served |

Truth, never Spacebook-derived:
- **Starlink:** the first 6 h of each SpaceX public file captured on later days (`operator-ephemerides/daily/<day>/starlink`). Each file's opening hours are the operator's current state; later hours are a blended forecast.
- **ISS:** the first 6 h of each later day's NASA OEM.
- **Laser-ranged satellites:** ILRS combined weekly orbits and NSGF arcs, via `analysis/reference-states`.
- **GPS:** IGS or ESA final orbits, via `analysis/reference-states`, once published.

Spacebook files are never copied into this repository (`docs/data-licenses.md`, `comspoc-spacebook`).

## 4. Measures

For each capture day d, object o and arm a, at each truth epoch t with Δt = t − (request time of d):
- the 3D position error |r_a(t) − r_truth(t)| in GCRF (TEME converted by `foundation/frames`);
- for SC and the catalog's modeled covariance, the Mahalanobis distance d² of the error.

Horizon bins: Δt in [0, 6 h], [21, 27 h], [69, 75 h] and [165, 171 h]. Per (d, o, a, bin): the RMS over the bin's truth
epochs. Classes: Starlink, ISS, laser-ranged LEO, laser-ranged MEO and higher, GPS.

## 5. Hypotheses

- **H1.** Starlink, 1 day: the median over objects and days of RMS_XP / RMS_GP is below 1. Bootstrap over objects
  (10,000 resamples), 95 % interval excludes 1.
- **H2.** Laser-ranged LEO, 3 days: as H1.
- **H3.** GPS, 3 days: as H1.
- **H4.** SynCoPate realism at 1 and 3 days, per class: mean d²/3 in [0.5, 2] and 95 % coverage in [0.90, 0.98]
  (E14's rule).
- **H5.** Per class at 1 day: |ln(mean d²/3)| is smaller for SynCoPate than for the catalog's modeled covariance.

Holm correction over H1–H5. Each class needs at least 20 objects × days in the bin; a class with fewer is reported
as insufficient. Every other comparison is exploratory and labelled so.

## 6. Window

Captures 2026-10-12 to 2026-10-25 (14 days). Scoring after the last truth needed (7-day horizon of the last capture, and
GPS finals) is in the archive.

## 7. Reporting

`results/e17/` holds aggregate statistics only: no element set, ephemeris or per-epoch value from Spacebook. Publication
of results waits on the open licence item in `data/licenses.json`.
