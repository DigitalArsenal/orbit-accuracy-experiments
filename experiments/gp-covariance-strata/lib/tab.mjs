// Row table for one regime from the column cache.
import { REGIMES, BINS } from './bins.mjs';
import { loadRows } from './data.mjs';
import { half } from './stats.mjs';
export async function regimeTables(dirs) {
  const d = await loadRows(dirs);
  const n = d.norad.length;
  const tabs = {};
  for (let r = 0; r < REGIMES.length; r++) {
    const ids = []; for (let i = 0; i < n; i++) if (d.regime[i] === r) ids.push(i);
    const m = ids.length;
    const tab = { regime: REGIMES[r], n: m, e: new Float64Array(3 * m), age: new Float64Array(m), b: new Uint8Array(m), cluster: new Int32Array(m), t: new Float64Array(m), norad: new Int32Array(m), setMs: new Float64Array(m), half: new Uint8Array(m), clusterNames: d.clusterNames, byBin: BINS.map(() => []), byCluster: new Map() };
    ids.forEach((g, i) => {
      tab.e[3 * i] = d.eR[g]; tab.e[3 * i + 1] = d.eT[g]; tab.e[3 * i + 2] = d.eN[g];
      tab.age[i] = d.age[g]; tab.b[i] = d.b[g]; tab.cluster[i] = d.cluster[g]; tab.t[i] = d.t[g]; tab.norad[i] = d.norad[g]; tab.setMs[i] = d.setMs[g];
      tab.half[i] = half(d.b[g], d.age[g]);
      tab.byBin[d.b[g]].push(i);
      (tab.byCluster.get(d.cluster[g]) ?? tab.byCluster.set(d.cluster[g], []).get(d.cluster[g])).push(i);
    });
    tabs[REGIMES[r]] = tab;
  }
  return tabs;
}
