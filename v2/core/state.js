// ── core/state.js ────────────────────────────────────────────────
// Single source of truth for ALL mutable state.
// Fetch functions write here. Compute functions read and write here.
// Render functions read here. Nothing else touches state.
// ─────────────────────────────────────────────────────────────────

// ── PRICE & BARS ──────────────────────────────────────────────────
export let raw1m = [];
export let bars  = [];
export let tf    = 1;
export let todayBars      = [];   // today's 1-min bars — used by computeATR and DSC
export let spyPrice       = null;
export let prevSpyPrice   = null;
export let vwapVal        = null;
export let lastUpdate     = null;

export let prevClose      = null; // prior session close
export let sessionOpenPrice = null;
export let lastBarDate    = '';

export let ema8Val        = null;
export let ema21Val       = null;
export let ema8PrevVal    = null;

// ── VIX ───────────────────────────────────────────────────────────
export let vixPrice       = null;
export let prevVixPrice   = null;
export let vixHistory     = [];

// ── GEX LEVELS ───────────────────────────────────────────────────
export let gexLevels      = { cwall:null, pwall:null };
export let gammaRegime    = 0;
export let gpdImbalance   = 0;
export let gexProfile     = [];
export let totalNetGex    = null;

// ── ATR ───────────────────────────────────────────────────────────
export let atrVal         = null;
export let atrHistory     = [];

// ── RQ — Regime Quality ───────────────────────────────────────────
export let rqState        = 'NEUTRAL'; // TRENDING, RANGING, STRESS
export let rqDir          = 0;          // composite direction for log
export let rqScore        = 0;
export let rqStatus       = 'CALIBRATING';
export let rqCandleHist   = [];

// ── G1 — Dealer Delta ─────────────────────────────────────────────
export let netDealerDelta   = 0;
export let deltaAtRisk      = 0;
export let g1CoilMax        = 0;
export let g1StructuralMax  = 1;
export let g1IntradayDelta  = 0;
export let g1IntradayMax    = 1;
export let g1TideFactor     = 0.90;
export let g1CurrentFactor  = 1.10;
export let g1VolStore       = {};
export let g1VolSessionDate = '';
export let g1VolMax         = 1;
export let g1Dir            = 0;
export let g1Coil           = 0;
export let g1Score          = 0;
export let g1Status         = '—';

// ── F1 — Flow Intelligence ────────────────────────────────────────
export let f1FlowRows     = [];
export let f1SweepAccum   = { dir:0, score:0, count:0, sweeps:[] };
export let f1PriorSession = null;
export let f1SessionDate  = '';
export let f1DteTier      = 0;  // 0=0DTE, 1=added 1DTE, 2=added 2DTE
export let f1Dir          = 0;
export let f1Strength     = 0;
export let f1Score        = 0;
export let f1Status       = 'WATCHING';

// ── NET PREMIUM ───────────────────────────────────────────────────
export let netPrem        = 0;
export let netPremHist    = [];

// ── WX — Wick Exhaustion ─────────────────────────────────────────
export let wxCompScore    = 0;   // -1 to +1, mapped from wxState for COMP
export let wxState        = '—';
export let wxDir          = 0;
export let wxRejectCount  = 0;
export let wxWickSpread   = null;
export let wxClusterPrice = null;
export let wxCompression  = false;
export let wxPrevState    = '—';
export let wxScore        = 0;

// ── ABSORP ────────────────────────────────────────────────────────
export let absorpState        = '—';
export let absorpArrow        = '';
export let absorpRawScore     = 0;
export let absorpRawHist      = [];
export let absorpStateEntryTs = 0;
export let absorpCandidate    = '';
export let absorpSigDir       = 0;
export let absorpPriceHist    = [];
export let absorpFastPrem     = [];

// ── TRAP ──────────────────────────────────────────────────────────
export let trapState      = 'NEUTRAL';
export let trapDetail     = '';
export let trapArrow      = '';
export let trapRawScore   = 0;
export let trapRawHist    = [];
export let trapDwellCount = 0;
export let trapCandidate  = 'NEUTRAL';
export let trapMicroState = 'NEUTRAL'; // DANGER, WARNING, CLEAR, NEUTRAL

