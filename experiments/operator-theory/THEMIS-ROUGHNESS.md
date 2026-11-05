# THEMIS track roughness (registered 2026-11-05, before any row)

Record: modules-sdn-ap-themis-track-roughness-20261105. Report only: no module, threshold or published figure changes.

## Observation
On the published THEMIS worked examples, AP 0.5.1's error track (RIC offsets from the reference, 300 s) has a median absolute
second difference of 3.06 m (best-highly-elliptical-themis-and-chandra, THEMIS D, cutoff 2013-02-13), against 0.15 m for whiteroom
XP on the same build and 0.07 m for AP 0.4.11 (the example as published before stack pin 7632521a72).

## Windows
AP6.md's HX regime, THEMIS only (lib/regimes.mjs HX): THEMIS A, D and E from NASA NAIF's public kernels
(THEMIS_<letter>_2013_039_055.bsp), cutoffs 2013-02-11, 13, 15 and 17, a 72 h fit arc: 12 windows, read exactly as
all-regimes.mjs reads them (spkOnGrid at 300 s, GCRF through foundation/frames, T.thinned arc, coverage 0.9). Vacuum: no drag, no
$SPW, as the stored HX rows. Chandra is not flown (its examples show no roughness: 0.06 m on both builds).

## Builds (propagator/sdn-ap dist/isomorphic/module.wasm by git show at the commit, SHA-256 checked; never a working tree)
| Version | Modules commit | SHA-256 |
| --- | --- | --- |
| 0.4.11 | a0f33bc545d76f47d679c7854c6963fb8efcf799 | e4edacb03daff4eaba47263010c27009a6d888259c0d8f028605cebf4d655610 |
| 0.5.1 | ea824356587f54149f876cd3b2b5d8134af682d3 | d29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb |
| 0.6.0 (final) | 895b6b38d (dist from c826cdc39) | 0b5280f05176fc755dbfb859fd8028fc495759d7537024c53043f498c91faa63 |

Bisection builds (the last committed dist of each release between them; hashes recorded in table.json at run time):
0.4.12 0fb671753, 0.4.13 c938b91d8, 0.4.14 5e9f42619, 0.4.15 d50689f1e, 0.4.16 1ec779200, 0.4.17 3ae1eb289, 0.4.18 6fcce5b3c,
0.5.0 1f806e4bf. Releases before 0.5.0 take the $OMM path (fit emits $OMM; propagate takes $OMM, an epoch grid and the $PCF);
0.5.0 on take one $OCM.

## Arms
AP: FORCES (31, 20) without atmosphere, as all-regimes.mjs's PCF_AP_VACUUM. XP: the module's stock forces. Each fit on the
window's arc, flown at every grid epoch in (cutoff, cutoff + 7 d] at 300 s. The error is forecast minus reference in the
reference's RTN axes (analysis/gp-error-model through openModules().rtn), meters. Every state from a module.

Control: on every build with a stored HX store (0.4.11 ap/b0411/regimes-hx, 0.5.1 ap/b051/regimes-hx) the AP72 and XP72 day 1, 2, 3
and 7 3D RMS from this run's states equal the stored rows to 1 mm; a miss voids that build's rows.

## Metric
Roughness: the median over the forecast of |e(t+h) - 2 e(t) + e(t-h)|, the Euclidean norm of the second difference of the RIC error
vector, h = 300 s (the stored step), over consecutive grid samples only (a triple across a gap is skipped). Also per axis (R, I, C)
and per lead day 1 to 7. Per window, then the median over the 12 windows per arm and build.

Scale: per lead day 1 to 7, the 3D RMS error of AP on the same build and window; the statistic is roughness over that error, and the
roughness's largest window value against AP's day-3 error.

## Ablation plan (AP arm; each a fit and flight on the 12 windows)
1. Release bisection: AP on 0.4.12 to 0.5.0. The release at which roughness leaves 0.4.11's level names the change; its SPEC
   section names the term.
2. FORCES on 0.5.1 and 0.6.0 (the only switches $PCF exposes for these terms): tesseral cap d in {0, 4, 8, 12} with zonal 20, and
   (31, 0). d = 0 removes every output-time tesseral family of SPEC 16.2 (m-daily, first-order including 16.11's wide set,
   near-resonant) while keeping the zonal tail, the third-body terms of 16.8 and the one-day class grid.
3. Fit against flight, at the release found in 1 when it takes $OMM: the earlier release's set flown on the later release and the
   reverse.
4. Structural reading: the power spectrum of AP's second-difference track on 0.5.1 (each window, 7 days at 300 s), its five largest
   peaks in cycles per day and as multiples of the fitted mean motion (read from the fitted record).
Suspects named by the record and how each is reached: the resonance integrator's step (fixed by the module: 38 min for AP in the
one-day class in every build here, 0.4.11 included, 95 min for XP; no $PCF switch; reached through 1 and 4: a node-grid term shows at
multiples of 1/38 min); the Sun and Moon refresh cadence (no switch; reached through 1 and 2: d = 0 keeps it); the space-weather
interpolation (not on this path: HX flies in vacuum without $SPW).

## Verdict rule
The responsible term is named when one ablation returns the median roughness on 0.5.1 or 0.6.0 to within 2x of 0.4.11's and the
bisection places the rise at the release that introduced that term; else the ablation set is stated as inconclusive with its numbers.
The term moves the error when removing it changes the median day-3 or day-7 3D error by more than 10 % (stated either way).

## Outputs
Rows: /opt/data/sdn-archive/operator-theory/themis-roughness/rows-<shard>.jsonl (one row per window, build and arm: per-day RMS,
roughness per day and axis, the spectrum's peaks). Table: results/ap-truth/themis-roughness/table.json and README.md.
E2E: `node experiments/operator-theory/themis-roughness.mjs --check` re-derives table.json from the rows, holds the control, and
requires 0.5.1's AP roughness on THEMIS D 2013-02-13 within 25 % of the published 3.06 m figure (forecast span only here; the
published figure spans fit and forecast).

## Amendment 1 (2026-11-05, written after one smoke window and before the full run; committed while the run was in progress, after its first bisection rows; it changes no verdict rule)
The smoke window (THEMIS D 2013-02-13, the six main arms) held the control exactly and read AP roughness 0.071 m on 0.4.11 and
3.095 m on 0.5.1 and 0.6.0. Its second-difference spectrum is the same comb of mean-motion harmonics on every arm, 0.4.11 and XP
included (the perigee passes dominate the power), so reading 4 cannot separate the term. Two readings are added, both from the rows
and their stored tracks, metric and control unchanged: (a) the roughness of the triples whose middle sample lies inside and outside
the window's median reference radius; (b) the spectrum of the difference track AP(31,20) minus AP(0,20) on 0.5.1 (what the tesseral
terms add to the flown track), its five largest peaks in cycles per day and as multiples of the fitted mean motion.
