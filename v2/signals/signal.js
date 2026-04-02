// ── signals/signal.js ────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { f } from '../core/utils.js';
import { g1Thresh } from './g1.js';
import { pushAlert } from '../fetch/alerts.js';
import { logSignalFire } from '../render/log.js';

export function computeSignal() {
  const now=Date.now();
  const thresh=g1Thresh||0.25;
  const g1Conviction=Math.abs(S.g1Score)>=0.75;
  const ctxCall=S.g1Dir>0&&S.g1Coil>thresh&&g1Conviction;
  const ctxPut =S.g1Dir<0&&S.g1Coil>thresh&&g1Conviction;
  const trigCall=S.f1Dir>0&&S.f1Strength>=1;
  const trigPut =S.f1Dir<0&&S.f1Strength>=1;
  const swCall  =S.f1Dir>0&&S.f1Strength>=2;
  const swPut   =S.f1Dir<0&&S.f1Strength>=2;
  const FRESH_MS=20*60*1000;
  if(S.f1SweepAccum.sweeps&&S.f1SweepAccum.sweeps.length>0&&S.sigLastFireDir!==0){
    const matchingSweeps=S.f1SweepAccum.sweeps.filter(s=>s.dir===S.sigLastFireDir);
    if(matchingSweeps.length>0){
      const newest=Math.max(...matchingSweeps.map(s=>s.ts||0));
      if(newest>S.sigFreshSweepTs) S.sigFreshSweepTs=newest;
      if(newest>S.sigRawSweepTs)   S.sigRawSweepTs=newest;
    }
  } else if(S.f1SweepAccum.sweeps&&S.f1SweepAccum.sweeps.length>0&&S.sigLastFireDir===0){
    const newest=Math.max(...S.f1SweepAccum.sweeps.map(s=>s.ts||0));
    if(newest>S.sigFreshSweepTs) S.sigFreshSweepTs=newest;
    if(newest>S.sigRawSweepTs)   S.sigRawSweepTs=newest;
  }
  const sweepAge=S.sigFreshSweepTs>0?now-S.sigFreshSweepTs:Infinity;
  const sweepFresh=sweepAge<FRESH_MS;
  const rawSweepAge=S.sigRawSweepTs>0?now-S.sigRawSweepTs:Infinity;
  const rawSweepFresh=rawSweepAge<60000;
  const f1HighConviction=S.f1SweepAccum.score>1.5;
  const wxNotOpposing=(d)=>!(d>0&&S.wxCompScore<=-0.50)&&!(d<0&&S.wxCompScore>=0.50);
  if(S.sigFirePrice&&S.spyPrice&&S.sigLastFireDir!==0){
    const move=(S.spyPrice-S.sigFirePrice)/S.sigFirePrice;
    if((S.sigLastFireDir>0&&move<-0.0035)||(S.sigLastFireDir<0&&move>0.0035)){
      S.sigCount=0; S.sigDir=0; S.sigFirePrice=null;
    }
  }
  if((S.sigState==='STRONG_CALL'||S.sigState==='STRONG_PUT')&&now>S.sigLock){
    if(!rawSweepFresh){
      S.sigStalePollCount++;
      if(S.sigStalePollCount>=6){
        S.sigState=S.sigState==='STRONG_CALL'?'CALL':'PUT';
        S.sigStalePollCount=0;
        return;
      }
    } else { S.sigStalePollCount=0; }
  }
  let desDir=0, isStrong=false;
  const alreadyStrong=S.sigState==='STRONG_CALL'||S.sigState==='STRONG_PUT';
  const strongGate=alreadyStrong?true:S.sigHasBeenNeutral;
  if(ctxCall&&trigCall){
    desDir=1;
    isStrong=(f1HighConviction&&sweepFresh&&wxNotOpposing(1)&&strongGate)||(swCall&&sweepFresh&&strongGate);
  }
  if(ctxPut&&trigPut){
    const ps=(f1HighConviction&&sweepFresh&&wxNotOpposing(-1)&&strongGate)||(swPut&&sweepFresh&&strongGate);
    if(desDir===0||ps){desDir=-1;isStrong=ps;}
  }
  const desired=desDir===0?'NEUTRAL':desDir>0?(isStrong?'STRONG_CALL':'CALL'):(isStrong?'STRONG_PUT':'PUT');
  const cb=S.sigState.replace('STRONG_',''), db=desired.replace('STRONG_','');
  if(cb===db&&cb!=='NEUTRAL'){if(S.sigState!==desired)S.sigState=desired;S.sigCount=0;return;}
  if(desired===S.sigState){S.sigCount=0;return;}
  const locked=now<S.sigLock;
  if(locked&&desDir===0) return;
  if(locked&&db!==cb&&cb!=='NEUTRAL') return;
  const refireWindow=8*60*1000;
  if(desDir===S.sigLastFireDir&&(now-S.sigLastFireTs)<refireWindow&&desDir!==0){
    if(!swCall&&desDir>0){S.sigCount=0;return;}
    if(!swPut&&desDir<0){S.sigCount=0;return;}
  }
  if(desDir===S.sigDir) S.sigCount++; else{S.sigDir=desDir;S.sigCount=1;return;}
  if(S.sigCount>=2){
    const prev=S.sigState; S.sigState=desired; S.sigCount=0;
    S.sigStalePollCount=0;
    if(desDir!==0){
      S.sigLock=now+120000;
      S.sigLastFireDir=desDir; S.sigLastFireTs=now; S.sigFirePrice=S.spyPrice;
      S.sigHasBeenNeutral=false;
      if(prev!==S.sigState){
        S.trapFirstTs=0; S.microFirstTs=0;
        S.prevTrapState='NEUTRAL'; S.prevMicroState='—';
        const em=desDir>0?'🟢':'🔴';
        pushAlert(em+' '+S.sigState.replace('_',' ')+'\nSPY: '+f(S.spyPrice)+'\n'+S.g1Status+'\n'+S.f1Status,'SPY SNIPER');
        if(S.sigState==='STRONG_CALL'||S.sigState==='STRONG_PUT') logSignalFire();
      }
    } else {
      S.sigLastFireDir=0; S.sigLastFireTs=0; S.sigFirePrice=null;
      S.sigFreshSweepTs=0; S.sigRawSweepTs=0; S.sigStalePollCount=0;
      S.sigHasBeenNeutral=true;
    }
  }
}
