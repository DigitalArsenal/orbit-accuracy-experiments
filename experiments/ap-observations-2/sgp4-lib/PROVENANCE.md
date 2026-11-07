# propagator/sgp4 request encoders: provenance

A byte-identical copy of the files `propagator/sgp4/tests/lib/payloadEncoders.mjs` loads, from space-data-network-modules 5da8d709375ba410aa75cfcb0c89fa006f7ff82c
(`git show 5da8d709:propagator/sgp4/<path>`), Apache-2.0. `lib.mjs` imports it to encode the SGP4 arm's requests and checks it
on every import; `SGP4_LIB` overrides the directory (one holding `tests/lib/payloadEncoders.mjs`).

| File | Source | SHA-256 |
| --- | --- | --- |
| `tests/lib/generated/orbpro/entity/entity-kind.js` | `propagator/sgp4/tests/lib/generated/orbpro/entity/entity-kind.js` | `44d79a21eb6b85d68d535fb3967778321292a4981ee48dea0c941be162f427eb` |
| `tests/lib/generated/orbpro/entity/entity-metadata.js` | `propagator/sgp4/tests/lib/generated/orbpro/entity/entity-metadata.js` | `42225d9f703caa7899cc01b21cca02e3138b5df75eac2357c839f599ef24bdec` |
| `tests/lib/generated/orbpro/plugins/propagator-state.js` | `propagator/sgp4/tests/lib/generated/orbpro/plugins/propagator-state.js` | `f733c4af3ef63d6620f7a86b09949c69cf0f436df498b1a4a221890482c38b70` |
| `tests/lib/generated/orbpro/plugins/reference-frame.js` | `propagator/sgp4/tests/lib/generated/orbpro/plugins/reference-frame.js` | `40a8002dd2878434b99f94b9e3e3f92b7a59d378b90e28a035b1b3086b83144f` |
| `tests/lib/generated/orbpro/propagator/propagator-batch-request.js` | `propagator/sgp4/tests/lib/generated/orbpro/propagator/propagator-batch-request.js` | `524875f1d1fdb3885fe3e70f65bf6abfb0f9ae2754eb2ee09ac1ec91eb64f85b` |
| `tests/lib/generated/orbpro/propagator/reference-frame.js` | `propagator/sgp4/tests/lib/generated/orbpro/propagator/reference-frame.js` | `4b56bed4234ff76322ecc8dfa726cade5084a3ce5a3e1c08a5b1b0ce3726de6b` |
| `tests/lib/generated/orbpro/query/catalog-query-kind.js` | `propagator/sgp4/tests/lib/generated/orbpro/query/catalog-query-kind.js` | `88688094a9d21d71a66412b7b72e2c5cd1b48d78f2f941a377ab4e657a9cd96a` |
| `tests/lib/generated/orbpro/query/catalog-query-request.js` | `propagator/sgp4/tests/lib/generated/orbpro/query/catalog-query-request.js` | `fff486336c305b3e731b6e9522c1c73e08825ecd3ee7204daefa713a6b226b70` |
| `tests/lib/generated/orbpro/query/catalog-query-result.js` | `propagator/sgp4/tests/lib/generated/orbpro/query/catalog-query-result.js` | `1a6522a5fa87ad1f49e81c2de8e58b2cf1b556060a1b6a03532ed9cd14c527d5` |
| `tests/lib/payloadEncoders.mjs` | `propagator/sgp4/tests/lib/payloadEncoders.mjs` | `73716100576358b57b3607b0c3423a4ebf988117fb934b81511660c09f5bbb99` |

Dependencies: flatbuffers 25.9.23 and spacedatastandards.org 1.276.0 (propagator/sgp4's own lock). The run (lane claude-aplaser2-d9) resolved them from an install of that lock in the lane's scratch; here they resolve from the read-only modules clone's `flows/observation-ap/node_modules` (the same versions, nothing installed into the clone), never from this repository's node_modules (spacedatastandards.org 1.243.0). The import loads 1679 files (these 10 and 1669 dependency files); their `<path> <sha256>` lines, paths relative to the copy and to the dependencies' `node_modules`, sorted, have the closure SHA-256 below in both installs. `lib.mjs` refuses to start otherwise.

```json
{
 "modulesCommit": "5da8d709375ba410aa75cfcb0c89fa006f7ff82c",
 "source": "propagator/sgp4",
 "files": {
  "tests/lib/generated/orbpro/entity/entity-kind.js": "44d79a21eb6b85d68d535fb3967778321292a4981ee48dea0c941be162f427eb",
  "tests/lib/generated/orbpro/entity/entity-metadata.js": "42225d9f703caa7899cc01b21cca02e3138b5df75eac2357c839f599ef24bdec",
  "tests/lib/generated/orbpro/plugins/propagator-state.js": "f733c4af3ef63d6620f7a86b09949c69cf0f436df498b1a4a221890482c38b70",
  "tests/lib/generated/orbpro/plugins/reference-frame.js": "40a8002dd2878434b99f94b9e3e3f92b7a59d378b90e28a035b1b3086b83144f",
  "tests/lib/generated/orbpro/propagator/propagator-batch-request.js": "524875f1d1fdb3885fe3e70f65bf6abfb0f9ae2754eb2ee09ac1ec91eb64f85b",
  "tests/lib/generated/orbpro/propagator/reference-frame.js": "4b56bed4234ff76322ecc8dfa726cade5084a3ce5a3e1c08a5b1b0ce3726de6b",
  "tests/lib/generated/orbpro/query/catalog-query-kind.js": "88688094a9d21d71a66412b7b72e2c5cd1b48d78f2f941a377ab4e657a9cd96a",
  "tests/lib/generated/orbpro/query/catalog-query-request.js": "fff486336c305b3e731b6e9522c1c73e08825ecd3ee7204daefa713a6b226b70",
  "tests/lib/generated/orbpro/query/catalog-query-result.js": "1a6522a5fa87ad1f49e81c2de8e58b2cf1b556060a1b6a03532ed9cd14c527d5",
  "tests/lib/payloadEncoders.mjs": "73716100576358b57b3607b0c3423a4ebf988117fb934b81511660c09f5bbb99"
 },
 "dependencies": {
  "flatbuffers": "25.9.23",
  "spacedatastandards.org": "1.276.0",
  "resolvedFrom": "flows/observation-ap/node_modules"
 },
 "closure": {
  "files": 1679,
  "sha256": "b783ee2ce57660dde6f54832def1b2672d4c4f09e393624b45fec0ff7b63af73"
 }
}
```
