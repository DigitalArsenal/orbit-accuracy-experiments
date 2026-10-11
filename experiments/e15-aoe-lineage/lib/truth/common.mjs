// What every truth reader shares: polite HTTP (the SupGP pass's, with E15's User-Agent and 4 requests per host), the
// module readers, Earth orientation, and the first-state-in-window check. Operator bytes live in memory only: nothing in
// lib/truth writes a file except name registries (file names, no ephemeris).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PoliteHttp } from '../../../supgp-omm/lib/http.mjs';
import { loadModule } from '../../../../harness/modules.mjs';
import { labelledEphemeris, summarizeOem } from '../../../supgp-omm/lib/records.mjs';
import { eopRows } from '../../../supgp-omm/lib/readers/ecef.mjs';
import { HTTP, PATHS, USER_AGENT } from '../../settings.mjs';
import { config } from '../windows.mjs';

export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const isoZ = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

export class Http {
  constructor(log) { this.inner = new PoliteHttp({ perHost: HTTP.perHost, log }); }
  get(url, { range = null, headers = {} } = {}) { return this.inner.get(url, { range, headers: { 'User-Agent': USER_AGENT, ...headers } }); }
  get disabled() { return this.inner.disabled; }
  stats() { return Object.fromEntries([...this.inner.stats].map(([h, s]) => [h, s])); }
}

// The newest archived IERS finals2000A (our own daily archive), as eop-parser rows.
export function eopFile() {
  const latest = JSON.parse(fs.readFileSync(path.join(PATHS.eop, 'iers-eop/latest.json'), 'utf8'));
  return path.join(PATHS.eop, latest.files['finals.all.iau2000.txt'].path);
}

// Lazily loaded module readers, shared by the truth sources of one run; provenance goes to the run.
export class Readers {
  constructor(run) { this.run = run; this.cache = new Map(); }
  async module(relative) {
    if (!this.cache.has(relative)) {
      const m = await loadModule(PATHS.readerModules, relative);
      this.run?.addModule(m.provenance);
      this.cache.set(relative, m);
    }
    return this.cache.get(relative);
  }
  async eop() {
    if (!this.cache.has('eop')) {
      const file = eopFile();
      const bytes = fs.readFileSync(file);
      this.run?.addInputs('eop', { [file]: sha256(bytes) });
      const parser = await this.module('data-source/eop-parser');
      this.cache.set('eop', { file, rows: await eopRows(parser, bytes) });
    }
    return this.cache.get('eop');
  }
  async destroy() { for (const [k, m] of this.cache) if (k !== 'eop') await m.destroy?.(); }
}

// A truth item: the object's reference ephemeris (labelled for element_residuals) when its span meets
// [targetMs, targetMs + tolerance]; otherwise the reason it does not. Whether a state lies in that window is the
// module's answer (a window without one returns no sample, recorded as such).
export function itemOf({ norad, regime, oem, name, truth, targetMs }) {
  const ephemeris = labelledEphemeris(oem, norad, name);
  const s = summarizeOem(ephemeris.payload);
  const tolMs = config.targetToleranceSeconds * 1000;
  const span = { frame: s.frame, firstUtc: isoZ(s.firstMs), lastUtc: isoZ(s.lastMs), stepSeconds: s.stepSeconds, states: s.states };
  if (s.firstMs <= targetMs + tolMs && s.lastMs >= targetMs) return { norad, regime, ephemeris, truth: { ...truth, ...span } };
  return { norad, regime, missing: `the version holds ${span.firstUtc} to ${span.lastUtc}, not the target's 15 min`, truth: { ...truth, ...span } };
}

// Promise pool for I/O-bound work (the HTTP layer bounds requests per host).
export async function eachLimit(list, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) { const i = next++; await fn(list[i], i); }
  }));
}
