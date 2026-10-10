# HAC data sources

The inventory behind the high-accuracy catalog (HAC) parity study: every public
or login-only source found that can stand in for, feed, or check a catalog close
to the U.S. Space Force High Accuracy Catalog. For each source: what it is, what
it covers, how to get it, the terms it comes under, what it does for HAC parity,
and where it stands. Checked on 2026-10-09 by fetching each landing or terms
page with `curl` (a browser user agent, no login, no browser session). Nothing
here was obtained through an account.

Acquired files are kept outside every repository, under
`/opt/data/sdn-archive/hac/<source>/`, as received, each with a
`<file>.provenance.json` (URL, retrieval time, SHA-256, byte count, terms URL
and the terms clause). This repository redistributes none of them.

**Status codes.** **DL**: downloaded here (path in the last section).
**AR**: already in the SDN archive. **S**: anonymous and scriptable, not
downloaded. **L**: needs an account (named). **P**: commercial or paid.
**R**: obtainable, but its terms rule out use in the stack's products.
**U**: unreachable from this host on 2026-10-09 (connection timeout or DNS
failure). **X**: not obtainable.

## Summary

80 sources in eight groups (three added and two updated for E6 on 2026-10-09: C.7, C.8, C.16, C.17, F.8). A source can carry two codes. For example,
Space-Track is both AR and L.

| Group | Sources | DL | AR | S | L | P | R | U | X |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Precise orbits (truth) | 18 | 7 | 4 | 5 | 6 | 0 | 0 | 1 | 2 |
| B. Operator ephemerides and broadcast orbits | 10 | 3 | 0 | 3 | 2 | 0 | 1 | 2 | 1 |
| C. Catalogs and observations | 17 | 3 | 1 | 3 | 8 | 5 | 0 | 0 | 1 |
| D. Density and its calibration | 13 | 4 | 1 | 4 | 2 | 0 | 2 | 1 | 0 |
| E. Space weather indices and forecasts | 7 | 4 | 0 | 2 | 0 | 0 | 0 | 1 | 0 |
| F. EOP, gravity, tides, ephemerides | 8 | 5 | 1 | 0 | 2 | 0 | 0 | 0 | 0 |
| G. Physical properties | 5 | 1 | 1 | 1 | 2 | 0 | 0 | 1 | 0 |
| H. The HAC and HASDM themselves | 2 | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |
| **All** | **80** | **27** | **8** | **18** | **24** | **6** | **3** | **6** | **4** |

Counted once, by the most open route: 33 are on hand (27 downloaded here,
6 already archived), 14 more are anonymous and scriptable, 19 need an account,
4 are commercial only, 3 have terms that rule out product use, 5 were
unreachable from this host today, and 2 cannot be obtained.

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

## 3. Inventory

Columns: **Data**: what it is and its type. **Coverage**: objects or regime,
history, latency. **Access**: format and route. **Terms**: license or terms
clause, quoted where a page states one. **HAC role**: what it does for parity.

### A. Precise orbits (truth)

