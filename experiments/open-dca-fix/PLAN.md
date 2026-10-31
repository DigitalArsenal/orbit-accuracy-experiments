# Open DCA after the producer fix: dev selection and a registered test on fresh dates

Registered 2026-10-31, before any selection statistic or test score exists, under task
`experiments-open-dca-fix-test-20261031`. `config.json` beside this file is part of the registration. Nothing here changes after
the commit that registers it; a change before the first test score is a dated amendment at the end, and a change after it is
labeled exploratory. Planet's states, per-arc rows, publication times and every statistic derived from them stay in the store
(`config.json` `store`), never in this repository. `results/open-dca-fix` holds only what is safe to publish.

## Question

The owner, 2026-10-31, asked to fix the open DCA's unmeasured tail before it is used in any fitted OD lane, in three items: real
file publication times in place of a flat filter, no decay ramp across a fit arc where a free B is estimated, and an effective-epoch
shift with empirical-Bayes shrinkage. The modules landed the first two, and the third as parameters that are off by default
(task `modules-open-dca-issue-rule-lag-20261031`). This experiment chooses the parameters on development dates and tests the
product on dates no open-DCA decision has seen.

Primary: does FFM fitted to precise truth under NRLMSISE-00 times exp(s(t)), with s from the fixed product as issued at the
cutoff (F4), fit better than the same fit with no correction (F2)? Secondary: does F4 carry information about the arc at all
(against the same product from another date), and does it harm the forecast?

No forecast gain is promised, and this design cannot resolve one of a few percent.

## Terms

- **File day F:** the UTC day a Planet file is named for. **P(F):** the file's HTTP Last-Modified, read from the source, kept in
  the store. A state is public from the first P of a file that holds it. An archived copy is each day's last version, so a replay
  is conservative against a live run.
- **Cutoffs, by node age and not by hour:** fresh = P(F) + 10 min, stale = P(F+1) - 10 min, mid = halfway between. Hours of the
  day move across the dates and play no part. Every row records its measured node age: the cutoff less the record's last solve
  epoch before any lag.
- **Product:** `analysis/density-calibration` `calibrate_log_density` at the pinned wasm, issued at the cutoff on the arcs public
  at the cutoff, under the typed config of the arm. Selection and scoring only: the solve is the module's.
- "Causal" means causal in orbit data only. The arcs' weather is as released, and its 81-day mean is centered.

## Dates

| Set | File days | Use | Why it is allowed |
| --- | --- | --- | --- |
| Development | 2025-11-01 to 2025-12-31 (61) | Selection, density only, no orbit scoring | E13's dev split |
| Test | 2025-01-01 to 2025-09-30 (273) | Scored once | Before E13's splits, XM's period and C2's calibration span; Planet and Swarm serve them |
| Prospective | From 2026-11-29, 148 file days | Scored once, when the coordinator takes the reading to the owner | After E13b's bar; this registration fixes the arms and the rule now |

Not used: XM's and XM3's windows (spent). C2's hold-out from cutoff 2026-06-01 on (not released). Swarm and GRACE-FO truth for
2026-10-31 to 2026-11-28 (barred until E13b scores).

The test dates predate the present. A pass there shows the method on those dates. Only the prospective stage reads the product as
it flies, and it reads it after the flow's timer is set as `flows/open-dca/README.md` says, so that a live run equals the replay.

## Selection on the development dates (no orbit scoring)

Truth: the observed density of Swarm A, B, C (DNS-POD) and GRACE-FO 1 (DNS-ACC) at 60 s, x = ln(rho_obs / rho_NRLMSISE-00) under XM's
condition O rows at the cutoff, in 3 h bins over the 72 h arc. Arcs: E13's stored NRLMSISE-00 arcs of the calibration Doves.

Statistic: D, the rms of the double time integral of the bin series less its mean, after a quadratic in time is removed, for
x and for x - s. ln D^2 ratio per window, ISO-week clusters. Its proxy for the fit's chi-square was found on spent dates and is
exploratory; it is used here because selection must not spend orbit scores.

Beside every candidate: its own wrong-date null (the record of file day F + 20, or F - 20 where that leaves the set, its nodes moved
onto this cutoff), an arc ending at its last node, and the hindcast (issued 174 h later). The legacy record, from the pinned
previous module under its flat rule, is reported as a control.

A fixed sequence, one family at a time, each step on the winner of the one before:

1. **Tail.** Held, or held to the issue and then a decay with tau 48 h or 168 h, by the rms of the density change over 12 h windows
   of the next 72 h against the mean of the last 24 h. Held wins ties within E13's 2 % band. The module holds; if a decay wins, I
   stop, because that needs a module change and an amendment.
2. **Lag.** 6, 9 or 12 h against 0, at fresh cutoffs, by the 10 % trimmed mean of ln D^2. A lag passes when its paired ISO-week interval
   against lag 0 lies below 0 after Holm over the three at a one-sided 0.025 family level, and its interval against its own wrong-date
   null lies below 0. Among those that pass, the smallest statistic wins, and a smaller lag wins ties within 2 %. **If none passes,
   selection has failed: I stop and report, and nothing below runs without the coordinator's word.**
