/* Hey Jamie Desk — the working surface.
 *
 * This file exists so the desk can be *operated* rather than read: pick a
 * strategy, run it, watch the log, and get the four questions answered in the
 * order they actually matter. It talks to the local server and nothing else —
 * no bundler, no framework, no network beyond 127.0.0.1.
 *
 * Three rules are load-bearing here:
 *   1. Every point estimate is drawn with its interval. If the interval
 *      straddles zero it turns amber, and the headline says so.
 *   2. Server strings are only ever inserted as text nodes. There is no
 *      innerHTML in this file, deliberately.
 *   3. Anything this page decides about a form is a courtesy, never the
 *      decision. The cross-parameter rules evaluated below are the server's own,
 *      published with the form; when the two disagree the server is right and
 *      this file is wrong, and every run is still validated on the way in.
 *
 * Where it lies to you: the console clock is the page's own stopwatch, not the
 * job's, so it counts the poll latency too; and a panel drawn by models.js or
 * tape.js is drawn from a thinned copy of the result, never the archive.
 */

"use strict";

window.__HEYJAMIE__ = true;

var META = document.querySelector('meta[name="heyjamie-token"]');
var TOKEN = META ? META.getAttribute("content") : "";
var POLL_MS = 400;
var MAX_POINTS = 1200;
var SVG_NS = "http://www.w3.org/2000/svg";

// The three strategy runs, then the five model analyses. The models draw
// themselves in models.js and take their own parameters, on their own rail;
// everything else about them — the token, the job poll, the console, the
// history — is shared with the three above, deliberately.
var MODEL_KINDS = ["statarb", "factors", "var", "ml", "optimize"];

// The Opening Tape: one ticker through every model (dossier), and one universe
// through the screener (screen). Same POST /api/run, same job poll, same 409
// when the desk is busy, same console. They draw themselves in tape.js.
var TAPE_KINDS = ["dossier", "screen"];

// The whole book: several assets, across several asset classes, on one calendar
// and one bill. One more job kind on the same rails as the ten above — same
// POST /api/run, same poll, same console — and the only one whose form is built
// by you rather than published as a schema. portfolio.js draws it.
var PORTFOLIO_KIND = "portfolio";

var state = {
  meta: null,          // GET /api/state
  strategy: null,      // selected strategy key
  paramFields: [],     // [{key, type, input}]
  modelKind: null,     // selected model key, or null
  modelFields: {},     // kind -> [{key, type, min, max, nullable, rules, input|boxes}]
  modelRules: {},      // kind -> the server's cross-parameter rules, as published
  violations: {},      // kind -> [{id, params, message, bounds}] right now
  presets: [],         // the screener's presets, as published
  screenReady: false,  // did the server publish a universe and a preset to pick?
  // The book you are building, and the lists the server published to build it
  // from. `holdings` is the only piece of desk state a form does not hold: the
  // picker is a list, and a list of inputs cannot be read back the way a select
  // can, because a removed row has to take its weight with it.
  pf: { spec: null, ready: false, holdings: [] },
  results: { backtest: null, validate: null, paper: null,
             statarb: null, factors: null, var: null, ml: null, optimize: null,
             dossier: null, screen: null, portfolio: null },
  busy: false,
  closed: false
};

// models.js is optional: if it failed to load the desk still answers its first
// four questions, and the model buttons report the failure like any other.
function models() { return window.__MODELS__ || null; }

// tape.js is optional in exactly the same way, and guarded the same way. It
// draws; it never fetches. Everything it is handed came through the functions
// below.
function tape() { return window.__TAPE__ || null; }

// portfolio.js is optional in exactly the same way, and guarded the same way.
function book() { return window.__PORTFOLIO__ || null; }

function isModelKind(kind) { return MODEL_KINDS.indexOf(String(kind)) >= 0; }

function isTapeKind(kind) { return TAPE_KINDS.indexOf(String(kind)) >= 0; }

function isPortfolioKind(kind) { return String(kind) === PORTFOLIO_KIND; }

/* Look through the job envelope to the payload underneath.
 *
 * Every run comes back as {kind, title, question, subject, params, model, verdict}
 * with the real result under `model`. models.js has its own copy of this because
 * the two files must keep working independently — if models.js fails to load the
 * tape still has to draw. The merge direction matters: the envelope wins, and any
 * key the payload owns that the envelope also owns is preserved as `model_<key>`.
 * That collision is not hypothetical — `verdict` is the desk's grading in the
 * envelope and a paragraph of the model's own prose underneath it. */
function unwrapEnvelope(kind, res) {
  if (!res || typeof res !== "object" || Array.isArray(res)) return res;
  var inner = res[kind] || res.model;
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return res;
  var out = {}, k;
  for (k in inner) if (has(inner, k)) out[k] = inner[k];
  for (k in res) if (has(res, k)) {
    if (has(inner, k) && !has(out, "model_" + k)) out["model_" + k] = inner[k];
    out[k] = res[k];
  }
  return out;
}

function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }


/* ------------------------------------------------------------------ DOM */

function h(tag, attrs, kids) { return build(document.createElement(tag), attrs, kids); }
function s(tag, attrs, kids) { return build(document.createElementNS(SVG_NS, tag), attrs, kids); }

function build(node, attrs, kids) {
  if (attrs) {
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "text") node.appendChild(document.createTextNode(String(v)));
      else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  addKids(node, kids);
  return node;
}

function addKids(node, kids) {
  if (kids === null || kids === undefined || kids === false) return;
  if (Array.isArray(kids)) { for (var i = 0; i < kids.length; i++) addKids(node, kids[i]); return; }
  node.appendChild(kids.nodeType ? kids : document.createTextNode(String(kids)));
}

function $(id) { return document.getElementById(id); }

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function fill(node, kids) { clear(node); addKids(node, kids); return node; }

function show(node, on) { if (on) node.removeAttribute("hidden"); else node.setAttribute("hidden", ""); }


/* --------------------------------------------------------------- format */

function isNum(v) { return typeof v === "number" && isFinite(v); }

function fx(v, d, signed) {
  if (!isNum(v)) return "—";
  var t = v.toFixed(d === undefined ? 2 : d);
  return signed && v >= 0 ? "+" + t : t;
}

function fpct(v, d, signed) {
  if (!isNum(v)) return "—";
  var t = (v * 100).toFixed(d === undefined ? 2 : d) + "%";
  return signed && v >= 0 ? "+" + t : t;
}

function clock(ms) {
  var sec = ms / 1000;
  if (sec < 60) return sec.toFixed(1) + "s";
  return Math.floor(sec / 60) + "m " + String(Math.floor(sec % 60)).padStart(2, "0") + "s";
}

/* Mirrors config._slug so a saved run can be fetched by name. */
function slugify(name) {
  var out = "";
  var low = String(name).toLowerCase();
  for (var i = 0; i < low.length; i++) {
    var c = low[i];
    out += (/[a-z0-9\-_]/.test(c) ? c : "-");
  }
  return out.slice(0, 60);
}

/* Thin a series to `max` points, keeping holes as holes.
 *
 * A value the engine could not compute arrives as JSON null (api.jsonable turns
 * every non-finite float into None). Number(null) is 0, so coercing here would
 * plant a measured zero in the middle of an equity path and draw the account
 * going to nothing. Nulls survive the thinning and the caller breaks its line
 * at them. */
function downsample(arr, max) {
  var v = [];
  for (var i = 0; i < (arr || []).length; i++) v.push(numOrNull(arr[i]));
  if (v.length <= max) return v;
  var out = [], step = (v.length - 1) / (max - 1);
  for (var j = 0; j < max; j++) out.push(v[Math.round(j * step)]);
  out[out.length - 1] = v[v.length - 1];
  return out;
}


/* ------------------------------------------------------------------ api */

function DeskError(message, status) {
  this.name = "DeskError";
  this.message = message;
  this.status = status || 0;
}
DeskError.prototype = Object.create(Error.prototype);

