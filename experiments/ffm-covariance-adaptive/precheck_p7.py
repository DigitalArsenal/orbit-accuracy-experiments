#!/usr/bin/env python3
# P7 (PLAN.md section 5, C3-A1): power on C3's chain. Inputs: C3-ab's samples on cal/val (score.mjs --extract), P1's lead coverage, P2's notice keep and unlisted rates. The machinery is the planner's oracle: a Gaussian copula with a
# common field, a same-plane field and a unit field, Toeplitz in time with the measured lag profile, the measured lead-lead matrix, resampled storm days, realized keep and lead masks, and the registered verdict with a two-way
# bootstrap over clusters and moving 12-day blocks. Arms: 'heavy' (C3-ab's non-storm d2/3 per lead, mean 1: the gate) and 'gauss'. Maneuver arm in two shapes (C3-A1): the registered d2 x20-200 and the measured event, d2/3 about 5,
# at the non-storm rate's bound 0.0142 and, beside it, the all-window bound 0.0100 and the point estimate 1/332. Statistics only.
#   python3 experiments/ffm-covariance-adaptive/precheck_p7.py --dependence [--from <date>]   dependence, marginal and keep from the extract (writes <store>/p7/inputs.json)
#   python3 experiments/ffm-covariance-adaptive/precheck_p7.py --arm <name> [--end 2026-11-30] [--trials 2000]     one arm (writes <store>/p7/<end>.<name>.json)
#   python3 experiments/ffm-covariance-adaptive/precheck_p7.py --arm plane2 --end 2026-12-31 ; --arm q6plane2 --end 2026-12-31     C3-A6: December with plane 2's event, heavy-tail arm, and both Q6 rules
#   python3 experiments/ffm-covariance-adaptive/precheck_p7.py --summary               the table and the judged rule
import hashlib, json, math, os, sys
import numpy as np

STORE = os.environ.get('C3_STORE', '/opt/data/sdn-archive/ffm-covariance-adaptive')
P7 = os.environ.get('C3_P7', os.path.join(STORE, 'p7'))  # the gate's inputs; C3_P7 points the all-windows report elsewhere
os.makedirs(P7, exist_ok=True)
LEADS = [1, 6, 12, 24, 48, 72]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CONFIG = json.load(open(os.path.join(HERE, 'config.json')))
BOOT = 200


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def spearman(a, b):
    def rank(x):
        order = np.argsort(x, kind='mergesort')
        r = np.empty(len(x))
        r[order] = np.arange(len(x))
        v = np.asarray(x)
        # average ties
        s = v[order]
        i = 0
        while i < len(s):
            j = i
            while j + 1 < len(s) and s[j + 1] == s[i]:
                j += 1
            if j > i:
                r[order[i:j + 1]] = (i + j) / 2
            i = j + 1
        return r
    ra, rb = rank(a), rank(b)
    sa, sb = ra.std(), rb.std()
    return float(((ra - ra.mean()) * (rb - rb.mean())).mean() / (sa * sb)) if sa > 0 and sb > 0 else 0.0


LAGS = (3, 6, 9, 12, 15, 21, 30)


