// Audit every retained input byte. Bounded workers overlap independent file
// reads; each worker reuses one 1 MiB buffer, with no hash-result cache.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';

export async function verifyInputHashes(files) {
  if(!files.length)return;
  const count=Math.min(8,files.length),workers=[];
  let checked=0,nextProgress=50000;
  try {
    await Promise.all(Array.from({length:count},(_,slot)=>new Promise((resolve,reject)=>{
      const worker=new Worker(new URL(import.meta.url),{workerData:files.filter((_,i)=>i%count===slot).map(({path,sha256})=>({path,sha256}))});
      workers.push(worker);
      worker.on('message',n=>{
        checked+=n;
        if(checked>=nextProgress){console.log(JSON.stringify({stage:'hash-audit',files:checked}));nextProgress+=50000;}
      });
      worker.once('error',reject);
      worker.once('exit',code=>code===0?resolve():reject(Error(`Input hash audit worker exited ${code}`)));
    })));
    assert.equal(checked,files.length,'Every input must be hashed in this verification');
  } finally {
    await Promise.allSettled(workers.map(worker=>worker.terminate()));
  }
}

if(!isMainThread){
  const buffer=Buffer.allocUnsafe(1<<20);
  let pending=0;
  for(const file of workerData){
    const hash=createHash('sha256'),fd=fs.openSync(file.path,'r');
    try {for(;;){const n=fs.readSync(fd,buffer);if(!n)break;hash.update(buffer.subarray(0,n));}}
    finally {fs.closeSync(fd);}
    assert.equal(hash.digest('hex'),file.sha256,`Changed archive input: ${file.path}`);
    if(++pending===1000){parentPort.postMessage(pending);pending=0;}
  }
  if(pending)parentPort.postMessage(pending);
}
