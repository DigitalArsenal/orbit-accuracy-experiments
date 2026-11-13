"""Scores the registered comparisons and prints their verdicts.

  python3 score.py [--config config.json] [--rule-table]

Reads events.json, sets_index.json and the row files of the arms from the store, takes the chosen row of every event and lead bin (chosen by lead alone,
before any arm's result is looked at), and for each registered comparison keeps the rows where both arms have a usable result (a row that fails in either
arm is left out of that comparison and counted by reason). Populations: PRIMARY (the final reference message created not more than 12 h before the final
closest approach) and SECONDARY (all events). The statistics, the verdicts and every edge rule are in this file; see PLAN.md for their wording.

  error of an arm on a row  = |arm miss - the event's final stated miss|
  H1  share of rows where the arm's error is smaller than the base's (equal errors count as not smaller), pooled over lead bins, above 50 % with the lower
      end of its 95 % interval above 50 %; the event-averaged share is printed beside it
  H2  ratio of the median error of the arm to the median error of the base below 1 with the upper end of its interval below 1 (undefined, so not held, when
      the base's median error is 0)
  H3  guard: events with a chosen row where the arm's miss is more than twice the base's and above 1 km, not more than events with such a row the other way
  intervals: 2,000 resamples of events (all rows of a drawn event kept), percentile method linear, numpy.random.default_rng(seed + a fixed integer per cell)
  verdict (PRIMARY only): INSUFFICIENT (fewer than 100 events with a scored row after the drop) overrides all; CONFIRMED (H1, H2 and the guard hold);
  REFUTED (the top of the H1 interval at or below 50 %, or the bottom of the H2 interval at or above 1, or the guard failing with an exact one-sided
  binomial test on the discordant events below 0.05); NOT CONFIRMED otherwise. --rule-table prints the development table of PLAN.md's last section.
Writes results.json and results.txt to the store.
"""
import sys, os, json, glob, math, hashlib, datetime
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[1:]


def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


CONFIG_FILE = os.path.abspath(arg('--config', os.path.join(HERE, 'config.json')))
CONFIG = json.load(open(CONFIG_FILE))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
STORE = os.path.abspath(os.environ.get('CONJ_STORE', CONFIG['store'] if os.path.isabs(CONFIG['store']) else os.path.join(REPO, CONFIG['store'])))
ST = CONFIG['statistics']
BANDS = CONFIG['bands']
LEADS = CONFIG['leadBins']
OUT = []
RESULT = {}


def say(s=''):
    print(s)
    OUT.append(s)


# ------------------------------------------------------------------ inputs
events = json.load(open(os.path.join(STORE, 'events.json')))
EV = {e['idx']: e for e in events}
sets = {}
for L in json.load(open(os.path.join(STORE, 'sets_index.json'))).values():
    for s in L:
        sets[s['gp']] = (s['n'], s['e'])
MSG = {}
for e in events:
    for m in e['msgs']:
        MSG[(e['idx'], m['id'])] = m
CONFIG_SHA = hashlib.sha256(open(CONFIG_FILE, 'rb').read()).hexdigest()
ROW_FILES = CONFIG.get('rowFiles', {'S': 'rows-sgp4*.jsonl', **{a: 'rows-%s*.jsonl' % a for a in CONFIG['arms']}})


def read_rows(arm):
    rows, headers = {}, []
    for f in sorted(glob.glob(os.path.join(STORE, ROW_FILES[arm]))):
        for line in open(f):
            if not line.strip():
                continue
            r = json.loads(line)
            if '_header' in r:
                headers.append(r['_header'])
                continue
            if r.get('kind', 'msg') != 'msg' or 'id' not in r:
                continue
            rows[(r['ev'], str(r['id']))] = r
    return rows, headers


ARMS = ['S'] + [a for a in CONFIG['arms']]
ROWS, HEADERS = {}, {}
for a in ARMS:
    ROWS[a], HEADERS[a] = read_rows(a)

