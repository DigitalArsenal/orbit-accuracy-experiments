// The test's truth: ESA's reduced-dynamic Swarm SP3 COM as the archive's reference states hold it, read by XM's lib/truth.mjs (each epoch from the newest file, gated) and thinned as XM3 thins it.
import path from 'node:path';
import { config, root } from '../common.mjs';

const T = await import(path.join(root, 'experiments/xp-atmosphere-merit/lib/truth.mjs'));
const objectOf = (norad) => { const o = Object.values(config.test.truth.satellites).find((x) => x.norad === norad); if (!o) throw new Error(`no truth for ${norad}`); return { truth: 'swarm', product: o.product, norad }; };
/** The states of [fromMs, toMs], about 300 s apart: [{epoch, r, v}] GCRF km, km/s. */
export const series = (norad, fromMs, toMs) => T.thinned(T.series(objectOf(norad), fromMs, toMs).lines).chosen;
