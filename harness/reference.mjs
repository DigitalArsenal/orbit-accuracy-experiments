// Reference states written by analysis/reference-states: one directory per
// precise-orbit product, an index.json, and one $OEM file per object.
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './modules.mjs';
import { OEM_TYPE } from './records.mjs';

// The sampling interval in a product's long name (IGS0OPSFIN_..._15M_ORB:
// 900 s), or null.
export function productStepSeconds(product) {
  const m = /_(\d{2})([SMHD])_ORB/.exec(product);
  return m ? Number(m[1]) * { S: 1, M: 60, H: 3600, D: 86400 }[m[2]] : null;
}

export class ReferenceIndex {
  // dir: the converted reference root; prefix: product name prefix
  // (IGS0OPSFIN) or several. `system`: keep only satellites of one GNSS
  // constellation, by the SP3 identifier each object's index entry names
  // ('G' for GPS).
  constructor(dir, prefix, { system } = {}) {
    this.dir = dir;
    this.products = [];
    this.byObject = new Map();  // norad -> [{start, stop, file, product, objectId, stepSeconds}]
    const prefixes = [prefix].flat();
    for (const product of fs.readdirSync(dir).filter((n) => prefixes.some((p) => n.startsWith(p))).sort()) {
      const indexFile = path.join(dir, product, 'index.json');
      if (!fs.existsSync(indexFile)) continue;
      const raw = fs.readFileSync(indexFile);
      const index = JSON.parse(raw);
      this.products.push({ product, source: index.product, url: index.url, sha256: index.sha256, identitiesSha256: index.identitiesSha256, indexSha256: sha256(raw) });
      const stepSeconds = productStepSeconds(product);
      for (const o of index.objects) {
        if (system && !new RegExp(`SP3 satellite ${system}\\d`).test(o.comment ?? '')) continue;
        if (!this.byObject.has(o.norad)) this.byObject.set(o.norad, []);
        this.byObject.get(o.norad).push({ start: Date.parse(o.start), stop: Date.parse(o.stop), file: path.join(product, o.file), product, objectId: o.objectId, stepSeconds });
      }
    }
    for (const list of this.byObject.values()) list.sort((a, b) => a.start - b.start);
    this.cache = new Map();
    this.read = {};  // relative file -> SHA-256 of every reference file used
  }

  objects() { return [...this.byObject.keys()].sort((a, b) => a - b); }

  // Product days that cover [fromMs, toMs] for one object, in time order.
  spans(norad, fromMs, toMs) {
    return (this.byObject.get(norad) ?? []).filter((s) => s.stop >= fromMs && s.start <= toMs);
  }

  // The sampling interval of the product that holds the object at `ms`
  // (null when none does).
  stepAt(norad, ms) {
    return (this.byObject.get(norad) ?? []).find((s) => s.start <= ms && ms <= s.stop)?.stepSeconds ?? null;
  }

  // $OEM frames on the `reference` port for one object over [fromMs, toMs].
  frames(norad, fromMs, toMs) {
    return this.spans(norad, fromMs, toMs).map((s) => {
      if (!this.cache.has(s.file)) {
        const bytes = fs.readFileSync(path.join(this.dir, s.file));
        this.cache.set(s.file, bytes);
        this.read[s.file] = sha256(bytes);
      }
      return { portId: 'reference', typeRef: OEM_TYPE, payload: this.cache.get(s.file) };
    });
  }

  dropCache() { this.cache.clear(); }
}

// Every object block whose span starts in [fromMs, toMs), across all products,
// in product-name then index order: the selection analysis/gp-error-model's
// own scripts make (scripts/archive.mjs `referenceStates`).
export function referenceFramesStartingIn(dir, fromMs, toMs) {
  const frames = [];
  const objects = new Set();
  const read = {};
  for (const product of fs.readdirSync(dir).sort()) {
    const indexFile = path.join(dir, product, 'index.json');
    if (!fs.existsSync(indexFile)) continue;
    for (const o of JSON.parse(fs.readFileSync(indexFile)).objects) {
      const start = Date.parse(o.start);
      if (!(start >= fromMs && start < toMs)) continue;
      const file = path.join(product, o.file);
      const bytes = fs.readFileSync(path.join(dir, file));
      read[file] = sha256(bytes);
      frames.push({ portId: 'reference', typeRef: OEM_TYPE, payload: bytes });
      objects.add(o.norad);
    }
  }
  return { frames, objects, read };
}
