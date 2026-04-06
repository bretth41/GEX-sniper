// ── signals/cosmic.js ────────────────────────────────────────────
// COSMIC: all-signals-aligned confirmation event.
// v2 fixes:
//   1. Threshold raised to 5/7 (was 4/7).
//   2. Strong dissenter veto: any voter at maximum opposition
//      blocks COSMIC regardless of vote count.
//   3. 2-bar confirmation: must achieve 5/7 for 2 consecutive
//      bars before firing.
//   4. G1 peg exclusion: if G1 hasn't moved in 30+ bars,
//      it's measuring long-dated structure not conviction —
//      exclude it from voting (treat as abstain).
// ─────────────────────────────────────────────────────────────────
import * as S from '../core/state.js';
import { COSMIC_CD } from '../core/config.js';
import { pushCosmicAlert } from '../fetch/alerts.js';
import { logCosmicFire } from '../render/log.js';

const COSMIC_THRESHOLD   = 5;  // raised from 4 to 5
const CONFIRM_BARS_NEEDED = 2;  // must hold 5/7 for 2 consecutive bars
const G1_PEG_BARS         = 30; // bars without movement = structural peg

export function computeCosmic() {
  try {
    const now = Date.now();

    // ── G1 peg detection ─────────────────────────────────────────
    // If G1 score hasn't varied by more than 0.05 in 30+ bars,
    // it's anchored to long-dated structure. Exclude from voting.
    if(!S.cosmicG1ScoreHist) S.cosmicG1ScoreHist = [];
    S.cosmicG1ScoreHist.push(S.g1Score);
    if(S.cosmicG1ScoreHist.length > G1_PEG_BARS + 5)
      S.cosmicG1ScoreHist.shift();

    let g1Pegged = false;
    if(S.cosmicG1ScoreHist.length >= G1_PEG_BARS) {
      const recent = S.cosmicG1ScoreHist.slice(-G1_PEG_BARS);
      const rMin   = Math.min(...recent);
      const rMax   = Math.max(...recent);
      g1Pegged     = (rMax - rMin) < 0.10; // less than 0.10 variation in 30 bars
    }

    // ── Build voter list ─────────────────────────────────────────
    const votes = [];

    // G1: only vote if not pegged
    if(!g1Pegged && Math.abs(S.g1Score) >= 0.5)
      votes.push({ sig: 'G1', dir: S.g1Score > 0 ? 1 : -1,
                   strength: Math.abs(S.g1Score) });

    // F1: sweep accum must have meaningful score
    if(S.f1SweepAccum.score >= 0.3 && S.f1SweepAccum.dir !== 0)
      votes.push({ sig: 'F1', dir: S.f1SweepAccum.dir,
                   strength: S.f1SweepAccum.score });

    // WX: use smoothed wxCompScore (after EMA in mapWxCompScore)
    if(S.wxCompScore >= 0.50)
      votes.push({ sig: 'WX', dir:  1, strength:  S.wxCompScore });
    else if(S.wxCompScore <= -0.50)
      votes.push({ sig: 'WX', dir: -1, strength: -S.wxCompScore });

    // DRIFT
    if(S.driftState.includes('CALL') && !S.driftState.includes('EXHAUST'))
      votes.push({ sig: 'DRIFT', dir:  1, strength: Math.abs(S.driftDelta) });
    else if(S.driftState.includes('PUT') && !S.driftState.includes('EXHAUST'))
      votes.push({ sig: 'DRIFT', dir: -1, strength: Math.abs(S.driftDelta) });

    // HEC: collapse only (WEAK is not strong enough for COSMIC)
    if(S.hecState.includes('COLLAPSE')) {
      if(S.hecState.includes('CALL'))
        votes.push({ sig: 'HEC', dir:  1, strength: Math.abs(S.hecSlope) });
      else if(S.hecState.includes('PUT'))
        votes.push({ sig: 'HEC', dir: -1, strength: Math.abs(S.hecSlope) });
    }

    // GIA
    if(S.giaDir !== 0 && S.giaState !== 'BALANCED' && S.giaState !== '—')
      votes.push({ sig: 'GIA', dir: S.giaDir, strength: Math.abs(S.giaAccel) });

    // DSC
    if(S.dscDir !== 0 && (S.dscPhase === 'STRAIN' || S.dscPhase === 'FAILURE'))
      votes.push({ sig: 'DSC', dir: S.dscDir, strength: S.dscScore });

    // ── Tally ─────────────────────────────────────────────────────
    const callVotes = votes.filter(v => v.dir ===  1);
    const putVotes  = votes.filter(v => v.dir === -1);

    // Determine candidate direction (must have more votes than opposing)
    let cosmicDir = '';
    let alignedVotes = [], opposingVotes = [];
    if(callVotes.length >= COSMIC_THRESHOLD && callVotes.length > putVotes.length) {
      cosmicDir     = 'CALL';
      alignedVotes  = callVotes;
      opposingVotes = putVotes;
    } else if(putVotes.length >= COSMIC_THRESHOLD && putVotes.length > callVotes.length) {
      cosmicDir     = 'PUT';
      alignedVotes  = putVotes;
      opposingVotes = callVotes;
    }

    let allMet = cosmicDir !== '';

    // ── Strong dissenter veto ─────────────────────────────────────
    // Any voter at maximum opposition blocks COSMIC.
    // "Maximum opposition" = voter is producing its strongest
    // possible counter-signal against the proposed direction.
    if(allMet) {
      // Check non-voting signals for strong opposition
      const proposedDir = cosmicDir === 'CALL' ? 1 : -1;

      // G1 veto (if not pegged)
      if(!g1Pegged && S.g1Dir === -proposedDir && Math.abs(S.g1Score) >= 1.5) {
        allMet = false;
      }
      // F1 veto
      if(S.f1SweepAccum.dir === -proposedDir && S.f1SweepAccum.score >= 0.8) {
        allMet = false;
      }
      // WX veto — the key fix for April 6
      if(proposedDir === 1  && S.wxCompScore  <= -0.90) allMet = false;
      if(proposedDir === -1 && S.wxCompScore  >=  0.90) allMet = false;
      // Drift veto — strong opposing drift
      if(proposedDir === 1  && S.driftState.includes('PUT')  &&
         (S.driftState.includes('SUPER') || S.driftState.includes('STRONG')))
        allMet = false;
      if(proposedDir === -1 && S.driftState.includes('CALL') &&
         (S.driftState.includes('SUPER') || S.driftState.includes('STRONG')))
        allMet = false;
    }

    // ── 2-bar confirmation ────────────────────────────────────────
    // COSMIC must hold its threshold for 2 consecutive bars before firing.
    if(!S.cosmicConfirmCount) S.cosmicConfirmCount = 0;
    if(!S.cosmicConfirmDir)   S.cosmicConfirmDir   = '';

    if(allMet && cosmicDir !== '') {
      if(S.cosmicConfirmDir === cosmicDir) {
        S.cosmicConfirmCount++;
      } else {
        // Direction changed or new — restart confirmation
        S.cosmicConfirmDir   = cosmicDir;
        S.cosmicConfirmCount = 1;
      }
    } else {
      // Not meeting threshold — reset confirmation
      S.cosmicConfirmDir   = '';
      S.cosmicConfirmCount = 0;
    }

    const confirmed = allMet && S.cosmicConfirmCount >= CONFIRM_BARS_NEEDED;

    // ── Fire / maintain state ─────────────────────────────────────
    const cooledDown = (now - S.cosmicLastFireTs) > COSMIC_CD;
    const newState   = confirmed && cooledDown ? 'COSMIC ' + cosmicDir : '—';

    if(newState !== '—' && S.cosmicPrevState === '—') {
      S.cosmicLastFireTs = now;
      S.cosmicTarget     = S.gxEmergingStrike;
      const sigList      = alignedVotes.map(v => v.sig).join('+');
      const tgt          = S.gxEmergingStrike ? '→$' + S.gxEmergingStrike : '';
      const g1Note       = g1Pegged ? ' [G1 excl-pegged]' : '';
      pushCosmicAlert(cosmicDir, tgt, sigList + ' (' + alignedVotes.length + '/7)' + g1Note);
      logCosmicFire(newState);
    }

    S.cosmicState     = newState;
    S.cosmicPrevState = newState;

  } catch(e) { S.cosmicState = '—'; }
}
