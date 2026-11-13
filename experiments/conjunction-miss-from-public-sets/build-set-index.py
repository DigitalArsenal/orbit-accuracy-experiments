"""Builds the index of the public element sets of the event objects.

  python3 build-set-index.py [--config config.json]

Reads the provider's element-set history (archive/spacetrack/gp_history/by-creation/<year>/, one file a day of creation date; partial windows are named
<from>--<to>.json.gz) from the configuration's start day to the creation cutoff, keeps the rows of the objects of the events in the store's events.json,
de-duplicates by set identifier, keeps sets of theory SGP4 created before the cutoff, and writes sets_index.json (object to its sets in order of creation
time, then epoch) and inputs-sets.json (per file: name, record count, SHA-256; one aggregate hash). An object with no set created after the start day has no
set for any of its rows; unreadable files and sets of another theory are counted.
"""
import sys, os, json, gzip, hashlib, datetime, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[1:]


def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


CONFIG_FILE = os.path.abspath(arg('--config', os.path.join(HERE, 'config.json')))
CONFIG = json.load(open(CONFIG_FILE))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
ARCHIVE = os.environ.get('SDN_ARCHIVE_ROOT', CONFIG['archive']['root'])
STORE = os.path.abspath(os.environ.get('CONJ_STORE', CONFIG['store'] if os.path.isabs(CONFIG['store']) else os.path.join(REPO, CONFIG['store'])))
UTC = datetime.timezone.utc


def ts(v):
    v = str(v).replace('Z', '').replace(' ', 'T')
    for fmt in ('%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.datetime.strptime(v, fmt).replace(tzinfo=UTC).timestamp()
        except ValueError:
            pass
    return None


SETS = CONFIG['sets']
BEFORE = ts(SETS['createdBefore'])
events = json.load(open(os.path.join(STORE, 'events.json')))
want = {x for e in events for x in e['pair']}
root = os.path.join(ARCHIVE, 'spacetrack', 'gp_history', 'by-creation', str(SETS['year']))
files = sorted(f for f in os.listdir(root) if f.endswith('.json.gz') and SETS['startDay'] <= f[:10] <= SETS['createdBefore'][:10])
counts = collections.Counter()
idx = collections.defaultdict(dict)
inputs = []
for f in files:
    raw = open(os.path.join(root, f), 'rb').read()
    try:
        rows = json.loads(gzip.decompress(raw).decode('utf8'))
    except Exception:
        counts['unreadable day files'] += 1
        inputs.append(dict(file=f, records=None, sha256=hashlib.sha256(raw).hexdigest()))
        continue
    inputs.append(dict(file=f, records=len(rows), sha256=hashlib.sha256(raw).hexdigest()))
    counts['set records read'] += len(rows)
    for r in rows:
        try:
            n = int(r['NORAD_CAT_ID'])
        except (KeyError, TypeError, ValueError):
            continue
        if n not in want:
            continue
        cr = ts(r.get('CREATION_DATE'))
        if cr is None or cr >= BEFORE:
            counts['sets of event objects created at or after the cutoff (not used)'] += 1
            continue
        if r.get('MEAN_ELEMENT_THEORY') != SETS['theory']:
            counts['sets of event objects with another mean-element theory (dropped)'] += 1
            continue
        idx[n][r['GP_ID']] = dict(
            cr=r['CREATION_DATE'], ep=r['EPOCH'], gp=r['GP_ID'], file=f,
            n=float(r['MEAN_MOTION']), e=float(r['ECCENTRICITY']), inc=float(r['INCLINATION']),
            raan=float(r['RA_OF_ASC_NODE']), argp=float(r['ARG_OF_PERICENTER']), ma=float(r['MEAN_ANOMALY']),
            bstar=float(r['BSTAR'] or 0), ndot=float(r['MEAN_MOTION_DOT'] or 0), nddot=float(r['MEAN_MOTION_DDOT'] or 0))
out = {str(n): sorted(d.values(), key=lambda s: (s['cr'], s['ep'])) for n, d in idx.items()}
counts['event objects'] = len(want)
counts['event objects with no set created after the start day'] = len(want) - len(out)
counts['sets kept'] = sum(len(v) for v in out.values())
agg = hashlib.sha256(''.join('%s %s\n' % (i['file'], i['sha256']) for i in inputs).encode()).hexdigest()
json.dump(out, open(os.path.join(STORE, 'sets_index.json'), 'w'))
json.dump(dict(kind='sets', files=inputs, aggregateSha256=agg), open(os.path.join(STORE, 'inputs-sets.json'), 'w'), indent=1)
json.dump(dict(counts=counts, inputAggregateSha256=agg), open(os.path.join(STORE, 'sets-counts.json'), 'w'), indent=1)
print(json.dumps(dict(configSha256=hashlib.sha256(open(CONFIG_FILE, 'rb').read()).hexdigest(), inputAggregateSha256=agg, files=len(files)), indent=1))
for k in sorted(counts):
    print('%8d  %s' % (counts[k], k))
