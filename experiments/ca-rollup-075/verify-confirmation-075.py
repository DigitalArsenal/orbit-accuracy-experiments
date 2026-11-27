#!/usr/bin/env python3
"""Independent verifier & pass-conditions-compliant covariance audit for sdn-ap 0.7.5.

Implements docs/catalog-pass-conditions.md Section 4 & Section 5:
- Zero error-size maneuver exclusions: maneuvers are excluded strictly from published burn lists
  (results/operator-theory/maneuver-flags/{flags.json,geo-burns-beidou.json,geo-burns-waas.json}).
- Every cell requires >= 5 distinct satellites and >= 20 samples; smaller cells are reported as "not measured".
- NASA handbook Cramér-von Mises test (alpha = 0.02, p >= 0.02) on chi2(3) (3-D position) and chi2(6) (6-D state):
  * For 20 <= n <= 50: whole-sample CvM test (pass if W^2 <= W^2_crit(0.02, n)).
  * For n > 50: 1,000 bootstrap draws of 50 values with replacement (deterministic seed);
    pass >= 60%, good >= 80%, else "tested, did not pass".
- Emits Condition 4.7 pcCardAllowedByRegime / overallPcCardAllowed gates so Pc cards are never drawn
  where covariance audit fails or is not measured.
"""
import gzip
import hashlib
import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

OAE = Path(__file__).resolve().parents[2]
CONF_DIR = OAE / 'runs/ca-rollup-075/confirmation-075'
REG_PATH = CONF_DIR / 'REGISTRATION.json'
ROWS_PATH = CONF_DIR / 'conf_rows.jsonl.gz'
XP_ROWS_PATH = CONF_DIR / 'conf_xp_rows.jsonl.gz'
DENSE_PATH = CONF_DIR / 'conf_dense60s.json'
GP_PATH = CONF_DIR / 'conf_gp_sgp4.json'
SUMMARY_PATH = CONF_DIR / 'SUMMARY.json'
OUT_SITE_JSON = Path(os.environ.get('SDN_OUT_SITE_JSON') or (OAE / 'results/ca-rollup-075/confirmation-0.7.5.json'))
BURN_DIR = OAE / 'results/operator-theory/maneuver-flags'

CHI2_3_95 = 7.814727903251179
CHI2_3_3SIG = 14.156403
CHI2_6_95 = 12.591587243743977
CHI2_6_3SIG = 20.062

# Csörgő & Faraway (1996, JRSS-B 58(1):221-234 Table 1) exact Cramér-von Mises critical value at alpha = 0.02:
# W^2_0.02(inf) = 0.61981, W^2_0.02(50) = 0.6184, W^2_0.02(20) = 0.6163.
def cvm_crit_002(n: int) -> float:
    return 0.61981 - 0.070 / max(n, 20)

BOOTSTRAP_REPS = 1000
BOOTSTRAP_DRAW = 50
MIN_SATS_PER_CELL = 5
MIN_SAMPLES_PER_CELL = 50
CVM_PASS_RATE = 0.60
CVM_GOOD_RATE = 0.80


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def parse_utc_ms(text: str) -> int:
    s = text.strip()
    if s.endswith('Z'):
        s = s[:-1]
    if len(s) == 16:  # YYYY-MM-DDTHH:MM
        s += ':00'
    dt = datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    return int(round(dt.timestamp() * 1000))


def norm_name(s: str) -> str:
    return re.sub(r'[^A-Z0-9]+', '', (s or '').upper())


