// ── signals/wx.js ────────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { WIN_SIGNAL_MS } from '../core/config.js';

export function computeWX() {
  try {
    S.wxScore=0;
    const nowMs=Date.now();
    const bars=S.raw1m.filter(b=>(nowMs-b.t*1000)<=WIN_SIGNAL_MS);
    if(!S.ema8Val||!S.atrVal||bars.length<3){
      S.wxState='—'; S.wxDir=0; S.wxRejectCount=0;
      S.wxWickSpread=null; S.wxClusterPrice=null; S.wxCompression=false;
      return;
    }
    const EMA_PROXIMITY=0.0008;
    const bearRej=[], bullRej=[];
    bars.forEach(function(b){
      const range=b.h-b.l; if(range<0.001) return;
      const emaTol=S.ema8Val*EMA_PROXIMITY;
      if(b.h>=(S.ema8Val-emaTol)&&b.c<S.ema8Val)
        bearRej.push({tip:b.h, wickLen:b.h-Math.max(b.o,b.c)});
      if(b.l<=(S.ema8Val+emaTol)&&b.c>S.ema8Val)
        bullRej.push({tip:b.l, wickLen:Math.min(b.o,b.c)-b.l});
    });
    S.wxRejectCount=0; S.wxDir=0; S.wxWickSpread=null;
    S.wxClusterPrice=null; S.wxCompression=false;
    const rejs=bearRej.length>=bullRej.length?bearRej:bullRej;
    if(rejs.length<2){ S.wxState='—'; return; }
    S.wxDir=rejs===bearRej?-1:1;
    S.wxRejectCount=rejs.length;
    const tips=rejs.map(function(r){return r.tip;}).sort(function(a,b){return a-b;});
    const mid=Math.floor(tips.length/2);
    const median=tips.length%2===0?(tips[mid-1]+tips[mid])/2:tips[mid];
    S.wxClusterPrice=median;
    const devs=tips.map(function(t){return Math.abs(t-median);});
    const avgDev=devs.reduce(function(s,v){return s+v;},0)/devs.length;
    const worstDev=Math.max(...devs);
    S.wxWickSpread=Math.max(...tips)-Math.min(...tips);
    let precFactor;
    if(avgDev<0.03)      precFactor=3.0;
    else if(avgDev<0.08) precFactor=2.5;
    else if(avgDev<0.15) precFactor=1.5;
    else if(avgDev<0.20) precFactor=1.0;
    else                 precFactor=0.4;
    let worstPenalty;
    if(worstDev<=0.04)       worstPenalty=1.0;
    else if(worstDev<=0.08)  worstPenalty=0.80;
    else if(worstDev<=0.15)  worstPenalty=0.45;
    else if(worstDev<=0.25)  worstPenalty=0.15;
    else                     worstPenalty=0.03;
    const countScore=Math.pow(S.wxRejectCount, 1.3);
    if(rejs.length>=3){
      const half=Math.floor(rejs.length/2);
      const firstLens=rejs.slice(0,half).map(function(r){return r.wickLen;});
      const secondLens=rejs.slice(-half).map(function(r){return r.wickLen;});
      const avgFirst=firstLens.reduce(function(s,v){return s+v;},0)/firstLens.length;
      const avgSecond=secondLens.reduce(function(s,v){return s+v;},0)/secondLens.length;
      S.wxCompression=avgSecond<avgFirst*0.80;
    }
    const comprBonus=S.wxCompression?1.25:1.0;
    S.wxScore=+(countScore*precFactor*worstPenalty*comprBonus).toFixed(1);
    S.wxPrevState=S.wxState;
    let candidate;
    if(S.wxScore<=0.5||S.wxRejectCount<2)  candidate=S.wxScore>0&&S.wxRejectCount>=2?'WATCH':'—';
    else if(S.wxScore<3)  candidate='WATCH';
    else if(S.wxScore<8)  candidate=S.wxDir<0?'PUT SETUP':'CALL SETUP';
    else if(S.wxScore<14) candidate=S.wxDir<0?'STRONG PUT':'STRONG CALL';
    else                  candidate=S.wxDir<0?'GO! PUT':'GO! CALL';
    if((S.wxPrevState==='PUT SETUP'||S.wxPrevState==='CALL SETUP'||
        S.wxPrevState==='STRONG PUT'||S.wxPrevState==='STRONG CALL'||
        S.wxPrevState==='GO! PUT'||S.wxPrevState==='GO! CALL')&&S.wxRejectCount<2){
      candidate='EXTENDED';
    }
    S.wxState=candidate;
  } catch(e){ S.wxState='—'; S.wxDir=0; S.wxScore=0; }
}

// Map wxState → wxCompScore — called from updateUI before computeSignal
export function mapWxCompScore() {
  switch(S.wxState){
    case 'GO! CALL':    S.wxCompScore= 1.00; break;
    case 'STRONG CALL': S.wxCompScore= 0.75; break;
    case 'CALL SETUP':  S.wxCompScore= 0.50; break;
    case 'GO! PUT':     S.wxCompScore=-1.00; break;
    case 'STRONG PUT':  S.wxCompScore=-0.75; break;
    case 'PUT SETUP':   S.wxCompScore=-0.50; break;
    case 'EXTENDED':
      if(S.wxPrevState.includes('PUT'))       S.wxCompScore=-0.25;
      else if(S.wxPrevState.includes('CALL')) S.wxCompScore= 0.25;
      else                                    S.wxCompScore= 0.00;
      break;
    case 'WATCH': S.wxCompScore=0.00; break;
    default:      S.wxCompScore=0.00;
  }
}
