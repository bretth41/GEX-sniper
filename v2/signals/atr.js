// ── signals/atr.js ───────────────────────────────────────────────
import * as S from '../core/state.js';

export function computeATR() {
  const src=S.todayBars.length>=5?S.todayBars:S.raw1m;
  if(src.length<2) return;
  const bs=src.slice(-15); let tr=0;
  for(let i=1;i<bs.length;i++)
    tr+=Math.max(bs[i].h-bs[i].l,Math.abs(bs[i].h-bs[i-1].c),Math.abs(bs[i].l-bs[i-1].c));
  S.atrVal=tr/Math.max(bs.length-1,1);
  S.atrHistory=[...S.atrHistory,S.atrVal].slice(-10);
}
