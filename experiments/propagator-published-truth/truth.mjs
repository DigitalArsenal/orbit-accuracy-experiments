import fs from 'node:fs';
import path from 'node:path';
import { ReferenceIndex } from '../../harness/reference.mjs';
import { decodeOemStream } from '../../harness/records.mjs';
import { gateOemFrame } from '../../harness/truth-gate.mjs';
import { config, DAY, iso } from './common.mjs';

export const windows = () => config.objects.flatMap(o => o.issueDates.map(date => ({ ...o, date, key: `${o.norad}-${date}` })));
export function loadArc(w, run, codec) {
  const nominal = Date.parse(`${w.date}T00:00:00Z`), start = nominal - config.fitHours * 3600e3, stop = nominal + 7 * DAY;
  const ref = new ReferenceIndex(w.root, w.prefix), spans = ref.spans(w.norad, start - 60000, stop + 60000);
  for (const p of ref.products) run.record(path.join(w.root,p.product,'index.json'));
  const byTime = new Map(), products = [];
  for (const s of spans.sort((a,b) => a.product.localeCompare(b.product))) {
    const indexFile = path.join(w.root, s.product, 'index.json'); run.record(indexFile);
    const index = JSON.parse(fs.readFileSync(indexFile)); products.push({ product:s.product,url:index.url,sourceSha256:index.sha256,uncertainty:index.statedSigmaBasis,eop:index.eop,eopObservedRowsSha256:index.eopObservedRowsSha256 });
    const raw = fs.readFileSync(path.join(w.root,s.file));
    const bytes = gateOemFrame(raw,{product:s.product,onDrop:d=>ref.gated.push(d)}).bytes;
    ref.read[s.file] = true;
    run.record(path.join(w.root,s.file));
    for (const record of decodeOemStream(bytes)) for (const b of record.EPHEMERIS_DATA_BLOCK) {
      if (b.OBJECT.NORAD_CAT_ID !== w.norad) continue;
      if (b.REFERENCE_FRAME?.NAME !== 'GCRF' || b.TIME_SYSTEM !== codec.OEM.timingStandard.UTC) throw new Error(`unsupported reference axes/time in ${s.file}`);
      for (const l of codec.lines(b)) if (l.ms >= start - 60000 && l.ms <= stop + 60000 && [...l.r,...l.v].every(Number.isFinite) && l.v.some(v => v !== 0)) byTime.set(l.ms,l);
    }
  }
  const all = [...byTime.values()].sort((a,b) => a.ms-b.ms), issueLine = all.findLast(l => l.ms <= nominal);
  const audit = { products, dropped: ref.gated, files: Object.keys(ref.read), nominalIssue:iso(nominal) };
  if (!issueLine || nominal - issueLine.ms > config.truthToleranceSeconds * 1000) return { excluded:'missing issue state',audit };
  const E = issueLine.ms;
  const nearest = target => {
    let lo=0,hi=all.length; while(lo<hi){const mid=(lo+hi)>>>1;if(all[mid].ms<target)lo=mid+1;else hi=mid;}
    const candidates=[all[lo-1],all[lo]].filter(Boolean).sort((a,b)=>Math.abs(a.ms-target)-Math.abs(b.ms-target));
    return candidates[0] && Math.abs(candidates[0].ms-target)<=config.truthToleranceSeconds*1000 ? candidates[0] : null;
  };
  const fit=[]; for(let t=E-config.fitHours*3600e3;t<=E;t+=config.fitStepSeconds*1000){const l=nearest(t);if(l && l.ms<=E)fit.push(l);}
  if(fit.length<config.minimumCoverage*(config.fitHours*3600/config.fitStepSeconds+1))return {excluded:'fit coverage below registered minimum',audit,issue:iso(E),fitSamples:fit.length};
  const score=[], leads={};
  for(const lead of config.leadDays){
    const selected=[];for(let t=E+(lead-1)*DAY+config.scoreStepSeconds*1000;t<=E+lead*DAY;t+=config.scoreStepSeconds*1000){const l=nearest(t);if(l && l.ms>E)selected.push({...l,lead});}
    const exact=nearest(E+lead*DAY);
    leads[lead]={available:selected.length>=config.minimumCoverage*86400/config.scoreStepSeconds,samples:selected.length,exactMs:exact?.ms ?? null,offsetSeconds:exact ? (exact.ms-E-lead*DAY)/1000 : null};
    if(leads[lead].available)score.push(...selected);
  }
  ref.dropCache();
  if (!score.length) return {excluded:'no lead meets registered coverage',audit,issue:iso(E),fit,leads};
  return {E,fit,score,leads,audit,issue:iso(E)};
}
