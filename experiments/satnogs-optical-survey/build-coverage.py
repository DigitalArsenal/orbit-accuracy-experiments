#!/usr/bin/env python3
"""Build coverage.json: SatNOGS Optical objects x nights against the archive's lawful truth.

Inputs (read only):
  --tracks   directory of per-session tracks.parquet files from the public product index
  --archive  /opt/data/sdn-archive (file names and SP3 headers only; no truth row is read)
Run with a Python that has pyarrow. Writes the JSON named by --out.
"""
import argparse, collections, datetime as dt, glob, gzip, json, os, re

HELD_GALILEO = {43567, 37847, 41862, 41174, 43055, 41175}
HELD_SWARM_GRACE = {39451, 39452, 39453, 43476, 43477}
ILRS = {'lageos1': 8820, 'lageos2': 22195, 'etalon1': 19751, 'etalon2': 20026, 'starlette': 7646,
        'stella': 22824, 'larets': 27944, 'westpac': 25398, 'lares': 38077, 'lares2': 52936, 'ajisai': 16908}
DORIS = {'cs2': 36508, 'h2c': 46469, 'h2d': 48621, 'ja3': 41240, 's3a': 41335, 's3b': 43437, 's6a': 46984,
         's6b': 66514, 'srl': 39086, 'swo': 54754}
SENTINEL1 = {'S1A': 39634, 'S1C': 62261, 'S1D': 66315}
UTC = dt.timezone.utc


def doy_date(yy, ddd):
    return dt.datetime(2000 + yy, 1, 1, tzinfo=UTC) + dt.timedelta(days=ddd - 1)


def sp3_header(path):
    with gzip.open(path, 'rt', errors='replace') as f:
        l1, l2 = f.readline(), f.readline()
        sats = []
        for line in f:
            if line.startswith('++'):
                continue
            if line.startswith('+ '):
                sats += re.findall(r'[A-Z]\d{2}', line[9:60])
            elif not line.startswith('+'):
                break
    m = re.match(r'#.[PV]\s*(\d{4})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)', l1)
    y, mo, d, h, mi, s, n = m.groups()
    start = dt.datetime(int(y), int(mo), int(d), int(h), int(mi), tzinfo=UTC)
    step = float(l2.split()[3])
    return start, start + dt.timedelta(seconds=step * (int(n) - 1)), sats


