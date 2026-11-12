"""Statistics on the coverage rows (covbuild.mjs, covterms.mjs). Arithmetic only: every error and variance is the modules'.
The split rule (size-split-rule.json, its SHA-256 checked): each row's cutoffs before its choice date choose a factor, the others are
judged; strong drag 2026 and near 700 km are judged only. A judged cell is a regime, a lead day and an axis: the median |z| over every
30 min sample of the day (z = error / stated sigma on that axis), and the shares within 1 and 3 sigma; the band is [0.603, 0.754] around
the half-normal median 0.6745. <out> and --to are refused inside this repository. The rows are those of <out>/windows.txt only; error
rows (not flown again on resume), rows of windows outside it and stated variances at or below zero (kept at 1e-14 km^2) are counted in
every output; a fit with no choice samples is refused, and a cell with no samples is left out.

  python3 -I summary.py fixture <out> <build sha12> <label> [--caps T,Z] [--factor-off f] [--registered f] [--causes file] [--to dir]
    The rows and the judged cells a test registers. Rows: <to>/rows-<label>.jsonl, per window {regime, set (choice | judged), arcH, cp
    (COV_PROPAGATION), fitRmsKm, samples [[s, eR, eI, eC, vR, vI, vC], ...]}, ordered by regime, set, arc and FLOOR_UU_KM2, with no
    name, number or date. --factor-off f: the build wrote a radial factor f into its floors (FLOOR_UU x f^2, FLOOR_VU and FLOOR_WU x f);
    the rows are written with it taken off (those floors divided back, the radial variance as flown less (1 - 1/f^2) FLOOR_UU), so a
    test applies its own. Judged: <to>/judged-<label>.json, every cell at factor 1 and at the registered radial factor (--registered,
    else the one fitted on the choice windows by maximum likelihood, grid exp(-1.5 to 2.5 by 0.02)); a cell outside the band is named
    too narrow or too wide, or by the text --causes gives it ({"<regime>|<day>|<axis>": text}). <to> defaults to <out>/fixture-<sha12>.
  python3 -I summary.py compare <out> <main rows> <change rows> --writes fR,fT,fN [--r-only]
    A change against main on the windows both flew; each rows argument is <sha12> or <sha12>-capsT-Z (covbuild's file name). --writes:
    the floor factors the change writes into FLOOR_* (1,1,1 for none). The factor per axis fitted on the change's choice windows with its
    own factor off (grid exp(-1.5 to 2.5 by 0.005); --r-only: radial only); every judged cell for main, the change factor off, as flown,
    and with the fitted factors; the acceptance: main's in-band cells the change takes out of the band, and too-narrow cells it makes
    narrower. Writes <out>/compare-<main rows>-<change rows>.json.
  python3 -I summary.py terms <out> <build sha12> --term drag|sl|se|si --axis R|T|N [--caps T,Z]
    The factor k on one term's sigma for one axis, v(k) = v + (k^2 - 1) U_term (the variance is linear in the size squared), by maximum
    likelihood on the choice windows (grid exp(-4 to 2.5 by 0.005)); the judged cells of that axis before and after, with the floor's and
    the term's shares of the variance, and the largest change k makes to a judged cell of the other two axes. Writes
    <out>/terms-<sha12>[-capsT-Z]-<term>-<axis>.json."""
import glob, hashlib, json, math, os, re, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.realpath(os.path.join(HERE, '..', '..'))
def outside_repo(p, what):
    """Refuse p inside this repository (through links; letter case folded where the file system folds it), as lib.mjs outDir does."""
    head, tail = os.path.abspath(p), []
    while not os.path.exists(head): head, t = os.path.split(head); tail.insert(0, t)
    real = os.path.join(os.path.realpath(head), *tail)
    fold = (lambda s: s.lower()) if sys.platform in ('darwin', 'win32') else (lambda s: s)
    rel = os.path.relpath(fold(real), fold(REPO))
    if not (rel == '..' or rel.startswith('..' + os.sep)): raise SystemExit(f'{p} ({what}) is inside this repository: rows of real windows never go into it; give a directory outside it')
    return p
