// C2-A4 points 2 and 3 (rulings Q17, Q18): per-object seeds from published areas and masses, written to seeds-R3.json and seeds-R1R2.json
// before any R-class fit. AGOM = A/m x Cr 1.3; B = A/m x Cd 2.2 (R1/R2). A is the published cross-section: a sphere's pi d^2 / 4; where a
// source gives no area, the documented bus dimensions with the arithmetic shown (the face named). GNSS masses from the IGS satellite
// metadata SINEX. Objects with no public dimension retrieved are listed and left out of their class (disclosed). Arithmetic only.
//   node experiments/ffm-covariance-calibration/seeds.mjs
import { frozen, writeReceipt } from './common.mjs';

frozen();
const ILRS = (code) => `https://ilrs.gsfc.nasa.gov/missions/satellite_missions/current_missions/${code}_general.html`;
const IGS = 'IGS satellite metadata SINEX, SATELLITE/MASS (https://files.igs.org/pub/station/general/igs_satellite_metadata.snx; archive copy /opt/data/sdn-archive/hac/igs-metadata/20261009/igs_satellite_metadata.snx)';
const GSC = 'https://www.gsc-europa.eu/support-to-developers/galileo-satellite-metadata';
const IAC = 'https://glonass-iac.ru/en/about_glonass/';
const sphere = (d) => ({ area: Math.PI * d * d / 4, arithmetic: `pi x ${d} m^2 / 4` });
const box = (a, b, face) => ({ area: a * b, arithmetic: `${a} m x ${b} m (${face})` });
const r3 = [
  { name: 'LAGEOS-1', norad: 8820, ...sphere(0.60), mass: 406.965, source: ILRS('lag1'), quoted: 'RRA Diameter: 60 cm; Weight: 406.965 Kg' },
  { name: 'LAGEOS-2', norad: 22195, ...sphere(0.60), mass: 405.38, source: ILRS('lag1'), quoted: 'RRA Diameter: 60 cm; Weight: 405.38 kg' },
  { name: 'LARES-2', norad: 53105, ...sphere(0.424), mass: 297.5, source: ILRS('lrs2'), quoted: 'Satellite Radius: 212 mm; Weight: 297.5 kg' },
  { name: 'Etalon-1', norad: 19751, ...sphere(1.294), mass: 1415, source: ILRS('eta1'), quoted: 'RRA Diameter: 1.294 m; Weight: 1415 kg' },
  { name: 'Etalon-2', norad: 20026, ...sphere(1.294), mass: 1415, source: ILRS('eta1'), quoted: 'RRA Diameter: 1.294 m; Weight: 1415 kg' },
  ...[[40001, 'R855', 'GLO-M+'], [44850, 'R859', 'GLO-M+'], [37869, 'R743', 'GLO-M'], [54377, 'R861', 'GLO-M+']].map(([norad, svn, block]) => ({ name: `GLONASS ${svn} (${block})`, norad, ...box(3.05, 2.71, 'the largest face of the Glonass-M body 2.71 x 3.05 x 2.71 m; solar arrays not documented, not included'), mass: 1415,
    source: `${IAC} (Glonass-M: Mass 1415 kg, Dimensions 2,71x3,05x2,71 m); mass ${IGS} ${svn} 1415.000 kg`, quoted: 'Glonass-M Mass, kg 1415; Dimensions, m 2,71x3,05x2,71' })),
  ...[[43567, 'E220', 'GAL-2', 710.795], [37847, 'E102', 'GAL-1', 695.318], [41862, 'E214', 'GAL-2', 709.755], [41174, 'E209', 'GAL-2', 707.879], [43055, 'E215', 'GAL-2', 708.5], [41175, 'E208', 'GAL-2', 709.135]].map(([norad, svn, block, mass]) => {
    const z = block === 'GAL-1' ? 3.0 : 3.036;
    return { name: `Galileo ${svn} (${block === 'GAL-1' ? 'IOV' : 'FOC'})`, norad, area: 2 * 5.41 + z, arithmetic: `2 solar arrays x 5.41 m^2 (5.000 m x 1.082 m) + the +/-Z box panel ${z} m^2`, mass,
      source: `${GSC} (section 6: each solar array 5.41 m^2; ${block === 'GAL-1' ? 'IOV +/-Z panel 3.00 m^2' : 'FOC +/-Z panel 3.036 m^2'}); mass ${IGS} ${svn} ${mass} kg`, quoted: `solar array 5.41 m^2 (= 5.000 m x 1.082 m); +/-Z panel ${z} m^2` };
  }),
];
const r3Excluded = [[40534, 'G071'], [38833, 'G065'], [39741, 'G067'], [35752, 'G050'], [40294, 'G069'], [32260, 'G055'], [40730, 'G072'], [29601, 'G058']].map(([norad, svn]) => ({ norad, svn,
  reason: 'no public area or bus dimension retrieved: gps.gov/space-segment lists no dimensions; spaceforce.mil and losangeles.spaceforce.mil fact sheets refuse anonymous requests (HTTP 403); the Boeing GPS page (IGS reference MA04) is rendered client-side with no specification text; IGS metadata has masses only (IIF 1633 kg, IIR-M 1080 kg)' }));