say('numpy %s; generator numpy.random.default_rng; percentile method %s' % (np.__version__, ST['percentileMethod']))
say('configuration SHA-256 %s' % CONFIG_SHA)
say('module version %s, wasm SHA-256 %s' % (CONFIG['module']['version'], CONFIG['module']['wasmSha256']))
for a in ARMS:
    hs = HEADERS[a]
    ok = bool(hs) and all(h.get('moduleWasmSha256') == CONFIG['module']['wasmSha256'] for h in hs)
    say('arm %s: %d rows read; row-file headers %s' % (a, len(ROWS[a]), 'carry the registered module SHA-256' if ok else ('absent (rows made before the headers existed)' if not hs else 'DO NOT MATCH the registered module SHA-256')))
    if hs and not ok:
        RESULT.setdefault('errors', []).append('header mismatch in arm %s' % a)
for nm in ('inputs-messages.json', 'inputs-sets.json'):
    p = os.path.join(STORE, nm)
    if os.path.exists(p):
        j = json.load(open(p))
        say('input manifest %s: %d files, aggregate SHA-256 %s' % (nm, len(j['files']), j['aggregateSha256']))
for p in sorted(glob.glob(os.path.join(STORE, 'inputs-weather-*.json'))):
    j = json.load(open(p))
    say('input manifest %s: %d epoch days, aggregate SHA-256 %s, weather forecaster SHA-256 %s' % (os.path.basename(p), len(j['days']), j['aggregateSha256'], j['forecasterSha256']))
for nm in ('events-counts.json', 'sets-counts.json'):
    p = os.path.join(STORE, nm)
    if os.path.exists(p):
        for k, v in sorted(json.load(open(p))['counts'].items()):
            say('  %7d  %s' % (v, k))


# ------------------------------------------------------------------ rows
def ptype(e):
    s = tuple(sorted([(e['type1'] or '').upper(), (e['type2'] or '').upper()]))
    return {('DEBRIS', 'DEBRIS'): 'debris-debris', ('DEBRIS', 'PAYLOAD'): 'debris-payload', ('DEBRIS', 'ROCKET BODY'): 'debris-rocket body'}.get(s, 'other types')


def perigee_km(gp):
    n, ecc = sets[gp]
    a = (BANDS['mu'] / (n * 2 * math.pi / 86400.0) ** 2) ** (1 / 3)
    return a * (1 - ecc) - BANDS['earthRadiusKm']


def band(x, edges, names):
    for i, ed in enumerate(edges):
        if x < ed:
            return names[i]
    return names[len(edges)]


PERI = ['perigee <600', 'perigee 600-1000', 'perigee 1000-2000', 'perigee >2000']
AGE = ['age <1 d', 'age 1-2 d', 'age >2 d']
FMB = ['final miss <100 m', 'final miss 100-300 m', 'final miss 300-1000 m', 'final miss >1000 m']
PT = ['debris-debris', 'debris-payload', 'debris-rocket body', 'other types']


def status(arm, ev, mid):
    r = ROWS[arm].get((ev, mid))
    if r is None:
        return None, 'row absent'
    if 'noset' in r:
        return None, 'no set for an object'
    if 'nofit' in r:
        return None, 'record missing (fit refused or not run)'
    if 'error' in r:
        return None, 'flight refused'
    if 'miss' not in r:
        return None, 'no result'
    return r, None


# the chosen rows: one per event and lead bin, chosen by lead alone
PICKS = []
for e in events:
    for b in LEADS:
        mid = e['picks'].get(b['label'])
        if mid is None:
            continue
        m = MSG[(e['idx'], mid)]
        PICKS.append(dict(ev=e['idx'], bin=b['label'], id=mid, strong=e['strong'], mf=e['miss_f'], tf=e['tca_f'], c=m['c'], ptype=ptype(e)))


