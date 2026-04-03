// ── core/updateUI.js ─────────────────────────────────────────────
// Orchestration only. No signal logic. No fetch logic. No direct DOM.
// Compute order is fixed — do not reorder without understanding dependencies.
// ─────────────────────────────────────────────────────────────────
import { state as S } from './state.js';
import { cfg, ULOG_KEY, POLL_MS, BARS_MS, LEVEL_MS } from './config.js';
import { clamp, etNow, etDateStr, f, setDot, setStale } from './utils.js';

// ── Signals ───────────────────────────────────────────────────────
import { computeATR }                         from '../signals/atr.js';
import { computeRQ }                          from '../signals/rq.js';
import { computeG1 }                          from '../signals/g1.js';
import { computeF1 }                          from '../signals/f1.js';
import { computeWX, mapWxCompScore }          from '../signals/wx.js';
import { computeSignal }                      from '../signals/signal.js';
import { computeAbsorp }                      from '../signals/absorp.js';
import { computeTrap, computeTrapMicro }      from '../signals/trap.js';
import { computeMicro }                       from '../signals/micro.js';
import { computeDrift }                       from '../signals/drift.js';
import { computeHEC }                         from '../signals/hec.js';
import { computeGIA }                         from '../signals/gia.js';
import { computeDSC }                         from '../signals/dsc.js';
import { computeGX }                          from '../signals/gx.js';
import { computeCosmic }                      from '../signals/cosmic.js';

// ── Fetch ─────────────────────────────────────────────────────────
import { fetchBars }       from '../fetch/bars.js';
import { fetchPrice }      from '../fetch/price.js';
import { fetchMacro }      from '../fetch/macro.js';
import { fetchFlowAlerts } from '../fetch/flowAlerts.js';
import { fetchUWLevels }   from '../fetch/levels.js';

// ── Render ────────────────────────────────────────────────────────
import { updateChart, updatePriceLines, drawGex, setTf as _setTf, zoom as _zoom } from '../render/chart.js';
import { renderHeader, openModal, closeModal, bgClick, saveAndApply, refreshPushUI } from '../render/header.js';
import { renderCards }                        from '../render/cards.js';
import { logUnified, fillForwardPrices, renderUnifiedLog, copyUnifiedLog, clearUnifiedLog } from '../render/log.js';
import { toggleLog, openFullscreen, closeFullscreen } from '../render/log.js';

// ── Expose globals for inline onclick handlers ────────────────────
window.setTf           = _setTf;
window.zoom            = _zoom;
window.openModal       = openModal;
window.closeModal      = closeModal;
window.bgClick         = bgClick;
window.saveAndApply    = saveAndApply;
window.refreshPushUI   = refreshPushUI;
window.copyUnifiedLog  = copyUnifiedLog;
window.clearUnifiedLog = clearUnifiedLog;
window.toggleLog       = toggleLog;
window.openFullscreen  = openFullscreen;
window.closeFullscreen = closeFullscreen;
// startPolling exposed after definition (below)

