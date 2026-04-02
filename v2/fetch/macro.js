// ── fetch/macro.js ───────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { cfg } from '../core/config.js';
import { setDot } from '../core/utils.js';

export async function fetchMacro() {
  if(!cfg.proxyUrl) return;
  try {
    const r=await fetch(cfg.proxyUrl+'/tradier/v1/markets/quotes?symbols=VIX&greeks=false');
    if(r.ok){
      const d=await r.json();
      const q=d?.quotes?.quote;
      if(q){
        const v=parseFloat(q.last??q.bid??q.ask??NaN);
        if(!isNaN(v)){ S.prevVixPrice=S.vixPrice; S.vixPrice=v; S.vixHistory=[...S.vixHistory,v].slice(-20); }
      }
      setDot('ds-tr',true);
    } else { setDot('ds-tr',false); }
  } catch(e){ setDot('ds-tr',false); }
}
