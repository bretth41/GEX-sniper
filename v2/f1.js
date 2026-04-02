// ── signals/f1.js ────────────────────────────────────────────────
import * as S from '../core/state.js';
import { clamp, etDateStr } from '../core/utils.js';

export function computeF1() {
  const today=etDateStr();
  if(S.f1SessionDate && S.f1SessionDate!==today){
    if(S.f1SweepAccum.count>0)
      S.f1PriorSession={dir:S.f1SweepAccum.dir,score:S.f1SweepAccum.score,
                       count:S.f1SweepAccum.count,date:S.f1SessionDate};
    S.f1SweepAccum={dir:0,score:0,count:0,sweeps:[]};
    S.f1FlowRows=[];
  }
  S.f1SessionDate=today;
  const swDir=S.f1SweepAccum.dir||0;
  const swSc=S.f1SweepAccum.score||0;
  const nowMs=Date.now();
  const premThresh=S.atrVal&&S.spyPrice?Math.max(10000,S.atrVal*S.spyPrice*0.5):50000;
  let cA=0,pA=0,cB=0,pB=0;
  S.f1FlowRows.forEach(row=>{
    const t=new Date(row.created_at||0).getTime();
    if(nowMs-t>900000) return;
    const type=String(row.type||'').toLowerCase();
    const ask=Math.max(0,parseFloat(row.total_ask_side_prem)||0);
    const bid=Math.max(0,parseFloat(row.total_bid_side_prem)||0);
    if(type==='call'){cA+=ask;cB+=bid;}
    else if(type==='put'){pA+=ask;pB+=bid;}
  });
  const callNet=cA-cB, putNet=pA-pB;
  const totalPrem=Math.abs(callNet)+Math.abs(putNet);
  const premSc=totalPrem>premThresh?clamp((callNet-Math.abs(putNet))/(totalPrem+1),-1,1):0;
  let rawScore=0, dir=0;
  if(swSc>0.25){
    rawScore=swSc; dir=swDir;
    if(premSc!==0&&Math.sign(premSc)===swDir)
      rawScore=Math.min(2,rawScore+Math.abs(premSc)*0.3);
    else if(Math.sign(premSc)===-swDir)
      rawScore=Math.max(0,rawScore-Math.abs(premSc)*0.2);
  } else if(Math.abs(premSc)>0.3&&totalPrem>premThresh){
    rawScore=Math.abs(premSc); dir=Math.sign(premSc);
  }
  S.f1Score=clamp(rawScore*dir,-2,2);
  S.f1Dir=dir;
  const abs=Math.abs(S.f1Score);
  S.f1Strength=abs<=0.25?0:abs<=0.50?0.5:abs<=1.0?1:2;
  const dl=dir>0?'CALL':'PUT';
  const f=S.f1PriorSession;
  if(S.f1Strength===0){
    S.f1Status=f&&f.count>0
      ?`WATCHING · PRIOR ${f.dir>0?'CALL':'PUT'} ×${f.count} (${f.date})`
      :'WATCHING';
  } else if(swSc>0.25){
    const cnt=S.f1SweepAccum.count;
    const topP=S.f1SweepAccum.sweeps.length
      ?Math.round(Math.max(...S.f1SweepAccum.sweeps.map(s=>s.prem))/1000):0;
    const minD=S.f1SweepAccum.sweeps.length
      ?Math.min(...S.f1SweepAccum.sweeps.map(s=>s.dte)):0;
    const exCount=new Set(S.f1SweepAccum.sweeps.map(s=>s.expiry)).size;
    const clTag=exCount<cnt&&cnt>=2?' CLUSTERED':'';
    S.f1Status=`${dl} ×${cnt} SWEEP · $${topP}K · ${minD}DTE${clTag}`;
  } else {
    S.f1Status=`${dl} PREM +${Math.round(Math.abs(callNet-putNet)/1000)}K 15M`;
  }
}
