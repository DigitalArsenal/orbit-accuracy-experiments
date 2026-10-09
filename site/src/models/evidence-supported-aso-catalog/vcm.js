// Section 17.3: the sample VCM, field by field as the adapter reads it into
// an SDS VCM record; propagated 24 h by HPOP with its 7×7 covariance under
// both readings of the B row; written back, and the written message read
// again to measure what the text keeps of the covariance.
import * as flatbuffers from 'flatbuffers';
import { VCM } from 'spacedatastandards.org/lib/js/VCM/main.js';
import { formatMeters } from '../../chart.js';
import { decodePrw, out, runVcm } from '../../runs.js';
import { flatten } from '../codec/kvn.js';
import { chart, num, panel, pre, table, tiles, note } from '../ui.js';

const fieldDoc = (schema, path) => {
  const name = path.split('.').at(-1).replace(/\[\d+\]$/, '');
  for (const fields of Object.values(schema.tables)) { const f = fields.find((x) => x.name === name); if (f) return f.doc; }
  return '';
};

export default async function run(ctx) {
  const message = panel(ctx.root, 'The message');
  const fields = panel(ctx.root, 'Every field, as an SDS VCM');
  const sig = panel(ctx.root, 'Sigmas the adapter recomputes');
  const figure = chart(ctx.root, 'Position sigmas along the propagation', 'HPOP’s 7×7 covariance; in-track under both readings of the B row');
  const back = panel(ctx.root, 'Written back');
  const [text, schema] = await Promise.all([ctx.fetchText('./data/vcm/sample-vcm.txt'), ctx.fetchJson('./data/sds/VCM.json')]);
  pre(message, text);
  note(message, 'The survey’s sample VCM, identifiers zeroed; by its orbit and revolution number an ISS solution.');
  const [adapter, hpop] = await Promise.all([ctx.module('analysis/vcm-adapter'), ctx.module('propagator/hpop')]);

  await ctx.run('analysis/vcm-adapter read, propagator/hpop 24 h, analysis/vcm-adapter write', async () => {
    const { runs, written } = await runVcm(adapter, hpop, text, { onStatus: ctx.status });
    const vcmBytes = out(runs.fractional.read, 'vcm');
    const record = VCM.getSizePrefixedRootAsVCM(new flatbuffers.ByteBuffer(vcmBytes)).unpack();
    table(fields, [`SDS VCM field (${schema.version})`, 'Value'], flatten(record).map(([k, v]) => [{ text: k, class: 'left mono wrap', title: fieldDoc(schema, k) }, { text: v, class: 'wrap mono' }]));
    note(fields, 'Fields at their schema defaults are not listed; hover a path for its schema documentation.');
    const { report } = runs.fractional;
    const b = (rows) => runs[rows].report.parameterSigmas.find((x) => x.name === 'B');
    table(sig, ['Sigma', 'VCM prints', 'Recomputed'], [
      ...['U radial', 'V in-track', 'W cross-track'].map((a, i) => [a, formatMeters(report.statedUvwSigmasKm[i] * 1000, 1), formatMeters(report.recomputedUvwSigmasKm[i] * 1000, 2)]),
      ['B, row as a fraction', '—', `${num(100 * b('fractional').sigma / b('fractional').value, 3)} % of B`],
      ['B, row as printed', '—', `${num(b('absolute').sigma / b('absolute').value, 3)} × B`],
    ]);
    const last = (rows) => runs[rows].sigmas.at(-1).s;
    figure.draw({ series: [
      { name: 'Radial', color: 'var(--series-muted)', points: runs.fractional.sigmas.map((q) => [q.hours, q.s[0]]), width: 1.5 },
      { name: 'In-track, B as printed', color: 'var(--cyan)', points: runs.absolute.sigmas.map((q) => [q.hours, q.s[1]]), label: true, labelText: 'As printed' },
      { name: 'In-track, B as a fraction', color: 'var(--accent)', points: runs.fractional.sigmas.map((q) => [q.hours, q.s[1]]), label: true, labelText: 'Fraction' },
    ], x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (h) => `${h} h` } });
    // Read the written message again: the covariance the text keeps.
    const again = await adapter.invoke('read', [{ portId: 'message', payload: new TextEncoder().encode(written) },
      { portId: 'options', payload: new TextEncoder().encode(JSON.stringify({ ephemerisSource: 'Analytical', arcSeconds: 3600 })) }]);
    const cov = (read) => { const r = decodePrw(out(read, 'request')).EXECUTION_REQUEST; return r.INITIAL_COVARIANCE ?? r.INITIAL.COVARIANCE; };
    const finalCov = runs.fractional.result.FINAL_SAMPLE.COVARIANCE, readBack = cov(again), n = finalCov.DIMENSION;
    let worst = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) worst = Math.max(worst, Math.abs(readBack.VALUES[i * n + j] - finalCov.VALUES[i * n + j]) / Math.sqrt(finalCov.VALUES[i * n + i] * finalCov.VALUES[j * n + j]));
    pre(back, written);
    tiles(back, [['In-track σ, 24 h, fraction', formatMeters(last('fractional')[1])], ['As printed', formatMeters(last('absolute')[1])], ['Round trip, of the sigmas', num(worst, 2)]]);
    return `Read, propagated and written here. The printed U, V, W sigmas come back within ${num(Math.max(...[0, 1, 2].map((i) => Math.abs(report.recomputedUvwSigmasKm[i] / report.statedUvwSigmasKm[i] - 1))) * 100, 2)} %; the written VCM keeps the covariance to ${num(worst, 2)} of its sigmas.`;
  });
}
