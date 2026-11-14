# Synthetic orbit record reduction

The reducer and converters use installed, lockfile-pinned packages. Install them with
`npm ci`. No modules checkout is required for these three tools; supply the unsigned
WASM file with `--wasm` or `--ref-wasm`. Paths are resolved from arguments and module
URLs, including checkout paths containing spaces.

```sh
SDM_MODULE_UNSIGNED_BUILD=1 node experiments/synthetic-orbits/reduce.mjs \
  --truth truth-ocm.fsdata --seeds seed-ocm.fsdata --records records.fsdata \
  --wasm module.wasm --fail-on failed-flight,no-truth,short-truth,at-or-after-decay
```

Every selected fit produces one row: `within-bar`, `outside-bar`, `failed-flight`,
`no-truth`, `short-truth`, or `at-or-after-decay`. Failed flights retain the module's
status name. Input validation failures carry a named status. A truth shorter than
120 hours cannot count within any bar. A fit refused before it produced a record
cannot be reconstructed from the fitted-record stream.

Matching reads catalog name, case name and designator, exercise status, object
number, and both provenance links (identity, SHA-256 and byte length). Missing study
identity is an error. The catalog is SYNTHETIC-ORBITS, object number is 0, and status
is EXERCISE. Fit, truth and seed case names must agree.

Repeated MESSAGE_IDs, or multiple fits for one case, mean-element theory and fit suffix, are
errors. `--newest` selects the greatest CREATION_DATE; missing dates or tied times
are errors. Superseded frames are counted separately. Selected row classes sum to
selected records; that sum plus superseded records equals physical input frames.
The fit suffix is the part of HEADER.MESSAGE_ID between the 12-hex build hash
and the final theory separator (`<case>:<build><fit suffix>:<theory>`).
Different fit suffixes retain separate rows; identities without this format use
an empty suffix. Build changes alone do not distinguish a technique.
The frame index exposes the same policy as `{ newest: true }`.

`--compare expected.json` checks a JSON result table; it does not supply reduction
inputs. All counts, classes, case rows and missing-information statements must match,
including circHigh. A mismatch exits nonzero. Module hash and elapsed time are not
part of this table. Earlier partial aggregate tables fail this complete comparison.
A refused or failed fit is a counted study result, so the default exit code is zero; `--fail-on` names the classes that fail a run.
`--fail-on` takes comma-separated class names; an unknown name is an error.

The converters build temporary streams beside their targets, verify frame tiling,
count, identities and content, then rename. They reject an output that aliases an
input. An empty replacement of a non-empty target requires `--allow-empty`.
Truth conversion accepts `--out` and `--seeds-out`; a limited conversion
requires new output paths. Interruption before publication leaves existing targets
intact. The two truth-converter renames are separate operations, not a transaction
across both files. Both streams are written and verified before either rename;
seeds are renamed first, then truths. A mismatched-pair failure names this cause. Stop concurrent stream appenders before conversion. Conversion
omits creation dates so equal seed/truth inputs produce deterministic records.
Each converter removes its own temporary streams on normal exit, refusal, exception,
SIGINT and SIGTERM. SIGKILL can leave temporary files. Startup reports each leftover
for the same target; it deletes none of those preexisting files.

`run.mjs` writes seed and truth streams as well as fitted streams and result rows.
A failed seed/truth write produces `stream-write-failed`, recorded on the case,
counted in the run summary, and reflected in a nonzero exit status.

## Environment

The record reducer and converters do not read environment variables directly.
Their module SDK uses `SDM_MODULE_UNSIGNED_BUILD=1` to allow unsigned builds.
Signing is not part of these commands.

The verification test reads `SDN_AP_WASM` for an unsigned sdn-ap 0.6.58
build whose SHA-256 is recorded in `test/fixtures/synthetic-reduce/module.sha256`, or `SDN_MODULES_ROOT` for its `propagator/sdn-ap/dist/isomorphic/module.wasm`.
It fails with a prerequisite message when the matching build is absent. The test
uses committed made-up records and deterministic variants described in
`test/synthetic-fixtures.mjs`; the complete expected result is committed JSON. Classifications and counts are also
asserted independently from the fixture construction. A different build fails
with the required SHA-256 before any scored comparison.

The study's run, dense, claim and factorial tools also use these settings:

| Variable | Purpose |
| --- | --- |
| SDN_MODULES_ROOT | Modules checkout and installed hosting packages |
| HEADLINE_LOOP_STORE | Destination root for result rows, truth caches and reference builds |
| HEADLINE_LOOP_CHECKOUT | Checkout whose installed package versions the package guard checks |
| HEADLINE_LOOP_HOSTS | `registered` enforces registered host-package versions; otherwise installed hosts are recorded |
| SPACE_DATA_NETWORK_MODULES_ROOT | Modules root supplied to the factorial subprocess harness |
| SDNAP_DIST_DIR | Artifact directory supplied to the factorial subprocess harness |
| SDM_MODULE_UNSIGNED_BUILD | Allows unsigned module artifacts in the SDK harness |

Run the focused verification with:

```sh
SDN_AP_WASM=module.wasm node --test test/synthetic-reduce.test.mjs
```
