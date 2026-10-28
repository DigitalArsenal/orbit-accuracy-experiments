// One real-archive E2E: complete denominator/input audit, every available reader
// lineage, native-module replay, and deterministic aggregate regeneration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config,root,read,write,hashFile,runDir,iso } from './common.mjs';
import { execution,outcomeFile,processObject } from './run.mjs';
import { select,loadArc } from './arcs.mjs';
import { wire } from '../propagator-published-truth/wire.mjs';
import { engines } from '../propagator-published-truth/engines.mjs';
import { environment } from './environment.mjs';
import { report } from './report.mjs';
import { verifyInputHashes } from './verify-input-hashes.mjs';

export async function verify(name,modules){
  const dir=runDir(name),manifest=execution(dir,modules),census=read(path.join(dir,'census.json'));
  assert.equal(census.populationCap,null);assert.equal(census.sourceCap,null);
  assert.deepEqual(census.sources.filter(s=>s.registry).map(s=>s.id).sort(),[...config.sourceIds].sort());
  assert.equal(new Set(census.objects.map(o=>o.key)).size,census.objects.length);
  const used=new Set(),representatives=new Map(),allRows=[];
  for(const o of census.objects){
    for(const id of o.files){assert(census.files[id]);used.add(id);}
    const f=outcomeFile(dir,o.key);assert(fs.existsSync(f),`Missing outcome: ${o.key}`);
    const r=read(f);assert.equal(r.key,o.key);assert.equal(r.executionId,manifest.executionId);assert(r.finishedUtc,`Pending: ${o.key}`);
    const s=select(o,census);
    if(s.status==='metadata_eligible')assert.deepEqual(r.selection,s);else assert.equal(r.status,s.status);
    if(r.status==='evaluated'){assert.deepEqual(Object.keys(r.arms),config.arms);if(!representatives.has(o.lineage))representatives.set(o.lineage,{o,r});}
    allRows.push(r);
  }
  await verifyInputHashes(census.files);
  for(const p of census.providers)if(p.completePagination){assert.equal(p.records.length,p.advertisedRecords);assert.equal(new Set(p.records.map(r=>r.frameSha256)).size,p.records.length);}
  for(const c of census.cycles){
    const files=census.files.filter(f=>f.kind==='operator-head'&&f.cycle===c.id);
    assert.equal(files.length,c.files,`Capture manifest mismatch: ${c.id}`);
  }
  const W=await wire(modules),m=await engines({modules},W),env=await environment({dir,modules},W),replays=[];
  const replayDir=path.join(dir,`e2e-replay-${Date.now()}`);
  try{
    for(const [lineage,{o,r}]of representatives){
      const arc=loadArc(o,census,r.selection,W);assert.equal(arc.status,'eligible');
      assert.equal(arc.fit.length,r.fitSamples);assert.equal(arc.score.length,r.scoreSamples);assert.deepEqual(arc.leads,r.leads);
      const replay=await processObject(o,census,replayDir,W,m.predict,env,manifest.executionId);
      for(const arm of config.arms){
        assert.equal(replay.arms[arm].ok,r.arms[arm].ok,`${lineage}/${arm}`);
        assert.equal(replay.arms[arm].status,r.arms[arm].status);
        if(r.arms[arm].ok)assert.deepEqual(replay.arms[arm].days,r.arms[arm].days,`${lineage}/${arm} scores differ`);
        else assert.equal(replay.arms[arm].reason,r.arms[arm].reason);
      }
      replays.push({lineage,key:o.key,arms:config.arms});console.log(JSON.stringify({stage:'native-replay',lineage,key:o.key}));
    }
  }finally{await m.close();}
  assert(replays.length>0,'No real module/reference path could be replayed');
  const destination=path.join(dir,'e2e-report');report(name,destination);
  for(const file of ['summary.json','README.md'])assert.equal(hashFile(path.join(destination,file)),hashFile(path.join(root,'results',config.id,file)),`Published aggregate differs: ${file}`);
  const result={passedAvailablePaths:true,completeCatalog:false,executionId:manifest.executionId,checkedFiles:census.files.length,sourceObjects:census.objects.length,terminalOutcomes:allRows.length,replays,unreconciledSources:census.providers.filter(p=>!p.completePagination).map(p=>p.source),rawFormatGaps:census.rawArchives.filter(r=>r.files.length).map(r=>({source:r.source,root:r.root,status:r.status})),completedUtc:iso(Date.now())};
  write(path.join(dir,'verification.json'),result);
  console.log(`CATALOG CENSUS E2E PASS: ${allRows.length} outcomes, ${replays.length} native lineages; catalog coverage INCOMPLETE`);return result;
}
if(process.argv[1]===new URL(import.meta.url).pathname){
  const{values}=parseArgs({options:{run:{type:'string',default:'catalog'},modules:{type:'string'}}}),modules=values.modules||process.env.SDN_MODULES_ROOT;
  if(!modules||!fs.existsSync(path.join(runDir(values.run),'census.json'))){console.error('SKIPPED: real archive/run and pinned --modules required; not a pass');process.exitCode=2;}else await verify(values.run,modules);
}
