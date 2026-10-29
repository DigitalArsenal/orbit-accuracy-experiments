// Transport only. Raw response buffers never cross a filesystem API.
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
export const base = 'https://api.starlink.com/public-files/ephemerides/';
// One range request per file, from byte 0: 512 KiB hold the first 16 hours of a 60 s file with margin (E13b amendments A2, A4).
export const PREFIX_BYTES = 524288;
export const sha = b => createHash('sha256').update(b).digest('hex');
export class Fetcher {
  bytes = 0; requests = 0; next = 0; controller = new AbortController();
  cancel(){this.controller.abort();}
  async get(url, range = null) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const start=Math.max(Date.now(),this.next);this.next=start+100;
      await sleep(Math.max(0,start-Date.now()));
      if(this.controller.signal.aborted)throw Object.assign(new Error('fetcher stopped'),{fatal:true});
      let response;
      try {
        this.requests++;
        response = await fetch(url, { headers: { 'User-Agent': 'sdn-operator-capture/1.0', 'Accept-Encoding': 'identity', ...(range ? {Range: `bytes=${range[0]}-${range[1]}`} : {}) }, signal: AbortSignal.any([AbortSignal.timeout(60000),this.controller.signal]) });
        if (response.status !== (range ? 206 : 200)) {
          await response.body?.cancel();
          throw Object.assign(new Error(`HTTP ${response.status}${range ? ' (206 required; full body refused)' : ''}`), {fatal: [403,429].includes(response.status), gone: response.status === 404});
        }
        const contentRange = response.headers.get('content-range');
        const parsedRange=contentRange&&/^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
        // RFC byte ranges end at EOF when the requested end exceeds file size.
        // Some public products contain only about eight hours, not 72 hours.
        if (range && (!parsedRange||+parsedRange[1]!==range[0]||+parsedRange[2]!==Math.min(range[1],+parsedRange[3]-1))) {
          await response.body?.cancel(); throw Object.assign(new Error('range contract changed'), {fatal: true});
        }
        const expectedLength=range?+parsedRange[2]-range[0]+1:null;
        const chunks = []; let length = 0;
        for await (const chunk of response.body) {
          length += chunk.length; this.bytes += chunk.length;
          if (length > (range ? range[1]-range[0]+1 : 32*1024*1024)) throw Object.assign(new Error('response byte budget exceeded'), {fatal: true});
          chunks.push(chunk);
        }
        if (range && length !== expectedLength) throw new Error('short range body');
        return {bytes: Buffer.concat(chunks), retrievedUtc: new Date().toISOString(), etag: response.headers.get('etag'), contentRange};
      } catch (error) {
        if(this.controller.signal.aborted)throw Object.assign(new Error('fetcher stopped'),{fatal:true});
        if (error.fatal || error.gone) throw error;
        if (attempt) throw Object.assign(new Error(`source unavailable twice: ${error.message}`), {fatal: true});
        await sleep(30000);
      }
    }
  }
  async manifest() {
    const r = await this.get(base+'MANIFEST.txt');
    const names = [...new Set(r.bytes.toString().split(/\s+/).filter(n => /^MEME_\d+_STARLINK-[A-Za-z0-9-]+_\d+_[A-Za-z]+_\d+_UNCLASSIFIED\.txt$/.test(n)))].sort();
    if (!names.length) throw new Error('empty or unrecognized Starlink manifest');
    return {names, sha256: sha(r.bytes), bytes: r.bytes.length, retrievedUtc: r.retrievedUtc};
  }
  async prefix(name) {
    const url=base+name;
    return {name, url, ...await this.get(url, [0, PREFIX_BYTES-1])};
  }
}
