// Exploratory candidate ranking. Pairwise distances do not establish a unique physical cause.
const median=a=>{a.sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const error=(r,arm)=>r?.arms?.[arm]?.ok?r.arms[arm]?.days?.[3]?.e:undefined;
const terms={NO_SRP:'solar radiation pressure (shadow not isolated)',NO_BODIES:'Sun and Moon perturbations',NO_SUN:'solar gravitational perturbations',NO_MOON:'lunar gravitational perturbations',NO_TIDES:'solid Earth tides',D20:'gravity harmonics above degree 20 (not zonals alone)',O12:'gravity orders above 12',O31:'gravity orders above 31',TESS12:'tesseral degrees above 12',TESS31:'tesseral degrees above 31'};
const fixes={NO_SRP:'Refine AP solar radiation pressure and shadow after separating their contributions.',NO_BODIES:'Refine AP solar and lunar perturbations.',NO_SUN:'Refine AP solar perturbations.',NO_MOON:'Refine AP lunar perturbations.',NO_TIDES:'Evaluate adding the missing solid Earth tide contribution to AP.',D20:'Isolate the high-degree zonal and tesseral contributions before changing AP.',O12:'Refine the high-order gravity terms in AP.',O31:'Refine gravity orders above 31 in AP.',TESS12:'Refine AP tesseral degrees above 12.',TESS31:'Evaluate tesseral degrees above 31 in AP.'};
export function diagnose(all,groups){return groups.map(group=>{
 const ap=all.filter(r=>r.group===group&&['resume-ap','resume-heo'].includes(r.batch));
 const ffm=new Map(all.filter(r=>r.group===group&&r.batch==='resume-ffm').map(r=>[r.key,r]));
 const base=ap.map(r=>({a:error(r,'AP72'),f:error(ffm.get(r.key),'F72')})).filter(x=>Number.isFinite(x.a)&&Number.isFinite(x.f));
 const gapM=median(base.map(x=>(x.a-x.f)*1000));
 const candidates=Object.entries(terms).map(([arm,term])=>{
  const pairs=ap.map(r=>({a:error(r,'AP72'),f:error(ffm.get(r.key),'F72'),s:error(ffm.get(r.key),arm+'72')})).filter(x=>[x.a,x.f,x.s].every(Number.isFinite));
  const original=median(pairs.map(x=>Math.abs(x.a-x.f))),remaining=median(pairs.map(x=>Math.abs(x.a-x.s)));
  return {arm,term,n:pairs.length,closure:original>0?1-remaining/original:null,subtractionDeltaM:median(pairs.map(x=>(x.s-x.f)*1000)),proposedChange:fixes[arm]};
 }).filter(c=>c.n>=5&&c.closure!==null).sort((a,b)=>b.closure-a.closure);
 const best=candidates[0];const supported=gapM>0&&best?.closure>=0.5;
 return {group,n:base.length,pairedGapM:gapM,cause:supported?`Candidate: ${best.term}`:gapM!==null&&gapM<=0?'No median paired AP deficit against FFM':'Unresolved',candidate:supported?best:null,candidates,proposedChange:supported?best.proposedChange:null,expectedGainM:null,gainTargetCeilingM:gapM>0?gapM:null,interpretation:'The AP–FFM gap is a target ceiling, not a measured gain from a module change. A matching subtraction is not a unique causal identification.'};
});}
