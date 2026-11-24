# Look 1 of the registered conjunction test (run 2026-11-24)

**Read first: [the disclosure of 2026-11-20](DISCLOSURE-2026-11-20.md).** The test is no longer blind: from 2026-11-20 23:05 UTC another analysis read the provider's conjunction messages as they arrived, including messages this look scores. The method, code and configuration were fixed in advance and are unchanged; the verdicts below were computed by the registered commands.

Look 1 covers final closest approaches from 2026-11-16 to 2026-11-22 (messages created before 2026-11-24 00:00 UTC). It was run from an empty store with the registered configuration (SHA-256 `427a36ac...`), sdn-ap 0.6.57 and the registered weather forecaster; `check-look1.txt` shows the pre-run check. Intervals are at 98.33 % (the three-look split).

Primary population: 45 events (127 scored rows), above the look's floor of 40.

| Comparison | Recipe W closer in | Median error, W vs the other | Ratio | Verdict |
| --- | --- | --- | --- | --- |
| W against the public set on SGP4 | 72.4 % [56.4..86.7] of rows | 165 m vs 433 m | 0.38 [0.20..0.61] | CONFIRMED EARLY |
| W against an SGP4-XP record fitted the same way | 73.2 % [59.1..85.6] of rows | 165 m vs 387 m | 0.43 [0.22..0.92] | CONFIRMED EARLY |

No event was worse with W than with the other arm (the guard holds in both comparisons).

What this does not show:
- An early confirmation selects favorable fluctuations; the final look (2026-12-15) gives the effect estimates to use. Looks 2 and 3 still run and are published.
- 45 events is a small population; the intervals are wide.
- 26.7 % of the primary events share an object (no pair) with an event used in development.
- The test is not blind (see the disclosure).

Files: `results-look1.txt` and `results-look1.json` as the scorer wrote them; the event and set counts; the input manifests (file names and hashes); `check-look1.txt`; `power-look1.txt`. No rows, object identifiers or event tables are published.
