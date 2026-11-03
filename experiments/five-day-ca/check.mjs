// One E2E: real archive, pinned modules, registration provenance, and complete tables.
import fs from 'node:fs';
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
check(now.armDayCoverage.every(c=>c.expected===c.scored+c.excluded&&c.missing===0),'arm/arc/day coverage incomplete');
const selected=readRows(`${config.store}/cheap/regimes`).find(r=>['AP72','XP72','S72','U72'].every(a=>[1,2,3,4,5,7].every(d=>Number.isFinite(r.arms[a]?.days?.[d]?.e))));
assert(selected,'no complete six-day replay window');
const out=`${config.store}/check/${Date.now()}`;
const run=spawnSync(process.execPath,['experiments/five-day-ca/regimes.mjs','--wasm','/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm','--out',out,'--groups',selected.group,'--key',selected.key],{env:{...process.env,SDN_MODULES_ROOT:config.modulesRoot},encoding:'utf8',timeout:300000});
assert.equal(run.status,0,run.stderr);
const replay=JSON.parse(fs.readFileSync(`${out}/rows-0.jsonl`,'utf8').trim());
let scalars=0;
for(const [arm,a] of Object.entries(selected.arms))for(const [day,values]of Object.entries(a.days??{}))for(const [field,value]of Object.entries(values)){assert.equal(replay.arms[arm].days[day][field],value,`${arm}/${day}/${field}`);scalars++;}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const registrationCommit='eb143664cad7ab97133184d4d0b217592f81b5a8';
const registrationMs=Date.parse(git('show','-s','--format=%cI',registrationCommit));
let manifests=0;
for(const phase of ['cheap','ffm'])for(const label of ['regimes','truth2','truth']){
 const dir=`${config.store}/${phase}/${label}`;if(!fs.existsSync(dir))continue;
 for(const f of fs.readdirSync(dir).filter(f=>/^manifest-\d+-\d+\.json$/.test(f))){const m=JSON.parse(fs.readFileSync(`${dir}/${f}`));assert(Date.parse(m.started)>=registrationMs,'resumed manifest predates amended registration');assert.equal(m.sources['experiments/five-day-ca/FIVE-DAY.md'],hash(fs.readFileSync('experiments/five-day-ca/FIVE-DAY.md')));manifests++;}
}
assert(manifests>0,'no resumed registration manifests');
const pc=await openPc();let oracleError=0;
try{for(const [v,h]of [[10000,10],[2500,100]])oracleError=Math.max(oracleError,Math.abs(await pc.pc([v,0,v],h)+Math.expm1(-h*h/(2*v))));assert(oracleError<=1e-12);}finally{await pc.close();}
for(const file of ['statistics.json','ca-reach.json','encounters.json'])check(fs.existsSync(`results/five-day-ca/${file}`),`${file} unmeasured`);
if(fs.existsSync('results/five-day-ca/ca-reach.json')){const c=JSON.parse(fs.readFileSync('results/five-day-ca/ca-reach.json'));check(c.cells.every(c=>c.excluded===0),'CA reach exclusions unresolved');}
const result={verdict:failures.length?'FAIL':'PASS',testedCommit:git('rev-parse','HEAD'),replayedScalars:scalars,oldLeadScalars:now.reproduction.compared,oldLeadDifferences:now.reproduction.different,completeGroupPhases:now.coverage.filter(c=>c.expected>0&&c.completed===c.expected).length,totalGroupPhases:now.coverage.length,armDayCells:now.armDayCoverage.length,missingArmDays:now.armDayCoverage.reduce((n,c)=>n+c.missing,0),registrationManifests:manifests,disclosedPriorReads:true,pcOracleAbsoluteError:oracleError,failures};
console.log(JSON.stringify(result,null,2));
if(failures.length)process.exitCode=1;
