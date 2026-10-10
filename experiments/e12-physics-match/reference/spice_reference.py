#!/usr/bin/env python3
# NAIF SPICE reference numbers for E12's validation (spice-validate.mjs).
# Reads {kernels, epochs: [{utc, tdb}]} (ISO text; tdb is foundation/time's
# reading of the same instant) as JSON on stdin and writes JSON on stdout:
# per epoch the time-scale offsets, the J2000 -> ITRF93 and J2000 -> IAU_EARTH
# rotation matrices, and the geocentric Sun and Moon positions from each DE
# kernel. Every number is CSPICE's (SpiceyPy); this file only calls it.
# Requires: spiceypy, numpy (runs/cache/spice-venv). No file is written.
import json
import sys

import spiceypy as sp

req = json.load(sys.stdin)
K = req['kernels'].rstrip('/') + '/'
out = {'toolkit': sp.tkvrsn('TOOLKIT'), 'spiceypy': sp.__version__, 'epochs': []}

# Orientation kernels, later loads take priority: predict < historical < latest high precision.
for f in ['lsk/naif0012.tls', 'pck/pck00011.tpc', 'fk/planets/earth_assoc_itrf93.tf',
          'pck/earth_2026_260806_2126_predict.bpc', 'pck/earth_620120_260806.bpc', 'pck/earth_latest_high_prec.bpc']:
    sp.furnsh(K + f)

ets = []
for e in req['epochs']:
    et = sp.str2et(e['utc'].replace('T', ' ') + ' UTC')          # SPICE's own UTC -> TDB
    et_mod = sp.str2et(e['tdb'].replace('T', ' ') + ' TDB')      # the instant foundation/time calls the same epoch, read as TDB
    tt = sp.unitim(et, 'TDB', 'TT')
    tai = sp.unitim(et, 'TDB', 'TAI')
    dtdb = sp.deltet(et, 'ET')                 # TDB - UTC
    rec = {
        'et': et, 'etModule': et_mod,
        'tdbMinusUtc': dtdb, 'ttMinusUtc': (tt - et) + dtdb, 'taiMinusUtc': (tai - et) + dtdb,
        'itrf93': [list(map(float, row)) for row in sp.pxform('J2000', 'ITRF93', et)],
        'iauEarth': [list(map(float, row)) for row in sp.pxform('J2000', 'IAU_EARTH', et)],
    }
    out['epochs'].append(rec)
    ets.append((et, et_mod))

# Planetary kernels one at a time; spkpos(target, et, 'J2000', 'NONE', 'EARTH') in km.
for name in ['de440s', 'de430', 'de421', 'de405']:
    path = K + f'spk/planets/{name}.bsp'
    sp.furnsh(path)
    for rec, (et, et_mod) in zip(out['epochs'], ets):
        rec.setdefault('ephemeris', {})[name] = {
            'sun': list(sp.spkpos('SUN', et_mod, 'J2000', 'NONE', 'EARTH')[0]),
            'moon': list(sp.spkpos('MOON', et_mod, 'J2000', 'NONE', 'EARTH')[0]),
            'sunVelocity': list(sp.spkezr('SUN', et_mod, 'J2000', 'NONE', 'EARTH')[0][3:]),
            'moonVelocity': list(sp.spkezr('MOON', et_mod, 'J2000', 'NONE', 'EARTH')[0][3:]),
            'sunSpiceTime': list(sp.spkpos('SUN', et, 'J2000', 'NONE', 'EARTH')[0]),
            'moonSpiceTime': list(sp.spkpos('MOON', et, 'J2000', 'NONE', 'EARTH')[0]),
        }
    sp.unload(path)

json.dump(out, sys.stdout)
