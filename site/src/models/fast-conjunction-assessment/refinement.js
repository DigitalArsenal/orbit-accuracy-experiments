// Section 3, refinement: the closest approach of a screened pair, refined
// by assess_conjunction from coarse brackets of 5 s to 120 s. The TCA and
// miss distance come out the same; the coarse step only finds the encounter.
import { formatMeters } from '../../chart.js';
import { decodeCqr, msOf, output, pairRequest, syntheticShell } from '../codec/cqr.js';
import { screenOnce } from '../codec/screen.js';
import { num, panel, table, tiles, note } from '../ui.js';
import { scene3d, v3 } from '../scene.js';

const STEPS = [5, 15, 30, 60, 120];

// The refined encounter in the primary's radial, in-track and cross-track
// axes (metres): the miss vector and relative velocity the module reports,
// the secondary's straight-line relative path through them, and every coarse
// step's refined closest point.
async function drawEncounter(view, a, b, ref, refined) {
  const vec = (q) => (q ? [q.X, q.Y, q.Z] : null);
  const miss = vec(ref.RELATIVE_POSITION_RTN), rel = vec(ref.RELATIVE_VELOCITY_RTN);
  if (!miss || !rel) return;
  const size = v3.norm(miss) || 1;
  const S = 6 / size;  // scene units per metre
  const m = (x) => v3.scale(x, S);
  const u = v3.unit(rel), span = (3 * size) / v3.norm(rel);
  const plane = [v3.unit(miss), v3.unit(v3.cross(u, miss))];
  await view.draw((g) => {
    g.disc([0, 0, 0], v3.scale(plane[0], 12), v3.scale(plane[1], 12), { color: 'muted', alpha: 0.07, frame: false });
    g.ring([0, 0, 0], v3.scale(plane[0], 6), v3.scale(plane[1], 6), { color: 'muted', alpha: 0.35, width: 1, dash: true, frame: false });
    g.axes([0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 7.5, ['Radial', 'In-track', 'Cross-track'], { color: 'muted', alpha: 0.8 });
    g.line([m(v3.sub(miss, v3.scale(rel, span))), m(v3.add(miss, v3.scale(rel, span)))], { color: 'cyan', width: 2.5 });
    g.arrow([0, 0, 0], m(miss), { color: 'accent', width: 11 });
    g.arrow(m(miss), m(v3.add(miss, v3.scale(u, size * 1.4))), { color: 'cyan', width: 11, frame: false });
    if (ref.HAS_COMBINED_RADIUS_M) g.sphere([0, 0, 0], Math.max(ref.COMBINED_RADIUS_M * S, 0.08), { color: 'accent', alpha: 0.5 });
    g.point([0, 0, 0], { color: 'accent', size: 9, label: a.name, labelColor: 'accent', labelOptions: { align: 'right' } });
    refined.forEach((e, k) => g.point(m(vec(e.RELATIVE_POSITION_RTN) ?? miss), { color: 'text', size: 16 - 2 * k, outline: 1 }));
    g.label(m(v3.scale(miss, 0.5)), `miss ${formatMeters(ref.MISS_DISTANCE_M, 3)}`, { color: 'accent', above: true });
    g.label(m(miss), `${b.name} at TCA`, { color: 'text', dy: 16 });
    g.label(m(v3.add(miss, v3.scale(u, size * 1.4))), `${num(v3.norm(rel) / 1000, 4)} km/s`, { color: 'cyan' });
    g.view({ center: m(v3.scale(miss, 0.5)), radius: 8, direction: v3.unit(v3.add(v3.scale(plane[1], 1), v3.add(v3.scale(u, 0.35), [0, 0, 0.5]))) });
  }, { caption: 'Primary-centered RTN; the secondary’s relative path is the straight line through its closest point',
    legend: [['accent', 'Miss vector'], ['cyan', 'Relative velocity and path'], ['text', 'Refined from 5, 15, 30, 60 and 120 s', 'dot']] });
}

export default async function run(ctx) {
  const pick = panel(ctx.root, 'The encounter');
  const out = panel(ctx.root, 'Refined from each coarse step');
  const view = scene3d(ctx, { title: 'The closest approach, in the primary’s frame', earth: false });
  note(ctx.root, 'The pair is the closest approach in a screen of 300 synthetic objects over 6 h; each row is one assess_conjunction call on a one-hour window around it.');
  const ca = await ctx.module('analysis/conjunction-assessment');
  await ctx.run('Screening for an encounter, then refining it', async () => {
    const objects = syntheticShell(300);
    const screen = await screenOnce(ca, objects, { durationSeconds: 6 * 3600 });
    if (!screen.events.length) throw new Error('The screen found no encounter.');
    const e = screen.events.reduce((a, b) => (b.MISS_DISTANCE_M < a.MISS_DISTANCE_M ? b : a));
    const a = objects.find((o) => o.id === e.PRIMARY_ID), b = objects.find((o) => o.id === e.SECONDARY_ID);
    tiles(pick, [['Pair', `${a.name} · ${b.name}`], ['Screen TCA', new Date(msOf(e.TCA.JULIAN_DATE)).toISOString().slice(11, 23)], ['Screen miss', formatMeters(e.MISS_DISTANCE_M)], ['Relative speed', `${num(e.RELATIVE_SPEED_M_S / 1000, 4)} km/s`]]);
    const startJd = e.TCA.JULIAN_DATE - 0.5 / 24 + 7.3 / 86400;  // off the screen's grid
    const rows = [], refined = [];
    let ref = null;
    for (const step of STEPS) {
      const event = decodeCqr(output(await ca.invoke('assess_conjunction', [pairRequest(a, b, { startJd, durationSeconds: 3600, coarseStepSec: step, toleranceSec: 0.001 })]), 'result')).EVENT_RESULT;
      ref ??= event;
      refined.push(event);
      rows.push([`${step} s`, new Date(msOf(event.TCA.JULIAN_DATE)).toISOString().slice(11, 23), formatMeters(event.MISS_DISTANCE_M, 3),
        `${num((event.TCA.JULIAN_DATE - ref.TCA.JULIAN_DATE) * 86400e3, 3)} ms`, formatMeters(Math.abs(event.MISS_DISTANCE_M - ref.MISS_DISTANCE_M), 3)]);
    }
    table(out, ['Coarse step', 'TCA (UTC)', 'Miss', 'ΔTCA', 'Δmiss'], rows);
    await drawEncounter(view, a, b, ref, refined);
    return `Every coarse step refines to the same closest approach: ${formatMeters(ref.MISS_DISTANCE_M, 3)} at ${rows[0][1]} UTC.`;
  });
}
