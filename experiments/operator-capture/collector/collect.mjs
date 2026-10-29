import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {gzipSync} from 'node:zlib';
import {Fetcher,sha} from './transport.mjs';
import {subsets} from './registration.mjs';
import {registeredProducts,sidecarProducts} from './capture.mjs';
import {openPhysics} from './physics.mjs';
export const root=process.env.OPERATOR_CAPTURE_ROOT??'/opt/data/sdn-archive/operator-capture';
export const CYCLE_MS=8*3600000;
const iso=()=>new Date().toISOString();
export function append(file,value){fs.appendFileSync(file,JSON.stringify(value)+'\n');}
export function write(file,value){const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);}
/** A process starts its first cycle one registered spacing after the last recorded start (at once when that has passed): a restart never moves the eight-hour cadence. */
export function firstSlot(captureRoot,now=Date.now()){
  const ledger=path.join(captureRoot,'cycles.jsonl');
  if(!fs.existsSync(ledger))return now;
  const last=fs.readFileSync(ledger,'utf8').trim().split('\n').filter(Boolean).at(-1);
  const started=last?Date.parse(JSON.parse(last).startedUtc):NaN;
  return Number.isFinite(started)?Math.max(now,started+CYCLE_MS):now;
}
/** One capture cycle: every listed file (or the first `limit` of them, a commissioning subset that never reads as complete), its registered record and its sidecar.
 *  Returns { started, failure }, or null when stopped before it began. */
