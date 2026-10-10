// SpaceX MEME text -> $OEM, by the WASM of data-source/spacex-starlink-source (see hostmodule.mjs).
// The module drops a truncated trailing record, so a prefix of the file (a Range GET) is a valid input;
// it takes the states as consecutive from the file's first byte, so the prefix must start at byte 0.
import { compileModule, runStreamModule } from './hostmodule.mjs';

export const MEME_MODULE = 'data-source/spacex-starlink-source/dist/isomorphic/module.wasm';
const MANIFEST_URL = 'memory://starlink/MANIFEST.txt';

export async function loadMemeReader(readerModulesRoot) {
  const { compiled, artifact } = await compileModule(readerModulesRoot, MEME_MODULE);
  return {
    artifact,
    // filename: the MEME file name (NORAD number and object name come from it); bytes: the file's first N bytes.
    // Returns the module's $OEM (EME2000, UTC, compact 60 s states), or null when it parsed no state.
    async read(filename, bytes) {
      const records = await runStreamModule(compiled, { manifestUrl: MANIFEST_URL, offset: 0, count: 1, rangeBytes: bytes.length }, ({ url }) => {
        if (url === MANIFEST_URL) return { status: 200, body: `${filename}\n` };
        if (url.endsWith(`/${filename}`)) return { status: 206, body: bytes };
        return { status: 404, body: '' };
      });
      return records[0] ?? null;
    },
  };
}
