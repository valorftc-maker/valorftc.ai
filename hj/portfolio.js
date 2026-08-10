/* Hey Jamie Desk — the whole book.
 *
 * One drawing, and one argument running through it: a portfolio is not a list
 * of names, it is a distribution of RISK, and the two rarely look alike. On the
 * measured five-asset basket BTC-USD is 5.7% of the money and 22.7% of the
 * risk, while EURUSD=X is 44.5% of the money and 16.4% of the risk. Nothing on
 * this page matters more than that inversion, so it is drawn as paired bars —
 * money against risk, per holding, sorted by the multiple between them — and it
 * is the largest figure in the panel.
 *
 * The order the panel is read in:
 *
 *   1. the verdict, and whether the book beat equal weight on the same data
 *   2. what it returned and what that cost, with the Sharpe interval
 *   3. the equity path, against the two benchmarks the engine ran for you
 *   4. WEIGHT AGAINST SHARE OF RISK — the hero, and the reason for the panel
 *   5. the weights over time, so rebalancing and drift are visible
 *   6. what the names do together: the correlation matrix
 *   7. what mixing asset classes cost: bars used, dropped and fabricated
 *   8. the audits — Sharpe, drawdown, prop — reported, never re-graded
 *
 * Four rules, carried unchanged from app.js, models.js and tape.js:
 *
 *   1. null is NOT zero. Every server value goes through numOrNull. A figure
 *      the engine could not compute renders as an em dash, and a chart line or
 *      a stacked band BREAKS at it rather than being bridged or drawn at the
 *      origin. This codebase has been bitten by that confusion seven times; the
 *      Number() call that would make it eight is not in this file.
 *   2. Nothing is inserted as markup. Every server string arrives as a text
 *      node. There is no innerHTML in this file and no alert().
 *   3. Every chart carries a labelled axis or a legend, and every <svg> carries
 *      a <title>. A chart without one is decoration, and decoration is how a
 *      picture lies.
 *   4. The server's verdict is the verdict. `verdict.edge_established`,
 *      `beats_equal_weight` and `beats_buy_and_hold` are drawn as they arrive.
 *      Nothing here derives a grading from the numbers on screen.
 *
 * WHERE THIS FILE LIES TO YOU. Three places, all the same lie in different
 * clothes — a drawing makes a number look more settled than it is:
 *
 *   - The benchmarks are drawn as ENDPOINTS, not as paths, because endpoints
 *     are what the payload carries. Two books that finished level may have got
 *     there through completely different drawdowns, and this panel cannot show
 *     that. The metrics table underneath is the honest comparison.
 *   - `per_asset.contribution_risk_pct` decomposes the volatility of the
 *     TIME-AVERAGED weights under the FULL-SAMPLE covariance. It is a snapshot
 *     of a book nobody held, which is why a risk-parity run does not report
 *     five equal shares here. The server says so in `risk_decomposition_note`,
 *     that note is printed under the hero, and `risk_decomposition_as_solved`
 *     — the weights the solver actually produced, under the covariance it
 *     actually saw — is drawn beside it when the allocation solves one.
 *   - Every figure on this page is one sample of one history. The Sharpe
 *     interval and the deflated Sharpe in the audit block are the width of that
 *     claim; the point estimates beside them are not.
 *
 * This file FETCHES NOTHING. app.js owns the token, the job poll, the console,
 * busy state, history and the error banner, and hands the payload here. It
 * depends on app.js for h/s/fill/show/cell/intervalBar/isNum/numOrNull/fx/fpct
 * and exposes exactly one global, window.__PORTFOLIO__.
 *
 * There is no second copy of anything in here: models.js and tape.js expose
 * kinds/section/normalise/paint and four tape renderers between them, and
 * neither publishes a renderer for sharpe_audit, drawdown_profile or
 * prop_report — those blocks are drawn here for the first time, in their idiom,
 * from the same field names the engine ships.
 */

"use strict";

window.__HEYJAMIE_PORTFOLIO__ = true;

