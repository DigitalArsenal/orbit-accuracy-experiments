# Public ephemeris census and propagator comparison

**Status: incomplete catalog coverage.** This replaces the ten-spacecraft pilot as the population definition; it is not yet an all-catalog accuracy result.

The frozen local inventory contains **57,413 source/object identities**, representing **33,105 source-reported numeric NORAD/catalog IDs** plus **24 unresolved source identities**, across **301,554 files**. Multiple sources may describe the same object; these totals are deliberately distinct. There is no spacecraft or source cap.

Ephemeris archives identify **11,518 distinct numeric IDs** across **11,697 source/object entries**. These include provisional operator IDs; full SATCAT identity validation remains open. GP feeds add catalog membership, not independent truth. The Space-Track membership includes 10,467 debris, 18,999 payload, 2,230 rocket body, 1,349 unknown; debris and rocket bodies are not mislabeled spacecraft.

Numerical/accounting outcomes: **47,414 finished; 9,999 pending**. Live provider inventories reconciled: **0/17**. A finished coverage or parser failure is not a successful propagation.

## Source coverage

| Source | Local files | Source/object identities | Resolved NORAD | Finished / pending | Provider inventory |
|---|---:|---:|---:|---:|---|
| spacex-starlink | 116,182 | 11,170 | 11,170 | 1,180 / 9,990 | local_inventory_unavailable |
| eutelsat-oneweb | 0 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| planet | 750 | 172 | 167 | 172 / 0 | local_inventory_unavailable |
| iss | 770 | 1 | 1 | 1 / 0 | local_inventory_unavailable |
| ses | 0 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| intelsat | 0 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| telesat | 0 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| css-tiangong | 0 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| gps-precise | 1,347 | 64 | 32 | 64 / 0 | local_inventory_unavailable |
| glonass-precise | 0 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| esa-pod | 99,248 | 125 | 125 | 125 / 0 | local_inventory_unavailable |
| eumetsat | 207 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| cpf | 0 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| spire | 0 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| space-track | 2,005 | 33,045 | 33,045 | 33,045 / 0 | local_inventory_unavailable |
| vimpel | 0 | 0 | 0 | 0 / 0 | local_inventory_unavailable |
| cpf-edc | 2,310 | 4 | 4 | 4 / 0 | local_inventory_unavailable |
| sentinel-1 | 1,798 | 3 | 3 | 3 / 0 | additional archive; no provider reconciliation |
| swarm | 2,052 | 3 | 3 | 0 / 3 | additional archive; no provider reconciliation |
| ilrs | 2,178 | 11 | 11 | 11 / 0 | additional archive; no provider reconciliation |
| cosmic-2 | 35,016 | 5 | 5 | 0 / 5 | additional archive; no provider reconciliation |
| doris | 802 | 10 | 10 | 10 / 0 | additional archive; no provider reconciliation |
| gfz-gnss | 33,567 | 107 | 107 | 107 / 0 | additional archive; no provider reconciliation |
| grace-fo | 2,924 | 2 | 2 | 2 / 0 | additional archive; no provider reconciliation |
| sscweb | 3 | 3 | 0 | 3 / 0 | additional archive; no provider reconciliation |
| mast-tess | 20 | 1 | 1 | 0 / 1 | additional archive; no provider reconciliation |
| naif-spacecraft | 11 | 8 | 0 | 8 / 0 | additional archive; no provider reconciliation |
| jpl-horizons | 28 | 8 | 0 | 8 / 0 | additional archive; no provider reconciliation |
| operator-archive | 82 | 0 | 0 | 0 / 0 | additional archive; no provider reconciliation |
| operator-derived | 166 | 0 | 0 | 0 / 0 | additional archive; no provider reconciliation |
| celestrak-supgp | 88 | 12,671 | 12,654 | 12,671 / 0 | additional archive; no provider reconciliation |

Full Starlink record/epoch audit: **11,170 identities checked; 11,162 eligible; 8 with insufficient fit coverage**. 2,143,271 selected epochs survive OEM framing unchanged. This is a coverage/framing check; it is not completion of the numerical batch.

A zero means no identified local object for that source, not an empty upstream catalog. The inventory probes target planned local SDN mirrors at 127.0.0.1 ports 7201–7216 and 7184. Their failure is not evidence that the public ephemeris websites are unreachable. Registered endpoints are deployment metadata, not proof of active ingestion. Credentialed feeds remain in the source reconciliation; a private commercial feed does not count as public truth.

