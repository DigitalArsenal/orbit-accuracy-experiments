# Novelty audit: the near-HAC catalog program

Audit of 2026-10-10 under the owner's rules of that day: the two
whitepapers explain, as briefly as possible, how SDN synthesizes the catalog
and does conjunction assessment (CA); they document every valid approach,
cited to its originators; novelty decides only what is claimed.

Inputs: [hac-sources.md](hac-sources.md) (a346e9c); V1 and E1–E10 on main;
branches E4 A4–A6, E7v2, E11, E12, E13 (PLAN.md staged in its worktree,
whose §2 prior-art table this audit reuses) and the SupGP lane (smoke tests
only); the Starlink forecast lane of 2026-10-10
(25 satellites, one day); the whitepapers at space-data-network be2b0851b
(catalog 1.9, CA 1.8). The adversarial-security paper makes no orbit or
catalog claims.

**Verdicts.** NOVEL: no prior art found (§9). NARROW: prior art covers
part; the surviving claim is stated. FOUNDATION: established; the paper
states it once, cited, with our measured accuracy, and claims nothing. DROP:
not taken, or shown invalid by our own evidence.

## 1. Studies

| Item | Verdict | Reason; surviving claim for NARROW | Key prior art (§8) |
| --- | --- | --- | --- |
| V1: HPOP from precise states, force by force | FOUNDATION | Standard validation. SLR spheres 4.8 m at 24 h, 13.9 m at 72 h | IERS TN 36; ILRS, IGS |
| HPOP against Orekit (63 cases, ≤ 15 mm in 24 h); Jacchia–Roberts port | FOUNDATION | Software verification | Orekit; GMAT; Roberts 1971 |
| VCM covariance units (dn/n; B, AGOM as fractions) | NARROW (engineering) | No public definition found; reproduces four messages' sigmas within 1 %. An interchange fact | Hejduk 2016 |
| E1: GPS element sets corrected at epoch | NARROW | 61 % [53, 67] replicates Ly 2020 (65 %). Survives: no transfer to an unseen orbital plane (6 % [2, 10]); the single-model form of Hallgarten La Casta & Amato gives 8 %; corrected sets are worse than SGP4 at 7 d (2.65 vs 1.88 km) | Ly 2020; HLC&A 2025; Peng & Bai 2019; Acciarini 2025; Moody 2026 |
| E2: covariance from OMM history | FOUNDATION | Published differencing and fitting methods. F2 realistic for GPS at 0–1 d only | Osweiler 2006; Flohrer 2008; Geul 2017; Thompson 2019; Racelis & Joerger 2018 |
| E2b: correlated OMM errors | NARROW | Autocorrelation of OMM errors is known (Osweiler 2006). Survives: against precise orbits in four regimes, consecutive along-track correlation 0.61–1.00; four published covariance baselines overconfident (mean d²/3 about 10 to 10⁷); covariance intersection collapses onto one set | Osweiler 2006; Geul 2017; Julier & Uhlmann 1997 |
| E3: catalog combined from sources | FOUNDATION | Selection by evidence. GNSS products give 3.5 cm at issue; fusion never beat selection | IGS products; Julier & Uhlmann 1997 |
| E4 A1–A4: public products against operator ephemerides | FOUNDATION | Gaps of 0.6–5 km, as element-set accuracy predicts. The Starlink covariance comparison feeds E13 (3) | Dyreby 2025; A. Liu 2025; Jankovic 2026 |
| E4 A5–A6, E11, SupGP lane: fits to operator ephemerides; OMM companions | FOUNDATION | Fitting a dynamics model or SGP4 to an operator ephemeris is CelesTrak's SupGP and the 18 SDS eGP practice. Beating SupGP's RMS is a benchmark | Kelso (SupGP); Vallado & Crawford 2008; NASA Handbook 2026 App. E |
| E5: JB2008 calibrated on accelerometer densities | FOUNDATION | Model calibration with accelerometer densities is established. 0.155 → 0.056 in σ(ln ρ), 49–92 days late | Storz 2005; Doornbos 2012; Forootan 2022 |
| E6: laser-range fits | FOUNDATION | SLR orbit determination. 7–42 m against SGP4's 0.47–0.69 km | ILRS |
| E6: SatNOGS Doppler from PNG waterfalls; amateur optical | DROP | Invalid by our evidence (2.7–10.7× worse than SGP4); 18 optical lines, not used | — |
| E7: OMM epoch state to HPOP; arc fits | FOUNDATION | Jankovic 2026: high-fidelity propagation from public element sets loses to SGP4 on Starlink (SGP4 wins 65–75 %). E7 confirms it on independent precise orbits in four regimes; arc fits help at short horizons, as in Levit & Marshall | Jankovic 2026; Levit & Marshall 2011; Crawford 2006 |
| E7v2: OMM history to a state near epoch | FOUNDATION | Same family; no results yet | Levit & Marshall 2011; HLC&A 2025 |
| E8: JB2008 correction from OMM decay | FOUNDATION | Established. Gershman 2026 reports 10–20 % accuracy from public element sets; E8 cut σ by only 8.4 % [−3.9, 18.3]. Report the difference | Picone 2005; Emmert 2009; Doornbos 2008; Gondelach & Linares 2020; Gershman 2026 |
| E10: independent ESPF implementation | NARROW (outside catalog scope) | First independent test. ESPF RMS 361× the UKF's and 0 % containment on nominal synthetic arcs; 99.5 % containment on real arcs at 4× the element set's error | Jah & Haslett 2025; Jah 2026 |
| E12: operator physics forensics | NOVEL | No prior art found on identifying an operator's propagator configuration, axis by axis, from its published ephemeris. Dyreby 2025 notes Starlink's "simplified dynamics" qualitatively | Dyreby 2025 |
| E13 (1): DCA-form correction from public operator data | NARROW | Starlink density exists (Ou 2025; Yamamoto 2026; Fitzpatrick 2026, with attitude and housekeeping data SpaceX gives NOAA, not public), as does near-real-time density from public element sets (Gershman 2026); all score density only. Survives: a DCA-form JB2008 correction (temperature offset, block-constant per-object B, forecast) from public operator states alone, scored by 1–3 day prediction of objects that did not calibrate it | Storz 2005; Ou 2025; Yamamoto 2026; Fitzpatrick 2026; Gershman 2026; Gondelach & Linares 2021; Constant 2024 |
| E13 (2): Planet × Swarm/GRACE-FO retrospective | NARROW | Ray 2023 used Spire and some Starlink data; Gondelach & Linares 2021 assimilated GPS of 10 commercial satellites, probably Planet's (text unread). Survives: ten months of public Planet states against Swarm and GRACE-FO, with a held-out block holding the Kp 8.7 storm of 2026-01-19 | Ray 2023; Gondelach & Linares 2021; Foster 2015, 2018 |
| E13 (3): planned = executed thrust; realised vs stated covariance | NOVEL (thrust test); NARROW (covariance) | Yamamoto 2026 assumes planned thrust is executed and calls for "a rigorous test"; maneuver retrieval exists (A. Liu 2024; T.-R. Liu 2026; Guo 2026) but no such test. Realism method: Zaidi & Hejduk 2016; Dyreby 2025's abstract notes limits of the files' uncertainty propagation | A. Liu 2024, 2026; T.-R. Liu 2026; Guo 2026; Dyreby 2025; Zaidi & Hejduk 2016; Park 2019 |
| Starlink forecast lane | NARROW | At 24 h: SpaceX 0.18 km; fitted to the same 8 h head, HPOP 2.76 km, SGP4-XP 6.95 km, an OMM 39.6 km. Forecasts are thrust-balanced, so drag-only fits run ahead (24 of 25); stated covariance 5–10× pessimistic. Survives: the gap and its attribution to planned thrust, scored on later fresh-OD heads | Dyreby 2025; A. Liu 2026; Jankovic 2026 |

