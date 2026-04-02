// ── render/header.js ─────────────────────────────────────────────
// Renders: price, VIX, VWAP, DRIFT, HEC, GIA, DSC, GX, COSMIC,
//          main signal state, status bar
// ─────────────────────────────────────────────────────────────────
import * as S from '../core/state.js';
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
  closeModal(); refreshPushUI(); if(window.startPolling) window.startPolling();
}
export function refreshPushUI() {
  const on=!!cfg.pushoverToken;
  document.getElementById('push-dot').className='sdot '+(on?'sg':'sr');
  document.getElementById('push-lbl').textContent=on?'Pushover ARMED':'Pushover off';
}

// ── Main render ───────────────────────────────────────────────────
export function renderHeader(comp, g1Norm, f1Norm) {
  const scoreCol=v=>v>0.4?'var(--green)':v<-0.4?'var(--red)':'var(--amber)';

  // Price
  if(S.spyPrice){
    const tick=S.prevSpyPrice?S.spyPrice>S.prevSpyPrice?'var(--green)':S.spyPrice<S.prevSpyPrice?'var(--red)':'var(--white)':'var(--white)';
    const pe=document.getElementById('h-price');
    pe.textContent=f(S.spyPrice,2); pe.style.color=tick;
    if(S.raw1m.length){
      const refPrice=S.prevClose||S.sessionOpenPrice||S.raw1m[0].o;
      const chg=S.spyPrice-refPrice;
      const ce=document.getElementById('h-chg');
      ce.textContent=' '+(chg>=0?'+':'')+chg.toFixed(2);
      ce.style.color=chg>=0?'var(--green)':'var(--red)';
    }
  }
  if(S.vixPrice){
    const vTick=S.prevVixPrice?S.vixPrice>S.prevVixPrice?'var(--red)':S.vixPrice<S.prevVixPrice?'var(--green)':'var(--dim)':'var(--dim)';
    const ve=document.getElementById('h-vix');
    ve.textContent=f(S.vixPrice,2); ve.style.color=vTick;
    if(S.prevVixPrice){
      const vc=document.getElementById('h-vix-chg');
      const vchg=S.vixPrice-S.prevVixPrice;
      vc.textContent=(vchg>=0?'+':'')+vchg.toFixed(2); vc.style.color=vTick;
    }
  }
  if(S.vwapVal) document.getElementById('h-vwap').textContent=f(S.vwapVal,2);

  // GEX levels legend
  document.getElementById('leg-cwall').textContent='CWall '+f(S.gexLevels.cwall,0);
  document.getElementById('leg-pwall').textContent='PWall '+f(S.gexLevels.pwall,0);

  // DRIFT
  const dre=document.getElementById('h-drift');
  if(dre){
    let dLbl,dCol,dSz='10px';
    const dAbs=Math.abs(S.driftDelta);
    const dSign=S.driftDelta>=0?'+':'-';
    const dStr=dAbs>0.01?' '+dSign+dAbs.toFixed(1):'';
    if(S.driftState==='SUPER CALL COIL'){ dLbl='SUPER ↑'+dStr; dCol='#00ff7f'; dSz='9px'; dre.style.animation='pulse 0.8s ease-in-out infinite'; }
    else if(S.driftState==='SUPER PUT COIL'){ dLbl='SUPER ↓'+dStr; dCol='#ff2050'; dSz='9px'; dre.style.animation='pulse 0.8s ease-in-out infinite'; }
    else {
      dre.style.animation='';
      if(S.driftState==='STRONG CALL COIL')  { dLbl='STR CALL'+dStr; dCol='var(--green)'; }
      else if(S.driftState==='STRONG PUT COIL'){ dLbl='STR PUT'+dStr; dCol='var(--red)'; }
      else if(S.driftState==='CALL COIL')    { dLbl='CALL COIL'+dStr; dCol='#3a8'; }
      else if(S.driftState==='PUT COIL')     { dLbl='PUT COIL'+dStr; dCol='#b44'; }
      else if(S.driftState==='CALL RELEASE') { dLbl='CALL ▶'+dStr; dCol='var(--green)'; }
      else if(S.driftState==='PUT RELEASE')  { dLbl='PUT ▶'+dStr; dCol='var(--red)'; }
      else if(S.driftState==='EXHAUSTED')    { dLbl='EXHAUST'; dCol='var(--amber)'; }
      else { dLbl='—'; dCol='var(--dim)'; }
    }
    dre.textContent=dLbl; dre.style.color=dCol; dre.style.fontSize=dSz;
    dre.title='Δ:'+S.driftDelta.toFixed(2)+' C:'+S.driftCallSlope.toFixed(2)+' P:'+S.driftPutSlope.toFixed(2)+' π:'+S.driftPriceSlope.toFixed(2);
  }

  // HEC
  const hece=document.getElementById('h-hec');
  if(hece){
    let hecLbl,hecCol,hecSz='10px';
    if(S.hecState==='—'||S.hecState==='STABLE'){ hecLbl=S.hecState==='STABLE'?'STABLE':'—'; hecCol='var(--dim)'; }
    else {
      const isCollapse=S.hecState.includes('COLLAPSE');
      const isCall=S.hecState.includes('CALL');
      let nearWall=false;
      if(!isCollapse){
        if(isCall&&S.gexLevels.cwall!==null&&S.spyPrice){ const wd=S.gexLevels.cwall-S.spyPrice; nearWall=wd>=0&&wd<=3; }
        else if(!isCall&&S.gexLevels.pwall!==null&&S.spyPrice){ const wd=S.spyPrice-S.gexLevels.pwall; nearWall=wd>=0&&wd<=3; }
        if(S.gxState==='MAGNET'||S.gxState==='PINNED') nearWall=true;
      }
      if(isCollapse){ hecLbl=(isCall?'CALL':'PUT')+' COLL'; hecCol=isCall?'#00ff7f':'#ff2050'; hecSz='9px'; }
      else if(nearWall){ hecLbl=(isCall?'CALL':'PUT')+' WEAK⚠'; hecCol='var(--amber)'; hecSz='9px'; }
      else { hecLbl=(isCall?'CALL':'PUT')+' WEAK'; hecCol=isCall?'#3a8':'#b44'; hecSz='9px'; }
    }
    hece.textContent=hecLbl; hece.style.color=hecCol; hece.style.fontSize=hecSz;
    hece.title='slope:'+S.hecSlope.toFixed(3)+' weak:'+S.hecWeakCount+' coll:'+S.hecCollapseCount;
  }

  // GIA
  const giae=document.getElementById('h-gia');
  if(giae){
    let giaLbl,giaCol,giaSz='10px';
    if(S.giaState==='STRONG CALL ACCEL')    { giaLbl='STR CALL↑'; giaCol='var(--green)'; giaSz='9px'; }
    else if(S.giaState==='CALL ACCEL')      { giaLbl='CALL↑'; giaCol='#3a8'; }
    else if(S.giaState==='STRONG PUT ACCEL'){ giaLbl='STR PUT↓'; giaCol='var(--red)'; giaSz='9px'; }
    else if(S.giaState==='PUT ACCEL')       { giaLbl='PUT↓'; giaCol='#b44'; }
    else if(S.giaState==='BALANCED')        { giaLbl='BAL'; giaCol='var(--dim2)'; giaSz='11px'; }
    else                                    { giaLbl='—'; giaCol='var(--dim)'; giaSz='14px'; }
    giae.textContent=giaLbl; giae.style.color=giaCol; giae.style.fontSize=giaSz;
    giae.title='accel:'+S.giaAccel.toFixed(3)+' dir:'+(S.giaDir>0?'CALL':S.giaDir<0?'PUT':'—');
  }

  // DSC
  const dsce=document.getElementById('h-dsc');
  if(dsce){
    let dscLbl,dscCol,dscSz='10px';
    const velArrow=S.dscVelocity>0.04?'↑':S.dscVelocity<-0.04?'↓':'';
    const scoreStr=S.dscScore>0.01?S.dscScore.toFixed(2):'';
    const dirPfx=S.dscDir>0?'C ':S.dscDir<0?'P ':'';
    if(S.dscPhase==='EXPANSION')      { dscLbl='EXPAND'+velArrow; dscCol='var(--amber)'; dscSz='9px'; }
    else if(S.dscPhase==='FAILURE')   { dscLbl=dirPfx+'FAIL '+scoreStr+velArrow; dscCol=S.dscDir>0?'#00ff7f':S.dscDir<0?'#ff2050':'var(--red)'; dscSz='9px'; }
    else if(S.dscPhase==='STRAIN')    { dscLbl=dirPfx+'STRAIN '+scoreStr+velArrow; dscCol=S.dscDir>0?'var(--green)':S.dscDir<0?'var(--red)':'var(--amber)'; dscSz='9px'; }
    else if(S.dscPhase==='BUILD')     { dscLbl='BUILD '+scoreStr+velArrow; dscCol='var(--dim2)'; }
    else                              { dscLbl='—'; dscCol='var(--dim)'; dscSz='14px'; }
    dsce.textContent=dscLbl; dsce.style.color=dscCol; dsce.style.fontSize=dscSz;
    dsce.title='score:'+S.dscScore.toFixed(3)+' vel:'+(S.dscVelocity>=0?'+':'')+S.dscVelocity.toFixed(3)+' drift:'+Math.abs(S.driftDelta).toFixed(2)+' f1:'+Math.abs(S.f1Score).toFixed(2)+' hec:'+Math.abs(S.hecSlope).toFixed(3);
  }

  // GX
  const gxe=document.getElementById('h-gx');
  if(gxe){
    let gxLbl,gxCol,gxSz='11px';
    switch(S.gxState){
      case 'TRANSFERRING': gxLbl='TRANSFER'+(S.gxEmergingStrike?' →$'+S.gxEmergingStrike:''); gxCol='#ff9500'; gxSz='10px'; break;
      case 'BREAK':        gxLbl='BREAK'+(S.gxEmergingStrike?' →$'+S.gxEmergingStrike:''); gxCol='#ff2050'; gxSz='10px'; break;
      case 'VOID':         gxLbl='VOID'; gxCol='var(--dim2)'; gxSz='13px'; break;
      case 'MAGNET':{
        const magDir=S.spyPrice>S.gxDominantStrike?'↓':'↑';
        gxLbl='MAGNET'+magDir+'$'+S.gxDominantStrike; gxCol='var(--amber)'; gxSz='10px'; break;
      }
      case 'CONTESTED': gxLbl='CONTEST'+(S.gxEmergingStrike?' $'+S.gxEmergingStrike:''); gxCol='var(--amber)'; gxSz='10px'; break;
      case 'PINNED':    gxLbl='PINNED $'+(S.gxDominantStrike||'—'); gxCol='var(--dim2)'; gxSz='10px'; break;
      default:          gxLbl='—'; gxCol='var(--dim)'; gxSz='18px';
    }
    if(S.gxEmergingTier&&S.gxState==='TRANSFERRING') gxLbl+=' '+S.gxEmergingTier.charAt(0);
    gxe.textContent=gxLbl; gxe.style.color=gxCol; gxe.style.fontSize=gxSz;
    gxe.title=S.gxDetail||'';
  }

  // COSMIC
  const cosmicBox=document.getElementById('cosmic-box');
  const cosmicEl=document.getElementById('h-cosmic');
  if(cosmicEl&&cosmicBox){
    if(S.cosmicState==='COSMIC PUT'||S.cosmicState==='COSMIC CALL'){
      const dir=S.cosmicState==='COSMIC PUT'?'PUT':'CALL';
      const tgt=S.cosmicTarget?'→$'+S.cosmicTarget:'';
      cosmicEl.textContent=dir+' '+tgt; cosmicEl.style.color='#ffd700'; cosmicEl.style.fontSize='10px';
      cosmicBox.classList.add('cosmic-active');
      const sp=document.getElementById('sig-state');
      if(sp&&!sp.dataset.cosmic){ sp.dataset.cosmic='1'; sp.style.textShadow='0 0 12px #ffd700'; }
    } else {
      cosmicEl.textContent='—'; cosmicEl.style.color='var(--dim)'; cosmicEl.style.fontSize='18px';
      cosmicBox.classList.remove('cosmic-active');
      const sp=document.getElementById('sig-state');
      if(sp){delete sp.dataset.cosmic; sp.style.textShadow='';}
    }
  }
}
