"""Native HEO term extension in AP scratch copies, never in the modules checkout."""
from pathlib import Path
import shutil,subprocess,hashlib,json,os
scratch=Path('/Users/tj/software/terrain-work/body-look/codex-apgap-d9/variants')
source=scratch/'CONTROL'
manifest={}
for degree in [12,20]:
 name='HEO'+str(degree);dest=scratch/name;p=dest/'propagator/sdn-ap'
 if not dest.exists():
  shutil.copytree(source,dest,symlinks=True,ignore=shutil.ignore_patterns('dist','.sdk-build','.build','build.log'))
  f=p/'src/tesseral.inc';s=f.read_text().replace('constexpr int kShallowMax = 160;','constexpr int kShallowMax = 2048;')
  marker='constexpr double kShallowBand = 0.045;'
  s=s.replace(marker,marker+f'\nconstexpr int kHeoMaxDegree = {degree};\ninline bool heo_selected(int l,int m,int p,int k,double n,double e,double i);')
  marker='const double psidot = w * wdot + j * mdot + m * (node_rate - kOmegaE);'
  assert s.count(marker)==2
  # Only the add lambda (the first occurrence): move selected terms from output short-periodics to integrated rates.
  s=s.replace(marker,marker+'\n    if (!low && heo_selected(l,m,p,j,n0,e0,i0)) return;',1)
  native=r'''
inline bool heo_selected(int l,int m,int p,int k,double n,double e,double i) {
  if(l<6||l>kHeoMaxDegree||k<1||k>64)return false;
  const auto sr=secular_rates(n,e,i);
  const double psi=(l-2*p)*sr.argp+k*sr.mdot+m*(sr.node-kOmegaE);
  if(std::fabs(psi)>=kNearBand*n)return false;
  const auto carried=res::class_terms(res::band_of(n));
  for(int j=0;j<carried.count;++j){const auto& t=carried.t[j];if(t.l==l&&t.m==m&&t.p==p&&l-2*p+t.q==k)return false;}
  return true;
}
inline int heo_terms(int degree,double n,double e,double i,ShallowTerms& out) {
  out.count=0;const int lmax=degree<kHeoMaxDegree?degree:kHeoMaxDegree;
  const auto sr=secular_rates(n,e,i);const double h=1e-5;
  for(int l=6;l<=lmax;++l)for(int m=1;m<=l;++m)for(int p=0;p<=l;++p){
    const int w=l-2*p;
    const int center=int(std::round((m*(kOmegaE-sr.node)-w*sr.argp)/sr.mdot));
    double F[72],Fp[72],Fm[72];bool have=false;
    for(int k=center-1;k<=center+1;++k){
      if(!heo_selected(l,m,p,k,n,e,i))continue;
      if(out.count>=kShallowMax)return -1;
      if(!have){normalized_Fk(m,w,l,i,F);normalized_Fk(m,w,l,i+h,Fp);normalized_Fk(m,w,l,i-h,Fm);have=true;}
      double G,dG;res::exact_G(l,p,k-w,e,G,dG);
      auto& c=out.c[out.count++];c.l=l;c.m=m;c.p=p;c.k=k;c.odd=(l-m)&1;
      c.C=kEgmC[l][m];c.S=kEgmS[l][m];c.fg=F[l]*G;c.fdg=F[l]*dG;c.dfg=(Fp[l]-Fm[l])/(2*h)*G;
    }
  }
  return out.count;
}
'''
  s=s.replace('}  // namespace tess',native+'\n}  // namespace tess');f.write_text(s)
  f=p/'src/xp_theory.inc';s=f.read_text().replace('if (sd >= 2 && res == 0 && !s.ctx.long_period) {','if (sd >= 2) {').replace('const int count = tess::shallow_terms(sd, n0, e.eo, e.xincl, scratch);','const int count = res == 0 && !s.ctx.long_period ? tess::shallow_terms(sd, n0, e.eo, e.xincl, scratch) : tess::heo_terms(sd, n0, e.eo, e.xincl, scratch);\n    if(count<0)return false;').replace('wgt = tess::shallow_weight(sr, last_k, last_m, fr.n);','wgt = ctx.long_period || ctx.resonance != 0 ? 1.0 : tess::shallow_weight(sr, last_k, last_m, fr.n);');f.write_text(s)
 with (dest/'build.log').open('w') as log:rc=subprocess.run(['node','build.mjs'],cwd=p,env=dict(os.environ,SPACE_DATA_NETWORK_MODULES_ROOT='/Users/tj/software/spacedatanetwork-stack/repos/main-packages/space-data-network-modules'),stdout=log,stderr=subprocess.STDOUT).returncode
 wasm=p/'dist/isomorphic/module.wasm';manifest[name]={'returncode':rc,'path':str(wasm),'sha256':hashlib.sha256(wasm.read_bytes()).hexdigest() if rc==0 else None,'degree':degree,'changedSources':{str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [p/'src/tesseral.inc',p/'src/xp_theory.inc']}}
 (scratch/'heo-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(name,rc,flush=True)
 if rc:break
