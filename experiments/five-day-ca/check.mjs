// Real archive and module replay; incomplete task evidence is a failure.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { aggregate, report } from './table.mjs';
import { config, registration } from './guard.mjs';
registration();
const saved=JSON.parse(fs.readFileSync('results/five-day-ca/metrics.json','utf8'));
const now=aggregate();
assert.deepEqual(now,saved,'aggregate regeneration');
assert.equal(report(now),fs.readFileSync('results/five-day-ca/README.md','utf8'),'report regeneration');
assert(now.reproduction.compared>0,'no old-lead evidence');
assert.equal(now.reproduction.different,0,'old leads differ');
const rows=fs.readdirSync(`${config.store}/cheap/regimes`).filter(f=>/^rows-\d+\.jsonl$/.test(f)).sort().flatMap(f=>fs.readFileSync(`${config.store}/cheap/regimes/${f}`,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
const selected=rows.find(r=>['AP72','XP72','S72','U72'].every(a=>[1,2,3,4,5,7].every(d=>Number.isFinite(r.arms[a]?.days?.[d]?.e))));
assert(selected,'no complete six-day replay window');
const out=`${config.store}/check/${Date.now()}`;
const run=spawnSync(process.execPath,['experiments/five-day-ca/regimes.mjs','--wasm','/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm','--out',out,'--groups',selected.group,'--key',selected.key],{env:{...process.env,SDN_MODULES_ROOT:config.modulesRoot},encoding:'utf8',timeout:300000});
assert.equal(run.status,0,run.stderr);
const replay=JSON.parse(fs.readFileSync(`${out}/rows-0.jsonl`,'utf8').trim());
let scalars=0;
for(const [arm,a] of Object.entries(selected.arms))for(const [day,values] of Object.entries(a.days??{}))for(const [field,value] of Object.entries(values)){assert.equal(replay.arms[arm].days[day][field],value,`${arm}/${day}/${field}`);scalars++;}
console.log(JSON.stringify({replayedScalars:scalars,oldLeadScalars:now.reproduction.compared,oldLeadDifferences:now.reproduction.different,completeGroups:now.coverage.filter(c=>c.completed===c.expected).length,totalGroups:now.coverage.length}));
assert(now.coverage.every(c=>c.expected>0&&c.completed===c.expected),'forecast groups incomplete');
assert(fs.existsSync('results/five-day-ca/ca-reach.json'),'CA reach is unmeasured');
assert(fs.existsSync('results/five-day-ca/encounters.json'),'synthetic encounters are unmeasured');
console.log('PASS');
