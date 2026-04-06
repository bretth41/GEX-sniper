// ── signals/micro.js ─────────────────────────────────────────────
import * as S from '../core/state.js';

export function computeMicro() {
  try {
    const nowMs=Date.now();
    const WIN5=300000, WIN2=120000;
    const rows5=S.f1FlowRows.filter(r=>(nowMs-new Date(r.created_at||0).getTime())<=WIN5);
    if(rows5.length<3){ S.microState='—'; S.microArrow=''; return; }
    let cA5=0,pA5=0;
    rows5.forEach(r=>{
      const type=String(r.type||'').toLowerCase();
      const ask=Math.max(0,parseFloat(r.total_ask_side_prem)||0);
      if(type==='call') cA5+=ask; else if(type==='put') pA5+=ask;
    });
    const total5=cA5+pA5;
    if(total5<500){ S.microState='—'; S.microArrow=''; return; }
    const imbal5=(cA5-pA5)/total5;
    const rows2=rows5.filter(r=>(nowMs-new Date(r.created_at||0).getTime())<=WIN2);
    const rowsP=rows5.filter(r=>{ const age=nowMs-new Date(r.created_at||0).getTime(); return age>WIN2&&age<=WIN5*0.6; });
    let cA2=0,pA2=0,cAP=0,pAP=0;
    rows2.forEach(r=>{ const type=String(r.type||'').toLowerCase(); const ask=Math.max(0,parseFloat(r.total_ask_side_prem)||0); if(type==='call') cA2+=ask; else if(type==='put') pA2+=ask; });
    rowsP.forEach(r=>{ const type=String(r.type||'').toLowerCase(); const ask=Math.max(0,parseFloat(r.total_ask_side_prem)||0); if(type==='call') cAP+=ask; else if(type==='put') pAP+=ask; });
    const net2=cA2-pA2, netP=cAP-pAP;
    const accel=rowsP.length>0?net2-netP:0;
    const accelSig=Math.abs(accel)>Math.abs(net2)*0.3;
    S.microRunHist=[...S.microRunHist,imbal5].slice(-8);
    const recent=S.microRunHist.slice(-4);
    const sustained=recent.reduce((s,v)=>s+v,0)/recent.length;
    const mhRoc=S.microRunHist.length>=4?S.microRunHist[S.microRunHist.length-1]-S.microRunHist[0]:0;
    const THRESH=0.25;
    let candidate;
    if(Math.abs(sustained)<THRESH)  candidate='BALANCED';
    else if(sustained>0)            candidate=mhRoc<-0.1?'FADING':'CALL FLOW';
    else                            candidate=mhRoc>0.1?'FADING':'PUT FLOW';
    if(accelSig&&candidate==='CALL FLOW') S.microArrow=accel>0?'↑':'↓';
    else if(accelSig&&candidate==='PUT FLOW') S.microArrow=accel<0?'↑':'↓';
    else S.microArrow='';
    const reqDwell=candidate!=='BALANCED'?3:1;
    if(candidate===S.microCandidate){ S.microDwellCount++; }
    else{ S.microCandidate=candidate; S.microDwellCount=1; }
    if(S.microDwellCount>=reqDwell) S.microState=S.microCandidate;
  } catch(e){ S.microState='—'; S.microArrow=''; }
}
