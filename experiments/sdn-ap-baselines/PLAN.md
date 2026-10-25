# B1: SGP4, SGP4-XP and FFM on the windows of the SDN-AP paper's held-out table

Registered 2026-10-25 (task sdn-ap-paper-baselines-20261025); frozen by the first commit of this
plan and config.json. No baseline row of this experiment exists at registration. The SDN-AP rows it
reads were scored by G1 (experiments/sdn-gp-starlink-ffm-match, build 9df647b08978 of
propagator/sdn-ap) and are the numbers section 12.3 of the SDN-AP paper prints; they are read, not
rerun.

## Question

On exactly the windows behind each row of the paper's section 12.3, with the same truth, the same
fit interval and the same scoring, how far from the truth are SGP4, SGP4-XP and the full force
model started from the precise state, day by day, and where is SDN-AP not the closest?

No threshold is tested; the table is descriptive. Every row is reported, with every arm, whichever
arm is closest. A fit that fails or does not converge is a result and is counted.

## Windows

The windows are G1's, as its rows record them in its store (config.g1.store): for each of the
twenty rows of 12.3, the G1 regime of config.rows, every window G1 attempted for that regime. A
window is (source, id, start, fit seconds); its fit interval is [start, E], E = start + fit
seconds; held-out day k is (E + (k - 1) d, E + k d], k = 1, 2, 3. The fit spans are the paper's:
24 h, 14 days for the halo orbit, 30 days for cruise. The registered window counts (config.rows)
are checked before any arm runs; a difference stops the run.

The truth of a window is read the way G1 read it for that source (its lib/sources.mjs,
lib/spk-sources.mjs, lib/packs.mjs and the Starlink FFM-1 truth files), at G1's commit
config.g1.experimentsCommit. Nothing is fetched.

## Arms

1. **SDN-AP.** G1's rows of build 9df647b08978 for the same windows (config.g1.sdnapBuild), as
   recorded. A window G1 could not fit is counted as not fitted.