function api(path, opts) {
  opts = opts || {};
  var init = { method: opts.method || "GET", headers: { "X-HeyJamie-Token": TOKEN } };
  if (opts.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  return fetch(path, init).catch(function () {
    throw new DeskError("The desk did not answer " + path + ". The local server may have stopped — relaunch the app.");
  }).then(function (res) {
    return res.text().then(function (raw) {
      var data = null, parseFailed = false;
      if (raw) {
        try { data = JSON.parse(raw); } catch (e) { parseFailed = true; }
      }
      if (!res.ok) {
        var msg = (data && data.error) ? data.error : (res.status + " " + res.statusText);
        if (res.status === 403) {
          msg = "The desk rejected that request (" + msg + "). This page's token is stale — " +
                "reopen the desk from the launcher.";
        }
        throw new DeskError(msg, res.status);
      }
      // A bare NaN or Infinity is what Python's json.dumps writes by default and
      // what JSON.parse refuses. Say so rather than polling a job forever.
      if (parseFailed) {
        throw new DeskError("The desk answered " + path + " with something the browser could not read. " +
                            "If a metric came back NaN or Infinity it must be serialised as null.");
      }
      return data;
    });
  });
}

function showError(err) {
  var msg = (err && err.message) ? err.message : String(err);
  $("banner-text").textContent = msg;
  show($("banner"), true);
}

function clearError() { show($("banner"), false); }


/* -------------------------------------------------------- draw: interval */

/* The signature element. A value drawn as a range against a zero line;
 * straddling zero is the thing you most need to notice, so it is the thing
 * that changes colour. */
function intervalBar(lo, mid, hi, label) {
  if (!isNum(lo) || !isNum(hi)) {
    return h("div", { "class": "iv-empty", text: "not enough data to bound this" });
  }
  var reach = Math.max(Math.abs(lo), Math.abs(hi), isNum(mid) ? Math.abs(mid) : 0);
  var m = Math.max(3, reach * 1.2);
  var d0 = -m, span = 2 * m;
  var pos = function (v) { return Math.max(0, Math.min(100, (v - d0) / span * 100)); };
  var left = pos(lo), right = pos(hi), zero = pos(0);
  var width = Math.max(right - left, 0.6);
  var tone = (lo <= 0 && 0 <= hi) ? "doubt" : (hi < 0 ? "fault" : "signal");

  var shapes = [
    s("line", { "class": "iv-edge", x1: "0", y1: "0.5", x2: "100%", y2: "0.5" }),
    s("line", { "class": "iv-edge", x1: "0", y1: "27.5", x2: "100%", y2: "27.5" }),
    s("line", { "class": "iv-zero", x1: zero.toFixed(2) + "%", y1: "0", x2: zero.toFixed(2) + "%", y2: "28" }),
    s("rect", { "class": "iv-range", x: left.toFixed(2) + "%", y: "10", width: width.toFixed(2) + "%", height: "8", rx: "1" })
  ];
  if (isNum(mid)) {
    var t = pos(mid).toFixed(2) + "%";
    shapes.push(s("line", { "class": "iv-tick", x1: t, y1: "3", x2: t, y2: "25" }));
  }

  return h("div", { "class": "iv iv-" + tone }, [
    s("svg", { "class": "iv-svg", height: "30", role: "img", "aria-label": label || "interval" }, shapes),
    h("div", { "class": "iv-scale" }, [
      h("span", { text: fx(lo, 2, true) }),
      h("span", { "class": "iv-mid", text: fx(mid, 2, true) }),
      h("span", { text: fx(hi, 2, true) })
    ]),
    label ? h("div", { "class": "iv-label", text: label }) : null
  ]);
}


/* -------------------------------------------------------- draw: sparkline */

/* Equity path. Drawn, not plotted — no axes, because the shape is the point.
 *
 * The line BREAKS wherever the series has a hole, the same way models.js draws
 * every series. Bridging a hole draws a line through data that does not exist;
 * plotting it as zero is worse still, because it looks like a measurement. */
function sparkline(values, label) {
  var v = downsample(values, MAX_POINTS);
  var fin = [];
  for (var i = 0; i < v.length; i++) if (isNum(v[i])) fin.push(v[i]);
  if (fin.length < 2) {
    return h("div", { "class": "empty", text: "No equity path recorded yet." });
  }
  var w = 880, ht = 180;
  var lo = Math.min.apply(null, fin), hi = Math.max.apply(null, fin);
  var rng = (hi - lo) || 1;
  var y = function (val) { return ht - (val - lo) / rng * (ht - 12) - 6; };
  var x = function (idx) { return idx / (v.length - 1) * w; };

  var segs = [], cur = [], holes = 0;
  for (i = 0; i < v.length; i++) {
    if (isNum(v[i])) {
      cur.push(x(i).toFixed(1) + "," + y(v[i]).toFixed(1));
    } else {
      holes++;
      if (cur.length > 1) segs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) segs.push(cur);

  var base = fin[0];
  var up = fin[fin.length - 1] >= base;
  var stroke = "spark-line " + (up ? "up" : "down");

  return h("div", {}, [
    s("svg", { "class": "spark", viewBox: "0 0 " + w + " " + ht, role: "img", "aria-label": label || "equity path" },
      [
        s("line", { "class": "spark-peak", x1: "0", y1: y(hi).toFixed(1), x2: String(w), y2: y(hi).toFixed(1) }),
        s("line", { "class": "spark-base", x1: "0", y1: y(base).toFixed(1), x2: String(w), y2: y(base).toFixed(1) })
      ].concat(segs.map(function (pts) {
        return s("polyline", { "class": stroke, points: pts.join(" ") });
      }))),
    h("div", { "class": "spark-legend" }, [
      h("span", {}, [h("i", { "class": "k-base" }), "opening equity"]),
      h("span", {}, [h("i", { "class": "k-peak" }), "high-water mark"]),
      h("span", { text: fin.length + " marks" }),
      holes ? h("span", { text: holes + " bar(s) the engine could not value — the line breaks there" }) : null
    ])
  ]);
}


/* ------------------------------------------------------------ draw: folds */

/* Every fold gets its own bar around a shared zero line. The spread between
 * them is the reading, not the mean. */
function foldBars(folds) {
  var vals = [];
  for (var i = 0; i < folds.length; i++) if (isNum(folds[i].sharpe)) vals.push(folds[i].sharpe);
  if (!vals.length) {
    return h("div", { "class": "empty", text: "Every fold returned NaN. Check the warmup window against the test size." });
  }
  var m = Math.max(Math.abs(Math.min.apply(null, vals)), Math.abs(Math.max.apply(null, vals)), 1);

  var rows = folds.map(function (f, idx) {
    var v = f.sharpe;
    var n = isNum(f.i) ? f.i : idx + 1;
    var when = (f.start && f.end) ? (f.start + " → " + f.end) : "";
    var bar = null;
    if (isNum(v)) {
      var pctw = Math.max(Math.abs(v) / m * 50, 0.4);
      var left = v >= 0 ? 50 : 50 - pctw;
      bar = s("rect", {
        "class": "fold-bar " + (v >= 0 ? "pos" : "neg"),
        x: left.toFixed(2) + "%", y: "2", width: pctw.toFixed(2) + "%", height: "10", rx: "1"
      });
    }
    return h("div", { "class": "fold", title: when }, [
      h("span", { "class": "fold-n", text: String(n).padStart(2, "0") }),
      h("div", { "class": "fold-track" }, [
        s("svg", { "class": "fold-svg", height: "14", role: "img",
                   "aria-label": "fold " + n + " net Sharpe " + fx(v, 2, true) }, [
          s("line", { "class": "fold-mid", x1: "50%", y1: "0", x2: "50%", y2: "14" }),
          bar
        ])
      ]),
      h("span", { "class": "fold-v", text: fx(v, 2, true) })
    ]);
  });
  return h("div", {}, rows);
}


/* ------------------------------------------------------------- verdict */

/* The client can always answer this itself, which matters when a saved run is
 * read back from disk without a verdict attached. */
function verdictFor(lo, hi, trials) {
  if (!isNum(lo) || !isNum(hi)) {
    return { state: "doubt", headline: "Not enough data to bound this",
             body: "The bootstrap could not put an interval around this number. Longer history, or fewer parameters." };
  }
  if (lo <= 0 && 0 <= hi) {
    return { state: "doubt", headline: "No edge demonstrated",
             body: "The Sharpe confidence interval contains zero, so the result is consistent with luck. " +
                   "That is not a failure of the strategy — it is the measurement doing its job. Do not size this." };
  }
  if (hi < 0) {
    return { state: "fault", headline: "Reliably negative",
             body: "The interval sits below zero. This loses money net of costs with some confidence, " +
                   "which is genuinely useful to know. Log it and move on." };
  }
  return { state: "signal", headline: "Interval clears zero",
           body: "The interval clears zero. Next question: does it clear it after correcting for the " +
                 (trials || 1) + " variant(s) you tried? Read the deflated figure below, not the raw one." };
}

function haircut(raw, deflated, trials) {
  if (!isNum(raw) || !isNum(deflated) || !trials || trials < 2) {
    return h("div", { "class": "haircut" }, [
      h("span", { "class": "hc-note" }, [
        "One variant tested, so there is nothing to deflate. Raise ",
        h("b", { text: "trials" }),
        " to the number of variants you actually tried — the adjustment is the honest part."
      ])
    ]);
  }
  var survived = deflated > 0;
  return h("div", { "class": "haircut" }, [
    h("div", { "class": "hc-row" }, [
      h("span", { "class": "hc-k", text: "raw" }),
      h("span", { "class": "hc-v", text: fx(raw, 2, true) }),
      h("span", { "class": "hc-arrow", text: "after " + trials + " trials" }),
      h("span", { "class": "hc-v " + (survived ? "hc-signal" : "hc-doubt"), text: fx(deflated, 2, true) })
    ]),
    h("span", { "class": "hc-note",
      text: survived ? "Still above zero once the search is paid for."
                     : "Testing that many variants explains the result on its own." })
  ]);
}


/* -------------------------------------------------------- normalisation */

/* Saved RunRecords carry the CLI's payload shape, which is close to but not
 * identical to a job result. Everything downstream reads the job shape, so
 * translate once, here. */
function normalise(kind, p) {
  if (!p) return null;
  // The models already serialise themselves JSON-safely, so there is no shape
  // to repair — only the job envelope to look through.
  if (isModelKind(kind)) return models() ? models().normalise(kind, p) : p;
  // A dossier and a screen are handed to tape.js with their CONTENT untouched —
  // this file has no opinion about their shape and must not acquire one, since a
  // payload repaired here and drawn there is two files disagreeing about what a
  // null means. Looking through the job envelope is not an opinion about the
  // content, though, and skipping it is what left every tape panel blank: the
  // backend ships the real payload under "model", exactly as it does for the
  // nine models, and tape.js reads those fields at the top level.
  if (isTapeKind(kind)) return unwrapEnvelope(kind, p);
  // A portfolio is handed to portfolio.js with its CONTENT untouched, for the
  // same reason a dossier is: PortfolioResult.to_dict() is already JSON-safe,
  // and a payload repaired here and drawn there is two files disagreeing about
  // what a null means. Only the job envelope is looked through.
  if (isPortfolioKind(kind)) return unwrapEnvelope(kind, p);
  var out = {};
  for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k];

  if (kind === "backtest") {
    var ci = out.sharpe_ci || [null, null];
    if (!out.verdict) {
      out.verdict = verdictFor(numOrNull(ci[0]), numOrNull(ci[1]), out.n_trials);
    }
  } else if (kind === "validate") {
    if (!Array.isArray(out.folds)) {
      out.folds = (out.fold_sharpes || []).map(function (v, i) {
        return { i: i + 1, sharpe: numOrNull(v) };
      });
    }
    if (!out.summary) out.summary = summarise(out.folds);
    if (out.disagree === undefined) {
      var vs = finiteSharpes(out.folds);
      out.disagree = vs.length > 1 && (Math.max.apply(null, vs) - Math.min.apply(null, vs)) > 1.5;
    }
  } else if (kind === "paper") {
    // Only an actual fills array licenses deriving the count from it. A null
    // count with no array is an unknown, and `(out.fills || []).length` would
    // report the unknown as a measured zero fills.
    if (!isNum(out.n_fills)) {
      out.n_fills = Array.isArray(out.fills) ? out.fills.length : numOrNull(out.n_fills);
    }
  }
  return out;
}

// Number(null) is 0 and Number("") is 0. Letting either through would turn a
// figure the engine could not compute into a measured zero, which is the exact
// confusion this desk exists to prevent.
function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function finiteSharpes(folds) {
  var v = [];
  for (var i = 0; i < (folds || []).length; i++) if (isNum(folds[i].sharpe)) v.push(folds[i].sharpe);
  return v;
}

function summarise(folds) {
  var v = finiteSharpes(folds).slice().sort(function (a, b) { return a - b; });
  if (!v.length) return { folds: 0 };
  var n = v.length;
  var mean = v.reduce(function (a, b) { return a + b; }, 0) / n;
  var med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  var varr = v.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (n > 1 ? n - 1 : 1);
  var pos = v.filter(function (x) { return x > 0; }).length / n;
  return { folds: n, mean: mean, median: med, std: Math.sqrt(varr), min: v[0], max: v[n - 1], pct_positive: pos };
}


/* --------------------------------------------------------------- render */

function paint() {
  var b = state.results.backtest, v = state.results.validate, p = state.results.paper;
  var anyModel = models() ? models().paint(state.results) : false;
  var anyTape = paintTape();
  var anyBook = paintPortfolio();
  show($("nothing"), !b && !v && !p && !anyModel && !anyTape && !anyBook);
  show($("q-real"), !!b);
  show($("q-cost"), !!b);
  show($("q-survive"), !!v);
  show($("q-now"), !!p);
  if (b) { renderReal(b); renderCost(b); }
  if (v) renderSurvive(v);
  if (p) renderNow(p);
}

function renderReal(r) {
  var ci = r.sharpe_ci || [null, null];
  var lo = numOrNull(ci[0]), hi = numOrNull(ci[1]);
  var sharpe = r.net ? numOrNull(r.net.sharpe) : null;
  var vd = r.verdict || verdictFor(lo, hi, r.n_trials);
  var name = r.name || "unnamed run";
  var subject = (r.subject && name.indexOf(r.subject) < 0) ? "  ·  " + r.subject : "";

  fill($("c-real"), [
    h("p", { "class": "subject", text: name + subject }),
    h("p", { "class": "verdict " + (vd.state || "doubt"), text: vd.headline || "—" }),
    h("p", { "class": "verdict-sub", text: vd.body || "" }),
    intervalBar(lo, sharpe, hi, "net Sharpe · 95% block-bootstrap interval"),
    haircut(sharpe, numOrNull(r.deflated_sharpe), r.n_trials),
    r.hypothesis ? h("div", { "class": "haircut" }, [
      h("span", { "class": "hc-k", text: "hypothesis under test" }),
      h("span", { "class": "hc-note", text: r.hypothesis })
    ]) : null
  ]);
}

function cell(label, value, tone, note) {
  return h("div", { "class": "cell" }, [
    h("dt", { text: label }),
    h("dd", { "class": tone || "", text: value }),
    h("small", { text: note || "" })
  ]);
}

function renderCost(r) {
  var g = r.gross || {}, n = r.net || {};
  var neg = function (v) { return isNum(v) && v < 0 ? "neg" : ""; };
  fill($("c-cost"), [
    cell("Gross CAGR", fpct(g.cagr, 2, true), neg(g.cagr), "before costs"),
    cell("Net CAGR", fpct(n.cagr, 2, true), neg(n.cagr), "what you keep"),
    cell("Gross Sharpe", fx(g.sharpe, 2, true), neg(g.sharpe), "before costs"),
    cell("Net Sharpe", fx(n.sharpe, 2, true), neg(n.sharpe), "the only one that counts"),
    cell("Cost drag", fpct(r.cost_drag, 2), "amber", "given up per year"),
    cell("Turnover", fx(n.turnover, 1), "", "times per year"),
    cell("Max drawdown", fpct(n.max_drawdown, 2), "neg",
         (isNum(n.max_dd_duration) ? n.max_dd_duration : "—") + " bars underwater"),
    cell("Hit rate", fpct(n.hit_rate, 1), "", "bars in profit")
  ]);
}

function renderSurvive(r) {
  var sm = r.summary || summarise(r.folds || []);
  var vals = finiteSharpes(r.folds || []);
  var spread = vals.length ? (Math.max.apply(null, vals) - Math.min.apply(null, vals)) : null;

  // `sm.folds || 0` printed "0 folds" for a summary that never counted them.
  // Zero folds is a finding; an uncounted fold count is not.
  var nFolds = numOrNull(sm.folds);

  var read = h("p", { "class": "fold-read" }, [
    (nFolds === null ? "—" : nFolds) + " folds · " +
    (isNum(sm.pct_positive) ? Math.round(sm.pct_positive * 100) + "% positive" : "—") +
    " · mean " + fx(sm.mean, 2, true) +
    " · median " + fx(sm.median, 2, true) +
    " · sd " + fx(sm.std, 2) +
    " · range " + fx(sm.min, 2, true) + " to " + fx(sm.max, 2, true) +
    (isNum(spread) ? " · spread " + fx(spread, 2) + " Sharpe" : "")
  ]);

  fill($("c-survive"), [
    h("p", { "class": "subject",
      text: (r.subject || "") + "  ·  train " + (r.train || "—") + " / test " + (r.test || "—") + " bars" }),
    foldBars(r.folds || []),
    read,
    r.disagree ? h("div", { "class": "disagree",
      text: "The folds disagree with each other more than they agree. Treat the mean as decoration, " +
            "not evidence — a strategy that only works in some windows has not been shown to work." }) : null
  ]);
}

function renderNow(r) {
  var ratio = numOrNull(r.cost_ratio);
  var halted = !!r.halted;
  var bars = numOrNull(r.bars);

  var tape = h("ul", { "class": "tape" }, (function () {
    var lines = (r.decisions || []).slice(-60).reverse();
    if (!lines.length) return [h("li", { text: "No decisions logged yet." })];
    return lines.map(function (line) {
      var cls = line.indexOf("HALT") >= 0 ? "halt" : (line.indexOf("TRADE") >= 0 ? "trade" : "");
      return h("li", { "class": cls, text: line });
    });
  })());

  fill($("c-now"), [
    h("p", { "class": "subject",
      text: (r.symbol || "—") + "  ·  " + (r.strategy || "—") + "  ·  " +
            (bars === null ? "—" : bars) + " bars traded" }),
    h("div", { "class": "kill" }, [
      h("span", { "class": "k-state " + (halted ? "tripped" : "armed"),
                  text: halted ? "KILL SWITCH TRIPPED" : "kill switch armed, not tripped" }),
      halted ? h("span", { "class": "k-why", text: r.halt_reason || "no reason recorded" }) : null
    ]),
    sparkline(r.equity_curve || [], "paper equity path"),
    h("dl", { "class": "grid", style: "margin-top:22px" }, [
      cell("Session return", fpct(r.total_return, 2, true),
           isNum(r.total_return) && r.total_return < 0 ? "neg" : "pos", "opening to close"),
      cell("Equity", isNum(r.ending_equity) ? Math.round(r.ending_equity).toLocaleString("en-US") : "—", "",
           "from " + (isNum(r.starting_equity) ? Math.round(r.starting_equity).toLocaleString("en-US") : "—")),
      cell("Modelled cost", fx(r.modelled_cost_bps, 1), "", "bps per turn"),
      cell("Realised cost", fx(r.realised_cost_bps, 1), isNum(ratio) && ratio > 1.5 ? "amber" : "", "bps actually paid"),
      cell("Cost ratio", fx(ratio, 2), isNum(ratio) && ratio > 1.5 ? "amber" : "",
           "over 1.5 = the backtest is optimistic"),
      cell("Fills", isNum(r.n_fills) ? String(r.n_fills) : "—", "", "orders executed")
    ]),
    (isNum(ratio) && ratio > 1.5) ? h("div", { "class": "disagree",
      text: "Realised costs ran " + fx(ratio, 2) + "x the model. Any backtest priced at the modelled " +
            "cost is flattering itself; re-run the backtest with the realised figure before believing it." }) : null,
    tape
  ]);
}


/* ------------------------------------------------------------------ rail */

function renderStrategies(list) {
  var box = $("pick-strategy");
  if (!list || !list.length) {
    fill(box, h("p", { "class": "loading", text: "No strategies registered." }));
    return;
  }
  fill(box, list.map(function (st) {
    var id = "st-" + st.key;
    return h("div", {}, [
      h("input", { type: "radio", name: "strategy", id: id, value: st.key,
                   checked: st.key === state.strategy,
                   onchange: function () { selectStrategy(st.key); } }),
      h("label", { "for": id }, [
        h("b", { text: st.key }),
        h("small", { text: st.doc || st.class_name || "" })
      ])
    ]);
  }));
}

function currentStrategy() {
  var list = (state.meta && state.meta.strategies) || [];
  for (var i = 0; i < list.length; i++) if (list[i].key === state.strategy) return list[i];
  return null;
}

function selectStrategy(key) {
  state.strategy = key;
  var st = currentStrategy();
  $("hypothesis-text").textContent = st && st.hypothesis
    ? st.hypothesis
    : "UNSTATED — write your economic hypothesis before backtesting.";
  renderParams(st);
}

/* One control per dataclass field, typed from the server's declared type. */
function renderParams(st) {
  var box = $("params");
  state.paramFields = [];
  if (!st || !st.params || !st.params.length) {
    fill(box, h("p", { "class": "note", text: "This strategy takes no parameters." }));
    return;
  }
  fill(box, st.params.map(function (p) {
    var id = "p-" + p.key;
    var input;
    if (p.type === "bool") {
      input = h("input", { type: "checkbox", id: id, checked: !!p.default });
    } else if (p.type === "int") {
      input = h("input", { type: "number", id: id, step: "1", value: String(p.default) });
    } else if (p.type === "float") {
      input = h("input", { type: "number", id: id, step: "0.1", value: String(p.default) });
    } else {
      input = h("input", { type: "text", id: id, value: p.default === null || p.default === undefined ? "" : String(p.default) });
    }
    state.paramFields.push({ key: p.key, type: p.type, input: input });
    return h("div", { "class": "field" }, [
      h("label", { "for": id }, [p.key, h("em", { text: p.type })]),
      input
    ]);
  }));
}

function renderAssetClasses(meta) {
  var sel = $("in-asset");
  fill(sel, (meta.asset_classes || ["equity"]).map(function (a) {
    return h("option", { value: a, text: a, selected: a === "equity" });
  }));
  updateCostNote();
}

/* What a turn costs, quoted from the server's own CostModel.
 *
 * Two things this used to get wrong, both of which printed a number nobody
 * measured. It halved the spread, which no longer matches the engine:
 * `CostModel.per_turn_bps` is `spread_bps + commission_bps + slippage_bps`,
 * full stop (backtest/engine.py) — the half-spread convention is already baked
 * into the configured `spread_bps`. And it pushed each component through a bare
 * `Number()`, so three JSON nulls summed to a confident "0.0 bps charged per
 * turn": an advertisement for free trading, computed from nothing.
 *
 * The server's `per_turn_bps` is authoritative. The local sum is only a
 * fallback for a payload that omits it, and it only runs when all three
 * components are real numbers — two components cannot be added into three. */
function updateCostNote() {
  var a = $("in-asset").value;
  var costs = (state.meta && state.meta.costs) || {};
  var c = costs[a];
  if (!c) { $("cost-note").textContent = " "; return; }

  var spread = numOrNull(c.spread_bps);
  var comm = numOrNull(c.commission_bps);
  var slip = numOrNull(c.slippage_bps);
  var per = numOrNull(c.per_turn_bps);
  if (per === null && isNum(spread) && isNum(comm) && isNum(slip)) per = spread + comm + slip;

  $("cost-note").textContent =
    a + ": spread " + fx(spread, 1) + " · commission " + fx(comm, 1) + " · slippage " +
    fx(slip, 1) + " bps → " + fx(per, 1) + " bps charged per turn. " +
    "These are assumptions, not quotes.";
}

function sourceIsSymbol() { return $("src-symbol").checked; }

function updateSource() {
  var sym = sourceIsSymbol();
  show($("f-symbol"), sym);
  show($("f-start"), sym);
  show($("f-bars"), !sym);
  show($("f-seed"), !sym);
  $("source-note").textContent = sym
    ? "A real ticker needs the network and the yfinance loader. Offline, this will fail — and that is a real failure, not a bug."
    : "Generated offline with a fixed seed. Nothing leaves this machine. Also: it has no edge in it, which makes it an honest control.";
  $("source-note").className = sym ? "note warn" : "note";
}

function readForm(kind) {
  if (!state.strategy) throw new DeskError("Pick a strategy first.");
  var params = {};
  for (var i = 0; i < state.paramFields.length; i++) {
    var f = state.paramFields[i];
    if (f.type === "bool") { params[f.key] = f.input.checked; continue; }
    if (f.type === "int" || f.type === "float") {
      var raw = String(f.input.value).trim();
      if (raw === "") throw new DeskError("Parameter " + f.key + " is empty.");
      var n = Number(raw);
      if (!isFinite(n)) throw new DeskError("Parameter " + f.key + " is not a number.");
      params[f.key] = f.type === "int" ? Math.round(n) : n;
      continue;
    }
    params[f.key] = f.input.value;
  }

  var sym = sourceIsSymbol();
  var symbol = $("in-symbol").value.trim();
  if (sym && !symbol) throw new DeskError("Give it a ticker, or switch the data source back to Synthetic.");

  var intOf = function (id, label) {
    var raw = String($(id).value).trim();
    if (raw === "") throw new DeskError(label + " is empty.");
    var v = Number(raw);
    if (!isFinite(v)) throw new DeskError(label + " must be a whole number.");
    return Math.round(v);
  };

  return {
    kind: kind,
    strategy: state.strategy,
    params: params,
    data: {
      source: sym ? "symbol" : "synthetic",
      symbol: sym ? symbol : null,
      start: $("in-start").value.trim() || "2015-01-01",
      bars: intOf("in-bars", "bars"),
      seed: intOf("in-seed", "seed")
    },
    asset_class: $("in-asset").value,
    trials: intOf("in-trials", "trials"),
    train: intOf("in-train", "train"),
    test: intOf("in-test", "test"),
    warmup: intOf("in-warmup", "warmup")
  };
}


/* ----------------------------------------------------------- rail: models */

/* A model is not a strategy and does not take a strategy's form. It takes its
 * own declared parameters and nothing else: the server validates the body
 * against that model's schema and refuses any key the model never declared, so
 * posting the strategy rail at a model is a 400 every time.
 *
 * So the five models get their own rail, built the same way the strategy form
 * is built — one control per parameter, typed, bounded and documented by the
 * server's own schema in state.meta.models. Nothing about a model's parameters
 * is written down in this file. All five forms are built once and kept, so the
 * values you set for one model survive running another, and "run all five"
 * sends each model the settings you can see. */

function modelSpecs() { return (state.meta && state.meta.models) || []; }

function modelSpecOf(kind) {
  var list = modelSpecs();
  for (var i = 0; i < list.length; i++) if (list[i].key === kind) return list[i];
  return null;
}

/* "int · 400–20000", so the bound the server will enforce is on the label
 * rather than discovered by being rejected. */
function typeNote(p) {
  var out = p.type;
  if (isNum(numOrNull(p.min)) && isNum(numOrNull(p.max))) {
    out += " · " + p.min + "–" + p.max;
  }
  if (p.nullable) out += " · optional";
  return out;
}

function modelField(kind, p) {
  var id = "mp-" + kind + "-" + p.key;
  var helpId = id + "-help";
  var ruleId = id + "-rule";
  var help = p.help || "";
  var f = { key: p.key, type: p.type, nullable: !!p.nullable,
            min: numOrNull(p.min), max: numOrNull(p.max),
            rules: (p.rules || []).slice(), dependsOn: (p.depends_on || []).slice(),
            input: null, boxes: null };
  state.modelFields[kind].push(f);

  // Every control that can take part in a cross-parameter rule re-evaluates the
  // whole form as it is typed in. `depends_on` says which other knobs can change
  // this one's legality, and it is printed under the control for the same reason
  // the rules are evaluated at all: so a constraint is readable before it is a
  // 400. The subscription is deliberately coarse — one model's rules are two
  // comparisons, and evaluating both costs nothing next to a keystroke.
  var watch = function () { refreshRules(kind); };

  // A list-valued parameter is a set of checkboxes in its own group, so the
  // whole set carries one label and one description.
  if (p.type === "multi") {
    var opts = p.options || [];
    var chosen = Array.isArray(p.default) ? p.default : [];
    f.boxes = [];
    var rows = opts.map(function (o, i) {
      var oid = id + "-" + i;
      var box = h("input", { type: "checkbox", id: oid, value: o,
                             checked: chosen.indexOf(o) >= 0, onchange: watch });
      f.boxes.push(box);
      return h("div", { "class": "field" }, [h("label", { "for": oid, text: o }), box]);
    });
    return h("fieldset", { "class": "fields", style: "border:0;padding:0;margin:0",
                           "aria-describedby": helpId }, [
      h("legend", { "class": "rail-h", style: "margin-bottom:10px",
                    text: p.key + " · " + p.type }),
      rows,
      h("p", { "class": "note", id: helpId, style: "margin-top:4px", text: help }),
      h("p", { "class": "note", id: ruleId, style: "margin-top:4px", hidden: true })
    ]);
  }

  var input;
  if (p.type === "bool") {
    input = h("input", { type: "checkbox", id: id, checked: !!p.default,
                         "aria-describedby": helpId, onchange: watch });
  } else if (p.type === "choice") {
    input = h("select", { id: id, "aria-describedby": helpId, onchange: watch },
      (p.options || []).map(function (o) {
        return h("option", { value: o, text: o, selected: o === p.default });
      }));
  } else if (p.type === "int" || p.type === "float") {
    input = h("input", {
      type: "number", id: id,
      step: p.type === "int" ? "1" : "any",
      min: p.min === null || p.min === undefined ? null : String(p.min),
      max: p.max === null || p.max === undefined ? null : String(p.max),
      value: p.default === null || p.default === undefined ? "" : String(p.default),
      "aria-describedby": helpId, oninput: watch, onchange: watch
    });
  } else {
    input = h("input", { type: "text", id: id, "aria-describedby": helpId,
                         oninput: watch, onchange: watch,
                         value: p.default === null || p.default === undefined ? "" : String(p.default) });
  }
  f.input = input;

  return h("div", {}, [
    h("div", { "class": "field", title: help }, [
      h("label", { "for": id }, [p.key, h("em", { text: typeNote(p) })]),
      input
    ]),
    h("p", { "class": "note", id: helpId, style: "margin-top:4px", text: help }),
    h("p", { "class": "note", id: ruleId, style: "margin-top:4px", hidden: true })
  ]);
}

function modelPanel(m) {
  state.modelFields[m.key] = [];
  // The rules travel with the form and are kept beside the fields they refuse.
  state.modelRules[m.key] = (m.rules || []).slice();
  state.violations[m.key] = [];
  return h("div", { id: "model-fields-" + m.key, "class": "fields", hidden: true },
    (m.params || []).map(function (p) { return modelField(m.key, p); }));
}

/* The rail markup is built here rather than in index.html because the set of
 * models, and every control in every one of their forms, is the server's to
 * declare. */
function renderModelRail(list) {
  var rail = document.querySelector(".rail");
  if (!rail) return;
  state.modelFields = {};
  state.modelRules = {};
  state.violations = {};

  var form = $("model-form");
  if (!form) {
    form = h("form", { id: "model-form", autocomplete: "off", novalidate: true,
                       onsubmit: function (ev) {
                         ev.preventDefault();
                         if (!state.busy && state.modelKind) runOne(state.modelKind).catch(function () {});
                       } });
    rail.appendChild(form);
  }
  clear(form);

  if (!list || !list.length) {
    addKids(form, h("section", { "class": "rail-sec" }, [
      h("h3", { "class": "rail-h", text: "Model" }),
      h("p", { "class": "note", text: "No models registered." })
    ]));
    return;
  }

  var pick = h("div", { "class": "pick", id: "pick-model", role: "radiogroup", "aria-label": "Model" },
    list.map(function (m) {
      var id = "md-" + m.key;
      return h("div", {}, [
        h("input", { type: "radio", name: "model", id: id, value: m.key,
                     checked: m.key === state.modelKind,
                     onchange: function () { selectModel(m.key); } }),
        h("label", { "for": id }, [
          h("b", { text: m.title || m.key }),
          h("small", { text: m.sub || m.question || "" })
        ])
      ]);
    }));

  addKids(form, [
    h("section", { "class": "rail-sec" }, [
      h("h3", { "class": "rail-h", text: "Model" }),
      pick,
      h("div", { "class": "hypo" }, [
        h("span", { "class": "hypo-k", text: "question" }),
        h("p", { "class": "hypo-t", id: "model-question", text: "—" })
      ]),
      h("p", { "class": "note", id: "model-blurb" })
    ]),
    h("section", { "class": "rail-sec" }, [
      h("h3", { "class": "rail-h", text: "Model parameters" }),
      h("p", { "class": "note", id: "model-idle",
               text: "Nothing selected. Each model runs on its own defaults until you pick it " +
                     "above and change them — the buttons never send the strategy settings." }),
      h("div", {}, list.map(modelPanel)),
      // Named, in words, next to the button it disables. The server would have
      // said the same sentence in a 400.
      h("div", { "class": "note warn", id: "model-rule-block", role: "status",
                 "aria-live": "polite", style: "margin-top:12px", hidden: true }),
      h("button", { type: "submit", "class": "go", id: "btn-model-run", hidden: true,
                    style: "width:100%;margin-top:14px" }, [
        h("span", { id: "btn-model-run-t", text: "Run this model" }),
        h("em", { text: "on the values above" })
      ])
    ])
  ]);

  // The "run all five" row lives in the work column, so its reason does too.
  var actions = $("model-actions");
  if (actions && !$("model-block-note")) {
    actions.parentNode.insertBefore(
      h("div", { "class": "note warn", id: "model-block-note", role: "status",
                 "aria-live": "polite", hidden: true }),
      actions.nextSibling);
  }

  selectModel(state.modelKind);
  refreshAllRules();
}

function selectModel(kind) {
  var list = modelSpecs();
  var spec = null;
  for (var i = 0; i < list.length; i++) if (list[i].key === kind) spec = list[i];
  state.modelKind = spec ? spec.key : null;

  for (i = 0; i < list.length; i++) {
    var on = list[i].key === state.modelKind;
    var panel = $("model-fields-" + list[i].key);
    if (panel) show(panel, on);
    var radio = $("md-" + list[i].key);
    if (radio) radio.checked = on;
  }

  var q = $("model-question"), blurb = $("model-blurb"), idle = $("model-idle"),
      btn = $("btn-model-run"), btnT = $("btn-model-run-t");
  if (q) q.textContent = spec ? (spec.question || spec.title || spec.key) : "Pick a model to set its parameters.";
  if (blurb) blurb.textContent = spec ? (spec.blurb || "") : "";
  if (idle) show(idle, !spec);
  if (btn) show(btn, !!spec);
  if (btnT && spec) btnT.textContent = "Run " + (spec.title || spec.key);
  refreshRunButtons();
}

/* A model run is {kind, params} and nothing else. Every value is typed and
 * range-checked here so a bad knob is named on the page rather than discovered
 * as a 400 — and an empty numeric box is an error, never a zero. */
function readModelForm(kind) {
  var fields = state.modelFields[kind];
  if (!fields) {
    throw new DeskError("The desk has not loaded " + kind + "'s parameters yet. " +
                        "Reload the page — /api/state is where the form comes from.");
  }
  var params = {};
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];

    if (f.type === "bool") { params[f.key] = f.input.checked; continue; }
    if (f.type === "choice") { params[f.key] = f.input.value; continue; }

    if (f.type === "multi") {
      var chosen = [];
      for (var j = 0; j < f.boxes.length; j++) if (f.boxes[j].checked) chosen.push(f.boxes[j].value);
      if (!chosen.length) throw new DeskError("Tick at least one " + f.key + ".");
      params[f.key] = chosen;
      continue;
    }

    if (f.type === "int" || f.type === "float") {
      var raw = String(f.input.value).trim();
      if (raw === "") {
        if (f.nullable) { params[f.key] = null; continue; }
        throw new DeskError("Parameter " + f.key + " is empty.");
      }
      var n = Number(raw);
      if (!isFinite(n)) throw new DeskError("Parameter " + f.key + " is not a number.");
      if (f.type === "int") n = Math.round(n);
      if (isNum(f.min) && isNum(f.max) && (n < f.min || n > f.max)) {
        throw new DeskError("Parameter " + f.key + " must be between " + f.min + " and " + f.max + ".");
      }
      params[f.key] = n;
      continue;
    }

    params[f.key] = f.input.value;
  }
  var bad = evaluateRules(kind, params);
  if (bad.length) throw new DeskError(bad[0].message);
  return { kind: kind, params: params };
}


