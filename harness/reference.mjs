// Reference states written by analysis/reference-states: one directory per
// precise-orbit product, an index.json, and one $OEM file per object.
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './modules.mjs';
import { OEM_TYPE } from './records.mjs';

export class ReferenceIndex {
  // dir: the converted reference root; prefix: product name prefix (IGS0OPSFIN).
  constructor(dir, prefix) {
    this.dir = dir;
    this.products = [];
    this.byObject = new Map();  // norad -> [{start, stop, file, product, objectId}]
    for (const product of fs.readdirSync(dir).filter((n) => n.startsWith(prefix)).sort()) {
      const indexFile = path.join(dir, product, 'index.json');
      if (!fs.existsSync(indexFile)) continue;
      const raw = fs.readFileSync(indexFile);
      const index = JSON.parse(raw);
      this.products.push({ product, source: index.product, url: index.url, sha256: index.sha256, identitiesSha256: index.identitiesSha256, indexSha256: sha256(raw) });
      for (const o of index.objects) {
        if (!this.byObject.has(o.norad)) this.byObject.set(o.norad, []);
        this.byObject.get(o.norad).push({ start: Date.parse(o.start), stop: Date.parse(o.stop), file: path.join(product, o.file), product, objectId: o.objectId });
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
