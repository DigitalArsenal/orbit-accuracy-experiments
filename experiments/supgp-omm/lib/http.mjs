// Polite HTTP for operator hosts. Bytes stay in memory: there is no cache, no
// temp file and no write path in this module.
//
// - At most `perHost` requests in flight per host (owner: 8).
// - One User-Agent on every request.
// - A host that answers 403 or 429 is disabled for the rest of the run.
// - Network errors and 5xx are retried with backoff; other 4xx are answers.
import crypto from 'node:crypto';
import { HTTP, USER_AGENT } from '../config.mjs';

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const isoUtc = (ms) => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Semaphore {
  constructor(n) { this.free = n; this.waiting = []; }
  async acquire() {
    if (this.free > 0) { --this.free; return; }
    await new Promise((resolve) => this.waiting.push(resolve));
  }
  release() {
    const next = this.waiting.shift();
    if (next) next(); else ++this.free;
  }
}

export class PoliteHttp {
  constructor({ perHost = HTTP.perHostConcurrency, log = () => {}, fetchImpl = fetch } = {}) {
    this.perHost = perHost;
    this.log = log;
    this.fetchImpl = fetchImpl;
    this.semaphores = new Map();
    this.disabled = new Map();   // host -> reason
    this.stats = new Map();      // host -> {requests, bytes, requestMs, status: {code: n}, retries}
  }

  stat(host) {
    if (!this.stats.has(host)) this.stats.set(host, { requests: 0, bytes: 0, requestMs: 0, retries: 0, status: {} });
    return this.stats.get(host);
  }

  // range: [first, last] inclusive byte positions, or null.
  // Returns {status, body, headers, requestUtc, responseUtc, ms, attempts, error}.
  // status -1: the host is disabled; 0: no answer after the retries.
  async get(url, { range = null, headers = {} } = {}) {
    const host = new URL(url).host;
    if (this.disabled.has(host)) return { status: -1, body: null, error: `host disabled: ${this.disabled.get(host)}`, host };
    if (!this.semaphores.has(host)) this.semaphores.set(host, new Semaphore(this.perHost));
    const gate = this.semaphores.get(host);
    const stat = this.stat(host);
    await gate.acquire();
    try {
      const h = { 'User-Agent': USER_AGENT, ...headers };
      if (range) h.Range = `bytes=${range[0]}-${range[1]}`;
      let last = { status: 0, body: null, error: null };
      for (let attempt = 1; attempt <= HTTP.retries; ++attempt) {
        if (this.disabled.has(host)) return { status: -1, body: null, error: `host disabled: ${this.disabled.get(host)}`, host };
        const t0 = Date.now();
        let res = null;
        let body = null;
        let error = null;
        try {
          res = await this.fetchImpl(url, { headers: h, signal: AbortSignal.timeout(HTTP.timeoutMs) });
          body = res.status === 200 || res.status === 206 ? Buffer.from(await res.arrayBuffer()) : null;
          if (!body) await res.body?.cancel();
        } catch (e) {
          error = String(e.cause?.code ?? e.message ?? e);
        }
        const ms = Date.now() - t0;
        ++stat.requests;
        stat.requestMs += ms;
        if (body) stat.bytes += body.length;
        const code = res ? res.status : 0;
        stat.status[code] = (stat.status[code] ?? 0) + 1;
        if (code === 403 || code === 429) {
          this.disabled.set(host, `HTTP ${code} on ${url}`);
          this.log(`host ${host} disabled after HTTP ${code}`);
          return { status: code, body: null, error: `HTTP ${code}`, host, attempts: attempt };
        }
        last = {
          status: code, body, error, host, attempts: attempt, ms,
          headers: res ? {
            etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified'),
            contentRange: res.headers.get('content-range'), contentLength: res.headers.get('content-length'),
            contentType: res.headers.get('content-type'),
          } : null,
          requestUtc: isoUtc(t0), responseUtc: isoUtc(t0 + ms),
        };
        if (res && code < 500) return last;
        if (attempt < HTTP.retries) { ++stat.retries; await sleep(HTTP.backoffMs[attempt - 1] ?? 9000); }
      }
      return last;
    } finally {
      gate.release();
    }
  }
}

// "bytes 0-539999/2041180" -> {first, last, total}
export function parseContentRange(text) {
  const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(text ?? '');
  return m ? { first: Number(m[1]), last: Number(m[2]), total: m[3] === '*' ? null : Number(m[3]) } : null;
}
