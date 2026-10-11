// LEO-POD and SLR truth (PLAN.md section 3, amendment A3): precise orbits converted by analysis/reference-states (E3's and
// E14's conversions, and E15's own under the store), one directory per product with index.json and one size-prefixed $OEM
// per object (GCRF, UTC). Published with a lag of days to weeks; a target is scored when a product holds it, and rescored
// when more objects' products appear. Amendment A4: the product with the latest start at or before the target.
//   LEO-POD: Sentinel-1 POEORB, Swarm reduced-dynamic, GRACE-FO rapid science orbits, Sentinel-3 and -6 DORIS orbits.
//   SLR: the ILRS combination's weekly arcs and NSGF's 4-day arcs of the SLR targets.
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '../../settings.mjs';
import { config } from '../windows.mjs';
import { isoZ, itemOf, sha256 } from './common.mjs';

const PREFIXES = {
  'LEO-POD': ['S1A_OPER_AUX_POEORB', 'S1C_OPER_AUX_POEORB', 'S1D_OPER_AUX_POEORB', 'SW_OPER_SP3', 'GFZOP_RSO', 'ssas3a', 'ssas3b', 'ssas6a', 'ssas6b'],
  SLR: ['ilrsa.orb.', 'nsgf.orb.'],
};

// norad -> [{root, product, file, startMs, stopMs, objectId, name}] for the regime's products under every reference root.
function index(regime) {
  const byNorad = new Map();
  for (const root of PATHS.reference.filter((r) => fs.existsSync(r))) {
    for (const product of fs.readdirSync(root).filter((n) => PREFIXES[regime].some((p) => n.startsWith(p)))) {
      const file = path.join(root, product, 'index.json');
      if (!fs.existsSync(file)) continue;
      const idx = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const o of idx.objects ?? []) {
        if (!byNorad.has(o.norad)) byNorad.set(o.norad, []);
        byNorad.get(o.norad).push({ root, product, file: path.join(root, product, o.file), startMs: Date.parse(/Z$/.test(o.start) ? o.start : `${o.start}Z`), stopMs: Date.parse(/Z$/.test(o.stop) ? o.stop : `${o.stop}Z`), objectId: o.objectId, name: o.name ?? o.comment ?? null, url: idx.url ?? null });
      }
    }
  }
  return byNorad;
}

function source(id, regime) {
  return {
    id, regime, live: false, growing: true,
    async acquire({ log, targetMs }) {
      const tolMs = config.targetToleranceSeconds * 1000;
      const byNorad = index(regime);
      const items = [];
      const coverage = { truth: id, regime, targetUtc: isoZ(targetMs), objects: byNorad.size, items: 0, missing: 0, products: [] };
      for (const [norad, spans] of byNorad) {
        const holding = spans.filter((s) => s.startMs <= targetMs && s.stopMs >= targetMs).sort((a, b) => b.startMs - a.startMs);
        if (!holding.length) continue;
        const s = holding[0];
        const bytes = fs.readFileSync(s.file);
        items.push(itemOf({ norad, regime, oem: bytes, name: s.objectId ?? String(norad), targetMs, truth: { source: id, version: s.product, url: s.url, startUtc: isoZ(s.startMs), publishedUtc: null, sha256: sha256(bytes), file: path.relative('/opt/data/sdn-archive', s.file) } }));
        coverage.products.push(s.product);
      }
      coverage.items = items.filter((x) => !x.missing).length;
      coverage.missing = items.filter((x) => x.missing).length;
      coverage.products = [...new Set(coverage.products)];
      log(`${id} ${coverage.targetUtc}: ${coverage.items} objects with truth (${coverage.products.length} products)`);
      // Rescored whenever more objects' products appear (the runner compares the item counts).
      return { items, coverage, ready: items.length > 0, growing: true };
    },
  };
}

export const podTruth = source('pod', 'LEO-POD');
export const slrTruth = source('slr', 'SLR');
