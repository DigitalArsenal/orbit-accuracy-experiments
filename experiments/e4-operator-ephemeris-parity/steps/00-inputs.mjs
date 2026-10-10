#!/usr/bin/env node
// E4 step 00: the exact operator files the study uses (PLAN.md section 2),
// copied out of the ephemeris-provider nodes (read only) with every SHA-256
// checked against its descriptor, into runs/cache/e4-inputs/<provider>/ with
// inputs.json. With --publish, also writes the published copies: gzip files
// under data/e4/<provider>/ (redistributable, at most 1 MB compressed each),
// one .tar.gz release asset per provider for the rest (--release-dir), and
// data/e4/MANIFEST.json and data/e4/SOURCES.md.
//
//   node experiments/e4-operator-ephemeris-parity/steps/00-inputs.mjs [--provider p,q] [--publish --release-dir DIR]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { ProviderNode } from '../../../harness/provider-node.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { rng } from '../../../harness/stats.mjs';
import { DAY_MS, assertFrozen, cli, config, providers } from '../common.mjs';
import { licenseSection, mayPublish } from '../../../harness/data-licenses.mjs';
import { readCpf, readIntelsat, readMeme, readOem, readPlanetStates, readTle, unzipMembers } from '../operators.mjs';

assertFrozen();
const { values, nodes, inputs, truth } = cli({ publish: { type: 'boolean' }, 'release-dir': { type: 'string' } });
const basename = (url) => decodeURIComponent(new URL(url).pathname.split('/').pop());
const compact = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

