# SDN-AP fitted from public element-set history

Experiment `sdn-ap-gp-history-od` (plan: `experiments/sdn-ap-gp-history-od/PLAN.md`, registered before any window was scored). The question: how
do SDN-AP and SGP4-XP do from the data a catalog user actually has, the public element-set history, rather than from a precise ephemeris?

Each of 916 windows of whitepaper section 12.3 (8 regimes, 287 objects, the same truth orbits) takes the information available at the end of
its 24 h fit: the latest SGP4 element set (the baseline), and the pseudo-observations of the preceding 120 h of the object's element-set history
(the construction of section 12.5's reentry fits), fitted by SGP4-XP and by SDN-AP (modules commit `25203a0ce7`, wasm `80867b356130`), and
scores days 1 to 3 against the precise orbit.

- `table.json` (schema `sdn-ap-gp-history-od/1`) is the table the SDN-AP site build reads; `table.md` is the same table as text.
- Per regime and arm: windows attempted, fitted, failed and complete; the median day 1 to 3 3D RMS error in km with its 10th and 90th
  percentiles and a bootstrap 95 % interval of the median (10,000 resamples, windows; objects too where there are 5 or more); the per-day
  medians; and, on the windows complete for all three arms, each fitted arm's error as a multiple of the baseline's. The section 12.3 SDN-AP
  fitted to the precise orbit, on the same windows, is printed beside them for context.
- `table-run1.json` and `table-run1.md` are the first run, superseded by amendment A1 of the plan (the pseudo-observation series held two states
  at one epoch where a set's epoch fell on the 300 s grid; SGP4-XP refuses that, and 23 Starlink fits failed). Both fit arms were rerun on all
  windows with states under 1 s apart dropped; the table here is the second run.
- Space-Track data is results only: this directory holds no element set and no pseudo-observation. The local rows (one line per window) stay in
  the SDN archive.

What the windows hold: a window scores a day only where the truth has at least 90 % of that day's states, and many registered windows (the
laser-ranged 4-day arcs, the GNSS days at the end of a product) have truth for only one or two of the three days; the headline counts the
windows complete for all three days and the per-day medians count every window that scored the day. TESS has an element set at the window's
end in 4 of 39 windows in the local history, so its row has almost no windows.
