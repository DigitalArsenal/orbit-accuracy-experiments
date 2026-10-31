// Per-object seeds (PLAN.md section 2, C2's chain): C2's receipts seeds-R3.json and seeds-R1R2.json where they list the object; the new GLONASS and Galileo by C2's rule (seeds.mjs, C2-A4 points 2
// and 3): AGOM = A/m x Cr 1.3, B = A/m x Cd 2.2; GLONASS-M the documented body's largest face, 3.05 m x 2.71 m; Galileo the two solar arrays of 5.41 m^2 plus the +/-Z panel, 3.00 m^2 (IOV) or
// 3.036 m^2 (FOC); masses from the IGS satellite metadata SINEX. Arithmetic only.
import fs from 'node:fs';
import path from 'node:path';
import { c2Results } from '../common.mjs';

const toPrecision6 = (x) => Number(x.toPrecision(6));
const SINEX = '/opt/data/sdn-archive/hac/igs-metadata/20261009/igs_satellite_metadata.snx';
function block(text, name) { const m = new RegExp(`\\+${name}[^\\n]*\\n([\\s\\S]*?)-${name}`).exec(text); return (m ? m[1] : '').split('\n').filter((l) => l.trim() && !l.startsWith('*')); }

/** seedOf(norad): { name, norad, areaM2, areaOverMassM2kg, agomSeed, bSeed? }. */
export function openSeeds(opened) {
  const read = (f, label) => (opened ? opened.read(f, label) : fs.readFileSync(f));
  const known = new Map();
  for (const f of ['seeds-R3.json', 'seeds-R1R2.json']) for (const o of JSON.parse(read(path.join(c2Results, f), 'C2 seeds')).objects) if (!known.has(o.norad)) known.set(o.norad, o);
  const text = read(SINEX, 'IGS SINEX').toString();
  const ident = new Map(), mass = new Map();
  for (const l of block(text, 'SATELLITE/IDENTIFIER')) { const t = l.trim().split(/\s+/); if (/^\d+$/.test(t[2])) ident.set(Number(t[2]), { svn: t[0], block: t[3] }); }
  for (const l of block(text, 'SATELLITE/MASS')) { const t = l.trim().split(/\s+/); mass.set(t[0], Number(t[3])); } // the last row of an SVN: its current mass
  return (norad) => {
    if (known.has(norad)) return known.get(norad);
    const id = ident.get(norad);
    if (!id) throw new Error(`no SINEX identity for ${norad}`);
    const m = mass.get(id.svn);
    let area;
    if (id.block === 'GLO-M' || id.block === 'GLO-M+') area = 3.05 * 2.71;
    else if (id.block === 'GAL-1') area = 2 * 5.41 + 3.0;
    else if (id.block === 'GAL-2') area = 2 * 5.41 + 3.036;
    else throw new Error(`no seed rule for ${norad} (${id.svn}, ${id.block})`);
    const am = area / m;
    return { name: `${id.svn} (${id.block})`, norad, area, mass: m, areaM2: toPrecision6(area), areaOverMassM2kg: toPrecision6(am), agomSeed: toPrecision6(am * 1.3) };
  };
}
