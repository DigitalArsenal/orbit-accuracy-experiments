# Five-day CA forecast: stage 1

Registered 2026-11-03 before reading test rows or flying day 4 or 5.
The task record has a title and E2E command but no specification body. This
registration implements the title and owner brief; no additional acceptance
threshold is inferred. Prior AP5/AP6 aggregate results have been read.

Use AP5 and AP6 windows, fit settings, truth readers and as-issued weather,
with leads 1, 2, 3, 4, 5 and 7 days counted from the fit end. Each day's bin
is (end + (day-1) days, end + day days]. Coverage rules stay unchanged.
Arms: AP 0.4.0, whiteroom XP, SGP4, Space Force XP (U), then FFM.
Import operator-theory libraries read-only. SGP4 sets fly only on SGP4.
AP wasm is 715ef2fee512e9c91aacf1c977151dbb1eb83c6b1fa0e1a160cba3304a876ec0.
Other artifact and covariance pins are in config.json. Never refit covariance.

Groups: AP5 strong drag in 2025 and P, S1, GN in January–May 2026;
AP6 LS, DO, GD, IG, GE, HE, HX. Exclude C2 held-out objects, including
Stella and LAGEOS-1, before opening their truth, even though AP6 lists them.
Never open the six held Galileo objects, any Starlink group, C2 row files,
operator captures, or Swarm/GRACE-FO truth after 2026-10-31.
No provider next-prediction run is authorized here. WA belongs to another
lane's uncommitted extension and is outside this registration.

Report median and p95 3D and RTN RMS by group, arm, arc and lead, with
attempts, failures and exclusions. Reproduce the stored days 1, 2, 3 and 7
on common permitted windows; report exact differences, never silently
accept drift. All new comparisons are descriptive, with no new win claim.
Keep per-window rows only in the archive; publish only aggregates.

CA stage: use the GP covariance by regime and age, its frozen scale and
label, and frozen XP/FFM constants with their recorded eligibility limits.
No mapping to an unsupported covariance class is inferred. An arm without
carried covariance cannot receive a calibrated Pc. Before synthetic draws,
register the executable encounter geometry, pair classes and seed in a
stage-2 amendment, commit and WIP-push. Use 20 m hard-body radius; count
Pc below 1e-7, 1e-7 through below 1e-4, and at least 1e-4; true collision
means miss below 20 m. Report Brier and log scores, reliability by decade,
and proximity recall separately. Module calls compute states and Pc.

Run 12 workers maximum. Cheap arms precede FFM. At the two-hour limit,
stop exact owned PIDs, publish complete groups and explicitly list unfinished
work. The E2E must replay real modules, verify old-lead reproduction and
aggregate regeneration. Missing or incomplete evidence never passes.