export async function runCycle({captureRoot,physics,registration,producer,subsetsFile,log,stop,limit=null}){
  const started=Date.now(),cpu0=process.cpuUsage(),id=iso().replace(/[:.]/g,'-');
  while(!stop()){
    const stat=fs.statfsSync(captureRoot),freeGiB=stat.bavail*stat.bsize/2**30;
    if(freeGiB>=25)break;
    log('paused',{freeGiB});await sleep(30000);
  }
  if(stop())return null;
  const cycleDir=path.join(captureRoot,'cycles',id);fs.mkdirSync(cycleDir,{recursive:true});
  const fetcher=new Fetcher(),summary={id,startedUtc:iso(),status:'running',files:0,samples:0,truthStates:0,failures:0,storedBytes:0,sidecars:0,sidecarFailures:0,sidecarBytes:0};
  let failure;const pending=[];
  try{
    const reg=subsets(subsetsFile);
    summary.subsetSha256=reg.sha256;summary.subsetMode=reg.mode;
    const weather=await physics.weather(fetcher);summary.weather={sha256:weather.sha256,sources:weather.sources,rows:weather.rows.length};
    const manifest=await fetcher.manifest();summary.listed=manifest.names.length;summary.manifestSha256=manifest.sha256;
    const names=limit?manifest.names.slice(0,limit):manifest.names;if(limit)summary.limit=limit;
    write(path.join(cycleDir,'summary.json'),summary);
    let queued=0;
    const queue=()=>{const name=names[queued++];pending.push(fetcher.prefix(name).then(file=>({file}),error=>({error})));};
    while(queued<Math.min(4,names.length))queue();
    for(const name of names){
      if(stop()){summary.status='interrupted';break;}
      const s=fs.statfsSync(captureRoot);if(s.bavail*s.bsize<25*2**30)throw new Error('disk below 25 GiB; cycle interrupted');
      try{
        const fetched=await pending.shift();
        if(fetched.error)throw fetched.error;
        if(queued<names.length)queue();
        const {head,derived,truth,record}=await registeredProducts({file:fetched.file,physics,weatherRows:weather.rows,weatherSha256:weather.sha256,reg});
        const bytes=gzipSync(JSON.stringify(record)+'\n'),file=path.join(cycleDir,head.source.norad+'.json.gz');
        fs.writeFileSync(file,bytes,{flag:'wx'});
        summary.files++;summary.samples+=record.samples.length;summary.truthStates+=truth.length;summary.storedBytes+=bytes.length;
        // The sidecar never changes the registered record above: a failure here is counted and logged, and the record stays.
        try{
          const ocm=await sidecarProducts({file:fetched.file,head,derived,physics,producer});
          fs.writeFileSync(path.join(cycleDir,head.source.norad+'.ocm'),ocm,{flag:'wx'});
          summary.sidecars++;summary.sidecarBytes+=ocm.length;
        }catch(error){
          summary.sidecarFailures++;append(path.join(cycleDir,'failures.jsonl'),{name,at:iso(),product:'ocm',error:error.message});
        }
      }catch(error){
        summary.failures++;append(path.join(cycleDir,'failures.jsonl'),{name,at:iso(),error:error.message});
        if(error.fatal)throw error;
        // A superseded file still frees its bounded prefetch slot.
        if(queued<names.length&&pending.length<4)queue();
      }
      const cpu=process.cpuUsage(cpu0),cpuSeconds=(cpu.user+cpu.system)/1e6,elapsed=(Date.now()-started)/1000;
      await sleep(Math.max(0,Math.min(30000,(cpuSeconds/0.5-elapsed)*1000)));
      if((summary.files+summary.failures)%100===0){log('progress',{id,...summary,bytes:fetcher.bytes,cpuSeconds});write(path.join(cycleDir,'summary.json'),summary);}
    }
    if(summary.status==='running')summary.status=summary.files===summary.listed?'complete':'partial';
  }catch(error){failure=error;summary.status='failed';summary.error=error.message;}
  fetcher.cancel();await Promise.all(pending);
  const cpu=process.cpuUsage(cpu0);
  Object.assign(summary,{endedUtc:iso(),wallSeconds:(Date.now()-started)/1000,cpuSeconds:(cpu.user+cpu.system)/1e6,bytes:fetcher.bytes,requests:fetcher.requests,modules:physics.provenance,registration});
  write(path.join(cycleDir,'summary.json'),summary);append(path.join(captureRoot,'cycles.jsonl'),summary);log('cycle-end',summary);
  return {started,failure};
}
async function main(){
  const once=process.argv.includes('--once'),at=process.argv.indexOf('--limit'),limit=at<0?null:Number(process.argv[at+1]);
  if(limit!==null&&!(Number.isSafeInteger(limit)&&limit>0))throw new Error('--limit needs a positive integer');
  fs.mkdirSync(root,{recursive:true});
  const pidFile=path.join(root,'collector.pid'),stopFile=path.join(root,'collector.stop'),logFile=path.join(root,'collector.log');
  const log=(event,extra={})=>append(logFile,{at:iso(),pid:process.pid,event,...extra});
  if(fs.existsSync(stopFile))throw new Error('collector.stop exists; owner must remove it before restart');
  let stopping=false;
  process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
  const stop=()=>stopping||fs.existsSync(stopFile);
  const moduleRoot=process.env.OPERATOR_MODULES_ROOT;
  if(!moduleRoot)throw new Error('OPERATOR_MODULES_ROOT must name pinned artifact snapshot');
  const registration=JSON.parse(fs.readFileSync(new URL('./registration.json',import.meta.url)));
  const config=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url)));
  if(!config.frozen||sha(fs.readFileSync(new URL('./config.json',import.meta.url)))!==registration.configSha256)throw new Error('frozen registration mismatch');
  for(const [name,digest]of Object.entries(registration.sourceHashes))if(sha(fs.readFileSync(new URL(name,import.meta.url)))!==digest)throw new Error('installed source mismatch');
  fs.writeFileSync(pidFile,String(process.pid)+'\n',{flag:'wx'});
  let physics;
  try{
    physics=await openPhysics(moduleRoot);
    for(const m of physics.provenance){const pin=registration.modules.find(x=>x.name===m.name);if(pin?.wasmSha256!==m.wasmSha256||pin?.manifestSha256!==m.manifestSha256)throw new Error('pinned artifact mismatch');}
    log('start',{registration,modules:physics.provenance,cycleHours:8,cpuDuty:0.5});
    const subsetsFile=process.env.OPERATOR_SUBSETS??path.resolve(new URL('../SUBSETS.md',import.meta.url).pathname),producer=`sdn-operator-capture ${registration.componentCommit}`;
    const first=once?Date.now():firstSlot(root);
    if(first>Date.now()){log('waiting',{nextUtc:new Date(first).toISOString()});while(!stop()&&Date.now()<first)await sleep(Math.min(30000,first-Date.now()));}
    while(!stop()&&Date.now()<Date.parse('2026-12-02T00:00:00Z')){
      const cycle=await runCycle({captureRoot:root,physics,registration,producer,subsetsFile,log,stop,limit});
      if(!cycle)break;
      if(cycle.failure?.fatal)throw cycle.failure;
      if(once)break;
      const next=cycle.started+CYCLE_MS;log('waiting',{nextUtc:new Date(Math.max(Date.now(),next)).toISOString()});
      while(!stop()&&Date.now()<next)await sleep(Math.min(30000,next-Date.now()));
    }
  }finally{await physics?.destroy();if(fs.readFileSync(pidFile,'utf8').trim()===String(process.pid))fs.unlinkSync(pidFile);log('exit');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
