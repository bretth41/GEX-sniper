// ── core/state.js ────────────────────────────────────────────────
// Single source of truth for ALL mutable state.
// Exported as a single mutable object — properties are writable from any module.
// Usage in every module:
//   import { state as S } from '../core/state.js';
//   S.g1Score = 1.2;  // works — mutating an object property, not a binding
// ─────────────────────────────────────────────────────────────────

export const state = {

  // ── PRICE & BARS ────────────────────────────────────────────────
  raw1m: [],
  bars:  [],
  tf:    1,
  todayBars:        [],
  spyPrice:         null,
  prevSpyPrice:     null,
  vwapVal:          null,
  lastUpdate:       null,
  prevClose:        null,
  sessionOpenPrice: null,
  lastBarDate:      '',
  ema8Val:          null,
  ema21Val:         null,
  ema8PrevVal:      null,

  // ── VIX ─────────────────────────────────────────────────────────
  vixPrice:     null,
  prevVixPrice: null,
  vixHistory:   [],

  // ── GEX LEVELS ──────────────────────────────────────────────────
  gexLevels:    { cwall:null, pwall:null },
  gammaRegime:  0,
  gpdImbalance: 0,
  gexProfile:   [],
  totalNetGex:  null,

  // ── ATR ─────────────────────────────────────────────────────────
  atrVal:     null,
  atrHistory: [],

  // ── RQ ──────────────────────────────────────────────────────────
  rqState:      'NEUTRAL',
  rqDir:        0,
  rqScore:      0,
  rqStatus:     'CALIBRATING',
  rqCandleHist: [],

  // ── G1 ──────────────────────────────────────────────────────────
  netDealerDelta:   0,
  deltaAtRisk:      0,
  g1CoilMax:        0,
  g1StructuralMax:  1,
  g1IntradayDelta:  0,
  g1IntradayMax:    1,
  g1TideFactor:     0.90,
  g1CurrentFactor:  1.10,
  g1VolStore:       {},
  g1VolSessionDate: '',
  g1VolMax:         1,
  g1Dir:            0,
  g1Coil:           0,
  g1Score:          0,
  g1Status:         '—',

  // ── F1 ──────────────────────────────────────────────────────────
  f1FlowRows:    [],
  f1SweepAccum:  { dir:0, score:0, count:0, sweeps:[] },
  f1PriorSession:null,
  f1SessionDate: '',
  f1DteTier:     0,
  f1Dir:         0,
  f1Strength:    0,
  f1Score:       0,
  f1Status:      'WATCHING',

  // ── NET PREMIUM ─────────────────────────────────────────────────
  netPrem:     0,
  netPremHist: [],

  // ── WX ──────────────────────────────────────────────────────────
  wxCompScore:    0,
  wxState:        '—',
  wxDir:          0,
  wxRejectCount:  0,
  wxWickSpread:   null,
  wxClusterPrice: null,
  wxCompression:  false,
  wxPrevState:    '—',
  wxScore:        0,

  // ── ABSORP ──────────────────────────────────────────────────────
  absorpState:        '—',
  absorpArrow:        '',
  absorpRawScore:     0,
  absorpRawHist:      [],
  absorpStateEntryTs: 0,
  absorpCandidate:    '',
  absorpSigDir:       0,
  absorpPriceHist:    [],
  absorpFastPrem:     [],

  // ── TRAP ────────────────────────────────────────────────────────
  trapState:      'NEUTRAL',
  trapDetail:     '',
  trapArrow:      '',
  trapRawScore:   0,
  trapRawHist:    [],
  trapDwellCount: 0,
  trapCandidate:  'NEUTRAL',
  trapMicroState: 'NEUTRAL',

  // ── MICRO ───────────────────────────────────────────────────────
  microState:      '—',
  microArrow:      '',
  microRunHist:    [],
  microDwellCount: 0,
  microCandidate:  '—',

  // ── DRIFT ───────────────────────────────────────────────────────
  driftState:       '—',
  driftCallSlope:   0,
  driftPutSlope:    0,
  driftDelta:       0,
  driftPriceSlope:  0,
  driftPrevState:   '—',
  driftDetectTs:    0,
  driftDetectDir:   0,
  driftPremHist:    [],
  driftCallMax:     1,
  driftPutMax:      1,
  driftSessionDate: '',

  // ── HEC ─────────────────────────────────────────────────────────
  hecState:         '—',
  hecDir:           0,
  hecSlope:         0,
  hecRatioHist:     [],
  hecWeakCount:     0,
  hecCollapseCount: 0,
  hecSessionDate:   '',
  hecRatioMax:      1,

  // ── GIA ─────────────────────────────────────────────────────────
  giaState:       '—',
  giaDir:         0,
  giaAccel:       0,
  giaImbalHist:   [],
  giaSessionDate: '',
  giaImbalMax:    1,
  gxNearHist:     [],

  // ── DSC ─────────────────────────────────────────────────────────
  dscScore:          0,
  dscScorePrev:      0,
  dscVelocity:       0,
  dscPhase:          '—',
  dscDir:            0,
  dscExpansionArmed: false,
  dscScoreHist:      [],
  dscSessionDate:    '',

  // ── GX ──────────────────────────────────────────────────────────
  gxState:             '—',
  gxDetail:            '',
  gxDominantStrike:    null,
  gxEmergingStrike:    null,
  gxEmergingTier:      '',
  gxBreakCount:        0,
  gxSessionStrikes:    [],
  gxSessionDate:       '',
  gxStrikeHistory:     {},
  gxStrikeHistoryTs:   [],
  gxDomPeak:           {},
  gxLastRefreshTs:     0,
  gxAnchoredWithPrice: false,

  // ── SIGNAL STATE MACHINE ─────────────────────────────────────────
  sigState:          'NEUTRAL',
  sigDir:            0,
  sigCount:          0,
  sigLock:           0,
  liveComp:          0,
  sigLastFireDir:    0,
  sigLastFireTs:     0,
  sigFirePrice:      null,
  sigFreshSweepTs:   0,
  sigRawSweepTs:     0,
  sigStalePollCount: 0,
  sigHasBeenNeutral: true,
  trapFirstTs:       0,
  microFirstTs:      0,
  prevTrapState:     'NEUTRAL',
  prevMicroState:    '—',

  // ── ALERTS ──────────────────────────────────────────────────────
  lastAlertTs: 0,

  // ── COSMIC ──────────────────────────────────────────────────────
  cosmicState:      '—',
  cosmicPrevState:  '—',
  cosmicLastFireTs: 0,
  cosmicTarget:     null,

  // ── CHART / POLLING ─────────────────────────────────────────────
  chart:          null,
  cs:             null,
  e8s:            null,
  e21s:           null,
  vws:            null,
  plines:         [],
  lastBarCount:   0,
  pollTimer:      null,
  levelTimer:     null,
  stateLogTimer:  null,
};
