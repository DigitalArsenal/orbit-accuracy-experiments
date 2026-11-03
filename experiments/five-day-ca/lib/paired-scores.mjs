import crypto from 'node:crypto';
import {rand} from '../../operator-theory/lib/compare.mjs';
const quantile=(s,p)=>s[Math.floor((s.length-1)*p)];
export function pairedScores(records,label){
 const result={n:records.length,undefinedLog:0};
 for(const metric of ['brier','log']){
  const accepted=records.map(r=>({...r,d:r.a[metric]-r.b[metric]})).filter(r=>!Number.isNaN(r.d));if(metric==='log')result.undefinedLog=records.length-accepted.length;
  const grouped=[...Map.groupBy(accepted,r=>r.object).values()].map(rs=>({n:rs.length,sum:rs.reduce((s,r)=>s+r.d,0)}));
  const rng=rand(parseInt(crypto.createHash('sha256').update(`${label}|${metric}|20261103`).digest('hex').slice(0,8),16)),samples=[];
  for(let k=0;k<10000&&grouped.length;k++){let sum=0,n=0;for(let j=0;j<grouped.length;j++){const c=grouped[Math.floor(rng()*grouped.length)];sum+=c.sum;n+=c.n;}const value=sum/n;if(!Number.isNaN(value))samples.push(value);}
  samples.sort((a,b)=>a-b);const mean=accepted.reduce((s,r)=>s+r.d,0)/accepted.length;
  result[metric]={n:accepted.length,objects:grouped.length,positiveInfinity:accepted.filter(r=>r.d===Infinity).length,negativeInfinity:accepted.filter(r=>r.d===-Infinity).length,mean:Number.isNaN(mean)?null:mean,ci95:samples.length?[quantile(samples,.025),quantile(samples,.975)]:null,bootstrapDefined:samples.length,bootstrapDraws:10000};
 }
 return result;
}
