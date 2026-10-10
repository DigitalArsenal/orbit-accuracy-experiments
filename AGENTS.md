# AGENTS.md

## Design principles

Before any code or structural change, read the stack's design principles and
follow their hard rule (refactor to the principle first, then change
behavior): `../../../docs/policies/design-principles.md` inside the
spacedatanetwork-stack checkout, or
https://github.com/DigitalArsenal/spacedatanetwork-stack/blob/main/docs/policies/design-principles.md.

## This repository

Read [README.md](README.md) first; its five rules are binding.

- Physics belongs in `space-data-network-modules`. If an experiment needs a
  computation no module offers, the change goes to that module (with its own
  authoritative tests), not into this repository.
- A step never reads a test window while its experiment's `config.json` has
  `"frozen": false`. Do not weaken that guard.
- Never edit a frozen `PLAN.md` or `config.json`. A deviation is recorded as
  an amendment section at the end of the plan, dated, with its reason, and
  reported in the results.
- Tests are end-to-end only (stack evidence policy): the real modules on
  public verification vectors and the real archive. A test that needs local
  data is skipped, visibly, when the data is absent; a skip is never a pass.
- Do not commit anything under `runs/`, element sets, or per-sample tables.
- Reproduce third-party data (in `data/`, test fixtures, site downloads,
  release assets) only where its terms allow it, as recorded in
  `data/licenses.json` (rendered to `docs/data-licenses.md`). Results use every
  dataset an experiment read, whatever its licence (owner, 2026-10-10).
