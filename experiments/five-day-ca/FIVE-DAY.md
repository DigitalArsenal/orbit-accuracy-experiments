# Five-day CA forecast: stage 1

## Registration amendment — 2026-11-03, coordinator resume note 4

Use AP5.md and AP6.md groups, truth, cutoffs, arcs, fits and weather unchanged:
P, S1, GN at 24 and 72 h (AP5 Part T at 24 h); LS and DO at 24 and 72 h;
GD, IG, GE, HE, HX at AP6's arcs, including its registered long arcs.
Arms AP, whiteroom XP, S, F, and Space Force XP U where the module runs.
Leads [1, 2, 3, 4, 5, 7] count from the fit end. A day enters with at least
90% of its grid states. SGP4 sets fly only on SGP4. Every state and Pc comes
from a module. Import operator-theory libraries read-only.

Swarm and GRACE-FO truth after 2026-10-31, the six held Galileo satellites,
every Starlink group, C2's rows, and every operator capture are not read.
Existing config.json excludedNorads stays frozen. No new sample or refit of
covariance. AP wasm SHA-256 is
715ef2fee512e9c91aacf1c977151dbb1eb83c6b1fa0e1a160cba3304a876ec0;
Space Force XP and covariance artifact hashes are pinned in config.json.

Report per group, arm, arc, day: n, median and p10–p90 of 3D RMS, RMS per
RTN axis, and 95% bootstrap interval of the median. Use 10,000 ISO-week
cluster bootstrap draws, deterministic seed 20261103. Paired AP-XP, F-XP,
XP-S statements at days 4 and 5 apply AP5 rules 1–3: median log error-ratio
97.5% interval below zero; upper interval bound of log p95 ratio below
log(1.10); first-arm failures at most 1%, counted as +Infinity. Second-arm
failures leave the pair, counted; sparse truth and arcs leave the cell,
counted. These statements are prospective for P, S1, GN, GD, IG, GE, HE,
HX under the coordinator's disposition, subject to the prior-read disclosure
below. LS and DO at days 4 and 5 are descriptive, with every such row labeled
"read before the statements were registered". Days 1, 2, 3, 7 must reproduce
the stored b040 rows using the same fits; any difference is a defect.

CA reach is report only, per window, group, day and HBR {10,20,50,100} m:
fit x fit same arm, fit x GP, GP x GP. Fit sigma uses each window's R/T
error; GP uses its altitude band and age bin, scaled only when CALIBRATED,
and otherwise labeled. Integrate the full anisotropic in-plane covariance
on the HBR disk. Circular zero-miss ceiling is
1 - exp(-HBR^2/(2 sigma_pair^2)), sigma_pair^2 = sigma_1^2 + sigma_2^2.
Never substitute (HBR/sigma)^2/(2e). Report the fraction reaching 1e-4 and
1e-5 and Alfano's maximum at fixed miss beside the ceiling.

Synthetic encounters follow A13 part 4 and propagator-ca-frontier: real
window error vectors, true miss drawn log-uniformly from 10 m to 5 km,
hit when true miss <20 m. XP uses frozen C2 fairness constants; FFM uses
C3-small R2/R3 and C2 elsewhere; AP shipped covariance is UNVERIFIED;
S uses an explicitly labeled RMS stand-in; GP uses age-specific covariance.
Report missed-alert and false-alert rates at Pc 1e-4, log and Brier scores,
and paired differences with bootstrap intervals by day. No threshold is
tested and every row is reported. Before encounters are generated, commit
an executable geometry and seed amendment. Do not substitute RMS for an
arm's required carried covariance.

Use at most 12 workers, cheap arms before FFM. Rows stay under
/opt/data/sdn-archive/operator-theory/five-day-ca; only aggregates under
results/five-day-ca. E2E verifies coverage or counted exclusions for every
arm/arc/day, exact old-lead reproduction, registration provenance and real
module replay. Report incomplete work at the two-hour box.

## Disclosure (folded from RESUME-REGISTRATION.md)

The initial task record lacked its specification body. Initial registration
28dd8bb preceded the first flights but omitted the required statements and
statistics. Day-4/day-5 states were flown and read before those statements
were registered. The restored specification was read and preserved at
92374ec; its SHA-256 was
aa6ee0ec4b192a09984f748277c190ed148f3dfbe1b44b526964c2d9788be3d5.
No later amendment makes those reads prospective.

Coordinator resume note 4 resolves ownership: all files in this lane's claim
paths may be edited. LS and DO are descriptive; the other named groups are
designated prospective. Existing audit evidence also contains partial cheap
runs for GD (40), IG (54), GE (27), HE (3), HX (10), P (6) windows, not just
LS (75) and DO (150). Those existing rows are disclosed as prior reads too;
prospective timing applies only to subsequent unread rows. Tables must not
hide this discrepancy or represent prior rows as unread. No new sample is
introduced. No new propagation occurred during resume 3.

## Coordinator ruling — 2026-11-03, resume note 5

The Space Force U library has query-order dependence measured in [propagator-ca-frontier, Amendment A1](../propagator-ca-frontier/PLAN.md#amendment-a1--2026-10-26-reference-order-diagnostic); U replay accepts at most 1 m per scalar and reports every difference and the maximum, while AP, XP, S and F retain exact equality.
Install the staged U replay under that rule. For synthetic covariance only,
use AP 0.4.1's shipped best-minimax table if landed on modules main before
execution, otherwise AP 0.4.0's table; label either UNVERIFIED. Forecast
states retain the original AP 0.4.0 build so the old leads remain comparable.

## Amendment 2026-11-04: one $OCM (experiments-ocm-readers-2-20261104)

Written and committed before any row of this re-measure. AP 0.4.0 and the
Space Force XP 0.1.1 emit `$OMM` with a free-form parameter list, which no
reader reads any more (zero backward compatibility). AP, XP and S are
re-fitted and re-flown on the archived inputs at operator-theory's pinned
build (lib/build.mjs PIN: modules ea824356, sdn-ap 0.5.1 d29acd2b5d92,
sgp4-xp 0.2.1 816fd137d761; git show, SHA-256 checked): fit emits one `$OCM`
carrying its weather rows through the record's horizon, and the flight takes
that `$OCM` and OUTPUT.EPOCHS alone. U is re-fitted on sgp4-xp 0.2.1 in its
own pass, [1,2,3,7] and [4,5] requested separately as before. Groups, truth,
cutoffs, arcs, weather, leads, exclusions, holds, statistics, CA reach and
encounters are unchanged; F, the GP products and the regime mapping are the
registered rows, unchanged. Rows go under
/opt/data/sdn-archive/operator-theory/five-day-ca/b051.

Old leads [1,2,3,7] must equal that build's AP5 and AP6 rows
(/opt/data/sdn-archive/operator-theory/ap/b051, operator-theory's re-measure
of 2026-11-04) exactly for AP, XP and S, and within 1 m per scalar for U.
Carried covariance flies each fitted `$OCM` as fitted: sdn-ap 0.5.1 ships
the registered AP 0.4.1 table (covariance-config.json) unchanged, so the
registered replacement of the four noise coefficients is the identity; the
AP set's COV_PROPAGATION is checked against the row of its COV_REALISM
regime. The registered gp-error-model and conjunction-assessment wasm are
read at modules 16f1ef67 and d8b8fbf4, SHA-256 checked.
