// ── render/header.js ─────────────────────────────────────────────
// Renders: price bar (price/VIX/VWAP), environment strip (DRIFT/HEC/GIA/GX/ABSORP)
// Also owns: config modal, refreshPushUI
// ─────────────────────────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { cfg, CFG_KEY } from '../core/config.js';
import { f } from '../core/utils.js';

// ── Config modal ──────────────────────────────────────────────────
export function openModal() {
  document.getElementById('c-proxy').value = cfg.proxyUrl      || '';
  document.getElementById('c-pt').value    = cfg.pushoverToken || '';
  document.getElementById('c-pu').value    = cfg.pushoverUser  || '';
  document.getElementById('overlay').classList.add('open');
  document.getElementById('splash').classList.remove('open');
}
export function closeModal() { document.getElementById('overlay').classList.remove('open'); }
export function bgClick(e)   { if(e.target.id==='overlay') closeModal(); }
export function saveAndApply() {
  cfg.proxyUrl      = document.getElementById('c-proxy').value.trim().replace(/\/$/,'');
  cfg.pushoverToken = document.getElementById('c-pt').value.trim();
  cfg.pushoverUser  = document.getElementById('c-pu').value.trim();
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  closeModal(); refreshPushUI();
  if(window.startPolling) window.startPolling();
}
export function refreshPushUI() {
  const on = !!cfg.pushoverToken;
  const lbl = document.getElementById('push-lbl');
  if(lbl) {
    lbl.textContent = on ? 'PUSH ✓' : 'PUSH OFF';
    lbl.className   = 'push-sm ' + (on ? 'on' : 'off');
  }
}

// ── Env strip helper ─────────────────────────────────────────────
function envCell(id, val, valCls, tint) {
  const cell = document.getElementById(id);
  if(!cell) return;
  const v = cell.querySelector('.ec-val');
  if(v) { v.textContent = val; v.className = 'ec-val ' + (valCls||'dim'); }
  cell.className = 'ec' + (tint ? ' t'+tint : '');
}