def build(base, arm):
    """The rows of one comparison: both arms usable; the drops counted by reason and population."""
    out, drops = [], {}
    for p in PICKS:
        ra, why_a = status(arm, p['ev'], p['id'])
        rb, why_b = status(base, p['ev'], p['id'])
        rs, why_s = status('S', p['ev'], p['id'])
        # a row without sets is counted as that, whichever arm's file lacks it; then the arms in the order of the comparison
        if why_s and why_s in ('no set for an object', 'row absent'):
            why = 'no set for an object (S row: %s)' % why_s
        else:
            why = why_a and '%s: %s' % (arm, why_a) or why_b and '%s: %s' % (base, why_b) or why_s and 'S: %s' % why_s
        if why:
            drops.setdefault((why, p['strong']), 0)
            drops[(why, p['strong'])] += 1
            continue
        age = max(p['c'] - rs['epA'], p['c'] - rs['epB']) / 86400.0
        q = dict(p)
        q.update(mA=ra['miss'], mB=rb['miss'], tA=ra['tca'], tB=rb['tca'], eA=abs(ra['miss'] - p['mf']), eB=abs(rb['miss'] - p['mf']),
                 peri=band(min(perigee_km(rs['gpA']), perigee_km(rs['gpB'])), BANDS['perigeeKm'], PERI), age=band(age, BANDS['setAgeDays'], AGE),
                 fmb=band(p['mf'], BANDS['finalMissMeters'], FMB), flagsA=ra, flagsB=rb)
        out.append(q)
    return out, drops


def pcts(a):
    return [float(np.percentile(a, q, method=ST['percentileMethod'])) for q in (50, 68, 90, 95)]


def stat3(eA, eB, mA, mB, evs_idx=None):
    """share, ratio of median errors, H3 counts, over the arrays (indices already applied)."""
    share = float(np.mean(eA < eB))
    mb = float(np.median(eB))
    ratio = float(np.median(eA) / mb) if mb > 0 else float('nan')
    return share, ratio


def cell_seed(ci, pi, name):
    return ST['seed'] + 1000 * ci + 100 * pi + CELLS.index(name)


CELLS = ['pooled'] + ['lead %s' % b['label'] for b in LEADS] + PERI + AGE + PT + ['%s | %s' % (b['label'], p) for b in LEADS for p in PERI]


def binom_p(k, n):
    """exact one-sided P(X >= k) for X ~ Binomial(n, 0.5)"""
    if n == 0:
        return 1.0
    return sum(math.comb(n, i) for i in range(k, n + 1)) / 2.0 ** n


def analyze(rows, ci, pi, name, arm, base):
    """The registered figures of one cell; None under the FEW rule is handled by the caller."""
    evs = sorted({r['ev'] for r in rows})
    eA = np.array([r['eA'] for r in rows]); eB = np.array([r['eB'] for r in rows])
    mA = np.array([r['mA'] for r in rows]); mB = np.array([r['mB'] for r in rows])
    evi = {e: [] for e in evs}
    for i, r in enumerate(rows):
        evi[r['ev']].append(i)
    idxs = [np.array(evi[e]) for e in evs]
    share, ratio = stat3(eA, eB, mA, mB)
    evshare = float(np.mean([np.mean(eA[ix] < eB[ix]) for ix in idxs]))
    rng = np.random.default_rng(cell_seed(ci, pi, name))
    sh, ra = [], []
    for _ in range(ST['resamples']):
        ix = np.concatenate([idxs[k] for k in rng.integers(0, len(evs), size=len(evs))])
        sh.append(float(np.mean(eA[ix] < eB[ix])))
        mbm = float(np.median(eB[ix]))
        ra.append(float(np.median(eA[ix]) / mbm) if mbm > 0 else float('nan'))
    lo_s, hi_s = [float(x) for x in np.percentile(sh, [2.5, 97.5], method=ST['percentileMethod'])]
    ra = np.array(ra)
    lo_r, hi_r = [float(x) for x in np.nanpercentile(ra, [2.5, 97.5], method=ST['percentileMethod'])] if np.isfinite(ra).any() else (float('nan'), float('nan'))
    wa = {rows[i]['ev'] for i in range(len(rows)) if mA[i] > ST['worseFactor'] * mB[i] and mA[i] > ST['worseMissMeters']}
    wb = {rows[i]['ev'] for i in range(len(rows)) if mB[i] > ST['worseFactor'] * mA[i] and mB[i] > ST['worseMissMeters']}
    nA, nB = len(wa), len(wb)
    p = binom_p(nA, nA + nB) if nA > nB else 1.0
    h1 = share > 0.5 and lo_s > 0.5
    h2 = ratio == ratio and ratio < 1 and hi_r == hi_r and hi_r < 1
    guard = nA <= nB
    return dict(cell=name, events=len(evs), rows=len(rows), share=share, shareLo=lo_s, shareHi=hi_s, eventShare=evshare, ratio=ratio, ratioLo=lo_r, ratioHi=hi_r,
                medianA=float(np.median(eA)), medianB=float(np.median(eB)), worseArm=nA, worseBase=nB, guardP=p, h1=h1, h2=h2, guard=guard,
                guardFailsSignificantly=(not guard) and p < ST['guardAlpha'])


