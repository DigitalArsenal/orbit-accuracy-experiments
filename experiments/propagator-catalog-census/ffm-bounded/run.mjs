import fs from 'node:fs';
import path from 'node:path';
import {fork} from 'node:child_process';
import {parseArgs} from 'node:util';
import {wire} from '../../propagator-published-truth/wire.mjs';
import {loadArc} from '../arcs.mjs';
import {environment} from '../environment.mjs';
import {outcomeFile} from '../run.mjs';
import {openEngine} from './engine.mjs';
import {here,root,read,write,sha,hashFile,iso,settings,sourceDir,outputDir,outcomePath,registration} from './common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'},ffm:{type:'string'},index:{type:'string'},preflight:{type:'boolean',default:false}}});
if(!values.modules||!values.ffm)throw Error('--modules and --ffm required');
async function worker(index){
  const manifest=read(path.join(outputDir,'manifest.json')),census=read(path.join(sourceDir,'census.json')),object=census.objects[index];if(!object)throw Error('Invalid index');
  const source=outcomeFile(sourceDir,object.key),prior=read(source),out={key:object.key,norad:object.norad,source:object.source,lineage:object.lineage,evidence:object.evidence,
    amendmentId:manifest.amendmentId,sourceOutcomeSha256:hashFile(source),priorFfmStatus:prior.arms?.ffm?.status,priorFfmReason:prior.arms?.ffm?.reason??null,startedUtc:iso(Date.now())};
  let engine;
  try{
    const W=await wire(values.modules),arc=loadArc(object,census,prior.selection,W);if(arc.status!=='eligible')throw Error(`Previously admitted arc is ${arc.status}`);
    const envFor=await environment({modules:values.modules,dir:sourceDir},W),env=envFor(arc);
    Object.assign(out,{status:'evaluated',issue:arc.issue,leads:arc.leads,audit:arc.audit,fitSamples:arc.fit.length,scoreSamples:arc.score.length,environment:env.audit});
    engine=await openEngine(values.modules,values.ffm,W);
    out.arm=await engine.predict(object,arc,env,product=>{const file=path.join(outputDir,'fits',sha(object.key).slice(0,32)+'.json');write(file,product);out.fitSha256=hashFile(file);});
  }catch(e){out.status='evaluated';out.arm={ok:false,status:'fit_or_propagation_failed',method:settings.arm,reason:String(e.message)};}
  finally{await engine?.close();out.finishedUtc=iso(Date.now());write(outcomePath(object.key),out);}
}
async function run(){
  const identity=registration(values.modules,values.ffm),census=read(path.join(sourceDir,'census.json'));
  fs.mkdirSync(outputDir,{recursive:true});const lock=path.join(outputDir,'runner.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,cwd:root,amendmentId:identity.amendmentId}),{flag:'wx'});
  const state={amendmentId:identity.amendmentId,mode:values.preflight?'metadata-preflight':'all-admitted-arcs',total:census.objects.length,completed:0,nativeCompleted:0,preservedMetadata:0,active:{},errors:[],completeCatalog:false,startedUtc:iso(Date.now())};
  const persist=()=>{state.updatedUtc=iso(Date.now());write(path.join(outputDir,'progress.json'),state);};
  try{
    const mf=path.join(outputDir,'manifest.json');if(fs.existsSync(mf)){if(read(mf).amendmentId!==identity.amendmentId)throw Error('Changed registered inputs; retain prior run');}
    else write(mf,{...identity,startedUtc:state.startedUtc,modules:fs.realpathSync(values.modules),ffmModules:fs.realpathSync(values.ffm),runtime:{node:process.version,v8:process.versions.v8},sourceObjects:census.objects.length});
    const jobs=[],lineages=new Set(),priorClasses=new Set();
    for(let index=0;index<census.objects.length;index++){
      const object=census.objects[index],file=outcomeFile(sourceDir,object.key),prior=read(file),eligible=prior.status==='evaluated'&&!!prior.arms?.ffm;
      if(prior.key!==object.key||prior.executionId!==settings.sourceExecutionId||!prior.finishedUtc)throw Error('Foreign/incomplete prior result');
      const cls=prior.arms?.ffm?.ok?'successful':prior.arms?.ffm?.reason;
      if(values.preflight&&(!eligible||(lineages.has(object.lineage)&&priorClasses.has(cls))))continue;
      if(eligible){lineages.add(object.lineage);priorClasses.add(cls);}
      const output=outcomePath(object.key);
      if(fs.existsSync(output)){const old=read(output);if(old.amendmentId!==identity.amendmentId||old.key!==object.key||old.sourceOutcomeSha256!==hashFile(file))throw Error('Foreign checkpoint');if(old.finishedUtc){state.completed++;if(eligible)state.nativeCompleted++;else state.preservedMetadata++;continue;}}
      if(eligible){jobs.push(index);continue;}
      write(output,{key:object.key,norad:object.norad,source:object.source,lineage:object.lineage,evidence:object.evidence,amendmentId:identity.amendmentId,sourceOutcomeSha256:hashFile(file),status:prior.status,reason:prior.reason??'No admitted numerical arc',finishedUtc:iso(Date.now())});state.completed++;state.preservedMetadata++;
    }
    state.scheduled=jobs.length;persist();let cursor=0;
    await Promise.all(Array.from({length:settings.workers},async(_,slot)=>{
      while(cursor<jobs.length){const index=jobs[cursor++],key=census.objects[index].key;
        await new Promise(resolve=>{const child=fork(path.join(here,'run.mjs'),['--modules',values.modules,'--ffm',values.ffm,'--index',String(index)],{cwd:root,stdio:'inherit'});
          state.active[slot]={pid:child.pid,key,startedUtc:iso(Date.now())};persist();
          child.once('error',e=>state.errors.push({key,reason:e.message}));
          child.once('close',(code,signal)=>{const f=outcomePath(key),o=fs.existsSync(f)?read(f):null;if(code===0&&o?.amendmentId===identity.amendmentId&&o.finishedUtc){state.completed++;state.nativeCompleted++;}else state.errors.push({key,code,signal,reason:'No valid terminal worker outcome'});delete state.active[slot];persist();resolve();});});
      }
    }));
    if(state.errors.length||(!values.preflight&&state.completed!==state.total))throw Error('Incomplete execution');
    state.status=values.preflight?'preflight_complete':'complete_available_arm';state.completeAvailableArm=!values.preflight;
  }catch(e){state.status='failed';state.error=e.message;process.exitCode=1;}
  finally{state.finishedUtc=iso(Date.now());persist();fs.unlinkSync(lock);console.log(JSON.stringify(state));}
}
if(values.index!==undefined)await worker(Number(values.index));else await run();