RULE_FILE = os.path.join(HERE, 'size-split-rule.json')
RULE = 'd3177de7fe71ad9ef048ec7e1c2d9d2e9d9748b7fa4320349897d06ee15642a0'
assert hashlib.sha256(open(RULE_FILE, 'rb').read()).hexdigest() == RULE, 'size-split-rule.json differs from its registered SHA-256'
REGIMES = ('T', 'P', 'LS', 'DO', 'S1')
# the choice dates: a cutoff before it chooses; '0000' (no date in the rule, or a date before every cutoff): judged only
CH = {g: (json.load(open(RULE_FILE))['choiceBefore'].get(g, '0000')[:10]) for g in REGIMES}
NAME = {'T': 'strong drag 2025', 'P': 'strong drag 2026', 'LS': 'laser spheres', 'DO': 'altimetry, burn-free', 'S1': 'near 700 km, burn-free'}
FL = ['FLOOR_UU_KM2', 'FLOOR_VV_KM2', 'FLOOR_WW_KM2']
BAND = (0.603, 0.754)
HALF_NORMAL_MEDIAN = 0.6744897501960817
inb = lambda m: BAND[0] <= m <= BAND[1]

def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default
def caps_tag():
    c = arg('--caps')
    return '' if not c else '-caps' + '-'.join(c.split(','))
def s1_days(out):
    f = os.path.join(out, 'windows.json')
    return tuple(json.load(open(f))['s1ScoredDays']) if os.path.exists(f) else (1, 2, 3)
def days_of(g, out):
    return s1_days(out) if g == 'S1' else (1, 2, 3, 5, 7)
COUNTS = {}
def load(out, kind, sha, tag):
    """Every shard of <kind>-<sha><tag>-<k>of<n>.jsonl, in shard order, one n, all present, restricted to the windows of <out>/windows.txt.
    A window whose fit or flight failed is an error row: left out and counted (COUNTS, written into each output); a stopped shard resumes
    past it, so it is flown again only when its line is deleted from the shard's file."""
    outside_repo(out, '<out>')
    pat = re.compile(rf'^{kind}-{re.escape(sha)}{re.escape(tag)}-(\d+)of(\d+)\.jsonl$')
    files = sorted(((int(m.group(1)), int(m.group(2)), f) for f in os.listdir(out) for m in [pat.match(f)] if m))
    if not files: raise SystemExit(f'no {kind}-{sha}{tag}-<k>of<n>.jsonl in {out}')
    ns = {n for _, n, _ in files}
    if len(ns) != 1 or sorted(k for k, _, _ in files) != list(range(next(iter(ns)))): raise SystemExit(f'{kind}-{sha}{tag}: shards {[(k, n) for k, n, _ in files]}, not one complete set')
    wf = os.path.join(out, 'windows.txt')
    if not os.path.exists(wf): raise SystemExit(f'{wf} is absent: the rows are counted against the window set they were flown on')
    listed = {l for l in open(wf).read().split('\n') if l}
    rows, errors, other = {}, set(), set()
    for _, _, f in files:
        for l in open(os.path.join(out, f)):
            r = json.loads(l)
            if r['line'] not in listed: other.add(r['line']); continue
            if 'error' in r: errors.add(r['line']); continue
            rows[r['line']] = r
    errors -= set(rows)
    c = {'windows': len(listed), 'rows': len(rows), 'errorRows': len(errors), 'withoutRow': len(listed - set(rows) - errors), 'notInWindowSet': len(other),
         'note': 'error rows are left out and not flown again on resume; rows of windows outside windows.txt are left out'}
    COUNTS[f'{kind}-{sha}{tag}'] = c
    print(f'{kind}-{sha}{tag}: {json.dumps(c)}', file=sys.stderr)
    return rows
def nonpositive(rows, out):
    """Stated variances at or below zero on the scored days, per axis: kept at 1e-14 km^2 in every statistic (z then very large), counted."""
    n = [0, 0, 0]
    for r in rows:
        for i, s in enumerate(r['epochsS']):
            if math.ceil(s / 86400) not in days_of(r['group'], out): continue
            for a in range(3): n[a] += r['v'][i][a] <= 0
    return {'R': n[0], 'T': n[1], 'N': n[2], 'note': 'kept at 1e-14 km^2'}