// ─────────────────────────────────────────────────────────────────
export function updateUI() {

  // ── Step 1: ATR + RQ + G1 + F1 ───────────────────────────────
  computeATR();
  computeRQ();
  computeG1();
  computeF1();

  // ── Step 2: WX before computeSignal ──────────────────────────
  computeWX();
  mapWxCompScore();

  // ── Step 3: Signal state machine ─────────────────────────────
  computeSignal();

  // ── Step 4: ABSORP fast prem snapshots ───────────────────────
  if(S.spyPrice) S.absorpPriceHist = [...S.absorpPriceHist, S.spyPrice].slice(-12);
  (() => {
    const cutoff = Date.now() - 300000;
    let cA=0, pA=0, cB=0, pB=0, hasData=false;
    S.f1FlowRows.forEach(row => {
      const t    = new Date(row.created_at||0).getTime();
      if(t < cutoff) return;
      const type = String(row.type||'').toLowerCase();
      const ask  = Math.max(0, parseFloat(row.total_ask_side_prem)||0);
      const bid  = Math.max(0, parseFloat(row.total_bid_side_prem)||0);
      if(ask>0||bid>0) hasData=true;
      if(type==='call'){cA+=ask;cB+=bid;} else if(type==='put'){pA+=ask;pB+=bid;}
    });
    const total = Math.abs(cA-cB) + Math.abs(pA-pB);
    const premVal = hasData&&total>0 ? ((cA-cB)-(pA-pB))/total
                                      : S.f1SweepAccum.dir * Math.min(S.f1SweepAccum.score/2, 1);
    S.absorpFastPrem = [...S.absorpFastPrem, premVal].slice(-12);
  })();

  // ── Step 5: Observers ────────────────────────────────────────
  computeAbsorp();
  computeTrap();
  computeMicro();
  computeTrapMicro();
  computeDrift();
  computeHEC();
  computeGIA();
  computeGX();
  computeCosmic();

  // ── Step 6: COMP — G1(42%) + F1(38%) + WX(20%) ──────────────
  const g1Norm    = clamp(S.g1Score*(1+S.g1Coil*0.3), -1, 1);
  const coilAmp   = 1 + S.g1Coil*0.5;
  const f1Norm    = clamp(S.f1Score*coilAmp/2, -1, 1);
  const wxNorm    = clamp(S.wxCompScore, -1, 1);
  const baseComp  = g1Norm*0.42 + f1Norm*0.38 + wxNorm*0.20;
  const g1Dir3    = Math.sign(g1Norm), f1Dir3=Math.sign(f1Norm), wxDir3=Math.sign(wxNorm);
  const allSame   = g1Dir3!==0 && g1Dir3===f1Dir3 && g1Dir3===wxDir3;
  const twoSame   = !allSame && ((g1Dir3===f1Dir3&&g1Dir3!==0)||(g1Dir3===wxDir3&&g1Dir3!==0)||(f1Dir3===wxDir3&&f1Dir3!==0));
  const agreeFact = allSame ? 1.35 : twoSame ? 1.15 : 1.00;
  const f1Conv    = 0.70 + Math.min(S.f1SweepAccum.score/2.0, 1.0)*0.30;
  const nowMs     = Date.now();
  const ageMin    = S.sigFreshSweepTs>0 ? (nowMs-S.sigFreshSweepTs)/60000 : 60;
  const freshFact = S.sigFreshSweepTs>0 ? Math.max(0.10, 1.0-ageMin/22.0) : 0.65;
  let comp = clamp(baseComp * agreeFact * f1Conv * freshFact, -2, 2);
  S.liveComp = comp;

  // ── Step 7: DSC needs liveComp ───────────────────────────────
  computeDSC();

  // ── Step 8: rqDir from comp direction ────────────────────────
  S.rqDir = comp>0.15 ? 1 : comp<-0.15 ? -1 : 0;

  // ── Step 9: Render ───────────────────────────────────────────
  renderHeader(comp, g1Norm, f1Norm);
  renderCards(comp);
  updateChart(false);
  updatePriceLines();
  drawGex();
  fillForwardPrices();
  renderUnifiedLog();

  // Heartbeat (null-safe — elements not in new HTML)
  const sbTime = document.getElementById('sb-time');
  const sbBars = document.getElementById('sb-bars');
  if(sbTime) sbTime.textContent = new Date().toLocaleTimeString();
  if(sbBars) sbBars.textContent = S.bars.length ? S.bars.length+' bars' : 'NO DATA';
  if(S.lastUpdate) setStale(Date.now()-S.lastUpdate > 15000);

  try {
    localStorage.setItem('spy_sniper_hb', JSON.stringify({
      ts: Date.now(), sig: S.sigState,
      hm: (etNow().getHours()+etNow().getMinutes()/60).toFixed(2),
      logCount: (() => { try{ return JSON.parse(localStorage.getItem(ULOG_KEY)||'[]').length; }catch(e){ return -1; } })()
    }));
  } catch(e){}

  // KV state save (throttled 30s)
  _kvSaveThrottle();
}

// ─────────────────────────────────────────────────────────────────
// KV State Persistence
// ─────────────────────────────────────────────────────────────────
let _kvLastSave = 0;
const KV_SAVE_INTERVAL = 30000;

function _kvSaveThrottle() {
  const now = Date.now();
  if(now - _kvLastSave < KV_SAVE_INTERVAL) return;
  _kvLastSave = now;
  _saveStateToKV();
}

