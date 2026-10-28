import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './lib.mjs';

export async function corpus(root) {
  const { elementsOf, tleLines } = await import(pathToFileURL(path.join(root, 'propagator/sdn-ap/test/lib/tle.mjs')));
  const regimes = [['LEO', 15, .001, 51.6], ['SSO', 14.4, .001, 98], ['MEO', 2, .01, 55], ['GEO', 1.0027, .001, 5], ['HEO', 2, .65, 63.4]];
  const cases = Array.from({ length: config.xp.objects }, (_, i) => {
    const [regime, mm, ecc, inc] = regimes[i % regimes.length];
    return { regime, lines: tleLines({ satnum: 10000 + i, year: 26, day: 100.5, type: 4,
      bterm: i % 5 < 2 ? .01 : .0001, agom: .01, inc, raan: (i * 137.5) % 360,
      ecc, argp: (i * 83.7) % 360, ma: (i * 41.9) % 360, mm, rev: 0 }) };
  });
  return { cases, lines: cases.map((c) => c.lines), sets: cases.map((c) => elementsOf(c.lines)) };
}

export function queryTimes(direction) {
  let seed = config.xp.seed >>> 0;
  const times = Array.from({ length: config.xp.queries }, (_, i) => {
    const t = i * config.xp.durationMinutes / (config.xp.queries - 1);
    return direction === 'forward' ? t : direction === 'backward' ? -t : t - config.xp.durationMinutes / 2;
  });
  for (let i = times.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1); [times[i], times[j]] = [times[j], times[i]];
  }
  return times;
}