/* ------------------------------------------------ cross-parameter rules */

/* The second copy of the server's rule grammar.
 *
 * A bound in `min`/`max` says what one knob may be on its own, and until this
 * existed that was the only thing the page knew. The constraints that hold
 * BETWEEN two knobs were discoverable only by posting a form built entirely
 * from legal values and reading the 400: confidence 0.999 with window 250,
 * exit_z 3.0 with entry_z 2.0, n_quantiles 10 with n_assets 5. Every one of
 * those is inside its own advertised range and every one of them is refused.
 *
 * The server publishes those constraints as data with every form — `rules` on
 * the spec, and `rules`/`depends_on` on each parameter that one can refuse —
 * in a grammar with no eval, no arithmetic on strings and no way to reach
 * anything but the form's own values. `models_api._rule_eval` is the reference
 * implementation; this is the copy it was written for, and the two agree by
 * doing the same arithmetic in the same order, left to right, in the same
 * double precision.
 *
 * Where it lies to you: this is a courtesy, never the decision. Two statements
 * of one truth can disagree, and if they do the server is right and this file
 * is wrong — `parse_model_spec` still calls `_CHECKS` on every POST and still
 * answers 400. So anything this evaluator cannot judge it does not block: a
 * missing or non-numeric operand makes the whole expression null, an assertion
 * that comes out null is not reported, and a rule that throws is skipped with a
 * console warning rather than taking the page down. A form the page cannot
 * judge is a form it must not refuse.
 *
 * What stands behind this copy: the three cases above, exercised by hand against
 * a live desk, and one off-line comparison of this evaluator against
 * `models_api.evaluate_rules` over 15,003 forms drawn at random inside every
 * knob's bounds, which agreed on every violation and every sentence. That
 * comparison was run once, by hand, and there is no JavaScript test runner in
 * this repo to run it again — so it is a measurement of the day it was made and
 * not a guarantee about tomorrow. `tests/test_model_rules.py` still holds the
 * Python side to `_CHECKS`; nothing holds this side to anything. When a rule is
 * added and this file is not, the desk goes back to reporting that rule as a
 * 400 it failed to predict, which is the old behaviour and not a new bug.
 */

