# E10 input data

The planetary-ephemeris excerpts E10 reads that no other experiment
publishes. Each `.bsp` is a copy, by NAIF's `spksub_c`, of the JPL DE440s
records covering one calendar year (TDB); no coefficient is refitted. The
matching `.json` records the source file's SHA-256, the span and the
segments, and `extract_de440_<year>.py` is the script that made it.

| File | Bytes | SHA-256 | Source |
| --- | ---: | --- | --- |
| `data/e10/de440-2018.bsp` | 117760 | `23d817bba6b40e3b82bfb6cca4644c7480a4b261c6ea852faf33747a529c67a7` | 2018 records of https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp (SHA-256 `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`) |
| `data/e10/de440-2024.bsp` | 116736 | `17ffd9d8af55607972f53f8c740576a817616f85145147258e67fe6eef6cde67` | 2024 records of the same file |

E10 also reads Earth orientation (IERS EOP 20 C04 and finals2000A, as in
`data/e1` and `results/e2/data`), the 2026 DE440 excerpt of
`space-data-network-modules` (`files/orbit-products/tests/fixtures/de440`),
ESA final GNSS orbits (Part C truth; release `gnss-truth-20261009`) and
Space-Track element sets (Part C; not published, each run manifest lists
their SHA-256).

## Licences and attribution

Each source's terms, quoted from its primary document, are in [docs/data-licenses.md](../../docs/data-licenses.md). Files are reproduced here or as release assets only where those terms allow it; results use every source, whatever its licence.

| Source | Licence or terms | Reproduced | Attribution |
| --- | --- | --- | --- |
| [JPL planetary ephemeris DE440 (DE440s kernel and year excerpts)](../../docs/data-licenses.md#jpl-de440) | NAIF rules for SPICE kernels: unmodified kernels may be redistributed; a modified kernel names its modifier | Yes, with attribution | JPL planetary ephemeris DE440 (Park, R. S., Folkner, W. M., Williams, J. G., Boggs, D. H. (2021), AJ 161:105, doi:10.3847/1538-3881/abd414), via NASA/JPL NAIF; year excerpts made by DigitalArsenal with NAIF's spksub_c. |
| [IERS Earth orientation (EOP 20 C04; finals2000A)](../../docs/data-licenses.md#iers) | finals2000A: U.S. Government, "Approved for public release: distribution unlimited"; EOP 20 C04: no terms stated | Yes, with attribution | IERS EOP 20 C04 (IERS Earth Orientation Centre, Observatoire de Paris); finals2000A (IERS Rapid Service/Prediction Centre, U.S. Naval Observatory). |
| [ESA/ESOC GNSS orbits and ILRS predictions (ESA0OPSFIN, ESA0OPSRAP, ESA0OPSULT; .esa CPF)](../../docs/data-licenses.md#esa-navigation-office) | Navigation Support Office data terms (ownership and © marking); its GNSS orbits are also IGS analysis-centre products, offered under the IGS terms of use | No: cited only | © Navigation Support Office at ESA/ESOC 2026; IGS analysis-centre products, courtesy of the International GNSS Service (Johnston et al. 2017, doi:10.1007/978-3-319-42928-1). |
| [Space-Track.org GP element sets (gp_history) and SATCAT](../../docs/data-licenses.md#space-track) | Space-Track User Agreement (2019), with USSPACECOM's blanket approval to redistribute basic SSA data (TLE/OMM, SATCAT, decay and reentry) with citation | No: cited only | Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org). |
