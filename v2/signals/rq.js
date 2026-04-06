// ── signals/rq.js ────────────────────────────────────────────────
import * as S from '../core/state.js';
import { clamp } from '../core/utils.js';
import { WIN_SIGNAL_MS, WIN_CONTEXT_MS } from '../core/config.js';

export function computeRQ() {
  if(!S.atrVal||!S.vixPrice||!S.spyPrice||S.raw1m.length<5){
    S.rqState='NEUTRAL'; S.rqDir=0; S.rqScore=0; S.rqStatus='CALIBRATING'; return;
  }
  const nowMs=Date.now();
  const srcBars=S.raw1m.filter(b=>(nowMs-b.t*1000)<=WIN_SIGNAL_MS);
  if(srcBars.length<3){ S.rqState='NEUTRAL'; S.rqDir=0; S.rqScore=0; S.rqStatus='CALIBRATING'; return; }
  S.rqCandleHist=srcBars.map(b=>{
    const range=b.h-b.l;
    if(range<0.001) return {body:0,wickBias:0,bullish:b.c>=b.o,h:b.h,l:b.l,o:b.o,c:b.c};
    const body=Math.abs(b.c-b.o)/range;
    const upperWick=(b.h-Math.max(b.o,b.c))/range;
    const lowerWick=(Math.min(b.o,b.c)-b.l)/range;
    const wickBias=lowerWick-upperWick;
    return {body,wickBias,bullish:b.c>b.o,h:b.h,l:b.l,o:b.o,c:b.c};
  });
  const n=S.rqCandleHist.length;
  const baselineBars=S.rqCandleHist.slice(0,Math.max(n-3,3));
  const recentBars=S.rqCandleHist.slice(-3);
  const baselineBody=baselineBars.reduce((s,c)=>s+c.body,0)/Math.max(baselineBars.length,1);
  const recentBody=recentBars.reduce((s,c)=>s+c.body,0)/Math.max(recentBars.length,1);
  const bodyDelta=recentBody-baselineBody;
  const recentWick=recentBars.reduce((s,c)=>s+c.wickBias,0)/Math.max(recentBars.length,1);
  const last3Wick=recentBars.map(c=>c.wickBias);
  const upperWickCount=last3Wick.filter(w=>w<-0.15).length;
  const lowerWickCount=last3Wick.filter(w=>w>0.15).length;
  const wickConsistentBear=upperWickCount>=2;
  const wickConsistentBull=lowerWickCount>=2;
  const bullishBars=recentBars.filter(c=>c.bullish).length;
  const bearishBars=recentBars.filter(c=>!c.bullish).length;
  const dirConsistentBull=bullishBars>=2;
  const dirConsistentBear=bearishBars>=2;
  let ema8RejectBear=0,ema8RejectBull=0,ema8PersistBear=0,ema8PersistBull=0;
  if(S.ema8Val&&srcBars.length>=3){
    srcBars.forEach(b=>{
      if(b.h>=S.ema8Val&&b.c<S.ema8Val) ema8RejectBear++;
      if(b.l<=S.ema8Val&&b.c>S.ema8Val) ema8RejectBull++;
      if(b.c<S.ema8Val) ema8PersistBear++;
      if(b.c>S.ema8Val) ema8PersistBull++;
    });
  }
  const minPersist=Math.max(3,Math.floor(srcBars.length*0.5));
  const coilBear=ema8RejectBear>=3&&ema8PersistBear>=minPersist;
  const coilBull=ema8RejectBull>=3&&ema8PersistBull>=minPersist;
  const coilCount=Math.max(ema8RejectBear,ema8RejectBull);
  let candleScore=0;
  if(bodyDelta>0.05)      candleScore+=0.25;
  if(recentWick>0.1)      candleScore+=0.25;
  else if(recentWick<-0.1) candleScore-=0.25;
  if(wickConsistentBull)  candleScore+=0.15;
  if(wickConsistentBear)  candleScore-=0.15;
  if(dirConsistentBull)   candleScore+=0.15;
  if(dirConsistentBear)   candleScore-=0.15;
  if(coilBear)  candleScore-=0.20;
  if(coilBull)  candleScore+=0.20;
  candleScore=Math.max(-1,Math.min(1,candleScore));
  const perBarImplied=(S.vixPrice/100)/Math.sqrt(252)/Math.sqrt(390)*S.spyPrice;
  const realizedVsImplied=perBarImplied>0?S.atrVal/perBarImplied:1.0;
  let vixRising=false;
  if(S.vixHistory.length>=4){
    const vold=S.vixHistory[S.vixHistory.length-4];
    vixRising=(S.vixPrice-vold)/Math.max(vold,0.01)>0.02;
  }
  let driftScore=0;
  const driftBars=S.raw1m.filter(b=>(nowMs-b.t*1000)<=WIN_CONTEXT_MS);
  if(driftBars.length>=5&&S.atrVal){
    const priceChange=driftBars[driftBars.length-1].c-driftBars[0].o;
    const expectedRange=S.atrVal*driftBars.length;
    driftScore=clamp(priceChange/Math.max(expectedRange,0.01),-1,1);
  }
  const hasDrift=Math.abs(driftScore)>0.35;
  const hasBodyTrend=Math.abs(candleScore)>0.25;
  const trending=(hasBodyTrend||hasDrift||coilBear||coilBull)&&realizedVsImplied>0.85;
  const stress=vixRising&&realizedVsImplied<0.85;
  const ranging=!trending&&(bodyDelta<-0.05||realizedVsImplied<0.8);
  if(stress)        S.rqState='STRESS';
  else if(trending) S.rqState='TRENDING';
  else if(ranging)  S.rqState='RANGING';
  else              S.rqState='NEUTRAL';
  if(trending){
    let dirSource=hasBodyTrend?candleScore:driftScore;
    const coilAmp=1+Math.min(coilCount/8,0.5);
    S.rqScore=clamp(dirSource*0.15*coilAmp,-0.22,0.22);
  } else if(stress) S.rqScore=-0.15;
  else if(ranging)  S.rqScore=-0.10;
  else              S.rqScore=0;
  const rvPct=Math.round(realizedVsImplied*100);
  const wickTag=wickConsistentBear?' UW↓':wickConsistentBull?' LW↑':'';
  const coilTag=coilBear?' COIL↓'+ema8RejectBear:coilBull?' COIL↑'+ema8RejectBull:'';
  const driftTag=hasDrift?' DRIFT'+(driftScore>0?'↑':'↓'):'';
  S.rqStatus=S.rqState+' · RvI '+rvPct+'%'+wickTag+coilTag+driftTag;
}