function ruleNumber(v) {
  // Booleans count as 1 and 0; strings and lists are not numbers here.
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v !== "number") return null;
  return isFinite(v) ? v : null;
}

function ruleTruth(v) { return typeof v === "boolean" ? v : null; }

function ruleSame(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return a === b;
}

// `add` and `mul` accumulate left to right rather than by any cleverer
// summation, because the server accumulates left to right. A fold that rounds
// differently on the two sides disagrees on exactly the boundary cases these
// rules exist to catch.
var RULE_FOLD = {
  add: function (v) { var t = 0.0; for (var i = 0; i < v.length; i++) t += v[i]; return t; },
  mul: function (v) { var t = 1.0; for (var i = 0; i < v.length; i++) t *= v[i]; return t; },
  min: function (v) { return Math.min.apply(null, v); },
  max: function (v) { return Math.max.apply(null, v); }
};

var RULE_CMP = {
  lt: function (a, b) { return a < b; }, le: function (a, b) { return a <= b; },
  gt: function (a, b) { return a > b; }, ge: function (a, b) { return a >= b; }
};

function ruleEval(node, params) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new DeskError("a rule node must be an object");
  }

  if (has(node, "param")) return has(params, node.param) ? params[node.param] : null;
  if (has(node, "const")) return node["const"];

  if (has(node, "if")) {
    var cond = ruleTruth(ruleEval(node["if"], params));
    if (cond === null) return null;
    return ruleEval(cond ? node["then"] : node["else"], params);
  }

  if (has(node, "table")) {
    var key = ruleEval(node.key, params), table = node.table, i;
    if (Array.isArray(key)) {
      var hits = [];
      for (i = 0; i < key.length; i++) if (has(table, key[i])) hits.push(table[key[i]]);
      if (!hits.length) return null;
      return RULE_FOLD[node.agg || "max"](hits);
    }
    return (key !== null && key !== undefined && has(table, key)) ? table[key] : null;
  }

  if (has(node, "not")) {
    var inner = ruleTruth(ruleEval(node["not"], params));
    return inner === null ? null : !inner;
  }
  if (has(node, "all") || has(node, "any")) {
    var wantAll = has(node, "all");
    var nodes = wantAll ? node["all"] : node["any"], parts = [];
    for (var j = 0; j < nodes.length; j++) {
      var p = ruleTruth(ruleEval(nodes[j], params));
      if (p === null) return null;
      parts.push(p);
    }
    return wantAll ? parts.every(Boolean) : parts.some(Boolean);
  }

  if (has(node, "cmp")) {
    var op = node.cmp;
    var lhs = ruleEval(node.args[0], params), rhs = ruleEval(node.args[1], params);
    if (op === "eq" || op === "ne") {
      var same = ruleSame(lhs, rhs);
      return op === "eq" ? same : !same;
    }
    var a = ruleNumber(lhs), b = ruleNumber(rhs);
    if (a === null || b === null) return null;
    if (!has(RULE_CMP, op)) throw new DeskError("unknown comparison " + op);
    return RULE_CMP[op](a, b);
  }

  if (has(node, "op")) {
    var vop = node.op, args = [];
    for (var k = 0; k < node.args.length; k++) {
      var n = ruleNumber(ruleEval(node.args[k], params));
      if (n === null) return null;
      args.push(n);
    }
    if (has(RULE_FOLD, vop)) return RULE_FOLD[vop](args);
    if (vop === "neg") return -args[0];
    if (vop === "ceil") return Math.ceil(args[0]);
    if (vop === "floor") return Math.floor(args[0]);
    if (vop === "sub") return args[0] - args[1];
    if (vop === "div") return args[1] === 0 ? null : args[0] / args[1];
    throw new DeskError("unknown operator " + vop);
  }

  throw new DeskError("a rule node with no known key");
}

