#!/usr/bin/env python3
"""Independent verifier & clean aggregate exporter for the 6-regime held-out confirmation of sdn-ap 0.7.3 & gp-error-model 0.19.1."""
import gzip
import hashlib
import json
import math
from pathlib import Path

import numpy as np

OAE = Path(__file__).resolve().parents[2]
CONF_DIR = OAE / 'runs/ca-rollup-073/confirmation-073'
REG_PATH = CONF_DIR / 'REGISTRATION.json'
ROWS_PATH = CONF_DIR / 'conf_rows.jsonl.gz'
DENSE_PATH = CONF_DIR / 'conf_dense60s.json'
GP_PATH = CONF_DIR / 'conf_gp_sgp4.json'
SUMMARY_PATH = CONF_DIR / 'SUMMARY.json'
OUT_SITE_JSON = OAE / 'results/ca-rollup-073/confirmation-0.7.3.json'

CHI2_3_95 = 7.814727903251179
CHI2_3_3SIG = 14.156403
CHI2_6_95 = 12.591587243743977
CHI2_6_3SIG = 20.062


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def chi2_3_cdf(x: float) -> float:
    if x <= 0.0:
        return 0.0
    s = math.sqrt(0.5 * x)
    return math.erf(s) - math.sqrt(2.0 * x / math.pi) * math.exp(-0.5 * x)


def cvm_and_ks_chi2_3(d2_vals: np.ndarray):
    n = len(d2_vals)
    if n == 0:
        return float('nan'), float('nan')
    u = np.sort(np.array([chi2_3_cdf(float(x)) for x in d2_vals], dtype=float))
    i = np.arange(1, n + 1, dtype=float)
    t_cvm = float(1.0 / (12.0 * n) + np.sum((u - (2.0 * i - 1.0) / (2.0 * n)) ** 2))
    ks = float(np.max(np.maximum(np.abs(i / n - u), np.abs((i - 1.0) / n - u))))
    return t_cvm, ks


def lower21_to_6x6(lt):
    M = np.zeros((6, 6), dtype=float)
    q = 0
    for r in range(6):
        for c in range(r + 1):
            M[r, c] = M[c, r] = lt[q]
            q += 1
    return M


def score_samples(samples):
    if not samples:
        return None
    e_pos = np.array([s['e6'][:3] for s in samples], dtype=float) * 1000.0
    err3 = np.linalg.norm(e_pos, axis=1)
    d2_3 = np.array([s['d2_3'] for s in samples], dtype=float)
    d2_6 = np.array([s['d2_6'] for s in samples], dtype=float)
    z_abs = np.array([s['z_abs'] for s in samples], dtype=float)
    pd_ok = np.array([s['pd'] for s in samples], dtype=bool)
    d3v = d2_3[np.isfinite(d2_3)]
    d6v = d2_6[np.isfinite(d2_6)]
    cvm, ks = cvm_and_ks_chi2_3(d3v)
    return {
        'nSats': len({s['norad'] for s in samples}),
        'nWindows': len({(s['norad'], s['startUtc'], s['arcH']) for s in samples}),
        'nSamples': len(samples),
        'pdRate': round(float(np.mean(pd_ok)), 6),
        'medErrM': round(float(np.median(err3)), 3),
        'p95ErrM': round(float(np.percentile(err3, 95)), 3),
        'maxErrM': round(float(np.max(err3)), 3),
        'biasRtnM': [round(float(x), 3) for x in np.mean(e_pos, axis=0)],
        'rmsRtnM': [round(float(x), 3) for x in np.sqrt(np.mean(e_pos ** 2, axis=0))],
        'meanD2Over3': round(float(np.mean(d3v) / 3.0), 4) if len(d3v) else None,
        'medD2Over3': round(float(np.median(d3v) / 3.0), 4) if len(d3v) else None,
        'cov95': round(float(np.mean(d3v <= CHI2_3_95)), 4) if len(d3v) else None,
        'f3': round(float(np.mean(d3v <= CHI2_3_3SIG)), 4) if len(d3v) else None,
        'maxD2': round(float(np.max(d3v)), 2) if len(d3v) else None,
        'cvmStat': round(cvm, 4),
        'ksMaxGap': round(ks, 4),
        'medAbsZRtn': [round(float(x), 4) for x in np.median(z_abs, axis=0)],
        'meanD6Over6': round(float(np.mean(d6v) / 6.0), 4) if len(d6v) else None,
        'cov95_6d': round(float(np.mean(d6v <= CHI2_6_95)), 4) if len(d6v) else None,
        'f3_6d': round(float(np.mean(d6v <= CHI2_6_3SIG)), 4) if len(d6v) else None,
    }


