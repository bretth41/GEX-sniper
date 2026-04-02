// ── render/chart.js ──────────────────────────────────────────────
// Chart rendering. Depends on LightweightCharts (loaded via CDN in index.html).
// ─────────────────────────────────────────────────────────────────
import * as S from '../core/state.js';
import { calcEMA, calcVWAP, aggBars } from '../core/utils.js';

export function initChart() {
  const LC=LightweightCharts;
  S.chart=LC.createChart(document.getElementById('chart'),{
    layout:{background:{color:'#040507'},textColor:'#384550',
      fontSize:10,fontFamily:"'JetBrains Mono',monospace"},
    grid:{vertLines:{color:'#0a0e14'},horzLines:{color:'#0a0e14'}},
    crosshair:{mode:LC.CrosshairMode.Normal,
      vertLine:{color:'#2a3540',labelBackgroundColor:'#0d1117'},
      horzLine:{color:'#2a3540',labelBackgroundColor:'#0d1117'}},
    rightPriceScale:{borderColor:'#181e26'},
    timeScale:{borderColor:'#181e26',timeVisible:true,secondsVisible:false,
      rightOffset:30,barSpacing:6},
    handleScroll:true,handleScale:{mouseWheel:true,pinch:true},
  });
  S.cs =S.chart.addCandlestickSeries({upColor:'#18d46c',downColor:'#f02848',
    borderUpColor:'#18d46c',borderDownColor:'#f02848',
    wickUpColor:'#18d46c',wickDownColor:'#f02848'});
  S.e8s=S.chart.addLineSeries({color:'#f5a623',lineWidth:1,priceLineVisible:false,lastValueVisible:true,title:'EMA8'});
  S.e21s=S.chart.addLineSeries({color:'#3490ff',lineWidth:1,priceLineVisible:false,lastValueVisible:true,title:'EMA21'});
  S.vws=S.chart.addLineSeries({color:'rgba(224,234,238,0.4)',lineWidth:1,
    lineStyle:LightweightCharts.LineStyle.Dashed,priceLineVisible:false,lastValueVisible:true,title:'VWAP'});
  const resize=()=>{
    const w=document.getElementById('chart-wrap');
    const c=document.getElementById('chart');
    if(c&&S.chart) S.chart.applyOptions({width:c.clientWidth,height:w?w.clientHeight:c.clientHeight});
    drawGex();
  };
  window.addEventListener('resize',resize); resize();
}

export function updateChart(force) {
  if(!S.chart||!S.bars.length) return;
  const nc=S.bars.length, isNew=force||nc!==S.lastBarCount; S.lastBarCount=nc;
  if(isNew){
    const ts=S.chart.timeScale(), sp=ts.scrollPosition();
    S.cs.setData(S.bars.map(b=>({time:b.t,open:b.o,high:b.h,low:b.l,close:b.c})));
    const e8d=calcEMA(S.bars,8), e21d=calcEMA(S.bars,21);
    S.e8s.setData(e8d); S.e21s.setData(e21d);
    if(e8d.length){ S.ema8PrevVal=S.ema8Val; S.ema8Val=e8d[e8d.length-1].value; }
    if(e21d.length) S.ema21Val=e21d[e21d.length-1].value;
    const vd=calcVWAP(S.raw1m); S.vws.setData(vd);
    if(vd.length) S.vwapVal=vd[vd.length-1].value;
    if(sp>-20) ts.scrollToRealTime();
    updatePriceLines();
  } else {
    if(S.spyPrice&&S.bars.length){
      const last=S.bars[S.bars.length-1];
      S.cs.update({time:last.t,open:last.o,
        high:Math.max(last.h,S.spyPrice),low:Math.min(last.l,S.spyPrice),close:S.spyPrice});
      const e8dx=calcEMA(S.bars,8), e21dx=calcEMA(S.bars,21);
      if(e8dx.length){ S.e8s.update({time:last.t,value:e8dx[e8dx.length-1].value}); S.ema8Val=e8dx[e8dx.length-1].value; }
      if(e21dx.length){ S.e21s.update({time:last.t,value:e21dx[e21dx.length-1].value}); S.ema21Val=e21dx[e21dx.length-1].value; }
    }
  }
}