def fmt(c, arm, base):
    return '%-28s n=%-4d rows=%-5d %s closer than %s in %.1f%% [%.1f..%.1f] (event-averaged %.1f%%); median error %d vs %d m, ratio %.2f [%.2f..%.2f]; events %s worse %d, %s worse %d (guard %s, p=%.3f)' % (
        c['cell'], c['events'], c['rows'], arm, base, 100 * c['share'], 100 * c['shareLo'], 100 * c['shareHi'], 100 * c['eventShare'], c['medianA'], c['medianB'],
        c['ratio'], c['ratioLo'], c['ratioHi'], arm, c['worseArm'], base, c['worseBase'], 'holds' if c['guard'] else 'fails', c['guardP'])


def distribution(rows, key, label, fewn):
    n = len({r['ev'] for r in rows})
    if n < fewn:
        return '  %-26s FEW (%d events)' % (label, n)
    m = np.array([r[key] for r in rows])
    ek = 'eA' if key == 'mA' else 'eB'
    e = np.array([r[ek] for r in rows])
    t = np.abs(np.array([r['tA' if key == 'mA' else 'tB'] for r in rows]) - np.array([r['tf'] for r in rows]))
    sh = '/'.join('%.0f' % (100 * float(np.mean(m < x * 1000))) for x in (1, 2, 5, 10, 20, 50))
    return '  %-26s n=%-4d miss med/68/90/95 %s; error med/68/90/95 %s; dTCA med/p90 %.2f/%.2f s; miss under 1/2/5/10/20/50 km %s %%' % (
        label, n, '/'.join('%d' % x for x in pcts(m)), '/'.join('%d' % x for x in pcts(e)), float(np.median(t)), float(np.percentile(t, 90, method=ST['percentileMethod'])), sh)


def selector(rows, name):
    if name == 'pooled':
        return rows
    if name.startswith('lead '):
        return [r for r in rows if r['bin'] == name[5:]]
    if ' | ' in name:
        b, p = name.split(' | ')
        return [r for r in rows if r['bin'] == b and r['peri'] == p]
    return [r for r in rows if name in (r['peri'], r['age'], r['ptype'])]


def population_rows(rows, pop):
    return rows if pop == 'SECONDARY' else [r for r in rows if r['strong']]


