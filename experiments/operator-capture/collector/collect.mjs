import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {gzipSync} from 'node:zlib';
import {Fetcher,sha} from './transport.mjs';
import {subsets} from './registration.mjs';
import {registeredProducts,retainedStates,sidecarProducts} from './capture.mjs';
import {openPhysics} from './physics.mjs';
import {openFit,fitArc,fitWeather,openFitStream,FIT_STREAM} from './fit.mjs';
export const root=process.env.OPERATOR_CAPTURE_ROOT??'/opt/data/sdn-archive/operator-capture';
export const CYCLE_MS=8*3600000;
// The fit pass stops this long before the next slot: fits are additive, and the eight-hour cadence is not theirs to move.
const FIT_MARGIN_MS=10*60000;
const iso=()=>new Date().toISOString();
export function append(file,value){fs.appendFileSync(file,JSON.stringify(value)+'\n');}
export function write(file,value){const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);}
/** A process starts its first cycle one registered spacing after the last recorded start (at once when that has passed): a restart never moves the eight-hour cadence. */
export function firstSlot(captureRoot,now=Date.now()){
  const ledger=path.join(captureRoot,'cycles.jsonl');
  if(!fs.existsSync(ledger))return now;
  const last=fs.readFileSync(ledger,'utf8').trim().split('\n').filter(Boolean).at(-1);
  // The cycle's id is its slot; startedUtc is later when the disk floor paused the cycle.
  const entry=last?JSON.parse(last):null,slot=entry?.id?.match(/^(.*T\d\d)-(\d\d)-(\d\d)-(\d+Z)$/);
  const started=slot?Date.parse(`${slot[1]}:${slot[2]}:${slot[3]}.${slot[4]}`):entry?Date.parse(entry.startedUtc):NaN;
  return Number.isFinite(started)?Math.max(now,started+CYCLE_MS):now;
}
/** One capture cycle: every listed file (or the first `limit` of them, a commissioning subset that never reads as complete), its registered record and its sidecar,
 *  then one fitted $OCM per file (amendment A6). Fits run after the capture, so a capture is timed and fetched as it always was and nothing a fit does reaches it.
 *  Returns { started, failure }, or null when stopped before it began. */