def snx_maps(path):
    ident, prn = {}, collections.defaultdict(list)
    sect = None
    for line in open(path, errors='replace'):
        if line.startswith('+SATELLITE/IDENTIFIER'): sect = 'id'; continue
        if line.startswith('+SATELLITE/PRN'): sect = 'prn'; continue
        if line.startswith('-SATELLITE'): sect = None; continue
        if line.startswith('*') or not sect: continue
        if sect == 'id':
            f = line.split()
            if len(f) >= 4 and f[2].isdigit(): ident[f[0]] = int(f[2])
        else:
            f = line.split()
            if len(f) >= 4:
                def t(x):
                    y, d, _ = x.split(':'); y = int(y)
                    return None if y == 0 else dt.datetime(y, 1, 1, tzinfo=UTC) + dt.timedelta(days=int(d) - 1)
                prn[f[3]].append((f[0], t(f[1]), t(f[2])))
    return ident, prn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tracks', required=True)
    ap.add_argument('--archive', default='/opt/data/sdn-archive')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    import pyarrow.parquet as pq
    P = os.path.join(a.archive, 'reference-states/products')

    # observed: identified tracks, per (object, session)
    nights = collections.defaultdict(list)
    sessions = set()
    for f in sorted(glob.glob(os.path.join(a.tracks, '*.parquet'))):
        for r in pq.read_table(f).to_pylist():
            sessions.add(r['session'])
            if r['object_norad_id'] and r['publishable']:
                nights[(r['object_norad_id'], r['session'])].append(
                    (r['started_utc'], r['ended_utc'], r['publishable'], r['station_id']))
    objs = sorted({k[0] for k in nights})

    # truth intervals per NORAD and class
    truth = collections.defaultdict(lambda: collections.defaultdict(list))  # norad -> class -> [(a,b,src)]
    ident, prn = snx_maps(os.path.join(P, 'igs_satellite_metadata.snx'))

    def norad_of(sv, when):
        for svn, a0, b0 in prn.get(sv, []):
            if (a0 is None or when >= a0) and (b0 is None or when < b0) and svn in ident:
                return ident[svn]
        return None

    for p in sorted(glob.glob(os.path.join(P, 'ESA0OPSFIN_*.SP3.gz'))):
        s, e, sats = sp3_header(p)
        if e < dt.datetime(2026, 8, 20, tzinfo=UTC): continue
        for sv in sats:
            n = norad_of(sv, s + dt.timedelta(hours=12))
            if n: truth[n]['gnss-sp3'].append((s, e, os.path.basename(p)))
    for p in sorted(glob.glob(os.path.join(P, '*.orb.*.sp3.gz'))):
        b = os.path.basename(p)
        m = re.match(r'(\w+)\.orb\.(\w+)\.(\d{6})', b)
        if not m or m.group(2) not in ILRS or int(m.group(3)) < 260801: continue
        s, e, _ = sp3_header(p)
        truth[ILRS[m.group(2)]]['ilrs-sp3'].append((s, e, b))
    for p in sorted(glob.glob(os.path.join(a.archive, 'hac/ids-doris/ssa/*.Z'))):
        b = os.path.basename(p)
        m = re.match(r'ssa(\w{3})\d0\.b(\d\d)(\d{3})\.e(\d\d)(\d{3})', b)
        if not m or m.group(1) not in DORIS: continue
        truth[DORIS[m.group(1)]]['doris-sp3'].append(
            (doy_date(int(m.group(2)), int(m.group(3))), doy_date(int(m.group(4)), int(m.group(5))), b))
    for p in sorted(glob.glob(os.path.join(P, 'S1?_OPER_AUX_POEORB_*.zip'))):
        b = os.path.basename(p)
        m = re.match(r'(S1\w)_.*_V(\d{8}T\d{6})_(\d{8}T\d{6})', b)
        if m and m.group(1) in SENTINEL1:
            f = lambda x: dt.datetime.strptime(x, '%Y%m%dT%H%M%S').replace(tzinfo=UTC)
            truth[SENTINEL1[m.group(1)]]['sentinel1-poeorb'].append((f(m.group(2)), f(m.group(3)), b))

    def covered(intervals, t0, t1):
        return any(a0 <= t0 and t1 <= b0 for a0, b0, _ in intervals)

    out_objs, held, no_cover = [], [], []
    classes = collections.Counter()
    for n in objs:
        if n in HELD_GALILEO or n in HELD_SWARM_GRACE:
            held.append({'norad': n, 'reason': 'held Galileo' if n in HELD_GALILEO else 'Swarm or GRACE-FO hold',
                         'nights_observed': sorted(s for (o, s) in nights if o == n)})
            continue
        if n not in truth: continue
        ses = sorted(s for (o, s) in nights if o == n)
        per = []
        for s in ses:
            trk = nights[(n, s)]
            best = None
            for cls, iv in truth[n].items():
                ok = [t for t in trk if covered(iv, t[0], t[1])]
                if ok and (best is None or len(ok) > best[1]):
                    best = (cls, len(ok), sum(t[2] for t in ok), sorted({t[3] for t in ok}))
            tw = [t for t in trk if best and covered(truth[n][best[0]], t[0], t[1])]
            per.append({'session': s, 'tracks': len(trk), 'measurements': sum(t[2] for t in trk),
                        'first_utc': min(t[0] for t in tw).isoformat() if tw else None,
                        'last_utc': max(t[1] for t in tw).isoformat() if tw else None,
                        'span_hours': round((max(t[1] for t in tw) - min(t[0] for t in tw)).total_seconds() / 3600, 3) if tw else None,
                        'truth_class': best[0] if best else None, 'tracks_with_truth': best[1] if best else 0,
                        'measurements_with_truth': best[2] if best else 0, 'stations': best[3] if best else []})
        withtruth = [x['session'] for x in per if x['truth_class']]
        if not withtruth:
            no_cover.append({'norad': n, 'classes': sorted(truth[n]), 'nights_observed': ses,
                             'truth_window': [min(i[0] for c in truth[n].values() for i in c).isoformat(),
                                              max(i[1] for c in truth[n].values() for i in c).isoformat()]})
            continue
        d = [dt.date.fromisoformat(x) for x in withtruth]
        run = best_run = 1
        for i in range(1, len(d)):
            run = run + 1 if (d[i] - d[i - 1]).days == 1 else 1
            best_run = max(best_run, run)
        arcs, cur = [], []
        for x in per:
            if not x['truth_class']:
                if cur: arcs.append(cur); cur = []
                continue
            if cur and (dt.date.fromisoformat(x['session']) - dt.date.fromisoformat(cur[-1]['session'])).days != 1:
                arcs.append(cur); cur = []
            cur.append(x)
        if cur: arcs.append(cur)
        longest_arc_hours = max((dt.datetime.fromisoformat(a[-1]['last_utc']) - dt.datetime.fromisoformat(a[0]['first_utc'])).total_seconds() / 3600 for a in arcs)
        cl = sorted({x['truth_class'] for x in per if x['truth_class']})
        for c in cl: classes[c] += 1
        out_objs.append({'norad': n, 'truth_classes': cl, 'nights_observed': len(ses), 'nights_with_truth': len(withtruth),
                         'longest_consecutive_nights_with_truth': best_run,
                         'arcs': [{'first_session': a[0]['session'], 'last_session': a[-1]['session'], 'nights': len(a),
                                   'hours': round((dt.datetime.fromisoformat(a[-1]['last_utc']) - dt.datetime.fromisoformat(a[0]['first_utc'])).total_seconds() / 3600, 1),
                                   'measurements': sum(x['measurements_with_truth'] for x in a)} for a in arcs],
                         'longest_arc_hours_over_consecutive_nights': round(longest_arc_hours, 1),
                         'nights_with_truth_ge_20_measurements': sum(1 for x in per if x['measurements_with_truth'] >= 20),
                         'measurements_with_truth': sum(x['measurements_with_truth'] for x in per),
                         'truth_window': [min(i[0] for c in truth[n].values() for i in c).isoformat(),
                                          max(i[1] for c in truth[n].values() for i in c).isoformat()],
                         'nights': per})
    out_objs.sort(key=lambda o: (-o['nights_with_truth'], o['norad']))
    res = {
        'credit': 'SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0',
        'licence': 'CC-BY-SA-4.0',
        'sessions': {'first': min(sessions), 'last': max(sessions), 'count': len(sessions)},
        'identity_basis': 'object_norad_id of tracks.parquet: assigned by the network by SGP4 correlation against Space-Track and McCants element sets (correlation_method sgp4-topocentric-v1); a label for association, never a truth',
        'night': 'a session (UTC date the night started) in which the object has at least one identified track whose first and last epoch lie inside one truth product span',
        'holds_applied': {'galileo_excluded': sorted(HELD_GALILEO), 'swarm_grace_fo_excluded_at_all_dates': sorted(HELD_SWARM_GRACE),
                          'starlink': 'every Starlink group is excluded: no Starlink product is read, and no Starlink NORAD is in any truth map above',
                          'sgp4_derivatives': 'never truth: no truth class below is an element set'},
        'truth_classes': {'gnss-sp3': 'ESA0OPSFIN final SP3, 5 min (reference-states/products), PRN to NORAD through igs_satellite_metadata.snx',
                          'ilrs-sp3': 'ILRS analysis-center SP3 for the 11 geodetic spheres',
                          'doris-sp3': 'IDS DORIS SP3 (hac/ids-doris/ssa)',
                          'sentinel1-poeorb': 'Copernicus Sentinel-1 precise orbit (POEORB)'},
        'not_present_in_this_survey': ['TESS and THEMIS nodes (HEO far from any network station; none of their NORAD ids is observed)', 'COSMIC-2 (archive holds 2025 only)'],
        'totals': {'objects_observed_identified': len(objs), 'objects_with_truth': len(out_objs),
                   'objects_with_truth_by_class': dict(classes),
                   'object_nights_with_truth': sum(o['nights_with_truth'] for o in out_objs),
                   'measurements_with_truth': sum(o['measurements_with_truth'] for o in out_objs),
                   'object_nights_with_truth_ge_20_measurements': sum(o['nights_with_truth_ge_20_measurements'] for o in out_objs),
                   'objects_with_truth_ge_20_measurements_on_a_night': sum(1 for o in out_objs if o['nights_with_truth_ge_20_measurements']),
                   'objects_with_2_or_more_consecutive_nights': sum(1 for o in out_objs if o['longest_consecutive_nights_with_truth'] >= 2),
                   'held_objects_observed_not_counted': len(held),
                   'truth_exists_no_observed_night_covered': len(no_cover)},
        'held_observed': held,
        'truth_exists_no_observed_night_covered': no_cover,
        'objects': out_objs,
    }
    json.dump(res, open(a.out, 'w'), indent=1)
    print(json.dumps(res['totals'], indent=1))


if __name__ == '__main__':
    main()
