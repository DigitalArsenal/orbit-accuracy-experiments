#!/usr/bin/env python3
# Report only; feeds no gate. R3's realized mean d2/3 and coverage per lead on the gate's subset (primary samples, E >= 2026-01-01) and on validation alone, as they stand and with the families reweighted to the fresh mix
# (25 Galileo, 14 GLONASS, 5 spheres). From C3-ab's samples (score.mjs --extract). Statistics only.
#   python3 experiments/ffm-covariance-adaptive/report_mix.py
import json, os
import numpy as np
STORE = os.environ.get('C3_STORE', '/opt/data/sdn-archive/ffm-covariance-adaptive')
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RESULTS = os.environ.get('C3_RESULTS', os.path.join(ROOT, 'results/ffm-covariance-adaptive'))
CONFIG = json.load(open(os.path.join(HERE, 'config.json')))
P = CONFIG['population']['judged']
GLO, GAL = set(P['glonass']['c2'] + P['glonass']['new']), set(P['galileo']['new'] + P['galileo']['c2Six'])
FROM = CONFIG['model']['fitFrom']
MIX = {'Galileo': 25 / 44, 'GLONASS': 14 / 44, 'spheres': 5 / 44}
LEADS = [1, 6, 12, 24, 48, 72]
CHI, MEAN, COV = 7.8147, CONFIG['verdict']['band']['meanD2over3'], CONFIG['verdict']['band']['coverage95']
rows = [r for r in json.load(open(os.path.join(STORE, 'extract', 'R3.json')))['rows'] if r['primary'] and r['E'][:10] >= FROM]
fam = lambda o: 'Galileo' if o in GAL else 'GLONASS' if o in GLO else 'spheres'
out = {'plan': 'report only; feeds no gate', 'fitFrom': FROM, 'mix': MIX, 'tables': {}}
for sname, test in (('gate subset', lambda r: True), ('validation', lambda r: r['set'] == 'validation')):
    x = [r for r in rows if test(r)]
    for wname in ('as they stand', 'fresh mix'):
        table = []
        for L in LEADS:
            y = [r for r in x if r['L'] == L]
            d = np.array([r['d2'] for r in y])
            f = [fam(r['o']) for r in y]
            share = {q: f.count(q) / len(f) for q in MIX}
            w = np.ones(len(y)) if wname == 'as they stand' else np.array([MIX[q] / share[q] if share[q] else 0.0 for q in f])
            w = w / w.sum()
            mean, cov = float((w * d / 3).sum()), float((w * (d <= CHI)).sum())
            table.append(dict(L=L, n=len(y), familyShare={q: round(v, 3) for q, v in share.items()}, mean=mean, coverage=cov, inBand=bool(MEAN[0] <= mean <= MEAN[1] and COV[0] <= cov <= COV[1])))
        key = '%s | %s' % (sname, wname)
        out['tables'][key] = table
        print(key.ljust(32), ' '.join('%d: %.2f/%.3f%s' % (t['L'], t['mean'], t['coverage'], '*' if t['inBand'] else ' ') for t in table), '| in band', sum(t['inBand'] for t in table))
json.dump(out, open(os.path.join(RESULTS, 'report-mix.json'), 'w'), indent=1)