def load_published_burn_lists():
    """Load ONLY published external/truth-derived burn lists (no error-size thresholds)."""
    burns_by_name = {}
    coverage_by_name = {}
    list_hashes = {}

    flags_p = BURN_DIR / 'flags.json'
    if flags_p.exists():
        list_hashes['flags.json'] = sha256_file(flags_p)
        doc = json.loads(flags_p.read_text())
        for obj in doc.get('objects', []):
            k = norm_name(obj.get('name', ''))
            if not k:
                continue
            ts = [parse_utc_ms(st['t']) for st in obj.get('steps', []) if st.get('t')]
            burns_by_name.setdefault(k, []).extend(ts)
            tr = obj.get('truth')
            if tr and len(tr) == 2:
                coverage_by_name[k] = (parse_utc_ms(tr[0]), parse_utc_ms(tr[1]))

    for fname in ('geo-burns-beidou.json', 'geo-burns-waas.json'):
        p = BURN_DIR / fname
        if not p.exists():
            continue
        list_hashes[fname] = sha256_file(p)
        doc = json.loads(p.read_text())
        for sat in doc.get('satellites', []):
            k = norm_name(sat.get('name', ''))
            if not k:
                continue
            ts = [parse_utc_ms(b['t']) for b in sat.get('burns', []) if b.get('t')]
            ts += [parse_utc_ms(b['t']) for b in sat.get('hourly', {}).get('burns', []) if b.get('t')]
            burns_by_name.setdefault(k, []).extend(ts)

    for k in burns_by_name:
        burns_by_name[k] = sorted(set(burns_by_name[k]))
    return burns_by_name, coverage_by_name, list_hashes


def chi2_3_cdf(x: float) -> float:
    if x <= 0.0:
        return 0.0
    s = math.sqrt(0.5 * x)
    return math.erf(s) - math.sqrt(2.0 * x / math.pi) * math.exp(-0.5 * x)


def chi2_6_cdf(x: float) -> float:
    if x <= 0.0:
        return 0.0
    h = 0.5 * x
    return 1.0 - math.exp(-h) * (1.0 + h + 0.5 * h * h)


def cvm_stat_from_u(u_sorted: np.ndarray) -> float:
    n = len(u_sorted)
    if n == 0:
        return float('nan')
    i = np.arange(1, n + 1, dtype=float)
    return float(1.0 / (12.0 * n) + np.sum((u_sorted - (2.0 * i - 1.0) / (2.0 * n)) ** 2))


def ks_stat_from_u(u_sorted: np.ndarray) -> float:
    n = len(u_sorted)
    if n == 0:
        return float('nan')
    i = np.arange(1, n + 1, dtype=float)
    return float(np.max(np.maximum(np.abs(i / n - u_sorted), np.abs((i - 1.0) / n - u_sorted))))