// ── MICRO ─────────────────────────────────────────────────────────
export let microState     = '—';
export let microArrow     = '';
export let microRunHist   = [];
export let microDwellCount= 0;
export let microCandidate = '—';

// ── DRIFT — Call/Put Divergence vs Price ──────────────────────────
export let driftState      = '—';
export let driftCallSlope  = 0;
export let driftPutSlope   = 0;
export let driftDelta      = 0;
export let driftPriceSlope = 0;
export let driftPrevState  = '—';
export let driftDetectTs   = 0;
export let driftDetectDir  = 0;
export let driftPremHist   = [];
export let driftCallMax    = 1;
export let driftPutMax     = 1;
export let driftSessionDate= '';

// ── HEC — Hedge Efficiency Collapse ──────────────────────────────
export let hecState        = '—';
export let hecDir          = 0;
export let hecSlope        = 0;
export let hecRatioHist    = [];
export let hecWeakCount    = 0;
export let hecCollapseCount= 0;
export let hecSessionDate  = '';
export let hecRatioMax     = 1;

// ── GIA — Gamma Imbalance Acceleration ───────────────────────────
export let giaState        = '—';
export let giaDir          = 0;
export let giaAccel        = 0;
export let giaImbalHist    = [];
export let giaSessionDate  = '';
export let giaImbalMax     = 1;
export let gxNearHist      = []; // per-cycle ±$5 gamma snapshot for GIA

// ── DSC — Dealer Stress Curve ─────────────────────────────────────
export let dscScore           = 0;
export let dscScorePrev       = 0;
export let dscVelocity        = 0;
export let dscPhase           = '—'; // BUILD / STRAIN / FAILURE / EXPANSION / —
export let dscDir             = 0;   // 1=call stress, -1=put stress
export let dscExpansionArmed  = false;
export let dscScoreHist       = [];
export let dscSessionDate     = '';

// ── GX — GEX Gravity ─────────────────────────────────────────────
export let gxState            = '—';
export let gxDetail           = '';
export let gxDominantStrike   = null;
export let gxEmergingStrike   = null;
export let gxEmergingTier     = '';
export let gxBreakCount       = 0;
export let gxSessionStrikes   = [];
export let gxSessionDate      = '';
export let gxStrikeHistory    = {};
export let gxStrikeHistoryTs  = [];
export let gxDomPeak          = {};
export let gxLastRefreshTs    = 0;
export let gxAnchoredWithPrice= false;

// ── SIGNAL STATE MACHINE ──────────────────────────────────────────
export let sigState           = 'NEUTRAL';
export let sigDir             = 0;
export let sigCount           = 0;
export let sigLock            = 0;
export let liveComp           = 0; // composite score — read by logSignalFire
export let sigLastFireDir     = 0;
export let sigLastFireTs      = 0;
export let sigFirePrice       = null;
export let sigFreshSweepTs    = 0;
export let sigRawSweepTs      = 0;
export let sigStalePollCount  = 0;
export let sigHasBeenNeutral  = true;
export let trapFirstTs        = 0;
export let microFirstTs       = 0;
export let prevTrapState      = 'NEUTRAL';
export let prevMicroState     = '—';

// ── ALERTS ────────────────────────────────────────────────────────
export let lastAlertTs        = 0;

// ── COSMIC ───────────────────────────────────────────────────────
export let cosmicState        = '—';
export let cosmicPrevState    = '—';
export let cosmicLastFireTs   = 0;
export let cosmicTarget       = null;

// ── CHART / POLLING ───────────────────────────────────────────────
export let chart              = null;
export let cs                 = null; // candlestick series
export let e8s                = null; // EMA8 series
export let e21s               = null; // EMA21 series
export let vws                = null; // VWAP series
export let plines             = [];
export let lastBarCount       = 0;
export let pollTimer          = null;
export let levelTimer         = null;
export let stateLogTimer      = null;

// ── SETTERS ───────────────────────────────────────────────────────
// ES module exports are live bindings — reassignment requires setters
// when values need to be mutated by other modules.
// Pattern: each module imports state and reassigns directly.
// Example: import * as S from '../core/state.js'; S.g1Score = 1.2;
//
// This works because ES module namespace objects allow property assignment
// on exported `let` bindings from the same module graph.
// All modules share the same live state object.