/* Six significant figures, integers without a decimal point, a list joined with
 * commas, and a value that could not be computed as an em dash rather than as a
 * zero. `models_api.rule_text` renders the same value the same way. */
function ruleText(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "number") {
    if (!isFinite(v)) return "—";
    return String(Number(v.toPrecision(6)));
  }
  return String(v);
}

var RULE_PLACEHOLDER = /\{([a-z_][a-z0-9_]*)\}/g;

/* A rule's sentence with its placeholders filled in, or null when one of them
 * names something these values do not hold. An unrendered `{min_n}` reads as a
 * typo in the maths, and a sentence the page cannot complete is a sentence it
 * should not print — the caller skips the rule and lets the server answer. */
function renderRule(rule, params) {
  var values = {}, ok = true;
  var declared = rule.values || {};
  for (var name in declared) if (has(declared, name)) values[name] = ruleEval(declared[name], params);

  var out = String(rule.message).replace(RULE_PLACEHOLDER, function (whole, key) {
    if (has(values, key)) return ruleText(values[key]);
    if (has(params, key)) return ruleText(params[key]);
    ok = false;
    return whole;
  });
  return ok ? out : null;
}

/* Every rule this form violates, in the order the server would find them — so
 * the first one shown is the one the 400 would have named. */
function evaluateRules(kind, params) {
  var rules = state.modelRules[kind] || [];
  var out = [];
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    try {
      if (ruleTruth(ruleEval(rule["assert"], params)) !== false) continue;
      var message = renderRule(rule, params);
      if (message === null) continue;
      out.push({ id: rule.id, params: (rule.params || []).slice(),
                 message: message, bounds: ruleBounds(rule, params) });
    } catch (e) {
      // A grammar this page does not know is the server's to enforce.
      if (window.console) window.console.warn("rule " + rule.id + " not evaluated: " + e.message);
    }
  }
  return out;
}

/* The published `bounds` of a violated rule, resolved against these values:
 * "exit_z must be below 2" is the sentence the message cannot say, because the
 * message does not know which knob you are standing on. */
function ruleBounds(rule, params) {
  var out = [];
  var list = rule.bounds || [];
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    var limit = ruleNumber(ruleEval(b.expr, params));
    if (limit === null) continue;
    out.push({ param: b.param, bound: b.bound, exclusive: !!b.exclusive, limit: limit });
  }
  return out;
}

function boundPhrase(b) {
  var how = b.bound === "max"
    ? (b.exclusive ? "below " : "at most ")
    : (b.exclusive ? "above " : "at least ");
  return b.param + " must be " + how + ruleText(b.limit) + " here";
}

/* The form's values as the rules want to read them, without refusing anything.
 *
 * `readModelForm` throws on an empty box, which is right when a run is about to
 * go out and wrong while somebody is still typing. An empty or half-typed
 * number arrives here as null, which makes every expression that touches it
 * null, which makes the rule unjudgeable, which means the page says nothing.
 * Number("") is 0 and would instead have the desk assert things about a bar
 * count of zero that nobody entered. */
function modelValues(kind) {
  var fields = state.modelFields[kind] || [];
  var params = {};
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (f.type === "bool") { params[f.key] = f.input.checked; continue; }
    if (f.type === "choice") { params[f.key] = f.input.value; continue; }
    if (f.type === "multi") {
      var chosen = [];
      for (var j = 0; j < f.boxes.length; j++) if (f.boxes[j].checked) chosen.push(f.boxes[j].value);
      params[f.key] = chosen;
      continue;
    }
    if (f.type === "int" || f.type === "float") {
      var n = numOrNull(String(f.input.value).trim());
      if (n !== null && f.type === "int") n = Math.round(n);
      params[f.key] = n;
      continue;
    }
    params[f.key] = f.input.value;
  }
  return params;
}

/* Evaluate one model's rules against what is on screen right now, mark the
 * knobs that are named in a violation, and let the buttons follow. */
function refreshRules(kind) {
  var bad = evaluateRules(kind, modelValues(kind));
  state.violations[kind] = bad;

  var fields = state.modelFields[kind] || [];
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var hit = null;
    for (var j = 0; j < bad.length && !hit; j++) {
      if (bad[j].params.indexOf(f.key) >= 0) hit = bad[j];
    }
    var note = $("mp-" + kind + "-" + f.key + "-rule");
    if (note) {
      if (hit) {
        var text = hit.message;
        for (var b = 0; b < hit.bounds.length; b++) {
          if (hit.bounds[b].param === f.key) { text += " — " + boundPhrase(hit.bounds[b]); break; }
        }
        note.className = "note warn";
        note.textContent = text;
        show(note, true);
      } else if (f.dependsOn && f.dependsOn.length) {
        note.className = "note";
        note.textContent = "checked against " + f.dependsOn.join(", ");
        show(note, true);
      } else {
        show(note, false);
      }
    }
    var controls = f.boxes || (f.input ? [f.input] : []);
    for (var c = 0; c < controls.length; c++) {
      if (hit) controls[c].setAttribute("aria-invalid", "true");
      else controls[c].removeAttribute("aria-invalid");
    }
  }
  refreshRunButtons();
}

function refreshAllRules() {
  for (var i = 0; i < MODEL_KINDS.length; i++) {
    if (state.modelFields[MODEL_KINDS[i]]) refreshRules(MODEL_KINDS[i]);
  }
}

function blocked(kind) {
  var v = state.violations[kind];
  return !!(v && v.length);
}

function blockReason(kind) {
  var v = state.violations[kind];
  return (v && v.length) ? v[0].message : "";
}


/* ------------------------------------------------------------------ tape */

/* The Opening Tape: one ticker through every model, and one universe through
 * the screener. Two more job kinds on the same rails as the other eight — same
 * POST /api/run, same token, same 409 while another run is in flight, same
 * console and the same disabled buttons. Nothing here draws: the payloads go to
 * `window.__TAPE__`, which is guarded exactly the way `models()` is, because a
 * file that failed to load must not take the rest of the desk with it.
 *
 * Where it lies to you: a dossier is nine models over ONE name, and the desk
 * does not charge the grade for the fact that nine were run. The screener does
 * charge for its own size — that is the whole point of the preset notes it
 * publishes — and the two should not be read as if they cost the same. */

// A fallback only. `renderTapeControls` prefers whatever /api/state publishes;
// these windows are choices about how much history to read, not measurements,
// and the label attaches the one measured fact that matters to each of them.
var TAPE_YEARS = [1, 2, 3, 5, 10];
var TAPE_YEARS_DEFAULT = 3;

/* The standard error of an annualised Sharpe over a window is sqrt(252/n_bars),
 * which over `y` years of daily bars is 1/sqrt(y): 1.00 at one year, 0.58 at
 * three, 0.45 at five. It belongs on the control that chooses the window, since
 * that choice is what sets it. */
function yearLabel(y) {
  var se = 1 / Math.sqrt(y);
  return y + (y === 1 ? " year" : " years") + " · Sharpe ±" + se.toFixed(2) + " se";
}

/* One entry in a published catalogue, whatever shape the server chose for it.
 * A bare string, or an object keyed by `key`/`name`, or a dict of those keyed by
 * name — all three arrive as {key, label, note}. What is NOT done here is
 * inventing a list when the server published none: an empty select and a
 * sentence saying so is the honest answer, and the screener stays disabled. */
function catalogue(raw) {
  var out = [];
  if (!raw) return out;
  var push = function (key, row) {
    key = String(key);
    if (!key) return;
    row = row && typeof row === "object" ? row : {};
    var n = numOrNull(row.n === undefined ? row.size : row.n);
    if (n === null) n = numOrNull(row.count);
    out.push({
      key: key,
      label: String(row.title || row.label || key) + (n === null ? "" : " · " + n + " names"),
      note: String(row.note || row.help || row.doc || "")
    });
  };
  if (Array.isArray(raw)) {
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      if (item && typeof item === "object") push(item.key || item.name || item.id, item);
      else push(item, null);
    }
    return out;
  }
  if (typeof raw === "object") {
    for (var k in raw) if (has(raw, k)) push(k, raw[k]);
  }
  return out;
}

/* Where the tape's catalogues live in /api/state. The server owns that shape,
 * so several plausible homes are tried rather than one guessed at. */
function tapeCatalogue(meta) {
  var m = meta || {};
  var t = m.tape || m.screener || m.screen || {};
  var years = [];
  var rawYears = t.years || m.tape_years;
  for (var i = 0; i < (rawYears || []).length; i++) {
    var y = numOrNull(rawYears[i]);
    if (y !== null && y > 0) years.push(y);
  }
  return {
    universes: catalogue(t.universes || m.universes),
    presets: catalogue(t.presets || m.presets),
    years: years.length ? years : TAPE_YEARS.slice(),
    defaultYears: numOrNull(t.default_years) || TAPE_YEARS_DEFAULT
  };
}

function renderTapeControls(meta) {
  var cat = tapeCatalogue(meta);

  var ysel = $("in-tape-years");
  if (ysel) {
    fill(ysel, cat.years.map(function (y) {
      return h("option", { value: String(y), text: yearLabel(y), selected: y === cat.defaultYears });
    }));
  }

  var usel = $("in-universe");
  if (usel) {
    fill(usel, cat.universes.map(function (u, i) {
      return h("option", { value: u.key, text: u.label, selected: i === 0 });
    }));
  }
  var psel = $("in-preset");
  if (psel) {
    fill(psel, cat.presets.map(function (p) {
      return h("option", { value: p.key, text: p.label, selected: p.key === "institutional" });
    }));
  }

  state.presets = cat.presets;
  state.screenReady = !!(cat.universes.length && cat.presets.length);
  updatePresetNote();
  refreshRunButtons();
}

function updatePresetNote() {
  var note = $("preset-note");
  if (!note) return;
  if (!state.screenReady) {
    note.textContent = "This desk published no universes or presets, so there is nothing to screen. " +
      "The list comes from /api/state — if the screener is installed, reload the page.";
    return;
  }
  var sel = $("in-preset");
  var key = sel ? sel.value : "";
  var list = state.presets || [];
  var hit = null;
  for (var i = 0; i < list.length; i++) if (list[i].key === key) hit = list[i];
  note.textContent = hit && hit.note
    ? hit.note
    : "The window and both thresholds come from this preset.";
}

