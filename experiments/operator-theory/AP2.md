# AP against precise orbits near 700 km, in medium Earth orbit, and on 2026's drag windows

Registered 2026-11-02, before any AP fit of these windows and after AP.md's Part T read out. It uses that part's build, settings, statistics and fit design without change; nothing here was chosen from these windows.

The owner, 2026-11-01, verbatim: "rewrite the site with what we know to be accurate, and don't do comparisons with the algorithms on the front page, just how accurate XP2 is compared to truth data." XP2 is now called AP.

## Windows

xp-atmosphere-merit's, its truth, grid, as-issued weather, coverage and failure rules, unchanged; cutoffs 00:00 UTC, 2026-01-01 to 05-31.

| Group | Satellites | Truth |
|---|---|---|
| `S1` | Sentinel-1A and 1C | Copernicus POEORB |
| `GN` | G053, G073, E218, R743, R859 | ESA final orbits |
| `P` | Swarm A, B, C; GRACE-FO 1, 2 | ESA SP3, GFZ RSO |

They were read for that test's arms, and RF17 and RFa12 were chosen on the `P` group. No AP fit touched them.

## Arms

`AP72`: AP fitted to the last 72 h. `AP24`: AP fitted to the last 24 h. AP as AP.md: `FORCES` `MAXIMUM_TESSERAL_DEGREE` 31, `MAXIMUM_DEGREE` 20, NRLMSISE-00 on the as-issued rows, `FIT` unset. The stored rows give `P`, the newest public set on SGP4, and `X2`.

## Rules

As AP.md's Part T, in each group by itself. In `S1` and `GN`, `AP72` beats `P`: rules 1, 2 and 3 at days 1, 2, 3 and 7. Every other contrast is report only. The site's near-700 and medium-orbit rows are `AP72`'s medians in `S1` and `GN`, whichever way the statements fall, labeled by what passed.

No arm, window or rule changes after this registration.
