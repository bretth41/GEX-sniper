// ── signals/absorp.js ────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { clamp } from '../core/utils.js';

export function computeAbsorp() {
  try {
    const isDirectional=S.sigState==='STRONG_CALL'||S.sigState==='STRONG_PUT'
                      ||S.sigState==='CALL'||S.sigState==='PUT';
    if(!isDirectional){
      S.absorpState='—'; S.absorpArrow='';
      S.absorpSigDir=0; S.absorpStateEntryTs=0; S.absorpCandidate='';
      return;
    }
    const newAbsorpDir=S.sigState==='STRONG_CALL'||S.sigState==='CALL'?1:-1;
    if(S.absorpSigDir!==0&&S.absorpSigDir!==newAbsorpDir){
      S.absorpRawHist=[]; S.absorpPriceHist=[]; S.absorpFastPrem=[];
      S.absorpStateEntryTs=0; S.absorpCandidate='';
    }
    S.absorpSigDir=newAbsorpDir;
    const sd=S.absorpSigDir;
    if(S.absorpPriceHist.length<4||S.absorpFastPrem.length<4){
      S.absorpState='READING'; S.absorpArrow=''; return;
    }
    const fp=S.absorpFastPrem.slice(-6);
    const pp=S.absorpPriceHist.slice(-6);
    const premSlope=(fp[fp.length-1]-fp[0])*sd;
    const priceSlope=(pp[pp.length-1]-pp[0])*sd;
    let convScore=0;
    if(priceSlope<-0.03&&premSlope>0.05)       convScore=1;
    else if(priceSlope>0.03&&premSlope>0.05)   convScore=2;
    else if(priceSlope<-0.03&&premSlope<=-0.05) convScore=-1;
    let barScore=0;
    if(S.raw1m.length>=3&&S.atrVal){
      const last3=S.raw1m.slice(-3);
      const avgRng=last3.reduce((s,b)=>s+(b.h-b.l),0)/3;
      const lb=last3[last3.length-1];
      if(avgRng<S.atrVal*0.5) barScore=-1;
      else if(lb.h-lb.l>S.atrVal*0.8&&(lb.c>lb.o?1:-1)===sd) barScore=1;
    }
    const rawScore=clamp(premSlope*2+convScore*2+barScore,-4,4);
    S.absorpRawHist=[...S.absorpRawHist,rawScore].slice(-6);
    S.absorpRawScore=rawScore;
    const rh=S.absorpRawHist;
    const roc=rh.length>=3?rh[rh.length-1]-rh[0]:0;
    S.absorpArrow=roc>0.3?'↑':roc<-0.3?'↓':'';
    let candidate;
    if(rawScore>=2)      candidate='CONFIRMING';
    else if(rawScore>=0) candidate='CONVERGING';
    else                 candidate='ABSORBING';
    const nowMs=Date.now();
    const absRoc=Math.abs(roc);
    if(S.absorpState==='CONFIRMING'&&candidate==='ABSORBING'&&rawScore>-1.5) candidate='CONVERGING';
    let requiredMs;
    if(candidate===S.absorpState){ requiredMs=0; }
    else {
      const stateRank={'ABSORBING':0,'CONVERGING':1,'CONFIRMING':2};
      const curRank=stateRank[S.absorpState]??1;
      const newRank=stateRank[candidate]??1;
      const goingDown=newRank<curRank;
      const fromConfirming=S.absorpState==='CONFIRMING';
      if(goingDown&&fromConfirming)    requiredMs=absRoc>0.8?30000:45000;
      else if(goingDown)               requiredMs=absRoc>0.5?20000:30000;
      else if(candidate==='CONFIRMING')requiredMs=absRoc>0.5?15000:20000;
      else                             requiredMs=absRoc>0.5?15000:absRoc>0.2?20000:25000;
    }
    if(candidate!==S.absorpCandidate){ S.absorpCandidate=candidate; S.absorpStateEntryTs=nowMs; }
    if(nowMs-S.absorpStateEntryTs>=requiredMs) S.absorpState=S.absorpCandidate;
  } catch(e){ S.absorpState='—'; S.absorpArrow=''; }
}
