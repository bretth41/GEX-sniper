// ── fetch/flowAlerts.js ──────────────────────────────────────────
// DTE weighting: continuous 0-10 scale applied at ingestion.
// All downstream signals receive pre-weighted flow rows.
// ─────────────────────────────────────────────────────────────────
import * as S from '../core/state.js';
import { cfg } from '../core/config.js';
import { etDateStr, setDot } from '../core/utils.js';

// ── DTE weight function ───────────────────────────────────────────
// Called once per row at ingestion. Returns multiplier 0.0–1.0.
// Peak at 1DTE (most conviction + immediacy). 0DTE discounted for
// noise. Tapers to 0 beyond 10DTE.
export function dteWeight(dte) {
  if(dte <= 0)  return 0.55;
  if(dte === 1) return 1.00;
  if(dte === 2) return 0.90;
  if(dte === 3) return 0.75;
  if(dte <= 5)  return 0.55;
  if(dte <= 7)  return 0.40;
  if(dte <= 10) return 0.25;
  return 0.00; // >10DTE excluded
}

// ── Compute DTE from expiry string ───────────────────────────────
export function rowDte(row, todayStr) {
  if(!row.expiry) return 0;
  return Math.max(0, Math.round(
    (new Date(row.expiry) - new Date(todayStr)) / 86400000
  ));
}

export async function fetchFlowAlerts() {
  if(!cfg.proxyUrl) return;
  const nowMs = Date.now();
  const WINDOW = 3600000; // 60-min lookback

  try {
    const r = await fetch(
      cfg.proxyUrl + '/uw/api/option-trades/flow-alerts?ticker_symbol=SPY&limit=50'
    );
    if(!r.ok) { setDot('ds-uw', false); return; }
    const d    = await r.json();
    const rows = Array.isArray(d.data) ? d.data : [];
    const todayStr = etDateStr();

    // ── Annotate every row with dte + dteW at ingestion ───────────
    // All downstream signals read row.dte and row.dteW instead of
    // computing from expiry themselves.
    const annotated = rows.map(row => {
      const dte  = rowDte(row, todayStr);
      const dteW = dteWeight(dte);
      return { ...row, dte, dteW };
    });

    // ── Flow rows for signals — 0-10DTE, DTE-weighted ─────────────
    // Replaces f1FlowRows (previously 0DTE only).
    // Each row carries .dte and .dteW for downstream use.
    S.f1FlowRows = annotated.filter(row => row.dte <= 10 && row.dteW > 0);

    // ── Legacy HEC 1-2DTE window (now uses annotated rows) ────────
    window._hecAll1DTE = annotated.filter(row => row.dte >= 1 && row.dte <= 2);

    // ── Sweep accumulation — continuous DTE weighting ─────────────
    function scoreSweeps(sweepRows) {
      return sweepRows
        .filter(row =>
          row.has_sweep &&
          row.dteW > 0 &&
          (nowMs - new Date(row.created_at || 0).getTime()) <= WINDOW
        )
        .map(row => {
          const type = String(row.type || '').toLowerCase();
          const dir  = type === 'call' ? 1 : type === 'put' ? -1 : 0;
          if(dir === 0) return null;
          const t       = new Date(row.created_at || 0).getTime();
          const ageMin  = (nowMs - t) / 60000;
          const recency = Math.max(0, 1 - ageMin / 60);
          const prem    = Math.max(0, parseFloat(row.total_premium) || 0);
          // Premium tier score
          const sw = prem < 50000   ? 0.25
                   : prem < 200000  ? 0.50
                   : prem < 750000  ? 0.75
                   : prem < 2000000 ? 0.90 : 1.00;
          // VOI factor — thresholds scale with DTE
          // Higher DTE → more open interest → higher VOI thresholds
          const voiOpen  = 2 + row.dte * 0.5;
          const voiMixed = 6 + row.dte * 1.5;
          const voiVal   = parseFloat(row.volume_oi_ratio) || 0;
          const voiFactor = voiVal < voiOpen  ? 1.0
                           : voiVal < voiMixed ? 0.5 : 0.1;
          const strike = parseFloat(row.strike) || 0;
          return {
            dir,
            // DTE weight applied here — the core change
            score: sw * recency * voiFactor * row.dteW,
            strike,
            prem,
            ts:    t,
            dte:   row.dte,
            dteW:  row.dteW,
            voi:   voiVal,
            voiFactor,
            expiry: row.expiry,
          };
        })
        .filter(s => s && s.score > 0 && s.dir !== 0);
    }

    // All sweeps across 0-10DTE, weighted
    const allSweeps = scoreSweeps(S.f1FlowRows);

    // ── Weighted average DTE of active sweeps ─────────────────────
    // Replaces f1DteTier (discrete bin) with a continuous readout.
    // Displayed in UI as "avg DTE" so you see what the score is anchored to.
    if(allSweeps.length > 0) {
      const totalScore = allSweeps.reduce((a, s) => a + s.score, 0);
      const wtdDte     = allSweeps.reduce((a, s) => a + s.dte * s.score, 0) / totalScore;
      S.f1AvgDte = +wtdDte.toFixed(1);
      // Legacy tier field: approximate from avg DTE for log display
      S.f1DteTier = wtdDte < 0.5 ? 0 : wtdDte < 1.5 ? 1 : 2;
    } else {
      S.f1AvgDte  = 0;
      S.f1DteTier = 0;
    }

    // ── Accumulate sweeps into f1SweepAccum ──────────────────────
    if(allSweeps.length > 0) {
      const callSc = allSweeps.filter(s => s.dir >  0).reduce((a, s) => a + s.score, 0);
      const putSc  = allSweeps.filter(s => s.dir < 0).reduce((a, s) => a + s.score, 0);
      const domDir = callSc >= putSc ? 1 : -1;
      const domSc  = Math.max(callSc, putSc);

      // Flip protection: require new direction to beat old by 60%
      if(S.f1SweepAccum.dir !== 0 &&
         S.f1SweepAccum.dir !== domDir &&
         domSc > S.f1SweepAccum.score * 0.6) {
        S.f1SweepAccum = { dir: 0, score: 0, count: 0, sweeps: [] };
      }

      const aligned = allSweeps.filter(s => s.dir === domDir);
      if(aligned.length > 0) {
        // Strike clustering bonus
        const buckets = {};
        aligned.forEach(s => {
          const b = Math.round(s.strike * 2) / 2;
          buckets[b] = (buckets[b] || 0) + 1;
        });
        const maxCluster   = Math.max(...Object.values(buckets));
        const strikeBonus  = maxCluster >= 3 ? 1.40 : maxCluster >= 2 ? 1.25 : 1.00;
        S.f1SweepAccum = {
          dir:    domDir,
          sweeps: aligned,
          count:  aligned.length,
          score:  Math.min(2.0, aligned.reduce((a, s) => a + s.score, 0) * strikeBonus),
        };
      }
    } else {
      S.f1DteTier = 0;
      // Slow decay when no sweeps — don't hard-reset
      S.f1SweepAccum.score = Math.max(0, S.f1SweepAccum.score * 0.98);
      if(S.f1SweepAccum.score < 0.05)
        S.f1SweepAccum = { dir: 0, score: 0, count: 0, sweeps: [] };
    }

    setDot('ds-uw', true);
  } catch(e) { /* network fail — accum state unchanged */ }
}
