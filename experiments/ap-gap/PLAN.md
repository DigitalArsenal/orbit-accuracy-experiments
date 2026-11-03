# AP gap diagnosis

Registered 2026-11-03 before this lane reads any ablation row. AP5/AP6 windows and their prior results were already read; this is exploratory, not confirmation. No hold-outs, operator captures, Starlink groups, C2 rows, or six held Galileo objects are admitted. No module change is delivered here.

Use AP5/AP6 truth, windows, thinning, coverage, weather and forward bins unchanged. Leads count from the end of each fit. Preserve failed and excluded windows. Report paired median forward 3D errors in meters at days 1, 3, 7 with n, and median paired error changes. Never interpret fit residual as forecast accuracy.

Run in order:
1. AP on GD, IG, GE, LS, DO, then HX, HE: baseline (31,20), XP atmosphere only, tesseral 0 and 12, zonal 0, frame correction off, Hansen threshold 0.3/0.5/0.7, forced resonance classes. Isolated internal switches require copies built in scratch; hashes identify every build.
2. FFM baseline and single subtractions: SRP, third bodies, solid tides, degree 20, order 12/31. Unsupported isolated shadow or individual-body switches are reported, never silently substituted.
3. GN 24 h fits, AP and both XP implementations with AGOM fixed at seed and Space Force priors. Use only AP5 GN objects and dates.
4. HEO resonance degree limits and frame arms (0,1), (1,0), on GN/IG/GE.
5. DO event split: before reading error ratios, label windows with duplicate truth epochs from different files disagreeing by over 1 km in the fit or seven-day forecast interval. Missing overlaps are unknown, not quiet.

A subtraction is a candidate explanation if its paired errors approach AP; this alone does not identify a unique cause. Report unresolved gaps explicitly. Proposed gains are exploratory estimates, requiring a module-task E2E on unread windows. Graph task creation is reserved for the coordinator.

Raw rows and input manifests: /opt/data/sdn-archive/operator-theory/ap-gap. Only aggregates in results/ap-gap. Scratch: /Users/tj/software/terrain-work/body-look/codex-apgap-d9. Maximum 12 workers. Stop by 2026-11-03T03:48:49Z; retain and report partial work.

E2E: run the real module on a registered archive window twice; forward day-3 error must be finite and repeat within 0.001 m. Require every registered method and group to have completed or explicit missing status; incomplete coverage is not a full-task pass. Pin registration, runner, inputs, module bytes and aggregate inputs by SHA-256. No acceptance claim may be manufactured from the task's rounded reference numbers.

## Amendment 2026-11-03: coordinator disposition

The inherited MGEX selector decoded all six held Galileo files in memory before filtering. No held object was fitted, scored, printed, or copied into the output rows. The coordinator authorized continuation; the replacement selector filters NORAD filenames before decoding. EXCLUDE_NORADS now also excludes Swarm and GRACE-FO at every date; closed source selection and a name guard exclude every Starlink. Fresh results use resume-* stores; the interrupted five LS rows remain historical.

## Amendment 2026-11-03: isolated builds

Build CONTROL from the current module source copy, H03/H05/H07 changing only kSeriesE, NOFRAME changing only ap_frame to zero, and CLASS0 through CLASS4 forcing band_of to that class at both initialization and evaluation. Compare variants to CONTROL; do not attribute a difference from archived AP 0.4.0 to the changed constant until the rebuild control agrees. Source and wasm hashes stay in the scratch build manifest. Forced classes are diagnostic perturbations, not proposed defaults.

## Amendment 2026-11-03: GN fitter details

GN uses AP5's five named objects and January–May 2026 cutoffs, 24 h fits. AP and whiteroom XP use their baseline priors; XP_PRIOR selects zero means and Gaussian sigmas 0.05 (BTERM) and 0.1 (AGOM) from the Space Force wrapper's fitter. Its residual weighting and bounds still differ, so this tests the prior constants only. AP_FIXED and XP_FIXED use a scratch build with opt.fit_agom=0, preserving the seed. U_FIXED removes parameter 7 from the Space Force wrapper's active fit vector, preserving its zero seed. No third-party library internals are read or changed.

## Amendment 2026-11-03: FFM switch mapping

