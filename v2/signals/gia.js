// ── signals/gia.js ───────────────────────────────────────────────
import * as S from '../core/state.js';
import { etDateStr } from '../core/utils.js';

export function computeGIA() {
  try {
    const today=etDateStr();
    if(S.giaSessionDate!==today){
      S.giaSessionDate=today; S.giaImbalHist=[];
      S.giaState='—'; S.giaDir=0; S.giaAccel=0; S.giaImbalMax=1;
    }
    if(S.gxNearHist.length<6){ S.giaState='—'; return; }
    const hist=S.gxNearHist.slice(-6);
    const prior=hist.slice(0,3);
    const current=hist.slice(3,6);
    const avg=arr=>v=>arr.reduce((s,r)=>s+r[v],0)/arr.length;
    const priorTop  =avg(prior)('topGamma');
    const priorBot  =avg(prior)('botGamma');
    const currentTop=avg(current)('topGamma');
    const currentBot=avg(current)('botGamma');
    const priorImbal  =priorTop  -priorBot;
    const currentImbal=currentTop-currentBot;
    const rawAccel=currentImbal-priorImbal;
    S.giaImbalMax=Math.max(S.giaImbalMax,Math.abs(rawAccel),Math.abs(currentImbal),1);
    S.giaAccel=Math.max(-1,Math.min(1,rawAccel/S.giaImbalMax));
    S.giaDir=S.giaAccel>0.05?1:S.giaAccel<-0.05?-1:0;
    const absAccel=Math.abs(S.giaAccel);
    if(absAccel<0.08)          S.giaState='BALANCED';
    else if(S.giaAccel>0.35)   S.giaState='STRONG CALL ACCEL';
    else if(S.giaAccel>0.12)   S.giaState='CALL ACCEL';
    else if(S.giaAccel<-0.35)  S.giaState='STRONG PUT ACCEL';
    else if(S.giaAccel<-0.12)  S.giaState='PUT ACCEL';
    else                       S.giaState='BALANCED';
  } catch(e){ S.giaState='—'; S.giaDir=0; S.giaAccel=0; }
}
