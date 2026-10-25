// The reproduction document of the SDN-AP paper's verification tables: docs/sdn-ap-reproduction.md, generated from the experiments' committed
// manifests and results, data/licenses.json, the plans' git history, and (when the local archive is present) the SHA-256 of every input file,
// which are kept in experiments/sdn-ap-reproduction/inputs.json so that a checkout without the archive regenerates the same document.
//   node experiments/sdn-ap-reproduction/build.mjs              (writes the document; refreshes inputs.json when the archive is present)
//   node experiments/sdn-ap-reproduction/build.mjs --check      (the document regenerated equals the committed one)
//   node experiments/sdn-ap-reproduction/build.mjs --dry-run    (every command's script exists in this checkout, or in the modules checkout beside it or at SDN_MODULES_ROOT, and parses;
//                                                                every input is reported present or absent)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { TABLES, KEYS, SOURCES } from './tables.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const DOC = path.join(root, 'docs/sdn-ap-reproduction.md');
const INPUTS = path.join(here, 'inputs.json');
const REPO = 'https://github.com/DigitalArsenal/orbit-accuracy-experiments';
const MODULES_REPO = 'https://github.com/DigitalArsenal/space-data-network-modules';
const args = new Set(process.argv.slice(2));
const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 28 }).toString();
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const licenses = new Map(readJson('data/licenses.json').sources.map((s) => [s.id, s]));
const g1 = readJson('results/sdn-gp-starlink-ffm-match/manifest.json');
const b1 = readJson('experiments/sdn-ap-baselines/config.json');