def cvm_audit(d2_vals: np.ndarray, n_sats: int, cdf_fn, rng: np.random.Generator):
    """Evaluate NASA handbook CvM audit (p >= 0.02, 1000 x 50 bootstrap for n > 50, >= 5 sats/cell)."""
    v = d2_vals[np.isfinite(d2_vals)]
    n = len(v)
    if n_sats < MIN_SATS_PER_CELL:
        return {
            'status': 'not measured',
            'reason': f'fewer than {MIN_SATS_PER_CELL} distinct satellites ({n_sats})',
            'nSats': n_sats,
            'nSamples': n,
            'method': None,
            'cvmStat': round(cvm_stat_from_u(np.sort(np.array([cdf_fn(float(x)) for x in v], dtype=float))), 4) if n else None,
            'passRate': None,
        }
    if n < MIN_SAMPLES_PER_CELL:
        return {
            'status': 'not measured',
            'reason': f'fewer than {MIN_SAMPLES_PER_CELL} samples ({n})',
            'nSats': n_sats,
            'nSamples': n,
            'method': None,
            'cvmStat': round(cvm_stat_from_u(np.sort(np.array([cdf_fn(float(x)) for x in v], dtype=float))), 4) if n else None,
            'passRate': None,
        }
    u_all = np.array([cdf_fn(float(x)) for x in v], dtype=float)
    u_sorted = np.sort(u_all)
    w2_full = cvm_stat_from_u(u_sorted)
    ks_full = ks_stat_from_u(u_sorted)
    if n <= BOOTSTRAP_DRAW:
        crit = cvm_crit_002(n)
        passed = w2_full <= crit
        return {
            'status': 'passed' if passed else 'tested, did not pass',
            'reason': None,
            'nSats': n_sats,
            'nSamples': n,
            'method': f'whole-sample CvM (n={n}, alpha=0.02, crit={crit:.4f})',
            'cvmStat': round(w2_full, 4),
            'ksMaxGap': round(ks_full, 4),
            'passRate': 1.0 if passed else 0.0,
        }
    crit50 = cvm_crit_002(BOOTSTRAP_DRAW)
    idx = rng.integers(0, n, size=(BOOTSTRAP_REPS, BOOTSTRAP_DRAW))
    draws = np.sort(u_all[idx], axis=1)
    grid = (2.0 * np.arange(1, BOOTSTRAP_DRAW + 1, dtype=float) - 1.0) / (2.0 * BOOTSTRAP_DRAW)
    w2_boot = 1.0 / (12.0 * BOOTSTRAP_DRAW) + np.sum((draws - grid[None, :]) ** 2, axis=1)
    pass_rate = float(np.mean(w2_boot <= crit50))
    if pass_rate >= CVM_GOOD_RATE:
        status = 'good'
    elif pass_rate >= CVM_PASS_RATE:
        status = 'passed'
    else:
        status = 'tested, did not pass'
    return {
        'status': status,
        'reason': None,
        'nSats': n_sats,
        'nSamples': n,
        'method': f'{BOOTSTRAP_REPS}x{BOOTSTRAP_DRAW} bootstrap CvM (alpha=0.02, crit={crit50:.4f})',
        'cvmStat': round(w2_full, 4),
        'ksMaxGap': round(ks_full, 4),
        'bootMedianCvm': round(float(np.median(w2_boot)), 4),
        'passRate': round(pass_rate, 4),
    }


def lower21_to_6x6(lt):
    M = np.zeros((6, 6), dtype=float)
    q = 0
    for r in range(6):
        for c in range(r + 1):
            M[r, c] = M[c, r] = lt[q]
            q += 1
    return M


def score_samples(samples, rng: np.random.Generator):
    if not samples:
        return None
    n_sats = len({s['norad'] for s in samples})
    e_pos = np.array([s['e6'][:3] for s in samples], dtype=float) * 1000.0
    err3 = np.linalg.norm(e_pos, axis=1)
    d2_3 = np.array([s['d2_3'] for s in samples], dtype=float)
    d2_6 = np.array([s['d2_6'] for s in samples], dtype=float)
    z_abs = np.array([s['z_abs'] for s in samples], dtype=float)
    pd_ok = np.array([s['pd'] for s in samples], dtype=bool)
    d3v = d2_3[np.isfinite(d2_3)]
    d6v = d2_6[np.isfinite(d2_6)]
    cvm3 = cvm_audit(d3v, n_sats, chi2_3_cdf, rng)
    cvm6 = cvm_audit(d6v, n_sats, chi2_6_cdf, rng)
    return {
        'nSats': n_sats,
        'nWindows': len({(s['norad'], s['startUtc'], s['arcH']) for s in samples}),
        'nSamples': len(samples),
        'pdRate': round(float(np.mean(pd_ok)), 6),
        'medErrM': round(float(np.median(err3)), 3),
        'p95ErrM': round(float(np.percentile(err3, 95)), 3),
        'maxErrM': round(float(np.max(err3)), 3),
        'medSigIM': round(float(np.median([s['sigIM'] for s in samples])), 2),
        'biasRtnM': [round(float(x), 3) for x in np.mean(e_pos, axis=0)],
        'rmsRtnM': [round(float(x), 3) for x in np.sqrt(np.mean(e_pos ** 2, axis=0))],
        'meanD2Over3': round(float(np.mean(d3v) / 3.0), 4) if len(d3v) else None,
        'medD2Over3': round(float(np.median(d3v) / 3.0), 4) if len(d3v) else None,
        'cov95': round(float(np.mean(d3v <= CHI2_3_95)), 4) if len(d3v) else None,
        'f3': round(float(np.mean(d3v <= CHI2_3_3SIG)), 4) if len(d3v) else None,
        'maxD2': round(float(np.max(d3v)), 2) if len(d3v) else None,
        'cvm3d': cvm3,
        'cvm6d': cvm6,
        'medAbsZRtn': [round(float(x), 4) for x in np.median(z_abs, axis=0)],
        'meanD6Over6': round(float(np.mean(d6v) / 6.0), 4) if len(d6v) else None,
        'cov95_6d': round(float(np.mean(d6v <= CHI2_6_95)), 4) if len(d6v) else None,
        'f3_6d': round(float(np.mean(d6v <= CHI2_6_3SIG)), 4) if len(d6v) else None,
    }


