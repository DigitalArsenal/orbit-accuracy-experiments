// A finite unattended batch: prepare an immutable snapshot copy, run every object,
// generate aggregates, then run the real-archive E2E. No publishing or deployment.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { here,read,write,hashFile,registration,runDir,iso } from './common.mjs';

const{values}=parseArgs({options:{from:{type:'string',default:'catalog'},run:{type:'string',default:'catalog-epochs'},modules:{type:'string'}}});
const source=runDir(values.from),dir=runDir(values.run),modules=values.modules||process.env.SDN_MODULES_ROOT;
if(!modules||source===dir)throw new Error('Distinct --from / --run and --modules required');
registration();fs.mkdirSync(dir,{recursive:true});
if(!fs.existsSync(path.join(dir,'census.json'))){
  const expected=read(path.join(source,'census.sha256.json')).sha256;
  if(hashFile(path.join(source,'census.json'))!==expected)throw new Error('Source census changed');
  for(const f of ['census.json','census.sha256.json'])fs.copyFileSync(path.join(source,f),path.join(dir,f),fs.constants.COPYFILE_EXCL);
  fs.cpSync(path.join(source,'environment'),path.join(dir,'environment'),{recursive:true,errorOnExist:true,force:false});
}
const state={pid:process.pid,run:values.run,from:values.from,startedUtc:iso(Date.now()),completeCatalog:false};
write(path.join(dir,'batch-supervisor.json'),state);
try{
  for(const script of ['run.mjs','report.mjs','verify.mjs']){
    state.stage=script;state.updatedUtc=iso(Date.now());write(path.join(dir,'batch-supervisor.json'),state);
    const args=[path.join(here,script),'--run',values.run,...(script==='report.mjs'?[]:['--modules',modules])];
    await new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{stdio:'inherit'});p.on('error',reject);p.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`${script}: exit ${code} / ${signal}`)));});
  }
  state.status='available_batch_verified';state.completedUtc=iso(Date.now());
}catch(e){state.status='failed';state.error=e.message;process.exitCode=1;}
write(path.join(dir,'batch-supervisor.json'),state);
console.log(JSON.stringify(state));
