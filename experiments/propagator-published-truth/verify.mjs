// One real-data E2E: published truth, all adapters, forecasts, scorer and Pc.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { config,root,results,options,newRun,guard,git,read,sha } from './common.mjs';
import { windows,loadArc } from './truth.mjs';
import { wire } from './wire.mjs';
import { environment } from './environment.mjs';
import { engines } from './engines.mjs';
import { pcCases } from './pc.mjs';
import { report } from './report.mjs';

async function verify() {
  const opts=options();
  const absent=[opts.modules,config.environment,config.kernel,config.weather.file,...config.objects.map(o=>o.root),path.join(root,'runs',config.id,'registered','manifest.json')].filter(f=>!fs.existsSync(f));
  if(absent.length){console.error(`PUBLISHED-TRUTH E2E SKIP: pinned local archive/runtime/run missing: ${[...new Set(absent)].join(', ')}. No pass claimed.`);process.exitCode=3;return;}
  guard(opts.modules);
  const p=read(path.join(results,'provenance.json')),summary=read(path.join(results,'summary.json')),pc=read(path.join(results,'pc.json'));
  for(const [file,digest] of Object.entries(p.outputs))assert.equal(sha(fs.readFileSync(path.join(results,file))),digest,`output hash: ${file}`);
  for(const manifest of [p.orbit,p.pc]){
    assert(manifest.completedUtc,'completed run required');
    assert.equal(manifest.moduleCommit,config.moduleCommit);
    assert.deepEqual(manifest.artifacts,config.modules);
    for(const [file,info] of Object.entries(manifest.plan))assert.equal(sha(git(root,'show',`${info.commit}:experiments/${config.id}/${file}`)),info.sha256,`immutable frozen ${file}`);
    for(const [file,digest] of Object.entries(manifest.sourceHashes))assert.equal(sha(git(root,'show',`${manifest.experimentCommit}:experiments/${config.id}/${file}`)),digest,`immutable source ${file}`);
    for(const [file,digest] of Object.entries(manifest.helperHashes)){
      const module=file.startsWith('modules:');
      assert.equal(sha(git(module?opts.modules:root,'show',`${module?config.moduleCommit:manifest.experimentCommit}:${module?file.slice(8):file}`)),digest,`immutable helper ${file}`);
    }
    for(const [file,digest] of Object.entries(manifest.inputs))assert.equal(sha(fs.readFileSync(file)),digest,`input ${file}`);
  }
  for(const [key,digest] of Object.entries(p.rows))assert.equal(sha(fs.readFileSync(path.join(root,'runs',config.id,'registered','rows',`${key}.json`))),digest,`raw arc summary ${key}`);
  assert.equal(summary.arcSummaries.length,windows().length);
  assert.equal(new Set(summary.arcSummaries.map(r=>r.key)).size,windows().length);
  report('registered',true);
  const run=newRun({...opts,run:`verify-${Date.now()}`}),W=await wire(run.modules),env=await environment(run,W),m=await engines(run,W);
  const first=windows().filter((w,i,a)=>a.findIndex(q=>q.family===w.family)===i);
  try{
    for(const w of windows()){
      const arc=loadArc(w,run,W),expected=summary.arcSummaries.find(r=>r.key===w.key);
      assert.equal(arc.excluded,expected.excluded,`${w.key}: all-arc reference selection and axes`);
      if(!arc.excluded){assert.equal(arc.fit.length,expected.fitSamples);assert.deepEqual(arc.leads,expected.leads);}
    }
    for(const w of first){
      const expected=summary.arcSummaries.find(r=>r.key===w.key),arc=loadArc(w,run,W);
      assert.equal(arc.excluded,expected.excluded,`${w.key}: selection`);
      if(arc.excluded)continue;
      assert.equal(arc.fit.length,expected.fitSamples);
      assert.deepEqual(arc.leads,expected.leads);
      const inputs=env(arc);
      for(const arm of config.arms){
        let actual;
        try{actual=await m.predict(arm,w,arc,inputs);}catch(e){actual={ok:false,error:String(e.stack||e).split('\n')[0]};}
        const prior=expected.arms[arm];assert.equal(actual.ok,prior.ok,`${w.key}/${arm}: scientific outcome`);
        if(actual.ok)assert.deepEqual(actual.days,prior.days,`${w.key}/${arm}: every reported orbit/covariance statistic`);
        else assert.equal(actual.error,prior.error,`${w.key}/${arm}: retained failure`);
        console.log(`Replayed ${w.key}/${arm}: ${actual.ok?'identical scores':'identical failure'}`);
      }
    }
    const replay=await pcCases(run,W);assert.deepEqual(replay,pc,'all published Pc outcomes and tolerances');
  }finally{await m.close();run.finish();}
  console.log(`PUBLISHED-TRUTH E2E PASS: immutable provenance, ${first.length} real arcs across all families, exact scores/failures, 21 NASA Pc cases, regenerated report. Scientific covariance failures remain failures; 3D/Monte Carlo/TCA and operational collision calibration are outside scope.`);
}
verify().catch(e=>{console.error(`PUBLISHED-TRUTH E2E FAIL: ${e.stack}`);process.exitCode=1;});
