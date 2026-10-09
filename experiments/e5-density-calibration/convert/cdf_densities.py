#!/usr/bin/env python3
"""Reads ESA/TU Delft thermosphere density products (Swarm DNSxPOD, DNSxACC,
GRACE-FO DNS1ACC; CDF, optionally inside the daily ZIP) and writes each as
gzip JSON for the E5 steps: UTC Unix seconds, latitude, longitude (deg),
altitude (km), density (kg/m^3) and the product's validity flag (0 = valid).
Format conversion only; values are copied, never computed.

  python3 -I cdf_densities.py OUT_DIR FILE [FILE ...]

Needs cdflib (tested with 1.3.14) and numpy.
"""
import gzip, hashlib, io, json, os, sys, tempfile, zipfile
import cdflib
import numpy as np

def read_cdf(path):
    c = cdflib.CDF(path)
    attrs = c.globalattsget()
    t = cdflib.cdfepoch.unixtime(c.varget('time'))
    out = {
        'satellite': (attrs.get('SATELLITE') or [''])[0],
        'title': (attrs.get('TITLE') or [''])[0],
        'timeSystem': (attrs.get('TIME SYSTEM') or [''])[0],
        't': [round(float(x), 3) for x in np.asarray(t)],
        'lat': [round(float(x), 6) for x in c.varget('latitude')],
        'lon': [round(float(x), 6) for x in c.varget('longitude')],
        'altKm': [round(float(x) / 1000.0, 6) for x in c.varget('altitude')],
        'rho': [float('%.6e' % x) for x in c.varget('density')],
        'flag': [int(x) for x in c.varget('validity_flag')],
    }
    return out

def main():
    out_dir, files = sys.argv[1], sys.argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    for f in files:
        raw = open(f, 'rb').read()
        name = os.path.basename(f)
        target = os.path.join(out_dir, os.path.splitext(name)[0] + '.json.gz')
        if os.path.exists(target):
            continue
        with tempfile.TemporaryDirectory() as tmp:
            if name.upper().endswith('.ZIP'):
                with zipfile.ZipFile(io.BytesIO(raw)) as z:
                    member = [m for m in z.namelist() if m.lower().endswith('.cdf')][0]
                    z.extract(member, tmp)
                    cdf = os.path.join(tmp, member)
            else:
                cdf = f
            record = read_cdf(cdf)
        record['source'] = name
        record['sha256'] = hashlib.sha256(raw).hexdigest()
        with gzip.open(target + '.tmp', 'wt') as g:
            json.dump(record, g, separators=(',', ':'))
        os.replace(target + '.tmp', target)

if __name__ == '__main__':
    main()
