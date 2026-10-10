# HAC data sources

The inventory behind the high-accuracy catalog (HAC) parity study: every public
or login-only source found that can stand in for, feed, or check a catalog close
to the U.S. Space Force High Accuracy Catalog. For each source: what it is, what
it covers, how to get it, the terms it comes under, what it does for HAC parity,
and where it stands. Checked on 2026-10-09 by fetching each landing or terms
page with `curl` (a browser user agent, no login, no browser session). Nothing
here was obtained through an account, except the 2026-10-10 additions: the
Space-Track documentation page and SGP4 package (F.9, F.10, C.18, C.19) come
from the owner's logged-in session and the Public Files listing (B.11) from the
owner's archiver. The owner's SatNOGS DB token was not used. Rows A.19,
B.11–B.15, C.18–C.22, D.15, F.9, F.10 and G.7, and all of §7 (the
meta-processes: quantities recovered from published products), were added on
2026-10-10.

Acquired files are kept outside every repository, under
`/opt/data/sdn-archive/hac/<source>/`, as received, each with a
`<file>.provenance.json` (URL, retrieval time, SHA-256, byte count, terms URL
and the terms clause). The experiments reproduce a file here (under `data/` or
as a release asset) only where its terms allow it; the **Reproduce** column
gives the decision, and [data-licenses.md](data-licenses.md) quotes the terms
behind it. Results use every source an experiment read, whatever its licence.

**Status codes.** **DL**: downloaded here (path in the last section).
**AR**: already in the SDN archive. **S**: anonymous and scriptable, not
downloaded. **L**: needs an account (named). **P**: commercial or paid.
**R**: obtainable, but its terms rule out use in the stack's products.
**U**: unreachable from this host on 2026-10-09 (connection timeout or DNS
failure). **X**: not obtainable.

## Summary

97 sources in eight groups (three added and two updated for E6 on 2026-10-09: C.7, C.8, C.16, C.17, F.8; two added for E8: D.14, G.6; fifteen added on 2026-10-10: A.19, B.11–B.15, C.18–C.22, D.15, F.9, F.10, G.7; B.5 corrected). A source can carry two codes. For example,
Space-Track is both AR and L.

| Group | Sources | DL | AR | S | L | P | R | U | X |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Precise orbits (truth) | 19 | 7 | 4 | 7 | 7 | 0 | 0 | 1 | 2 |
| B. Operator ephemerides and broadcast orbits | 15 | 3 | 0 | 8 | 3 | 0 | 1 | 2 | 0 |
| C. Catalogs and observations | 22 | 4 | 1 | 4 | 12 | 5 | 0 | 0 | 2 |
| D. Density and its calibration | 15 | 5 | 1 | 5 | 2 | 0 | 2 | 1 | 0 |
| E. Space weather indices and forecasts | 7 | 4 | 0 | 2 | 0 | 0 | 0 | 1 | 0 |
| F. EOP, gravity, tides, planetary ephemerides | 10 | 6 | 1 | 0 | 4 | 0 | 0 | 0 | 0 |
| G. Physical properties | 7 | 2 | 1 | 1 | 4 | 0 | 0 | 1 | 0 |
| H. The HAC and HASDM themselves | 2 | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |
| **All** | **97** | **31** | **8** | **27** | **34** | **6** | **3** | **6** | **4** |

Counted once, by the most open route: 37 are on hand (31 downloaded here,
6 already archived), 22 more are anonymous and scriptable, 25 need an account,
4 are commercial only, 3 have terms that rule out product use, 5 were
unreachable from this host on 2026-10-09, and 1 cannot be obtained.

## 1. The target: what is public about the HAC

**What it is.** The SSN's radars and telescopes collect the observations that
"are processed to maintain the High Accuracy Catalog (HAC) of on-orbit space
objects" ([NASA CA Best Practices Handbook, Vol. 1, Aug 2026, §3][h1]). The
Astrodynamics Support Workstation (ASW) solves for the state, the ballistic
coefficient (CDA/m) and the SRP coefficient (CRA/m), and it considers both
parameters as well. A typical update carries an 8×8 covariance, U V W U̇ V̇ Ẇ B
AGOM; regimes that cannot support both drag and SRP get a 7×7
([Hejduk 2016, ASW Covariance][asw]). The atmosphere is JBH09:
JB2008 with the HASDM Dynamic Calibration Atmosphere (DCA), which provides
"definitive atmosphere and 3 day predicted corrections". The Anemomilos model
adds a 6-day Dst prediction from X-ray flares. Geomagnetic heating comes from ap
when Dst > −75 nT and from the JB2008 Dst storm algorithm below that
([Pachura & Hejduk 2016][jspoc-atm]).

**Accuracy figures in public sources.** No public document found gives HAC
position-error statistics, by regime or otherwise. What is published and
verifiable:

| Figure | Value | Source |
| --- | --- | --- |
| Example ASW covariance in a CDM, at epoch | σU ≈ 8.3 m, σV ≈ 332 m, σW ≈ 2.1 m (square roots of the printed 6.84e1, 1.10e5 and 4.47 m²). One object, given as an illustration, not as a statistic. | [Hejduk 2016, slide 4][asw] |
| GP (TLE) accuracy in the HAC's own conjunction regime, LEO perigee > 500 km | "errors from 600 m to 3 km are observed" from epoch to 72 h, for both SGP4 OD and eGP TLEs | [Handbook Vol. 2, App. E][h2], citing Hejduk et al. 2013 (AAS 13-240) |
| HASDM against accelerometer densities, 2003 Halloween storm | mean orbit-averaged bias: CHAMP 26 % (HASDM) vs 37 % (JB2008); GRACE-A 16 % vs 36 % | [Walterscheid et al. 2023, NTRS 20240013068, lines 499–503][walt], reporting Licata et al. 2021 |
| DCA effect | improves "ballistic coefficient consistency, epoch accuracy, and epoch covariance realism" over 40 evaluation satellites in the first half of 2001. The abstract gives no numbers. | [Casali & Barker 2002, AIAA 2002-4888][dca] |
| Density forecast error in the covariance | the DoD's Dynamic Consider Parameter sizes density error by perigee height and Ap/Dst class. The published figure's y-axis is "omitted here to allow full releasability". | [Handbook Vol. 2, App. N][h2]; [Hejduk 2019][hej19] |
| Use by others | EU SST screens against "the U.S. high accuracy catalog without covariance", twice a day. TraCSS "relies on the U.S. Department of Defense (DOD) special perturbation catalog with covariance information". | [Borowitz, Hejduk et al., AMOS 2024][amos24] |

So the parity target is set by method, not by a published error budget. The
target is JBH09-calibrated SP orbits with realistic covariances. It is checked
against independent precise orbits (groups A and D), and against HASDM where
HASDM is public (D.1–D.3).

## 2. The Dynamically Calibrated Atmosphere and a public stand-in

**What DCA does, from verified sources.** Storz et al. 2005 ([Adv. Space Res.
36(12), 2497–2505][storz]) is paywalled. Its abstract is withheld from
Crossref, OpenAlex and Semantic Scholar, and ScienceDirect refused the
request. The parameters below therefore come from verified secondary sources
that cite it:

- **Calibration satellites:** "more than 70 carefully chosen calibration
  satellites … altitude range of 190-900 km although a majority are between
  300 and 600 km" ([Licata et al. 2022, arXiv 2109.07651][mlh], citing Bowman &
  Storz 2003). "up to 90 calibration satellites" ([Tobiska et al. 2022, AMOS,
  arXiv 2209.05597][tob22]). CARA's account of Bowman and Casali's current
  method: "About 100 such satellites" with "very stable ballistic coefficients"
  ([Hejduk 2019][hej19]).
- **Correction parameters:** DCA modifies "13 global temperature correction
  coefficients" ([Licata et al. 2022][mlh]). These are "spherical harmonic
  expansions of two Jacchian temperature parameters" ([Casali & Barker
  2002][dca]).
- **Estimation:** an ensemble differential correction of all calibration
  objects together. Each object gets a six-element correction and a constrained
  B correction ("few percent"), and the global correction factors are solved at
  the same time ([Hejduk 2019][hej19]). A segmented solution takes "a 3-h
  sub-interval within the fit span of an estimated 1.5-day interval"
  ([Tobiska et al. 2022][tob22]). The segmented ballistic-coefficient solution
  lets B vary over the fit ([Licata et al. 2022][mlh]).
- **Cadence and prediction:** densities every 3 hours, with 3-day predicted
  corrections ([Pachura & Hejduk 2016][jspoc-atm]). The correction coefficients
  are projected by "a prediction filter that employs wavelet and Fourier
  analysis" ([Licata et al. 2022][mlh], citing Storz 2005) or by a "low-order
  autoregression model" ([Hejduk 2019][hej19]). Solar indices are predicted by
  a "weighted autoregressive fit of last five solar rotations' worth of data
  (135 days)" ([Hejduk 2019][hej19]).

**Recommended stand-in: an open DCA on JB2008.**

1. *Background model:* JB2008 driven by SET's SOLFSMY, DTCFILE, SOLRESAP and
   DSTFILE (E.1, downloaded). HPOP already has an exact JB2008 port. Do **not**
   build on NRLMSIS 2.x or DTM2020. Both licenses forbid commercial use and any
   modification (D.8, D.9), and a port into an SDN module is a modification.
2. *Calibration set:* the same kind of object HASDM uses, in two tiers.
   (a) High grade: the SLR spheres with known A/m (Starlette, Stella, Larets,
   Ajisai, LARES, LARES-2; A.2), and LEO satellites with precise orbits and
   published geometry (Swarm A/B/C, GRACE-FO, COSMIC-2, Sentinel-1/3/6, CryoSat-2,
   Jason-3, SARAL, SWOT, TerraSAR-X/TanDEM-X; A.4–A.9). (b) Bulk: about 100
   stable-B debris and rocket bodies at 190–900 km, drawn from Space-Track
   `gp_history` (C.1, archived) and processed by the method of Picone et al. 2005
   (D.11).
3. *Estimation:* every 3 h, over a sliding 1.5-day window, solve 13 global
   temperature-correction coefficients (spherical-harmonic corrections to the
   two Jacchia temperature parameters), with per-object segmented B. The
   published sources do not give the expansion's terms; choosing them is part
   of the study. Project the coefficients 72 h ahead by autoregression, and
   carry the projection error as a consider parameter sized like the DoD's DCP:
   by perigee height and Ap/Dst class, with day weights 5/9, 3/9, 1/9
   ([Hejduk 2019][hej19]).
4. *Truth and scoring:* Swarm DNS (POD and ACC) and GRACE-FO DNS densities for
   2025-10 to 2026-10 (D.5, D.6, downloaded). The HASDM database for 2000–2025
   (D.1, owner login), its CC BY extracts (D.2, fetched by another lane; D.3,
   downloaded), and NOAA
   WAM-IPE (D.7) as a physics cross-check. The pass mark: the open DCA's
   orbit-averaged density bias against accelerometers should approach HASDM's
   published figures (§1) and beat JB2008 alone.

Alternatives considered: the SET HASDM product itself, licensed through the UDL
(C.6, commercial). ML surrogates of HASDM trained on the database (Licata et
al. 2022). Their training data are research-only, so the same commercial
restriction applies. NOAA WAM-IPE as the background model: public domain, but
not calibrated to drag.

The meta-processes behind this stand-in, and others, are in §7 (M.4).

## 3. Inventory

Columns: **Data**: what it is and its type. **Coverage**: objects or regime,
history, latency. **Access**: format and route. **Terms**: license or terms
clause, quoted where a page states one. **HAC role**: what it does for parity.

### A. Precise orbits (truth)

