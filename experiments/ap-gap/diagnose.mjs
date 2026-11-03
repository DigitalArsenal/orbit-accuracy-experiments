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

export function diagnoseGn(all) {
 const rows=all.filter(r=>r.group==='GN'&&r.batch==='resume-gn');
 const triples=rows.map(r=>({x:error(r,'XP24'),u:error(r,'U24'),fixed:error(r,'XP_FIXED24'),prior:error(r,'XP_PRIOR24'),ufixed:error(r,'U_FIXED24')})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.u));
 const gap=median(triples.map(p=>(p.x-p.u)*1000));
 const effects=['fixed','prior','ufixed'].map(arm=>{const pairs=triples.filter(p=>Number.isFinite(p[arm]));return {arm,n:pairs.length,gainM:median(pairs.map(p=>((arm==='ufixed'?p.u:p.x)-p[arm])*1000))};});
 const best=effects.filter(e=>e.arm!=='ufixed'&&e.n>=5&&e.gainM>0).sort((a,b)=>b.gainM-a.gainM)[0];
 const supported=gap>0&&best?.gainM>=0.5*gap;
 return {group:'GN',n:triples.length,pairedGapM:gap,effects,cause:supported?`Candidate: ${best.arm==='fixed'?'short-arc AGOM estimation':'short-arc prior constants'}`:'Unresolved',candidate:supported?best:null,proposedChange:supported?best.arm==='fixed'?'Hold AGOM at its seed on 24 h GNSS arcs, subject to unread-window confirmation.':'Use the tested Space Force wrapper prior constants on 24 h GNSS arcs, subject to unread-window confirmation.':null,expectedGainM:supported?best.gainM:null,gainTargetCeilingM:gap>0?gap:null,interpretation:'Expected gain is the exploratory paired day-3 improvement of the tested arm; no independent confirmation.'};
}

export function diagnoseAp(all, diagnosis) {
 const group=diagnosis.group;
 const base=all.filter(r=>r.group===group&&r.batch==='resume-CONTROL');
 const map=batch=>new Map(all.filter(r=>r.group===group&&r.batch===batch).map(r=>[r.key,r]));
 const reference=map(group==='HE'?'historical-regimes':'resume-ffm');
 const referenceArm=group==='HE'?'XP72':'F72';
 const descriptions={H05:['Hansen evaluation threshold','Select the Hansen representation by eccentricity and numerical accuracy; confirm the 0.5 threshold on unread windows.'],H07:['Hansen evaluation threshold','Select the Hansen representation by numerical accuracy; confirm the 0.7 perturbation with a convergence guard on unread windows.'],NOFRAME:['epoch/date frame correction','Check the mean-element epoch frame and date-frame conversion jointly in fit and propagation.'],J70:['drag atmosphere replacement','Check AP atmospheric drag integration and the fit/weather coupling.'],T0:['tesseral replacement','Isolate the AP tesseral corrections responsible for the measured error increase.'],T12:['tesseral degrees above 12','Check the near-resonant and shallow tesseral terms above degree 12.'],Z0:['high-degree zonal tail','Check the averaged zonal tail above degree 5.']};
 for(let k=0;k<=4;k++)descriptions['CLASS'+k]=['resonance-class selection','Review resonance bands and class transitions; a globally forced class is not a production fix.'];
 const effects=Object.entries(descriptions).map(([arm,[term,change]])=>{
  const variant=map(['J70','T0','T12','Z0'].includes(arm)?(group==='HE'||group==='HX'?'resume-heo':'resume-ap'):'resume-'+arm);
  const armName=['J70','T0','T12','Z0'].includes(arm)?arm+'72':'AP72';
  const pairs=base.map(r=>({b:error(r,'AP72'),v:error(variant.get(r.key),armName),ref:error(reference.get(r.key),referenceArm)})).filter(p=>[p.b,p.v,p.ref].every(Number.isFinite));
  return {arm,term,change,n:pairs.length,gainM:median(pairs.map(p=>(p.b-p.v)*1000)),gapM:median(pairs.map(p=>(p.b-p.ref)*1000))};
 }).filter(e=>e.n>=5).sort((a,b)=>b.gainM-a.gainM);
 const best=effects.find(e=>e.gapM>0&&e.gainM>0&&e.gainM>=0.5*e.gapM);
 if(!best)return {...diagnosis,apEffects:effects};
 return {...diagnosis,apEffects:effects,pairedGapM:best.gapM,n:best.n,cause:'Candidate: '+best.term,candidate:best,proposedChange:best.change,expectedGainM:best.gainM,gainTargetCeilingM:best.gapM,reference:group==='HE'?'whiteroom XP':'FFM',interpretation:'Expected gain is the exploratory paired day-3 improvement from the AP perturbation, not independent confirmation.'};
}
