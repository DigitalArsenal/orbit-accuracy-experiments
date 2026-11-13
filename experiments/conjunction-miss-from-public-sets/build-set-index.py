"""Builds the index of the public element sets of the event objects.

  python3 build-set-index.py [--config config.json]

Reads the provider's element-set history (archive/spacetrack/gp_history/by-creation/<year>/, one file a day of creation date; partial windows are named
<from>--<to>.json.gz) from the configuration's start day to the creation cutoff, keeps the rows of the objects of the events in the store's events.json,
de-duplicates by set identifier, keeps sets of theory SGP4 and ephemeris type 0 created before the cutoff, and writes sets_index.json (object to its sets in order
of creation time, epoch, then set identifier as text) and inputs-sets.json (per file: name, record count, SHA-256; one aggregate hash). Day files are chosen by
the range their names cover. An object with no set created after the start day has no set for any of its rows; unreadable files, days without a file, sets
of another theory or ephemeris type and sets with an unusable field are counted.
"""
import sys, os, json, gzip, hashlib, datetime, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ARGV = sys.argv[1:]


def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


CONFIG_FILE = os.path.abspath(arg('--config', os.path.join(HERE, 'config.json')))
CONFIG = json.load(open(CONFIG_FILE))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
ARCHIVE = os.environ.get('SDN_ARCHIVE_ROOT') or CONFIG['archive']['root']  # an empty value is not a root
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
START = ts(SETS['startDay'] + 'T00:00:00')
events = json.load(open(os.path.join(STORE, 'events.json')))
want = {x for e in events for x in e['pair']}
root = os.path.join(ARCHIVE, 'spacetrack', 'gp_history', 'by-creation', str(SETS['year']))
if os.path.realpath(CONFIG_FILE) == os.path.realpath(os.path.join(HERE, 'config.json')):  # the registered configuration must be the one in MANIFEST.sha256
    line = [l for l in open(os.path.join(HERE, 'MANIFEST.sha256')).read().split('\n') if l.endswith('/config.json')]
    if not line or line[0].split()[0] != hashlib.sha256(open(CONFIG_FILE, 'rb').read()).hexdigest():
        sys.exit('config.json differs from its line in MANIFEST.sha256: the registered configuration is refused')


def named_range(f):
    """the first and last day a file's name covers: <day>.json.gz or <from>--<to>.json.gz"""
    parts = f[:-len('.json.gz')].split('--')
    return parts[0][:10], parts[-1][:10]


files, skipped = [], []
for f in sorted(os.listdir(root)):
    if not f.endswith('.json.gz'):
        continue
    d0, d1 = named_range(f)
    if d0 <= SETS['createdBefore'][:10] and d1 >= SETS['startDay']:  # the named range overlaps the read range
        files.append(f)
    else:
        skipped.append(f)
counts = collections.Counter()
eph_objects = set()
counts['day files outside the read range (not read)'] = len(skipped)
covered = set()
for f in files:
    d0, d1 = named_range(f)
    a, b = datetime.date.fromisoformat(d0), datetime.date.fromisoformat(d1)
    covered.update((a + datetime.timedelta(days=k)).isoformat() for k in range((b - a).days + 1))
r0, r1 = datetime.date.fromisoformat(SETS['startDay']), datetime.date.fromisoformat(SETS['createdBefore'][:10])
counts['days in the read range with no file'] = sum(1 for k in range((r1 - r0).days + 1) if (r0 + datetime.timedelta(days=k)).isoformat() not in covered)
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
        if cr < START:
            counts['sets of event objects created before the start day (not used; a file that straddles the start day is read, its early sets are not kept)'] += 1
            continue
        if r.get('MEAN_ELEMENT_THEORY') != SETS['theory']:
            counts['sets of event objects with another mean-element theory (dropped)'] += 1
            continue
        if r.get('EPHEMERIS_TYPE') not in (None, '', '0', 0):
            counts['sets of event objects with an ephemeris type other than 0 (dropped)'] += 1
            eph_objects.add(n)
            continue
        ep = ts(r.get('EPOCH'))
        try:
            s = dict(cr=r['CREATION_DATE'], ep=r['EPOCH'], gp=r['GP_ID'], file=f,
                     n=float(r['MEAN_MOTION']), e=float(r['ECCENTRICITY']), inc=float(r['INCLINATION']),
                     raan=float(r['RA_OF_ASC_NODE']), argp=float(r['ARG_OF_PERICENTER']), ma=float(r['MEAN_ANOMALY']),
                     bstar=float(r['BSTAR'] or 0), ndot=float(r['MEAN_MOTION_DOT'] or 0), nddot=float(r['MEAN_MOTION_DDOT'] or 0))
        except (KeyError, TypeError, ValueError):
            s = None
        if s is None or ep is None:
            counts['sets of event objects with an unusable field or epoch (dropped)'] += 1
            continue
        s['crS'], s['epS'] = cr, ep
        idx[n][r['GP_ID']] = s
out = {str(n): sorted(d.values(), key=lambda s: (s['crS'], s['epS'], str(s['gp']))) for n, d in idx.items()}
for L in out.values():
    for s in L:
        del s['crS'], s['epS']
counts['event objects with a set of an ephemeris type other than 0'] = len(eph_objects)
counts['event objects'] = len(want)
counts['event objects with no set created after the start day'] = len(want) - len(out)
counts['sets kept'] = sum(len(v) for v in out.values())
agg = hashlib.sha256(''.join('%s %s\n' % (i['file'], i['sha256']) for i in inputs).encode()).hexdigest()
CONFIG_SHA = hashlib.sha256(open(CONFIG_FILE, 'rb').read()).hexdigest()
REGISTERED = os.path.realpath(CONFIG_FILE) == os.path.realpath(os.path.join(HERE, 'config.json'))
json.dump(out, open(os.path.join(STORE, 'sets_index.json'), 'w'))
sha = lambda p: hashlib.sha256(open(os.path.join(STORE, p), 'rb').read()).hexdigest()
json.dump(dict(kind='sets', configSha256=CONFIG_SHA, registered=REGISTERED, files=inputs, aggregateSha256=agg), open(os.path.join(STORE, 'inputs-sets.json'), 'w'), indent=1)
json.dump(dict(counts=counts, inputAggregateSha256=agg, configSha256=CONFIG_SHA, registered=REGISTERED, builtFromEventsSha256=sha('events.json'), setsIndexSha256=sha('sets_index.json')),
          open(os.path.join(STORE, 'sets-counts.json'), 'w'), indent=1)
print(json.dumps(dict(configSha256=hashlib.sha256(open(CONFIG_FILE, 'rb').read()).hexdigest(), inputAggregateSha256=agg, files=len(files)), indent=1))
for k in sorted(counts):
    print('%8d  %s' % (counts[k], k))
