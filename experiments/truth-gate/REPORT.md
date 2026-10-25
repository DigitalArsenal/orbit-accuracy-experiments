# Truth ingest gate

Every truth reader of the experiments passes the states it reads through one gate, `harness/truth-gate.mjs`, before anything is scored against them. The gate drops a state that its ledger (`flags.json`, written by `scan.mjs`) lists for the product and object, and any state that fails the sanity rule. A dropped state is not replaced by an analysis center's orbit: a center's solution differs from the combination's at the meter level, and one missing state is a gap every scorer already handles.

## Rules

- **Center rule** (where analysis centers publish the same product): a combination state more than 1 km from the centers' median while the centers agree within 10 m.
- **Sanity rule**: a position coordinate exactly zero, a position that is not finite, or a position inside the central body.
- **Jump rule**: a state whose consistency with both neighbors (the trapezoid residual |r1 − r0 − (v0 + v1) dt / 2|, or the second difference of equally spaced positions) exceeds max(10 km, 10 × the series' median), gaps over 1200 s excepted; dropped when the full force model (propagator/ffm) carried from the previous good state misses it by more than 1 km, reported when there is no confirmation.

## Readers

- `harness/reference.mjs` (`ReferenceIndex.frames`, `referenceFramesStartingIn`): E1, E2, E2b, E4, E10, E14; a frame is re-encoded without its dropped states, and returned unchanged when none drops.
- `experiments/e3-combined-catalog/truth.mjs` (`Products.load`): E3, E5, E6, E7, E8, E13, E16, V1c, V1c2 to V1c5, and G1's refits.
- `experiments/e14-covariance-realism/common.mjs` (`Truth.frames`), `experiments/e6-public-observations/steps/40-slr-fit.mjs`, `experiments/v1-ffm-physical-truth/seeds.mjs`.
- G1 (`experiments/sdn-gp-starlink-ffm-match/lib/`): `sources.mjs` (reference states, the NASA ISS file, SpaceX MEME files), `iss-oem.mjs` (the NASA ISS archive), `packs.mjs`, `spk-sources.mjs`; through them B1, B2 and the SDN-AP GP-history experiment.
- `experiments/supgp-omm/worker.mjs`: the operator ephemerides it reads as they are fetched (nothing of them is stored, so the scan has no copy to read).
- E2b and E14 also keep their own radius screens; `experiments/etalon2-anomaly` and `scan.mjs` read the files as written.

## Sets scanned

| Set | Directory | Size | States |
| --- | --- | --- | ---: |
| ILRS combined weekly orbits against the analysis centers (SP3) | `/opt/data/sdn-archive/reference-states/products`, `/opt/data/sdn-archive/v1c5/truth/download-cache/products` | 210 weekly groups | 583,968 |
| reference-states | `/opt/data/sdn-archive/reference-states/reference` | 3,446 products, 80,158 objects | 40,338,647 |
| reference-states finals2000a | `/opt/data/sdn-archive/reference-states/reference-finals2000a` | 649 products, 22,370 objects | 11,940,727 |
| reference-states LEO POD 2 | `/opt/data/sdn-archive/reference-states/reference-leo-pod-2` | 17,909 products, 17,909 objects | 1,457,080 |
| V1c5 refreshed truth | `/opt/data/sdn-archive/v1c5/truth/reference-finals2000a` | 106 products, 2,860 objects | 1,213,627 |
| G1 laser-ranging copies (CDDIS) | `/opt/data/sdn-archive/sdn-gp-starlink-ffm-match/slr-ref/reference` | 102 products, 102 objects | 236,964 |
| G1 GFZ rapid orbits | `/opt/data/sdn-archive/sdn-gp-starlink-ffm-match/gnss-rapid/reference` | 24 products, 1,354 objects | 391,306 |
| E14 MGEX orbits | `/opt/data/sdn-archive/e14-covariance-realism/reference` | 1,825 products, 34,666 objects | 12,055,040 |
| V1c5 re-score truth | `/opt/data/sdn-archive/v1c5-rescore/truth/reference` | 3,657 products, 3,657 objects | 515,627 |
| NASA ISS trajectory files | `/opt/data/sdn-archive/hac/nasa-iss-oem-archive`, `/opt/data/sdn-archive/hac/nasa-iss-oem` | 749 files | 4,189,211 |
| G1 truth packs | `/opt/data/sdn-archive/sdn-gp-starlink-ffm-match/pack` | 11 packs | 485,336 |
| G1 SPK windows | `/opt/data/sdn-archive/hac/naif-kernels/spk/missions`, `/opt/data/sdn-archive/hac/mast-tess/models` | 6 objects | 130,366 |
| operator-capture (SpaceX first 8 h) | `/opt/data/sdn-archive/operator-capture/cycles` | 66,971 records | 3,281,579 |

## Flagged states

8 states, 20 ledger entries: every state is found by the center rule and by the jump rule, and the 2026-10-10 week is held in two truth copies. All are single 00:00 states of the ILRS combined weekly orbits at which the combination wrote a coordinate as 0 (experiments/etalon2-anomaly).

| Product | NORAD | Epoch | Rules | Miss, km | Action |
| --- | ---: | --- | --- | ---: | --- |
| ilrsa.orb.etalon1.260411.v80 | 19751 | 2026-04-10T00:00:00Z | center, jump | 9997.868 | drop |
| ilrsa.orb.etalon1.260530.v80 | 19751 | 2026-05-25T00:00:00Z | center, jump | 3057.580 | drop |
| ilrsa.orb.etalon1.260530.v80 | 19751 | 2026-05-29T00:00:00Z | center, jump | 3118.977 | drop |
| ilrsa.orb.etalon2.260411.v80 | 20026 | 2026-04-10T00:00:00Z | center, jump | 8133.528 | drop |
| ilrsa.orb.etalon2.261010.v80 | 20026 | 2026-10-05T00:00:00Z | center, jump | 7552.278 | drop |
| ilrsa.orb.etalon2.261010.v80 | 20026 | 2026-10-06T00:00:00Z | center, jump | 13580.309 | drop |
| ilrsa.orb.etalon2.261010.v80 | 20026 | 2026-10-08T00:00:00Z | center, jump | 2126.881 | drop |
| ilrsa.orb.etalon2.261010.v80 | 20026 | 2026-10-09T00:00:00Z | center, jump | 7897.190 | drop |

No state was screened without a confirmation.

## Results the drops reach

The smallest miss of a dropped state is 2126.881 km.

| Experiment | Truth | Dropped states in its windows | Evidence | Verdict |
| --- | --- | ---: | --- | --- |
| E2b (e2b-correlated-covariance) | SLR-MEO from ilrsa.orb., nsgf.orb.lares2. | 4 | own truth screen: radius departure over 10 km | unaffected: its own screen excluded every dropped state in its windows |
| E14 (e14-covariance-realism) | every product under its reference roots (ETALON-1 and ETALON-2 among its MEO objects) | 4 | own truth screen: radius departure over 10 km | unaffected: its own screen excluded every dropped state in its windows |
| E16 (e16-cross-regime-epoch) | SLR-MEO from ilrsa.orb.lageos1, ilrsa.orb.lageos2, ilrsa.orb.etalon1, ilrsa.orb.etalon2, nsgf.orb.lares2 | 4 | no screen; the largest single error any published test cell allows (RMS x sqrt(n)) against the smallest miss; largest single error allowed: 851.5 km (q1.tiers.LEO.T.ages.3) | unaffected: no published cell can hold an error the size of a dropped state |
| E7 (e7-full-force-handoff) | SLR-MEO from ilrsa.orb.lageos1, ilrsa.orb.lageos2, ilrsa.orb.etalon1, ilrsa.orb.etalon2, nsgf.orb.lares2 | 2 | no screen; the largest published error (every variant and horizon, H-truth included) against the smallest miss; largest error: 27.276 km (test) | unaffected: no published error is the size of a dropped state |
| E3 (e3-combined-catalog) | truth prefixes ESA0OPSFIN, SW_OPER_SP3, S1C_OPER_AUX_POEORB, S1D_OPER_AUX_POEORB, nsgf.orb., ilrsa.orb. | 0 | windows | unaffected: no dropped state in its windows |
| V1 (v1-ffm-physical-truth) | ILRS weekly arcs 260808, 260815 | 0 | arcs | unaffected: no dropped state in its arcs |
| V1c5 | ilrsa.orb.etalon2.261010.v80 (V1c5 refreshed truth) | 4 | experiments/etalon2-anomaly/rescore-v1c5.json: re-scored without the samples near the dropped states | re-scored: unchanged (the selected model and 0 of 24 realistic cells); the Etalon-2 samples within 1 h of a dropped state are labeled wrong truth |
| V1c4 | ilrsa.orb.etalon2.261010.v80 (test issues 2026-09-27 to 2026-10-08, horizons to 72 h) | 4 | the durable run is not on this machine | labeled: its SLR MEO cells (results/v1c4 README, mean d²/3 of order 1e8 at 24 to 72 h) carry these wrong truth states |
| G1, B1 (SDN-AP baselines), B2 (mixed screening), SDN-AP GP history | G1 laser-ranging copies (CDDIS) and NSGF orbits | 0 | flags.json: no drop in their sets | unaffected |

V1c4's and V1c5's published READMEs are rendered from their metrics and checked by their own end-to-end checks, so their labels are kept here and in `experiments/etalon2-anomaly/FINDINGS.md`.

## Reproduce

```
SDN_MODULES_ROOT=<modules checkout> node experiments/truth-gate/scan.mjs --only <part>   # centers, reference, iss, packs, spk, capture
node experiments/truth-gate/scan.mjs --merge
node experiments/truth-gate/affected.mjs
node experiments/truth-gate/report.mjs
node experiments/truth-gate/check.mjs   # end-to-end check
```