## 2. Catalog paper claims

| Section: claim | Verdict | Note |
| --- | --- | --- |
| §1: provider claims vs observations; lineage and independence | FOUNDATION | Framing; keep two sentences |
| §1: data levels 0–3 for orbit products | FOUNDATION | Analogy to Earth-science processing levels; keep the table |
| §2: record contracts; hashes and signatures | FOUNDATION | Provenance practice |
| §4: Vimpel osculating conversion; velocity by differencing | FOUNDATION | Textbook; one sentence |
| §5: OMM handoff (SGP4 at zero time, TEME to GCRF) | FOUNDATION | Vallado 2006; Crawford 2006. Its benefit is now measured: E7, Jankovic 2026 |
| §5: levels of measurement of OMM fields | NARROW, low value | Not found elsewhere; the pipeline never computes on raw fields. One sentence |
| §5: format quantization (12 m per 0.0001°) | FOUNDATION | Format precision; one sentence |
| §5, §9: OMM uncertainty by TEAG/ESPF | DROP | Not taken; E10 |
| §6: fit compensation; formal covariance | FOUNDATION | Estimation textbooks; one statement |
| §7: association, selection | FOUNDATION | With E3's measured result |
| §9, §16.3: admissible regions, angles-only IOD | FOUNDATION or DROP | Milani 2004; DeMars & Jah 2013. Keep only if the catalog runs IOD |
| §10: Vimpel refinement, 6–11 km → 53–70 m | FOUNDATION | Consistency with one provider; results page |
| §11: AOE catalog integration | DROP | No data acquired; not taken |
| §12: possibility and necessity in screening | FOUNDATION | Delande 2018; Balch 2019; CA paper only |
| §13: content-addressed distribution; SGP4 companions | FOUNDATION | SupGP, eGP; E11 measures ours |
| §14: pre-registered gates | FOUNDATION | One paragraph |
| §16.7: SP-to-open model mapping | FOUNDATION | NRC 2012; Berry & Healy 2004; Storz 2005. Keep the table as equivalence status |
| §16.1–16.6, 16.8–16.9: gaps, roadmap, sequencing | DROP | Future work |
| §17.1–17.2: Orekit agreement; V1 | FOUNDATION | Keep both tables |
| §17.3: VCM units | NARROW (engineering) | Keep, condensed |

