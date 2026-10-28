// Task completion needs both the frozen numerical census and direct acquisition.
import {spawn} from 'node:child_process';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{modules:{type:'string'}}});
if(!values.modules)throw Error('--modules required');
for(const [script,run]of [['verify.mjs','catalog-epochs'],['direct/verify.mjs','direct-20261026-r2']]){
  await new Promise((resolve,reject)=>{
    const p=spawn(process.execPath,[new URL(script,import.meta.url).pathname,'--run',run,'--modules',values.modules],{stdio:'inherit'});
    p.on('error',reject);p.on('exit',(code,signal)=>code===0?resolve():reject(Error(`${script}: exit ${code}, signal ${signal}`)));
  });
}
