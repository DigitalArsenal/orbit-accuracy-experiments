# Direct-feed native inventory

All 11,771 discovered resources have terminal inventory records. **Scientific comparison remains incomplete.**

17 registry entries, including 4 access gaps. 11,723 distinct downloaded byte payloads; 46 additional resource records repeat exact content.

| Source | Resources | Native state rows | Declared numeric IDs | Statuses |
|---|---:|---:|---:|---|
| spacex-starlink | 11163 | 47989471 | 11163 | decoded_native_frame: 11163 |
| eutelsat-oneweb | 1 | 0 | 0 | unsupported_physical_encoding: 1 |
| planet | 116 | 821028 | 99 | catalog_elements_only: 1; decoded_native_frame: 114; decoded_source_states: 1 |
| iss | 1 | 5402 | 0 | decoded_native_frame: 1 |
| ses | 41 | 133348 | 0 | decoded_native_frame: 40; download_unavailable: 1 |
| intelsat | 258 | 424178 | 0 | decoded_native_frame: 258 |
| telesat | 12 | 0 | 0 | partial_orbit_information: 12 |
| css-tiangong | 1 | 0 | 0 | download_unavailable: 1 |
| gps-precise | 40 | 219648 | 0 | decoded_native_frame: 40 |
| glonass-precise | 45 | 1251437 | 0 | decoded_native_frame: 45 |
| esa-pod | 49 | 1261541 | 0 | decoded_native_frame: 49 |
| eumetsat | 10 | 0 | 10 | catalog_elements_only: 10 |
| cpf | 34 | 16354 | 34 | decoded_native_frame: 34 |
| spire | 0 | 0 | 0 | credential_required |
| space-track | 0 | 0 | 0 | credential_required |
| vimpel | 0 | 0 | 0 | credential_required |
| cpf-edc | 0 | 0 | 0 | credential_required |

The direct snapshot declares 11,306 unique numeric spacecraft IDs; 0 are absent from the frozen archive census. Unresolved source identities and complete duplicate groups are retained in the JSON report. Explicit crosswalk reconciliation is separate.

Reproduce with `node experiments/propagator-catalog-census/normalization/report.mjs` after the registered inventory run. Reader validation and raw-byte verification are separate from this aggregation.

- Complete accounting means one terminal record for every discovered resource. It does not mean complete truth coverage, every historical product, or successful scientific scoring.
- No GCRF conversion or propagator accuracy calculation is performed here. Native-frame state counts include repeated products and are not counts of independent observations.
- Source identity keys may be slots, names or constellation identifiers, not unique spacecraft. No name-based or unpinned crosswalk merges are included.
- The frozen Starlink reader drops covariance and imposes a compact epoch grid. Raw epochs and covariance remain preserved; this inventory is not admitted for covariance scoring. The corrected reader requires a separately registered amendment.
- CPF, Intelsat ECF and position-only SP3 outputs contain native zero velocity slots; these are explicitly unavailable velocities, not measurements.
- SP3 per-epoch prediction/event flags are retained in hashed sidecars. A product label alone does not classify every sample as reconstructed truth.
- The two unsuccessful downloads and all four credential-required providers remain explicit gaps. Unsupported OneWeb orbital encoding and Telesat center-of-box data remain in denominators.
- Covariance availability is not calibration. The failed original calibration results are unchanged.