export async function runCycle({captureRoot,physics,fitter,registration,producer,subsetsFile,log,stop,limit=null,freeGiB=()=>{const s=fs.statfsSync(captureRoot);return s.bavail*s.bsize/2**30;},pauseMs=30000}){
  const started=Date.now(),cpu0=process.cpuUsage(),id=iso().replace(/[:.]/g,'-'),fitDeadline=started+CYCLE_MS-FIT_MARGIN_MS;
  // The 25 GiB floor pauses, before a cycle and inside one: a short dip must not lose the cycle.
  const waitForDisk=async(until=Infinity)=>{while(!stop()&&Date.now()<until){const free=freeGiB();if(free>=25)return;log('paused',{id,freeGiB:free});await sleep(pauseMs);}};
  // The one-core CPU duty limit, over the whole cycle.
  const pace=async()=>{const cpu=process.cpuUsage(cpu0),cpuSeconds=(cpu.user+cpu.system)/1e6,elapsed=(Date.now()-started)/1000;await sleep(Math.max(0,Math.min(30000,(cpuSeconds/0.5-elapsed)*1000)));return cpuSeconds;};
  await waitForDisk();
  if(stop())return null;
  const cycleDir=path.join(captureRoot,'cycles',id);fs.mkdirSync(cycleDir,{recursive:true});
  const fetcher=new Fetcher(),summary={id,startedUtc:iso(),status:'running',files:0,samples:0,truthStates:0,failures:0,storedBytes:0,sidecars:0,sidecarFailures:0,sidecarBytes:0,fits:0,fitFailures:0,fitBytes:0};
  const failuresFile=path.join(cycleDir,'failures.jsonl'),arcs=[];
  let failure,fitRows=null;const pending=[];
  try{
    const reg=subsets(subsetsFile);
    summary.subsetSha256=reg.sha256;summary.subsetMode=reg.mode;
    // The E13b build and the fit's build parse the same responses: each weather source is fetched once a cycle.
    const fetched=new Map(),sources={get:url=>{if(!fetched.has(url))fetched.set(url,fetcher.get(url));return fetched.get(url);}};
    // The operator's files cannot be fetched later, and weather feeds only the drag work of the registered record: when the weather
    // sources refuse, the cycle still keeps the sidecars and writes no registered record (amendment A5).
    let weather=null;
    try{weather=await physics.weather(sources);summary.weather={sha256:weather.sha256,sources:weather.sources,rows:weather.rows.length};}
    catch(error){if(error.fatal)throw error;summary.weather={unavailable:error.message};log('weather-unavailable',{id,error:error.message});}
    // The fit's rows are the fit's own (amendment A6): they never reach a registered record.
    try{fitRows=await fitWeather({fitter,sources,captureRoot,id});summary.fitWeather=fitRows.report;}
    catch(error){if(error.fatal)throw error;summary.fitWeather={source:'none',unavailable:error.message};}
    const manifest=await fetcher.manifest();summary.listed=manifest.names.length;summary.manifestSha256=manifest.sha256;
    const names=limit?manifest.names.slice(0,limit):manifest.names;if(limit)summary.limit=limit;
    write(path.join(cycleDir,'summary.json'),summary);
    let queued=0;
    const queue=()=>{const name=names[queued++];pending.push(fetcher.prefix(name).then(file=>({file}),error=>({error})));};
    while(queued<Math.min(4,names.length))queue();
    for(const name of names){
      if(stop()){summary.status='interrupted';break;}
      await waitForDisk();if(stop()){summary.status='interrupted';break;}
      try{
        const prefetched=await pending.shift();
        if(prefetched.error)throw prefetched.error;
        if(queued<names.length)queue();
        const {head,derived,truth,record}=await registeredProducts({file:prefetched.file,physics,weatherRows:weather?.rows??null,weatherSha256:weather?.sha256??null,reg});
        if(record){
          const bytes=gzipSync(JSON.stringify(record)+'\n'),file=path.join(cycleDir,head.source.norad+'.json.gz');
          fs.writeFileSync(file,bytes,{flag:'wx'});
          summary.files++;summary.samples+=record.samples.length;summary.truthStates+=truth.length;summary.storedBytes+=bytes.length;
        }
        // Neither the sidecar nor the fit changes the registered record above: a failure here is counted and logged, and the record stays.
        let retained=null;
        try{
          retained=await retainedStates({file:prefetched.file,derived,physics});
          const ocm=sidecarProducts({file:prefetched.file,head,retained,producer});
          fs.writeFileSync(path.join(cycleDir,head.source.norad+'.ocm'),ocm,{flag:'wx'});
          summary.sidecars++;summary.sidecarBytes+=ocm.length;
        }catch(error){
          summary.sidecarFailures++;append(failuresFile,{name,at:iso(),product:'ocm',error:error.message});
        }
        if(retained)arcs.push(fitArc({file:prefetched.file,head,states:retained.states}));
        else{summary.fitFailures++;append(failuresFile,{name,at:iso(),product:'fit',error:'no states to fit'});}
      }catch(error){
        summary.failures++;append(failuresFile,{name,at:iso(),error:error.message});
        if(error.fatal)throw error;
        // A superseded file still frees its bounded prefetch slot.
        if(queued<names.length&&pending.length<4)queue();
      }
      const cpuSeconds=await pace();
      if((summary.files+summary.sidecars+summary.failures)%100===0){log('progress',{id,...summary,bytes:fetcher.bytes,cpuSeconds});write(path.join(cycleDir,'summary.json'),summary);}
    }
    if(summary.status==='running')summary.status=!weather?'sidecars-only':summary.files===summary.listed?'complete':'partial';
  }catch(error){failure=error;summary.status='failed';summary.error=error.message;}
  fetcher.cancel();await Promise.all(pending);
  const capture=process.cpuUsage(cpu0);
  Object.assign(summary,{captureEndedUtc:iso(),captureWallSeconds:(Date.now()-started)/1000,captureCpuSeconds:(capture.user+capture.system)/1e6});
  write(path.join(cycleDir,'summary.json'),summary);
  try{await fitPass({arcs,fitter,fitRows,stream:path.join(cycleDir,FIT_STREAM),failuresFile,summary,id,stop,deadline:fitDeadline,waitForDisk,pace,log,progress:()=>write(path.join(cycleDir,'summary.json'),summary)});}
  catch(error){summary.fitError=error.message;log('fit-error',{id,error:error.message});}
  const cpu=process.cpuUsage(cpu0);
  Object.assign(summary,{endedUtc:iso(),wallSeconds:(Date.now()-started)/1000,cpuSeconds:(cpu.user+cpu.system)/1e6,bytes:fetcher.bytes,requests:fetcher.requests,modules:physics.provenance,fitModules:fitter.provenance,registration});
  write(path.join(cycleDir,'summary.json'),summary);append(path.join(captureRoot,'cycles.jsonl'),summary);log('cycle-end',summary);
  return {started,failure};
}
/** The cycle's fits, one per retained arc, written as one stream. A failed fit is counted and logged; it removes nothing. The pass ends early, saying how many it did not run, on a stop or at the deadline. */
async function fitPass({arcs,fitter,fitRows,stream,failuresFile,summary,id,stop,deadline,waitForDisk,pace,log,progress}){
  summary.fitsPlanned=arcs.length;
  if(!arcs.length)return;
  if(stop()){summary.fitsNotRun=arcs.length;return;}
  if(!fitRows?.stream){
    summary.fitFailures+=arcs.length;append(failuresFile,{at:iso(),product:'fit',error:`no weather rows for ${arcs.length} fits: ${summary.fitWeather?.unavailable}`});log('fit-weather-unavailable',{id,fits:arcs.length,error:summary.fitWeather?.unavailable});
    return;
  }
  const t0=Date.now(),cpu0=process.cpuUsage(),out=openFitStream(stream);
  try{
    for(let i=0;i<arcs.length;i++){
      await waitForDisk(deadline);
      if(stop()||Date.now()>=deadline){summary.fitsNotRun=arcs.length-i;log('fits-cut-short',{id,fitsNotRun:summary.fitsNotRun,stopped:stop()});break;}
      try{const ocm=await fitter.fit(arcs[i],fitRows);out.write(ocm);summary.fits++;summary.fitBytes+=ocm.length;}
      catch(error){summary.fitFailures++;append(failuresFile,{name:arcs[i].name,at:iso(),product:'fit',error:error.message});}
      const cpuSeconds=await pace();
      if((i+1)%500===0){log('progress',{id,...summary,cpuSeconds});progress();}
    }
  }finally{
    summary.fitStreamBytes=await out.close();
    const cpu=process.cpuUsage(cpu0);
    Object.assign(summary,{fitWallSeconds:(Date.now()-t0)/1000,fitCpuSeconds:(cpu.user+cpu.system)/1e6});
  }
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
  let physics,fitter;
  try{
    physics=await openPhysics(moduleRoot);
    for(const m of physics.provenance){const pin=registration.modules.find(x=>x.name===m.name);if(pin?.wasmSha256!==m.wasmSha256||pin?.manifestSha256!==m.manifestSha256)throw new Error('pinned artifact mismatch');}
    fitter=await openFit(new URL('./fit-modules/',import.meta.url).pathname);
    log('start',{registration,modules:physics.provenance,fitModules:fitter.provenance,cycleHours:8,cpuDuty:0.5});
    const subsetsFile=process.env.OPERATOR_SUBSETS??path.resolve(new URL('../SUBSETS.md',import.meta.url).pathname),producer=`sdn-operator-capture ${registration.componentCommit}`;
    const first=once?Date.now():firstSlot(root);
    if(first>Date.now()){log('waiting',{nextUtc:new Date(first).toISOString()});while(!stop()&&Date.now()<first)await sleep(Math.min(30000,first-Date.now()));}
    while(!stop()&&Date.now()<Date.parse('2027-02-01T00:00:00Z')){
      const cycle=await runCycle({captureRoot:root,physics,fitter,registration,producer,subsetsFile,log,stop,limit});
      if(!cycle)break;
      if(cycle.failure?.fatal)throw cycle.failure;
      if(once)break;
      const next=cycle.started+CYCLE_MS;log('waiting',{nextUtc:new Date(Math.max(Date.now(),next)).toISOString()});
      while(!stop()&&Date.now()<next)await sleep(Math.min(30000,next-Date.now()));
    }
  }finally{await physics?.destroy();await fitter?.destroy();if(fs.readFileSync(pidFile,'utf8').trim()===String(process.pid))fs.unlinkSync(pidFile);log('exit');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
