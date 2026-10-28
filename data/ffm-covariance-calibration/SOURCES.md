# C2 input data

What C2 (experiments/ffm-covariance-calibration) fetched or converted for itself, where it came from and under which terms. Every file
is kept outside the repository under `/opt/data/sdn-archive/ffm-covariance-calibration/` with a `provenance.jsonl` (URL, retrieval
time, SHA-256, bytes). Nothing here is reproduced in this repository; results cite each file by URL and SHA-256. The other inputs C2
reads (precise orbits already in the archive's reference states, NASA's ISS trajectory files, B1's environment) are listed in the
receipts' opened-path logs and in [docs/data-licenses.md](../../docs/data-licenses.md).

| Source | Use | Licence or terms | Reproduced |
| --- | --- | --- | --- |
| ILRS CRD v2 normal points of LARES, Starlette, Stella, LARETS and WESTPAC, 2025-10 to 2026-05, from the EUROLAS Data Center (EDC, DGFI-TUM), `https://edc.dgfi.tum.de/pub/slr/data/npt_crd_v2/` | P2 and P3 only (ruling D10, C2-A1 point 3) | ILRS: data and products not copyrighted; citation requested ([ilrs](../../docs/data-licenses.md#ilrs)) | No: cited by URL and SHA-256 |
| NSGF rapid orbits (`nsgf.orb.<sphere>.<yymmdd>.v000.sp3.gz`) of Ajisai, Starlette, Stella, LARETS, WESTPAC, LARES and LARES-2 after 2026-08-28, from EDC `products/orbits/rapid/` | Held out by time, extended (ruling D10) | ILRS (not copyrighted, citation requested); BGS/NERC data are open under the Open Government Licence v3.0, with no statement specific to these orbit files ([ilrs-nsgf](../../docs/data-licenses.md#ilrs-nsgf)) | No: cited by URL and SHA-256 |
| GFZ ISDC Rapid Science Orbits of TerraSAR-X (`GFZOP_RSO_L13_G_*_v03.sp3.gz`, `https://isdc-data.gfz.de/tsxtdx/ORBIT/L13/RSO/`), converted to reference states by analysis/reference-states `scripts/fetch-reference-products.mjs --products gfz-rso` at modules 07a5e016e (C2-A1 point 2) | R1 held out by object | No licence text found on isdc-data.gfz.de for the L13 files (archive provenance, 2026-10-09); GFZ Data Services states CC BY-NC 4.0 for the GFZ Rapid Science Orbits of GRACE-FO ([gfz-isdc-rso](../../docs/data-licenses.md#gfz-isdc-rso)); the coordinator's expected CC BY 4.0 is not confirmed | No: cited by URL and SHA-256 |

Attribution: ILRS data and products (Pearlman et al. 2019, J Geod 93:2181–2194, doi:10.1007/s00190-019-01241-1), from the EUROLAS
Data Center, DGFI-TUM (Noll et al. 2019, J Geod 93:2211–2225, doi:10.1007/s00190-018-1207-2); NSGF orbits: NERC Space Geodesy
Facility, an ILRS analysis center; TerraSAR-X Rapid Science Orbits: GFZ German Research Centre for Geosciences, Information System and
Data Center (ISDC).