/** A plan's registration and amendments from its git history: the first commit holding each "### A..." heading. */
function planHistory(file) {
  const commits = git('log', '--reverse', '--format=%H %cI', '--', file).trim().split('\n').filter(Boolean).map((l) => { const [sha, date] = l.split(' '); return { sha, date: new Date(date).toISOString().replace('.000Z', 'Z') }; });
  if (!commits.length) return null;
  const seen = new Map();
  for (const c of commits) {
    const text = git('show', `${c.sha}:${file}`);
    for (const m of text.matchAll(/^### (A\d+[a-z]?) - ([^\n]*)$/gm)) if (!seen.has(m[1])) seen.set(m[1], { id: m[1], sha: c.sha, date: c.date });
  }
  return { file, registered: commits[0], last: commits.at(-1), commits: commits.length, amendments: [...seen.values()] };
}

/** One input set's files and digest from the local archive (null when absent): the set digest is SHA-256 of the sorted "name sha256" lines. */
function digestSet(spec) {
  const files = spec.files();
  if (!files || !files.length || files.some((f) => !fs.existsSync(f))) return null;
  const rows = files.map((f) => ({ name: path.basename(f), bytes: fs.statSync(f).size, sha256: sha256(fs.readFileSync(f)) })).sort((a, b) => (a.name < b.name ? -1 : 1));
  return { files: rows.length, bytes: rows.reduce((s, r) => s + r.bytes, 0), setSha256: sha256(Buffer.from(rows.map((r) => `${r.name} ${r.sha256}`).join('\n'))), list: rows };
}

function inputs() {
  const stored = fs.existsSync(INPUTS) ? JSON.parse(fs.readFileSync(INPUTS, 'utf8')) : {};
  const out = {};
  for (const [id, spec] of Object.entries(SOURCES)) {
    const fresh = spec.files ? digestSet(spec) : null;
    out[id] = fresh ?? stored[id] ?? (spec.recorded ? spec.recorded({ g1, b1 }) : null);
    const d = out[id];
    if (d?.list && !d.setSha256 && d.list.every((r) => r.sha256)) d.setSha256 = sha256(Buffer.from([...d.list].sort((a, b) => (a.name < b.name ? -1 : 1)).map((r) => `${r.name} ${r.sha256}`).join('\n')));
  }
  return out;
}

const terms = (id) => {
  if (id && typeof id === 'object') return { terms: id.text, reproduce: id.reproduce, url: id.url };
  const s = licenses.get(id);
  if (!s) return { terms: 'see the provider', reproduce: 'not registered' };
  const reproduce = { yes: 'yes', no: 'no', 'share-alike': 'share-alike', 'non-commercial': 'non-commercial only' }[s.reproduce] ?? s.reproduce;
  return { terms: s.license, reproduce, url: s.terms?.[0]?.url };
};

function document(inp) {
  const o = [];
  const plans = [planHistory('experiments/sdn-gp-starlink-ffm-match/PLAN.md'), planHistory('experiments/sdn-ap-baselines/PLAN.md')].filter(Boolean);
  o.push('# Reproducing the SDN-AP paper\'s verification tables', '');
  o.push('Each table of section 12 of the SDN-AP paper and of its appendix, the command that makes it, the inputs it reads with their SHA-256, where each input is fetched from, and which inputs this repository may not redistribute. Generated by `node experiments/sdn-ap-reproduction/build.mjs`; `--dry-run` checks that every command below is present in a checkout.', '');
  o.push('## The frozen plans', '');
  o.push('The windows, truths, arms and statistics were registered in each plan before any score was read; each amendment says when it was written and what had been read by then. The links at the registration commit do not change; the history link lists every commit of the plan with its date.', '');
  o.push('| Plan | Registered (UTC) | At registration | Current | History |', '| --- | --- | --- | --- | --- |');
  for (const p of plans) o.push(`| ${p.file} | ${p.registered.date} (${p.registered.sha.slice(0, 7)}) | [${p.registered.sha.slice(0, 7)}](${REPO}/blob/${p.registered.sha}/${p.file}) | [main](${REPO}/blob/main/${p.file}) | [${p.commits} commits](${REPO}/commits/main/${p.file}) |`);
  for (const p of plans) {
    if (!p.amendments.length) continue;
    o.push('', `Amendments of ${p.file}: the first commit that holds each (its heading says what had been read when it was written):`, '', '| Amendment | Committed (UTC) | Commit |', '| --- | --- | --- |');
    for (const a of p.amendments) o.push(`| ${a.id} | ${a.date} | [${a.sha.slice(0, 7)}](${REPO}/commit/${a.sha}) |`);
  }
  o.push('', '## Software', '');
  o.push(`- This repository, ${REPO}. G1's results were written at commit ${g1.repository.commit.slice(0, 12)}; B1's plan is experiments/sdn-ap-baselines.`);
  o.push(`- The modules, ${MODULES_REPO}: G1 at ${g1.modules.commit.slice(0, 12)} (${g1.modules.artifacts.map((a) => `${a.path} ${a.version}, wasm ${a.wasmSha256.slice(0, 12)}`).join('; ')}); B1 at ${b1.modules.commit.slice(0, 12)}.`);
  o.push(`- SDN-AP, the module propagator/sdn-ap: the paper's build ${b1.g1.sdnapBuild} (wasm SHA-256 ${b1.g1.sdnapWasmSha256}, source commit ${b1.g1.sdnapSourceCommit.slice(0, 12)}); G1 runs a copy of the built wasm kept by its SHA-256 (\`SDNGP_SNAPSHOT=<prefix>\`).`);
  o.push(`- Node ${g1.runtime.node} on ${g1.runtime.platform} ${g1.runtime.arch}; G1's packages: ${Object.entries(g1.packages).filter(([k]) => !/Sha256|Installed/.test(k)).map(([k, v]) => `${k} ${v}`).join(', ')} (lockfile SHA-256 ${g1.packages.lockfileSha256.slice(0, 12)}).`);
  o.push('', 'Setup, once:', '', '```sh');
  o.push(`git clone ${REPO} orbit-accuracy-experiments--repro`);
  o.push(`git clone ${MODULES_REPO} space-data-network-modules--repro   # the sibling the experiments find by name (or set SDN_MODULES_ROOT)`);
  o.push(`git -C space-data-network-modules--repro checkout ${b1.modules.commit}   # G1's own rows: ${g1.modules.commit}`);
  o.push('(cd orbit-accuracy-experiments--repro/experiments/sdn-gp-starlink-ffm-match && npm ci)');
  o.push('ln -s "$PWD/orbit-accuracy-experiments--repro/experiments/sdn-gp-starlink-ffm-match/node_modules" space-data-network-modules--repro/node_modules');
  o.push('for d in propagator/ffm propagator/sdn-ap analysis/gp-error-model analysis/od foundation/frames; do (cd space-data-network-modules--repro/$d && npm ci --ignore-scripts); done');
  o.push('```', '');
  o.push('The local archive root is /opt/data/sdn-archive (`SDN_ARCHIVE`); G1 keeps its derived records under /opt/data/sdn-archive/sdn-gp-starlink-ffm-match (`G1_STORE`) and B1 under /opt/data/sdn-archive/sdn-ap-baselines (`B1_STORE`). Secrets are read only by the fetch scripts, from files of mode 600 under <archive>/.secrets/ or ~/.sdn-keys/, never from the command line.', '');
  o.push('## Accounts and keys', '');
  for (const k of KEYS) {
    o.push(`### ${k.name}`, '');
    for (const line of k.lines) o.push(line);
    o.push('');
  }
  o.push('## The tables', '');
  for (const t of TABLES) {
    o.push(`### ${t.title}`, '');
    if (t.note) o.push(t.note, '');
    o.push(`Run in: ${t.repo === 'modules' ? `the modules checkout, at ${b1.modules.commit.slice(0, 12)}` : t.repo === 'both' ? `the modules checkout (at ${b1.modules.commit.slice(0, 12)}) and this repository, as marked` : 'this repository, with the modules checkout beside it'}. Result: ${t.result}.`, '');
    o.push('```sh', ...t.commands.map((c) => c.text), '```', '');
    o.push('| Input | Files | SHA-256 | Fetch | Terms | Redistributed here |', '| --- | --: | --- | --- | --- | --- |');
    for (const id of t.inputs) {
      const s = SOURCES[id], d = inp[id], lic = terms(s.license);
      const single = d?.sha256 ?? (d?.list?.length === 1 ? d.list[0].sha256 : null);
      const hash = single ? `\`${single}\`` : d?.setSha256 ? `set \`${d.setSha256}\`` : 'not recorded';
      const esc = (x) => String(x).replace(/\|/g, '\\|');
      const shortTerms = lic.terms.length > 120 ? `${lic.terms.slice(0, lic.terms.lastIndexOf(' ', 117))} ...` : lic.terms;
      o.push(`| ${esc(s.name)} | ${d?.files ?? (d?.sha256 ? 1 : '')} | ${hash} | ${esc(s.fetch)} | ${lic.url ? `[${esc(shortTerms)}](${lic.url})` : esc(shortTerms)} | ${lic.reproduce} |`);
    }
    o.push('');
  }
  o.push('## Inputs this repository does not redistribute', '');
  const notOurs = [...new Set(TABLES.flatMap((t) => t.inputs))].filter((id) => terms(SOURCES[id].license).reproduce !== 'yes');
  for (const id of notOurs) o.push(`- ${SOURCES[id].name}: ${terms(SOURCES[id].license).reproduce === 'no' ? 'not redistributed' : terms(SOURCES[id].license).reproduce}; fetch it from the provider (${SOURCES[id].fetch}). Only results computed from it are committed.`);
  o.push('', 'A set\'s SHA-256 is the SHA-256 of its files\' "name sha256" lines, sorted by name and joined by newlines; every file of every set, with its own SHA-256, is in experiments/sdn-ap-reproduction/inputs.json.', '');
  return o.join('\n');
}

const inp = inputs();
if (args.has('--dry-run')) {
  let bad = 0;
  for (const t of TABLES) {
    for (const c of t.commands) {
      if (!c.script) continue;
      const base = (c.repo ?? t.repo) === 'modules' ? (process.env.SDN_MODULES_ROOT ?? path.resolve(root, '..', path.basename(root).replace(/^orbit-accuracy-experiments/, 'space-data-network-modules'))) : root;
      const file = path.join(base, c.script);
      if ((c.repo ?? t.repo) === 'modules' && !fs.existsSync(base)) { console.log(`${t.id}: ${c.script}: the modules checkout ${base} is absent (clone it as the setup says)`); bad += 1; continue; }
      const ok = fs.existsSync(file) && spawnSync(process.execPath, ['--check', file]).status === 0;
      console.log(`${t.id}: ${c.script}: ${ok ? 'present, parses' : 'MISSING OR DOES NOT PARSE'}`);
      if (!ok) bad += 1;
    }
  }
  for (const [id, d] of Object.entries(inp)) console.log(`input ${id}: ${d ? `${d.files ?? 1} file(s) recorded` : 'not recorded'}${SOURCES[id].files ? (digestSet(SOURCES[id]) ? ', present locally' : ', absent locally (fetch it as the document says)') : ''}`);
  console.log(bad ? `dry run: ${bad} command(s) not reachable` : 'dry run: every command is reachable');
  process.exit(bad ? 1 : 0);
}
const text = document(inp);
if (args.has('--check')) {
  const same = fs.existsSync(DOC) && fs.readFileSync(DOC, 'utf8') === text;
  console.error(same ? 'reproduction document: same as committed' : 'reproduction document: differs from committed');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(INPUTS, `${JSON.stringify(inp, null, 1)}\n`);
fs.writeFileSync(DOC, text);
console.error(`wrote ${path.relative(root, DOC)} and ${path.relative(root, INPUTS)}`);
