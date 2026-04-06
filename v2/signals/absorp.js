// ── signals/absorp.js ────────────────────────────────────────────
// Absorption signal — reads DTE-weighted premium flow.
// v2 fix: cA/cB/pA/pB accumulators now multiply each row's premium
// by row.dteW so near-expiry 0DTE cheap premium doesn't dominate.
// Minimum notional threshold added: if weighted total is too thin,
// ABSORP returns — rather than firing on noise.
// ─────────────────────────────────────────────────────────────────
import { state as S } from '../core/state.js';
import { clamp } from '../core/utils.js';

// Minimum DTE-weighted notional to produce a non-— reading
const MIN_WEIGHTED_NOTIONAL = 15000;

export function computeAbsorp() {
  try {
    const isDirectional = S.sigState === 'STRONG_CALL' || S.sigState === 'STRONG_PUT'
                       || S.sigState === 'CALL'        || S.sigState === 'PUT';
    if(!isDirectional) {
      S.absorpState      = '—'; S.absorpArrow = '';
      S.absorpSigDir     = 0;   S.absorpStateEntryTs = 0;
      S.absorpCandidate  = '';
      return;
    }

    const newAbsorpDir = S.sigState === 'STRONG_CALL' || S.sigState === 'CALL' ? 1 : -1;
    if(S.absorpSigDir !== 0 && S.absorpSigDir !== newAbsorpDir) {
      S.absorpRawHist = []; S.absorpPriceHist = []; S.absorpFastPrem = [];
      S.absorpStateEntryTs = 0; S.absorpCandidate = '';
    }
    S.absorpSigDir = newAbsorpDir;
    const sd = S.absorpSigDir;

    if(S.absorpPriceHist.length < 4 || S.absorpFastPrem.length < 4) {
      S.absorpState = 'READING'; S.absorpArrow = ''; return;
    }

    // ── DTE-weighted fast prem snapshot (built in updateUI Step 4) ─
    // The fast prem array is already built from DTE-weighted rows
    // in updateUI.js (Step 4). No change needed here — it inherits
    // the DTE weighting applied at the fetch layer.

    // ── 15-min DTE-weighted premium accumulators ──────────────────
    // Each row's ask/bid contribution multiplied by dteW.
    const nowMs = Date.now();
    let cA = 0, pA = 0, cB = 0, pB = 0;
    let totalWeightedNotional = 0;
    S.f1FlowRows.forEach(row => {
      const t = new Date(row.created_at || 0).getTime();
      if(nowMs - t > 900000) return; // 15-min window
      const type = String(row.type || '').toLowerCase();
      const w    = row.dteW || 0;
      if(w <= 0) return;
      const ask  = Math.max(0, parseFloat(row.total_ask_side_prem) || 0) * w;
      const bid  = Math.max(0, parseFloat(row.total_bid_side_prem) || 0) * w;
      totalWeightedNotional += ask + bid;
      if(type === 'call')      { cA += ask; cB += bid; }
      else if(type === 'put')  { pA += ask; pB += bid; }
    });

    // Minimum notional guard — if weighted flow is too thin, hold current
    // state or return READING rather than firing on noise.
    if(totalWeightedNotional < MIN_WEIGHTED_NOTIONAL) {
      if(!S.absorpState || S.absorpState === '—') S.absorpState = 'READING';
      S.absorpArrow = '';
      return;
    }

    const fp = S.absorpFastPrem.slice(-6);
    const pp = S.absorpPriceHist.slice(-6);
    const premSlope  = (fp[fp.length - 1] - fp[0]) * sd;
    const priceSlope = (pp[pp.length - 1] - pp[0]) * sd;

    let convScore = 0;
    if(priceSlope < -0.03 && premSlope >  0.05) convScore =  1;
    else if(priceSlope >  0.03 && premSlope >  0.05) convScore =  2;
    else if(priceSlope < -0.03 && premSlope <= -0.05) convScore = -1;

    let barScore = 0;
    if(S.raw1m.length >= 3 && S.atrVal) {
      const last3  = S.raw1m.slice(-3);
      const avgRng = last3.reduce((s, b) => s + (b.h - b.l), 0) / 3;
      const lb     = last3[last3.length - 1];
      if(avgRng < S.atrVal * 0.5)                                     barScore = -1;
      else if(lb.h - lb.l > S.atrVal * 0.8 && (lb.c > lb.o ? 1 : -1) === sd) barScore =  1;
    }

    const rawScore = clamp(premSlope * 2 + convScore * 2 + barScore, -4, 4);
    S.absorpRawHist  = [...S.absorpRawHist, rawScore].slice(-6);
    S.absorpRawScore = rawScore;

    const rh  = S.absorpRawHist;
    const roc = rh.length >= 3 ? rh[rh.length - 1] - rh[0] : 0;
    S.absorpArrow = roc > 0.3 ? '↑' : roc < -0.3 ? '↓' : '';

    let candidate;
    if(rawScore >= 2)      candidate = 'CONFIRMING';
    else if(rawScore >= 0) candidate = 'CONVERGING';
    else                   candidate = 'ABSORBING';

    const nowMsTs = Date.now();
    const absRoc  = Math.abs(roc);

    if(S.absorpState === 'CONFIRMING' && candidate === 'ABSORBING' && rawScore > -1.5)
      candidate = 'CONVERGING';

    let requiredMs;
    if(candidate === S.absorpState) {
      requiredMs = 0;
    } else {
      const stateRank = { ABSORBING: 0, CONVERGING: 1, CONFIRMING: 2 };
      const curRank   = stateRank[S.absorpState] ?? 1;
      const newRank   = stateRank[candidate]      ?? 1;
      const goingDown = newRank < curRank;
      const fromConfirming = S.absorpState === 'CONFIRMING';
      if(goingDown && fromConfirming)     requiredMs = absRoc > 0.8 ? 30000 : 45000;
      else if(goingDown)                  requiredMs = absRoc > 0.5 ? 20000 : 30000;
      else if(candidate === 'CONFIRMING') requiredMs = absRoc > 0.5 ? 15000 : 20000;
      else                                requiredMs = absRoc > 0.5 ? 15000 : absRoc > 0.2 ? 20000 : 25000;
    }

    if(candidate !== S.absorpCandidate) {
      S.absorpCandidate    = candidate;
      S.absorpStateEntryTs = nowMsTs;
    }
    if(nowMsTs - S.absorpStateEntryTs >= requiredMs) S.absorpState = S.absorpCandidate;

  } catch(e) { S.absorpState = '—'; S.absorpArrow = ''; }
}