def dependence(rows, value):
    """value(r) -> number. Within-satellite lag profile (not demeaned), same-date cross-cluster and same-cluster correlation, lead-lead matrix (demeaned), on primary samples, pair-weighted over sets and leads."""
    lag = {}
    for lg in LAGS:
        num = den = 0.0
        for st in ('calibration', 'validation'):
            for L in LEADS:
                x = {(r['o'], round(r['t'])): value(r) for r in rows if r['set'] == st and r['L'] == L}
                a, b = [], []
                for (o, t), v in x.items():
                    for d in (lg - 1, lg, lg + 1):  # t_in moves by up to a day within the grid
                        if (o, t + d) in x:
                            a.append(v)
                            b.append(x[(o, t + d)])
                            break
                if len(a) > 10:
                    num += spearman(a, b) * len(a)
                    den += len(a)
        lag[lg] = max(0.0, num / den) if den else 0.0
    cross, plane = [0.0, 0.0], [0.0, 0.0]
    for st in ('calibration', 'validation'):
        for L in LEADS:
            by = {}
            for r in rows:
                if r['set'] == st and r['L'] == L:
                    by.setdefault(r['E'], {}).setdefault(r['cl'], {})[r['o']] = value(r)
            a, b, pa, pb = [], [], [], []
            for E, cl in by.items():
                ks = sorted(cl)
                means = {k: float(np.mean(list(cl[k].values()))) for k in ks}
                for i in range(len(ks)):
                    for j in range(i + 1, len(ks)):
                        a.append(means[ks[i]])
                        b.append(means[ks[j]])
                    os_ = sorted(cl[ks[i]])
                    for u in range(len(os_)):
                        for v in range(u + 1, len(os_)):
                            pa.append(cl[ks[i]][os_[u]])
                            pb.append(cl[ks[i]][os_[v]])
            if len(a) > 10:
                cross[0] += spearman(a, b) * len(a)
                cross[1] += len(a)
            if len(pa) > 10:
                plane[0] += spearman(pa, pb) * len(pa)
                plane[1] += len(pa)
    W = {}
    mu = {}
    for r in rows:
        mu.setdefault((r['o'], r['L']), []).append(value(r))
    mu = {k: float(np.mean(v)) for k, v in mu.items()}
    for r in rows:
        W.setdefault((r['o'], r['E']), {})[r['L']] = value(r) - mu[(r['o'], r['L'])]
    M = [[None] * 6 for _ in range(6)]
    for i, a in enumerate(LEADS):
        for j, b in enumerate(LEADS):
            pa = [(v[a], v[b]) for v in W.values() if a in v and b in v]
            if len(pa) > 10:
                M[i][j] = spearman([x[0] for x in pa], [x[1] for x in pa])
    return dict(lag=lag, cross=max(0.0, cross[0] / cross[1]) if cross[1] else 0.0, samePlane=plane[0] / plane[1] if plane[1] else 0.0, lead=M)


def sun_of(n):
    """Low-precision solar direction of the Astronomical Almanac, days from J2000; good to about 0.4 deg here, of date against GCRF. A label only."""
    L = math.radians((280.460 + 0.9856474 * n) % 360)
    g = math.radians((357.528 + 0.9856003 * n) % 360)
    lam = L + math.radians(1.915) * math.sin(g) + math.radians(0.020) * math.sin(2 * g)
    eps = math.radians(23.439 - 4e-7 * n)
    return np.array([math.cos(lam), math.cos(eps) * math.sin(lam), math.sin(eps) * math.sin(lam)])


def j2000(date):
    return float((np.datetime64(date) - np.datetime64('2000-01-01')).astype(int)) - 0.5


def plane2_event(rows, norad=54377, limit=75.0):
    """The samples of 54377 under C3-ab, with the December days of the design whose projected |beta| reaches the limit, each mapped to the measured cutoff at the same phase of the peak."""
    mine = [r for r in rows if r['o'] == norad and r.get('st')]
    normals = {}
    for r in mine:
        h = np.cross(r['st'][:3], r['st'][3:6])
        normals[r['E'][:10]] = h / np.linalg.norm(h)
    dates = sorted(normals)
    H = np.array([normals[x] for x in dates])
    t = np.array([j2000(x) for x in dates])
    node = np.unwrap(np.arctan2(H[:, 0], -H[:, 1]))
    inc = float(np.median(np.arccos(H[:, 2])))
    k, c = np.polyfit(t, node, 1)

    def beta(date):
        n = j2000(date)
        O = k * n + c
        v = np.array([math.sin(O) * math.sin(inc), -math.cos(O) * math.sin(inc), math.cos(inc)])
        return math.degrees(math.asin(float(np.clip(sun_of(n) @ v, -1, 1))))

    def days(a, b):
        return [str(np.datetime64(a) + i) for i in range(int((np.datetime64(b) - np.datetime64(a)).astype(int)) + 1)]
    measured = min(days('2025-12-01', '2026-02-15'), key=lambda x: beta(x))
    fresh = min(days('2026-11-15', '2027-01-31'), key=lambda x: beta(x))
    shift = int((np.datetime64(measured) - np.datetime64(fresh)).astype(int))
    by = {}
    for r in mine:
        by.setdefault(r['E'][:10], {})[r['L']] = r
    out = []
    for date in days('2026-11-15', '2026-12-31'):
        if abs(beta(date)) < limit:
            continue
        target = np.datetime64(date) + shift
        near = min(dates, key=lambda x: abs(int((np.datetime64(x) - target).astype(int))))
        samples = by[near]
        out.append(dict(date=date, beta=beta(date), measuredE=near, measuredBeta=math.degrees(math.asin(float(np.clip(sun_of(j2000(near)) @ normals[near], -1, 1)))),
                        d2=[samples[L]['d2'] if L in samples else None for L in LEADS], z=[samples[L]['z'] if L in samples else None for L in LEADS]))
    return dict(norad=norad, limitDeg=limit, peakMeasured=measured, peakFresh=fresh, shiftDays=shift, nodeRateDegPerDay=math.degrees(k), days=out)


