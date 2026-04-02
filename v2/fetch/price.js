// ── fetch/price.js ───────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { cfg } from '../core/config.js';
import { setStale } from '../core/utils.js';

export async function fetchPrice() {
  if(!cfg.proxyUrl) return;
  try {
    const r=await fetch(cfg.proxyUrl+'/uw/api/stock/SPY/stock-state');
    if(!r.ok) return;
    const d=await r.json();
    const state=d.data??d;
    const p=parseFloat(state.close);
    if(!isNaN(p)){ S.prevSpyPrice=S.spyPrice; S.spyPrice=p; S.lastUpdate=Date.now(); setStale(false); }
  } catch(e){}
}
