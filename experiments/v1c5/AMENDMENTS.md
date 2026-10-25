# V1c5 amendments

`PLAN.md`, `config.json`, `PLAN-B.md` and `candidates.json` are frozen at their registration commits and are not edited; amendments are recorded here.

**B1 (2026-10-26, after cross-validation, before the test is read): a report-only column.** The cross-validation cells show most failures of LEO and
SLR LEO classes are a coverage estimate just outside 0.93 to 0.97 with the mean inside its band: a cell of about 70 samples has a standard error of
the coverage of about 0.026, wider than the band's half width of 0.02, so even a correct covariance misses the band by chance. The rule, the
candidates, the selection and the headline are unchanged. The README and `table.json` add, for the selected candidate, the flag `compatible`
(the cell has at least 30 samples from 3 objects and both bootstrap intervals overlap the rule's bands) and its count. It is not used to select,
and the headline stays the REALISTIC count.
