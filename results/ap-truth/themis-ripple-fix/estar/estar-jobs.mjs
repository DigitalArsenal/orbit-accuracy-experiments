// Writes the Amendment 12 case list, one line per case: label|n|e|i
import fs from 'node:fs';
const R = [['Starlette', 13.82, 49.8], ['Ajisai', 12.44, 50.0], ['LARES', 12.55, 69.5], ['Jason-3', 12.81, 66.0], ['Sentinel-3', 14.27, 98.6],
  ['CryoSat-2', 14.52, 92.0], ['LAGEOS-1', 6.39, 109.8], ['LAGEOS-2', 6.47, 52.6], ['Etalon', 2.13, 64.9], ['GPS', 2.005, 55.0], ['Galileo', 1.70, 56.0],
  ['GLONASS', 2.13, 64.8], ['IGSO', 1.0027, 55.0], ['QZSS', 1.0027, 40.0], ['GEO', 1.0027, 0.1], ['Molniya', 2.006, 63.4], ['GTO', 2.40, 27.0]];
const E = [0.001, 0.003, 0.01, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3];
fs.writeFileSync(process.argv[2], R.flatMap(([name, n, i]) => E.map((e) => `${name}|${n}|${e}|${i}`)).join('\n') + '\n');
