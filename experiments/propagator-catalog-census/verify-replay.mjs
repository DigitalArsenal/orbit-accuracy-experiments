// Revalidate the frozen replay with its original complete audit. The tracked
// result retains its first published checkedUtc; each fresh audit timestamp
// remains in the ignored run evidence and the gate receipt. All other result
// fields must match the committed report exactly before preserving that date.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {root,config} from './common.mjs';
const relative=`results/${config.id}/runtime-replay.json`,file=path.join(root,relative);
const published=execFileSync('git',['-C',root,'show',`HEAD:${relative}`]);
assert.deepEqual(fs.readFileSync(file),published,'Published replay report must start clean');
await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[new URL('./replay/verify.mjs',import.meta.url).pathname,...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
  child.once('error',reject);
  child.once('exit',(code,signal)=>code===0?resolve():reject(Error(`Full replay audit failed: ${code}, ${signal}`)));
});
const original=JSON.parse(published),fresh=JSON.parse(fs.readFileSync(file,'utf8'));
assert(Number.isFinite(Date.parse(fresh.checkedUtc)));
assert.deepEqual({...fresh,checkedUtc:original.checkedUtc},original,'Replay results changed');
fs.writeFileSync(file,published);
console.log(`PUBLISHED REPLAY E2E PASS: all audit fields reproduced; fresh verification ${fresh.checkedUtc}`);