if '--dependence' in sys.argv:
    ex = json.load(open(os.path.join(STORE, 'extract', 'R3.json')))
    # the gate reads windows with the whole 90 days behind them, as fresh windows will (C3-A9's subset); --from 2025-01-01 gives the all-windows report
    FROM = opt('--from', CONFIG['model']['fitFrom'])
    prim = [r for r in ex['rows'] if r['primary'] and math.isfinite(r['d2']) and r['E'][:10] >= FROM]
    out = dict(samples=len(prim), fromCutoff=FROM, clusters=ex['clusters'])
    marg = {}
    for L in LEADS:
        x = np.array([r['d2'] / 3 for r in prim if r['L'] == L])
        if len(x):
            mean = float(x.mean())
            x = x / mean
            marg[L] = dict(n=int(len(x)), rawMean=mean, covAtMean1=float(np.mean(3 * x <= 7.8147)), varPerWindow=float(x.var()), q=[float(v) for v in np.quantile(x, np.linspace(0, 1, 401))])
    out['marginal'] = marg
    out['d2'] = dependence(prim, lambda r: math.log(max(r['d2'], 1e-12)))
    out['z'] = {ax: dependence(prim, lambda r, k=k: r['z'][k]) for k, ax in enumerate('RTN')}
    # same-plane on Galileo alone and on GLONASS alone, ln d2
    out['samePlaneByConstellation'] = {}
    for nm, test in (('Galileo', lambda c: c.startswith('GAL')), ('GLONASS', lambda c: c.startswith('GLO'))):
        out['samePlaneByConstellation'][nm] = dependence([r for r in prim if test(r['cl'])], lambda r: math.log(max(r['d2'], 1e-12)))['samePlane']
    # realized keep and leads: windows with a truth at the lead over the registered grid, per family (cal/val), with notices and coverage
    grid = {}
    for r in ex['rows']:
        grid.setdefault(r['o'], {}).setdefault(r['L'], set()).add(r['E'])
    fam = lambda o, c: 'LARES-2' if o == 53105 else ('ilrsa' if o in (22195, 19751, 20026, 8820) else 'gnss')
    per = {}
    for o, by in grid.items():
        all_E = set().union(*by.values())
        f = fam(o, None)
        d = per.setdefault(f, dict(n=0, leads={L: 0 for L in LEADS}))
        d['n'] += len(all_E)
        for L in LEADS:
            d['leads'][L] += len(by.get(L, ()))
    out['leadCoverage'] = {f: {L: v['leads'][L] / max(v['n'], 1) for L in LEADS} for f, v in per.items()}
    notices = sum(1 for r in ex['rows'] if r['notice'] and r['L'] == 24) / max(1, sum(1 for r in ex['rows'] if r['L'] == 24))
    out['noticeShareOfWindows'] = notices
    out['stormDaysCalVal'] = ex['stormDaysCalVal']
    # C3-A6: plane 2's event as measured on 54377 under C3-ab, by beta, and mapped by beta onto the December grid
    out['plane2Event'] = plane2_event(ex['rows'])
    json.dump(out, open(os.path.join(P7, 'inputs.json'), 'w'), indent=1)
    print(json.dumps(dict(samples=out['samples'], crossD2=out['d2']['cross'], samePlaneD2=out['d2']['samePlane'], samePlaneBy=out['samePlaneByConstellation'], lagD2=out['d2']['lag'], varPerWindow={k: v['varPerWindow'] for k, v in marg.items()}, rawMean={k: v['rawMean'] for k, v in marg.items()}, leadCoverage=out['leadCoverage'], noticeShare=notices), indent=0))
    sys.exit(0)