## 3. CA paper technical claims

| Claim | Verdict | Surviving claim or note |
| --- | --- | --- |
| Uniform spatial grid for all-vs-all pairs; GPU f32 superset re-tested in f64 | FOUNDATION | Healy 1995; Sonawane 2026; Stevenson 2023 |
| Self-bounded motion: a per-step bound from the trajectory's own Chebyshev coefficients | NARROW | Prior filters bound orbit geometry (Alfano 2012; Rivero 2023; Srinivas 2026). Survives: a motion bound that makes the coarse test exhaustive for any propagator, impulsive maneuvers at interval joins included |
| Convexity proof, then Newton on range rate | FOUNDATION | Denenberg 2020; the q < 1 test is a detail |
| 32,514 objects, three days, 19 s | Measured property | Performance with its procedure; no method claim |
| SOCRATES replay on identical inputs | FOUNDATION | Verification |
| Empirical covariance from consecutive sets, scaled on precise orbits; calibration gate | FOUNDATION | Osweiler 2006; Geul 2017; Thompson 2019; Zaidi & Hejduk 2016 |
| Screening rules compared on real calibrated errors | NARROW | Balch 2019; Elkantassi & Davison 2022; Ravago 2025; Modenini 2022. Survives: missed-collision and false-alert rates from real error samples |
| Homomorphic private screening | FOUNDATION | Hemenway 2016; Kamm & Willemson 2014; Suh 2024, 2025 (a co-author of the CA paper is on it); Lage 2025; Fedele 2024. None cited today |
| Output leakage, probing cost, physics check, tube mask, budgets, truncated Laplace noise | NARROW | Not in the abstracts read; Hemenway's 2014 RAND report not found or read. Check it first |

## 4. Surviving novel claims for the catalog paper, in priority order

