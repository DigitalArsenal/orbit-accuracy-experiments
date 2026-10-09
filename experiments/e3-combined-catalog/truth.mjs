// Reference states for E3: every converted product whose name starts with one
// of the given prefixes (analysis/reference-states output: one directory per
// product, index.json, one size-prefixed $OEM per object). Reading and
// selecting only; the states are the module's.
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../../harness/modules.mjs';
import { decodeOemStream, OEM_TYPE } from '../../harness/records.mjs';

export const utcMs = (iso) => Date.parse(/[zZ]$/.test(iso) ? iso : `${iso}Z`);

export class Products {
  constructor(dir, prefixes) {
    this.dir = dir;
    this.products = [];
    this.byObject = new Map();  // norad -> [{product, start, stop, file, comment, statedSigmaM}]
    for (const product of fs.readdirSync(dir).filter((n) => prefixes.some((p) => n.startsWith(p))).sort()) {
      const indexFile = path.join(dir, product, 'index.json');
      if (!fs.existsSync(indexFile)) continue;
      const raw = fs.readFileSync(indexFile);
      const index = JSON.parse(raw);
      this.products.push({ product, source: index.product, url: index.url, sha256: index.sha256, indexSha256: sha256(raw), statedSigmaM: index.statedSigmaM ?? null });
      for (const o of index.objects) {
        if (!this.byObject.has(o.norad)) this.byObject.set(o.norad, []);
        this.byObject.get(o.norad).push({ product, start: utcMs(o.start), stop: utcMs(o.stop), file: path.join(product, o.file), comment: o.comment ?? '', statedSigmaM: index.statedSigmaM ?? null });
      }
    }
    this.cache = new Map();
    this.read = {};  // relative file -> SHA-256, every file whose states were used
  }

  objects() { return [...this.byObject.keys()].sort((a, b) => a - b); }

  entries(norad) { return this.byObject.get(norad) ?? []; }

  // {bytes, epochs: Float64Array (ms), lines} for one object file.
  load(entry) {
    if (!this.cache.has(entry.file)) {
      const bytes = fs.readFileSync(path.join(this.dir, entry.file));
      this.read[entry.file] = sha256(bytes);
      const lines = decodeOemStream(new Uint8Array(bytes)).flatMap((o) => o.EPHEMERIS_DATA_BLOCK.flatMap((b) => b.EPHEMERIS_DATA_LINES));
      this.cache.set(entry.file, { bytes, lines, epochs: Float64Array.from(lines.map((l) => utcMs(l.EPOCH))) });
    }
    return this.cache.get(entry.file);
  }

  // The state at exactly tMs (within 1 ms) in one entry, or null.
  stateAt(entry, tMs) {
    if (tMs < entry.start - 1 || tMs > entry.stop + 1) return null;
    const { epochs, lines } = this.load(entry);
    const i = lowerBound(epochs, tMs - 1);
    if (i >= epochs.length || Math.abs(epochs[i] - tMs) > 1) return null;
    return stateOf(lines[i], epochs[i], entry);
  }

  // The first state at or after tMs, no later than tMs + toleranceMs, over the
  // object's products; ties go to the first product by name.
  firstAtOrAfter(norad, tMs, toleranceMs) {
    let best = null;
    for (const entry of this.entries(norad)) {
      if (entry.stop < tMs || entry.start > tMs + toleranceMs) continue;
      const { epochs, lines } = this.load(entry);
      const i = lowerBound(epochs, tMs);
      if (i >= epochs.length || epochs[i] > tMs + toleranceMs) continue;
      if (!best || epochs[i] < best.ms) best = stateOf(lines[i], epochs[i], entry);
    }
    return best;
  }

  frame(entry) {
    return { portId: 'reference', typeRef: OEM_TYPE, payload: this.load(entry).bytes };
  }

  dropCache() { this.cache.clear(); }
}

function lowerBound(a, x) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

const stateOf = (l, ms, entry) => ({ ms, epoch: l.EPOCH, r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT], entry });