def need(n, what):
    if not n: raise SystemExit(f'no {what}: nothing to fit')
def sha256(f): return hashlib.sha256(open(f, 'rb').read()).hexdigest()
def zstats(e, v):
    z = np.abs(e) / np.sqrt(v)
    return [float(np.median(z)), float(np.mean(z <= 1)), float(np.mean(z <= 3))]

def fixture():
    out, sha, label = sys.argv[2:5]
    tag = caps_tag()
    F_OFF = float(arg('--factor-off')) if arg('--factor-off') else None
    REG_R = float(arg('--registered')) if arg('--registered') else None
    causes = json.load(open(arg('--causes'))) if arg('--causes') else {}
    to = outside_repo(arg('--to', os.path.join(out, f'fixture-{sha}{tag}')), '--to')
    NAME['S1'] = f'near 700 km, burn-free to day {max(s1_days(out))}'
    rows = load(out, 'covbuild', sha, tag)
    if F_OFF:
        for r in rows.values():
            cp = dict(r['cp']); uu = cp['FLOOR_UU_KM2']
            cp['FLOOR_UU_KM2'] = uu / F_OFF ** 2; cp['FLOOR_VU_KM2'] /= F_OFF; cp['FLOOR_WU_KM2'] /= F_OFF
            r['v'] = [[v[0] - uu + cp['FLOOR_UU_KM2'], v[1], v[2]] for v in r['v']]
            r['cp'] = cp
    build = json.load(open(os.path.join(out, 'builds', sha, 'build.json')))
    pcf = sorted({r['pcf'] for r in rows.values()})
    win = []
    for r in rows.values():
        g = r['group']; days = days_of(g, out)
        smp = [[s] + [float(x) for x in r['e'][i]] + [float(x) for x in r['v'][i]] for i, s in enumerate(r['epochsS']) if math.ceil(s / 86400) in days]
        win.append({'regime': g, 'set': 'choice' if r['cutoff'] < CH[g] else 'judged', 'arcH': r['arcH'], 'cp': r['cp'], 'fitRmsKm': r['fitRmsKm'], 'samples': smp})
    # a complete order (never the shards' order): regime, set, arc, radial floor, then the fit RMS and the whole COV_PROPAGATION
    win.sort(key=lambda w: (w['regime'], w['set'], w['arcH'], w['cp']['FLOOR_UU_KM2'], w['fitRmsKm'] is None, w['fitRmsKm'] or 0.0, json.dumps(w['cp'], sort_keys=True)))
    clamped = nonpositive(rows.values(), out)
    os.makedirs(to, exist_ok=True)
    rf = os.path.join(to, f'rows-{label}.jsonl')
    with open(rf, 'w') as fh:
        for i, w in enumerate(win): fh.write(json.dumps({'id': i, **w}) + '\n')
    def arr(W, days):
        e, v, fl = [], [], []
        for w in W:
            for q in w['samples']:
                d = math.ceil(q[0] / 86400)
                if d not in days or d not in days_of(w['regime'], out): continue
                e.append(q[1:4]); v.append([max(x, 1e-14) for x in q[4:7]]); fl.append([max(w['cp'][k], 0) for k in FL])
        return np.array(e), np.array(v), np.array(fl)
    C = [w for w in win if w['set'] == 'choice']; J = [w for w in win if w['set'] == 'judged']
    e, v, fl = arr(C, (1, 2, 3, 5, 7))
    if not REG_R: need(len(e), 'choice window samples to fit the factor on (give --registered)')
    grid = np.exp(np.arange(-1.5, 2.51, 0.02))
    fac = []
    for a in range(3):
        best = None
        for f in (grid if len(e) else []):
            vv = np.maximum(v[:, a] + (f * f - 1) * fl[:, a], 1e-14); val = float(np.sum(np.log(vv) + e[:, a] ** 2 / vv))
            if best is None or val < best[0]: best = (val, float(f))
        fac.append(best[1] if best else None)
    reg = [REG_R if REG_R else fac[0], 1.0, 1.0]
    table = []
    for g in REGIMES:
        Jg = [w for w in J if w['regime'] == g]
        for d in ((1, 3) if g == 'S1' else (1, 3, 5, 7)):
            if not Jg or d not in days_of(g, out): continue
            e, v, fl = arr(Jg, (d,))
            if not len(e): continue
            v2 = v.copy()
            for a in range(3): v2[:, a] = np.maximum(v[:, a] + (reg[a] ** 2 - 1) * fl[:, a], 1e-14)
            for a, ax in enumerate('RIC'):
                c0, c1 = zstats(e[:, a], v[:, a]), zstats(e[:, a], v2[:, a])
                cell = {'regime': g, 'name': NAME[g], 'day': d, 'axis': ax, 'windows': len(Jg), 'samples': int(len(e)),
                        'atOne': {'medianAbsZ': c0[0], 'within1': c0[1], 'within3': c0[2]}, 'registered': {'medianAbsZ': c1[0], 'within1': c1[1], 'within3': c1[2]},
                        'floorShareMedian': float(np.median(fl[:, a] / v[:, a]))}
                if not inb(c1[0]): cell['outsideBand'] = causes.get(f'{g}|{d}|{ax}', 'too narrow' if c1[0] > BAND[1] else 'too wide')
                table.append(cell)
    res = {'what': f'sdn-ap stated covariance against its own errors on the judged windows{", records at " + arg("--caps").replace(",", "/") + " (tesseral/zonal)" if arg("--caps") else ""}',
           'build': {'commit': build['commit'], 'wasmSha256': build['sha256'], 'version': build['version']}, 'pcf': pcf,
           'rows': {'file': os.path.basename(rf), 'sha256': sha256(rf), 'windows': len(win), 'choice': len(C), 'judged': len(J),
                    'byRegime': {g: {'choice': sum(1 for w in C if w['regime'] == g), 'judged': sum(1 for w in J if w['regime'] == g)} for g in REGIMES}},
           'splitRule': {'file': 'size-split-rule.json', 'sha256': RULE},
           'factorFit': {'what': 'f on the floor sigma per axis, maximum likelihood over the choice windows, days 1, 2, 3, 5, 7', 'grid': 'exp(-1.5 to 2.5 by 0.02)',
                         'R': fac[0], 'I': fac[1], 'C': fac[2], 'samples': int(len(arr(C, (1, 2, 3, 5, 7))[0]))},
           'factorOff': F_OFF,
           'registered': {'R': reg[0], 'I': 1.0, 'C': 1.0, 'note': 'the radial factor given (--registered); in-track and cross-track at 1' if REG_R else 'the radial factor fitted on the choice windows; in-track and cross-track at 1'},
           'band': list(BAND), 'halfNormalMedian': HALF_NORMAL_MEDIAN, 'counts': COUNTS[f'covbuild-{sha}{tag}'], 'nonpositiveVariances': clamped, 'judged': table}
    jf = os.path.join(to, f'judged-{label}.json')
    json.dump(res, open(jf, 'w'), indent=1)
    print('rows', rf, res['rows']['sha256'], res['rows']['windows'], 'windows', res['rows']['byRegime'])
    print('judged', jf, sha256(jf))
    print('pcf', pcf, '; factor fit R/I/C', [None if x is None else round(x, 3) for x in fac], 'on', len(C), 'choice windows;', 'variances at or below zero', clamped)
    for c in table:
        print(f"  {c['name']} ({c['windows']}) day {c['day']} {c['axis']}: {c['atOne']['medianAbsZ']:.3f} / {100 * c['atOne']['within1']:.0f} % / {100 * c['atOne']['within3']:.1f} %  ->  {c['registered']['medianAbsZ']:.3f} / {100 * c['registered']['within1']:.0f} % / {100 * c['registered']['within3']:.1f} %   floor {100 * c['floorShareMedian']:.0f} %{'   OUT: ' + c['outsideBand'] if c.get('outsideBand') else ''}")

