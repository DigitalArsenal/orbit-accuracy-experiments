import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {gzipSync} from 'node:zlib';
import {Fetcher,sha} from './transport.mjs';
import {openPhysics} from './physics.mjs';
export const root=process.env.OPERATOR_CAPTURE_ROOT??'/opt/data/sdn-archive/operator-capture';
const iso=()=>new Date().toISOString();
export function append(file,value){fs.appendFileSync(file,JSON.stringify(value)+'\n');}
export function write(file,value){const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);}
export function subsets(file){
  if(!fs.existsSync(file))return {mode:'fallback-all',sha256:null,subsets:[]};
  const text=fs.readFileSync(file,'utf8'),block=/```json\s*([\s\S]*?)```/.exec(text);
  if(!block)throw new Error('SUBSETS.md has no JSON registration');
  const value=JSON.parse(block[1]);
  if(value.version!==1||!Array.isArray(value.subsets))throw new Error('unsupported subset registration');
  for(const s of value.subsets){if(!Array.isArray(s.norads)||!Array.isArray(s.epochsUtc)||!s.norads.every(Number.isSafeInteger)||!s.epochsUtc.every(e=>Number.isFinite(Date.parse(e)))||!(s.epochToleranceSeconds>=0&&s.epochToleranceSeconds<=3600)||!(s.truthHeadHours>0&&s.truthHeadHours<=8))throw new Error('invalid subset registration');}
  return {...value,mode:'registered',sha256:sha(text)};
}
export function selectTruth(reg,norad,native,samples){
  if(reg.mode==='fallback-all')return samples.map(p=>({ms:p.ms,stateM:p.stateM,registration:'fallback-all'}));
  const result=[];
  for(const s of reg.subsets.filter(s=>s.norads.includes(norad)))for(const epoch of s.epochsUtc){
    const wanted=Date.parse(epoch),tol=s.epochToleranceSeconds*1000;
    const point=native.find(p=>p.ms>=wanted&&p.ms<=wanted+tol&&p.ms<=native[0].ms+s.truthHeadHours*3600000);
    if(point)result.push({...point,registeredMs:wanted,registration:s.id});
  }
  return result;
}
async function main(){
  const once=process.argv.includes('--once');
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
    while(!stop()&&Date.now()<Date.parse('2026-12-02T00:00:00Z')){
      const started=Date.now(),cpu0=process.cpuUsage(),id=iso().replace(/[:.]/g,'-');
      while(!stop()){
        const stat=fs.statfsSync(root),freeGiB=stat.bavail*stat.bsize/2**30;
        if(freeGiB>=25)break;
        log('paused',{freeGiB});await sleep(30000);
      }
      if(stop())break;
      const cycleDir=path.join(root,'cycles',id);fs.mkdirSync(cycleDir,{recursive:true});
      const fetcher=new Fetcher(),summary={id,startedUtc:iso(),status:'running',files:0,samples:0,truthStates:0,failures:0,storedBytes:0};
      let failure;
      try{
        const reg=subsets(process.env.OPERATOR_SUBSETS??path.resolve(new URL('../SUBSETS.md',import.meta.url).pathname));
        summary.subsetSha256=reg.sha256;summary.subsetMode=reg.mode;
        const weather=await physics.weather(fetcher);summary.weather={sha256:weather.sha256,sources:weather.sources,rows:weather.rows.length};
        const manifest=await fetcher.manifest();summary.listed=manifest.names.length;summary.manifestSha256=manifest.sha256;
        write(path.join(cycleDir,'summary.json'),summary);
        for(const name of manifest.names){
          if(stop()){summary.status='interrupted';break;}
          const s=fs.statfsSync(root);if(s.bavail*s.bsize<25*2**30)throw new Error('disk below 25 GiB; cycle interrupted');
          try{
            const head=await fetcher.head(name),derived=await physics.derive(head,weather.rows);
            const truth=selectTruth(reg,head.source.norad,derived.native,derived.samples);
            const samples=derived.samples.map((p,i)=>({ms:p.ms,energyJkg:p.energyJkg,altitudeKm:p.altitudeKm,meanElements:p.meanElements,
              cumulativeDragWorkB1Jkg:derived.work.CUMULATIVE_DRAG_WORK_J_KG[i*10]}));
            if(samples.length!==49||samples.some(p=>!Number.isFinite(p.cumulativeDragWorkB1Jkg)))throw new Error('invalid derived head');
            const record={version:1,source:head.source,frame:'GCRF',units:{energy:'J/kg',state:'m,m/s',meanElements:'a km,e,i/RAAN/argp/true anomaly deg'},meanTheory:'Brouwer first-order J2',energyEarthOrientation:'UT1=UTC; xp=yp=0 (E13 diagnostic convention)',subsetSha256:reg.sha256,weatherSha256:weather.sha256,samples,truth};
            const bytes=gzipSync(JSON.stringify(record)+'\n'),file=path.join(cycleDir,head.source.norad+'.json.gz');
            fs.writeFileSync(file,bytes,{flag:'wx'});
            summary.files++;summary.samples+=samples.length;summary.truthStates+=truth.length;summary.storedBytes+=bytes.length;
          }catch(error){
            summary.failures++;append(path.join(cycleDir,'failures.jsonl'),{name,at:iso(),error:error.message});
            if(error.fatal)throw error;
          }
          const cpu=process.cpuUsage(cpu0),cpuSeconds=(cpu.user+cpu.system)/1e6,elapsed=(Date.now()-started)/1000;
          await sleep(Math.max(0,Math.min(30000,(cpuSeconds/0.5-elapsed)*1000)));
          if((summary.files+summary.failures)%100===0){log('progress',{id,...summary,bytes:fetcher.bytes,cpuSeconds});write(path.join(cycleDir,'summary.json'),summary);}
        }
        if(summary.status==='running')summary.status=summary.files===summary.listed?'complete':'partial';
      }catch(error){failure=error;summary.status='failed';summary.error=error.message;}
      const cpu=process.cpuUsage(cpu0);
      Object.assign(summary,{endedUtc:iso(),wallSeconds:(Date.now()-started)/1000,cpuSeconds:(cpu.user+cpu.system)/1e6,bytes:fetcher.bytes,requests:fetcher.requests,modules:physics.provenance,registration});
      write(path.join(cycleDir,'summary.json'),summary);append(path.join(root,'cycles.jsonl'),summary);log('cycle-end',summary);
      if(failure?.fatal)throw failure;
      if(once)break;
      const next=started+8*3600000;log('waiting',{nextUtc:new Date(Math.max(Date.now(),next)).toISOString()});
      while(!stop()&&Date.now()<next)await sleep(Math.min(30000,next-Date.now()));
    }
  }finally{await physics?.destroy();if(fs.readFileSync(pidFile,'utf8').trim()===String(process.pid))fs.unlinkSync(pidFile);log('exit');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