| # | Claim | Evidence a paper needs (data, test, threshold) | Have now |
| --- | --- | --- | --- |
| 1 | DCA-form JB2008 correction from public operator states, scored by prediction of objects that did not calibrate it (E13 1) | E13's held-out Doves, Swarm and GRACE-FO, plus non-fleet satellites with precise orbits (Sentinel-1, CryoSat-2, COSMIC-2, SLR spheres), over a block with a storm. Pass: 3-day error ratio against JB2008 with upper bound < 1; σ(ln ρ) beside HASDM's 0.078 | E13 Part R plan; Starlink collector on 324 satellites. No results |
| 2 | Planned thrust in operator forecasts tested against execution at fleet scale; thrust-aware prediction (E13 3, Starlink lane) | Successive SpaceX files for ≥ 1,000 satellites over ≥ 2 weeks; distribution of executed minus planned Δv; thrust-aware 24 h error, with interval, well below drag-only's 2.76 km | 25 satellites, one day; E4's 298 files |
| 3 | Realised vs stated operator covariance by horizon, fleet scale | Mean d²/3 and 95 % coverage per horizon against fresh-OD heads, ≥ 1,000 satellite-files, 48 h seam and maneuvers handled | Five start pairs: along-track 6–65 m against 1σ of 180–436 m; 25 satellites today (0.18 km realised at 24 h); E4: SpaceX in-track σ 3.3 km at 24 h |
| 4 | Operator propagator identification (E12) | Synthetic recovery ≥ 90 % per axis on Orekit and GMAT truths with known settings; then each operator's configuration with margins and closure | Draft plan, generator, truths. No results |
| 5 | Ten months of Planet states against Swarm and GRACE-FO, storm block held out (E13 2) | E13's H1, H2 and time-shift control H6 on the held-out block | Data on hand; plan staged. No results |
| 6 | One line each: E1's failure on an unseen plane; E2b's baseline overconfidence | As reported | Yes |

Nothing else in the current catalog paper is a contribution. Items 1–5 have
no results yet; each enters the paper only with them. Evidence for the other
NARROW items:

| Item | Evidence needed | Have now |
| --- | --- | --- |
| VCM units | More SP messages with precise truth (GPS, SLR) | Four messages; one GPS day |
| E10 (results page only) | As run | Yes |
| CA self-bounded motion | Bound never exceeded, any propagator, maneuvers included | Native test: never exceeded, ≤ 1.34× the true deviation |
| CA screening rules | Missed and false alerts by rule on real errors | 10,000 cases per row, calibrated strata |
| CA leakage and defences | Leakage measured; defences built and attacked | Leakage measured (87 % of steps within 2×); defences not built |

## 5. Ranked novel directions

Ranked by expected gain toward HAC-grade accuracy from public and login
data. Feasibility: S under a week, M a few weeks, L a program.

| Rank | Direction | Why | Build on | Feasibility | CA consequence |
| ---: | --- | --- | --- | --- | --- |
| 1 | Thrust-aware prediction for station-kept fleets | Starlink forecasts balance drag with planned thrust; drag-only fits miss by 2.76 km at 24 h against SpaceX's 0.18 km | A. Liu 2024, 2026; T.-R. Liu 2026; Maisonobe & Parraud 2023 | High, S–M: data and thrust term on hand | 2,532 objects came within 5 km of a Starlink in one three-day screen (CA §8); their miss errors fall toward sub-km |
| 2 | Open DCA from public operator ephemerides, spheres and POD satellites, validated on non-fleet objects | The DCA is the HAC's main LEO advantage; E5 shows the gain from good but late inputs (0.155 → 0.056) | As E13 (1) | Medium–high, M–L | Drag error dominates 1–3 day debris uncertainty |
| 3 | Open DCP-like density-forecast consider term | HAC covariances carry the DCP; forecast drivers add σ(ln ρ) 0.28–0.34 (E8) | Hejduk 2019; Hejduk & Snow 2018; Gondelach, Linares & Siew 2022; Parker 2023; Paul 2023 | High, S | Realistic drag-regime covariance, so calibrated Pc |
| 4 | Operator covariance realism and plan execution, published as factors by horizon | Operator ephemerides are the best public states for about 11,000 satellites | Zaidi & Hejduk 2016; Park 2019; Canal 2026 | High, S | Pessimistic covariance dilutes Pc; factors correct it |
| 5 | TraCSS public SP ephemerides (C.21) and `cdm_public` (C.18) as comparison targets | First public measurement of SP accuracy by regime, and of our gap to it | Wolff 2025; Magnus & Hejduk 2024; Borowitz 2024; Canal 2026 | C.21 on release; C.18 now (login), S | Event-by-event agreement with SP-based CA |
| 6 | Operator propagator identification used to extend operator forecasts | Removes model systematics from operator-derived products | Dyreby 2025 | Medium, M | Operator objects beyond the files' spans |
| 7 | Planet fleet as density and attitude-mode sensor | Public B histories; attitude modes separate Cd·A from ρ | Ray, Scheeres & Alnaqbi 2021; Foster 2015, 2018; Ray 2023 | Medium, M | Indirect, through density |
| 8 | SGP4-XP companions fitted to operator ephemerides and precise orbits | At 24 h, XP was 5.7× better than an OMM fitted to the same Starlink heads | Payne 2022; Holincheck & Cathell 2021; Conkey & Zielinski 2022 | High, S; licence purpose clause (F.9) first | Better SGP4-based screening |

