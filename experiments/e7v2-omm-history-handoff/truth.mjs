// Truth and pseudo-truth for E7v2 (PLAN.md section 8), both behind E3's
// `Products` interface so E7's scorers read either: entries(norad), load,
// stateAt, firstAtOrAfter, frame, dropCache, read.
//
// - MultiProducts: analysis/reference-states output in several directories
//   (EOP C04 conversions, finals2000A conversions after C04 ends, and the
//   LEO-POD conversions). An entry is tagged with its directory, so two
//   conversions of one product never stand in for each other; on equal
//   epochs the earlier directory wins.
// - PseudoTruth: an object's later OMMs as reference states, each the OMM's
//   epoch state from analysis/epoch-state (SGP4 at zero elapsed time, TEME to
//   GCRF), framed as one $OEM. Framing only: every state is the module's.
import fs from 'node:fs';
import path from 'node:path';
import * as flatbuffers from 'flatbuffers';
import * as OEMS from 'spacedatastandards.org/lib/js/OEM/main.js';
import { decodeOemStream, mpeFrame, OEM_TYPE } from '../../harness/records.mjs';
import { Products } from '../e3-combined-catalog/truth.mjs';
import { unixSeconds } from '../e2-catalog-covariance/product.mjs';

export class MultiProducts {
  constructor(dirs, prefixes, options = {}) {
    this.dirs = dirs.filter((d) => fs.existsSync(d));
    this.parts = this.dirs.map((d) => new Products(d, prefixes, options));
  }
  get products() { return this.parts.flatMap((p) => p.products); }
  get read() {
    const out = {};
    this.parts.forEach((p, k) => { for (const [f, h] of Object.entries(p.read)) out[`${path.basename(this.dirs[k])}/${f}`] = h; });
    return out;
  }
  objects() { return [...new Set(this.parts.flatMap((p) => p.objects()))].sort((a, b) => a - b); }
  entries(norad) { return this.parts.flatMap((p, k) => p.entries(norad).map((e) => this.#tag(e, k))); }
  #tag(e, k) { return { ...e, part: k, local: e.file, file: `${k}/${e.file}` }; }
  #local(entry) { return { ...entry, file: entry.local }; }
  load(entry) { return this.parts[entry.part].load(this.#local(entry)); }
  stateAt(entry, tMs) {
    const s = this.parts[entry.part].stateAt(this.#local(entry), tMs);
    return s ? { ...s, entry } : null;
  }
  firstAtOrAfter(norad, tMs, toleranceMs) {
    let best = null;
    this.parts.forEach((p, k) => {
      const s = p.firstAtOrAfter(norad, tMs, toleranceMs);
      if (s && (!best || s.ms < best.ms)) best = { ...s, entry: this.#tag(s.entry, k) };
    });
    return best;
  }
  frame(entry) { return this.parts[entry.part].frame(this.#local(entry)); }
  dropCache() { for (const p of this.parts) p.dropCache(); }
}

const isoMs = (iso) => Date.parse(/[zZ]$/.test(iso) ? iso : `${iso}Z`);

// One object's OMMs (epoch order) as pseudo-truth. prepare() derives every
// epoch state in one analysis/epoch-state call; an OMM the module refuses is
// absent.
export class PseudoTruth {
  constructor(epochState) {
    this.epochState = epochState;
    this.byObject = new Map();  // norad -> {entry, bytes, lines, epochs, gpIds}
    this.read = {};
  }

  async prepare(norad, sets) {
    if (this.byObject.has(norad)) return this.byObject.get(norad);
    const records = sets.map((s) => ({ entityId: `NORAD:${norad}`, epochUnix: unixSeconds(s.epoch), ...s.elements }));
    const response = await this.epochState.invoke('derive', [mpeFrame(records)]);
    const report = JSON.parse(Buffer.from(response.outputs.find((f) => f.portId === 'report').payload).toString('utf8'));
    const refused = new Set((report.refused ?? report.failures ?? []).map((r) => r.index));
    const oems = decodeOemStream(new Uint8Array(response.outputs.find((f) => f.portId === 'states').payload));
    if (oems.length !== sets.length - refused.size) throw new Error('analysis/epoch-state: state count does not match its report');
    const kept = sets.filter((_, i) => !refused.has(i));
    const lines = oems.map((o) => o.EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0]);
    const order = lines.map((_, i) => i).sort((a, b) => isoMs(lines[a].EPOCH) - isoMs(lines[b].EPOCH));
    const template = oems[0];
    const block = template.EPHEMERIS_DATA_BLOCK[0];
    const sorted = order.map((i) => lines[i]);
    const oem = Object.assign(Object.create(Object.getPrototypeOf(template)), template, {
      EPHEMERIS_DATA_BLOCK: [Object.assign(Object.create(Object.getPrototypeOf(block)), block, {
        EPHEMERIS_DATA_LINES: sorted, COVARIANCE_MATRIX_LINES: [], START_TIME: sorted[0].EPOCH, STOP_TIME: sorted.at(-1).EPOCH,
        COMMENT: `pseudo-truth: epoch states of ${sorted.length} OMMs of NORAD ${norad}`,
      })],
    });
    const b = new flatbuffers.Builder(1 << 16);
    OEMS.OEM.finishSizePrefixedOEMBuffer(b, oem.pack(b));
    const bytes = b.asUint8Array().slice();
    const epochs = Float64Array.from(sorted.map((l) => isoMs(l.EPOCH)));
    const entry = { product: 'pseudo-truth', file: `pseudo/${norad}`, norad, start: epochs[0], stop: epochs.at(-1), comment: 'OMM epoch states', statedSigmaM: null };
    const value = { entry, bytes, lines: sorted, epochs, gpIds: order.map((i) => kept[i].gpId), template };
    this.byObject.set(norad, value);
    return value;
  }

  #object(norad) {
    const o = this.byObject.get(norad);
    if (!o) throw new Error(`pseudo-truth for ${norad} not prepared`);
    return o;
  }
  objects() { return [...this.byObject.keys()].sort((a, b) => a - b); }
  entries(norad) { return this.byObject.has(norad) ? [this.byObject.get(norad).entry] : []; }
  load(entry) { const o = this.#object(entry.norad); return { bytes: o.bytes, lines: o.lines, epochs: o.epochs }; }
  stateAt(entry, tMs) {
    const o = this.#object(entry.norad);
    const i = o.epochs.findIndex((t) => Math.abs(t - tMs) <= 1);
    return i < 0 ? null : this.#state(o, i);
  }
  firstAtOrAfter(norad, tMs, toleranceMs) {
    const o = this.byObject.get(norad);
    if (!o) return null;
    const i = o.epochs.findIndex((t) => t >= tMs);
    if (i < 0 || o.epochs[i] > tMs + toleranceMs) return null;
    return this.#state(o, i);
  }
  #state(o, i) {
    const l = o.lines[i];
    return { ms: o.epochs[i], epoch: l.EPOCH, r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT], entry: o.entry, gpId: o.gpIds[i] };
  }
  frame(entry) { return { portId: 'reference', typeRef: OEM_TYPE, payload: this.#object(entry.norad).bytes }; }
  // The OEM header an object's maneuver blocks are framed with.
  template(norad) { return this.#object(norad).template; }
  dropCache() {}
}

// Truth for each truth-rich class and its objects: {cls: {products, objects}}.
// Objects: the class's listed ones that have truth, or every object whose
// truth entries name one of the class's SP3 satellite systems.
export function truthClasses(references, names, classes) {
  const out = {};
  for (const name of names) {
    const c = classes[name];
    if (c.kind !== 'truth' || !c.truthPrefixes.length) continue;
    const products = new MultiProducts(references, c.truthPrefixes, { maxStatedSigmaM: c.maximumStatedSigmaM ?? Infinity });
    const objects = c.objects && Object.keys(c.objects).length
      ? Object.keys(c.objects).map(Number).filter((n) => products.entries(n).length)
      : products.objects().filter((n) => products.entries(n).some((e) => (c.select ?? []).some((s) => e.comment.includes(s))));
    out[name] = { products, objects: objects.sort((a, b) => a - b) };
  }
  return out;
}
