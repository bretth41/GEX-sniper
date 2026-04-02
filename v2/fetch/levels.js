// ── fetch/levels.js ──────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { cfg } from '../core/config.js';
import { clamp, etDateStr, setDot } from '../core/utils.js';
import { updateGxHistory } from '../signals/gx.js';

export async function fetchUWLevels() {
  if(!cfg.proxyUrl) return;
  const price=S.spyPrice||0;
  let ok=false;
  const todayStr=etDateStr();

  // ── spot-exposures/strike → GEX levels, GPD, gexProfile ─────────
  try {
    const r=await fetch(cfg.proxyUrl+'/uw/api/stock/SPY/spot-exposures/strike');
    if(r.ok){
      const d=await r.json();
      const allRows=(Array.isArray(d.data)?d.data:[])
        .map(row=>({
          strike:parseFloat(row.strike),
          callGex:parseFloat(row.call_gamma_oi)||0,
          putGex:Math.abs(parseFloat(row.put_gamma_oi)||0),
        }))
        .filter(r=>!isNaN(r.strike))
        .sort((a,b)=>a.strike-b.strike);
      const rows=allRows.filter(r=>Math.abs(r.strike-price)<=50);
      updateGxHistory(allRows, price);
      if(rows.length){
        const above=rows.filter(r=>r.strike>=price);
        const below=rows.filter(r=>r.strike<=price);
        const cwall=above.length?above.reduce((b,r)=>r.callGex>b.callGex?r:b,above[0]).strike:null;
        const pwall=below.length?below.reduce((b,r)=>r.putGex>b.putGex?r:b,below[0]).strike:null;
        S.gexLevels={cwall,pwall};
        let tC=0,tP=0;
        rows.forEach(r=>{if(Math.abs(r.strike-price)<=15){tC+=r.callGex;tP+=r.putGex;}});
        S.gpdImbalance=(tC+tP)>0?(tC-tP)/(tC+tP):0;
        S.gammaRegime=clamp(S.gpdImbalance,-1,1);
        S.gexProfile=rows.filter(r=>Math.abs(r.strike-price)<=12)
          .map(r=>({strike:r.strike,netGex:r.callGex-r.putGex}));
        S.totalNetGex=rows.filter(r=>Math.abs(r.strike-price)<=20)
          .reduce((s,r)=>s+(r.callGex-r.putGex),0);
        ok=true;
      }
    }
  } catch(e){}

  // ── greek-exposure/strike → deltaAtRisk ──────────────────────────
  try {
    const r=await fetch(cfg.proxyUrl+'/uw/api/stock/SPY/greek-exposure/strike');
    if(r.ok){
      const d=await r.json();
      const rows=Array.isArray(d.data)?d.data:[];
      if(rows.length){
        let dar=0;
        rows.forEach(row=>{
          const s=parseFloat(row.strike); if(isNaN(s)) return;
          const cg=Math.abs(parseFloat(row.call_gex)||0);
          const pg=Math.abs(parseFloat(row.put_gex)||0);
          if(Math.abs(s-price)<=8) dar+=(cg+pg);
        });
        S.deltaAtRisk=dar; ok=true;
      }
    }
  } catch(e){}

  // ── greek-exposure/expiry → 0DTE netDealerDelta + g1IntradayDelta ─
  try {
    const r=await fetch(cfg.proxyUrl+'/uw/api/stock/SPY/greek-exposure/expiry');
    if(r.ok){
      const d=await r.json();
      const rows=Array.isArray(d.data)?d.data:[];
      if(rows.length){
        let callDelta0=0,putDelta0=0,callDelta1=0,putDelta1=0;
        rows.forEach(row=>{
          if(!row.expiry) return;
          const dte=Math.max(0,Math.round((new Date(row.expiry)-new Date(todayStr))/86400000));
          const cd=Math.abs(parseFloat(row.call_delta)||0);
          const pd=Math.abs(parseFloat(row.put_delta)||0);
          if(dte===0){ callDelta0+=cd; putDelta0+=pd; }
          if(dte<=1) { callDelta1+=cd; putDelta1+=pd; }
        });
        const nd0=callDelta0-putDelta0;
        const id=callDelta1-putDelta1;
        S.netDealerDelta=nd0;
        if(!S.g1StructuralMax) S.g1StructuralMax=Math.max(Math.abs(nd0),1);
        S.g1StructuralMax=Math.max(S.g1StructuralMax*0.998,Math.abs(nd0),1);
        S.g1IntradayDelta=id;
        if(!S.g1IntradayMax) S.g1IntradayMax=Math.max(Math.abs(id),1);
        S.g1IntradayMax=Math.max(S.g1IntradayMax*0.998,Math.abs(id),1);
        ok=true;
      }
    }
  } catch(e){}

  // ── net-prem-ticks → netPrem ─────────────────────────────────────
  try {
    const r=await fetch(cfg.proxyUrl+'/uw/api/stock/SPY/net-prem-ticks');
    if(r.ok){
      const d=await r.json();
      const rows=Array.isArray(d.data)?d.data:[];
      if(rows.length){
        const latest=rows[rows.length-1];
        const np=parseFloat(latest.net_call_premium)||0;
        S.netPremHist=[...S.netPremHist,np].slice(-20);
        const mx=Math.max(0.001,...S.netPremHist.map(Math.abs));
        S.netPrem=clamp(np/mx,-1,1);
        ok=true;
      }
    }
  } catch(e){}

  setDot('ds-uw',ok);
}
