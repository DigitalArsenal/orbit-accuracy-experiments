# DESTOPy as run for E8's cross-check

DESTOPy (Gondelach and Linares 2020; <https://github.com/pengmun/DESTOPy>,
commit `d21d124078c6faf10e5de0fb9048e3214a246c05`, MIT, see
[LICENSE-DESTOPy](LICENSE-DESTOPy)) ran outside the product path, in a scratch
environment, for the descriptive cross-check of PLAN.md section 4
(Amendment 3). These diffs are every change made to it: `a/` is DESTOPy at
that commit, `b/` as run.

- [destopy-code.diff](destopy-code.diff): `python_utils/astro_function_jit.py`:
  SPICE kernels loaded once per process; the reduced-order modes interpolated
  in one call; the UKF's sigma points propagated by one pool of two worker
  processes for the whole run, with a per-step checkpoint and resume (checked
  bit-identical to the original on a full one-hour propagation); and the
  true-longitude wrap of each sigma point decided by the nominal point, as
  DESTO does (DESTOPy decided it per point, which split one object's sigma
  points by 2π and stopped the filter).
- [destopy-kernel.diff](destopy-kernel.diff): `Data/kernel.txt` loads
  `naif0012.tls`, `de440s.bsp` and `earth_latest_high_prec.bpc`.

Element sets and the densities DESTOPy estimated from them stay on the machine
that ran E8; their SHA-256 are in [../manifests](../manifests).
