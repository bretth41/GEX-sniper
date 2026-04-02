// ── fetch/bars.js ────────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { cfg } from '../core/config.js';
import { aggBars, calcEMA, calcVWAP, etDateStr, setDot, setStale } from '../core/utils.js';

export async function fetchBars() {
  if(!cfg.proxyUrl) return;
  try {
    const r=await fetch(cfg.proxyUrl+'/uw/api/stock/SPY/ohlc/1m');
    if(!r.ok){setDot('ds-bars',false);return;}
    const d=await r.json();
    const rows=Array.isArray(d.data)?d.data:[];
    if(!rows.length){setDot('ds-bars',false);return;}
    S.raw1m=rows.map(b=>({
      t:Math.floor(new Date(b.start_time).getTime()/1000),
      o:parseFloat(b.open),h:parseFloat(b.high),
      l:parseFloat(b.low),c:parseFloat(b.close),v:parseInt(b.volume)||0
    })).filter(b=>!isNaN(b.o)).sort((a,b2)=>a.t-b2.t);
    S.bars=aggBars(S.raw1m,S.tf);
    if(S.raw1m.length){
      const todayEt=etDateStr();
      function barEtDate(ts){
        const d=new Date(ts*1000);
        const jan=new Date(d.getFullYear(),0,1).getTimezoneOffset();
        const jul=new Date(d.getFullYear(),6,1).getTimezoneOffset();
        const off=Math.min(jan,jul)!==jan?-4:-5;
        const et=new Date(d.getTime()+off*3600000+d.getTimezoneOffset()*60000);
        const p=x=>String(x).padStart(2,'0');
        return et.getFullYear()+'-'+p(et.getMonth()+1)+'-'+p(et.getDate());
      }
      S.todayBars=S.raw1m.filter(b=>barEtDate(b.t)===todayEt);
      const priorBars=S.raw1m.filter(b=>barEtDate(b.t)!==todayEt);
      if(S.todayBars.length){
        if(!S.sessionOpenPrice||S.lastBarDate!==todayEt) S.sessionOpenPrice=S.todayBars[0].o;
        S.lastBarDate=todayEt;
      }
      if(priorBars.length) S.prevClose=priorBars[priorBars.length-1].c;
    }
    if(S.raw1m.length&&!S.spyPrice) S.spyPrice=S.raw1m[S.raw1m.length-1].c;
    S.lastUpdate=Date.now(); setStale(false);
    setDot('ds-bars',true);
  } catch(e){setDot('ds-bars',false);}
}
