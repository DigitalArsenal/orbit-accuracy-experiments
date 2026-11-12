# Covariance coverage rows

Every record sdn-ap (AP) writes states a covariance. These steps fly one build's own records on a fixed set of low-orbit windows and
set each stated sigma against the build's own error against the precise orbit, so that a change to the low-orbit theory is judged on
its own flights, against main's on the same windows. Every state, covariance and error comes from a module call (sdn-ap `fit` and
`propagate`, analysis/gp-error-model `pair_statistics`); the scripts here count.

## What each step makes

| Step | Makes |
| --- | --- |
| `windows.mjs` | `<out>/windows.txt`, one line per window and fit arc, and `<out>/windows.json` (its SHA-256, counts per regime, the near-700 km scored days): drawn from the stores, or a set drawn before taken as it is (`--from`, its SHA-256 checked) |
| `build.mjs` | `<out>/builds/<sha12>/module.wasm` and `build.json` (commit, SHA-256, version; the version, X.Y.Z and refused otherwise, picks the build's `$PCF`), from a file or from a modules commit; prints the sha12 |
| `covbuild.mjs` | `<out>/covbuild-<sha12>[-capsT-Z]-<k>of<n>.jsonl`: per window the record's `COV_PROPAGATION` and fit RMS, and every 30 min of the scored days the error (km) and the stated variance (km²) in the truth's R, T, N axes |
| `covterms.mjs` | `<out>/covterms-<sha12>[-capsT-Z]-<k>of<n>.jsonl`: the same, with each process-noise term's variance per axis (s_e, s_i, s_l and the drag rate: one more flight per term with its size doubled, the term being a third of the difference) and the record's mean elements |
| `summary.py fixture` | the rows a test registers, without name, catalog number or date (a window is its regime, fit arc, side of the split rule and `COV_PROPAGATION`), optionally with the build's radial floor factor taken off; and the judged cells: per regime, day and axis the median \|z\| and the shares within 1 and 3 sigma, at factor 1 and at the registered radial factor, each cell outside the band [0.603, 0.754] named |
| `summary.py compare` | a change against main on the windows both flew: the floor factor per axis fitted on the change's choice windows with its own factor off; every judged cell for main, the change factor off, as flown and with the fitted factors; main's in-band cells the change takes out, and too-narrow cells it makes narrower |
| `summary.py terms` | the factor on one term's sigma for one axis, fitted on the choice windows; that axis's judged cells before and after, the largest change on the other two; with `--to`, the rows a test re-weights |
| `check.mjs` | the end-to-end check: a sample of the registered windows (13 by default) flown again by the registered build and written as fixture rows, each equal to a registered row; SKIPPED, never passed, where the registered files or the build are absent |
| `size-split-rule.json` | the split rule (SHA-256 `d3177de7fe71ad9ef048ec7e1c2d9d2e9d9748b7fa4320349897d06ee15642a0`, checked by `summary.py`): strong drag 2025 chooses and strong drag 2026 is judged; laser spheres and altimetry choose before a cutoff of 2025-11-15 and are judged from it. The rule file gives near 700 km no choice date; `summary.py` judges a row the rule does not date, so near 700 km is judged only |

## The window set

Strong drag 2026 (every window and fit arc the numerical arm flew and the AP table scored at day 5), strong drag 2025 (the same, every
4th), laser spheres and burn-free altimetry (at most 60 per row and fit arc, no burn from the fit arc's start to cutoff + 5 days) and
near 700 km (no burn to cutoff + 3 days, scored on days 1 to 3); the rule is in `windows.mjs`. The registered set is 748 windows
(strong drag 2025 236, 2026 306, laser spheres 71, altimetry 87, near 700 km 48), SHA-256
`c2f7fd4049bb88a011ff837e84c942ae55ab26fb55a34a06a3ec9c59a7354d85`, the file kept with the registered rows on the machine that holds the
stores. The table grows as windows are scored: drawn on 2026-11-12 the set holds 952 (strong drag 2026 510). A build compared against
rows flown on the registered set is flown on that set (`--from`).

## A new build

```sh
OUT=<a directory outside this repository; every step refuses one inside it, through links and in any letter case>
export SDN_MODULES_ROOT=<a space-data-network-modules checkout holding the commit experiments/xp-atmosphere-merit registers>
node windows.mjs "$OUT" --from <the registered windows file> --sha256 c2f7fd4049bb88a011ff837e84c942ae55ab26fb55a34a06a3ec9c59a7354d85 --s1-days 3
node build.mjs "$OUT" file <module.wasm> <its SHA-256> <commit> <version>      # or: git <modules checkout> <commit>; prints <sha12>
for k in 0 1; do nohup nice -n 19 node covbuild.mjs "$OUT" <sha12> $k/2 --caps 31,70 > "$OUT/covbuild-$k.log" 2>&1 & done
python3 -I summary.py fixture "$OUT" <sha12> 31-70 --caps 31,70 [--factor-off f --registered f] [--to <dir>]
python3 -I summary.py compare "$OUT" <main sha12>-caps31-70 <sha12>-caps31-70 --writes <the floor factors the change writes, e.g. 1,1,1>
```

`--caps 31,70` fits every record at tesseral degree 31 and zonal degree 70, the degrees the low table's records take from 0.6.42; its
other forces are the row's own `$PCF`'s. A stopped shard resumes where it stopped. covbuild takes about 0.5 s per window per process
(748 windows in about 3 min on two); covterms five flights per window (about 6 min on two). The readers of the truth, the scored
epochs, the thinned fit arc and the weather issued at the cutoff come from `experiments/headline-loop/lib`, and the stores from
`HEADLINE_LOOP_STORE` (default `/opt/data/sdn-archive/headline-loop`: the numerical arm's rows `f0b8352a43f3`, the AP table
`048ffe19d63e`). Drawing a set anew also needs the burn detector's final lists (`--burns`, `experiments/burn-detector`). Python 3 with
numpy.

A window whose fit or flight fails is written as an error row; `summary.py` leaves it out and counts it in its output, and a resumed
shard does not fly it again (delete its line to fly it again). `summary.py` reads only the windows of `<out>/windows.txt` and counts
the stated variances at or below zero, which it keeps at 1e-14 km².

The window files and the rows in `<out>` name real satellites and dates. The fixture rows (`summary.py fixture`, and `terms --to`) are
per-sample rows of real windows with their names, numbers and dates taken out. They are kept in the archive beside the registered
window file and are never committed to any repository. The reason: a row's fit RMS and floors are unique to its window, and its
drag-rate share gives the object's decay rate, so someone holding public element histories could match it back. Only the judged cells
go into a repository.

## Checks (2026-11-12)

On the registered set the steps reproduce what was registered before they were packaged here: for the build at modules commit
`3e4dcbbe` (0.6.42, wasm SHA-256 `1ddff52cf42c...`) at 31/70 with its radial factor exp(0.10) taken off, `summary.py fixture` writes rows byte-identical
to the registered ones (SHA-256 `dc54dafd6da1816734de29cd7f1319e6f023f783d664240e6090912149881be6`) with the same 42 judged cells and
factor fit; `summary.py compare` of 0.6.39 (modules commit `94351f34`, wasm `7a857d632d04...`, records at 31/20) against it gives the
same 54 cells and fitted radial factor 1.0997; `summary.py terms` on s_i's cross-track term gives k = 0.111, the same 18 cells and rows
SHA-256 `7c09a378af17c0fdc0decfaae17209d0a57bef5848328f028d7fabfe4f2fa928`; `covbuild.mjs` and `covterms.mjs` fly 13 and 8 of the
registered windows again, every row byte-identical to the registered flights; `check.mjs`: 13 of 13 sampled windows equal to the
registered rows.