// ── Main render ───────────────────────────────────────────────────
export function renderHeader(comp, g1Norm, f1Norm) {

  // ── Price ──────────────────────────────────────────────────────
  if(S.spyPrice) {
    const up  = S.prevSpyPrice && S.spyPrice > S.prevSpyPrice;
    const dn  = S.prevSpyPrice && S.spyPrice < S.prevSpyPrice;
    const pe  = document.getElementById('h-price');
    if(pe) {
      pe.textContent = f(S.spyPrice, 2);
      pe.style.color = up ? 'var(--call)' : dn ? 'var(--put)' : 'var(--ink)';
      // Fade back to ink
      clearTimeout(pe._t);
      pe._t = setTimeout(() => { pe.style.color = 'var(--ink)'; }, 400);
    }
    if(S.raw1m && S.raw1m.length) {
      const ref  = S.prevClose || S.sessionOpenPrice || S.raw1m[0].o;
      const chg  = S.spyPrice - ref;
      const pct  = ref ? ((chg/ref)*100).toFixed(2) : '0.00';
      const ce   = document.getElementById('h-chg');
      if(ce) {
        ce.textContent = (chg>=0?'+':'')+chg.toFixed(2)+'  '+pct+'%';
        ce.style.color  = chg>=0 ? 'var(--call)' : 'var(--put)';
      }
    }
  }

  // ── VIX ────────────────────────────────────────────────────────
  if(S.vixPrice) {
    const vUp = S.prevVixPrice && S.vixPrice > S.prevVixPrice;
    const vDn = S.prevVixPrice && S.vixPrice < S.prevVixPrice;
    const ve  = document.getElementById('h-vix');
    if(ve) {
      ve.textContent = f(S.vixPrice, 2);
      // VIX up = bad (put pressure), VIX dn = good (call relief)
      ve.style.color = vUp ? 'var(--put)' : vDn ? 'var(--call)' : 'var(--ink2)';
    }
  }

  // ── VWAP ───────────────────────────────────────────────────────
  if(S.vwapVal) {
    const ve = document.getElementById('h-vwap');
    if(ve) ve.textContent = f(S.vwapVal, 2);
  }

  // ── GEX legend labels ──────────────────────────────────────────
  const cw = document.getElementById('leg-cwall');
  const pw = document.getElementById('leg-pwall');
  if(cw) cw.textContent = 'CWall '+f(S.gexLevels.cwall,0);
  if(pw) pw.textContent = 'PWall '+f(S.gexLevels.pwall,0);

  // ── DRIFT ──────────────────────────────────────────────────────
  (()=>{
    const dAbs  = Math.abs(S.driftDelta);
    const dSign = S.driftDelta >= 0 ? '+' : '-';
    const dStr  = dAbs > 0.01 ? ' '+dSign+dAbs.toFixed(1) : '';
    let lbl, cls, tint;
    if(S.driftState==='SUPER CALL COIL')       { lbl='SUPER ↑'+dStr; cls='call'; tint='call'; }
    else if(S.driftState==='SUPER PUT COIL')   { lbl='SUPER ↓'+dStr; cls='put';  tint='put'; }
    else if(S.driftState==='STRONG CALL COIL') { lbl='STR CALL'+dStr; cls='call'; }
    else if(S.driftState==='STRONG PUT COIL')  { lbl='STR PUT'+dStr;  cls='put'; }
    else if(S.driftState==='CALL COIL')        { lbl='CALL'+dStr; cls='call'; }
    else if(S.driftState==='PUT COIL')         { lbl='PUT'+dStr;  cls='put'; }
    else if(S.driftState==='CALL RELEASE')     { lbl='CALL ▶'+dStr; cls='call'; }
    else if(S.driftState==='PUT RELEASE')      { lbl='PUT ▶'+dStr;  cls='put'; }
    else if(S.driftState==='EXHAUSTED')        { lbl='EXHAUST'; cls='amber'; tint='tambr'; }
    else                                       { lbl='—'; cls='dim'; }
    envCell('env-drift', lbl, cls, tint);
  })();

  // ── HEC ────────────────────────────────────────────────────────
  (()=>{
    let lbl, cls, tint;
    if(S.hecState==='—'||S.hecState==='STABLE') {
      lbl = S.hecState==='STABLE' ? 'STABLE' : '—'; cls='stable';
    } else {
      const isCollapse = S.hecState.includes('COLLAPSE');
      const isCall     = S.hecState.includes('CALL');
      let nearWall = false;
      if(!isCollapse) {
        if(isCall&&S.gexLevels.cwall&&S.spyPrice){ nearWall=(S.gexLevels.cwall-S.spyPrice)>=0&&(S.gexLevels.cwall-S.spyPrice)<=3; }
        else if(!isCall&&S.gexLevels.pwall&&S.spyPrice){ nearWall=(S.spyPrice-S.gexLevels.pwall)>=0&&(S.spyPrice-S.gexLevels.pwall)<=3; }
        if(S.gxState==='MAGNET'||S.gxState==='PINNED') nearWall=true;
      }
      if(isCollapse)      { lbl=(isCall?'CALL':'PUT')+' COLL'; cls=isCall?'call':'put'; tint=isCall?'tcall':'tput'; }
      else if(nearWall)   { lbl=(isCall?'CALL':'PUT')+' ⚠';  cls='amber'; tint='tambr'; }
      else                { lbl=(isCall?'CALL':'PUT')+' WEAK'; cls=isCall?'call':'put'; }
    }
    envCell('env-hec', lbl, cls, tint);
  })();

  // ── GIA ────────────────────────────────────────────────────────
  (()=>{
    let lbl, cls, tint;
    if(S.giaState==='STRONG CALL ACCEL')      { lbl='STR CALL↑'; cls='call'; tint='tcall'; }
    else if(S.giaState==='CALL ACCEL')        { lbl='CALL↑';     cls='call'; }
    else if(S.giaState==='STRONG PUT ACCEL')  { lbl='STR PUT↓';  cls='put';  tint='tput'; }
    else if(S.giaState==='PUT ACCEL')         { lbl='PUT↓';      cls='put'; }
    else if(S.giaState==='BALANCED')          { lbl='BAL';       cls='stable'; }
    else                                      { lbl='—';         cls='dim'; }
    envCell('env-gia', lbl, cls, tint);
  })();

  // ── GX ─────────────────────────────────────────────────────────
  (()=>{
    let lbl, cls, tint;
    switch(S.gxState) {
      case 'TRANSFERRING': lbl='XFER'+(S.gxEmergingStrike?' →$'+S.gxEmergingStrike:''); cls='amber'; tint='tambr'; break;
      case 'BREAK':        lbl='BREAK'+(S.gxEmergingStrike?' →$'+S.gxEmergingStrike:''); cls='put'; tint='tput'; break;
      case 'VOID':         lbl='VOID'; cls='stable'; break;
      case 'MAGNET': {
        const d = S.spyPrice&&S.gxDominantStrike ? (S.spyPrice>S.gxDominantStrike?'↓':'↑') : '';
        lbl='MAGNET'+d+(S.gxDominantStrike?'$'+S.gxDominantStrike:''); cls='amber'; tint='tambr'; break;
      }
      case 'CONTESTED': lbl='CONTEST'+(S.gxEmergingStrike?' $'+S.gxEmergingStrike:''); cls='amber'; tint='tambr'; break;
      case 'PINNED':    lbl='PINNED $'+(S.gxDominantStrike||'—'); cls='stable'; break;
      default:          lbl='—'; cls='dim'; break;
    }
    envCell('env-gx', lbl, cls, tint);
  })();

  // ── ABSORP ─────────────────────────────────────────────────────
  (()=>{
    let lbl, cls, tint;
    switch(S.absorpState) {
      case 'CONFIRMING': lbl='CONFIRM'; cls='call'; tint='tcall'; break;
      case 'ABSORBING':  lbl='ABSORB';  cls='put';  tint='tput';  break;
      case 'CONVERGING': lbl='CONVERG'; cls='amber'; tint='tambr'; break;
      case 'READING':    lbl='READING'; cls='amber'; break;
      default:           lbl='—';      cls='dim';   break;
    }
    envCell('env-absorp', lbl, cls, tint);
  })();
}
