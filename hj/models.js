/* Hey Jamie Desk — the nine model panels.
 *
 * The desk's first four questions are about one strategy. These nine are about
 * the evidence underneath one: does a spread revert, what is a book exposed to,
 * what could it lose, did a model learn or memorise, how should the money be
 * split, does a trend survive moving the goalposts, what does the tail look
 * like, what is an option worth, and what does targeting volatility cost. They
 * are analyses, not strategies, and each is drawn so that the uncomfortable part
 * is the part you see first — the ADF stat next to its critical value, the
 * train/test gap, the three VaR numbers disagreeing, the resampled band
 * swallowing the optimiser's answer, the spike on the decay curve with nothing
 * either side of it.
 *
 * FOUR OF THESE NINE ARE ALSO DRAWN BY tape.js, INSIDE THE DOSSIER, and that is
 * worth stating plainly because it is the one place this file can drift. The
 * dossier's momentum / montecarlo / options / voltarget sections read the same
 * `to_dict()` this file reads, key for key. They are drawn twice because the two
 * surfaces answer different questions: the dossier is nine sections about one
 * ticker and each gets a screen, whereas a standalone model run is the whole
 * page and carries the hero chart the dossier has no room for — the decay curve
 * with the reported lookback and its interval marked, the fan with real paths
 * over it, the payoff with break-even on it, the tracking error as area. Sharing
 * the code would need tape.js to export its section drawers; it exports only its
 * four top-level renderers, and nothing here reaches into another file's
 * closure. Where a figure IS the same drawing in both, the function here names
 * its opposite number in tape.js, so a future export can delete this copy rather
 * than leave two.
 *
 * Three rules carried over from app.js, because they are the whole point:
 *   1. null is not zero. Every server value goes through numOrNull and renders
 *      as an em dash when it is absent. A number the engine could not compute
 *      must never appear as a measured zero.
 *   2. Nothing is inserted as markup. Every string arrives as a text node, so
 *      server text cannot become page structure.
 *   3. Every chart carries a labelled axis or a legend. A chart without one is
 *      decoration, and decoration is how a picture lies.
 *
 * Everything is drawn by hand — no chart library, no CDN, offline. The plot
 * helpers are deliberately small: a linear scale, nice ticks, and polylines
 * that BREAK at holes rather than bridging them. A bridged hole is a drawn
 * line through data that does not exist.
 *
 * This file depends on app.js for h/s/fill/cell/intervalBar/haircut/isNum/
 * numOrNull/fx/fpct and is loaded after it. It exposes exactly one global,
 * window.__MODELS__, and app.js calls into that or does nothing.
 */

"use strict";

window.__HEYJAMIE_MODELS__ = true;

