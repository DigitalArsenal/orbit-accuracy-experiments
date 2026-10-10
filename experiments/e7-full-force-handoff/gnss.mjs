// GPS block and mass by NORAD number from the IGS satellite metadata SINEX
// (Steigenberger and Montenbruck 2024): SATELLITE/IDENTIFIER (SVN, COSPAR,
// SatCat, block) and SATELLITE/MASS (SVN, validity, kg). Reading only.
import fs from 'node:fs';
import { sha256 } from '../../harness/modules.mjs';

const BOX_WING = { 'GPS-IIR-A': 'GPS_IIR', 'GPS-IIR-B': 'GPS_IIR', 'GPS-IIR-M': 'GPS_IIR_M', 'GPS-IIF': 'GPS_IIF' };
const sinexTime = (t) => {
  const [y, d, s] = t.split(':').map(Number);
  return y === 0 ? Infinity : Date.UTC(y, 0, d) + s * 1000;
};

export function readGpsMetadata(file) {
  const bytes = fs.readFileSync(file);
  const lines = bytes.toString('latin1').split('\n');
  const block = (name) => {
    const a = lines.findIndex((l) => l.startsWith(`+${name}`)), b = lines.findIndex((l) => l.startsWith(`-${name}`));
    return lines.slice(a + 1, b).filter((l) => l.startsWith(' G'));
  };
  const bySatcat = new Map();
  for (const l of block('SATELLITE/IDENTIFIER')) {
    const t = l.trim().split(/\s+/);
    bySatcat.set(Number(t[2]), { svn: t[0], cospar: t[1], block: t[3] });
  }
  const masses = block('SATELLITE/MASS').map((l) => { const t = l.trim().split(/\s+/); return { svn: t[0], from: sinexTime(t[1]), to: sinexTime(t[2]), kg: Number(t[3]) }; });
  return {
    sha256: sha256(bytes),
    // {svn, block, boxWing (PRW GNSS_BLOCK or null), massKg} at time ms, or null.
    at(norad, ms) {
      const id = bySatcat.get(norad);
      if (!id) return null;
      const m = masses.find((x) => x.svn === id.svn && x.from <= ms && ms < x.to);
      return { svn: id.svn, block: id.block, boxWing: BOX_WING[id.block] ?? null, massKg: m?.kg ?? null };
    },
  };
}
