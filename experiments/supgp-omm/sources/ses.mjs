// SES: the IESS-412 eleven-parameter files SES publishes per satellite (ses-satellite-orbital-data-public on S3,
// linked from the SES technical-data page), replaced in place. The window is taken to be 24 h like Intelsat's
// [EPOCH, EPOCH + 24 h]. A file names its satellite ("... FOR Astra-1L / 335.50 DEG. E"); the module returns
// that name, and the SupGP name without its parenthetical alias must equal it once case and punctuation go.
// Discovery is data-source/ephemeris-source (WASM). Readers (WASM): files/orbit-products normalize_ses_i11,
// then analysis/reference-states (ITRS to GCRS, IERS EOP).
import { sha256 } from '../lib/http.mjs';
import { readI11 } from '../lib/readers/i11.mjs';
import { ecefToGcrf } from '../lib/readers/ecef.mjs';
import { unpackOem } from '../lib/records.mjs';

export const id = 'ses';
export const hours = 24;
export const hosts = ['www.ses.com', 'ses-satellite-orbital-data-public.s3.eu-west-1.amazonaws.com'];
export const noCandidateCode = 'no-file';
const key = (name) => name.replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const input = (portId, value) => { const payload = Buffer.from(JSON.stringify(value)); return { portId, payload, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: payload.length } }; };

export async function prepare({ http, log, loadReader }) {
  const discovery = await loadReader('data-source/ephemeris-source');
  const orbit = await loadReader('files/orbit-products');
  const epoch_seconds = Math.floor(Date.now() / 1000);
  const plan = JSON.parse(Buffer.from((await discovery.invoke('plan_source_requests', [input('config', { source_id: 'ses', epoch_seconds })])).outputs.find((o) => o.portId === 'requests').payload));
  const responses = {};
  for (const rq of plan) {
    const res = await http.get(rq.url);
    responses[rq.url] = { status: res.status, body: res.body ? res.body.toString('latin1') : '' };
  }
  const found = JSON.parse(Buffer.from((await discovery.invoke('discover_sources', [input('config', { source_id: 'ses', epoch_seconds }), input('responses', responses)])).outputs.find((o) => o.portId === 'resources').payload));
  const byKey = new Map();
  const unread = [];   // listed files that could not be read, with why: a satellite without a file here may have one among them
  for (const r of found) {
    const res = await http.get(r.url);
    if (res.status !== 200 || !res.body) { unread.push({ url: r.url, status: res.status, error: res.error ?? null }); continue; }
    let oem;
    try { oem = unpackOem(await readI11(orbit, res.body)); } catch (e) { unread.push({ url: r.url, status: res.status, error: `unreadable: ${String(e.message ?? e).slice(0, 80)}` }); continue; }
    const block = oem.EPHEMERIS_DATA_BLOCK[0];
    const k = key(block.OBJECT.OBJECT_NAME);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({ id: r.resource_id, url: r.url, startMs: Date.parse(`${block.START_TIME}Z`), fileName: block.OBJECT.OBJECT_NAME, body: res.body,
      provenance: { url: r.url, requestUtc: res.requestUtc, responseUtc: res.responseUtc, httpStatus: 200, etag: res.headers.etag, lastModified: res.headers.lastModified, contentRange: null, rangeRequested: null, bytes: res.body.length, totalBytes: res.body.length, sha256: sha256(res.body), attempts: res.attempts } });
  }
  await discovery.destroy();
  await orbit.destroy();
  log(`ses: ${found.length} eleven-parameter files discovered, ${[...byKey.values()].flat().length} read${unread.length ? `; not read: ${unread.map((u) => `${u.url.split('/').at(-1)} (${u.status || u.error})`).join(', ')}` : ''}`);
  return { byKey, unread, discovered: found.length };
}

export const describe = (ctx) => ({ discovered: ctx.discovered, read: [...ctx.byKey.values()].flat().length, unread: ctx.unread });
export const noCandidateReason = (ctx) => `no SES eleven-parameter file that was read names this satellite (the O3b constellation has none)${ctx?.unread?.length ? `; ${ctx.unread.length} listed file(s) could not be read: ${ctx.unread.map((u) => `${u.url.split('/').at(-1)} HTTP ${u.status || u.error}`).join(', ')}` : ''}`;
export function candidates(ctx, row) {
  return (ctx.byKey.get(key(row.name)) ?? []).map((f) => ({ id: f.id, url: f.url, startMs: f.startMs }));
}
export const held = (ctx, cand) => [...ctx.byKey.values()].flat().find((f) => f.id === cand.id);

export async function read({ readers, bytes, row }) {
  const ecef = await readI11(readers.orbitProducts, bytes);
  const g = await ecefToGcrf({ referenceStates: readers.ecef.referenceStates, rows: readers.ecef.rows, oemBytes: ecef, key: 'SES', norad: row.norad, name: row.name, agency: 'SES' });
  return { oem: g.oem, objectName: row.name };
}
