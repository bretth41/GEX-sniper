// ── signals/gx.js ────────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { etDateStr } from '../core/utils.js';
import { GX_N, GX_HISTORY_MAX, GX_BREAK_DIST, GX_BREAK_COUNT, GX_REFRESH_MS } from '../core/config.js';

export function computeGX() {
  try {
    if(!S.spyPrice||S.gxSessionStrikes.length<3||Object.keys(S.gxStrikeHistory).length<3){
      S.gxState='—'; S.gxDetail=''; return;
    }
    const price=S.spyPrice;
    let domStrike=null, domGamma=0;
    S.gxSessionStrikes.forEach(s=>{
      const hist=S.gxStrikeHistory[s]||[];
      const cur=hist.length?hist[hist.length-1]:0;
      if(cur>domGamma){ domGamma=cur; domStrike=s; }
    });
    if(!domStrike){ S.gxState='—'; return; }
    if(S.spyPrice&&Math.abs(domStrike-S.spyPrice)<=30) S.gxDominantStrike=domStrike;
    const distFromDom=Math.abs(price-domStrike);
    if(distFromDom>=GX_BREAK_DIST) S.gxBreakCount=Math.min(S.gxBreakCount+1, GX_BREAK_COUNT+10);
    else                           S.gxBreakCount=Math.max(0, S.gxBreakCount-2);
    const q1Break=S.gxBreakCount>=GX_BREAK_COUNT;
    const domHist=S.gxStrikeHistory[domStrike]||[];
    let q2Losing=false, domSlope=0;
    if(domHist.length>=10){
      const window2=domHist.slice(-Math.min(30,domHist.length));
      const n=window2.length;
      const sumX=n*(n-1)/2;
      const sumY=window2.reduce((s,v)=>s+v,0);
      const sumXY=window2.reduce((s,v,i)=>s+i*v,0);
      const sumX2=window2.reduce((s,v,i)=>s+i*i,0);
      domSlope=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX)||0;
      const domPeak=S.gxDomPeak[domStrike]||domGamma;
      const pctOfPeak=domPeak>0?domGamma/domPeak:1;
      q2Losing=domSlope<0&&pctOfPeak<0.70;
    }
    let emergingStrike=null, emergingGamma=0, emergingTier='';
    let q3Growing=false;
    const breakDir=price<domStrike?-1:1;
    const candidates=S.gxSessionStrikes.filter(s=>s!==domStrike&&(breakDir<0?s<domStrike:s>domStrike));
    candidates.forEach(s=>{
      const hist=S.gxStrikeHistory[s]||[];
      if(hist.length<10) return;
      const cur=hist[hist.length-1];
      const w1=hist.slice(-30,-20); const w2=hist.slice(-20,-10); const w3=hist.slice(-10);
      if(!w1.length||!w2.length||!w3.length) return;
      const avg1=w1.reduce((s,v)=>s+v,0)/w1.length;
      const avg2=w2.reduce((s,v)=>s+v,0)/w2.length;
      const avg3=w3.reduce((s,v)=>s+v,0)/w3.length;
      const growing=avg2>avg1*1.05&&avg3>avg2*1.05;
      if(growing&&cur>emergingGamma){ emergingGamma=cur; emergingStrike=s; }
    });
    if(emergingStrike){
      const domPeak=S.gxDomPeak[domStrike]||domGamma;
      const pctOfDom=domPeak>0?emergingGamma/domPeak:0;
      if(pctOfDom>=0.80)      { emergingTier='DOMINANT';  q3Growing=true; }
      else if(pctOfDom>=0.50) { emergingTier='EMERGING';  q3Growing=true; }
      else if(pctOfDom>=0.20) { emergingTier='BUILDING';  q3Growing=true; }
      else if(pctOfDom>=0.05) { emergingTier='FORMING';   q3Growing=false; }
      else                    { emergingTier='';           q3Growing=false; }
    }
    S.gxEmergingStrike=emergingStrike;
    S.gxEmergingTier=emergingTier;
    let candidate;
    if(q1Break&&q2Losing&&q3Growing&&emergingTier==='DOMINANT') candidate='BREAK';
    else if(q1Break&&q2Losing&&q3Growing)  candidate='TRANSFERRING';
    else if(q1Break&&q2Losing&&!q3Growing) candidate='VOID';
    else if(q1Break&&!q2Losing)            candidate='MAGNET';
    else if(!q1Break&&q3Growing)           candidate='CONTESTED';
    else if(!q1Break&&distFromDom<GX_BREAK_DIST) candidate='PINNED';
    else                                   candidate='—';
    S.gxState=candidate;
    const dist='$'+distFromDom.toFixed(2);
    const domLabel='Dom:'+domStrike+(domSlope<0?'↓':'→');
    const emLabel=emergingStrike?(' Em:'+emergingStrike+'('+emergingTier+')') :'';
    S.gxDetail=domLabel+' '+dist+emLabel;
  } catch(e){ S.gxState='—'; S.gxDetail=''; }
}

