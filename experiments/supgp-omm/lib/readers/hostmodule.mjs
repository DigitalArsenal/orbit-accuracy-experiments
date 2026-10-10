// The data-source modules (spacex-starlink-source, intelsat-source, cpf-source, ...) fetch their operator
// files themselves, through the space_data_module_host `http.request` call, then parse them in the guest
// and return an in-memory $OEM stream: [u32le count] then count x ([u32le length][$OEM]). This process has
// already fetched the bytes politely, so the host side answers the guest's requests from memory: the
// module's own parser runs on exactly those bytes. Nothing is written anywhere.
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

export async function compileModule(readerModulesRoot, relative) {
  const raw = fs.readFileSync(path.join(readerModulesRoot, relative));
  return { compiled: await WebAssembly.compile(stripWasmCustomSections(new Uint8Array(raw))), artifact: { path: relative, bytes: raw.length } };
}

// serve({url, headers}) -> {status, body: Buffer|string}. Returns the module's $OEM records as Buffers.
export async function runStreamModule(compiled, config, serve) {
  let response = new Uint8Array(0);
  let instance = null;
  const memory = () => new Uint8Array(instance.exports.memory.buffer);
  const host = {
    call(opPtr, opLen, payloadPtr, payloadLen) {
      const op = new TextDecoder().decode(memory().slice(opPtr, opPtr + opLen));
      const request = memory().slice(payloadPtr, payloadPtr + payloadLen);
      const meta = JSON.parse(new TextDecoder().decode(request.subarray(4, 4 + u32(request, 0))));
      if (op !== 'http.request') { response = envelope({ ok: false, error: { message: `unhandled host call ${op}` } }); return 0; }
      const answer = serve({ url: meta.url, headers: meta.headers ?? {} }) ?? { status: 404, body: '' };
      const body = Buffer.isBuffer(answer.body) ? answer.body : Buffer.from(answer.body ?? '');
      response = envelope({ ok: true, result: { status: answer.status, body_encoding: 'base64', body: body.toString('base64') } });
      return 0;
    },
    response_len: () => response.length,
    read_response(dst, len) { const n = Math.min(len, response.length); memory().set(response.subarray(0, n), dst); return n; },
    clear_response() { response = new Uint8Array(0); return 0; },
    last_status_code: () => 0,
  };
  instance = await WebAssembly.instantiate(compiled, { space_data_module_host: host, wasi_snapshot_preview1: { fd_close: () => 0, fd_write: () => 0, fd_seek: () => 0 } });
  const ex = instance.exports;
  ex._initialize?.();
  const cfg = new TextEncoder().encode(JSON.stringify(config));
  const cfgPtr = ex.plugin_alloc(cfg.length);
  memory().set(cfg, cfgPtr);
  const lenPtr = ex.plugin_alloc(4);
  const resultPtr = ex.plugin_invoke_stream(cfgPtr, cfg.length, lenPtr);
  const result = memory().slice(resultPtr, resultPtr + u32(memory(), lenPtr));
  ex.plugin_free?.(cfgPtr, cfg.length);
  ex.plugin_free?.(lenPtr, 4);
  const out = [];
  for (let i = 0, at = 4; i < u32(result, 0); ++i) {
    const n = u32(result, at);
    out.push(Buffer.from(result.slice(at + 4, at + 4 + n)));
    at += 4 + n;
  }
  return out;
}
