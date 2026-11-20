# Registration: rolling delta analysis of conjunction notifications

This file registers a plan that is kept private, by its SHA-256. It proves the plan existed, unchanged, when this file was merged, without publishing how our records are made.

| | |
| --- | --- |
| Plan | `deployment/ca-delta/PLAN.md` in the private repository `DigitalArsenal/spacedatanetwork-stack` |
| Commit that holds it | `bba799f552fd4c79bf0496b9776b09d23e53ade7` (2026-11-20T22:49:00Z) |
| SHA-256 of the plan file | `7f4a68240038eb0a56c671c1dabab7accf748af2db393497b8abaabb220b63a5` |
| Issue | DigitalArsenal/spacedatanetwork-stack#955 |

Check: `git show bba799f552fd4c79bf0496b9776b09d23e53ade7:deployment/ca-delta/PLAN.md | shasum -a 256` gives the value above. A later change to the plan is a dated amendment at its end, registered here with its new SHA-256 and commit.

## What it asks

Over a stated period, for real conjunctions that the provider published in its public conjunction messages, do the predictions our catalog would have made when each message was created, from the data available then, come nearer the provider's final miss distance than SGP4 flown from the newest public element set and than CelesTrak SOCRATES; and at the published alert limits, do they raise fewer false alerts without more missed alerts? Figures are printed per rolling 7-day and 30-day window, with the window beside each figure, and every figure says what each side started from.

## Read-ahead disclosure

On the owner's decision of 2026-11-20 (about 23:05 UTC, "Yes read ahead"), this analysis reads the provider's public conjunction messages as they arrive, from 2026-11-20 on. That includes the messages of the windows of the registered test `experiments/conjunction-miss-from-public-sets` (looks 2026-11-24, 2026-12-01, 2026-12-15), read before those looks are run. That test is therefore no longer blind from 2026-11-20. Its folder and its run kit are not changed.

Events with any message created before 2026-11-12T07:28:00Z are the events on which the registered test's recipe was chosen; every figure on them is labelled DEVELOPMENT and is not a test.

## Alert limits used (each named by its owner)

- NASA: Pc 1e-4 and 1e-5. NASA Spacecraft Conjunction Assessment and Collision Avoidance Best Practices Handbook, NASA-SP-20205011318 Rev. 2 Vol. 1, https://ntrs.nasa.gov/api/citations/20260000453/downloads/CA_Handbook_Volume1-NASA-SP-20205011318_REV2-VOL1.pdf
- SpaceX (Starlink maneuver trigger): Pc 3e-7. SpaceX Gen 1 and Gen 2 Semi-Annual Report to the FCC, 2026-07-01, https://api-prod.fcc.gov/icfs-attachment/exp/api/v1/bff0244acfb947505791bf252f851ce6
- US Space Force emergency-reportable criteria (Spaceflight Safety Handbook for Satellite Operators): miss 1 km (low orbit) and 5 km (deep space), Pc 1e-4; the handbook was not read first-hand, and these values are marked so until it is quoted.

## Data

Element sets and public conjunction messages: Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org), read from the archive's daily collection. CelesTrak SOCRATES Plus (celestrak.org). Only aggregates are published (counts, percentiles, shares, ratios, intervals, window dates); no message, row, object number or name, and no satellite-with-date pair.
