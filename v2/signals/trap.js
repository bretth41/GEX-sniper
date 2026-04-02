// ── signals/trap.js ──────────────────────────────────────────────
import { state as S } from '../core/state.js';

export function computeTrap() {
  try {
    const isStrong=S.sigState==='STRONG_CALL'||S.sigState==='STRONG_PUT';
    if(!isStrong||!S.spyPrice){
      S.trapState='NEUTRAL'; S.trapDetail=''; S.trapArrow='';
      S.trapDwellCount=0; S.trapCandidate='NEUTRAL'; return;
    }
    const sd=S.absorpSigDir;
    let voiTrap=false, avgVoi=0;
    if(S.f1SweepAccum.sweeps&&S.f1SweepAccum.sweeps.length>0){
      avgVoi=S.f1SweepAccum.sweeps.reduce((s,sw)=>s+(sw.voi||0),0)/S.f1SweepAccum.sweeps.length;
      voiTrap=avgVoi>8;
    }
    let wallTrap=false, wallDist=null;
    if(sd>0&&S.gexLevels.cwall!=null){
      wallDist=S.gexLevels.cwall-S.spyPrice;
      wallTrap=wallDist>=0&&wallDist<=0.75;
    } else if(sd<0&&S.gexLevels.pwall!=null){
      wallDist=S.spyPrice-S.gexLevels.pwall;
      wallTrap=wallDist>=0&&wallDist<=0.75;
    }
    const rawScore=(voiTrap?1:0)+(wallTrap?1:0);
    S.trapRawHist=[...S.trapRawHist,rawScore].slice(-6);
    S.trapRawScore=rawScore;
    const rh=S.trapRawHist;
    const roc=rh.length>=3?rh[rh.length-1]-rh[0]:0;
    S.trapArrow=roc>0?'↑':roc<0?'↓':'';
    let candidate;
    if(rawScore>=2)      candidate='TRAP';
    else if(rawScore>=1) candidate='TRAP RISK';
    else                 candidate='NEUTRAL';
    const parts=[];
    if(voiTrap)  parts.push('VOI HIGH '+(avgVoi>0?avgVoi.toFixed(0)+'x':''));
    if(wallTrap) parts.push(wallDist!=null?'WALL $'+wallDist.toFixed(2):'WALL CLOSE');
    const detail=parts.join(' + ');
    const requiredDwell=candidate!=='NEUTRAL'?2:1;
    if(candidate===S.trapCandidate){ S.trapDwellCount++; }
    else { S.trapCandidate=candidate; S.trapDwellCount=1; }
    if(S.trapDwellCount>=requiredDwell){ S.trapState=S.trapCandidate; S.trapDetail=detail; }
  } catch(e){ S.trapState='NEUTRAL'; S.trapDetail=''; S.trapArrow=''; }
}

export function computeTrapMicro() {
  try {
    const isStrong=S.sigState==='STRONG_CALL'||S.sigState==='STRONG_PUT';
    if(!isStrong){ S.trapMicroState='NEUTRAL'; return; }
    const sd=S.absorpSigDir;
    const trapActive=S.trapState==='TRAP'||S.trapState==='TRAP RISK';
    const microOpposes=(sd>0&&S.microState==='PUT FLOW')||(sd<0&&S.microState==='CALL FLOW');
    const microConfirms=(sd>0&&S.microState==='CALL FLOW')||(sd<0&&S.microState==='PUT FLOW');
    if(trapActive&&microOpposes)      S.trapMicroState='DANGER';
    else if(trapActive)               S.trapMicroState='WARNING';
    else if(!trapActive&&microConfirms) S.trapMicroState='CLEAR';
    else                              S.trapMicroState='NEUTRAL';
  } catch(e){ S.trapMicroState='NEUTRAL'; }
}
