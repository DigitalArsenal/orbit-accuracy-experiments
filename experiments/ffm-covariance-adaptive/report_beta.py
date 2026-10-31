#!/usr/bin/env python3
# C3-A6, report only; no rule attaches to it: N against beta per class at every lead, with a |beta| >= 75 deg bin, on C3-ab's samples of cal/val (score.mjs --extract). beta = asin(s . h): h from the fit state's r x v (GCRF),
# s the low-precision solar direction of the Astronomical Almanac, good to about 0.4 deg here. Statistics only.
#   python3 experiments/ffm-covariance-adaptive/report_beta.py
import json, math, os, sys
import numpy as np
STORE = os.environ.get('C3_STORE', '/opt/data/sdn-archive/ffm-covariance-adaptive')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RESULTS = os.environ.get('C3_RESULTS', os.path.join(ROOT, 'results/ffm-covariance-adaptive'))
P = json.load(open(os.path.join(HERE, 'config.json')))['population']['judged']
GLO, GAL = set(P['glonass']['c2'] + P['glonass']['new']), set(P['galileo']['new'] + P['galileo']['c2Six'])
LEADS = [1, 6, 12, 24, 48, 72]
BINS = [(-90, -75), (-75, -60), (-60, -30), (-30, -14.5), (-14.5, 14.5), (14.5, 30), (30, 60), (60, 75), (75, 90)]


def sun_of(n):
    L = math.radians((280.460 + 0.9856474 * n) % 360)
    g = math.radians((357.528 + 0.9856003 * n) % 360)
    lam = L + math.radians(1.915) * math.sin(g) + math.radians(0.020) * math.sin(2 * g)
    eps = math.radians(23.439 - 4e-7 * n)
    return np.array([math.cos(lam), math.cos(eps) * math.sin(lam), math.sin(eps) * math.sin(lam)])


def beta(r):
    h = np.cross(r['st'][:3], r['st'][3:6])
    n = float((np.datetime64(r['E'][:10]) - np.datetime64('2000-01-01')).astype(int)) - 0.5
    return math.degrees(math.asin(float(np.clip(sun_of(n) @ (h / np.linalg.norm(h)), -1, 1))))


out = {'plan': 'C3-A6, report only', 'axis': 'N', 'error': 'forecast minus truth, m', 'bins': BINS, 'classes': {}}
for cls in ('R3', 'R2-M', 'R2-O'):
    f = os.path.join(STORE, 'extract', cls + '.json')
    if not os.path.exists(f):
        continue
    rows = [r for r in json.load(open(f))['rows'] if r['primary'] and r.get('st')]
    for r in rows:
        r['b'] = beta(r)
    groups = {'R2': rows} if cls != 'R3' else {'GLONASS': [r for r in rows if r['o'] in GLO], 'Galileo': [r for r in rows if r['o'] in GAL], 'spheres': [r for r in rows if r['o'] not in GLO and r['o'] not in GAL]}
    for name, group in groups.items():
        key = '%s %s' % (cls, name) if cls != 'R3' else name
        table = {}
        for L in LEADS:
            row = []
            for lo, hi in BINS:
                x = [r for r in group if r['L'] == L and lo <= r['b'] < hi]
                row.append(dict(n=len(x), medianM=float(np.median([r['e'][2] for r in x])), meanZ2=float(np.mean([r['z'][2] ** 2 for r in x]))) if x else dict(n=0))
            high = [r for r in group if r['L'] == L and abs(r['b']) >= 75]
            table[L] = dict(bins=row, absBetaAtLeast75=dict(n=len(high), medianM=float(np.median([r['e'][2] for r in high])), meanZ2=float(np.mean([r['z'][2] ** 2 for r in high])), meanD2over3=float(np.mean([r['d2'] / 3 for r in high])), satellites=sorted(set(r['o'] for r in high))) if high else dict(n=0))
        out['classes'][key] = table
        print(key)
        for L in LEADS:
            print(' %2d h' % L, ' '.join('%+.2f[%d]' % (c['medianM'], c['n']) if c['n'] else '-' for c in table[L]['bins']), '| |beta|>=75:', table[L]['absBetaAtLeast75'])
json.dump(out, open(os.path.join(RESULTS, 'report-beta.json'), 'w'), indent=1)
