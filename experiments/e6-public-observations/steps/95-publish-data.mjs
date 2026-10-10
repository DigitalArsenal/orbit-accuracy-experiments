// E6's inputs for checking (data/e6/), within each source's terms:
// - SatNOGS waterfall measurements (the signal's offset from the tuned
//   frequency per 5-s bin; CC BY-SA 4.0, attributed) and the observation
//   metadata, without the element-set lines SatNOGS serves (Space-Track's;
//   the range rates and $RFO records depend on them and stay local);
// - the ISS OEM capture E4 does not already publish (US Government work);
// - release assets prepared in --assets (not committed): the waterfall
//   images (CC BY-SA 4.0) and the SeeSat-L IOD lines (no license stated:
//   prepared, not published), listed in data/e6/MANIFEST.json.
//   node experiments/e6-public-observations/steps/95-publish-data.mjs --assets <dir>
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { cli, config, home, windowOf } from '../common.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { messageText, parseIod, statedSites } from '../iod.mjs';

const { values, satnogs, seesat } = cli({ assets: { type: 'string' }, tar: { type: 'boolean' } });
const out = path.join(repoRoot, 'data/e6');
fs.mkdirSync(out, { recursive: true });
const assets = values.assets && path.resolve(values.assets);
if (assets) fs.mkdirSync(assets, { recursive: true });
const manifest = { experiment: 'e6-public-observations', generated: new Date().toISOString(), files: [], releaseAssets: [] };
const write = (name, buffer, extra) => { fs.writeFileSync(path.join(out, name), buffer); manifest.files.push({ file: name, sha256: sha256(buffer), bytes: buffer.length, ...extra }); };

