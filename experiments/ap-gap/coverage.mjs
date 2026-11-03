// Completion is computed from raw attempts; exclusions remain visible.
export function coverage(all,events){
 const batch=name=>all.filter(r=>r.batch===name);
 const unique=rows=>new Set(rows.map(r=>r.key)).size===rows.length;
 const has=(rows,n,arms)=>rows.length===n&&unique(rows)&&rows.every(r=>r.error||arms.every(a=>Object.hasOwn(r.arms,a)));
 const primary=[...batch('resume-ap'),...batch('resume-heo')];
 const keys=new Set(primary.map(r=>r.key));
 const sameKeys=rows=>rows.length===keys.size&&rows.every(r=>keys.has(r.key))&&unique(rows);
 const variants=['CONTROL','H03','H05','H07','NOFRAME','CLASS0','CLASS1','CLASS2','CLASS3','CLASS4'];
 const f=batch('resume-ffm'),isolated=batch('resume-ffm-isolated'),gn=batch('resume-gn');
 const heo=['resume-HEO12-heap','resume-HEO20-heap'].map(batch);
 const runtimeFailures=rows=>rows.flatMap(r=>Object.values(r.arms)).filter(a=>a.error&&a.error!=='coverage').length;
 const methodStatus={
  1:primary.length===426&&variants.every(v=>sameKeys(batch('resume-'+v)))?'complete':'partial: AP variant coverage',
  2:has(f,426,['F72','NO_SRP72','NO_BODIES72','NO_SUN72','NO_MOON72','NO_TIDES72','D2072','TESS1272','TESS3172'])&&sameKeys(isolated)&&has(isolated,426,['NO_SHADOW72','ZONAL2072'])?'complete':'partial: FFM subtraction coverage',
  3:has(gn,755,['AP24','XP24','XP_PRIOR24','U24','U_REBUILT24','AP_FIXED24','XP_FIXED24','U_FIXED24'])?'complete':'partial: GN fitter coverage',
  4:heo.every(rows=>has(rows,26,['AP72'])&&runtimeFailures(rows)===0)&&has(batch('resume-frame').filter(r=>['IG','GE'].includes(r.group)),105,['XP72','FRAME72','RESONANCE72','AP72'])&&has(batch('resume-frame-gn'),755,['XP72','FRAME72','RESONANCE72','AP72'])?'complete':'partial: corrected HEO and frame coverage',
  5:events.length===150&&new Set(events.map(e=>e.key)).size===150&&events.every(e=>['event','quiet','unknown'].includes(e.label))?'complete':'partial: DO labels'
 };
 return {methodStatus,methodsComplete:Object.values(methodStatus).filter(x=>x==='complete').length,methodsRequired:5,ffmBodyMissing:f.filter(r=>!r.error&&(!r.arms.NO_SUN72||!r.arms.NO_MOON72)).length,isolatedWindows:isolated.length,heoWindows:heo.map(r=>r.length),heoRuntimeFailures:heo.map(runtimeFailures),eventContrastMeasured:events.some(e=>e.label==='event')&&events.some(e=>e.label==='quiet')};
}

export function quadrature(all){
 const base=all.filter(r=>r.batch==='resume-HEO20-heap'),fine=new Map(all.filter(r=>r.batch==='resume-HEO20-q4').map(r=>[r.key,r]));
 const days=[1,3,7].map(day=>{const differences=base.map(r=>{const a=r.arms.AP72?.days?.[day]?.e,b=fine.get(r.key)?.arms.AP72?.days?.[day]?.e;return Number.isFinite(a)&&Number.isFinite(b)?Math.abs(a-b)*1000:null;}).filter(x=>x!==null);return {day,n:differences.length,maxDifferenceM:differences.length?Math.max(...differences):null};});
 const complete=base.length===26&&fine.size===26&&days.every(d=>d.n===26);
 return {complete,days,toleranceM:0.001,passed:complete&&days.every(d=>d.maxDifferenceM<=0.001)};
}
