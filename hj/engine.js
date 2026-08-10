/* Jamie.Quant engine — vanilla ES5, zero dependencies, browser + node.
   Direct port of the Python (numpy/pandas) reference engine.

   The seeded RNG is numpy's own — SeedSequence, PCG64, the 256-level ziggurat,
   Lemire's bounded integers — so `synth` and the bootstrap draw the same
   numbers the desk draws, and the browser answers the same question the same
   way. See nprandom.js, which must load first. The one known deviation is a
   tail draw about once in 750,000 landing 1 ULP away, because V8's log1p and
   the platform's log1p round the last bit differently.

   mulberry32 is kept only for callers that want a cheap seeded stream and do
   not care about matching Python.
*/
(function (root) {
"use strict";

var ANN = 252;                 // PERIODS["daily"]
var TWO_PI = 6.283185307179586;
var EULER = 0.5772156649;      // Euler-Mascheroni, used by the deflated Sharpe

/* ------------------------------------------------------------------ utils */

function num(v, dflt) {
  var x = +v;
  return (x === x && x !== Infinity && x !== -Infinity) ? x : dflt;
}
function finite(x) { return x === x && x !== Infinity && x !== -Infinity; }

/* pandas .dropna(): scalar metrics ignore missing bars entirely rather than
   propagating NaN through sums. Leading rolling-window / pct_change warm-up
   NaNs therefore never poison a metric. */
function clean(a) {
  var out = [], i, v, n = a ? a.length : 0;
  for (i = 0; i < n; i++) { v = +a[i]; if (finite(v)) out.push(v); }
  return out;
}
function clampInt(v, dflt, lo, hi) {
  var x = Math.round(num(v, dflt));
  if (x < lo) x = lo;
  if (x > hi) x = hi;
  return x;
}
function sign(x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }

function pctChange(x, k) {
  var n = x.length, out = new Array(n), i, prev;
  for (i = 0; i < n; i++) {
    if (i < k) { out[i] = NaN; continue; }
    prev = +x[i - k];
    out[i] = (prev === 0 || !finite(prev)) ? NaN : (+x[i]) / prev - 1;
  }
  return out;
}

function rollingMean(x, w) {
  var n = x.length, out = new Array(n), s = 0, i;
  for (i = 0; i < n; i++) {
    s += +x[i];
    if (i >= w) s -= +x[i - w];
    out[i] = (i >= w - 1) ? s / w : NaN;
  }
  return out;
}

/* rolling(w).std(ddof=1). Recomputed per window rather than carried as a
   running sum of squares: the running form drifts once the window mean is
   large next to its spread, which is exactly the regime a price level sits in. */
function rollingStd(x, w) {
  var n = x.length, out = new Array(n), i, j, s, m, ss, d;
  for (i = 0; i < n; i++) {
    if (i < w - 1) { out[i] = NaN; continue; }
    s = 0;
    for (j = i - w + 1; j <= i; j++) s += +x[j];
    m = s / w;
    ss = 0;
    for (j = i - w + 1; j <= i; j++) { d = +x[j] - m; ss += d * d; }
    out[i] = Math.sqrt(ss / (w - 1));
  }
  return out;
}

/* ------------------------------------------------------------------- RNG */

var imul = Math.imul || function (a, b) {
  var ah = (a >>> 16) & 0xffff, al = a & 0xffff;
  var bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
  return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
};

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = imul(a ^ (a >>> 15), 1 | a);
    t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function RNG(seed) { this._u = mulberry32(seed >>> 0); this._spare = null; }
RNG.prototype.next = function () { return this._u(); };
RNG.prototype.normal = function () {                 // Box-Muller, both halves used
  if (this._spare !== null) { var s = this._spare; this._spare = null; return s; }
  var u1 = 1 - this._u();                            // (0,1] so log() is safe
  var u2 = this._u();
  var r = Math.sqrt(-2 * Math.log(u1)), th = TWO_PI * u2;
  this._spare = r * Math.sin(th);
  return r * Math.cos(th);
};
/* Student-t via Z / sqrt(chi2_df / df); chi2 with even df is 2 * Gamma(df/2,1),
   and Gamma(k,1) for integer k is the sum of k exponentials. df=4 here. */
RNG.prototype.studentT = function (df) {
  var z = this.normal(), c = 0, k = df >> 1, i;
  for (i = 0; i < k; i++) c += -Math.log(1 - this._u());
  if (df & 1) { var g = this.normal(); c += 0.5 * g * g; }
  c *= 2;
  return z / Math.sqrt(c / df);
};

/* ------------------------------------------------------------------ dates */

function parseISOUTC(s) {
  var p = String(s).slice(0, 10).split("-");
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
  if (!(y > 0) || !(m > 0) || !(d > 0)) return new Date(Date.UTC(2015, 0, 2));
  return new Date(Date.UTC(y, m - 1, d));
}
function fmtISO(d) {
  var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
  return y + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
}
function businessDates(startISO, n) {
  var d = parseISOUTC(startISO), out = [], dow;
  while (out.length < n) {
    dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(fmtISO(d));
    d = new Date(d.getTime() + 86400000);            // UTC has no DST, safe
  }
  return out;
}

/* --------------------------------------------------------------- synth */

function synth(o) {
  o = o || {};
  var n = Math.max(2, Math.round(num(o.n, 2520)));
  var mu = num(o.mu, 0.07), sigma = num(o.sigma, 0.20);
  var seed = (o.seed === undefined || o.seed === null) ? 42 : (num(o.seed, 42) | 0);
  var fat = !!o.fatTails, vc = !!o.volClustering;
  var dt = 1 / ANN, sdt = Math.sqrt(dt), i;

  /* numpy's exact stream, so this path is the desk's path bar for bar. The
     fat-tailed branch still falls back to the approximate generator: matching
     `standard_t` needs numpy's gamma sampler too, and no run kind the browser
     serves asks for it. */
  var shocks = new Float64Array(n);
  if (fat) {
    var rng = new RNG(seed);
    for (i = 0; i < n; i++) shocks[i] = rng.studentT(4) / Math.SQRT2;
  } else {
    var np = new root.NPRandom(seed);
    for (i = 0; i < n; i++) shocks[i] = np.standardNormal();
  }

  var sig = new Float64Array(n);
  if (vc) {                                          // GARCH(1,1) on daily variance
    var omega = 0.00001, alpha = 0.10, beta = 0.88, v = sigma * sigma / ANN, e;
    sig[0] = sigma;
    for (i = 1; i < n; i++) {
      e = shocks[i - 1] * Math.sqrt(v);
      v = omega + alpha * e * e + beta * v;
      sig[i] = Math.sqrt(v * ANN);                   // annualised vol path
    }
  } else {
    for (i = 0; i < n; i++) sig[i] = sigma;
  }

  var prices = new Array(n), c = 0;                  // cumsum of log returns
  for (i = 0; i < n; i++) {
    c += (mu - 0.5 * sig[i] * sig[i]) * dt + sig[i] * sdt * shocks[i];
    prices[i] = 100 * Math.exp(c);
  }
  return { dates: businessDates(o.start || "2015-01-01", n), prices: prices };
}

/* ------------------------------------------------------------- strategies */

var STRATEGIES = {
  sma_cross: {
    label: "SMA cross",
    params: [
      { key: "fast", label: "Fast", def: 42, min: 2, max: 200 },
      { key: "slow", label: "Slow", def: 252, min: 5, max: 400 },
      { key: "allowShort", label: "Allow short", def: true, type: "bool" }
    ],
    hypothesis: "Price trends persist: when the fast average sits above the slow one the drift is positive, so hold long, and hold short (or flat) otherwise.",
    signal: function (prices, p) {
      p = p || {};
      var fast = clampInt(p.fast, 42, 2, 200), slow = clampInt(p.slow, 252, 5, 400);
      var allowShort = (p.allowShort === undefined) ? true : !!p.allowShort;
      var f = rollingMean(prices, fast), s = rollingMean(prices, slow);
      var n = prices.length, out = new Array(n), other = allowShort ? -1 : 0, i;
      for (i = 0; i < n; i++) {
        /* numpy where(f > s, ...) treats any NaN comparison as False -> else
           branch; the reference then forces 0.0 wherever the slow MA is still
           warming up, so the flat warm-up wins over the else value. */
        out[i] = (s[i] !== s[i]) ? 0 : (f[i] > s[i] ? 1 : other);
      }
      return out;
    }
  },
  ts_momentum: {
    label: "Time-series momentum",
    params: [{ key: "lookback", label: "Lookback", def: 126, min: 5, max: 400 }],
    hypothesis: "The sign of the last N-bar return predicts the next bar's sign: ride winners, flip short after losers.",
    signal: function (prices, p) {
      p = p || {};
      var lb = clampInt((p || {}).lookback, 126, 5, 400);
      var r = pctChange(prices, lb), n = prices.length, out = new Array(n), i;
      for (i = 0; i < n; i++) out[i] = finite(r[i]) ? sign(r[i]) : 0;   // fillna(0)
      return out;
    }
  },
  mean_reversion: {
    label: "Mean reversion",
    params: [
      { key: "window", label: "Window", def: 20, min: 2, max: 400 },
      { key: "entry_z", label: "Entry z", def: 1.5, min: 0.1, max: 10, type: "float" }
    ],
    hypothesis: "Liquidity provision: you are paid for absorbing impatient order flow. Counterparty is someone who needs to trade now. Fails catastrophically when the move is information-driven rather than liquidity-driven — which is why this needs a stop, always.",
    signal: function (prices, p) {
      p = p || {};
      var w = clampInt(p.window, 20, 2, 400);
      var ez = num(p.entry_z, 1.5);
      var m = rollingMean(prices, w), sd = rollingStd(prices, w);
      var n = prices.length, out = new Array(n), i, z, v;
      for (i = 0; i < n; i++) {
        z = (prices[i] - m[i]) / sd[i];
        /* .where(z.abs() > 0, 0.0) — NaN and an exact zero both fall to flat,
           but an infinite z (a dead-flat window) clips to a full position, so
           test the magnitude rather than testing for finiteness. */
        if (Math.abs(z) > 0) {
          v = -z / ez;
          out[i] = v < -1 ? -1 : (v > 1 ? 1 : v);
        } else {
          out[i] = 0;
        }
      }
      return out;
    }
  },
  buy_hold: {
    label: "Buy and hold",
    params: [],
    hypothesis: "The asset carries a positive risk premium, so the honest benchmark is to be fully invested at all times and pay no turnover.",
    signal: function (prices) {
      var n = prices.length, out = new Array(n), i;
      for (i = 0; i < n; i++) out[i] = 1;
      return out;
    }
  }
};

/* ------------------------------------------------------------------ costs */

var COSTS = { spreadBps: 2, commissionBps: 1, slippageBps: 1, borrowBpsAnn: 50 };

function mergeCosts(c) {
  c = c || {};
  return {
    spreadBps: num(c.spreadBps, COSTS.spreadBps),
    commissionBps: num(c.commissionBps, COSTS.commissionBps),
    slippageBps: num(c.slippageBps, COSTS.slippageBps),
    borrowBpsAnn: num(c.borrowBpsAnn, COSTS.borrowBpsAnn)
  };
}

/* ---------------------------------------------------------------- metrics */

function cagr(r, ppy) {
  var a = clean(r), n = a.length, i, total = 1;
  ppy = num(ppy, ANN);
  if (!n) return NaN;
  for (i = 0; i < n; i++) total *= (1 + a[i]);
  if (total <= 0) return -1;                         // wiped out
  return Math.pow(total, 1 / (n / ppy)) - 1;
}

function stdev1(a) {                                 // ddof = 1, the sample std
  var n = a.length, i, m = 0, s = 0, d;
  if (n < 2) return NaN;
  for (i = 0; i < n; i++) m += a[i];
  m /= n;
  for (i = 0; i < n; i++) { d = a[i] - m; s += d * d; }
  return Math.sqrt(s / (n - 1));
}
function mean(a) {
  var n = a.length, i, m = 0;
  if (!n) return NaN;
  for (i = 0; i < n; i++) m += a[i];
  return m / n;
}

function annVol(r, ppy) {
  var a = clean(r);
  ppy = num(ppy, ANN);
  return a.length < 2 ? NaN : stdev1(a) * Math.sqrt(ppy);
}

function sharpe(r, ppy) {                            // rf = 0
  var a = clean(r), sd;
  ppy = num(ppy, ANN);
  if (a.length < 2) return NaN;
  sd = stdev1(a);
  if (!(sd > 0)) return NaN;
  return mean(a) / sd * Math.sqrt(ppy);
}

function sharpeStderr(sr, n) {
  if (!finite(sr) || !(n > 0)) return NaN;
  return Math.sqrt((1 + 0.5 * sr * sr) / n);         // Lo (2002) IID stderr
}

function sortino(r, ppy) {
  var a = clean(r), i, s = 0, k = 0, dd;
  ppy = num(ppy, ANN);
  if (!a.length) return NaN;
  for (i = 0; i < a.length; i++) if (a[i] < 0) { s += a[i] * a[i]; k++; }
  if (!k) return NaN;                                // numpy: mean of empty -> nan
  dd = Math.sqrt(s / k);
  if (!(dd > 0)) return NaN;
  return mean(a) / dd * Math.sqrt(ppy);
}

/* Alignment-preserving: NaN in, NaN out at the same index, so the curve can be
   plotted against the price series without an offset. */
function equityCurve(r) {
  var n = r ? r.length : 0, out = new Array(n), eq = 1, i, v;
  for (i = 0; i < n; i++) {
    v = +r[i];
    if (finite(v)) { eq *= (1 + v); out[i] = eq; } else { out[i] = NaN; }
  }
  return out;
}
function drawdownSeries(eq) {
  var n = eq ? eq.length : 0, out = new Array(n), peak = -Infinity, i, v;
  for (i = 0; i < n; i++) {
    v = +eq[i];
    if (!finite(v)) { out[i] = NaN; continue; }
    if (v > peak) peak = v;
    out[i] = (peak !== 0) ? v / peak - 1 : NaN;
  }
  return out;
}
function maxDrawdown(dd) {
  var a = clean(dd), i, m = NaN;
  for (i = 0; i < a.length; i++) if (!(m <= a[i])) m = a[i];
  return a.length ? m : NaN;
}
function maxDrawdownDuration(dd) {
  var a = clean(dd), i, run = 0, best = 0;
  for (i = 0; i < a.length; i++) {
    if (a[i] < 0) { run++; if (run > best) best = run; } else { run = 0; }
  }
  return best;
}
function calmar(c, mdd) {
  if (!finite(c) || !finite(mdd) || mdd === 0) return NaN;
  return c / Math.abs(mdd);
}
function hitRate(r) {
  var a = clean(r), i, up = 0, nz = 0;
  for (i = 0; i < a.length; i++) if (a[i] !== 0) { nz++; if (a[i] > 0) up++; }
  return nz ? up / nz : NaN;
}
function profitFactor(r) {
  var a = clean(r), i, p = 0, l = 0;
  for (i = 0; i < a.length; i++) { if (a[i] > 0) p += a[i]; else if (a[i] < 0) l += a[i]; }
  if (l === 0) return p > 0 ? Infinity : NaN;
  return p / -l;
}
/* mean(|diff(pos)|) * ppy — np.diff, so n-1 terms; pos[0] is not a turn. */
/* Keep only the positions on bars where `net` is finite, mirroring the
   dropna-aligned index the Python engine reports metrics over. */
function alignedPositions(pos, net) {
  var out = [], i, n = pos ? pos.length : 0;
  for (i = 0; i < n; i++) { if (finite(+net[i])) out.push(+pos[i]); }
  return out;
}

/* changes / n * ppy, where changes is fillna(0).diff().abs().sum() — so the
   first bar contributes nothing, a NaN neighbour counts as a move to zero —
   and n is len(dropna()), the number of positions rather than the number of
   diffs. Dividing by the diff count instead reads n/(n-1) too high. */
function turnover(pos, ppy) {
  var n = pos ? pos.length : 0, i, s = 0, k = 0, a, b;
  ppy = num(ppy, ANN);
  for (i = 0; i < n; i++) if (finite(num(pos[i], NaN))) k++;
  for (i = 1; i < n; i++) {
    a = num(pos[i], NaN); b = num(pos[i - 1], NaN);
    s += Math.abs((finite(a) ? a : 0) - (finite(b) ? b : 0));
  }
  return k ? (s / k) * ppy : NaN;
}

/* Acklam's rational approximation to the inverse normal CDF (|rel err| < 1.15e-9).
   Stands in for scipy.stats.norm.ppf. */
var _A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
          1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
var _B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
          6.680131188771972e+01, -1.328068155288572e+01];
var _C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
          -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
var _D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
          3.754408661907416e+00];

