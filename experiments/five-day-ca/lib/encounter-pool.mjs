// Independent registered groups run in separate module hosts; seeds and draws are unchanged.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {analysisProvenance,hash,store} from '../guard.mjs';
export async function runEncounterPool(){
 const runId=String(Date.now()),out=`${store}/encounters`,children=new Set(),parts=12;
 fs.mkdirSync(out,{recursive:true});
 const stop=()=>{for(const child of children)child.kill('SIGTERM');};
 process.on('SIGTERM',stop);
 try{
  const statuses=await Promise.allSettled(Array.from({length:parts},async(_,part)=>{
   const fd=fs.openSync(`${out}/${runId}-part-${part}.log`,'w');
   const child=spawn(process.execPath,['--max-old-space-size=3072','experiments/five-day-ca/encounters.mjs','--part',`${part}/${parts}`,'--run-id',runId],{env:process.env,stdio:['ignore',fd,fd]});
   children.add(child);fs.closeSync(fd);
   const [code]=await once(child,'exit');children.delete(child);
   if(code!==0){stop();throw Error(`encounter part ${part} exited ${code}; see ${out}/${runId}-part-${part}.log`);}
   console.log(JSON.stringify({encounterPart:part,code}));
   return JSON.parse(fs.readFileSync(`${out}/${runId}-part-${part}.json`));
  }));
  const failed=statuses.find(s=>s.status==='rejected');if(failed)throw failed.reason;
  const results=statuses.map(s=>s.value),first=results[0];
  for(const r of results)if(JSON.stringify(r.inputs)!==JSON.stringify(first.inputs))throw Error('encounter workers read different input snapshots');
  const rawFile=`${out}/calibrated-${runId}.jsonl`,stream=fs.createWriteStream(rawFile),rawParts=[];
  for(const r of results){if(hash(fs.readFileSync(r.rawFile))!==r.rawSha256)throw Error('encounter part hash changed');rawParts.push({file:r.rawFile,sha256:r.rawSha256});for await(const chunk of fs.createReadStream(r.rawFile))if(!stream.write(chunk))await once(stream,'drain');}
  stream.end();await once(stream,'finish');
  const cells=results.flatMap(r=>r.cells),paired=results.flatMap(r=>r.paired);
  const result={...first,provenance:analysisProvenance(),workerCount:parts,rawFile,rawSha256:hash(fs.readFileSync(rawFile)),rawParts,cells,paired,complete:results.every(r=>r.complete)&&cells.length===1080&&paired.length===2160};
  fs.writeFileSync('results/five-day-ca/encounters.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({cells:cells.length,paired:paired.length,encounters:cells.reduce((n,c)=>n+c.n,0),complete:result.complete,workerCount:parts}));
 }finally{process.off('SIGTERM',stop);}
}
