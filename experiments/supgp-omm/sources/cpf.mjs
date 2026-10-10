// ILRS Consolidated Laser Ranging Predictions (CPF v2), one file per target, prediction centre and issue, mirrored
// on the EDC archive (edc.dgfi.tum.de/pub/slr/cpf_predicts_v2/<year>/<target>/<target>_cpf_<yymmdd>_<doy><nn>.<centre>), anonymous.
// CelesTrak's CPF sets are named "<TARGET> [<CENTRE>]"; the EPOCH is the first prediction of the file dated
// yymmdd of that day, and the fit window is the whole file ([EPOCH, last prediction], 5 to 7 days): on the sampled
// files the published RMS is the RMS over the file. When a day has several issues for a centre every one is tried.
// Readers (WASM): data-source/cpf-source (H1/H2 header and the type-10 records), then analysis/reference-states
// (ITRS to GCRS, IERS EOP) for the Earth-fixed frame the files declare.
import { sha256 } from '../lib/http.mjs';
import { compileModule, runStreamModule } from '../lib/readers/hostmodule.mjs';
import { ecefToGcrf } from '../lib/readers/ecef.mjs';
import { unpackOem } from '../lib/records.mjs';

export const id = 'cpf';
export const hours = 24 * 8;   // the longest file; the window ends at the file's last prediction (hoursFor)
export const hosts = ['edc.dgfi.tum.de'];
export const BASE = 'https://edc.dgfi.tum.de/pub/slr/cpf_predicts_v2';
export const noCandidateCode = 'no-file';
export const MAX_CANDIDATES = 3;
export const CPF_MODULE = 'data-source/cpf-source/dist/isomorphic/module.wasm';

const parts = (name) => { const m = /^(.*) \[(\w+)\]$/.exec(name); return m ? { target: m[1].toLowerCase(), centre: m[2].toLowerCase() } : null; };
const yymmdd = (ms) => { const d = new Date(ms); return `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; };
const epochMs = (row) => Math.round(Date.parse(`${row.epoch}Z`) / 1000) * 1000;

// The window ends at the file's last prediction.
export const hoursFor = (summary, row) => Math.max(0, (summary.lastMs - epochMs(row)) / 3600e3 + 1 / 3600);

export async function prepare({ http, log, snapshot }) {
  const targets = [...new Set(snapshot.rows.map((r) => parts(r.name)?.target).filter(Boolean))];
  const year = new Date(Math.min(...snapshot.rows.map(epochMs))).getUTCFullYear();
  const listings = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < targets.length) {
      const t = targets[next++];
      const url = `${BASE}/${year}/${t}/`;
      const res = await http.get(url);
      if (res.status !== 200 || !res.body) { listings.set(t, { status: res.status, names: [] }); continue; }
      const names = [...res.body.toString('utf8').matchAll(/href='[^']*\/([^'/]+)'/g)].map((m) => m[1]).filter((n) => n.startsWith(`${t}_cpf_`));
      listings.set(t, { status: 200, url, names, responseUtc: res.responseUtc });
    }
  }));
  log(`cpf: ${targets.length} target listings, ${[...listings.values()].reduce((n, l) => n + l.names.length, 0)} file names`);
  return { listings, year };
}

export const noCandidateReason = (ctx, row) => {
  const p = parts(row.name);
  const l = p && ctx.listings.get(p.target);
  if (!p) return 'the set name carries no prediction centre';
  if (!l || l.status !== 200) return `EDC lists no directory for target ${p?.target} (HTTP ${l?.status ?? 'none'})`;
  return `EDC holds no ${p.centre.toUpperCase()} file for ${p.target} dated ${yymmdd(epochMs(row))}`;
};
export function candidates(ctx, row) {
  const p = parts(row.name);
  const l = p && ctx.listings.get(p.target);
  if (!l) return [];
  const day = yymmdd(epochMs(row));
  return l.names.filter((n) => n.endsWith(`.${p.centre}`) && n.split('_')[2] === day).sort().reverse().slice(0, MAX_CANDIDATES)
    .map((n) => ({ id: n, url: `${l.url}${n}`, target: p.target }));
}

export async function read({ readers, bytes, cand, row }) {
  const [oem] = await runStreamModule(readers.cpf.compiled, { listingUrl: 'memory://cpf/', target: cand.target }, ({ url }) => {
    if (url === 'memory://cpf/') return { status: 200, body: `<a href="${cand.id}">${cand.id}</a>` };
    if (url === `memory://cpf/${cand.id}`) return { status: 200, body: bytes };
    return { status: 404, body: '' };
  });
  if (!oem) throw Object.assign(new Error('the module read no position from the file'), { reasonCode: 'unreadable' });
  const block = unpackOem(oem).EPHEMERIS_DATA_BLOCK[0];
  if (block.OBJECT.NORAD_CAT_ID !== row.norad) throw Object.assign(new Error(`the file's H2 header names NORAD ${block.OBJECT.NORAD_CAT_ID}, the set is ${row.norad}`), { reasonCode: 'norad-mismatch' });
  // Frame code 0 is the Earth-fixed frame (the module labels it ECEF); an inertial file would already be EME2000.
  const earthFixed = block.REFERENCE_FRAME?.REFERENCE_FRAME_type === 4;
  if (!earthFixed) return { oem, objectName: row.name };
  const g = await ecefToGcrf({ referenceStates: readers.ecef.referenceStates, rows: readers.ecef.rows, oemBytes: oem, key: cand.target.toUpperCase().slice(0, 12), norad: row.norad, name: row.name, agency: 'ILRS' });
  return { oem: g.oem, objectName: row.name };
}
