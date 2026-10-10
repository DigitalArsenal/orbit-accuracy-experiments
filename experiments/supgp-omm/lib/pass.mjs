// One group of the pass: for every SupGP set, find the operator version CelesTrak's published RMS
// is reproduced on (the gate), fit our OMM to the same points, and record both.
//
// Pairing (E11 paired by "latest start at or before the EPOCH", which tripped the gate on 159 of 302
// versions): the candidate versions near the EPOCH are tried in turn (nearest first) and the one on
// which the recomputed RMS reproduces the published one is the pair. Among versions that pass, a version
// holding the whole window beats one that starts after the EPOCH, a version that existed when the
// snapshot was fetched beats a later one, and then the closest RMS wins. A set no version reproduces is
// unpaired, with the nearest miss as the reason.
import { sha256, parseContentRange } from './http.mjs';
import { setEpochMs } from './time.mjs';

const ab = (buf) => (buf.buffer.byteLength === buf.length && buf.byteOffset === 0 ? buf.buffer : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

export class Timing {
  constructor() { this.fetchMs = 0; this.fetchRequests = 0; this.fetchBytes = 0; this.workerMs = 0; this.readMs = 0; this.scoreMs = 0; this.fitMs = 0; this.windowFitMs = 0; this.jobs = 0; }
  json() { return { ...this }; }
}

// Preference among candidates that pass: [window held whole, version not newer than the snapshot, RMS miss].
const rank = (c) => [c.window.complete ? 0 : 1, c.causal === true ? 0 : c.causal === null ? 1 : 2, Math.abs(c.gate.deltaKm)];
const better = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < 3; ++i) if (x[i] !== y[i]) return x[i] < y[i]; return false; };

