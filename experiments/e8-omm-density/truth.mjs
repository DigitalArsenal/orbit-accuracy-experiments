// Precise orbits for E8's propagation targets: E3's reader of converted
// reference states (analysis/reference-states output) over every configured
// directory, each target restricted to its own products (name prefixes) and,
// where configured, to products stating at most maximumStatedSigmaM. The
// state nearest a time within the target's tolerance. Reading only.
import { Products } from '../e3-combined-catalog/truth.mjs';
import { config, inRepo } from './common.mjs';

export class Truth {
  constructor() {
    const targets = config.propagation.targets;
    const prefixes = [...new Set(Object.values(targets).flatMap((t) => t.truthPrefixes))];
    this.sets = config.inputs.reference.map((dir) => new Products(inRepo(dir), prefixes));
    for (const products of this.sets) {
      for (const [norad, entries] of products.byObject) {
        const t = targets[String(norad)];
        products.byObject.set(norad, t ? entries.filter((e) => t.truthPrefixes.some((p) => e.product.startsWith(p))
          && (t.maximumStatedSigmaM === undefined || (e.statedSigmaM !== null && e.statedSigmaM <= t.maximumStatedSigmaM))) : []);
      }
    }
  }
  // The state nearest tMs within the target's tolerance, or null.
  nearest(norad, tMs) {
    const tol = config.propagation.targets[String(norad)].toleranceSeconds * 1000;
    let best = null;
    for (const products of this.sets) {
      const s = products.firstAtOrAfter(norad, tMs - tol, 2 * tol);
      if (s && Math.abs(s.ms - tMs) <= tol && (!best || Math.abs(s.ms - tMs) < Math.abs(best.ms - tMs))) best = s;
    }
    return best;
  }
  read() { return Object.assign({}, ...this.sets.map((p) => p.read)); }
  dropCache() { for (const p of this.sets) p.dropCache(); }
}
