// Clusters of independent error (PLAN.md 1.5, V4): objects that share an orbit plane or a mission family share error.
// Hand-assigned for payload families; GNSS planes from the element sets' ascending node (the plane gap rule below).
export const FIXED = {
  39452: 'swarm-AC', 39453: 'swarm-AC', 39451: 'swarm-B',
  43476: 'gracefo', 43477: 'gracefo',
  39634: 's1', 62261: 's1',
  36508: 'cryosat2', 39086: 'saral',
  41335: 's3', 43437: 's3', 46469: 'hy2c', 48621: 'hy2d', 54754: 'swot', 41240: 'jason-s6', 46984: 'jason-s6', 66514: 'jason-s6',
  22195: 'lageos2', 19751: 'etalon', 20026: 'etalon',
};
// planes: [{norad, sys, raan, inc}] -> Map norad -> 'G-1'... ; objects of one system within 12 deg of inclination class and
// sorted ascending node split where the gap exceeds 20 deg.
export function gnssClusters(items) {
  const out = new Map();
  const bySys = new Map();
  for (const it of items) (bySys.get(it.sys) ?? bySys.set(it.sys, []).get(it.sys)).push(it);
  for (const [sys, list] of bySys) {
    const classes = new Map();
    for (const it of list) { const k = Math.round(it.inc / 10); (classes.get(k) ?? classes.set(k, []).get(k)).push(it); }
    for (const [k, items2] of classes) {
      items2.sort((a, b) => a.raan - b.raan);
      let plane = 0, prev = null;
      for (const it of items2) {
        if (prev !== null && it.raan - prev > 20) ++plane;
        out.set(it.norad, `${sys}${k}-${plane}`);
        prev = it.raan;
      }
      // the ring wraps: first and last planes closer than the gap join
      const first = items2[0], last = items2[items2.length - 1];
      if (plane > 0 && (first.raan + 360 - last.raan) <= 20) { const a = out.get(last.norad); for (const it of items2) if (out.get(it.norad) === a) out.set(it.norad, out.get(first.norad)); }
    }
  }
  return out;
}
