# Burn detector (stack issues 462 and 506)

Burns found in a precise orbit by the numerical propagator alone, strictly as of a time: a burn is in a list only from the time it could
have been known, made from nothing later. The table (`experiments/headline-loop`, `--burns`) and the numerical arm
(`refly.mjs --after-burns`) read the lists through `lib/arms.mjs` `knownBurns`: at a cutoff D0, the burns whose report time is at or
before D0.

## Steps

1. `pieces.mjs`: the truth over a satellite's window spans in pieces (6 h at a 3 h stride; 2 h at 1 h under strong drag), each flown
   from the truth's own state at its start with the row's full numerical setting (propagator/ffm 2.2.0) and judged as of its own end E:
   the force terms of the object's stored fits whose cutoff is in the 14 days up to E (`termsAsOf`, the median), the space weather as
   issued at E (`weatherAsOf`). Each span starts 4 days early, so the thresholds below exist from its first fit arc on.
2. `burns.mjs`: a piece is flagged when its closure exceeds max(floor, median + 10 x 1.4826 x MAD) of the pieces that ended before E.
   Each flagged piece is halved by flights from the truth down to about 90 s against velocity levels from burn-free calibration pieces
   that ended before E; a flagged piece with no half above them is unlocalized (a spread force error), never a burn. Intervals within
   10 min of each other are one burn. It is known at R, the later of the end of the earliest piece that localizes it and the end of its
   extent plus 20 min, when its velocity change from both sides of the extent (truth states no later than R) holds from states 10 and
   20 min further out; otherwise each later piece that finds it tries again, and a burn that never holds stays a rejected candidate.
   With `--flag-vel` (off by default) a piece is also flagged when its velocity closure exceeds the same rule over the velocity
   closures of the pieces before it, and a calibration piece must be quiet in both. On a long-period orbit a firing shows in the
   velocity closure long before it grows in position (on TESS, 5 to 19 mm/s against about 1 mm/s over a 24 h piece); without the flag
   such a piece can pass the position test, enter the calibration and raise the levels the search needs.
3. `ballistic.mjs`: on burn-free pieces after the object's first fit, the same flight from a state fitted to the truth's positions over
   the piece's first hour. `notBallistic` reads the verdict as of a
   cutoff from the pairs that ended by then: an orbit whose positions-only closure stays above 100 m (median) holds thrust between
   impulses and has no burn-free arc.

Each list (`<group>/<satellite>.burns.json`) keeps every candidate with its report time, its extent and its velocity change; beside it,
`<satellite>.mnv` holds one size-prefixed `$MNV` per burn that holds (STATUS DETECTED, REPORT_TIME the time it became known,
EVENT_START_TIME and EVENT_END_TIME its extent, DELTA_VEL_U, _V and _W the refined velocity change in the pre-burn U, V, W axes), built
with the standards' generated code. The lists and pieces describe real satellites window by window and stay outside this repository.

The frame arithmetic (R, T, N axes, the rotating-frame velocity term, the two-sided difference) is JavaScript in `lib/detector.mjs`;
every state is flown by the module.

## Run

```
node experiments/burn-detector/pieces.mjs --group S1 --satellite "Sentinel-1A" --out <dir> --second
node experiments/burn-detector/burns.mjs --group S1 --satellite "Sentinel-1A" --out <dir> --floor 10
node experiments/burn-detector/pieces.mjs --group T --satellite "Swarm A" --out <dir> --length 2 --stride 1
node experiments/burn-detector/burns.mjs --group T --satellite "Swarm A" --out <dir> --floor 5 --tag .L2
node experiments/burn-detector/ballistic.mjs --group WA --satellite "SES-15" --out <dir>
node experiments/burn-detector/pieces.mjs --group HE --satellite TESS --out <dir> --length 24 --stride 12 --lead 12
node experiments/burn-detector/burns.mjs --group HE --satellite TESS --out <dir> --floor 50 --tag .L24 --flag-vel
```

`SDN_MODULES_ROOT` names the modules checkout, as for `experiments/headline-loop`; the stored fits are read from its store
(`HEADLINE_LOOP_STORE`).
