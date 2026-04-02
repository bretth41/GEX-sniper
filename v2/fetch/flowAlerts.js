// ── fetch/flowAlerts.js ──────────────────────────────────────────
import { state as S } from '../core/state.js';
import { cfg } from '../core/config.js';
import { etDateStr, setDot } from '../core/utils.js';

export async function fetchFlowAlerts() {
  if(!cfg.proxyUrl) return;
  const nowMs=Date.now();
  const WINDOW=3600000; // 60-min lookback
  try {
    const r=await fetch(cfg.proxyUrl+'/uw/api/option-trades/flow-alerts?ticker_symbol=SPY&limit=50');
    if(r.ok){
      const d=await r.json();
      const rows=Array.isArray(d.data)?d.data:[];
      const todayStr=etDateStr();
      // 0DTE rows for G1 volume layer and ABSORP
      S.f1FlowRows=rows.filter(row=>{
        if(!row.expiry) return false;
        return row.expiry.substring(0,10)===todayStr;
      });
      // 1-2DTE rows for HEC adaptive VOI expansion
      window._hecAll1DTE=rows.filter(row=>{
        if(!row.expiry) return false;
        const dte=Math.max(0,Math.round((new Date(row.expiry)-new Date(todayStr))/86400000));
        return dte>=1&&dte<=2;
      });

      // ── Adaptive DTE sweep accumulation ──────────────────────────────
      function scoreSweeps(sweepRows, dteWeight, voiOpen, voiMixed) {
        return sweepRows
          .filter(row=>row.has_sweep&&(nowMs-new Date(row.created_at||0).getTime())<=WINDOW)
          .map(row=>{
            const type=String(row.type||'').toLowerCase();
            const dir=type==='call'?1:type==='put'?-1:0;
            if(dir===0) return null;
            const t=new Date(row.created_at||0).getTime();
            const ageMin=(nowMs-t)/60000;
            const recency=Math.max(0,1-ageMin/60);
            const prem=Math.max(0,parseFloat(row.total_premium)||0);
            const sw=prem<50000?0.25:prem<200000?0.50:prem<750000?0.75:prem<2000000?0.90:1.00;
            const voiVal=parseFloat(row.volume_oi_ratio)||0;
            const voiFactor=voiVal<voiOpen?1.0:voiVal<voiMixed?0.5:0.1;
            const strike=parseFloat(row.strike)||0;
            return{dir,score:sw*recency*voiFactor*dteWeight,strike,prem,ts:t,voi:voiVal,voiFactor};
          })
          .filter(s=>s&&s.score>0&&s.dir!==0);
      }

      const rows0=[],rows1=[],rows2=[];
      rows.forEach(row=>{
        if(!row.expiry||!row.has_sweep) return;
        const dte=Math.max(0,Math.round((new Date(row.expiry)-new Date(todayStr))/86400000));
        if(dte===0) rows0.push(row);
        else if(dte===1) rows1.push(row);
        else if(dte===2) rows2.push(row);
      });

      let allSweeps=scoreSweeps(rows0,1.00,3,8);
      let score0=allSweeps.reduce((a,s)=>a+s.score,0);
      S.f1DteTier=0;

      if(score0<0.30){
        const sw1=scoreSweeps(rows1,0.70,5,12);
        if(sw1.length>0){ allSweeps=[...allSweeps,...sw1]; S.f1DteTier=1; }
        const combined=allSweeps.reduce((a,s)=>a+s.score,0);
        if(combined<0.40){
          const sw2=scoreSweeps(rows2,0.45,8,15);
          if(sw2.length>0){ allSweeps=[...allSweeps,...sw2]; S.f1DteTier=Math.max(S.f1DteTier,2); }
        }
      }

      if(allSweeps.length>0){
        const callSc=allSweeps.filter(s=>s.dir>0).reduce((a,s)=>a+s.score,0);
        const putSc =allSweeps.filter(s=>s.dir<0).reduce((a,s)=>a+s.score,0);
        const domDir=callSc>=putSc?1:-1;
        const domSc=Math.max(callSc,putSc);
        if(S.f1SweepAccum.dir!==0&&S.f1SweepAccum.dir!==domDir&&domSc>S.f1SweepAccum.score*0.6)
          S.f1SweepAccum={dir:0,score:0,count:0,sweeps:[]};
        const aligned=allSweeps.filter(s=>s.dir===domDir);
        if(aligned.length>0){
          const strikeBuckets={};
          aligned.forEach(s=>{
            const bucket=Math.round(s.strike*2)/2;
            strikeBuckets[bucket]=(strikeBuckets[bucket]||0)+1;
          });
          const maxCluster=Math.max(...Object.values(strikeBuckets));
          const strikeBonus=maxCluster>=3?1.40:maxCluster>=2?1.25:1.00;
          S.f1SweepAccum={dir:domDir,sweeps:aligned,count:aligned.length,
            score:Math.min(2.0,aligned.reduce((a,s)=>a+s.score,0)*strikeBonus)};
        }
      } else {
        S.f1DteTier=0;
        S.f1SweepAccum.score=Math.max(0,S.f1SweepAccum.score*0.98);
        if(S.f1SweepAccum.score<0.05) S.f1SweepAccum={dir:0,score:0,count:0,sweeps:[]};
      }
      setDot('ds-uw',true);
    }
  } catch(e){ /* network fail — accum state unchanged */ }
}