// SatNOGS measurements (every pass step 10 accepted, both windows).
const passDir = path.join(repoRoot, 'runs/cache/e6/passes');
const rows = [], used = new Set();
for (const f of fs.readdirSync(passDir).sort()) {
  const p = JSON.parse(fs.readFileSync(path.join(passDir, f)));
  if (!p.measurements) continue;
  used.add(p.id);
  for (const m of p.measurements) rows.push({
    observation: p.id, url: `https://network.satnogs.org/observations/${p.id}/`, station: p.station, stationName: p.stationName, latDeg: p.lat, lonDeg: p.lon, altM: p.altM,
    transmitter: p.transmitter, f0Hz: p.f0, window: windowOf(Date.parse(m.time)), time: m.time, segment: m.segment, offsetHz: m.dfHz, offsetSigmaHz: m.sigmaHz,
  });
}
const sat = config.sources.satnogs.terms;
write('satnogs-iss-waterfall-offsets.jsonl.gz', gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n')), { terms: sat, records: rows.length, note: 'one row per 5-s waterfall bin: the signal offset from the frequency the station tuned with its element set. The range rates and $RFO records also depend on that element set (Space-Track, served with each SatNOGS observation) and stay local; steps 10 rebuild them from the SatNOGS API.' });
const obsDir = path.join(satnogs, 'observations', '25544');
const meta = new Map();
for (const f of fs.readdirSync(obsDir).filter((n) => n.endsWith('.json'))) for (const o of JSON.parse(fs.readFileSync(path.join(obsDir, f)))) if (o.norad_cat_id === 25544) { const { tle0, tle1, tle2, ...rest } = o; meta.set(o.id, rest); }
write('satnogs-iss-observations.json.gz', gzipSync(Buffer.from(JSON.stringify([...meta.values()].sort((a, b) => a.id - b.id)))), { terms: `${sat}; element-set lines removed`, records: meta.size });

// ISS OEM capture not in data/e4/iss.
for (const day of fs.readdirSync(home(config.inputs.issOemArchive))) {
  const file = path.join(home(config.inputs.issOemArchive), day, 'ISS.OEM_J2K_EPH.txt');
  if (!fs.existsSync(file)) continue;
  const prov = JSON.parse(fs.readFileSync(`${file}.provenance.json`));
  const name = `iss/${prov.retrieved_utc.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}--ISS.OEM_J2K_EPH.txt.gz`;
  fs.mkdirSync(path.join(out, 'iss'), { recursive: true });
  write(name, gzipSync(fs.readFileSync(file)), { url: prov.url, captured: prov.retrieved_utc, servedSha256: prov.sha256, terms: prov.terms });
}

// ILRS inputs: listed (URL, SHA-256), not redistributed.
const ilrsRoot = home(config.inputs.ilrs);
manifest.ilrs = fs.readFileSync(path.join(ilrsRoot, 'provenance.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => /^(npt_crd_v2|pos\+eop)\//.test(r.path) && /\.(np2|snx\.gz)$/.test(r.path) && fs.existsSync(path.join(ilrsRoot, r.path)))
  .map(({ url, path: p, retrieved, sha256: h, bytes }) => ({ file: p, url, retrieved, sha256: h, bytes, terms: config.sources.ilrs.terms }));

// Release assets.
if (assets) {
  // The waterfall images E6 used: listed with their URLs and SHA-256 (from
  // the capture's provenance); the tarball is built only with --tar, since
  // it is about 1.5 GB and the lane works under a disk floor.
  const wf = path.join(satnogs, 'waterfalls', '25544');
  const list = fs.readdirSync(wf).filter((n) => used.has(Number(n.split('_')[1]))).sort();
  const prov = new Map(fs.readFileSync(path.join(satnogs, 'provenance.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.path.startsWith('waterfalls/')).map((r) => [path.basename(r.path), r]));
  const listing = list.map((n) => ({ file: n, url: prov.get(n)?.url ?? null, sha256: prov.get(n)?.sha256 ?? null, bytes: prov.get(n)?.bytes ?? null }));
  const listBody = Buffer.from(`${JSON.stringify(listing, null, 1)}\n`);
  fs.writeFileSync(path.join(assets, 'e6-satnogs-iss-waterfalls.json'), listBody);
  const entry = { asset: 'e6-satnogs-iss-waterfalls.tar', files: list.length, bytes: listing.reduce((a, x) => a + (x.bytes ?? 0), 0), list: 'e6-satnogs-iss-waterfalls.json', listSha256: sha256(listBody), terms: sat, published: false };
  if (values.tar) {
    const tar = path.join(assets, 'e6-satnogs-iss-waterfalls.tar');
    execFileSync('tar', ['-cf', tar, '-C', wf, ...list]);
    entry.sha256 = sha256(fs.readFileSync(tar));
    entry.note = 'prepared; publish as a GitHub release asset (CC BY-SA 4.0 allows it with attribution)';
  } else entry.note = 'not built (disk floor): build with --tar from the listed files; CC BY-SA 4.0 allows publishing it with attribution';
  manifest.releaseAssets.push(entry);
  const iod = new Map(), sites = new Map();
  for (const month of config.sources.seesat.months) {
    const dir = path.join(seesat, month);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => /^\d{4}\.html$/.test(n))) {
      const text = messageText(fs.readFileSync(path.join(dir, f), 'latin1'));
      for (const l of text.split('\n')) { const o = parseIod(l); if (o) iod.set(o.raw, { ...o, message: `${config.sources.seesat.base}${month}/${f}` }); }
      for (const s of statedSites(text)) sites.set(s.station, s);
    }
  }
  const body = gzipSync(Buffer.from(JSON.stringify({ lines: [...iod.values()], sites: [...sites.values()] })));
  const name = 'e6-seesat-iod-2026-06-10.json.gz';
  fs.writeFileSync(path.join(assets, name), body);
  manifest.releaseAssets.push({ asset: name, sha256: sha256(body), bytes: body.length, records: iod.size, terms: config.sources.seesat.terms, published: false, note: 'prepared, not published: the list states no license that grants redistribution' });
}
fs.writeFileSync(path.join(out, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(JSON.stringify({ files: manifest.files.map((f) => [f.file, f.bytes]), assets: manifest.releaseAssets.map((a) => [a.asset, a.bytes]) }));