(function () {

  /* app.js is not optional. Without it there are no helpers, no text-escaping
   * discipline and no number discipline, and half-drawing a panel without them
   * is worse than saying so. */
  if (typeof window.h !== "function" || typeof window.numOrNull !== "function" ||
      typeof window.fill !== "function" || typeof window.cell !== "function") {
    var refuse = function (el) {
      if (!el || !el.ownerDocument) return;
      while (el.firstChild) el.removeChild(el.firstChild);
      var p = el.ownerDocument.createElement("p");
      p.className = "pf-gone";
      p.appendChild(el.ownerDocument.createTextNode(
        "The desk's own helpers did not load, so nothing here can be drawn safely. " +
        "Reopen the desk from the launcher."));
      el.appendChild(p);
    };
    window.__PORTFOLIO__ = { renderPortfolio: refuse, kinds: [] };
    return;
  }


  var W = 880;                       /* one viewBox width, so figures line up */
  var DASH = "—";
  var MAX_DRAW = 900;                /* thinning target for the two dated figures */

  /* Twelve fills that mean nothing.
   *
   * The palette's three semantic colours mean signal / doubt / fault everywhere
   * on this desk, so using them to tell SPY from GLD would make a colour say
   * something the number does not. These twelve exist only to tell one holding
   * from another and are declared in app.css beside that reasoning. The count
   * is the wire format's max_holdings; a thirteenth holding the server somehow
   * accepted wraps round, and the legend still names every band. */
  var SERIES = ["pf-s1", "pf-s2", "pf-s3", "pf-s4", "pf-s5", "pf-s6",
                "pf-s7", "pf-s8", "pf-s9", "pf-s10", "pf-s11", "pf-s12"];


  /* ------------------------------------------------------------- discipline */

  function def(v, d) { return v === undefined || v === null ? d : v; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }

  /* The only way a server number becomes a JS number in this file. numOrNull
   * turns null, "", NaN and Infinity into null; Number() would turn the first
   * two into a measured 0. */
  function nn(v) { return numOrNull(v); }

  /* Server text, always as a string, never as markup. */
  function txt(v, fallback) {
    if (v === null || v === undefined) return fallback === undefined ? "" : fallback;
    var t = String(v);
    return t.length ? t : (fallback === undefined ? "" : fallback);
  }

  /* A count for prose. A count the server did not send reads as an em dash,
   * because "0 bars" and "the desk did not say how many bars" are different
   * pieces of news and only one of them is a measurement. */
  function count(v) {
    var n = nn(v);
    return isNum(n) ? fx(n, 0) : DASH;
  }

  function plural(v, one, many) {
    var n = nn(v);
    if (!isNum(n)) return "an unstated number of " + (many || one + "s");
    return fx(n, 0) + " " + (n === 1 ? one : (many || one + "s"));
  }

  /* A published key as a label. Underscores are how the wire spells a space;
   * turning them back is a rendering, not a claim about what the key means. */
  function label(v) { return txt(v, DASH).replace(/_/g, " "); }

  function finite(a) {
    var out = [];
    for (var i = 0; i < (a || []).length; i++) if (isNum(a[i])) out.push(a[i]);
    return out;
  }

  function sum(a) {
    var t = 0;
    for (var i = 0; i < a.length; i++) t += a[i];
    return t;
  }

  /* Thin a dated series, keeping the dates in step and the holes as holes.
   * app.js's downsample() thins values alone, which is right for a sparkline
   * with no axis and wrong for anything with dates under it. */
  function thin(values, dates, max) {
    var v = [], d = [], i;
    for (i = 0; i < (values || []).length; i++) v.push(nn(values[i]));
    for (i = 0; i < (dates || []).length; i++) d.push(txt(dates[i]));
    var dated = d.length === v.length;
    if (v.length <= max) return { v: v, d: dated ? d : [], idx: null, dated: dated };
    var idx = [], step = (v.length - 1) / (max - 1);
    for (var j = 0; j < max; j++) idx.push(Math.round(j * step));
    idx[idx.length - 1] = v.length - 1;
    var ov = [], od = [];
    for (i = 0; i < idx.length; i++) {
      ov.push(v[idx[i]]);
      if (dated) od.push(d[idx[i]]);
    }
    return { v: ov, d: od, idx: idx, dated: dated };
  }

  /* The same index pick applied to a second series, so a stack cannot end up
   * drawn from rows that came from different bars. */
  function thinBy(values, pick) {
    var v = [], i;
    for (i = 0; i < (values || []).length; i++) v.push(nn(values[i]));
    if (!pick) return v;
    var out = [];
    for (i = 0; i < pick.length; i++) out.push(pick[i] < v.length ? v[pick[i]] : null);
    return out;
  }

  function shortDate(d) {
    var t = txt(d);
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

  /* Vertical grid with its own labels, for the two figures whose measured axis
   * runs left to right. */
  function xGrid(p, fmt, want) {
    var kids = [], ticks = niceTicks(p.xlo, p.xhi, want || 5);
    var base = p.h - p.b;
    for (var i = 0; i < ticks.length; i++) {
      var x = xOf(p, ticks[i]).toFixed(1);
      kids.push(s("line", { "class": ticks[i] === 0 ? "mc-zero" : "mc-grid",
                            x1: x, y1: p.t, x2: x, y2: base }));
      kids.push(s("text", { "class": "mc-tick", x: x, y: base + 14,
                            "text-anchor": "middle", text: fmt(ticks[i]) }));
    }
    return kids;
  }

  /* Ticks come in as [{v, label}] because these axes are dates and dates do not
   * interpolate. */
  function xAxis(p, ticks) {
    var y = p.h - p.b;
    var kids = [s("line", { "class": "mc-grid", x1: p.l, y1: y, x2: p.w - p.r, y2: y })];
    for (var i = 0; i < ticks.length; i++) {
      var x = xOf(p, ticks[i].v).toFixed(1);
      kids.push(s("line", { "class": "mc-grid", x1: x, y1: y, x2: x, y2: y + 4 }));
      kids.push(s("text", { "class": "mc-tick", x: x, y: y + 15,
                            "text-anchor": "middle", text: ticks[i].label }));
    }
    return kids;
  }

  function dateTicks(dates, n, want) {
    var out = [];
    if (!n) return out;
    var k = Math.max(2, Math.min(want || 6, n));
    for (var i = 0; i < k; i++) {
      var idx = Math.round(i * (n - 1) / (k - 1));
      out.push({ v: idx, label: dates.length === n ? shortDate(dates[idx]) : fx(idx, 0) });
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

  function chart(p, lab, kids, cls) {
    return s("svg", {
      "class": "mc " + (cls || ""), viewBox: "0 0 " + p.w + " " + p.h,
      preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": lab
    }, [s("title", { text: lab })].concat(kids));
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

  function seq(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }


  /* ---------------------------------------------------------- page furniture */

  function key(cls, text, shape) {
    return h("span", {}, [h("i", { "class": "k " + (shape || "k-line") + " " + cls }), text]);
  }

  function fig(head, node, legendKids, caption) {
    if (!node) return null;
    return h("figure", { "class": "mfig" }, [
      h("figcaption", { "class": "mfig-h" }, [
        h("b", { text: head }),
        caption ? h("span", { text: caption }) : null
      ]),
      node,
      legendKids && legendKids.length ? h("div", { "class": "m-legend" }, legendKids) : null
    ]);
  }

  function note(text) { return text ? h("p", { "class": "m-note", text: text }) : null; }

  function gone(text) { return h("p", { "class": "pf-gone", text: text }); }

  function head4(text) { return h("p", { "class": "m-h", text: text }); }

  function block(kids) {
    var real = [];
    for (var i = 0; i < kids.length; i++) if (kids[i]) real.push(kids[i]);
    return real.length ? h("div", { "class": "pf-block" }, real) : null;
  }

  function grid(cells) { return h("dl", { "class": "grid m-grid" }, cells); }

  /* Wide content scrolls inside its own box. The page never scrolls sideways. */
  function table(caption, headers, rows) {
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

  function td(text, cls) { return h("td", { "class": cls || "", text: text }); }

  function th(text) { return h("th", { scope: "row", text: text }); }

  function neg(v) { return isNum(nn(v)) && nn(v) < 0 ? "neg" : ""; }


  /* ------------------------------------------------------------ live region */

  /* ONE live region across renders. Replacing it with a fresh node is how an
   * aria-live update gets silently dropped: the announcement is triggered by
   * text changing inside a region the screen reader already knows about, not by
   * a region appearing with text in it. So it is detached, kept, re-attached,
   * and only then written to. */
  function liveNode(el) {
    for (var i = 0; i < el.children.length; i++) {
      if (el.children[i].getAttribute("data-pf-live") !== null) return el.children[i];
    }
    return null;
  }

  function stage(el, kids, spoken) {
    var ln = liveNode(el);
    if (ln && ln.parentNode) ln.parentNode.removeChild(ln);
    if (!ln) {
      ln = h("p", { "class": "pf-live", "data-pf-live": "1",
                    role: "status", "aria-live": "polite", "aria-atomic": "true" });
    }
    var real = [];
    for (var i = 0; i < kids.length; i++) if (kids[i]) real.push(kids[i]);
    fill(el, [heading(), ln].concat(real));
    /* The panel ships hidden and app.js unhides it. Doing it here too is
     * idempotent, and it removes a class of silent failure: a renderer that
     * filled a node nobody could see has, from the reader's side, done nothing
     * at all — and there would be no error to go looking for. */
    if (el.hasAttribute && el.hasAttribute("hidden")) el.removeAttribute("hidden");
    ln.textContent = txt(spoken);
    return el;
  }

  /* The panel's own heading. index.html declares the picker's heading and an
   * empty div for this; the question belongs to the answer, so it is written
   * when there is an answer to write it over. */
  function heading() {
    return h("div", { "class": "q-head" }, [
      h("h2", { id: "h-portfolio", text: "What is the whole book doing?" }),
      h("em", { text: "several assets, one calendar, one bill" })
    ]);
  }


  /* ==================================================================== 1 */
  /* THE VERDICT, AND THE BENCHMARK IT HAS TO CLEAR                          */

  /* Two blocks can carry a verdict here and they are not interchangeable.
   *
   * The job envelope's `verdict` is the DESK'S grading, {state, headline, body},
   * and it is authoritative. `simulate_portfolio` writes a verdict of its own —
   * headline, `edge_established`, `beats_equal_weight`, `beats_buy_and_hold` and
   * a list of notes — and the wire format moves that to `model_verdict` on the
   * way out so the two cannot collide. A payload that was never wrapped (a
   * to_dict() read straight back off disk) carries the engine's block under
   * `verdict` instead, and that shape reaches this function too.
   *
   * So: whichever block carries the benchmark flags is the engine's, and
   * whichever carries {state, headline, body} is the desk's. The desk's state
   * wins where it exists — recomputing a weaker rule client-side is a defect
   * this codebase has already fixed twice — and a state is derived from the
   * engine's own booleans only when the desk sent no grading at all. */
  function readVerdict(p) {
    var top = obj(p.verdict), mv = obj(p.model_verdict);
    var engineish = function (o) {
      return o.edge_established !== undefined || o.beats_equal_weight !== undefined ||
             o.beats_buy_and_hold !== undefined || Array.isArray(o.notes);
    };
    var eng = engineish(mv) ? mv : (engineish(top) ? top : {});
    var desk = (top !== eng && (txt(top.state) || txt(top.body) || txt(top.headline))) ? top : null;
    return { eng: eng, desk: desk };
  }

  /* The tone, from the server's own words and booleans and from nothing else.
   * `beats_equal_weight === false` is the loudest outcome this panel can
   * report — losing to the naive book is the single most common result in
   * portfolio construction and the one an allocation panel is most tempted to
   * bury — so where the desk sent no state of its own, that flag sets it. */
  function verdictTone(v, sameAsEqual) {
    if (v.desk && txt(v.desk.state)) return txt(v.desk.state);
    if (v.eng.beats_equal_weight === false && !sameAsEqual) return "fault";
    if (v.eng.edge_established === true) return "signal";
    return "doubt";
  }

  function verdictHeadline(v) {
    return txt(v.desk && v.desk.headline) || txt(v.eng.headline) ||
           "The desk returned no headline for this run.";
  }

  function verdictBlock(v, tone) {
    var notes = arr(v.eng.notes).map(function (t) {
      return h("li", { text: txt(t) });
    });
    var body = v.desk ? txt(v.desk.body) : "";
    return h("div", {}, [
      h("p", { "class": "verdict " + tone, text: verdictHeadline(v) }),
      body ? h("p", { "class": "verdict-sub", text: body }) : null,
      notes.length ? h("ul", { "class": "pf-notes" }, notes) : null
    ]);
  }

  /* Is this benchmark the book itself? equal_weight measured against an
   * equal_weight run is a comparison with its own reflection, and shouting
   * "loses to equal weight" at it would be this file inventing a finding out of
   * a tie. The payload names each benchmark's allocation and rebalance, so the
   * question is answered from the data rather than assumed. */
  function isSelf(payload, bench) {
    return txt(payload.allocation) === txt(bench.allocation) &&
           txt(payload.rebalance) === txt(bench.rebalance);
  }

  /* Did the server's own flag compare this book with itself?
   *
   * When the benchmark block is present the two allocations are read off it.
   * When it is absent the flag still arrived and still has to be honoured, and
   * the only thing left to compare is the name of the allocation that was run:
   * an equal_weight book "losing" to equal weight is a tie with its reflection,
   * anything else is a real loss the panel must not soften. */
  function selfCompare(payload, benches, key) {
    var b = benches[key];
    if (b) return isSelf(payload, obj(b));
    return txt(payload.allocation) === key;
  }

  /* The comparison the panel exists to make impossible to miss. */
  function benchCallout(payload, v, benches) {
    var lines = [];
    var ew = benches.equal_weight, bh = benches.buy_and_hold;

    // The flag without the block: the gap cannot be quoted, and the finding is
    // still the server's. Saying it without numbers beats not saying it.
    if (!ew && v.eng.beats_equal_weight === false && !selfCompare(payload, benches, "equal_weight")) {
      lines.push("LOSES TO EQUAL WEIGHT. The desk reports that the same names held in equal " +
        "weight, on the same data, did better than this allocation. This run came back " +
        "without the benchmark block, so the size of the gap cannot be quoted here.");
    }
    if (ew && v.eng.beats_equal_weight === false && !isSelf(payload, ew)) {
      lines.push("LOSES TO EQUAL WEIGHT. " + label(payload.allocation) +
        " returned a net Sharpe of " + fx(nn(payload.net && payload.net.sharpe), 2, true) +
        " against equal weight's " + fx(nn(ew.net && ew.net.sharpe), 2, true) +
        " on the identical price panel, through the identical engine, on the identical " +
        "cost schedules — a gap of " + fx(nn(ew.delta_sharpe_net), 2, true) + " Sharpe and " +
        fpct(nn(ew.delta_cagr_net), 2, true) + " a year. The naive book won.");
    }
    if (bh && v.eng.beats_buy_and_hold === false && !isSelf(payload, bh)) {
      lines.push("Buy-and-hold of the same names, bought once and never touched, " +
        "returned a net Sharpe of " + fx(nn(bh.net && bh.net.sharpe), 2, true) +
        " against this book's " + fx(nn(payload.net && payload.net.sharpe), 2, true) +
        ". The rebalancing was paid for and did not pay back.");
    }
    if (!lines.length) return null;
    return h("div", { "class": "disagree bad" }, [
      lines.map(function (t, i) {
        return h("p", { "class": i ? "pf-callout-more" : "", text: t });
      })
    ]);
  }


  /* ==================================================================== 2 */
  /* WHAT IT RETURNED, AND WHAT THAT COST                                    */

  function statCells(p) {
    var net = obj(p.net), gross = obj(p.gross), cal = obj(p.calendar);
    var effN = nn(p.effective_n), nSym = arr(p.symbols).length;
    var inv = nn(p.invested_fraction);
    var dr = nn(p.diversification_ratio);

    return grid([
      cell("Net CAGR", fpct(nn(net.cagr), 2, true), neg(net.cagr), "after every cost charged"),
      cell("Net Sharpe", fx(nn(net.sharpe), 2, true), neg(net.sharpe), "the only one that counts"),
      cell("Max drawdown", fpct(nn(net.max_drawdown), 2), "neg",
           count(net.max_dd_duration) + " bars underwater"),
      cell("Annual vol", fpct(nn(net.ann_vol), 2), "", "of the book, net"),
      cell("Diversification ratio", fx(dr, 2), "",
           isNum(dr) ? "weighted average vol over book vol — 1.00 is no diversification at all"
                     : "not computable on this sample"),
      cell("Effective N", isNum(effN) ? fx(effN, 2) + " of " + nSym : DASH, "",
           "inverse Herfindahl of the normalised mean weights"),
      cell("Invested", isNum(inv) ? fpct(inv, 1) : DASH, isNum(inv) && inv < 0.999 ? "amber" : "",
           isNum(inv) && inv < 0.999 ? "the rest sat in cash earning nothing"
                                     : "of the book, on average"),
      cell("Rebalances", count(p.rebalances), "", label(p.rebalance) + " policy"),
      cell("Turnover", isNum(nn(p.turnover)) ? fx(nn(p.turnover), 2) + "x" : DASH, "",
           "of the book, traded per year"),
      cell("Cost paid", fpct(nn(p.cost_total), 2), "amber", "total, over the whole sample"),
      cell("Cost drag", fpct(nn(p.cost_drag), 2), "amber", "gross CAGR minus net CAGR"),
      cell("Gross Sharpe", fx(nn(gross.sharpe), 2, true), neg(gross.sharpe),
           "before costs — never the number to quote"),
      cell("Bars", count(cal.n_bars), "",
           txt(cal.start, DASH) + " to " + txt(cal.end, DASH))
    ]);
  }


  /* ==================================================================== 3 */
  /* THE EQUITY PATH, AGAINST WHAT IT HAD TO BEAT                            */

  /* The book's own curve, with each benchmark drawn where it FINISHED.
   *
   * `_benchmark_payload` carries `equity_end` and a full metric block but no
   * series, so there is no benchmark path to draw and none is invented. A
   * marker at the last bar is exactly the claim the payload supports; a line
   * across the frame would be a claim about every date in between. If a future
   * payload ships `equity_curve` on a benchmark it is drawn as a line, dimmed,
   * and the caption changes with it. */
  function equityFig(p, benches) {
    var t = thin(arr(p.equity_curve), arr(p.dates), MAX_DRAW);
    if (finite(t.v).length < 2) {
      return gone("No equity path came back with this run, so none is drawn. " +
                  "The metrics above were computed from the series the engine kept.");
    }
    var marks = [];
    var pts = t.v.slice();
    var bnames = ["equal_weight", "buy_and_hold"];
    var bcls = { equal_weight: "st-blu", buy_and_hold: "st-vio" };
    var curves = {};
    for (var i = 0; i < bnames.length; i++) {
      var b = benches[bnames[i]];
      if (!b) continue;
      // Position-matched or not drawn. A benchmark series of another length
      // thinned by this one's indices would draw a path stretched across the
      // wrong bars, which is worse than the endpoint alone.
      var own_curve = arr(b.equity_curve);
      if (own_curve.length > 2 && own_curve.length === arr(p.equity_curve).length) {
        curves[bnames[i]] = thinBy(own_curve, t.idx);
        pts = pts.concat(finite(curves[bnames[i]]));
      }
      var end = nn(b.equity_end);
      if (isNum(end)) { marks.push({ k: bnames[i], v: end }); pts.push(end); }
    }

    var plot = P(W, 246, { l: 64, r: 132, b: 42 });
    plot.xlo = 0; plot.xhi = Math.max(1, t.v.length - 1);
    if (!setY(plot, pts, 0.10)) {
      return gone("The equity path carried no finite values, so nothing could be scaled.");
    }

    var fin = finite(t.v);
    var up = fin[fin.length - 1] >= fin[0];
    var kids = yAxis(plot, fmtNum(2), 4)
      .concat(xAxis(plot, dateTicks(t.d, t.v.length, 6)));

    // A benchmark's own path, when one is present, sits UNDER the book's line.
    for (i = 0; i < bnames.length; i++) {
      if (curves[bnames[i]]) {
        kids = kids.concat(lines(plot, seq(t.v.length), curves[bnames[i]],
                                 bcls[bnames[i]] + " dim"));
      }
    }
    kids = kids.concat(lines(plot, seq(t.v.length), t.v, up ? "st-sig" : "st-flt"));

    // Each benchmark's endpoint: a short leader, a dot, and its value in words.
    var xEnd = xOf(plot, plot.xhi);
    for (i = 0; i < marks.length; i++) {
      var y = yOf(plot, marks[i].v);
      var cls = bcls[marks[i].k] || "st-chk";
      kids.push(s("line", { "class": "mc-rule dash " + cls,
                            x1: (xEnd - 46).toFixed(1), y1: y.toFixed(1),
                            x2: xEnd.toFixed(1), y2: y.toFixed(1) }));
      kids.push(s("circle", { "class": "mk-port " + cls.replace("st-", "fl-"),
                              cx: xEnd.toFixed(1), cy: y.toFixed(1), r: 3.4 }));
      kids.push(s("text", { "class": "mc-annot", x: (xEnd + 7).toFixed(1),
                            y: (y + 3.5).toFixed(1), "text-anchor": "start",
                            text: label(marks[i].k) + " " + fx(marks[i].v, 2) }));
    }
    var last = fin[fin.length - 1];
    var yl = yOf(plot, last);
    kids.push(s("text", { "class": "mc-annot pf-annot-strong", x: (xEnd + 7).toFixed(1),
                          y: (yl + 3.5).toFixed(1), "text-anchor": "start",
                          text: "this book " + fx(last, 2) }));
    kids = kids.concat(axisTitles(plot, null, "equity, 1.00 at the first bar"));

    var legend = [key(up ? "st-sig" : "st-flt", "this book, net of costs")];
    for (i = 0; i < marks.length; i++) {
      legend.push(key((bcls[marks[i].k] || "st-chk").replace("st-", "fl-"),
                      label(marks[i].k) + (curves[marks[i].k] ? "" : ", where it finished"), "k-dot"));
    }
    if (t.idx) legend.push(h("span", { text: t.v.length + " of " + arr(p.equity_curve).length + " bars drawn" }));

    // The caption describes what was actually drawn, which is not always the
    // same thing twice: paths when the payload carries them, endpoints when it
    // carries only those, and neither when it carries no benchmark at all.
    var drawnPaths = 0;
    for (i = 0; i < bnames.length; i++) if (curves[bnames[i]]) drawnPaths++;
    var caption;
    if (!marks.length && !drawnPaths) {
      caption = "this run came back without a benchmark block, so there is nothing here to " +
                "compare the path against";
    } else if (drawnPaths) {
      caption = "the benchmarks ran on the identical aligned panel, through the identical " +
                "engine, on the identical per-class cost schedules";
    } else {
      caption = "both benchmarks ran on the identical aligned panel, through the identical " +
                "engine, on the identical per-class cost schedules — the payload carries their " +
                "endpoints and metrics, not their paths, so they are drawn where they finished";
    }

    return fig("The book against its own benchmarks",
               chart(plot, "net equity of the portfolio against the equal-weight and " +
                           "buy-and-hold books run on the same data", kids),
               legend, caption);
  }

  function benchTable(p, benches) {
    var rows = [];
    var mine = obj(p.net);
    rows.push(h("tr", { "class": "pf-mine" }, [
      th(label(p.allocation) + " · " + label(p.rebalance)),
      td("this book", "t-name"),
      td(fpct(nn(mine.cagr), 2, true), neg(mine.cagr)),
      td(fx(nn(mine.sharpe), 2, true), neg(mine.sharpe)),
      td(fpct(nn(mine.max_drawdown), 2)),
      td(isNum(nn(p.turnover)) ? fx(nn(p.turnover), 2) + "x" : DASH),
      td(fpct(nn(p.cost_total), 2)),
      td(DASH), td(DASH)
    ]));
    ["equal_weight", "buy_and_hold"].forEach(function (k) {
      var b = benches[k];
      if (!b) return;
      var n = obj(b.net);
      var ds = nn(b.delta_sharpe_net), dc = nn(b.delta_cagr_net);
      rows.push(h("tr", {}, [
        th(label(b.allocation || k) + " · " + label(b.rebalance)),
        td(isSelf(p, b) ? "this book, again" : "benchmark", "t-name"),
        td(fpct(nn(n.cagr), 2, true), neg(n.cagr)),
        td(fx(nn(n.sharpe), 2, true), neg(n.sharpe)),
        td(fpct(nn(n.max_drawdown), 2)),
        td(isNum(nn(b.turnover)) ? fx(nn(b.turnover), 2) + "x" : DASH),
        td(fpct(nn(b.cost_total), 2)),
        td(fx(ds, 2, true), isNum(ds) ? (ds >= 0 ? "t-sig" : "t-dbt") : ""),
        td(fpct(dc, 2, true), isNum(dc) ? (dc >= 0 ? "t-sig" : "t-dbt") : "")
      ]));
    });
    return table("This book and the two benchmarks the engine ran beside it",
                 ["allocation", "what it is", "net CAGR", "net Sharpe", "max DD",
                  "turnover", "cost", "Δ Sharpe", "Δ CAGR"],
                 rows);
  }


  /* ==================================================================== 4 */
  /* THE HERO — WEIGHT AGAINST SHARE OF RISK                                 */

  /* Two bars per holding: the share of the money, and the share of the risk.
   *
   * Both are shares, of their own totals, so they are comparable: the money
   * share is of the INVESTED book (`weight_mean` divided by their sum, which is
   * `invested_fraction`), and the risk share is `contribution_risk_pct`, which
   * arrives as a FRACTION summing to about 1.0 and is multiplied by 100 exactly
   * once, here. Rows are sorted by the multiple between the two, so the name
   * carrying the most risk per unit of money is the first thing read. */
  function heroRows(p) {
    var rows = arr(p.per_asset).map(function (a) {
      var w = nn(a.weight_mean);
      var r = nn(a.contribution_risk_pct);
      return {
        symbol: txt(a.symbol, DASH),
        cls: txt(a.asset_class),
        w: w, r: r,
        money: null, risk: isNum(r) ? r * 100 : null,
        ratio: null
      };
    });
    var tot = sum(rows.map(function (x) { return isNum(x.w) ? x.w : 0; }));
    for (var i = 0; i < rows.length; i++) {
      if (isNum(rows[i].w) && tot > 1e-12) rows[i].money = rows[i].w / tot * 100;
      if (isNum(rows[i].money) && isNum(rows[i].risk) && Math.abs(rows[i].money) > 1e-9) {
        rows[i].ratio = rows[i].risk / rows[i].money;
      }
    }
    rows.sort(function (a, b) {
      var x = isNum(a.ratio) ? a.ratio : -Infinity;
      var y = isNum(b.ratio) ? b.ratio : -Infinity;
      return y - x;
    });
    return rows;
  }

  function heroFig(p) {
    var rows = heroRows(p);
    if (!rows.length) return null;
    var vals = [];
    for (var i = 0; i < rows.length; i++) {
      if (isNum(rows[i].money)) vals.push(rows[i].money);
      if (isNum(rows[i].risk)) vals.push(rows[i].risk);
    }
    if (!vals.length) {
      return gone("The payload carried no weights and no risk shares, so the comparison " +
                  "this panel exists for cannot be drawn.");
    }
    var rowH = 42;
    var plot = P(W, 34 + rows.length * rowH + 34, { l: 168, r: 84, t: 26, b: 34 });
    var d = domain(vals.concat([0]), 0.06, true);
    plot.xlo = Math.min(0, d[0]); plot.xhi = d[1];

    var kids = xGrid(plot, fmtNum(0), 5);
    var barH = 13, gap = 4;
    kids.push(s("text", { "class": "mc-axis-t", x: plot.w - 6, y: plot.t + 2,
                          "text-anchor": "end", text: "risk ÷ money" }));
    kids.push(s("line", { "class": "mc-zero", x1: xOf(plot, 0).toFixed(1), y1: plot.t,
                          x2: xOf(plot, 0).toFixed(1), y2: (plot.h - plot.b).toFixed(1) }));

    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var top = plot.t + 8 + i * rowH;
      kids.push(s("text", { "class": "mc-tick mc-rowlab", x: plot.l - 12, y: top + 11,
                            "text-anchor": "end", text: row.symbol }));
      kids.push(s("text", { "class": "mc-tick pf-class-t", x: plot.l - 12, y: top + 25,
                            "text-anchor": "end", text: row.cls }));

      var pair = [["money", row.money, "fl-blu"], ["risk", row.risk, "fl-vio"]];
      for (var j = 0; j < pair.length; j++) {
        var v = pair[j][1];
        if (!isNum(v)) continue;
        var x = xOf(plot, Math.min(0, v)), x2 = xOf(plot, Math.max(0, v));
        var y = top + j * (barH + gap);
        kids.push(s("rect", {
          "class": "mc-bar pf-bar " + pair[j][2], x: x.toFixed(1), y: y.toFixed(1),
          width: Math.max(0.8, x2 - x).toFixed(1), height: barH, rx: 1
        }, [s("title", { text: row.symbol + " — " + pair[j][0] + " share " + fx(v, 1) + "%" })]));
        kids.push(s("text", { "class": "mc-annot", x: (x2 + 5).toFixed(1),
                              y: (y + barH - 3).toFixed(1), "text-anchor": "start",
                              text: fx(v, 1) + "%" }));
      }
      if (isNum(row.ratio)) {
        kids.push(s("text", {
          "class": "mc-annot pf-ratio", x: plot.w - 6, y: top + 19, "text-anchor": "end",
          text: fx(row.ratio, 2) + "x"
        }, [s("title", { text: row.symbol + " carries " + fx(row.ratio, 2) +
                               " times its share of the money in share of the risk" })]));
      }
      kids.push(s("line", { "class": "mc-grid", x1: plot.l, y1: (top + rowH - 8).toFixed(1),
                            x2: plot.w - plot.r, y2: (top + rowH - 8).toFixed(1) }));
    }
    kids = kids.concat(axisTitles(plot, "share, per cent", null));

    var worst = rows[0];
    var caption = "money is each holding's share of the INVESTED book, risk is its share of " +
      "the book's risk — sorted by the multiple between them" +
      (isNum(worst.ratio)
        ? ": " + worst.symbol + " is " + fx(worst.money, 1) + "% of the money and " +
          fx(worst.risk, 1) + "% of the risk"
        : "; the multiple could not be formed on this sample");

    return fig("Weight against share of risk",
               chart(plot, "each holding's share of the invested money beside its share of " +
                           "the portfolio's risk", kids, "mc-hero"),
               [key("fl-blu", "share of the invested money", "k-box"),
                key("fl-vio", "share of the risk", "k-box"),
                h("span", { text: "the figure at the right of each row is risk share ÷ money share" })],
               caption);
  }

  function perAssetTable(p) {
    var rows = arr(p.per_asset).map(function (a) {
      var rp = nn(a.contribution_risk_pct);
      return h("tr", {}, [
        th(txt(a.symbol, DASH)),
        td(txt(a.asset_class, DASH), "t-name"),
        td(fpct(nn(a.weight_mean), 1)),
        td(fpct(nn(a.weight_end), 1)),
        td(isNum(rp) ? fpct(rp, 1) : DASH),
        td(fpct(nn(a.ann_vol), 1)),
        td(fx(nn(a.marginal_risk), 3)),
        td(fpct(nn(a.contribution_return), 2, true), neg(a.contribution_return)),
        td(fx(nn(a.corr_to_portfolio), 2)),
        td(fpct(nn(a.cost_paid), 3))
      ]);
    });
    return table("Every holding: what it weighed, what it risked, what it earned and what it cost",
                 ["symbol", "class", "mean weight", "end weight", "share of risk", "own vol",
                  "marginal risk", "return contribution", "corr to book", "cost paid"],
                 rows);
  }


  /* ==================================================================== 5 */
  /* THE WEIGHTS OVER TIME                                                   */

  /* A stacked area, so a rebalance is a vertical edge and drift is a slope.
   *
   * The stack BREAKS wherever any holding's weight is absent at that bar: a
   * band closed across a hole is the same lie as a line bridged across one, and
   * worse here, because the reader would read the neighbouring bands as if they
   * still summed to the book. Anything the weights do not account for is drawn
   * as cash, explicitly, because a book that is 80% invested is a fact and not
   * a rounding error. */
  function weightsFig(p) {
    var syms = arr(p.symbols).map(function (x) { return txt(x); });
    var wot = obj(p.weights_over_time);
    if (!syms.length) return null;

    var t = thin(arr(wot[syms[0]]), arr(p.dates), MAX_DRAW);
    var series = [];
    for (var i = 0; i < syms.length; i++) {
      var v = i === 0 ? t.v : thinBy(arr(wot[syms[i]]), t.idx);
      if (!v.length) return null;
      series.push({ name: syms[i], v: v, cls: SERIES[i % SERIES.length] });
    }
    var n = t.v.length;
    if (n < 2) return null;

    // Cash, if any bar has some. Absent weights make the cash at that bar
    // unknown, not zero — the whole stack breaks there anyway.
    var cash = [], anyCash = false, totals = [];
    for (var k = 0; k < n; k++) {
      var tot = 0, ok = true;
      for (i = 0; i < series.length; i++) {
        if (!isNum(series[i].v[k])) { ok = false; break; }
        tot += series[i].v[k];
      }
      totals.push(ok ? tot : null);
      var c = ok ? 1 - tot : null;
      if (isNum(c) && c > 0.001) anyCash = true;
      cash.push(isNum(c) && c > 0 ? c : (ok ? 0 : null));
    }
    if (anyCash) series.push({ name: "cash", v: cash, cls: "pf-cash" });

    var plot = P(W, 236, { l: 58, r: 26, b: 42 });
    plot.xlo = 0; plot.xhi = n - 1;
    plot.ylo = 0;
    var topMax = 1;
    for (k = 0; k < n; k++) if (isNum(totals[k])) topMax = Math.max(topMax, totals[k]);
    plot.yhi = topMax * 1.02;

    var kids = yAxis(plot, fmtPct(0), 4).concat(xAxis(plot, dateTicks(t.d, n, 6)));

    // One polygon per contiguous run per band, drawn bottom up.
    var base = [];
    for (k = 0; k < n; k++) base.push(0);
    for (i = 0; i < series.length; i++) {
      var lo = base.slice(), hi = [], run = [], polys = [];
      for (k = 0; k < n; k++) {
        var val = series[i].v[k];
        hi.push(isNum(val) && isNum(lo[k]) ? lo[k] + val : null);
      }
      var flush = function (poly) {
        if (poly.length < 2) return;
        var topPts = [], botPts = [];
        for (var q = 0; q < poly.length; q++) {
          topPts.push(xOf(plot, poly[q].x).toFixed(1) + "," + yOf(plot, poly[q].hi).toFixed(1));
          botPts.unshift(xOf(plot, poly[q].x).toFixed(1) + "," + yOf(plot, poly[q].lo).toFixed(1));
        }
        polys.push(s("polygon", { "class": "pf-area " + series[i].cls,
                                  points: topPts.concat(botPts).join(" ") },
                     [s("title", { text: series[i].name + ", weight over time" })]));
      };
      for (k = 0; k < n; k++) {
        if (isNum(lo[k]) && isNum(hi[k])) run.push({ x: k, lo: lo[k], hi: hi[k] });
        else { flush(run); run = []; }
      }
      flush(run);
      kids = kids.concat(polys);
      base = hi;
    }
    kids = kids.concat(axisTitles(plot, null, "weight of the book"));

    var legend = series.map(function (se) { return key(se.cls, se.name, "k-box"); });
    var holes = 0;
    for (k = 0; k < n; k++) if (!isNum(totals[k])) holes++;
    if (holes) legend.push(h("span", { text: holes + " bar(s) with a weight the engine could " +
                                             "not report — the stack breaks there" }));

    return fig("What the book held, bar by bar",
               chart(plot, "each holding's weight over time, stacked", kids),
               legend,
               "a rebalance is a vertical edge; the slopes between them are drift, which is " +
               "the arithmetic of owning something and doing nothing");
  }


  /* ==================================================================== 6 */
  /* WHAT THE NAMES DO TOGETHER                                              */

  /* Colour here is the SIGN, opacity is the magnitude, and neither is a
   * verdict. The desk's semantic three would have made +0.90 green, and a
   * correlation of +0.90 between two holdings is the opposite of good news on a
   * panel about diversification — so this heat grid uses the two hues that mean
   * nothing, and every cell carries its own number anyway. */
  function corrFig(p) {
    var c = obj(p.correlation);
    var syms = arr(c.symbols).map(function (x) { return txt(x); });
    var m = arr(c.matrix);
    if (syms.length < 2 || !m.length) return null;

    var cw = syms.length > 8 ? 58 : (syms.length > 5 ? 70 : 84);
    var ch = 26, lw = 104;
    var plot = P(lw + syms.length * cw + 8, 24 + syms.length * ch + 8,
                 { l: lw, r: 8, t: 24, b: 8 });
    var kids = [];

    for (var j = 0; j < syms.length; j++) {
      kids.push(s("text", { "class": "mc-tick", x: lw + j * cw + cw / 2, y: 15,
                            "text-anchor": "middle", text: syms[j] }));
    }
    for (var i = 0; i < syms.length; i++) {
      var y = 24 + i * ch;
      kids.push(s("text", { "class": "mc-tick mc-rowlab", x: lw - 8, y: y + ch / 2,
                            "text-anchor": "end", "dominant-baseline": "middle",
                            text: syms[i] }));
      for (j = 0; j < syms.length; j++) {
        var v = nn(arr(m[i])[j]);
        var x = lw + j * cw;
        var mag = isNum(v) ? Math.min(1, Math.abs(v)) : 0;
        kids.push(s("rect", {
          "class": "mc-cell " + (!isNum(v) ? "fl-none" : v >= 0 ? "fl-blu" : "fl-vio"),
          x: x + 1, y: y + 1, width: cw - 2, height: ch - 2, rx: 1,
          "fill-opacity": isNum(v) ? (0.08 + 0.60 * mag).toFixed(3) : 0.04
        }, [s("title", { text: syms[i] + " with " + syms[j] + ": " + fx(v, 2) })]));
        kids.push(s("text", { "class": "mc-cellv", x: x + cw / 2, y: y + ch / 2,
                              "text-anchor": "middle", "dominant-baseline": "middle",
                              text: fx(v, 2) }));
      }
    }
    return fig("How the holdings move together",
               chart(plot, "correlation between every pair of holdings on the aligned panel",
                     kids, "mc-heat"),
               [key("fl-blu", "positive", "k-box"), key("fl-vio", "negative", "k-box"),
                h("span", { text: "opacity is the magnitude; every cell carries its number" })],
               txt(c.method, "pearson on aligned simple returns") +
                 (isNum(nn(c.n_bars)) ? " · " + count(c.n_bars) + " bars" : ""));
  }


  /* ==================================================================== 7 */
  /* WHAT THE SHARED CALENDAR COST                                           */

  /* Mixing asset classes is not free. Crypto prints on Sunday and the equity
   * market does not, so one of two things has to happen to every bar that only
   * some symbols have: it is dropped, or it is fabricated by carrying the last
   * price forward. The payload counts both, per symbol, and this block prints
   * the count rather than the reassurance. */
  function calendarBlock(p) {
    var c = obj(p.calendar);
    var rows = arr(c.per_symbol).map(function (r) {
      var dropped = nn(r.bars_dropped), fab = nn(r.bars_fabricated);
      return h("tr", {}, [
        th(txt(r.symbol, DASH)),
        td(count(r.own_bars)),
        td(count(r.bars_used)),
        td(count(r.bars_dropped), isNum(dropped) && dropped > 0 ? "t-dbt" : ""),
        td(count(r.bars_fabricated), isNum(fab) && fab > 0 ? "t-dbt" : ""),
        td(fpct(nn(r.dropped_pct), 1)),
        td(txt(r.first, DASH), "t-name"),
        td(txt(r.last, DASH), "t-name")
      ]);
    });
    var fab = nn(c.fabricated_bars);
    return block([
      head4("What the shared calendar cost"),
      grid([
        cell("Calendar", label(c.method), "", "how bars that not every symbol had were handled"),
        cell("Bars used", count(c.n_bars), "", txt(c.start, DASH) + " to " + txt(c.end, DASH)),
        cell("Bars dropped", count(c.dropped_bars),
             isNum(nn(c.dropped_bars)) && nn(c.dropped_bars) > 0 ? "amber" : "",
             "history thrown away to make one index"),
        cell("Bars fabricated", count(c.fabricated_bars),
             isNum(fab) && fab > 0 ? "amber" : "",
             isNum(fab) && fab > 0 ? "invented zero-return bars — they flatter diversification"
                                   : "no price was invented"),
        cell("Bars per year", fx(nn(c.periods_per_year), 1), "",
             "measured from the spacing, not assumed")
      ]),
      note(txt(c.calendar_note)),
      table("Every symbol's own history, and what the shared index did to it",
            ["symbol", "own bars", "used", "dropped", "fabricated", "dropped %",
             "first", "last"], rows),
      warnList(arr(c.warnings), "the calendar")
    ]);
  }


  /* ==================================================================== 8 */
  /* THE AUDITS — REPORTED, NEVER RE-GRADED                                  */

  function auditBlock(p) {
    var a = obj(p.sharpe_audit);
    if (!arr(Object.keys(a)).length) return null;
    var psr = nn(a.psr), trlY = nn(a.min_track_record_years);
    var dsr = nn(a.deflated_sharpe);
    var exceeds = a.sharpe_exceeds_benchmark;

    return block([
      head4("Is that Sharpe a claim?"),
      grid([
        cell("Sharpe, annual", fx(nn(a.sharpe_annual), 2, true), neg(a.sharpe_annual),
             "naive sqrt-of-time annualisation"),
        cell("Lo-adjusted", fx(nn(a.sharpe_annual_lo), 2, true), neg(a.sharpe_annual_lo),
             isNum(nn(a.lo_inflation))
               ? "autocorrelation-corrected — the naive figure flatters by " +
                 fx(nn(a.lo_inflation), 2) + "x"
               : "autocorrelation-corrected"),
        cell("PSR", isNum(psr) ? fx(psr, 3) : DASH,
             isNum(psr) ? (psr >= 0.95 ? "pos" : "amber") : "",
             "probability the true Sharpe clears " + fx(nn(a.benchmark_sr_annual), 2)),
        cell("Min track record", isNum(trlY) ? fx(trlY, 1) + " yr" : DASH,
             isNum(trlY) ? "amber" : "",
             exceeds === false
               ? "the benchmark is not beaten, so no length would settle it"
               : "of history needed before this Sharpe is a claim"),
        cell("Deflated Sharpe", isNum(dsr) ? fx(dsr, 3) : DASH,
             isNum(dsr) ? (dsr >= 0.95 ? "pos" : "amber") : "",
             "probability it survives " + plural(a.n_trials, "trial")),
        cell("Skew / kurtosis", fx(nn(a.skew), 2, true) + " / " + fx(nn(a.kurtosis), 2), "",
             "non-excess kurtosis: 3.00 is normal"),
        cell("Bars", count(a.n_obs), "", txt(a.start, DASH) + " to " + txt(a.end, DASH)),
        cell("Financing", fpct(nn(a.rf_annual), 2), "", "annual rate charged before the Sharpe")
      ]),
      note(txt(a.n_trials_note))
    ]);
  }

  function drawdownBlock(p) {
    var d = obj(p.drawdown_profile);
    if (txt(d.error)) {
      return block([head4("How far down, and for how long"),
                    gone("The drawdown profile could not be computed: " + txt(d.error))]);
    }
    if (!arr(Object.keys(d)).length) return null;
    var tuw = obj(d.time_under_water), sp = obj(d.surprise);
    var rows = arr(d.recovery).slice(0, 6).map(function (r) {
      return h("tr", {}, [
        th(fpct(nn(r.depth), 2)),
        td(txt(r.start, DASH), "t-name"),
        td(txt(r.trough, DASH), "t-name"),
        td(txt(r.end, DASH) || "still under water", "t-name"),
        td(count(r.bars_under_water)),
        td(count(r.bars_to_recover))
      ]);
    });
    var surprising = sp.surprising === true;
    var line = null;
    if (isNum(nn(sp.observed)) && isNum(nn(sp.expected))) {
      line = "The worst drawdown was " + fpct(nn(sp.observed), 2) + " against the " +
        fpct(nn(sp.expected), 2) + " a book of this drift and this volatility would be " +
        "expected to see over this many bars" +
        (isNum(nn(sp.percentile)) ? " — the " + fpct(nn(sp.percentile), 0) +
          " percentile of " + plural(sp.n_paths, "simulated path") : "") + ". " +
        (surprising ? "That is deeper than the model expects: something happened here that " +
                      "the volatility alone does not explain."
                    : "That is the ordinary depth for a book like this. A drawdown being " +
                      "unsurprising is not the same as it being survivable.");
    }

    return block([
      head4("How far down, and for how long"),
      grid([
        cell("Max drawdown", fpct(nn(d.max_drawdown), 2), "neg", "peak to trough, net"),
        cell("CDaR", fpct(nn(d.cdar), 2), "neg",
             isNum(nn(d.cdar_q)) ? "mean of the worst " + fpct(1 - nn(d.cdar_q), 0) + " of drawdowns"
                                 : "mean of the deepest tail of drawdowns"),
        cell("Ulcer index", fx(nn(d.ulcer_index), 4), "", "depth and duration in one number"),
        cell("Martin ratio", fx(nn(d.martin_ratio), 2), "", "CAGR over the ulcer index"),
        cell("Under water", fpct(nn(tuw.fraction), 1), "amber",
             "of all bars, below a previous high"),
        cell("Longest spell", count(tuw.longest_bars) + " bars", "",
             txt(tuw.longest_start, DASH) + " to " + txt(tuw.longest_end, DASH)),
        cell("Episodes", count(tuw.n_episodes), "", "separate spells under water")
      ]),
      line ? h("p", { "class": surprising ? "m-lesson-read" : "m-note", text: line }) : null,
      table("The deepest drawdowns, and what each one took to recover",
            ["depth", "started", "trough", "recovered", "bars under", "bars to recover"], rows)
    ]);
  }

  function propBlock(p) {
    var pr = obj(p.prop_report);
    if (txt(pr.error)) {
      return block([head4("Would a funded account have survived it?"),
                    gone("The prop report could not be computed: " + txt(pr.error))]);
    }
    if (!arr(Object.keys(pr)).length) return null;
    var alive = pr.alive === true;
    var dead = pr.alive === false;
    var lim = obj(pr.limits);

    return block([
      head4("Would a funded account have survived it?"),
      h("div", { "class": "kill" }, [
        h("span", { "class": "k-state " + (alive ? "armed" : dead ? "tripped" : ""),
                    text: alive ? "account alive" : dead ? "account closed" : "unstated" }),
        h("span", { "class": "k-why",
                    text: dead ? (label(pr.killed_by) + " on " + txt(pr.killed_on, DASH))
                               : "against the desk's own prop limits" })
      ]),
      txt(pr.verdict) ? h("p", { "class": "verdict-sub", text: txt(pr.verdict) }) : null,
      grid([
        cell("Days survived", count(pr.days_survived), dead ? "amber" : "",
             "of " + count(pr.n_days) + " in the sample"),
        cell("Return forfeited", fpct(nn(pr.return_forfeited), 1), dead ? "neg" : "",
             dead ? "made after the account was already closed" : "nothing was forfeited"),
        cell("Daily breaches", count(pr.n_daily_breaches),
             isNum(nn(pr.n_daily_breaches)) && nn(pr.n_daily_breaches) > 0 ? "neg" : "",
             "days through the " + fpct(nn(lim.daily_loss_limit), 1) + " daily limit"),
        cell("Total drawdown limit", fpct(nn(lim.max_total_drawdown), 1), "",
             "the cumulative stop this run was measured against"),
        cell("Mean scale", fx(nn(pr.mean_scale), 2), "",
             "average size the de-risking ladder allowed"),
        cell("Days de-risked", fpct(nn(pr.frac_days_derisked), 1), "",
             "spent below full size")
      ]),
      note("These limits are the desk's configured prop rules, not a broker's. The block " +
           "answers one question — whether the equity path would have been allowed to " +
           "continue — and it is a different question from whether the strategy is any good.")
    ]);
  }

  /* The solver's own decomposition, when the allocation solves one.
   *
   * This is the honest version of the hero's risk shares: the weights the
   * solver actually produced, under the covariance it actually saw. A
   * risk_parity book reports five equal shares HERE and does not in the hero,
   * and the reason is the server's note, printed with it. `null` means the
   * question does not arise for this allocation — it is not a zero. */
  function solvedBlock(p) {
    var as = p.risk_decomposition_as_solved;
    if (!as || typeof as !== "object" || Array.isArray(as)) {
      return block([
        head4("The allocation, as the solver saw it"),
        note(txt(p.risk_decomposition_note))
      ]);
    }
    var w = obj(as.weights), rc = obj(as.contribution_risk_pct);
    var syms = Object.keys(w);
    var rows = syms.map(function (sym) {
      return h("tr", {}, [
        th(txt(sym)),
        td(fpct(nn(w[sym]), 2)),
        td(fpct(nn(rc[sym]), 2)),
        td(fpct(nn(obj(as.contribution_risk)[sym]), 3))
      ]);
    });
    var dev = nn(as.max_deviation_from_equal);
    return block([
      head4("The allocation, as the solver saw it"),
      grid([
        cell("Solved on", txt(as.as_of, DASH), "", "the last re-solve in the sample"),
        cell("Window", count(as.window_bars) + " bars", "",
             txt(as.window_start, DASH) + " to " + txt(as.window_end, DASH)),
        cell("Book vol, as solved", fpct(nn(as.portfolio_vol), 2), "",
             "under the covariance the solver used"),
        cell("Furthest from equal", isNum(dev) ? fx(dev * 100, 3) + " pp" : DASH, "",
             "largest gap between any risk share and an even one")
      ]),
      // The third column is an annualised volatility contribution, and the
      // column head says so: the three of them sum to the book vol above, which
      // "risk contribution" alone would leave the reader to guess at.
      table("What the solver produced, decomposed under the covariance it actually saw",
            ["symbol", "weight", "share of risk", "vol contribution"], rows),
      note(txt(as.basis)),
      note(txt(p.risk_decomposition_note))
    ]);
  }

  function warnList(list, what) {
    var items = arr(list).map(function (t) { return h("li", { text: txt(t) }); });
    if (!items.length) return null;
    return h("div", { "class": "pf-warns" }, [
      h("p", { "class": "m-h", text: plural(items.length, "warning") + " from " + what }),
      h("ul", { "class": "pf-notes" }, items)
    ]);
  }


  /* ==================================================================== 9 */
  /* THE PANEL                                                               */

  function renderPortfolioInner(el, payload) {
    var p = obj(payload);
    if (!arr(p.symbols).length && !arr(p.per_asset).length) {
      stage(el, [gone("This run came back without a book in it — no symbols and no " +
                      "per-asset attribution. Nothing was substituted in to fill the gap.")],
            "The portfolio run returned no holdings.");
      return;
    }

    var benches = obj(p.benchmarks);
    var v = readVerdict(p);
    var tone = verdictTone(v, selfCompare(p, benches, "equal_weight"));
    var ci = arr(p.sharpe_ci);
    var lo = nn(ci[0]), hi = nn(ci[1]);
    var sharpe = nn(obj(p.net).sharpe);

    var stamp = [];
    if (txt(p.name)) stamp.push(txt(p.name));
    stamp.push(plural(arr(p.symbols).length, "holding"));
    stamp.push(label(p.allocation) + " · " + label(p.rebalance));
    if (arr(p.symbols).length) stamp.push(arr(p.symbols).join(", "));

    var kids = [
      h("p", { "class": "subject", text: stamp.join("  ·  ") }),
      verdictBlock(v, tone),
      benchCallout(p, v, benches),
      intervalBar(lo, sharpe, hi, "net Sharpe · 95% interval"),
      statCells(p),
      equityFig(p, benches),
      benchTable(p, benches),
      h("div", { "class": "pf-hero" }, [heroFig(p)]),
      note(txt(p.risk_decomposition_note)),
      perAssetTable(p),
      weightsFig(p),
      note(txt(p.concentration_note)),
      corrFig(p),
      calendarBlock(p),
      auditBlock(p),
      drawdownBlock(p),
      propBlock(p),
      solvedBlock(p),
      block([head4("What every trade was charged"), note(txt(p.cost_note))]),
      warnList(arr(p.warnings), "the run")
    ];

    // One sentence, and it is the one the panel exists to say.
    var hero = heroRows(p)[0];
    var spoken = verdictHeadline(v);
    if (hero && isNum(hero.ratio)) {
      spoken += " " + hero.symbol + " is " + fx(hero.money, 1) + " per cent of the money and " +
                fx(hero.risk, 1) + " per cent of the risk.";
    }
    if (v.eng.beats_equal_weight === false && !selfCompare(p, benches, "equal_weight")) {
      spoken += " It lost to equal weight on the same data.";
    }
    stage(el, kids, spoken);
  }

  /* Any renderer may be handed something it cannot read. Say so in the panel
   * rather than throwing into app.js's error banner, which would suggest the
   * run itself failed when only the drawing did. */
  function guard(name, fn) {
    return function (el, payload) {
      if (!el) return;
      try {
        fn(el, payload);
      } catch (err) {
        stage(el, [gone(
          "This panel could not be drawn from what the desk sent back. The run itself may " +
          "be fine — nothing was substituted in to fill the gap."
        )], "The " + name + " panel could not be drawn.");
        if (window.console && console.error) console.error("portfolio:" + name, err);
      }
    };
  }

  window.__PORTFOLIO__ = {
    renderPortfolio: guard("portfolio", renderPortfolioInner),
    kinds: ["portfolio"]
  };

})();
