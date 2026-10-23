import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {config,store,dir,root,read,write,sha256,sourceHashes,moduleRoot} from './common.mjs';
import {quantile} from '../../harness/stats.mjs';
const output=path.join(root,'results/v2');
const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
function derive(cycle) {
  const rows=cycle.records.map(r=>{const bytes=fs.readFileSync(path.join(store,r.path));assert.equal(sha256(bytes),r.sha256);const row=JSON.parse(zlib.gunzipSync(bytes));assert.equal(row.norad,r.norad);return row;});
  const counts={},rms=[],replay=[];let predictions=0,unavailableFfmEpochs=0,mechanics=null;
  for(const row of rows){unavailableFfmEpochs+=row.forecastCoverage?.unavailableEpochsUtc.length??0;assert.equal(row.fitWindow.points,288);assert(row.fitWindow.joinExcluded);assert(Date.parse(row.source.retrievedUtc)<=Date.parse(row.issueUtc));assert(Date.parse(row.source.createdUtc)<=Date.parse(row.issueUtc));
    assert(!('points'in row)&&!('raw'in row)&&!('bytes'in row)&&!('observations'in row));
    for(const [arm,a] of Object.entries(row.arms)){const key=`${arm}:${a.status}`;counts[key]=(counts[key]??0)+1;predictions+=a.prediction?.samples?.length??0;if(a.fit){assert.equal(a.fit.fitPoints,288);rms.push(a.fit.rms3dM);replay.push(a.fit.fitReplayDifferenceM);assert(a.product.parameters.length>0);assert(a.fitId);}}
    if(row.mechanics) {const m=row.mechanics;assert.deepEqual(m.ablations.map(a=>a.term),config.trimming.candidates);assert.equal(new Set(m.ablations.map(a=>JSON.stringify(a.forces))).size,5);assert(m.ablations.every(a=>a.comparison.errorRtn?.every(Number.isFinite)));assert(m.repeatComparison.errorRtn.every(x=>Math.abs(x)<1e-6));mechanics={horizonHours:m.horizonHours,ablations:m.ablations.map(a=>({term:a.term,differenceRtnM:a.comparison.errorRtn,cpuSeconds:a.cpuSeconds})),fullCpuSeconds:m.fullCpuSeconds,repeatCpuSeconds:m.repeatCpuSeconds,accuracyDecision:m.accuracyDecision};}
  }
  return {phase:'commissioning; prospective scores pending',objects:rows.length,cycleRequested:cycle.requested,cycleLimit:cycle.cycleLimit,cycleComplete:cycle.completed,attempted:cycle.attempted,failed:cycle.failed,missing:cycle.missing,armStatuses:counts,predictions,unavailableFfmEpochs,timingAdmissible:cycle.timingAdmissible,pauseSeconds:cycle.pauseSeconds,fitRms3dMedianM:rms.length?quantile(rms,.5):null,maxFitReplayDifferenceM:replay.length?Math.max(...replay):null,bandwidthBytes:cycle.bandwidthBytes,computeCpuSeconds:cycle.computeCpuSeconds,storageBytes:cycle.storageBytes,wallSeconds:cycle.wallSeconds,mechanics,earliestScoringUtc:config.window.earliestScoreUtc};
}
function report(m,c) {return `# V2 collector commissioning\n\nGenerated from cycle ${c.id}. Frozen plan: [PLAN](../../experiments/v2-operator-seeded-prediction/PLAN.md).\n\n${m.objects}/${m.cycleLimit} commissioned objects; full registered subset ${m.cycleRequested}. ${m.predictions} stored prediction states; ${m.unavailableFfmEpochs} requested FFM epochs unavailable because causal weather coverage is incomplete. ${m.failed} failures, ${m.missing} absent files. Cycle completed: ${m.cycleComplete}.\n\nTransferred ${m.bandwidthBytes} bytes; measured collector CPU ${m.computeCpuSeconds} s; stored ${m.storageBytes} bytes; wall ${m.wallSeconds} s. Timing admissible for speed-up claims: ${m.timingAdmissible}; load-pause seconds ${m.pauseSeconds}. RMS replay maximum difference ${m.maxFitReplayDifferenceM} m.\n\n${Object.entries(m.armStatuses).filter(([k])=>k.endsWith(':NONCONVERGED')).reduce((n,[,count])=>n+count,0)} fits reached the registered iteration limit without convergence; these predictions are commissioning evidence only.\n\nFive force switches exercised on one real fitted object at 6 h, with a repeated full-force control. This is a mechanics check, not an accuracy result. See metrics.json for measured differences.\n\nProspective scoring awaits at least 14 issue days / 21 capture days, no earlier than ${m.earliestScoringUtc}. Missing DCA/operator-fit/SGP4 baselines remain unavailable in armStatuses. No accuracy, covariance-realism or trimming-speed-up claim has been established. Docker waived by owner; no unit suites or production deployment.\n`;}
if(process.argv.includes('--check')) {
  const manifest=read(path.join(output,'manifest.json')),cycle=read(path.join(store,manifest.cycle));
  assert.equal(sha256(fs.readFileSync(path.join(store,manifest.cycle))),manifest.cycleSha256);
  assert.equal(sha256(fs.readFileSync(path.join(dir,'config.json'))),manifest.configSha256);
  const env=cycle.provenance.environment;assert.equal(sha256(fs.readFileSync(env.weatherPath)),env.weatherSha256);for(const input of [env.eop,env.kernel])assert.equal(sha256(fs.readFileSync(input.path)),input.sha256);
  assert(config.frozen&&cycle.completed&&cycle.fitted>0&&cycle.failed===0);
  for(const [name,hash] of Object.entries(cycle.sources))assert.equal(sha256(fs.readFileSync(path.join(dir,name))),hash,`collector source changed: ${name}`);
  for(const m of cycle.provenance.modules)assert.equal(sha256(fs.readFileSync(path.join(moduleRoot(),m.path,'dist/isomorphic/module.wasm'))),m.wasmSha256,`WASM changed: ${m.path}`);
  const metrics=derive(cycle);assert(metrics.mechanics);assert.deepEqual(metrics,read(path.join(output,'metrics.json')));assert.equal(report(metrics,cycle),fs.readFileSync(path.join(output,'README.md'),'utf8'));
  console.log(`V2-E2E PASS: ${metrics.objects} commissioning objects, ${metrics.predictions} predictions, 5 trimming controls; prospective scoring NOT RUN`);
} else if(arg('--record')) {
  const file=arg('--record'),cycle=read(path.join(store,'cycles',file+'.json')),metrics=derive(cycle);
  assert(cycle.completed&&cycle.fitted>0&&metrics.mechanics,'incomplete commissioning evidence');
  write(path.join(output,'metrics.json'),metrics);write(path.join(output,'manifest.json'),{cycle:`cycles/${file}.json`,cycleSha256:sha256(fs.readFileSync(path.join(store,'cycles',file+'.json'))),configSha256:sha256(fs.readFileSync(path.join(dir,'config.json'))),modules:cycle.provenance.modules});
  fs.writeFileSync(path.join(output,'README.md'),report(metrics,cycle));console.log('V2 commissioning aggregates recorded');
} else {console.log('Use collect.mjs for capture; run.mjs --record <cycle-id> then --check for commissioning. Headline scoring remains locked until '+config.window.earliestScoreUtc);}