(function () {

  var KINDS = ["statarb", "factors", "var", "ml", "optimize",
               "momentum", "montecarlo", "options", "voltarget"];

  /* Where each panel lives, and what to scroll to when a saved run is opened.
   * The first five are declared in index.html; the last four are built by
   * ensureSection() on first data, for the reason written above it. */
  var SECTION = {
    statarb: "q-statarb", factors: "q-factors", var: "q-var",
    ml: "q-ml", optimize: "q-optimize",
    momentum: "q-momentum", montecarlo: "q-montecarlo",
    options: "q-options", voltarget: "q-voltarget"
  };

  var W = 880;                       /* one viewBox width, so panels line up */

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function def(v, d) { return v === undefined || v === null ? d : v; }
  function nn(v) { return numOrNull(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }

  /* Server text, always as a string, never as markup. */
  function str(v, fallback) {
    if (v === null || v === undefined) return fallback === undefined ? "" : fallback;
    var t = String(v);
    return t.length ? t : (fallback === undefined ? "" : fallback);
  }

  /* A count for prose. A count the server did not send reads as an em dash,
   * because "0 bars" and "the desk did not say how many bars" are different
   * pieces of news and only one of them is a measurement. */
  function numOr(v, digits) {
    var n = nn(v);
    return isNum(n) ? fx(n, digits || 0) : "—";
  }

  function plural(n, one, many) {
    var v = nn(n);
    if (!isNum(v)) return "an unstated number of " + (many || one + "s");
    return fx(v, 0) + " " + (v === 1 ? one : (many || one + "s"));
  }

  /* Scientific notation, and it is not decoration. A put-call parity residual is
   * about 1e-16 when the pricer agrees with itself, and fx(v, 2) renders that as
   * "0.00" — the one formatting that turns a passing self-test into a number
   * that looks like nobody computed it. */
  function sci(v, digits) {
    var n = nn(v);
    if (!isNum(n)) return "—";
    if (n === 0) return "0";
    return n.toExponential(digits === undefined ? 2 : digits);
  }

  /* First argument that is actually a number. `a || b` is not this: it steps
   * over a real, measured 0 as if the server had said nothing. */
  function pickNum() {
    for (var i = 0; i < arguments.length; i++) {
      var v = nn(arguments[i]);
      if (isNum(v)) return v;
    }
    return null;
  }


  /* ------------------------------------------------------------ unwrapping */

  /* The job result may be the model's own to_dict(), or that dict nested under
   * the kind (or "model") with run metadata around it. Read both without
   * caring which the server chose.
   *
   * The merge is not symmetric, and that is the point. The envelope's keys win,
   * and a model key of the same name is kept beside them as "model_<key>"
   * rather than clobbering. The collision this exists for is "verdict": the
   * envelope's is the desk's grading, {state, headline, body}, and three of the
   * five models own a key of that name holding a paragraph of their own prose.
   * Spreading the model last quietly replaced the grading with the paragraph,
   * so the computed state and headline never reached the page at all. Current
   * payloads ship the prose as "model_verdict" already; older ones are repaired
   * into that same shape here. */
  function unwrap(kind, res) {
    if (!res || typeof res !== "object" || Array.isArray(res)) return null;
    var inner = res[kind] || res.model;
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) return res;
    var out = {}, k;
    for (k in inner) if (own(inner, k)) out[k] = inner[k];
    for (k in res) if (own(res, k)) {
      if (own(inner, k) && !own(out, "model_" + k)) out["model_" + k] = inner[k];
      out[k] = res[k];
    }
    return out;
  }

  /* The desk's grading of a run: {state, headline, body}. Null when the payload
   * carries no grading, or carries a bare string where the grading should be —
   * a string is the model's own prose and is read by prose() instead. */
  function grading(r) {
    var v = r ? r.verdict : null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return {
      state: v.state ? String(v.state) : "doubt",
      headline: v.headline ? String(v.headline) : "",
      body: v.body ? String(v.body) : ""
    };
  }

  /* The model's own paragraph. "model_verdict" per the wire format; a payload
   * old enough to still put a bare string under "verdict" is read there. */
  function prose(r) {
    if (r && typeof r.model_verdict === "string") return r.model_verdict;
    if (r && typeof r.verdict === "string") return r.verdict;
    var g = grading(r);
    return g ? g.body : "";
  }

  /* The grading of a run and where to find it, for the four panels added last.
   *
   * Two blocks can carry one and they are not interchangeable. The envelope's
   * `verdict` is models_api's grading and it is AUTHORITATIVE: it is computed
   * from the intervals, and it downgrades results the model's own sentence is
   * happy with. Momentum, Monte Carlo, options and vol-targeting ALSO write a
   * {state, headline, body} of their own in to_dict(), which
   * `_rename_model_verdict` moves to `model_verdict` on the way out so the two
   * cannot collide — and inside a dossier the section payload is the model's
   * to_dict() untouched, so there the model's grading arrives under `verdict`
   * and grading() finds it directly. Both shapes reach this function.
   *
   * The envelope wins every field it has. Nothing here derives a state from a
   * number: a run carrying no grading is reported as ungraded rather than graded
   * locally on a weaker rule. Recomputing a weaker rule client-side is a defect
   * this desk has already fixed twice, on the VaR panel and on the optimiser. */
  function verdictOf(r) {
    var top = grading(r);
    var mv = r ? r.model_verdict : null;
    var mine = null;
    if (mv && typeof mv === "object" && !Array.isArray(mv)) {
      mine = { state: str(mv.state), headline: str(mv.headline), body: str(mv.body) };
    }
    var body = (top && top.body) || (mine && mine.body) || prose(r);
    return {
      state: (top && top.state) || (mine && mine.state) || "doubt",
      headline: (top && top.headline) || (mine && mine.headline) || "",
      body: body,
      graded: !!((top && top.headline) || (mine && mine.headline))
    };
  }

  function verdictKids(v, absent) {
    if (!v.graded) return [note(absent)];
    var out = [h("p", { "class": "verdict " + v.state, text: v.headline })];
    if (v.body) out.push(h("p", { "class": "verdict-sub", text: v.body }));
    return out;
  }

  /* {dates, values} as the panels want it: parallel arrays, nulls preserved. */
  function ser(o) {
    if (!o || typeof o !== "object") return null;
    var raw = arr(o.values), dates = arr(o.dates);
    if (!raw.length) return null;
    var v = [];
    for (var i = 0; i < raw.length; i++) v.push(nn(raw[i]));
    return { dates: dates, v: v, n: v.length };
  }

  function finite(a) {
    var out = [];
    for (var i = 0; i < (a || []).length; i++) if (isNum(a[i])) out.push(a[i]);
    return out;
  }

  function minOf(a) { return a.length ? Math.min.apply(null, a) : null; }
  function maxOf(a) { return a.length ? Math.max.apply(null, a) : null; }

  /* Line up one dated series against another. Falls back to position only when
   * the two are the same length and carry no dates — never guesses otherwise,
   * because a silently misaligned overlay is worse than a missing one. */
  function alignTo(base, other) {
    if (!base || !other) return null;
    if (base.dates.length && other.dates.length) {
      var at = {};
      for (var i = 0; i < other.dates.length; i++) at[String(other.dates[i])] = other.v[i];
      var out = [];
      for (var j = 0; j < base.n; j++) {
        var key = String(base.dates[j]);
        out.push(own(at, key) ? at[key] : null);
      }
      return out;
    }
    return other.n === base.n ? other.v.slice() : null;
  }

  /* Dates are ISO strings from the server. Shorten for an axis tick. */
  function shortDate(d) {
    var t = String(d || "");
    return t.length >= 10 ? t.slice(0, 7) : t;
  }


  /* ------------------------------------------------------------ plot basics */

  function P(w, hgt, pad) {
    pad = pad || {};
    return {
      w: w, h: hgt,
      l: def(pad.l, 58), r: def(pad.r, 18), t: def(pad.t, 14), b: def(pad.b, 34),
      xlo: 0, xhi: 1, ylo: 0, yhi: 1
    };
  }

  function xOf(p, v) {
    var span = (p.xhi - p.xlo) || 1;
    return p.l + (v - p.xlo) / span * (p.w - p.l - p.r);
  }

  function yOf(p, v) {
    var span = (p.yhi - p.ylo) || 1;
    return p.h - p.b - (v - p.ylo) / span * (p.h - p.t - p.b);
  }

  /* Pad a domain so the extremes are not welded to the frame. `zero` forces the
   * zero line into view, which every around-zero chart in this file needs. */
  function domain(vals, padFrac, zero) {
    var v = finite(vals);
    if (!v.length) return null;
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (lo === hi) { var e = Math.abs(lo) || 1; lo -= e * 0.1; hi += e * 0.1; }
    var pad = (hi - lo) * def(padFrac, 0.08);
    return [lo - pad, hi + pad];
  }

  function setY(p, vals, padFrac, zero) {
    var d = domain(vals, padFrac, zero);
    if (!d) return false;
    p.ylo = d[0]; p.yhi = d[1];
    return true;
  }

  /* 1-2-5 ticks. Anything else puts 0.037 on an axis and calls it a label. */
  function niceTicks(lo, hi, want) {
    if (!isNum(lo) || !isNum(hi) || hi <= lo) return [];
    var raw = (hi - lo) / Math.max(2, want || 4);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    var out = [], v = Math.ceil(lo / step - 1e-9) * step;
    for (; v <= hi + step * 1e-9 && out.length < 24; v += step) {
      out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return out;
  }

  function fmtNum(d) { return function (v) { return fx(v, d); }; }
  function fmtPct(d) { return function (v) { return fpct(v, d); }; }

  function yAxis(p, fmt, want) {
    var kids = [], ticks = niceTicks(p.ylo, p.yhi, want || 4);
    for (var i = 0; i < ticks.length; i++) {
      var t = ticks[i], y = yOf(p, t).toFixed(1);
      kids.push(s("line", { "class": t === 0 ? "mc-zero" : "mc-grid",
                            x1: p.l, y1: y, x2: p.w - p.r, y2: y }));
      kids.push(s("text", { "class": "mc-tick", x: p.l - 7, y: y,
                            "text-anchor": "end", "dominant-baseline": "middle",
                            text: fmt(t) }));
    }
    return kids;
  }

  /* Ticks come in as [{v, label}] because half these axes are dates and dates
   * do not interpolate. */
  function xAxis(p, ticks, opts) {
    opts = opts || {};
    var y = p.h - p.b;
    var kids = [s("line", { "class": "mc-grid", x1: p.l, y1: y, x2: p.w - p.r, y2: y })];
    for (var i = 0; i < ticks.length; i++) {
      var x = xOf(p, ticks[i].v);
      kids.push(s("line", { "class": "mc-grid", x1: x.toFixed(1), y1: y,
                            x2: x.toFixed(1), y2: y + 4 }));
      kids.push(s("text", {
        "class": "mc-tick", x: x.toFixed(1), y: y + (opts.rotate ? 9 : 15),
        "text-anchor": opts.rotate ? "end" : "middle",
        transform: opts.rotate ? "rotate(-32 " + x.toFixed(1) + " " + (y + 9) + ")" : null,
        text: ticks[i].label
      }));
    }
    return kids;
  }

  function dateTicks(dates, count) {
    var out = [], n = dates.length;
    if (!n) return out;
    var want = Math.max(2, Math.min(count || 6, n));
    for (var i = 0; i < want; i++) {
      var idx = Math.round(i * (n - 1) / (want - 1));
      out.push({ v: idx, label: shortDate(dates[idx]) });
    }
    return out;
  }

  function axisTitles(p, xTitle, yTitle) {
    var kids = [];
    if (xTitle) {
      kids.push(s("text", { "class": "mc-axis-t", x: (p.l + p.w - p.r) / 2,
                            y: p.h - 2, "text-anchor": "middle", text: xTitle }));
    }
    if (yTitle) {
      var cy = (p.t + p.h - p.b) / 2;
      kids.push(s("text", { "class": "mc-axis-t", x: 11, y: cy, "text-anchor": "middle",
                            transform: "rotate(-90 11 " + cy.toFixed(1) + ")", text: yTitle }));
    }
    return kids;
  }

  function chart(p, label, kids, cls) {
    return s("svg", {
      "class": "mc " + (cls || ""), viewBox: "0 0 " + p.w + " " + p.h,
      preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": label
    }, [s("title", { text: label })].concat(kids));
  }

  /* Contiguous runs only. A gap in the data is a gap in the line. */
  function lines(p, xs, vs, cls) {
    var out = [], cur = [];
    for (var i = 0; i < vs.length; i++) {
      if (isNum(vs[i]) && isNum(xs[i])) {
        cur.push(xOf(p, xs[i]).toFixed(1) + "," + yOf(p, vs[i]).toFixed(1));
      } else {
        if (cur.length > 1) out.push(cur);
        cur = [];
      }
    }
    if (cur.length > 1) out.push(cur);
    return out.map(function (pts) {
      return s("polyline", { "class": "mc-line " + (cls || ""), points: pts.join(" ") });
    });
  }

  /* Filled envelope between two series, broken wherever either side is absent. */
  function band(p, xs, lo, hi, cls) {
    var out = [], run = [];
    function flush() {
      if (run.length > 1) {
        var top = [], bot = [];
        for (var k = 0; k < run.length; k++) {
          top.push(xOf(p, run[k].x).toFixed(1) + "," + yOf(p, run[k].hi).toFixed(1));
          bot.unshift(xOf(p, run[k].x).toFixed(1) + "," + yOf(p, run[k].lo).toFixed(1));
        }
        out.push(s("polygon", { "class": "mc-band " + (cls || ""),
                                points: top.concat(bot).join(" ") }));
      }
      run = [];
    }
    for (var i = 0; i < xs.length; i++) {
      if (isNum(lo[i]) && isNum(hi[i]) && isNum(xs[i])) run.push({ x: xs[i], lo: lo[i], hi: hi[i] });
      else flush();
    }
    flush();
    return out;
  }

  function seq(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

  function key(cls, text, shape) {
    return h("span", {}, [h("i", { "class": "k " + (shape || "k-line") + " " + cls }), text]);
  }

  function fig(head, node, legendKids, caption) {
    return h("figure", { "class": "mfig" }, [
      h("figcaption", { "class": "mfig-h" }, [
        h("b", { text: head }),
        caption ? h("span", { text: caption }) : null
      ]),
      node,
      legendKids && legendKids.length ? h("div", { "class": "m-legend" }, legendKids) : null
    ]);
  }

  function gone(text) { return h("p", { "class": "m-gone", text: text }); }

  function callout(text, tone) {
    return h("div", { "class": "disagree" + (tone === "bad" ? " bad" : "") , text: text });
  }

  function note(text) { return h("p", { "class": "m-note", text: text }); }

  function subject(text) { return h("p", { "class": "subject", text: text }); }

  function grid(cells) { return h("dl", { "class": "grid m-grid" }, cells); }

  /* A one-line spoken summary per panel. The card itself is not a live region:
   * announcing eight charts on every run is not accessibility, it is noise. */
  function live(kind, text) {
    var node = $("live-" + kind);
    if (node) node.textContent = text;
  }

  function histogram(vals, lo, hi, bins) {
    var counts = [], i;
    for (i = 0; i < bins; i++) counts.push(0);
    var step = (hi - lo) / bins;
    if (!(step > 0)) return null;
    for (i = 0; i < vals.length; i++) {
      if (!isNum(vals[i])) continue;
      var b = Math.floor((vals[i] - lo) / step);
      if (b < 0) b = 0;
      if (b >= bins) b = bins - 1;
      counts[b] += 1;
    }
    return { lo: lo, hi: hi, step: step, counts: counts };
  }

  /* Row/column heat grid. Every cell carries its number — the colour is a
   * second reading of the same value, never the only one. */
  function heat(rows, cols, get, opts) {
    opts = opts || {};
    var cw = def(opts.cw, 78), ch = def(opts.ch, 26), lw = def(opts.lw, 96);
    var wide = lw + cols.length * cw + 8;
    var high = 22 + rows.length * ch + 6;
    var p = P(wide, high, { l: lw, r: 8, t: 22, b: 6 });
    var kids = [], i, j;

    for (j = 0; j < cols.length; j++) {
      kids.push(s("text", { "class": "mc-tick", x: lw + j * cw + cw / 2, y: 14,
                            "text-anchor": "middle", text: cols[j].label }));
    }
    for (i = 0; i < rows.length; i++) {
      var y = 22 + i * ch;
      kids.push(s("text", { "class": "mc-tick mc-rowlab", x: lw - 8, y: y + ch / 2,
                            "text-anchor": "end", "dominant-baseline": "middle",
                            text: rows[i].label }));
      for (j = 0; j < cols.length; j++) {
        var v = nn(get(rows[i], cols[j]));
        var x = lw + j * cw;
        var mag = isNum(v) ? Math.min(1, Math.abs(v) / (opts.scale || 1)) : 0;
        kids.push(s("rect", {
          "class": "mc-cell " + (!isNum(v) ? "fl-none" : v >= 0 ? "fl-sig" : "fl-flt"),
          x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, rx: 1,
          "fill-opacity": isNum(v) ? (0.10 + 0.62 * mag).toFixed(3) : 0.04
        }));
        kids.push(s("text", { "class": "mc-cellv", x: x + cw / 2, y: y + ch / 2,
                              "text-anchor": "middle", "dominant-baseline": "middle",
                              text: fx(v, def(opts.digits, 2)) }));
      }
    }
    return chart(p, opts.label || "heat grid", kids, "mc-heat");
  }


  /* ---- the pieces the last four panels needed ----------------------------
   *
   * One geometry note that applies to all of them: they take r: 26 rather than
   * the default 18. The last x tick is centred on p.w - p.r, so at r: 18 a label
   * as long as "2020-10" runs to the edge of the 880-wide viewBox and loses its
   * final character to the clip. 26 buys the eight pixels back. */

  /* A horizontal reference line with its own label. Nothing is drawn when the
   * value sits outside the frame: a rule welded to the top edge is a rule
   * claiming a position it does not have. */
  function hRule(p, v, cls, label) {
    if (!isNum(v) || v < p.ylo || v > p.yhi) return [];
    var y = yOf(p, v);
    var out = [s("line", { "class": "mc-rule " + (cls || ""), x1: p.l, y1: y.toFixed(1),
                           x2: p.w - p.r, y2: y.toFixed(1) })];
    if (label) {
      out.push(s("text", { "class": "mc-annot", x: p.w - p.r - 4, y: (y - 5).toFixed(1),
                           "text-anchor": "end", text: label }));
    }
    return out;
  }

  /* A vertical reference line. The label flips to the left of the rule near the
   * right-hand edge rather than running off the viewBox — an annotation that
   * leaves the frame is an annotation nobody reads. */
  function vRule(p, x, cls, label, ly) {
    if (!isNum(x) || x < p.xlo || x > p.xhi) return [];
    var cx = xOf(p, x);
    var out = [s("line", { "class": "mc-rule " + (cls || ""), x1: cx.toFixed(1), y1: p.t,
                           x2: cx.toFixed(1), y2: (p.h - p.b).toFixed(1) })];
    if (label) {
      var right = cx > p.w - p.r - 96;
      out.push(s("text", { "class": "mc-annot", x: (cx + (right ? -4 : 4)).toFixed(1),
                           y: def(ly, p.t + 10), "text-anchor": right ? "end" : "start",
                           text: label }));
    }
    return out;
  }

  /* One estimate's interval, drawn vertically with caps. Nothing is drawn when
   * either end is absent: half an interval is not an interval, and a bar with
   * one cap reads as a bound that was measured. */
  function errBar(p, x, lo, hi, cls, cap) {
    if (!isNum(x) || !isNum(lo) || !isNum(hi)) return [];
    var cx = xOf(p, x), w = def(cap, 5);
    var yl = yOf(p, lo).toFixed(1), yh = yOf(p, hi).toFixed(1);
    return [
      s("line", { "class": "mc-err " + (cls || ""), x1: cx.toFixed(1), y1: yh,
                  x2: cx.toFixed(1), y2: yl }),
      s("line", { "class": "mc-errcap " + (cls || ""), x1: (cx - w).toFixed(1), y1: yh,
                  x2: (cx + w).toFixed(1), y2: yh }),
      s("line", { "class": "mc-errcap " + (cls || ""), x1: (cx - w).toFixed(1), y1: yl,
                  x2: (cx + w).toFixed(1), y2: yl })
    ];
  }

  function dots(p, xs, vs, cls, rad) {
    var out = [];
    for (var i = 0; i < vs.length; i++) {
      if (!isNum(vs[i]) || !isNum(xs[i])) continue;
      out.push(s("circle", { "class": "mk-pt " + (cls || ""), cx: xOf(p, xs[i]).toFixed(1),
                             cy: yOf(p, vs[i]).toFixed(1), r: def(rad, 2.6) }));
    }
    return out;
  }

  /* The area between two series, whichever is on top at each point. Both must be
   * present or the fill breaks there, exactly as a line would — an area closed
   * across a hole is the same lie as a line bridged across one. */
  function between(p, xs, a, b, cls) {
    var lo = [], hi = [];
    for (var i = 0; i < xs.length; i++) {
      if (isNum(a[i]) && isNum(b[i])) {
        lo.push(Math.min(a[i], b[i])); hi.push(Math.max(a[i], b[i]));
      } else { lo.push(null); hi.push(null); }
    }
    return band(p, xs, lo, hi, cls);
  }

  /* An equity path, on a dated axis when the dates line up with the values and
   * on a bar count when they do not. A date axis inferred from a list of another
   * length would label every point with the wrong day. */
  function curveChart(values, dates, head, label, caption) {
    var v = arr(values).map(function (x) { return nn(x); });
    if (finite(v).length < 2) return null;
    var d = arr(dates), dated = d.length === v.length;
    var p = P(W, 200, { l: 64, r: 26, b: 42 });
    p.xlo = 0; p.xhi = Math.max(1, v.length - 1);
    if (!setY(p, v, 0.08)) return null;
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, dated ? dateTicks(d, 6)
        : niceTicks(0, p.xhi, 6).map(function (t) { return { v: t, label: fx(t, 0) }; })))
      .concat(lines(p, seq(v.length), v, "st-vel"))
      .concat(axisTitles(p, dated ? null : "bars of the backtest", "equity, 1.00 at the start"));
    return fig(head, chart(p, label, kids), [key("st-vel", "net equity")], caption);
  }

  function mtable(caption, headers, rows) {
    if (!rows.length) return null;
    return h("div", { "class": "m-tablewrap" }, [
      h("table", { "class": "m-table" }, [
        h("caption", { text: caption }),
        h("thead", {}, [h("tr", {}, headers.map(function (t) {
          return h("th", { scope: "col", text: t });
        }))]),
        h("tbody", {}, rows)
      ])
    ]);
  }


  /* ------------------------------------------------------- panel scaffolds */

  /* index.html declares a section for each of the desk's original five. It does
   * not declare one for the four added later, and it should not have to: which
   * models are registered is the server's to say, which is the same reason
   * app.js builds the model rail rather than the page shipping it.
   *
   * So the shell is built here, on first data, in exactly the markup index.html
   * uses — section.q > .q-head > h2 + em, then the one-line live region, then
   * the card — and inserted ahead of the Opening Tape so the analyses stay
   * together above it. It is built once and reused. A live region replaced on
   * every render is a live region that never announces, because the
   * announcement is triggered by text changing inside a node the screen reader
   * already knows about, not by a node appearing with text in it. */
  var SHELL = {
    momentum:   ["Does it survive moving the goalposts?",
                 "the same rule at every other setting"],
    montecarlo: ["What does the tail look like?",
                 "resampled futures, against a normal fit"],
    options:    ["What is it worth?", "an identity, not a forecast"],
    voltarget:  ["What does the targeting cost?", "against the vol it was aiming at"]
  };

  function ensureSection(kind) {
    var existing = $(SECTION[kind]);
    if (existing) return existing;
    var spec = SHELL[kind], host = $("results");
    if (!spec || !host) return null;
    var sec = h("section", { "class": "q", id: SECTION[kind], hidden: true,
                             "aria-labelledby": "h-" + kind }, [
      h("div", { "class": "q-head" }, [
        h("h2", { id: "h-" + kind, text: spec[0] }),
        h("em", { text: spec[1] })
      ]),
      h("p", { "class": "q-live", id: "live-" + kind, role: "status", "aria-live": "polite" }),
      h("div", { "class": "card", id: "c-" + kind })
    ]);
    var anchor = $("tape-search");
    if (anchor && anchor.parentNode === host) host.insertBefore(sec, anchor);
    else host.appendChild(sec);
    return sec;
  }


  /* ==================================================================== 1 */
  /* DOES IT REVERT? — statistical arbitrage                                */

  /* The model's entry and exit bands, in spread units, already computed on the
   * FULL series with the real bar-count window and thinned onto the spread's own
   * index. They are drawn exactly as they arrive.
   *
   * They used to be recomputed here, from the drawn points, with the server's
   * z_window read as a count of drawn points rather than of bars. The server
   * thins the spread to 1200 points and passes z_window through untouched, so a
   * 60-bar window became 60 drawn points — at 4000 bars, a band drawn more than
   * four times wider than the one the signal actually used, under a caption
   * asserting it was the model's own. On the one case this panel exists to
   * expose, a spread that does not come back, that is the wrong picture.
   *
   * A list whose length does not match the spread rode a different clock, so the
   * whole set is refused rather than half-drawn. */
  function spreadBands(bands, n) {
    if (!bands || typeof bands !== "object" || Array.isArray(bands)) return null;
    var keys = ["entry_hi", "entry_lo", "exit_hi", "exit_lo"], out = {}, i, k;
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (!Array.isArray(bands[k]) || bands[k].length !== n) return null;
      out[k] = bands[k].map(function (v) { return nn(v); });
    }
    /* The trailing mean is the midpoint of the two entry bands by construction —
     * arithmetic on the numbers the server sent, not a second estimate of them. */
    out.mid = [];
    for (i = 0; i < n; i++) {
      out.mid.push(isNum(out.entry_hi[i]) && isNum(out.entry_lo[i])
                   ? (out.entry_hi[i] + out.entry_lo[i]) / 2 : null);
    }
    return out;
  }

  /* Where the held position changed. Opening or flipping is a trade; going
   * flat is an exit, and the two are drawn differently because they are. */
  function trades(sig) {
    var out = [], prev = 0;
    for (var i = 0; i < sig.length; i++) {
      var v = isNum(sig[i]) ? sig[i] : 0;
      if (v !== prev) out.push({ i: i, from: prev, to: v });
      prev = v;
    }
    return out;
  }

  /* The two raw close series. The wire format is
   * {"dates": [...], "x": [...], "y": [...]}, thinned on the spread's index, and
   * the leg names are the tickers the rest of the panel is already labelled
   * with. An older payload that boxed the legs under their own ticker keys is
   * still read; nothing is guessed when neither shape is there. */
  function pairPrices(r) {
    var src = r.prices || r.legs || r.price_series;
    if (!src || typeof src !== "object" || Array.isArray(src)) return null;
    var dates = arr(src.dates);
    if (Array.isArray(src.x) && Array.isArray(src.y)) {
      return {
        dates: dates,
        a: { name: String(def(r.x, "x")), v: src.x.map(function (v) { return nn(v); }) },
        b: { name: String(def(r.y, "y")), v: src.y.map(function (v) { return nn(v); }) }
      };
    }
    var box = src.series || src.values || src;
    var names = [], k;
    for (k in box) {
      if (!own(box, k) || k === "dates") continue;
      if (Array.isArray(box[k])) names.push(k);
    }
    if (names.length < 2) return null;
    var pick = [String(r.x), String(r.y)].filter(function (n) { return names.indexOf(n) >= 0; });
    if (pick.length < 2) pick = names.slice(0, 2);
    return {
      dates: dates,
      a: { name: pick[0], v: arr(box[pick[0]]).map(nn) },
      b: { name: pick[1], v: arr(box[pick[1]]).map(nn) }
    };
  }

  function legChart(px) {
    var base = [null, null], i, j;
    var legs = [px.a, px.b];
    for (j = 0; j < 2; j++) {
      for (i = 0; i < legs[j].v.length; i++) {
        if (isNum(legs[j].v[i]) && legs[j].v[i] > 0) { base[j] = legs[j].v[i]; break; }
      }
    }
    if (!isNum(base[0]) || !isNum(base[1])) return null;
    var out = [], all = [];
    for (j = 0; j < 2; j++) {
      var row = [];
      for (i = 0; i < legs[j].v.length; i++) {
        var x = legs[j].v[i];
        var lv = isNum(x) && x > 0 ? Math.log(x / base[j]) : null;
        row.push(lv);
        if (isNum(lv)) all.push(lv);
      }
      out.push(row);
    }
    var n = Math.max(out[0].length, out[1].length);
    var p = P(W, 190, { l: 58, b: 34 });
    p.xlo = 0; p.xhi = Math.max(1, n - 1);
    if (!setY(p, all, 0.08, true)) return null;
    var xs = seq(n);
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, dateTicks(px.dates, 6)))
      .concat(lines(p, xs, out[0], "st-blu"))
      .concat(lines(p, xs, out[1], "st-vio"))
      .concat(axisTitles(p, null, "log return from start"));
    return fig(
      "The two legs, normalised to a common start",
      chart(p, "log price of " + px.a.name + " and " + px.b.name +
               ", both re-based to zero at the first bar", kids),
      [key("st-blu", px.a.name), key("st-vio", px.b.name)],
      "cumulative log return, so a constant vertical gap is a constant ratio"
    );
  }

  function spreadChart(spread, sigv, entry, exit, zw, bandsIn) {
    /* No bands on the wire means no bands drawn. Assuming the usual ±2/±0.5, or
     * refitting them here, would put four confident lines on the page that the
     * model never said anything about. */
    var w = isNum(zw) ? Math.max(2, Math.round(zw)) : null;
    var bd = spreadBands(bandsIn, spread.n);
    var banded = !!bd;
    var upE = banded ? bd.entry_hi : [];
    var dnE = banded ? bd.entry_lo : [];
    var upX = banded ? bd.exit_hi : [];
    var dnX = banded ? bd.exit_lo : [];

    var p = P(W, 280, { l: 62, b: 34 });
    p.xlo = 0; p.xhi = Math.max(1, spread.n - 1);
    var pool = finite(spread.v).concat(finite(upE)).concat(finite(dnE));
    if (!setY(p, pool, 0.10)) return null;
    var xs = seq(spread.n);

    var kids = yAxis(p, fmtNum(3), 4).concat(xAxis(p, dateTicks(spread.dates, 6)));
    if (banded) {
      kids = kids.concat(band(p, xs, dnE, dnX, "fl-dbt"))     /* the two entry zones */
                 .concat(band(p, xs, upX, upE, "fl-dbt"))
                 .concat(band(p, xs, dnX, upX, "fl-chk"))     /* the flat-again zone */
                 .concat(lines(p, xs, upE, "st-dbt thin"))
                 .concat(lines(p, xs, dnE, "st-dbt thin"))
                 .concat(lines(p, xs, bd.mid, "st-chk dash"));
    }
    kids = kids.concat(lines(p, xs, spread.v, "st-vel"));

    var tr = sigv ? trades(sigv) : [];
    for (var i = 0; i < tr.length; i++) {
      var t = tr[i], v = spread.v[t.i];
      if (!isNum(v)) continue;
      var cx = xOf(p, t.i), cy = yOf(p, v);
      if (t.to === 0) {
        kids.push(s("circle", { "class": "mk-exit", cx: cx.toFixed(1), cy: cy.toFixed(1), r: 2.6 }));
      } else {
        var up = t.to > 0;                       /* +1 is long the spread */
        var d = up ? "M" + cx.toFixed(1) + "," + (cy - 6).toFixed(1) + " l4.6,8 h-9.2 z"
                   : "M" + cx.toFixed(1) + "," + (cy + 6).toFixed(1) + " l4.6,-8 h-9.2 z";
        kids.push(s("path", { "class": "mk-entry " + (up ? "fl-sig" : "fl-flt"), d: d }));
      }
    }
    kids = kids.concat(axisTitles(p, null, "spread  log(y) − β·log(x)"));

    var legend = [key("st-vel", "spread")];
    if (banded) {
      legend.push(key("st-chk dash", "trailing mean" + (isNum(w) ? ", " + w + " bars" : "")));
      legend.push(key("fl-dbt", isNum(entry) ? "beyond ±" + fx(entry, 1) + "σ — enter"
                                             : "beyond the entry band — enter", "k-box"));
      legend.push(key("fl-chk", isNum(exit) ? "inside ±" + fx(exit, 1) + "σ — close"
                                            : "inside the exit band — close", "k-box"));
    }
    legend.push(key("fl-sig", "long the spread", "k-tri"));
    legend.push(key("fl-flt", "short the spread", "k-tri"));
    legend.push(key("mk-exit", "flat", "k-dot"));

    return fig(
      banded ? "The spread, its bands, and every trade it took"
             : "The spread, and every trade it took",
      chart(p, "traded spread" + (banded ? " with rolling entry and exit bands" : "") +
               " and " + tr.length + " position changes marked", kids, "mc-hero"),
      legend,
      banded ? "the model's own bands, computed on every bar"
             + (isNum(w) ? " over a " + w + "-bar window" : "")
             + " and thinned onto this chart's index — not refitted here"
             : "the desk did not send the model's bands, so none are drawn: bands refitted "
             + "to the thinned series would not be the ones the signal traded"
    );
  }

  function zStrip(z, entry, exit) {
    var vals = finite(z.v);
    if (vals.length < 10) return null;
    var reach = Math.max(4, Math.ceil(Math.max(Math.abs(minOf(vals)), Math.abs(maxOf(vals)))));
    reach = Math.min(reach, 8);
    var hg = histogram(z.v, -reach, reach, 49);
    if (!hg) return null;
    var p = P(W, 150, { l: 58, b: 34, t: 10 });
    p.xlo = -reach; p.xhi = reach;
    p.ylo = 0; p.yhi = Math.max.apply(null, hg.counts) * 1.08 || 1;

    var marked = isNum(entry) && isNum(exit);
    var kids = yAxis(p, fmtNum(0), 3);
    for (var i = 0; i < hg.counts.length; i++) {
      var x0 = xOf(p, hg.lo + i * hg.step), x1 = xOf(p, hg.lo + (i + 1) * hg.step);
      var mid = hg.lo + (i + 0.5) * hg.step;
      var beyond = marked && Math.abs(mid) >= entry;
      var y = yOf(p, hg.counts[i]);
      kids.push(s("rect", {
        "class": "mc-bar " + (beyond ? "fl-dbt" : "fl-chk"),
        x: (x0 + 0.4).toFixed(1), y: y.toFixed(1),
        width: Math.max(0.8, x1 - x0 - 0.8).toFixed(1),
        height: Math.max(0, yOf(p, 0) - y).toFixed(1)
      }));
    }
    [[-entry, "−" + fx(entry, 1)], [entry, "+" + fx(entry, 1)],
     [-exit, "−" + fx(exit, 1)], [exit, "+" + fx(exit, 1)]].forEach(function (m) {
      if (!isNum(m[0]) || m[0] < p.xlo || m[0] > p.xhi) return;
      var x = xOf(p, m[0]).toFixed(1);
      kids.push(s("line", { "class": "mc-rule st-vel", x1: x, y1: p.t, x2: x, y2: p.h - p.b }));
      kids.push(s("text", { "class": "mc-tick", x: x, y: p.t + 8, "text-anchor": "middle", text: m[1] }));
    });
    kids = kids.concat(xAxis(p, niceTicks(p.xlo, p.xhi, 8).map(function (v) {
      return { v: v, label: fx(v, 0) };
    }))).concat(axisTitles(p, "z-score of the spread", "bars"));

    return fig(
      "Where the spread actually sat",
      chart(p, "distribution of the spread z-score" +
               (marked ? " with the entry and exit bands marked" : ""), kids),
      marked ? [key("fl-dbt", "beyond the entry band", "k-box"),
                key("fl-chk", "no position taken", "k-box")]
             : [key("fl-chk", "scored bars", "k-box")],
      finite(z.v).length + " scored bars"
    );
  }

  function pairsTable(rows) {
    if (!rows.length) return null;
    var head = ["#", "pair", "ADF", "5% crit", "half-life", "ρ", "reverts?"];
    var body = rows.slice(0, 12).map(function (row, i) {
      var adf = nn(row.adf_stat), crit = nn(row.adf_crit_5pct);
      var ok = !!row.is_stationary;
      return h("tr", {}, [
        h("td", { text: String(nn(row.rank) || i + 1) }),
        h("td", { "class": "t-name", text: String(row.y || "?") + " / " + String(row.x || "?") }),
        h("td", { "class": ok ? "t-sig" : "t-dbt", text: fx(adf, 2, true) }),
        h("td", { text: fx(crit, 2, true) }),
        h("td", { text: isNum(nn(row.half_life)) ? fx(nn(row.half_life), 0) + " bars" : "—" }),
        h("td", { text: fx(nn(row.correlation), 2) }),
        h("td", { "class": ok ? "t-sig" : "t-dbt", text: ok ? "clears" : "no" })
      ]);
    });
    return h("div", { "class": "m-tablewrap" }, [
      h("table", { "class": "m-table" }, [
        h("caption", { text: "Screened pairs, most stationary first" }),
        h("thead", {}, [h("tr", {}, head.map(function (t) { return h("th", { text: t }); }))]),
        h("tbody", {}, body)
      ])
    ]);
  }

  /* run_statarb_job charges the hedged spread for its own trading and ships the
   * whole block: gross and net Performance, the bootstrap interval on net
   * Sharpe, the cost drag, and the deflated Sharpe against the number of pairs
   * screened. None of it was drawn, so the panel warned about a screening tax
   * whose bill it never showed. */
  function equityChart(curve) {
    var v = arr(curve).map(function (x) { return nn(x); });
    if (finite(v).length < 2) return null;
    var p = P(W, 190, { l: 62, b: 40 });
    p.xlo = 0; p.xhi = Math.max(1, v.length - 1);
    if (!setY(p, v, 0.08)) return null;
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, niceTicks(0, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 0) };
      })))
      .concat(lines(p, seq(v.length), v, "st-vel"))
      .concat(axisTitles(p, "bars of the backtest", "equity, 1.00 at the start"));
    return fig("The money the spread made, net of what it cost to trade", chart(p,
      "cumulative net equity of the hedged spread, starting at one", kids),
      [key("st-vel", "net equity")],
      "after the cost model for this asset class — the gross line is in the grid below, "
      + "as a number, because it is not the one you would have kept");
  }

  function backtestBlock(bt, g) {
    if (!bt || typeof bt !== "object" || Array.isArray(bt)) return null;
    var gross = bt.gross || {}, net = bt.net || {};
    var ci = arr(bt.sharpe_ci);
    var ns = nn(net.sharpe), ds = nn(bt.deflated_sharpe), nt = nn(bt.n_trials);
    var dd = nn(net.max_drawdown);

    var kids = [h("h4", { "class": "m-h", text: "And what the trade paid" })];
    if (g && g.headline) kids.push(h("p", { "class": "verdict " + g.state, text: g.headline }));
    if (g && g.body) kids.push(h("p", { "class": "verdict-sub", text: g.body }));
    kids.push(intervalBar(nn(ci[0]), ns, nn(ci[1]),
                          "net Sharpe · 95% block-bootstrap interval"));
    if (typeof haircut === "function") {
      kids.push(haircut(ns, ds, isNum(nt) ? nt : 0));
    }
    var eq = equityChart(bt.equity_curve);
    if (eq) kids.push(eq);

    kids.push(grid([
      cell("Gross Sharpe", fx(nn(gross.sharpe), 2, true), "", "before it paid to trade"),
      cell("Net Sharpe", fx(ns, 2, true), isNum(ns) && ns < 0 ? "neg" : "",
           "the only one that counts"),
      cell("Deflated Sharpe", fx(ds, 2, true), isNum(ds) && ds <= 0 ? "amber" : "",
           isNum(nt) ? "after paying for " + fx(nt, 0) + " trial" + (nt === 1 ? "" : "s")
                     : "after paying for the search"),
      cell("Net CAGR", fpct(nn(net.cagr), 2, true), isNum(nn(net.cagr)) && nn(net.cagr) < 0 ? "neg" : "",
           "compounded, after costs"),
      cell("Cost drag", fpct(nn(bt.cost_drag), 2), "amber", "given up per year"),
      cell("Max drawdown", fpct(dd, 2), "neg", "worst peak-to-trough, net"),
      cell("Hit rate", fpct(nn(net.hit_rate), 1), "", "of bars in profit"),
      cell("Turnover", fx(nn(net.turnover), 1), "", "times a year"),
      cell("Bars", isNum(nn(net.n_periods)) ? fx(nn(net.n_periods), 0) : "—", "",
           "in the tested sample")
    ]));

    return h("div", { "class": "m-ivbox" }, kids);
  }

  function renderStatarb(r) {
    var spread = ser(r.spread), z = ser(r.zscore), sig = ser(r.signal);
    var entry = nn(r.entry_z), exit = nn(r.exit_z);
    var zw = nn(r.z_window);
    var hl = nn(r.half_life), adf = nn(r.adf_stat), crit = nn(r.adf_crit_5pct);
    var hold = isNum(nn(r.max_hold)) ? nn(r.max_hold) : zw;
    /* The screen ships as "candidates"; "pairs" is only ever an older payload.
     * Reading the wrong key here cost the panel its whole screening table, and
     * with it the two numbers — how many pairs were tested, how many would clear
     * on noise — that the multiple-comparisons warning below depends on. */
    var pairs = arr(r.candidates).length ? arr(r.candidates) : arr(r.pairs);
    var top = pairs.length ? pairs[0] : {};
    var screened = pickNum(r.n_screened, top.n_screened);
    var falsePos = pickNum(r.expected_false_positives, top.expected_false_positives);
    var stationary = !!r.is_stationary;
    /* The model's own rule: a trade entered at ±entry has to come back inside
     * ±exit, which is about two half-lives of decay. One half-life inside the
     * window is not enough to close. */
    var slow = isNum(hl) && isNum(hold) ? 2 * hl > hold : !isNum(hl);

    var kids = [
      subject(String(r.y || "?") + " / " + String(r.x || "?") +
              "  ·  " + (r.rolling === false ? "full-sample hedge ratio (optimistic)"
                                             : "trailing hedge ratio") +
              (isNum(zw) ? "  ·  z over " + fx(zw, 0) + " bars" : "")),
      h("p", {
        "class": "verdict " + (stationary && !slow ? "signal" : "doubt"),
        text: stationary ? (slow ? "It reverts, but not in time" : "The spread comes back")
                         : "Not shown to revert"
      }),
      h("p", { "class": "verdict-sub", text: stationary
        ? (slow ? "The ADF stat clears its critical value, so the spread is mean-reverting in this "
                + "sample — but the half-life is long against the window you are testing. You would "
                + "be exiting on the clock, not on the signal."
                : "The ADF stat clears the critical value for a fitted hedge ratio and the half-life "
                + "fits inside the holding window. That is the strongest form this test has, and it "
                + "is still a statement about one sample of two prices.")
        : "The Dickey-Fuller statistic does not clear its 5% critical value, so this spread has not "
        + "been shown to be stationary. Everything below describes a series that may simply wander." })
    ];

    if (spread) {
      var sigAligned = sig ? alignTo(spread, sig) : null;
      var hero = spreadChart(spread, sigAligned, entry, exit, zw, r.bands);
      if (hero) kids.push(hero);
    } else {
      kids.push(gone("The desk did not send a spread series, so the hero chart has nothing to draw."));
    }

    var px = pairPrices(r);
    if (px) {
      var legs = legChart(px);
      if (legs) kids.push(legs);
    } else {
      kids.push(gone("The two price paths were not part of this result, so the legs are not drawn. "
                   + "The spread above is the part that matters anyway."));
    }

    if (z) {
      var strip = zStrip(z, entry, exit);
      if (strip) kids.push(strip);
    }

    kids.push(grid([
      cell("Hedge ratio", fx(nn(r.hedge_ratio), 3), "", "units of x per unit of y"),
      cell("Half-life", isNum(hl) ? fx(hl, 1) + " bars" : "—", slow ? "amber" : "",
           !isNum(hl) ? "no reversion measured"
                      : isNum(hold) ? "two of these must fit in " + fx(hold, 0) + " bars"
                                    : "no holding window to judge it against"),
      cell("ADF stat", fx(adf, 2, true), stationary ? "" : "amber",
           "needs to be below " + fx(crit, 2, true)),
      cell("Stationary", stationary ? "yes" : "no", stationary ? "pos" : "amber",
           "at the 5% bar for a fitted β"),
      cell("Trades", isNum(nn(r.n_trades)) ? String(nn(r.n_trades)) : "—", "", "positions opened"),
      cell("Pairs screened", isNum(screened) ? String(screened) : "—",
           isNum(screened) && screened > 1 ? "amber" : "",
           isNum(falsePos) ? "≈" + fx(falsePos, 1) + " pass on noise alone" : "the multiple-comparisons count"),
      cell("Correlation", fx(nn(r.correlation), 2), "", "of log levels — decoration, not evidence"),
      cell("Bands", isNum(entry) && isNum(exit)
                      ? "±" + fx(entry, 1) + " / ±" + fx(exit, 1) : "—", "", "enter / exit, in σ")
    ]));

    if (isNum(screened) && screened > 1) {
      kids.push(note("This pair was the best of " + screened + " screened. Hand that number to "
                   + "trials on the backtest — the deflated Sharpe is meaningless without it."));
    }

    var table = pairsTable(pairs);
    if (table) kids.push(table);

    /* The desk's grading here is of the backtest, not of the stationarity test
     * above it, so it is printed with the money rather than over the spread. */
    var bt = backtestBlock(r.backtest, grading(r));
    if (bt) kids.push(bt);

    arr(r.warnings).forEach(function (wtext) { kids.push(callout(String(wtext))); });

    fill($("c-statarb"), kids);
    live("statarb", (stationary ? "Spread is stationary" : "Spread not shown to revert") +
                    ", half-life " + (isNum(hl) ? fx(hl, 0) + " bars" : "undefined") +
                    ", ADF " + fx(adf, 2, true) + " against " + fx(crit, 2, true) + ".");
  }


  /* ==================================================================== 2 */
  /* WHAT IS IT EXPOSED TO? — factors                                       */

  function quantileFan(qc, ann) {
    var dates = arr(qc.dates);
    var box = qc.series || qc.values || {};
    var names = [];
    for (var k in box) if (own(box, k) && Array.isArray(box[k])) names.push(k);
    if (names.length < 2) return null;
    names.sort(function (a, b) {
      var na = parseInt(String(a).replace(/\D/g, ""), 10), nb = parseInt(String(b).replace(/\D/g, ""), 10);
      return (isNum(na) ? na : 0) - (isNum(nb) ? nb : 0);
    });
    var seriesv = names.map(function (n) { return arr(box[n]).map(nn); });
    var all = [];
    seriesv.forEach(function (v) { all = all.concat(finite(v)); });
    if (!all.length) return null;

    var n = Math.max.apply(null, seriesv.map(function (v) { return v.length; }));
    var p = P(W, 240, { l: 62, b: 34 });
    p.xlo = 0; p.xhi = Math.max(1, n - 1);
    setY(p, all, 0.08, true);
    var xs = seq(n);

    var kids = yAxis(p, fmtPct(0), 4).concat(xAxis(p, dateTicks(dates, 6)));
    var last = names.length - 1;
    for (var i = 0; i < names.length; i++) {
      var cls = i === 0 ? "st-flt" : (i === last ? "st-sig" : "st-chk dim");
      kids = kids.concat(lines(p, xs, seriesv[i], cls));
    }
    kids = kids.concat(axisTitles(p, null, "cumulative return"));

    var legend = names.map(function (nm, i) {
      var a = nn(ann[i]);
      var cls = i === 0 ? "st-flt" : (i === last ? "st-sig" : "st-chk dim");
      return key(cls, nm + " " + (isNum(a) ? fpct(a, 1, true) + "/yr" : "—"));
    });
    return fig("The sort, quantile by quantile", chart(p,
      "cumulative return of each quantile, bottom and top emphasised", kids), legend,
      "Q1 is the lowest score, Q" + names.length + " the highest");
  }

  function icBars(ic, mean) {
    var p = P(W, 190, { l: 62, b: 34 });
    p.xlo = 0; p.xhi = Math.max(1, ic.n - 1);
    if (!setY(p, ic.v, 0.08, true)) return null;
    var kids = yAxis(p, fmtNum(2), 4);
    var bw = Math.max(0.6, (p.w - p.l - p.r) / Math.max(1, ic.n) - 0.3);
    var y0 = yOf(p, 0);
    for (var i = 0; i < ic.n; i++) {
      var v = ic.v[i];
      if (!isNum(v)) continue;
      var y = yOf(p, v);
      kids.push(s("rect", {
        "class": "mc-bar " + (v >= 0 ? "fl-sig" : "fl-flt"),
        x: (xOf(p, i) - bw / 2).toFixed(2), y: Math.min(y, y0).toFixed(1),
        width: bw.toFixed(2), height: Math.max(0.4, Math.abs(y0 - y)).toFixed(1)
      }));
    }
    if (isNum(mean)) {
      var ym = yOf(p, mean);
      kids.push(s("line", { "class": "mc-rule st-vel", x1: p.l, y1: ym.toFixed(1),
                            x2: p.w - p.r, y2: ym.toFixed(1) }));
      kids.push(s("text", { "class": "mc-tick mc-annot", x: p.w - p.r - 4, y: (ym - 5).toFixed(1),
                            "text-anchor": "end", text: "mean " + fx(mean, 4, true) }));
    }
    kids = kids.concat(xAxis(p, dateTicks(ic.dates, 6))).concat(axisTitles(p, null, "rank IC"));
    return fig("Information coefficient, bar by bar", chart(p,
      "cross-sectional rank IC per bar with the mean drawn across", kids),
      [key("fl-sig", "IC above zero", "k-box"), key("fl-flt", "IC below zero", "k-box"),
       key("st-vel", "mean IC")],
      finite(ic.v).length + " scored cross-sections");
  }

  function corrHeat(fc) {
    var names = [];
    for (var k in fc) if (own(fc, k)) names.push(k);
    if (names.length < 2) return null;
    var rows = names.map(function (n) { return { label: n, key: n }; });
    var cols = names.map(function (n) { return { label: n, key: n }; });
    var node = heat(rows, cols, function (r, c) {
      var row = fc[r.key];
      return row && own(row, c.key) ? row[c.key] : null;
    }, { label: "correlation between the factors, pooled over every date and asset",
         digits: 2, scale: 1, cw: 82, lw: 100 });
    return fig("Are these four factors four ideas?", node,
      [key("fl-sig", "positive", "k-box"), key("fl-flt", "negative", "k-box")],
      "two factors that agree everywhere are one factor with two names — and the composite double-counts it");
  }

  function renderFactors(r) {
    var ic = ser(r.ic);
    var ci = arr(r.ic_ci);
    var lo = nn(ci[0]), hi = nn(ci[1]);
    var mono = !!r.monotonic;
    var ann = arr(r.quantile_ann).map(nn);
    var names = arr(r.factor_names).map(String);
    var nq = nn(r.n_quantiles) || ann.length;

    /* The desk graded this run on the IC interval before it reached the page.
     * Use that grading; the local rule below is the fallback for a payload that
     * carries none, and the two are written from the same comparison. */
    var g = grading(r);
    var tone = r.ic_ci_excludes_zero ? (mono ? "signal" : "doubt") : "doubt";
    var head = !r.ic_ci_excludes_zero ? "The sort tells you nothing"
             : (mono ? "The whole cross-section is paying" : "One bucket, not a factor");

    var kids = [
      subject(names.join(" + ") + "  ·  " + (nn(r.n_assets) || "—") + " names  ·  " +
              (nn(r.n_periods) || "—") + " bars  ·  rebalanced every " +
              (nn(r.rebalance) || "—")),
      h("p", { "class": "verdict " + (g && g.state ? g.state : tone),
               text: g && g.headline ? g.headline : head }),
      h("p", { "class": "verdict-sub", text: prose(r) })
    ];

    if (r.quantile_cum) {
      var fan = quantileFan(r.quantile_cum, ann);
      if (fan) kids.push(fan);
      else kids.push(gone("No quantile paths came back, so the fan is not drawn."));
    }

    kids.push(h("div", { "class": "m-ivbox" }, [
      intervalBar(lo, nn(r.ic_mean), hi, "mean rank IC · 95% block-bootstrap interval"),
      note(isNum(lo) && isNum(hi) && lo <= 0 && 0 <= hi
        ? "The interval contains zero. At this sample size that is what an honest null looks like — "
        + "do not read the quantile fan above as if it were a result."
        : "The interval clears zero in this sample. Rank IC is ordering, not money: cost it before "
        + "believing it.")
    ]));

    if (ic) {
      var bars = icBars(ic, nn(r.ic_mean));
      if (bars) kids.push(bars);
    }

    /* Monotonicity is the claim that matters more than the headline spread. */
    var ordered = [];
    for (var i = 0; i < ann.length; i++) {
      ordered.push(h("div", { "class": "mono-cell" }, [
        h("span", { "class": "mono-q", text: "Q" + (i + 1) }),
        h("span", { "class": "mono-v " + (isNum(ann[i]) && ann[i] < 0 ? "neg" : ""),
                    text: fpct(ann[i], 1, true) }),
        (i > 0 && isNum(ann[i]) && isNum(ann[i - 1]))
          ? h("span", { "class": "mono-step " + (ann[i] > ann[i - 1] ? "up" : "down"),
                        text: ann[i] > ann[i - 1] ? "▲" : "▼" })
          : null
      ]));
    }
    if (ordered.length) {
      kids.push(h("div", { "class": "mono" }, [
        h("h4", { "class": "m-h", text: "Do the quantiles line up in order?" }),
        h("div", { "class": "mono-row" }, ordered),
        h("p", { "class": "mono-read " + (mono ? "ok" : "no"),
                 text: mono
                   ? "Yes — annualised return rises from Q1 to Q" + nq + " without a step backwards. "
                   + "That is the strong form of the claim."
                   : "No — the buckets are NOT in order. The spread is an artefact of the extremes "
                   + "rather than a smooth exposure, and it will not survive a different bucket count." }),
        h("p", { "class": "mono-read", text: "The spread comes from " + String(r.spread_source || "—")
                 + ". Long leg " + fpct(nn(r.long_leg_contribution), 2, true) + "/yr and short leg "
                 + fpct(nn(r.short_leg_contribution), 2, true) + "/yr against an equal-weight universe at "
                 + fpct(nn(r.universe_ann), 2, true) + "/yr." })
      ]));
    }

    if (r.factor_corr) {
      var hm = corrHeat(r.factor_corr);
      if (hm) kids.push(hm);
    }

    /* Both long-short Sharpes travel with a bootstrap interval on the wire. The
     * gross one used to be printed as a bare number beside a net one that got a
     * full interval bar, which made the panel disagree with itself: a captured
     * run showed +0.28 with an interval of [-1.93, +1.80], and the naked figure
     * is the only part of that a reader remembers. */
    var grossci = arr(r.ls_sharpe_ci);
    var glo = nn(grossci[0]), ghi = nn(grossci[1]);
    var grossStraddles = isNum(glo) && isNum(ghi) && glo <= 0 && 0 <= ghi;

    kids.push(grid([
      cell("Mean IC", fx(nn(r.ic_mean), 4, true), r.ic_ci_excludes_zero ? "pos" : "amber",
           "rank correlation per bar"),
      cell("IC IR", fx(nn(r.ic_ir), 3, true), "", "mean over sd, not annualised"),
      cell("IC positive", fpct(nn(r.ic_positive_rate), 0), "", "of scored bars"),
      cell("LS Sharpe", fx(nn(r.ls_sharpe), 2, true), grossStraddles ? "amber" : "",
           "gross, top minus bottom — read the interval below it"),
      cell("LS Sharpe net", fx(nn(r.ls_sharpe_net), 2, true),
           isNum(nn(r.ls_sharpe_net)) && nn(r.ls_sharpe_net) < 0 ? "neg" : "", "after costs"),
      cell("Cost drag", fpct(nn(r.ls_cost_drag), 2), "amber", "given up per year"),
      cell("Turnover", fx(nn(r.turnover), 1), "", "times per year, rebalances only"),
      cell("Monotonic", mono ? "yes" : "no", mono ? "pos" : "amber", "across " + nq + " buckets")
    ]));

    var netci = arr(r.ls_sharpe_net_ci);
    kids.push(h("div", { "class": "m-ivbox" }, [
      intervalBar(glo, nn(r.ls_sharpe), ghi,
                  "long-short Sharpe, gross · 95% interval"),
      intervalBar(nn(netci[0]), nn(r.ls_sharpe_net), nn(netci[1]),
                  "long-short Sharpe, net of costs · 95% interval"),
      grossStraddles
        ? note("The gross interval contains zero, so costs are not what killed this — there was "
             + "nothing there to cost. The net bar below it is the same statement with a fee "
             + "subtracted from a number that was never distinguishable from noise.")
        : null
    ]));

    if (r.exposures) {
      var assets = [];
      for (var a in r.exposures) if (own(r.exposures, a)) assets.push(a);
      if (assets.length && names.length) {
        assets.sort(function (x, y) {
          var rx = r.exposures[x], ry = r.exposures[y];
          var mx = 0, my = 0, c = 0;
          for (var f = 0; f < names.length; f++) {
            var vx = nn(rx[names[f]]), vy = nn(ry[names[f]]);
            if (isNum(vx)) { mx += vx; c++; }
            if (isNum(vy)) my += vy;
          }
          return (my / (c || 1)) - (mx / (c || 1));
        });
        kids.push(fig("The cross-section today, sorted", heat(
          assets.map(function (n) { return { label: n, key: n }; }),
          names.map(function (n) { return { label: n, key: n }; }),
          function (row, col) {
            var e = r.exposures[row.key];
            return e && own(e, col.key) ? e[col.key] : null;
          },
          { label: "standardised factor exposure per asset on the last scored date",
            digits: 2, scale: 2, cw: 84, lw: 92, ch: 24 }
        ), [key("fl-sig", "above the universe", "k-box"), key("fl-flt", "below it", "k-box")],
          "z-scores on " + String(r.exposure_date || "the last scored date")
          + " — relative to this universe and no other"));
      }
    }

    fill($("c-factors"), kids);
    live("factors", "Mean IC " + fx(nn(r.ic_mean), 4, true) + ", interval " +
                    fx(lo, 4, true) + " to " + fx(hi, 4, true) + ", quantiles " +
                    (mono ? "in order" : "not in order") + ".");
  }


  /* ==================================================================== 3 */
  /* WHAT COULD IT LOSE? — value at risk                                    */

  var VAR_METHODS = [
    { k: "historical", label: "historical", cls: "vel",
      why: "the empirical quantile — cannot imagine a loss worse than the worst bar it has seen" },
    { k: "gaussian", label: "gaussian", cls: "blu",
      why: "μ + σz — assumes normality, and the departure from normal lives in this exact tail" },
    { k: "cornish_fisher", label: "Cornish-Fisher", cls: "vio",
      why: "the normal quantile patched for skew and kurtosis — a correction, not a fix" }
  ];

  function varHero(r) {
    var hg = r.histogram || {};
    var edges = arr(hg.edges).map(nn), counts = arr(hg.counts).map(nn);
    if (edges.length < 2 || counts.length < 1) return null;

    var lo = edges[0], hi = edges[edges.length - 1];
    var span = hi - lo;
    var cuts = VAR_METHODS.map(function (m) {
      var v = nn(r[m.k]);
      return { m: m, v: v, at: isNum(v) ? -v : null };
    });

    /* Cutoffs are pulled into view, but only so far. A 10-day VaR drawn against
     * a 1-day histogram genuinely does sit off the page, and squashing the
     * distribution into a corner to pretend otherwise would be the lie. */
    var floor = lo - 0.9 * span;
    var xlo = lo, i;
    for (i = 0; i < cuts.length; i++) {
      if (isNum(cuts[i].at) && cuts[i].at < xlo) xlo = Math.max(cuts[i].at, floor);
    }
    var p = P(W, 290, { l: 62, b: 40 });
    p.xlo = xlo - span * 0.03; p.xhi = hi + span * 0.03;
    p.ylo = 0; p.yhi = (maxOf(finite(counts)) || 1) * 1.16;

    var kids = yAxis(p, fmtNum(0), 4);

    /* The CVaR tail: every observation beyond the historical cutoff. */
    var tailAt = cuts[0].at;
    if (isNum(tailAt) && tailAt > p.xlo) {
      kids.push(s("rect", { "class": "mc-tail", x: p.l, y: p.t,
                            width: Math.max(0, xOf(p, tailAt) - p.l).toFixed(1),
                            height: (p.h - p.b - p.t).toFixed(1) }));
    }
    for (i = 0; i < counts.length && i + 1 < edges.length; i++) {
      if (!isNum(counts[i])) continue;
      var x0 = xOf(p, edges[i]), x1 = xOf(p, edges[i + 1]);
      var y = yOf(p, counts[i]);
      var inTail = isNum(tailAt) && edges[i + 1] <= tailAt + 1e-12;
      kids.push(s("rect", {
        "class": "mc-bar " + (inTail ? "fl-flt" : "fl-chk"),
        x: (x0 + 0.3).toFixed(1), y: y.toFixed(1),
        width: Math.max(0.8, x1 - x0 - 0.6).toFixed(1),
        height: Math.max(0, yOf(p, 0) - y).toFixed(1)
      }));
    }

    var lane = 0;
    for (i = 0; i < cuts.length; i++) {
      var c = cuts[i];
      if (!isNum(c.at)) continue;
      var off = c.at < p.xlo;
      var x = xOf(p, off ? p.xlo : c.at);
      kids.push(s("line", { "class": "mc-rule st-" + c.m.cls, x1: x.toFixed(1), y1: p.t,
                            x2: x.toFixed(1), y2: (p.h - p.b).toFixed(1) }));
      kids.push(s("text", {
        "class": "mc-annot fi-" + c.m.cls, x: (x + 4).toFixed(1), y: p.t + 10 + lane * 13,
        "text-anchor": "start",
        text: c.m.label + " " + fpct(c.v, 2) + (off ? " (off scale ←)" : "")
      }));
      lane += 1;
    }
    var cv = nn(r.cvar_historical);
    if (isNum(cv) && -cv >= p.xlo) {
      var xc = xOf(p, -cv);
      kids.push(s("line", { "class": "mc-rule st-flt dash", x1: xc.toFixed(1), y1: p.t,
                            x2: xc.toFixed(1), y2: p.h - p.b }));
      kids.push(s("text", { "class": "mc-annot fi-flt", x: (xc + 4).toFixed(1), y: p.h - p.b - 6,
                            "text-anchor": "start", text: "CVaR " + fpct(cv, 2) }));
    }

    kids = kids.concat(xAxis(p, niceTicks(p.xlo, p.xhi, 7).map(function (v) {
      return { v: v, label: fpct(v, 1) };
    }))).concat(axisTitles(p, "bar return", "bars"));

    var legend = VAR_METHODS.map(function (m) { return key("st-" + m.cls, m.label); });
    legend.push(key("st-flt dash", "CVaR — the mean of that tail"));
    legend.push(key("fl-flt", "beyond historical VaR", "k-box"));

    return fig("The distribution, and where the three lines fall", chart(p,
      "return distribution with the three value-at-risk cutoffs marked and the tail beyond "
      + "historical VaR shaded", kids, "mc-hero"), legend,
      isNum(nn(r.horizon)) && nn(r.horizon) > 1
        ? "the histogram is one bar; the cutoffs are scaled to " + fx(nn(r.horizon), 0)
        + " bars by √h, which assumes returns are independent"
        : "one bar of return per observation");
  }

  /* Three defensible methods, one axis. If they disagree, that spread is the
   * model risk and it is the reason this panel exists. */
  function methodBars(r) {
    var vals = VAR_METHODS.map(function (m) { return nn(r[m.k]); });
    var ok = finite(vals);
    if (!ok.length) return null;
    var rows = VAR_METHODS.length + 1;
    var p = P(W, 34 + rows * 30 + 30, { l: 122, r: 74, t: 22, b: 30 });
    /* The axis is stretched to hold CVaR only if CVaR exists. An absent CVaR
     * contributes nothing to the scale rather than contributing a zero. */
    p.xlo = 0;
    p.xhi = (maxOf(ok.concat(finite([nn(r.cvar_historical)]))) || 1) * 1.16;

    var kids = [], i;
    var ticks = niceTicks(0, p.xhi, 5);
    for (i = 0; i < ticks.length; i++) {
      var gx = xOf(p, ticks[i]).toFixed(1);
      kids.push(s("line", { "class": "mc-grid", x1: gx, y1: p.t, x2: gx, y2: p.h - p.b }));
      kids.push(s("text", { "class": "mc-tick", x: gx, y: p.h - p.b + 14,
                            "text-anchor": "middle", text: fpct(ticks[i], 1) }));
    }
    var series = VAR_METHODS.map(function (m, j) {
      return { label: m.label, v: vals[j], cls: m.cls };
    });
    series.push({ label: "CVaR", v: nn(r.cvar_historical), cls: "flt" });

    for (i = 0; i < series.length; i++) {
      var y = p.t + i * 30 + 4;
      kids.push(s("text", { "class": "mc-tick mc-rowlab", x: p.l - 10, y: y + 9,
                            "text-anchor": "end", "dominant-baseline": "middle",
                            text: series[i].label }));
      if (isNum(series[i].v)) {
        kids.push(s("rect", { "class": "mc-bar fl-" + series[i].cls, x: p.l, y: y,
                              width: Math.max(1, xOf(p, series[i].v) - p.l).toFixed(1),
                              height: 18, rx: 1 }));
      }
      kids.push(s("text", { "class": "mc-annot", x: p.w - p.r + 6, y: y + 9,
                            "text-anchor": "start", "dominant-baseline": "middle",
                            text: fpct(series[i].v, 2) }));
    }
    kids = kids.concat(axisTitles(p, "loss as a fraction of capital, at " +
                                     fpct(nn(r.confidence), 0) + " confidence", null));
    return chart(p, "the three value-at-risk estimates and CVaR on one axis", kids);
  }

  /* Dates as milliseconds, or null if any of them will not parse. Used only to
   * decide which of two neighbouring drawn bars a breach is nearer to. */
  function timeline(dates) {
    var out = [], i, t;
    for (i = 0; i < dates.length; i++) {
      t = Date.parse(String(dates[i]));
      if (!isNum(t)) return null;
      out.push(t);
    }
    return out;
  }

  /* Index of the drawn bar nearest `t`. `times` is ascending, as every dated
   * series on this desk is. */
  function snapTo(times, t) {
    var lo = 0, hi = times.length - 1, mid;
    while (lo < hi) {
      mid = (lo + hi) >> 1;
      if (times[mid] < t) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t)) return lo - 1;
    return lo;
  }

  /* The realised path drawn under the forecast. The wire format is a bare list
   * of returns riding the same thinned index as rolling_var, so it lines up by
   * position; a {dates, values} block from an older payload is lined up by date
   * instead. A loss is −return, and a null stays null — it breaks the line
   * rather than drawing a flat, confident zero across a bar nobody measured. */
  function realisedLoss(r, rv) {
    var aligned = null, invert = true, i;
    if (Array.isArray(r.returns) && r.returns.length === rv.n) {
      aligned = r.returns.map(function (v) { return nn(v); });
    } else if (Array.isArray(r.losses) && r.losses.length === rv.n) {
      aligned = r.losses.map(function (v) { return nn(v); });
      invert = false;
    } else {
      var blk = ser(r.returns) || ser(r.losses);
      if (!blk) return null;
      aligned = alignTo(rv, blk);
      invert = !r.losses;
    }
    if (!aligned) return null;
    var out = [];
    for (i = 0; i < aligned.length; i++) {
      out.push(isNum(aligned[i]) ? (invert ? -aligned[i] : aligned[i]) : null);
    }
    return finite(out).length ? out : null;
  }

  function rollingVar(r) {
    var rv = ser(r.rolling_var);
    if (!rv) return null;
    var breaches = arr(r.breaches);
    var at = {};
    for (var i = 0; i < rv.dates.length; i++) at[String(rv.dates[i])] = i;
    var times = timeline(rv.dates);

    var lossv = realisedLoss(r, rv);

    var p = P(W, 220, { l: 62, b: 34 });
    p.xlo = 0; p.xhi = Math.max(1, rv.n - 1);
    var pool = finite(rv.v).concat(lossv ? finite(lossv) : []);
    for (i = 0; i < breaches.length; i++) pool.push(nn(breaches[i].loss));
    if (!setY(p, finite(pool), 0.08, true)) return null;
    var xs = seq(rv.n);

    var kids = yAxis(p, fmtPct(1), 4).concat(xAxis(p, dateTicks(rv.dates, 6)));
    if (lossv) kids = kids.concat(lines(p, xs, lossv, "st-chk thin"));
    kids = kids.concat(lines(p, xs, rv.v, "st-dbt"));

    /* Breaches are counted on every bar of the backtest; this chart draws at
     * most 1200 of them. Placing each one by exact date lookup silently dropped
     * every breach whose bar the server thinned away, so the legend contradicted
     * the Breaches cell an inch below it — 17 drawn against 71 counted, on the
     * same panel, about the same run. Each breach is snapped to the nearest
     * surviving bar instead, the legend carries the model's own count, and how
     * many marks that came to is said separately. */
    var seen = {}, drawn = 0, snapped = 0, unplaced = 0;
    for (i = 0; i < breaches.length; i++) {
      var b = breaches[i] || {}, lv = nn(b.loss);
      var idx = at[String(b.date)];
      if (idx === undefined && times) {
        var t = Date.parse(String(b.date));
        if (isNum(t)) { idx = snapTo(times, t); snapped += 1; }
      }
      if (idx === undefined || !isNum(lv)) { unplaced += 1; continue; }
      if (own(seen, idx)) continue;          /* one mark per drawn bar */
      seen[idx] = true;
      kids.push(s("circle", { "class": "mk-breach", cx: xOf(p, idx).toFixed(1),
                              cy: yOf(p, lv).toFixed(1), r: 3 }));
      drawn += 1;
    }
    kids = kids.concat(axisTitles(p, null, "loss"));

    var counted = pickNum(r.n_breaches);
    if (!isNum(counted)) counted = breaches.length;

    var legend = [key("st-dbt", "trailing VaR forecast")];
    if (lossv) legend.push(key("st-chk thin", "realised loss"));
    legend.push(key("mk-breach", fx(counted, 0) + " breach" + (counted === 1 ? "" : "es"),
                    "k-dot"));

    var caption = [lossv ? "the forecast at each bar uses only bars before it"
                         : "the realised path was not part of this result; the breaches still are"];
    if (drawn !== counted) {
      caption.push(fx(counted, 0) + " counted on the full series, " + drawn + " drawn here"
                 + (snapped ? " — the chart is thinned, so each breach is marked on the "
                            + "nearest drawn bar and several can share one" : ""));
    }
    if (unplaced) {
      caption.push(unplaced + " could not be placed on this axis");
    }

    return fig("Did the forecast hold?", chart(p,
      "trailing value-at-risk forecast against realised loss, with breaches marked", kids),
      legend, caption.join("  ·  "));
  }

  function renderVar(r) {
    var conf = nn(r.confidence);
    var nb = nn(r.n_breaches), eb = nn(r.expected_breaches);
    var kp = nn(r.kupiec_pvalue);
    var cal = String(r.calibration || "untested");
    var spread = nn(r.spread);
    var run = nn(r.max_breach_run);
    var disagree = isNum(spread) && spread > 0.25;

    /* The desk graded this run before it reached the page, and its grading is
     * strictly stronger than calibration alone: `_var_verdict` downgrades an
     * "acceptable" breach COUNT when the breaches arrived together, because a
     * count cannot see clustering. Reading calibration on its own printed a
     * green headline over a run the desk had graded "doubt" — and directly
     * above this panel's own clustering callout, so the page contradicted
     * itself in two paragraphs.
     *
     * The clustering rule is deliberately NOT recomputed here. The server tests
     * whether a run of that length is a one-in-twenty event at this sample size;
     * any threshold invented client-side would be a second opinion pretending to
     * be the same one. The calibration-derived tone below is only the fallback
     * for a payload that carries no grading at all. */
    var g = grading(r);
    var localTone = cal === "acceptable" ? "signal" : (cal === "untested" ? "doubt" : "fault");
    var localHead = cal === "acceptable" ? "The count is consistent with the claim"
                  : cal === "untested" ? "Not enough to test the claim"
                  : cal === "too many breaches" ? "It breached more than it promised"
                  : "It breached less than it promised";
    var tone = g && g.state ? g.state : localTone;

    /* The desk's body already ends with the same three-method comparison this
     * panel would have written, so when a grading is present it is printed
     * whole rather than paraphrased next to it. */
    var kids = [
      subject(fpct(conf, 0) + " confidence  ·  " + (nn(r.horizon) || 1) + "-bar horizon  ·  " +
              (nn(r.n_obs) || "—") + " observations  ·  " + (nn(r.window) || "—") + "-bar window"),
      h("p", { "class": "verdict " + tone, text: g && g.headline ? g.headline : localHead }),
      h("p", { "class": "verdict-sub", text: (g && prose(r)) ||
          "Three defensible methods on the same data give " +
          VAR_METHODS.map(function (m) { return fpct(nn(r[m.k]), 2); }).join(", ") +
          ". " + (disagree
            ? "They disagree by " + fpct(spread, 0) + " of the median, which is model risk and not a "
            + "rounding difference. Quoting one of them alone would be a choice dressed as a measurement."
            : "They agree closely here, which means the distribution is behaving — not that the tail is safe.") })
    ];

    var hero = varHero(r);
    if (hero) kids.push(hero);
    else kids.push(gone("No histogram came back, so the distribution is not drawn."));

    var mb = methodBars(r);
    if (mb) {
      kids.push(fig("One question, three answers", mb,
        VAR_METHODS.map(function (m) { return key("fl-" + m.cls, m.label, "k-box"); })
          .concat([key("fl-flt", "CVaR — the number VaR should have been", "k-box")]),
        isNum(spread) ? "widest disagreement: " + fpct(spread, 0) + " of the median" : null));
    }
    VAR_METHODS.forEach(function (m) {
      kids.push(h("p", { "class": "m-why" }, [h("b", { text: m.label }), " — " + m.why]));
    });

    var roll = rollingVar(r);
    if (roll) kids.push(roll);

    kids.push(grid([
      cell("Historical", fpct(nn(r.historical), 2), "", "empirical quantile"),
      cell("Gaussian", fpct(nn(r.gaussian), 2), "", "normal assumption"),
      cell("Cornish-Fisher", fpct(nn(r.cornish_fisher), 2), "", "skew and kurtosis adjusted"),
      cell("CVaR", fpct(nn(r.cvar_historical), 2), "amber", "average loss once VaR is breached"),
      cell("Worst bar", fpct(nn(r.worst_loss), 2), "neg", "observed, not estimated"),
      cell("Skew", fx(nn(r.skew), 2, true), "", "0 is symmetric"),
      cell("Excess kurtosis", fx(nn(r.excess_kurtosis), 2, true),
           isNum(nn(r.excess_kurtosis)) && nn(r.excess_kurtosis) > 1 ? "amber" : "",
           "0 is normal; positive is fat-tailed"),
      cell("Breaches", (isNum(nb) ? String(nb) : "—") + " / " + fx(eb, 1),
           isNum(nb) && isNum(eb) && nb > eb ? "amber" : "", "observed vs expected"),
      cell("Kupiec p", fx(kp, 3), isNum(kp) && kp < 0.05 ? "amber" : "",
           "below 0.05 rejects the claimed level"),
      cell("Longest run", isNum(run) ? String(run) : "—", isNum(run) && run > 1 ? "amber" : "",
           "consecutive breaches"),
      cell("Method spread", fpct(spread, 0), disagree ? "amber" : "", "widest gap over the median"),
      cell("Calibration", cal, cal === "acceptable" ? "pos" : "amber", "on the past only")
    ]));

    if (isNum(run) && run > 1) {
      kids.push(callout("The breaches arrived together: a run of " + run + " in a row. The Kupiec "
        + "test counts breaches without caring when they happened, so it cannot see this. Clustered "
        + "breaches mean the model understates tail risk regardless of the count."));
    }
    if (disagree) {
      kids.push(callout("The three methods span " + fpct(spread, 0) + " of their median. Pick the "
        + "widest and you are guessing; average them and you have thrown the disagreement away. "
        + "The honest reading is that this loss is known to within a range, not to a number."));
    }
    if (isNum(nn(r.horizon)) && nn(r.horizon) > 1) {
      kids.push(note("Scaled to " + fx(nn(r.horizon), 0) + " bars by √h, which assumes returns are "
        + "independent. Volatility clusters, so this understates multi-bar risk exactly when anyone "
        + "is asking."));
    }

    fill($("c-var"), kids);
    /* The live line carries the graded headline too: calibration alone is what
     * used to hide the clustering downgrade, and it would hide it here as well. */
    live("var", "VaR at " + fpct(conf, 0) + ": historical " + fpct(nn(r.historical), 2) +
                ", gaussian " + fpct(nn(r.gaussian), 2) + ", Cornish-Fisher " +
                fpct(nn(r.cornish_fisher), 2) + ". Calibration " + cal + ". " +
                (g && g.headline ? g.headline : localHead) + ".");
  }


  /* ==================================================================== 4 */
  /* DID IT LEARN, OR MEMORISE? — machine learning                          */

  /* The hero. Two bars per fold from a shared zero line, train above test in
   * reading order, with the gap drawn between them. If the model memorised,
   * this picture is a row of tall bars next to a row of nothing, and no amount
   * of squinting turns that into a working model. */
  function foldGap(folds) {
    var vals = [], i;
    for (i = 0; i < folds.length; i++) {
      vals.push(nn(folds[i].train_ic));
      vals.push(nn(folds[i].test_ic));
    }
    if (!finite(vals).length) return null;

    var n = folds.length;
    var p = P(W, 250, { l: 62, b: 44 });
    p.xlo = -0.5; p.xhi = n - 0.5;
    setY(p, vals, 0.12, true);

    var kids = yAxis(p, fmtNum(2), 4);
    var slot = (p.w - p.l - p.r) / Math.max(1, n);
    var bw = Math.min(26, slot * 0.34);
    var y0 = yOf(p, 0);

    for (i = 0; i < n; i++) {
      var tr = nn(folds[i].train_ic), te = nn(folds[i].test_ic);
      var cx = xOf(p, i);
      /* train sits left of the fold's centre, test right of it */
      [[tr, cx - bw - 1, "fl-chk"], [te, cx + 1, null]].forEach(function (spec) {
        var v = spec[0];
        if (!isNum(v)) return;
        var cls = spec[2] || (v > 0 ? "fl-sig" : "fl-flt");
        var y = yOf(p, v);
        kids.push(s("rect", {
          "class": "mc-bar " + cls, x: spec[1].toFixed(1),
          y: Math.min(y, y0).toFixed(1), width: bw.toFixed(1),
          height: Math.max(0.6, Math.abs(y0 - y)).toFixed(1)
        }));
      });
      if (isNum(tr) && isNum(te)) {
        kids.push(s("line", { "class": "mc-gap",
                              x1: (cx - bw / 2 - 1).toFixed(1), y1: yOf(p, tr).toFixed(1),
                              x2: (cx + bw / 2 + 1).toFixed(1), y2: yOf(p, te).toFixed(1) }));
      }
      kids.push(s("text", { "class": "mc-tick", x: cx.toFixed(1), y: p.h - p.b + 14,
                            "text-anchor": "middle", text: String(nn(folds[i].fold) || i + 1) }));
    }
    kids = kids.concat(axisTitles(p, "walk-forward fold", "rank IC"));

    return fig("Train against test, fold by fold", chart(p,
      "per-fold training rank IC beside out-of-sample test rank IC, with the gap between them drawn",
      kids, "mc-hero"),
      [key("fl-chk", "train IC — the fit", "k-box"),
       key("fl-sig", "test IC, positive", "k-box"),
       key("fl-flt", "test IC, negative", "k-box"),
       key("mc-gap", "the gap")],
      "the left bar of each pair is in-sample; only the right bar is evidence");
  }

  function learningCurve(rows) {
    var xs = [], tr = [], te = [], i;
    for (i = 0; i < rows.length; i++) {
      xs.push(nn(rows[i].n_train));
      tr.push(nn(rows[i].train_ic));
      te.push(nn(rows[i].test_ic));
    }
    if (finite(xs).length < 2) return null;
    var p = P(W, 200, { l: 62, b: 42 });
    var xf = finite(xs);
    p.xlo = minOf(xf); p.xhi = maxOf(xf);
    var pad = (p.xhi - p.xlo) * 0.06 || 1;
    p.xlo -= pad; p.xhi += pad;
    setY(p, tr.concat(te), 0.12, true);

    var kids = yAxis(p, fmtNum(2), 4)
      .concat(lines(p, xs, tr, "st-chk"))
      .concat(lines(p, xs, te, "st-sig"));
    for (i = 0; i < xs.length; i++) {
      if (isNum(xs[i]) && isNum(tr[i])) {
        kids.push(s("circle", { "class": "mk-pt fl-chk", cx: xOf(p, xs[i]).toFixed(1),
                                cy: yOf(p, tr[i]).toFixed(1), r: 2.6 }));
      }
      if (isNum(xs[i]) && isNum(te[i])) {
        kids.push(s("circle", { "class": "mk-pt fl-sig", cx: xOf(p, xs[i]).toFixed(1),
                                cy: yOf(p, te[i]).toFixed(1), r: 2.6 }));
      }
    }
    kids = kids.concat(xAxis(p, xf.map(function (v) { return { v: v, label: fx(v, 0) }; })))
               .concat(axisTitles(p, "training bars", "rank IC"));
    return fig("More history, better model?", chart(p,
      "training and test rank IC against the number of training bars", kids),
      [key("st-chk", "train"), key("st-sig", "test")],
      "a test line that stays flat as the train line climbs is memorisation, not learning");
  }

  function importanceBars(imp) {
    var rows = [];
    for (var k in imp) if (own(imp, k)) rows.push({ k: k, v: nn(imp[k]) });
    if (!rows.length) return null;
    rows.sort(function (a, b) {
      var av = isNum(a.v) ? a.v : -Infinity, bv = isNum(b.v) ? b.v : -Infinity;
      return bv - av;
    });
    var vals = rows.map(function (r) { return r.v; });
    var p = P(W, 26 + rows.length * 26 + 34, { l: 108, r: 76, t: 18, b: 32 });
    var d = domain(vals, 0.12, true);
    if (!d) return null;
    p.xlo = d[0]; p.xhi = d[1];

    var kids = [], i;
    var ticks = niceTicks(p.xlo, p.xhi, 5);
    for (i = 0; i < ticks.length; i++) {
      var gx = xOf(p, ticks[i]).toFixed(1);
      kids.push(s("line", { "class": ticks[i] === 0 ? "mc-zero" : "mc-grid",
                            x1: gx, y1: p.t, x2: gx, y2: p.h - p.b }));
      kids.push(s("text", { "class": "mc-tick", x: gx, y: p.h - p.b + 14,
                            "text-anchor": "middle", text: fx(ticks[i], 3) }));
    }
    var x0 = xOf(p, 0);
    for (i = 0; i < rows.length; i++) {
      var y = p.t + i * 26 + 3;
      kids.push(s("text", { "class": "mc-tick mc-rowlab", x: p.l - 10, y: y + 9,
                            "text-anchor": "end", "dominant-baseline": "middle", text: rows[i].k }));
      if (isNum(rows[i].v)) {
        var x = xOf(p, rows[i].v);
        kids.push(s("rect", { "class": "mc-bar " + (rows[i].v >= 0 ? "fl-sig" : "fl-flt"),
                              x: Math.min(x, x0).toFixed(1), y: y, height: 17,
                              width: Math.max(1, Math.abs(x - x0)).toFixed(1), rx: 1 }));
      }
      kids.push(s("text", { "class": "mc-annot", x: p.w - p.r + 6, y: y + 9,
                            "text-anchor": "start", "dominant-baseline": "middle",
                            text: fx(rows[i].v, 4, true) }));
    }
    kids = kids.concat(axisTitles(p, "drop in test IC when the feature is shuffled", null));
    return fig("What each feature was worth", chart(p,
      "permutation importance per feature, measured on the test folds", kids),
      [key("fl-sig", "shuffling it hurt", "k-box"), key("fl-flt", "shuffling it helped", "k-box")],
      "measured on the same test folds as the headline, so it describes that result rather than confirming it");
  }

  function calibrationPlot(rows) {
    var px = [], py = [], i;
    for (i = 0; i < rows.length; i++) {
      px.push(nn(rows[i].predicted));
      py.push(nn(rows[i].realised));
    }
    var pool = finite(px).concat(finite(py));
    if (pool.length < 4) return null;
    var lo = minOf(pool), hi = maxOf(pool);
    lo = Math.min(lo, 0); hi = Math.max(hi, 0);
    var pad = (hi - lo) * 0.12 || 1e-6;
    var p = P(W, 260, { l: 74, b: 44 });
    p.xlo = lo - pad; p.xhi = hi + pad; p.ylo = p.xlo; p.yhi = p.xhi;

    var kids = yAxis(p, fmtPct(2), 4);
    kids.push(s("line", { "class": "mc-diag", x1: xOf(p, p.xlo).toFixed(1), y1: yOf(p, p.xlo).toFixed(1),
                          x2: xOf(p, p.xhi).toFixed(1), y2: yOf(p, p.xhi).toFixed(1) }));
    for (i = 0; i < rows.length; i++) {
      if (!isNum(px[i]) || !isNum(py[i])) continue;
      kids.push(s("circle", { "class": "mk-pt fl-vio", cx: xOf(p, px[i]).toFixed(1),
                              cy: yOf(p, py[i]).toFixed(1), r: 3.2 }));
      kids.push(s("text", { "class": "mc-annot", x: (xOf(p, px[i]) + 6).toFixed(1),
                            y: (yOf(p, py[i]) - 5).toFixed(1),
                            text: "D" + String(nn(rows[i].bucket) || i + 1) }));
    }
    kids = kids.concat(xAxis(p, niceTicks(p.xlo, p.xhi, 5).map(function (v) {
      return { v: v, label: fpct(v, 2) };
    }))).concat(axisTitles(p, "predicted return", "realised return"));
    return fig("Is the level right, or only the order?", chart(p,
      "predicted decile against realised mean return with the 45-degree line", kids),
      [key("mk-pt fl-vio", "one decile of pooled test predictions", "k-dot"),
       key("mc-diag", "perfect calibration")],
      "on the line means the size of the prediction was right; a flat cloud means only the ranking was");
  }

  /* Mirrors ml._verdict's own thresholds so the headline and the model's words
   * cannot disagree. The model's sentence is printed underneath regardless, and
   * it is the one that wins. */
  function mlHeadline(test, train, base, nTest) {
    if (!isNum(test)) return { tone: "doubt", head: "Nothing was scored" };
    var b = 2 / Math.sqrt(Math.max(nTest || 2, 2));
    if (Math.abs(test) <= b) {
      return (isNum(train) && train > test + 0.02)
        ? { tone: "doubt", head: "It memorised" }
        : { tone: "doubt", head: "It learned nothing, and did not even fit" };
    }
    if (test < 0) return { tone: "fault", head: "Reliably anti-predictive" };
    if (isNum(base) && test <= base) return { tone: "doubt", head: "Beaten by one line of code" };
    return { tone: "signal", head: "Small, and it survived the split" };
  }

  function renderMl(r) {
    var folds = arr(r.fold_scores);
    var nTest = 0;
    for (var i = 0; i < folds.length; i++) nTest += nn(folds[i].n_test) || 0;
    var test = nn(r.test_ic), train = nn(r.train_ic), base = nn(r.baseline_ic);
    var v = mlHeadline(test, train, base, nTest);
    var gap = nn(r.ic_gap);

    /* The desk's grading, computed from the same noise band and the same
     * baseline as mlHeadline; the local one stands in when it is absent. */
    var g = grading(r);
    var tone = g && g.state ? g.state : v.tone;

    var kids = [
      subject(arr(r.features).map(String).join(" · ") + "  ·  " + folds.length + " folds  ·  " +
              nTest + " test bars  ·  ridge α " + fx(nn(r.alpha), 4)),
      h("p", { "class": "verdict " + tone, text: g && g.headline ? g.headline : v.head }),
      h("p", { "class": "verdict-sub", text: prose(r) })
    ];

    if (folds.length) {
      var hero = foldGap(folds);
      if (hero) kids.push(hero);
    } else {
      kids.push(gone("No fold was scored, so there is nothing to compare."));
    }

    kids.push(grid([
      cell("Train IC", fx(train, 3, true), "", "in-sample fit — never evidence"),
      cell("Test IC", fx(test, 3, true), tone === "signal" ? "pos" : "amber",
           "out of sample — the only one that counts"),
      cell("Gap", fx(gap, 3, true), isNum(gap) && gap > 0.02 ? "amber" : "",
           "train minus test; the headline"),
      cell("Baseline IC", fx(base, 3, true), "", "best single feature, picked on train"),
      cell("Noise band", nTest ? "±" + fx(2 / Math.sqrt(Math.max(nTest, 2)), 3) : "—", "",
           "2/√n — inside it, zero is the honest answer"),
      cell("Folds", String(folds.length), "", "walk-forward, refitted each time")
    ]));

    var lc = learningCurve(arr(r.learning_curve));
    if (lc) kids.push(lc);

    var imp = importanceBars(r.permutation_importance || {});
    if (imp) kids.push(imp);

    var cal = calibrationPlot(arr(r.calibration));
    if (cal) kids.push(cal);
    else kids.push(gone("Too few pooled test predictions to bucket into deciles, so calibration is not drawn."));

    var coefs = [];
    for (var kk in (r.coefficients || {})) if (own(r.coefficients, kk)) {
      coefs.push(h("span", { "class": "m-chip" }, [
        h("b", { text: kk }), " " + fx(nn(r.coefficients[kk]), 4, true)
      ]));
    }
    if (coefs.length) {
      kids.push(h("div", { "class": "m-chips" }, [
        h("h4", { "class": "m-h", text: "Fold-average coefficients" }),
        h("div", { "class": "m-chiprow" }, coefs),
        note("All of these features are functions of the same price path and are heavily collinear. "
           + "The signs swing between folds; read them as bookkeeping, not as explanation.")
      ]));
    }

    if (isNum(gap) && isNum(test) && gap > 0.02 && Math.abs(test) <= 2 / Math.sqrt(Math.max(nTest, 2))) {
      kids.push(callout("The model fit the training data and none of it survived the split. That is "
        + "not a bug and it is not a bad run — it is the single most common result in applied quant "
        + "research, and it is a result: these features carry nothing."));
    }

    fill($("c-ml"), kids);
    live("ml", "Train IC " + fx(train, 3, true) + " against test IC " + fx(test, 3, true) +
               ", gap " + fx(gap, 3, true) + ". " + v.head + ".");
  }


  /* ==================================================================== 5 */
  /* HOW SHOULD IT BE WEIGHTED? — portfolio optimisation                    */

  var PORTS = [
    { k: "max_sharpe", label: "max-Sharpe", cls: "vio" },
    { k: "min_variance", label: "min-variance", cls: "blu" },
    { k: "equal_weight", label: "equal-weight", cls: "vel" },
    { k: "inverse_vol", label: "inverse-vol", cls: "chk" }
  ];

  function bandSpan(rows, vol) {
    /* Linear interpolation along the band's own volatility axis. Returns null
     * rather than the nearest value when the point is outside it — the band has
     * no opinion out there and neither should this. */
    var pts = [];
    for (var i = 0; i < rows.length; i++) {
      var v = nn(rows[i].vol), lo = nn(rows[i].ret_lo), hi = nn(rows[i].ret_hi);
      if (isNum(v) && isNum(lo) && isNum(hi)) pts.push({ v: v, lo: lo, hi: hi });
    }
    if (pts.length < 2 || !isNum(vol)) return null;
    pts.sort(function (a, b) { return a.v - b.v; });
    if (vol < pts[0].v || vol > pts[pts.length - 1].v) return null;
    for (i = 1; i < pts.length; i++) {
      if (vol <= pts[i].v) {
        var a = pts[i - 1], b = pts[i];
        var t = (b.v - a.v) > 0 ? (vol - a.v) / (b.v - a.v) : 0;
        return { lo: a.lo + t * (b.lo - a.lo), hi: a.hi + t * (b.hi - a.hi) };
      }
    }
    return null;
  }

  function frontierChart(r) {
    var front = arr(r.frontier), res = arr(r.resampled_frontier);
    var fv = [], fr = [], i;
    for (i = 0; i < front.length; i++) { fv.push(nn(front[i].vol)); fr.push(nn(front[i].ret)); }

    var bx = [], blo = [], bhi = [];
    for (i = 0; i < res.length; i++) {
      bx.push(nn(res[i].vol)); blo.push(nn(res[i].ret_lo)); bhi.push(nn(res[i].ret_hi));
    }

    var pts = [];
    PORTS.forEach(function (pf) {
      var pp = (r.portfolios || {})[pf.k];
      if (!pp) return;
      var v = nn(pp.vol), m = nn(pp.ret);
      if (isNum(v) && isNum(m)) pts.push({ pf: pf, vol: v, ret: m, sharpe: nn(pp.sharpe) });
    });

    var xs = finite(fv).concat(finite(bx)).concat(pts.map(function (q) { return q.vol; }));
    var ys = finite(fr).concat(finite(blo)).concat(finite(bhi))
                       .concat(pts.map(function (q) { return q.ret; }));
    if (xs.length < 2 || ys.length < 2) return null;

    var p = P(W, 300, { l: 68, b: 44 });
    var dx = domain(xs, 0.10);
    p.xlo = dx[0]; p.xhi = dx[1];
    setY(p, ys, 0.12);

    var kids = yAxis(p, fmtPct(0), 5)
      .concat(band(p, bx, blo, bhi, "fl-dbt"))
      .concat(lines(p, bx, blo, "st-dbt thin dash"))
      .concat(lines(p, bx, bhi, "st-dbt thin dash"))
      .concat(lines(p, bx, res.map(function (row) { return nn(row.ret_mid); }), "st-dbt dash"))
      .concat(lines(p, fv, fr, "st-vel"));

    for (i = 0; i < pts.length; i++) {
      var q = pts[i];
      var cx = xOf(p, q.vol), cy = yOf(p, q.ret);
      kids.push(s("circle", { "class": "mk-port fl-" + q.pf.cls, cx: cx.toFixed(1),
                              cy: cy.toFixed(1), r: 4.4 }));
      kids.push(s("text", {
        "class": "mc-annot fi-" + q.pf.cls,
        x: (cx + 8).toFixed(1), y: (cy + (i % 2 ? 13 : -7)).toFixed(1), "text-anchor": "start",
        text: q.pf.label + "  " + fx(q.sharpe, 2, true) + " Sharpe"
      }));
    }
    kids = kids.concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (v) {
      return { v: v, label: fpct(v, 0) };
    }))).concat(axisTitles(p, "annualised volatility", "annualised return"));

    var legend = [key("st-vel", "in-sample frontier"),
                  key("fl-dbt", "5th–95th percentile of resampled frontiers", "k-box"),
                  key("st-dbt dash", "median resampled frontier")];
    PORTS.forEach(function (pf) { legend.push(key("fl-" + pf.cls, pf.label, "k-dot")); });

    return fig("The frontier, and the band it actually lives in", chart(p,
      "in-sample efficient frontier drawn over the bootstrap band of resampled frontiers, with four "
      + "named portfolios marked", kids, "mc-hero"), legend,
      "the solid line is the best that could have been done by someone who already knew the answer");
  }

  /* The lesson, made measurable: how tall is the band where the optimiser wants
   * to stand, against how far apart the four candidate books actually are? */
  function bandVsGap(r) {
    var ms = (r.portfolios || {}).max_sharpe;
    if (!ms) return null;
    var at = bandSpan(arr(r.resampled_frontier), nn(ms.vol));
    var rets = [];
    PORTS.forEach(function (pf) {
      var pp = (r.portfolios || {})[pf.k];
      if (pp && isNum(nn(pp.ret))) rets.push(nn(pp.ret));
    });
    if (!at || rets.length < 2) return null;
    var bandW = at.hi - at.lo;
    var gapW = maxOf(rets) - minOf(rets);
    if (!(bandW > 0)) return null;

    var scale = Math.max(bandW, gapW) * 1.08;
    var p = P(W, 116, { l: 150, r: 84, t: 18, b: 26 });
    p.xlo = 0; p.xhi = scale;
    var rows = [
      { label: "band at that risk", v: bandW, cls: "dbt" },
      { label: "gap between the four", v: gapW, cls: "vel" }
    ];
    var kids = [], i;
    var ticks = niceTicks(0, scale, 5);
    for (i = 0; i < ticks.length; i++) {
      var gx = xOf(p, ticks[i]).toFixed(1);
      kids.push(s("line", { "class": "mc-grid", x1: gx, y1: p.t, x2: gx, y2: p.h - p.b }));
      kids.push(s("text", { "class": "mc-tick", x: gx, y: p.h - p.b + 14,
                            "text-anchor": "middle", text: fpct(ticks[i], 1) }));
    }
    for (i = 0; i < rows.length; i++) {
      var y = p.t + i * 32 + 4;
      kids.push(s("text", { "class": "mc-tick mc-rowlab", x: p.l - 10, y: y + 10,
                            "text-anchor": "end", "dominant-baseline": "middle", text: rows[i].label }));
      kids.push(s("rect", { "class": "mc-bar fl-" + rows[i].cls, x: p.l, y: y,
                            width: Math.max(1, xOf(p, rows[i].v) - p.l).toFixed(1),
                            height: 20, rx: 1 }));
      kids.push(s("text", { "class": "mc-annot", x: p.w - p.r + 6, y: y + 10,
                            "text-anchor": "start", "dominant-baseline": "middle",
                            text: fpct(rows[i].v, 2) }));
    }
    kids = kids.concat(axisTitles(p, "annualised return, same axis for both", null));

    var ratio = gapW > 0 ? bandW / gapW : null;
    var read = isNum(ratio) && ratio > 1
      ? "The band is " + fx(ratio, 1) + "× the gap. At the volatility max-Sharpe picked, a different "
      + "draw of this same market puts the frontier anywhere between " + fpct(at.lo, 1) + " and "
      + fpct(at.hi, 1) + " — wider than the whole spread between the four books below it. The "
      + "optimiser cannot tell them apart, so neither can you."
      : "The band is narrower than the spread between the four portfolios here, which is unusual and "
      + "worth checking: too few resamples, or a sample long enough that the moments are actually "
      + "pinned down.";

    return h("div", { "class": "m-lesson" }, [
      fig("Band width against the choice it is supposed to inform",
          chart(p, "width of the resampled band at max-Sharpe's volatility beside the spread of "
                 + "expected return across the four portfolios", kids),
          [key("fl-dbt", "how uncertain the frontier is", "k-box"),
           key("fl-vel", "how far apart the four books are", "k-box")], null),
      h("p", { "class": "m-lesson-read", text: read })
    ]);
  }

  function weightChart(r) {
    var assets = arr(r.assets).map(String);
    if (!assets.length) return null;
    var have = PORTS.filter(function (pf) {
      var pp = (r.portfolios || {})[pf.k];
      return pp && pp.weights;
    });
    if (!have.length) return null;

    var all = [], i, j;
    for (i = 0; i < have.length; i++) {
      for (j = 0; j < assets.length; j++) {
        all.push(nn((r.portfolios[have[i].k].weights || {})[assets[j]]));
      }
    }
    var p = P(W, 260, { l: 62, b: 52 });
    p.xlo = -0.5; p.xhi = assets.length - 0.5;
    setY(p, all, 0.10, true);

    var kids = yAxis(p, fmtPct(0), 5);
    var slot = (p.w - p.l - p.r) / Math.max(1, assets.length);
    var bw = Math.max(1.6, Math.min(15, (slot * 0.78) / have.length));
    var y0 = yOf(p, 0);
    var rotate = assets.length > 9;

    for (j = 0; j < assets.length; j++) {
      var cx = xOf(p, j);
      for (i = 0; i < have.length; i++) {
        var w = nn((r.portfolios[have[i].k].weights || {})[assets[j]]);
        if (!isNum(w)) continue;
        var y = yOf(p, w);
        kids.push(s("rect", {
          "class": "mc-bar fl-" + have[i].cls,
          x: (cx - (have.length * bw) / 2 + i * bw).toFixed(2),
          y: Math.min(y, y0).toFixed(1), width: Math.max(1, bw - 0.6).toFixed(2),
          height: Math.max(0.5, Math.abs(y0 - y)).toFixed(1)
        }));
      }
      kids.push(s("text", {
        "class": "mc-tick", x: cx.toFixed(1), y: p.h - p.b + (rotate ? 9 : 15),
        "text-anchor": rotate ? "end" : "middle",
        transform: rotate ? "rotate(-32 " + cx.toFixed(1) + " " + (p.h - p.b + 9) + ")" : null,
        text: assets[j]
      }));
    }
    kids = kids.concat(axisTitles(p, null, "weight"));

    return fig("The same money, split four ways", chart(p,
      "portfolio weight per asset for each of the four portfolios", kids),
      have.map(function (pf) { return key("fl-" + pf.cls, pf.label, "k-box"); }),
      assets.length + " assets");
  }

  /* The local grading, used only when the payload carries none.
   *
   * Three states, not two. The binary version this replaces asked `inst > 0.5`
   * and called everything else a pass, so an instability the resampler could
   * not measure at all — no asset with a positive average return, therefore no
   * long-only maximum-Sharpe portfolio to resample — rendered as a green "the
   * weights held up". A figure that could not be computed is not a figure that
   * came back clean, and this is the panel where that mistake costs the most.
   *
   * The 0.5 bar is `optimize.fit_optimizer`'s own, so the headline and the
   * warning paragraph below it fire on the same number. */
  function optimizeHeadline(inst) {
    if (!isNum(inst)) return { state: "doubt", head: "The weights could not be tested" };
    if (inst > 0.5) return { state: "doubt", head: "The weights are not knowledge" };
    return { state: "signal", head: "The weights held up under resampling" };
  }

  function renderOptimize(r) {
    var inst = nn(r.weight_instability);
    var cond = nn(r.condition_number);
    var shrink = nn(r.shrinkage);
    var eff = r.effective_n || {};
    var nAssets = arr(r.assets).length;
    var wobbly = isNum(inst) && inst > 0.5;

    /* The desk graded this run on more than instability — whether max-Sharpe
     * exists at all, whether the optimum collapsed onto one name, whether the
     * band could be estimated. This panel read none of that. Its grading wins;
     * optimizeHeadline is the fallback for a payload carrying none. */
    var g = grading(r);
    var local = optimizeHeadline(inst);
    var tone = g && g.state ? g.state : local.state;
    var head = g && g.headline ? g.headline : local.head;

    /* The sub-paragraph stays local on purpose: the desk's body for this model
     * IS `warning`, which the panel already prints as a callout at the bottom,
     * and printing it twice would push the frontier off the first screen. What
     * goes here is the one thing the grading does not say — what the resampled
     * weights did, including the case where they did nothing at all. */
    var sub = !isNum(inst)
      ? "Resampling returned no weight-instability figure for this run, so nothing below says the "
      + "weights are stable — it says they were never tested. Read the frontier as one draw's "
      + "answer with no measured spread around it."
      : wobbly
      ? "Two bootstrap draws of this same market disagree about " + fpct(inst / 2, 0)
      + " of the book. The frontier below is one draw's answer, and a different draw of the same "
      + "process would have told you to hold something else."
      : "Resampling moved the maximum-Sharpe weights less than half the book. That is unusually "
      + "stable, and it is still an in-sample statement about one sample of one market.";

    var kids = [
      subject(nAssets + " assets  ·  long-only frontier  ·  " +
              arr(r.resampled_frontier).length + " points on the resampled band"),
      h("p", { "class": "verdict " + tone, text: head }),
      h("p", { "class": "verdict-sub", text: sub })
    ];

    var fc = frontierChart(r);
    if (fc) kids.push(fc);
    else kids.push(gone("No frontier came back, so the band is not drawn."));

    var lesson = bandVsGap(r);
    if (lesson) kids.push(lesson);

    var wc = weightChart(r);
    if (wc) kids.push(wc);

    var cells = [
      /* Amber when it is missing as well as when it is high: an em dash here
       * means untested, and untested is not the same as passed. */
      cell("Weight instability", fx(inst, 2), isNum(inst) && !wobbly ? "" : "amber",
           isNum(inst) ? "out of a possible 2.00" : "could not be measured on this sample"),
      cell("Condition number", isNum(cond) ? Math.round(cond).toLocaleString("en-US") : "—",
           isNum(cond) && cond > 100 ? "amber" : "", "of the sample covariance, before shrinkage"),
      cell("Shrinkage", fx(shrink, 2), "", "Ledoit-Wolf intensity applied")
    ];
    PORTS.forEach(function (pf) {
      if (!own(eff, pf.k)) return;
      cells.push(cell("Effective N · " + pf.label, fx(nn(eff[pf.k]), 1), "",
                      "of " + nAssets + " assets held"));
    });
    PORTS.forEach(function (pf) {
      var pp = (r.portfolios || {})[pf.k];
      if (!pp) return;
      cells.push(cell("Sharpe · " + pf.label, fx(nn(pp.sharpe), 2, true), "",
                      fpct(nn(pp.ret), 1, true) + "/yr at " + fpct(nn(pp.vol), 1) + " vol"));
    });
    kids.push(grid(cells));

    if (r.warning) kids.push(callout(String(r.warning)));

    fill($("c-optimize"), kids);
    live("optimize", head + ". Weight instability " +
                     (isNum(inst) ? fx(inst, 2) + " of a possible 2.00" : "not measured") +
                     ", condition number " + fx(cond, 0) + ", shrinkage " + fx(shrink, 2) + ".");
  }


  /* ==================================================================== 6 */
  /* DOES IT SURVIVE MOVING THE GOALPOSTS? — momentum                       */

  /* The hero. Net Sharpe against every lookback the sweep tried, the bootstrap
   * band around it, the noise bar a search of this size clears on nothing, and
   * the REPORTED setting marked with its own interval.
   *
   * The mark is the whole point. A curve with one tall spike at exactly the
   * lookback that was reported and nothing either side of it is a number the
   * search produced: the peak was chosen by looking at this curve. A broad hump
   * that happens to be highest at the reported setting is a different picture
   * and deserves a different reading, and the only way to tell the two apart is
   * to see where the reported number sits among its neighbours. `plateau` and
   * `neighbour_sharpe` are the same fact as numbers and they are in the grid;
   * this is that fact as a shape.
   *
   * tape.js draws the curve and the band inside the dossier (decayChart). What
   * is here and not there is the reported setting, its interval and its two
   * neighbours — the marks a standalone run has the width to carry. */
  function decayHero(r) {
    var rows = arr(r.decay);
    if (rows.length < 2) return null;
    var xs = [], sh = [], lo = [], hi = [], gr = [], i;
    for (i = 0; i < rows.length; i++) {
      xs.push(nn(rows[i].lookback));
      sh.push(nn(rows[i].sharpe));
      lo.push(nn(rows[i].sharpe_lo));
      hi.push(nn(rows[i].sharpe_hi));
      gr.push(nn(rows[i].sharpe_gross));
    }
    var xf = finite(xs);
    if (xf.length < 2 || finite(sh).length < 2) return null;

    var chosen = nn(r.lookback), bar = nn(r.search_bar);
    var at = -1;
    for (i = 0; i < xs.length; i++) if (isNum(chosen) && xs[i] === chosen) at = i;

    /* The reported setting's interval: the sweep's own row for it, and the run's
     * headline interval only as the fallback. They are the same quantity on the
     * same bars, and neither is invented when both are absent. */
    var ci = arr(r.sharpe_ci);
    var cLo = (at >= 0 && isNum(lo[at])) ? lo[at] : nn(ci[0]);
    var cHi = (at >= 0 && isNum(hi[at])) ? hi[at] : nn(ci[1]);

    var p = P(W, 260, { l: 62, r: 26, b: 44 });
    p.xlo = minOf(xf); p.xhi = maxOf(xf);
    if (!(p.xhi > p.xlo)) return null;
    var pad = (p.xhi - p.xlo) * 0.04;
    p.xlo -= pad; p.xhi += pad;
    if (!setY(p, sh.concat(lo).concat(hi).concat(gr).concat([bar, cLo, cHi]), 0.10, true)) {
      return null;
    }

    var kids = yAxis(p, fmtNum(1), 4)
      .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 0) };
      })))
      .concat(band(p, xs, lo, hi, "fl-vel"))
      .concat(lines(p, xs, gr, "st-chk dim dash"))
      .concat(lines(p, xs, sh, "st-vel"))
      .concat(hRule(p, bar, "st-dbt dash", isNum(bar) ? "noise bar " + fx(bar, 2) : null));

    /* The settings next door, as their own marks, because "the neighbours" is
     * what the plateau number encodes and a reader should be able to find them. */
    var nx = [], nb = [];
    if (at > 0) { nx.push(xs[at - 1]); nb.push(sh[at - 1]); }
    if (at >= 0 && at + 1 < xs.length) { nx.push(xs[at + 1]); nb.push(sh[at + 1]); }
    kids = kids.concat(dots(p, nx, nb, "fl-chk", 3.2))
               .concat(vRule(p, chosen, "st-sig dash",
                             isNum(chosen) ? "reported " + fx(chosen, 0) : null, p.t + 10))
               .concat(errBar(p, chosen, cLo, cHi, "st-sig"))
               .concat(dots(p, [chosen], [at >= 0 ? sh[at] : null], "fl-sig", 4))
               .concat(axisTitles(p, "lookback, in bars", "net Sharpe"));

    var legend = [key("st-vel", "net Sharpe at each lookback"),
                  key("fl-vel", "95% bootstrap band across the sweep", "k-box"),
                  key("st-chk dash", "gross Sharpe")];
    if (isNum(bar)) {
      legend.push(key("st-dbt dash", "noise bar — the best this search finds on nothing"));
    }
    legend.push(key("fl-sig", "the reported lookback, with its own interval", "k-dot"));
    if (nx.length) legend.push(key("fl-chk", "the settings either side of it", "k-dot"));

    return fig("The decay curve: the same rule at every other setting", chart(p,
      "net Sharpe by momentum lookback with its bootstrap band, the reported lookback " +
      "marked with its own 95% interval, and the noise bar a search of this size clears " +
      "on data with no edge in it", kids, "mc-hero"), legend,
      "A spike at exactly the reported setting, with nothing either side of it, is a number "
      + "the search produced rather than one the market did. The peak of this curve was "
      + "chosen by looking at this curve.");
  }

  /* The other axis of the same search. Gross and net against holding period on
   * one Sharpe axis: the vertical gap between the two lines at each holding IS
   * the cost of trading at that speed, and at the short end it is usually the
   * entire result. */
  function holdingChart(r) {
    var rows = arr(r.holding_scan);
    if (rows.length < 2) return null;
    var xs = [], net = [], gross = [], i;
    for (i = 0; i < rows.length; i++) {
      xs.push(nn(rows[i].holding));
      net.push(nn(rows[i].sharpe));
      gross.push(nn(rows[i].sharpe_gross));
    }
    var xf = finite(xs);
    if (xf.length < 2 || finite(net).length < 2) return null;

    var p = P(W, 210, { l: 62, r: 26, b: 44 });
    p.xlo = minOf(xf); p.xhi = maxOf(xf);
    if (!(p.xhi > p.xlo)) return null;
    var pad = (p.xhi - p.xlo) * 0.04;
    p.xlo -= pad; p.xhi += pad;
    if (!setY(p, net.concat(gross), 0.10, true)) return null;

    var held = nn(r.holding);
    var kids = yAxis(p, fmtNum(1), 4)
      .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 0) };
      })))
      .concat(between(p, xs, gross, net, "fl-dbt"))
      .concat(lines(p, xs, gross, "st-chk dash"))
      .concat(lines(p, xs, net, "st-vel"))
      .concat(dots(p, xs, net, "fl-vel", 2.4))
      .concat(vRule(p, held, "st-sig dash", isNum(held) ? "held " + fx(held, 0) : null, p.t + 10))
      .concat(axisTitles(p, "holding period, in bars", "Sharpe"));

    var legend = [key("st-vel", "net Sharpe"), key("st-chk dash", "gross Sharpe"),
                  key("fl-dbt", "what the trading cost", "k-box")];
    if (isNum(held)) legend.push(key("st-sig dash", "the reported holding"));

    return fig("And the same rule at every other holding period", chart(p,
      "gross and net Sharpe by holding period, with the gap between them shaded as the "
      + "cost of trading at that speed and the reported holding marked", kids), legend,
      "The shaded area is the whole argument at the short end: a fine gross Sharpe one bar "
      + "wide and a negative net one is the ordinary result, not the surprising one.");
  }

  /* Calendar-month seasonality, every bucket with its own Student-t interval.
   *
   * Twelve simultaneous 95% intervals is about one false positive per chart, and
   * the model's own docstring says so. The caption repeats it, because a reader
   * who takes one bucket at a time will find a January effect here on a
   * driftless path — the model's test suite contains exactly that case. */
  function monthlyChart(rows) {
    var d = arr(rows);
    if (!d.length) return null;
    var vals = [], lo = [], hi = [], labels = [], counts = [], i;
    for (i = 0; i < d.length; i++) {
      vals.push(nn(d[i].ret));
      lo.push(nn(d[i].lo));
      hi.push(nn(d[i].hi));
      counts.push(nn(d[i].n));
      labels.push(str(d[i].month, "?"));
    }
    if (!finite(vals).length) return null;

    var p = P(W, 230, { l: 66, r: 26, b: 48 });
    p.xlo = -0.6; p.xhi = d.length - 0.4;
    if (!setY(p, vals.concat(lo).concat(hi), 0.12, true)) return null;

    var kids = yAxis(p, fmtPct(1), 4);
    var slot = (p.w - p.l - p.r) / Math.max(1, d.length);
    var bw = Math.min(30, slot * 0.5);
    var y0 = yOf(p, 0);
    var flagged = 0;

    for (i = 0; i < d.length; i++) {
      var cx = xOf(p, i), v = vals[i];
      var clears = isNum(lo[i]) && isNum(hi[i]) && (lo[i] > 0 || hi[i] < 0);
      if (clears) flagged += 1;
      if (isNum(v)) {
        var y = yOf(p, v);
        kids.push(s("rect", {
          "class": "mc-bar " + (clears ? (v >= 0 ? "fl-sig" : "fl-flt") : "fl-chk"),
          x: (cx - bw / 2).toFixed(1), y: Math.min(y, y0).toFixed(1),
          width: bw.toFixed(1), height: Math.max(0.6, Math.abs(y0 - y)).toFixed(1)
        }));
      }
      kids = kids.concat(errBar(p, i, lo[i], hi[i], "st-vel", Math.min(9, bw / 2)));
      kids.push(s("text", { "class": "mc-tick", x: cx.toFixed(1), y: p.h - p.b + 14,
                            "text-anchor": "middle", text: labels[i] }));
      kids.push(s("text", { "class": "mc-tick mc-dim", x: cx.toFixed(1), y: p.h - p.b + 25,
                            "text-anchor": "middle",
                            text: isNum(counts[i]) ? "n " + fx(counts[i], 0) : "n —" }));
    }
    kids = kids.concat(axisTitles(p, null, "mean calendar-month return"));

    return fig("Seasonality, and how little of it is measured", chart(p,
      "mean return by calendar month with a 95% Student-t interval on each bucket", kids),
      [key("fl-chk", "interval contains zero", "k-box"),
       key("fl-sig", "interval clears zero, positive", "k-box"),
       key("fl-flt", "interval clears zero, negative", "k-box"),
       key("st-vel", "95% t-interval on the bucket mean")],
      d.length + " buckets of a handful of years each"
      + (flagged ? "  ·  " + flagged + " interval" + (flagged === 1 ? "" : "s") + " excludes zero"
                 : "  ·  no interval excludes zero"));
  }

  function renderMomentum(r) {
    var net = obj(r.net), gross = obj(r.gross);
    var ci = arr(r.sharpe_ci);
    var sharpe = nn(net.sharpe), bar = nn(r.search_bar), defl = nn(r.deflated_sharpe);
    var trials = nn(r.n_trials);
    var clears = r.clears_search_bar === true;
    var v = verdictOf(r);

    var kids = [
      subject("lookback " + numOr(r.lookback) + " bars  ·  holding " + numOr(r.holding) +
              "  ·  skip " + numOr(r.skip) + "  ·  " + plural(trials, "setting") +
              " swept  ·  best lookback " + numOr(r.best_lookback))
    ].concat(verdictKids(v, "This run came back without a grading, so none is printed. The "
      + "interval and the noise bar below are the reading."));

    var hero = decayHero(r);
    if (hero) kids.push(hero);
    else kids.push(gone("The lookback sweep came back with fewer than two usable points, so the "
                      + "decay curve is not drawn. Without it there is no way to see whether "
                      + "the reported setting is a peak or a plateau."));

    kids.push(h("div", { "class": "m-ivbox" }, [
      intervalBar(nn(ci[0]), sharpe, nn(ci[1]),
                  "net Sharpe at the reported setting · 95% block-bootstrap interval"),
      isNum(bar)
        ? callout(clears
            ? "The interval clears " + fx(bar, 2) + ", which is the best Sharpe a sweep of "
              + plural(trials, "setting") + " turns up on data with no edge in it. That is the "
              + "only version of this claim that has paid for its own search."
            : "The interval does NOT clear " + fx(bar, 2) + " — the best Sharpe a sweep of "
              + plural(trials, "setting") + " turns up on data with no edge in it. Whatever the "
              + "peak looks like, a search this size finds one that size for free.",
            clears ? "" : "bad")
        : note("No noise bar came back for this sweep, so nothing here says the peak beat the "
             + "search. It says the comparison was not made."),
      typeof haircut === "function" ? haircut(sharpe, defl, isNum(trials) ? trials : 0) : null
    ]));

    var hold = holdingChart(r);
    if (hold) kids.push(hold);

    var eq = curveChart(r.equity_curve, r.equity_dates,
      "What the rule actually made, net of what it cost to trade",
      "cumulative net equity of the momentum rule, starting at one",
      "after the cost model for this asset class — the gross figure is in the grid below, as "
      + "a number, because it is not the one you would have kept");
    if (eq) kids.push(eq);

    var mth = monthlyChart(r.monthly);
    if (mth) {
      kids.push(mth);
      kids.push(note("Read these as simultaneous questions or do not read them. At 95% each, "
        + "about one bucket per chart excludes zero when nothing seasonal is happening at all. "
        + "The first and last calendar months are usually partial and compound over fewer "
        + "bars, which drags them toward zero."));
    }

    kids.push(grid([
      cell("Net Sharpe", fx(sharpe, 2, true), isNum(sharpe) && sharpe < 0 ? "neg" : "",
           "after costs — the only one that counts"),
      cell("Gross Sharpe", fx(nn(gross.sharpe), 2, true), "", "before it paid to trade"),
      cell("Noise bar", fx(bar, 2), "amber", "best Sharpe this sweep finds on nothing"),
      cell("Deflated Sharpe", fx(defl, 2, true), isNum(defl) && defl <= 0 ? "amber" : "",
           isNum(trials) ? "after paying for " + plural(trials, "trial")
                         : "after paying for the search"),
      cell("Out-of-sample Sharpe", fx(nn(r.oos_sharpe), 2, true), "",
           "walk-forward, refitting the lookback each fold"),
      cell("Plateau", fx(nn(r.plateau), 2), "",
           "how flat the peak is — a spike is a fitted artefact"),
      cell("Neighbour Sharpe", fx(nn(r.neighbour_sharpe), 2, true), "",
           "the settings either side of the reported one"),
      cell("Cost drag", fpct(nn(r.cost_drag), 2), "amber", "given up per year"),
      cell("Net CAGR", fpct(nn(net.cagr), 2, true),
           isNum(nn(net.cagr)) && nn(net.cagr) < 0 ? "neg" : "", "compounded, after costs"),
      cell("Max drawdown", fpct(nn(net.max_drawdown), 2), "neg", "worst peak to trough, net"),
      cell("Turnover", fx(nn(net.turnover), 1), "", "times a year"),
      cell("Bars", numOr(net.n_periods), "", "in the tested sample")
    ]));

    var wf = arr(r.walk_forward).map(function (w) {
      var te = nn(w.test_sharpe);
      return h("tr", {}, [
        h("td", { text: numOr(w.fold) }),
        h("td", { text: numOr(w.train_lookback) }),
        h("td", { text: fx(nn(w.train_sharpe), 2, true) }),
        h("td", { "class": isNum(te) && te > 0 ? "t-sig" : "t-dbt", text: fx(te, 2, true) }),
        h("td", { text: numOr(w.n_train) }),
        h("td", { text: numOr(w.n_test) })
      ]);
    });
    if (wf.length) {
      kids.push(mtable("Walk-forward: the lookback chosen on train, scored on test",
        ["fold", "lookback", "train Sharpe", "test Sharpe", "n train", "n test"], wf));
      kids.push(note("The test column is the only one that was not chosen by looking at the "
        + "data it is scored on. Read the spread between folds, not their mean."));
    }

    fill($("c-momentum"), kids);
    live("momentum", "Net Sharpe " + fx(sharpe, 2, true) + ", interval " +
                     fx(nn(ci[0]), 2, true) + " to " + fx(nn(ci[1]), 2, true) +
                     ", against a noise bar of " + fx(bar, 2) + " for " +
                     plural(trials, "setting") + " swept. " + (v.headline || "Not graded") + ".");
  }


  /* ==================================================================== 7 */
  /* WHAT DOES THE TAIL LOOK LIKE? — Monte Carlo                            */

  var FAN_Q = ["p5", "p25", "p50", "p75", "p95"];

  /* The hero. The percentile fan, with a sample of the actual paths drawn
   * faintly over it.
   *
   * The two are different objects and the overlay is the point. The bands are
   * cross-sectional percentiles at each date; no single future traces the 5th
   * percentile line. The faint lines ARE futures, and they cross the bands
   * constantly. A reader who has watched them cross will not read the lower band
   * as a trajectory, which is the commonest misreading of a fan chart and the
   * one tape.js's dossier version can only warn about in words. */
  function mcFan(r) {
    var f = obj(r.fan);
    var steps = arr(f.steps).map(nn);
    if (finite(steps).length < 2) return null;
    var q = {}, all = [], i;
    for (i = 0; i < FAN_Q.length; i++) {
      var vals = arr(f[FAN_Q[i]]).map(nn);
      q[FAN_Q[i]] = vals.length === steps.length ? vals : null;
      if (q[FAN_Q[i]]) all = all.concat(q[FAN_Q[i]]);
    }
    if (!q.p50) return null;

    /* Only paths that ride the fan's own step index are drawn. A sample of a
     * different length rode a different clock, and stretching it onto this axis
     * would draw a future at dates it was never valued on. */
    var sample = [], raw = arr(r.paths_sample);
    for (i = 0; i < raw.length && sample.length < 24; i++) {
      var path = arr(raw[i]).map(nn);
      if (path.length === steps.length) { sample.push(path); all = all.concat(path); }
    }
    all.push(1.0);

    var p = P(W, 280, { l: 64, r: 26, b: 44 });
    p.xlo = minOf(finite(steps)); p.xhi = maxOf(finite(steps));
    if (!(p.xhi > p.xlo)) return null;
    if (!setY(p, all, 0.06)) return null;

    var kids = yAxis(p, fmtNum(2), 5)
      .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 0) };
      })));
    if (q.p5 && q.p95) kids = kids.concat(band(p, steps, q.p5, q.p95, "fl-chk"));
    if (q.p25 && q.p75) kids = kids.concat(band(p, steps, q.p25, q.p75, "fl-vel"));
    for (i = 0; i < sample.length; i++) kids = kids.concat(lines(p, steps, sample[i], "mc-path"));
    kids = kids.concat(hRule(p, 1.0, "st-chk dash", "starting capital"))
               .concat(lines(p, steps, q.p50, "st-vel"))
               .concat(axisTitles(p, "bars ahead", "multiple of starting capital"));

    var legend = [key("st-vel", "median at each date"),
                  key("fl-vel", "25th–75th percentile", "k-box"),
                  key("fl-chk", "5th–95th percentile", "k-box"),
                  key("st-chk dash", "starting capital")];
    if (sample.length) {
      legend.push(key("mc-path", sample.length + " of " + numOr(r.n_paths) + " simulated paths"));
    }

    return fig("The fan, with real futures drawn over it", chart(p,
      "percentiles of simulated wealth at each step ahead as nested bands, with a sample of "
      + "individual simulated paths drawn faintly over them", kids, "mc-hero"), legend,
      "The bands are not paths. No single future traces the 5th percentile line — it is the "
      + "5th percentile at EACH date, which overstates how bad an early bad path is and "
      + "understates a late one. The faint lines are paths, and they cross the bands.");
  }

  /* A distribution the engine shipped as quantiles, drawn as quantiles.
   *
   * There is no histogram on the wire and none is manufactured here. Binning the
   * handful of sample paths would draw a 40-observation picture under a
   * 2000-path heading, which is the same class of mistake as plotting a null at
   * the origin: a weaker measurement wearing a stronger one's label. What is
   * drawn is exactly the numbers computed — a spine from the lowest quantile to
   * the highest, a box when both its edges exist, every mark carrying its own
   * value. */
  function ladder(dist, spec, opts) {
    opts = opts || {};
    var d = obj(dist), marks = [], i, v;
    for (i = 0; i < spec.length; i++) {
      v = nn(d[spec[i].k]);
      if (isNum(v)) {
        marks.push({ v: v, label: spec[i].label, cls: spec[i].cls || "st-vel",
                     tall: !!spec[i].tall });
      }
    }
    if (marks.length < 2) return null;
    var vals = marks.map(function (m) { return m.v; });
    var at = nn(opts.at);
    var dm = domain(vals.concat(isNum(at) ? [at] : []), 0.10);
    if (!dm) return null;

    var p = P(W, 184, { l: 26, r: 26, t: 34, b: 58 });
    p.xlo = dm[0]; p.xhi = dm[1];
    var mid = (p.t + p.h - p.b) / 2;
    var fmt = opts.fmt || fmtNum(2);

    var kids = [];
    var bLo = nn(d[opts.boxLo]), bHi = nn(d[opts.boxHi]);
    if (isNum(bLo) && isNum(bHi) && bHi > bLo) {
      kids.push(s("rect", { "class": "mc-box fl-vel", x: xOf(p, bLo).toFixed(1),
                            y: (mid - 13).toFixed(1),
                            width: Math.max(1, xOf(p, bHi) - xOf(p, bLo)).toFixed(1),
                            height: 26, rx: 1 }));
    }
    kids.push(s("line", { "class": "mc-spine", x1: xOf(p, minOf(vals)).toFixed(1), y1: mid,
                          x2: xOf(p, maxOf(vals)).toFixed(1), y2: mid }));
    kids = kids.concat(vRule(p, at, "st-chk dash", opts.atLabel || null, p.t - 12));

    for (i = 0; i < marks.length; i++) {
      var x = xOf(p, marks[i].v), up = (i % 2 === 0), half = marks[i].tall ? 18 : 12;
      kids.push(s("line", { "class": "mc-mark " + marks[i].cls, x1: x.toFixed(1),
                            y1: (mid - half).toFixed(1), x2: x.toFixed(1),
                            y2: (mid + half).toFixed(1) }));
      kids.push(s("text", { "class": "mc-annot", x: x.toFixed(1), "text-anchor": "middle",
                            y: (up ? mid - half - 6 : mid + half + 12).toFixed(1),
                            text: marks[i].label }));
      kids.push(s("text", { "class": "mc-tick", x: x.toFixed(1), "text-anchor": "middle",
                            y: (up ? mid - half - 16 : mid + half + 22).toFixed(1),
                            text: fmt(marks[i].v) }));
    }
    kids = kids.concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
      return { v: t, label: fmt(t) };
    }))).concat(axisTitles(p, opts.xTitle || null, null));
    return chart(p, opts.label || "quantile ladder", kids);
  }

  var TERM_SPEC = [
    { k: "p1", label: "1st", cls: "st-flt", tall: true },
    { k: "p5", label: "5th", cls: "st-flt" },
    { k: "p25", label: "25th", cls: "st-chk" },
    { k: "p50", label: "median", cls: "st-vel", tall: true },
    { k: "p75", label: "75th", cls: "st-chk" },
    { k: "p95", label: "95th", cls: "st-sig" },
    { k: "p99", label: "99th", cls: "st-sig", tall: true }
  ];

  var DD_SPEC = [
    { k: "p50", label: "median", cls: "st-vel", tall: true },
    { k: "p75", label: "75th", cls: "st-chk" },
    { k: "p90", label: "90th", cls: "st-dbt" },
    { k: "p95", label: "95th", cls: "st-dbt" },
    { k: "p99", label: "99th", cls: "st-flt", tall: true },
    { k: "worst", label: "worst path", cls: "st-flt" }
  ];

  /* The callout. The empirical 1st percentile and the normal fit's, as two marks
   * on ONE axis, so the tail gap is a distance you can see rather than a
   * subtraction the reader is asked to perform between two cells of a grid. */
  function tailGapAxis(r) {
    var term = obj(r.terminal);
    var gterm = obj(obj(r.gaussian_comparison).terminal);
    var emp = nn(term.p1), gau = nn(gterm.p1);
    if (!isNum(emp) || !isNum(gau)) return null;

    var p = P(W, 176, { l: 26, r: 26, t: 34, b: 52 });
    var dm = domain([emp, gau, 1.0], 0.14);
    p.xlo = dm[0]; p.xhi = dm[1];
    var mid = (p.t + p.h - p.b) / 2;
    var xe = xOf(p, emp), xg = xOf(p, gau);

    var kids = [
      s("line", { "class": "mc-spine", x1: p.l, y1: mid, x2: p.w - p.r, y2: mid }),
      s("line", { "class": "mc-gapspan", x1: Math.min(xe, xg).toFixed(1),
                  y1: (mid - 26).toFixed(1), x2: Math.max(xe, xg).toFixed(1),
                  y2: (mid - 26).toFixed(1) }),
      s("line", { "class": "mc-gapspan", x1: xe.toFixed(1), y1: (mid - 26).toFixed(1),
                  x2: xe.toFixed(1), y2: (mid - 14).toFixed(1) }),
      s("line", { "class": "mc-gapspan", x1: xg.toFixed(1), y1: (mid - 26).toFixed(1),
                  x2: xg.toFixed(1), y2: (mid - 14).toFixed(1) }),
      /* The gap the model computed, not one recomputed from two rounded marks. */
      s("text", { "class": "mc-annot fi-dbt", x: ((xe + xg) / 2).toFixed(1),
                  y: (mid - 32).toFixed(1), "text-anchor": "middle",
                  text: "gap " + fx(nn(r.tail_gap), 3, true) + " of capital" })
    ];

    [[gau, "normal fit, 1st pct", "st-blu", "fi-blu"],
     [emp, "resampled, 1st pct", "st-vel", "fi-vel"]].forEach(function (m, i) {
      var x = xOf(p, m[0]);
      kids.push(s("line", { "class": "mc-mark " + m[2], x1: x.toFixed(1),
                            y1: (mid - 14).toFixed(1), x2: x.toFixed(1),
                            y2: (mid + 14).toFixed(1) }));
      kids.push(s("text", { "class": "mc-annot " + m[3], x: x.toFixed(1),
                            y: (mid + (i ? 40 : 27)).toFixed(1), "text-anchor": "middle",
                            text: m[1] + "  " + fx(m[0], 3) }));
    });
    kids = kids.concat(vRule(p, 1.0, "st-chk dash", "starting capital", p.t - 16))
               .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
                 return { v: t, label: fx(t, 2) };
               })))
               .concat(axisTitles(p, "terminal wealth, multiple of starting capital", null));

    return fig("The tail gap, as a distance", chart(p,
      "the resampled 1st percentile of terminal wealth and the normal fit's, marked on one "
      + "axis so the gap between them is a visible distance", kids),
      [key("st-vel", "resampled 1st percentile"), key("st-blu", "normal fit's 1st percentile"),
       key("mc-gapspan", "the gap")],
      "Positive means the normal fit understates the loss — the resampled worst 1% ends lower "
      + "than a Gaussian would have said. The interval on that gap is below and it is the "
      + "reading: a 1% quantile is a handful of observations however many paths ran.");
  }

  function renderMontecarlo(r) {
    var term = obj(r.terminal), dd = obj(r.drawdown_dist);
    var gterm = obj(obj(r.gaussian_comparison).terminal);
    var pl = nn(r.prob_loss), plse = nn(r.prob_loss_se);
    var pr = nn(r.prob_ruin), prse = nn(r.prob_ruin_se);
    var gapCi = arr(r.tail_gap_ci);
    var v = verdictOf(r);

    var kids = [
      subject(str(r.method, "unstated method") + "  ·  " + numOr(r.n_paths) + " paths  ·  " +
              numOr(r.horizon) + "-bar horizon  ·  block " + numOr(r.block) + "  ·  fitted on " +
              numOr(r.n_obs) + " observed bars")
    ].concat(verdictKids(v, "This run came back without a grading, so none is printed."));

    var hero = mcFan(r);
    if (hero) kids.push(hero);
    else kids.push(gone("The fan came back without a usable median series, so it is not drawn."));

    var tl = ladder(term, TERM_SPEC, {
      label: "quantiles of terminal wealth across every simulated path",
      xTitle: "terminal wealth, multiple of starting capital",
      boxLo: "p25", boxHi: "p75", at: 1.0, atLabel: "starting capital", fmt: fmtNum(2)
    });
    if (tl) {
      kids.push(fig("Where the futures end", tl,
        [key("fl-vel", "25th to 75th percentile", "k-box"), key("st-vel", "median"),
         key("st-flt", "the loss end"), key("st-sig", "the gain end"),
         key("st-chk dash", "starting capital")],
        "These are the quantiles the model computed over " + numOr(r.n_paths) + " paths, drawn "
        + "as quantiles. No histogram is drawn because none was sent: binning the handful of "
        + "sample paths would put a 40-path picture under a " + numOr(r.n_paths)
        + "-path heading."));
    }

    var dl = ladder(dd, DD_SPEC, {
      label: "quantiles of the deepest drawdown reached on each simulated path",
      xTitle: "deepest drawdown on a path, as a positive fraction",
      boxLo: "p50", boxHi: "p95", fmt: fmtPct(1)
    });
    if (dl) {
      kids.push(fig("How deep they went on the way", dl,
        [key("fl-vel", "median to 95th percentile", "k-box"), key("st-vel", "median path"),
         key("st-dbt", "a bad one"), key("st-flt", "the worst")],
        "Depth reached at any point on the path, not the loss it ended with. A future can "
        + "finish above where it started and still have been down this far in the middle, "
        + "which is the number that decides whether it was held."));
    }

    var tg = tailGapAxis(r);
    if (tg) kids.push(tg);
    else kids.push(gone("One of the two 1st percentiles is missing, so the tail gap is not "
                      + "drawn as a distance. The figure and its interval are below."));

    kids.push(h("div", { "class": "m-ivbox" }, [
      h("h4", { "class": "m-h", text: "How much fatter the resampled tail is than a normal fit" }),
      intervalBar(nn(gapCi[0]), nn(r.tail_gap), nn(gapCi[1]),
                  "tail gap · resampled 1% loss minus the normal fit's, in capital"),
      note("The interval resamples the paths, so it says how much of the gap is the seed. It "
         + "says nothing about the sample the paths were drawn from, and that uncertainty is "
         + "larger and is not reducible by simulating harder.")
    ]));

    kids.push(grid([
      cell("Median outcome", fx(nn(term.p50), 3), "", "multiple of starting capital"),
      cell("5th percentile", fx(nn(term.p5), 3), "neg", "one in twenty is worse"),
      cell("1st percentile", fx(nn(term.p1), 3), "neg", "one in a hundred is worse"),
      cell("95th percentile", fx(nn(term.p95), 3), "pos", "one in twenty is better"),
      cell("P(loss)", isNum(pl) ? fpct(pl, 1) + (isNum(plse) ? " ± " + fpct(plse, 1) : "") : "—",
           "amber", "paths ending below where they started"),
      cell("P(ruin)", isNum(pr) ? fpct(pr, 2) + (isNum(prse) ? " ± " + fpct(prse, 2) : "") : "—",
           "neg", "below " + fx(nn(r.ruin_threshold), 2) + " of capital at any point"),
      cell("VaR (simulated)", fpct(nn(r.var_mc), 2), "neg",
           "at " + fpct(nn(r.confidence), 0) + " over the horizon"),
      cell("CVaR (simulated)", fpct(nn(r.cvar_mc), 2), "neg", "average loss beyond that VaR"),
      cell("Median drawdown", fpct(nn(dd.p50), 2), "neg", "depth of the typical path"),
      cell("95th pct drawdown", fpct(nn(dd.p95), 2), "neg", "depth of a bad one"),
      cell("Normal fit, 1st pct", fx(nn(gterm.p1), 3), "", "what a Gaussian would have said"),
      cell("Tail gap ratio", fx(nn(r.tail_gap_ratio), 2), "amber",
           "the gap as a fraction of the normal fit's own loss")
    ]));

    var floored = nn(r.floored_draws);
    if (isNum(floored) && floored > 0) {
      kids.push(callout(fx(floored, 0) + " simulated bar" + (floored === 1 ? " was" : "s were") +
        " floored at total loss, so the left tail is clipped and every loss figure above is, "
        + "if anything, optimistic.", "bad"));
    }

    kids.push(note("A block bootstrap resamples the past in chunks. It keeps this sample's "
      + "volatility clustering and it cannot produce anything the sample never did — no crash "
      + "larger than the largest run of bad days already inside the window."));

    fill($("c-montecarlo"), kids);
    live("montecarlo", "Median outcome " + fx(nn(term.p50), 2) + " times capital, 1st percentile " +
                       fx(nn(term.p1), 2) + " against a normal fit's " + fx(nn(gterm.p1), 2) +
                       ", tail gap " + fx(nn(r.tail_gap), 3, true) + ". " +
                       (v.headline || "Not graded") + ".");
  }


  /* ==================================================================== 8 */
  /* WHAT IS IT WORTH? — options                                            */

  /* Break-even at expiry, read off the payoff grid the model sent rather than
   * reconstructed from strike and premium. `payoff.pnl` is intrinsic at expiry
   * minus the premium paid today, so break-even is where it crosses zero, and
   * the crossing is interpolated between the two shipped points either side of
   * it — arithmetic on the model's own numbers, not a second pricer. Null when
   * the grid never crosses, because a grid wide enough to bracket break-even is
   * not something to assume. */
  function breakEven(rows) {
    var d = arr(rows), prev = null, i;
    for (i = 0; i < d.length; i++) {
      var x = nn(d[i].spot), y = nn(d[i].pnl);
      if (!isNum(x) || !isNum(y)) { prev = null; continue; }
      if (y === 0) return x;
      if (prev && ((prev.y < 0) !== (y < 0))) {
        return prev.x + ((0 - prev.y) / (y - prev.y)) * (x - prev.x);
      }
      prev = { x: x, y: y };
    }
    return null;
  }

  /* The hero. Payoff at expiry, today's value curve over it, strike and
   * break-even marked. The vertical gap between the two lines is time value and
   * it is the entire thing being bought. tape.js draws the same two lines in the
   * dossier (payoffChart); the shaded gap and the break-even mark are here. */
  function optPayoff(r) {
    var curve = arr(r.value_curve), pay = arr(r.payoff);
    if (curve.length < 2 && pay.length < 2) return null;

    var byStrike = {}, i;
    for (i = 0; i < pay.length; i++) {
      var sp = nn(pay[i].spot);
      if (isNum(sp)) byStrike[sp.toFixed(6)] = nn(pay[i].intrinsic);
    }
    var src = curve.length >= 2 ? curve : pay;
    var xs = [], vals = [], intr = [];
    for (i = 0; i < src.length; i++) {
      var x = nn(src[i].spot);
      xs.push(x);
      vals.push(nn(src[i].value));
      intr.push(isNum(x) && own(byStrike, x.toFixed(6)) ? byStrike[x.toFixed(6)]
                                                       : nn(src[i].intrinsic));
    }
    var xf = finite(xs);
    if (xf.length < 2) return null;

    var p = P(W, 250, { l: 64, r: 26, b: 44 });
    p.xlo = minOf(xf); p.xhi = maxOf(xf);
    if (!(p.xhi > p.xlo)) return null;
    if (!setY(p, vals.concat(intr), 0.08, true)) return null;

    var spot = nn(r.spot), strike = nn(r.strike), be = breakEven(pay);
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 0) };
      })))
      .concat(between(p, xs, vals, intr, "fl-dbt"))
      .concat(lines(p, xs, intr, "st-chk dash"))
      .concat(lines(p, xs, vals, "st-vel"))
      .concat(vRule(p, strike, "st-dbt dash",
                    isNum(strike) ? "strike " + fx(strike, 2) : null, p.t + 10))
      .concat(vRule(p, spot, "st-blu", isNum(spot) ? "spot " + fx(spot, 2) : null, p.t + 24))
      .concat(vRule(p, be, "st-sig dash",
                    isNum(be) ? "break-even " + fx(be, 2) : null, p.t + 38))
      .concat(axisTitles(p, "spot at expiry", "value"));

    var legend = [key("st-vel", "value now"), key("st-chk dash", "payoff at expiry"),
                  key("fl-dbt", "time value — the part that decays", "k-box"),
                  key("st-dbt dash", "strike")];
    if (isNum(spot)) legend.push(key("st-blu", "spot"));
    if (isNum(be)) legend.push(key("st-sig dash", "break-even at expiry"));

    return fig("What it is worth now, against what it is worth at expiry", chart(p,
      "option value against spot with the expiry payoff underneath, and the strike, the spot "
      + "and the break-even marked", kids, "mc-hero"), legend,
      isNum(be)
        ? "Break-even is read off the payoff grid, where intrinsic at expiry equals the premium "
        + "paid today. It ignores the financing on that premium, which is how every payoff "
        + "diagram is drawn and is still wrong by exactly that much."
        : "The payoff grid never crosses break-even, so none is marked. The shaded gap is time "
        + "value, and it goes to zero on a schedule you do not control.");
  }

  /* Implied volatility by strike, when a chain was supplied. A quote the solver
   * could not invert keeps its place with a hole, so the line breaks there
   * rather than sliding the rest of the smile sideways. */
  function optSmile(r) {
    var d = arr(r.smile);
    if (d.length < 2) return null;
    var xs = [], iv = [], i;
    for (i = 0; i < d.length; i++) { xs.push(nn(d[i].strike)); iv.push(nn(d[i].iv)); }
    var xf = finite(xs);
    if (xf.length < 2 || finite(iv).length < 2) return null;

    var p = P(W, 200, { l: 64, r: 26, b: 44 });
    p.xlo = minOf(xf); p.xhi = maxOf(xf);
    if (!(p.xhi > p.xlo)) return null;
    var pad = (p.xhi - p.xlo) * 0.04;
    p.xlo -= pad; p.xhi += pad;
    if (!setY(p, iv.concat([nn(r.vol)]), 0.12)) return null;

    var holes = iv.length - finite(iv).length;
    var kids = yAxis(p, fmtPct(0), 4)
      .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 0) };
      })))
      .concat(hRule(p, nn(r.vol), "st-chk dash",
                    isNum(nn(r.vol)) ? "priced at " + fpct(nn(r.vol), 1) : null))
      .concat(lines(p, xs, iv, "st-vio"))
      .concat(dots(p, xs, iv, "fl-vio", 2.6))
      .concat(vRule(p, nn(r.strike), "st-dbt dash", "this strike", p.t + 10))
      .concat(axisTitles(p, "strike", "implied volatility"));

    return fig("One underlying, one volatility — and the market's answer at every strike",
      chart(p, "implied volatility by strike against the single volatility this option was "
             + "priced with", kids),
      [key("st-vio", "implied volatility from the chain"),
       key("fl-vio", "one quoted strike", "k-dot"),
       key("st-chk dash", "the volatility used to price"), key("st-dbt dash", "this strike")],
      "Black-Scholes assumes one volatility for every strike. This line is the market saying "
      + "otherwise, and it is why the price above is an identity rather than a valuation."
      + (holes ? "  ·  " + holes + " quote" + (holes === 1 ? "" : "s") + " did not invert, so "
               + "the line breaks there" : ""));
  }

  function optTerm(r) {
    var d = arr(r.term);
    if (d.length < 2) return null;
    var xs = [], px = [], i;
    for (i = 0; i < d.length; i++) { xs.push(nn(d[i].tau)); px.push(nn(d[i].price)); }
    var xf = finite(xs);
    if (xf.length < 2 || finite(px).length < 2) return null;

    var p = P(W, 190, { l: 64, r: 26, b: 44 });
    p.xlo = minOf(xf); p.xhi = maxOf(xf);
    if (!(p.xhi > p.xlo)) return null;
    if (!setY(p, px, 0.10, true)) return null;

    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 2) };
      })))
      .concat(lines(p, xs, px, "st-vel"))
      .concat(vRule(p, nn(r.tau), "st-sig dash",
                    isNum(nn(r.tau_days)) ? fx(nn(r.tau_days), 0) + " days"
                      : (isNum(nn(r.tau)) ? fx(nn(r.tau), 3) + "y" : null), p.t + 10))
      .concat(axisTitles(p, "years to expiry", "price"));

    return fig("The same contract at every expiry", chart(p,
      "theoretical price against time to expiry, with this option's tenor marked", kids),
      [key("st-vel", "price"), key("st-sig dash", "this tenor")],
      "Everything else held still. The curve is steepest near zero, which is the same fact as "
      + "theta and is the reason a short-dated option is a bet on timing rather than on level.");
  }

  /* The same units note tape.js prints in the dossier, because getting these
   * wrong has cost more money than the model has. */
  var GREEK_NOTES = {
    delta: "per 1.00 of spot",
    gamma: "per 1.00 of spot, squared",
    vega: "per 1.00 of volatility — NOT per vol point",
    theta: "per year — NOT per day",
    rho: "per 1.00 of rate — NOT per basis point"
  };

  function renderOptions(r) {
    var g = obj(r.greeks);
    var v = verdictOf(r);
    var perr = nn(r.parity_error), ptol = nn(r.parity_tol);
    var rate = nn(r.rate);

    var kids = [
      subject(str(r.kind, "option") + "  ·  " + str(r.struck, "struck as stated") + "  ·  " +
              (isNum(nn(r.tau_days)) ? fx(nn(r.tau_days), 0) + " days to expiry"
                                     : "tenor " + fx(nn(r.tau), 3) + "y") + "  ·  " +
              str(r.vol_source, "volatility as supplied"))
    ].concat(verdictKids(v, "This run came back without a grading, so none is printed."));

    var hero = optPayoff(r);
    if (hero) kids.push(hero);
    else kids.push(gone("No value curve or payoff grid came back, so the payoff is not drawn."));

    var chips = [];
    for (var k in g) {
      if (!own(g, k)) continue;
      chips.push(h("span", { "class": "m-chip" }, [
        h("b", { text: k }), " " + fx(nn(g[k]), 4, true),
        h("em", { "class": "m-chipnote", text: GREEK_NOTES[k] || "" })
      ]));
    }
    if (chips.length) {
      kids.push(h("div", { "class": "m-chips" }, [
        h("h4", { "class": "m-h", text: "Greeks, in the units they are actually in" }),
        h("div", { "class": "m-chiprow" }, chips),
        note("Each of these is a partial derivative and assumes every other input holds still. "
           + "In a real move none of them does, which is why adding them up does not give you "
           + "the P&L.")
      ]));
    }

    /* The parity residual is a SELF-TEST and its SCALE is the message. At 1e-16
     * the pricer agrees with itself to double precision; printed as fx(v, 2) it
     * reads "0.00", which is the one rendering that makes a passing self-test
     * look like a number nobody bothered to compute. */
    kids.push(h("div", { "class": "m-selftest" + (r.parity_ok === false ? " bad" : "") }, [
      h("h4", { "class": "m-h", text: "Put–call parity, as a self-test" }),
      h("p", { "class": "m-sci" }, [
        h("span", { "class": "m-sci-k", text: "residual" }),
        h("b", { text: sci(perr, 2) }),
        isNum(ptol) ? h("span", { "class": "m-sci-k", text: "tolerance" }) : null,
        isNum(ptol) ? h("span", { text: sci(ptol, 2) }) : null
      ]),
      h("p", { "class": "m-selftest-b", text:
        r.parity_ok === true
          ? "A residual of that size is floating-point noise and nothing else: it is the "
          + "arithmetic agreeing with itself to double precision, and seeing it is the "
          + "self-test PASSING. It says the call, the put and the forward were priced "
          + "consistently. It says nothing whatever about whether the volatility was right — "
          + "parity is completely blind to the volatility term."
          : r.parity_ok === false
          ? "BREACHED. The residual is above tolerance, which means the pricer disagrees with "
          + "itself: the call, the put and the forward it computed are not consistent. Nothing "
          + "above should be read until that is explained."
          : "No parity check came back with this run, so the pricer's agreement with itself was "
          + "not tested here. That is an absent check, not a passed one." })
    ]));

    kids.push(grid([
      cell("Theoretical price", fx(nn(r.price), 4), "", "Black–Scholes, on the inputs below"),
      cell("Intrinsic", fx(nn(r.intrinsic), 4), "", "what it is worth if expiry were now"),
      cell("Time value", fx(nn(r.time_value), 4), "amber", "the part that decays to nothing"),
      cell("Spot", fx(nn(r.spot), 2), "", "as supplied"),
      cell("Strike", fx(nn(r.strike), 2), "", "as struck"),
      cell("Volatility in", fpct(nn(r.vol), 1), "", "the input, annualised"),
      cell("Rate", fpct(rate, 2), isNum(rate) && rate === 0 ? "amber" : "",
           isNum(rate) && rate === 0 ? "zero: this repo has no rate curve"
                                     : "risk-free, annualised"),
      cell("Implied vol", isNum(nn(r.implied_vol)) ? fpct(nn(r.implied_vol), 1) : "—", "",
           isNum(nn(r.market_price)) ? "backed out of the market price supplied"
                                     : "no market price was supplied, so none was solved"),
      cell("Parity residual", sci(perr, 1), r.parity_ok === false ? "neg" : "",
           r.parity_ok === true ? "holds within tolerance"
             : r.parity_ok === false ? "BREACHED" : "not checked")
    ]));

    var smile = optSmile(r);
    if (smile) kids.push(smile);
    else if (arr(r.smile).length) {
      kids.push(gone("A chain came back but fewer than two strikes solved for an implied "
                   + "volatility, so the smile is not drawn."));
    } else {
      kids.push(gone("No option chain was supplied, so there is no smile to draw. That is a "
                   + "missing input, not a flat smile — nothing here says the market prices "
                   + "every strike at the same volatility."));
    }

    var term = optTerm(r);
    if (term) kids.push(term);

    kids.push(note("This panel is an identity, not an estimate. Given spot, strike, rate, "
      + "volatility and time, the price is arithmetic — so it carries no interval and it "
      + "contributes no direction to anything. The one input that is a guess is the "
      + "volatility, and it came from the realised past."));

    fill($("c-options"), kids);
    live("options", str(r.kind, "option") + " priced at " + fx(nn(r.price), 4) + ", intrinsic " +
                    fx(nn(r.intrinsic), 4) + ", time value " + fx(nn(r.time_value), 4) +
                    ". Parity residual " + sci(perr, 1) + " — " +
                    (r.parity_ok === true ? "the self-test is passing"
                      : r.parity_ok === false ? "BREACHED" : "not checked") + ".");
  }


  /* ==================================================================== 9 */
  /* WHAT DOES THE TARGETING COST? — volatility targeting                   */

  /* The hero. Realised volatility against the target it was aiming at, with the
   * tolerance band shaded and the area between the two filled, so tracking error
   * reads as AREA rather than as one more number in a grid.
   *
   * The estimate is trailing, so every move back into the band happens after the
   * move that pushed it out. That lag is the cost, and it is `lag_bars` below.
   * tape.js draws the line, the target and the band (volSeriesChart); the filled
   * deviation is what makes the cost visible and is here. */
  function volTrack(r) {
    var rv = ser(r.realized_vol);
    if (!rv || finite(rv.v).length < 2) return null;
    var tv = nn(r.target_vol), bf = nn(r.band);

    var p = P(W, 230, { l: 64, r: 26, b: 42 });
    p.xlo = 0; p.xhi = Math.max(1, rv.n - 1);
    var extra = [];
    if (isNum(tv)) {
      extra.push(tv);
      if (isNum(bf)) { extra.push(tv * (1 + bf)); extra.push(tv * (1 - bf)); }
    }
    if (!setY(p, rv.v.concat(extra), 0.08)) return null;

    var xs = seq(rv.n), i;
    var kids = yAxis(p, fmtPct(0), 4)
      .concat(xAxis(p, rv.dates.length === rv.n ? dateTicks(rv.dates, 6)
        : niceTicks(0, p.xhi, 6).map(function (t) { return { v: t, label: fx(t, 0) }; })));

    if (isNum(tv)) {
      /* The deviation area goes down first, so the tolerance band and the target
       * rule read on top of it rather than under it. */
      var flat = [];
      for (i = 0; i < rv.n; i++) flat.push(tv);
      kids = kids.concat(between(p, xs, rv.v, flat, "fl-dbt"));
      if (isNum(bf)) {
        var loB = [], hiB = [];
        for (i = 0; i < rv.n; i++) { loB.push(tv * (1 - bf)); hiB.push(tv * (1 + bf)); }
        kids = kids.concat(band(p, xs, loB, hiB, "fl-sig"));
      }
    }
    kids = kids.concat(hRule(p, tv, "st-sig dash", isNum(tv) ? "target " + fpct(tv, 0) : null))
               .concat(lines(p, xs, rv.v, "st-vel"))
               .concat(axisTitles(p, null, "annualised volatility"));

    var legend = [key("st-vel", "realised vol")];
    if (isNum(tv)) {
      legend.push(key("st-sig dash", "target"));
      legend.push(key("fl-dbt", "distance from target", "k-box"));
    }
    if (isNum(tv) && isNum(bf)) {
      legend.push(key("fl-sig", "±" + fpct(bf, 0) + " tolerance band", "k-box"));
    }

    return fig("Realised volatility against the target it was aiming at", chart(p,
      "trailing realised volatility against the target line, with the tolerance band shaded "
      + "and the area between realised volatility and target filled", kids, "mc-hero"), legend,
      "The filled area IS the tracking error. The estimate is trailing, so every move back "
      + "into the band happens after the move that put it outside — that lag is measured below "
      + "and it is what the targeting actually costs.");
  }

  function volLeverage(r) {
    var lv = ser(r.leverage);
    if (!lv || finite(lv.v).length < 2) return null;
    var mx = nn(r.max_leverage);
    var p = P(W, 180, { l: 64, r: 26, b: 42 });
    p.xlo = 0; p.xhi = Math.max(1, lv.n - 1);
    if (!setY(p, lv.v.concat([mx, 1.0]), 0.08)) return null;
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, lv.dates.length === lv.n ? dateTicks(lv.dates, 6)
        : niceTicks(0, p.xhi, 6).map(function (t) { return { v: t, label: fx(t, 0) }; })))
      .concat(hRule(p, 1.0, "st-chk dash", "unlevered"))
      .concat(hRule(p, mx, "st-flt dash", isNum(mx) ? "cap " + fx(mx, 2) + "x" : null))
      .concat(lines(p, seq(lv.n), lv.v, "st-vel"))
      .concat(axisTitles(p, null, "leverage"));
    var legend = [key("st-vel", "leverage"), key("st-chk dash", "unlevered")];
    if (isNum(mx)) legend.push(key("st-flt dash", "cap"));
    return fig("The leverage the rule asked for", chart(p,
      "position leverage over time against the unlevered line and the cap", kids), legend,
      "Time spent flat against the cap is time the rule wanted more risk than it was allowed, "
      + "and over that stretch it is not targeting anything.");
  }

  function volEquity(r) {
    var e = obj(r.equity);
    var dates = arr(e.dates);
    var t = arr(e.targeted).map(nn), u = arr(e.untargeted).map(nn), m = arr(e.matched).map(nn);
    var n = Math.max(t.length, u.length, m.length);
    if (n < 2) return null;
    var p = P(W, 220, { l: 64, r: 26, b: 42 });
    p.xlo = 0; p.xhi = Math.max(1, n - 1);
    if (!setY(p, t.concat(u).concat(m), 0.08)) return null;
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, dates.length === n ? dateTicks(dates, 6)
        : niceTicks(0, p.xhi, 6).map(function (v) { return { v: v, label: fx(v, 0) }; })))
      .concat(lines(p, seq(u.length), u, "st-chk dim"))
      .concat(lines(p, seq(m.length), m, "st-blu"))
      .concat(lines(p, seq(t.length), t, "st-vel"))
      .concat(axisTitles(p, null, "equity, 1.00 at the start"));
    return fig("Targeted, untargeted, and a constant leverage matched to the same vol",
      chart(p, "equity of the vol-targeted series against the raw series and against a "
             + "constant leverage matched to the same full-sample volatility", kids),
      [key("st-vel", "targeted"), key("st-blu", "matched constant leverage"),
       key("st-chk dim", "untargeted")],
      "The blue line is the honest comparison. Beating the untargeted series can be bought "
      + "with leverage alone; beating a constant leverage matched to the same volatility is "
      + "the only version of the claim that is about timing.");
  }

  function renderVoltarget(r) {
    var tgt = obj(r.targeted), unt = obj(r.untargeted), mt = obj(r.matched);
    var ciT = arr(r.sharpe_ci_targeted), ciU = arr(r.sharpe_ci_untargeted);
    var capped = nn(r.capped_fraction);
    var v = verdictOf(r);

    var kids = [
      subject("target " + fpct(nn(r.target_vol), 0) + "  ·  " + numOr(r.window) +
              "-bar estimate  ·  cap " + fx(nn(r.max_leverage), 2) + "x  ·  ±" +
              fpct(nn(r.band), 0) + " band  ·  " + numOr(r.n_obs) + " bars")
    ].concat(verdictKids(v, "This run came back without a grading, so none is printed."));

    var hero = volTrack(r);
    if (hero) kids.push(hero);
    else kids.push(gone("No realised-volatility series came back, so the tracking chart is not "
                      + "drawn — and without it there is nothing to see the cost in."));

    var lev = volLeverage(r);
    if (lev) kids.push(lev);

    var eq = volEquity(r);
    if (eq) kids.push(eq);
    else kids.push(gone("No equity series came back for the three variants, so they are not "
                      + "drawn."));

    kids.push(h("h4", { "class": "m-h m-h-sep", text: "What the targeting cost" }));
    kids.push(grid([
      cell("Added turnover", fx(nn(r.turnover_added), 1), "amber",
           "times a year, on top of the raw series"),
      cell("Cost of targeting", fpct(nn(r.cost_of_targeting), 2), "amber",
           "per year, in return given up"),
      cell("Drawdown cut", fpct(nn(r.drawdown_reduction), 2), "",
           "against the untargeted series"),
      cell("Estimator lag", isNum(nn(r.lag_bars)) ? fx(nn(r.lag_bars), 1) + " bars" : "—",
           "amber", "how late the vol estimate turns")
    ]));
    kids.push(note("The drawdown cut above is bought partly with less leverage, and less "
      + "leverage is not timing. The comparison that is not just less leverage is the cut "
      + "against the matched constant-leverage series, in the grid further down."));

    kids.push(h("div", { "class": "m-ivbox" }, [
      h("h4", { "class": "m-h", text: "Sharpe, targeted against untargeted" }),
      intervalBar(nn(ciT[0]), nn(tgt.sharpe), nn(ciT[1]),
                  "targeted net Sharpe · 95% block-bootstrap interval"),
      intervalBar(nn(ciU[0]), nn(unt.sharpe), nn(ciU[1]),
                  "untargeted net Sharpe · 95% block-bootstrap interval"),
      note("These two intervals are computed on overlapping data and are not independent. If "
         + "they overlap each other — and they usually do — the difference between them has "
         + "not been demonstrated.")
    ]));

    kids.push(grid([
      cell("Targeted Sharpe", fx(nn(tgt.sharpe), 2, true), "", "net of the added turnover"),
      cell("Matched Sharpe", fx(nn(mt.sharpe), 2, true), "",
           "constant leverage " + fx(nn(r.matched_leverage), 2) + "x, same full-sample vol"),
      cell("Untargeted Sharpe", fx(nn(unt.sharpe), 2, true), "", "the raw series"),
      cell("Tracking error", fpct(nn(r.tracking_error), 2), "",
           "against a floor of " + fpct(nn(r.tracking_error_floor), 2)),
      cell("Tracking ratio", fx(nn(r.tracking_ratio), 2), "amber",
           "1.00 means it did no better than the floor"),
      cell("Time in band", fpct(nn(r.hit_rate_in_band), 1), "",
           "ceiling " + fpct(nn(r.hit_rate_ceiling), 1) + " on this estimator"),
      cell("Mean leverage", fx(nn(r.mean_leverage), 2), "", "over the sample"),
      cell("Time at the cap", fpct(capped, 1), isNum(capped) && capped > 0.05 ? "amber" : "",
           "not targeting anything while capped"),
      cell("Drawdown cut vs matched", fpct(nn(r.drawdown_reduction_vs_matched), 2), "",
           "the version that is not just less leverage"),
      cell("Regime strength", fx(nn(r.regime_strength), 2), "",
           "how much vol clustering there was to exploit")
    ]));

    if (isNum(capped) && capped > 0.05) {
      kids.push(callout("The rule sat against its leverage cap for " + fpct(capped, 1) +
        " of the sample. Over that stretch it was not targeting a volatility, it was holding "
        + "the most it was allowed — and every tracking number above includes those bars."));
    }

    var folds = arr(r.folds).map(function (f) {
      return h("tr", {}, [
        h("td", { text: str(f.fold === undefined || f.fold === null ? f.start : f.fold, "—") }),
        h("td", { text: fx(nn(f.targeted), 2, true) }),
        h("td", { text: fx(nn(f.untargeted), 2, true) }),
        h("td", { text: numOr(f.n) })
      ]);
    });
    if (folds.length) {
      kids.push(mtable("Fold by fold, out of sample",
        ["fold", "targeted Sharpe", "untargeted Sharpe", "bars"], folds));
    }

    fill($("c-voltarget"), kids);
    live("voltarget", "Targeting " + fpct(nn(r.target_vol), 0) + " cost " +
                      fpct(nn(r.cost_of_targeting), 2) + " a year and " +
                      fx(nn(r.turnover_added), 1) + " turns of added turnover, for a drawdown " +
                      "cut of " + fpct(nn(r.drawdown_reduction_vs_matched), 2) +
                      " against a matched constant leverage. " +
                      (v.headline || "Not graded") + ".");
  }


  /* ---------------------------------------------------------------- paint */

  var RENDER = {
    statarb: renderStatarb, factors: renderFactors, var: renderVar,
    ml: renderMl, optimize: renderOptimize,
    momentum: renderMomentum, montecarlo: renderMontecarlo,
    options: renderOptions, voltarget: renderVoltarget
  };

  function isKind(kind) { return KINDS.indexOf(String(kind)) >= 0; }

  /* Flatten a job envelope, but only if it has not been flattened already.
   *
   * app.js unwraps on the way in for every kind IT knows is a model, and its
   * list is its own. A kind registered on the server but not in that list
   * arrives here still wearing the envelope, with the whole result nested under
   * "model" and every field this file reads therefore absent — the entire panel
   * would render as em dashes and look like a run that computed nothing.
   *
   * Unwrapping unconditionally is not the fix: unwrap() preserves a colliding
   * model key as "model_<key>", so a second pass over an already-merged payload
   * manufactures "model_model_verdict" and a third makes it longer. So the test
   * is whether any key of the nested dict is missing from the top level. If none
   * is, the merge has happened and the payload is returned untouched. */
  function ready(kind, data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    var inner = data[kind] || data.model;
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) return data;
    for (var k in inner) if (own(inner, k) && !own(data, k)) return unwrap(kind, data);
    return data;
  }

  /* Saved runs arrive as a RunRecord payload rather than a job result. The
   * models write JSON-safe dicts either way, so normalising is unwrapping and
   * nothing else — there is no shape here worth inventing. */
  function normalise(kind, payload) {
    return unwrap(kind, payload);
  }

  /* A kind the caller did not MENTION is left exactly as it is; only a kind
   * carried as an explicit null is hidden.
   *
   * The distinction became load-bearing the moment this file grew past the five
   * panels index.html declares. app.js hands over its whole results object, so
   * every kind it knows about is present as a key and a kind with no run yet is
   * present as null — hiding it is right. tape.js hands over five keys only,
   * because delegate() borrows five element ids to draw a dossier's sections;
   * an absent sixth key there means "not part of this dossier", not "this run
   * produced nothing", and treating the two the same would have hidden the
   * desk's own momentum panel every time a dossier was drawn. */
  function paint(results) {
    var any = false, bag = results || {};
    for (var i = 0; i < KINDS.length; i++) {
      var kind = KINDS[i];
      if (!own(bag, kind)) continue;
      var data = bag[kind];
      /* The section is only built once there is something to put in it, so a
       * desk that has never run these models does not grow four empty shells. */
      var sec = data ? ensureSection(kind) : $(SECTION[kind]);
      if (!sec) continue;
      show(sec, !!data);
      if (!data) continue;
      any = true;
      try {
        RENDER[kind](ready(kind, data));
      } catch (err) {
        // A panel that cannot draw itself says so and leaves the rest of the
        // desk standing. Silently rendering half a chart would be worse.
        fill($("c-" + kind), [gone(
          "This panel could not be drawn from what the desk sent back. The run itself may be fine — "
          + "the result is saved and readable from the history below."
        )]);
        live(kind, "This panel could not be drawn.");
        if (window.console && console.error) console.error("models:" + kind, err);
      }
    }
    return any;
  }

  window.__MODELS__ = {
    kinds: KINDS, section: SECTION, unwrap: unwrap,
    isKind: isKind, normalise: normalise, paint: paint
  };

})();
