import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {loadModule} from '../../../harness/modules.mjs';
import {wire} from '../../propagator-published-truth/wire.mjs';
import {config as baseline} from '../../propagator-published-truth/common.mjs';
import {fitOrbit,propagateFit} from '../../e6-public-observations/fit.mjs';
import {estimationCodec} from '../../e2-catalog-covariance/estimation-wire.mjs';
import {select,loadArc} from '../arcs.mjs';
import {environment} from '../environment.mjs';
import {root,read,write,sha,hashFile} from '../common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'}}});assert.ok(values.modules);
const modules=path.resolve(values.modules),priorDir=path.join(root,'runs/propagator-catalog-census/catalog-epochs-full-replay');
const dir=path.join(root,'runs/propagator-catalog-census/ffm-failure-diagnostics-20261027'),census=read(path.join(priorDir,'census.json'));
const W=await wire(modules),envFor=await environment({modules,dir:priorDir},W),codec=await estimationCodec(modules,path.join(root,'node_modules/space-data-module-sdk/schemas/orbpro'));
const native=await loadModule(modules,'propagator/ffm'),estimation=await loadModule(modules,'analysis/estimation');
const seen=new Set(),selected=[];
for(const object of census.objects){const file=path.join(priorDir,'outcomes',sha(object.key).slice(0,32)+'.json'),prior=read(file),a=prior.arms?.ffm;
  if(a&&!a.ok&&!seen.has(a.reason)){seen.add(a.reason);selected.push({object,prior,file});}}
try{for(const {object,prior,file}of selected){
  const destination=path.join(dir,sha(object.key).slice(0,32));fs.mkdirSync(destination,{recursive:true});
  const result={key:object.key,priorReason:prior.arms.ffm.reason,priorOutcomeSha256:hashFile(file),sourceSha256:hashFile(new URL(import.meta.url)),requests:[]};
  let call=0;
  const ffm={invoke:async(method,frames)=>{
    const request=frames.find(f=>f.portId==='request')??frames[0],name=`request-${String(++call).padStart(3,'0')}.prw`,bytes=Buffer.from(request.payload);
    fs.writeFileSync(path.join(destination,name),bytes);result.requests.push({file:name,sha256:sha(bytes)});
    try{return await native.invoke(method,frames);}catch(e){result.failingRequest=name;result.decodedFailingRequest=W.unpack(W.PRW,'PRW',bytes);throw e;}
  }};
  try{
    const selection=select(object,census),arc=loadArc(object,census,selection,W);assert.equal(arc.status,'eligible');const env=envFor(arc),f=baseline.ffm,n=8;
    const diagonal=[...Array(3).fill(f.positionPriorSigmaM**2),...Array(3).fill(f.velocityPriorSigmaMS**2),...f.parameters.map(p=>(f.parameterPriorFraction*p.value)**2)];
    const settings={...f,fixed:{},apriori:Array.from({length:n*n},(_,k)=>Math.floor(k/n)===k%n?diagonal[k%n]:0)},ctx={ffm,estimation,codec,inputs:env.inputs};
    result.selection=selection;result.environment=env.audit;
    for(let i=0;i<env.inputs.length;i++){const b=Buffer.from(env.inputs[i].payload),name=`environment-${i}.bin`;fs.writeFileSync(path.join(destination,name),b);(result.environmentInputs??=[]).push({file:name,sha256:sha(b),portId:env.inputs[i].portId,typeRef:env.inputs[i].typeRef});}
    const segments=[{key:'precise-reference-arc',kind:'POSITION_VECTOR',nuisance:null,points:arc.fit.map(l=>({time:l.epoch,values:l.r.map(x=>x*1000),sigmas:Array(3).fill(f.measurementSigmaM)}))}];
    const product=await fitOrbit(ctx,segments,[],{epoch:arc.fit[0].epoch,state:[...arc.fit[0].r,...arc.fit[0].v].map(x=>x*1000)},settings,{outer:1,tolerance:.05,relaxation:1,firstRoundSigmaFactor:f.firstRoundSigmaFactor,segmentEditRms:0});
    write(path.join(destination,'fit.json'),product);result.fitSha256=hashFile(path.join(destination,'fit.json'));
    if(product.failed||!product.fit?.converged)throw Error(product.failed||'FFM fit not converged');
    const scale=Math.max(1,product.fit.reducedChiSquare??1);await propagateFit(ctx,{epoch:product.epoch,state:product.state,parameters:product.parameters},arc.score.map(l=>l.epoch),settings,product.fit.covariance.map(x=>x*scale));
    result.reproduced=false;result.status='unexpected_success';
  }catch(e){result.reason=e.message;result.reproduced=e.message===prior.arms.ffm.reason;result.status=result.reproduced?'exact_failure_reproduced':'different_failure';}
  write(path.join(destination,'diagnosis.json'),result);console.log(JSON.stringify({key:object.key,status:result.status,reason:result.reason,requests:call}));
}}finally{await native.destroy();await estimation.destroy();}