// updateGxHistory — called from fetchUWLevels, not part of the signal compute cycle
export function updateGxHistory(allRows, price) {
  try {
    if(!allRows||!allRows.length||!price) return;
    const now=Date.now();
    const today=etDateStr();
    const priceAnchor=S.spyPrice||price||0;
    if(priceAnchor===0) return;
    const needRefresh=
      S.gxSessionDate!==today || S.gxSessionStrikes.length===0 ||
      !S.gxAnchoredWithPrice  || (now-S.gxLastRefreshTs)>=GX_REFRESH_MS;
    if(needRefresh){
      if(S.gxSessionDate!==today){
        S.gxStrikeHistory={}; S.gxStrikeHistoryTs=[]; S.gxDomPeak={};
        S.gxBreakCount=0; S.gxSessionDate=today;
        S.g1StructuralMax=1; S.g1IntradayMax=1; S.g1VolMax=1; S.g1CoilMax=0;
        S.gxAnchoredWithPrice=false;
      }
      const ranked=[...allRows]
        .filter(r=>Math.abs(r.strike-priceAnchor)<=20)
        .map(r=>({strike:r.strike, totalGex:r.callGex+r.putGex}))
        .sort((a,b)=>b.totalGex-a.totalGex)
        .slice(0,GX_N)
        .map(r=>r.strike);
      S.gxSessionStrikes=ranked;
      S.gxLastRefreshTs=now;
      S.gxAnchoredWithPrice=true;
    }
    // Near-price snapshot for GIA (±$5)
    if(priceAnchor>0){
      let topG=0, botG=0;
      allRows.forEach(r=>{
        const dist=r.strike-priceAnchor;
        if(dist>0&&dist<=5) topG+=r.callGex+r.putGex;
        else if(dist<0&&dist>=-5) botG+=r.callGex+r.putGex;
      });
      S.gxNearHist.push({ts:now,topGamma:topG,botGamma:botG});
      if(S.gxNearHist.length>8) S.gxNearHist.shift();
    }
    S.gxStrikeHistoryTs.push(now);
    if(S.gxStrikeHistoryTs.length>GX_HISTORY_MAX){
      S.gxStrikeHistoryTs.shift();
      Object.keys(S.gxStrikeHistory).forEach(s=>{
        if(S.gxStrikeHistory[s].length>GX_HISTORY_MAX) S.gxStrikeHistory[s].shift();
      });
    }
    S.gxSessionStrikes.forEach(strike=>{
      const row=allRows.find(r=>r.strike===strike);
      const gamma=row?(row.callGex+row.putGex):0;
      if(!S.gxStrikeHistory[strike]) S.gxStrikeHistory[strike]=[];
      S.gxStrikeHistory[strike].push(gamma);
      if(!S.gxDomPeak[strike]||gamma>S.gxDomPeak[strike]) S.gxDomPeak[strike]=gamma;
    });
  } catch(e){}
}
