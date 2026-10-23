| Regime | Source | Product | Count | Span | Use | Note |
| --- | --- | --- | --: | --- | --- | --- |
| MEO | ESA/ESOC final GNSS orbits (GPS, GLONASS, Galileo) | daily SP3 as GCRF states, 5 min, 77 satellites a day | 715 | 2024-09-24 to 2026-09-23 | truth: arm 1-2 windows | No BeiDou or QZSS in these products; the GFZ MGEX set below carries them. |
| MEO | IGS final combination | daily SP3 as GCRF states, 15 min | 14 | 2026-08-02 to 2026-08-15 | truth | Spare; the ESA products cover the same constellations at 5 min. |
| MEO (5,850-19,100 km) | ILRS combined weekly orbit, lageos1 | weekly GCRF states, 2 or 15 min | 46 | 2025-10-04 to 2026-08-29 | truth: arm 1-2 windows |  |
| MEO (5,850-19,100 km) | ILRS combined weekly orbit, lageos2 | weekly GCRF states, 2 or 15 min | 47 | 2025-10-04 to 2026-08-29 | truth: arm 1-2 windows |  |
| MEO (5,850-19,100 km) | ILRS combined weekly orbit, etalon1 | weekly GCRF states, 2 or 15 min | 47 | 2025-10-04 to 2026-08-29 | truth: arm 1-2 windows |  |
| MEO (5,850-19,100 km) | ILRS combined weekly orbit, etalon2 | weekly GCRF states, 2 or 15 min | 47 | 2025-10-04 to 2026-08-29 | truth: arm 1-2 windows |  |
| LEO | ILRS NSGF analysis-centre arc, starlette | 4-day GCRF arcs, 3 min | 109 | 2025-10-05 to 2026-08-29 | truth: arm 1-2 windows |  |
| LEO | ILRS NSGF analysis-centre arc, stella | 4-day GCRF arcs, 3 min | 108 | 2025-10-05 to 2026-08-29 | truth: arm 1-2 windows |  |
| LEO | ILRS NSGF analysis-centre arc, ajisai | 4-day GCRF arcs, 3 min | 110 | 2025-10-05 to 2026-08-29 | truth: arm 1-2 windows |  |
| LEO | ILRS NSGF analysis-centre arc, larets | 4-day GCRF arcs, 3 min | 108 | 2025-10-05 to 2026-08-29 | truth: arm 1-2 windows |  |
| LEO | ILRS NSGF analysis-centre arc, westpac | 4-day GCRF arcs, 3 min | 109 | 2025-10-05 to 2026-08-29 | truth: arm 1-2 windows |  |
| LEO | ILRS NSGF analysis-centre arc, lares | 4-day GCRF arcs, 3 min | 107 | 2025-10-05 to 2026-08-29 | truth: arm 1-2 windows |  |
| MEO (5,900 km) | ILRS NSGF analysis-centre arc, lares2 | 4-day GCRF arcs, 3 min | 107 | 2025-10-05 to 2026-08-29 | truth: arm 1-2 windows | LARES-2 orbits near 5,900 km although the harness files it with the low targets. |
| LEO (about 450 km) | Swarm A precise orbit (ESA) | daily SP3 | 323 | 2025-09-30 to 2026-08-18 | truth, not yet scored here |  |
| LEO (about 450 km) | Swarm B precise orbit (ESA) | daily SP3 | 323 | 2025-09-30 to 2026-08-18 | truth, not yet scored here |  |
| LEO (about 450 km) | Swarm C precise orbit (ESA) | daily SP3 | 323 | 2025-09-30 to 2026-08-18 | truth, not yet scored here |  |
| LEO (about 700 km) | Sentinel-1A precise orbit (Copernicus POD) | POEORB files | 264 | 2025-10-01 to 2026-06-29 | truth, not yet scored here |  |
| LEO (about 700 km) | Sentinel-1C precise orbit (Copernicus POD) | POEORB files | 313 | 2025-10-01 to 2026-08-29 | truth, not yet scored here |  |
| LEO (about 700 km) | Sentinel-1D precise orbit (Copernicus POD) | POEORB files | 226 | 2026-01-09 to 2026-08-29 | truth, not yet scored here |  |
| LEO | COSMIC-2 precise orbits (UCAR) | leoOrb files | 17508 | 2025-10-01 to 2026-10-07 | truth, not yet scored here |  |
| LEO | NASA JSC ISS OEM (file of 2026-10-09) | EME2000, 4 min | 1 | 2026-10-07T12:00:00.000 to 2026-10-22T12:00:00.000 | truth: arm 1-2 windows | U.S. Government work. |
| LEO | NASA JSC ISS OEM (same-day capture 2026-10-23) | EME2000, 4 min | 1 | 2026-10-21T12:00:00.000 to 2026-11-05T12:00:00.000 | truth for the COMSPOC scoring arm |  |
| LEO | SpaceX Starlink forecasts, prospective capture (E13b collector) | derived products only: Brouwer mean elements, energy, drag work at 10 min over the first 8 h; no states, no raw files | 11143 | 5 cycles logged, 1 complete: 2026-10-23T13:01:35.254Z to 2026-10-23T13:01:35.254Z | selection of the population only | The truth states of V2 start 2026-10-24 08:00Z. |
| LEO | SpaceX Starlink forecasts, same-day local capture 2026-10-23 | MEME gz, 60 s, 48 h, EME2000 | 40 | 2026-10-23 12:06Z start, 48 h | start states for the FFM truth and in-span scoring | Raw operator files: read in memory, never copied. |
| LEO | SpaceX Starlink forecasts, sample of 2026-10-09 | MEME, 60 s, 72 h | 50 | 2026-10-09 | start states (stale) |  |
| LEO | Operator-derived OMM/OCM fits (E11) | derived records | 143 | 2026-10-10 to 2026-10-12 | derived element sets, not truth |  |
| All regimes (scoring only) | COMSPOC Spacebook XP sets and SynCoPate trajectories with covariance (local capture 2026-10-23 20:09Z) | 29674 SGP4-XP sets (of 29689); 91 SynCoPate objects, 12 days at 180 s with 6x6 covariance | 29674 | set epochs 2026-08-15 to 2026-10-22, median 2026-10-20 | scoring only: never fitted to, never an input, aggregates only | Terms: no commercial use, no redistribution, no derivative works. GPS and laser-ranged objects wait for the products of 2026-10-23 and later. |
| GEO / IGSO / MEO | GFZ multi-GNSS rapid orbits GFZ0MGXRAP (MGEX), in the E14 reference set | daily GCRF states, 5 min, 100 satellites a day: BeiDou and QZSS satellites by name suffix: 9 GEO (G), 12 IGSO (I) | 363 | 2025-10-01 to 2026-09-30 | truth: GEO and IGSO windows (amendment A4) | Found after registration; the first inventory looked under reference-states only. |
| LEO (about 490 km) | GFZ rapid science orbit L64 | 5-hour to 14-hour arcs | 731 | 2025-09-30 to 2026-09-30 | truth, not yet scored here |  |
| LEO (about 490 km) | GFZ rapid science orbit L65 | 5-hour to 14-hour arcs | 731 | 2025-09-30 to 2026-09-30 | truth, not yet scored here |  |
| GEO | operator ephemerides (SES, Intelsat) | none stored locally | 0 |  | none | Space-Track-hosted operator files were fitted in memory by E4/E11 and not kept. Precise GEO truth exists (GFZ MGEX, above). |
| MEO | OneWeb, Kuiper operator ephemerides | none stored locally | 0 |  | none | Same as GEO. |
| HEO | operator or precise orbits (Molniya, Tundra, TESS, IBEX) | none | 0 |  | none |  |
| Cislunar / lunar / interplanetary (bodies) | NAIF planetary ephemeris de440s.bsp | SPK, planets and Moon | 1 | 1849-12-26 to 2150-01-22 | truth for solar-system-bodies, not for SGP4 | Spans from the archive README. |
| Cislunar / lunar / interplanetary (bodies) | NAIF planetary ephemeris de430.bsp | SPK, planets and Moon | 1 | 1549-12-31 to 2650-01-25 | truth for solar-system-bodies, not for SGP4 | Spans from the archive README. |
| Cislunar / lunar / interplanetary (bodies) | NAIF planetary ephemeris de421.bsp | SPK, planets and Moon | 1 | 1899-07-29 to 2053-10-09 | truth for solar-system-bodies, not for SGP4 | Spans from the archive README. |
| Cislunar / lunar / interplanetary (bodies) | NAIF planetary ephemeris de405.bsp | SPK, planets and Moon | 1 | 1950-01-01 to 2049-12-31 | truth for solar-system-bodies, not for SGP4 | Spans from the archive README. |
| Cislunar / lunar / interplanetary (spacecraft) | NAIF spacecraft SPK (LRO, CAPSTONE, Artemis, Danuri, cruise arcs) | none in the archive | 0 |  | none | The archive holds planetary kernels only. To fetch next: LRO, CAPSTONE, Danuri and Artemis I kernels from NAIF, JPL Horizons vectors for cruise arcs. |
| Cislunar / L2 | JPL Horizons evidence in modules propagator/ffm (JWST, Moon, Sun, Venus, Jupiter) | geocentric ICRF vectors, hourly | 50 | 2026-06-10 to 2026-08-03 | fixture truth: 50 epochs in two 25-hour windows | Test evidence in the modules repository, not the archive. |
| Lunar / Mars | SPK fixtures in the modules repository (LADEE segment, MSL and InSight landers) | type 13 and type 8 test kernels | 3 | short test arcs | fixtures only | Not truth sets; they exercise the SPK reader. |
| Interplanetary / small bodies | JPL SBDB, MPC element catalogs | none | 0 |  | none | No small-body element catalog is archived. |
