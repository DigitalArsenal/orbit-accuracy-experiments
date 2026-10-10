# All-SupGP OMM pass

For every CelesTrak Supplemental GP set whose operator ephemeris can be had, fit an SGP4 OMM (B* fitted) to the
operator's own ephemeris on CelesTrak's window, score CelesTrak's set and ours on the same points, and record where
ours has the lower RMS. Task `supgp-omm-20261010`; builds on E11 (`task/e11-omm-fit-20261010`, not on main).

```sh
node experiments/supgp-omm/run.mjs [--groups starlink,iss,...] [--limit N] [--workers 6] [--closure]
  [--out DIR] [--supgp DIR] [--fit-modules DIR] [--reader-modules DIR] [--registry DIR] [--run-id ID] [--no-persist]
```

## Rules

- SupGP is read from our collector archive only (`/opt/data/sdn-archive/celestrak/supgp`). Nothing here contacts celestrak.org.
- Operator files live in memory and are never written. Only derived records are: our OMM, the exact statistics,
  convergence, the gate, the chosen version and its provenance (URL, times, ETag, sha256 of the bytes fetched).
- At most 8 requests in flight per operator host, `User-Agent: sdn-supgp-omm/1.0`, a host that answers 403 or 429 is
  disabled for the run, Range GETs where the server honours them. At most 6 worker threads.
- All parsing and fitting are WASM. The fitter is gp-error-model 0.2.0 (`fit_elements`, `element_residuals`, branch
  `task/omm-fit-20261010`, read-only). The text left to JS is container framing: gunzip and unzip, the two marker lines
  and the dropped covariance block of the CCSDS KVN shim (`lib/readers/container.mjs`), the removal of Intelsat's
  `(MINUS)` annotations (`lib/readers/i11.mjs`), and identity crosswalks (Planet's TLE catalogue, the IGS metadata
  SINEX, file-name listings). No number is changed in JS.

## The gate and the pairing

CelesTrak publishes each set's RMS (per coordinate: 3D / sqrt 3, 3 decimals). The recomputed RMS of the set on the
window must reproduce it within max(5 m, 10 %). The gate is the frame guard and the version-pairing test: the
candidate versions near the EPOCH are tried in turn, and the one that reproduces the RMS is the pair. Among those
that do, a version holding the whole window beats one that starts after the EPOCH, a version that existed when the
snapshot was fetched beats a later one, then the closest RMS. A set no version reproduces is unpaired, with the
nearest miss as the reason. "Ours lower" counts only gate-passing pairs.

## The window

CelesTrak fits each set to a stretch of the operator's ephemeris and publishes the RMS of the fit. The window is
found, and shown, two ways (`summary.json`: `windowProof`, `windowFits`; `table.mjs` prints both):

- CelesTrak's set is scored on every version that holds the whole window, over the chosen window and over windows 0.5,
  0.75, 1.5 and 2 times as long from the same start; the window is right where the published RMS comes back.
- The version does not enter in the second: the least-squares minimum the model reaches over a window is a property of
  the ephemeris, and the published RMS is that of CelesTrak's own fit, so our fitted minimum over each window, divided by
  the published RMS, is 1 on CelesTrak's window and not on the others. It is run on the pairs that hold the whole window and
  reproduce the published RMS within 2 %: every set of the small groups, every tenth Starlink set (those are also fetched
  24 h deep, so that the longer windows rest on real points). A window longer than the ephemeris is not a test.

## Sources

| Group | Operator file | Window | Reader |
| --- | --- | --- | --- |
| starlink | SpaceX MEME, Range GET of the first states | [EPOCH, +12 h] | data-source/spacex-starlink-source |
| iss | NASA OEM | [EPOCH, +6 h] | files/orbit-products read_container |
| css | CMSE weekly OEM ZIP | [EPOCH, +6 h] | read_container |
| planet | `<hwid>_oem.txt` | [EPOCH, +24 h] | read_container |
| glonass | ESA rapid or final SP3 of the day | [EPOCH, +24 h] | read_container, reference-states |
| intelsat | IESS-412 weekly, previous and maneuver files | [EPOCH, +24 h] | normalize_ses_i11, reference-states |
| ses | IESS-412 files | [EPOCH, +24 h] | normalize_ses_i11, reference-states |
| cpf | EDC CPF of the day, per centre | [EPOCH, end of file] | data-source/cpf-source, reference-states |
| gps, oneweb, telesat, eumetsat, kuiper, iridium, orbcomm, ast | none can be had | - | recorded with the reason (`sources/unavailable.mjs`) |

SES and Planet replace their files in place (on 2026-10-10 the SES files read were created between 21:04 and 21:06 UTC,
the Planet files between 00:50 and 20:50 UTC), so the version CelesTrak fitted is gone once its file is replaced. A pass
pairs them only when it runs after CelesTrak's refit and before the operator's next replacement; `pairClasses` in
`summary.json` says which pairs rest on a version that holds the whole window and existed when the SupGP snapshot was
fetched (`complete-causal`) and which do not.

Starlink versions: SpaceX's MANIFEST lists only the newest version of each object. `seed-registry.mjs` adds earlier
manifests (name lists) to the registry; a file name is fully determined by its start (see `sources/starlink.mjs`).

## Guards

`known-answer.mjs` runs first: python-sgp4 ephemerides of known elements come back through `evaluate`, another
object's elements fail the gate, mismatched sets trip the guards, and NASA's ISS file with CelesTrak's ISS-E set
scores as python-sgp4 scores it. Per set (`lib/guards.mjs`): the OMM sent is the snapshot's row; the module answered
for that set, window and one element set; ours and CelesTrak's set are scored on the same n and span; the persisted
OMM is the fitted one and re-scores to the fit's statistics.

## Terms

Nothing raw is stored or redistributed, and the derived records stay under `/opt/data/sdn-archive/operator-ephemerides/`
(never committed). Known terms (E11's README): NASA ISS, U.S. Government work, public domain; Planet, CC BY-NC 4.0;
SpaceX Starlink, no licence statement, published for space-safety coordination. The rest state none: CMSE, SES,
Intelsat, ILRS CPF at EDC, IGS metadata. ESA/ESOC files (GLONASS rapid SP3) are under the owner's data-licence
question, so their derived records are local only.

## Output

`<out>/<run id>/run.json` (settings, checkouts, module hashes, snapshots, known answers, timing), and per group
`rows.jsonl` (one row per set), `omm.fbs` (size-prefixed `$OMM`, the row names its offset) and `summary.json`.