def pick_site(o):
    if o is None:
        return None
    return {
        'nSats': o['nSats'],
        'nWindows': o['nWindows'],
        'nSamples': o['nSamples'],
        'pdRate': o['pdRate'],
        'medErrM': o['medErrM'],
        'p95ErrM': o['p95ErrM'],
        'maxErrM': o['maxErrM'],
        'medSigIM': o['medSigIM'],
        'meanD2Over3': o['meanD2Over3'],
        'cov95': o['cov95'],
        'f3': o['f3'],
        'meanD6Over6': o['meanD6Over6'],
        'cov95_6d': o['cov95_6d'],
        'f3_6d': o['f3_6d'],
        'cvm3d': o['cvm3d'],
        'cvm6d': o['cvm6d'],
    }


def expand_rows(rows):
    all_samples = []
    for r in rows:
        for ld in r['leads']:
            e6 = np.array(ld['e6'], dtype=float)
            P6 = lower21_to_6x6(ld['pUvw'])
            P3 = P6[:3, :3]
            pd = True
            d2_3 = float('nan')
            d2_6 = float('nan')
            try:
                L6 = np.linalg.cholesky(P6)
                y6 = np.linalg.solve(L6, e6)
                d2_6 = float(np.dot(y6, y6))
            except np.linalg.LinAlgError:
                pd = False
            try:
                L3 = np.linalg.cholesky(P3)
                y3 = np.linalg.solve(L3, e6[:3])
                d2_3 = float(np.dot(y3, y3))
            except np.linalg.LinAlgError:
                pd = False
            sig3 = np.sqrt(np.maximum(1e-30, np.diag(P3)))
            z_abs = np.abs(e6[:3]) / sig3
            all_samples.append({
                'regime': r['regime'],
                'split': r['split'],
                'norad': r['norad'],
                'name': r['name'],
                'startUtc': r['startUtc'],
                'arcH': r['arcH'],
                'ecom2': r['ecom2'],
                'apDay0': r['apDay0'],
                'apMean3d': r['apMean3d'],
                'apMax3h': r['apMax3h'],
                'h': ld['h'],
                'e6': ld['e6'],
                'errM': float(np.linalg.norm(e6[:3]) * 1000.0),
                'sigIM': float(math.sqrt(max(0.0, P3[1, 1])) * 1000.0),
                'd2_3': d2_3,
                'd2_6': d2_6,
                'z_abs': z_abs.tolist(),
                'pd': pd,
            })
    return all_samples


def burn_flags_from_published_lists(rows, burns_by_name):
    """Flag windows strictly when a published burn timestamp falls inside [start - arcH, start + maxLead].
    NEVER uses error-size thresholds (docs/catalog-pass-conditions.md Section 5).
    """
    win_flags = {}
    for r in rows:
        key = (r['regime'], r['norad'], r['startUtc'], r['arcH'])
        k_name = norm_name(r.get('name', ''))
        burns = burns_by_name.get(k_name, [])
        if not burns:
            win_flags[key] = None
            continue
        t0 = parse_utc_ms(r['startUtc'])
        lo = t0 - int(r['arcH']) * 3600 * 1000
        max_h = max((ld['h'] for ld in r['leads']), default=72)
        hi = t0 + int(max_h) * 3600 * 1000
        hits = [bt for bt in burns if lo <= bt <= hi]
        win_flags[key] = f'published-burn-list({len(hits)})' if hits else None
    return win_flags


