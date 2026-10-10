// Step 04 (development): the maneuver screen and the attribution on a
// synthetic LEO file with a known impulse. A 2-day HPOP truth gets a 5 cm/s
// along-track impulse at 30 h; the screen must flag the window holding it and
// return the first clean day; the attribution of the default fit on that day
// is printed. Synthetic only.
import { modulesRoot } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';
import { loadEnvironment, isoOf } from '../environment.mjs';
import { DEFAULT } from '../hypothesis.mjs';
import { propagate } from '../fit.mjs';
import { prepare, screen, chunkOf, defaultOf, scoreWithFingerprint } from '../segment.mjs';
import { attribute } from '../attribution.mjs';

const env = await loadEnvironment({ modulesDir: modulesRoot({ configured: config.inputs.modules, repoRoot }), config });
const settings = { ...config.fit, gauntlet: config.gauntlet };
const e = Date.parse('2026-06-10T00:00:00Z'), state = [6778137, 0, 0, 0, 4790.0, 5995.0];
const truth = { ...DEFAULT, atmosphere: 'NRLMSISE00', spaceWeather: 'OBSERVED', degree: 36 };
const c = { b: 0.012, agom: 0.008 }, integrator = { tolerance: 1e-13, maxStep: 30 };
const at = (k) => isoOf(e + k * 60000);
const a = await propagate(env, truth, { cutoffMs: e }, { epoch: isoOf(e), state }, c, Array.from({ length: 1800 }, (_, k) => at(k + 1)), { integrator });
const s30 = a.at(-1).state, v = s30.slice(3), n = Math.hypot(...v);
const kicked = [...s30.slice(0, 3), ...v.map((x) => x + 0.05 * x / n)];
const b = await propagate(env, truth, { cutoffMs: e }, { epoch: at(1800), state: kicked }, c, Array.from({ length: 1080 }, (_, k) => at(1800 + k + 1)), { integrator });
const points = [{ epoch: isoOf(e), position: state.slice(0, 3), velocity: state.slice(3) }, ...[...a, ...b].map((s, k) => ({ epoch: at(k + 1), position: s.state.slice(0, 3), velocity: s.state.slice(3) }))];
const seg = { ...prepare({ id: 'screen-check', label: { frame: 'EME2000', timeScale: 'UTC' }, points, cutoffMs: e }, settings), observedWeather: true };
const r = await screen(env, seg, settings, config.operators, { limit: 2 });
for (const w of r.windows) console.log(w.from, w.rmsM?.toExponential(2), w.flag ?? '');
console.log('chunks', r.chunks.map((x) => [isoOf(x.fromMs), isoOf(x.toMs)]));
const first = { ...chunkOf(seg, r.chunks[0]), observedWeather: true };
const def = await scoreWithFingerprint(env, { ...defaultOf(first), spaceWeather: 'CONSTANT' }, first, settings);
console.log('default(CONSTANT weather) closure', def.scores.closureRms.toExponential(2), JSON.stringify(attribute(def.fingerprint.named, def.scores, { positionM: 1e-6 })));
await env.destroy();