# ------------------------------------------------------------------ rule table (development)
def rule_table():
    say()
    say('=== DEVELOPMENT RULE TABLE: every arm against S, on the chosen rows and on all flown message rows ===')
    say('ratio = median error of the arm over the median error of S, pooled over lead bins; closer = share of rows with a smaller error (equal is not smaller);')
    say('events (chosen rows) = events with a chosen row where the arm is worse than S by the H3 rule / the reverse; events (all flown rows) = the same on every flown non-reference message row with a lead of 0 to 3 d')
    for pop in ('SECONDARY', 'PRIMARY'):
        say('--- %s ---' % pop)
        for a in CONFIG['arms']:
            rows, drops = build('S', a)
            rows = population_rows(rows, pop)
            if not rows:
                continue
            c = analyze(rows, 0, 0, 'pooled', a, 'S')
            # all flown rows
            wa, wb, nrows = set(), set(), 0
            for (ev_, mid), rs in ROWS['S'].items():
                e = EV[ev_]
                if pop == 'PRIMARY' and not e['strong']:
                    continue
                m = MSG.get((ev_, mid))
                if m is None or mid == e['msgs'][-1]['id']:
                    continue
                lead = (e['tca_f'] - m['c']) / 86400.0
                if lead < 0 or lead >= LEADS[-1]['to']:
                    continue
                ra, why = status(a, ev_, mid)
                rb, why2 = status('S', ev_, mid)
                if why or why2:
                    continue
                nrows += 1
                if ra['miss'] > ST['worseFactor'] * rb['miss'] and ra['miss'] > ST['worseMissMeters']:
                    wa.add(ev_)
                if rb['miss'] > ST['worseFactor'] * ra['miss'] and rb['miss'] > ST['worseMissMeters']:
                    wb.add(ev_)
            say('arm %s  events %d rows %d: ratio %.2f [%.2f..%.2f]; closer %.0f%%; events (chosen rows) %d / %d; events (all %d flown rows) %d / %d' % (
                a, c['events'], c['rows'], c['ratio'], c['ratioLo'], c['ratioHi'], 100 * c['share'], c['worseArm'], c['worseBase'], nrows, len(wa), len(wb)))
            RESULT.setdefault('ruleTable', {}).setdefault(pop, {})[a] = dict(events=c['events'], rows=c['rows'], ratio=c['ratio'], closer=c['share'], chosenRowsWorse=[c['worseArm'], c['worseBase']], allFlownRows=nrows, allFlownWorse=[len(wa), len(wb)])


# ------------------------------------------------------------------ main
say()
say('=== CHOSEN ROWS ===')
for pop in ('PRIMARY', 'SECONDARY'):
    pk = population_rows(PICKS, pop)
    say('%s: %d events with a chosen row, %d chosen rows' % (pop, len({p['ev'] for p in pk}), len(pk)))
    for b in LEADS:
        say('   lead %s: %d rows' % (b['label'], sum(1 for p in pk if p['bin'] == b['label'])))
if any('setTie' in r for r in ROWS['S'].values()):
    say('chosen rows whose set choice had equal creation times (the later epoch is taken): %d' % sum(1 for p in PICKS if (ROWS['S'].get((p['ev'], p['id'])) or {}).get('setTie')))
else:
    say('chosen rows whose set choice had equal creation times: not counted in these rows (they predate the field)')
for a in ARMS:
    rs = [ROWS[a][(p['ev'], p['id'])] for p in PICKS if (p['ev'], p['id']) in ROWS[a] and 'miss' in ROWS[a][(p['ev'], p['id'])]]
    say('arm %s on chosen rows: %d usable; windows widened %d; minimum still at an edge %d; refinement not converged %d; grid points skipped (status not zero) in %d rows; closest approach outside a fitted span %d' % (
        a, len(rs), sum(1 for r in rs if r.get('wid')), sum(1 for r in rs if r.get('edge')), sum(1 for r in rs if r.get('conv') is False),
        sum(1 for r in rs if r.get('skipped')), sum(1 for r in rs if (r.get('outA') or 0) != 0 or (r.get('outB') or 0) != 0 or r.get('beyondA') or r.get('beyondB'))))