| # | Source | Data | Coverage | Access | Terms | Reproduce | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A.1 | IGS final / rapid / ultra-rapid (ESA, CODE, JPL and other ACs; MGEX) | GNSS precise orbits and clocks | GPS, GLONASS, Galileo, BeiDou, QZSS; 1994–; final ≈ 2 weeks, rapid ≈ 1 day, ultra-rapid real time + 48 h prediction | SP3. ESA navigation office HTTP, anonymous (listing verified); CDDIS (Earthdata Login); IGN, BKG and CODE did not answer | [IGS Terms of Use 2020][igs-tou]: "made openly available for use without restriction"; users "agree to appropriately cite and attribute" | Yes, with attribution ([terms](data-licenses.md#igs)); ESA/ESOC files also carry the [© ESA/ESOC mark](data-licenses.md#esa-navigation-office) | MEO truth (E1, E3) | AR (`reference-states/`: ESA0OPSFIN, IGS0OPSFIN, IGS0OPSULT), S |
| A.2 | ILRS analysis-center orbits (EDC, CDDIS) | SLR-derived precise orbits | LAGEOS-1/2, Etalon-1/2, LARES, LARES-2, Starlette, Stella, Larets, Ajisai, WESTPAC; weekly | SP3. [EDC](https://edc.dgfi.tum.de/pub/slr/products/orbits/) anonymous HTTPS/FTP | No license text on the [ILRS ToR][ilrs-tor] or the [EDC terms][edc-terms]; public archive; cite ILRS | Yes, with attribution ([terms](data-licenses.md#ilrs)), NSGF: yes ([terms](data-licenses.md#ilrs-nsgf)) | Physical truth (V1). The LEO spheres are ideal calibration objects (§2) | AR (`reference-states/products`: asi, bkg, cnes, dgfi, esa, gfz, ilrsa, nsgf) |
| A.3 | ILRS CPF predictions (EDC) | Operator- and center-issued predicted ephemerides | about 130 targets, including LEO (Swarm, GRACE-FO, Jason-3, Sentinel-6A/B, CryoSat-2, SARAL, SWOT, TSX/TDX, PAZ, HY-2B–E) and spheres; 2018–; daily | CPF v2. EDC anonymous | As A.2 | Yes, with attribution ([terms](data-licenses.md#ilrs)) | Benchmark of operator-grade predictions against truth | DL (Swarm A, Sentinel-6A, CryoSat-2, Starlette, 2025-10 to 2026-10), S (others) |
| A.4 | IDS DORIS: CNES SSALTO POE | DORIS+SLR(+GNSS) precise orbits | CryoSat-2, Jason-3, Sentinel-3A/B, Sentinel-6A/B, SARAL, SWOT, HY-2C/D; 2010–; POE-G standards since 2025; 10-day files appear a few weeks after the arc ends | SP3 (.Z). [IGN anonymous FTP](ftp://doris.ign.fr/pub/doris/products/orbits/ssa/) (verified); CDDIS (Earthdata Login) | No license text found on ids-doris.org; anonymous; cite IDS and CNES | No: cited only (no licence text found; E8 uses the SSALTO POE of CryoSat-2, SARAL, SWOT and Sentinel-3A as truth; not yet in [data-licenses.md](data-licenses.md)) | LEO drag-regime truth, 700–1340 km | DL (all ten satellites, files ending on or after 2025-10-01) |
| A.5 | Copernicus POD: Sentinel-1 | Precise orbit (POEORB) | S1A (to 2026-07), S1C, S1D; ≈ 20-day latency | EOF in zip. ESA STEP mirror anonymous; ASF requires Earthdata Login (HTTP 401, verified); CDSE requires an account | [Copernicus legal notice][cop]: "free, full and open access", including "(b) distribution" and "(d) adaptation, modification" | Yes, with attribution ([terms](data-licenses.md#copernicus-sentinel)) | LEO truth, 693 km SSO | DL (928 files 2025-10 to 2026-09); also partly AR (`reference-states/products`) |
| A.6 | Copernicus POD: Sentinel-2/3/6 auxiliary orbits | Precise orbits | S2A/B/C, S3A/B, S6A/B | Copernicus Data Space Ecosystem (free account) | As A.5 | Yes, with attribution ([terms](data-licenses.md#copernicus-sentinel)) | LEO truth (S3/S6 also via A.4) | L (CDSE account) |
| A.7 | ESA Swarm (Swarm DISC) | Reduced-dynamic (COM) and kinematic orbits; Level 2 | Swarm A, B (≈ 500 km), C; 2013–; ≈ 7-week latency (last file 2026-08-19) | SP3 in ZIP. [Swarm DISS](https://swarm-diss.eo.esa.int/) JSON listing API, anonymous | [ESA T&C][esa-tc] B.4: "authorised to duplicate data … for the performance of their work"; B.5: further distribution only to recipients who accept the T&C | No: cited only ([terms](data-licenses.md#esa-earth-observation)) | LEO drag truth near HASDM's busiest altitudes | DL (RD 2025-10 to 2026-08); partly AR |
| A.8 | GRACE-FO | GFZ Rapid Science Orbits; JPL Level-1B GNV1B | GRACE-FO C/D, ≈ 490 km; RSO 2021–; ≈ 1 day | RSO: SP3 via [GFZ ISDC](https://isdc-data.gfz.de/grace-fo/ORBIT/), anonymous HTTPS. L1B: PO.DAAC (Earthdata Login) | No license text found on isdc.gfz.de; cite GFZ ISDC. PO.DAAC: [Earthdata guidance][edg] | No: cited only (no licence text found; E8 uses the GRACE-FO RSO as truth; not yet in [data-licenses.md](data-licenses.md)) | LEO drag truth paired with D.6 accelerometer densities | DL (RSO L64/L65 2025-10 to 2026-10), L (L1B) |
| A.9 | TerraSAR-X / TanDEM-X | GFZ RSO | 514 km SSO | SP3 via GFZ ISDC `tsxtdx/ORBIT/L13`, `L20`, anonymous | As A.8 | Not assessed (not used) | LEO truth | DL (TerraSAR-X L13, partial; stopped at the 80 GiB disk floor), S (TanDEM-X L20) |
| A.10 | COSMIC-2 (UCAR CDAAC) | NRT LEO orbits (`leoOrb`) | Six satellites, ≈ 520–550 km, 24° inclination; 2019–; ≈ 1 day | SP3 in daily tar.gz. [data.cosmic.ucar.edu](https://data.cosmic.ucar.edu/gnss-ro/cosmic2/): "there is no need for a login" | Cite "UCAR COSMIC Program (2019) COSMIC-2 Data Products, doi:10.5065/T353-C093"; © UCAR | No: cited only (© UCAR, citation requested; E8 uses FM5 and FM6 `leoOrb` as truth; not yet in [data-licenses.md](data-licenses.md)) | Low-inclination LEO drag truth (NRT quality, roughly decimeters; not verified here) | DL (2025-10-01 to 2026-10-08) |
| A.11 | Spire GNSS-RO | Occultation data; POD not public | Spire constellation | NASA CSDA and GES DISC (L1B/L2 occultation; NASA-funded investigators); ESA Third Party Missions "Spire live and historical data" (project proposal) | Per program | No (program terms) | Orbits would be LEO truth, but none are released | X (orbits), L (RO data) |
| A.12 | ICESat-2 | Geolocated photons (ATL03); no separate public POD product in NASA CMR | 2018– | NSIDC (Earthdata Login) | [Earthdata guidance][edg] | Not assessed (not acquired) | Weak (orbit only implied by geolocation) | L |
| A.13 | Metop (EUMETSAT) | Orbit products not verified here | Metop-B/C | EUMETSAT Data Store (EO Portal account) | EUMETSAT data policy (not fetched) | Not assessed (not acquired) | LEO truth, 817 km | L |
| A.14 | CHAMP, GRACE, GOCE historical POD | PSO and RSO | CHAMP 2000–10, GRACE 2002–17, GOCE 2009–13 | GFZ ISDC `champ/ORBIT`, `grace/ORBIT`, `orbit/L..`, anonymous; GOCE PSO via ESA (EO sign-in) | As A.8; ESA T&C | Not assessed (not used); GOCE as A.7 | Truth paired with the historical HASDM densities (D.1–D.3) | S, L (GOCE) |
| A.15 | Jason-3 orbit information (NOAA NCEI) | Orbit products | 2015– | [NCEI accession 0122598](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.nodc:0122598), anonymous | NOAA, public domain | Not assessed (not acquired) | Second source for A.4 | S |
| A.16 | NASA SPDF SSCWeb | Definitive and predicted ephemerides of science missions | Dozens of missions | [sscweb.gsfc.nasa.gov](https://sscweb.gsfc.nasa.gov/), anonymous | NASA, public | Not assessed (not acquired) | Mostly HEO, which the HAC also covers | S |
| A.17 | CODE / IGN / BKG GNSS mirrors | Duplicates of A.1 | — | Did not answer from this host (timeouts) | IGS terms | As A.1 | Mirrors | U |
| A.18 | ESA mission ephemerides (ESOC flight dynamics) | — | — | No public channel found beyond A.5–A.7 | — | — | — | X |
| A.19 | SatNOGS telemetry GPS fixes (onboard GNSS state vectors in cubesat beacons) | Onboard GNSS position and velocity with a spacecraft time tag in telemetry frames. Confirmed for the Geoscan platform: packets 0x42BD (inertial) and 0x43BD (Earth-fixed), float32 m and m/s, 56 s apart in a pass. SPIRONE's beacon carries the fields empty (§7, M.15) | satnogs-decoders (commit 4e223eb, 2026-10-10): of 168 decoders, 24 expose a state vector and 11 only latitude and longitude (by field names, hand-checked), for 23 and 5 satellites in orbit. In 3 days (2026-10-07..09) 10 of 21 sampled state-vector satellites had frame-bearing observations (COSMO and GBSAT not sampled). Decoded: 239Alferov (NORAD 64881), RTU MIREA1 (61785), Colibri-S (61746), at 335–457 km | Frames: SatNOGS Network `demoddata` URLs (Wasabi S3), anonymous, minutes after the pass; decode with satnogs-decoders. Decoded values: DB `/api/telemetry/` answers HTTP 401 without a token and needs a satellite filter (checked 2026-10-10). The owner holds a token; not used here | DB About: "All data are public and freely distributed under the Creative Commons Atribution-Share Alike v4.0 license" ([page][satnogs]). satnogs-decoders: AGPL-3.0 | Yes, share-alike (CC BY-SA 4.0) ([terms](data-licenses.md#satnogs)); decoders are AGPL-3.0 code | Independent small-LEO states without a login. Fix accuracy not measured; consecutive fixes imply time-tag errors of 4–172 ms (§7, M.15) | S (frames), L (decoded values) |

### B. Operator ephemerides and broadcast orbits

| # | Source | Data | Coverage | Access | Terms | Reproduce | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B.1 | Starlink public ephemerides | Predicted ephemeris with covariance (3 days at 60 s; UVW 6×6 lower triangle; `ephemeris_source:blend`) | about 11,130 satellites; snapshots only, no history | MEME text, [api.starlink.com manifest](https://api.starlink.com/public-files/ephemerides/MANIFEST.txt), anonymous; ≈ 2 MB per satellite, ≈ 22 GB per snapshot | No license in the manifest or files | No: cited only ([terms](data-licenses.md#spacex-starlink)) | The largest public set of operator ephemerides with covariance: SP-like truth and covariance realism for the dominant LEO population | DL (sample: manifest and 25 files), S (must be archived going forward) |
| B.2 | Planet Labs public ephemerides | TLEs, state vectors with a fitted drag ballistic coefficient, 5-day OEMs, NORAD↔HWID matches | Planet fleet (operational satellites only); daily history files | Text, [ephemerides.planet-labs.com](https://ephemerides.planet-labs.com/), anonymous | "licensed under CC BY-NC 4.0"; commercial redistribution by permission | Non-commercial only ([terms](data-licenses.md#planet)) | Operator states and B for the 122 satellites Planet lists as operational | DL (2025-10-01 to 2026-10-09 history, current files) |
| B.3 | ISS OEM (NASA) | Predicted OEM | ISS | [nasa-public-data S3](https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt), anonymous | US Government work | Yes, with attribution ([terms](data-licenses.md#nasa-iss-oem)) | High-drag reference with frequent reboosts | DL (current) |
| B.4 | CelesTrak SupGP | GP fitted to operator ephemerides (Starlink, OneWeb, Planet, Intelsat, SES, Telesat, GPS, others) | Per operator | celestrak.org | CelesTrak access is authorized by the owner's arrangement | No: cited only ([terms](data-licenses.md#celestrak)) | Operator-quality GP, used by E3 | U (TCP timeouts all day; E3's 15:51Z capture failed the same way) |
| B.5 | OneWeb, Intelsat, SES, Telesat | Operator ephemerides | — | Corrected 2026-10-10: OneWeb (B.14), Intelsat (B.12) and SES (B.13) have public pages. Telesat publishes box-centre longitude and latitude only and EUMETSAT element sets only (E4 `config.json`). All four also reach the public through B.4 | — | No: cited only ([terms](data-licenses.md#intelsat)), SES no ([terms](data-licenses.md#ses)) | Through B.4 and B.12–B.14 | S (see B.12–B.14) |
| B.6 | GNSS broadcast ephemerides (IGS BRDC) | Broadcast navigation messages | All GNSS | CDDIS (Earthdata Login); BKG did not answer | IGS terms | Yes, IGS terms (not acquired) | The GNSS operators' own orbits, and a baseline for A.1 | L, U |
| B.7 | Space-Track owner/operator ephemerides | O/O-submitted ephemerides | Registered operators | Space-Track (operator role) | Space-Track user agreement | No (Space-Track user agreement) | Operator truth | L |
| B.8 | COMSPOC Spacebook | XP-TLEs, synthetic covariance, reference ephemerides, historical ephemerides, space weather, EOP | Full catalog | [spacebook.com](https://spacebook.com/) API (paths found in the app bundle), anonymous | [COMSPOC ToU][comspoc]: content "may not be (i) used for Your commercial use … (iii) distributed to non-licensed users, (iv) … used to make derivative works" | No (COMSPOC terms of use) | Strong comparison set, but not usable in products | R (not mirrored) |
| B.9 | JPL Horizons | Spacecraft and natural-body ephemerides | Mostly deep space | API, anonymous | NASA/JPL | Not assessed (not used) | Minor | S |
| B.10 | TraCSS CA verification test set | Ephemerides, CDM answer keys | Synthetic and operational catalog | Google Drive links from [space.commerce.gov](https://space.commerce.gov/dataset-for-conjunction-assessment-verification/) | "full and open basis … (CC0-1.0)" ([user's guide][tracss-guide]) | Yes (CC0 1.0) ([terms](data-licenses.md#tracss-ivv)) | Screening and covariance-handling check | S |
| B.11 | Space-Track Public Files (`publicfiles` controller) | Operator-posted ephemeris and maneuver archives: `dirs`, `files`, `download` and `loadpublicdata` (source, type "Ephemeris", "Maneuver", "MIXED" or "OTHER", date, short-lived link, size); large sets split into parts | Owner's archiver listing, 2026-10-10 19:12Z (needs a login; not repeated here): directories `public-data-files-*-nasajsc-prod` (3), `public-data-files-24206-kuiper-prod` and `public-data-files-552-spacex-prod` (legacy: SpaceX left Space-Track's public files on 2025-07-28 and publishes at B.1). `loadpublicdata` listed only NASA-JSC: 2 Ephemeris files and 1 ReadMe. OneWeb, Iridium, Telesat, Orbcomm, AST, EUMETSAT and SES have no directory, which does not match the E11 and E12 plans. B.4 names OneWeb, SES and Telesat among CelesTrak's SupGP operators (not fetched); Iridium, Orbcomm, AST and EUMETSAT are not named there | Space-Track account: "Anyone with a space-track account can download these files". Limit as stated: "Public Files 3 / day … Once every 8 hours. Moderate your activity; do not download more than 10 files per 15 minutes" ([documentation][st], logged-in page, 2026-10-10). At 40 files an hour, one file per satellite for 11,000 satellites takes about 11 days a sweep: fleet-scale capture works only from archives posted as a few multi-part files; Starlink stays on B.1 | Space-Track user agreement; no per-operator terms on the page | No (Space-Track user agreement) | NASA-JSC files are probably the ISS ephemeris of B.3 (not compared). Kuiper's directory exists; its contents were not listed | L (Space-Track account) |
| B.12 | Intelsat public ephemerides (MyIntelsat) | GEO ephemerides in Earth-fixed axes ("ECF") and "Center of Box" longitudes, with maneuver updates | E4 scored 83 files of 41 satellites; E12 reads 9 days at 1800 s, no creation time stated | HTTPS, anonymous: [my.intelsat.com/ephemeris/public](https://my.intelsat.com/ephemeris/public) (2026-10-10). Weekly sets, "usually on Thursday and Friday", valid seven days from a Saturday or Sunday epoch; "typically one to three" maneuver messages a month | "© 2026 SES S.A. All rights reserved"; no licence ([terms](data-licenses.md#intelsat)) | No: cited only | GEO operator states (E4: SGP4 4.79 km at the first horizon, 7.89 km at 24 h); test case for SGP4-XP fits (§7, M.13) | S (E4 read them; raw copies not kept) |
| B.13 | SES eleven-parameter ephemerides (IESS-412, "I11") | Compact GEO ephemerides, weekly sets | E4 A4 captured 38 files | SES and Intelsat ephemeris pages, anonymous | "© 2026 SES S.A. All rights reserved" ([terms](data-licenses.md#ses)) | No: cited only | GEO states once an I11 evaluator exists (modules main has none) | S |
| B.14 | Eutelsat OneWeb ephemerides (LTEF) | Numeric rows in one CSV (format not decoded here) | One file, 44,975 bytes, last modified 2026-10-10 16:45 GMT | HTTPS, anonymous: [ephemeris.oneweb.net/ltef/ltef.csv](https://ephemeris.oneweb.net/ltef/ltef.csv) (range request, 2026-10-10); cadence not stated | No terms found; oneweb.net redirects to eutelsat.com ([terms](data-licenses.md#oneweb)) | No: cited only | A LEO operator route outside B.1; no module reads LTEF (E4: not compared) | S |
| B.15 | China Manned Space Engineering Office: Tiangong orbit data | OEM predictions for the station modules (E12: 7 days at 240 s, EME2000, UTC) | Tianhe; E4 scored 7 files | cmse.gov.cn orbit notices; E4 read them through the css-tiangong provider node | "All rights reserved" (site footer) ([terms](data-licenses.md#cmsa-tiangong)) | No: cited only | A second crewed-station ephemeris beside B.3 (E4: SGP4 0.67 km at the first horizon, 20.0 km at 72 h) | S |

### C. Catalogs and observations

| # | Source | Data | Coverage | Access | Terms | Reproduce | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C.1 | Space-Track GP, GP history, SATCAT, decay, TIP | GP element sets (OMM), catalog | Full public catalog; 1959– | Owner's account; archiver at `/opt/data/sdn-archive/spacetrack/` | [Space-Track documentation][st]: "express blanket approval for transfer/redistribution of basic SSA data … conditioned on appropriate citation" (TLE/OMM, SATCAT, decay/reentry) | No: cited only (repository rule; the terms allow basic SSA data with citation) ([terms](data-licenses.md#space-track)) | The observation backbone: GP-derived states, the bulk calibration set (§2), maneuver detection | AR, L |
| C.2 | Space-Track CDMs | Conjunction data messages with ASW covariances | Full CDMs for an operator's own objects (Space-Track's documentation lists CDM download limits; a reduced public class was not checked here) | Operator registration | Space-Track user agreement (CDMs are not "basic SSA data") | No (Space-Track user agreement) | The only routine public sight of HAC covariances | L (owner-operator role) |
| C.3 | Space-Track advanced services (ODR) | SP state vectors and other products | On approved request | Orbital Data Request; SSA sharing agreement | Per agreement | No (agreement) | The HAC itself, object by object | L (SSA sharing agreement) |
| C.4 | TraCSS (Office of Space Commerce) | Screening service; open-data catalogs announced (C.21) | Registered operators | [Operator registration](https://space.commerce.gov/traffic-coordination-system-for-space-tracss/tracss-registration-for-spacecraft-operators/) | TraCSS User Agreement & Data Policy | No (registration) | Runs on the DoD SP catalog with covariance ([AMOS 2024][amos24]) | L |
| C.5 | EU SST service portal | CA, fragmentation and re-entry services | Registered operators | [portal.eusst.eu](https://portal.eusst.eu/) | EU SST terms | No (EU SST terms) | European catalog products; screens against the HAC | L |
| C.6 | Unified Data Library (UDL) | DoD data lake: observations, states, SET real-time space weather and JB2008/HASDM products | — | API returns "Invalid or missing user credentials" (verified). Government sponsorship or a commercial license | SET: real-time inputs and product files "are available via licensed access to the Unified Data Library" (JB2008 code README) | No (licensed) | The real-time HASDM inputs | L, P |
| C.7 | SatNOGS DB and Network | Observations: metadata (station position, transmitter, the element set the station tuned with), PNG waterfalls, demodulated data, audio; transmitter DB; HDF5 waterfall artifacts | Amateur and cubesat LEO; ISS ≈ 70–250 observations a day | Network API anonymous ([network](https://network.satnogs.org/api/observations/)); an anonymous client is throttled after ≈ 100 requests (HTTP 429, `Retry-After` up to 47 min); waterfalls on Wasabi S3, anonymous; DB artifacts (HDF5 waterfalls with timestamps) need a db.satnogs.org API token. Latency: minutes after the pass | "freely distributed under the Creative Commons Atribution-Share Alike v4.0 license" ([about][satnogs]) | Yes, share-alike (CC BY-SA 4.0) ([terms](data-licenses.md#satnogs)) | Independent Doppler for OD of small LEO objects; E6 reduces waterfalls to range rates (`experiments/e6-public-observations`) | DL (ISS metadata 08-31..10-09, waterfalls), L (artifacts) |
| C.8 | Amateur optical (SeeSat-L, IOD; STVID-calibrated reports) | Positional observations (IOD, UK, RDE formats) and observers' stated station coordinates; STVID (github.com/cbassa/stvid, GPL-3.0) is the camera software several observers use | ≈ 8,000 IOD lines a quarter on ≈ 1,000 objects, mostly rocket bodies and classified payloads; few objects with public truth (2026-06..10: CryoSat-2 9 lines, Jason-3 3) | [satobs.org/seesat](https://www.satobs.org/seesat/) monthly hypermail archives, anonymous with an identifying user agent (a browser-like agent got HTTP 412 earlier); the McCants page is gone (404). Latency: hours to a day | Public list; no license stated (observations are each observer's) | No: cited only ([terms](data-licenses.md#seesat-l)) | Objects missing from public GP; anchors where truth exists | DL, X (McCants) |
| C.9 | Minor Planet Center and survey streaks | Optical astrometry | Artificial-object reports are incidental | [minorplanetcenter.net](https://www.minorplanetcenter.net/) | MPC terms (not fetched) | Not assessed (not acquired) | Negligible | S |
| C.10 | ESA DISCOS | Object physical and mission data | Full catalog | DISCOSweb redirects to the ESA Space Debris User Account sign-in | ESA terms on registration | Not assessed (not acquired) | Physical properties (G) | L (ESA SDO account) |
| C.11 | LeoLabs | Radar observations, states, CDMs | LEO | platform.leolabs.space (OAuth sign-in) | Commercial | No (commercial) | Independent LEO radar truth | P |
| C.12 | ExoAnalytic (now Anduril) | GEO optical | GEO | exoanalytic.com redirects to anduril.com/space | Commercial | No (commercial) | GEO truth | P |
| C.13 | Slingshot Aerospace | Optical observations, catalog | — | slingshot.space | Commercial | No (commercial) | — | P |
| C.14 | COMSPOC (commercial catalog) | Commercial SSA | — | comspoc.com | Commercial | No (commercial) | — | P |
| C.15 | ESA public SST material | Space Environment Report, re-entry predictions | — | esa.int | ESA | Not assessed (not acquired) | Context only | S |
| C.16 | CAMRAS Dwingeloo SatNOGS IQ archive | Raw IQ recordings (48 kHz, 16-bit complex) of the Dwingeloo 25 m telescope's SatNOGS observations, for STRF (github.com/cbassa/strf, GPL-3.0) Doppler extraction | 469 recordings 2022-01..2026-08-23, mostly cubesats (URESAT-1, FOX-1E, RSP-03); no object with public truth in 2026 | [data.camras.nl/satnogs](https://data.camras.nl/satnogs/), anonymous; ≈ 100 MB per pass | "distributed under a CC-BY 4.0 license" (archive page) | Yes, with attribution (CC BY 4.0) ([terms](data-licenses.md#camras)) | High-SNR Doppler when a covered object has truth | S |
| C.17 | ILRS normal points (CRD v2) | Laser-ranging normal points: two-way flight times, met data, system configuration | ≈ 130 SLR targets; e.g. Starlette ≈ 800–960 passes a month (2026-06..08) | EDC (DGFI-TUM) [npt_crd_v2](https://edc.dgfi.tum.de/pub/slr/data/npt_crd_v2/) monthly and daily files, anonymous HTTPS (the v1 `npt_crd` directory holds only stations still sending v1; a missing file returns an HTML page with status 200); CDDIS needs Earthdata Login. Latency: hours to a day | [ILRS terms of reference][ilrs-tor], [EDC terms][edc-terms]: free use with acknowledgement | Yes, with attribution ([terms](data-licenses.md#ilrs)) | Precise ranges for anchored fits of cooperative targets (E6 laser arm) | DL (Starlette, Stella, LARETS, WESTPAC, LARES 2026-06..08) |
| C.18 | Space-Track `cdm_public` | Publicly available conjunction data, "a subset" of the CCSDS 508.0-B-1 fields; `CREATED` is the 18 SDS generation time, `TCA` the predicted time of closest approach. Field list not retrieved (the model definition needs a login) | "Space-Track does not provide historical CDMs older than what is shown on the website" | Space-Track account, REST. Limits as stated: "CDM 3 / day … Once every 8 hours for all constellation Conjunction Data Messages (CDM)"; "CDM 1 / hour" for one conjunction event ([documentation][st], 2026-10-10) | Space-Track user agreement. CDMs are not "basic SSA data" (C.2); the page does not say whether this class is | No (Space-Track user agreement) | The only HAC-side conjunction figures without an operator role: miss distance and TCA to compare with our screening (§7, M.11) | L |
| C.19 | Space-Track `decay` and `tip` classes | `decay`: PRECEDENCE 4 = 60-day decay message, 3 = Tracking and Impact Prediction (TIP) message, 2 = decay message, 1 = SATCAT decay date. `tip`: MSG_EPOCH, INSERT_EPOCH, DECAY_EPOCH, WINDOW (about 95 %, ± minutes), REV, LAT, LON, INCL, NEXT_REPORT, HIGH_INTEREST | TIP is "nominally distributed at daily intervals beginning four days prior to selected object's decay and several times during the final 24 hours in orbit" | Space-Track account. Limits as stated: TIP 1 / hour (`/INSERT_EPOCH/>now-0.042/`); DECAY 1 / day; 60-DAY DECAY 1 / week, Wednesdays after 1700 UTC ([documentation][st]) | As C.1, whose clause names decay/reentry data (TIP is not named): redistribution with citation | No: cited only (as C.1) | Cumulative-drag constraints at 120–250 km, where little else exists (§7, M.9) | L (not archived; SATCAT's DECAY dates are) |
| C.20 | SatNOGS DB artifacts (HDF5 waterfalls) and the waterfall PNG headers | Artifact version 2: a `waterfall` group with 8-bit `data` (per-channel offset and scale), `frequency` (kHz), `relative_time` (sample-clock row spacing) and `absolute_time` (host wall-clock microseconds since `start_time`, labelled "seconds" in the attributes). The PNGs carry the same header as text chunks `satnogs:wf-dat` and `satnogs:wf-plot` | ISS waterfalls: 1,024 channels at 48,000, 57,600 or 66,560 samples/s, so 46.9–65.0 Hz bins and a row every 0.083–0.092 s. The PNG gives ≈ 0.3 s a row and ≈ 77 Hz a pixel (E6). 1,164 of the 1,853 PNGs in E6's archive (63 %) carry the header, with a microsecond `timestamp` | Artifacts: DB `/api/artifacts/` answers HTTP 401 without a token (2026-10-10); filter `network_obs_id`. PNG headers: anonymous. Read from satnogs-client `artifacts.py`, `waterfall.py` and gr-satnogs `waterfall_sink` | As A.19 (CC BY-SA 4.0) | Yes, share-alike ([terms](data-licenses.md#satnogs)) | 1.2–1.6 times finer than the PNG in frequency, on the same station clock: `start_time` is `system_clock::now()` at flowgraph start ("start_time is not equal to observation start time", the client's comment). The PNG header is the cheap retest of E6 (§7, M.14) | DL (PNG headers), L (artifacts) |
| C.21 | TraCSS data products (Office of Space Commerce) | Announced as open data (CC0 1.0, no account): TraCSS Cat (G.7), the DoD public element-set catalog with OMMs, a "TraCSS-generated special perturbation (SP) ephemerides catalog without covariance", operator ephemerides with covariance and maneuver plans (OCM), conjunction notifications for alertable events, break-up notifications. Registered users also get full CDMs for their own spacecraft, TIPs, a contact directory and ephemeris upload | Pilot: 82 organisations and 10 national-government accounts (landing page, August 2026), ≈ 11,367 satellites (slides, 2026-09-23); screening every four hours | Public data "Coming Soon" in the August 2026 overview; no later announcement through 7 Oct 2026 on OSC's TraCSS page. Registration at app.tracss.gov for operators of operational satellites and national governments; a government account is read-only and sees affiliated operators' ephemerides and full CDMs; third parties join as sub-users. Specifications republished 22 Jan 2026: Cat (SPEC-003 v2.0.5), OMM (SPEC-004 v1.2), OCM (SE-SPEC-002 v2.1), CDM (SPEC-001 v2.1) | [Data and Information Policy and User Agreement](https://space.commerce.gov/wp-content/uploads/2025/08/TraCSS-Data-and-Information-Policy-and-User-Agreement-08132025-2.pdf) (13 Aug 2025): open data CC0 1.0; CDMs only to the spacecraft's operator, redistributable only to contracted entities, derived products allowed; "as is". Pilot data "for Evaluation Purposes Only" | CC0 data: yes, once published. CDMs: no | If the public SP catalog goes live independent of the GP catalog, it is the closest public thing to HAC states (no covariance). The OCM profile carries wet mass, model names, maneuver times and OD spans (§7, M.20) | L (pilot), X (public data until released) |
| C.22 | Mini-MegaTORTORA (MMT-9) satellite photometry database | Photometry of TLE-identified satellites: standard magnitude (phase 90°, 1000 km), variability class and period; per track the distance and phase angle (computed from the TLE). No astrometry | 21,916 satellites, 634,469 tracks, 2014-06-04 to 2026-10-05 (page of 2026-10-10); Russian (CIS) satellites hidden. Nine channels, 0.1 s exposures, 9 × 11° and 16″ a pixel each, at 41°25′53.3″ E, 43°38′59.5″ N, 2030 m | mmt.favor2.info/satellites, anonymous: the list loads; satellite and track pages returned HTTP 403 to a script. A bulk dump (www.sao.ru/lynx/karpov/satellites/) holds files of 2017-10-23 and 78-byte placeholders of 2020-03-10. Live latency ≈ 5 days | "The data are publicly available, but if you wish to use it in your research - please contact us"; cite Karpov et al. 2016 and Beskin et al. 2017 | No: cited only (no licence; contact required) | Light-curve periods and magnitudes for spin state and mean cross-section of rocket bodies and debris (§7, M.19). Astrometric accuracy not published; not a position source | S (list page only) |

### D. Density and its calibration

| # | Source | Data | Coverage | Access | Terms | Reproduce | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D.1 | SET HASDM density database | HASDM (HASDM1, J70-based) neutral density | 2000–2019, and 2020–2025 (new release); 3 h; 175–825 km every 25 km; 15° × 10° | "HASDM Database API", sign-in at login.spacenvironment.net (free [registration](https://login.spacenvironment.net/register)) | [spacewx.com/hasdm][set-hasdm]: "free of charge to the international science community for research purposes only. Commercial uses are permitted only through an explicit agreement with SET." | No (research use only) | The target atmosphere: trains and scores the open DCA | L (SET account; research only) |
| D.2 | Zenodo 4602380 (Licata et al. 2021) | CHAMP (10 s) and GRACE-A (5 s) accelerometer densities (Mehta et al. 2017), with HASDM and JB2008 interpolated along track | Both missions, within HASDM's 2000–2019 span; 3.3 GB | [zenodo.org/records/4602380](https://zenodo.org/records/4602380) | CC BY 4.0 | Yes, with attribution (CC BY 4.0) ([terms](data-licenses.md#zenodo-licata-hasdm)) | Public HASDM along real orbits | S (another lane is downloading it to `hac/zenodo-4602380-licata-hasdm/`) |
| D.3 | Zenodo 5177065 (Weimer et al. 2021) | HASDM, NRLMSIS 2.0 and EXTEMPLAR global-mean density at 200, 300, 400, 600 and 800 km | 2000–2019, 3 h; HDF5 | [zenodo.org/records/5177065](https://zenodo.org/records/5177065) | CC BY 4.0 | Not assessed (not used) (CC BY 4.0 per the record) | HASDM global-mean truth at five shells | DL |
| D.4 | TU Delft thermosphere data | Accelerometer- and GPS-derived density and wind: CHAMP, GRACE, GRACE-FO, Swarm, GOCE | 2000– | thermosphere.tudelft.nl (TCP timeout from this host) | — | Not assessed (not acquired) | Density truth | U (Swarm and GRACE-FO products arrive through D.5 and D.6) |
| D.5 | Swarm DNS (Swarm DISC; TU Delft processing) | DNSxPOD (GPS-derived) and DNSCACC (Swarm C accelerometer) density | A, B, C; 2014–; POD to 2026-07-31, ACC to 2025-11-30 | CDF in ZIP, anonymous | ESA T&C (A.7) | No: cited only ([terms](data-licenses.md#esa-earth-observation)) | Density truth over the study window | DL (2025-10 to 2026-07); also downloaded by another lane |
| D.6 | GRACE-FO DNS1ACC (TOLEOS, on Swarm DISC) | Accelerometer density | GRACE-FO 1; 2018–19 and 2025-01 to 2026-04 | CDF, anonymous | ESA T&C | No: cited only ([terms](data-licenses.md#esa-earth-observation)) | Density truth at ≈ 490 km | DL (2025-10 to 2026-04); also downloaded by another lane |
| D.7 | NOAA WAM-IPE (operational) | Whole-atmosphere physics model: nowcast (`wrs`) and forecast (`wfs`), fixed-height neutral fields every 10 min | 2023-07– | netCDF on AWS NODD (`noaa-nws-wam-ipe-pds`), anonymous; ≈ 3 MB per step (≈ 157 GB per year) | "open to the public and can be used as desired" ([registry][wam]) | Not assessed (not used) | Physics cross-check of the open DCA; an independent forecast | DL (hourly sample for 2026-01-01), S |
| D.8 | NRLMSIS 2.0 / 2.1 | Empirical model code | — | NRL host has no DNS record; pymsis downloads the source | [MSIS2 license][msis2]: "academic, non-commercial, purposes only … shall not … make any modification or improvement" | No (academic, non-commercial only) | Reference model for studies only | R |
| D.9 | DTM2020 (with MCM, SWAMI) | Empirical model code (operational and research versions) | — | [github.com/swami-h2020-eu/mcm](https://github.com/swami-h2020-eu/mcm); swami-h2020.eu did not answer | [License][dtm]: "academic, non-commercial, purposes only … shall not … make any modification", "disseminate it" | No (academic, non-commercial only) | EU SST's model ([AMOS 2024][amos24]); study comparison only | R |
| D.10 | NRLMSISE-00, Jacchia-Roberts, JB2008 | Models already in HPOP | — | — | — | — | The base models; the open DCA corrects JB2008 | AR (in `propagator/hpop`) |
| D.11 | TLE-derived densities | Method: Picone et al. 2005 ([doi:10.1029/2004JA010585][picone]); Emmert 2009 global averages ([doi:10.1029/2009JA014102][emmert]); Doornbos et al. calibration with TLEs ([doi:10.1016/j.asr.2006.12.025][doornbos]) | Any object with GP history | Rebuilt from C.1 | As C.1 | — | Inputs for the bulk calibration tier | S (method; Emmert's dataset not located) |
| D.12 | NASA CCMC | Runs on Request for hosted physics models (model list not checked here); ISWA | — | [ROR](https://ccmc.gsfc.nasa.gov/tools/runs-on-request/): name and e-mail on submission; outputs public | CCMC publication policy | Not assessed (not acquired) | Physics cross-checks for storm cases | S |
| D.13 | ESA SWE portal | Space weather products and archives | — | [swe.ssa.esa.int](https://swe.ssa.esa.int/): "register as a user" for the full range | ESA | Not assessed (not acquired) | Secondary | L (ESA SWE account) |
| D.14 | Element-set density estimation: Gondelach and Linares 2020 ([doi:10.1029/2019SW002356][gondelach]; arXiv:1910.00695) and its code DESTOPy | Density, orbits and ballistic coefficients estimated jointly from element-set histories (UKF, a reduced-order density model); validated against CHAMP and GRACE | Any object with GP history; zero latency beyond the element sets | [github.com/pengmun/DESTOPy](https://github.com/pengmun/DESTOPy), anonymous | Code: MIT. Element sets as C.1 | Code: yes, with its MIT notice (E8's changes in `results/e8/destopy`); the densities it estimates derive from element sets and are cited only | The method behind E8's zero-latency calibration (decay of catalogued objects); DESTOPy is E8's external cross-check | DL (E8 ran it locally, outside the product path) |
| D.15 | Ephemeris-based density from Starlink: Ou et al. 2025 ([doi][ou25]); Yamamoto 2026 ([doi][yam26]) | Density from the mechanical-energy loss of satellites in SpaceX's public ephemerides (Ou: all satellites; Yamamoto: ≈ 1,200 satellites at 482 km and 53°, spherical harmonics for the diurnal variation, one 60-km scale height) | Starlink fleet; Yamamoto 2025-09-01..07; Ou: lag at most 8 h | Method, with B.1 as input | Published papers; only abstracts read (Springer served a script page, MDPI blocked a script) | Methods only | Density 0.6–1.2 of Swarm, mean 0.95 over 19 cases (Yamamoto); the density in the files is SpaceX's model updated with data (§7, M.18) | S (method; inputs B.1) |

### E. Space weather indices and forecasts

| # | Source | Data | Coverage | Access | Terms | Reproduce | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E.1 | SET JB2008 indices | SOLFSMY (F10, S10, M10, Y10 and 81-day means), SOLRESAP (3-h ap), DSTFILE (hourly Dst), DTCFILE (hourly ΔTc); JB2008 code and validation set | 1997–; **45-day lag** (latest 2026-08-25). Real time only through the UDL | Text, anonymous HTTPS | No license on [the page][set-jb]; code README: "Copyright, 2008, Space Environment Technologies" | No: cited only ([terms](data-licenses.md#set-jb2008)) | Exact JBH09 base-model drivers | DL |
| E.2 | NOAA SWPC | F10.7, Kp/Ap, Kyoto Dst, solar-cycle series; 3-day, 27-day and 45-day forecasts; warehouse archive since 1996 (RSGA 3-day F10.7/Ap forecasts, GEOA, SGAS, SRS, yearly DGD/DSD) | 1996– | Text, JSON, FTP, anonymous | [NWS disclaimer][nws]: "in the public domain … may be used without charge for any lawful purpose" | Yes, public domain ([terms](data-licenses.md#noaa-swpc)) | Observed indices, plus the forecasts that were actually issued (for realistic prediction tests) | DL (warehouse 2024–2026, quarterly indices, current products) |
| E.3 | GFZ Kp, ap, Ap, SN, F10.7 | Definitive and nowcast geomagnetic and solar indices | 1932– | Text, anonymous | [doi:10.5880/Kp.0001][kp]: CC BY 4.0; the combined file's sunspot numbers (WDC-SILSO) are CC BY-NC 4.0 | Non-commercial only (sunspot numbers CC BY-NC 4.0) ([terms](data-licenses.md#gfz-kp)) | Geomagnetic driver; the definitive Kp standard | DL |
| E.4 | GFZ Hp30/Hp60, ap30/ap60 | Half-hourly and hourly geomagnetic indices | 1985– | Text, anonymous | [doi:10.5880/HPO.0003][hpo]: CC BY 4.0 | Not assessed (not used) (CC BY 4.0 per the DOI) | Storm-time resolution (DTM2020 research uses Hp60) | DL |
| E.5 | CelesTrak SW-All / EOP-All | Merged, gap-filled indices with predictions | 1957– | celestrak.org | As B.4 | No: cited only ([terms](data-licenses.md#celestrak)) | Convenience merge | U |
| E.6 | NASA OMNIWeb | Solar wind and indices | 1963– | [omniweb.gsfc.nasa.gov](https://omniweb.gsfc.nasa.gov/), anonymous | NASA | Not assessed (not acquired) | Storm drivers | S |
| E.7 | NOAA NCEI Penticton F10.7 | Observed and adjusted flux | 1947– | [NCEI directory](https://www.ngdc.noaa.gov/stp/space-weather/solar-data/solar-features/solar-radio/noontime-flux/penticton/), anonymous | NOAA, public domain | Not assessed (not acquired) | F10.7 source of record | S |

### F. EOP, gravity, tides, planetary ephemerides

| # | Source | Data | Coverage | Access | Terms | Reproduce | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F.1 | IERS EOP | EOP 20 C04 (v4, ITRF2020), finals2000A, Bulletins A and B | 1962–, with predictions | Text, [datacenter.iers.org](https://datacenter.iers.org/) and [hpiers.obspm.fr](https://hpiers.obspm.fr/iers/eop/eopc04/), anonymous; USNO maia has no DNS record | The [IERS legal page][iers] states no data license; cite IERS | Yes, with attribution ([terms](data-licenses.md#iers)) | Frames for every comparison | DL |
| F.2 | ICGEM gravity models | EGM2008, EIGEN-6C4, GOCO06s, EGM96 (gfc) | Static fields | [icgem.gfz.de](https://icgem.gfz.de/tom_longtime), anonymous | EIGEN-6C4 (doi:10.5880/icgem.2015.1) and GOCO06s (doi:10.5880/ICGEM.2019.002): CC BY 4.0 (DataCite); EGM2008 and EGM96 are US-government models; cite [Ince et al. 2019][icgem] | Yes: EGM2008 and EGM96 are U.S. Government models ([terms](data-licenses.md#egm)); EIGEN-6C4 and GOCO06s CC BY 4.0 per their DOIs | HPOP embeds EGM96 and EGM2008 to degree 70. These files allow higher degree and model-difference studies | DL |
| F.3 | IERS Conventions 2010, chapter 6 files | FES2004 ocean-tide coefficients (`fes2004_Cnm-Snm.dat`), Desai ocean pole tide | — | [iers-conventions.obspm.fr](https://iers-conventions.obspm.fr/content/chapter6/additional_info/), anonymous | Published with IERS TN 36; cite Petit & Luzum 2010 | No: not reproduced (no terms found) ([terms](data-licenses.md#fes2004)) | Ocean tides for HPOP (not yet modeled) | DL |
| F.4 | FES2014b / FES2022b (AVISO) | Ocean tide model | Global grids | Authenticated AVISO FTP ([registration](https://www.aviso.altimetry.fr/en/data/data-access/registration-form.html)) | FES2014: "delivered for all purposes (scientific, commercial,...)"; FES2022: "available for all uses" ([page][fes]) | Not assessed (not acquired) | A newer ocean-tide model than F.3 | L (AVISO account) |
| F.5 | TPXO10 (OSU) | Ocean tide model | Global | Registration | "available for academic research, and other non-commercial uses and require registration"; commercial license separate ([tpxo.net][tpxo]) | No (non-commercial, registration) | Alternative to F.4 | L |
| F.6 | JPL DE440/DE441 | Planetary ephemerides | 1550–2650 (DE440) | [ssd.jpl.nasa.gov/ftp/eph/planets/bsp](https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/), anonymous | NASA/JPL | Yes, unmodified or naming the modifier ([terms](data-licenses.md#jpl-de440)) | Third-body forces | AR (DE440 embedded in HPOP) |
| F.7 | IGS ANTEX (igs20.atx) | GNSS antenna phase-center offsets | All GNSS | files.igs.org, anonymous | IGS terms | Yes, IGS terms | Center-of-mass vs antenna for GNSS truth | DL |
| F.8 | ILRS station coordinates (weekly combination) | SINEX `ilrsa.pos+eop` (station positions, XYZ eccentricities, EOP); weekly | Stations in the week's LAGEOS/Etalon solution (≈ 20) | EDC [products/pos+eop/weekly](https://edc.dgfi.tum.de/pub/slr/products/pos+eop/weekly/), anonymous. Latency: ≈ 1–2 weeks | [ILRS terms][ilrs-tor] | Yes, with attribution ([terms](data-licenses.md#ilrs)) | SLR station positions for range modelling | DL (2026-06-27..08-29) |
| F.9 | USSF Sgp4Prop WebAssembly v9.1.1.0 (SGP4 and SGP4-XP builds) | `Sgp4Prop.wasm` and `Sgp4Prop.xp.wasm` with loaders, interface documentation and release notes (zip dated 2023-12-20, 362,762 bytes). XP element sets are ephemeris type 4 ([payne22]) | Space-Track's public GP has no XP sets: all 32,586 records of the 2026-10-09 snapshot are `MEAN_ELEMENT_THEORY` SGP4 with `EPHEMERIS_TYPE` 0 | Space-Track documentation page, logged-in (downloaded 2026-10-10, SGP4 file ID 19505655), in `/opt/data/sdn-archive/spacetrack/documents/` | "US Space Force (USSF) Open Source Agreement for SGP4": use, distribution, reproduction, redistribution and display; binaries may be redistributed if the copyright notice, conditions and disclaimer are reproduced and the agreement accompanies each copy; no endorsement; export notice. Stated purpose: "to be used solely for the purpose of propagating 18 SDS created TLEs", not state vectors from VCMs or CDMs. §1.L defines "Use" as "for any purpose", so the clauses pull apart; the text names SGP4 V7.7, not v9.1 | Binary form with the agreement and notice. The purpose clause is for the owner to read against fitting our own XP sets (§7, M.13). Not yet in data-licenses.md | XP fits to precise orbits and operator ephemerides at MEO and GEO (§7, M.13) | DL, L |
| F.10 | USSF Sgp4Prop v9.9 | Listed as "Sgp4Prop_v9.9.zip" (file ID 49349150) beside the WASM package; contents not examined | — | Same page, logged-in; not downloaded | The page shows one agreement for SGP4 | — | Possibly a newer build than v9.1.1.0 | L |

### G. Physical properties

| # | Source | Data | Coverage | Access | Terms | Reproduce | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G.1 | ESA DISCOS | Mass, dimensions, shape, mission | Full catalog | ESA SDO account (C.10) | ESA | Not assessed (not acquired) | Area/mass priors for B and AGOM | L |
| G.2 | Space-Track SATCAT RCS | RCS size class (SMALL, MEDIUM, LARGE). `RCSVALUE`, the median RCS in m² since 2026-05-28 per the documentation, is 0 unless the account has permission: 0 in all 70,970 records of our 2026-10-10 SATCAT | Full catalog | Archived daily SATCAT | As C.1 | No (Space-Track user agreement) | Coarse size prior | AR, L (RCSVALUE permission) |
| G.3 | CelesTrak SATCAT RCS | RCS values | — | celestrak.org | — | No: cited only ([terms](data-licenses.md#celestrak)) | Size prior | U |
| G.4 | IGS satellite metadata SINEX | GNSS mass, power, yaw and attitude law, PRN↔SVN | All GNSS | files.igs.org, anonymous | IGS terms | Yes, with attribution ([terms](data-licenses.md#igs)) | SRP modeling for GNSS truth (box-wing inputs) | DL |
| G.5 | Operator-published geometry | Planet: fitted drag ballistic coefficient per state (B.2). Starlink: no physical data in the ephemerides. Mission documents for A.4–A.10 | Per operator | Mixed | Per source | Per source (Planet: non-commercial) | Area/mass for calibration objects | L/S (per mission; Planet DL) |
| G.6 | GCAT (McDowell) | Mass, dry mass, length, diameter, span and shape for catalogued objects, rocket stages included | Full catalog, updated about daily (`satcat.tsv` of 2026-10-08 used) | [planet4589.org/space/gcat](https://planet4589.org/space/gcat/) TSV, anonymous | Free reproduction with citation (CC BY) ([GCAT][gcat]) | Yes, with attribution ([terms](data-licenses.md#gcat)) | Area/mass priors: spheres and rocket bodies anchor the level of an element-set density calibration (E8) | DL (E8; reproduced in `data/e8`) |
| G.7 | TraCSS Cat (TraCSS-SPEC-003 v2.0.5) | Per-object record from the DoD, NASA and operators: wet mass (kg), hard-body radius (m) and its method, propulsion and maneuver capability, the DoD's B* term, RCS size class; each field has a source authority and edit rule | All unclassified objects, once public | As C.21 | CC0 1.0 for most fields: "All spacecraft attribute data submitted to TraCSS is considered open data unless explicitly designated otherwise" | CC0 once published | Operator-stated mass, hard-body radius and thrust capability: priors for B and the thrust flag (§7, M.2); a cross-check of G.6 | L (pilot) |

### H. The HAC and HASDM themselves

| # | Source | Data | Access | Reproduce | Status |
| --- | --- | --- | --- | --- | --- |
| H.1 | SP vectors and HAC states | The HAC | Space-Track ODR / SSA sharing agreement (C.3); for an operator's own objects, CDMs (C.2); TraCSS screening (C.4) | No | L |
| H.2 | Real-time HASDM / JBH09 products | DCA coefficients, JBHSGI.TXT, real-time indices | UDL, licensed (C.6) | No (licensed) | L, P |

## 4. Login-only sources for the owner

| Account | Unlocks | How |
| --- | --- | --- |
| SET account (login.spacenvironment.net) | HASDM database 2000–2025 (D.1). Research use only; commercial use needs a SET agreement | [Register](https://login.spacenvironment.net/register) |
| NASA Earthdata Login | CDDIS (IGS, ILRS, IDS mirrors, BRDC, CPF), PO.DAAC (GRACE-FO L1B), NSIDC (ICESat-2), ASF (Sentinel-1 orbits) | [urs.earthdata.nasa.gov](https://urs.earthdata.nasa.gov/users/new), free |
| Copernicus Data Space Ecosystem | Sentinel-2/3/6 POD auxiliary orbits (A.6) | Free account at dataspace.copernicus.eu |
| Space-Track owner/operator role (on the existing account) | Full CDMs with ASW covariances for the operator's objects (C.2), O/O ephemerides (B.7) | Space-Track operator registration |
| USSPACECOM SSA sharing agreement | SP vectors (HAC states) through ODR (C.3, H.1) | Contact via Space-Track advanced services |
| TraCSS registration | Pilot access: full CDMs for an operator's own spacecraft, TIPs, ephemeris upload; read-only national-government accounts; third parties join as sub-users. Public data announced, not yet live (C.4, C.21) | app.tracss.gov; space.commerce.gov registration page |
| EU SST portal | EU SST CA services (C.5) | portal.eusst.eu, operators |
| UDL | Real-time SET indices, JBH09/HASDM products (C.6, H.2) | Government sponsor or commercial license |
| ESA SDO account | DISCOS (C.10, G.1) | sdup.esoc.esa.int |
| AVISO account | FES2014b/FES2022b (F.4) | AVISO registration form |
| TPXO registration | TPXO10 (F.5), non-commercial | tpxo.net |
| EUMETSAT EO Portal | Metop products (A.13) | data.eumetsat.int |
| ESA EO sign-in | GOCE PSO (A.14) | earth.esa.int |
| ESA SWE portal | ESA space weather archives (D.13) | swe.ssa.esa.int |
| NASA CSDA (NASA-funded investigators) or ESA TPM proposal | Spire GNSS-RO data (A.11); no orbits | CSDA / ESA TPM |
| Space-Track account (already held) | Public Files (B.11), the documentation downloads (F.9, F.10), `cdm_public` (C.18), `decay` and `tip` (C.19); a permission for SATCAT `RCSVALUE`, which is 0 in all 70,970 records of our 2026-10-10 SATCAT (G.2) | The permission is a request to Space-Track |
| SatNOGS DB token | Decoded telemetry and artifacts (A.19, C.20); HTTP 401 without it | db.satnogs.org account; the owner holds one, not used for this inventory |

## 5. Top ten by expected impact on HAC parity

Revised 2026-10-10: item 3 moved up from 7 and item 2 reworded, on E8's result
and the Starlink density papers; the rest keep their order.

1. **SET HASDM database, 2000–2025** (D.1; owner login). The only full record of
   the operational atmosphere. It is what the open DCA is trained and scored on.
2. **Space-Track GP history and SATCAT** (C.1; archived). The catalog being
   upgraded, and the stable-B objects of the open DCA's bulk tier. E8 shows that
   decay fixes B·ρ and not the density level (§7, M.5), so this tier shapes the
   corrections' time variation; the level needs the spheres and precise-orbit
   satellites below.
3. **Starlink public ephemerides with covariance** (B.1; sample), moved up from
   7. Operator truth and covariance for about 11,000 objects, and the one
   low-latency fleet-drag source. Densities from the ephemerides follow Swarm's
   (0.6–1.2 of it in 19 cases, [Yamamoto 2026][yam26]; the variations, [Ou et
   al. 2025][ou25]); the accelerometer densities of item 4 arrive 49–92 days
   late (E5); GP decay alone does not set the level (E8). Planned thrust in the
   files and the need to archive going forward limit it (§7, M.1, M.18). E13
   has not yet tested it.
4. **Swarm and GRACE-FO density** (D.5, D.6; downloaded). Independent density
   truth over the study window.
5. **LEO precise orbits in the drag regime** (A.4, A.5, A.7–A.10; downloaded).
   About 25 satellites from roughly 430 to 1340 km, where drag dominates the
   prediction error of GP and SP alike.
6. **SLR sphere orbits** (A.2; archived), plus CPFs (A.3). Known A/m, so the
   cleanest calibration objects available.
7. **SET JB2008 indices** (E.1; downloaded). The JBH09 base-model drivers.
8. **NOAA SWPC issued forecasts, plus GFZ Kp, Hp30 and Dst** (E.2–E.4;
   downloaded). Forecast-realistic inputs for the prediction-error consider
   term; E8's tables put the forecast-driver error at σ(ln ρ) ≈ 0.28–0.34,
   against the model's 0.16 (§7, M.7).
9. **IGS and MGEX GNSS orbits** (A.1; archived). MEO truth.
10. **ASW covariances in CDMs** (C.2; owner-operator login). The only routine
    public sight of HAC covariance, for the covariance-realism comparison.

Not ranked: the TraCSS public SP ephemerides catalog (C.21) would rank first if
it goes live as CC0 states independent of the GP catalog; the August 2026
overview says "Coming Soon". Telemetry GPS fixes (A.19) are sized (§7, M.15) but
their accuracy is unmeasured.

## 6. Downloads made (2026-10-09)

All under `/opt/data/sdn-archive/hac/`, one provenance JSON per file.

| Directory | Contents | Files | Size |
| --- | --- | --- | --- |
| `set-jb2008/20261009/` | SOLFSMY, SOLRESAP, DSTFILE, DTCFILE; jb2008.zip, jb2008validate.zip | 6 | 9.3 MB |
| `noaa-swpc/` | Warehouse 2024–2025 (DGD, DSD, RSGA, GEOA, SGAS, SRS); 2026 daily RSGA, GEOA, SGAS; 2025Q4–2026Q4 DGD/DSD; current forecasts and indices | 721 | 2.4 MB |
| `gfz-kp/20261009/` | Kp_ap_Ap_SN_F107 since 1932 and nowcast; Kp_ap since 1932; format | 4 | 22 MB |
| `gfz-hpo/20261009/` | Hp30/ap30 and Hp60/ap60, complete series and nowcast; format | 5 | 66 MB |
| `iers-eop/20261009/` | finals.all.iau2000, Bulletins A and B, EOP 20 C04 (two layouts), readme | 6 | 14 MB |
| `iers-conventions-tides/20261009/` | fes2004_Cnm-Snm.dat, fes2004.dat, S1.dat, Desai pole-tide files | 5 | 12 MB |
| `icgem-gravity/20261009/` | EGM2008, EIGEN-6C4, GOCO06s, EGM96 | 4 | 134 MB |
| `igs-metadata/20261009/` | igs_satellite_metadata.snx, igs20.atx | 2 | 62 MB |
| `ids-doris/ssa/` | SSALTO POE SP3 for CS2, JA3, S3A, S3B, S6A, S6B, SRL, SWO, H2C, H2D (arcs ending on or after 2025-10-01) | 401 | 236 MB |
| `copernicus-s1-pod/POEORB/` | S1A, S1C, S1D POEORB 2025-10 to 2026-09 | 928 | 556 MB |
| `esa-swarm-diss/` | Swarm RD SP3 A/B/C 2025-10 to 2026-08 (`POD_RD_Sat_*`), DNS POD A/B/C, DNS ACC C, GRACE-FO DNS1ACC (`GFO_DNS`) | 2,154 | 694 MB |
| `gfz-isdc-rso/RSO/` | GRACE-FO L64 and L65 RSO 2025-10 to 2026-10; TerraSAR-X L13 (partial) | 2,056 | 185 MB |
| `ucar-cosmic2/nrt-leoOrb/` | COSMIC-2 NRT LEO orbit tarballs, 2025-10-01 to 2026-10-08 | 373 | 579 MB |
| `ilrs-edc/cpf_predicts_v2/` | CPF predictions from all issuing centers for Swarm A, Sentinel-6A, CryoSat-2 and Starlette, 2025-10 to 2026-10 | 2,310 | 1.18 GB |
| `planet-ephemerides/` | Daily TLE and state history, 2025-10-01 to 2026-10-09; current matches, status, TLE, states | 752 | 16 MB |
| `starlink-ephemerides/sample-20261009/` | Manifest and 25 satellite ephemerides | 26 | 52 MB |
| `nasa-iss-oem/20261009/` | ISS OEM (txt, xml) | 2 | 3.6 MB |
| `satnogs/` (E6) | ISS and CSS observation metadata 08-31..10-09 (API pages), ISS waterfall PNGs, transmitter lists; `provenance.jsonl` | see `results/e6/inventory.json` | ≈ 0.5–1 GB |
| `seesat-l/` (E6) | SeeSat-L monthly archives Jun–Oct 2026 (hypermail pages) | 455 | 3.3 MB |
| `ilrs-edc/npt_crd_v2/`, `ilrs-edc/pos+eop/` (E6) | CRD v2 monthly normal points, 5 targets × Jun–Aug 2026; ILRS weekly SINEX Jun 27–Aug 29 | 25; 10 | 13 MB; 0.4 MB |
| `noaa-wam-ipe/sample-wrs-20260101/` | 32 hourly fixed-height nowcast files | 32 | 96 MB |
| `zenodo-5177065-weimer-hasdm/20261009/` | HASDM, MSIS and EXTEMPLAR global-mean density (HDF5), documentation | 2 | 4.7 MB |
| **Total** | | **9,789** | **3.9 GB** |

Downloading stopped when free disk on `/` reached the 80 GiB floor. Most of
that drop came from other work on the machine; this inventory added 3.9 GB.
Not fetched because of the floor: TanDEM-X RSO (L20) and the rest of
TerraSAR-X.

Not acquired, because of size: Starlink full snapshots (≈ 22 GB each), the
WAM-IPE archive (≈ 157 GB per year), and CPFs for the other targets
(≈ 85 MB per satellite-year).

Added 2026-10-10 (the owner's Space-Track session; outside the `hac/` tree):

| Directory | Contents | Files | Size |
| --- | --- | --- | --- |
| `/opt/data/sdn-archive/spacetrack/documents/` | The logged-in documentation page (`page-2026-10-10.html`, 344,008 B), its download index (`index-2026-10-10.json`, 5,468 B), the SGP4 user agreement (`sgp4-user-agreement-2026-10-10.txt`, 8,451 B) and `sgp4-19505655-v9.1.1.0_C_Sgp4Prop_Wasm.zip` (362,762 B, SHA-256 `269230005164064b6bdd04f35b2c1aee3eaef3b899da65f16fa879e6e564e3e8`) | 4 | 0.7 MB |

Not fetched: `Sgp4Prop_v9.9.zip` and the 25 documents the page lists (by title:
laser-clearinghouse and deconfliction plans and forms, DoDI 3100.11, CJCSI
3225.01C, an FAQ, SUSR notifications; none looks like HAC accuracy material).

Read in place and not kept: the SatNOGS DB schema and satellite list,
satnogs-decoders (commit 4e223eb), about 150 public SatNOGS frames, TraCSS's
policy, specifications and August 2026 overview, and the MMT pages.

## 7. Meta-processes: quantities recovered from published products

A meta-process recovers a hidden physical quantity from a published product: the
drag a satellite felt, from its operator's ephemeris; the density correction the
DoD's DCA solves from the drag of 75–100 calibration satellites (§2). Products
fed are those of §1 (state, B, AGOM, covariance, atmosphere) plus maneuver flags
and screening.

**Status:** *done* = result on main (E*n*); *branch* = plan or code on an
unmerged branch (E4 A4–A6, E7v2, E11, E12); *planned* = E13, the open-DCA lane
(no commits yet); *new* = not started. **Cost** is a rough guess: S under a
week, M a few weeks, L a program. Facts were checked on 2026-10-10; each new
reference is marked read, abstract only or metadata only (identified in
Crossref, not read). CelesTrak was not fetched; the SatNOGS token was not used.

| # | Meta-process | Inputs | Feeds | Status | Cost |
| --- | --- | --- | --- | --- | --- |
| M.1 | Drag (B·ρ) from operator ephemerides | B.1–B.3, A.3, B.12 | B, density | branch (E4 A6 fits Cd·A/m per segment); chained starts, energy route planned (E13) | M |
| M.2 | Thrust and maneuver histories from operator ephemerides | B.1–B.3, B.12, G.7 | maneuver flags, B | branch (E4 A6 segments); E7 detects on OMMs | S |
| M.3 | Attitude and drag-area modes from orbit-phase-dependent drag | B.1, B.2, A.4–A.10 | B (area), density | new | M |
| M.4 | The open DCA | D.5, D.6, A.2–A.10, B.1, C.1, G.6, E.1–E.4 | density | planned (E13); stand-ins done (E5, E8) | L |
| M.5 | B of debris from GP history; why only B·ρ | C.1, G.6, D.11, D.14 | B, density shape | done (E8) | S |
| M.6 | Covariance realism from successive operator forecasts | B.1, B.3, A.3 | covariance | new | S |
| M.7 | Space-weather forecast errors as the consider term | E.1–E.4 | covariance, density forecast | partly (E7, E8 use forecasts as issued) | S |
| M.8 | Maneuver detection from GP history | C.1 | maneuver flags | done (E7, E8) as a rule; unscored | S |
| M.9 | Decay and reentry records as low-altitude density constraints | C.19, C.1, G.6 | density below 250 km | new | S |
| M.10 | GNSS SRP terms from IGS products | A.1, G.4, F.7 | AGOM, MEO forces | done (E7); branch (E4 A6, E12) | S |
| M.11 | Public CDM summaries against our screening | C.18, C.1 | covariance, screening | new | S |
| M.12 | CelesTrak SupGP: operator-derived OMM history | B.4 | B*, OMM product | branch (E11, running) | S |
| M.13 | Fitting SGP4-XP to precise orbits | A.1–A.3, B.12, F.9 | OMM product, MEO and GEO | new | M |
| M.14 | Public RF and optical observations | C.7, C.8, C.16, C.17, C.20 | uncatalogued objects, anchors | done (E6) | S |
| M.15 | GPS fixes inside cubesat telemetry | A.19 | state, B of small LEO | new (sized here) | S |
| M.16 | Physics-based density forecasts: WAM-IPE | D.7, D.5, D.6 | density forecast | planned (E13 cross-check) | M |
| M.17 | Planet satellites as drag sensors | B.2 | B, density | data on hand; analysis new | S |
| M.18 | Starlink's fleet as a density network | B.1, D.15, D.5 | density | planned (E13) | L |
| M.19 | Spin state and mean cross-section from light curves | C.22, C.8 | area prior for B | new | S |
| M.20 | Operator physics fingerprints | B.1–B.3, A.3, B.12, C.21 | all fitted products | branch (E12, draft) | M |

**M.1 Drag (B·ρ) from operator ephemerides.** Inputs: Starlink MEME (B.1),
Planet states with a fitted B (B.2), the ISS OEM (B.3; its header states Cd
0.95, drag area 1,273.21 m² and mass 470,200 kg: B = 389 kg/m², planning values,
not measurements). Recovers Cd·A/m, or B·ρ, along a maneuver-free segment.
*Segmented fit:* full-force HPOP fitted afresh to the first hours of each file,
so B(t) forms over chained file starts, as in the DCA's segmented B ("a 3-h
sub-interval within the fit span of an estimated 1.5-day interval", [tob22]);
E4's A6 fitter solves Cd·A/m ≥ 0 and an in-track acceleration per segment.
*Energy dissipation rate:* the ephemeris's specific energy, less the
conservative terms, gives the drag power without a force-model fit; published
for GNSS orbits ([sang12]; [li17]) and for Starlink ([ou25]; [yam26]). Limit:
the energy route reached 0.6–1.2 of Swarm's density in 19 cases ([yam26]); both
routes read planned thrust as drag. A scratch test on 2026-10-10 (not committed)
found a position jump at 47.98–48.0 h in 8 of 8 Starlink files
(`ephemeris_source:blend`) and, on 72-h fits, Cd·A/m of 0.001–0.004 m²/kg, a
tenth of a physical value (planned thrust is the likely cause, not proven): use
the first hours of each file. A cycle is ≈ 11,000 files (B.1); the first A5
fitter took 6–8 minutes per 3-day file (lane report), so it needs a worker pool.

**M.2 Thrust and maneuver histories from operator ephemerides.** Inputs:
B.1–B.3, B.12; G.7's thrust fields. Recovers maneuver epochs, in-track
acceleration, Δv, and the planned thrust inside a forecast. *In a file:* A6
splits a segment where the second difference of an RTN residual exceeds 10 ×
1.4826 MAD and 1e-6 m/s², or at a listed event. *Between files:* the difference
between file k's prediction and file k+1's first states, growing from a time
t_m, marks a maneuver planned between them. *On mean elements:* [ou25] find more
Starlink maneuvers in disturbed periods. Truth: the ISS OEM event table (B.3).
Limit: not scored against truth; E4 flagged 31 of 298 Starlink object-files and
49 of 1,233 Planet states. Continuous low thrust looks like drag unless a thrust
flag (G.7) separates them.

**M.3 Attitude and drag-area modes from orbit-phase-dependent drag.** Inputs:
B(t) from B.1 and B.2 at sub-orbit resolution; precise orbits (A.4–A.10) of
satellites with a known attitude law. Recovers the cross-section presented
through the orbit: Cd·A/m against orbit phase and beta angle, and mode switches.
At constant attitude density and Cd enter only as a product; with attitude
variations a Fourier series for Cd in the body frame separates them ([ray21]);.
Planet's Doves hold two attitude modes with "an approximate 5:1 ratio in surface
areas exposed to the wind" ([fos15]), so their B should step with the mode (not
checked here). Limit: needs the attitude (GRACE-FO's L1B should have it, behind
a login; not checked); Starlink's files carry no physical data (G.5).

**M.4 The open DCA (E13).** Inputs: Swarm and GRACE-FO densities (D.5, D.6) as
truth; SLR spheres (A.2, A.3); POD satellites (A.4–A.10); fleet drag (M.1);
stable-B debris (C.1, G.6); drivers (E.1–E.4). Recovers 13 global
temperature-correction coefficients every 3 h and per-object segmented B (§2;
the expansion's terms are not published). Limit: E5, calibrated on accelerometer
and POD densities, cut the spread of ln(observed/model) on held-out satellites
from 0.155 to 0.056, but its inputs arrive 49–92 days late; E8, on GP decay
alone, reached 0.142; HASDM is 0.078 against CHAMP and GRACE-A (E8's historical
windows). The fleet and spheres are the low-latency candidates; unproven.

**M.5 B of debris from GP history; why only B·ρ.** Inputs: C.1, G.6, D.11, D.14.
Method: [picone], [emmert], [doornbos], [gondelach]; E8 fits every object's ln B
and one temperature correction together. Limit: density and B enter as a
product, so decay fixes B·ρ and sets the level only through objects of known
A/m. In E8's nine analysis fits the correction's level and the mean ln B
correlate at −0.93 to −0.97, and the held-out spread fell 8.4 % [−3.9, 18.3]
(25 % was needed). Mehta found that the Gauss–Markov method cannot separate the
two biases (as quoted in [ray21]). It feeds B and the density's time variation,
not its level.

**M.6 Covariance realism from successive operator forecasts.** Inputs:
Starlink's UVW covariance per state (B.1), the ISS OEM (B.3), CPFs (A.3).
Recovers how realistic the operator's covariance is by horizon (mean d²/3, 95 %
coverage), taking the next file's first states, a fresh orbit determination, as
truth for the previous file's prediction; test as in [zh16]. E4 H2 tested our
covariance against the difference from SpaceX's, not SpaceX's own. Limit: the
truth is only as good as the next file's start; the 48-h join and planned thrust
enter the difference.

**M.7 Space-weather forecast errors as the consider term.** Inputs: NOAA
forecasts as issued (E.2: RSGA, 3- and 27-day outlooks), observed Kp, ap and
Hp30 (E.3, E.4), the JB2008 drivers (E.1). Recovers the error distribution of
F10.7 and ap by lead time, mapped to σ(ln ρ) by perigee height and class as the
DoD's Dynamic Consider Parameter does (day weights 5/9, 3/9, 1/9; [hej19]). The
May 2024 storm's ap forecast missed magnitude and duration "even one day in
advance" ([pl24]). Limit: E8's tables imply forecast drivers add σ(ln ρ) of
about 0.28 (lead 0–1 d) and 0.34 (1–7 d) in quadrature to the model's 0.16
(√(0.318² − 0.160²), √(0.374² − 0.164²), √(0.374² − 0.167²); independence
assumed); one year holds few storms. No consider-term model is fitted yet.

**M.8 Maneuver detection from GP history.** Inputs: C.1. Recovers maneuver
epochs and size from jumps in mean elements ([lk14]). E7 runs
`analysis/maneuver-detection` (default thresholds) on the SGP4 trajectories of
each object's OMMs and splits arcs at detections; E8 reuses it. Limit: no
detection rate against truth. Truth sets: the ISS event table (B.3), Starlink
flags (M.2), CPF discontinuities (which [hol21] used to find GEO maneuvers).

**M.9 Decay and reentry records as low-altitude density constraints.** Inputs:
`decay` and `tip` (C.19), the last element sets (C.1), area/mass priors (G.6).
Recovers one number per object: the cumulative drag of its last days at 120–250
km, where little else exists. Method: propagate the last element set to decay
with our model and compare with DECAY_EPOCH ± WINDOW (95 %); a bias in the ratio
is a mean density bias there. The rule of thumb is ± 20 % of the remaining
lifetime ([payne22]). Limit: weak: a tumbling object's B is unknown, and SGP4-XP
put only 54 % of 3,157 predictions inside ± 20 % (SGP4-based analytic: 24 %;
[payne22]). The Aerospace Corporation's reentry page blocked a script and was
not assessed.

**M.10 GNSS SRP terms from IGS products.** Inputs: IGS orbits (A.1; final ≈ 2.5
cm, 1D RMS against laser ranging, per the IGS products table), satellite
metadata (G.4), antenna offsets (F.7). Recovers ECOM2 coefficients (D0, Y0, B0,
B1 cos/sin) per satellite and day, and the box-wing a priori: [arn15], [rod12].
Limit: E7's GPS arc fits (state plus four ECOM2 coefficients; Y0 dropped) stood
at 1.1–1.6 times SGP4's error over 0–7 days (undecided); the ECOM terms absorb
whatever else is unmodelled, and E7 carried no Earth radiation or ocean tides.

**M.11 Public CDM summaries against our screening.** Inputs: `cdm_public`
(C.18), element sets (C.1), our products. Recovers the HAC's miss distance and
time of closest approach for the conjunctions it publishes and, if the class
carries a probability of collision (field list not retrieved), the covariance
scale behind it, through the maximum-Pc relation ([alf05]). Method: screen the
same pair with our products and compare. Limit: only what the 18 SDS publishes,
with the website's retention and no history: archive from now, within 3 sweeps a
day.

**M.12 CelesTrak SupGP: operator-derived OMM history.** Inputs: B.4 and the
operator ephemerides it is fitted to (B.1–B.3, B.12). Recovers the SGP4 mean
elements CelesTrak fits to operator ephemerides, with the fit RMS: the SGP4
representation floor per operator. A possible extra, not in E11's plan: B* from
a precise-ephemeris fit as a cleaner drag proxy than the 18 SDS's. E11 fits our
OMM to the same ephemeris and compares, collecting under CelesTrak's fetch
policy (serial, ≥ 2.5 s, a 3-h ledger). Limit: only operators CelesTrak serves;
our history starts 2026-10-10.

**M.13 Fitting SGP4-XP to precise orbits.** Inputs: CPFs and GNSS orbits
(A.1–A.3), operator ephemerides (B.12), the official binary (F.9). Recovers an
XP element set: Brouwer mean motion, a B term in B*'s field ("a true ballistic
coefficient", Cd·m²/kg) and an SRP coefficient in the second-derivative field
([payne22]). Method: pseudo-observations from a precise ephemeris, differential
correction in equinoctial elements, B and AGOM by alternating grid searches
([hol21]). Published accuracy: fit residuals of tens of metres at MEO and GEO,
hundreds at LEO, and median prediction error under 0.33 km for 10 days at
Etalon-2 ([hol21]); on Intelsat GEO ephemerides the mean fit error falls from
0.9–7.5 km (SGP4) to 0.08–0.22 km, while at LEO it stays level (Starlette 0.37
to 0.36 km) ([conk22]); near-Earth objects gain only 1.2× against SSN
observations, as XP's drag is a static Jacchia-70 with a generic flux model
([payne22]). The public GP has no XP sets (F.9), so XP products are ours alone;
E11's OMM fit is SGP4. The agreement's purpose clause (F.9) wants the owner's
reading first.

**M.14 Public RF and optical observations.** Inputs: SatNOGS (C.7, C.20), SeeSat
(C.8), CAMRAS IQ (C.16), ILRS normal points (C.17). Recovers range rates and
timing for objects the catalog lacks or holds badly, and laser ranges that
anchor cooperative targets; Doppler-curve method as in [strf]. E6: laser normal
points anchor the orbit at 7 m (0 d) to 42 m (7 d) against SGP4's 0.47–0.69 km;
SatNOGS Doppler read from PNG waterfalls made the ISS worse than SGP4 by
2.7–10.7× (per-segment bias, drift and a timing lag, σ 1.07 s ≈ 8 km
along-track); 18 amateur IOD lines on objects with truth, 20 needed. Beyond E6:
the artifacts (C.20) have 46.9–65 Hz bins and 0.09-s rows but the same host
clock, and need a token; 63 % of E6's PNGs hold a microsecond start time and the
native bin width in a text chunk E6 did not read, a cheap retest; telemetry GPS
(M.15) is the other fix. Realistic uses, not demonstrated here: early-orbit
identification after launches (SatNOGS DB links provisional IDs to catalog
numbers, e.g. SPIRONE 98492 to 66657) and anomaly detection on transmitting
satellites (SPIRONE's beacon clock was 36 h off UTC).

**M.15 GPS fixes inside cubesat telemetry.** Inputs: A.19. Recovers independent
position and velocity for small LEO satellites at 335–460 km and, from a series,
their drag. Method: decode public frames with satnogs-decoders. The 0x42BD
packet is inertial (speed 7.639 km/s at radius 6,834.6 km, the circular speed);
0x43BD is Earth-fixed (7.714 km/s, faster, as a retrograde sun-synchronous orbit
gives); radii and speeds are consistent with the satellites' GP (radius within a
few km, as osculating against mean elements). Limit: consecutive fixes 56 s
apart disagree along-track by 33 m (239Alferov) to 1.3 km (Colibri-S), with a
radial part under 0.03 m/s: consistent with time-tag errors of 4–172 ms, not
position noise. A quarter to a third of frames carry a GNSS packet (14, 11 and
12 of 45 sampled), some with zero time tags (no lock). Coverage: 2–5
frame-bearing passes a day per satellite; 239Alferov's 55 frames from 5 passes
held 19 GNSS packets, 11 of them distinct fixes; scaled by frames a day that is
roughly 4–25 distinct fixes a day per satellite (estimate). Of 23 candidate
satellites 3 are confirmed, SPIRONE's fields are empty, LASARsat's NAV packets
were absent from 26 frames, the rest not decoded. The DB token would add decoded
values and history; not used.

**M.16 Physics-based density forecasts: NOAA WAM-IPE.** Inputs: D.7 (nowcast
`wrs`, forecast `wfs`), D.5 and D.6 for scoring. Recovers a physics-based
density forecast and its error against accelerometer densities, a background
where JB2008 with forecast drivers does poorly (M.7). [fang22]: for the February
2022 storm it gave a 50–125 % density enhancement at 200–400 km that NRLMSISE-00
inputs underestimated. Limit: not scored against Swarm or GRACE-FO here; ≈ 157
GB a year (D.7); the sample of 2026-01-01 is on hand.

**M.17 Planet satellites as drag sensors.** Inputs: B.2 (states with "Drag
Ballistic coefficient in [kg/m2]"; the SRP coefficient is "not currently fit";
daily history 2025-10-01 to 2026-10-09). Recovers B(t) per satellite from
Planet's GPS and two-way-ranging orbit determination ([fos15]). Limit: Doves
station-keep by differential drag "without the complexity and expense of onboard
propulsion" ([fos15]), so thrust cannot enter, but the cross-section changes on
command and B steps with the mode. Which listed satellites are thruster-free is
not stated (unverified; "operational" means able to maneuver "propulsively or
via differential drag"). The current file holds 101 states with B from 13 to 145
kg/m² (median 45). CC BY-NC 4.0.

**M.18 Starlink's fleet as a density network.** Inputs: B.1; Swarm densities
(D.5) to validate. Recovers density in the Starlink shells with a lag of at most
8 h. Method and results: D.15 ([ou25]; [yam26]); the TLE-decay version for the
whole LEO catalog is [pl24]; [tha24] argue for GNSS-equipped LEO satellites as
"data of opportunity" for density. Limit: 0.6–1.2 of Swarm, mean 0.95 over 19
cases, diurnal variation only, one 60-km scale height ([yam26]). The density in
the files is SpaceX's model updated with data ([ou25]), so it is partly the
operator's forecast, which is what a fleet-calibrated density would be;
maneuvers rise in disturbed times ([ou25]) and bias energy-loss estimates.

**M.19 Spin state and mean cross-section from public light curves.** Inputs:
MMT-9 photometry (C.22), SeeSat reports (C.8). Recovers a variability class,
period and mean standard magnitude per object: a rotation state and a rough mean
area for rocket bodies and debris, a prior for B where there are no physical
data (G.1). Limit: no accuracy is published; magnitudes give area only with an
albedo; CIS satellites are hidden; the authors ask to be contacted; individual
track pages are closed to scripts. Low priority.

**M.20 Operator physics fingerprints.** Inputs: operator ephemerides (B.1–B.3,
B.12), CPFs (A.3) and, when public, TraCSS OCMs (C.21). Recovers the frame, time
scale, gravity field, third bodies, tides, SRP and atmosphere an operator's
propagator used. E12 scores a tournament of hypotheses by the half-split closure
of a maneuver-free segment; the TraCSS OCM profile states the atmosphere,
gravity, third-body, tide and SRP choices and OD spans (OD_EPOCH,
DAYS_SINCE_FIRST_OBS) as names, not parameters. Limit: E12 is a draft; the 1 cm
half-split gate is for synthetic data, and on real LEO files the closure
measures model mismatch (A6). Matching the operator's model removes a systematic
from every fitted product.

## References

- NASA Spacecraft Conjunction Assessment and Collision Avoidance Best Practices Handbook, Vol. 1, NASA-SP-20205011318/REV2-VOL1, Aug 2026. <https://ntrs.nasa.gov/citations/20260000453>
- Best Practices Handbook, Vol. 2, Technical Appendices, Aug 2026. <https://ntrs.nasa.gov/citations/20260000457>
- Hejduk, M.D. 2016. ASW Covariance Introduction and Formation. <https://ntrs.nasa.gov/citations/20160005042>
- Pachura, D. and Hejduk, M. 2016. Atmospheric Model at JSpOC. <https://ntrs.nasa.gov/citations/20160005044>
- Hejduk, M.D. 2019. Three CA-Related Covariance Issues and Their Solutions. <https://ntrs.nasa.gov/citations/20190026790>
- Walterscheid, R.L. et al. Comparative Accuracies of Models for Drag Prediction During Geomagnetically Disturbed Periods. <https://ntrs.nasa.gov/citations/20240013068>
- Casali, S.J. and Barker, W.N. 2002. Dynamic Calibration Atmosphere (DCA) for the High Accuracy Satellite Drag Model (HASDM). AIAA 2002-4888. <https://doi.org/10.2514/6.2002-4888>
- Storz, M.F. et al. 2005. High accuracy satellite drag model (HASDM). Adv. Space Res. 36(12), 2497-2505. <https://doi.org/10.1016/j.asr.2004.02.020>
- Licata, R.J. et al. 2022. Machine-Learned HASDM Thermospheric Mass Density Model With Uncertainty Quantification. Space Weather, doi:10.1029/2021SW002915. <https://arxiv.org/abs/2109.07651>
- Tobiska, W.K. et al. 2022. Understanding variability in HASDM to support space traffic management. AMOS. <https://arxiv.org/abs/2209.05597>
- Borowitz, M., Pérez Hernández, C., Hejduk, M. et al. 2024. A Technical Comparison of the Public SSA Services in the United States and the European Union. AMOS, doi:10.64861/etru7114. <https://amostech.com/TechnicalPapers/2024/SDA/Borowitz.pdf>
- <https://igs.org/wp-content/uploads/2020/09/IGS-Data-and-Product-Disclaimer-and-Terms-of-Use-200805.pdf>
- <https://ilrs.gsfc.nasa.gov/about/termsofref.html>
- <https://edc.dgfi.tum.de/en/terms/>
- <https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice>
- <https://earth.esa.int/eogateway/documents/20142/1564626/Terms-and-Conditions-for-the-use-of-ESA-Data.pdf>
- <https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance>
- <https://www.comspoc.com/legal/terms-of-use>
- <https://space.commerce.gov/wp-content/uploads/2026/03/Conjunction_Screening_Testset_Users_Guide.pdf>
- <https://www.space-track.org/documentation>
- <https://db.satnogs.org/about/>
- <https://spacewx.com/hasdm/>
- <https://spacewx.com/jb2008/>
- <https://registry.opendata.aws/noaa-nws-wam-ipe/>
- <https://github.com/SWxTREC/pymsis/blob/main/MSIS2_LICENSE>
- <https://github.com/swami-h2020-eu/mcm/blob/main/LICENSE>
- <https://doi.org/10.1029/2004JA010585>
- <https://doi.org/10.1029/2009JA014102>
- <https://doi.org/10.1016/j.asr.2006.12.025>
- <https://www.weather.gov/disclaimer>
- <https://doi.org/10.5880/Kp.0001>
- <https://doi.org/10.5880/HPO.0003>
- <https://www.iers.org/iers/en/service/imprint>
- <https://doi.org/10.5194/essd-11-647-2019>
- <https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/global-tide-fes.html>
- <https://www.tpxo.net/global>

Further sources cited in the text (metadata checked against Crossref):

- Tobiska, W.K. et al. 2021. The SET HASDM density database. Space Weather 19(4), e2020SW002682. doi:10.1029/2020SW002682
- Licata, R.J. et al. 2021. Qualitative and quantitative assessment of the SET HASDM database. Space Weather 19(8), e2021SW002798. doi:10.1029/2021SW002798
- Weimer, D.R. et al. 2021. Comparison of a neutral density model with the SET HASDM density database. Space Weather 19(12), e2021SW002888. doi:10.1029/2021SW002888
- Hejduk, M.D. and Snow, D.E. 2018. The effect of neutral density estimation errors on satellite conjunction serious event rates. Space Weather 16(7), 849–869. doi:10.1029/2017SW001720
- Mehta, P.M. et al. 2017. New density estimates derived using accelerometers on board the CHAMP and GRACE satellites. Space Weather 15(4), 558–576. doi:10.1002/2016SW001562
- van den IJssel, J. et al. 2020. Thermosphere densities derived from Swarm GPS observations. Adv. Space Res. 65(7), 1758–1771. doi:10.1016/j.asr.2020.01.004
- Doornbos, E. et al. 2008. Use of two-line element data for thermosphere neutral density model calibration. Adv. Space Res. 41(7), 1115–1122. doi:10.1016/j.asr.2006.12.025
- Picone, J.M. et al. 2005. Thermospheric densities derived from spacecraft orbits: accurate processing of two-line element sets. J. Geophys. Res. Space Phys. 110(A3). doi:10.1029/2004JA010585
- Emmert, J.T. 2009. A long-term data set of globally averaged thermospheric total mass density. J. Geophys. Res. Space Phys. 114(A6). doi:10.1029/2009JA014102
- Gondelach, D.J. and Linares, R. 2020. Real-time thermospheric density estimation via two-line element data assimilation. Space Weather 18(2), e2019SW002356. doi:10.1029/2019SW002356; arXiv:1910.00695
- McDowell, J.C. General Catalog of Artificial Space Objects (GCAT). <https://planet4589.org/space/gcat/>
- Levit, C. and Marshall, W. 2011. Improved orbit predictions using two-line elements. Adv. Space Res. 47(7), 1107–1115. doi:10.1016/j.asr.2010.10.017, arXiv:1002.2277. Numerical orbits fitted to successive element sets, scored against ILRS orbits; the fit window chosen by forecast performance (E7's arc fits and their window choice).
- Hallgarten La Casta, M.I. and Amato, D. 2024. Debiasing of two-line element sets for batch least squares pseudo-orbit determination in MEO and GEO. arXiv:2412.15793 (preprint submitted to Adv. Space Res.; arXiv metadata checked). Along-track bias removal before batch least squares, and fit windows of months (E7's H-arc-debiased and long arcs).

Added 2026-10-10; each is marked **read**, **abstract only** or **metadata only** (identified in Crossref, not read):

- Ou, Zhong, Hao, Li et al. 2025. Near-Real-Time Global Thermospheric Density Variations Unveiled by Starlink Ephemeris. Remote Sensing 17(9), 1549. doi:10.3390/rs17091549. Abstract only.
- Yamamoto 2026. Tomography of thermospheric density from Starlink Ephemeris: initial report. Earth, Planets and Space 78(1). doi:10.1186/s40623-026-02509-5. Abstract only.
- Parker, W.E. and Linares, R. 2024. Satellite Drag Analysis During the May 2024 Gannon Geomagnetic Storm. J. Spacecraft and Rockets 61(5), 1412–1416. doi:10.2514/1.A36164. Abstract only.
- Thayer, Pilinski, Sutton, Waldron et al. 2024. LEO Satellites as Sensors for Thermospheric Mass Density and Drag Research. EGU24-14017. doi:10.5194/egusphere-egu24-14017. Abstract only.
- Fang, Kubaryk, Goldstein et al. 2022. Space Weather Environment During the SpaceX Starlink Satellite Loss in February 2022. Space Weather 20(11), e2022SW003193. doi:10.1029/2022SW003193. Abstract only.
- Payne, Hoots, Butkus, Slatton and Nguyen 2022. Improvements to the SGP4 Propagator (SGP4-XP). AMOS 2022. doi:10.64861/ohug4581. Read.
- Holincheck and Cathell 2021. Improved Orbital Predictions using Pseudo Observations - Maximizing the Utility of SGP4-XP. AMOS 2021. doi:10.64861/whme5585. Read.
- Conkey and Zielinski 2022. Assessing Performance Characteristics of the SGP4-XP Propagation Algorithm. AMOS 2022. doi:10.64861/bmaw2693. Read in part (Tables 3–4).
- Ray, Scheeres and Alnaqbi 2021. Decorrelating Density and Drag-coefficient through Attitude Variations. AMOS 2021. doi:10.64861/cvgo2714. Read in part.
- Foster, Hallam and Mason 2015. Orbit Determination and Differential-drag Control of Planet Labs Cubesat Constellations. arXiv:1509.03270. Read in part.
- Sang, Smith and Zhang 2012. Towards accurate atmospheric mass density determination using precise positional information of space objects. Adv. Space Res. 49(6), 1088–1096. doi:10.1016/j.asr.2011.12.031. Metadata only.
- Li, Lei, Wang, Dou et al. 2017. Thermospheric mass density derived from CHAMP satellite precise orbit determination data based on energy balance method. Sci. China Earth Sci. 60(8), 1495–1506. doi:10.1007/s11430-016-9052-1. Metadata only.
- Zaidi and Hejduk 2016. Earth Observing System Covariance Realism. AIAA 2016-5628. doi:10.2514/6.2016-5628. Metadata only.
- Lemmens and Krag 2014. Two-Line-Elements-Based Maneuver Detection Methods for Satellites in Low Earth Orbit. J. Guid. Control Dyn. 37(3), 860–868. doi:10.2514/1.61300. Metadata only.
- Arnold, Meindl, Beutler, Dach et al. 2015. CODE's new solar radiation pressure model for GNSS orbit determination. J. Geod. 89(8), 775–791. doi:10.1007/s00190-015-0814-4. Metadata only.
- Rodriguez-Solano, Hugentobler and Steigenberger 2012. Adjustable box-wing model for solar radiation pressure impacting GPS satellites. Adv. Space Res. 49(7), 1113–1128. doi:10.1016/j.asr.2012.01.016. Metadata only.
- Alfano 2005. Relating Position Uncertainty to Maximum Conjunction Probability. J. Astronaut. Sci. 53(2), 193–205. doi:10.1007/BF03546350. Metadata only.
- Beskin et al. 2017. Wide-field optical monitoring with Mini-MegaTORTORA (MMT-9) multichannel high temporal resolution telescope. Astrophys. Bull. 72(1), 81–92. doi:10.1134/S1990341317030105. Metadata only. Karpov et al. 2016, RMxAC 48, 112–113: the MMT page's ADS link, not found in Crossref.
- STRF, satellite tracking toolkit for radio observations: <https://github.com/cbassa/strf> (README read). satnogs-decoders, commit 4e223eb, AGPL-3.0: <https://gitlab.com/librespacefoundation/satnogs/satnogs-decoders>. SatNOGS DB API schema: <https://db.satnogs.org/api/schema/?format=json>. satnogs-client `artifacts.py`, `waterfall.py` and gr-satnogs `waterfall_sink_impl.cc` (GitLab master, 2026-10-10).
- TraCSS: [Overview, August 2026](https://space.commerce.gov/wp-content/uploads/2026/09/TraCSS-Overview-Presentation-August-2026_1.pdf); [SPEC-003 Cat](https://space.commerce.gov/wp-content/uploads/2026/01/TraCSS-SPEC-003-TraCSS-Cat-Format-v2.0.5.pdf), [SPEC-004 OMM](https://space.commerce.gov/wp-content/uploads/2026/01/TraCSS-Spec-004-v1.2_OMM.pdf), [SE-SPEC-002 OCM](https://space.commerce.gov/wp-content/uploads/2026/01/TraCSS_SE_SPEC_002_v2.1.pdf), [SPEC-001 CDM](https://space.commerce.gov/wp-content/uploads/2026/01/TraCSS-Spec-001-v2.1_CDM.pdf). IGS products and accuracy table: <https://igs.org/products/>. Planet public ephemerides: <https://ephemerides.planet-labs.com/>. MMT-9 satellite database: <http://mmt.favor2.info/satellites>.

[h1]: https://ntrs.nasa.gov/citations/20260000453 "NASA Spacecraft Conjunction Assessment and Collision Avoidance Best Practices Handbook, Vol. 1, NASA-SP-20205011318/REV2-VOL1, Aug 2026"
[h2]: https://ntrs.nasa.gov/citations/20260000457 "Best Practices Handbook, Vol. 2, Technical Appendices, Aug 2026"
[asw]: https://ntrs.nasa.gov/citations/20160005042 "Hejduk, M.D. 2016. ASW Covariance Introduction and Formation"
[jspoc-atm]: https://ntrs.nasa.gov/citations/20160005044 "Pachura, D. and Hejduk, M. 2016. Atmospheric Model at JSpOC"
[hej19]: https://ntrs.nasa.gov/citations/20190026790 "Hejduk, M.D. 2019. Three CA-Related Covariance Issues and Their Solutions"
[walt]: https://ntrs.nasa.gov/citations/20240013068 "Walterscheid, R.L. et al. Comparative Accuracies of Models for Drag Prediction During Geomagnetically Disturbed Periods"
[dca]: https://doi.org/10.2514/6.2002-4888 "Casali, S.J. and Barker, W.N. 2002. Dynamic Calibration Atmosphere (DCA) for the High Accuracy Satellite Drag Model (HASDM). AIAA 2002-4888"
[storz]: https://doi.org/10.1016/j.asr.2004.02.020 "Storz, M.F. et al. 2005. High accuracy satellite drag model (HASDM). Adv. Space Res. 36(12), 2497-2505"
[mlh]: https://arxiv.org/abs/2109.07651 "Licata, R.J. et al. 2022. Machine-Learned HASDM Thermospheric Mass Density Model With Uncertainty Quantification. Space Weather, doi:10.1029/2021SW002915"
[tob22]: https://arxiv.org/abs/2209.05597 "Tobiska, W.K. et al. 2022. Understanding variability in HASDM to support space traffic management. AMOS"
[amos24]: https://amostech.com/TechnicalPapers/2024/SDA/Borowitz.pdf "Borowitz, M., Pérez Hernández, C., Hejduk, M. et al. 2024. A Technical Comparison of the Public SSA Services in the United States and the European Union. AMOS, doi:10.64861/etru7114"
[igs-tou]: https://igs.org/wp-content/uploads/2020/09/IGS-Data-and-Product-Disclaimer-and-Terms-of-Use-200805.pdf
[ilrs-tor]: https://ilrs.gsfc.nasa.gov/about/termsofref.html
[edc-terms]: https://edc.dgfi.tum.de/en/terms/
[cop]: https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice
[esa-tc]: https://earth.esa.int/eogateway/documents/20142/1564626/Terms-and-Conditions-for-the-use-of-ESA-Data.pdf
[edg]: https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance
[comspoc]: https://www.comspoc.com/legal/terms-of-use
[tracss-guide]: https://space.commerce.gov/wp-content/uploads/2026/03/Conjunction_Screening_Testset_Users_Guide.pdf
[st]: https://www.space-track.org/documentation
[satnogs]: https://db.satnogs.org/about/
[set-hasdm]: https://spacewx.com/hasdm/
[set-jb]: https://spacewx.com/jb2008/
[wam]: https://registry.opendata.aws/noaa-nws-wam-ipe/
[msis2]: https://github.com/SWxTREC/pymsis/blob/main/MSIS2_LICENSE
[dtm]: https://github.com/swami-h2020-eu/mcm/blob/main/LICENSE
[picone]: https://doi.org/10.1029/2004JA010585
[emmert]: https://doi.org/10.1029/2009JA014102
[gondelach]: https://doi.org/10.1029/2019SW002356
[gcat]: https://planet4589.org/space/gcat/
[doornbos]: https://doi.org/10.1016/j.asr.2006.12.025
[nws]: https://www.weather.gov/disclaimer
[kp]: https://doi.org/10.5880/Kp.0001
[hpo]: https://doi.org/10.5880/HPO.0003
[iers]: https://www.iers.org/iers/en/service/imprint
[icgem]: https://doi.org/10.5194/essd-11-647-2019
[fes]: https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/global-tide-fes.html
[tpxo]: https://www.tpxo.net/global
[ou25]: https://doi.org/10.3390/rs17091549
[yam26]: https://doi.org/10.1186/s40623-026-02509-5
[pl24]: https://doi.org/10.2514/1.A36164
[tha24]: https://doi.org/10.5194/egusphere-egu24-14017
[sang12]: https://doi.org/10.1016/j.asr.2011.12.031
[li17]: https://doi.org/10.1007/s11430-016-9052-1
[ray21]: https://doi.org/10.64861/cvgo2714
[fos15]: https://arxiv.org/abs/1509.03270
[zh16]: https://doi.org/10.2514/6.2016-5628
[lk14]: https://doi.org/10.2514/1.61300
[arn15]: https://doi.org/10.1007/s00190-015-0814-4
[rod12]: https://doi.org/10.1016/j.asr.2012.01.016
[alf05]: https://doi.org/10.1007/BF03546350
[payne22]: https://doi.org/10.64861/ohug4581
[hol21]: https://doi.org/10.64861/whme5585
[conk22]: https://doi.org/10.64861/bmaw2693
[fang22]: https://doi.org/10.1029/2022SW003193
[strf]: https://github.com/cbassa/strf
