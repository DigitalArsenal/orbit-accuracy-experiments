// SpaceX MEME text -> $OEM, by the WASM of data-source/spacex-starlink-source.
//
// That module parses the operator file inside the guest: it fetches through
// the space_data_module_host `http.request` call. Here the host answers that
// call from bytes already in memory (this process fetched them politely), so
// the module's own MEME parser runs on exactly those bytes. Nothing is written
// anywhere. The module drops a truncated trailing record, so a prefix of the
// file (a Range GET) is a valid input; it assumes the states are consecutive
// from the file's first byte, so the prefix must start at byte 0.
import fs from 'node:fs';
import path from 'node:path';
import { stripWasmCustomSections } from 'space-data-module-sdk/bundle';

const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const envelope = (obj) => {
  const meta = new TextEncoder().encode(JSON.stringify(obj));
  const out = new Uint8Array(8 + meta.length);
  new DataView(out.buffer).setUint32(0, meta.length, true);
  out.set(meta, 4);
  return out;
};
const MANIFEST_URL = 'memory://starlink/MANIFEST.txt';

export const MEME_MODULE = 'data-source/spacex-starlink-source/dist/isomorphic/module.wasm';

export async function loadMemeReader(readerModulesRoot) {
  const file = path.join(readerModulesRoot, MEME_MODULE);
  const raw = fs.readFileSync(file);
  const compiled = await WebAssembly.compile(stripWasmCustomSections(new Uint8Array(raw)));
  return {
    artifact: { path: MEME_MODULE, bytes: raw.length },
    // filename: the MEME file name (NORAD and object name come from it); bytes: the file's first N bytes.
    // Returns the module's $OEM (EME2000, UTC, compact 60 s states) as bytes, or null when it parsed no state.
    read(filename, bytes) {
      let response = new Uint8Array(0);
      let instance = null;
      const memory = () => new Uint8Array(instance.exports.memory.buffer);
      const host = {
        call(opPtr, opLen, payloadPtr, payloadLen) {
          const op = new TextDecoder().decode(memory().slice(opPtr, opPtr + opLen));
          const request = memory().slice(payloadPtr, payloadPtr + payloadLen);
          const meta = JSON.parse(new TextDecoder().decode(request.subarray(4, 4 + u32(request, 0))));
          if (op !== 'http.request') response = envelope({ ok: false, error: { message: `unhandled host call ${op}` } });
          else if (meta.url === MANIFEST_URL) response = envelope({ ok: true, result: { status: 200, body_encoding: 'utf8', body: `${filename}\n` } });
          else if (meta.url.endsWith(`/${filename}`)) response = envelope({ ok: true, result: { status: 206, body_encoding: 'base64', body: Buffer.from(bytes).toString('base64') } });
          else response = envelope({ ok: true, result: { status: 404, body_encoding: 'utf8', body: '' } });
          return 0;
        },
        response_len: () => response.length,
        read_response(dst, len) { const n = Math.min(len, response.length); memory().set(response.subarray(0, n), dst); return n; },
        clear_response() { response = new Uint8Array(0); return 0; },
        last_status_code: () => 0,
      };
      return WebAssembly.instantiate(compiled, { space_data_module_host: host, wasi_snapshot_preview1: { fd_close: () => 0, fd_write: () => 0, fd_seek: () => 0 } }).then((inst) => {
        instance = inst;
        const ex = inst.exports;
        ex._initialize?.();
        const config = new TextEncoder().encode(JSON.stringify({ manifestUrl: MANIFEST_URL, offset: 0, count: 1, rangeBytes: bytes.length }));
        const configPtr = ex.plugin_alloc(config.length);
        memory().set(config, configPtr);
        const lenPtr = ex.plugin_alloc(4);
        const resultPtr = ex.plugin_invoke_stream(configPtr, config.length, lenPtr);
        const result = memory().slice(resultPtr, resultPtr + u32(memory(), lenPtr));
        ex.plugin_free?.(configPtr, config.length);
        ex.plugin_free?.(lenPtr, 4);
        if (u32(result, 0) < 1) return null;
        const length = u32(result, 4);
        return Buffer.from(result.slice(8, 8 + length));
      });
    },
  };
}