const SW = 'https://www.esa.int/Applications/Observing_the_Earth/FutureEO/Swarm/Facts_and_figures';
const S1 = 'https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-1/Facts_and_figures';
const TSX = 'https://www.dlr.de/en/research-and-transfer/projects-and-missions/terrasar-x';
const r12 = [
  ...[['Swarm A', 39452], ['Swarm B', 39451], ['Swarm C', 39453]].map(([name, norad]) => ({ name, norad, ...box(1.5, 0.85, 'width x height: the flight-direction face of the 9.1 m long body'), mass: 473, source: SW, quoted: 'Each satellite is 9.1 m long (including a 4-m deployable boom), 1.5 m wide and 0.85 m high; weighs 473 kg at launch (including 106 kg of Freon propellant)' })),
  ...[['Sentinel-1A', 39634], ['Sentinel-1C', 62261], ['Sentinel-1D', 66315]].map(([name, norad]) => ({ name, norad, ...box(2.5, 4, 'width x height of the body; the 2 x 10 m solar arrays and the 12 m antenna not included (widths not stated)'), mass: 2185, source: S1, quoted: 'Satellite: 21 m long, 2.5 m wide, 4 m high with 2x10 m-long solar arrays and a 12 m-long radar antenna; Mass: 2185 kg' })),
  { name: 'TerraSAR-X', norad: 31698, area: Math.PI * 1.2 * 1.2, arithmetic: 'pi x (2.4 m / 2)^2: the end face of the 4.88 m x 2.4 m body', mass: 1230, source: TSX, quoted: 'Length: 4.88 metres; Diameter: 2.4 metres; Launch mass: 1,230 kilograms' },
  { name: 'Ajisai', norad: 16908, ...sphere(2.15), mass: 685, source: ILRS('ajis'), quoted: 'RRA Diameter: 215 cm; Weight: 685 kg' },
  { name: 'LARES', norad: 38077, ...sphere(0.364), mass: 386.8, source: ILRS('lars'), quoted: 'Satellite Radius: 182 mm; Weight: 386.8 kg' },
  { name: 'LARETS', norad: 27944, ...sphere(0.24), mass: 23.28, source: ILRS('lare'), quoted: 'Satellite Diameter: 24 cm; Weight: 23.28 kg' },
  { name: 'Starlette', norad: 7646, ...sphere(0.24), mass: 47.5, source: ILRS('star'), quoted: 'RRA Diameter: 24 cm; Weight: 47.5 kg' },
  { name: 'Stella', norad: 22824, ...sphere(0.24), mass: 48, source: ILRS('star'), quoted: 'RRA Diameter: 24 cm; Weight: 48 kg' },
  { name: 'WESTPAC', norad: 25398, ...sphere(0.24), mass: 23, source: ILRS('west'), quoted: 'RRA Diameter: 24 cm; Weight: 23 kg' },
];
// C2-A6 (coordinator ruling, the one bounded retry before any R1 fit): GRACE-FO from the Level-1 handbook's macro model, COSMIC-2 from eoPortal.
const GFO = 'https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-docs/gracefo/open/docs/GRACE-FO_L1_Handbook.pdf (GRACE-FO Level-1 Data Product User Handbook, JPL D-56935; PDF SHA-256 b6d27a5bd30615df5087461999782f09480d3347f36dfd8ab2480f62572e0edd), Table 4 and Table 5';
const C2P = 'https://www.eoportal.org/satellite-missions/formosat-7 (Table: spacecraft bus key design features)';
r12.push(
  { name: 'GRACE-FO 1', norad: 43476, area: 0.9551567, arithmetic: 'the Front panel of the macro model (unit normal +X, the flight direction): 0.9551567 m^2', mass: 601.214, source: GFO, quoted: 'Front 0.9551567 m^2 (unit normal +1.0, 0, 0); Mass at Launch FM 1 601.214 kg' },
  { name: 'GRACE-FO 2', norad: 43477, area: 0.9551567, arithmetic: 'the Front panel of the macro model (unit normal +X, the flight direction): 0.9551567 m^2', mass: 601.209, source: GFO, quoted: 'Front 0.9551567 m^2 (unit normal +1.0, 0, 0); Mass at Launch FM 2 601.209 kg' },
  ...[['COSMIC-2 FM1', 44349], ['COSMIC-2 FM2', 44351], ['COSMIC-2 FM4', 44350], ['COSMIC-2 FM5', 44358], ['COSMIC-2 FM6', 44353]].map(([name, norad]) => ({ name, norad, area: 1.25 * 1.25, arithmetic: '1.25 m x 1.25 m: the largest face of the stowed bus 1000 x 1250 x 1250 mm (deployed solar arrays not documented, not included)', mass: 277.8, source: C2P, quoted: 'Spacecraft size (stowed) 1000 mm x 1250 mm x 1250 mm; Launch mass (wet) 277.8 kg' })),
);
const r12Excluded = [];
const seed = (o, withB) => { const am = o.area / o.mass; return { ...o, areaM2: Number(o.area.toPrecision(6)), areaOverMassM2kg: Number(am.toPrecision(6)), agomSeed: Number((am * 1.3).toPrecision(6)), ...(withB ? { bSeed: Number((am * 2.2).toPrecision(6)) } : {}) }; };
console.log(writeReceipt('seeds-R3', { plan: 'C2-A4 point 2 (Q17)', rule: 'AGOM = A/m x Cr 1.3, a priori sigma 100 % of the seed, domain [0, inf)', objects: r3.map((o) => seed(o, false)), excluded: r3Excluded,
  disclosure: 'the 8 GPS satellites of R3 calibration are left out: no public dimension retrieved; GLONASS areas are the documented body only (solar arrays not documented by the IAC page)' }));
console.log(writeReceipt('seeds-R1R2', { plan: 'C2-A4 point 3 (Q18)', rule: 'P0 structure; B = A/m x Cd 2.2, AGOM = A/m x Cr 1.3, a priori sigma 30 % of each seed, both bounded to [0, inf); seeds per object, not Starlink\'s', objects: r12.map((o) => seed(o, true)), excluded: r12Excluded,
  amendment: 'C2-A6: GRACE-FO 1/2 and the 5 COSMIC-2 satellites restored to their registered splits from the bounded retry (the first issue of this receipt, at cacb129, left them out)',
  disclosure: 'GRACE-FO uses the macro model front panel; COSMIC-2 the stowed bus face; the GRACE-FO handbook carries a U.S. export-regulation notice on its technical data (the values used are those it publishes)' }));
