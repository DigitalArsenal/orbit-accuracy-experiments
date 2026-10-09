# E4 — Operator ephemerides against products built from public data

Status: **frozen at the commit that sets `config.json` `"frozen": true`.**
Nothing here has compared an operator ephemeris with anything before that
commit. Only the file formats were inspected (headers of one file per
provider) to write the readers. A deviation is recorded under Amendments.

## 1. Question

Operators publish ephemerides of their own satellites, some with
covariance (SpaceX Starlink), and precise-orbit services publish
post-processed and predicted orbits (IGS, ESA). How closely does what the
Space Data Network can build from public catalog data alone match each
operator's ephemeris, and its stated uncertainty, per source? Where an
independent precise orbit exists, which of the two is closer to it?

## 2. Data

### Operator ephemerides

Captured from the operators' own public feeds by the local SDN
ephemeris-provider nodes (`~/.local/share/spacedatanetwork/ephemeris-provider-nodes/<provider>`,
2026-09-09 onward; the CSS node is still capturing). Each node stores the
raw file in its IPFS block store with an `$NCD` descriptor (source URL,
SHA-256, size). The capture time of a file is the time of the first
dataset index that lists it. Step 00 copies the exact files the study uses
out of the nodes (read only), checks every SHA-256 against its descriptor,
and writes `inputs.json` (URL, capture time, SHA-256, size, provider terms).

| Provider | Format | Frame, time | Objects | Selection |
| --- | --- | --- | --- | --- |
| `spacex-starlink` | MEME text, 60 s, 3 days, 6×6 UVW covariance | EME2000, UTC | Starlink | 300 objects drawn without replacement (SplitMix32, seed 20261009) from the sorted NORAD numbers with a captured file; per object the earliest captured file |
| `iss` | CCSDS OEM 2.0 | EME2000, UTC | ISS (25544) | every distinct captured file |
| `css-tiangong` | CCSDS OEM 2.0 in a zip | EME2000, UTC | Tianhe (48274) | every distinct captured file |
| `planet` | `planet.states`: one state per satellite; `planet_mc.tle` | J2000, TT seconds since J2000 (Planet's README) | Planet (HWID → NORAD from Planet's own TLE file captured with it) | every distinct captured states file |
| `intelsat` | ECF positions, 30 min | ITRF (Earth-fixed), UTC | Intelsat fleet; name → NORAD by the rule in `config.json` | files whose name timestamp is within 3 days before capture |
| `gps-precise` | SP3 `IGS0OPSULT` (48 h: 24 h observed, 24 h predicted) | ITRF, GPS time | GPS | every captured file |
| `glonass-precise` | SP3 `ESA0OPSULT` | ITRF, GPS time | GLONASS only (GPS is covered above) | every captured file |
| `esa-pod` | SP3: `ESA0OPSRAP` (rapid), Swarm A and CryoSat-2 POD | ITRF, GPS time | GPS, GLONASS, Swarm A (39452), CryoSat-2 (36508) | every captured file |
| `cpf` | ILRS CPF v2 predictions (ESA), 15 min | ITRF, UTC | Galileo | every captured file |

Not compared, with the reason reported: `eutelsat-oneweb` (LTEF: no module
evaluates the format), `ses` (IESS-412 eleven-parameter model: no module
evaluates it), `telesat` (box-centre longitude/latitude, not a state
ephemeris), `eumetsat` (two-line elements only, no ephemeris and no truth
on hand). `space-track`, `spire`, `cpf-edc` and `vimpel` are credentialed
sources and are excluded entirely.

Frames and times are converted only in modules: EME2000/J2000 to GCRF by
`foundation/frames` (state transform, IAU 2006 frame bias); Earth-fixed
products to GCRF by `files/orbit-products` `read_container` and
`analysis/reference-states` with IERS EOP (finals2000A through
`data-source/eop-parser`). The Intelsat ECF and CPF files carry no SP3
container; their epochs and positions are transcribed, unchanged, into SP3-c
text (`P` records, positions in km) for that reader. Planet's TT epochs go
to UTC through `foundation/time`.

### Our inputs: public catalog data only

- **Element sets**: Space-Track `gp_history` (local archive; SGP4 theory,
  ephemeris type 0). For an operator file with information cut-off T_c
  (below), the product uses the object's set with the latest `EPOCH` among
  the sets with `EPOCH` ≤ T_c and `CREATION_DATE` ≤ T_c. Element sets and
  anything derived from them per sample stay on this machine.
- **Models**: `analysis/gp-error-model` `docs/model-2026-08-scaled.json`
  (SGP4 covariance by regime and age) and `docs/hpop-covariance-model-2026-08.json`
  (HPOP P₀ and process noise by regime), both fitted on 2026-08 data, before
  every file used here.

### Truth (independent precise orbits)

