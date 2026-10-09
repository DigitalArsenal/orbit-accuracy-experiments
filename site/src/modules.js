// The modules in the browser through the space-data-module-sdk harness: the
// same artifacts, and the same invoke(methodId, inputs) surface, that
// harness/modules.mjs gives the experiments in Node.
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';

// The site root: pages below it (models/<paper>/<section>.html) name it in
// <html data-base>, so module and data paths resolve from any depth.
export const siteUrl = (path) => new URL(path, new URL(document.documentElement.dataset.base ?? './', location.href)).href;

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchBytes(url) {
  const response = await fetch(siteUrl(url));
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function fetchJson(url) {
  const response = await fetch(siteUrl(url));
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

export async function fetchText(url) {
  const response = await fetch(siteUrl(url));
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

// relative: the module's path in space-data-network-modules, e.g.
// 'propagator/hpop'; its artifact and manifest are under ./modules/. The
// invoke surface is the one the manifest advertises (direct when offered).
export async function loadModule(relative) {
  const [wasm, manifest] = await Promise.all([fetchBytes(`./modules/${relative}/module.wasm`), fetchJson(`./modules/${relative}/plugin-manifest.json`)]);
  const surface = (manifest.invokeSurfaces ?? []).includes('direct') ? 'direct' : 'command';
  const harness = await createBrowserModuleHarness({ wasmSource: wasm, manifest, surface });
  const provenance = { path: relative, pluginId: manifest.pluginId, version: manifest.version, wasmSha256: await sha256Hex(wasm), bytes: wasm.length };
  return {
    provenance,
    async invoke(methodId, inputs) {
      const response = await harness.invoke({ methodId, inputs });
      if (response.statusCode !== 0) throw new Error(`${relative} ${methodId}: ${response.errorCode ?? response.statusCode}: ${response.errorMessage}`);
      return response;
    },
    // The raw response, for callers that read a refusal as a result.
    tryInvoke: (methodId, inputs) => harness.invoke({ methodId, inputs }),
    destroy: () => harness.destroy(),
  };
}
