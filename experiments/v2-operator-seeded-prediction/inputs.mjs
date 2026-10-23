// Source transport and record selection only; never persist an operator arc.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as fb from 'flatbuffers';
import { createRequire } from 'node:module';
import { config, store, H, iso, sha256, sleep, lines } from './common.mjs';
import { readMeme } from '../e4-operator-ephemeris-parity/operators.mjs';
import { toGcrf } from '../../harness/frames.mjs';
import { finalsRecords, eopFrame } from '../../harness/eop.mjs';
import { kernelFrame } from '../../harness/prw.mjs';
import { spaceWeatherFrame } from '../../harness/full-force.mjs';
const base='https://api.starlink.com/public-files/ephemerides/';
export class Fetcher {
  bytes=0; requests=0; last=0;
  async get(url) {
    let failure;
    for(let attempt=0;attempt<2;attempt++) {
      await sleep(Math.max(0,this.last+config.compute.minRequestGapMs-Date.now()));
      try {
        const r=await fetch(url,{headers:{'User-Agent':'sdn-v2-operator-seeded/1.0'},signal:AbortSignal.timeout(90000)});
        this.last=Date.now();this.requests++;
        if([403,429].includes(r.status)) throw Object.assign(new Error(`source refused HTTP ${r.status}`),{fatal:true});
        if(!r.ok) throw new Error(`source HTTP ${r.status}`);
        const bytes=Buffer.from(await r.arrayBuffer());this.bytes+=bytes.length;
        return {bytes,retrievedUtc:iso(Date.now()),sha256:sha256(bytes),url};
      }catch(e){if(e.fatal)throw e;failure=e;if(!attempt)await sleep(30000);}
    }
    throw Object.assign(new Error(`source unavailable twice: ${failure.message}`),{fatal:true});
  }
  async manifest(){const r=await this.get(base+'MANIFEST.txt');return {names:new Map([...r.bytes.toString().matchAll(/(MEME_(\d+)_\S+)/g)].map(m=>[+m[2],m[1]])),sha256:r.sha256};}
  async arc(name){return this.get(base+name);}
}
export function cut(bytes) {
  const parsed=readMeme(bytes.toString());
  if(parsed.timeScale!=='UTC'||parsed.frame!=='EME2000')throw new Error('unexpected operator frame/time');
  const start=Date.parse(parsed.epochs[0]), end=start+config.fitHours*H;
  const before=parsed.epochs.map((e,i)=>({ms:Date.parse(e),state:parsed.states[i]})).filter(p=>p.ms<end);
  if(before.length<2||before.at(-1).ms<end-60000)throw new Error('incomplete pre-48 h segment');
  const points=before.filter(p=>(p.ms-start)%(config.fitCadenceSeconds*1000)===0);
  if(points.length!==288)throw new Error(`fit grid incomplete: ${points.length}/288`);
  return {createdUtc:parsed.created,startUtc:iso(start),stopUtc:parsed.epochs.at(-1),points,
    forecast:new Map(parsed.epochs.map((t,i)=>[Date.parse(t),parsed.states[i]]))};
}
export async function normalize(frames, points) {const out=[];for(const p of points)out.push({...p,state:await toGcrf(frames,'MEAN_EQUATOR_EQUINOX_J2000',iso(p.ms),p.state)});return out;}
export function dcaAt(issueMs, source='dove') {
  const candidates=lines(config.dca.file).filter(r=>Date.parse(r.publishedUtc)<=issueMs&&(!r.calibration||r.calibration===source));
  candidates.sort((a,b)=>Date.parse(b.publishedUtc)-Date.parse(a.publishedUtc)||a.path.localeCompare(b.path));
  const r=candidates[0];if(!r)return null;
  if(!/host-02|e13/i.test(r.source))throw new Error('unregistered DCA source');
  const file=path.resolve(path.dirname(config.dca.file),r.path),bytes=fs.readFileSync(file);
  if(sha256(bytes)!==r.sha256)throw new Error('DCA hash changed');
  return {provenance:r,frame:{portId:'density_correction',typeRef:{schemaName:'DCL.fbs',fileIdentifier:'$DCL',rootTypeName:'DCL',wireFormat:'flatbuffer'},payload:bytes}};
}
export async function environment(modules, moduleRoot, fetcher) {
  const weatherRoot=path.join(moduleRoot,'data-source/space-weather');
  const require=createRequire(path.join(weatherRoot,'package.json'));
  const contracts=await import(pathToFileURL(require.resolve('space-data-module-sdk/runtime-contracts')));
  const {SPW}=await import(pathToFileURL(require.resolve('spacedatastandards.org/lib/js/SPW/main.js')));
  const frame=(portId,payload,schemaName,fileIdentifier,rootTypeName)=>({portId,payload,typeRef:{schemaName,fileIdentifier,rootTypeName,wireFormat:'flatbuffer'}});
  const planned=await modules['data-source/space-weather'].invoke('plan_weather',[frame('tick',contracts.encodeTimerTick({triggerId:'v2',firedMs:Date.now()}),'TimerTick.fbs','TICK','TimerTick')]);
  const responses=[],sources=[];
  for(const q of planned.outputs.filter(f=>f.portId==='request').map(f=>contracts.decodeHttpRequest(f.payload))) {
    const r=await fetcher.get(q.url);sources.push({url:q.url,sha256:r.sha256,retrievedUtc:r.retrievedUtc,bytes:r.bytes.length});
    responses.push(frame('response',contracts.encodeHttpResponse({url:q.url,status:200,body:r.bytes,retrievedMs:Date.parse(r.retrievedUtc)}),'HttpResponse.fbs','HRSP','HttpResponse'));
  }
  const weather=await modules['data-source/space-weather'].invoke('parse_weather',responses);
  const bytes=Buffer.from(weather.outputs.find(f=>f.portId==='records').payload),rows=[];
  const weatherPath=path.join(store,'environment',sha256(bytes)+'.spw');fs.mkdirSync(path.dirname(weatherPath),{recursive:true});if(!fs.existsSync(weatherPath))fs.writeFileSync(weatherPath,bytes,{flag:'wx'});
  for(let at=0;at<bytes.length;){const n=bytes.readUInt32LE(at);if(n<8||at+4+n>bytes.length)throw new Error('SPW framing');rows.push(SPW.getSizePrefixedRootAsSPW(new fb.ByteBuffer(bytes.subarray(at,at+4+n))).unpack());at+=4+n;}
  const eopRoot='/opt/data/sdn-archive/hac/iers-eop/2026';
  const day=fs.readdirSync(eopRoot).filter(d=>/^2026-/.test(d)&&fs.existsSync(path.join(eopRoot,d,'finals.all.iau2000.txt'))).sort().at(-1);
  const eopFile=path.join(eopRoot,day,'finals.all.iau2000.txt'),eop=await finalsRecords(modules['data-source/eop-parser'],eopFile);
  const kernelFile='/opt/data/sdn-archive/operator-ephemerides/_capture/de440s.bsp',kernelBytes=fs.readFileSync(kernelFile);
  const kernel=kernelFrame(kernelBytes);
  return { provenance:{weather:sources,weatherRows:rows.length,weatherSha256:sha256(bytes),weatherPath,eop:{path:eopFile,sha256:sha256(fs.readFileSync(eopFile)),archiveDay:day},kernel:{path:kernelFile,sha256:sha256(kernelBytes)}},
    inputs(from,to){const lo=Math.floor(from/86400000)+40585,hi=Math.ceil(to/86400000)+40589;return [kernel,eopFrame(eop.records,lo,hi),spaceWeatherFrame(rows.filter(r=>Date.parse(r.DATE)>=from-3*86400000&&Date.parse(r.DATE)<=to+3*86400000))];} };
}