/* --- ticker suggestions -------------------------------------------------
 *
 * Debounced, and one request in flight at a time. A request per keystroke would
 * put five lookups on the wire for "AAPL " and let whichever answered last win,
 * which is how a search box ends up showing the answer to a question you have
 * already finished asking. `seq` is what makes a late answer to an old query a
 * discarded answer. */

var suggest = { timer: null, seq: 0, last: null, delay: 260 };

function onTickerInput() {
  var raw = String($("in-ticker").value || "").trim();
  if (suggest.timer) { clearTimeout(suggest.timer); suggest.timer = null; }
  if (!raw) {
    suggest.seq++;              // any answer still in flight is now stale
    suggest.last = null;
    fill($("tape-suggest"), []);
    return;
  }
  if (raw === suggest.last) return;
  suggest.timer = setTimeout(function () { lookupTicker(raw); }, suggest.delay);
}

function lookupTicker(raw) {
  var seq = ++suggest.seq;
  suggest.last = raw;
  fill($("tape-suggest"), h("span", { "class": "note", text: "resolving " + raw + "…" }));
  api("/api/ticker/" + encodeURIComponent(raw))
    .then(function (data) { if (seq === suggest.seq) renderSuggest(raw, data); })
    .catch(function (e) {
      if (seq !== suggest.seq) return;
      // A symbol nobody recognises is an ordinary answer to a half-typed box,
      // not a desk failure, so it never raises the banner.
      fill($("tape-suggest"), h("span", { "class": "note",
        text: e.status === 404 ? "nothing resolved to " + raw + " yet"
                               : "could not resolve " + raw + ": " + e.message }));
    });
}

/* Whatever /api/ticker answers, as rows. One object, a list of them, or a list
 * under one of the usual names. A shape with no symbol in it draws nothing
 * rather than a row labelled "[object Object]". */
function suggestRows(data) {
  if (!data) return [];
  var list = Array.isArray(data) ? data
    : (data.candidates || data.matches || data.results || data.suggestions || data.tickers ||
       ((data.symbol || data.ticker) ? [data] : []));
  var out = [];
  for (var i = 0; i < (list || []).length; i++) {
    var r = list[i];
    if (typeof r === "string") { out.push({ symbol: r, name: "", extra: "" }); continue; }
    if (!r || typeof r !== "object") continue;
    var sym = r.symbol || r.ticker || r.key || "";
    if (!sym) continue;
    var extra = [];
    if (r.exchange) extra.push(String(r.exchange));
    if (r.sector) extra.push(String(r.sector));
    if (r.cached === true || r.is_cached === true) extra.push("cached");
    out.push({
      symbol: String(sym),
      name: String(r.name || r.long_name || r.short_name || r.description || ""),
      extra: extra.join(" · ")
    });
  }
  return out;
}

function renderSuggest(raw, data) {
  var box = $("tape-suggest");
  if (!box) return;
  var rows = suggestRows(data);
  if (!rows.length) {
    fill(box, h("span", { "class": "note",
      text: "nothing resolved to " + raw + " — the tape will still try it, and fail at the " +
            "data layer rather than inventing a price series" }));
    return;
  }
  fill(box, rows.map(function (r) {
    return h("button", { type: "button", "class": "ghost sm", title: r.extra,
                         onclick: function () {
                           $("in-ticker").value = r.symbol;
                           suggest.last = r.symbol;
                           fill(box, h("span", { "class": "note",
                             text: r.symbol + (r.name ? " · " + r.name : "") }));
                         } }, [
      h("b", { text: r.symbol }),
      r.name ? h("small", { text: " " + r.name }) : null
    ]);
  }));
}

/* --- the two forms ------------------------------------------------------
 *
 * `peers` is left out of the dossier body on purpose: the server's default is
 * the eleven SPDR sector ETFs, and a control that let you pick a cross-section
 * would imply the desk knows the ticker's actual competitors. It does not —
 * there is no constituent map in this repo. */
function readTapeForm(kind) {
  if (!$("in-ticker") || !$("in-universe")) {
    throw new DeskError("The tape controls are missing from this page. Reload it — " +
                        "index.html is where they come from.");
  }
  if (kind === "dossier") {
    var t = String($("in-ticker").value || "").trim().toUpperCase();
    if (!t) throw new DeskError("Type a ticker into the tape before running it.");
    var years = numOrNull($("in-tape-years").value);
    if (years === null) {
      throw new DeskError("No history window is selected. Reload the page — /api/state is " +
                          "where that list comes from.");
    }
    return { kind: "dossier",
             params: { ticker: t, years: years, include_insider: $("in-tape-insider").checked } };
  }

  if (!state.screenReady) {
    throw new DeskError("This desk published no universes or presets, so there is nothing " +
                        "to screen.");
  }
  var top = numOrNull($("in-screen-top").value);
  if (top === null) throw new DeskError("top is empty.");
  if (top < 1) throw new DeskError("top must be at least 1.");
  return { kind: "screen",
           params: { universe: $("in-universe").value, preset: $("in-preset").value,
                     top: Math.round(top) } };
}

/* --- the panels ---------------------------------------------------------- */

/* Does this payload carry an insider section at all? `include_insider` is a
 * checkbox, so "no filings" and "never asked" are different answers and only the
 * first one deserves a panel. */
function hasInsider(p) {
  return !!insiderOf(p);
}

/* The Form 4 block itself, not the dossier holding it.
 *
 * renderInsider reads grade/score/n_buys/cluster/biggest at the top level. Handed
 * the whole dossier it finds none of them and draws an empty table over a real
 * set of filings, which is worse than drawing nothing. */
function insiderOf(p) {
  if (!p || typeof p !== "object") return null;
  var block = null;
  if (has(p, "insider")) block = p.insider;
  else if (has(p, "insider_filings")) block = p.insider_filings;
  else if (has(p, "insiders")) block = p.insiders;
  else if (p.sections && typeof p.sections === "object" && has(p.sections, "insider")) {
    block = p.sections.insider;
  }
  return (block && typeof block === "object" && !Array.isArray(block)) ? block : null;
}

/* Hand one payload to whichever file draws it, and survive that file being
 * absent. Three things can go wrong and each one gets its own sentence: the
 * drawing file never loaded, it loaded but publishes no renderer for this
 * panel, or its renderer threw. In all three the RUN still finished, and saying
 * so is the difference between "the desk is broken" and "the picture is". */
function drawPanel(el, payload, fn, label, file, mod) {
  if (!el) return;
  if (!payload) { clear(el); show(el, false); return; }
  show(el, true);
  if (typeof fn !== "function") {
    var kinds = (mod && Array.isArray(mod.kinds)) ? mod.kinds.join(", ") : "";
    fill(el, h("p", { "class": "note warn",
      text: mod ? (file + " is loaded but has no renderer for the " + label + "" +
                   (kinds ? " — it draws " + kinds : "") + ". The run itself finished.")
                : (file + " did not load, so the " + label + " cannot be drawn. The run itself " +
                   "finished; reload the page to draw it.") }));
    return;
  }
  clear(el);
  try {
    fn(el, payload);
  } catch (e) {
    // A panel that throws must not cost you the other three.
    fill(el, h("p", { "class": "note warn",
      text: "the " + label + " panel failed to draw: " + (e && e.message ? e.message : String(e)) }));
  }
}

function drawTape(el, payload, fn, label) {
  drawPanel(el, payload, fn, label, "tape.js", tape());
}

function paintTape() {
  var d = state.results.dossier, sc = state.results.screen, t = tape();
  drawTape($("panel-score"), d, t && t.renderScore, "score");
  drawTape($("panel-dossier"), d, t && t.renderDossier, "dossier");
  drawTape($("panel-insider"), insiderOf(d), t && t.renderInsider, "insider table");
  drawTape($("panel-screen"), sc, t && t.renderScreen, "screen");
  return !!(d || sc);
}


/* ------------------------------------------------------------- the book */

/* The picker, and the eleventh job kind.
 *
 * Everything on this form comes from what /api/state published under
 * `portfolio` — the allocations, the rebalance policies, the asset classes and
 * the calendars. Not one of those lists is typed into this file, because a
 * select whose options were written here is a select that can offer the engine
 * an allocation it does not have, and the failure arrives as a 400 from a form
 * that looked fine. If the block is absent the picker says so and stays
 * disabled, exactly as the screener does with no universes.
 *
 * The holdings live in `state.pf.holdings` rather than in the DOM. A list of
 * rows cannot be read back the way a select can: removing the second of five
 * rows has to take its weight with it, and reading weights off inputs by index
 * after a re-render is how a book ends up sized with the row above's number.
 *
 * Where it lies to you: every check below is a courtesy. The server validates
 * the whole body against `Portfolio.__post_init__` on the way in, and when the
 * two disagree the server is right and this file is wrong. */

function strList(v) {
  var out = [];
  for (var i = 0; i < (Array.isArray(v) ? v : []).length; i++) {
    var t = String(v[i] === null || v[i] === undefined ? "" : v[i]);
    if (t) out.push(t);
  }
  return out;
}

function portfolioSpec(meta) {
  var m = meta || {};
  var p = (m.portfolio && typeof m.portfolio === "object" && !Array.isArray(m.portfolio))
    ? m.portfolio : null;
  if (!p) return null;
  var max = numOrNull(p.max_holdings);
  return {
    allocations: strList(p.allocations),
    rebalances: strList(p.rebalances),
    assetClasses: strList(p.asset_classes),
    calendars: strList(p.calendars),
    // A cap the server did not publish is not a cap of zero. Left null, the
    // count is the server's to refuse.
    maxHoldings: (max !== null && max >= 2) ? Math.round(max) : null
  };
}

function renderPortfolioControls(meta) {
  var spec = portfolioSpec(meta);
  state.pf.spec = spec;
  state.pf.ready = !!(spec && spec.allocations.length && spec.rebalances.length &&
                      spec.assetClasses.length && spec.calendars.length);

  var options = function (id, list, want) {
    var node = $(id);
    if (!node) return;
    fill(node, list.map(function (v, i) {
      return h("option", { value: v, text: v.replace(/_/g, " "),
                           selected: want ? v === want : i === 0 });
    }));
    node.disabled = !state.pf.ready;
  };

  options("in-pf-class", spec ? spec.assetClasses : []);
  options("in-pf-alloc", spec ? spec.allocations : [], "equal_weight");
  options("in-pf-rebal", spec ? spec.rebalances : [], "periodic");
  options("in-pf-cal", spec ? spec.calendars : []);

  var off = !state.pf.ready;
  ["in-pf-symbol", "in-pf-every", "in-pf-band", "in-pf-start", "btn-pf-add"].forEach(function (id) {
    var node = $(id);
    if (node) node.disabled = off;
  });

  updatePortfolioFields();
  renderHoldings();
}

/* Which of the two rebalance parameters this policy actually reads, and whether
 * a weight box means anything. Both are disabled rather than hidden: a control
 * that vanishes takes the reason with it. */
function updatePortfolioFields() {
  var reb = $("in-pf-rebal") ? $("in-pf-rebal").value : "";
  var every = $("in-pf-every"), band = $("in-pf-band");
  var off = !state.pf.ready;
  if (every) {
    every.disabled = off || reb !== "periodic";
    every.title = reb === "periodic" ? "" : "only the periodic policy reads this";
  }
  if (band) {
    band.disabled = off || reb !== "drift_band";
    band.title = reb === "drift_band" ? "" : "only the drift_band policy reads this";
  }
  var note = $("pf-note");
  if (note) {
    note.textContent = state.pf.ready
      ? (allocationIs("custom")
          ? "Custom weights: a holding you leave blank splits whatever the weighted lines " +
            "left over. Weights that already sum to 1 leave nothing for it."
          : "Weights are solved by the allocation. The boxes are enabled only for custom, " +
            "because a number you can type and the engine will ignore is a lie about control.")
      : "This desk published no portfolio block in /api/state, so there is nothing to build " +
        "a book from. If the portfolio job is installed, reload the page.";
  }
  refreshRunButtons();
}

