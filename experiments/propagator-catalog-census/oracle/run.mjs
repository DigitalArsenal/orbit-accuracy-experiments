import fs from 'node:fs';
import path from 'node:path';
import {fork} from 'node:child_process';
import {parseArgs} from 'node:util';
import {wire} from '../../propagator-published-truth/wire.mjs';
import {loadArc} from '../arcs.mjs';
import {outcomeFile} from '../run.mjs';
import {openEngines} from './engine.mjs';
import {here,root,read,write,sha,hashFile,iso,settings,sourceDir,outputDir,outcomePath,registration} from './common.mjs';

const {values}=parseArgs({options:{modules:{type:'string'},oracle:{type:'string'},index:{type:'string'},preflight:{type:'boolean',default:false}}});
values.modules ||= process.env.SDN_MODULES_ROOT;
values.oracle ||= process.env.SDN_AP_ORACLE_ROOT;
if(!values.modules||!values.oracle)throw Error('--modules and --oracle are required');

async function worker(index){
  const manifest=read(path.join(outputDir,'manifest.json')),census=read(path.join(sourceDir,'census.json')),object=census.objects[index];
  if(!object)throw Error('Invalid census index');
  const source=outcomeFile(sourceDir,object.key),prior=read(source),sourceHash=hashFile(source);
  if(prior.key!==object.key||prior.executionId!==settings.sourceExecutionId)throw Error('Foreign source outcome');
  const out={key:object.key,norad:object.norad,source:object.source,lineage:object.lineage,evidence:object.evidence,
    extensionId:manifest.extensionId,sourceOutcomeSha256:sourceHash,startedUtc:iso(Date.now())};
  let engines;
  try{
    const W=await wire(values.modules),arc=loadArc(object,census,prior.selection,W);
    if(arc.status!=='eligible')throw Error(`Previously eligible arc now ${arc.status}`);
    engines=await openEngines(values.modules,values.oracle,W);
    Object.assign(out,{status:'evaluated',issue:arc.issue,leads:arc.leads,audit:arc.audit,fitSamples:arc.fit.length,scoreSamples:arc.score.length},await engines.compare(object,arc,prior.arms['xp-native']));
  }catch(error){out.status='reference_extension_failed';out.reason=String(error.message);}
  finally{await engines?.close();out.finishedUtc=iso(Date.now());write(outcomePath(object.key),out);}
}

async function run(){
  const identity=registration(values.modules,values.oracle),census=read(path.join(sourceDir,'census.json'));
  fs.mkdirSync(outputDir,{recursive:true});
  const lock=path.join(outputDir,'runner.lock'),fd=fs.openSync(lock,'wx');
  fs.writeSync(fd,JSON.stringify({pid:process.pid,cwd:root,extensionId:identity.extensionId}));fs.closeSync(fd);
  const state={extensionId:identity.extensionId,startedUtc:iso(Date.now()),mode:values.preflight?'reader-preflight':'all-source-objects',
    total:census.objects.length,completed:0,nativeCompleted:0,preservedMetadata:0,active:{},errors:[],completeCatalog:false};
  const persist=()=>{state.updatedUtc=iso(Date.now());write(path.join(outputDir,'progress.json'),state);};
  try{
    const file=path.join(outputDir,'manifest.json');
    if(fs.existsSync(file)){if(read(file).extensionId!==identity.extensionId)throw Error('Different extension code or inputs; retain prior run');}
    else write(file,{...identity,startedUtc:state.startedUtc,modules:fs.realpathSync(values.modules),oracleRoot:fs.realpathSync(values.oracle),runtime:{node:process.version,v8:process.versions.v8},sourceObjects:census.objects.length});
    const jobs=[],lineages=new Set();
    for(let index=0;index<census.objects.length;index++){
      const object=census.objects[index],source=outcomeFile(sourceDir,object.key),prior=read(source),output=outcomePath(object.key);
      if(prior.key!==object.key||prior.executionId!==settings.sourceExecutionId||!prior.finishedUtc)throw Error(`Incomplete/foreign source outcome: ${object.key}`);
      const eligible=prior.status==='evaluated'&&prior.arms?.['xp-native']?.ok;
      if(values.preflight&&(!eligible||lineages.has(object.lineage)))continue;
      if(eligible)lineages.add(object.lineage);
      if(fs.existsSync(output)){
        const old=read(output);
        if(old.extensionId!==identity.extensionId||old.key!==object.key||old.sourceOutcomeSha256!==hashFile(source))throw Error(`Foreign extension checkpoint: ${object.key}`);
        if(old.finishedUtc){state.completed++;if(eligible)state.nativeCompleted++;else state.preservedMetadata++;continue;}
      }
      if(eligible){jobs.push(index);continue;}
      write(output,{key:object.key,norad:object.norad,source:object.source,lineage:object.lineage,evidence:object.evidence,
        extensionId:identity.extensionId,sourceOutcomeSha256:hashFile(source),status:prior.status==='evaluated'?'source_xp_fit_unavailable':prior.status,
        reason:prior.reason??prior.arms?.['xp-native']?.reason??'No admitted arc',finishedUtc:iso(Date.now())});
      state.completed++;state.preservedMetadata++;
    }
    state.scheduled=jobs.length;persist();let cursor=0;
    await Promise.all(Array.from({length:settings.workers},async(_,slot)=>{
      while(cursor<jobs.length){
        const index=jobs[cursor++],key=census.objects[index].key;
        await new Promise(resolve=>{
          const child=fork(path.join(here,'run.mjs'),['--modules',values.modules,'--oracle',values.oracle,'--index',String(index)],{cwd:root,stdio:'inherit'});
          state.active[slot]={pid:child.pid,key,startedUtc:iso(Date.now())};persist();
          child.once('error',error=>state.errors.push({key,reason:error.message}));
          child.once('close',(code,signal)=>{
            const file=outcomePath(key),out=fs.existsSync(file)?read(file):null;
            if(code===0&&out?.extensionId===identity.extensionId&&out.finishedUtc){state.completed++;state.nativeCompleted++;}
            else state.errors.push({key,code,signal,reason:'Child has no valid terminal outcome'});
            delete state.active[slot];persist();resolve();
          });
        });
      }
    }));
    state.status=state.errors.length?'incomplete_execution':values.preflight?'preflight_complete':'complete_available_extension';
    if(!values.preflight&&state.completed!==state.total)throw Error('Missing source/object outcomes');
    if(state.errors.length)throw Error('Reference worker failures');
  }catch(error){state.status='failed';state.error=error.message;process.exitCode=1;}
  finally{state.finishedUtc=iso(Date.now());persist();fs.unlinkSync(lock);console.log(JSON.stringify(state));}
}
if(values.index!==undefined)await worker(Number(values.index));else await run();