async function _saveStateToKV() {
  if(!cfg.proxyUrl || !S.spyPrice) return;
  try {
    const snapshot = {
      ts:S.spyPrice&&Date.now(),
      sigState:S.sigState, liveComp:S.liveComp,
      g1Score:S.g1Score, g1Dir:S.g1Dir, g1Status:S.g1Status,
      f1Score:S.f1Score, f1Dir:S.f1Dir, f1Status:S.f1Status, f1SweepAccum:S.f1SweepAccum,
      wxState:S.wxState, wxCompScore:S.wxCompScore,
      driftState:S.driftState, driftDelta:S.driftDelta,
      hecState:S.hecState, hecSlope:S.hecSlope,
      giaState:S.giaState, giaAccel:S.giaAccel,
      dscPhase:S.dscPhase, dscScore:S.dscScore, dscVelocity:S.dscVelocity, dscDir:S.dscDir,
      gxState:S.gxState, gxDominantStrike:S.gxDominantStrike, gxEmergingStrike:S.gxEmergingStrike,
      cosmicState:S.cosmicState, cosmicTarget:S.cosmicTarget,
      spyPrice:S.spyPrice, vixPrice:S.vixPrice, gexLevels:S.gexLevels
    };
    await fetch(cfg.proxyUrl+'/state', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(snapshot)
    });
  } catch(e){}
}

export async function loadStateFromKV() {
  if(!cfg.proxyUrl) return;
  try {
    const resp = await fetch(cfg.proxyUrl+'/state');
    if(!resp.ok) return;
    const snap = await resp.json();
    if(!snap||!snap.ts) return;
    const ageHours = (Date.now()-snap.ts)/3600000;
    if(ageHours > 8) return;
    if(snap.sigState)    S.sigState    = snap.sigState;
    if(snap.liveComp)    S.liveComp    = snap.liveComp;
    if(snap.g1Score)     S.g1Score     = snap.g1Score;
    if(snap.g1Dir)       S.g1Dir       = snap.g1Dir;
    if(snap.g1Status)    S.g1Status    = snap.g1Status;
    if(snap.f1Score)     S.f1Score     = snap.f1Score;
    if(snap.f1Dir)       S.f1Dir       = snap.f1Dir;
    if(snap.f1Status)    S.f1Status    = snap.f1Status;
    if(snap.f1SweepAccum) S.f1SweepAccum=snap.f1SweepAccum;
    if(snap.wxState)     S.wxState     = snap.wxState;
    if(snap.wxCompScore) S.wxCompScore = snap.wxCompScore;
    if(snap.driftState)  S.driftState  = snap.driftState;
    if(snap.driftDelta)  S.driftDelta  = snap.driftDelta;
    if(snap.hecState)    S.hecState    = snap.hecState;
    if(snap.hecSlope)    S.hecSlope    = snap.hecSlope;
    if(snap.giaState)    S.giaState    = snap.giaState;
    if(snap.giaAccel)    S.giaAccel    = snap.giaAccel;
    if(snap.dscPhase)    S.dscPhase    = snap.dscPhase;
    if(snap.dscScore)    S.dscScore    = snap.dscScore;
    if(snap.dscVelocity) S.dscVelocity = snap.dscVelocity;
    if(snap.dscDir)      S.dscDir      = snap.dscDir;
    if(snap.gxState)     S.gxState     = snap.gxState;
    if(snap.gxDominantStrike) S.gxDominantStrike=snap.gxDominantStrike;
    if(snap.gxEmergingStrike) S.gxEmergingStrike=snap.gxEmergingStrike;
    if(snap.cosmicState) S.cosmicState = snap.cosmicState;
    if(snap.cosmicTarget)S.cosmicTarget= snap.cosmicTarget;
    if(snap.spyPrice)    S.spyPrice    = snap.spyPrice;
    if(snap.vixPrice)    S.vixPrice    = snap.vixPrice;
    if(snap.gexLevels)   S.gexLevels   = snap.gexLevels;
    try { renderHeader(S.liveComp,0,0); renderCards(S.liveComp); } catch(e){}
    console.log('[KV] restored age:'+ageHours.toFixed(1)+'h sig:'+snap.sigState);
  } catch(e){}
}

// ─────────────────────────────────────────────────────────────────
export function startPolling() {
  if(S.pollTimer)  clearInterval(S.pollTimer);
  if(S.levelTimer) clearInterval(S.levelTimer);
  if(!cfg.proxyUrl) return;

  const runFast   = async () => { await Promise.allSettled([fetchPrice(), fetchMacro(), fetchFlowAlerts()]); updateUI(); };
  const runBars   = async () => { await fetchBars();      updateUI(); };
  const runLevels = async () => { await fetchUWLevels();  updateUI(); };

  runBars().then(() => { runFast(); runLevels(); });
  S.pollTimer    = setInterval(runFast,   POLL_MS);
  S.levelTimer   = setInterval(runBars,   BARS_MS);
  setInterval(runLevels, LEVEL_MS);
  S.stateLogTimer = setInterval(logUnified, 60000);
  setTimeout(logUnified, 15000);
}
window.startPolling = startPolling;
