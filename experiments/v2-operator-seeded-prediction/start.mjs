// Install an immutable local runtime, then start the explicitly requested
// archival collector. No production host, service manager or credentials.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {root,store,moduleRoot,sha256,write,quiet,config,H} from './common.mjs';
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
fs.mkdirSync(store,{recursive:true});await quiet();
const source=git(root,'rev-parse','HEAD'),modules=moduleRoot(),moduleCommit=git(modules,'rev-parse','HEAD');
if(git(root,'status','--porcelain','--untracked-files=no'))throw new Error('commit tracked runtime changes before installation');
const install=path.join(store,'runtime',source),experimentRoot=path.join(install,'experiments'),modulesRoot=path.join(install,'modules');
fs.mkdirSync(install,{recursive:true});
function clone(from,to,commit) {
  if(fs.existsSync(to)){if(git(to,'rev-parse','HEAD')!==commit)throw new Error('runtime revision differs');return;}
  execFileSync('git',['clone','--quiet','--shared','--no-checkout',from,to],{stdio:'inherit'});
  execFileSync('git',['checkout','--quiet','--detach',commit],{cwd:to,stdio:'inherit'});
}
function copy(from,to) {if(fs.existsSync(to))return;fs.mkdirSync(path.dirname(to),{recursive:true});execFileSync('cp',['-cR',from,to]);}
clone(root,experimentRoot,source);clone(modules,modulesRoot,moduleCommit);
copy(path.join(root,'node_modules'),path.join(experimentRoot,'node_modules'));
const names=['propagator/ffm','analysis/estimation','foundation/frames','foundation/time','data-source/eop-parser','analysis/gp-error-model','data-source/space-weather'];
const artifacts=[];
for(const name of names) {
  copy(path.join(modules,name,'dist'),path.join(modulesRoot,name,'dist'));
  if(['propagator/ffm','analysis/gp-error-model','data-source/space-weather'].includes(name))copy(path.join(modules,name,'node_modules'),path.join(modulesRoot,name,'node_modules'));
  const file=path.join(modulesRoot,name,'dist/isomorphic/module.wasm'),hash=sha256(fs.readFileSync(file));
  if(hash!==sha256(fs.readFileSync(path.join(modules,name,'dist/isomorphic/module.wasm'))))throw new Error('artifact copy mismatch');
  artifacts.push({name,sha256:hash});
}
write(path.join(install,'installation.json'),{source,moduleCommit,artifacts,installedUtc:new Date().toISOString()});
if(fs.existsSync(path.join(store,'collector.stop')))throw new Error('collector.stop is present; remove it explicitly before restarting');
const firstCycleUtc=new Date(Math.max(Date.parse(config.window.issueStartUtc)-8*H,Math.ceil(Date.now()/(8*H))*8*H)).toISOString();
const log=fs.openSync(path.join(store,'collector.console.log'),'a');
const child=spawn('/usr/bin/nice',['-n','10',process.execPath,'experiments/v2-operator-seeded-prediction/launch.mjs',firstCycleUtc],{cwd:experimentRoot,env:{...process.env,SDN_MODULES_ROOT:modulesRoot,V2_STORE:store,UV_THREADPOOL_SIZE:'1'},stdio:['ignore',log,log],detached:true});
child.unref();fs.closeSync(log);
console.log(JSON.stringify({pid:child.pid,firstCycleUtc,install,log:path.join(store,'collector.log'),pidFile:path.join(store,'collector.pid')}));