function allocationIs(name) {
  var sel = $("in-pf-alloc");
  return !!sel && sel.value === name;
}

function announceHoldings(text) {
  var node = $("pf-list-note");
  if (node) node.textContent = text;
}

function renderHoldings() {
  var box = $("pf-holdings");
  if (!box) return;
  var list = state.pf.holdings;
  var custom = allocationIs("custom");

  if (!list.length) {
    fill(box, h("li", { "class": "pf-empty",
      text: "Nothing in the book yet. Two holdings is the minimum — one asset is not a " +
            "portfolio, and there is nothing to diversify or to attribute." }));
  } else {
    fill(box, list.map(function (hold, i) {
      var wid = "in-pf-w-" + i;
      var w = h("input", {
        type: "number", id: wid, step: "0.01", min: "0", max: "1",
        value: hold.weight === null || hold.weight === undefined ? "" : String(hold.weight),
        disabled: !custom || !state.pf.ready,
        oninput: function (ev) { state.pf.holdings[i].weight = ev.target.value; }
      });
      return h("li", { "class": "pf-row" }, [
        h("span", { "class": "pf-sym", text: hold.symbol }),
        h("span", { "class": "pf-class", text: hold.asset_class }),
        h("label", { "class": "pf-wlab", "for": wid,
                     title: custom ? "share of the book, 0 to 1"
                                   : "enabled only when the allocation is custom" }, ["weight"]),
        w,
        h("button", { type: "button", "class": "ghost sm pf-drop",
                      "aria-label": "Remove " + hold.symbol + " from the book",
                      onclick: function () { removeHolding(i); } }, ["remove"])
      ]);
    }));
  }
  announceHoldings(list.length
    ? list.length + " holding(s): " + list.map(function (x) { return x.symbol; }).join(", ")
    : "The book is empty.");
  refreshRunButtons();
}

function addHolding() {
  var symIn = $("in-pf-symbol"), clsIn = $("in-pf-class");
  if (!symIn || !clsIn || !state.pf.ready) return;
  var sym = String(symIn.value || "").trim().toUpperCase();
  var cls = clsIn.value;
  var list = state.pf.holdings;
  var max = state.pf.spec ? state.pf.spec.maxHoldings : null;

  if (!sym) { announceHoldings("Type a symbol before adding it."); symIn.focus(); return; }
  for (var i = 0; i < list.length; i++) {
    if (list[i].symbol === sym) {
      // The engine refuses duplicates rather than combining them, and it is
      // right to: two lines for one name is two answers to "what do I hold".
      announceHoldings(sym + " is already in the book. One line per name.");
      symIn.select();
      return;
    }
  }
  if (max !== null && list.length >= max) {
    announceHoldings("This desk caps the book at " + max + " holdings. Remove one first.");
    return;
  }
  if (!cls) { announceHoldings("Pick the asset class — it chooses the cost model."); return; }

  list.push({ symbol: sym, asset_class: cls, weight: null });
  symIn.value = "";
  renderHoldings();
  announceHoldings("Added " + sym + " as " + cls + ". " + list.length + " holding(s) in the book.");
  symIn.focus();
}

function removeHolding(idx) {
  var list = state.pf.holdings;
  if (idx < 0 || idx >= list.length) return;
  var gone = list[idx].symbol;
  list.splice(idx, 1);
  renderHoldings();
  announceHoldings("Removed " + gone + ". " + list.length + " holding(s) left.");
  // Keyboard focus has to land somewhere it can be seen. The row that took the
  // removed one's place, or the add button when the list ran out.
  var rows = $("pf-holdings") ? $("pf-holdings").querySelectorAll(".pf-drop") : [];
  var next = rows.length ? rows[Math.min(idx, rows.length - 1)] : $("btn-pf-add");
  if (next && next.focus) next.focus();
}

