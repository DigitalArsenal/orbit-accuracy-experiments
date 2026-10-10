// The operator files E12 scores (PLAN.md section 9): a deterministic sample
// of each provider's listing, split into dev and held-out by the object's id,
// fetched in memory (operators-fetch.mjs) and normalized to segments. Nothing
// here writes an ephemeris anywhere; the segments are handed to the scoring
// workers in memory and dropped after.
import { createHash } from 'node:crypto';
import * as F from './operators-fetch.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');
// dev: even first byte of sha256(objectId); held-out: odd.
export const phaseOf = (objectId) => (parseInt(hash(String(objectId)).slice(0, 2), 16) % 2 === 0 ? 'dev' : 'heldout');
const ordered = (seed, items, key) => [...items].sort((a, b) => hash(`${seed}/${key(a)}`).localeCompare(hash(`${seed}/${key(b)}`)));

// Earth-fixed labels (ECF, IGS20, ITRF, CPF frame 0) read as ITRF.
const normalize = (s) => ({ ...s, label: { frame: /^(ECF|ITRF|IGS|IGb|CPF-frame-0)/i.test(s.label.frame) ? 'ITRF' : s.label.frame, timeScale: s.label.timeScale } });

// Jobs of a phase: [{key, provider, group, phase, fetch: () => segments}]; each
// fetch runs when the job is dispatched (serially, by the main thread).
export async function jobs(config, phase) {
  const o = config.operators, seed = o.seed, out = [];
  const p = o.providers;
  // Multi-object providers: the first n objects of the phase in the seeded order.
  const take = (items, key, n) => ordered(seed, items.filter((x) => phaseOf(key(x)) === phase), key).slice(0, n);
  {
    const names = await F.listStarlink();
    const byObject = new Map();
    for (const n of names) { const id = /^MEME_(\d+)_/.exec(n)?.[1]; if (id && !byObject.has(id)) byObject.set(id, n); }
    for (const [id, name] of take([...byObject], ([i]) => i, p['spacex-starlink'][phase])) out.push({ key: `starlink/${id}`, provider: 'spacex-starlink', group: 'spacex-starlink', phase, fetch: () => F.fetchStarlink(name) });
  }
  {
    const sats = (await F.listPlanet()).filter((s) => s.norad);
    for (const s of take(sats, (x) => x.hwid, p.planet[phase])) out.push({ key: `planet/${s.hwid}`, provider: 'planet', group: 'planet', phase, fetch: () => F.fetchPlanet(s.hwid, s.norad) });
  }
  // Single-object providers: dev is the file's first clean chunk, held-out the later ones.
  out.push({ key: 'iss', provider: 'nasa-iss', group: 'nasa-iss', phase, singleObject: true, fetch: () => F.fetchIss() });
  out.push({ key: 'tiangong', provider: 'cmse-tiangong', group: 'cmse-tiangong', phase, singleObject: true, fetch: () => F.fetchTiangong() });
  // CPF: per prediction centre, named targets per phase; the centre's newest file.
  for (const [centre, t] of Object.entries(p['ilrs-cpf'].centres)) {
    for (const target of t[phase]) {
      out.push({ key: `cpf/${centre}/${target}`, provider: 'ilrs-cpf', group: `ilrs-cpf:${centre}`, phase, fetch: async () => {
        const files = (await F.listCpf(target)).filter((f) => f.centre === centre).sort((a, b) => b.modified.localeCompare(a.modified));
        if (!files.length) throw new Error(`no ${centre} CPF for ${target}`);
        return F.fetchCpf(target, files[0].name);
      } });
    }
  }
  {
    const names = await F.listIntelsat('e');
    const bySat = new Map();
    for (const n of names.sort().reverse()) { const sat = n.split('_')[4]; if (sat && !bySat.has(sat)) bySat.set(sat, n); }
    for (const [sat, name] of take([...bySat], ([s]) => s, p.intelsat[phase])) out.push({ key: `intelsat/${sat}`, provider: 'intelsat', group: 'intelsat', phase, fetch: () => F.fetchIntelsat(name) });
  }
  {
    const g = p['esa-gnss-rapid'], url = F.igsProductUrl('rap', `${g.date}T00:00:00Z`, F.ESA_PRODUCTS);
    let cache = null;
    const sp3 = async () => (cache ??= await F.fetchSp3(url, 'esa-gnss-rapid'));
    const ids = Array.from({ length: 32 }, (_, k) => `G${String(k + 1).padStart(2, '0')}`).concat(Array.from({ length: 36 }, (_, k) => `E${String(k + 1).padStart(2, '0')}`));
    for (const id of take(ids, (x) => x, g[phase])) out.push({ key: `gnss/${id}`, provider: 'esa-gnss-rapid', group: 'esa-gnss-rapid', phase, fetch: async () => (await sp3()).filter((s) => s.objectId === id) });
  }
  return out.map((j) => ({ ...j, fetch: async () => (await j.fetch()).map(normalize) }));
}
