// ── render/chart.js ──────────────────────────────────────────────
// LightweightCharts candlestick chart + GEX periscope canvas.
// Light-mode color scheme. Adds ORB high/low price lines.
// ─────────────────────────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { calcEMA, calcVWAP, aggBars } from '../core/utils.js';

export function initChart() {
  const LC = LightweightCharts;
  const chartEl = document.getElementById('chart');
  const wrapEl  = document.getElementById('chart-wrap');
  if(!chartEl || !wrapEl) return;

  S.chart = LC.createChart(chartEl, {
    layout: {
      background: { color:'#F8F7F4' },
      textColor:  '#7A7A72',
      fontSize:   10,
      fontFamily: "'IBM Plex Mono', monospace"
    },
    grid: {
      vertLines: { color:'#ECEAE4' },
      horzLines: { color:'#ECEAE4' }
    },
    crosshair: {
      mode: LC.CrosshairMode.Normal,
      vertLine: { color:'#C2C0B8', labelBackgroundColor:'#F0EEE9' },
      horzLine: { color:'#C2C0B8', labelBackgroundColor:'#F0EEE9' }
    },
    rightPriceScale: { borderColor:'#D5D3CC' },
    timeScale: {
      borderColor:'#D5D3CC', timeVisible:true, secondsVisible:false,
      rightOffset:30, barSpacing:6
    },
    handleScroll: true,
    handleScale:  { mouseWheel:true, pinch:true }
  });

  S.cs  = S.chart.addCandlestickSeries({
    upColor:'#1A6636', downColor:'#A81C1C',
    borderUpColor:'#1A6636', borderDownColor:'#A81C1C',
    wickUpColor:'#1A6636',   wickDownColor:'#A81C1C'
  });
  S.e8s  = S.chart.addLineSeries({ color:'#A84800', lineWidth:1.5, priceLineVisible:false, lastValueVisible:true, title:'EMA8' });
  S.e21s = S.chart.addLineSeries({ color:'#3A6EA5', lineWidth:1.5, priceLineVisible:false, lastValueVisible:true, title:'EMA21' });
  S.vws  = S.chart.addLineSeries({ color:'#AEADA6', lineWidth:1,
    lineStyle:LC.LineStyle.Dashed, priceLineVisible:false, lastValueVisible:true, title:'VWAP' });

  // Resize chart when container changes size
  const resize = () => {
    const c = chartEl, w = wrapEl;
    if(c && S.chart) S.chart.applyOptions({ width:c.clientWidth, height:w.clientHeight });
    drawGex();
  };
  new ResizeObserver(resize).observe(wrapEl);
  window.addEventListener('resize', resize);
  resize();
}

export function updateChart(force) {
  if(!S.chart || !S.bars.length) return;
  const nc = S.bars.length, isNew = force || nc !== S.lastBarCount;
  S.lastBarCount = nc;
  if(isNew) {
    const ts = S.chart.timeScale(), sp = ts.scrollPosition();
    S.cs.setData(S.bars.map(b => ({ time:b.t, open:b.o, high:b.h, low:b.l, close:b.c })));
    const e8d = calcEMA(S.bars, 8), e21d = calcEMA(S.bars, 21);
    S.e8s.setData(e8d); S.e21s.setData(e21d);
    if(e8d.length)  { S.ema8PrevVal=S.ema8Val; S.ema8Val=e8d[e8d.length-1].value; }
    if(e21d.length) S.ema21Val = e21d[e21d.length-1].value;
    const vd = calcVWAP(S.raw1m);
    S.vws.setData(vd);
    if(vd.length) S.vwapVal = vd[vd.length-1].value;
    if(sp > -20) ts.scrollToRealTime();
    updatePriceLines();
  } else {
    if(S.spyPrice && S.bars.length) {
      const last = S.bars[S.bars.length-1];
      S.cs.update({ time:last.t, open:last.o,
        high:Math.max(last.h, S.spyPrice), low:Math.min(last.l, S.spyPrice), close:S.spyPrice });
      const e8d = calcEMA(S.bars, 8), e21d = calcEMA(S.bars, 21);
      if(e8d.length)  { S.e8s.update({ time:last.t, value:e8d[e8d.length-1].value });   S.ema8Val=e8d[e8d.length-1].value; }
      if(e21d.length) { S.e21s.update({ time:last.t, value:e21d[e21d.length-1].value }); S.ema21Val=e21d[e21d.length-1].value; }
    }
  }
}

