// ── signals/wx.js ────────────────────────────────────────────────
// Price action / EMA rejection signal.
// v2 fixes:
//   1. Directional hysteresis: direction flip requires 3 bars in
//      neutral zone before reversing. Eliminates single-bar flips.
//   2. 3-bar EMA on wxCompScore: prevents wick-driven score spikes
//      from producing full label reversals.
//   3. GO! threshold tightening: GO! requires score sustained ≥0.75
//      for ≥2 of last 3 bars, not just a momentary spike.
// ─────────────────────────────────────────────────────────────────
import * as S from '../core/state.js';
import { WIN_SIGNAL_MS } from '../core/config.js';

const EMA_ALPHA = 0.45;  // ~3-bar lag
const NEUTRAL_BARS_REQUIRED = 3; // bars in neutral before direction flip allowed

export function computeWX() {
  try {
    S.wxScore = 0;
    const nowMs = Date.now();
    const bars  = S.raw1m.filter(b => (nowMs - b.t * 1000) <= WIN_SIGNAL_MS);

    if(!S.ema8Val || !S.atrVal || bars.length < 3) {
      S.wxState = '—'; S.wxDir = 0; S.wxRejectCount = 0;
      S.wxWickSpread = null; S.wxClusterPrice = null; S.wxCompression = false;
      return;
    }

    const EMA_PROXIMITY = 0.0008;
    const bearRej = [], bullRej = [];
    bars.forEach(b => {
      const range = b.h - b.l; if(range < 0.001) return;
      const emaTol = S.ema8Val * EMA_PROXIMITY;
      if(b.h >= (S.ema8Val - emaTol) && b.c < S.ema8Val)
        bearRej.push({ tip: b.h, wickLen: b.h - Math.max(b.o, b.c) });
      if(b.l <= (S.ema8Val + emaTol) && b.c > S.ema8Val)
        bullRej.push({ tip: b.l, wickLen: Math.min(b.o, b.c) - b.l });
    });

    S.wxRejectCount = 0; S.wxDir = 0; S.wxWickSpread = null;
    S.wxClusterPrice = null; S.wxCompression = false;

    const rejs = bearRej.length >= bullRej.length ? bearRej : bullRej;
    if(rejs.length < 2) { S.wxState = '—'; return; }

    const candidateDir = rejs === bearRej ? -1 : 1;
    S.wxRejectCount    = rejs.length;

    // ── Directional hysteresis ────────────────────────────────────
    // Track how many bars we've been in neutral since last direction.
    if(!S.wxNeutralBarCount || typeof S.wxNeutralBarCount !== 'number') S.wxNeutralBarCount = 0;
    if(S.wxLockedDir === undefined) S.wxLockedDir = 0;

    if(candidateDir !== S.wxLockedDir) {
      // Candidate wants to flip. Only allow if we've been neutral
      // for enough bars.
      if(S.wxNeutralBarCount >= NEUTRAL_BARS_REQUIRED) {
        S.wxLockedDir       = candidateDir;
        S.wxNeutralBarCount = 0;
      }
      // else: stay on locked direction until neutrality satisfied
    } else {
      S.wxNeutralBarCount = 0; // reset counter when direction matches
    }

    // When bar data shows no rejections, increment neutral count
    if(rejs.length < 2) S.wxNeutralBarCount++;
    S.wxDir = S.wxLockedDir !== 0 ? S.wxLockedDir : candidateDir;

    // ── Cluster + score calculation ───────────────────────────────
    const tips   = rejs.map(r => r.tip).sort((a, b) => a - b);
    const mid    = Math.floor(tips.length / 2);
    const median = tips.length % 2 === 0
      ? (tips[mid - 1] + tips[mid]) / 2 : tips[mid];
    S.wxClusterPrice = median;

    const devs    = tips.map(t => Math.abs(t - median));
    const avgDev  = devs.reduce((s, v) => s + v, 0) / devs.length;
    const worstDev = Math.max(...devs);
    S.wxWickSpread = Math.max(...tips) - Math.min(...tips);

    const precFactor  = avgDev < 0.03 ? 3.0 : avgDev < 0.08 ? 2.5
                      : avgDev < 0.15 ? 1.5 : avgDev < 0.20 ? 1.0 : 0.4;
    const worstPenalty = worstDev <= 0.04 ? 1.0 : worstDev <= 0.08 ? 0.80
                       : worstDev <= 0.15 ? 0.45 : worstDev <= 0.25 ? 0.15 : 0.03;
    const countScore  = Math.pow(S.wxRejectCount, 1.3);

    if(rejs.length >= 3) {
      const half       = Math.floor(rejs.length / 2);
      const firstLens  = rejs.slice(0, half).map(r => r.wickLen);
      const secondLens = rejs.slice(-half).map(r => r.wickLen);
      const avgFirst   = firstLens.reduce((s, v) => s + v, 0) / firstLens.length;
      const avgSecond  = secondLens.reduce((s, v) => s + v, 0) / secondLens.length;
      S.wxCompression  = avgSecond < avgFirst * 0.80;
    }

    const comprBonus = S.wxCompression ? 1.25 : 1.0;
    S.wxScore = +(countScore * precFactor * worstPenalty * comprBonus).toFixed(1);

    // ── GO! threshold: require sustained conviction ───────────────
    // Track last 3 raw scores to gate GO! entry.
    if(!Array.isArray(S.wxScoreHist)) S.wxScoreHist = [];
    try { S.wxScoreHist.push(S.wxScore); } catch(e) {}
    const wxHist = Array.isArray(S.wxScoreHist) ? S.wxScoreHist : [];
    if(wxHist.length > 3) try { S.wxScoreHist.shift(); } catch(e) {}

    // GO! requires current score ≥14 AND at least 2 of last 3 bars ≥8
    const recentStrong = (Array.isArray(S.wxScoreHist) ? S.wxScoreHist : []).filter(v => v >= 8).length;
    const goAllowed    = S.wxScore >= 14 && recentStrong >= 2;

    // ── Label assignment ─────────────────────────────────────────
    S.wxPrevState = S.wxState;
    let candidate;

    if(S.wxScore <= 0.5 || S.wxRejectCount < 2)
      candidate = S.wxScore > 0 && S.wxRejectCount >= 2 ? 'WATCH' : '—';
    else if(S.wxScore < 3)   candidate = 'WATCH';
    else if(S.wxScore < 8)   candidate = S.wxDir < 0 ? 'PUT SETUP'   : 'CALL SETUP';
    else if(S.wxScore < 14)  candidate = S.wxDir < 0 ? 'STRONG PUT'  : 'STRONG CALL';
    else if(goAllowed)       candidate = S.wxDir < 0 ? 'GO! PUT'     : 'GO! CALL';
    else                     candidate = S.wxDir < 0 ? 'STRONG PUT'  : 'STRONG CALL'; // hold at STRONG until sustained

    // Extended state when rejections clear
    if((S.wxPrevState === 'PUT SETUP'   || S.wxPrevState === 'CALL SETUP'  ||
        S.wxPrevState === 'STRONG PUT'  || S.wxPrevState === 'STRONG CALL' ||
        S.wxPrevState === 'GO! PUT'     || S.wxPrevState === 'GO! CALL') &&
       S.wxRejectCount < 2) {
      candidate = 'EXTENDED';
    }

    // ── Hysteresis guard on direction flip ────────────────────────
    // If candidate wants to flip direction vs prevState, only allow
    // if neutral bar count is satisfied.
    const prevDir = S.wxPrevState.includes('PUT')  ? -1
                  : S.wxPrevState.includes('CALL') ?  1 : 0;
    const newDir  = candidate.includes('PUT')  ? -1
                  : candidate.includes('CALL') ?  1 : 0;
    if(prevDir !== 0 && newDir !== 0 && prevDir !== newDir &&
       S.wxNeutralBarCount < NEUTRAL_BARS_REQUIRED) {
      // Force through WATCH/EXTENDED before allowing flip
      candidate = 'WATCH';
    }

    S.wxState = candidate;

  } catch(e) { S.wxState = '—'; S.wxDir = 0; S.wxScore = 0; }
}