Endpoint recheck (2026-10-26T20:56:49.428Z): public HTTP responses are recorded separately from local mirror failures. HTTP success is not a complete inventory or proof of authentication to a credentialed dataset.

| Source | Endpoint checked | HTTP status / transport error |
|---|---|---|
| spacex-starlink | [public-data-or-index](https://api.starlink.com/public-files/ephemerides/MANIFEST.txt) | 200 |
| eutelsat-oneweb | [upstream-origin-only](https://ephemeris.oneweb.net) | 200 |
| planet | [public-data-or-index](https://ephemerides.planet-labs.com/planet.states) | 200 |
| iss | [public-data-or-index](https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt) | 200 |
| ses | [upstream-origin-only](https://www.ses.com) | 200 |
| ses | [upstream-origin-only](https://ses-satellite-orbital-data-public.s3.eu-west-1.amazonaws.com) | 403 |
| intelsat | [upstream-origin-only](https://my.intelsat.com) | 200 |
| telesat | [upstream-origin-only](https://app.telesat.com) | 200 |
| css-tiangong | [upstream-origin-only](https://www.cmse.gov.cn) | UND_ERR_CONNECT_TIMEOUT |
| gps-precise | [upstream-origin-only](https://igs.bkg.bund.de) | 200 |
| glonass-precise | [upstream-origin-only](http://navigation-office.esa.int) | 200 |
| glonass-precise | [upstream-origin-only](https://navigation-office.esa.int) | 200 |
| esa-pod | [public-data-or-index](https://navigation-office.esa.int/products/gnss-products/) | 200 |
| eumetsat | [upstream-origin-only](https://service.eumetsat.int) | 200 |
| cpf | [upstream-origin-only](http://navigation-office.esa.int) | 200 |
| cpf | [upstream-origin-only](https://navigation-office.esa.int) | 200 |
| spire | [upstream-origin-only](https://api.orb.spire.com) | 403 |
| space-track | [upstream-origin-only](https://www.space-track.org) | 200 |
| vimpel | [upstream-origin-only](http://spacedata.vimpel.ru) | 200 |
| cpf-edc | [upstream-origin-only](https://edc.dgfi.tum.de) | 200 |

## Accuracy on available support

Results are separated by product lineage and evidence class. Only successful common support enters paired ratios; all missing coverage and numerical failures remain in the denominators in [summary.json](summary.json). No numerical orbit-regime classification has yet been added.

| Lineage | Evidence | Lead | XP / AP / FFM successes | Median RMS metres XP / AP / FFM | FFM/XP paired ratio |
|---|---|---:|---:|---|---:|
| cnes-doris-poe | precise-reconstruction | 1 d | 10 / 10 / 6 | 646.37 / 646.41 / 1.02 | 0.00 |
| cnes-doris-poe | precise-reconstruction | 3 d | 10 / 10 / 6 | 1865.76 / 1865.91 / 9.58 | 0.01 |
| cnes-doris-poe | precise-reconstruction | 7 d | 10 / 10 / 6 | 4357.18 / 4358.44 / 125.17 | 0.06 |
| esa-gnss-final | precise-reconstruction | 1 d | 124 / 124 / 0 | 89.94 / 89.94 / — | — |
| esa-gnss-final | precise-reconstruction | 3 d | 125 / 125 / 0 | 248.37 / 248.37 / — | — |
| esa-gnss-final | precise-reconstruction | 7 d | 125 / 125 / 0 | 594.70 / 594.70 / — | — |
| gfz-grace-fo-rso | precise-reconstruction | 1 d | 2 / 2 / 2 | 2573.73 / 2573.73 / 326.28 | 0.13 |
| gfz-grace-fo-rso | precise-reconstruction | 3 d | 2 / 2 / 2 | 18937.53 / 18937.53 / 3262.01 | 0.17 |
| gfz-grace-fo-rso | precise-reconstruction | 7 d | 2 / 2 / 2 | 83365.61 / 83365.61 / 5050.64 | 0.06 |
| gfz-mgex-rapid | precise-reconstruction | 1 d | 105 / 105 / 0 | 99.80 / 99.80 / — | — |
| gfz-mgex-rapid | precise-reconstruction | 3 d | 106 / 106 / 0 | 270.28 / 270.28 / — | — |
| gfz-mgex-rapid | precise-reconstruction | 7 d | 106 / 106 / 0 | 652.94 / 652.94 / — | — |
| ilrs-combination | precise-reconstruction | 1 d | 2 / 2 / 0 | 125.50 / 125.50 / — | — |
| ilrs-combination | precise-reconstruction | 3 d | 2 / 2 / 0 | 159.39 / 159.39 / — | — |
| ilrs-combination | precise-reconstruction | 7 d | 2 / 2 / 0 | 272.25 / 272.25 / — | — |
| nsgf-orbit | precise-reconstruction | 1 d | 1 / 1 / 0 | 188.01 / 188.01 / — | — |
| nsgf-orbit | precise-reconstruction | 3 d | 1 / 1 / 0 | 448.79 / 448.79 / — | — |
| nsgf-orbit | precise-reconstruction | 7 d | 1 / 1 / 0 | 1006.25 / 1006.25 / — | — |
| sentinel-1-poeorb | precise-reconstruction | 1 d | 3 / 3 / 3 | 880.18 / 850.47 / 0.74 | 0.00 |
| sentinel-1-poeorb | precise-reconstruction | 3 d | 3 / 3 / 3 | 2012.69 / 1687.17 / 25.71 | 0.01 |
| sentinel-1-poeorb | precise-reconstruction | 7 d | 3 / 3 / 3 | 6958.33 / 4431.74 / 1206.65 | 0.26 |
| starlink-capture-heads | operator-reconstruction | 1 d | 1180 / 1180 / 721 | 2857.14 / 2740.32 / 1669.07 | 0.69 |
| starlink-capture-heads | operator-reconstruction | 3 d | 0 / 0 / 0 | — / — / — | — |
| starlink-capture-heads | operator-reconstruction | 7 d | 0 / 0 / 0 | — / — / — | — |

Covariance calibration diagnostics, 2,000-resample object-cluster intervals, arm failures and common-support timing are in the aggregate JSON. Reference covariance is not assumed when absent. These results do not establish calibrated Pc or operational conjunction performance.

## Remaining gaps

- All-catalog coverage is unproven while source inventories remain unreconciled or raw archives remain unparsed. The failed loopback API probes do not establish an upstream source outage.
- Counts describe the frozen local archive, not all objects currently advertised upstream.
- Numeric NORAD/catalog IDs are reported by the sources, not independently crossmatched against the full SATCAT; some operator IDs are provisional.
- One arc per source/object; no spacecraft cap. No residual-based selection.
- No independent Space Force XP result: the earlier WASM validity failure remains unresolved.
- Operator heads are reconstruction evidence, not independent physical truth; missing reference covariance is explicit.
- Native orbit-regime classification and full raw-format reconciliation remain open.
- Runtime on this shared host is descriptive; retain accuracy improvements regardless of speed cost.
- The earlier 21/21 NASA CARA Pc integral tests do not certify covariance or conjunction performance for this larger population.

## Reproduce

The [frozen plan and dated amendment](../../experiments/propagator-catalog-census/PLAN.md) define selection and environment inputs. The [configuration](../../experiments/propagator-catalog-census/config.json) pins the pilot settings, module revision and source registry. Raw ephemerides, fitted elements and per-epoch statistics remain local.

```sh
node experiments/propagator-catalog-census/census.mjs --run registered
# Place the exact amendment-pinned GFZ weather file in the run environment directory.
node experiments/propagator-catalog-census/catalog.mjs --from registered --run catalog
node experiments/propagator-catalog-census/batch.mjs --from catalog --run catalog-epochs --modules "$SDN_MODULES_ROOT"
```

The finite batch runs every object, generates this report and then executes the real-archive E2E. It can resume interrupted execution with unchanged provenance. The earlier strict-grid run is retained separately: its 45-second sampling rule admitted only 91 Starlink identities. The dated amendment selects operator states within half their ten-minute cadence, uses their actual timestamps for propagation/scoring, and retains the original 45-second exact-lead covariance test. No state interpolation or epoch relabeling is used.

The census refuses to overwrite a frozen snapshot. The runner resumes only outcomes with matching execution provenance and uses four workers. It does not sample spacecraft or remove slow cases. Report generation can show an explicitly incomplete run. Verification of available readers does not close missing-source gaps.