export async function runGroup({ group, snapshot, source, http, pool, store, ctx, options, log, timing }) {
  const rows = pick(snapshot.rows, options.limit);
  const out = new Array(rows.length);
  let next = 0;
  let done = 0;
  let violations = 0;
  const started = Date.now();

  async function candidateFetch(cand, row, extra) {
    const held = source.held?.(ctx, cand);
    if (held) return { body: Buffer.from(held.body), provenance: held.provenance };
    const range = source.rangeFor ? source.rangeFor(cand, row, extra) : null;
    const res = await http.get(cand.url, { range });
    timing.fetchMs += res.ms ?? 0;
    ++timing.fetchRequests;
    if (res.body) timing.fetchBytes += res.body.length;
    if (res.status !== 200 && res.status !== 206) return { error: res.status === -1 ? res.error : `HTTP ${res.status}${res.error ? ` ${res.error}` : ''}`, status: res.status };
    const total = parseContentRange(res.headers?.contentRange)?.total ?? (res.status === 200 ? res.body.length : null);
    return {
      body: res.body,
      provenance: {
        url: cand.url, requestUtc: res.requestUtc, responseUtc: res.responseUtc, httpStatus: res.status, etag: res.headers?.etag ?? null,
        lastModified: res.headers?.lastModified ?? null, contentRange: res.headers?.contentRange ?? null, rangeRequested: range, bytes: res.body.length,
        totalBytes: total, sha256: sha256(res.body), attempts: res.attempts,
      },
    };
  }

  async function evaluate(cand, row, fetched) {
    const body = ab(fetched.body);
    const out1 = await pool.run({ type: 'evaluate', source: source.id, row, cand, body, context: source.contextFor?.(ctx, cand, row), fit: true, closure: options.closure, windowFits: row.index % (source.windowFitEvery ?? 1) === 0 }, [body]);
    timing.workerMs += out1.wallMs ?? 0;
    ++timing.jobs;
    return out1;
  }

  async function processRow(row) {
    if (!(row.publishedRmsKm > 0)) return unpaired(row, 'no-published-rms', 'CelesTrak published no RMS for this set');
    let cands;
    try { cands = await source.candidates(ctx, row); } catch (e) { return unpaired(row, 'candidates-failed', String(e.message ?? e)); }
    if (!cands.length) return unpaired(row, source.noCandidateCode ?? 'no-version', source.noCandidateReason?.(ctx, row) ?? 'no operator version holding the window is known');
    const tried = [];
    const passing = [];
    for (const cand of cands) {
      if (!source.held?.(ctx, cand) && http.disabled.has(new URL(cand.url).host)) { tried.push({ id: cand.id, error: 'host disabled' }); continue; }
      let fetched = await candidateFetch(cand, row, 1);
      if (fetched.error) { tried.push({ id: cand.id, startUtc: iso(cand.startMs), error: fetched.error }); continue; }
      let res = await evaluate(cand, row, fetched);
      if (res.ok && res.short) {   // the prefix ended before the window's end: one longer request
        fetched = await candidateFetch(cand, row, 1.35);
        if (fetched.error) { tried.push({ id: cand.id, startUtc: iso(cand.startMs), error: fetched.error }); continue; }
        res = await evaluate(cand, row, fetched);
      }
      if (!res.ok || res.short) {
        tried.push({ id: cand.id, startUtc: iso(cand.startMs), error: res.short ? `file ends at ${iso(res.short.lastMs)}, before ${iso(res.short.wantLastMs)}` : res.error, guard: res.guard ?? undefined, code: res.code ?? undefined });
        if (res.guard) return unpaired(row, 'guard', res.error, { candidates: tried });
        continue;
      }
      const r = res.result;
      timing.readMs += r.timing.readMs ?? 0;
      timing.scoreMs += r.timing.scoreMs ?? 0;
      timing.fitMs += r.timing.fitMs ?? 0;
      timing.windowFitMs += r.timing.windowFitMs ?? 0;
      const createdMs = fetched.provenance.lastModified ? Date.parse(fetched.provenance.lastModified) : null;
      const causal = createdMs === null ? null : createdMs <= Date.parse(snapshot.fetchedUtc);
      const entry = {
        cand, provenance: fetched.provenance, result: r, omm: res.omm ? Buffer.from(res.omm) : null, causal, createdMs, gate: r.gate, window: r.window,
      };
      tried.push({ id: cand.id, startUtc: iso(cand.startMs), createdUtc: iso(createdMs), ratio: r.gate.ratio, recomputedRmsKm: r.gate.recomputedRmsKm, pass: r.gate.pass, windowComplete: r.window.complete, coverageHours: r.window.availableHours, causal, windows: windowScores(r) });
      if (r.gate.pass) {
        passing.push(entry);
        // Nothing outranks a pass on a version that holds the whole window and existed at the snapshot, unless another such version is still to come.
        const epochMs = setEpochMs(row);
        const moreWhole = cands.slice(cands.indexOf(cand) + 1).some((c) => c.startMs === undefined || c.startMs <= epochMs);
        if (r.window.complete && causal !== false && r.ours?.converged && !moreWhole) break;
      }
    }
    if (!passing.length) {
      const near = tried.filter((t) => t.ratio !== undefined).sort((a, b) => Math.abs(a.ratio - 1) - Math.abs(b.ratio - 1))[0];
      if (!tried.length) return unpaired(row, 'not-tried', 'no candidate was tried', { candidates: tried });
      if (!near) {
        const codes = new Set(tried.map((t) => t.code ?? 'no-data'));
        return unpaired(row, codes.size === 1 ? [...codes][0] : 'no-data', `no candidate version could be read: ${tried.map((t) => t.error).join('; ')}`, { candidates: tried });
      }
      // Every version tried starts after the EPOCH: the file CelesTrak fitted has been replaced (or is not one we can name).
      const kind = tried.some((t) => t.windowComplete) ? 'whole-window version does not reproduce it' : 'only versions that start after the EPOCH';
      return unpaired(row, 'rms-not-reproduced', `${tried.length} version(s) tried; the nearest reproduces ${near.recomputedRmsKm.toFixed(4)} km against the published ${row.publishedRmsKm} km (x${near.ratio.toFixed(2)}); ${kind}`, { candidates: tried, nearest: near, kind });
    }
    let best = passing[0];
    for (const c of passing.slice(1)) if (better(c, best)) best = c;
    const r = best.result;
    return {
      status: 'paired',
      version: { id: best.cand.id, startUtc: iso(best.cand.startMs), stopUtc: iso(best.cand.stopMs), createdUtc: iso(best.createdMs), listedIn: best.cand.listedIn, ...best.provenance },
      causal: best.causal,
      window: r.window, windowProof: r.windowProof, windowFits: r.windowFits ?? null, ephemeris: r.ephemeris, supgp: r.supgp, gate: r.gate, ours: r.ours, comparison: r.comparison ?? null, guards: r.guards, candidates: tried,
      omm: undefined, ommBuffer: best.omm, timing: r.timing,
    };
  }

  function unpaired(row, code, detail, extra = {}) {
    const { kind, ...rest } = extra;
    return { status: 'unpaired', reason: { code, ...(kind ? { kind } : {}), detail }, ...rest };
  }

  async function loop() {
    for (;;) {
      const i = next++;
      if (i >= rows.length) return;
      const row = rows[i];
      let res;
      try { res = await processRow(row); } catch (e) { res = unpaired(row, 'harness-error', String(e.stack ?? e).slice(0, 500)); }
      const { ommBuffer, ...rest } = res;
      const record = {
        group, norad: row.norad, name: row.name, objectId: row.objectId, setEpoch: row.epoch, elementSetNo: row.elementSetNo, dataSource: row.dataSource,
        snapshot: { stamp: snapshot.stamp, fetchedUtc: snapshot.fetchedUtc }, publishedRmsKm: row.publishedRmsKm, index: row.index, ...rest,
      };
      store.writeRow(group, record, ommBuffer ?? null);
      out[i] = record;
      if (record.reason?.code === 'guard') ++violations;
      if (++done % options.progressEvery === 0 || done === rows.length) {
        const secs = (Date.now() - started) / 1000;
        log(`${group}: ${done}/${rows.length} sets, ${(done / secs).toFixed(1)}/s, paired ${out.filter((r) => r?.status === 'paired').length}, ${secs.toFixed(0)} s`);
      }
      if (violations > options.maxGuardViolations) { log(`${group}: stopping, ${violations} guard violations`); next = rows.length; }
    }
  }

  await Promise.all(Array.from({ length: options.rowsInFlight }, loop));
  return out.filter(Boolean);
}