NO_SUN retains Moon; NO_MOON retains Sun. TESS12/TESS31 select the tesseral degree cap, distinct from O12/O31's maximum order. D20 caps all harmonics, so it cannot uniquely attribute an effect to zonals above 20. High-orbit FFM already has degree 20 and no tides; its corresponding subtraction is an identity control. NO_SRP also removes the inactive fitted SRP parameter in high orbit.

## Amendment 2026-11-03: primary FFM arc

Before the first FFM subtraction, restrict method 2 to the task's primary 72 h fits at every AP6 cutoff. The inherited exploratory 24 h, 168 h, and 336 h FFM arcs are not needed to diagnose the specified 72 h gaps. This preserves all primary windows and saves time for the requested 24 h GN fitter arms. AP variants retain the inherited extra arcs.

## Amendment 2026-11-03: pinned FFM wire format

AP6's openFfmHost pins FFM 2.0.4 and estimation 0.7.0. Its fit_batch propagation answers encode the force fields in PRWForceConfiguration, the predecessor of the current module's PCFForceModel. Keep that pinned AP6 baseline for comparability; report this deviation from the requested literal PCF interface. The pinned wrapper exposes no isolated shadow-model switch. No claim is made that SRP-off isolates shadow, or that degree-20 isolates zonals alone.

## Amendment 2026-11-03: FFM time allocation

After 200 completed FFM windows, observed low-orbit throughput threatened the later registered methods. Stop this lane's workers by exact PID and resume incomplete windows with the seven primary arms: F, NO_SRP, NO_BODIES, NO_TIDES, D20, TESS12, TESS31. Retain every completed row, including the extra NO_SUN, NO_MOON, O12, O31 arms; their smaller n is reported. This scheduling change is based on throughput and fit status, before reading ablation error ratios. Original manifests are preserved; the resumed run writes a timestamped manifest. Interrupted workers did not flush their end-of-process input audits; disclose that provenance limit.

## Amendment 2026-11-03: frame controls

Before method 4, include XP (0,0) and full AP (31,20) controls alongside FRAME (0,1) and RESONANCE (1,0), at the same 72 h fit windows on GN/IG/GE. The frame table's paired changes use XP as control. This allows GN's frame contribution to be measured without importing unrelated AP5 row files.

## Amendment 2026-11-03: GN control environment

Method 3 sets XP2F_CONTROL=1 before importing the shared readers, exactly as cycle-ap5.sh truth2 does. AP6 regime arms retain cycle-ap6.sh's environment. The manifest records this switch. No GN fitter row had been run when this routing correction was made.

Fixed-AGOM validation: both native fitters initialize AGOM at zero for these Gaussian-prior arms. Decode the fitted OMM and require |AGOM| ≤ 1e-15 for each successful fixed arm. A failure remains an arm failure, never a fixed-seed measurement.

Space Force build correction: the current checkout's root dependencies did not reproduce the prescribed wasm. Build from artifact commit `1b905d16f68fc56e7da66c6392315970f9e7e6d0`, including its frame headers and package lock, in scratch. Attach that lock's dependencies and require byte identity for CONTROL before using FIXED. The initial mismatching build was never fitted or scored.

## Amendment 2026-11-03: separate Space Force rebuild control

Even the artifact commit and recorded dependency versions did not reproduce the prescribed binary hash; the unmodified Space Force library hash still matches exactly. Before any GN row is run, add U_REBUILT beside the unchanged prescribed U. Compare U_FIXED to this source-matched rebuild, not directly to U. Measure maximum state separation between U and U_REBUILT through the module at every forecast epoch. Attribution to the prescribed build requires ≤0.001 m on every paired window; otherwise method 3 remains partial and the rebuilt pair is reported separately. This replaces the stricter byte-identity gate with an explicit measured control, without replacing the prescribed baseline.

## Amendment 2026-11-03: finite FFM tail queue

After most shards finished, pause this lane's stage supervisor and terminate its remaining workers by exact PID. Enumerate only unfinished keys against the completed AP control, run that finite list with at most 12 workers, and append each result once to its original shard. Keep each task's original row, command manifest, and input audit under ap-gap/ffm-tail; tail-index.json records the merge. No arm or window changes, no error-ratio selection, and no self-spawning workers. Resume the stage supervisor only after all tail jobs exit.

