// Revalidate the frozen replay with its original complete audit. The tracked
// reports retain their first published generation dates; fresh audit timestamps
// remains in the ignored run evidence and the gate receipt. All other result
// fields must match the committed reports exactly before preserving those dates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {root,config} from './common.mjs';
const names=['runtime-replay.json','summary.json','README.md','direct/summary.json','direct/README.md'];
const published=new Map(names.map(name=>{
  const relative=`results/${config.id}/${name}`,file=path.join(root,relative);
  const bytes=execFileSync('git',['-C',root,'show',`HEAD:${relative}`]);
  assert.deepEqual(fs.readFileSync(file),bytes,`Published report must start clean: ${name}`);
  return [name,{file,bytes}];
}));
await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[new URL('./replay/verify.mjs',import.meta.url).pathname,...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
  child.once('error',reject);
  child.once('exit',(code,signal)=>code===0?resolve():reject(Error(`Full replay audit failed: ${code}, ${signal}`)));
});
const fresh=new Map([...published].map(([name,{file}])=>[name,fs.readFileSync(file)]));
const dates={};
for(const [name,key]of [['runtime-replay.json','checkedUtc'],['direct/summary.json','generatedUtc']]){
  const original=JSON.parse(published.get(name).bytes),current=JSON.parse(fresh.get(name));
  assert(Number.isFinite(Date.parse(current[key])));
  assert.deepEqual({...current,[key]:original[key]},original,`Audit results changed: ${name}`);
  dates[name]={original:original[key],current:current[key]};
}
const directDate=dates['direct/summary.json'];
assert.equal(fresh.get('direct/README.md').toString().replace(`Report generated ${directDate.current}.`,`Report generated ${directDate.original}.`),published.get('direct/README.md').bytes.toString(),'Direct-feed report changed');
for(const name of ['summary.json','README.md'])assert.deepEqual(fresh.get(name),published.get(name).bytes,`Numerical report changed: ${name}`);
// Restore only after every regenerated report has passed its equality check.
for(const name of ['runtime-replay.json','direct/summary.json','direct/README.md']){
  const {file,bytes}=published.get(name);fs.writeFileSync(file,bytes);
}
console.log(`PUBLISHED REPLAY E2E PASS: all audit fields reproduced; fresh verification ${dates['runtime-replay.json'].current}`);
