import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {fork} from 'node:child_process';
import {config,store,dir,H,iso,write,append,sha256,sleep,quiet,frozen,sourceHashes} from './common.mjs';
import {Fetcher} from './inputs.mjs';
fs.mkdirSync(store,{recursive:true});frozen();
const pidFile=path.join(store,'collector.pid'),logFile=path.join(store,'collector.log'),statusFile=path.join(store,'collector.status.json');
const log=m=>fs.appendFileSync(logFile,`${iso(Date.now())} ${m}\n`);
if(fs.existsSync(pidFile)){const pid=+fs.readFileSync(pidFile,'utf8');try{process.kill(pid,0);throw new Error(`collector already live PID ${pid}`);}catch(e){if(e.code!=='ESRCH')throw e;fs.unlinkSync(pidFile);}}
fs.writeFileSync(pidFile,String(process.pid),{flag:'wx'});
const once=process.argv.includes('--once'),limitArg=process.argv.indexOf('--limit'),limit=limitArg>=0?+process.argv[limitArg+1]:500;
if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('--limit must be 1..500');
let child=null,paused=false,stop=false,watchdog,deadline=Infinity,pauseSince=null,pauseMs=0,guardPeak=0;
const runtimeSources=sourceHashes();write(statusFile,{state:'starting',pid:process.pid,startedUtc:iso(Date.now())});
process.on('SIGTERM',()=>{stop=true;});process.on('SIGINT',()=>{stop=true;});
const stopping=()=>stop||fs.existsSync(path.join(store,'collector.stop'));
function launch() {
  child=fork(new URL('./worker.mjs',import.meta.url),[],{serialization:'advanced',stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,UV_THREADPOOL_SIZE:'1'}});
  child.stderr.on('data',b=>log(`worker ${b.toString().trim()}`));
  let pending;
  child.on('message',message=>{if(!pending)return;const p=pending;pending=null;message.error?p.reject(Object.assign(new Error(message.error.message),message.error)):p.resolve(message);});
  child.on('error',error=>{if(pending){pending.reject(error);pending=null;}});
  child.on('exit',(code,signal)=>{if(pending){pending.reject(new Error(`worker exited ${code}/${signal}`));pending=null;}});
  watchdog=setInterval(()=>{if(!child?.pid)return;const load=os.loadavg()[0];if(pending?.kind==='fit')guardPeak=Math.max(guardPeak,load);const high=load>=config.compute.maxLoad1m&&pending?.kind==='fit';
    if(Date.now()>=deadline&&pending){if(paused){child.kill('SIGCONT');paused=false;if(pauseSince!==null){pauseMs+=Date.now()-pauseSince;pauseSince=null;}}child.kill('SIGTERM');return;}
    if(high&&!paused){child.kill('SIGSTOP');paused=true;pauseSince=Date.now();log(`paused owned worker PID ${child.pid}: load ${os.loadavg()[0]}`);}
    else if(!high&&paused){child.kill('SIGCONT');paused=false;if(pauseSince!==null){pauseMs+=Date.now()-pauseSince;pauseSince=null;}log(`resumed owned worker PID ${child.pid}`);}},5000);
  return message=>new Promise((resolve,reject)=>{if(pending)return reject(new Error('one worker request at a time'));pending={resolve,reject,kind:message.kind};child.send(message);});
}
async function shutdownWorker(){clearInterval(watchdog);if(pauseSince!==null){pauseMs+=Date.now()-pauseSince;pauseSince=null;}if(child){if(paused&&child.exitCode===null&&child.signalCode===null)child.kill('SIGCONT');if(child.connected)child.send({kind:'close'});const owned=child;await Promise.race([new Promise(r=>owned.once('exit',r)),sleep(5000)]);if(owned.exitCode===null&&owned.signalCode===null)owned.kill('SIGTERM');child=null;paused=false;}}
try {
  do {
    await quiet(log);const parentCpuStart=process.cpuUsage();pauseMs=0;guardPeak=0;const started=Date.now(),id=iso(started).replace(/[:.]/g,'-'),fetcher=new Fetcher();
    // Collection begins ahead of the next issue. Data acquired after that
    // issue is never backfilled, even if it has an older source timestamp.
    const nextIssue=config.issuesUtc.map(Date.parse).find(t=>t>=started+config.compute.maximumCycleHours*H);
    const commissioning=started<Date.parse(config.window.issueStartUtc)-8*H||limit<500;
    const issueMs=commissioning?(Math.floor(started/(8*H))+2)*8*H:nextIssue;
    if(!issueMs){log('registered issue window complete; stopping collection');break;}
    deadline=started+config.compute.maximumCycleHours*H;const manifest=await fetcher.manifest(),request=launch(),ready=await request({kind:'init'});
    const cycle={id,pid:process.pid,workerPid:child.pid,startedUtc:iso(started),issueUtc:iso(issueMs),commissioning,requested:500,cycleLimit:limit,attempted:0,fitted:0,failed:0,failedCpuSeconds:0,missing:0,completed:false,records:[],manifestSha256:manifest.sha256,provenance:ready.provenance,sources:runtimeSources,weatherBytes:ready.weatherBytes,workerInitCpuSeconds:ready.initCpuSeconds,loadStart:os.loadavg()[0],loadPeak:os.loadavg()[0],pauseSeconds:0};
    write(statusFile,{state:'running',...cycle});
    const norads=config.strata.flatMap(s=>s.norads).sort((a,b)=>a-b).slice(0,limit);
    try {
      for(const norad of norads) {
        if(stopping()||Date.now()-started>=config.compute.maximumCycleHours*H)break;
        await quiet(log);cycle.loadPeak=Math.max(cycle.loadPeak,os.loadavg()[0]);
        const name=manifest.names.get(norad);if(!name){cycle.missing++;continue;}
        cycle.attempted++;write(statusFile,{state:'fitting',...cycle,currentNorad:norad});
        try {
          const source=await fetcher.arc(name);const {bytes,...metadata}=source;
          if(Date.parse(source.retrievedUtc)>issueMs){cycle.failed++;log(`missed issue cutoff for ${norad}`);continue;}
          const {record}=await request({kind:'fit',norad,source:{...metadata,name},bytes,issueMs,mechanics:cycle.fitted===0,commissioning});
          const relative=`records/${id}/${norad}.json.gz`,compressed=zlib.gzipSync(Buffer.from(JSON.stringify(record)),{level:6});
          fs.mkdirSync(path.dirname(path.join(store,relative)),{recursive:true});fs.writeFileSync(path.join(store,relative),compressed,{flag:'wx'});
          cycle.records.push({norad,path:relative,sha256:sha256(compressed),bytes:compressed.length,totalCpuSeconds:record.totalCpuSeconds,fitCpuSeconds:Object.values(record.arms).reduce((n,a)=>n+(a.cpuSeconds??0),0),predictionCpuSeconds:Object.values(record.arms).reduce((n,a)=>n+(a.prediction?.cpuSeconds??0),0),arms:Object.fromEntries(Object.entries(record.arms).map(([k,a])=>[k,a.status]))});cycle.fitted++;
          log(`cycle=${id} fitted=${cycle.fitted}/${limit} norad=${norad} bytes=${compressed.length}`);
        }catch(e){cycle.failed++;cycle.failedCpuSeconds+=e.cpuSeconds??0;log(`norad=${norad} FAILED ${e.message}`);if(e.fatal||/RMS mismatch|future source|unknown fitter|invalid FFM|complete estimate/.test(e.message))throw e;}
        write(statusFile,{state:'running',...cycle});
      }
      cycle.completed=cycle.attempted+cycle.missing===limit;
    }finally {
      await shutdownWorker();cycle.finishedUtc=iso(Date.now());cycle.wallSeconds=(Date.now()-started)/1000;cycle.bandwidthBytes=fetcher.bytes+cycle.weatherBytes;
      cycle.storageBytes=cycle.records.reduce((n,r)=>n+r.bytes,0);cycle.workerComputeCpuSeconds=cycle.failedCpuSeconds+cycle.records.reduce((n,r)=>n+(r.totalCpuSeconds??r.fitCpuSeconds+r.predictionCpuSeconds),0);
      const parentUsed=process.cpuUsage(parentCpuStart);cycle.parentCpuSeconds=(parentUsed.user+parentUsed.system)/1e6;cycle.computeCpuSeconds=cycle.workerComputeCpuSeconds+cycle.workerInitCpuSeconds+cycle.parentCpuSeconds;cycle.pauseSeconds=pauseMs/1000;cycle.loadPeak=Math.max(cycle.loadPeak,guardPeak);cycle.timingAdmissible=cycle.pauseSeconds===0&&cycle.loadPeak<config.compute.maxLoad1m;cycle.loadEnd=os.loadavg()[0];write(path.join(store,'cycles',id+'.json'),cycle);write(statusFile,{state:cycle.completed?'cycle-complete':'cycle-incomplete',...cycle});append(path.join(store,'cycles.jsonl'),{id,completed:cycle.completed,fitted:cycle.fitted,failed:cycle.failed,missing:cycle.missing,bandwidthBytes:cycle.bandwidthBytes,storageBytes:cycle.storageBytes,computeCpuSeconds:cycle.computeCpuSeconds,wallSeconds:cycle.wallSeconds});
    }
    if(once||stopping())break;
    const next=started+config.compute.cadenceHours*H;write(statusFile,{state:'sleeping',pid:process.pid,nextCycleUtc:iso(next),lastCycle:id});
    while(Date.now()<next&&!stopping())await sleep(Math.min(30000,next-Date.now()));
  }while(!stopping());
}catch(e){log(`STOPPED ${e.stack}`);write(statusFile,{state:'failed',pid:process.pid,error:e.message,at:iso(Date.now())});process.exitCode=1;}
finally{await shutdownWorker();if(fs.existsSync(pidFile)&&+fs.readFileSync(pidFile,'utf8')===process.pid)fs.unlinkSync(pidFile);}
