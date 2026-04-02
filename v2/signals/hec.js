// ── signals/hec.js ───────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { etDateStr } from '../core/utils.js';

export function computeHEC() {
  try {
    const now=Date.now();
    const today=etDateStr();
    if(S.hecSessionDate!==today){
      S.hecSessionDate=today; S.hecRatioHist=[];
      S.hecState='—'; S.hecDir=0; S.hecSlope=0;
      S.hecWeakCount=0; S.hecCollapseCount=0; S.hecRatioMax=1;
    }
    const FIVE_MIN_MS=300000;
    let deltaS5=0;
    if(S.todayBars.length>=2){
      const cutoff5=now-FIVE_MIN_MS;
      const bar5=S.todayBars.filter(b=>b.t*1000>=cutoff5);
      if(bar5.length>=2) deltaS5=Math.abs(bar5[bar5.length-1].c-bar5[0].o);
      else if(S.todayBars.length>=2) deltaS5=Math.abs(S.todayBars[S.todayBars.length-1].c-S.todayBars[S.todayBars.length-2].c);
    }
    const dS=Math.max(deltaS5,0.10);
    const nearPrice=S.spyPrice||0;
    const NEAR=$=>Math.abs(parseFloat($.strike||0)-nearPrice)<=5;
    function voiFromRows(rows){
      let cVoi=0,pVoi=0,cN=0,pN=0;
      rows.forEach(row=>{
        if(!NEAR(row)) return;
        const type=String(row.type||'').toLowerCase();
        const voi=parseFloat(row.volume_oi_ratio)||0;
        if(voi<=0) return;
        if(type==='call'){ cVoi+=voi; cN++; } else if(type==='put'){ pVoi+=voi; pN++; }
      });
      return{callVOI:cN>0?cVoi/cN:0, putVOI:pN>0?pVoi/pN:0, n:cN+pN};
    }
    const v0=voiFromRows(S.f1FlowRows);
    let callVOI=v0.callVOI, putVOI=v0.putVOI;
    if(v0.n<3&&window._hecAll1DTE){
      const v1=voiFromRows(window._hecAll1DTE);
      callVOI=callVOI>0?(callVOI+v1.callVOI*0.70)/2:v1.callVOI*0.70;
      putVOI =putVOI>0 ?(putVOI +v1.putVOI*0.70) /2:v1.putVOI*0.70;
    }
    const avgVOI=(callVOI+putVOI)/2||0;
    const ratio=(S.deltaAtRisk>0&&avgVOI>0)?(S.deltaAtRisk*avgVOI)/dS:0;
    S.hecRatioMax=Math.max(S.hecRatioMax,ratio,1);
    S.hecRatioHist.push({ts:now,ratio,callVOI,putVOI});
    const cutoffHist=now-FIVE_MIN_MS-30000;
    S.hecRatioHist=S.hecRatioHist.filter(r=>r.ts>cutoffHist);
    if(S.hecRatioHist.length<3){ S.hecState='—'; return; }
    const win=S.hecRatioHist.slice(-5);
    const n=win.length;
    const sumX=n*(n-1)/2;
    const sumY=win.reduce((s,r)=>s+r.ratio,0);
    const sumXY=win.reduce((s,r,i)=>s+i*r.ratio,0);
    const sumX2=win.reduce((s,_,i)=>s+i*i,0);
    const rawSlope=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX)||0;
    S.hecSlope=Math.max(-1,Math.min(1,rawSlope/Math.max(S.hecRatioMax,1)));
    if(S.hecRatioHist.length>=4){
      const w4=S.hecRatioHist.slice(-4);
      const cSlope=(w4[w4.length-1].callVOI-w4[0].callVOI)/4;
      const pSlope=(w4[w4.length-1].putVOI -w4[0].putVOI) /4;
      if(Math.abs(cSlope)>0.1||Math.abs(pSlope)>0.1) S.hecDir=cSlope<pSlope?1:-1;
      if(Math.abs(cSlope-pSlope)<0.05&&S.driftPriceSlope!==0) S.hecDir=S.driftPriceSlope>0?1:-1;
    }
    const WEAK_THRESH=-0.08, COLLAPSE_THRESH=-0.22, WEAK_REQUIRED=3, COLLAPSE_REQUIRED=5;
    if(S.hecSlope<COLLAPSE_THRESH){
      S.hecCollapseCount=Math.min(S.hecCollapseCount+1,COLLAPSE_REQUIRED+5);
      S.hecWeakCount=Math.min(S.hecWeakCount+1,WEAK_REQUIRED+5);
    } else if(S.hecSlope<WEAK_THRESH){
      S.hecWeakCount=Math.min(S.hecWeakCount+1,WEAK_REQUIRED+5);
      S.hecCollapseCount=Math.max(0,S.hecCollapseCount-1);
    } else {
      S.hecWeakCount=Math.max(0,S.hecWeakCount-1);
      S.hecCollapseCount=Math.max(0,S.hecCollapseCount-1);
    }
    const priceMoving=Math.abs(S.driftPriceSlope)>0.10;
    const driftActive=S.driftState!=='—'&&S.driftState!=='EXHAUSTED';
    const weakGate   =priceMoving||driftActive;
    const collapseGate=priceMoving&&driftActive;
    const dirLabel=S.hecDir>0?'CALL':'PUT';
    if(S.hecCollapseCount>=COLLAPSE_REQUIRED&&collapseGate)  S.hecState=dirLabel+' COLLAPSE';
    else if(S.hecWeakCount>=WEAK_REQUIRED&&weakGate)          S.hecState=dirLabel+' WEAK';
    else                                                       S.hecState='STABLE';
  } catch(e){ S.hecState='—'; S.hecDir=0; S.hecSlope=0; }
}
