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
| Verification | The 63 HPOP-against-Orekit 13.1 cases; any one re-runs here from its exact PRW request, except the four that read CSSI space weather or SET's JB2008 indices (not republished), which show their recorded result. |
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
Each model also draws what it computes in 3D (`src/models/scene.js`: one
CesiumJS widget per page, loaded when the model runs, no ion, the Blue Marble
as the only imagery): orbits, covariance ellipsoids, error histories in
radial, in-track and cross-track axes, encounter planes, and the key graphs
of the security paper. Every point drawn is a module output, or the page's
inputs and its evaluation of the paper's formulas; magnifications are
stated on the view.

The conjunction module uses shared WebAssembly memory: embedded in a page
without cross-origin isolation, those six models offer to open in their own
tab, where the service worker isolates them. E1, E2 and E3 show
`results/<id>/metrics.json` once it is committed.

## 03 // Orbit Determination

`models/evidence-supported-aso-catalog/<section_id>.html` for the section ids
`od-batch-fit`, `od-ekf-ukf`, `od-association` and `od-conjunction`
(`src/od/registry.mjs`; listed in `models/index.json` with
`"section": "03 // Orbit Determination"`). One scenario: GPS on 2026-08-02.
`build-od.mjs` writes its inputs from the IGS final orbits
(`analysis/reference-states` output in `SDN_REFERENCE_STATES`) with modules:
a dense truth (`propagator/hpop` between IGS epochs), a catalog (each IGS
state at 00:00 propagated by HPOP with covariance, two satellites withheld),
and an `analysis/observation-simulator` request (truth in ITRF from
`foundation/frames`, visibility from `analysis/access`, the Sun from HPOP's
DE440). In the browser the pages run the simulator, `analysis/association`,
`analysis/estimation` (batch, EKF, UKF; bindings of its module-local schema
are generated into `site/.cache/estimation` by flatc at build time) and
`analysis/conjunction-assessment`. The conjunction's second object is
hypothetical and says so.

## Licences

Every file the build writes goes through `write()`, which takes its label from
`data/licenses.json` (`harness/data-licenses.mjs`, `labelFor`): the file's
licence and credit are its sources' own, `provenance.json` carries them per
file, and a source the registry does not allow us to reproduce fails the build.
Not reproduced: CSSI space weather and SET's JB2008 indices (SET sends no CORS
header, so a browser cannot fetch them either). The four Orekit cases that read
them are listed as recorded only. The sample VCM stays, labelled with its
provenance (owner, 2026-10-10: public sources).

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
