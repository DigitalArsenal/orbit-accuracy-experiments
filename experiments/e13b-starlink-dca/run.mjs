// One archive-to-estimator E2E; deliberately no hypothesis-scoring route.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fitShell,arcsOf,shellOf,forecast,config,scoringAllowed} from './estimator.mjs';
import {verifyReference} from '../operator-capture/collector/verify-reference.mjs';
import {solveCommonMode,arcCenterOffsetMs,windowMean} from '../e13-open-dca/common-mode.mjs';
const repo=path.resolve(new URL('../..',import.meta.url).pathname);
const hash=b=>createHash('sha256').update(b).digest('hex');
const root=process.env.OPERATOR_CAPTURE_ROOT??config.captureRoot;
const args=process.argv.slice(2);
if(!args.includes('--check'))scoringAllowed();
const started=new Date().toISOString(),cpu0=process.cpuUsage();
const stat=fs.statfsSync(root);assert(stat.bavail*stat.bsize>=25*2**30,'disk below 25 GiB');
for(const name of ['PLAN.md','config.json'])assert(fs.readFileSync(new URL(name,import.meta.url)).equals(execFileSync('git',['show',`HEAD:experiments/e13b-starlink-dca/${name}`],{cwd:repo})),'registration must be committed');
assert(config.frozen);
const cycles=fs.readFileSync(path.join(root,'cycles.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const cycle=cycles.find(c=>['complete','partial'].includes(c.status)&&c.files+c.failures===c.listed);
assert(cycle,'SKIPPED: no finished full-manifest capture cycle yet');
assert(cycle.files/cycle.listed>=0.995,'capture completeness below 99.5%; inspect failures');
assert(cycle.cpuSeconds/cycle.wallSeconds<=0.55,'CPU duty above registered bound');
assert.equal(cycle.registration.configSha256,hash(fs.readFileSync(new URL('config.json',import.meta.url))));
const release=path.join(root,'_collector/releases',cycle.registration.componentCommit);
const reference=await verifyReference(path.join(release,'modules'));
const directory=path.join(root,'cycles',cycle.id),files=fs.readdirSync(directory).filter(f=>/^\d+\.json.gz$/.test(f)).sort();
assert.equal(files.length,cycle.files);
const inputs=createHash('sha256'),shells=new Map();let samples=0,truth=0,coasts=0,segments=0;
for(const name of files){
  const bytes=fs.readFileSync(path.join(directory,name));inputs.update(name);inputs.update(bytes);
  const record=JSON.parse(gunzipSync(bytes));
  assert.equal(record.samples.length,49);assert.equal(record.source.rawPersisted,false);assert.equal(record.source.bytes,record.source.range[1]+1);assert(record.source.bytes<=262144);
  assert.equal(record.frame,'GCRF');
  record.samples.forEach((p,i)=>{assert.equal(p.ms-record.samples[0].ms,i*600000);assert(Number.isFinite(p.energyJkg));assert(Number.isFinite(p.cumulativeDragWorkB1Jkg));assert.equal(p.meanElements.length,6);assert(p.meanElements.every(Number.isFinite));});
  for(const p of record.truth){assert.equal(p.stateM.length,6);assert(p.stateM.every(Number.isFinite));assert(p.ms>=record.samples[0].ms&&p.ms<=record.samples.at(-1).ms);if(p.registeredMs)assert(p.ms>=p.registeredMs);}
  const shell=shellOf(record),a=arcsOf(record,shell);if(!shells.has(shell))shells.set(shell,{coast:[],thrust:[]});
  shells.get(shell).coast.push(...a.coast);shells.get(shell).thrust.push(...a.thrust);
  samples+=49;truth+=record.truth.length;coasts+=a.coast.length;segments+=a.thrust.length;
}
assert.equal(samples,cycle.samples);assert.equal(truth,cycle.truthStates);
const store=path.join(root,'estimator');fs.mkdirSync(store,{recursive:true});
const firstCycle=[];
for(const [shell,arcs]of shells){
  const sol=fitShell(arcs.coast,arcs.thrust);
  if(sol.s){assert(sol.s.every(Number.isFinite));assert(Math.abs(sol.s.reduce((a,b)=>a+b,0))<1e-8);assert(Object.values(sol.baseline).flat().every(x=>Number.isFinite(x)&&x>0));assert(Object.values(sol.kappa).every(x=>Number.isFinite(x.value)&&x.value>=0));
    const last=sol.nodeMs[sol.supported.lastIndexOf(true)],v=forecast(sol,last+48*3600000);if(sol.status==='CONVERGED')assert(Number.isFinite(v));else assert.equal(v,null);}
  fs.writeFileSync(path.join(store,`mechanics-${cycle.id}-${shell.replace(':','-')}.json`),JSON.stringify(sol)+'\n');
  firstCycle.push({shell,status:sol.status,reason:sol.reason??null,coastArcs:sol.coastArcs??0,calibrationSatellites:sol.calibrationSatellites??0,nodes:sol.s?.length??0,sweeps:sol.sweeps??0,lastChange:sol.lastChange??null,identifiedKappas:Object.values(sol.kappa??{}).filter(k=>k.identified).length,priorOnlyKappas:Object.values(sol.kappa??{}).filter(k=>!k.identified).length});
}
assert(firstCycle.some(s=>s.status==='CONVERGED'),'no first-cycle shell converged');
const planetPath='/opt/data/sdn-archive/e13-open-dca/planet-arcs/dev-g24lean.msis.jsonl';
assert(fs.existsSync(planetPath),'SKIPPED: E13 Planet development archive absent');
const planetBytes=fs.readFileSync(planetPath),selection=JSON.parse(fs.readFileSync(path.join(repo,'experiments/e13-open-dca/planet-sample.json')));
const planetRows=planetBytes.toString().trim().split('\n').map(JSON.parse).filter(r=>r.utcA>='2025-10-01'&&r.utcA<'2025-10-31'&&r.cdAreaOverMassN>0&&r.sigmaLnB<0.5).map(r=>({id:r.hwid,startMs:Date.parse(r.utcA),endMs:Date.parse(r.utcA)+r.hours*3600000,y:Math.log(r.cdAreaOverMassN)}));
const planet=fitShell(planetRows,[],{calibrationIds:selection.calibration});assert.equal(planet.status,'CONVERGED');assert(planet.coastArcs>=500&&planet.calibrationSatellites>=20);
assert(Object.keys(planet.baseline).every(id=>selection.calibration.includes(id)),'E13 held-out satellite entered calibration');
assert(Object.values(planet.kappa).every(k=>!k.identified&&k.value===config.solver.kappaPrior),'Planet data cannot identify thrust kappa');
const legacyArcs=planetRows.filter(r=>selection.calibration.includes(r.id)).map(r=>({...r,dove:r.id}));
const legacy=solveCommonMode(legacyArcs,{anchorMs:Date.parse('2025-10-01T00:00:00Z')+arcCenterOffsetMs(legacyArcs),nodeHours:24,baseline:{kind:'randomWalk',stepSigma:0.005},smoothSigma:0.05,iterations:100,tolerance:1e-6});
assert(legacy.converged,'E13 reference solver did not converge');
const comparison=legacyArcs.map(r=>[windowMean(legacy,r.startMs,r.endMs),windowMean({...planet,stepMs:86400000,nMin:0},r.startMs,r.endMs)]).filter(p=>p.every(Number.isFinite));
const differences=comparison.map(p=>p[1]-p[0]),level=differences.reduce((a,b)=>a+b,0)/differences.length;
const centeredRmsLogDifference=Math.sqrt(differences.reduce((v,d)=>v+(d-level)**2,0)/differences.length);
// Mechanics tolerance: the new prior, grid and second-difference smoother
// differ from E13. This is not a confirmatory density endpoint.
assert(comparison.length>=500&&centeredRmsLogDifference<0.05,'new solver differs materially from E13 on development arcs');
fs.writeFileSync(path.join(store,'mechanics-planet-dev.json'),JSON.stringify(planet)+'\n');
const cpu=process.cpuUsage(cpu0),manifest={status:'PASS',kind:'mechanics-only; no hypothesis tests',command:process.argv.join(' '),startedUtc:started,endedUtc:new Date().toISOString(),componentCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),configSha256:hash(fs.readFileSync(new URL('config.json',import.meta.url))),planSha256:hash(fs.readFileSync(new URL('PLAN.md',import.meta.url))),sourceHashes:Object.fromEntries(['run.mjs','estimator.mjs'].map(n=>[n,hash(fs.readFileSync(new URL(n,import.meta.url)))])),reference,
  capture:{...Object.fromEntries(['id','status','listed','files','failures','samples','truthStates','bytes','requests','cpuSeconds','wallSeconds','storedBytes'].map(k=>[k,cycle[k]])),inputDigest:inputs.digest('hex'),registration:cycle.registration},firstCycle,
  planet:{inputPath:planetPath,inputSha256:hash(planetBytes),window:['2025-10-01','2025-10-31'],status:planet.status,coastArcs:planet.coastArcs,calibrationSatellites:planet.calibrationSatellites,sweeps:planet.sweeps,lastChange:planet.lastChange,residualLogScale:planet.sigma,legacyComparison:{pairedArcs:comparison.length,centeredRmsLogDifference,tolerance:0.05,referenceSourceSha256:hash(fs.readFileSync(path.join(repo,'experiments/e13-open-dca/common-mode.mjs')))},kappa:'unidentified; prior-only (no thrust segments)'},cpuSeconds:(cpu.user+cpu.system)/1e6,
  skipped:['Hypothesis tests and head-to-head: prospective window incomplete','Position propagation and independent density scoring: coordinator scoring run','Docker parity: owner waiver 2026-10-22','Node-flow AOT: not a node-flow artifact; pinned experimental SDK harness'],scoringNotBefore:config.window.truthEnd};
fs.writeFileSync(path.join(store,'mechanics-latest.json'),JSON.stringify(manifest,null,2)+'\n');
if(args.includes('--record')){const out=path.join(repo,'results/e13b');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'mechanics.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(out,'README.md'),`# E13b mechanics evidence\n\nGenerated by the registered E2E from [mechanics.json](mechanics.json).\nThe [prospective plan](../../experiments/e13b-starlink-dca/PLAN.md) is frozen; no hypothesis has been tested.\n\nCapture cycle ${cycle.id}: ${cycle.files}/${cycle.listed} files, ${cycle.failures} failures, ${samples} derived samples and ${truth} registered truth states. Transferred ${cycle.bytes} bytes; ${cycle.cpuSeconds.toFixed(3)} CPU seconds over ${cycle.wallSeconds.toFixed(3)} wall seconds; ${cycle.storedBytes} compressed product bytes.\n\nThe estimator converged in ${firstCycle.filter(x=>x.status==='CONVERGED').length}/${firstCycle.length} shells. Unsupported or unconverged shells remain explicit in the JSON and produce no forecast. Planet development: ${planet.coastArcs} arcs from ${planet.calibrationSatellites} calibration Doves, ${planet.sweeps} sweeps; comparison with E13's solver on ${comparison.length} common arcs has centered RMS log-scale difference ${centeredRmsLogDifference.toFixed(6)} (mechanics tolerance 0.05). Planet thrust coefficients remain prior-only. The real WASM Brouwer conversion passes the public Basilisk reference.\n\nScoring cannot begin before ${config.window.truthEnd}, and needs registered coverage plus independent truth availability. The period is 2026-10-24 through 2026-11-28 exclusive (seven warm-up days, 28 held-out days), with 72-hour truth tails. Swarm/GRACE-FO density products may arrive later.\n\nTransport amendments A1–A3 are documented in the plan. Operator heads retain forecast/OD-model assumptions; absolute density and B are not independently identified, continuous thrust is confounded without coasts, and SRP work is a diagnostic limitation. A Starlink-only correction can be published without the Planet NonCommercial tag under the owner's ruling; Planet rows remain local.\n\nSkipped: hypothesis tests, Dove head-to-head and propagation scoring (future scoring run); Docker (owner waiver); node AOT (this experiment uses its pinned SDK WASM harness). No production node was accessed or deployed.\n`);
}
console.log(`E13B-E2E PASS: ${cycle.files}/${cycle.listed} files, ${samples} samples; Planet ${planet.coastArcs} arcs; ${firstCycle.filter(x=>x.status==='CONVERGED').length} converged shells; no hypothesis tests`);
