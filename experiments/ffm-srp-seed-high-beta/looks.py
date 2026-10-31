#!/usr/bin/env python3
# A look, not a test; chosen after the table, no rule attaches to it. Galileo FOC against IOV per satellite, from this experiment's own rows (G0, every converged window, no sample filter), and the along-track error at
# 24, 48 and 72 h against one shape: g(beta), the orbit mean of the along-track projection of the yaw-steering Y axis, Y = unit(s x r), so g(beta) = mean over u of sin(beta) / sqrt(1 - cos^2(beta) cos^2(u)). K is the
# least-squares constant in T = K g(beta). The implied constant Y acceleration is arithmetic only: f = K / (1.5 (L^2 + 24 h x L)), the along-track growth of a constant acceleration after a 24 h fit arc. Statistics only.
#   python3 experiments/ffm-srp-seed-high-beta/looks.py     results/ffm-srp-seed-high-beta/looks.json
import glob, json, math, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CONFIG = json.load(open(os.path.join(HERE, 'config.json')))
STORE = os.environ.get('SRP_STORE', CONFIG['store'])
RESULTS = os.path.join(ROOT, 'results/ffm-srp-seed-high-beta')
LEADS = [24, 48, 72]
sig = lambda x, n=4: None if x is None or not math.isfinite(x) else float('%.*g' % (n, x))

rows = []
for f in sorted(glob.glob(os.path.join(STORE, 'rows', 's*.jsonl'))):
    rows += [json.loads(l) for l in open(f)]
text = open(CONFIG['primary']['sinex']).read()


def block(name):
    m = re.search(r'\+' + re.escape(name) + r'[^\n]*\n(.*?)-' + re.escape(name), text, re.S)
    return [l for l in m.group(1).split('\n') if l.strip() and not l.startswith('*')]


ident = {int(l.split()[2]): (l.split()[0], l.split()[3]) for l in block('SATELLITE/IDENTIFIER') if l.split()[2].isdigit()}
plane = {l.split()[0]: (l.split()[3], l.split()[4]) for l in block('SATELLITE/PLANE')}
power = {l.split()[0]: float(l.split()[3]) for l in block('SATELLITE/TX_POWER')}
U = np.linspace(0, 2 * np.pi, 7200, endpoint=False)


def g(beta):
    b = math.radians(beta)
    return float(np.mean(math.sin(b) / np.sqrt(1 - math.cos(b) ** 2 * np.cos(U) ** 2)))


def t_of(r, L):
    for x in r.get('leads') or []:
        if x['L'] == L and x['errRtnM']:
            return x['errRtnM'][1]
    return None


def shape(rs, L):
    v = [r for r in rs if t_of(r, L) is not None]
    x = np.array([g(r['betaDeg']) for r in v])
    y = np.array([t_of(r, L) for r in v])
    k = float((x * y).sum() / (x * x).sum())
    res = y - k * x
    seconds2 = (L ** 2 + 24 * L) * 3600.0 ** 2
    return {'L': L, 'n': len(v), 'K_m': sig(k), 'R2': sig(1 - float(res.var()) / float(y.var())), 'residualRmsM': sig(float(np.sqrt((res ** 2).mean()))), 'tRmsM': sig(float(np.sqrt((y ** 2).mean()))), 'impliedYAccelerationNmS2': sig(k / (1.5 * seconds2) * 1e9, 3)}


ok = lambda r: bool(r.get('fit') and r['fit'].get('ok'))
G0 = [r for r in rows if r['arm'] == 'G0' and ok(r)]
IOV = set(CONFIG['satellites']['galileoIov'])
blockOf = lambda n: 'IOV' if n in IOV else 'FOC'
out = {'rule': 'A look, not a test: chosen after the table, no rule attaches; every converged window of G0 (and of A0, A1 on the 3-day grid), no sample filter.', 'g': {str(b): sig(g(b), 3) for b in (2, 5, 10, 15, 20, 30, 45, 60, 75, 85)}}
out['perSatellite'] = []
for n in sorted(set(r['norad'] for r in G0), key=lambda n: (blockOf(n) == 'FOC', plane[ident[n][0]], n)):
    v = [r for r in G0 if r['norad'] == n]
    t = {L: [t_of(r, L) for r in v if t_of(r, L) is not None] for L in LEADS}
    s = shape(v, 72)
    out['perSatellite'].append({'norad': n, 'svn': ident[n][0], 'block': blockOf(n), 'plane': plane[ident[n][0]][0], 'slot': plane[ident[n][0]][1], 'txPowerW': power.get(ident[n][0]), 'n': len(v),
                                't24MedianM': sig(float(np.median(t[24]))), 't48MedianM': sig(float(np.median(t[48]))), 't72MedianM': sig(float(np.median(t[72]))), 't72RmsM': sig(float(np.sqrt(np.mean(np.square(t[72]))))),
                                'agomOverSeed': sig(float(np.median([r['fit']['agom'] / r['seed'] for r in v]))), 'residualRmsM': sig(10 * math.sqrt(float(np.median([r['fit']['reducedChiSquare'] for r in v])))),
                                'K72M': s['K_m'], 'R2': s['R2'], 'residual72RmsM': s['residualRmsM']})
out['shape'] = {'FOC': [shape([r for r in G0 if r['norad'] not in IOV], L) for L in LEADS], 'IOV': [shape([r for r in G0 if r['norad'] in IOV], L) for L in LEADS]}
out['shape']['FOC by plane, 72 h'] = {p: shape([r for r in G0 if r['norad'] not in IOV and plane[ident[r['norad']][0]][0] == p], 72) for p in '123'}
for arm in ('A0', 'A1'):
    out['shape'][f'GLONASS {arm}, grid'] = [shape([r for r in rows if r['arm'] == arm and ok(r) and r['onGrid']], L) for L in LEADS]
months = sorted(set(r['E'][:7] for r in G0))
out['focByPlaneAndMonth'] = [{'month': m, **{f'plane{p}': {'t72MedianM': sig(float(np.median([t_of(r, 72) for r in G0 if r['norad'] not in IOV and plane[ident[r['norad']][0]][0] == p and r['E'][:7] == m and t_of(r, 72) is not None]))), 'betaMedianDeg': sig(float(np.median([r['betaDeg'] for r in G0 if r['norad'] not in IOV and plane[ident[r['norad']][0]][0] == p and r['E'][:7] == m])), 3)} for p in '123'}} for m in months]
os.makedirs(RESULTS, exist_ok=True)
with open(os.path.join(RESULTS, 'looks.json'), 'w') as fh:
    fh.write(json.dumps(out, indent=1) + '\n')
print('wrote', os.path.join(RESULTS, 'looks.json'))
