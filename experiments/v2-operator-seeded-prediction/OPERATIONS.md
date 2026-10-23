# V2 local collector

Frozen registration commit: `d0e191a`. Component task ref:
`task/experiments-v2-operator-seeded-prediction-20261023`.
`../operator-capture/SUBSETS.md` is the capture handoff. Its fenced JSON
registers exact NORAD identities, issue/target epochs and first-three-hours
truth eligibility. E13b owns its collector; V2 never edits that code.

The collector uses one child process, one sequential WASM lane, serial HTTP
requests at least 3.2 seconds apart, and an eight-hour start-to-start cadence.
It pauses its own child PID with SIGSTOP when load1 >=21, resumes below 21,
and waits for 25 GiB free before dispatch. No Docker or production hosts.
Each object is fetched in memory; only fitted products and selected forecast
states/covariances are saved, gzip-compressed, under the archive. No raw
operator file or fit observations are persisted.

Provision `npm ci` in the private experiments worktree. The module root is
`SDN_MODULES_ROOT`, defaulting to the task's private modules worktree at
`500b2e9299539e3c79354379b8a231c3aa9643e9`. The FFM artifact is rebuilt there;
the other frozen artifacts are provisioned from the same-revision operator-fit
lane's build inputs. Every actual artifact/manifest hash is recorded. The
FFM build uses its published SDS dependency and the existing private emsdk;
no canonical component checkout is built or executed.

Commissioning:

```
node experiments/v2-operator-seeded-prediction/collect.mjs --once --limit 1
node experiments/v2-operator-seeded-prediction/run.mjs --record <cycle-id>
node experiments/v2-operator-seeded-prediction/run.mjs --check
```

The limit is explicitly recorded as a commissioning subset, never a completed
500-object cycle. Full operation omits `--limit`. Completed cycles record
actual bytes downloaded, derived bytes written, fit/prediction CPU and wall
time, missing objects, nonconvergence and all conditional-arm statuses.
Objects unfinished at 7.5 hours must remain reported as unfinished; a partial
cycle is never described as complete. Provisioning and commissioning evidence
do not establish that the full 500-object workload fits the cadence.

Run the full collector from a retained, committed runtime checkout so the
task worktree can be removed after landing:

```
node experiments/v2-operator-seeded-prediction/start.mjs
```

PID: `collector.pid`; log: `collector.log`; current state:
`collector.status.json`; cycle receipts: `cycles/<id>.json`; derived records:
`records/<cycle>/<NORAD>.json.gz`, all under the registered archive root.
`collector.stop` stops after the object in hand. Remove only your own stop
file before an intentional restart. Never stop another PID or use a pattern.
No new code revision is silently adopted by a running collector.

DCA handoff is local `dca/index.jsonl` with immutable $DCL payload paths,
SHA-256, source, calibration (`dove` or `starlink`), and publication time.
Only causal rows enter. The primary is host-02's live Dove lane; E13 recorded
Dove series is the registered fallback. No credentials, SSH or node writes.
An absent DCA is an unavailable arm, never a zero correction disguised as data.

Arm 4 is wired to the sibling's actual `analysis/od` method `fit_ffm`:
MEME in `$FIL`, full-force `$PRW` configuration, kernel/EOP/weather and the
causal `$DCL`; configuration sets 48 h exclusive, 600 s, fixed SRP and the
registered iteration/drag seed. It estimates B_eff=(1-kappa)B; the seed is
never silently treated as a physical prior. The current pinned module lacks
that method. Enabling it requires a landed artifact plus the Fast-path typed
OCM prediction adapter; `operatorFit(..., {invokeOnly:true,...})` is the real
method invocation seam, not a claim of an enabled arm. Arm 5 also needs E13b
Starlink DCA. No unlanded sibling artifact is loaded.
The current OD SGP4 interface fixes a 11520-second fit window, so its 48-hour
baseline remains explicitly unavailable. Causal CelesTrak baseline capture
is also pending. No same-source truth or unregistered replacement baseline.

The coordinator launches headline scoring only after the registered window
fills, earliest 2026-11-14 08:00Z. The current `--check` validates commissioning
mechanics only; it does not claim a prospective accuracy result.

File handoff verified at 2026-10-23 12:54Z: the running E13b capture reports
`subsetMode: registered` and SUBSETS SHA-256
`b6f50a5d457cdf7f169f8311b0b1aa9a4083418e68a4ef0332a84454b15e2eb4`,
identical to this task's registration. No collector code was changed by V2.

`start.mjs` starts a retained process immediately and records its PID/log.
After the verified commissioning cycle, it waits until 2026-10-24 00:00Z
(or the next UTC 00/08/16 boundary if later) before the first prospective
cycle, then runs every eight hours. This leaves 30 minutes between the 7.5 h
cycle deadline and each registered issue. The status is `scheduled` while
waiting; it is not reported as a completed 500-object cycle. Starting after
the registered first cycle requires the PLAN's coverage amendment/extension.

Commissioning blocker, 2026-10-23: space-weather 0.2.0 emits at most day+4,
and the fetched complete rows ended October 25 (43 rows). The seven-day V2
forecast needs October 31 in commissioning. FFM correctly refuses uncovered
weather days. The harness now checks every required date before fitting and
stops on this guard. Do not start the prospective collector until a causal
WASM weather forecast contract covers all registered horizons, or the owner
registers another weather policy. Never pad rows or fetch future observations
to make the check pass. The successful arm-1 fit/replay consumed 275.859966 CPU
seconds, but its forecast failed; no complete fitted-object record survived.

The explicit `--limit 1` commissioning cycle may retain covered predictions
and label every uncovered requested epoch; it still fits the full pre-join
48 h arc and exercises all five six-hour trimming switches. This is not a
prospective cycle or qualification of all horizons. Full 500-object operation
refuses the first uncovered horizon before fitting. CPU receipts include the
parent, worker initialization, successful fits/predictions and failed work;
load pauses invalidate speed-up timings without discarding the measured cost.

To retain the exact committed source, dependencies and hashed WASM artifacts
without starting a known-blocked prospective run, use
`node experiments/v2-operator-seeded-prediction/start.mjs --install-only`.
The installation receipt is `runtime/<component-SHA>/installation.json`.
Commissioning E2E can then run in that retained checkout with
`SDN_MODULES_ROOT=<installation>/modules`; the task worktree is disposable.