## 6. What must come out

1. Catalog §11 (AOE): not taken, no data.
2. Catalog §16.1–16.6 and 16.8–16.9: gaps, roadmap and sequencing are
   future work.
3. Catalog §5 "TEAG and the ESPF are in development" and §9 "Proposed TEAG
   and ESPF evaluation": future work; E10 measured the ESPF far behind the
   UKF. E10, if reported, gets its own results page.
4. Catalog §13 "Catalog and Space Aware interface": outside catalog
   synthesis and CA.
5. Build status and development notes: catalog §2 "remain integration
   work"; §3 acquisition status and "development instances"; §15 test counts
   and "blocked under machine overload".
6. Catalog §10 and §14 "next study" paragraphs; §1 tasking prose; §12
   statements that a result is not claimed.
7. The Vimpel 6–11 km → 53–70 m result as a summary headline: it is
   consistency with one provider.
8. CA paper: "HPOP" for the point-mass + EGM2008 20×20 resident model
   (summary, §5, §6, §7, §9). HPOP means full force; rename it or rerun the
   screen with full force.
9. CA paper development history: the patched WasmEdge note (§3), "How the
   time came down" and the first-version paragraph (§6), and the empty
   "Validation findings" heading.
10. CA §8 without its prior art (§3 above). Checks not yet built move to the
    module document; stake and identity belong to the security paper.
11. Any wording that implies novelty for: the OMM handoff, Starlink-derived
    density, element-set density calibration, fitting operator ephemerides,
    SGP4 fits to them, spatial-grid screening, or homomorphic CA.

## 7. Structure and targets

One statement per method: citation, measured accuracy, link to the
experiment. Tables over prose; nothing repeated. [NEW] marks where a
contribution enters the pipeline, once it has results.

**Catalog paper: 117 KB to about 45 KB.**

| Current section (KB) | Action | New section (target KB) |
| --- | --- | --- |
| Summary (2.8) | Keep, rewrite: products, inputs, measured accuracy, [NEW] items | 1 Summary (1.5) |
| §1 (4.9), §2 (2.7) | Merge; tables only; cut tasking prose | 2 Evidence model and records (2.5) |
| §3 (2.7) | Replace by a source-class table linking hac-sources.md | 3 Sources (2.0) |
| §4 (3.5); §5 contract; §16.7 dispatch | Merge; conversions by citation | 4 Normalization and model dispatch (2.0) |
| §5 rest (≈ 9) | Result to 5.3; quantization to one sentence; field-level table and OMM uncertainty cut | — |
| New | One row per method with accuracy and link | 5 Products by object class (11): GNSS and SLR (1); operator-ephemeris objects (4: E4 A6, E11, XP; [NEW] E12, thrust, covariance realism); OMM-only objects (2: SGP4, E1, E7, E7v2); drag regime (4: JB2008, DCA form, E5, E8; [NEW] E13) |
| §6 (3.7), §9 (3.4), §16.2 | Merge; ESPF cut | 6 Uncertainty (3.0): formal × χ², OMM history (E2, E2b), P₀ and Q gate, operator covariance |
| §8 (3.4), §16.7 table, §17.1–17.2 (≈ 9) | Merge | 7 Dynamics and verification (4.0): force table with SP-equivalence status, Orekit and V1 tables |
| §7 (3.0) | Keep with E3 and E2b results | 8 Association and selection (1.5) |
| §17.3 (2.6) | Condense | 9 SP message interchange (1.2) |
| §13 (3.5), §15 (2.1), §17.4 | Merge; cut UI and build status | 10 Publication and reproduction (1.5) |
| §14 (2.2) | Merge with one accuracy table: class × horizon, ours beside public GP and the HAC's public figures | 11 Measured accuracy (2.0) |
| §12 (3.5) | Cut to the interface | 12 What CA consumes (0.6) |
| §10 (2.8) | Results page; one row in 5 | — |
| §11 (2.9); §16 roadmap (≈ 24) | Cut | — |
| Appendix A (7.1) | Terms only; symbols inline | Appendix A (1.5) |
| References (11.5) | One-line entries; add §8 | References (7) |

