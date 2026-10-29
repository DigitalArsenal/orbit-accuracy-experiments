// Install an immutable local collector release, independent of task worktrees.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha} from './transport.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../..');
const root=process.env.OPERATOR_CAPTURE_ROOT??'/opt/data/sdn-archive/operator-capture';
const modules=process.env.OPERATOR_MODULES_ROOT;
if(!modules)throw new Error('provide the freshly provisioned OPERATOR_MODULES_ROOT');
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
if(git('status','--porcelain','--','experiments/operator-capture/collector','experiments/e13b-starlink-dca/PLAN.md','experiments/e13b-starlink-dca/config.json'))throw new Error('commit collector and registration first');
const commit=git('rev-parse','HEAD');
git('fetch','--quiet','origin','main');
try{git('merge-base','--is-ancestor',commit,'origin/main');}catch{throw new Error('push exact collector candidate to origin/main before install');}
fs.mkdirSync(root,{recursive:true});const stat=fs.statfsSync(root);if(stat.bavail*stat.bsize<25*2**30)throw new Error('disk below 25 GiB');
if(fs.existsSync(path.join(root,'collector.pid')))throw new Error('collector.pid exists; verify and stop the exact collector before installing');
const release=path.join(root,'_collector','releases',commit);
if(fs.existsSync(release))throw new Error('release already exists; inspect and run its documented start command');
fs.mkdirSync(release,{recursive:true});
for(const name of fs.readdirSync(here))if(name.endsWith('.mjs')||name==='package.json'||name==='package-lock.json')fs.copyFileSync(path.join(here,name),path.join(release,name));
// Dependencies are copied once; no symlink survives into a removable worktree.
const deps=path.join(root,'_collector','dependencies',sha(fs.readFileSync(path.join(here,'package-lock.json'))));
if(!fs.existsSync(deps)){fs.mkdirSync(deps,{recursive:true});fs.cpSync(path.join(here,'node_modules'),path.join(deps,'node_modules'),{recursive:true});}
fs.symlinkSync(path.join(deps,'node_modules'),path.join(release,'node_modules'),'dir');
// OPERATOR_MODULES_ROOT is a modules checkout, or the modules/ directory of an installed release: the same bytes and commit carry forward, checked against that release's registration.
const prior=path.join(modules,'..','registration.json'),carried=!fs.existsSync(path.join(modules,'.git'))&&fs.existsSync(prior)?JSON.parse(fs.readFileSync(prior)):null;
const registration={componentCommit:commit,planCommit:'da079c9f9954152778ecf520c8531929b2d9372f',modulesCommit:carried?carried.modulesCommit:execFileSync('git',['-C',modules,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),installedUtc:new Date().toISOString(),modules:[]};
for(const name of ['foundation/frames','foundation/orbits','analysis/density-calibration','data-source/space-weather']){
  const dir=path.join(release,'modules',name);fs.mkdirSync(path.join(dir,'dist/isomorphic'),{recursive:true});
  for(const file of ['plugin-manifest.json','dist/isomorphic/module.wasm'])fs.copyFileSync(path.join(modules,name,file),path.join(dir,file));
  registration.modules.push({name,wasmSha256:sha(fs.readFileSync(path.join(dir,'dist/isomorphic/module.wasm'))),manifestSha256:sha(fs.readFileSync(path.join(dir,'plugin-manifest.json')))});
}
if(carried)for(const m of registration.modules){const pin=carried.modules.find(x=>x.name===m.name);if(pin?.wasmSha256!==m.wasmSha256||pin?.manifestSha256!==m.manifestSha256)throw new Error(`carried module differs from its release: ${m.name}`);}
for(const name of ['PLAN.md','config.json'])fs.copyFileSync(path.join(repo,'experiments/e13b-starlink-dca',name),path.join(release,name));
registration.planSha256=sha(fs.readFileSync(path.join(release,'PLAN.md')));registration.configSha256=sha(fs.readFileSync(path.join(release,'config.json')));
registration.sourceHashes=Object.fromEntries(fs.readdirSync(release).filter(n=>n.endsWith('.mjs')).sort().map(n=>[n,sha(fs.readFileSync(path.join(release,n)))]));
fs.writeFileSync(path.join(release,'registration.json'),JSON.stringify(registration,null,2)+'\n');
const log=fs.openSync(path.join(root,'collector.stdout.log'),'a');
const child=spawn(process.execPath,[path.join(release,'collect.mjs')],{cwd:release,env:{...process.env,OPERATOR_CAPTURE_ROOT:root,OPERATOR_MODULES_ROOT:path.join(release,'modules')},detached:true,stdio:['ignore',log,log]});
child.unref();fs.closeSync(log);
fs.writeFileSync(path.join(root,'_collector','active.json'),JSON.stringify({release,pid:child.pid,registration},null,2)+'\n');
console.log(JSON.stringify({release,pid:child.pid,log:path.join(root,'collector.log')}));