// Which captured files a provider's comparison reads (config.providers.*.select).
function select(provider, all) {
  const p = config.providers[provider];
  const byCapture = [...all].sort((a, b) => a.captured.localeCompare(b.captured) || a.url.localeCompare(b.url));
  const distinct = (list) => { const seen = new Set(); return list.filter((d) => !seen.has(d.sha256) && seen.add(d.sha256)); };
  if (provider === 'spacex-starlink') {
    const first = new Map();
    for (const d of byCapture) {
      const norad = Number(/MEME_(\d+)_/.exec(d.url)?.[1]);
      if (norad && !first.has(norad)) first.set(norad, d);
    }
    const norads = [...first.keys()].sort((a, b) => a - b);
    const random = rng(p.select.seed);
    for (let i = norads.length - 1; i > 0; --i) { const j = Math.floor(random() * (i + 1)); [norads[i], norads[j]] = [norads[j], norads[i]]; }
    return norads.slice(0, p.select.objects).sort((a, b) => a - b).map((n) => ({ ...first.get(n), role: 'ephemeris' }));
  }
  if (provider === 'planet') {
    return distinct(byCapture).map((d) => ({ ...d, role: basename(d.url).endsWith('.states') ? 'ephemeris' : 'operator-tle' }));
  }
  if (provider === 'intelsat') {
    return distinct(byCapture).filter((d) => {
      const m = /_(\d{8})_(\d{6})\.txt$/.exec(d.url);
      if (!m) return false;
      const t = Date.parse(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4)}Z`);
      const c = Date.parse(d.captured);
      return t <= c && c - t <= p.select.days * DAY_MS;
    }).map((d) => ({ ...d, role: 'ephemeris' }));
  }
  return distinct(byCapture).map((d) => ({ ...d, role: 'ephemeris' }));
}

// Objects and span a file states, for the manifest (no computation).
function describe(provider, format, bytes) {
  const text = () => bytes.toString('latin1');
  const span = (a, b) => [a, b];
  try {
    if (format === 'meme') { const m = readMeme(text()); return { span: span(m.epochs[0], m.epochs.at(-1)), samples: m.epochs.length }; }
    if (format === 'ccsds-oem') { const o = readOem(text()); return { objects: [config.providers[provider].norad], span: span(o.epochs[0], o.epochs.at(-1)), samples: o.epochs.length }; }
    if (format === 'ccsds-oem-zip') { const o = readOem(unzipMembers(bytes)[0].bytes.toString('latin1')); return { objects: [config.providers[provider].norad], span: span(o.epochs[0], o.epochs.at(-1)), samples: o.epochs.length }; }
    if (format === 'planet-states') { const s = readPlanetStates(text()); return { objects: s.length, span: span(s.map((x) => x.epochTT).sort()[0], s.map((x) => x.epochTT).sort().at(-1)), timeScale: 'TT' }; }
    if (format === 'tle') { const t = readTle(text()); return { objects: t.length }; }
    if (format === 'intelsat-ecf') { const r = readIntelsat(text()); return { title: r.title, span: span(new Date(r.rows[0].ms).toISOString(), new Date(r.rows.at(-1).ms).toISOString()), samples: r.rows.length }; }
    if (format === 'cpf') { const c = readCpf(text()); return { objects: [c.norad], target: c.target, span: span(new Date(c.rows[0].ms).toISOString(), new Date(c.rows.at(-1).ms).toISOString()), samples: c.rows.length }; }
    if (format === 'sp3') {
      const t = zlib.gunzipSync(bytes).toString('latin1');
      const head = t.slice(0, 4000).split('\n');
      const n = Number(head.find((l) => l.startsWith('+ '))?.slice(3, 6));
      const epochs = [...t.matchAll(/^\*  (.{28})/gm)].map((m) => m[1].trim());
      return { objects: n, span: span(epochs[0], epochs.at(-1)), samples: epochs.length, timeScale: head.find((l) => l.startsWith('%c'))?.slice(9, 12) };
    }
  } catch (error) {
    return { error: error.message };
  }
  return {};
}

const summary = {};
for (const provider of providers(values.provider)) {
  const p = config.providers[provider];
  const node = new ProviderNode(nodes, provider);
  const chosen = select(provider, node.descriptors());
  const dir = path.join(inputs, provider);
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const d of chosen) {
    const name = `${compact(d.captured)}--${basename(d.url)}`;
    const bytes = node.file(d);
    fs.writeFileSync(path.join(dir, name), bytes);
    const format = d.role === 'operator-tle' ? 'tle' : p.format;
    files.push({ file: name, role: d.role, url: d.url, captured: d.captured, sha256: d.sha256, bytes: d.bytes, ncdFormat: d.format, ...describe(provider, format, bytes) });
  }
  const record = { provider, format: p.format, terms: p.terms, selection: p.select, node: path.join(nodes, provider), files };
  fs.writeFileSync(path.join(dir, 'inputs.json'), `${JSON.stringify(record, null, 1)}\n`);
  summary[provider] = { files: files.length, bytes: files.reduce((a, f) => a + f.bytes, 0) };
  console.log(`${provider}: ${files.length} files, ${(summary[provider].bytes / 1e6).toFixed(1)} MB`);
}

// Registry sources behind each provider's files (data/licenses.json).
const REGISTRY = { 'esa-pod': ['esa-navigation-office-pod'], 'glonass-precise': ['esa-navigation-office'], cpf: ['esa-navigation-office'], 'gps-precise': ['igs'] };

// ── publication ──
if (values.publish) {
  const releaseDir = path.resolve(values['release-dir'] ?? path.join(repoRoot, 'runs', 'e4-release'));
  const dataDir = path.join(repoRoot, 'data', 'e4');
  fs.mkdirSync(releaseDir, { recursive: true });
  const manifest = { experiment: config.experiment, generated: new Date().toISOString(), note: 'Every operator file E4 reads. SHA-256 is of the file as the operator served it.', files: [], assets: [], needsPermission: [], truth: [] };
  const sources = ['# E4 input data', '', 'The operator ephemerides E4 compares, exactly as each operator served them',
    '(SHA-256 of the served bytes), captured by the SDN ephemeris-provider nodes.',
    'Files here are gzip-compressed copies; larger sets are GitHub release assets',
    'listed in [MANIFEST.json](MANIFEST.json). Each provider\'s files stay under that',
    'provider\'s terms, stated below. Element sets (Space-Track) are not published.', '',
    ...licenseSection(['spacex-starlink', 'cmsa-tiangong', 'intelsat', 'planet', 'nasa-iss-oem', 'igs', 'esa-navigation-office', 'esa-navigation-office-pod', 'ilrs', 'space-track'], 'data/e4'), ''];
  for (const provider of providers(values.provider)) {
    const record = JSON.parse(fs.readFileSync(path.join(inputs, provider, 'inputs.json'), 'utf8'));
    const terms = record.terms;
    // The registry has the last word: ESA/ESOC files are cited, not reproduced.
    const allowed = terms.redistribute && mayPublish(REGISTRY[provider] ?? []);
    sources.push(`## ${provider}`, '', `Terms: ${terms.text} (${terms.url})`, '');
    const bundle = [];
    const committed = [];
    for (const f of record.files) {
      const raw = fs.readFileSync(path.join(inputs, provider, f.file));
      const gz = /\.(gz|zip)$/i.test(f.file) ? raw : zlib.gzipSync(raw, { level: 9 });
      const gzName = /\.(gz|zip)$/i.test(f.file) ? f.file : `${f.file}.gz`;
      const entry = { provider, file: f.file, role: f.role, url: f.url, captured: f.captured, sha256: f.sha256, bytes: f.bytes,
        objects: f.objects, span: f.span, samples: f.samples, terms: terms.text };
      if (allowed && gz.length <= config.publish.repositoryMaxCompressedBytes) {
        fs.mkdirSync(path.join(dataDir, provider), { recursive: true });
        fs.writeFileSync(path.join(dataDir, provider, gzName), gz);
        entry.published = { where: 'repository', path: `data/e4/${provider}/${gzName}`, compressedSha256: sha256(gz), compressedBytes: gz.length };
        committed.push(entry);
      } else {
        bundle.push(f.file);
        entry.published = { where: allowed ? 'release-asset' : 'needs-permission', asset: `e4-${provider}.tar.gz` };
      }
      manifest.files.push(entry);
    }
    if (bundle.length) {
      const asset = path.join(releaseDir, `e4-${provider}.tar.gz`);
      execFileSync('tar', ['-czf', asset, '-C', path.join(inputs, provider), ...bundle]);
      const bytes = fs.readFileSync(asset);
      const a = { name: path.basename(asset), bytes: bytes.length, sha256: sha256(bytes), provider, members: bundle.length, terms: terms.text, termsUrl: terms.url,
        redistributionGranted: allowed };
      (allowed ? manifest.assets : manifest.needsPermission).push(a);
      sources.push(`${bundle.length} file(s) in release asset \`${a.name}\` (${(a.bytes / 1e6).toFixed(1)} MB, SHA-256 ${a.sha256})` +
        (allowed ? '.' : ': prepared but not published, because no license grants redistribution (data/licenses.json).'), '');
    }
    if (committed.length) {
      sources.push('| File | URL | Captured (UTC) | SHA-256 (served bytes) |', '| --- | --- | --- | --- |');
      for (const e of committed) sources.push(`| \`${path.basename(e.published.path)}\` | ${e.url} | ${e.captured} | \`${e.sha256}\` |`);
      sources.push('');
    }
  }
  // Truth products (public archives), from step 05's index files.
  for (const product of fs.existsSync(path.join(truth, 'reference')) ? fs.readdirSync(path.join(truth, 'reference')).sort() : []) {
    const index = path.join(truth, 'reference', product, 'index.json');
    if (!fs.existsSync(index)) continue;
    const i = JSON.parse(fs.readFileSync(index, 'utf8'));
    manifest.truth.push({ product: i.product, url: i.url, sha256: i.sha256, objects: i.objects.length });
  }
  if (manifest.truth.length) {
    sources.push('## Truth (precise orbits, public archives, not copied here)', '', '| Product | URL | SHA-256 |', '| --- | --- | --- |',
      ...manifest.truth.map((t) => `| ${t.product} | ${t.url} | \`${t.sha256}\` |`), '');
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  fs.writeFileSync(path.join(dataDir, 'SOURCES.md'), `${sources.join('\n')}\n`);
  console.log(`published: ${manifest.files.filter((f) => f.published.where === 'repository').length} files in data/e4, ${manifest.assets.length} release assets, ${manifest.needsPermission.length} held for permission (${releaseDir})`);
}