if '--summary' in sys.argv:
    res = {}
    for f in sorted(os.listdir(P7)):
        if f.endswith('.json') and f != 'inputs.json' and not f.startswith('summary'):
            res[f[:-5]] = json.load(open(os.path.join(P7, f)))
    json.dump(res, open(os.path.join(P7, 'summary.json'), 'w'), indent=1)
    for end in sorted(set(k.split('.')[0] for k in res)):
        print(end)
        for k, v in sorted(res.items()):
            if k.startswith(end + '.'):
                print('  ', k.split('.', 1)[1].ljust(24), json.dumps({x: v.get(x) for x in ('trials', 'nEff', 'pass', 'q6', 'n')})[:200])
    sys.exit(0)

# ---- an arm
IN = json.load(open(os.path.join(P7, 'inputs.json')))
ARM = opt('--arm')
END = opt('--end', '2026-11-30')
TR = int(opt('--trials', '2000'))
SEED = int.from_bytes(hashlib.sha256(('C3S|p7|%s|%s' % (END, ARM)).encode()).digest()[:4], 'big')
rng = np.random.default_rng(SEED)


def erf(x):
    s = np.sign(x)
    x = np.abs(x)
    t = 1 / (1 + 0.3275911 * x)
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * np.exp(-x * x))


GRID = np.concatenate([np.linspace(1e-6, 1, 4001), np.linspace(1, 80, 40000)[1:]])
FG = erf(np.sqrt(GRID / 2)) - np.sqrt(2 * GRID / np.pi) * np.exp(-GRID / 2)


def Phi(g):
    return 0.5 * (1 + erf(g / math.sqrt(2)))


def pear(s):
    return 2 * math.sin(math.pi * s / 6)


def psd(M):
    ev, V = np.linalg.eigh(M)
    M = (V * np.clip(ev, 1e-6, None)) @ V.T
    d = np.sqrt(np.diag(M))
    return M / np.outer(d, d)


U401 = np.linspace(0, 1, 401)
MARG = [np.array(IN['marginal'][str(L)]['q']) for L in LEADS]


def r_of_factory(prof):
    lags = sorted(int(x) for x in prof)
    p = {int(k): v for k, v in prof.items()}

    def r_of(days):
        if days <= 0:
            return 1.0
        if days <= lags[0]:
            return p[lags[0]]
        if days >= lags[-1]:
            return p[lags[-1]]
        for a, b in zip(lags, lags[1:]):
            if a <= days <= b:
                return p[a] + (p[b] - p[a]) * (days - a) / (b - a)
    return r_of


def chol_time(r_of, T):
    M = np.array([[1.0 if i == j else pear(r_of(abs(i - j))) for j in range(T)] for i in range(T)])
    return np.linalg.cholesky(psd(M))


def lead_chol(M):
    A = np.vectorize(pear)(np.nan_to_num(np.array(M, float), nan=0.0))
    np.fill_diagonal(A, 1.0)
    return np.linalg.cholesky(psd(A))


def dep_of(d, plane):
    rx = max(0.0, d['cross'])
    rp = rx if plane is None else max(rx, plane)
    return dict(r_of=r_of_factory(d['lag']), rx=pear(rx), rp=pear(rp), LL=lead_chol(d['lead']))


D0 = np.datetime64('2025-10-03')
NCV = int((np.datetime64('2026-05-31') - D0).astype(int)) + 1
SEQ = np.zeros(NCV, bool)
for d in IN['stormDaysCalVal']:
    i = int((np.datetime64(d) - D0).astype(int))
    if 0 <= i < NCV:
        SEQ[i] = True


def storm_days(n):
    out = []
    while len(out) < n:
        s = rng.integers(NCV)
        out += [SEQ[(s + j) % NCV] for j in range(30)]
    return np.array(out[:n])


DAY0 = np.datetime64('2026-08-31')


def dayi(s):
    return int((np.datetime64(s) - DAY0).astype(int))


SPAN = {1: (-1, 0), 6: (-1, 0), 12: (-1, 0), 24: (-1, 0), 48: (-1, 1), 72: (-1, 2)}


