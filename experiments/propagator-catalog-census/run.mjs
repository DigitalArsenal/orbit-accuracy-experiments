// Resumable uncapped process pool. Every discovered source/object gets a durable outcome.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fork } from 'node:child_process';
import { parseArgs } from 'node:util';
import { config,root,here,read,write,sha,hashFile,registration,runDir,iso } from './common.mjs';
import { guard as baselineGuard } from '../propagator-published-truth/common.mjs';
import { wire } from '../propagator-published-truth/wire.mjs';
import { engines } from '../propagator-published-truth/engines.mjs';
import { select,loadArc } from './arcs.mjs';
import { environment,weatherHash } from './environment.mjs';

export const outcomeFile=(dir,key)=>path.join(dir,'outcomes',`${sha(key).slice(0,32)}.json`);
export function execution(dir,modules){
  const reg=registration(),baselinePlan=baselineGuard(modules),censusFile=path.join(dir,'census.json'),censusHash=hashFile(censusFile);
  if(censusHash!==read(path.join(dir,'census.sha256.json')).sha256)throw new Error('Frozen census changed');
  if(hashFile(path.join(dir,'environment/Kp_ap_Ap_SN_F107_since_1932.txt'))!==weatherHash)throw new Error('Weather amendment pin differs');
  const helpers={};
  for(const f of ['harness/records.mjs','harness/truth-gate.mjs','harness/modules.mjs','harness/time.mjs','harness/ffm-execution.mjs','harness/prw.mjs','experiments/truth-gate/flags.json','experiments/propagator-published-truth/common.mjs','experiments/propagator-published-truth/engines.mjs','experiments/propagator-published-truth/environment.mjs','experiments/propagator-published-truth/wire.mjs','experiments/e6-public-observations/fit.mjs','experiments/e2-catalog-covariance/estimation-wire.mjs','experiments/e2-catalog-covariance/product.mjs'])helpers[f]=hashFile(path.join(root,f));
  const behavior=new Set(['PLAN.md','config.json','common.mjs','arcs.mjs','environment.mjs','run.mjs']);
  const identity={sourceHashes:Object.fromEntries(Object.entries(reg.sourceHashes).filter(([f])=>behavior.has(path.basename(f)))),baselinePlan,censusHash,moduleCommit:config.moduleCommit,weatherHash,helpers};
  const executionId=sha(JSON.stringify(identity)),manifestFile=path.join(dir,'execution.json');
  if(fs.existsSync(manifestFile)){const m=read(manifestFile);if(m.executionId!==executionId)throw new Error('Execution provenance changed; do not mix outcomes');return m;}
  const manifest={...identity,experimentCommit:reg.experimentCommit,executionId,modules:fs.realpathSync(modules),startedUtc:iso(Date.now()),runtime:{node:process.version,v8:process.versions.v8},host:{cpu:os.cpus()[0].model,cpus:os.availableParallelism(),load:os.loadavg()},workers:config.execution.workers};
  write(manifestFile,manifest);return manifest;
}

export async function processObject(object,census,dir,W,predict,env,executionId){
  const base={key:object.key,norad:object.norad,source:object.source,lineage:object.lineage,evidence:object.evidence,executionId,startedUtc:iso(Date.now())};
  const selection=select(object,census);if(selection.status!=='metadata_eligible')return {...base,...selection,finishedUtc:iso(Date.now())};
  let arc;
  try{arc=loadArc(object,census,selection,W);}catch(e){return {...base,status:'unsupported_format_or_frame',reason:e.message,selection,finishedUtc:iso(Date.now())};}
  if(arc.status!=='eligible')return {...base,...arc,finishedUtc:iso(Date.now())};
  const out={...base,status:'eligible',issue:arc.issue,selection,leads:arc.leads,audit:arc.audit,fitSamples:arc.fit.length,scoreSamples:arc.score.length,arms:{}};
  let drivers;try{drivers=env(arc);out.environment=drivers.audit;}catch(e){out.status='propagation_failed';out.reason=`environment: ${e.message}`;return {...out,finishedUtc:iso(Date.now())};}
  for(const arm of config.arms){
    const prior=outcomeFile(dir,object.key),previous=fs.existsSync(prior)?read(prior):null;
    if(previous?.executionId===executionId&&previous.arms?.[arm]){out.arms[arm]=previous.arms[arm];continue;}
    try{out.arms[arm]={status:'scored',...await predict(arm,object,arc,drivers)};}
    catch(e){out.arms[arm]={ok:false,status:/fit|converg/i.test(e.message)?'fit_failed':'propagation_failed',reason:e.message};}
    write(prior,out);
  }
  out.status='evaluated';out.finishedUtc=iso(Date.now());return out;
}

async function worker(dir,modules,index,count){
  const manifest=read(path.join(dir,'execution.json')),census=read(path.join(dir,'census.json')),W=await wire(modules),m=await engines({modules},W),env=await environment({dir,modules},W);
  let completed=0;
  try{
    for(let i=index;i<census.objects.length;i+=count){
      const object=census.objects[i],f=outcomeFile(dir,object.key);
      if(fs.existsSync(f)){const p=read(f);if(p.executionId!==manifest.executionId)throw new Error(`Foreign outcome: ${f}`);if(p.finishedUtc){completed++;continue;}}
      const result=await processObject(object,census,dir,W,m.predict,env,manifest.executionId);write(f,result);completed++;
      write(path.join(dir,`progress-${index}.json`),{pid:process.pid,index,completed,lastKey:object.key,status:result.status,updatedUtc:iso(Date.now())});
      if(completed%100===0)console.log(JSON.stringify({worker:index,completed,status:result.status}));
    }
  }finally{await m.close();}
}

async function main(){
  const {values}=parseArgs({options:{run:{type:'string',default:'registered'},modules:{type:'string'},worker:{type:'string'},workers:{type:'string'}}});
  const dir=runDir(values.run),modules=values.modules||process.env.SDN_MODULES_ROOT;if(!modules)throw new Error('--modules required');
  if(values.worker!==undefined){await worker(dir,modules,Number(values.worker),Number(values.workers));return;}
  const manifest=execution(dir,modules),lock=path.join(dir,'runner.lock');
  const fd=fs.openSync(lock,'wx');fs.writeSync(fd,JSON.stringify({pid:process.pid,executionId:manifest.executionId,cwd:root}));fs.closeSync(fd);
  try{
    const result=await Promise.allSettled(Array.from({length:config.execution.workers},(_,i)=>new Promise((resolve,reject)=>{
      const p=fork(path.join(here,'run.mjs'),['--run',values.run,'--modules',modules,'--worker',String(i),'--workers',String(config.execution.workers)],{stdio:'inherit'});
      p.on('error',reject);p.on('exit',(code,signal)=>code===0?resolve(i):reject(new Error(`Worker ${i}: exit ${code} / ${signal}`)));
    })));
    const errors=result.filter(r=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(e=>e.reason),'Incomplete worker pool');
    const c=read(path.join(dir,'census.json')),missing=c.objects.filter(o=>!fs.existsSync(outcomeFile(dir,o.key))||!read(outcomeFile(dir,o.key)).finishedUtc);
    if(missing.length)throw new Error(`${missing.length} objects lack terminal outcomes`);
    write(path.join(dir,'batch.json'),{executionId:manifest.executionId,completedUtc:iso(Date.now()),sourceObjects:c.objects.length,completeAvailableBatch:true,completeCatalog:false});
  }finally{fs.unlinkSync(lock);}
}
if(process.argv[1]===new URL(import.meta.url).pathname)await main();
