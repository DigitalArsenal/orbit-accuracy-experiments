# site

The GitHub Pages site. It runs the experiments' own modules
(`propagator/hpop`, `foundation/time`, `analysis/vcm-adapter`) in the
visitor's browser through `space-data-module-sdk`'s browser harness, framed
by the same `harness/prw.mjs` and `harness/time.mjs` the experiments use in
Node, on a CesiumJS globe (vendored, no ion token, the Space Data Network's
Blue Marble as its only imagery). Nothing is fetched from a third party.

| Section | What runs |
| --- | --- |
| Live | HPOP from a V1 seed with a chosen force model, 72 h, every sample against the precise orbit; then the six V1 horizons alone, compared with `results/v1` seed by seed (they match exactly). Downloads: CSV, CZML, the PRW request and result, a run record. |
| Results | V1's committed metrics. |
| Verification | The 63 HPOP-against-Orekit 13.1 cases; any one re-runs here from its exact PRW request. |
| VCM | The survey's sample VCM read, propagated 24 h with its 7×7 covariance and written back, under both readings of the B row's units. |
| Data | Every file with its SHA-256, source and terms (`provenance.json`). |

## Paper models

`models/<paper>/<section_id>.html` runs one whitepaper section's computation
with the same modules: the catalog paper (osculating elements, the TLE
handoff and its quantization, OCM fields and Φ P₀ Φᵀ, Orekit, V1, VCM
parity, E1–E3 results, the binaries), the screening paper (pair counts, the
motion bound, step size, refinement, Alfano and Foster probabilities, all in
`analysis/conjunction-assessment`), and the adversarial-security paper (HD
derivation, signatures and X.509 binding in the public `hd-wallet-wasm`; the
bond, payoff and trust-decay formulas, which no module implements, evaluated
in the page). `src/models/registry.mjs` lists them; the build checks each
heading against the paper's markdown (`SDN_WHITEPAPERS`, default the stack's
`space-data-network/whitepapers`) and writes `models/index.json`:

```json
[{ "paper": "fast-conjunction-assessment", "section_id": "refinement", "title": "…", "url": "models/fast-conjunction-assessment/refinement.html" }]
```

`section_id` is the heading id `docs/build-whitepapers.mjs` gives the
section. Each page stands alone in an iframe, takes `?theme=light|dark` or a
`{sdnTheme}` message, and sets `<body data-done>` when its first run ends.
The conjunction module uses shared WebAssembly memory: embedded in a page
without cross-origin isolation, those six models offer to open in their own
tab, where the service worker isolates them. E1, E2 and E3 show
`results/<id>/metrics.json` once it is committed.

## Build

```sh
cd site && npm ci && cd ..
export SDN_MODULES_ROOT=…/space-data-network-modules
export SDN_REFERENCE_STATES=…/reference-states/reference
export SDN_EOP_C04=…/reference-states/products/eopc04.1962-now
node site/run-orekit.mjs        # when the HPOP binary changes: site/generated/orekit-results.json
node site/build.mjs             # site/dist
node site/serve.mjs             # http://localhost:8080 with COOP/COEP
```

`build.mjs` refuses to publish Orekit results recorded with a different HPOP
binary than the one it publishes. It never reads a Space-Track element set.

## Cross-origin isolation

HPOP and the VCM adapter are built with shared WebAssembly memory, which a
browser grants only to a cross-origin-isolated page. GitHub Pages cannot set
the COOP/COEP headers, so `coi-serviceworker` (MIT) adds them: the first
visit reloads once. `serve.mjs` sets the headers directly.

## Publishing

The `gh-pages` branch holds `site/dist` (`publish.sh` in the stack's
runner directory builds and pushes it); Pages serves that branch's root.