def grid3(a, b):
    return np.array([d for d in range(dayi(a), dayi(b) + 1) if (d - 1) % 3 == 0])


def sundays(a, b, stub=('2026-09-20', '2026-09-27')):
    s = {dayi(x) for x in stub}
    return np.array([d for d in range(dayi(a), dayi(b) + 1) if (d + 1) % 7 == 0 and d not in s])


P = CONFIG['population']['judged']
CL = {int(k): v for k, v in IN['clusters'].items()}
COV = IN['leadCoverage']
NKEEP = json.load(open(os.path.join(ROOT, 'results/ffm-covariance-adaptive/precheck-P2.json')))['noticeKeep']


def leads_of(fam):
    c = COV.get(fam, {})
    return np.array([c.get(str(L), 0.0) >= 0.5 for L in LEADS], bool), np.array([c.get(str(L), 0.0) for L in LEADS], float)


def design(end):
    des = []
    gl, gc = leads_of('gnss')
    il, ic = leads_of('ilrsa')
    ll, lc = leads_of('LARES-2')
    for name, n in P['ilrsa'].items():
        des.append(dict(name=name, days=sundays('2026-09-06', min(end, '2026-12-27') if False else end), keep=float(np.max(ic)), cluster=CL.get(n, name), leads=il, gnss=False))
    des.append(dict(name='LARES-2', days=grid3('2026-09-01', end), keep=float(np.max(lc)) if lc.any() else 0.0, cluster='53105', leads=ll, gnss=False))
    for n in P['glonass']['c2'] + P['glonass']['new']:
        des.append(dict(name=str(n), days=grid3('2026-09-25', end), keep=float(NKEEP['glonass']['keep'] * np.max(gc)), cluster=CL[n], leads=gl, gnss=True))
    for n in P['galileo']['new'] + P['galileo']['c2Six']:
        des.append(dict(name=str(n), days=grid3('2026-09-25', end), keep=float(NKEEP['galileo']['keep'] * np.max(gc)), cluster=CL[n], leads=gl, gnss=True))
    return des


STRICT = dayi('2026-10-26')


