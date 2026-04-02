// ── signals/cosmic.js ────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { COSMIC_CD } from '../core/config.js';
import { pushCosmicAlert } from '../fetch/alerts.js';
import { logCosmicFire } from '../render/log.js';

export function computeCosmic() {
  try {
    const now=Date.now();
    const votes=[];
    if(Math.abs(S.g1Score)>=0.5)
      votes.push({sig:'G1', dir:S.g1Score>0?1:-1});
    if(S.f1SweepAccum.score>=0.3&&S.f1SweepAccum.dir!==0)
      votes.push({sig:'F1', dir:S.f1SweepAccum.dir});
    if(S.wxCompScore>=0.50)       votes.push({sig:'WX', dir:1});
    else if(S.wxCompScore<=-0.50) votes.push({sig:'WX', dir:-1});
    if(S.driftState.includes('CALL')&&!S.driftState.includes('EXHAUST'))
      votes.push({sig:'DRIFT', dir:1});
    else if(S.driftState.includes('PUT')&&!S.driftState.includes('EXHAUST'))
      votes.push({sig:'DRIFT', dir:-1});
    if(S.hecState.includes('CALL')&&S.hecState!=='STABLE')
      votes.push({sig:'HEC', dir:1});
    else if(S.hecState.includes('PUT')&&S.hecState!=='STABLE')
      votes.push({sig:'HEC', dir:-1});
    if(S.giaDir!==0&&S.giaState!=='BALANCED'&&S.giaState!=='—')
      votes.push({sig:'GIA', dir:S.giaDir});
    if(S.dscDir!==0&&(S.dscPhase==='STRAIN'||S.dscPhase==='FAILURE'))
      votes.push({sig:'DSC', dir:S.dscDir});
    const callVotes=votes.filter(v=>v.dir===1);
    const putVotes =votes.filter(v=>v.dir===-1);
    const totalVotes=votes.length;
    const allCall=callVotes.length===totalVotes&&totalVotes>=4;
    const allPut =putVotes.length ===totalVotes&&totalVotes>=4;
    const allMet=allCall||allPut;
    const cosmicDir=allCall?'CALL':allPut?'PUT':'';
    const cooledDown=(now-S.cosmicLastFireTs)>COSMIC_CD;
    const newState=allMet&&cooledDown?'COSMIC '+cosmicDir:'—';
    if(newState!=='—'&&S.cosmicPrevState==='—'){
      S.cosmicLastFireTs=now;
      S.cosmicTarget=S.gxEmergingStrike;
      const sigList=votes.map(v=>v.sig).join('+');
      const tgt=S.gxEmergingStrike?'→$'+S.gxEmergingStrike:'';
      pushCosmicAlert(cosmicDir,tgt,sigList+' ('+totalVotes+'/7)');
      logCosmicFire(newState);
    }
    S.cosmicState=newState;
    S.cosmicPrevState=newState;
  } catch(e){ S.cosmicState='—'; }
}