if not ARGV.count('--rule-table'):
    for ci, cmp_ in enumerate(CONFIG['comparisons']):
        arm, base = cmp_['arm'], cmp_['base']
        rows, drops = build(base, arm)
        say()
        say('############ COMPARISON %s: arm %s against %s (%s) ############' % (cmp_['id'], arm, base, 'verdict registered' if cmp_['verdict'] else 'reported, no verdict'))
        for pi, pop in enumerate(('PRIMARY', 'SECONDARY')):
            pr = population_rows(rows, pop)
            say()
            say('=== %s: %d events, %d rows after the drop ===' % (pop, len({r['ev'] for r in pr}), len(pr)))
            for (why, strong), n in sorted(drops.items()):
                if pop == 'SECONDARY' or strong:
                    say('   dropped from this comparison: %d rows, %s' % (n, why))
            res = {}
            if len({r['ev'] for r in pr}) >= 1:
                for nm in CELLS:
                    sub = selector(pr, nm)
                    nev = len({r['ev'] for r in sub})
                    if nev < ST['fewBelowEvents']:
                        say('  %-28s FEW (%d events)' % (nm, nev))
                        continue
                    c = analyze(sub, ci, pi, nm, arm, base)
                    res[nm] = c
                    say('  ' + fmt(c, arm, base))
            RESULT.setdefault(cmp_['id'], {})[pop] = dict(events=len({r['ev'] for r in pr}), rows=len(pr), cells=res)
            if pr:
                say(' distributions (pooled and by lead bin; FEW under %d events):' % ST['fewBelowEvents'])
                for nm in ['pooled'] + ['lead %s' % b['label'] for b in LEADS]:
                    sub = selector(pr, nm)
                    say(distribution(sub, 'mA', '%s %s' % (arm, nm), ST['fewBelowEvents']))
                    say(distribution(sub, 'mB', '%s %s' % (base, nm), ST['fewBelowEvents']))
                say(' report-only figures (no verdict role):')
                say('  share of rows with %s miss under %s miss: %.1f%%; median of (miss - final miss): %s %+.0f m, %s %+.0f m' % (
                    arm, base, 100 * float(np.mean([r['mA'] < r['mB'] for r in pr])), arm, float(np.median([r['mA'] - r['mf'] for r in pr])), base, float(np.median([r['mB'] - r['mf'] for r in pr]))))
                for fm in FMB:
                    sub = [r for r in pr if r['fmb'] == fm]
                    nev = len({r['ev'] for r in sub})
                    if nev < ST['fewBelowEvents']:
                        say('  %-28s FEW (%d events)' % (fm, nev))
                    else:
                        say('  %-28s n=%-4d H1 share %.1f%%' % (fm, nev, 100 * float(np.mean([r['eA'] < r['eB'] for r in sub]))))
        # verdict
        if cmp_['verdict']:
            prim = RESULT[cmp_['id']]['PRIMARY']
            c = prim['cells'].get('pooled')
            n = prim['events']
            if n < ST['minimumPrimaryEvents']:
                v = 'INSUFFICIENT'
            elif c is None:
                v = 'INSUFFICIENT'
            elif c['h1'] and c['h2'] and c['guard']:
                v = 'CONFIRMED'
            elif c['shareHi'] <= 0.5 or (c['ratioLo'] == c['ratioLo'] and c['ratioLo'] >= 1) or c['guardFailsSignificantly']:
                v = 'REFUTED'
            else:
                v = 'NOT CONFIRMED'
            note = ''
            if v == 'NOT CONFIRMED' and n < ST['plannedPrimaryEvents']:
                note = ' (under the planned size of about %d primary events; width of the H1 interval %.1f points)' % (ST['plannedPrimaryEvents'], 100 * (c['shareHi'] - c['shareLo']))
            say()
            say('VERDICT %s (PRIMARY, %d events with a scored row): %s%s' % (cmp_['id'], n, v, note))
            if c:
                say('   H1 %s, H2 %s, H3 guard %s' % ('holds' if c['h1'] else 'does not hold', 'holds' if c['h2'] else 'does not hold', 'holds' if c['guard'] else 'fails'))
            RESULT[cmp_['id']]['verdict'] = v
            RESULT[cmp_['id']]['note'] = note.strip()

    # overlap with the development events (report only)
    ov = CONFIG.get('overlap', {}).get('developmentObjectsFile')
    p = os.path.join(STORE, ov) if ov else None
    if p and os.path.exists(p):
        dev = json.load(open(p))
        objs, prs = set(dev['objects']), {tuple(x) for x in dev['pairs']}
        prim = [e for e in events if e['strong']]
        say()
        say('primary events whose pair was in a development event: %.1f%%; with either object in a development event: %.1f%%' % (
            100 * np.mean([tuple(e['pair']) in prs for e in prim]), 100 * np.mean([e['pair'][0] in objs or e['pair'][1] in objs for e in prim])))
else:
    rule_table()

json.dump(RESULT, open(os.path.join(STORE, 'results.json'), 'w'), indent=1, default=float)
open(os.path.join(STORE, 'results.txt'), 'w').write('\n'.join(OUT) + '\n')
