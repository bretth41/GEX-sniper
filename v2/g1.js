// ── signals/g1.js ────────────────────────────────────────────────
import * as S from '../core/state.js';
import { clamp, etDateStr, etHour } from '../core/utils.js';
import { WIN_CONTEXT_MS } from '../core/config.js';

export let g1Thresh = 0.25; // exported so computeSignal can read it

export function computeG1() {
  if(!S.g1CoilMax) S.g1CoilMax=Math.max(S.deltaAtRisk,1);
  S.g1CoilMax=Math.max(S.g1CoilMax*0.995,S.deltaAtRisk);
  S.g1Coil=S.g1CoilMax>0?Math.min(S.deltaAtRisk/S.g1CoilMax,1):0;
  const shortG=S.gammaRegime<-0.2, longG=S.gammaRegime>0.2;
  g1Thresh=0.25*(shortG?0.75:longG?1.35:1.0);

  const sessionOpen=9.5;
  const sessionPct=Math.min(1,Math.max(0,(etHour()-sessionOpen)/6.5));
  S.g1TideFactor   =0.90-sessionPct*0.60;
  S.g1CurrentFactor=1.10+sessionPct*0.60;

  const structNorm=clamp(S.netDealerDelta/Math.max(S.g1StructuralMax,1),-1,1);
  const intradayNorm=S.g1IntradayMax>0?clamp(S.g1IntradayDelta/S.g1IntradayMax,-1,1):0;

  const today=etDateStr();
  if(S.g1VolSessionDate && S.g1VolSessionDate!==today){ S.g1VolStore={}; S.g1VolMax=1; }
  S.g1VolSessionDate=today;
  S.f1FlowRows.forEach(row=>{
    const key=row.created_at||''; if(!key||S.g1VolStore[key]) return;
    if(!row.expiry) return;
    const dte=Math.max(0,Math.round((new Date(row.expiry)-new Date(today))/86400000));
    if(dte>1) return;
    const type=String(row.type||'').toLowerCase();
    const prem=Math.max(0,parseFloat(row.total_premium)||parseFloat(row.total_ask_side_prem)||0);
    if(prem<=0) return;
    S.g1VolStore[key]={call:type==='call'?prem:0,put:type==='put'?prem:0};
  });
  let volCall=0,volPut=0;
  Object.values(S.g1VolStore).forEach(v=>{volCall+=v.call;volPut+=v.put;});
  const volDeltaRaw=volCall-volPut;
  S.g1VolMax=Math.max(S.g1VolMax*0.999,Math.abs(volDeltaRaw),1);
  const volNorm=clamp(volDeltaRaw/S.g1VolMax,-1,1);

  const g1NowMs=Date.now();
  const recentFlowCount=S.f1FlowRows.filter(row=>{
    const t=new Date(row.created_at||0).getTime();
    if(g1NowMs-t>WIN_CONTEXT_MS) return false;
    if(!row.expiry) return false;
    const dte=Math.max(0,Math.round((new Date(row.expiry)-new Date(etDateStr()))/86400000));
    return dte<=1;
  }).length;
  const baseTimeW=Math.max(0,Math.min(1,1-(recentFlowCount/20)));
  const gapPct=S.prevClose&&S.sessionOpenPrice?Math.abs(S.sessionOpenPrice-S.prevClose)/S.prevClose:0;
  const dispPct=S.sessionOpenPrice&&S.spyPrice?Math.abs(S.spyPrice-S.sessionOpenPrice)/S.sessionOpenPrice:0;
  function gapToVolFloor(pct){
    if(pct<0.005) return 0; if(pct>=0.0075) return 1.0;
    return 0.75+(pct-0.005)/(0.0075-0.005)*0.25;
  }
  const volFloor=Math.max(gapToVolFloor(gapPct),gapToVolFloor(dispPct));
  const volW=Math.max(1-baseTimeW,volFloor);
  const oiW=1-volW;
  const currentBlend=intradayNorm*oiW+volNorm*volW;
  const tideContrib  =structNorm  *S.g1TideFactor;
  const currentContrib=currentBlend*S.g1CurrentFactor;
  const blended=clamp((tideContrib+currentContrib)/2,-1,1);

  let emaScore=0;
  if(S.ema8Val&&S.ema21Val&&S.spyPrice){
    const emaAlign=S.ema8Val<S.ema21Val?-1:S.ema8Val>S.ema21Val?1:0;
    const aboveBoth=S.spyPrice>Math.max(S.ema8Val,S.ema21Val)?1:0;
    const belowBoth=S.spyPrice<Math.min(S.ema8Val,S.ema21Val)?-1:0;
    const pricePos=aboveBoth||belowBoth;
    const emaSlope=S.ema8PrevVal?S.ema8Val-S.ema8PrevVal:0;
    const slopeDir=emaSlope<-0.01?-1:emaSlope>0.01?1:0;
    emaScore=clamp(emaAlign*0.35+pricePos*0.40+slopeDir*0.25,-1,1);
  }
  S.g1Score=clamp((blended*0.90+emaScore*0.10)*2,-2,2);
  const currentDir=currentBlend>0.1?1:currentBlend<-0.1?-1:0;
  const structDir=structNorm>0.1?1:structNorm<-0.1?-1:0;
  S.g1Dir=currentDir!==0?currentDir:structDir;
  if(S.g1Dir===0) S.g1Dir=S.gpdImbalance>0.1?1:S.gpdImbalance<-0.1?-1:0;
  const cl=S.g1Coil>0.7?'HIGH':S.g1Coil>0.3?'MED':'LOW';
  const nk=Math.round(S.netDealerDelta/1000);
  const tPct=Math.round(S.g1TideFactor*100);
  const cPct=Math.round(S.g1CurrentFactor*100);
  const modeTag=volW>0.5?'VOL':'OI';
  const volPct=Math.round(Math.abs(volNorm)*100);
  const alignTag=emaScore>0.2?' EMA↑':emaScore<-0.2?' EMA↓':'';
  const regTag=shortG?' SHORTγ⚡':longG?' LONGγ↓':'';
  const divTag=Math.sign(currentBlend)!==Math.sign(structNorm)&&currentBlend!==0?' STRUCT-DIV':'';
  const tideTag=' T'+tPct+'/C'+cPct;
  if(S.g1Dir>0)      S.g1Status='CALL δ'+nk+'K '+cl+' '+modeTag+' '+volPct+'%'+tideTag+alignTag+divTag+regTag;
  else if(S.g1Dir<0) S.g1Status='PUT δ'+nk+'K '+cl+' '+modeTag+' '+volPct+'%'+tideTag+alignTag+divTag+regTag;
  else               S.g1Status='NEUTRAL δ'+nk+'K '+cl+tideTag+alignTag+regTag;
}
