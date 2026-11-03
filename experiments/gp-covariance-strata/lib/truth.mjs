// Truth objects from the converted reference-state roots. nsgf.* product directories are never listed or opened.
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../../../harness/modules.mjs';
import { gateOemFrame } from '../../../harness/truth-gate.mjs';
import { assertPathLawful, heldPredicate, admit } from './holds.mjs';

export const ROOTS = {
  reference: '/opt/data/sdn-archive/reference-states/reference',
  gfz: '/opt/data/sdn-archive/e14-covariance-realism/reference',
};
// Product-directory prefixes read (everything else, nsgf and IGS subsets included, is not listed).
const PREFIX = /^(SW_OPER_SP3[ABC]COM|S1[AC]_OPER_AUX|ESA0OPSFIN|ilrsa\.|GFZOP_RSO_L6[45]|ssa)/;
const STEP = { ESA0OPSFIN: 300 };

export function loadTruthIndex({ roots = Object.values(ROOTS), audit }) {
  const byObject = new Map();
  const inputs = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const product of fs.readdirSync(root).sort()) {
      if (!PREFIX.test(product)) continue;
      const dir = assertPathLawful(path.join(root, product));
      const f = path.join(dir, 'index.json');
      if (!fs.existsSync(f)) continue;
      const ix = JSON.parse(fs.readFileSync(f, 'utf8'));
      inputs.push(path.relative('/', f));
      for (const o of ix.objects) {
        const sp3 = /SP3 satellite (\w\d\d)/.exec(o.comment ?? '')?.[1] ?? null;
        const gnss = /^ESA0OPSFIN/.test(product);
        const start = Date.parse(o.start), stop = Date.parse(o.stop);
        const stepSeconds = /^ESA0OPSFIN/.test(product) ? 300 : (o.epochs > 1 ? Math.round((stop - start) / 1000 / (o.epochs - 1)) : null);
        // The whole object is dropped when its identity is held (Galileo PRN, held object); time holds apply per target.
        if (audit && !admit(audit, { norad: o.norad, sp3, gnss: false })) continue;
        const list = byObject.get(o.norad) ?? [];
        list.push({ root, product, file: path.join(product, o.file), start, stop, stepSeconds, sp3, gnss, sigmaM: ix.statedSigmaM ?? null });
        byObject.set(o.norad, list);
      }
    }
  }
  for (const l of byObject.values()) l.sort((a, b) => a.start - b.start);
  return { byObject, inputs };
}

export class FrameReader {
  constructor() { this.read = {}; this.cache = new Map(); }
  frame(span) {
    const file = assertPathLawful(path.join(span.root, span.file));
    if (!this.cache.has(file)) {
      const bytes = fs.readFileSync(file);
      this.read[path.relative('/', file)] = sha256(bytes);
      this.cache.set(file, gateOemFrame(bytes, { product: span.product }).bytes);
      if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
    }
    return { portId: 'reference', typeRef: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' }, payload: this.cache.get(file) };
  }
}
