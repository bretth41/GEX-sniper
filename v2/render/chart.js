// ── render/chart.js ──────────────────────────────────────────────
// LightweightCharts candlestick chart + GEX periscope canvas.
// Light-mode color scheme. Adds ORB high/low price lines.
// ─────────────────────────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { calcEMA, calcVWAP, aggBars } from '../core/utils.js';

export function initChart() {
  const LC = LightweightCharts;
  const chartEl = document.getElementById('chart');
  const wrapEl  = document.getElementById('chart-col');
  if(!chartEl || !wrapEl) return;

  S.chart = LC.createChart(chartEl, {
    layout: {
      background: { color:'#F8F7F4' },
      textColor:  '#4A4A46',
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
      borderColor:'#C2C0B8',
      timeVisible:true,
      secondsVisible:false,
      rightOffset:30,
      barSpacing:6,
      // Ensure time labels are clearly readable on light background
      borderVisible:true,
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
    if(!S.chart) return;
    const col = document.getElementById('chart-col');
    const carea = document.getElementById('carea');
    if(!col || !carea) return;
    // Width from the column container
    const w = col.clientWidth;
    // Height: from carea top edge to bottom of viewport.
    // This is the ONLY reliable way on iPad Safari — avoids flex overflow.
    const careaTop = carea.getBoundingClientRect().top;
    const h = Math.floor(window.innerHeight - careaTop);
    if(w > 0 && h > 60) {
      S.chart.applyOptions({ width:w, height:h });
    }
    drawGex();
  };
  new ResizeObserver(() => requestAnimationFrame(resize)).observe(
    document.getElementById('carea') || chartEl
  );
  window.addEventListener('resize', () => requestAnimationFrame(resize));
  // Double rAF + timeout: ensures all rows are laid out before measuring
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resize, 30)));
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
  const carea  = document.getElementById('chart-col');
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
    const w = document.getElementById('chart-col');
    if(S.chart){const _col=document.getElementById('chart-col');if(_col){const _w=_col.clientWidth,_h=Math.floor(window.innerHeight);if(_w>0&&_h>60)S.chart.applyOptions({width:_w,height:_h});}}
    drawGex();
  }, 40);
}

export function closeFullscreen() {
  const carea = document.getElementById('chart-col');
  const fsBar = document.getElementById('fs-bar');
  if(carea) carea.style.cssText='';
  if(fsBar) fsBar.style.display='none';
  // Safari needs time to reflow the flex layout before we can measure.
  // Fire two resize attempts: one early, one after layout fully settles.
  const doResize = () => {
    const col   = document.getElementById('chart-col');
    const carea2 = document.getElementById('carea');
    if(!col || !S.chart) return;
    const w = col.clientWidth;
    const top = carea2 ? carea2.getBoundingClientRect().top : 0;
    const h = Math.floor(window.innerHeight - top);
    if(w > 0 && h > 60) S.chart.applyOptions({ width:w, height:h });
    drawGex();
  };
  setTimeout(doResize, 60);   // early attempt
  setTimeout(doResize, 250);  // final settle — guarantees time axis visible
}