3. **W_N.** For the chosen lag, the arcs' y recomputed with the NRLMSISE-00 drag work over the shifted window. If it beats the plain
   lag by more than 2 % I stop: it needs a change to `fit_energy_arcs` and an amendment.
4. **Shrink.** None, or sigma 0.065 with a trailing window of 72 h or 168 h. The sigma is the owner's and is not selected. A window passes
   when, in the quietest quarter of windows by the uncorrected D, its paired interval lies below 0, and in the other three quarters
   its statistic stays within +2 %. The better of those that pass wins; if none passes, no shrink.

The chosen lag, tail and shrink go in an amendment here before any test score. They are method parameters and may be public.

## Test on the fresh dates

One satellite per file day, by the day's index in the set: Swarm B on even, Swarm A on odd. Truth: ESA's reduced-dynamic Swarm SP3 COM,
gated, every 300 s. Arcs: this product's own `fit_energy_arcs` on Planet's states, with the 36 calibration Doves the module names, once
per arc, on weather as released at the arc's publication.

| Arm | What | Where |
| --- | --- | --- |
| F2 | FFM + NRLMSISE-00, XM3's fit and settings | Fresh, every day; fit and forecast |
| F4 | F2 x exp(s), the product at the chosen parameters | Fresh, every day; fit and forecast |
| FH | The same product issued 174 h after the cutoff (control: can these windows show a gain at all?) | Fresh, every day; fit only |
| FP | The same product from another date, moved onto this cutoff (the null) | Fresh, every day; fit only |
| F4a | The product with lag and shrink off (items 1 and 2) | Fresh, index mod 4 in {0, 1}; fit only |
| FN, F2n | F4's record on an arc ending at its last node, with its own F2 | Index mod 4 in {0, 1}; fit only |
| Mid, stale | F2 and F4 at those cutoffs | Index mod 4 in {0, 1}; fit only |

Fit, forces, integrator, weather and Earth orientation: XM3's (`experiments/ffm-atmosphere-xm3/config.json`), unchanged: 72 h of states at
300 s, sigma 10 m, EGM2008 70 x 70, RK78, relative tolerance 1e-10, absolute 1e-7 m and m/s, initial step 60 s, maximum 120 s, 8 x 8 STM. The
forecast is the same without the STM, to days 1, 2, 3 and 7, at 288 epochs a day (300 s); a day's error is the 3D rms over its epochs.

### Rule, registered before any score

Statistic: the 10 % trimmed mean of ln(chi-square arm / chi-square F2) over the windows, ISO-week clusters, 10,000 draws, seed fixed in
`config.json`. The median is reported beside it in the same table. **Why this departs from XM:** XM's rule reads the median. On the stored
direct-fit rows of spent dates, the median of this ratio has a much wider interval than its trimmed mean at every size computed, so a
median rule on the same windows would pass far less often when the correction does help. The figures are in the internal plan named in
`config.json` by its SHA-256. A failed fit counts as a loss: ln ratio +infinity, so it lands in the trimmed tail until failures pass 10 %,
and failures are reported and gated below.

- **In-arc.** FH's interval must lie below 0, or the windows could not show a gain and there is no verdict. Then Holm at a one-sided 0.025
  family level over F4/FP and F4/F2.
  - Both pass: s is valid for fits of past data on these dates.
  - F4/FP only: s carries information about the arc and the penalty is removed; a gain over F2 is not established. It stays out of fitted lanes.
  - Neither: the product has no detectable information at this node age.
- **Forecast at days 1, 2, 3, 7, F4 against F2.** A gain is claimed only under Holm over the four leads at the same level, and only with no
  lead wholly above 0. No-harm gate: every lead's 95 % upper bound is below ln 1.10, and at most 1 % of forecasts fail.
- **Report only:** the median beside each cell, mid and stale cutoffs, F4a and FN, F2's chi-square quartiles, measured node age, a monthly scan
  of the lag on density only.

A pass here changes nothing live. The console's own path is a separate decision, and rollout is the owner's.

## Amendments

### A1, 2026-10-31: step 1 chose a decay, before any lag, shrink or test statistic

Step 1 ran on the development dates. By the registered rule tau 168 h won: it beat the hold by more than the band, and its interval against the
hold excludes 1. Tau 48 h was the other candidate, and no other value is considered. Against no correction its interval holds 1, so no gain is
established, and this is a density proxy, not an orbit score. The values are in the store.

`analysis/density-calibration` gains the typed config `open_dca_forecast_tau_hours`, default 0 meaning held. When set, the record holds its last value
from the last solve epoch to the issue, then decays from the issue, with nodes every 6 h through issue + 10 days. The owner's item 2 holds at the issue.
**A consumer whose cutoff falls after the issue meets a slow ramp from the issue to its cutoff:** about 13 % of the held value at 24 h for tau 168 h. So
the mid and stale arms of the test read the record issued at the fresh cutoff, as a live consumer would. The lag and shrink steps read only times at or
before their cutoffs and do not depend on this.
