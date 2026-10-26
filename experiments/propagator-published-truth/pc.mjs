// Published external expected values through the actual CQR WASM boundary.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { config,options,newRun,write,sha } from './common.mjs';
import { wire } from './wire.mjs';

export async function pcCases(run,W){
  const base=path.join(run.modules,'analysis/conjunction-assessment'),file=path.join(run.modules,config.pc.fixture),bytes=fs.readFileSync(file);
  if(sha(bytes)!==config.pc.fixtureSha256)throw new Error('Pc fixture pin differs');
  run.record(file);run.record(path.join(base,'src/cpp/tests/fixtures/NOTICE.md'));
  const req=createRequire(path.join(base,'package.json'));
  const {createBrowserModuleHarness}=await import(pathToFileURL(req.resolve('space-data-module-sdk/host/browser-module')).href);
  const h=await createBrowserModuleHarness({wasmSource:fs.readFileSync(path.join(base,'dist/isomorphic/module.wasm')),surface:'direct',enableThreads:true});
  const text=bytes.toString().trim().split(/\r?\n/),header=text.shift().split(','),cases=[];
  try{
    for(const line of text){
      const values=line.split(',');if(values.length!==header.length)throw new Error('malformed reference CSV');
      const r=Object.fromEntries(header.map((k,i)=>[k,values[i]])),C=W.CQR;
      const record=new C.CQRT();
      record.PROBABILITY_REQUEST=new C.CQRProbabilityRequestT(new C.CQRPlaneGeometryT(+r.xi_km*1000,+r.zeta_km*1000,+r.sxx_km2*1e6,+r.sxz_km2*1e6,+r.szz_km2*1e6,+r.radius_km*1000),C.cqrProbabilityAlgorithm.FOSTER);
      const item={case:r.case,expected:+r.expected,relativeTolerance:+r.relative_tolerance,absoluteTolerance:+r.absolute_tolerance,source:r.source};
      try{
        const out=await h.invoke({methodId:'compute_pc',inputs:[W.frame('request','CQR',W.encode(C,'CQR',record))]});
        if(out.statusCode!==0)throw new Error(`${out.errorCode}: ${out.errorMessage}`);
        const p=W.unpack(C,'CQR',out.outputs[0].payload).PROBABILITY_RESULT;
        const error=Math.abs(p.PROBABILITY-item.expected),allowed=Math.max(item.absoluteTolerance,item.relativeTolerance*Math.abs(item.expected));
        Object.assign(item,{actual:p.PROBABILITY,converged:p.CONVERGED,algorithm:p.ALGORITHM,absoluteError:error,relativeError:item.expected?error/Math.abs(item.expected):null,
          pass:Number.isFinite(p.PROBABILITY)&&p.CONVERGED&&p.ALGORITHM===C.cqrProbabilityAlgorithm.FOSTER&&error<=allowed});
      }catch(e){Object.assign(item,{pass:false,error:String(e.message)});}
      cases.push(item);
    }
  }finally{await h.destroy();}
  if(cases.length!==config.pc.expectedCases)throw new Error('reference case count differs');
  return {cases,passed:cases.filter(c=>c.pass).length,failed:cases.filter(c=>!c.pass).length,pass:cases.every(c=>c.pass),scope:'2D Foster disk integral only; no 3D, Monte Carlo, TCA or operational calibration claim'};
}
if(process.argv[1]===new URL(import.meta.url).pathname){
  const run=newRun(options()),out=await pcCases(run,await wire(run.modules));write(path.join(run.dir,'pc.json'),out);run.finish();console.log(JSON.stringify({passed:out.passed,failed:out.failed}));if(!out.pass)process.exitCode=1;
}