// ── mapWxCompScore ────────────────────────────────────────────────
// Apply 3-bar EMA to wxCompScore before it reaches COMP and signal.
// Prevents a single-bar WX spike from swinging COMP.
export function mapWxCompScore() {
  let raw;
  switch(S.wxState) {
    case 'GO! CALL':    raw =  1.00; break;
    case 'STRONG CALL': raw =  0.75; break;
    case 'CALL SETUP':  raw =  0.50; break;
    case 'GO! PUT':     raw = -1.00; break;
    case 'STRONG PUT':  raw = -0.75; break;
    case 'PUT SETUP':   raw = -0.50; break;
    case 'EXTENDED':
      raw = S.wxPrevState && S.wxPrevState.includes('PUT')  ? -0.25
          : S.wxPrevState && S.wxPrevState.includes('CALL') ?  0.25 : 0.00;
      break;
    default: raw = 0.00;
  }

  // 3-bar EMA on the comp score
  if(typeof S.wxCompScoreEma !== 'number' || isNaN(S.wxCompScoreEma)) S.wxCompScoreEma = raw;
  S.wxCompScoreEma = S.wxCompScoreEma + 0.45 * (raw - S.wxCompScoreEma);
  S.wxCompScore    = +S.wxCompScoreEma.toFixed(3);
}
