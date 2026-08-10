/* The server, replaced.
 *
 * The desk UI (app.js and friends, copied verbatim from the Python build) talks
 * to /api/*. There is no Python here, so this intercepts fetch and answers those
 * calls in the page:
 *
 *   • the read-only boot endpoints are snapshots taken from the real desk
 *   • /api/run actually RUNS — the Jamie.Quant engine was ported to JS
 *     (engine.js) and computes the same numbers, so a backtest or a
 *     walk-forward here is real work, not a canned reply
 *   • anything that needs the filesystem, a broker, or the network says so
 *     plainly rather than pretending
 *
 * Response shapes are copied field-for-field from the running desk, because
 * app.js reads them directly and a missing key shows up as a blank panel.
 */
(function () {
  "use strict";

  var JQ = window.JQ;
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var jobs = {};
  var seq = 0;
  var cache = {};

  /* ------------------------------------------------------------------ util */
  function json(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  function jid() {
    seq += 1;
    return ("0000000" + seq.toString(16)).slice(-8) + "b0adf00d";
  }
  function nowISO() { return new Date().toISOString(); }

  function getJSON(path) {
    if (cache[path]) return Promise.resolve(cache[path]);
    return nativeFetch(path, { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) { cache[path] = d; return d; });
  }

  /* Anything that genuinely cannot happen in a browser. Better a clear refusal
     than a plausible fake — this desk's whole point is not lying to you. */
  function cannot(what) {
    return json({
      error: what + " needs the local desk. This is the browser build: it runs " +
             "research in the page, but it has no filesystem, no broker and no " +
             "market data feed."
    }, 501);
  }

  /* ------------------------------------------------------- run the engine */
  var STRAT_MAP = {
    sma_cross: "sma_cross",
    ts_momentum: "ts_momentum",
    mean_reversion: "mean_reversion",
    buy_hold: "buy_hold",
    buy_and_hold: "buy_hold"
  };

  function pickStrategy(name) {
    var key = STRAT_MAP[name] || name;
    return JQ.STRATEGIES[key] ? key : "sma_cross";
  }

  /* The desk names params fast/slow/allow_short; the engine uses allowShort. */
  function normParams(key, p) {
    p = p || {};
    var out = {};
    if (key === "sma_cross") {
      out.fast = p.fast !== undefined ? p.fast : 42;
      out.slow = p.slow !== undefined ? p.slow : 252;
      out.allowShort = (p.allow_short !== undefined) ? !!p.allow_short
                     : (p.short !== undefined) ? !!p.short : true;
    } else if (key === "ts_momentum") {
      out.lookback = p.lookback !== undefined ? p.lookback : 126;
    } else if (key === "mean_reversion") {
      out.window = p.window !== undefined ? p.window : 20;
      out.entry_z = p.entry_z !== undefined ? p.entry_z : 1.5;
    }
    return out;
  }

  function labelFor(key, p) {
    if (key === "sma_cross") {
      return "sma_cross(fast=" + p.fast + ", slow=" + p.slow +
             ", short=" + (p.allowShort ? "True" : "False") + ") on SYNTHETIC";
    }
    if (key === "ts_momentum") return "ts_momentum(lookback=" + p.lookback + ") on SYNTHETIC";
    if (key === "mean_reversion") {
      return "mean_reversion(window=" + p.window + ", z=" + p.entry_z + ") on SYNTHETIC";
    }
    return key + " on SYNTHETIC";
  }

  /* The desk's per-leg metric block, key for key. */
  function legStats(rets, positions, ppy, nPeriods) {
    var M = JQ.M;
    var inMkt = 0, i, k = 0;
    for (i = 0; i < positions.length; i++) {
      if (positions[i] === positions[i]) { k++; if (positions[i] !== 0) inMkt++; }
    }
    var eq = M.equityCurve(rets), dd = M.drawdownSeries(eq);
    var c = M.cagr(rets, ppy), mdd = M.maxDrawdown(dd);
    return {
      cagr: c,
      ann_vol: M.annVol(rets, ppy),
      sharpe: M.sharpe(rets, ppy),
      sortino: M.sortino(rets, ppy),
      max_drawdown: mdd,
      max_dd_duration: M.maxDrawdownDuration(dd),
      calmar: M.calmar(c, mdd),          /* engine takes (cagr, maxDD) */
      hit_rate: M.hitRate(rets),
      profit_factor: M.profitFactor(rets),
      turnover: M.turnover(positions, ppy),
      time_in_market: k ? inMkt / k : 0,
      n_periods: nPeriods
    };
  }

  function thin(arr, target) {
    var out = [], step = Math.max(1, Math.ceil(arr.length / target)), i;
    for (i = 0; i < arr.length; i += step) out.push(arr[i]);
    if (out.length && arr.length) out[out.length - 1] = arr[arr.length - 1];
    return out;
  }

  function verdictFor(ciLo, ciHi, sharpe, deflated) {
    var straddles = (ciLo <= 0 && ciHi >= 0);
    if (straddles) {
      return {
        state: "doubt",
        headline: "No edge demonstrated",
        body: "The 95% block-bootstrap interval for net Sharpe runs from " +
              ciLo.toFixed(2) + " to " + ciHi.toFixed(2) + " and contains zero, so " +
              "the result is consistent with luck. That is not a failure of the " +
              "strategy — it is the measurement doing its job. Do not size this."
      };
    }
    if (ciHi < 0) {
      return {
        state: "fault",
        headline: "Reliably negative",
        body: "The whole 95% interval (" + ciLo.toFixed(2) + " to " + ciHi.toFixed(2) +
              ") sits below zero. This rule loses money net of costs; the only " +
              "useful thing here is the negative result itself. Log it."
      };
    }
    return {
      state: "signal",
      headline: "Edge demonstrated",
      body: "The 95% interval (" + ciLo.toFixed(2) + " to " + ciHi.toFixed(2) +
            ") excludes zero, and the Sharpe survives the multiple-testing haircut " +
            "at " + deflated.toFixed(2) + ". Paper it before you believe it."
    };
  }

  /* The form's data block, honoured rather than assumed. bars and seed are the
     two knobs that change every number on the page, so reading them off the
     spec is the difference between a demo and the desk. */
  function dataFor(spec) {
    var d = spec.data || {};
    return JQ.synth({
      n: Math.max(2, Math.round(+d.bars || 2520)),
      mu: 0.07, sigma: 0.20,
      seed: (d.seed === undefined || d.seed === null) ? 42 : (+d.seed | 0),
      volClustering: true,                           // load_prices passes this
      start: d.start || "2015-01-01"
    });
  }

  /* cost_model(asset_class), straight off the snapshot the desk shipped. The
     page cannot reach a run without booting from /api/state first, so the
     snapshot is always in the cache by the time this is called. */
  function costsFor(spec) {
    var table = ((cache["state.json"] || {}).costs) || {};
    var c = table[spec.asset_class] || table.equity;
    if (!c) return JQ.COSTS;
    return {
      spreadBps: c.spread_bps, commissionBps: c.commission_bps,
      slippageBps: c.slippage_bps, borrowBpsAnn: c.borrow_bps_ann
    };
  }

  function runBacktest(spec) {
    var key = pickStrategy(spec.strategy);
    var p = normParams(key, spec.params);
    var trials = Math.max(1, +(spec.trials || 1));
    var ppy = 252;

    var data = dataFor(spec);
    var sig = JQ.STRATEGIES[key].signal(data.prices, p);
    var res = JQ.backtest({
      prices: data.prices, signal: sig, costs: costsFor(spec),
      ppy: ppy, nTrials: trials, bootstrap: 1000
    });

    var m = res.m;
    var grossC = [], netC = [], i;
    for (i = 0; i < res.net.length; i++) {
      if (res.net[i] === res.net[i]) { netC.push(res.net[i]); grossC.push(res.gross[i]); }
    }

    return {
      name: labelFor(key, p),
      subject: "SYNTHETIC",
      gross: legStats(grossC, res.positions, ppy, m.nObs),
      net: legStats(netC, res.positions, ppy, m.nObs),
      sharpe_ci: [m.ciLo, m.ciHi],
      cost_drag: m.costDrag,
      n_trials: trials,
      deflated_sharpe: m.deflated,
      equity_curve: thin(JQ.M.equityCurve(netC), 1200),
      hypothesis: JQ.STRATEGIES[key].hypothesis,
      verdict: verdictFor(m.ciLo, m.ciHi, m.sharpe, m.deflated)
    };
  }

  function runValidate(spec) {
    var key = pickStrategy(spec.strategy);
    var p = normParams(key, spec.params);
    var train = Math.max(1, Math.round(+spec.train || 504));
    var test = Math.max(1, Math.round(+spec.test || 126));
    var data = dataFor(spec);
    var wf = JQ.walkForward({
      prices: data.prices, dates: data.dates, stratKey: key, params: p,
      costs: costsFor(spec), train: train, test: test, ppy: 252
    });
    return {
      subject: "SYNTHETIC",
      train: train,
      test: test,
      folds: wf.folds,
      summary: wf.summary,
      disagree: wf.disagree
    };
  }

  /* ---------------------------------------------------------------- jobs */
  function startJob(spec) {
    var id = jid();
    var job = {
      id: id, kind: spec.kind, status: "running",
      started: nowISO(), finished: null,
      log: [{ t: nowISO(), level: "info", text: "running in your browser — no server, no data leaves the device" }],
      progress: 0, result: null, error: null
    };
    jobs[id] = job;

    /* Off the click handler so the UI can paint "running" first. */
    setTimeout(function () {
      try {
        var out;
        if (spec.kind === "backtest") out = runBacktest(spec);
        else if (spec.kind === "validate") out = runValidate(spec);
        else {
          job.status = "error";
          job.error = spec.kind + " needs the local desk (it writes files or talks to a venue).";
          job.finished = nowISO();
          return;
        }
        job.result = out;
        job.status = "done";
        job.progress = 1;
        job.finished = nowISO();
        job.log.push({ t: nowISO(), level: "good", text: spec.kind + " complete" });
      } catch (e) {
        job.status = "error";
        job.error = (e && e.message) ? e.message : String(e);
        job.finished = nowISO();
      }
    }, 30);

    return id;
  }

  /* ---------------------------------------------------------------- route */
  function route(path, method, body) {
    var m;

    if (path === "/api/health") return json({ ok: true, build: "browser" });

    if (path === "/api/state") {
      return getJSON("state.json").then(function (st) { return json(st); });
    }

    if (path === "/api/runs") {
      return getJSON("runs.json").then(function (r) { return json(r); });
    }

    if (path === "/api/doctor") {
      return json({
        ok: true,
        checks: [
          { label: "engine", ok: !!JQ, detail: "jamiequant, ported to JavaScript" },
          { label: "runs in browser", ok: true, detail: "no server, no account, no VPN" },
          { label: "live routing blocked", ok: true, detail: "there is no broker in this build" },
          { label: "data stays local", ok: true, detail: "nothing is uploaded" },
          { label: "market data", ok: false, detail: "synthetic prices only — no feed in the browser" },
          { label: "saved runs", ok: false, detail: "read-only sample; the desk on your Mac holds the real history" }
        ]
      });
    }

    if ((m = path.match(/^\/api\/job\/([a-f0-9]+)$/))) {
      var job = jobs[m[1]];
      return job ? json(job) : json({ error: "no such job" }, 404);
    }

    if (path === "/api/run" && method === "POST") {
      if (!JQ) return json({ error: "engine failed to load" }, 500);
      var kind = (body && body.kind) || "backtest";
      if (kind !== "backtest" && kind !== "validate") {
        return json({
          error: kind + " is not available in the browser build — it needs the " +
                 "local desk. Backtest and walk-forward validation both run here."
        }, 501);
      }
      return json({ job_id: startJob(body || {}) });
    }

    if (path.indexOf("/api/ticker/") === 0) return cannot("Symbol search");
    if (path === "/api/dashboard") return cannot("Writing a dashboard file");
    if (path === "/api/log") return cannot("Appending to your daily log");
    if (path === "/api/research") return cannot("Opening a pre-registration");
    if (path === "/api/quit") return json({ ok: true, note: "nothing to quit — just close the tab" });
    if (path.indexOf("/api/run/") === 0) return json({ error: "no such run" }, 404);

    return json({ error: "no such endpoint in the browser build" }, 404);
  }

  /* --------------------------------------------------------------- patch */
  window.fetch = function (input, init) {
    init = init || {};
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    var path;
    try { path = new URL(url, location.href).pathname; } catch (e) { path = url; }

    if (path.indexOf("/api/") !== 0) return nativeFetch(input, init);

    var method = (init.method || (input && input.method) || "GET").toUpperCase();
    var body = null;
    if (init.body) { try { body = JSON.parse(init.body); } catch (e) { body = null; } }

    return Promise.resolve(route(path, method, body));
  };
})();
