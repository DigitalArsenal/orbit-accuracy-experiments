# Windows read by earlier experiments

This inventory, taken on 2026-10-10, is why E7v2's test window and confirmatory
cells are what they are (PLAN.md section 4). It covers each experiment's
`PLAN.md`, `config.json` and run manifests on `main` and on the branches and
worktrees then open (E4 A4, E6, E8, E11 and E12). Dates are 2026 unless
another year is shown. Bold marks a test window.

| ID | Windows | Data read | Status on 2026-10-10 |
| --- | --- | --- | --- |
| V1 | no split; IGS finals 08-02..08-15; ILRS arcs ending 08-08, 08-15 | GPS, SLR spheres; no OMM | run |
| E1 | train 2024-10-01..2025-09-30; validation 2025-10-01..2026-03-31; **test 04-01..09-15**; A0 08-02..08-15 | GPS: OMM 2024-10-01..2026-09-18, ESA/IGS finals | test read |
| E2 | dev 2024-10-01..11-15; train 2025-10-01..2026-03-31; validation 04-01..06-30; **test 07-01..09-15** | GPS only | test read |
| E2b | E2's windows | GPS, LEO-POD (Swarm, Sentinel-1), SLR; truth to 08-19 (Swarm), 08-31 (Sentinel-1C/D), 08-29 (ILRS), 08-28 (NSGF), 09-23 (ESA) | test read |
| E3 | train issue days 08-03..08-24; **test 09-07..09-26** (targets to 10-03) | 48 objects: GPS, Swarm, Sentinel-1, NSGF, ILRS | test read |
| E4 | no split: operator files 09-09..09-16 (Tianhe to 10-09); ESA truth 09-08..09-20 | operator objects (Starlink, GPS, GLONASS, Galileo, Planet, Intelsat, SES, Tianhe); OMMs loaded 2025-03-01..2026-10-09, used near each cutoff | read |
| E5 | validation 04-01..04-21; **test A 01-12..01-26, B 03-15..03-28, C 06-26..07-08**; historical 2003, 2008 | Swarm/GRACE-FO densities; Swarm, Sentinel-1, NSGF orbits; no OMM | test read |
| E6 | laser dev 06-28..07-15, **test 07-16..08-29**; SatNOGS dev 09-04..09-09, **test 08-29..09-04, 09-09..10-10** | NSGF objects, the ISS; OMM 06-25..10-10 | test read |
| E7 | dev 2025-10-01..10-12; train 2025-10-15..12-31; validation 01-15..03-31; **test 05-01..08-10** | GPS, Swarm, Sentinel-1, NSGF and ILRS objects; OMM 2025-09-02..2026-08-21 | test read |
| E8 | E5's windows | LEO rocket bodies, debris and spheres 300–900 km (about 9,400 objects screened per window); OMM 2025-10-13..2026-07-19 | validation read; test shards running |
| E9 | none | none | not started |
| E10 | B synthetic: **test 06-02..06-27** (six epochs); C GPS: **test 07-01..09-15** (six 3-day arcs) | GPS; OMM 07-01..09-17 | test read |
| E11 | forward window 10-10..10-15 (SupGP), operators to 10-22 | operator objects | planned |
| E12 | none | none | planned |

Every 2026 date up to 10-09 lies inside some earlier test or validation
window, so there is no unread window at the date level. The cells E7v2 can
claim as unread are these:

| E7v2 class | Read in 2026 by | Unread in E7v2's test (cutoffs 07-20..08-31, targets to 09-07) |
| --- | --- | --- |
| GNSS-GE (GLONASS, Galileo) | E4 (truth 09-08..09-20) | yes |
| LEO-POD (DORIS, COSMIC-2 satellites) | nobody (never converted to truth before) | yes |
| LEO-drag, LEO-upper (rocket bodies, debris) | E8, in E5's windows (OMMs loaded to 07-19) | yes |
| MEO, GEO+, HEO (passive objects) | nobody | yes |
| GPS | E1, E2, E2b, E7 (to 08-10), E10 | no: reported, not confirmatory |
| LEO-POD-E7 (Swarm, Sentinel-1) | E2b, E3, E5, E7 | no: reported, not confirmatory |
| SLR-LEO, SLR-MEO | E2b, E3, E5, E6, E7 | no: reported, not confirmatory |

The prospective window (cutoffs 10-11..11-07) was unread by construction when
the plan froze. It is confirmatory for every class. E11's forward capture
(10-10..10-22) reads operator objects only.

No exploratory "pilot" workflow appears in any experiment, branch, worktree
or graph file. The coordinator reported one using 2025 data, so E7v2 uses
2025 for training only.
