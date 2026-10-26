// Process isolation only. All physical computation and numerical decisions
// remain in the originally registered processObject/engines/module path.
import fs from 'node:fs';
import path from 'node:path';
import {fork,spawn,execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {read,write,sha,root,runDir,iso} from '../common.mjs';
import {execution,outcomeFile,processObject} from '../run.mjs';
import {wire} from '../../propagator-published-truth/wire.mjs';
import {engines} from '../../propagator-published-truth/engines.mjs';
import {environment} from '../environment.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),settings=read(path.join(here,'config.json'));
function registered(){
  if(!settings.frozen)throw Error('Execution amendment is not frozen');
  const sourceHashes={};for(const f of fs.readdirSync(here).filter(x=>/\.(mjs|json|md)$/.test(x))){const rel=path.relative(root,path.join(here,f)),bytes=fs.readFileSync(path.join(here,f));if(!bytes.equals(execFileSync('git',['-C',root,'show',`HEAD:${rel}`])))throw Error(`Uncommitted execution amendment: ${f}`);sourceHashes[rel]=sha(bytes);}
  return {sourceHashes,experimentCommit:execFileSync('git',['-C',root,'rev-parse','HEAD']).toString().trim()};
}
const {values}=parseArgs({options:{run:{type:'string',default:settings.sourceRun},modules:{type:'string'},index:{type:'string'}}});
if(!values.modules)throw Error('--modules required');
const dir=runDir(values.run);
if(values.index!==undefined){
  const manifest=read(path.join(dir,'execution.json')),census=read(path.join(dir,'census.json')),index=Number(values.index),object=census.objects[index];
  if(!Number.isInteger(index)||!object)throw Error('Invalid census index');
  const W=await wire(values.modules),m=await engines({modules:values.modules},W),env=await environment({dir,modules:values.modules},W);
  try{const result=await processObject(object,census,dir,W,m.predict,env,manifest.executionId);write(outcomeFile(dir,object.key),result);}finally{await m.close();}
}else{
  const amendment=registered(),manifest=execution(dir,values.modules),census=read(path.join(dir,'census.json'));
  const lock=path.join(dir,'runner.lock'),fd=fs.openSync(lock,'wx');fs.writeSync(fd,JSON.stringify({pid:process.pid,executionId:manifest.executionId,cwd:root,runner:'isolation/run.mjs'}));fs.closeSync(fd);
  const state={pid:process.pid,executionId:manifest.executionId,...amendment,startedUtc:iso(Date.now()),stage:'isolated-numerical-run',workers:settings.workers,initialTerminal:0,completed:0,total:census.objects.length,active:{},errors:[],completeCatalog:false};
  const pending=[];
  for(let i=0;i<census.objects.length;i++){const f=outcomeFile(dir,census.objects[i].key);if(fs.existsSync(f)){const r=read(f);if(r.executionId!==manifest.executionId)throw Error('Foreign checkpoint');if(r.finishedUtc){state.initialTerminal++;continue;}}pending.push(i);}
  state.completed=state.initialTerminal;state.remaining=pending.length;write(path.join(dir,'isolation-execution.json'),state);
  let cursor=0;
  const persist=()=>{state.updatedUtc=iso(Date.now());state.remaining=state.total-state.completed;write(path.join(dir,'isolation-execution.json'),state);};
  try{
    await Promise.all(Array.from({length:settings.workers},async(_,slot)=>{
      while(cursor<pending.length){
        const index=pending[cursor++],key=census.objects[index].key;
        await new Promise(resolve=>{
          const p=fork(fileURLToPath(import.meta.url),['--run',values.run,'--modules',values.modules,'--index',String(index)],{stdio:'inherit'});
          state.active[slot]={pid:p.pid,key,startedUtc:iso(Date.now())};persist();
          p.once('error',e=>{state.errors.push({key,error:e.message});});
          p.once('close',(code,signal)=>{
            const f=outcomeFile(dir,key),out=fs.existsSync(f)?read(f):null;
            if(code===0&&out?.finishedUtc)state.completed++;else state.errors.push({key,code,signal,error:'Child did not produce a terminal outcome'});
            delete state.active[slot];persist();resolve();
          });
        });
      }
    }));
    if(state.errors.length||state.completed!==state.total)throw Error('Isolated pool has incomplete outcomes');
    write(path.join(dir,'batch.json'),{executionId:manifest.executionId,completedUtc:iso(Date.now()),sourceObjects:census.objects.length,completeAvailableBatch:true,completeCatalog:false,executionAmendment:'isolation-execution.json'});
    for(const script of ['report.mjs','verify-all.mjs']){
      state.stage=script;persist();const args=[path.join(here,'..',script),...(script==='report.mjs'?['--run',values.run]:['--modules',values.modules])];
      await new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{stdio:'inherit',cwd:root});p.once('error',reject);p.once('exit',(code,signal)=>code===0?resolve():reject(Error(`${script}: exit ${code}, ${signal}`)));});
    }
    state.status='available_batch_and_acquisition_verified';
  }catch(e){state.status='failed';state.error=e.message;process.exitCode=1;}
  finally{state.completedUtc=iso(Date.now());persist();fs.unlinkSync(lock);console.log(JSON.stringify(state));}
}
