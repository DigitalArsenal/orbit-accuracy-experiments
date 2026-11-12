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
   A candidate whose two sides disagree in position beyond what its velocity change can explain is a seam of the truth, where two orbit
   solutions are joined, and never a burn (`seamOf`). A burn of size |dv| over an extent of t seconds moves the two sides' meeting point
   by at most |dv| x t / 2. A seam is a candidate whose two-sided position mismatch exceeds both 10 m and twice that bound. Every burn
   that holds on the scoreboard's rows is at most 0.81 of the bound; the seams found so far (the joins of two long-period references) are 60 to 293 times it. Seams go to a field
   of their own (`seams`), with their report time and the test's figures, so that a window crossing one can be flagged without calling it
   a burn. `knownBurns` never reads them, and they get no `$MNV`.
3. `ballistic.mjs`: on burn-free pieces after the object's first fit, the same flight from a state fitted to the truth's positions over
   the piece's first hour. `notBallistic` reads the verdict as of a
   cutoff from the pairs that ended by then: an orbit whose positions-only closure stays above 100 m (median) holds thrust between
   impulses and has no burn-free arc.

4. `breaks.mjs`: the second detector, a break test on the fit. The position test of step 2 has a threshold set by the object's own closure
   (about 700 m on the commercial geostationary satellite, whose reference closes to about 100 m over a 6 h piece), below which a step of 11 to
   51 mm/s passes. The break test fits the sphere (`Ffull`, no empirical term) to every 24 h arc at a 12 h stride at the floor sigma of 10 m; an arc
   closes at a weighted RMS of 1.5 or less. The file written, `<group>/<satellite>.breaks.json` beside the list, holds the arcs (start, end, weighted
   RMS, null with the reason where the fit or its truth is missing; each arc's truth is read alone) and the constants, not events:
   `lib/arms.mjs` `breakEventsAsOf`, called by `knownBurns`, reads the events a cutoff shows from the arcs that end at or before it alone. A run of
   failing arcs after an arc that closed is an event between the end of that arc (or the start of the run's last arc read, if later) and the end of
   the run's first arc, inside every failing arc, and before the start of the first arc that closed after the run once one has ended (open until
   then); it is known at the end of the first arc that failed. As read at a cutoff a run of up to 3 failing arcs is an event and one that reaches a
   fourth is a drift (continuous thrust or a model that does not fit), so an event can be withdrawn when the fourth arc ends; a run with no arc that
   closed before it is no event,
   and an arc whose fit failed is neither closing nor failing. The arc rule reads the events as burns known at that time, and `listsDigest` and the
   object's list sha cover the file. `check.mjs` cases E test the reading as of a cutoff.

Each list (`<group>/<satellite>.burns.json`) keeps every candidate with its report time, its extent and its velocity change, and each flown piece's
end and position closure (`pieceClosures`, with their summary over the period, `positionClosure`: the object's weight in a numerical fit is read from
the pieces that end by a cutoff, headline-loop's README); beside it,
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

`node experiments/burn-detector/check.mjs` plants a seam (a 220 m, 1.8 mm/s jump between two flown solutions) and a 5 mm/s
impulse in a truth flown by the module, and checks that the first is a seam and the second a burn that holds, its size within 2 %.

`SDN_MODULES_ROOT` names the modules checkout, as for `experiments/headline-loop`; the stored fits are read from its store
(`HEADLINE_LOOP_STORE`).