function readPortfolioForm() {
  if (!state.pf.ready) {
    throw new DeskError("This desk published no portfolio block in /api/state, so there is " +
                        "nothing to build a book from.");
  }
  var list = state.pf.holdings;
  if (list.length < 2) {
    throw new DeskError("A portfolio needs at least two holdings. One asset has nothing to " +
                        "be diversified against and no attribution to report.");
  }
  var max = state.pf.spec.maxHoldings;
  if (max !== null && list.length > max) {
    throw new DeskError("This desk caps the book at " + max + " holdings; there are " +
                        list.length + ".");
  }

  var alloc = $("in-pf-alloc").value;
  var reb = $("in-pf-rebal").value;
  var every = numOrNull($("in-pf-every").value);
  var band = numOrNull($("in-pf-band").value);
  var start = String($("in-pf-start").value || "").trim();

  if (every === null || every < 1) throw new DeskError("rebalance every must be at least 1 bar.");
  if (band === null || band <= 0 || band >= 1) {
    throw new DeskError("drift band is a weight deviation between 0 and 1; 0.05 means 5 points.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    throw new DeskError("start must be a date like 2022-01-01.");
  }

  var custom = alloc === "custom";
  var holdings = list.map(function (hold) {
    return { symbol: hold.symbol, asset_class: hold.asset_class,
             weight: custom ? numOrNull(hold.weight) : null };
  });
  if (custom) {
    var given = holdings.filter(function (x) { return x.weight !== null; });
    if (!given.length) {
      throw new DeskError("The allocation is custom but no holding carries a weight. Type at " +
                          "least one, or pick a different allocation.");
    }
    for (var i = 0; i < given.length; i++) {
      if (given[i].weight < 0 || given[i].weight > 1) {
        throw new DeskError(given[i].symbol + "'s weight is " + given[i].weight +
                            ". A weight is a share of the book, between 0 and 1.");
      }
    }
  }

  return {
    kind: PORTFOLIO_KIND,
    params: {
      holdings: holdings, allocation: alloc, rebalance: reb,
      rebalance_every: Math.round(every), drift_band: band,
      start: start, calendar: $("in-pf-cal").value
    }
  };
}

/* A saved run, read back. The picker is refilled from the params that produced
 * it, so the form on screen and the panel below it describe the same book. */
function applyPortfolioParams(params) {
  var p = (params && typeof params === "object") ? params : {};
  var list = [];
  var raw = Array.isArray(p.holdings) ? p.holdings : [];
  for (var i = 0; i < raw.length; i++) {
    var hold = raw[i];
    if (!hold || typeof hold !== "object") continue;
    var sym = String(hold.symbol === undefined || hold.symbol === null ? "" : hold.symbol).trim();
    if (!sym) continue;
    var w = numOrNull(hold.weight);
    list.push({ symbol: sym.toUpperCase(),
                asset_class: String(hold.asset_class || ""),
                weight: w === null ? null : String(w) });
  }
  if (list.length) state.pf.holdings = list;

  var set = function (id, v) {
    var node = $(id);
    if (node && v !== undefined && v !== null && String(v) !== "") node.value = String(v);
  };
  set("in-pf-alloc", p.allocation);
  set("in-pf-rebal", p.rebalance);
  set("in-pf-every", numOrNull(p.rebalance_every));
  set("in-pf-band", numOrNull(p.drift_band));
  set("in-pf-start", p.start);
  set("in-pf-cal", p.calendar);
  updatePortfolioFields();
  renderHoldings();
}

function paintPortfolio() {
  var r = state.results.portfolio, b = book();
  drawPanel($("panel-portfolio"), r, b && b.renderPortfolio, "portfolio", "portfolio.js", b);
  return !!r;
}


/* --------------------------------------------------------------- console */

var con = { n: 0, t0: 0, timer: null };

function conReset(kind) {
  clear($("con-lines"));
  con.n = 0;
  con.t0 = Date.now();
  $("con-status").textContent = "running " + kind;
  $("con-status").className = "con-status run";
  show($("con-prog"), false);
  if (con.timer) clearInterval(con.timer);
  con.timer = setInterval(function () {
    $("con-clock").textContent = clock(Date.now() - con.t0);
  }, 100);
}

/* One line the page wrote itself. `con.n` counts the server's log and nothing
 * else, so a local line neither hides nor duplicates one from the job. */
function conNote(text) {
  $("con-lines").appendChild(h("div", { "class": "ln lvl-info" }, [
    h("span", { "class": "ln-t", text: "" }),
    h("span", { "class": "ln-x", text: text })
  ]));
}

function conAppend(log) {
  var box = $("con-lines");
  var stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
  for (var i = con.n; i < (log || []).length; i++) {
    var e = log[i] || {};
    var lvl = ["info", "good", "warn", "bad"].indexOf(e.level) >= 0 ? e.level : "info";
    box.appendChild(h("div", { "class": "ln lvl-" + lvl }, [
      h("span", { "class": "ln-t", text: e.t || "" }),
      h("span", { "class": "ln-x", text: e.text === undefined ? "" : String(e.text) })
    ]));
  }
  con.n = (log || []).length;
  if (stick) box.scrollTop = box.scrollHeight;
}

/* `isNum(Number(p.total))` is `isNum(0)` for a null total, so the guard never
 * fired and the header read "3 / null". Both halves have to be real before this
 * element says anything at all. */
function conProgress(p) {
  var done = p ? numOrNull(p.done) : null;
  var total = p ? numOrNull(p.total) : null;
  if (done === null || total === null) { show($("con-prog"), false); return; }
  $("con-prog").textContent = done + " / " + total;
  show($("con-prog"), true);
}

function conStop(status, note) {
  if (con.timer) { clearInterval(con.timer); con.timer = null; }
  $("con-clock").textContent = clock(Date.now() - con.t0);
  $("con-status").textContent = note || status;
  $("con-status").className = "con-status" + (status === "error" ? " bad" : "");
}


/* ------------------------------------------------------------------ jobs */

function setBusy(on) {
  state.busy = on;
  $("work").setAttribute("aria-busy", on ? "true" : "false");
  refreshRunButtons();
}

/* Which buttons may be pressed, and why not.
 *
 * Three reasons a run cannot start: another one is in flight, the desk has
 * closed, or the form in front of you breaks one of the model's own
 * cross-parameter rules. The third used to be invisible until the server
 * answered 400, so it is the one that gets a sentence rather than a grey
 * button. */
function refreshRunButtons() {
  var off = state.busy || state.closed;

  var plain = ["btn-backtest", "btn-validate", "btn-paper", "btn-all", "btn-tape"];
  for (var i = 0; i < plain.length; i++) {
    var b = $(plain[i]);
    if (b) b.disabled = off;
  }
  // The screener needs a universe and a preset, and only the server can say
  // which ones exist. An empty select is not something to press.
  var screen = $("btn-screen");
  if (screen) screen.disabled = off || !state.screenReady;

  // The book needs the server's lists and at least two names in it. Both
  // reasons are printed beside the button rather than left to a grey rectangle.
  var runBook = $("btn-portfolio");
  if (runBook) {
    var few = state.pf.holdings.length < 2;
    runBook.disabled = off || !state.pf.ready || few;
    runBook.title = !state.pf.ready
      ? "this desk published no portfolio block in /api/state"
      : (few ? "add at least two holdings" : "");
  }

  var stuck = [];
  for (i = 0; i < MODEL_KINDS.length; i++) {
    var kind = MODEL_KINDS[i];
    var bad = blocked(kind);
    if (bad) stuck.push(kind);
    var btn = $("btn-" + kind);
    if (btn) {
      btn.disabled = off || bad;
      btn.title = bad ? blockReason(kind) : "";
    }
  }

  var all = $("btn-models");
  if (all) {
    all.disabled = off || stuck.length > 0;
    all.title = stuck.length ? stuck.join(", ") + " would be refused" : "";
  }

  var run = $("btn-model-run");
  if (run) run.disabled = off || !state.modelKind || blocked(state.modelKind);

  // The reason, twice: beside the rail's own button, and beside the row of five.
  var railNote = $("model-rule-block");
  if (railNote) {
    var here = state.modelKind ? (state.violations[state.modelKind] || []) : [];
    fill(railNote, here.map(function (v) {
      return h("div", { text: "cannot run: " + v.message });
    }));
    show(railNote, here.length > 0);
  }

  var note = $("model-block-note");
  if (note) {
    fill(note, stuck.map(function (k) {
      return h("div", { text: k + " cannot run: " + blockReason(k) });
    }));
    show(note, stuck.length > 0);
  }
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function pollJob(id) {
  return api("/api/job/" + encodeURIComponent(id)).then(function (job) {
    conAppend(job.log);
    conProgress(job.progress);
    if (job.status === "done" || job.status === "error") return job;
    return sleep(POLL_MS).then(function () { return pollJob(id); });
  });
}

function runOne(kind) {
  var body;
  // Four shapes go through this door. A strategy run carries the data block and
  // the run settings; a model run carries its own params and nothing else,
  // because the server validates it against that model's schema alone; a tape
  // run carries a ticker or a universe, and is validated the same way; a
  // portfolio run carries the book you built and the policy you chose.
  try {
    body = isModelKind(kind) ? readModelForm(kind)
         : isTapeKind(kind) ? readTapeForm(kind)
         : isPortfolioKind(kind) ? readPortfolioForm()
         : readForm(kind);
  } catch (e) { showError(e); return Promise.reject(e); }

  clearError();
  conReset(kind);
  // A dossier runs nine models over one name and takes a minute and a half. The
  // server logs each one as it lands; this line is here so the first twenty
  // seconds do not read as a hang.
  if (kind === "dossier") {
    conNote("nine models over " + body.params.ticker + ", one after another — 60 to 90 " +
            "seconds is normal, and each model reports below as it finishes");
  }
  // The book runs three times, not once: the allocation you chose, then equal
  // weight and buy-and-hold on the identical panel. The wait is three-quarters
  // of the reason the panel can say anything at all.
  if (isPortfolioKind(kind)) {
    conNote(body.params.holdings.length + " names on one calendar, then the same names in " +
            "equal weight and in buy-and-hold on the identical panel — three runs, so this " +
            "takes about three times as long as one");
  }
  setBusy(true);

  return api("/api/run", { method: "POST", body: body })
    .then(function (r) { return pollJob(r.job_id); })
    .then(function (job) {
      if (job.status === "error") {
        conStop("error", "failed");
        throw new DeskError(job.error || "The run failed and said nothing useful.");
      }
      conStop("done", "done");
      state.results[kind] = normalise(kind, job.result);
      paint();
      return loadRuns();
    })
    .catch(function (e) {
      conStop("error", "failed");
      showError(e);
      throw e;
    })
    .finally(function () { setBusy(false); });
}

function runSeries(kinds) {
  var chain = Promise.resolve();
  kinds.forEach(function (k) {
    chain = chain.then(function () { return runOne(k); });
  });
  return chain.catch(function () { /* the failing step already reported itself */ });
}

function runAll() { return runSeries(["backtest", "validate", "paper"]); }

function runModels() { return runSeries(MODEL_KINDS.slice()); }


/* ---------------------------------------------------------------- doctor */

function renderDoctor(d) {
  var body = $("doctor-body");
  var checks = (d.checks || []).map(function (c) {
    return h("div", { "class": "check" }, [
      h("span", { "class": "ck " + (c.ok ? "ok" : "no"), text: c.ok ? "ok" : "FAIL" }),
      h("span", { "class": "ck-l", text: c.label || "" }),
      h("span", { "class": "ck-d", text: c.detail || "" })
    ]);
  });
  fill(body, [
    checks.length ? checks : h("p", { "class": "loading", text: "No checks returned." }),
    h("p", { "class": "doc-foot",
      text: d.ok ? "All checks pass. Live routing raises, which is the point of the check."
                 : "Something above is failing. Fix it before you trust anything this desk prints." })
  ]);

  var chip = $("chip-doctor");
  var bad = (d.checks || []).filter(function (c) { return !c.ok; }).length;
  chip.textContent = d.ok ? "doctor ok" : "doctor " + bad + " failing";
  chip.className = "chip act " + (d.ok ? "on" : "bad");
}

function loadDoctor(open) {
  var chip = $("chip-doctor");
  if (open) {
    show($("doctor-panel"), true);
    chip.setAttribute("aria-expanded", "true");
    fill($("doctor-body"), h("p", { "class": "loading", text: "checking…" }));
  }
  return api("/api/doctor").then(renderDoctor).catch(function (e) {
    chip.textContent = "doctor unknown";
    chip.className = "chip act bad";
    showError(e);
  });
}


/* ------------------------------------------------------------ run history */

function loadRuns() {
  return api("/api/runs").then(function (runs) { renderRuns(runs); }).catch(function () {
    // A missing history is not worth a banner; the desk still runs.
    fill($("runs"), h("li", { "class": "loading", text: "history unavailable" }));
  });
}

function renderRuns(runs) {
  var box = $("runs");
  if (!runs || !runs.length) {
    fill(box, h("li", { "class": "loading", text: "none yet — run a backtest" }));
    return;
  }
  var sorted = runs.slice().sort(function (a, b) {
    return String(b.created).localeCompare(String(a.created));
  });
  fill(box, sorted.map(function (r) {
    return h("li", {}, [
      h("button", { type: "button", title: "Read this run back into the results below",
                    onclick: function () { openRun(r); } }, [
        h("span", { "class": "r-kind", text: r.kind }),
        h("span", { "class": "r-name", text: r.name }),
        h("span", { "class": "r-when", text: String(r.created || "").slice(0, 16).replace("T", " ") })
      ])
    ]);
  }));
}

function openRun(r) {
  clearError();
  api("/api/run/" + encodeURIComponent(r.kind) + "/" + encodeURIComponent(slugify(r.name)))
    .then(function (rec) {
      var kind = rec.kind || r.kind;
      state.results[kind] = normalise(kind, rec.payload);
      if (isModelKind(kind)) selectModel(kind);
      // The picker is refilled from the params the record carries, so the form
      // above the panel describes the book the panel is drawing.
      if (isPortfolioKind(kind)) {
        applyPortfolioParams(rec.params || (rec.payload && rec.payload.params));
      }
      paint();
      var sec = { backtest: "q-real", validate: "q-survive", paper: "q-now",
                  dossier: "panel-score", screen: "screener",
                  portfolio: "portfolio-build" }[kind];
      if (!sec && models() && models().section) sec = models().section[kind];
      var target = sec ? $(sec) : null;
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    })
    .catch(showError);
}


/* --------------------------------------------------------------- startup */

function applyState(meta) {
  state.meta = meta;
  var app = meta.app || {};
  $("chip-app").textContent = (app.name || "Hey Jamie") + " v" + (app.version || "?");
  $("chip-app").title = app.root || "";

  var hold = meta.holdout || {};
  var chip = $("chip-holdout");
  chip.textContent = hold.sealed ? "holdout sealed" : "holdout opened";
  chip.className = "chip " + (hold.sealed ? "on" : "warn");
  chip.title = hold.sealed
    ? "Unseal on day " + (hold.unseal_day === undefined ? "44" : hold.unseal_day) + ". You get one honest look."
    : "Already opened. There is no second first look — do not tune against it.";

  renderAssetClasses(meta);

  var strategies = meta.strategies || [];
  state.strategy = strategies.length ? strategies[0].key : null;
  renderStrategies(strategies);
  selectStrategy(state.strategy);

  renderModelRail(meta.models || []);
  renderTapeControls(meta);
  renderPortfolioControls(meta);

  // An empty `capital.starting_equity:` in config/heyjamie.yaml reaches here as
  // null, and Number(null) turned it into an account balance of zero. An
  // unconfigured account is not an empty one.
  var cfg = meta.config || {};
  var eq = numOrNull(cfg.starting_equity);
  var cur = cfg.base_currency ? " " + cfg.base_currency : "";
  $("dash-note").title = eq === null
    ? "Starting equity —" + cur + " (capital.starting_equity is not set)"
    : "Starting equity " + Math.round(eq).toLocaleString("en-US") + cur;

  fill($("gates"), (meta.governance_gates || []).map(function (g) {
    return h("li", { text: g });
  }));

  renderRuns(meta.runs || []);
}

function renderDashboardReport() {
  clearError();
  var btn = $("btn-dashboard");
  btn.disabled = true;
  api("/api/dashboard", { method: "POST", body: {} })
    .then(function (d) {
      var url = d.url || "/reports/dashboard.html";
      var w = window.open(url, "_blank", "noopener");
      var note = $("dash-note");
      clear(note);
      if (w) {
        addKids(note, "Rendered " + (d.path || "reports/dashboard.html") + " and opened it in a new tab.");
      } else {
        addKids(note, ["Rendered ", h("a", { href: url, target: "_blank", rel: "noopener", text: d.path || url }),
                       " — the browser blocked the new tab, so open it from here."]);
      }
    })
    .catch(showError)
    .finally(function () { btn.disabled = false; });
}

function quit() {
  clearError();
  api("/api/quit", { method: "POST", body: {} })
    .then(function () { closeDesk(); })
    .catch(function (e) {
      // The server may drop the connection as it shuts down; that is a success.
      if (e.status === 0 || !e.status) closeDesk(); else showError(e);
    });
}

function closeDesk() {
  state.closed = true;
  setBusy(false);
  if (con.timer) { clearInterval(con.timer); con.timer = null; }
  show($("closed"), true);
  document.title = "Hey Jamie — closed";
}

function wire() {
  $("banner-close").addEventListener("click", clearError);

  $("rail-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!state.busy) runOne("backtest").catch(function () {});
  });
  $("btn-validate").addEventListener("click", function () { runOne("validate").catch(function () {}); });
  $("btn-paper").addEventListener("click", function () { runOne("paper").catch(function () {}); });
  $("btn-all").addEventListener("click", function () { runAll(); });

  // A model button both selects and runs, so the form on the rail always shows
  // the parameters the run that just went out was built from.
  MODEL_KINDS.forEach(function (kind) {
    var btn = $("btn-" + kind);
    if (btn) btn.addEventListener("click", function () {
      selectModel(kind);
      runOne(kind).catch(function () {});
    });
  });
  if ($("btn-models")) $("btn-models").addEventListener("click", function () { runModels(); });

  // The tape. The ticker box resolves as you type, debounced; the two buttons
  // are ordinary runs on the ordinary poll.
  if ($("in-ticker")) {
    $("in-ticker").addEventListener("input", onTickerInput);
    $("in-ticker").addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      if (!state.busy) runOne("dossier").catch(function () {});
    });
  }
  if ($("btn-tape")) $("btn-tape").addEventListener("click", function () {
    runOne("dossier").catch(function () {});
  });
  if ($("btn-screen")) $("btn-screen").addEventListener("click", function () {
    runOne("screen").catch(function () {});
  });
  if ($("in-preset")) $("in-preset").addEventListener("change", updatePresetNote);

  // The book. Add a name with the button or with Enter; the two selects change
  // which of the other controls mean anything; Run is an ordinary run on the
  // ordinary poll.
  if ($("btn-pf-add")) $("btn-pf-add").addEventListener("click", addHolding);
  if ($("in-pf-symbol")) {
    $("in-pf-symbol").addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      addHolding();
    });
  }
  if ($("in-pf-alloc")) $("in-pf-alloc").addEventListener("change", function () {
    updatePortfolioFields();
    renderHoldings();          // the weight boxes are enabled only for custom
  });
  if ($("in-pf-rebal")) $("in-pf-rebal").addEventListener("change", updatePortfolioFields);
  if ($("btn-portfolio")) $("btn-portfolio").addEventListener("click", function () {
    runOne(PORTFOLIO_KIND).catch(function () {});
  });

  $("src-synthetic").addEventListener("change", updateSource);
  $("src-symbol").addEventListener("change", updateSource);
  $("in-asset").addEventListener("change", updateCostNote);

  $("chip-doctor").addEventListener("click", function () {
    var open = $("doctor-panel").hasAttribute("hidden");
    if (!open) {
      show($("doctor-panel"), false);
      $("chip-doctor").setAttribute("aria-expanded", "false");
      return;
    }
    loadDoctor(true);
  });
  $("doctor-rerun").addEventListener("click", function () { loadDoctor(true); });

  $("btn-dashboard").addEventListener("click", renderDashboardReport);
  $("btn-quit").addEventListener("click", quit);
}

function start() {
  wire();
  updateSource();
  api("/api/state")
    .then(applyState)
    .then(function () { return loadDoctor(false); })
    .catch(function (e) {
      showError(e);
      fill($("pick-strategy"), h("p", { "class": "loading", text: "could not reach the desk" }));
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
