# Identity reconciliation and reader-fidelity amendment

Registered after native inventory 9671e21c3eeef89acce451c55342152864312d241850c8ce59a1b0713b9d01bd
completed, before any new propagator scoring. The original inventory and both
completed numerical studies stay immutable.

Retain exact provider identities, original snapshot TLE crosswalks and their
checksums. Supplement them with hashed public IGS satellite metadata SINEX,
NASA's SP3 correspondence table and Planet's matching report. IGS PRN reuse
requires a unique SVN/NORAD association across the entire product interval;
ambiguous or boundary-straddling intervals remain unresolved. Planet explicitly
describes its CATID matches as best guesses subject to cross-tagging. Preserve
competing candidates, historical matches and disagreements; never turn those
into verified physical identities. A later matching report cannot silently
replace the snapshot's mapping. No loose satellite-name matching is allowed.

Recheck both failed anonymous resources using fresh direct requests and an
independent curl IPv4 transport. Keep every failure and successful replacement
as a separate receipt; do not alter the frozen discovery queue or old outcomes.

Replay all 11,163 Starlink products with the covariance-preserving reader at
module commit cc64880aee735ed7b3cdf36d7a3d1fabbbf463c4. Pin the exact artifact,
adapter and source hashes before starting. Check every source state component,
actual epoch and supplied covariance component against decoded OEM values;
this is parser fidelity, not a numerical model comparison. No invented
uncertainty, surrogate covariance, uniform replacement epoch grid or silent
dropping of malformed records. Keep failed products in every denominator.
The source's UVW convention follows the independently checked native
RSW_INERTIAL path; rotating-frame covariance support is a separate contract.

Only after identity, native frame/time conversion, source chronology and
reference-uncertainty provenance are verified may new arcs enter a separately
identified comparison. Retain the original fit, coverage, horizon and accuracy
criteria. Single operator forecasts remain model-closure evidence, not
independent physical truth. High-fidelity BFMC and empirical covariance
calibration remain separate requirements; source fidelity cannot satisfy them.

Primary references: [IGS metadata](https://igs.org/mgex/metadata/),
[SINEX metadata 1.10](https://files.igs.org/pub/resource/working_groups/multi_gnss/Metadata_SINEX_1.10.pdf),
[NASA SP3 identifiers](https://cddis.nasa.gov/sp3c_satlist.html),
[Planet formats and caveats](https://ephemerides.planet-labs.com/), and
[SpaceX trajectory format](https://docs.space-safety.starlink.com/docs/tutorial-basics/trajectories/).
