// ── signals/drift.js ─────────────────────────────────────────────
import * as S from '../core/state.js';
import { etDateStr } from '../core/utils.js';

export function computeDrift() {
  try {
    const now=Date.now();
    const today=etDateStr();
    if(S.driftSessionDate!==today){
      S.driftSessionDate=today; S.driftCallMax=1; S.driftPutMax=1;
      S.driftPremHist=[]; S.driftState='—'; S.driftPrevState='—';
      S.driftDetectTs=0; S.driftDetectDir=0;
    }
    const FIVE_MIN=300000, TEN_MIN=600000;
    let callPrem5=0,putPrem5=0;
    S.f1FlowRows.forEach(row=>{
      const t=new Date(row.created_at||0).getTime();
      if(now-t>FIVE_MIN) return;
      const type=String(row.type||'').toLowerCase();
      const prem=Math.max(0,parseFloat(row.total_premium)||0);
      if(type==='call') callPrem5+=prem; else if(type==='put') putPrem5+=prem;
    });
    S.driftPremHist.push({ts:now,callPrem:callPrem5,putPrem:putPrem5});
    const cutoff=now-TEN_MIN-30000;
    S.driftPremHist=S.driftPremHist.filter(r=>r.ts>cutoff);
    if(S.driftPremHist.length<4){ S.driftState='—'; return; }
    const midpoint=now-FIVE_MIN;
    const recent=S.driftPremHist.filter(r=>r.ts>=midpoint);
    const prior=S.driftPremHist.filter(r=>r.ts<midpoint);
    if(!recent.length||!prior.length){ S.driftState='—'; return; }
    const sumR=arr=>arr.reduce((a,r)=>a+r,0)/arr.length;
    const recentCall=sumR(recent.map(r=>r.callPrem));
    const priorCall =sumR(prior.map(r=>r.callPrem));
    const recentPut =sumR(recent.map(r=>r.putPrem));
    const priorPut  =sumR(prior.map(r=>r.putPrem));
    S.driftCallMax=Math.max(S.driftCallMax,recentCall,priorCall,1);
    S.driftPutMax =Math.max(S.driftPutMax, recentPut, priorPut,  1);
    const rawCallSlope=(recentCall-priorCall)/S.driftCallMax;
    const rawPutSlope =(recentPut -priorPut )/S.driftPutMax;
    S.driftCallSlope=Math.max(-1,Math.min(1,rawCallSlope));
    S.driftPutSlope =Math.max(-1,Math.min(1,rawPutSlope));
    S.driftDelta=Math.max(-2,Math.min(2,S.driftCallSlope-S.driftPutSlope));
    S.driftPriceSlope=0;
    if(S.todayBars.length>=2&&S.atrVal){
      const tenMinBarsBack=Math.min(10,S.todayBars.length-1);
      const old=S.todayBars[S.todayBars.length-1-tenMinBarsBack];
      const cur=S.todayBars[S.todayBars.length-1];
      S.driftPriceSlope=Math.max(-1,Math.min(1,(cur.c-old.c)/Math.max(S.atrVal*2,0.01)));
    }
    const absPrice=Math.abs(S.driftPriceSlope);
    const FLAT=0.25, FLAT_SUPER=0.20;
    let rawState='—';
    const wasCoil=S.driftPrevState.includes('COIL');
    const wasBull=S.driftPrevState.includes('CALL');
    const wasBear=S.driftPrevState.includes('PUT');
    if(wasCoil&&wasBull&&S.driftPriceSlope>FLAT)       rawState='CALL RELEASE';
    else if(wasCoil&&wasBear&&S.driftPriceSlope<-FLAT)  rawState='PUT RELEASE';
    else if(absPrice>FLAT&&Math.abs(S.driftDelta)<0.15) rawState='EXHAUSTED';
    else if(S.driftDelta>=1.0&&S.driftCallSlope>=0.4&&S.driftPutSlope<=-0.4&&absPrice<FLAT_SUPER) rawState='SUPER CALL COIL';
    else if(S.driftDelta<=-1.0&&S.driftPutSlope>=0.4&&S.driftCallSlope<=-0.4&&absPrice<FLAT_SUPER) rawState='SUPER PUT COIL';
    else if(S.driftDelta>=0.6&&absPrice<FLAT)  rawState='STRONG CALL COIL';
    else if(S.driftDelta<=-0.6&&absPrice<FLAT) rawState='STRONG PUT COIL';
    else if(S.driftDelta>=0.3&&absPrice<FLAT)  rawState='CALL COIL';
    else if(S.driftDelta<=-0.3&&absPrice<FLAT) rawState='PUT COIL';
    const isCoilState=rawState.includes('COIL');
    const isReleaseOrExhaust=rawState==='CALL RELEASE'||rawState==='PUT RELEASE'||rawState==='EXHAUSTED';
    const rawDir=rawState.includes('CALL')?1:rawState.includes('PUT')?-1:0;
    if(isCoilState){
      if(S.driftDetectTs===0||S.driftDetectDir!==rawDir){ S.driftDetectTs=now; S.driftDetectDir=rawDir; }
      const confirmMs=now-S.driftDetectTs;
      if(confirmMs>=90000){ S.driftPrevState=rawState; S.driftState=rawState; }
      else if(S.driftState==='—'||S.driftState==='EXHAUSTED') S.driftState='—';
      if(S.driftState.includes('COIL')&&rawDir!==0&&S.driftDetectDir===rawDir) S.driftState=rawState;
    } else if(isReleaseOrExhaust){
      S.driftDetectTs=0; S.driftDetectDir=0;
      S.driftState=rawState;
      if(rawState!=='EXHAUSTED') S.driftPrevState=rawState;
    } else {
      if(S.driftDetectTs>0&&now-S.driftDetectTs>180000){ S.driftDetectTs=0; S.driftDetectDir=0; }
      if(S.driftState.includes('COIL')) S.driftState='—';
      else if(S.driftState!=='CALL RELEASE'&&S.driftState!=='PUT RELEASE') S.driftState='—';
    }
  } catch(e){ S.driftState='—'; S.driftDelta=0; S.driftCallSlope=0; S.driftPutSlope=0; }
}
