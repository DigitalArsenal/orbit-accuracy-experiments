# TESS re-score on the ten-minute nodes (registered 2026-11-05, before any row)

Record: experiments-tess-cells-rescore-20261105 (owner 2026-11-05: "rescore it."). Report only: no site, cell or example changes here. TESS returns to the
comparison only if both conditions below hold, in a later site record.

## Windows
cells.json's Highly elliptical rows (lib/regimes.mjs TESS): TESS (NORAD 43435), MAST definitive kernels `TESS_EPH_DEF_*.bsp`, cutoffs 2026-07-27, 08-03,
08-10, 08-17, 08-24, 08-31 and 09-07 (00:00 UTC), fit arcs of 72 h and 336 h ending at the cutoff, vacuum, leads to 7 days: 7 windows, read as all-regimes.mjs reads them.

## Truth
Two series from the same kernels, newer files taking over from their first state (13:00 UTC), the truth gate applied, EME2000 to GCRF by foundation/frames:
- N, node-only: the reader of experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs (`nodeRows`, db3b1ab5): the kernels' ten-minute nodes only. The
  script's N series must equal `spkObjectSeries` state for state.
- C, chord-filled: the same records before `nodeRows` (the reader as cells.json read it): every one-minute record, nine in ten on the straight line between
  nodes, thinned to 300 s.
Truth is read only at the nodes for every N figure: never interpolated. Each lead day's bin is every node in (cutoff + (k - 1) d, cutoff + k d]. The lead
ends (cutoff + 24, 48, 72 and 168 h) are 00:00 UTC, on the 600 s node lattice: every lead lands exactly on a node. A scored epoch off a node would be
scored at the nearest node and counted; the script counts them (expected 0) and fails if one is interpolated.

## Arms (each fitted on its arc and flown on the window's grid; every state from a module)
AP: propagator/sdn-ap 0.5.1 (cells' build, ea824356, d29acd2b5d92), FORCES (31, 20) without atmosphere. XP: whiteroom XP, the same module with its stock
forces. XPU: the Space Force's XP, propagator/sgp4-xp 0.2.1 (816fd137d761), its predictions only. SGP4: analysis/gp-error-model 0.11.0 fit, propagator/sgp4
1.4.1. FFM: analysis/estimation 0.7.0 and propagator/ffm 2.0.4 (c36f1b14fc23), all-regimes.mjs's high-orbit settings (20 x 20, Sun, Moon, SRP).

## Scores
Error: forecast minus truth in the truth's RTN axes (analysis/gp-error-model), 3D RMS per lead day; per cell the median and 95th percentile over windows.
- CC: fit on C, flown and scored on C's 300 s grid (the chord-filled figures; control below).
- NN: fit on N, flown and scored on N's nodes (the clean re-score).
- CN: fit on C, flown and scored on N's nodes (splits a change into its fit and its scoring parts).
Also each arm's error at the lead epoch itself (a node). Artifact size per arm, fit and lead: NN median minus CC median.

Control: CC per window, arm, fit and day equals the stored before rows (results/ap-truth/tess-nodes-20261105.json `windows`, rounded as there), and CC's cells
equal cells.json's TESS rows; NN equals that file's after values. A miss voids that arm's rows.

## The day-3/7 worsening (72 h fit)
Worsening: NN above CC by more than 10 % in the median over the 7 windows at day 3 or day 7, for AP, XP or FFM. Gone: no such arm.

Ablation plan, every arm C and N (CC, NN), on the 7 windows at the 72 h fit:
1. Fit or scoring: CN against CC and NN. Scoring share = (CN - CC) / (NN - CC) per window, arm and day.
2. AP's terms on 0.5.1 (as THEMIS-ROUGHNESS.md): tesseral cap d in {0, 4, 12} with zonal 20; (31, 0) (zonal tail off); (0, 0).
3. AP across builds: 0.6.1 (modules 3b59e95b) (31, 20) and (0, 20); 0.5.1's set flown on 0.6.1 and 0.6.1's on 0.5.1; 0.4.14 and
   0.4.15 (31, 20), the release that adds the wide first-order tesseral series above e = 0.3 (TESS e about 0.5), $OMM path. Builds by git show at the
   commit, SHA-256 recorded.
4. Solution switches: every fit arc and forecast span's switches counted; NN rescored against one kernel only (the newest file that covers the whole forecast
   span, nodes only), no switch inside.
5. Velocity steps: the N series' nodes whose second-difference residual |r(+h) - 2 r + r(-h) - (v(+h) - v(-h)) h / 2| exceeds 0.5 m away from a switch
   (TRUTH-SERIES.md's residual; |dv| about 2 x residual / h), with epoch and radius; per window, whether one lies in the fit arc or in the forecast span to
   each lead. Each step's effect by module: two FFM fits on the 24 h of nodes before the step and the 24 h after (none inside), both flown on the window's
   node grid; per lead day, the 3D RMS of one flight against the other.

Verdict rule. A term is involved when its ablation moves the 72 h worsening (NN - CC, median over the four windows 07-27, 08-10, 08-24, 09-07) by more than
25 % at day 3 or 7. The wide tesseral series is involved when (0, 20) on 0.5.1 or 0.4.14 against 0.4.15 does, and not when XP and FFM worsen alike.
The worsening is explained when the CN split places at least half of it in the fit or the scoring and a named term accounts for it: a step whose module
effect is at least half the NN error at day 3 and day 7 on each of the four windows, or an ablation that returns NN within 25 % of CC. Else: open, with the numbers.

## Conditions (report only)
1. Clean re-score: the control holds, every N epoch a node, 0 interpolated, NN for every arm and cell.
2. Worsening explained (or gone) by the rule above.
Both hold: a site record restores TESS (cells, whitepaper, xp-record, the 3D example, regenerated on N). Else TESS stays withheld.

## Outputs
Rows: /opt/data/sdn-archive/operator-theory/tess-rescore/rows-<shard>.jsonl, one per window, arm, fit and truth. Table: results/ap-truth/tess-rescore/table.json
and README.md. Run with at most 2 workers under nice -n 10. E2E: `node experiments/operator-theory/tess-rescore.mjs --check` re-derives the table from the
rows and holds the control and the zero-interpolation count.
