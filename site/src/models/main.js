// A model page: one paper section's claim, run live by the modules in this
// browser. The page names its model in <body data-paper data-model>; the
// model's module default-exports run(ctx). Modules compute; models move
// records between them and draw.
import { fetchBytes, fetchJson, fetchText, loadModule, siteUrl } from '../modules.js';
import { h } from './ui.js';

const body = document.body;
const root = document.getElementById('model');
const statusNode = document.getElementById('model-status');
const usedNode = document.getElementById('model-modules');
const loaded = new Map();

function status(text, error = false) {
  statusNode.textContent = text;
  statusNode.classList.toggle('error', error);
}

// Module sources, at the modules commit this site was built from.
let modulesCommit = null;
fetchJson('./provenance.json').then((p) => { modulesCommit = p.modulesRepository?.commit ?? null; listModules(); }, () => {});
const sourceLink = (path) => (modulesCommit && path.includes('/')
  ? h('a', { href: `https://github.com/DigitalArsenal/space-data-network-modules/tree/${modulesCommit}/${path}`, target: '_blank', rel: 'noopener' }, h('code', {}, path))
  : h('code', {}, path));

function listModules() {
  usedNode.replaceChildren(...[...loaded.values()].filter((m) => m.provenance).map((m) =>
    h('li', {}, sourceLink(m.provenance.path), ` ${m.provenance.version}`, m.provenance.wasmSha256
      ? [' · ', h('span', { class: 'hash', title: m.provenance.wasmSha256 }, `${m.provenance.wasmSha256.slice(0, 12)}…`)] : ` · ${m.provenance.source}`)));
  usedNode.parentElement.hidden = usedNode.childElementCount === 0;
}

const ctx = {
  root,
  status,
  siteUrl, fetchBytes, fetchJson, fetchText,
  // One instance per module per page.
  async module(path) {
    if (!loaded.has(path)) {
      const entry = { promise: loadModule(path) };
      loaded.set(path, entry);
      entry.promise.then((m) => { entry.provenance = m.provenance; listModules(); }, () => loaded.delete(path));
    }
    return loaded.get(path).promise;
  },
  // Other module-like packages (hd-wallet-wasm), listed beside the modules.
  record(provenance) { loaded.set(provenance.path, { provenance }); listModules(); },
  // Runs one computation: the page shows it working, then its result or error.
  async run(label, task) {
    body.dataset.state = 'running';
    status(`${label}…`);
    try {
      const out = await task();
      body.dataset.state = 'ready';
      if (typeof out === 'string') status(out);
      return out;
    } catch (error) {
      console.warn(error);
      body.dataset.state = 'error';
      body.dataset.failed = 'true';
      const isolation = !window.crossOriginIsolated && /SharedArrayBuffer|shared memory|Atomics/i.test(String(error?.message ?? error));
      status(isolation ? 'This model’s module uses shared WebAssembly memory, which an embedded page without cross-origin isolation cannot provide.' : error.message ?? String(error), true);
      if (isolation) isolationNote();
      return undefined;
    }
  },
};

function isolationNote() {
  if (document.querySelector('.isolation-note')) return;
  root.before(h('p', { class: 'isolation-note' }, 'This model needs a cross-origin-isolated page. ',
    h('a', { href: location.href.replace(/[?#].*$/, ''), target: '_blank', rel: 'noopener' }, 'Run it in its own tab ↗')));
}

async function main() {
  const { paper, model, dir } = body.dataset;
  // The orbit-determination pages live in src/od (data-dir="od").
  const run = dir === 'od' ? await import(`../od/${model}.js`) : await import(`./${paper}/${model}.js`);
  await run.default(ctx);
  body.dataset.done = 'true';
}

// The paper apps set the theme of an embedded model with ?theme= or a message.
addEventListener('message', (event) => {
  const theme = event.data?.sdnTheme;
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
});

main().catch((error) => { console.warn(error); body.dataset.state = 'error'; body.dataset.done = 'true'; status(error.message, true); });