export function drawGex() {
  const canvas = document.getElementById('gex-canvas');
  const panel  = document.getElementById('gex-panel');
  if(!canvas || !panel) return;
  // Use getBoundingClientRect for accurate size on iPad Safari
  const rect = panel.getBoundingClientRect();
  const W = Math.floor(rect.width), H = Math.floor(rect.height);
  if(W<=0 || H<=0) return;
  canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle='#F0EEE9'; ctx.fillRect(0,0,W,H);

  // Header strip
  ctx.fillStyle='#E8E5DF'; ctx.fillRect(0,0,W,18);
  ctx.fillStyle='#7A7A72'; ctx.font='bold 7px IBM Plex Mono,monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('NET GEX', W/2, 9); ctx.textAlign='left';

  if(!S.gexProfile.length || !S.spyPrice) {
    ctx.fillStyle='#AEADA6'; ctx.font='8px IBM Plex Mono,monospace';
    ctx.textAlign='center'; ctx.fillText('AWAITING DATA', W/2, H/2); return;
  }

  const visible  = [...S.gexProfile].sort((a,b)=>b.strike-a.strike);
  const n        = visible.length; if(!n) return;
  const HDR      = 18;
  const BAR_AREA = H - HDR - 2;
  const rowH     = Math.max(2, Math.floor(BAR_AREA / n));

  // Strike label column width
  const LABEL_W = 34;
  const BAR_W   = W - LABEL_W - 2; // bar zone width
  const maxAbs  = Math.max(...visible.map(r=>Math.abs(r.netGex)), 0.001);

  // Find row containing current price
  const priceIdx = visible.findIndex(r => r.strike <= S.spyPrice);
  const pIdx     = priceIdx >= 0 ? priceIdx : Math.floor(n/2);
  // Center price row in panel
  const centerY  = H/2;
  const startY   = centerY - (pIdx * rowH + rowH/2);
  const priceY   = startY + pIdx * rowH + rowH/2;

  visible.forEach((r, i) => {
    const y = startY + i * rowH;
    if(y + rowH < HDR || y > H) return;

    const isCwall = S.gexLevels.cwall === r.strike;
    const isPwall = S.gexLevels.pwall === r.strike;
    const isPx    = i === pIdx;

    // Row background for walls
    if(isCwall) { ctx.fillStyle='rgba(26,102,54,.06)'; ctx.fillRect(0,y,W,rowH); }
    if(isPwall) { ctx.fillStyle='rgba(168,28,28,.06)'; ctx.fillRect(0,y,W,rowH); }

    // Bar width proportional to |netGex|, anchored to RIGHT edge
    const bw = Math.round((Math.abs(r.netGex)/maxAbs) * BAR_W * 0.94);
    const bx = LABEL_W + (BAR_W - bw); // right-anchored start x
    ctx.fillStyle = r.netGex >= 0 ? 'rgba(26,102,54,.58)' : 'rgba(168,28,28,.58)';
    if(bw > 0) {
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, y+2, bw, rowH-4, [2,0,0,2])
                    : ctx.rect(bx, y+2, bw, rowH-4);
      ctx.fill();
    }

    // Strike label (left side)
    if(rowH >= 6) {
      const fs = Math.min(rowH-1, 9);
      ctx.font = (isCwall||isPwall ? 'bold ' : '') + fs + 'px IBM Plex Mono,monospace';
      ctx.textBaseline='middle'; ctx.textAlign='right';
      ctx.fillStyle = isCwall ? '#1A6636' : isPwall ? '#A81C1C' : isPx ? '#181816' : '#AEADA6';
      ctx.fillText(String(r.strike), LABEL_W-3, y+rowH/2);
    }
  });

  // Center divider line (subtle)
  ctx.strokeStyle='#D5D3CC'; ctx.lineWidth=.5;
  ctx.beginPath(); ctx.moveTo(LABEL_W,HDR); ctx.lineTo(LABEL_W,H); ctx.stroke();

  // Current price line — amber horizontal rule across full bar zone
  ctx.strokeStyle='#A84800'; ctx.lineWidth=2; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(LABEL_W,priceY); ctx.lineTo(W,priceY); ctx.stroke();
  ctx.setLineDash([]);

  // Price label — right-aligned, above the line
  if(S.spyPrice) {
    const px = S.spyPrice.toFixed(2);
    ctx.font='bold 8px IBM Plex Mono,monospace'; ctx.textBaseline='bottom';
    ctx.textAlign='right'; ctx.fillStyle='#A84800';
    ctx.fillText(px, W-2, priceY-1);
  }

  // Arrow pointing right at price row
  ctx.fillStyle='#A84800'; ctx.font='bold 9px IBM Plex Mono,monospace';
  ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillText('▶', LABEL_W+2, priceY);
}