// CelesTrak's set scored on this version over the chosen window (factor 1) and over windows a fraction or multiple of its length:
// the points and the per-coordinate RMS of each, the evidence for the window (lib/summary.mjs).
function windowScores(r) {
  return { 1: { n: r.supgp.n, rmsKm: r.supgp.rmsPerCoordinateKm }, ...Object.fromEntries(Object.entries(r.windowProof ?? {}).map(([f, w]) => [f, { n: w.n, rmsKm: w.rmsPerCoordinateKm }])) };
}

// A group whose source could not be reached or prepared: every set is unpaired, with the reason, and the pass goes on.
export function failGroup({ group, snapshot, store, options, code, detail }) {
  return pick(snapshot.rows, options.limit).map((row) => {
    const record = {
      group, norad: row.norad, name: row.name, objectId: row.objectId, setEpoch: row.epoch, elementSetNo: row.elementSetNo, dataSource: row.dataSource,
      snapshot: { stamp: snapshot.stamp, fetchedUtc: snapshot.fetchedUtc }, publishedRmsKm: row.publishedRmsKm, index: row.index, status: 'unpaired', reason: { code, detail },
    };
    store.writeRow(group, record, null);
    return record;
  });
}

// An evenly spaced sample when a limit is given (rehearsals); every row otherwise.
function pick(rows, limit) {
  if (!limit || limit >= rows.length) return rows;
  const step = rows.length / limit;
  return Array.from({ length: limit }, (_, i) => rows[Math.floor(i * step)]);
}
