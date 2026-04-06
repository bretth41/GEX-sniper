// ── signals/dsc.js ───────────────────────────────────────────────
import * as S from '../core/state.js';
import { etDateStr } from '../core/utils.js';

export function computeDSC() {
  try {
    const today=etDateStr();
    if(S.dscSessionDate!==today){
      S.dscSessionDate=today;
      S.dscScore=0; S.dscScorePrev=0; S.dscVelocity=0;
      S.dscPhase='—'; S.dscDir=0;
      S.dscExpansionArmed=false; S.dscScoreHist=[];
    }
    const driftNorm=Math.min(Math.abs(S.driftDelta)/1.0, 1.0);
    const f1Norm   =Math.min(Math.abs(S.f1Score)/2.0,    1.0);
    const hecNorm  =Math.min(Math.abs(S.hecSlope)/0.25,  1.0);
    const rawScore=0.40*driftNorm + 0.35*f1Norm + 0.25*hecNorm;
    S.dscScorePrev=S.dscScore;
    S.dscScore=Math.max(0,Math.min(1,rawScore));
    S.dscScoreHist=[...S.dscScoreHist,S.dscScore].slice(-5);
    if(S.dscScoreHist.length>=2){
      const oldest=S.dscScoreHist[0];
      const newest=S.dscScoreHist[S.dscScoreHist.length-1];
      S.dscVelocity=newest-oldest;
    }
    if(S.liveComp>0.10)       S.dscDir=1;
    else if(S.liveComp<-0.10) S.dscDir=-1;
    else                      S.dscDir=0;
    if(S.dscScore>=0.70) S.dscExpansionArmed=true;
    const priceMovedEnough=S.atrVal&&Math.abs(S.driftPriceSlope)>=0.25;
    const stressDropped=S.dscExpansionArmed&&S.dscScore<(0.70-0.20);
    if(stressDropped&&priceMovedEnough){
      S.dscPhase='EXPANSION';
      if(S.dscScore<0.40) S.dscExpansionArmed=false;
      return;
    }
    if(S.dscScore>=0.70)      S.dscPhase='FAILURE';
    else if(S.dscScore>=0.40) S.dscPhase='STRAIN';
    else if(S.dscScore>0.05)  S.dscPhase='BUILD';
    else                      S.dscPhase='—';
  } catch(e){ S.dscScore=0; S.dscPhase='—'; S.dscDir=0; S.dscVelocity=0; }
}