**CA paper: 51 KB to about 24 KB.**

| Current section (KB) | Action | Target KB |
| --- | --- | --- |
| Summary (3.5) | Rewrite | 1.2 |
| §1–2 (1.8) | Keep | 1.5 |
| §3 (5.4) | Keep the bound table, grid and refinement; cite filters and grids; cut the WasmEdge note | 3.5 |
| §4–5 (3.7) | Merge; Chebyshev background to two cited lines; rename or rerun the resident model | 1.5 |
| §6 (3.8) and §9 (1.1) | Keep the result tables; limits as one line; cut development history | 2.5 |
| §7 (9.4) | Error model, gate table, SOCRATES table and rules table; add citations | 4.5 |
| §8 (15.9) | Protocol, measured cost and leakage, defences as one table; derivations to the module document | 5.0 |
| References (5.7) | Add §8 entries | 4.5 |

## 8. Related work the papers should cite

R: read; A: abstract only; M: metadata only (Crossref or arXiv record).
Entries marked "inventory" carry the status given in hac-sources.md.

- **Density from operator data and public tracking.** Ou et al. 2025,
  Remote Sens. 17:1549, 10.3390/rs17091549 (A). Yamamoto 2026, Earth Planets
  Space, 10.1186/s40623-026-02509-5 (R by E13). Yamamoto & Sori 2026,
  ibid., 10.1186/s40623-026-02402-1 (A). Fitzpatrick, Sutton, Pilinski & Palo
  2026, Space Weather, 10.1029/2025SW004611 (A, preprint
  10.22541/au.176244733.31846582/v1).
  Gershman 2026, NASA, 10.64631/vfnq1575 (A). Gondelach & Linares 2020, Space
  Weather, 10.1029/2019SW002356 (inventory) and 2021, 10.1029/2020SW002620
  (A). Ray, Sutton, Thayer, Hesar & Strobel 2023, AMOS, 10.64861/xyil6825
  (A, per E13). Parker & Linares 2026, Space Weather, 10.1029/2025SW004729
  (A, per E13). Further entries: E13 PLAN.md §2. Constant et al. 2024, arXiv:2408.16805 (A). Forootan et al. 2022, Sci. Rep.,
  10.1038/s41598-022-05952-y (M). Doornbos 2012, Springer Theses,
  10.1007/978-3-642-25129-0_6 (M). Foster et al. 2018, JSR,
  10.2514/1.A33927 (M).
- **Density uncertainty in CA.** Hejduk & Snow 2018 (inventory). Gondelach,
  Linares & Siew 2022, JGCD, 10.2514/1.G006481 (M). Parker et al. 2023,
  10.22541/essoar.170224537.74737191/v1 (M). Paul, Licata & Mehta 2023,
  ASR, 10.1016/j.asr.2022.12.056 (M).
- **Starlink ephemerides and maneuvers.** Dyreby, Caldas & Soares 2025,
  arXiv:2510.11242 (A). A. Liu et al. 2024, ASR, 10.1016/j.asr.2024.06.038;
  2025, Chin. Astron. Astrophys., 10.1016/j.chinastron.2025.03.005; 2026,
  ASR, 10.1016/j.asr.2025.12.078 (M). T.-R. Liu et al. 2026, ASR,
  10.1016/j.asr.2026.03.062 (M). Guo et al. 2026, MAD-LEO, arXiv:2609.08556
  (A). Jankovic 2026, "How long can you trust a Starlink TLE?",
  arXiv:2605.19850 (A).
  Maisonobe & Parraud 2023, ASR, 10.1016/j.asr.2022.10.039 (M).