Tail merge audit: four original rows completed after the pending-key snapshot. Preserve the merged files with repeats under ffm-tail/merged-with-repeats, retain the first row per window in the canonical shards, and record the repeat comparison in ffm-tail/repeats.json. This selection uses execution order, not error values. The canonical FFM set has 426 unique windows.

## Amendment 2026-11-03: frame reader routing correction

The mixed frame batch used AP6's weather store for GN, producing 740 missing-weather exclusions. Retain that attempt and rerun GN alone with XP2F_CONTROL=1, under resume-frame-gn; IG/GE retain their AP6 configuration. No error ratios were read before this correction. Normalize DO overlap epoch keys with the shared UTC parser before final classification, so equivalent timestamp spellings join correctly.

## Amendment 2026-11-03: individual-body completion

After the primary report, complete the already registered NO_SUN and NO_MOON arms on remaining eligible FFM windows. Selection is absence of the arm, not error magnitude. Preserve the prior canonical rows under ffm-bodies/before and each new row separately; merge only new arm keys. A finite 12-worker queue stops by 03:46:40 UTC, leaving time to preserve the final report. This does not close the missing shadow, zonal-only, or extended-resonance tests.

## Amendment 2026-11-03: coordinator resume 3

Resume in the exclusive apgap clone at 03:49:26 UTC; the two-hour deadline is 05:49:26 UTC. The original registration remains frozen. Complete the 170 missing individual-body windows in a fresh ffm-bodies-resume3 store with eight workers, leaving capacity for builds; preserve the prior store. Build isolated FFM shadow-off and zonal-degree-20 copies with source-matched controls. Keep the SRP force on for shadow-off, and preserve every nonzonal gravity coefficient for zonal truncation. Compare rebuilt control forecasts to the pinned control before attributing differences. Extend HEO resonant terms in native AP scratch source with a source-matched control; record the exact term set and limitations before the first new run. No native physics is implemented in JavaScript.

The coordinator authorizes landing a time-boxed partial report with coverage stated. The final E2E must validate real forward repeatability, hold-out exclusions, artifact hashes, and every claimed completed arm. Its scoped pass must not imply that missing measurements or unresolved causes are complete. Proposed module tasks remain drafts for the coordinator because graph writes are prohibited.

FFM isolation details (before new rows): compile source commit 9a05d899b95242b358939ab1d68a776170a6b167. NO_SHADOW changes the scalar/dual shared visibleSunFraction to return one, leaving SRP enabled and its fitted parameter unchanged. ZONAL20 zeroes exactly 50 embedded EGM2008 records with order zero and degrees 21–70; all nonzonal coefficients stay byte-identical. Baseline high orbits already truncate at degree 20, so ZONAL20 is an identity control there. If the rebuild is not byte-identical, compare full forward states through the module with a 0.001 m maximum tolerance before interpreting the subtractions against AP6.

Resume clock correction: the inherited runner still enforced the expired first-box deadline and exited before selecting windows. Record the new frozen deadline separately in resume-config.json, use it for every resumed run, and keep the original frozen config untouched. The expired-clock attempt remains archived and does not count as completion.

HEO extension details (before new rows): HEO12 and HEO20 integrate additional EGM tesseral terms of degrees 6–12 and 6–20, respectively. At epoch, retain positive mean-anomaly harmonics k ≤ 64 whose full J2 angle rate |(l−2p)ωdot + k Mdot + m(Ωdot−EarthSpin)| is below 0.2 n. Exclude terms already carried by the native resonance class; remove each newly selected term from the output short-periodic table to prevent double counting. Native exact Hansen quadrature supplies epoch G and dG; the existing native shallow-term representation supplies first-order epoch e/i expansions and the rate integrator. The retained set is fixed at epoch, without the low-orbit k=1 taper. Refuse capacity overflow above 2,048 terms. This tests the finite additional term set, not convergence of every high-eccentricity harmonic; compare degree 12 with 20 and preserve all refusals. The unchanged AP CONTROL remains byte-identical to archived 0.4.0.