def pick_site(o):
    return {
        'nSats': o['nSats'],
        'nWindows': o['nWindows'],
        'nSamples': o['nSamples'],
        'pdRate': o['pdRate'],
        'medErrM': o['medErrM'],
        'p95ErrM': o['p95ErrM'],
        'meanD2Over3': o['meanD2Over3'],
        'cov95': o['cov95'],
        'f3': o['f3'],
        'meanD6Over6': o['meanD6Over6'],
        'cov95_6d': o['cov95_6d'],
        'f3_6d': o['f3_6d'],
    }


def main():
    reg = json.loads(REG_PATH.read_text())
    rows = []
    with gzip.open(ROWS_PATH, 'rt', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    dense = json.loads(DENSE_PATH.read_text())
    gp = json.loads(GP_PATH.read_text())

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

    regimes = ['leo_under_600', 'leo_600_750', 'spheres_750_2000', 'medium_2000_15000', 'gnss_meo', 'geostationary']
    by_regime = {}
    for reg_name in regimes:
        sub = [s for s in all_samples if s['regime'] == reg_name]
        if not sub:
            continue
        by_arc = {}
        for arc_h in sorted({s['arcH'] for s in sub}):
            asub = [s for s in sub if s['arcH'] == arc_h]
            pooled_24_72 = [s for s in asub if 24 <= s['h'] <= 72]
            by_lead = {str(h): score_samples([s for s in asub if s['h'] == h]) for h in sorted({s['h'] for s in asub})}
            by_split = {sp: score_samples([s for s in asub if s['split'] == sp and 24 <= s['h'] <= 72]) for sp in sorted({s['split'] for s in asub})}
            by_arc[f'{arc_h}h'] = {
                'pooled_24_72h': score_samples(pooled_24_72),
                'bySplit_24_72h': by_split,
                'byLead': by_lead,
            }
        by_regime[reg_name] = by_arc

    # Burn & truth-fault screening (exact read-only rule from #1100 confirmation)
    burn_screened = {}
    win_flags = {}
    for r in rows:
        key = (r['regime'], r['norad'], r['startUtc'], r['arcH'])
        errs = [(ld['h'], math.hypot(*ld['e6'][:3]) * 1000.0, ld['e6'][1] * 1000.0, math.hypot(*ld['e6'][3:])) for ld in r['leads']]
        max_pos = max((e[1] for e in errs if 24 <= e[0] <= 72), default=0.0)
        max_dv = max((e[3] for e in errs if 24 <= e[0] <= 72), default=0.0)
        flag = None
        if r['regime'] == 'leo_under_600' and max_pos > 50000.0:
            flag = f'maneuver({max_pos:.0f}m)'
        elif r['regime'] == 'leo_600_750':
            by_h = {e[0]: e[2] for e in errs}
            step_jump = False
            hs = sorted(by_h)
            for a, b in zip(hs, hs[1:]):
                if b - a <= 12 and abs(by_h[b] - by_h[a]) > 150.0:
                    step_jump = True
            if max_pos > 5000.0 or step_jump:
                flag = f'sentinel1-burn({max_pos:.0f}m)'
        elif r['regime'] == 'medium_2000_15000' and (max_pos > 500.0 or max_dv > 0.05):
            flag = f'ilrs-truth-fault(dr={max_pos:.0f}m,dv={max_dv:.3f}km/s)'
        elif r['regime'] in ('gnss_meo', 'geostationary', 'spheres_750_2000') and max_pos > 500.0:
            flag = f'maneuver({max_pos:.0f}m)'
        win_flags[key] = flag

    for reg_name in regimes:
        sub = [s for s in all_samples if s['regime'] == reg_name]
        if not sub:
            continue
        burn_screened[reg_name] = {}
        for arc_h in sorted({s['arcH'] for s in sub}):
            asub = [s for s in sub if s['arcH'] == arc_h and 24 <= s['h'] <= 72]
            clean = [s for s in asub if win_flags.get((s['regime'], s['norad'], s['startUtc'], s['arcH'])) is None]
            flagged_wins = sorted({(s['norad'], s['name'], s['startUtc'][:10], win_flags[(s['regime'], s['norad'], s['startUtc'], s['arcH'])])
                                   for s in asub if win_flags.get((s['regime'], s['norad'], s['startUtc'], s['arcH'])) is not None})
            burn_screened[reg_name][f'{arc_h}h'] = {
                'totalWindows': len({(s['norad'], s['startUtc']) for s in asub}),
                'flaggedWindowsCount': len(flagged_wins),
                'clean_24_72h': score_samples(clean),
            }

    # LEO weather stratification (leo_under_600, 24h..72h leads)
    leo_sub = [s for s in all_samples if s['regime'] == 'leo_under_600' and 24 <= s['h'] <= 72]
    leo_wx = {}
    for label, fn in [('quiet_Ap<15', lambda s: s['apMean3d'] < 15), ('moderate_Ap_15_30', lambda s: 15 <= s['apMean3d'] < 30), ('storm_Ap>=30', lambda s: s['apMean3d'] >= 30)]:
        grp = [s for s in leo_sub if fn(s)]
        sc = score_samples(grp)
        if sc:
            sc['medSigIM'] = round(float(np.median([s['sigIM'] for s in grp])), 2)
        leo_wx[label] = sc

    dense_smooth = sum(1 for w in dense['windows'] if not w.get('error') and w.get('nonFinite') == 0 and w.get('nonPd') == 0 and w.get('parityDiff') == 0 and w.get('monotonicSecular'))
    unseen_gnss = len({r['norad'] for r in rows if r['regime'] == 'gnss_meo' and r['split'] == 'unseen_sat'})
    unseen_geo = len({r['norad'] for r in rows if r['regime'] == 'geostationary' and r['split'] == 'unseen_sat'})

    summary = {
        'verifiedAtUtc': reg['registeredAtUtc'],
        'registrationSha256': sha256_file(REG_PATH),
        'rowsSha256': sha256_file(ROWS_PATH),
        'denseSha256': sha256_file(DENSE_PATH),
        'gpSha256': sha256_file(GP_PATH),
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
        'byRegime': by_regime,
        'byRegimeBurnAndFaultScreened': burn_screened,
        'leoWeatherStratified_24_72h': leo_wx,
        'dense60sAudit': dense['windows'],
        'gpErrorModelConfirmation': {k: v for k, v in gp.items() if k != 'rows'},
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2) + '\n')

    # Clean aggregate-only site JSON (zero satellite-with-date pairs, zero private paths)
    storm = leo_wx.get('storm_Ap>=30')
    quiet = leo_wx.get('quiet_Ap<15')
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
            'leo_under_600': {
                'spanHours': 24,
                'totalForecasts': burn_screened['leo_under_600']['24h']['totalWindows'],
                'excludedForecasts': burn_screened['leo_under_600']['24h']['flaggedWindowsCount'],
                'screened': pick_site(burn_screened['leo_under_600']['24h']['clean_24_72h']),
                'raw': pick_site(by_regime['leo_under_600']['24h']['pooled_24_72h']),
            },
            'leo_600_750': {
                'spanHours': 24,
                'totalForecasts': burn_screened['leo_600_750']['24h']['totalWindows'],
                'excludedForecasts': burn_screened['leo_600_750']['24h']['flaggedWindowsCount'],
                'screened': pick_site(burn_screened['leo_600_750']['24h']['clean_24_72h']),
                'raw': pick_site(by_regime['leo_600_750']['24h']['pooled_24_72h']),
            },
            'spheres_750_2000': {
                'spanHours': 24,
                'totalForecasts': by_regime['spheres_750_2000']['24h']['pooled_24_72h']['nWindows'],
                'excludedForecasts': burn_screened['spheres_750_2000']['24h']['flaggedWindowsCount'],
                'screened': pick_site(burn_screened['spheres_750_2000']['24h']['clean_24_72h']),
                'raw': pick_site(by_regime['spheres_750_2000']['24h']['pooled_24_72h']),
            },
            'medium_2000_15000': {
                'spanHours': 24,
                'totalForecasts': burn_screened['medium_2000_15000']['24h']['totalWindows'],
                'excludedForecasts': burn_screened['medium_2000_15000']['24h']['flaggedWindowsCount'],
                'screened': pick_site(burn_screened['medium_2000_15000']['24h']['clean_24_72h']),
                'raw': pick_site(by_regime['medium_2000_15000']['24h']['pooled_24_72h']),
            },
            'gnss_meo_72h': {
                'spanHours': 72,
                'independentSats': unseen_gnss,
                'totalForecasts': burn_screened['gnss_meo']['72h']['totalWindows'],
                'excludedForecasts': burn_screened['gnss_meo']['72h']['flaggedWindowsCount'],
                'screened': pick_site(burn_screened['gnss_meo']['72h']['clean_24_72h']),
                'raw': pick_site(by_regime['gnss_meo']['72h']['pooled_24_72h']),
            },
            'gnss_meo_24h': {
                'spanHours': 24,
                'independentSats': unseen_gnss,
                'totalForecasts': burn_screened['gnss_meo']['24h']['totalWindows'],
                'excludedForecasts': burn_screened['gnss_meo']['24h']['flaggedWindowsCount'],
                'screened': pick_site(burn_screened['gnss_meo']['24h']['clean_24_72h']),
                'raw': pick_site(by_regime['gnss_meo']['24h']['pooled_24_72h']),
            },
            'geostationary_24h': {
                'spanHours': 24,
                'independentSats': unseen_geo,
                'totalForecasts': burn_screened['geostationary']['24h']['totalWindows'],
                'excludedForecasts': burn_screened['geostationary']['24h']['flaggedWindowsCount'],
                'screened': pick_site(burn_screened['geostationary']['24h']['clean_24_72h']),
                'raw': pick_site(by_regime['geostationary']['24h']['pooled_24_72h']),
                'byLead': {
                    '24': pick_site(by_regime['geostationary']['24h']['byLead']['24']),
                    '48': pick_site(by_regime['geostationary']['24h']['byLead']['48']),
                    '72': pick_site(by_regime['geostationary']['24h']['byLead']['72']),
                },
            },
            'geostationary_72h': {
                'spanHours': 72,
                'independentSats': unseen_geo,
                'totalForecasts': burn_screened['geostationary']['72h']['totalWindows'],
                'excludedForecasts': burn_screened['geostationary']['72h']['flaggedWindowsCount'],
                'screened': pick_site(burn_screened['geostationary']['72h']['clean_24_72h']),
                'raw': pick_site(by_regime['geostationary']['72h']['pooled_24_72h']),
            },
        },
        'leoWeather': {
            'stormAp30': {'nSamples': storm['nSamples'], 'medErrM': storm['medErrM'], 'cov95': storm['cov95'], 'f3': storm['f3'], 'meanD2Over3': storm['meanD2Over3']} if storm else None,
            'quietAp15': {'nSamples': quiet['nSamples'], 'medErrM': quiet['medErrM'], 'cov95': quiet['cov95'], 'f3': quiet['f3'], 'meanD2Over3': quiet['meanD2Over3']} if quiet else None,
        },
    }
    OUT_SITE_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_SITE_JSON.write_text(json.dumps(site_doc, indent=2) + '\n')

    print(f"=== HELD-OUT CONFIRMATION (sdn-ap {reg['versions']['sdnAp']} / gp-error-model {reg['versions']['gpErrorModel']}) ===")
    print(f"Totals: windows={summary['totals']['windows']} samples={summary['totals']['samples']} sats={summary['totals']['distinctSats']} unseen={summary['totals']['unseenSats']} 6D_PD={summary['totals']['pdRate6d']} dense={dense_smooth}/{len(dense['windows'])}")
    for rn in regimes:
        for arc, blk in burn_screened.get(rn, {}).items():
            c = blk['clean_24_72h']
            if c:
                print(f"  {rn:20s} {arc:4s} clean={blk['totalWindows']-blk['flaggedWindowsCount']:3d}/{blk['totalWindows']:3d} med={c['medErrM']:7.2f}m p95={c['p95ErrM']:8.2f}m d2/3={c['meanD2Over3']:.3f} cov95={c['cov95']:.4f} f3={c['f3']:.4f}")
    print(f"Wrote {SUMMARY_PATH} and {OUT_SITE_JSON} (sha256 {sha256_file(OUT_SITE_JSON)[:12]})")


if __name__ == '__main__':
    main()
