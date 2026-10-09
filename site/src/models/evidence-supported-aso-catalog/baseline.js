// Section 17.5: the HPOP binary the paper names is the one this site serves.
// The page hashes every module binary it serves, in this browser, and
// compares HPOP's with the paper's SHA-256.
import { sha256Hex } from '../../modules.js';
import { h, num, panel, table } from '../ui.js';

const PAPER_HPOP = '473d527175de6606ccf305c45b37218288634fa9de2dcab0d72564a190bdabd1';

export default async function run(ctx) {
  const p = panel(ctx.root, 'Module binaries, hashed here');
  const prov = panel(ctx.root, 'Built from');
  await ctx.run('Hashing the served binaries', async () => {
    const provenance = await ctx.fetchJson('./provenance.json');
    const rows = [];
    let hpopMatch = false;
    for (const m of provenance.modules) {
      const bytes = await ctx.fetchBytes(`./modules/${m.path}/module.wasm`);
      const sha = await sha256Hex(bytes);
      const isHpop = m.path === 'propagator/hpop';
      if (isHpop) hpopMatch = sha === PAPER_HPOP;
      rows.push([{ text: m.path, class: 'left mono' }, `${num(bytes.length)} B`, { text: sha, class: 'wrap mono' },
        isHpop ? h('span', { class: `verdict ${hpopMatch ? 'pass' : 'fail'}` }, hpopMatch ? 'the paper’s' : 'differs') : (sha === m.wasmSha256 ? 'as built' : 'differs')]);
    }
    table(p, ['Module', 'Size', 'SHA-256', 'Check'], rows);
    table(prov, ['Input', 'Value'], [
      ['orbit-accuracy-experiments', { text: provenance.repository.commit ?? '—', class: 'mono wrap' }],
      ['space-data-network-modules', { text: provenance.modulesRepository.commit ?? '—', class: 'mono wrap' }],
      ['V1 run', { text: provenance.v1Run, class: 'mono wrap' }],
      ['space-data-module-sdk', provenance.sdk], ['spacedatastandards.org', provenance.spacedatastandards], ['Built', provenance.built],
    ]);
    return hpopMatch ? `propagator/hpop hashes to ${PAPER_HPOP.slice(0, 16)}…, the binary section 17.5 names.` : 'propagator/hpop here differs from the binary section 17.5 names.';
  });
}