def simulate(des, plane, arm, trials, scale=None, one=None, manv=0.0, shape='registered', axes=False, bias=0.0, event=None):
    S = len(des)
    T = 1 + max(int(c['days'].max()) for c in des)
    cl = sorted(set(c['cluster'] for c in des))
    ci = np.array([cl.index(c['cluster']) for c in des])
    planar = np.bincount(ci)[ci] > 1
    deps = [dep_of(IN['z'][ax], plane) for ax in 'RTN'] if axes else [dep_of(IN['d2'], plane)]
    LT = [chol_time(d['r_of'], T) for d in deps]
    gn = np.array([c['gnss'] for c in des])
    LM = np.array([c['leads'] for c in des])
    out = []
    for _ in range(trials):
        Z = []
        for d, lt in zip(deps, LT):
            rx, rp = d['rx'], d['rp']
            rpe = np.where(planar, max(rp - rx, 0.0), 0.0)
            C = lt @ rng.standard_normal((T, 6)) @ d['LL'].T
            Pz = np.einsum('tu,cul,ml->ctm', lt, rng.standard_normal((len(cl), T, 6)), d['LL'])
            U = np.einsum('tu,sul,ml->stm', lt, rng.standard_normal((S, T, 6)), d['LL'])
            Z.append(math.sqrt(rx) * C[None] + np.sqrt(rpe)[:, None, None] * Pz[ci] + np.sqrt(np.maximum(1 - rx - rpe, 0.0))[:, None, None] * U)
        if axes:
            Z = np.array(Z)
            Z[1] += bias
            D2 = (Z ** 2).sum(axis=0)
        elif arm == 'gauss':
            D2 = np.interp(Phi(Z[0]), FG, GRID)
        else:
            u = Phi(Z[0])
            D2 = np.stack([3 * np.interp(u[:, :, l], U401, MARG[l]) for l in range(6)], axis=2)
        mult = np.ones(S)
        if scale:
            mult *= scale
        if one:
            mult[rng.integers(S)] *= one
        D2 = D2 * mult[:, None, None]
        if axes:
            Z = Z * np.sqrt(mult)[None, :, None, None]
        if manv:
            hit = (rng.random((S, T)) < manv) & gn[:, None]
            for s, t in zip(*np.where(hit)):
                tau = rng.uniform(-24, 72)
                F = math.exp(rng.uniform(math.log(20), math.log(200))) if shape == 'registered' else 5.0
                for l, L in enumerate(LEADS):
                    if L > tau:
                        D2[s, t, l] *= F
        if event:
            # C3-A6: the event as measured, on every plane 2 satellite, on the December days it reaches
            for e in event:
                for i, c in enumerate(des):
                    if c['cluster'] == 'GLO-P2' and dayi(e['date']) in c['days']:
                        t = dayi(e['date'])
                        for l in range(6):
                            if e['d2'][l] is not None:
                                D2[i, t, l] = e['d2'][l]
                                if axes:
                                    Z[:, i, t, l] = e['z'][l]
        st = storm_days(T + 4)
        STM = np.zeros((T, 6), bool)
        for t in range(T):
            for l, L in enumerate(LEADS):
                a, b = SPAN[L]
                STM[t, l] = st[t + 1 + a: t + 1 + b + 1].any()
        K = np.zeros((S, T), bool)
        for i, c in enumerate(des):
            K[i, c['days'][rng.random(len(c['days'])) < c['keep']]] = True
        K = K[:, :, None] & LM[:, None, :] & ~STM[None]
        Kf = K.astype(float)
        n = Kf.sum(axis=(0, 1))
        ncl = np.array([len(set(ci[K[:, :, l].any(axis=1)])) for l in range(6)])
        Sd = D2 * Kf
        Kc = (D2 <= 7.8147) * Kf
        mean = Sd.sum(axis=(0, 1)) / np.maximum(n, 1) / 3
        cov = Kc.sum(axis=(0, 1)) / np.maximum(n, 1)
        Wc = rng.multinomial(len(cl), np.ones(len(cl)) / len(cl), size=BOOT).astype(float)[:, ci]
        nb = T - 11
        bc = rng.multinomial(int(math.ceil(T / 12)), np.ones(nb) / nb, size=BOOT).astype(float)
        V = np.zeros((BOOT, T))
        for j in range(12):
            V[:, j:j + nb] += bc
        bn = np.einsum('bs,stl,bt->bl', Wc, Kf, V)
        bS = np.einsum('bs,stl,bt->bl', Wc, Sd, V) / np.maximum(bn, 1) / 3
        bK = np.einsum('bs,stl,bt->bl', Wc, Kc, V) / np.maximum(bn, 1)
        mlo, mhi = np.percentile(bS, [2.5, 97.5], axis=0)
        clo, chi = np.percentile(bK, [2.5, 97.5], axis=0)
        o = dict(n=n, ncl=ncl, mean=mean, cov=cov, inb=(mean >= 0.8) & (mean <= 1.25) & (cov >= 0.93) & (cov <= 0.97), ovl=(mhi >= 0.8) & (mlo <= 1.25) & (chi >= 0.93) & (clo <= 0.97))
        if axes:
            KZ = Kf[None]
            mz2 = ((Z ** 2) * KZ).sum(axis=(1, 2)) / np.maximum(n, 1)
            mz = (Z * KZ).sum(axis=(1, 2)) / np.maximum(n, 1)
            o['axisOk'] = ((mz2 >= 0.5) & (mz2 <= 2.0) & (np.abs(mz) <= 0.5)).all(axis=0)
            bz2 = np.einsum('bs,astl,bt->bal', Wc, (Z ** 2) * KZ, V) / np.maximum(bn, 1)[:, None, :]
            bz = np.einsum('bs,astl,bt->bal', Wc, Z * KZ, V) / np.maximum(bn, 1)[:, None, :]
            q2lo, q2hi = np.percentile(bz2, [2.5, 97.5], axis=0)
            qlo, qhi = np.percentile(bz, [2.5, 97.5], axis=0)
            o['axisOvl'] = ((q2hi >= 0.5) & (q2lo <= 2.0) & (qhi >= -0.5) & (qlo <= 0.5)).all(axis=0)
        out.append(o)
    return out


