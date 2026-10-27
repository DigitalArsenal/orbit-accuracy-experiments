// Orchestration only: the existing isolated worker performs all native physics.
import fs from 'node:fs';
import path from 'node:path';
import {fork,spawn} from 'node:child_process';
import {parseArgs} from 'node:util';
import {root,read,write,iso} from '../common.mjs';
import {execution,outcomeFile,processObject} from '../run.mjs';
import {select} from '../arcs.mjs';
import {here,settings,registered,prepare} from './common.mjs';

const {values}=parseArgs({options:{modules:{type:'string'},prepare:{type:'boolean',default:false}}});
if(!values.modules)throw Error('--modules required');
const amendment=registered(),{dir}=prepare(),manifest=execution(dir,values.modules),census=read(path.join(dir,'census.json'));
const stateFile=path.join(dir,'replay-execution.json'),old=fs.existsSync(stateFile)?read(stateFile):null;
if(old&&(old.executionId!==manifest.executionId||old.amendmentId!==amendment.amendmentId))throw Error('Replay provenance changed');
const lock=path.join(dir,'runner.lock'),fd=fs.openSync(lock,'wx');
fs.writeSync(fd,JSON.stringify({pid:process.pid,cwd:root,executionId:manifest.executionId,runner:'replay/run.mjs'}));fs.closeSync(fd);
const state={...old,...amendment,pid:process.pid,sourceRun:settings.sourceRun,replayRun:settings.replayRun,executionId:manifest.executionId,startedUtc:old?.startedUtc??iso(Date.now()),resumedUtc:iso(Date.now()),stage:'preparing',workers:settings.workers,total:census.objects.length,completed:0,nativeCompleted:0,metadataCompleted:0,active:{},errors:[],completeCatalog:false};
const persist=()=>{state.updatedUtc=iso(Date.now());state.remaining=state.total-state.completed;write(stateFile,state);};
try{
  const pending=[];
  for(let i=0;i<census.objects.length;i++){
    const object=census.objects[i],f=outcomeFile(dir,object.key),r=fs.existsSync(f)?read(f):null;
    if(r&&(r.executionId!==manifest.executionId||r.key!==object.key||r.startedUtc<state.startedUtc))throw Error(`Foreign replay checkpoint: ${object.key}`);
    const selection=select(object,census);
    if(r?.finishedUtc){state.completed++;if(selection.status==='metadata_eligible')state.nativeCompleted++;else state.metadataCompleted++;continue;}
    if(selection.status==='metadata_eligible'){pending.push(i);continue;}
    // This path returns before loading records or invoking any module.
    write(f,await processObject(object,census,dir,null,null,null,manifest.executionId));
    state.completed++;state.metadataCompleted++;
  }
  state.nativeTotal=state.nativeCompleted+pending.length;state.stage=values.prepare?'prepared':'isolated-full-replay';persist();
  if(!values.prepare){
    let cursor=0;
    await Promise.all(Array.from({length:settings.workers},async(_,slot)=>{
      while(cursor<pending.length){
        const index=pending[cursor++],key=census.objects[index].key;
        await new Promise(resolve=>{
          const p=fork(path.join(here,'../isolation/run.mjs'),['--run',settings.replayRun,'--modules',values.modules,'--index',String(index)],{stdio:'inherit'});
          state.active[slot]={pid:p.pid,key,startedUtc:iso(Date.now())};persist();
          p.once('error',e=>state.errors.push({key,error:e.message}));
          p.once('close',(code,signal)=>{
            const f=outcomeFile(dir,key),r=fs.existsSync(f)?read(f):null;
            if(code===0&&r?.finishedUtc&&r.executionId===manifest.executionId&&r.startedUtc>=state.startedUtc){state.completed++;state.nativeCompleted++;}
            else state.errors.push({key,code,signal,error:'Child did not produce a valid terminal outcome'});
            delete state.active[slot];persist();resolve();
          });
        });
      }
    }));
    if(state.errors.length||state.completed!==state.total)throw Error('Incomplete full replay');
    state.stage='verifying';persist();
    await new Promise((resolve,reject)=>{
      const p=spawn(process.execPath,[path.join(here,'verify.mjs'),'--modules',values.modules],{cwd:root,stdio:'inherit'});
      p.once('error',reject);p.once('exit',(code,signal)=>code===0?resolve():reject(Error(`Replay E2E: exit ${code}, ${signal}`)));
    });
    state.status='complete_available_replay_verified';state.stage='complete';
  }
}catch(e){state.status='failed';state.error=e.message;process.exitCode=1;}
finally{state.stoppedUtc=iso(Date.now());persist();fs.unlinkSync(lock);console.log(JSON.stringify(state));}