function normPPF(p) {
  p = +p;
  if (!(p === p)) return NaN;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  var q, r;
  if (p < 0.02425) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((_C[0] * q + _C[1]) * q + _C[2]) * q + _C[3]) * q + _C[4]) * q + _C[5]) /
           ((((_D[0] * q + _D[1]) * q + _D[2]) * q + _D[3]) * q + 1);
  }
  if (p > 0.97575) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((_C[0] * q + _C[1]) * q + _C[2]) * q + _C[3]) * q + _C[4]) * q + _C[5]) /
            ((((_D[0] * q + _D[1]) * q + _D[2]) * q + _D[3]) * q + 1);
  }
  q = p - 0.5; r = q * q;
  return (((((_A[0] * r + _A[1]) * r + _A[2]) * r + _A[3]) * r + _A[4]) * r + _A[5]) * q /
         (((((_B[0] * r + _B[1]) * r + _B[2]) * r + _B[3]) * r + _B[4]) * r + 1);
}

/* Deflated Sharpe: subtract the Sharpe the best of n_trials random strategies
   would be expected to show by luck alone (Bailey & Lopez de Prado), scaled by
   the estimation stderr. n_trials <= 1 means nothing was selected, no haircut. */
function deflatedSharpe(sr, nTrials, nObs) {
  if (!finite(sr)) return NaN;
  nTrials = num(nTrials, 1);
  if (nTrials <= 1) return sr;
  var z = (1 - EULER) * normPPF(1 - 1 / nTrials) +
          EULER * normPPF(1 - 1 / (nTrials * Math.E));
  var se = Math.sqrt((1 + 0.5 * sr * sr) / nObs);
  return sr - z * se;
}

