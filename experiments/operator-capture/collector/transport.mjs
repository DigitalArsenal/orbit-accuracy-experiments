// Transport/parser only. Raw response buffers never cross a filesystem API.
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
export const base = 'https://api.starlink.com/public-files/ephemerides/';
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
        if (range && !contentRange?.startsWith(`bytes ${range[0]}-${range[1]}/`)) {
          await response.body?.cancel(); throw Object.assign(new Error('range contract changed'), {fatal: true});
        }
        const chunks = []; let length = 0;
        for await (const chunk of response.body) {
          length += chunk.length; this.bytes += chunk.length;
          if (length > (range ? range[1]-range[0]+1 : 32*1024*1024)) throw Object.assign(new Error('response byte budget exceeded'), {fatal: true});
          chunks.push(chunk);
        }
        if (range && length !== range[1]-range[0]+1) throw new Error('short range body');
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
  async head(name) {
    const url=base+name, first=await this.get(url,[0,262143]);
    const lines=first.bytes.toString().split(/\n/);
    const created=/^created:(.+) UTC\r?$/.exec(lines[0])?.[1];
    const header=/^ephemeris_start:(.+) UTC ephemeris_stop:(.+) UTC step_size:(\d+)\r?$/.exec(lines[1]);
    if(!created||!header||lines[3].trim()!=='UVW')throw new Error('unrecognized MEME header');
    const step=Number(header[3]);
    if(step!==60)throw new Error(`unregistered native step ${step}`);
    // A single bounded prefix avoids the many latency-dominated tail requests
    // of A1. Only the first 481 records are decoded or retained (amendment A2).
    const count=8*3600/step+1;
    const buffer=first.bytes,rest=first,allLines=lines;
    if(Math.floor((allLines.length-5)/4)<count)throw new Error('eight hours exceed the fixed prefix budget');
    const headText=allLines.slice(0,4+count*4).join('\n')+'\n',total=buffer.length;
    const tokens=headText.split('\n').slice(4).join(' ').trim().split(/\s+/);
    if(tokens.length!==count*28)throw new Error('head record count mismatch');
    const points=[];
    for(let k=0;k<tokens.length;k+=28){
      const m=/^(\d{4})(\d{3})(\d{2})(\d{2})(\d{2}(?:\.\d+)?)$/.exec(tokens[k]);
      if(!m)throw new Error('invalid MEME epoch');
      const ms=Date.UTC(+m[1],0,1)+(+m[2]-1)*86400000+(+m[3]*3600 + +m[4]*60 + +m[5])*1000;
      const stateKm=tokens.slice(k+1,k+7).map(Number);
      if(!stateKm.every(Number.isFinite))throw new Error('nonfinite source state');
      points.push({ms,stateKm});
    }
    const start=Date.parse(header[1].replace(' ','T')+'Z');
    if(points.some((p,i)=>p.ms!==start+i*step*1000))throw new Error('head grid incomplete');
    return {points, source:{name,url,norad:Number(name.split('_')[1]),createdUtc:created.replace(' ','T')+'Z',startUtc:new Date(start).toISOString(),retrievedUtc:rest.retrievedUtc,range:[0,total-1],bytes:total,tailBytes:total-Buffer.byteLength(headText),sha256:sha(buffer),headSha256:sha(headText),etag:rest.etag,rawPersisted:false}};
  }
}