def compare():
    out, MAIN, CHG = sys.argv[2:5]
    FB = [float(x) for x in arg('--writes', '1,1,1').split(',')]
    M, C = load(out, 'covbuild', MAIN, ''), load(out, 'covbuild', CHG, '')
    common = sorted(set(M) & set(C))
    print(f'windows: main {len(M)}, change {len(C)}, both {len(common)}')
    def arr(rows, days, off=False):
        e, v, fl = [], [], []
        for r in rows:
            F = [max(r['cp'][k], 0) for k in FL]
            Foff = [F[a] / FB[a] ** 2 for a in range(3)]
            for i, s in enumerate(r['epochsS']):
                d = math.ceil(s / 86400)
                if d not in days or d not in days_of(r['group'], out): continue
                vv = [max(x, 1e-14) for x in r['v'][i]]
                if off: vv = [max(vv[a] + Foff[a] - F[a], 1e-14) for a in range(3)]
                e.append(r['e'][i]); v.append(vv); fl.append(Foff if off else F)
        return np.array(e).reshape(-1, 3), np.array(v).reshape(-1, 3), np.array(fl).reshape(-1, 3)
    choice = [C[k] for k in common if C[k]['cutoff'] < CH[C[k]['group']]]
    e, v, fl = arr(choice, (1, 2, 3, 5, 7), off=True)
    need(len(e), "choice window samples of the change")
    grid = np.exp(np.arange(-1.5, 2.5001, 0.005))
    fac = []
    for a in range(3):
        vals = [float(np.sum(np.log(np.maximum(v[:, a] + (f * f - 1) * fl[:, a], 1e-14)) + e[:, a] ** 2 / np.maximum(v[:, a] + (f * f - 1) * fl[:, a], 1e-14))) for f in grid]
        fac.append(float(grid[int(np.argmin(vals))]))
    print(f'the factor on the floor sigma, maximum likelihood on {len(choice)} choice windows of the change with its factor off: R {fac[0]:.3f}, T {fac[1]:.3f}, N {fac[2]:.3f}  (the change writes R {FB[0]}, T {FB[1]}, N {FB[2]})')
    R_ONLY = '--r-only' in sys.argv
    if R_ONLY: fac = [fac[0], 1.0, 1.0]; print(f'  applied: R {fac[0]:.3f} only (T and N at 1)')
    st = lambda e, v, a: zstats(e[:, a], v[:, a])
    cells = []
    for g in REGIMES:
        ks = [k for k in common if C[k]['group'] == g and C[k]['cutoff'] >= CH[g]]
        if not ks: continue
        for d in days_of(g, out):
            em, vm, _ = arr([M[k] for k in ks], (d,))
            ec, vc, _ = arr([C[k] for k in ks], (d,))
            eo, vo, flo = arr([C[k] for k in ks], (d,), off=True)
            if not (len(em) and len(ec)): continue
            vf = vo.copy()
            for a in range(3): vf[:, a] = np.maximum(vo[:, a] + (fac[a] ** 2 - 1) * flo[:, a], 1e-14)
            for a, ax in enumerate('RTN'):
                cells.append({'row': g, 'name': NAME[g], 'windows': len(ks), 'day': d, 'axis': ax, 'main': st(em, vm, a), 'changeOff': st(eo, vo, a), 'changeWritten': st(ec, vc, a), 'changeFitted': st(eo, vf, a)})
    def acceptance(col):
        return ([c for c in cells if inb(c['main'][0]) and not inb(c[col][0])], [c for c in cells if c['main'][0] > BAND[1] and c[col][0] > c['main'][0] + 1e-9])
    L = lambda m: abs(math.log(max(m, 1e-9) / HALF_NORMAL_MEDIAN))
    for col, label in (('changeOff', 'the change, factor off'), ('changeWritten', f'the change as flown (writes {FB})'), ('changeFitted', 'the change with the fitted factors')):
        ob, nw = acceptance(col)
        print(f"== {label}: main's in-band cells taken out {len(ob)}; too-narrow cells made narrower {len(nw)}")
        for c in ob: print(f"   OUT OF BAND {c['name']} d{c['day']} {c['axis']}: main {c['main'][0]:.3f} -> {c[col][0]:.3f}")
        for c in nw: print(f"   NARROWER {c['name']} d{c['day']} {c['axis']}: main {c['main'][0]:.3f} -> {c[col][0]:.3f}")
    print('== every judged cell, worse first as flown (median |z| / within 1 sigma % / within 3 sigma %): main | change factor off | change as flown | change with the fitted factors')
    f = lambda s: f'{s[0]:.3f} / {100 * s[1]:.0f} / {100 * s[2]:.1f}'
    for c in sorted(cells, key=lambda c: -(L(c['changeWritten'][0]) - L(c['main'][0]))):
        print(f"   {c['name']} ({c['windows']}) d{c['day']} {c['axis']}: {f(c['main'])} | {f(c['changeOff'])} | {f(c['changeWritten'])} | {f(c['changeFitted'])}")
    json.dump({'main': MAIN, 'change': CHG, 'changeWrites': FB, 'fitted': fac, 'rOnly': R_ONLY, 'splitRule': RULE, 'band': list(BAND), 'counts': COUNTS,
               'nonpositiveVariances': {'main': nonpositive(M.values(), out), 'change': nonpositive(C.values(), out)}, 'cells': cells},
              open(os.path.join(out, f'compare-{MAIN}-{CHG}.json'), 'w'), indent=1)

