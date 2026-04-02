// ── render/cards.js ──────────────────────────────────────────────
// Renders gauge rows 1 and 2: COMP, DSC, G1, F1, WX, COSMIC
// Also renders signal panel ingredients and context.
// Gauge engine: SVG semicircular speedometer dials.
// ─────────────────────────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { f } from '../core/utils.js';

// ── SVG gauge engine ──────────────────────────────────────────────
// All angles: 0° = pointing up, positive = clockwise
function pt(a, r, cx, cy) {
  const rad = a * Math.PI / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
function arc(a1, a2, r, cx, cy) {
  const p1 = pt(a1, r, cx, cy), p2 = pt(a2, r, cx, cy);
  const lg = Math.abs(a2 - a1) > 180 ? 1 : 0;
  return `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} A${r},${r} 0 ${lg},1 ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
}
function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
  return el;
}

function buildGauge(id, cfg) {
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = '';
  const { cx, cy, r, sw=13, min, max, value, zones=[], nc, lbl } = cfg;

  // Background track
  el.appendChild(svgEl('path', {
    d:arc(-90,90,r,cx,cy), fill:'none',
    stroke:'#E0DED8', 'stroke-width':sw, 'stroke-linecap':'round'
  }));

  // Colored zone arcs
  zones.forEach(z => {
    const a1 = -90 + (z.from - min) / (max - min) * 180;
    const a2 = -90 + (z.to   - min) / (max - min) * 180;
    el.appendChild(svgEl('path', {
      d:arc(a1,a2,r,cx,cy), fill:'none',
      stroke:z.color, 'stroke-width':sw, 'stroke-linecap':'butt', opacity:z.op||'1'
    }));
  });

  // Tick marks (white notches across the arc)
  for(let i = 0; i <= 10; i++) {
    const ta = -90 + i * 18;
    const p1 = pt(ta, r+1, cx, cy), p2 = pt(ta, r - sw*0.55, cx, cy);
    el.appendChild(svgEl('line', {
      x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y,
      stroke:'rgba(255,255,255,0.65)', 'stroke-width':1
    }));
  }

  // Needle (triangle)
  const va = Math.max(-90, Math.min(90, -90 + (value - min) / (max - min) * 180));
  const tip = pt(va, r*0.70, cx, cy);
  const b1  = pt(va+90, r*0.07, cx, cy);
  const b2  = pt(va-90, r*0.07, cx, cy);
  el.appendChild(svgEl('polygon', {
    points:`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`,
    fill: nc || '#181816'
  }));
  // Pivot dot
  el.appendChild(svgEl('circle', { cx, cy, r:r*0.07, fill:'#181816' }));

  // Zone labels (min left, max right)
  if(lbl) {
    const ll = pt(-90, r + sw*0.9, cx, cy);
    const lr = pt( 90, r + sw*0.9, cx, cy);
    [[ll, lbl[0], 'start'], [lr, lbl[1], 'end']].forEach(([p, l, anchor]) => {
      const t = svgEl('text', {
        x:p.x, y:p.y+3, 'font-size':7, fill:l.color||'#AEADA6',
        'text-anchor':anchor, 'font-family':"IBM Plex Mono,monospace", 'font-weight':'600'
      });
      t.textContent = l.text;
      el.appendChild(t);
    });
  }
}

// ── Gauge helpers ─────────────────────────────────────────────────
const BIDIR_ZONES = [
  { from:-2, to:-0.5, color:'rgba(168,28,28,0.55)' },
  { from:-0.5, to:0.5, color:'rgba(170,170,162,0.38)' },
  { from:0.5, to:2, color:'rgba(26,102,54,0.55)' }
];
const BIDIR_ZONES_SM = [
  { from:-2, to:-0.5, color:'rgba(168,28,28,0.5)' },
  { from:-0.5, to:0.5, color:'rgba(170,170,162,0.3)' },
  { from:0.5, to:2, color:'rgba(26,102,54,0.5)' }
];
const WX_ZONES = [
  { from:-1, to:-0.25, color:'rgba(168,28,28,0.5)' },
  { from:-0.25, to:0.25, color:'rgba(170,170,162,0.3)' },
  { from:0.25, to:1, color:'rgba(26,102,54,0.5)' }
];
const DSC_ZONES = [
  { from:0, to:0.40, color:'rgba(170,170,162,0.5)' },
  { from:0.40, to:0.70, color:'rgba(168,112,24,0.6)' },
  { from:0.70, to:1.0, color:'rgba(168,28,28,0.65)' }
];

function needleColor(val, min, max) {
  const mid = (min+max)/2, qtr=(max-min)*0.15;
  if(val > mid+qtr) return '#1A6636';
  if(val < mid-qtr) return '#A81C1C';
  return '#7A7A72';
}

// ── Signal state helpers ───────────────────────────────────────────
function sigTagClass(dir) {
  return dir > 0 ? 'sig-tag call' : dir < 0 ? 'sig-tag put' : 'sig-tag miss';
}
function sigTagText(label, dir) {
  return dir > 0 ? label+' CALL' : dir < 0 ? label+' PUT' : label+' \u2014';
}

// ── COSMIC vote computation ───────────────────────────────────────
// Mirrors the 7 voters from signals/cosmic.js
function getVotes() {
  const d = S.dscDir > 0 ? 1 : S.dscDir < 0 ? -1 : 0;
  const voters = [
    S.g1Dir,         // G1
    S.f1Dir,         // F1
    Math.sign(S.wxCompScore || 0),  // WX
    (() => {         // DRIFT
      if(!S.driftState||S.driftState==='—'||S.driftState==='EXHAUSTED') return 0;
      return S.driftState.includes('CALL') ? 1 : S.driftState.includes('PUT') ? -1 : 0;
    })(),
    (() => {         // HEC collapse only
      if(!S.hecState||!S.hecState.includes('COLLAPSE')) return 0;
      return S.hecState.includes('CALL') ? 1 : -1;
    })(),
    (() => {         // GIA strong accel
      if(!S.giaState||S.giaState==='—'||S.giaState==='BALANCED') return 0;
      return S.giaState.includes('CALL') ? 1 : S.giaState.includes('PUT') ? -1 : 0;
    })(),
    (S.dscPhase==='STRAIN'||S.dscPhase==='FAILURE') ? d : 0   // DSC
  ];
  const putCount  = voters.filter(v => v < 0).length;
  const callCount = voters.filter(v => v > 0).length;
  return { voters, putCount, callCount };
}

// ── Main render ───────────────────────────────────────────────────
export function renderCards(comp) {

  // ── COMP gauge ────────────────────────────────────────────────
  const compNC = needleColor(comp, -2, 2);
  buildGauge('svg-comp', {
    cx:90, cy:87, r:66, sw:14, min:-2, max:2, value:comp,
    nc: compNC, zones: BIDIR_ZONES,
    lbl: [{ text:'PUT', color:'#A81C1C' }, { text:'CALL', color:'#1A6636' }]
  });
  const vc = document.getElementById('v-comp');
  if(vc) {
    vc.textContent = (comp>=0?'+':'')+comp.toFixed(1);
    vc.className   = 'g-val ' + (comp>0.15?'call':comp<-0.15?'put':'dim');
  }

  // ── DSC gauge ────────────────────────────────────────────────
  const dscVal = isNaN(S.dscScore) ? 0 : S.dscScore;
  const dscNC  = dscVal>=0.70?'#A81C1C':dscVal>=0.40?'#A84800':'#7A7A72';
  buildGauge('svg-dsc', {
    cx:90, cy:87, r:66, sw:14, min:0, max:1, value:dscVal,
    nc: dscNC, zones: DSC_ZONES,
    lbl: [{ text:'BUILD', color:'#AEADA6' }, { text:'FAIL', color:'#A81C1C' }]
  });
  const vd = document.getElementById('v-dsc');
  if(vd) { vd.textContent = dscVal.toFixed(2); vd.className='g-val '+(dscVal>=0.70?'put':dscVal>=0.40?'amber':'dim'); }
  const bd = document.getElementById('b-dsc');
  if(bd) {
    const ph = S.dscPhase||'—';
    bd.textContent = ph;
    bd.className   = 'g-badge ' + (ph==='FAILURE'?'fail':ph==='STRAIN'?'strain':ph==='EXPANSION'?'expand':'build');
  }

  // ── Signal panel ──────────────────────────────────────────────
  const locked = Date.now() < S.sigLock;
  const rem    = locked ? Math.ceil((S.sigLock - Date.now())/1000) : 0;
  const ss     = document.getElementById('sig-state');
  let sigCol, sigLbl, ctxTxt;

  switch(S.sigState) {
    case 'STRONG_CALL':
      sigCol='var(--call)'; sigLbl='STRONG CALL';
      ctxTxt='All confirmed'+(locked?' · '+rem+'s':'');
      break;
    case 'CALL':
      sigCol='var(--call)'; sigLbl='CALL';
      ctxTxt='G1+F1+WX aligned'+(locked?' · '+rem+'s':'');
      break;
    case 'STRONG_PUT':
      sigCol='var(--put)'; sigLbl='STRONG PUT';
      ctxTxt='All confirmed'+(locked?' · '+rem+'s':'');
      break;
    case 'PUT':
      sigCol='var(--put)'; sigLbl='PUT';
      ctxTxt='G1+F1+WX aligned'+(locked?' · '+rem+'s':'');
      break;
    default: {
      sigCol='var(--ink3)'; sigLbl='NEUTRAL';
      const miss=[];
      if(!S.g1Dir) miss.push('G1');
      else if(!S.f1Dir) miss.push('F1');
      else if(!S.wxCompScore) miss.push('WX');
      const rfActive = S.sigLastFireDir!==0 && (Date.now()-S.sigLastFireTs)<8*60*1000;
      if(miss.length) ctxTxt = '<strong>Waiting:</strong> '+miss.join(', ')+(rfActive?' · refire guard':'');
      else if(rfActive) ctxTxt = '<strong>Refire guard</strong> active';
      else ctxTxt = S.g1Status!=='—' ? 'Setup building...' : 'Awaiting data';
      break;
    }
  }

  if(ss) { ss.textContent = sigLbl; ss.style.color = sigCol; }
  const ctx = document.getElementById('sig-context');
  if(ctx) ctx.innerHTML = ctxTxt;

  // Ingredient tags
  const tg1 = document.getElementById('sig-tag-g1');
  const tf1 = document.getElementById('sig-tag-f1');
  const twx = document.getElementById('sig-tag-wx');
  const wxDir = Math.sign(S.wxCompScore || 0);
  if(tg1) { tg1.textContent = sigTagText('G1', S.g1Dir); tg1.className = sigTagClass(S.g1Dir); }
  if(tf1) { tf1.textContent = sigTagText('F1', S.f1Dir); tf1.className = sigTagClass(S.f1Dir); }
  if(twx) { twx.textContent = sigTagText('WX', wxDir);  twx.className = sigTagClass(wxDir);  }

  // ── G1 gauge ──────────────────────────────────────────────────
  const g1v = isNaN(S.g1Score) ? 0 : S.g1Score;
  buildGauge('svg-g1', {
    cx:70, cy:67, r:54, sw:11, min:-2, max:2, value:g1v,
    nc:needleColor(g1v,-2,2), zones:BIDIR_ZONES_SM
  });
  const vg1 = document.getElementById('v-g1');
  if(vg1) {
    vg1.textContent = S.g1Dir!==0 ? (g1v>=0?'+':'')+g1v.toFixed(1) : '—';
    vg1.className   = 'g2-val '+(S.g1Dir>0?'call':S.g1Dir<0?'put':'dim');
  }
  const dg1 = document.getElementById('d-g1');
  if(dg1) dg1.textContent = S.g1Status||'—';

  // ── F1 gauge ──────────────────────────────────────────────────
  const f1v = isNaN(S.f1Score) ? 0 : S.f1Score;
  buildGauge('svg-f1', {
    cx:70, cy:67, r:54, sw:11, min:-2, max:2, value:f1v,
    nc:needleColor(f1v,-2,2), zones:BIDIR_ZONES_SM
  });
  const vf1 = document.getElementById('v-f1');
  if(vf1) {
    vf1.textContent = S.f1Dir!==0 ? (f1v>=0?'+':'')+f1v.toFixed(1) : '—';
    vf1.className   = 'g2-val '+(S.f1Dir>0?'call':S.f1Dir<0?'put':'dim');
  }
  const df1 = document.getElementById('d-f1');
  if(df1) df1.textContent = S.f1Status||'WATCHING';

  // ── WX gauge ──────────────────────────────────────────────────
  const wxv = isNaN(S.wxCompScore) ? 0 : S.wxCompScore;
  buildGauge('svg-wx', {
    cx:70, cy:67, r:54, sw:11, min:-1, max:1, value:wxv,
    nc:needleColor(wxv,-1,1), zones:WX_ZONES
  });
  const vwx = document.getElementById('v-wx');
  if(vwx) {
    const wxLbl = ({
      'GO! CALL':'GO! CALL','GO! PUT':'GO! PUT',
      'STRONG CALL':'STR CALL','STRONG PUT':'STR PUT',
      'CALL SETUP':'CALL SETUP','PUT SETUP':'PUT SETUP',
      'WATCH':'WATCH','EXTENDED':'EXTEND'
    })[S.wxState] || (S.wxState||'—');
    vwx.textContent = wxLbl;
    vwx.className   = 'g2-val '+(wxv>=0.5?'call':wxv<=-0.5?'put':'dim');
  }
  const dwx = document.getElementById('d-wx');
  if(dwx) {
    const wxSub = S.wxClusterPrice ? '$'+S.wxClusterPrice.toFixed(2)+(S.wxRejectCount?' \u00d7'+S.wxRejectCount:'')
                : S.wxRejectCount  ? '\u00d7'+S.wxRejectCount+' rejections' : '—';
    dwx.textContent = wxSub;
  }

  // ── COSMIC ────────────────────────────────────────────────────
  const isCall   = S.cosmicState==='COSMIC CALL';
  const isPut    = S.cosmicState==='COSMIC PUT';
  const cosActive = isCall || isPut;
  const inactEl  = document.getElementById('cosmic-inactive');
  const actEl    = document.getElementById('cosmic-active');

  if(cosActive) {
    if(inactEl) inactEl.style.display='none';
    if(actEl)   actEl.style.display='flex';
    const dirEl = document.getElementById('cf-dir');
    if(dirEl)   { dirEl.textContent=isPut?'PUT':'CALL'; dirEl.className='cf-dir '+(isPut?'put':'call'); }
    const votEl = document.getElementById('cf-votes');
    const { putCount, callCount } = getVotes();
    const cnt = isPut ? putCount : callCount;
    if(votEl) votEl.textContent = cnt+'/7 agree';
    const tgtEl = document.getElementById('cf-target');
    if(tgtEl) tgtEl.textContent = S.cosmicTarget?'TARGET: $'+S.cosmicTarget:'';
  } else {
    if(inactEl) inactEl.style.display='flex';
    if(actEl)   actEl.style.display='none';
    // Vote bar
    const { voters, putCount, callCount } = getVotes();
    const domDir = putCount >= callCount ? -1 : 1;
    const domCls = domDir < 0 ? 'put' : 'call';
    const count  = domDir < 0 ? putCount : callCount;
    const bar    = document.getElementById('vote-bar');
    if(bar) {
      const squares = bar.querySelectorAll('.cv');
      squares.forEach((sq, i) => {
        const voted = domDir < 0 ? voters[i] < 0 : voters[i] > 0;
        sq.className = 'cv' + (voted ? ' on '+domCls : '');
      });
    }
    const need = document.getElementById('cosmic-need');
    if(need) need.textContent = count+' / 7 \u00b7 NEED 4';
  }
}
