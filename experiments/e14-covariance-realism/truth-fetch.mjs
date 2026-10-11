// E14's polite fetchers for two authenticated public archives (PLAN.md section 5, changes before the freeze):
// - NASA CDDIS (cddis.nasa.gov/archive), an Earthdata bearer token;
// - the Copernicus Data Space Ecosystem (catalogue search public; downloads from zipper.dataspace.copernicus.eu with an
//   OAuth client_credentials token from identity.dataspace.copernicus.eu, valid 30 minutes).
// The secrets are read from their files at run time and sent only to their own hosts; they are never printed, logged or
// written. Requests are serial and at least 2 s apart; a file already held is asked for with its Last-Modified/ETag
// (conditional GET). Each download is written with `<file>.provenance.json` (URL, SHA-256, size, retrieval time,
// Last-Modified, ETag), the layout the modules' reference-states conversions check against.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const SECRETS = '/opt/data/sdn-archive/.secrets';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// KEY=VALUE lines (optional quotes, optional "export"); only the named key is returned.
function secret(file, key) {
  const text = fs.readFileSync(path.join(SECRETS, file), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  throw new Error(`${file} has no ${key}`);
}

let last = 0;
async function polite(spacingMs = 2000) {
  const wait = last + spacingMs - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
}

// One GET with the bearer token only while the URL stays on `host` (redirects followed by hand; a redirect elsewhere
// is followed without the token). Returns {status, headers, bytes} (bytes null for 304 and errors).
async function authorizedGet(url, host, token, headers = {}) {
  let target = new URL(url);
  for (let hop = 0; hop < 5; ++hop) {
    await polite();
    const onHost = target.protocol === 'https:' && target.hostname === host;
    const response = await fetch(target, { redirect: 'manual', headers: { ...headers, ...(onHost ? { Authorization: `Bearer ${token}` } : {}) } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      await response.arrayBuffer().catch(() => null);
      if (!next) return { status: response.status, headers: response.headers, bytes: null };
      target = new URL(next, target);
      continue;
    }
    const bytes = response.ok ? Buffer.from(await response.arrayBuffer()) : (await response.arrayBuffer().catch(() => null), null);
    return { status: response.status, headers: response.headers, bytes };
  }
  throw new Error(`too many redirects for ${url}`);
}

// A file kept at `file` with its provenance; conditional on what is held. Returns {file, status, sha256} or null.
async function keep(url, file, get) {
  const provFile = `${file}.provenance.json`;
  const held = fs.existsSync(file) && fs.existsSync(provFile) ? JSON.parse(fs.readFileSync(provFile, 'utf8')) : null;
  const conditional = held ? { ...(held.lastModified ? { 'If-Modified-Since': held.lastModified } : {}), ...(held.etag ? { 'If-None-Match': held.etag } : {}) } : {};
  const r = await get(url, conditional);
  if (r.status === 304 && held) return { file, status: 'not-modified', sha256: held.sha256 };
  if (!r.bytes) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, r.bytes);
  const provenance = { url, sha256: sha256(r.bytes), size: r.bytes.length, retrievedUtc: new Date().toISOString(),
    lastModified: r.headers.get('last-modified'), etag: r.headers.get('etag') };
  fs.writeFileSync(provFile, `${JSON.stringify(provenance, null, 1)}\n`);
  return { file, status: 'fetched', sha256: provenance.sha256 };
}

// ── NASA CDDIS ──
export function cddis({ root }) {
  const token = secret('earthdata.env', 'EARTHDATA_TOKEN');
  const host = 'cddis.nasa.gov';
  const get = (url, headers) => authorizedGet(url, host, token, headers);
  return {
    // The names in an archive directory (CDDIS's "*?list" listing).
    async list(dir) {
      const r = await get(`https://${host}/archive/${dir.replace(/^\/|\/$/g, '')}/*?list`);
      if (!r.bytes) return { status: r.status, names: [] };
      return { status: r.status, names: r.bytes.toString('utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean) };
    },
    // archive/<rel> -> <root>/cddis/<rel>
    fetch: (rel) => keep(`https://${host}/archive/${rel}`, path.join(root, 'cddis', rel), get),
  };
}

// ── Copernicus Data Space Ecosystem ──
export function copernicus({ root }) {
  const id = secret('copernicus.env', 'CDSE_SH_CLIENT_ID'), key = secret('copernicus.env', 'CDSE_SH_CLIENT_SECRET');
  const tokenHost = 'identity.dataspace.copernicus.eu', host = 'zipper.dataspace.copernicus.eu';
  let token = null, expires = 0;
  async function bearer() {
    if (token && Date.now() < expires - 60000) return token;
    await polite();
    const response = await fetch(`https://${tokenHost}/auth/realms/CDSE/protocol/openid-connect/token`, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: key }) });
    if (!response.ok) throw new Error(`Copernicus token request refused (${response.status})`);
    const body = await response.json();
    token = body.access_token;
    expires = Date.now() + (body.expires_in ?? 1800) * 1000;
    return token;
  }
  return {
    // The public catalogue: products whose name contains `contains`, sensing start in [from, to) (ISO), newest first.
    async search({ contains, from, to, top = 200 }) {
      const filter = `contains(Name,'${contains}') and ContentDate/Start ge ${from} and ContentDate/Start lt ${to}`;
      const out = [];
      let url = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=${encodeURIComponent(filter)}&$orderby=ContentDate/Start asc&$top=${top}`;
      while (url) {
        await polite();
        const r = await fetch(url);
        if (!r.ok) throw new Error(`catalogue search ${r.status}`);
        const body = await r.json();
        out.push(...body.value.map((p) => ({ id: p.Id, name: p.Name, start: p.ContentDate?.Start, end: p.ContentDate?.End, size: p.ContentLength, online: p.Online, modified: p.ModificationDate })));
        url = body['@odata.nextLink'] ?? null;
      }
      return out;
    },
    // A product's archive -> <root>/copernicus/<subdir>/<name>(.zip)
    async fetch(product, subdir) {
      const t = await bearer();
      const file = path.join(root, 'copernicus', subdir, /\.zip$|\.EOF$|\.TGZ$/i.test(product.name) ? product.name : `${product.name}.zip`);
      return keep(`https://${host}/odata/v1/Products(${product.id})/$value`, file, (url, headers) => authorizedGet(url, host, t, headers));
    },
  };
}