def terms():
    out, sha = sys.argv[2:4]
    tag, term, axis = caps_tag(), arg('--term'), arg('--axis')
    A = 'RTN'.index(axis)
    R = [r for r in load(out, 'covterms', sha, tag).values() if r.get('terms', {}).get(term)]
    print('windows with the term', len(R), {g: sum(1 for r in R if r['group'] == g) for g in REGIMES}, 'pcf', sorted({r['pcf'] for r in R}))
    def arr(Rs, days):
        e, v, u, fl = [], [], [], []
        for r in Rs:
            for i, s in enumerate(r['epochsS']):
                d = math.ceil(s / 86400)
                if d not in days or d not in days_of(r['group'], out): continue
                e.append(r['e'][i]); v.append([max(x, 1e-14) for x in r['v'][i]]); u.append([max(x, 0.0) for x in r['terms'][term][i]]); fl.append(max(r['sizes'][FL[A]], 0.0))
        return np.array(e).reshape(-1, 3), np.array(v).reshape(-1, 3), np.array(u).reshape(-1, 3), np.array(fl)
    C = [r for r in R if r['cutoff'] < CH[r['group']]]
    e, v, u, fl = arr(C, (1, 2, 3, 5, 7))
    need(len(e), 'choice window samples with the term')
    grid = np.exp(np.arange(-4.0, 2.5001, 0.005))
    vals = [float(np.sum(np.log(np.maximum(v[:, A] + (k * k - 1) * u[:, A], 1e-14)) + e[:, A] ** 2 / np.maximum(v[:, A] + (k * k - 1) * u[:, A], 1e-14))) for k in grid]
    k = float(grid[int(np.argmin(vals))])
    print(f'k on {term} (sigma), maximum likelihood on {len(C)} choice windows, axis {axis}, days 1, 2, 3, 5, 7: {k:.3f}')
    cells, other = [], 0.0
    for g in REGIMES:
        Jg = [r for r in R if r['group'] == g and r['cutoff'] >= CH[g]]
        if not Jg: continue
        for d in days_of(g, out):
            e, v, u, fl = arr(Jg, (d,))
            if not len(e): continue
            v2 = np.maximum(v + (k * k - 1) * u, 1e-14)
            for a in range(3):
                if a != A: other = max(other, abs(zstats(e[:, a], v2[:, a])[0] - zstats(e[:, a], v[:, a])[0]))
            cells.append({'row': g, 'name': NAME[g], 'windows': len(Jg), 'day': d, 'before': zstats(e[:, A], v[:, A]), 'after': zstats(e[:, A], v2[:, A]),
                          'floorShare': float(np.median(fl / v[:, A])), 'termShare': float(np.median(u[:, A] / v[:, A]))})
    L = lambda m: abs(math.log(max(m, 1e-9) / HALF_NORMAL_MEDIAN))
    print(f"judged cells {len(cells)}: in band {sum(inb(c['before'][0]) for c in cells)} -> {sum(inb(c['after'][0]) for c in cells)}; too narrow {sum(c['before'][0] > BAND[1] for c in cells)} -> {sum(c['after'][0] > BAND[1] for c in cells)}; too wide {sum(c['before'][0] < BAND[0] for c in cells)} -> {sum(c['after'][0] < BAND[0] for c in cells)}")
    print(f'largest change of a judged cell median |z| on the other axes: {other:.2e}')
    f = lambda s: f'{s[0]:.3f} / {100 * s[1]:.0f} / {100 * s[2]:.1f}'
    for c in sorted(cells, key=lambda c: -(L(c['after'][0]) - L(c['before'][0]))):
        print(f"  {c['name']} ({c['windows']}) d{c['day']} {axis}: {f(c['before'])} -> {f(c['after'])}   floor share {100 * c['floorShare']:.0f} %, {term} share {100 * c['termShare']:.0f} %{'  TOO NARROW' if c['after'][0] > BAND[1] else ''}")
    res = {'build': sha, 'caps': arg('--caps'), 'term': term, 'axis': axis, 'k': k, 'grid': 'exp(-4 to 2.5 by 0.005) on the sigma', 'days': [1, 2, 3, 5, 7],
           'cells': cells, 'maxOtherAxesChange': other, 'splitRule': {'file': 'size-split-rule.json', 'sha256': RULE}, 'band': list(BAND),
           'counts': COUNTS[f'covterms-{sha}{tag}'], 'withoutTerm': COUNTS[f'covterms-{sha}{tag}']['rows'] - len(R), 'nonpositiveVariances': nonpositive(R, out)}
    json.dump(res, open(os.path.join(out, f'terms-{sha}{tag}-{term}-{axis}.json'), 'w'), indent=1)
    # --to <dir> [--label L]: the rows a test re-weights, by the public-data rule: {id, regime, set, arcH, cp, samples: [[s, eR, eI, eC,
    # vR, vI, vC, uR, uI, uC], ...]} (u: the term's variance per axis, km^2; v as flown), and the judged cells beside them
    to = arg('--to')
    if to:
        outside_repo(to, '--to')
        win = []
        for r in R:
            days = days_of(r['group'], out)
            smp = [[s] + [float(x) for x in r['e'][i]] + [float(x) for x in r['v'][i]] + [float(x) for x in r['terms'][term][i]] for i, s in enumerate(r['epochsS']) if math.ceil(s / 86400) in days]
            win.append({'regime': r['group'], 'set': 'choice' if r['cutoff'] < CH[r['group']] else 'judged', 'arcH': r['arcH'], 'cp': r['sizes'], 'samples': smp})
        win.sort(key=lambda w: (w['regime'], w['set'], w['arcH'], w['cp']['FLOOR_UU_KM2'], json.dumps(w['cp'], sort_keys=True), json.dumps(w['samples'])))
        os.makedirs(to, exist_ok=True)
        label = arg('--label')
        rf = os.path.join(to, f'rows-{label + "-" if label else ""}{term}-terms.jsonl')
        with open(rf, 'w') as fh:
            for i, w in enumerate(win): fh.write(json.dumps({'id': i, **w}) + '\n')
        res['rows'] = {'file': os.path.basename(rf), 'sha256': sha256(rf), 'windows': len(win), 'choice': sum(w['set'] == 'choice' for w in win), 'judged': sum(w['set'] == 'judged' for w in win)}
        res['build'] = json.load(open(os.path.join(out, 'builds', sha, 'build.json')))
        jf = os.path.join(to, f'judged-{label + "-" if label else ""}{term}.json')
        json.dump(res, open(jf, 'w'), indent=1)
        print('rows', rf, res['rows']); print('judged', jf, sha256(jf))

if __name__ == '__main__':
    {'fixture': fixture, 'compare': compare, 'terms': terms}[sys.argv[1]]()
