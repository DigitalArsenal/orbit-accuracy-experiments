// One E2E: real archive, pinned modules, registration provenance, and complete tables.
import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {rand} from '../operator-theory/lib/compare.mjs';
import {describe,contrast,week} from './lib/statistics.mjs';
import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {aggregate,report} from './table.mjs';
import {config,registration,hash} from './guard.mjs';
import {readRows} from './statistics.mjs';
import {openPc} from './lib/ca-reach.mjs';
registration();
const now=aggregate(),failures=[];
const check=(condition,reason)=>{if(!condition)failures.push(reason);};
const saved=JSON.parse(fs.readFileSync('results/five-day-ca/metrics.json'));
assert.deepEqual(now,saved,'aggregate regeneration');
assert.equal(report(now),fs.readFileSync('results/five-day-ca/README.md','utf8'),'report regeneration');
check(now.reproduction.compared>0,'no old-lead evidence');
check(now.reproduction.different===0,'old leads differ');
check(now.reproduction.missingReference===0,'old-lead reference missing');
check(now.armDayCoverage.every(c=>c.expected===c.scored+c.excluded&&c.missing===0),'arm/arc/day coverage incomplete');
let productReplayScalars=0,productReplayDifferences=0;
for(const label of ['regimes','truth2','truth']){const baseline=new Map(readRows(`${config.store}/cheap/${label}`).map(r=>[r.key,r]));for(const row of readRows(`${config.store}/products/${label}`))for(const [arm,a]of Object.entries(row.arms))for(const [day,v]of Object.entries(a.days??{}))for(const field of ['e','r','t','n']){productReplayScalars++;productReplayDifferences+=v[field]!==baseline.get(row.key)?.arms?.[arm]?.days?.[day]?.[field];}}
check(productReplayDifferences===0,'covariance-product forecast replay differs');
const selected=readRows(`${config.store}/cheap/regimes`).find(r=>['AP72','XP72','S72','U72'].every(a=>[1,2,3,4,5,7].every(d=>Number.isFinite(r.arms[a]?.days?.[d]?.e))));
assert(selected,'no complete six-day replay window');
const selectedF=readRows(`${config.store}/ffm/regimes`).find(r=>r.key===selected.key);assert(selectedF,'no F replay window');Object.assign(selected.arms,selectedF.arms);
const out=`${config.store}/check/${Date.now()}`;
const run=spawnSync(process.execPath,['experiments/five-day-ca/regimes.mjs','--wasm','/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm','--out',out,'--groups',selected.group,'--key',selected.key,'--arms','AP,XP,S,U,F'],{env:{...process.env,SDN_MODULES_ROOT:config.modulesRoot},encoding:'utf8',timeout:300000});
assert.equal(run.status,0,run.stderr);
const replay=JSON.parse(fs.readFileSync(`${out}/rows-0.jsonl`,'utf8').trim());
let scalars=0,replayDifferences=0,replayMaxAbsKm=0,replayRejected=0;const replayByArm={};
for(const [arm,a] of Object.entries(selected.arms))for(const [day,values]of Object.entries(a.days??{}))for(const [field,value]of Object.entries(values)){const actual=replay.arms[arm]?.days?.[day]?.[field];const delta=Number.isFinite(actual)?Math.abs(actual-value):Infinity;const code=arm.replace(/\d+/g,'');const c=replayByArm[code]??={scalars:0,differences:0,maxAbsKm:0,toleranceKm:code==='U'?.001:0};c.scalars++;c.maxAbsKm=Math.max(c.maxAbsKm,delta);if(delta!==0){replayDifferences++;c.differences++;replayMaxAbsKm=Math.max(replayMaxAbsKm,delta);}if(delta>c.toleranceKm)replayRejected++;scalars++;}
check(replayRejected===0,'six-day module replay exceeds its arm tolerance');
// Independent expanded-draw reference on real archive windows for the weighted bootstrap.
const real=readRows(`${config.store}/cheap/regimes`).filter(r=>r.group==='LS'&&Number.isFinite(r.arms.AP72?.days?.[5]?.e)&&Number.isFinite(r.arms.XP72?.days?.[5]?.e)).map(r=>({cutoff:r.cutoff,e:r.arms.AP72.days[5].e,r:r.arms.AP72.days[5].r,t:r.arms.AP72.days[5].t,n:r.arms.AP72.days[5].n,x:r.arms.AP72.days[5].e,y:r.arms.XP72.days[5].e}));
const percentile=(values,q)=>{const a=values.sort((a,b)=>a-b),at=(a.length-1)*q,lo=Math.floor(at),hi=Math.ceil(at);return lo===hi||a[lo]===a[hi]?a[lo]:a[lo]+(a[hi]-a[lo])*(at-lo);};
const expanded=(fn,label)=>{const units=[...Map.groupBy(real,r=>week(r.cutoff)).values()],rng=rand(parseInt(crypto.createHash('sha256').update(`20261103|${label}`).digest('hex').slice(0,8),16)),v=[];for(let k=0;k<10000;k++){const draw=[];for(let i=0;i<units.length;i++)draw.push(...units[Math.floor(rng()*units.length)]);v.push(fn(draw));}return [percentile([...v],.025),percentile([...v],.975)];};
const fastDescription=describe(real,'E2E median'),fastContrast=contrast(real,'E2E contrast');
const references=[expanded(r=>percentile(r.map(x=>x.e),.5),'E2E median'),expanded(r=>percentile(r.map(x=>Math.log(x.x/x.y)),.5),'E2E contrastmedian'),expanded(r=>Math.log(percentile(r.map(x=>x.x),.95)/percentile(r.map(x=>x.y),.95)),'E2E contrastp95')];
assert.deepEqual([fastDescription.ci95,fastContrast.ci95,fastContrast.p95CI95],references,'bootstrap differs from expanded cluster draws');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const registrationCommit='eb143664cad7ab97133184d4d0b217592f81b5a8';
const registrationMs=Date.parse(git('show','-s','--format=%cI',registrationCommit));
let manifests=0;
for(const phase of ['cheap','ffm'])for(const label of ['regimes','truth2','truth']){
 const dir=`${config.store}/${phase}/${label}`;if(!fs.existsSync(dir))continue;
 for(const f of fs.readdirSync(dir).filter(f=>/^manifest-\d+-\d+\.json$/.test(f))){const m=JSON.parse(fs.readFileSync(`${dir}/${f}`));assert(Date.parse(m.started)>=registrationMs,'resumed manifest predates amended registration');assert.equal(m.sources['experiments/five-day-ca/FIVE-DAY.md'],hash(git('show',`${m.commit}:experiments/five-day-ca/FIVE-DAY.md`)+'\n'));manifests++;}
}
assert(manifests>0,'no resumed registration manifests');
const pc=await openPc();let oracleError=0;
try{for(const [v,h]of [[10000,10],[2500,100]])oracleError=Math.max(oracleError,Math.abs(await pc.pc([v,0,v],h)+Math.expm1(-h*h/(2*v))));assert(oracleError<=1e-12);}finally{await pc.close();}
for(const file of ['statistics.json','ca-reach.json','covariance.json','encounters.json'])check(fs.existsSync(`results/five-day-ca/${file}`),`${file} unmeasured`);
let syntheticCells=0,syntheticEncounters=0,syntheticPcFailures=0,syntheticPairedCells=0;
if(fs.existsSync('results/five-day-ca/encounters.json')){const e=JSON.parse(fs.readFileSync('results/five-day-ca/encounters.json'));syntheticCells=e.cells.length;syntheticEncounters=e.cells.reduce((n,c)=>n+c.n,0);syntheticPcFailures=e.cells.reduce((n,c)=>n+c.pcFailed,0);check(e.complete===true,'synthetic arms and paired scores incomplete');syntheticPairedCells=e.paired?.length??0;check(syntheticPairedCells===e.cells.length*2,'paired score cell coverage');for(const p of e.paired??[]){assert.equal(p.n+p.unpaired,p.draws);assert.equal(p.brier.n,p.n);assert.equal(p.log.n+p.undefinedLog,p.n);assert.equal(p.brier.bootstrapDraws,10000);if(p.n>0)assert.equal(p.brier.bootstrapDefined,10000);}for(const [file,pin]of Object.entries(e.inputs))assert.equal(hash(fs.readFileSync(file)),pin,'synthetic input snapshot');for(const c of e.cells){check(!Object.entries(c.errors??{}).some(([reason,n])=>n>0&&/not run|Cannot read properties|is not a function|is not defined/.test(reason)),'synthetic product transport incomplete');assert.equal(c.draws,c.n+c.noPrimary+c.noSecondary+c.pcFailed);assert(c.hits<=c.n&&c.missed<=c.hits&&c.falseAlerts<=c.n-c.hits);}}
let adaptedArmDays=0,availableHistoryArmDays=0;
if(fs.existsSync('results/five-day-ca/covariance.json')){const c=JSON.parse(fs.readFileSync('results/five-day-ca/covariance.json'));check(c.coverage?.every(x=>x.fitArmDays.missing===0&&x.gpArmDays.missing===0),'covariance coverage incomplete');for(const [file,pin]of Object.entries(c.inputs))assert.equal(hash(fs.readFileSync(file)),pin,'covariance source snapshot');const file=`${config.store}/adapted-covariance.jsonl`;assert.equal(hash(fs.readFileSync(file)),c.outputSha256);for(const row of fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(JSON.parse))for(const a of Object.values(row.arms))for(const v of Object.values(a.days??{})){if(!v.adaptation)continue;adaptedArmDays++;if(v.adaptation.history){availableHistoryArmDays++;assert(v.adaptation.historyLatestAvailableAt<=Date.parse(row.cutoff));assert(v.adaptation.historyLatestCutoff<=Date.parse(row.cutoff)-3*86400000);}assert(v.adaptation.g>0&&Number.isFinite(v.adaptation.g));}}
let syntheticReplayScalars=0,syntheticReplayMaxAbs=0;
const encounters=fs.existsSync('results/five-day-ca/encounters.json')?JSON.parse(fs.readFileSync('results/five-day-ca/encounters.json')):{};
if(encounters.rawFile){assert.equal(hash(fs.readFileSync(encounters.rawFile)),encounters.rawSha256,'synthetic archive hash');const seen=new Set(),lines=readline.createInterface({input:fs.createReadStream(encounters.rawFile),crlfDelay:Infinity}),module=await openPc();try{for await(const line of lines){const draw=JSON.parse(line);for(const [arm,s]of Object.entries(draw.scores)){if(seen.has(arm))continue;const probability=await module.pc(s.covarianceM2,20,s.predictedMissM);syntheticReplayScalars++;syntheticReplayMaxAbs=Math.max(syntheticReplayMaxAbs,Math.abs(probability-s.pc));assert.equal(probability,s.pc,'synthetic Pc replay');assert.equal(s.brier,(probability-Number(draw.hit))**2);const loss=draw.hit?-Math.log(probability):-Math.log1p(-probability);assert.equal(s.log,Number.isFinite(loss)?loss+0:'Infinity');seen.add(arm);}if(seen.size===5)break;}}finally{lines.close();await module.close();}check(seen.size===5,'five-arm synthetic Pc replay incomplete');}
let statisticalCells=0,pairedCells=0,reachCells=0,reachExclusions=0;
if(fs.existsSync('results/five-day-ca/statistics.json')){
 const s=JSON.parse(fs.readFileSync('results/five-day-ca/statistics.json'));assert.equal(s.snapshotStable,true,'statistics snapshot must be stable');assert.deepEqual(s.inputs,now.inputs,'statistics input snapshot');statisticalCells=s.cells.length;pairedCells=s.paired.length;
 for(const c of s.cells){const m=now.armDayCoverage.find(x=>x.group===c.group&&x.arm+String(x.arc)===c.arm&&x.day===c.day);assert(m);assert.equal(c.n,m.scored,'statistical denominator');if(['LS','DO'].includes(c.group)&&[4,5].includes(c.day))assert.equal(c.disclosure,'read before the statements were registered');}
}
if(fs.existsSync('results/five-day-ca/ca-reach.json')){
 const c=JSON.parse(fs.readFileSync('results/five-day-ca/ca-reach.json'));assert.equal(c.snapshotStable,true,'CA snapshot must be stable');assert.equal(c.regimeMappingSha256,hash(fs.readFileSync(`${config.store}/gp-regimes.json`)),'CA altitude mapping snapshot');assert.deepEqual(c.inputs,now.inputs,'CA input snapshot');reachCells=c.cells.length;reachExclusions=c.cells.reduce((n,c)=>n+c.excluded,0);check(reachExclusions===0,'CA reach exclusions unresolved');assert.equal(c.alfanoAtZero,1,'Alfano maximum at zero miss');
 for(const x of c.cells){if(x.day===5&&x.pair!=='fit x fit')assert.deepEqual(x.gpAgeDays,[5,7],'GP five-day age bin');assert.equal(x.n+x.excluded,x.attempted);if(['LS','DO'].includes(x.group)&&[4,5].includes(x.day))assert.equal(x.disclosure,'read before the statements were registered');}
}
const result={verdict:failures.length?'FAIL':'PASS',testedCommit:git('rev-parse','HEAD'),replayedScalars:scalars,replayDifferences,replayMaxAbsKm,replayRejected,replayByArm,productReplayScalars,productReplayDifferences,oldLeadScalars:now.reproduction.compared,oldLeadDifferences:now.reproduction.different,completeGroupPhases:now.coverage.filter(c=>c.expected>0&&c.completed===c.expected).length,totalGroupPhases:now.coverage.length,armDayCells:now.armDayCoverage.length,missingArmDays:now.armDayCoverage.reduce((n,c)=>n+c.missing,0),scoredArmDays:now.armDayCoverage.reduce((n,c)=>n+c.scored,0),excludedArmDays:now.armDayCoverage.reduce((n,c)=>n+c.excluded,0),registrationManifests:manifests,syntheticCells,syntheticEncounters,syntheticPcFailures,syntheticPairedCells,syntheticReplayScalars,syntheticReplayMaxAbs,adaptedArmDays,availableHistoryArmDays,statisticalCells,pairedCells,reachCells,reachExclusions,disclosedPriorReads:true,pcOracleAbsoluteError:oracleError,bootstrapReferenceScalars:6,bootstrapReferenceMaxAbs:0,failures};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
