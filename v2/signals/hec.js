// ── signals/hec.js ───────────────────────────────────────────────
// Hedging Exhaustion Composite.
// v2 fixes:
//   1. DTE-weighted VOI inputs: each row's VOI contribution
//      multiplied by dteW before slope calculation.
//   2. 2-bar confirmation on state upgrades: STABLE→WEAK requires
//      2 consecutive bars, WEAK→COLLAPSE requires 2 consecutive.
//      State can downgrade in one bar.
//   3. 0DTE distinction: when dominant contributing DTE < 0.5,
//      state label gets a (0D) suffix for log analysis.
// ─────────────────────────────────────────────────────────────────
import * as S from '../core/state.js';
import { etDateStr } from '../core/utils.js';

export function computeHEC() {
  try {
    const now   = Date.now();
    const today = etDateStr();

    if(S.hecSessionDate !== today) {
      S.hecSessionDate  = today;
      S.hecRatioHist    = [];
      S.hecState        = '—'; S.hecDir = 0; S.hecSlope = 0;
      S.hecWeakCount    = 0;   S.hecCollapseCount = 0;
      S.hecRatioMax     = 1;
      // Confirmation counters
      S.hecWeakConfirm     = 0;
      S.hecCollapseConfirm = 0;
    }

    const FIVE_MIN_MS = 300000;
    let deltaS5 = 0;
    if(S.todayBars.length >= 2) {
      const cutoff5 = now - FIVE_MIN_MS;
      const bar5    = S.todayBars.filter(b => b.t * 1000 >= cutoff5);
      if(bar5.length >= 2)
        deltaS5 = Math.abs(bar5[bar5.length - 1].c - bar5[0].o);
      else if(S.todayBars.length >= 2)
        deltaS5 = Math.abs(
          S.todayBars[S.todayBars.length - 1].c -
          S.todayBars[S.todayBars.length - 2].c
        );
    }
    const dS = Math.max(deltaS5, 0.10);

    const nearPrice = S.spyPrice || 0;
    const NEAR = $ => Math.abs(parseFloat($.strike || 0) - nearPrice) <= 5;

    // ── DTE-weighted VOI accumulation ─────────────────────────────
    // Each row contributes its VOI scaled by dteW.
    // 0DTE VOI counts at 0.55x; 1DTE at 1.0x; etc.
    function voiFromRows(rows) {
      let cVoi = 0, pVoi = 0;
      let cWt  = 0, pWt  = 0;
      let avgDteSum = 0, avgDteWt = 0;

      rows.forEach(row => {
        if(!NEAR(row)) return;
        const type = String(row.type || '').toLowerCase();
        const voi  = parseFloat(row.volume_oi_ratio) || 0;
        if(voi <= 0) return;
        // Use dteW if available (annotated rows), else default 1.0
        const w = row.dteW !== undefined ? row.dteW : 1.0;
        if(type === 'call') { cVoi += voi * w; cWt += w; }
        else if(type === 'put') { pVoi += voi * w; pWt += w; }
        avgDteSum += (row.dte || 0) * w;
        avgDteWt  += w;
      });

      return {
        callVOI: cWt  > 0 ? cVoi / cWt  : 0,
        putVOI:  pWt  > 0 ? pVoi / pWt  : 0,
        n:       cWt  + pWt,
        avgDte:  avgDteWt > 0 ? avgDteSum / avgDteWt : 0,
      };
    }

    const v0 = voiFromRows(S.f1FlowRows); // 0-10DTE weighted rows
    let callVOI = v0.callVOI, putVOI = v0.putVOI, avgDte = v0.avgDte;

    // Supplement with 1-2DTE rows if near-price data is thin
    if(v0.n < 3 && window._hecAll1DTE) {
      const v1 = voiFromRows(window._hecAll1DTE);
      callVOI  = callVOI > 0 ? (callVOI + v1.callVOI * 0.70) / 2 : v1.callVOI * 0.70;
      putVOI   = putVOI  > 0 ? (putVOI  + v1.putVOI  * 0.70) / 2 : v1.putVOI  * 0.70;
    }

    const avgVOI = (callVOI + putVOI) / 2 || 0;
    const ratio  = (S.deltaAtRisk > 0 && avgVOI > 0)
      ? (S.deltaAtRisk * avgVOI) / dS : 0;

    S.hecRatioMax = Math.max(S.hecRatioMax, ratio, 1);
    S.hecRatioHist.push({ ts: now, ratio, callVOI, putVOI, avgDte });

    const cutoffHist = now - FIVE_MIN_MS - 30000;
    S.hecRatioHist   = S.hecRatioHist.filter(r => r.ts > cutoffHist);

    if(S.hecRatioHist.length < 3) { S.hecState = '—'; return; }

    // ── Slope calculation ─────────────────────────────────────────
    const win = S.hecRatioHist.slice(-5);
    const n   = win.length;
    const sumX  = n * (n - 1) / 2;
    const sumY  = win.reduce((s, r) => s + r.ratio, 0);
    const sumXY = win.reduce((s, r, i) => s + i * r.ratio, 0);
    const sumX2 = win.reduce((s, _, i) => s + i * i, 0);
    const rawSlope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
    S.hecSlope = Math.max(-1, Math.min(1, rawSlope / Math.max(S.hecRatioMax, 1)));

    // ── Direction ─────────────────────────────────────────────────
    if(S.hecRatioHist.length >= 4) {
      const w4     = S.hecRatioHist.slice(-4);
      const cSlope = (w4[w4.length - 1].callVOI - w4[0].callVOI) / 4;
      const pSlope = (w4[w4.length - 1].putVOI  - w4[0].putVOI)  / 4;
      if(Math.abs(cSlope) > 0.1 || Math.abs(pSlope) > 0.1)
        S.hecDir = cSlope < pSlope ? 1 : -1;
      if(Math.abs(cSlope - pSlope) < 0.05 && S.driftPriceSlope !== 0)
        S.hecDir = S.driftPriceSlope > 0 ? 1 : -1;
    }

    // ── 2-bar confirmation counters ───────────────────────────────
    const WEAK_THRESH      = -0.08;
    const COLLAPSE_THRESH  = -0.22;
    const WEAK_REQUIRED    = 3;   // bars for persistent weak reading
    const COLLAPSE_REQUIRED = 5;  // bars for collapse
    const CONFIRM_UPGRADE   = 2;  // bars of same signal before upgrade

    if(S.hecSlope < COLLAPSE_THRESH) {
      S.hecCollapseConfirm = Math.min(((S.hecCollapseConfirm||0)) + 1, CONFIRM_UPGRADE + 2);
      S.hecWeakConfirm     = Math.min((S.hecWeakConfirm || 0)     + 1, CONFIRM_UPGRADE + 2);
      S.hecCollapseCount   = Math.min(S.hecCollapseCount + 1, COLLAPSE_REQUIRED + 5);
      S.hecWeakCount       = Math.min(S.hecWeakCount     + 1, WEAK_REQUIRED     + 5);
    } else if(S.hecSlope < WEAK_THRESH) {
      S.hecWeakConfirm     = Math.min((S.hecWeakConfirm || 0) + 1, CONFIRM_UPGRADE + 2);
      S.hecCollapseConfirm = Math.max(0, (S.hecCollapseConfirm || 0) - 1);
      S.hecWeakCount       = Math.min(S.hecWeakCount + 1, WEAK_REQUIRED + 5);
      S.hecCollapseCount   = Math.max(0, S.hecCollapseCount - 1);
    } else {
      // Recovering — decrement counts, reset confirm counters
      S.hecWeakConfirm     = 0;
      S.hecCollapseConfirm = 0;
      S.hecWeakCount       = Math.max(0, S.hecWeakCount     - 1);
      S.hecCollapseCount   = Math.max(0, S.hecCollapseCount - 1);
    }

    const priceMoving  = Math.abs(S.driftPriceSlope) > 0.10;
    const driftActive  = S.driftState !== '—' && S.driftState !== 'EXHAUSTED';
    const weakGate     = priceMoving || driftActive;
    const collapseGate = priceMoving && driftActive;

    // Upgrades require 2-bar confirmation; downgrades immediate
    const canCollapse = S.hecCollapseCount >= COLLAPSE_REQUIRED &&
                        collapseGate &&
                        (S.hecCollapseConfirm || 0) >= CONFIRM_UPGRADE;
    const canWeak     = S.hecWeakCount >= WEAK_REQUIRED &&
                        weakGate &&
                        (S.hecWeakConfirm || 0) >= CONFIRM_UPGRADE;

    // ── Average DTE of current readings ──────────────────────────
    const recentAvgDte = S.hecRatioHist.length > 0
      ? S.hecRatioHist.slice(-3).reduce((s, r) => s + (r.avgDte || 0), 0) /
        Math.min(3, S.hecRatioHist.length)
      : 1;
    // 0DTE suffix when dominant flow is nearly all same-day
    const dteSuffix = recentAvgDte < 0.5 ? ' (0D)' : '';

    const dirLabel = S.hecDir > 0 ? 'CALL' : 'PUT';
    if(canCollapse)       S.hecState = dirLabel + ' COLLAPSE' + dteSuffix;
    else if(canWeak)      S.hecState = dirLabel + ' WEAK'     + dteSuffix;
    else                  S.hecState = 'STABLE';

  } catch(e) { S.hecState = '—'; S.hecDir = 0; S.hecSlope = 0; }
}