/* ------------------------------------------------------- block bootstrap */

function quantileSorted(a, q) {
  var n = a.length;
  if (!n) return NaN;
  var h = (n - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  if (lo === hi) return a[lo];
  return a[lo] + (h - lo) * (a[hi] - a[lo]);
}

/* Block bootstrap of the Sharpe, step for step as bootstrap_sharpe_ci does it:
   draw ceil(n/block) block starts in one go from numpy's stream, lay the blocks
   end to end, cut the result back to n, and read the 2.5/97.5 percentiles of
   the 1000 Sharpes. Blocks preserve the serial dependence that iid resampling
   would destroy. Drawing the starts up front, rather than one at a time until
   the sample is full, is what keeps the stream aligned with Python's. */
function bootstrapSharpeCI(r, ppy, samples, block, seed) {
  var a = clean(r), n = a.length;
  samples = Math.max(1, Math.round(num(samples, 1000)));
  block = Math.max(1, Math.round(num(block, 20)));
  if (n < block * 2) return [NaN, NaN];              // the Python guard, exactly
  var src = new Float64Array(n), i;
  for (i = 0; i < n; i++) src[i] = a[i];

  var rng = new root.NPRandom(num(seed, 42));
  var nBlocks = Math.ceil(n / block);
  var out = new Float64Array(samples);
  var sample = new Float64Array(n);
  var sq = Math.sqrt(num(ppy, ANN));
  var k, b, j, s, filled, sum, m, ss, d, sd, starts;

  for (k = 0; k < samples; k++) {
    starts = rng.integers(n - block, nBlocks);       // integers(0, n - block)
    filled = 0;
    for (b = 0; b < nBlocks && filled < n; b++) {
      s = starts[b];
      for (j = 0; j < block && filled < n; j++) sample[filled++] = src[s + j];
    }
    /* mean, then the sum of squared deviations — numpy's two-pass std(ddof=1),
       not the sumsq shortcut, which loses digits when the mean is small. */
    sum = 0;
    for (i = 0; i < n; i++) sum += sample[i];
    m = sum / n;
    ss = 0;
    for (i = 0; i < n; i++) { d = sample[i] - m; ss += d * d; }
    sd = Math.sqrt(ss / (n - 1));
    out[k] = sd > 0 ? (m / sd) * sq : NaN;
  }
  out.sort();                                        // typed arrays sort numerically
  return [quantileSorted(out, 0.025), quantileSorted(out, 0.975)];
}

/* ---------------------------------------------------------- paper session */

/* One paper session, bar by bar, in the order broker.Session fixes and a
   strategy cannot bypass:

     signal → vol target → risk limits → drawdown scalar → kill switch
            → order → fill → reconcile → log

   The kill switch sits after sizing and before the order, and fails closed.
   Slippage is drawn around the modelled cost rather than fixed at it, because
   a simulator that always fills at the modelled price teaches a comfortable
   lie — and it is drawn from numpy's stream, so the fills are the desk's fills.

   RiskLimits.apply reduces to a clip at max_position here: it is a fixed point
   over per-name, gross and net limits, and with one name the gross and net
   passes can never bind once the per-name clip has run. */
function paperSession(o) {
  o = o || {};
  var prices = o.prices || [], dates = o.dates || [];
  var strat = STRATEGIES[o.stratKey] || STRATEGIES.buy_hold;
  var params = o.params || defaultParams(strat);
  var sym = o.symbol || "SYNTHETIC";
  var ppy = num(o.ppy, ANN);
  var warmup = Math.max(0, Math.round(num(o.warmup, 260)));
  var c = o.config || {};
  var startEq = num(c.starting_equity, 100000);
  var targetVol = num(c.target_annual_vol, 0.15);
  var kelly = num(c.kelly_fraction, 0.25);
  var maxLev = num(c.max_leverage, 2);
  var maxPos = num(c.max_per_asset, 0.25);
  var derisk = num(c.derisk_threshold, 0.10);
  var halt = num(c.halt_threshold, 0.20);
  var minScale = num(c.min_scale, 0.25);
  var perTurnBps = num(o.perTurnBps, 4);

  var n = prices.length;
  var sig = strat.signal(prices, params);
  var rets = pctChange(prices, 1);
  var volRaw = rollingStd(rets, 20);
  var vol = new Array(n), i;
  for (i = 0; i < n; i++) vol[i] = i > 0 ? volRaw[i - 1] * Math.sqrt(ppy) : NaN;   // .shift(1)

  var rng = new root.NPRandom(num(o.seed, 42));
  var cash = startEq, pos = 0, fills = [], decisions = [];
  var curve = [], stamps = [], targets = [];
  var tripped = false, haltReason = null;
  var peak = cash;                                   // no position on the first mark

  function ddScalar(dd) {
    if (dd <= derisk) return 1;
    if (dd >= halt) return 0;
    return Math.max(minScale, 1 - (dd - derisk) / (halt - derisk));
  }

  function submit(qty, px, ts) {
    var notional = Math.abs(qty) * px;
    var realisedBps = Math.max(0, perTurnBps + perTurnBps * 0.4 * rng.standardNormal());
    var cost = notional * realisedBps / 10000;
    var fillPx = px * (1 + sign(qty) * realisedBps / 10000);
    cash -= qty * px + cost;                         // the cost is charged apart from the price
    pos += qty;
    if (Math.abs(pos) < 1e-12) pos = 0;
    fills.push({ symbol: sym, quantity: qty, price: fillPx, cost: cost, ts: ts });
  }

  function rebalance(weight, px, eq, ts, reason) {
    var delta = weight * eq / px - pos;
    /* a 0.5% band, so the book does not churn on rounding noise */
    if (Math.abs(delta * px) < 0.005 * eq) {
      decisions.push(ts + " HOLD target=" + (weight >= 0 ? "+" : "") + weight.toFixed(2));
      return;
    }
    submit(delta, px, ts);
    decisions.push(ts + " TRADE " + (delta >= 0 ? "+" : "") + delta.toFixed(2) +
                   " units -> weight " + (weight >= 0 ? "+" : "") + weight.toFixed(2) +
                   " (" + reason + ")");
  }

  for (i = warmup; i < n; i++) {
    /* the tape stamps each line with str(Timestamp), which carries the
       midnight the bare date leaves off */
    var ts = dates[i] ? dates[i] + " 00:00:00" : String(i), px = +prices[i];
    var eq = cash + pos * px;
    if (eq > peak) peak = eq;

    var raw = +sig[i]; if (raw !== raw) raw = 0;
    var v = vol[i];
    var scaled = (finite(v) && v > 0) ? raw * (targetVol / v) : 0;
    scaled *= kelly / 0.25;
    scaled = Math.max(-maxLev, Math.min(maxLev, scaled));
    scaled = Math.max(-maxPos, Math.min(maxPos, scaled));
    scaled *= ddScalar(Math.abs(eq / peak - 1));

    if (!tripped && (eq / peak - 1) <= -halt) {
      tripped = true;
      haltReason = "drawdown " + ((eq / peak - 1) * 100).toFixed(2) + "% breached halt limit " +
                   (-halt * 100).toFixed(2) + "%";
    }
    if (tripped) {
      if (pos !== 0) rebalance(0, px, eq, ts, "kill switch: flattening");
      decisions.push(ts + " HALT " + haltReason);
      curve.push(eq); stamps.push(ts); targets.push(0);
      break;
    }

    rebalance(scaled, px, eq, ts, o.stratKey || "strategy");
    curve.push(eq); stamps.push(ts); targets.push(scaled);
  }

  var notional = 0, paid = 0;
  for (i = 0; i < fills.length; i++) {
    notional += Math.abs(fills[i].quantity) * fills[i].price;
    paid += fills[i].cost;
  }
  var realisedBps = fills.length && notional ? paid / notional * 10000 : NaN;
  var ending = cash + pos * (+prices[n - 1]);

  return {
    symbol: sym, bars: curve.length,
    equity_curve: curve, timestamps: stamps, target_positions: targets,
    fills: fills, decisions: decisions,
    halted: tripped, halt_reason: haltReason,
    modelled_cost_bps: perTurnBps,
    realised_cost_bps: realisedBps,
    starting_equity: startEq, ending_equity: ending,
    total_return: ending / startEq - 1,
    cost_ratio: perTurnBps ? realisedBps / perTurnBps : NaN
  };
}

/* --------------------------------------------------------------- backtest */

function backtest(o) {
  o = o || {};
  var prices = o.prices || [], sig = o.signal || [];
  var n = prices.length, i;
  var ppy = num(o.ppy, ANN);
  var costs = mergeCosts(o.costs);
  var nTrials = num(o.nTrials, 1);

  var perTurn = (costs.spreadBps + costs.commissionBps + costs.slippageBps) / 10000;
  var borrow = (costs.borrowBpsAnn / 10000) / ppy;

  var ret = pctChange(prices, 1);                    // ret[0] = NaN, like pct_change()

  /* THE t+1 SHIFT: positions = signal.shift(1).fillna(0). A signal computed
     from today's close can only be traded into tomorrow's return, so position
     i earns return i while being decided at i-1. Dropping this shift is what
     manufactures look-ahead alpha. */
  var pos = new Array(n), s;
  if (n) pos[0] = 0;
  for (i = 1; i < n; i++) { s = +sig[i - 1]; pos[i] = (s === s) ? s : 0; }

  var gross = new Array(n), cost = new Array(n), net = new Array(n), trade, hold;
  for (i = 0; i < n; i++) {
    /* trading cost = |diff(pos)| * per-turn; the first bar is charged
       |pos[0]| because opening the initial position is itself a turn. */
    trade = (i === 0 ? Math.abs(pos[0]) : Math.abs(pos[i] - pos[i - 1])) * perTurn;
    hold = Math.abs(Math.min(pos[i], 0)) * borrow;   // borrow fee on shorts only
    cost[i] = trade + hold;
    gross[i] = pos[i] * ret[i];                      // 0 * NaN = NaN, same as pandas
    net[i] = gross[i] - cost[i];
  }

  var equity = equityCurve(net);
  var drawdown = drawdownSeries(equity);

  var netC = clean(net), grossC = clean(gross);
  var nObs = netC.length;
  var srNet = sharpe(netC, ppy);
  var cagrNet = cagr(netC, ppy), cagrGross = cagr(grossC, ppy);
  var mdd = maxDrawdown(drawdown);

  var doBoot = (o.bootstrap === undefined) ? true : !!o.bootstrap;
  var bsamples = 1000, bblock = 20, bseed = 42;      // bootstrap_sharpe_ci defaults
  if (typeof o.bootstrap === "number") { bsamples = o.bootstrap; doBoot = o.bootstrap > 0; }
  else if (o.bootstrap && typeof o.bootstrap === "object") {
    bsamples = num(o.bootstrap.samples, num(o.bootstrap.n, 1000));
    bblock = num(o.bootstrap.block, 20);
    bseed = num(o.bootstrap.seed, bseed);
  }
  var ci = doBoot ? bootstrapSharpeCI(netC, ppy, bsamples, bblock, bseed) : [NaN, NaN];

  return {
    gross: gross, net: net, positions: pos, cost: cost,
    equity: equity, drawdown: drawdown,
    m: {
      cagrGross: cagrGross,
      cagrNet: cagrNet,
      annVol: annVol(netC, ppy),
      sharpe: srNet,
      sharpeGross: sharpe(grossC, ppy),
      sharpeStderr: sharpeStderr(srNet, nObs),
      sortino: sortino(netC, ppy),
      maxDD: mdd,
      maxDDDuration: maxDrawdownDuration(drawdown),
      calmar: calmar(cagrNet, mdd),
      hitRate: hitRate(netC),
      profitFactor: profitFactor(netC),
      /* pandas computes turnover on the *aligned* frame — the bars where net
         is finite — so the mean runs over one fewer diff than the raw path.
         Restrict to that same window or the figure comes out ~n/(n-1) high. */
      turnover: turnover(alignedPositions(pos, net), ppy),
      costDrag: (finite(cagrGross) && finite(cagrNet)) ? cagrGross - cagrNet : NaN,
      deflated: deflatedSharpe(srNet, nTrials, nObs),
      ciLo: ci[0], ciHi: ci[1],
      nObs: nObs
    }
  };
}

/* ------------------------------------------------------------ walk-forward */

function defaultParams(strat) {
  var p = {}, i, d = strat.params || [];
  for (i = 0; i < d.length; i++) p[d[i].key] = d[i].def;
  return p;
}

/* Signal is fitted once on the full path (so each fold does not pay a fresh
   warm-up), then the NET return stream is cut into N contiguous, near-
   equal chunks - np.array_split semantics — and Sharpe is measured inside each
   chunk alone. Stability across folds is the point, not the headline number. */
/* Rolling walk-forward, the way splits.walk_forward + run_validate_job do it:
   slide a train+test window forward by one test block at a time, recompute the
   signal on the whole segment, keep only the test slice, and backtest that
   slice on its own. Cutting a single backtest into k equal chunks is a
   different and much weaker claim — the signal there has already seen the
   whole series. */
function walkForward(o) {
  o = o || {};
  var prices = o.prices || [], dates = o.dates || [];
  var strat = STRATEGIES[o.stratKey] || STRATEGIES.buy_hold;
  var params = o.params || defaultParams(strat);
  var ppy = num(o.ppy, ANN);
  var train = Math.max(1, Math.round(num(o.train, 504)));
  var test = Math.max(1, Math.round(num(o.test, 126)));
  var n = prices.length, out = [], start, trainEnd, testEnd, i, k = 0;

  for (start = 0; start + train + test <= n; start += test) {
    trainEnd = start + train;
    testEnd = trainEnd + test;
    var seg = prices.slice(start, testEnd);
    var segSig = strat.signal(seg, params);
    var sig = new Array(test);
    for (i = 0; i < test; i++) {
      var sv = +segSig[train + i];
      sig[i] = (sv === sv) ? sv : 0;                 // .fillna(0.0)
    }
    var bt = backtest({
      prices: prices.slice(trainEnd, testEnd), signal: sig,
      costs: o.costs, ppy: ppy, nTrials: 1, bootstrap: false
    });
    k++;
    out.push({
      i: k,
      sharpe: bt.m.sharpe,
      start: dates[trainEnd] || null,
      end: dates[testEnd - 1] || null
    });
  }

  var vals = [], pos = 0;
  for (i = 0; i < out.length; i++) if (finite(out[i].sharpe)) vals.push(out[i].sharpe);
  for (i = 0; i < vals.length; i++) if (vals[i] > 0) pos++;
  var sorted = vals.slice().sort(function (a, b) { return a - b; });
  var mean = NaN, sd = 0, median = NaN, sq = 0;
  if (vals.length) {
    for (i = 0, sq = 0; i < vals.length; i++) sq += vals[i];
    mean = sq / vals.length;
    for (i = 0, sq = 0; i < vals.length; i++) sq += (vals[i] - mean) * (vals[i] - mean);
    sd = vals.length > 1 ? Math.sqrt(sq / (vals.length - 1)) : 0;
    median = sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  }
  return {
    folds: out,
    summary: {
      folds: vals.length,
      mean: vals.length ? mean : null,
      median: vals.length ? median : null,
      std: vals.length ? sd : null,
      min: vals.length ? sorted[0] : null,
      max: vals.length ? sorted[sorted.length - 1] : null,
      pct_positive: vals.length ? pos / vals.length : null
    },
    /* the desk's own test: a spread wider than 1.5 Sharpe means the folds are
       arguing, and the mean of an argument is decoration. */
    disagree: vals.length > 0 && (sorted[sorted.length - 1] - sorted[0]) > 1.5
  };
}

/* ------------------------------------------------------------------ export */

var JQ = {
  PERIODS: { daily: ANN },
  synth: synth,
  STRATEGIES: STRATEGIES,
  COSTS: COSTS,
  backtest: backtest,
  walkForward: walkForward,
  paperSession: paperSession,
  M: {
    cagr: cagr,
    annVol: annVol,
    sharpe: sharpe,
    sharpeStderr: sharpeStderr,
    sortino: sortino,
    equityCurve: equityCurve,
    drawdownSeries: drawdownSeries,
    maxDrawdown: maxDrawdown,
    maxDrawdownDuration: maxDrawdownDuration,
    calmar: calmar,
    hitRate: hitRate,
    profitFactor: profitFactor,
    turnover: turnover,
    deflatedSharpe: deflatedSharpe,
    normPPF: normPPF,
    bootstrapSharpeCI: bootstrapSharpeCI,
    mulberry32: mulberry32,
    RNG: RNG
  }
};

root.JQ = JQ;
if (typeof module !== "undefined" && module.exports) module.exports = JQ;

})(typeof window !== "undefined" ? window
   : (typeof globalThis !== "undefined" ? globalThis
   : (typeof global !== "undefined" ? global : this)));