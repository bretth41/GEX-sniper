// ── core/config.js ───────────────────────────────────────────────
// All constants and runtime configuration.
// No compute. No DOM (except cfg load from localStorage).
// ─────────────────────────────────────────────────────────────────

export const CFG_KEY  = 'spy_sniper_v4';
export const ULOG_KEY = 'spy_sniper_unified_log';
export const ULOG_MAX = 5760; // 10 days × 390 min/day

export const POLL_MS  = 5000;    // fast poll: price, VIX, flow alerts
export const BARS_MS  = 60000;   // bars: ohlc/1m updates once per minute
export const LEVEL_MS = 30000;   // levels: GEX, greeks, net prem

export const WIN_SIGNAL_MS  = 10 * 60 * 1000; // 10 minutes
export const WIN_CONTEXT_MS = 30 * 60 * 1000; // 30 minutes
export const ALERT_CD       = 60000;           // 60s between pushover alerts
export const COSMIC_CD      = 4 * 60 * 60 * 1000; // 4-hour COSMIC cooldown

// GX constants
export const GX_N           = 10;      // track top 10 strikes
export const GX_HISTORY_MAX = 90;      // 90 readings × 30s = 45 minutes
export const GX_BREAK_DIST  = 1.00;    // $1 away from cluster = potential break
export const GX_BREAK_COUNT = 30;      // 30 readings × 30s = 15 min sustained
export const GX_REFRESH_MS  = 900000;  // refresh tracked strikes every 15 min

// Runtime config — loaded from localStorage, mutated by saveAndApply()
export const cfg = { proxyUrl:'', pushoverToken:'', pushoverUser:'' };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY)||'{}')); } catch(e){}