| # | Source | Data | Coverage | Access | Terms | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A.1 | IGS final / rapid / ultra-rapid (ESA, CODE, JPL and other ACs; MGEX) | GNSS precise orbits and clocks | GPS, GLONASS, Galileo, BeiDou, QZSS; 1994–; final ≈ 2 weeks, rapid ≈ 1 day, ultra-rapid real time + 48 h prediction | SP3. ESA navigation office HTTP, anonymous (listing verified); CDDIS (Earthdata Login); IGN, BKG and CODE did not answer | [IGS Terms of Use 2020][igs-tou]: "made openly available for use without restriction"; users "agree to appropriately cite and attribute" | MEO truth (E1, E3) | AR (`reference-states/`: ESA0OPSFIN, IGS0OPSFIN, IGS0OPSULT), S |
| A.2 | ILRS analysis-center orbits (EDC, CDDIS) | SLR-derived precise orbits | LAGEOS-1/2, Etalon-1/2, LARES, LARES-2, Starlette, Stella, Larets, Ajisai, WESTPAC; weekly | SP3. [EDC](https://edc.dgfi.tum.de/pub/slr/products/orbits/) anonymous HTTPS/FTP | No license text on the [ILRS ToR][ilrs-tor] or the [EDC terms][edc-terms]; public archive; cite ILRS | Physical truth (V1). The LEO spheres are ideal calibration objects (§2) | AR (`reference-states/products`: asi, bkg, cnes, dgfi, esa, gfz, ilrsa, nsgf) |
| A.3 | ILRS CPF predictions (EDC) | Operator- and center-issued predicted ephemerides | about 130 targets, including LEO (Swarm, GRACE-FO, Jason-3, Sentinel-6A/B, CryoSat-2, SARAL, SWOT, TSX/TDX, PAZ, HY-2B–E) and spheres; 2018–; daily | CPF v2. EDC anonymous | As A.2 | Benchmark of operator-grade predictions against truth | DL (Swarm A, Sentinel-6A, CryoSat-2, Starlette, 2025-10 to 2026-10), S (others) |
| A.4 | IDS DORIS: CNES SSALTO POE | DORIS+SLR(+GNSS) precise orbits | CryoSat-2, Jason-3, Sentinel-3A/B, Sentinel-6A/B, SARAL, SWOT, HY-2C/D; 2010–; POE-G standards since 2025; 10-day files appear a few weeks after the arc ends | SP3 (.Z). [IGN anonymous FTP](ftp://doris.ign.fr/pub/doris/products/orbits/ssa/) (verified); CDDIS (Earthdata Login) | No license text found on ids-doris.org; anonymous; cite IDS and CNES | LEO drag-regime truth, 700–1340 km | DL (all ten satellites, files ending on or after 2025-10-01) |
| A.5 | Copernicus POD: Sentinel-1 | Precise orbit (POEORB) | S1A (to 2026-07), S1C, S1D; ≈ 20-day latency | EOF in zip. ESA STEP mirror anonymous; ASF requires Earthdata Login (HTTP 401, verified); CDSE requires an account | [Copernicus legal notice][cop]: "free, full and open access", including "(b) distribution" and "(d) adaptation, modification" | LEO truth, 693 km SSO | DL (928 files 2025-10 to 2026-09); also partly AR (`reference-states/products`) |
| A.6 | Copernicus POD: Sentinel-2/3/6 auxiliary orbits | Precise orbits | S2A/B/C, S3A/B, S6A/B | Copernicus Data Space Ecosystem (free account) | As A.5 | LEO truth (S3/S6 also via A.4) | L (CDSE account) |
| A.7 | ESA Swarm (Swarm DISC) | Reduced-dynamic (COM) and kinematic orbits; Level 2 | Swarm A, B (≈ 500 km), C; 2013–; ≈ 7-week latency (last file 2026-08-19) | SP3 in ZIP. [Swarm DISS](https://swarm-diss.eo.esa.int/) JSON listing API, anonymous | [ESA T&C][esa-tc] B.4: "authorised to duplicate data … for the performance of their work"; B.5: further distribution only to recipients who accept the T&C | LEO drag truth near HASDM's busiest altitudes | DL (RD 2025-10 to 2026-08); partly AR |
| A.8 | GRACE-FO | GFZ Rapid Science Orbits; JPL Level-1B GNV1B | GRACE-FO C/D, ≈ 490 km; RSO 2021–; ≈ 1 day | RSO: SP3 via [GFZ ISDC](https://isdc-data.gfz.de/grace-fo/ORBIT/), anonymous HTTPS. L1B: PO.DAAC (Earthdata Login) | No license text found on isdc.gfz.de; cite GFZ ISDC. PO.DAAC: [Earthdata guidance][edg] | LEO drag truth paired with D.6 accelerometer densities | DL (RSO L64/L65 2025-10 to 2026-10), L (L1B) |
| A.9 | TerraSAR-X / TanDEM-X | GFZ RSO | 514 km SSO | SP3 via GFZ ISDC `tsxtdx/ORBIT/L13`, `L20`, anonymous | As A.8 | LEO truth | DL (TerraSAR-X L13, partial; stopped at the 80 GiB disk floor), S (TanDEM-X L20) |
| A.10 | COSMIC-2 (UCAR CDAAC) | NRT LEO orbits (`leoOrb`) | Six satellites, ≈ 520–550 km, 24° inclination; 2019–; ≈ 1 day | SP3 in daily tar.gz. [data.cosmic.ucar.edu](https://data.cosmic.ucar.edu/gnss-ro/cosmic2/): "there is no need for a login" | Cite "UCAR COSMIC Program (2019) COSMIC-2 Data Products, doi:10.5065/T353-C093"; © UCAR | Low-inclination LEO drag truth (NRT quality, roughly decimeters; not verified here) | DL (2025-10-01 to 2026-10-08) |
| A.11 | Spire GNSS-RO | Occultation data; POD not public | Spire constellation | NASA CSDA and GES DISC (L1B/L2 occultation; NASA-funded investigators); ESA Third Party Missions "Spire live and historical data" (project proposal) | Per program | Orbits would be LEO truth, but none are released | X (orbits), L (RO data) |
| A.12 | ICESat-2 | Geolocated photons (ATL03); no separate public POD product in NASA CMR | 2018– | NSIDC (Earthdata Login) | [Earthdata guidance][edg] | Weak (orbit only implied by geolocation) | L |
| A.13 | Metop (EUMETSAT) | Orbit products not verified here | Metop-B/C | EUMETSAT Data Store (EO Portal account) | EUMETSAT data policy (not fetched) | LEO truth, 817 km | L |
| A.14 | CHAMP, GRACE, GOCE historical POD | PSO and RSO | CHAMP 2000–10, GRACE 2002–17, GOCE 2009–13 | GFZ ISDC `champ/ORBIT`, `grace/ORBIT`, `orbit/L..`, anonymous; GOCE PSO via ESA (EO sign-in) | As A.8; ESA T&C | Truth paired with the historical HASDM densities (D.1–D.3) | S, L (GOCE) |
| A.15 | Jason-3 orbit information (NOAA NCEI) | Orbit products | 2015– | [NCEI accession 0122598](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.nodc:0122598), anonymous | NOAA, public domain | Second source for A.4 | S |
| A.16 | NASA SPDF SSCWeb | Definitive and predicted ephemerides of science missions | Dozens of missions | [sscweb.gsfc.nasa.gov](https://sscweb.gsfc.nasa.gov/), anonymous | NASA, public | Mostly HEO, which the HAC also covers | S |
| A.17 | CODE / IGN / BKG GNSS mirrors | Duplicates of A.1 | — | Did not answer from this host (timeouts) | IGS terms | Mirrors | U |
| A.18 | ESA mission ephemerides (ESOC flight dynamics) | — | — | No public channel found beyond A.5–A.7 | — | — | X |

### B. Operator ephemerides and broadcast orbits

| # | Source | Data | Coverage | Access | Terms | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B.1 | Starlink public ephemerides | Predicted ephemeris with covariance (3 days at 60 s; UVW 6×6 lower triangle; `ephemeris_source:blend`) | about 11,130 satellites; snapshots only, no history | MEME text, [api.starlink.com manifest](https://api.starlink.com/public-files/ephemerides/MANIFEST.txt), anonymous; ≈ 2 MB per satellite, ≈ 22 GB per snapshot | No license in the manifest or files | The largest public set of operator ephemerides with covariance: SP-like truth and covariance realism for the dominant LEO population | DL (sample: manifest and 25 files), S (must be archived going forward) |
| B.2 | Planet Labs public ephemerides | TLEs, state vectors with a fitted drag ballistic coefficient, 5-day OEMs, NORAD↔HWID matches | Planet fleet (operational satellites only); daily history files | Text, [ephemerides.planet-labs.com](https://ephemerides.planet-labs.com/), anonymous | "licensed under CC BY-NC 4.0"; commercial redistribution by permission | Operator states and B for the 122 satellites Planet lists as operational | DL (2025-10-01 to 2026-10-09 history, current files) |
| B.3 | ISS OEM (NASA) | Predicted OEM | ISS | [nasa-public-data S3](https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt), anonymous | US Government work | High-drag reference with frequent reboosts | DL (current) |
| B.4 | CelesTrak SupGP | GP fitted to operator ephemerides (Starlink, OneWeb, Planet, Intelsat, SES, Telesat, GPS, others) | Per operator | celestrak.org | CelesTrak access is authorized by the owner's arrangement | Operator-quality GP, used by E3 | U (TCP timeouts all day; E3's 15:51Z capture failed the same way) |
| B.5 | OneWeb, Intelsat, SES, Telesat | Operator ephemerides | — | oneweb.net redirects to eutelsat.com. No public ephemeris page found; these reach the public only through B.4 | — | Through B.4 | X (direct) |
| B.6 | GNSS broadcast ephemerides (IGS BRDC) | Broadcast navigation messages | All GNSS | CDDIS (Earthdata Login); BKG did not answer | IGS terms | The GNSS operators' own orbits, and a baseline for A.1 | L, U |
| B.7 | Space-Track owner/operator ephemerides | O/O-submitted ephemerides | Registered operators | Space-Track (operator role) | Space-Track user agreement | Operator truth | L |
| B.8 | COMSPOC Spacebook | XP-TLEs, synthetic covariance, reference ephemerides, historical ephemerides, space weather, EOP | Full catalog | [spacebook.com](https://spacebook.com/) API (paths found in the app bundle), anonymous | [COMSPOC ToU][comspoc]: content "may not be (i) used for Your commercial use … (iii) distributed to non-licensed users, (iv) … used to make derivative works" | Strong comparison set, but not usable in products | R (not mirrored) |
| B.9 | JPL Horizons | Spacecraft and natural-body ephemerides | Mostly deep space | API, anonymous | NASA/JPL | Minor | S |
| B.10 | TraCSS CA verification test set | Ephemerides, CDM answer keys | Synthetic and operational catalog | Google Drive links from [space.commerce.gov](https://space.commerce.gov/dataset-for-conjunction-assessment-verification/) | "full and open basis … (CC0-1.0)" ([user's guide][tracss-guide]) | Screening and covariance-handling check | S |

### C. Catalogs and observations

| # | Source | Data | Coverage | Access | Terms | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C.1 | Space-Track GP, GP history, SATCAT, decay, TIP | GP element sets (OMM), catalog | Full public catalog; 1959– | Owner's account; archiver at `/opt/data/sdn-archive/spacetrack/` | [Space-Track documentation][st]: "express blanket approval for transfer/redistribution of basic SSA data … conditioned on appropriate citation" (TLE/OMM, SATCAT, decay/reentry) | The observation backbone: GP-derived states, the bulk calibration set (§2), maneuver detection | AR, L |
| C.2 | Space-Track CDMs | Conjunction data messages with ASW covariances | Full CDMs for an operator's own objects (Space-Track's documentation lists CDM download limits; a reduced public class was not checked here) | Operator registration | Space-Track user agreement (CDMs are not "basic SSA data") | The only routine public sight of HAC covariances | L (owner-operator role) |
| C.3 | Space-Track advanced services (ODR) | SP state vectors and other products | On approved request | Orbital Data Request; SSA sharing agreement | Per agreement | The HAC itself, object by object | L (SSA sharing agreement) |
| C.4 | TraCSS (Office of Space Commerce) | Screening service; GP dataset to be published | Registered operators | [Operator registration](https://space.commerce.gov/traffic-coordination-system-for-space-tracss/tracss-registration-for-spacecraft-operators/) | TraCSS User Agreement & Data Policy | Runs on the DoD SP catalog with covariance ([AMOS 2024][amos24]) | L |
| C.5 | EU SST service portal | CA, fragmentation and re-entry services | Registered operators | [portal.eusst.eu](https://portal.eusst.eu/) | EU SST terms | European catalog products; screens against the HAC | L |
| C.6 | Unified Data Library (UDL) | DoD data lake: observations, states, SET real-time space weather and JB2008/HASDM products | — | API returns "Invalid or missing user credentials" (verified). Government sponsorship or a commercial license | SET: real-time inputs and product files "are available via licensed access to the Unified Data Library" (JB2008 code README) | The real-time HASDM inputs | L, P |
| C.7 | SatNOGS DB and Network | Observations: metadata (station position, transmitter, the element set the station tuned with), PNG waterfalls, demodulated data, audio; transmitter DB; HDF5 waterfall artifacts | Amateur and cubesat LEO; ISS ≈ 70–250 observations a day | Network API anonymous ([network](https://network.satnogs.org/api/observations/)); an anonymous client is throttled after ≈ 100 requests (HTTP 429, `Retry-After` up to 47 min); waterfalls on Wasabi S3, anonymous; DB artifacts (HDF5 waterfalls with timestamps) need a db.satnogs.org API token. Latency: minutes after the pass | "freely distributed under the Creative Commons Atribution-Share Alike v4.0 license" ([about][satnogs]) | Independent Doppler for OD of small LEO objects; E6 reduces waterfalls to range rates (`experiments/e6-public-observations`) | DL (ISS metadata 08-31..10-09, waterfalls), L (artifacts) |
| C.8 | Amateur optical (SeeSat-L, IOD; STVID-calibrated reports) | Positional observations (IOD, UK, RDE formats) and observers' stated station coordinates; STVID (github.com/cbassa/stvid, GPL-3.0) is the camera software several observers use | ≈ 8,000 IOD lines a quarter on ≈ 1,000 objects, mostly rocket bodies and classified payloads; few objects with public truth (2026-06..10: CryoSat-2 9 lines, Jason-3 3) | [satobs.org/seesat](https://www.satobs.org/seesat/) monthly hypermail archives, anonymous with an identifying user agent (a browser-like agent got HTTP 412 earlier); the McCants page is gone (404). Latency: hours to a day | Public list; no license stated (observations are each observer's) | Objects missing from public GP; anchors where truth exists | DL, X (McCants) |
| C.9 | Minor Planet Center and survey streaks | Optical astrometry | Artificial-object reports are incidental | [minorplanetcenter.net](https://www.minorplanetcenter.net/) | MPC terms (not fetched) | Negligible | S |
| C.10 | ESA DISCOS | Object physical and mission data | Full catalog | DISCOSweb redirects to the ESA Space Debris User Account sign-in | ESA terms on registration | Physical properties (G) | L (ESA SDO account) |
| C.11 | LeoLabs | Radar observations, states, CDMs | LEO | platform.leolabs.space (OAuth sign-in) | Commercial | Independent LEO radar truth | P |
| C.12 | ExoAnalytic (now Anduril) | GEO optical | GEO | exoanalytic.com redirects to anduril.com/space | Commercial | GEO truth | P |
| C.13 | Slingshot Aerospace | Optical observations, catalog | — | slingshot.space | Commercial | — | P |
| C.14 | COMSPOC (commercial catalog) | Commercial SSA | — | comspoc.com | Commercial | — | P |
| C.15 | ESA public SST material | Space Environment Report, re-entry predictions | — | esa.int | ESA | Context only | S |
| C.16 | CAMRAS Dwingeloo SatNOGS IQ archive | Raw IQ recordings (48 kHz, 16-bit complex) of the Dwingeloo 25 m telescope's SatNOGS observations, for STRF (github.com/cbassa/strf, GPL-3.0) Doppler extraction | 469 recordings 2022-01..2026-08-23, mostly cubesats (URESAT-1, FOX-1E, RSP-03); no object with public truth in 2026 | [data.camras.nl/satnogs](https://data.camras.nl/satnogs/), anonymous; ≈ 100 MB per pass | "distributed under a CC-BY 4.0 license" (archive page) | High-SNR Doppler when a covered object has truth | S |
| C.17 | ILRS normal points (CRD v2) | Laser-ranging normal points: two-way flight times, met data, system configuration | ≈ 130 SLR targets; e.g. Starlette ≈ 800–960 passes a month (2026-06..08) | EDC (DGFI-TUM) [npt_crd_v2](https://edc.dgfi.tum.de/pub/slr/data/npt_crd_v2/) monthly and daily files, anonymous HTTPS (the v1 `npt_crd` directory holds only stations still sending v1; a missing file returns an HTML page with status 200); CDDIS needs Earthdata Login. Latency: hours to a day | [ILRS terms of reference][ilrs-tor], [EDC terms][edc-terms]: free use with acknowledgement | Precise ranges for anchored fits of cooperative targets (E6 laser arm) | DL (Starlette, Stella, LARETS, WESTPAC, LARES 2026-06..08) |

### D. Density and its calibration

| # | Source | Data | Coverage | Access | Terms | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D.1 | SET HASDM density database | HASDM (HASDM1, J70-based) neutral density | 2000–2019, and 2020–2025 (new release); 3 h; 175–825 km every 25 km; 15° × 10° | "HASDM Database API", sign-in at login.spacenvironment.net (free [registration](https://login.spacenvironment.net/register)) | [spacewx.com/hasdm][set-hasdm]: "free of charge to the international science community for research purposes only. Commercial uses are permitted only through an explicit agreement with SET." | The target atmosphere: trains and scores the open DCA | L (SET account; research only) |
| D.2 | Zenodo 4602380 (Licata et al. 2021) | CHAMP (10 s) and GRACE-A (5 s) accelerometer densities (Mehta et al. 2017), with HASDM and JB2008 interpolated along track | Both missions, within HASDM's 2000–2019 span; 3.3 GB | [zenodo.org/records/4602380](https://zenodo.org/records/4602380) | CC BY 4.0 | Public HASDM along real orbits | S (another lane is downloading it to `hac/zenodo-4602380-licata-hasdm/`) |
| D.3 | Zenodo 5177065 (Weimer et al. 2021) | HASDM, NRLMSIS 2.0 and EXTEMPLAR global-mean density at 200, 300, 400, 600 and 800 km | 2000–2019, 3 h; HDF5 | [zenodo.org/records/5177065](https://zenodo.org/records/5177065) | CC BY 4.0 | HASDM global-mean truth at five shells | DL |
| D.4 | TU Delft thermosphere data | Accelerometer- and GPS-derived density and wind: CHAMP, GRACE, GRACE-FO, Swarm, GOCE | 2000– | thermosphere.tudelft.nl (TCP timeout from this host) | — | Density truth | U (Swarm and GRACE-FO products arrive through D.5 and D.6) |
| D.5 | Swarm DNS (Swarm DISC; TU Delft processing) | DNSxPOD (GPS-derived) and DNSCACC (Swarm C accelerometer) density | A, B, C; 2014–; POD to 2026-07-31, ACC to 2025-11-30 | CDF in ZIP, anonymous | ESA T&C (A.7) | Density truth over the study window | DL (2025-10 to 2026-07); also downloaded by another lane |
| D.6 | GRACE-FO DNS1ACC (TOLEOS, on Swarm DISC) | Accelerometer density | GRACE-FO 1; 2018–19 and 2025-01 to 2026-04 | CDF, anonymous | ESA T&C | Density truth at ≈ 490 km | DL (2025-10 to 2026-04); also downloaded by another lane |
| D.7 | NOAA WAM-IPE (operational) | Whole-atmosphere physics model: nowcast (`wrs`) and forecast (`wfs`), fixed-height neutral fields every 10 min | 2023-07– | netCDF on AWS NODD (`noaa-nws-wam-ipe-pds`), anonymous; ≈ 3 MB per step (≈ 157 GB per year) | "open to the public and can be used as desired" ([registry][wam]) | Physics cross-check of the open DCA; an independent forecast | DL (hourly sample for 2026-01-01), S |
| D.8 | NRLMSIS 2.0 / 2.1 | Empirical model code | — | NRL host has no DNS record; pymsis downloads the source | [MSIS2 license][msis2]: "academic, non-commercial, purposes only … shall not … make any modification or improvement" | Reference model for studies only | R |
| D.9 | DTM2020 (with MCM, SWAMI) | Empirical model code (operational and research versions) | — | [github.com/swami-h2020-eu/mcm](https://github.com/swami-h2020-eu/mcm); swami-h2020.eu did not answer | [License][dtm]: "academic, non-commercial, purposes only … shall not … make any modification", "disseminate it" | EU SST's model ([AMOS 2024][amos24]); study comparison only | R |
| D.10 | NRLMSISE-00, Jacchia-Roberts, JB2008 | Models already in HPOP | — | — | — | The base models; the open DCA corrects JB2008 | AR (in `propagator/hpop`) |
| D.11 | TLE-derived densities | Method: Picone et al. 2005 ([doi:10.1029/2004JA010585][picone]); Emmert 2009 global averages ([doi:10.1029/2009JA014102][emmert]); Doornbos et al. calibration with TLEs ([doi:10.1016/j.asr.2006.12.025][doornbos]) | Any object with GP history | Rebuilt from C.1 | As C.1 | Inputs for the bulk calibration tier | S (method; Emmert's dataset not located) |
| D.12 | NASA CCMC | Runs on Request for hosted physics models (model list not checked here); ISWA | — | [ROR](https://ccmc.gsfc.nasa.gov/tools/runs-on-request/): name and e-mail on submission; outputs public | CCMC publication policy | Physics cross-checks for storm cases | S |
| D.13 | ESA SWE portal | Space weather products and archives | — | [swe.ssa.esa.int](https://swe.ssa.esa.int/): "register as a user" for the full range | ESA | Secondary | L (ESA SWE account) |

### E. Space weather indices and forecasts

| # | Source | Data | Coverage | Access | Terms | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E.1 | SET JB2008 indices | SOLFSMY (F10, S10, M10, Y10 and 81-day means), SOLRESAP (3-h ap), DSTFILE (hourly Dst), DTCFILE (hourly ΔTc); JB2008 code and validation set | 1997–; **45-day lag** (latest 2026-08-25). Real time only through the UDL | Text, anonymous HTTPS | No license on [the page][set-jb]; code README: "Copyright, 2008, Space Environment Technologies" | Exact JBH09 base-model drivers | DL |
| E.2 | NOAA SWPC | F10.7, Kp/Ap, Kyoto Dst, solar-cycle series; 3-day, 27-day and 45-day forecasts; warehouse archive since 1996 (RSGA 3-day F10.7/Ap forecasts, GEOA, SGAS, SRS, yearly DGD/DSD) | 1996– | Text, JSON, FTP, anonymous | [NWS disclaimer][nws]: "in the public domain … may be used without charge for any lawful purpose" | Observed indices, plus the forecasts that were actually issued (for realistic prediction tests) | DL (warehouse 2024–2026, quarterly indices, current products) |
| E.3 | GFZ Kp, ap, Ap, SN, F10.7 | Definitive and nowcast geomagnetic and solar indices | 1932– | Text, anonymous | [doi:10.5880/Kp.0001][kp]: CC BY 4.0 | Geomagnetic driver; the definitive Kp standard | DL |
| E.4 | GFZ Hp30/Hp60, ap30/ap60 | Half-hourly and hourly geomagnetic indices | 1985– | Text, anonymous | [doi:10.5880/HPO.0003][hpo]: CC BY 4.0 | Storm-time resolution (DTM2020 research uses Hp60) | DL |
| E.5 | CelesTrak SW-All / EOP-All | Merged, gap-filled indices with predictions | 1957– | celestrak.org | As B.4 | Convenience merge | U |
| E.6 | NASA OMNIWeb | Solar wind and indices | 1963– | [omniweb.gsfc.nasa.gov](https://omniweb.gsfc.nasa.gov/), anonymous | NASA | Storm drivers | S |
| E.7 | NOAA NCEI Penticton F10.7 | Observed and adjusted flux | 1947– | [NCEI directory](https://www.ngdc.noaa.gov/stp/space-weather/solar-data/solar-features/solar-radio/noontime-flux/penticton/), anonymous | NOAA, public domain | F10.7 source of record | S |

### F. EOP, gravity, tides, planetary ephemerides

| # | Source | Data | Coverage | Access | Terms | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F.1 | IERS EOP | EOP 20 C04 (v4, ITRF2020), finals2000A, Bulletins A and B | 1962–, with predictions | Text, [datacenter.iers.org](https://datacenter.iers.org/) and [hpiers.obspm.fr](https://hpiers.obspm.fr/iers/eop/eopc04/), anonymous; USNO maia has no DNS record | The [IERS legal page][iers] states no data license; cite IERS | Frames for every comparison | DL |
| F.2 | ICGEM gravity models | EGM2008, EIGEN-6C4, GOCO06s, EGM96 (gfc) | Static fields | [icgem.gfz.de](https://icgem.gfz.de/tom_longtime), anonymous | EIGEN-6C4 (doi:10.5880/icgem.2015.1) and GOCO06s (doi:10.5880/ICGEM.2019.002): CC BY 4.0 (DataCite); EGM2008 and EGM96 are US-government models; cite [Ince et al. 2019][icgem] | HPOP embeds EGM96 and EGM2008 to degree 70. These files allow higher degree and model-difference studies | DL |
| F.3 | IERS Conventions 2010, chapter 6 files | FES2004 ocean-tide coefficients (`fes2004_Cnm-Snm.dat`), Desai ocean pole tide | — | [iers-conventions.obspm.fr](https://iers-conventions.obspm.fr/content/chapter6/additional_info/), anonymous | Published with IERS TN 36; cite Petit & Luzum 2010 | Ocean tides for HPOP (not yet modeled) | DL |
| F.4 | FES2014b / FES2022b (AVISO) | Ocean tide model | Global grids | Authenticated AVISO FTP ([registration](https://www.aviso.altimetry.fr/en/data/data-access/registration-form.html)) | FES2014: "delivered for all purposes (scientific, commercial,...)"; FES2022: "available for all uses" ([page][fes]) | A newer ocean-tide model than F.3 | L (AVISO account) |
| F.5 | TPXO10 (OSU) | Ocean tide model | Global | Registration | "available for academic research, and other non-commercial uses and require registration"; commercial license separate ([tpxo.net][tpxo]) | Alternative to F.4 | L |
| F.6 | JPL DE440/DE441 | Planetary ephemerides | 1550–2650 (DE440) | [ssd.jpl.nasa.gov/ftp/eph/planets/bsp](https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/), anonymous | NASA/JPL | Third-body forces | AR (DE440 embedded in HPOP) |
| F.7 | IGS ANTEX (igs20.atx) | GNSS antenna phase-center offsets | All GNSS | files.igs.org, anonymous | IGS terms | Center-of-mass vs antenna for GNSS truth | DL |
| F.8 | ILRS station coordinates (weekly combination) | SINEX `ilrsa.pos+eop` (station positions, XYZ eccentricities, EOP); weekly | Stations in the week's LAGEOS/Etalon solution (≈ 20) | EDC [products/pos+eop/weekly](https://edc.dgfi.tum.de/pub/slr/products/pos+eop/weekly/), anonymous. Latency: ≈ 1–2 weeks | [ILRS terms][ilrs-tor] | SLR station positions for range modelling | DL (2026-06-27..08-29) |

### G. Physical properties

| # | Source | Data | Coverage | Access | Terms | HAC role | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G.1 | ESA DISCOS | Mass, dimensions, shape, mission | Full catalog | ESA SDO account (C.10) | ESA | Area/mass priors for B and AGOM | L |
| G.2 | Space-Track SATCAT RCS | RCS size class (SMALL, MEDIUM, LARGE) | Full catalog | Archived daily SATCAT | As C.1 | Coarse size prior | AR |
| G.3 | CelesTrak SATCAT RCS | RCS values | — | celestrak.org | — | Size prior | U |
| G.4 | IGS satellite metadata SINEX | GNSS mass, power, yaw and attitude law, PRN↔SVN | All GNSS | files.igs.org, anonymous | IGS terms | SRP modeling for GNSS truth (box-wing inputs) | DL |
| G.5 | Operator-published geometry | Planet: fitted drag ballistic coefficient per state (B.2). Starlink: no physical data in the ephemerides. Mission documents for A.4–A.10 | Per operator | Mixed | Per source | Area/mass for calibration objects | L/S (per mission; Planet DL) |

### H. The HAC and HASDM themselves

| # | Source | Data | Access | Status |
| --- | --- | --- | --- | --- |
| H.1 | SP vectors and HAC states | The HAC | Space-Track ODR / SSA sharing agreement (C.3); for an operator's own objects, CDMs (C.2); TraCSS screening (C.4) | L |
| H.2 | Real-time HASDM / JBH09 products | DCA coefficients, JBHSGI.TXT, real-time indices | UDL, licensed (C.6) | L, P |

## 4. Login-only sources for the owner

| Account | Unlocks | How |
| --- | --- | --- |
| SET account (login.spacenvironment.net) | HASDM database 2000–2025 (D.1). Research use only; commercial use needs a SET agreement | [Register](https://login.spacenvironment.net/register) |
| NASA Earthdata Login | CDDIS (IGS, ILRS, IDS mirrors, BRDC, CPF), PO.DAAC (GRACE-FO L1B), NSIDC (ICESat-2), ASF (Sentinel-1 orbits) | [urs.earthdata.nasa.gov](https://urs.earthdata.nasa.gov/users/new), free |
| Copernicus Data Space Ecosystem | Sentinel-2/3/6 POD auxiliary orbits (A.6) | Free account at dataspace.copernicus.eu |
| Space-Track owner/operator role (on the existing account) | Full CDMs with ASW covariances for the operator's objects (C.2), O/O ephemerides (B.7) | Space-Track operator registration |
| USSPACECOM SSA sharing agreement | SP vectors (HAC states) through ODR (C.3, H.1) | Contact via Space-Track advanced services |
| TraCSS operator registration | DoD-catalog screening with covariance (C.4) | space.commerce.gov registration page |
| EU SST portal | EU SST CA services (C.5) | portal.eusst.eu, operators |
| UDL | Real-time SET indices, JBH09/HASDM products (C.6, H.2) | Government sponsor or commercial license |
| ESA SDO account | DISCOS (C.10, G.1) | sdup.esoc.esa.int |
| AVISO account | FES2014b/FES2022b (F.4) | AVISO registration form |
| TPXO registration | TPXO10 (F.5), non-commercial | tpxo.net |
| EUMETSAT EO Portal | Metop products (A.13) | data.eumetsat.int |
| ESA EO sign-in | GOCE PSO (A.14) | earth.esa.int |
| ESA SWE portal | ESA space weather archives (D.13) | swe.ssa.esa.int |
| NASA CSDA (NASA-funded investigators) or ESA TPM proposal | Spire GNSS-RO data (A.11); no orbits | CSDA / ESA TPM |

## 5. Top ten by expected impact on HAC parity

1. **SET HASDM database, 2000–2025** (D.1; owner login). The only full record of
   the operational atmosphere. It is what the open DCA is trained and scored on.
2. **Space-Track GP history and SATCAT** (C.1; archived). The bulk calibration
   objects for the open DCA and the catalog being upgraded.
3. **Swarm and GRACE-FO density** (D.5, D.6; downloaded). Independent density
   truth over the study window.
4. **LEO precise orbits in the drag regime** (A.4, A.5, A.7–A.10; downloaded).
   About 25 satellites from roughly 430 to 1340 km, where drag dominates the
   prediction error of GP and SP alike.
5. **SLR sphere orbits** (A.2; archived), plus CPFs (A.3). Known A/m, so the
   cleanest calibration objects available.
6. **SET JB2008 indices** (E.1; downloaded). The JBH09 base-model drivers.
7. **Starlink public ephemerides with covariance** (B.1; sample). Operator truth
   and covariance for about 11,000 objects, once archived going forward.
8. **NOAA SWPC issued forecasts, plus GFZ Kp, Hp30 and Dst** (E.2–E.4;
   downloaded). Forecast-realistic inputs for the prediction-error consider term.
9. **IGS and MGEX GNSS orbits** (A.1; archived). MEO truth.
10. **ASW covariances in CDMs** (C.2; owner-operator login). The only routine
    public sight of HAC covariance, for the covariance-realism comparison.

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
[doornbos]: https://doi.org/10.1016/j.asr.2006.12.025
[nws]: https://www.weather.gov/disclaimer
[kp]: https://doi.org/10.5880/Kp.0001
[hpo]: https://doi.org/10.5880/HPO.0003
[iers]: https://www.iers.org/iers/en/service/imprint
[icgem]: https://doi.org/10.5194/essd-11-647-2019
[fes]: https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/global-tide-fes.html
[tpxo]: https://www.tpxo.net/global