2. **SGP4.** analysis/gp-error-model `fit_elements` on the fit interval: six mean elements and B*,
   epoch at the first state, no closure (G1's config.sgp4). The fitted set is propagated by
   propagator/sdn-ap (theory 0, SGP4 on the Spacetrack Report No. 3 base) to the held-out epochs.
3. **SGP4-XP.** propagator/sdn-ap `fit` with `$PCF` THEORY SGP4XP (the mode section 12.1 compares
   with the US Space Force library), the same build as arm 1, on the same block G1 gave SDN-AP
   (the fit interval declared as USEABLE_START_TIME and USEABLE_STOP_TIME, the frame declared), with
   G1's saved space-weather table. The set is propagated by the same module.
4. **FFM.** propagator/ffm from the truth state at E (the last truth state at or before E; its
   offset from E is recorded), propagated to the held-out epochs. Nothing is fitted: the state is
   perfect and the force parameters are a priori.
   - Earth-centered windows: the module's catalog full-force request (propagator/ffm
     catalog-configuration.mjs `fullForceRequest`: EGM2008 70 x 70, the Sun, the Moon, Venus,
     Mars and Jupiter from DE440s, cannonball radiation pressure with the conical shadow, Knocke
     Earth radiation, NRLMSISE-00 drag on G1's saved space weather with s = 0, IERS 2010 solid
     tides and relativity, FES2004 ocean tides 30 x 30, the catalog integrator), with G1's saved
     Earth orientation and kernel. Cd*A/m and Cr*A/m: for the laser-ranged spheres, Cd 2.2 and the
     published mass, diameter and Cr of config.ffm.spheres; for every other object the module's
     documented a priori values, Cd*A/m 0.01 and Cr*A/m 0.02 m^2/kg.
   - Moon-centered windows (LRO, Danuri, CAPSTONE): CENTRAL_BODY_NAIF_ID 301, GRGM660PRIM to degree
     150 (the embedded field), the Sun, the Earth, Venus, Mars and Jupiter as point masses from
     DE440s, cannonball radiation pressure with the Moon's shadow at Cr*A/m 0.02 m^2/kg, the state
     in the truth's axes about the Moon, the catalog integrator.
   - Sun-centered windows (Psyche, Lucy, Juno): not run. propagator/ffm flies about the Earth, the
     Moon or Mars; the cells say so.
   - Starlink: the truth is FFM-1 from a fitted state and B_eff, so FFM with the truth's own
     parameters reproduces it by construction. The FFM arm uses the a priori values like every
     other object; the identity run (the truth's own Cd*A/m and Cr*A/m) is reported beside the
     table as a check of the pipeline, not as an arm.

SGP4 and SGP4-XP are Earth-centered theories: on the Moon-centered and Sun-centered windows they
are not run, and the cells say so.

## Scoring

The same for every arm, G1's scorer: the truth states of each held-out day thinned to one per
300 s (the Moon-centered windows: every fifth pack state, the cislunar and heliocentric windows:
every state, as G1 registered them), each predicted state paired with its truth state in the
truth's axes, the error vector in the truth's radial, in-track and cross-track axes by
gp-error-model `pair_statistics`, the day's 3D RMS the root sum of squares of the three component
RMS. A day counts when the truth has at least 90 percent of its states. A predicted state is
converted to the truth's axes by foundation/frames (TEME to GCRF or EME2000) where the arm's
module answers in other axes. SDN-AP's rows were scored by this scorer.

## Statistics

For each row, arm and day: windows attempted, fitted and scored; the median over windows (the
paper's cell), the 10th and 90th percentiles (linear interpolation between order statistics, G1's
`quantile`); a 95 percent interval for the median by the percentile bootstrap over windows, 10,000
resamples; and, where the row has at least five satellites, a second interval by the bootstrap
over satellites (each satellite drawn with all of its windows). Windows of one satellite overlap
in time, so the interval over windows is conditional on those satellites. The resampling generator
is xorshift128+, seeded per cell by SHA-256 of `B1|<row>|<arm>|<day>|<kind>`.

Paired, SDN-AP against each other arm on the windows both scored: the share of windows where
SDN-AP is closer, and the median of the per-window ratio (other / SDN-AP) with its bootstrap
interval over windows. The closest arm of a row and day is the arm with the lowest median among
the arms scored there; ties are reported as ties.

## Outputs

The committed results are aggregates only: results/sdn-ap-baselines/table.json (generated, one
record per row, arm and day, read by the SDN-AP paper's build) and README.md (generated from it).
Per-window rows stay in the local store (config.store). The truths include operator data that
may not be redistributed (SpaceX ephemerides behind the Starlink truth); no state of any truth is
committed.

One E2E: `node experiments/sdn-ap-baselines/run.mjs --check` rescores the first window of every
row through every arm from the local records, compares it with the stored row, and regenerates the
table from the stored rows to compare with the committed table.json. Without the local records it
says so and does not pass.

## Boundaries

Physics runs in the modules; JavaScript selects windows, moves records, and computes the
statistics. The modules are read at config.modules.commit (SGP4, FFM, frames, gp-error-model) and
the SDN-AP snapshot config.g1.sdnapBuild (SDN-AP, SGP4-XP and SGP4 propagation).

## Amendments

None at registration.

### A1 - 2026-10-25, before the run, after the pipeline was tried on the first window of ten rows: the environment of FFM

The pipeline was run, into a scratch store that is discarded, on the first window of the ISS,
Starlink, laser-ranged LEO, GNSS (ESA final), THEMIS and Chandra, TESS, LRO, CAPSTONE and Psyche
rows; their values were seen, and the run recomputes them like every other window. Two findings
change how FFM is given its environment; nothing else changes.

1. G1's saved environment covers 2026-09-13 to 2026-11-02 (space weather) and 2026-07-15 to
   2027-01-11 (Earth orientation): FFM refuses the older windows (space-weather-out-of-range).
   Earth orientation is extended by the IERS finals.all (IAU 2000) file of the local archive
   (hac/iers-eop/20261009), parsed by data-source/eop-parser, the saved rows kept over their own
   span. Space weather is extended by G1's own construction (its lib/spw-history.mjs, G1 amendment
   A11) from the GFZ file of the local archive, started on 2012-06-01 instead of 2019-06-01 (the
   THEMIS windows are of 2013, Chandra's of 2018), the saved rows kept from 2026-09-13 on. The
   construction is checked against the saved rows the file covers and against G1's cached history
   over the days both hold; the checks are recorded with the environment.
2. FFM takes at most 366 rows of Earth orientation: each window is given the rows of its own arc,
   two days either side, of both tables. A row's values are not changed by the slicing.

### A2 - 2026-10-25, after the run, with its failure counts read and before the table was generated: one Earth-orientation series per arc

During the run, a partial table of its first 121 windows was printed once to test the aggregation.
After the run, only the counts of windows each arm did not fit or score were read. FFM refused 4
TESS windows (2026-07-09 to 2026-07-15) whose arcs straddle the first day of G1's saved Earth
orientation: the table A1 gave them mixed the finals.all rows and the saved finals.daily rows
("EOP table mixes series"). Each arc now takes one series: the saved rows when the arc, two days
either side, lies within their span, else the finals.all rows. Every other window had one series
already and is unchanged; the 4 windows were rerun.