function getORB() {
  if(!S.todayBars || S.todayBars.length < 2) return null;
  const orbBars = S.todayBars.slice(0, Math.min(15, S.todayBars.length));
  if(!orbBars.length) return null;
  return {
    high: Math.max(...orbBars.map(b => b.h)),
    low:  Math.min(...orbBars.map(b => b.l))
  };
}

export function updatePriceLines() {
  const LC = LightweightCharts;
  S.plines.forEach(pl => { try{ S.cs.removePriceLine(pl); }catch(e){} });
  S.plines = [];
  const add = (p, col, title, w, st) => {
    if(!p || isNaN(p)) return;
    S.plines.push(S.cs.createPriceLine({
      price:p, color:col, lineWidth:w, lineStyle:st, axisLabelVisible:true, title
    }));
  };
  add(S.gexLevels.cwall, '#1A6636', 'CWALL', 1, LC.LineStyle.Dashed);
  add(S.gexLevels.pwall, '#A81C1C', 'PWALL', 1, LC.LineStyle.Dashed);
  // ORB levels — dashed amber
  const orb = getORB();
  if(orb) {
    add(orb.high, '#A84800', 'ORB H', 1, LC.LineStyle.Dashed);
    add(orb.low,  '#A84800', 'ORB L', 1, LC.LineStyle.Dashed);
  }
}

export function setTf(t) {
  S.tf = t;
  document.querySelectorAll('.tf').forEach((b, i) => {
    b.classList.toggle('on', [1,5,15,30][i] === t);
  });
  S.bars = aggBars(S.raw1m, S.tf);
  S.lastBarCount = 0;
  updateChart(true);
}

export function zoom(dir) {
  if(!S.chart) return;
  const cur = S.chart.timeScale().options().barSpacing || 6;
  S.chart.timeScale().applyOptions({
    barSpacing: dir>0 ? Math.min(cur*1.4, 40) : Math.max(cur/1.4, 2)
  });
}

export function openFullscreen() {
  const carea  = document.getElementById('carea');
  const fsBar  = document.getElementById('fs-bar');
  const expBtn = document.querySelector('.expbtn');
  if(!carea) return;
  carea.style.cssText='position:fixed;inset:0;z-index:300;background:var(--white)';
  if(fsBar) {
    fsBar.style.display = 'flex';
    const ctx = document.getElementById('fs-ctx');
    if(ctx) {
      const ph = S.dscPhase||'—', ds = isNaN(S.dscScore)?'':' '+S.dscScore.toFixed(2);
      const g  = isNaN(S.g1Score)?'—':S.g1Score.toFixed(1);
      const c  = isNaN(S.liveComp)?'—':S.liveComp.toFixed(1);
      ctx.textContent = `${S.sigState} \u00b7 DSC: ${ph}${ds} \u00b7 G1: ${g} \u00b7 COMP: ${c}`;
    }
  }
  if(expBtn) expBtn.style.display='none';
  // Resize chart after layout settles
  setTimeout(() => {
    const c = document.getElementById('chart');
    const w = document.getElementById('chart-wrap');
    if(c && S.chart && w) S.chart.applyOptions({ width:c.clientWidth, height:w.clientHeight });
    drawGex();
  }, 40);
}

export function closeFullscreen() {
  const carea  = document.getElementById('carea');
  const fsBar  = document.getElementById('fs-bar');
  const expBtn = document.querySelector('.expbtn');
  if(carea) carea.style.cssText='';
  if(fsBar) fsBar.style.display='none';
  if(expBtn) expBtn.style.display='';
  setTimeout(() => {
    const c = document.getElementById('chart');
    const w = document.getElementById('chart-wrap');
    if(c && S.chart && w) S.chart.applyOptions({ width:c.clientWidth, height:w.clientHeight });
    drawGex();
  }, 40);
}