- **Element sets: correction, covariance, numerical use.** Hallgarten La Casta & Amato 2025,
  ASR, 10.1016/j.asr.2025.03.046 (M). Peng & Bai 2019, JAS,
  10.1007/s40295-019-00158-3 (M). Acciarini, Baydin & Izzo 2025, Acta
  Astronaut., 10.1016/j.actaastro.2024.10.063 (M). Moody, Axelrad & Russell
  2026, IEEE Aerospace, 10.1109/AERO66936.2026.11520009 (M). Geul, Mooij & Noomen 2017, ASR,
  10.1016/j.asr.2017.02.038 (M). Thompson et al. 2019, AMOS,
  10.64861/twqd5985 (M). Racelis & Joerger 2018, AIAA, 10.2514/6.2018-5241
  (M). Crawford, Vallado, Hujsak & Kelso 2006, IAC, 10.2514/6.IAC-06-C1.P.5.03
  (M). Levit & Marshall 2011 (inventory). From the E1, E2 and E2b plans, not
  checked here: Ly, Lucken & Giolito 2020; Osweiler 2006 (AFIT thesis);
  Flohrer, Krag & Klinkrad 2008; Julier & Uhlmann 1997.
- **SGP4-XP.** Payne et al. 2022, 10.64861/ohug4581; Holincheck & Cathell
  2021, 10.64861/whme5585; Conkey & Zielinski 2022, 10.64861/bmaw2693 (R,
  inventory).
- **Covariance realism and SP catalogues.** Zaidi & Hejduk 2016,
  10.2514/6.2016-5628 (M). Park et al. 2019, AMOS, 10.64861/hqnw9754 (M).
  Canal et al. 2026, Acta Astronaut., 10.1016/j.actaastro.2026.01.063 (M).
  Wolff et al. 2025, AMOS, 10.64861/xwvp8211 (M). Magnus & Hejduk 2024, IAA,
  10.52202/078360-0065 (M). TraCSS specifications and policy (inventory C.21).
- **Screening.** Healy 1995, JGCD, 10.2514/3.21465 (M). Alfano 2012, Celest.
  Mech. Dyn. Astron., 10.1007/s10569-012-9421-3 (M). Rivero, Bombardelli &
  Vazquez 2023, arXiv:2309.02379 (A). Srinivas et al. 2026, arXiv:2610.11645
  (A). Sonawane 2026, 10.20944/preprints202610.0012.v1 (A). Stevenson et al.
  2023, ASR, 10.1016/j.asr.2023.01.036 (M). Denenberg 2020, Acta Astronaut.,
  10.1016/j.actaastro.2020.01.020 (M). Balch, Martin & Ferson 2019, Proc. R.
  Soc. A, 10.1098/rspa.2018.0565 (M). Elkantassi & Davison 2022, JGCD,
  10.2514/1.G006282 (M). Ravago et al. 2025, AMOS, 10.64861/paeo6437 (M).
  Modenini, Curzi & Locarini 2022, JSR, 10.2514/1.A35234 (M). Delande,
  Houssineau & Jah 2018, ASR, 10.1016/j.asr.2018.06.033 (M).
- **ESPF.** Jah & Haslett 2025, arXiv:2508.20806; Jah 2026,
  arXiv:2603.10065 (A).
- **Private CA.** Hemenway, Lu, Ostrovsky & Welser 2016, LNCS,
  10.1007/978-3-319-44618-9_9 (M). Kamm & Willemson 2014, Int. J. Inf. Secur.,
  10.1007/s10207-014-0271-8 (M). Suh et al. 2024, IAA,
  10.52202/078376-0027 (M), and 2025, arXiv:2501.07476 (A). Lage et al. 2025,
  arXiv:2501.09397 (A). Fedele et al. 2024, AIAA SciTech,
  10.2514/6.2024-0271 (M).

## 9. Searches

2026-10-10: 194 serial requests ≥ 3.5 s apart, back-off honouring
Retry-After: Crossref 169 (68 titles, 81 topic queries from 2005, 20 DOIs),
arXiv 24. OpenAlex's first answer was HTTP 429 with Retry-After 14,765 s (not
retried); Semantic Scholar was not used. Topics: density from constellations,
element sets and assimilation; density error in CA; operator ephemeris
accuracy, covariance and maneuvers; element-set correction and covariance;
SGP4-XP; force-model identification from ephemerides (no hits); amateur RF;
screening filters and grids; private CA; dilution; TraCSS and SP accuracy.
No paywalled paper was read; Crossref holds no AMOS abstracts.