def verdict(o, neff, k=3, q6b=False):
    el = (o['n'] >= 100) & (o['ncl'] >= 3) & (neff >= 60)
    if el.sum() < 3:
        return 'not testable'
    ok = o['ovl'][el].all() and (not q6b or o['axisOvl'][el].all())
    inb = o['inb'] & o['axisOk'] if q6b else o['inb']
    return 'pass' if ok and int((inb & el).sum()) >= k else 'fail'


def rate(res, neff, q6b=False):
    v = [verdict(o, neff, 3, q6b) for o in res]
    return dict(k3=v.count('pass') / len(v), notTestable=v.count('not testable') / len(v))


des = design(END)
samePlane = IN['samePlaneByConstellation'].get('Galileo', 0.1)
plane = max(0.0, samePlane)
base = os.path.join(P7, '%s.base-heavy.json' % END)
R = dict(end=END, arm=ARM, trials=TR, seed=SEED, satellites=len(des), clusters=sorted(set(c['cluster'] for c in des)), plane=plane)
if ARM == 'base-heavy':
    h = simulate(des, plane, 'heavy', TR)
    m = np.array([o['mean'] for o in h])
    neff = (2 / 3) / np.maximum(m.var(axis=0), 1e-12)
    R.update(nEff=[float(x) for x in neff], n=[float(x) for x in np.mean([o['n'] for o in h], axis=0)], meanCov=[[float(np.mean([o['mean'][l] for o in h])), float(np.mean([o['cov'][l] for o in h]))] for l in range(6)], perfect=rate(h, neff), **{'pass': rate(h, neff)})
else:
    neff = np.array(json.load(open(base))['nEff'])
    A = dict(gauss=dict(arm='gauss'), x07=dict(arm='heavy', scale=0.7), x08=dict(arm='heavy', scale=0.8), x125=dict(arm='heavy', scale=1.25), x14=dict(arm='heavy', scale=1.4), one3=dict(arm='heavy', one=3.0),
             plane03=dict(arm='heavy', plane=0.3), manv0142reg=dict(arm='heavy', manv=0.0142, shape='registered'), manv0142meas=dict(arm='heavy', manv=0.0142, shape='measured'),
             manv0100reg=dict(arm='heavy', manv=0.0100, shape='registered'), manv0100meas=dict(arm='heavy', manv=0.0100, shape='measured'), manv0030reg=dict(arm='heavy', manv=1 / 332, shape='registered'), manv0030meas=dict(arm='heavy', manv=1 / 332, shape='measured'))
    if ARM in A:
        kw = dict(A[ARM])
        arm = kw.pop('arm')
        pl = kw.pop('plane', plane)
        res = simulate(des, pl, arm, TR, **kw)
        R['pass'] = rate(res, neff)
    elif ARM == 'plane2':
        # C3-A6: the December design with plane 2's event, heavy-tail arm; eligibility on the base arm's n_eff and, beside it, on this arm's own
        res = simulate(des, plane, 'heavy', TR, event=IN['plane2Event']['days'])
        m = np.array([o['mean'] for o in res])
        own = (2 / 3) / np.maximum(m.var(axis=0), 1e-12)
        R.update(event=IN['plane2Event'], nEffOwn=[float(x) for x in own], meanCov=[[float(np.mean([o['mean'][l] for o in res])), float(np.mean([o['cov'][l] for o in res]))] for l in range(6)], passOwnNEff=rate(res, own), **{'pass': rate(res, neff)})
    elif ARM == 'q6plane2':
        # C3-A6: the same, on the per-axis model, under both Q6 rules
        res = simulate(des, plane, 'gauss', TR, axes=True, event=IN['plane2Event']['days'])
        R['pass'] = dict(a=rate(res, neff), b=rate(res, neff, q6b=True))
    elif ARM.startswith('q6'):
        kw = dict(q6=dict(), q6bias07=dict(bias=0.7), q6x08=dict(scale=0.8), q6x125=dict(scale=1.25))[ARM]
        res = simulate(des, plane, 'gauss', TR, axes=True, **kw)
        R['pass'] = dict(a=rate(res, neff), b=rate(res, neff, q6b=True))
    else:
        raise SystemExit('unknown arm')
json.dump(R, open(os.path.join(P7, '%s.%s.json' % (END, ARM)), 'w'), indent=1)
print(json.dumps(R)[:400])