ESA final orbits `ESA0OPSFIN` (GPS and GLONASS, an IGS analysis-centre
final; BKG's IGS combination was unreachable at the freeze) and CODE's MGEX
final `COD0MGXFIN` (Galileo; ESA publishes no multi-GNSS final for these
weeks) for 2026-09-08 to 2026-09-20, downloaded by step 05 and converted by
`analysis/reference-states` with the IGS satellite metadata SINEX. If a
truth product cannot be downloaded, the comparisons that need it are
reported as not tested. Starlink,
ISS, CSS, Planet and Intelsat have no independent precise orbit on hand.

## 3. Products compared ("ours")

| ID | Product | Covariance |
| --- | --- | --- |
| S | SGP4 from the selected element set (`analysis/gp-error-model` `accumulate`: SGP4, TEME → GCRF, error in the comparison state's RTN axes) | The regime × age stratum of `model-2026-08-scaled.json` (RTN, km²) |
| H | The CA HPOP screen's product: `analysis/epoch-state` GCRF state at the set's epoch, propagated by `propagator/hpop`'s resident force model (point mass + EGM2008 20×20) | P(t) = Φ P₀ Φᵀ + Q from `hpop-covariance-model-2026-08.json` (P₀ rotated to GCRF by `gp-error-model` `hpop_arcs`), propagated by HPOP |
| P | Planet only: SGP4 from Planet's own published TLE (operator's element set), scored like S | none |

E2's batch-fit product (C2/C4: HPOP fitted to catalog history with
covariance, `analysis/estimation` `fit_batch`) is not on the modules'
default branch at the freeze; E4 uses H, the calibrated HPOP product the
modules already carry, and reports C2 as not run.

## 4. Comparison

**Cut-off and horizons.** T_c is the operator's stated creation time where
the file states one (MEME `created:`, OEM `CREATION_DATE`, CPF `H1`
production hour, Intelsat file-name timestamp), otherwise the capture time
(SP3 predictions). For definitive products (`ESA0OPSRAP`, Swarm and CryoSat
POD), whose span lies wholly before their publication, T_c is the start of
the span. Horizon h is scored at the first operator epoch at or after
T_c + h, for h in `config.json` `horizonsHours` within the file's span.
Planet's states are scored at their own epoch only (`h = at epoch`), with
element sets whose epoch is at or before it.

**Errors.** Position and velocity differences, ours minus operator, in the
operator state's RTN axes: for S by `accumulate` (narrow age bins, one
operator state each, as in E1); for H by `foundation/frames`
(GCRF → RTN rotation about the operator state), applied to the GCRF
difference and, for covariance, as R C Rᵀ. Where truth exists, ours minus
truth and operator minus truth, in the truth state's RTN axes, the same way.

**Metrics** per provider × product × horizon: samples, objects, median,
95th percentile and maximum of |R|, |T|, |N| and the 3D distance (km), and
the signed medians.

**Covariance** (Starlink MEME; SpaceX's UVW = RTN, km²):
- σ ratio per axis, ours over SpaceX's, median over samples;
- d² = eᵀ (P_ours + P_operator)⁻¹ e for the 3D position difference e (the
  difference of two independent estimates of one position), against χ²(3):
  mean d²/3 and the fraction inside the 95 % ellipsoid;
- d² of e under P_operator alone and under P_ours alone, reported beside it.

**Manoeuvres.** An object-file is flagged when S's 3D difference at h = 0
exceeds max(10 km, median + 5 × 1.4826 × MAD) of its provider's h = 0
differences (a manoeuvre between the element set and T_c, or a cross-tag).
Primary results exclude flagged object-files; results with them are
reported beside. The flagged count is reported per provider.

**Statistics.** Intervals are object-cluster bootstrap percentiles (2000
resamples, seed 20261009, 95 %).

## 5. Hypotheses and decision rules

| ID | Statement | Rule |
| --- | --- | --- |
| H1 | Starlink: S is within 2 km (median 3D) of SpaceX's ephemeris at h = 0 and within 30 km at 72 h. | Pass if both medians, flagged files excluded, are below the bounds. |
| H2 | Starlink: our covariance (S, and separately H) is consistent with our difference from SpaceX's ephemeris given both covariances. | Pass per product and horizon if mean d²/3 ∈ [0.8, 1.25] and 95 % coverage ∈ [0.93, 0.97]; reported for h ≤ 72 h. |
| H3 | Starlink: our σ exceeds SpaceX's by at least 10× in-track at every horizon. | Descriptive: median ratio and its 95 % interval per axis and horizon. |
| H4 | GNSS (GPS, GLONASS, Galileo): the operator's predicted orbit (IGS/ESA ultra-rapid, ESA CPF) is closer to truth than S and H at every horizon. | Pass per provider if the median 3D error ratio operator/ours, at each horizon, has its 95 % upper bound below 0.1. |
| H5 | H against S, per provider and horizon (two-sided). | "H closer" if the 95 % upper bound of median3D(H)/median3D(S) is below 1; "S closer" if the lower bound is above 1; otherwise undecided. |

Failures are results, reported with the same care.

## 6. Publication of the inputs

Everything E4 reads from an operator is published for others to check,
under its provider's terms, which step 00 records per file:
- small files (≤ 1 MB compressed) under `data/e4/<provider>/`, gzip, with
  `data/e4/SOURCES.md` (URL, capture time, SHA-256, terms);
- larger sets as GitHub release assets (one `.tar.gz` per provider),
  listed with every member's SHA-256 in `data/e4/MANIFEST.json`;
- a provider whose terms do not grant redistribution: files are prepared,
  but listed under `needsPermission` in the manifest and not committed;
- truth products are listed by URL and SHA-256 (public archives).
Element sets (Space-Track) and per-sample tables derived from them are
never published; only the aggregates in `results/e4/` are.

## 7. What E4 does not show

- Accuracy against truth for Starlink, ISS, CSS, Planet or Intelsat: only
  agreement with the operator, whose own error is unknown here.
- A fitted product (E2's C2); E4 scores the calibrated HPOP product the
  modules carry today.
- OneWeb, SES and Telesat: their formats have no module reader.

## Amendments