export function drawGex() {
  const canvas = document.getElementById('gex-canvas');
  const panel  = document.getElementById('gex-panel');
  if(!canvas || !panel) return;
  const W = panel.clientWidth, H = panel.clientHeight;
  if(W<=0 || H<=0) return;
  canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle='#F0EEE9'; ctx.fillRect(0,0,W,H);

  // Header strip
  ctx.fillStyle='#E8E5DF'; ctx.fillRect(0,0,W,18);
  ctx.fillStyle='#7A7A72'; ctx.font='7px IBM Plex Mono,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('NET GEX', W/2, 9); ctx.textAlign='left';

  if(!S.gexProfile.length || !S.spyPrice) {
    ctx.fillStyle='#AEADA6'; ctx.font='8px IBM Plex Mono,monospace';
    ctx.textAlign='center'; ctx.fillText('AWAITING DATA', W/2, H/2); return;
  }

  const visible = [...S.gexProfile].sort((a,b)=>b.strike-a.strike);
  const n = visible.length; if(!n) return;
  const HDR=18, BAR_H=H-HDR-2;
  const rowH = Math.max(2, Math.floor(BAR_H/n));

  // Find which row is current price
  const priceIdx = visible.findIndex(r=>r.strike<=S.spyPrice);
  const pIdx     = priceIdx>=0 ? priceIdx : Math.floor(n/2);
  const startY   = H/2 - (pIdx*rowH + rowH/2);
  const priceY   = startY + pIdx*rowH + rowH/2;

  const maxAbs = Math.max(...visible.map(r=>Math.abs(r.netGex)), 0.001);
  const midX   = Math.floor(W * 0.5);

  visible.forEach((r, i) => {
    const y = startY + i*rowH;
    if(y+rowH < HDR || y > H) return;

    const isPrice = i === pIdx;
    const isCwall = S.gexLevels.cwall === r.strike;
    const isPwall = S.gexLevels.pwall === r.strike;

    // Row background
    if(isPrice) {
      ctx.fillStyle='rgba(168,72,0,0.06)'; ctx.fillRect(0,y,W,rowH);
    } else if(isCwall) {
      ctx.fillStyle='rgba(26,102,54,0.06)'; ctx.fillRect(0,y,W,rowH);
    } else if(isPwall) {
      ctx.fillStyle='rgba(168,28,28,0.06)'; ctx.fillRect(0,y,W,rowH);
    }

    // GEX bar
    const bw = Math.round((Math.abs(r.netGex)/maxAbs) * (midX-4));
    if(r.netGex >= 0) {
      ctx.fillStyle='rgba(26,102,54,0.5)'; ctx.fillRect(midX, y+2, bw, rowH-4);
    } else {
      ctx.fillStyle='rgba(168,28,28,0.5)'; ctx.fillRect(midX-bw, y+2, bw, rowH-4);
    }

    // Strike labels (every whole strike or walls)
    if((isCwall||isPwall||r.strike%1===0) && rowH>=7) {
      const fs = Math.min(rowH-1, 9);
      ctx.font = `${fs}px IBM Plex Mono,monospace`;
      ctx.textBaseline='middle';
      ctx.fillStyle = isCwall?'#1A6636':isPwall?'#A81C1C':isPrice?'#181816':'#AEADA6';
      if(isCwall||isPwall) ctx.font=`bold ${fs}px IBM Plex Mono,monospace`;
      const lbl = String(r.strike);
      if(r.netGex >= 0) ctx.fillText(lbl, 2, y+rowH/2);
      else               ctx.fillText(lbl, W-ctx.measureText(lbl).width-2, y+rowH/2);
    }
  });

  // Center divider
  ctx.strokeStyle='#C2C0B8'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(midX,HDR); ctx.lineTo(midX,H); ctx.stroke();

  // Current price line — amber dashed
  ctx.strokeStyle='#A84800'; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(0,priceY); ctx.lineTo(W,priceY); ctx.stroke();
  ctx.setLineDash([]);

  // Price label pill
  const px = S.spyPrice ? S.spyPrice.toFixed(2) : '---';
  ctx.font='bold 8px IBM Plex Mono,monospace'; ctx.textBaseline='middle';
  const tw = ctx.measureText(px).width + 6;
  ctx.fillStyle='#A84800';
  ctx.fillRect(midX - tw/2, priceY-7, tw, 14);
  ctx.fillStyle='#ffffff';
  ctx.textAlign='center'; ctx.fillText(px, midX, priceY); ctx.textAlign='left';

  // Price arrow
  ctx.fillStyle='#181816'; ctx.font='bold 8px IBM Plex Mono,monospace';
  ctx.textBaseline='middle'; ctx.fillText('\u25B6', 2, priceY);
}
