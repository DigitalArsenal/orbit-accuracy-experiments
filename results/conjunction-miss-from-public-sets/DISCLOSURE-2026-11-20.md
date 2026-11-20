# Disclosure, 2026-11-20: the registered conjunction test is no longer blind

The registered test in [`experiments/conjunction-miss-from-public-sets/`](../../experiments/conjunction-miss-from-public-sets/PLAN.md) was fixed on 2026-11-13 (three looks added on 2026-11-14) under a rule that no provider conjunction message created after 2026-11-12T07:27:59Z is read, for any purpose, before a look's run date.

On 2026-11-20 at about 23:05 UTC that rule was set aside by the project owner's decision. A separate analysis, a rolling daily comparison of conjunction notifications, reads the provider's public conjunction messages as they arrive, from that time on. Messages that the test's looks will score (closest approaches from 2026-11-16 to 2026-12-14) are therefore read before the looks' run dates.

What this changes:
- The test's folder, code, configuration, manifest and run kit are unchanged. Its looks still run on 2026-11-24, 2026-12-01 and 2026-12-15, by the registered commands, and print their verdicts by the registered rules.
- The test is no longer blind. Its method was fixed on 2026-11-13 and its code cannot change without a dated amendment, so its verdicts are still computed by a method fixed in advance. But the claim that no message in its window was read before its looks no longer holds: from 2026-11-20 23:05 UTC the analysis reads every archived message, those created after the cutoff included. Every verdict is reported with this disclosure.
- Messages created after the cutoff were collected into the archive but read by no analysis before this decision.

This file sits outside the registered folder so that the folder's manifest still verifies.
