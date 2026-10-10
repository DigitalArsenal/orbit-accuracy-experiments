#!/usr/bin/env python3
# Fixtures and reference values for spk-selftest.mjs: SpiceyPy writes synthetic
# SPK type 9 and type 13 kernels (spacecraft -999 about Earth, J2000, a
# circular two-body track of 200 states) and evaluates any kernel at epochs.
#   spk_selftest.py make DIR                      -> writes DIR/synthetic-type{9,13}.bsp
#   spk_selftest.py eval FILE < {"epochs": [et]}  -> {"states": [[x..vz km, km/s]]} from spkez at those epochs
# Synthetic data only (nothing here is an operator's). The numbers are CSPICE's.
import json
import math
import os
import sys

import spiceypy as sp

mode = sys.argv[1]
if mode == 'make':
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    mu, r = 398600.4418, 7000.0
    w = math.sqrt(mu / r ** 3)
    et0 = 844128000.0  # 2026-10-01T12:00:00 TDB
    n = 200
    epochs = [et0 + 60.0 * i for i in range(n)]
    states = []
    for t in (60.0 * i for i in range(n)):
        c, s = math.cos(w * t), math.sin(w * t)
        i_ = math.radians(51.6)
        x, y = r * c, r * s
        states.append([x, y * math.cos(i_), y * math.sin(i_), -r * w * s, r * w * c * math.cos(i_), r * w * c * math.sin(i_)])
    for typ, writer in ((9, sp.spkw09), (13, sp.spkw13)):
        path = os.path.join(out, f'synthetic-type{typ}.bsp')
        if os.path.exists(path):
            os.remove(path)
        h = sp.spkopn(path, f'E12 synthetic type {typ}', 0)
        writer(h, -999, 399, 'J2000', epochs[0], epochs[-1], f'SYNTHETIC-{typ}', 7, n, states, epochs)
        sp.spkcls(h)
else:
    sp.furnsh(sys.argv[2])
    req = json.load(sys.stdin)
    json.dump({'states': [list(sp.spkez(-999, et, 'J2000', 'NONE', 399)[0]) for et in req['epochs']]}, sys.stdout)