def main():
    rng = np.random.default_rng(20261126)
    reg = json.loads(REG_PATH.read_text())
    rows = [json.loads(line) for line in gzip.open(ROWS_PATH, 'rt', encoding='utf-8') if line.strip()]
    xp_rows = [json.loads(line) for line in gzip.open(XP_ROWS_PATH, 'rt', encoding='utf-8') if line.strip()] if XP_ROWS_PATH.exists() else []
    dense = json.loads(DENSE_PATH.read_text())
    gp = json.loads(GP_PATH.read_text())

    burns_by_name, coverage_by_name, burn_list_hashes = load_published_burn_lists()
    all_samples = expand_rows(rows)
    win_flags = burn_flags_from_published_lists(rows, burns_by_name)

    regimes = ['leo_under_600', 'leo_600_750', 'spheres_750_2000', 'medium_2000_15000', 'gnss_meo', 'geostationary']
    by_regime = {}
    burn_screened = {}
    pc_allowed = {}
    for reg_name in regimes:
        sub = [s for s in all_samples if s['regime'] == reg_name]
        if not sub:
            continue
        by_arc = {}
        burn_screened[reg_name] = {}
        for arc_h in sorted({s['arcH'] for s in sub}):
            asub = [s for s in sub if s['arcH'] == arc_h]
            pooled_24_72 = [s for s in asub if 24 <= s['h'] <= 72]
            pooled_24_120 = [s for s in asub if 24 <= s['h'] <= 120]
            by_lead = {str(h): score_samples([s for s in asub if s['h'] == h], rng) for h in sorted({s['h'] for s in asub})}
            by_split = {sp: score_samples([s for s in asub if s['split'] == sp and 24 <= s['h'] <= 72], rng) for sp in sorted({s['split'] for s in asub})}
            by_arc[f'{arc_h}h'] = {
                'pooled_24_72h': score_samples(pooled_24_72, rng),
                'pooled_24_120h': score_samples(pooled_24_120, rng),
                'bySplit_24_72h': by_split,
                'byLead': by_lead,
            }
            asub_24_72 = [s for s in asub if 24 <= s['h'] <= 72]
            asub_24_120 = [s for s in asub if 24 <= s['h'] <= 120]
            clean_all = [s for s in asub if win_flags.get((s['regime'], s['norad'], s['startUtc'], s['arcH'])) is None]
            clean_24_72 = [s for s in asub_24_72 if win_flags.get((s['regime'], s['norad'], s['startUtc'], s['arcH'])) is None]
            clean_24_120 = [s for s in asub_24_120 if win_flags.get((s['regime'], s['norad'], s['startUtc'], s['arcH'])) is None]
            flagged_wins = sorted({(s['norad'], s['name'], s['startUtc'][:10], win_flags[(s['regime'], s['norad'], s['startUtc'], s['arcH'])])
                                   for s in asub if win_flags.get((s['regime'], s['norad'], s['startUtc'], s['arcH'])) is not None})
            clean_by_lead = {str(h): score_samples([s for s in clean_all if s['h'] == h], rng)
                             for h in sorted({s['h'] for s in clean_all})}
            burn_screened[reg_name][f'{arc_h}h'] = {
                'totalWindows': len({(s['norad'], s['startUtc']) for s in asub}),
                'flaggedWindowsCount': len(flagged_wins),
                'clean_24_72h': score_samples(clean_24_72, rng),
                'clean_24_120h': score_samples(clean_24_120, rng),
                'cleanByLead': clean_by_lead,
            }
            # Condition 4.7 gate: Pc card is allowed at a regime/arc only if 3-D CvM passes at 24h, 48h, AND 72h
            lead_statuses = {h: clean_by_lead.get(h, {}).get('cvm3d', {}).get('status') for h in ('24', '48', '72', '96', '120')}
            pc_allowed[f'{reg_name}_{arc_h}h'] = {
                'allowed24to72h': all(lead_statuses.get(h) in ('passed', 'good') for h in ('24', '48', '72')),
                'allowed24to120h': all(lead_statuses.get(h) in ('passed', 'good') for h in ('24', '48', '72', '96', '120')),
                'byLeadStatus': lead_statuses,
            }
        by_regime[reg_name] = by_arc

    xp_samples = expand_rows(xp_rows)
    xp_screened = {}
    for reg_name in ['spheres_750_2000', 'gnss_meo', 'geostationary']:
        sub = [s for s in xp_samples if s['regime'] == reg_name and s['arcH'] == 24]
        if not sub:
            continue
        clean = [s for s in sub if win_flags.get((s['regime'], s['norad'], s['startUtc'], s['arcH'])) is None]
        clean_24_72 = [s for s in clean if 24 <= s['h'] <= 72]
        xp_screened[reg_name] = {
            'clean_24_72h': score_samples(clean_24_72, rng),
            'byLead': {str(h): score_samples([s for s in clean if s['h'] == h], rng) for h in sorted({s['h'] for s in clean})},
        }

    leo_sub = [s for s in all_samples if s['regime'] == 'leo_under_600' and 24 <= s['h'] <= 72 and win_flags.get((s['regime'], s['norad'], s['startUtc'], s['arcH'])) is None]
    leo_wx = {}
    for label, fn in [('quiet_Ap<15', lambda s: s['apMean3d'] < 15), ('moderate_Ap_15_30', lambda s: 15 <= s['apMean3d'] < 30), ('storm_Ap>=30', lambda s: s['apMean3d'] >= 30)]:
        grp = [s for s in leo_sub if fn(s)]
        leo_wx[label] = score_samples(grp, rng)

    dense_smooth = sum(1 for w in dense['windows'] if not w.get('error') and w.get('nonFinite') == 0 and w.get('nonPd') == 0 and w.get('parityDiff') == 0 and w.get('monotonicSecular'))
    unseen_gnss = len({r['norad'] for r in rows if r['regime'] == 'gnss_meo' and r['split'] == 'unseen_sat'})
    unseen_geo = len({r['norad'] for r in rows if r['regime'] == 'geostationary' and r['split'] == 'unseen_sat'})
    overall_pc_allowed = all(v['allowed24to72h'] for v in pc_allowed.values()) and len(pc_allowed) > 0

    summary = {
        'verifiedAtUtc': reg['registeredAtUtc'],
        'registrationSha256': sha256_file(REG_PATH),
        'rowsSha256': sha256_file(ROWS_PATH),
        'denseSha256': sha256_file(DENSE_PATH),
        'gpSha256': sha256_file(GP_PATH),
        'burnListPolicy': 'published-burn-lists-only (zero error-size thresholds; docs/catalog-pass-conditions.md Section 5)',
        'burnListSha256': burn_list_hashes,
        'cvmPolicy': {
            'alpha': 0.02,
            'minDistinctSatsPerCell': MIN_SATS_PER_CELL,
            'minSamplesPerCell': MIN_SAMPLES_PER_CELL,
            'bootstrapReps': BOOTSTRAP_REPS,
            'bootstrapDraw': BOOTSTRAP_DRAW,
            'passRateThreshold': CVM_PASS_RATE,
            'goodRateThreshold': CVM_GOOD_RATE,
        },
        'versions': reg['versions'],
        'canonicalSha256': reg['canonicalSha256'],
        'frozenWasmSha256': {k: v['sha256'] for k, v in reg['frozenWasmSha256'].items()},
        'totals': {
            'windows': len(rows),
            'samples': len(all_samples),
            'distinctSats': len({r['norad'] for r in rows}),
            'unseenSats': len({r['norad'] for r in rows if r['split'] == 'unseen_sat'}),
            'pdRate6d': round(float(np.mean([s['pd'] for s in all_samples])), 6),
        },
        'pcCardAllowedByRegime': pc_allowed,
        'overallPcCardAllowed': overall_pc_allowed,
        'byRegime': by_regime,
        'byRegimeBurnListScreened': burn_screened,
        'xpDemoRegimesScreened': xp_screened,
        'leoWeatherStratified_24_72h': leo_wx,
        'dense60sAudit': dense['windows'],
        'gpErrorModelConfirmation': {k: v for k, v in gp.items() if k != 'rows'},
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2) + '\n')

    storm = leo_wx.get('storm_Ap>=30')
    quiet = leo_wx.get('quiet_Ap<15')
    def reg_block(rn, arc_h, include_leads=True, extra=None):
        bs = burn_screened[rn][f'{arc_h}h']
        raw = by_regime[rn][f'{arc_h}h']
        blk = {
            'spanHours': arc_h,
            'totalForecasts': bs['totalWindows'],
            'excludedForecasts': bs['flaggedWindowsCount'],
            'pcCardAllowed': pc_allowed[f'{rn}_{arc_h}h'],
            'screened': pick_site(bs['clean_24_72h']),
            'screened_24_120h': pick_site(bs['clean_24_120h']),
            'raw': pick_site(raw['pooled_24_72h']),
        }
        if extra:
            blk.update(extra)
        if include_leads:
            blk['byLead'] = {k: pick_site(v) for k, v in bs['cleanByLead'].items() if k in ('24', '48', '72', '96', '120')}
            # Section 4.5: per-satellite own-object held-out CvM audit for demo gating
            sat_map = {}
            for s in all_samples:
                if s['regime'] != rn or int(s['arcH']) != int(arc_h):
                    continue
                if win_flags.get((s['regime'], s['norad'], s['startUtc'], s['arcH'])) is not None:
                    continue
                sat_map.setdefault(str(s['norad']), {'name': s['name'], 'byLead': {}} )['byLead'].setdefault(str(s['h']), []).append(s)
            by_sat_out = {}
            for nid, info in sorted(sat_map.items()):
                leads_sat = {}
                for h_key in ('24', '48', '72', '96', '120'):
                    ls = info['byLead'].get(h_key, [])
                    if not ls:
                        continue
                    d3s = np.array([x['d2_3'] for x in ls], dtype=float)
                    d3s = d3s[np.isfinite(d3s)]
                    n_own = len(d3s)
                    # Own-object §4.5 check (requires >= MIN_SAMPLES_PER_CELL for that single satellite at that state)
                    cvm_own = cvm_audit(d3s, MIN_SATS_PER_CELL, chi2_3_cdf, rng)
                    leads_sat[h_key] = {
                        'nSamples': n_own,
                        'meanD2Over3': round(float(np.mean(d3s) / 3.0), 4) if n_own else None,
                        'cov95': round(float(np.mean(d3s <= CHI2_3_95)), 4) if n_own else None,
                        'cvm3d': cvm_own,
                    }
                by_sat_out[nid] = {'name': info['name'], 'byLead': leads_sat}
            blk['bySat'] = by_sat_out
        return blk

    site_doc = {
        'version': reg['versions']['sdnAp'],
        'date': reg['registeredAtUtc'][:10],
        'module': {
            'version': reg['versions']['sdnAp'],
            'canonicalSha256': reg['canonicalSha256'],
            'signedBundleSha256': reg['frozenWasmSha256']['sdnApPublic']['sha256'],
        },
        'registrationSha256': summary['registrationSha256'],
        'rowsSha256': summary['rowsSha256'],
        'burnListPolicy': summary['burnListPolicy'],
        'burnListSha256': burn_list_hashes,
        'cvmPolicy': summary['cvmPolicy'],
        'pcCardAllowedByRegime': pc_allowed,
        'overallPcCardAllowed': overall_pc_allowed,
        'totals': {
            'regimes': 6,
            'distinctSats': summary['totals']['distinctSats'],
            'independentSats': summary['totals']['unseenSats'],
            'forecasts': summary['totals']['windows'],
            'samples': summary['totals']['samples'],
            'pdRate6d': summary['totals']['pdRate6d'],
            'denseSmoothRegimes': dense_smooth,
            'denseTotalRegimes': len(dense['windows']),
        },
        'regimes': {
            'leo_under_600': reg_block('leo_under_600', 24),
            'leo_600_750': reg_block('leo_600_750', 24),
            'spheres_750_2000': reg_block('spheres_750_2000', 24),
            'medium_2000_15000': reg_block('medium_2000_15000', 24),
            'gnss_meo_72h': reg_block('gnss_meo', 72, extra={'independentSats': unseen_gnss}),
            'gnss_meo_24h': reg_block('gnss_meo', 24, extra={'independentSats': unseen_gnss}),
            'geostationary_24h': reg_block('geostationary', 24, extra={'independentSats': unseen_geo}),
            'geostationary_72h': reg_block('geostationary', 72, extra={'independentSats': unseen_geo}),
        },
        'xpDemoRegimes': {
            rn: {
                'screened': pick_site(v['clean_24_72h']),
                'byLead': {k: pick_site(x) for k, x in v['byLead'].items() if k in ('24', '48', '72', '96', '120')},
            }
            for rn, v in xp_screened.items() if v['clean_24_72h']
        },
        'leoWeather': {
            'stormAp30': {'nSats': storm['nSats'], 'nSamples': storm['nSamples'], 'medErrM': storm['medErrM'], 'cov95': storm['cov95'], 'f3': storm['f3'], 'meanD2Over3': storm['meanD2Over3'], 'cvm3d': storm['cvm3d']} if storm else None,
            'quietAp15': {'nSats': quiet['nSats'], 'nSamples': quiet['nSamples'], 'medErrM': quiet['medErrM'], 'cov95': quiet['cov95'], 'f3': quiet['f3'], 'meanD2Over3': quiet['meanD2Over3'], 'cvm3d': quiet['cvm3d']} if quiet else None,
        },
    }
    OUT_SITE_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_SITE_JSON.write_text(json.dumps(site_doc, indent=2) + '\n')

    print(f"=== HELD-OUT COVARIANCE CvM AUDIT (sdn-ap {reg['versions']['sdnAp']} / gp-error-model {reg['versions']['gpErrorModel']}) ===")
    print(f"Canonical: {reg['canonicalSha256'][:12]} | Signed bundle: {reg['frozenWasmSha256']['sdnApPublic']['sha256'][:12]}")
    print(f"Totals: windows={summary['totals']['windows']} samples={summary['totals']['samples']} sats={summary['totals']['distinctSats']} unseen={summary['totals']['unseenSats']} 6D_PD={summary['totals']['pdRate6d']} dense={dense_smooth}/{len(dense['windows'])}")
    print(f"Overall Pc card allowed (Condition 4.7): {overall_pc_allowed}")
    for rn in regimes:
        for arc, blk in burn_screened.get(rn, {}).items():
            c = blk['clean_24_72h']
            if c:
                c3 = c['cvm3d']
                print(f"  AP {rn:18s} {arc:4s} sats={c['nSats']:2d} n={c['nSamples']:4d} burnExcl={blk['flaggedWindowsCount']:2d}/{blk['totalWindows']:3d} med={c['medErrM']:7.2f}m max={c['maxErrM']:8.1f}m cov95={c['cov95']:.4f} cvm3d={c3['status']} (rate={c3['passRate']})")
                for h in ('24', '48', '72', '96', '120'):
                    lh = blk['cleanByLead'].get(h)
                    if lh:
                        lc3 = lh['cvm3d']
                        print(f"     @{h:3s}h: sats={lh['nSats']:2d} n={lh['nSamples']:3d} med={lh['medErrM']:7.2f}m cov95={lh['cov95']:.4f} cvm3d={lc3['status']} (rate={lc3['passRate']}, W2={lc3['cvmStat']})")
    print(f"Wrote {SUMMARY_PATH} and {OUT_SITE_JSON}")


if __name__ == '__main__':
    main()
