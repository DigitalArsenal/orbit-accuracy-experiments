"""Builds the event table from the provider's public conjunction messages and chooses the rows.

  python3 build-events.py [--config config.json]

Reads the daily message files (archive/spacetrack/cdm_public/<year>/<day>.json.gz) named in the configuration, keeps only messages created before
the configuration's creation cutoff, de-duplicates by message identifier (the last copy read is kept), groups messages of one pair whose closest-approach
times lie within 60 s of each other (consecutive in time order) into events, takes the last message by (creation time, identifier) as the event's
reference, keeps the events whose final closest approach lies in the registered window, and chooses the rows: one message per event and lead bin, the
message whose lead is nearest the bin's middle (the first of equals), chosen by lead alone. Writes events.json and inputs-messages.json to the store
and prints every count. Nothing here depends on an arm's result.
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
os.makedirs(STORE, exist_ok=True)
UTC = datetime.timezone.utc


def ts(v):
    """UTC text to unix seconds, or None."""
    if not v:
        return None
    v = str(v).replace('Z', '').replace(' ', 'T')
    for fmt in ('%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.datetime.strptime(v, fmt).replace(tzinfo=UTC).timestamp()
        except ValueError:
            pass
    return None


def utc(v):
    return ts(v) if not isinstance(v, (int, float)) else v


MSG = CONFIG['messages']
WINDOW = CONFIG['window']
CREATED_BEFORE = utc(MSG['createdBefore'])
FINAL_FROM, FINAL_TO = utc(WINDOW['finalFrom']), utc(WINDOW['finalTo'])
EARLY = utc(MSG['earlyExclusionCreatedBefore']) if MSG.get('earlyExclusionCreatedBefore') else None
if os.path.realpath(CONFIG_FILE) == os.path.realpath(os.path.join(HERE, 'config.json')):  # the registered configuration must be the one in MANIFEST.sha256
    line = [l for l in open(os.path.join(HERE, 'MANIFEST.sha256')).read().split('\n') if l.endswith('/config.json')]
    if not line or line[0].split()[0] != hashlib.sha256(open(CONFIG_FILE, 'rb').read()).hexdigest():
        sys.exit('config.json differs from its line in MANIFEST.sha256: the registered configuration is refused')
STRONG_SECONDS = CONFIG['primaryHours'] * 3600
LEAD_BINS = CONFIG['leadBins']  # [{ "label", "from", "to", "middle" }] in days, half-open
TCA_GAP = CONFIG['eventGapSeconds']

root = os.path.join(ARCHIVE, 'spacetrack', 'cdm_public', str(MSG['year']))
files = sorted(f for f in os.listdir(root) if f.endswith('.json.gz') and f[:10] <= MSG['through'] and f[:10] >= MSG.get('from', '0000-00-00'))
counts = collections.Counter()
seen = {}
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
    for r in rows:
        counts['message records read'] += 1
        cr = ts(r.get('CREATED'))
        if cr is not None and cr >= CREATED_BEFORE:
            counts['records created at or after the creation cutoff (not used)'] += 1
            continue
        key = r.get('CDM_ID')
        if key is None:
            counts['messages without a message identifier (kept, each as its own message)'] += 1
            key = 'noid-' + hashlib.sha256(json.dumps(r, sort_keys=True).encode()).hexdigest()
        if key in seen and seen[key][1] != json.dumps(r, sort_keys=True):
            counts['identifiers seen again with different content (last copy kept)'] += 1
        seen[key] = (r, json.dumps(r, sort_keys=True))
d0 = datetime.date.fromisoformat(MSG.get('from', files[0][:10] if files else '2026-01-01'))
d1 = datetime.date.fromisoformat(MSG['through'])
present = {f[:10] for f in files}
missing = [(d0 + datetime.timedelta(days=k)).isoformat() for k in range((d1 - d0).days + 1) if (d0 + datetime.timedelta(days=k)).isoformat() not in present]
counts['day files missing in the message range'] = len(missing)
gaps = [(utc(m + 'T00:00:00Z'), utc(m + 'T00:00:00Z') + 4 * 86400) for m in missing]  # a missing day and the 3 days after it
agg = hashlib.sha256(''.join('%s %s\n' % (i['file'], i['sha256']) for i in inputs).encode()).hexdigest()
json.dump(dict(kind='messages', missingDays=missing, files=inputs, aggregateSha256=agg), open(os.path.join(STORE, 'inputs-messages.json'), 'w'), indent=1)

pairs = collections.defaultdict(list)
for key, (r, _) in seen.items():
    try:
        a, b = int(r['SAT_1_ID']), int(r['SAT_2_ID'])
        tca, cr, miss = ts(r['TCA']), ts(r['CREATED']), float(r['MIN_RNG'])
    except (KeyError, TypeError, ValueError):
        tca = cr = miss = None
    if tca is None or cr is None or miss is None:
        counts['messages dropped: unparseable closest-approach time, creation time or miss'] += 1
        continue
    try:
        pc = float(r['PC'])
    except (TypeError, ValueError):
        pc = None
    pairs[(min(a, b), max(a, b))].append(dict(id=str(key), c=cr, tca=tca, miss=miss, pc=pc, s1=a, s2=b, t1=r.get('SAT1_OBJECT_TYPE'), t2=r.get('SAT2_OBJECT_TYPE')))
counts['distinct messages kept'] = sum(len(v) for v in pairs.values())

events = []
for pair, msgs in pairs.items():
    msgs.sort(key=lambda m: m['tca'])
    groups, cur = [], [msgs[0]]
    for m in msgs[1:]:
        if m['tca'] - cur[-1]['tca'] <= TCA_GAP:
            cur.append(m)
        else:
            groups.append(cur)
            cur = [m]
    groups.append(cur)
    for g in groups:
        g.sort(key=lambda m: (m['c'], m['id']))
        ref = g[-1]
        events.append(dict(pair=list(pair), primary=ref['s1'], secondary=ref['s2'], type1=ref['t1'], type2=ref['t2'], msgs=g, tca_f=ref['tca'], miss_f=ref['miss'], c_last=ref['c']))
counts['events seen (any final closest approach)'] = len(events)
events = [e for e in events if FINAL_FROM <= e['tca_f'] < FINAL_TO]
counts['events with a final closest approach in the window'] = len(events)
if EARLY is not None:
    keep = [e for e in events if not any(m['c'] < EARLY for m in e['msgs'])]
    counts['events excluded: a message created before the early cutoff'] = len(events) - len(keep)
    events = keep
events.sort(key=lambda e: (e['tca_f'], e['pair']))
for i, e in enumerate(events):
    e['idx'] = i
    e['strong'] = (e['tca_f'] - e['c_last']) <= STRONG_SECONDS  # a reference created after the closest approach counts as within
    cands = []
    for m in e['msgs'][:-1]:
        lead = (e['tca_f'] - m['c']) / 86400.0
        if lead < 0:
            counts['messages created after the final closest approach (not scored)'] += 1
        elif lead >= LEAD_BINS[-1]['to']:
            counts['messages with a lead of 3.0001 d or more (not scored)'] += 1
        else:
            cands.append((lead, m))
    e['nMessages'] = len(e['msgs'])
    picks = {}
    for b in LEAD_BINS:
        best = None
        for lead, m in cands:
            if b['from'] <= lead < b['to'] and (best is None or abs(lead - b['middle']) < abs(best[0] - b['middle'])):
                best = (lead, m)
        if best:
            picks[b['label']] = best[1]['id']
    e['picks'] = picks
    e['afterGap'] = any(lo <= m['c'] < hi for m in e['msgs'] for lo, hi in gaps)
counts['events with a message created within 3 days after a missing day file (flagged, kept)'] = sum(1 for e in events if e['afterGap'])
counts['events with a single message (no scored row)'] = sum(1 for e in events if e['nMessages'] == 1)
counts['events with no row chosen'] = sum(1 for e in events if not e['picks'])
counts['events with a reference message created within the primary rule (primary population)'] = sum(1 for e in events if e['strong'])
counts['events with a reference message created after the final closest approach'] = sum(1 for e in events if e['c_last'] > e['tca_f'])
counts['events with two messages equal in creation time (identifier breaks the tie)'] = sum(1 for e in events if len({m['c'] for m in e['msgs']}) < len(e['msgs']))
counts['rows chosen (one per event and lead bin)'] = sum(len(e['picks']) for e in events)
json.dump(events, open(os.path.join(STORE, 'events.json'), 'w'))
print(json.dumps(dict(configSha256=hashlib.sha256(open(CONFIG_FILE, 'rb').read()).hexdigest(), inputAggregateSha256=agg, files=len(files)), indent=1))
for k in sorted(counts):
    print('%8d  %s' % (counts[k], k))
json.dump(dict(counts=counts, inputAggregateSha256=agg), open(os.path.join(STORE, 'events-counts.json'), 'w'), indent=1)