export function updatePriceLines() {
  const LC=LightweightCharts;
  S.plines.forEach(pl=>{try{S.cs.removePriceLine(pl);}catch(e){}});S.plines=[];
  const add=(p,col,title,w,st)=>{
    if(!p||isNaN(p)) return;
    S.plines.push(S.cs.createPriceLine({price:p,color:col,lineWidth:w,lineStyle:st,axisLabelVisible:true,title}));
  };
  add(S.gexLevels.cwall,'#18d46c','CWALL',1,LightweightCharts.LineStyle.Dashed);
  add(S.gexLevels.pwall,'#f02848','PWALL',1,LightweightCharts.LineStyle.Dashed);
}

export function setTf(t) {
  S.tf=t;
  document.querySelectorAll('.tf').forEach((b,i)=>{ b.classList.toggle('on',[1,5,15,30][i]===t); });
  S.bars=aggBars(S.raw1m,S.tf); S.lastBarCount=0; updateChart(true);
}

export function zoom(dir) {
  if(!S.chart) return;
  const cur=S.chart.timeScale().options().barSpacing||6;
  S.chart.timeScale().applyOptions({barSpacing:dir>0?Math.min(cur*1.4,40):Math.max(cur/1.4,2)});
}

export function drawGex() {
  const canvas=document.getElementById('gex-canvas');
  const panel=document.getElementById('gex-panel');
  if(!canvas||!panel) return;
  const W=panel.clientWidth, H=panel.clientHeight;
  if(W<=0||H<=0) return;
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#080b0e'; ctx.fillRect(0,0,W,16);
  ctx.fillStyle='rgba(160,180,196,0.5)';
  ctx.font='7px JetBrains Mono,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('NET GEX ±$20',W/2,8); ctx.textAlign='left';
  if(!S.gexProfile.length||!S.spyPrice){
    ctx.fillStyle='rgba(160,180,196,0.3)'; ctx.font='8px JetBrains Mono,monospace';
    ctx.textAlign='center'; ctx.fillText('AWAITING DATA',W/2,H/2); return;
  }
  const visible=[...S.gexProfile].sort((a,b)=>b.strike-a.strike);
  const n=visible.length; if(!n) return;
  const LABEL_H=16, BAR_H=H-LABEL_H-2;
  const rowH=Math.max(2,Math.floor(BAR_H/n));
  const priceIdx=visible.findIndex(r=>r.strike<=S.spyPrice);
  const pIdx=priceIdx>=0?priceIdx:Math.floor(n/2);
  const centerY=H/2;
  const startY=centerY-(pIdx*rowH+rowH/2);
  const priceY=startY+pIdx*rowH+rowH/2;
  const maxAbs=Math.max(...visible.map(r=>Math.abs(r.netGex)),0.001);
  const midX=Math.floor(W*0.5);
  visible.forEach((r,i)=>{
    const y=startY+i*rowH;
    if(y+rowH<LABEL_H||y>H) return;
    const bw=Math.round((Math.abs(r.netGex)/maxAbs)*(midX-3));
    ctx.fillStyle=r.netGex>=0?'rgba(24,212,108,0.82)':'rgba(240,40,72,0.82)';
    if(r.netGex>=0) ctx.fillRect(midX,y+1,bw,rowH-2);
    else            ctx.fillRect(midX-bw,y+1,bw,rowH-2);
    const isWall=S.gexLevels.cwall===r.strike||S.gexLevels.pwall===r.strike;
    if((isWall||r.strike%1===0)&&rowH>=7){
      const fs=Math.min(rowH,9);
      ctx.fillStyle=isWall?'#f5a623':'rgba(160,180,196,0.6)';
      ctx.font=`${fs}px JetBrains Mono,monospace`; ctx.textBaseline='middle';
      const lbl=String(r.strike), tw=ctx.measureText(lbl).width;
      if(r.netGex>=0) ctx.fillText(lbl,2,y+rowH/2);
      else            ctx.fillText(lbl,W-tw-2,y+rowH/2);
    }
  });
  ctx.strokeStyle='rgba(160,180,196,0.2)'; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(midX,LABEL_H);ctx.lineTo(midX,H);ctx.stroke();
  ctx.strokeStyle='rgba(245,166,35,0.95)'; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
  ctx.beginPath();ctx.moveTo(0,priceY);ctx.lineTo(W,priceY);ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='#f5a623'; ctx.font='bold 9px JetBrains Mono,monospace';
  ctx.textBaseline='bottom';
  ctx.fillText(S.spyPrice?S.spyPrice.toFixed(2):'---',3,priceY-1);
}
