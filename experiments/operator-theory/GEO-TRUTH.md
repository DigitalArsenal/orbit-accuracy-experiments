# Geostationary operators against truth

Registered 2026-11-03, before any arm was fitted to or scored on the data below. Report only: no statement here.

The owner, 2026-11-03, verbatim: "test for those maneuvers, intelsat should be measured against the truth data".

## Truth

No precise orbit of an Intelsat or SES satellite is published. Three commercial geostationary satellites carry WAAS payloads, and WAAS broadcasts each one's position (message type 9) with a stated range accuracy (URA) of 2 m: PRN 135 Galaxy 30 (Intelsat), PRN 133 SES-15 (SES) and PRN 131 Eutelsat 117 West B (Eutelsat). The IGS merged broadcast files on NASA CDDIS (`BRDM00DLR_S`) record them every 256 s, Earth-fixed, in GPS time. `lib/sbas.mjs` reads only records with a URA of 2 m and turns them to GCRF through `analysis/reference-states` with IERS Earth orientation, as the operators' own Earth-fixed files are. EGNOS's records for Astra 5B and SES-5 carry no usable URA and are not read.

A check made while writing the reader, before this registration: on 2026-10-29 the broadcast and Intelsat's own Galaxy 30 file differ by a median of 1.98 km (most 3.73 km). The 2 m is stated by WAAS, not measured here; the fits below report their own residuals as a check on how smooth the broadcast is.

## Part W: fitted to the broadcast

As `AP6.md`, group `WA`: each of the three satellites, cutoffs every 2 days from 2026-09-02 to 2026-10-26, fits of 24 h and 72 h ending at the cutoff, scored on days 1, 2, 3 and 7 after it. Arms `AP`, `XP` (whiteroom), `U` (Space Force XP), `S` (SGP4), `F` (FFM 20x20, no drag, solar-pressure area over mass fitted), at `CHEAPER.md`'s settings above 8,400 km. Amended before any window was scored: the weather store holds no forecast issued in this period, so every window was refused, and at geostationary altitude no atmosphere model gives any density; these windows run without one and read no weather, as `AP6.md`'s highly elliptical group does.

## Part F: fitted to the operators' files

Every stored Intelsat file of Galaxy 30 and SES file of SES-15 (`vendors/` store): each arm fitted to the first 24 h and 48 h of the file, as `providers-run.mjs` does, and scored against the broadcast on days 1 to 7 after the end of the fit, wherever the broadcast reaches. The operator's own file is scored the same way over its span.

## Maneuvers

A geostationary satellite keeps station with burns, and no arm knows about them. For each satellite and sidereal day, the mean semimajor axis and mean orbit normal of the truth; a burn is a day, or the first day after a gap, that breaks the straight line through the two days before it by more than 10 times the median break over all the satellites of the test. Results are reported for every window and, separately, for windows with no burn from the start of the fit to day 7. The same rule is applied to `AP6.md`'s geostationary BeiDou and QZSS satellites, where it was first written after seeing that C018, C229 and C231 went wrong together on the same dates in every window; that use is labeled apart.
