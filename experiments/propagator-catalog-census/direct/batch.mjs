import path from 'node:path';
import {spawn} from 'node:child_process';
import {parseArgs} from 'node:util';
import {here,root,runDir,write,iso,registration} from './common.mjs';
const {values}=parseArgs({options:{run:{type:'string',default:'direct-20261026-r2'},modules:{type:'string'},from:{type:'string'}}});
if(!values.modules)throw Error('--modules required');registration(values.modules);
const state={pid:process.pid,startedUtc:iso(),run:values.run};
try{
  for(const file of ['collect.mjs','verify.mjs']){
    state.stage=file;write(path.join(runDir(values.run),'supervisor.json'),state);
    const args=[path.join(here,file),'--run',values.run,'--modules',values.modules,...(file==='collect.mjs'&&values.from?['--from',values.from]:[])];
    await new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:root,stdio:'inherit'});p.on('error',reject);p.on('exit',(code,signal)=>code===0?resolve():reject(Error(`${file}: exit ${code}, signal ${signal}`)));});
  }
  state.status='acquisition_verified';
}catch(e){state.status='failed';state.error=e.message;process.exitCode=1;}
state.completedUtc=iso();write(path.join(runDir(values.run),'supervisor.json'),state);console.log(JSON.stringify(state));
