// The truth of a window, read the way G1 read it for that source (PLAN.md, Windows): G1's own readers and parameters, nothing fetched.
import fs from 'node:fs';
import path from 'node:path';
import { config, g1Dir } from '../common.mjs';

const G1 = config.g1.store;
const lib = (name) => import(path.join(g1Dir, 'lib', name));
const [sources, spk, packs, win, g1common] = await Promise.all([lib('sources.mjs'), lib('spk-sources.mjs'), lib('packs.mjs'), lib('windows.mjs'), import(path.join(g1Dir, 'common.mjs'))]);
const P = g1common.config.precise;

/** A loader that builds each source's objects once: get(window) -> the ephemeris object ({ lines, t, frame, ... }) or, for a pack, { pack, loaded }. */
export function truthLoader({ modules, containers, time }) {
  const cache = new Map();
  const objectsOf = async (source) => {
    if (cache.has(source)) return cache.get(source);
    let list;
    switch (source) {
      case 'iss': list = sources.iss(); break;
      case 'gnss': list = sources.gnss(P.gnss); break;
      case 'mgex-geo': list = sources.mgex({ klass: 'geo', ...sources.MGEX_A4 }); break;
      case 'mgex-igso': list = sources.mgex({ klass: 'igso', ...sources.MGEX_A4 }); break;
      case 'gnss-rapid': list = sources.gnssRapid(); break;
      case 'mgex-geo-rapid': list = sources.mgexRapid({ klass: 'geo' }); break;
      case 'mgex-igso-rapid': list = sources.mgexRapid({ klass: 'igso' }); break;
      case 'slr-high': list = P.slrHigh.targets.flatMap((target) => sources.slrHigh({ target, weeks: P.slrHigh.weeks })); break;
      case 'slr-low': list = P.slrLow.targets.flatMap((target) => sources.slrLow({ target, arcs: P.slrLow.arcs })); break;
      case 'slr-low-current': list = P.slrLow.targets.flatMap((target) => sources.slrLowCurrent({ target })); break;
      case 'slr-high-current': list = P.slrHigh.targets.flatMap((target) => sources.slrHighCurrent({ target })); break;
      case 'heo-themis': {
        const file = (letter) => path.join(spk.KERNELS(g1common.config.archive), `themis/THEMIS_${letter}_2013_039_055.bsp`);
        list = [];
        for (const [letter, target] of spk.A5.themis.objects) list.push(await spk.spkObject(modules, { file: file(letter), source: 'heo-themis', id: `THEMIS-${letter} (${target})`, name: `THEMIS-${letter}`, norad: 99000 - target, fromUtc: spk.A5.themis.span[0], toUtc: spk.A5.themis.span[1], containers, time }));
        break;
      }
      case 'heo-chandra':
        list = [await spk.spkObject(modules, { file: path.join(spk.KERNELS(g1common.config.archive), 'chandra/chandra_merged.bsp'), source: 'heo-chandra', id: 'Chandra (-151)', name: 'CHANDRA', norad: 99151, fromUtc: spk.A5.chandra.span[0], toUtc: spk.A5.chandra.span[1], containers, time })];
        break;
      case 'heo-tess': {
        const dir = path.join(g1common.config.archive, 'hac/mast-tess/models');
        const names = fs.readdirSync(dir).filter((f) => /^TESS_EPH_DEF_\d{7}_\d+\.bsp$/.test(f)).sort();
        list = [await spk.spkObjectSeries(modules, { files: names.map((f) => path.join(dir, f)), source: 'heo-tess', id: 'TESS (-95)', name: 'TESS', norad: spk.A8.tess.norad, fromUtc: spk.A8.tess.span[0], toUtc: spk.A8.tess.span[1], stride: spk.A8.tess.stride, containers, time })];
        break;
      }
      default: throw new Error(`no truth reader for source ${source}`);
    }
    const byId = new Map(list.map((o) => [o.id, o]));
    cache.set(source, byId);
    return byId;
  };
  return {
    async get(w) {
      if (w.source === 'starlink-ffm') { // G1's FFM-1 truth file (starlink-sdngp.mjs)
        const meta = JSON.parse(fs.readFileSync(path.join(G1, 'truth', `${w.norad}.json`)));
        const flat = new Float64Array(new Uint8Array(fs.readFileSync(path.join(G1, 'truth', `${w.norad}.f64`))).buffer);
        const t0 = win.ms(meta.truth.epochUtc), cadence = g1common.config.truth.cadenceSeconds * 1000;
        const object = win.withT({ source: 'starlink-ffm', id: `STARLINK (${w.norad})`, norad: w.norad, name: `STARLINK-${w.norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
          lines: Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: win.iso(t0 + i * cadence), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
        return { object, meta };
      }
      if (w.center !== 'EARTH') {
        if (!cache.has(`pack:${w.source}`)) cache.set(`pack:${w.source}`, packs.readPack(w.source));
        return { pack: w.source, loaded: cache.get(`pack:${w.source}`) };
      }
      const object = (await objectsOf(w.source)).get(w.id);
      if (!object) throw new Error(`no truth object ${w.source} ${w.id}`);
      return { object };
    },
  };
}
