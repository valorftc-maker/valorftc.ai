/* Hey Jamie Desk — the Opening Tape.
 *
 * Four drawings, and one argument running through all of them.
 *
 *   renderScore    one grade, the family correction it was computed from, and
 *                  every component that disagreed with it
 *   renderDossier  ten sections about one ticker, including the ones that
 *                  refused to run and the reason each gave, each carrying what
 *                  the nine-model correction did to it
 *   renderInsider  Form 4 transactions, sized by dollars, purchases apart
 *                  from pay
 *   renderScreen   a table drawn against the Sharpe a screen of this size gets
 *                  for free out of pure noise, ranked on the column the payload
 *                  says it is ranked on
 *
 * The argument is that a number is not evidence until you know what the same
 * procedure would have produced from nothing. That is why the luck line is the
 * loudest mark on the screener, why dissent is a column and not a footnote, and
 * why a C grade is drawn in chalk rather than in red: C is the honest common
 * answer on one name over one window, and colouring it as a failure would be
 * this file telling its own lie.
 *
 * Three rules, carried unchanged from app.js and models.js:
 *
 *   1. null is NOT zero. Every server value goes through numOrNull. A figure
 *      the engine could not compute renders as an em dash, and a chart line
 *      BREAKS at it rather than being bridged or plotted at the origin. This
 *      codebase has been bitten by that confusion four separate times; the
 *      Number() call that would make it five is not in this file.
 *   2. Nothing is inserted as markup. Every string from the server arrives as a
 *      text node, so no server text can become page structure. There is no
 *      innerHTML in this file and no alert().
 *   3. Every chart carries a labelled axis or a legend, and every <svg> carries
 *      a <title>. A chart without one is decoration, and decoration is how a
 *      picture lies.
 *   4. The server's grading is the grading. Where the payload states a verdict —
 *      `verdict`, `survives`, `survives_correction`, `n_corrected_out`,
 *      `ranked_by` — this file draws THAT, and never a weaker rule of its own
 *      that happens to be easier to compute from the columns on screen.
 *
 * WHERE THIS FILE LIES TO YOU. Three places, and they are all the same lie in
 * different clothes — a drawing makes a number look more settled than it is:
 *
 *   - The score card draws one letter, very large. The letter is a count of how
 *     many intervals cleared their own bar on ONE name over ONE window, after
 *     the family correction drawn directly beneath it. It has no out-of-sample
 *     component whatsoever, and the payload's own `dissent` list says so on
 *     every A. Read the components table, not the letter.
 *   - The dossier puts nine models in one scroll, which makes them look like
 *     nine independent opinions. They are not. Every one of them is a function
 *     of the same price path, so they fail together and they agree together.
 *     That is exactly what `multiple_testing` measures and why the correction
 *     is drawn at the top of the dossier and again on every section: the
 *     effective number of tests is BELOW the raw count, and the page says by
 *     how much rather than leaving the reader to assume nine.
 *   - The screener's luck line is itself an estimate — a simulated expectation
 *     for a screen of that size, not a threshold anyone proved. A row just over
 *     it has not been shown to be real; it has merely not been shown to be
 *     ordinary.
 *
 * This file FETCHES NOTHING. It draws what app.js hands it, and app.js owns the
 * token, the job poll, the console, busy state, history and error banners. It
 * depends on app.js for h/s/fill/cell/intervalBar/isNum/numOrNull/fx/fpct, and
 * it will delegate the five sections models.js already draws to models.js when
 * that file is present. It exposes exactly one global, window.__TAPE__.
 */

"use strict";

window.__HEYJAMIE_TAPE__ = true;

(function () {

  /* app.js is not optional. If it did not load there are no helpers, no text
   * escaping discipline and no number discipline, and half-drawing a panel
   * without them is worse than saying so. */
  if (typeof window.h !== "function" || typeof window.numOrNull !== "function" ||
      typeof window.fill !== "function") {
    var refuse = function (el) {
      if (!el || !el.ownerDocument) return;
      while (el.firstChild) el.removeChild(el.firstChild);
      var p = el.ownerDocument.createElement("p");
      p.className = "tp-gone";
      p.appendChild(el.ownerDocument.createTextNode(
        "The desk's own helpers did not load, so nothing here can be drawn safely. " +
        "Reopen the desk from the launcher."));
      el.appendChild(p);
    };
    window.__TAPE__ = {
      renderScore: refuse, renderDossier: refuse,
      renderInsider: refuse, renderScreen: refuse, kinds: []
    };
    return;
  }


  /* ------------------------------------------------------------- the kinds */

  /* The dossier's nine model sections, in the order tape.py assembles them.
   * The price path is the tenth section and is always drawn first, above these,
   * because every one of the nine is a function of it. */
  var KINDS = ["momentum", "var", "montecarlo", "ml", "voltarget",
               "options", "pairs", "factors", "optimize"];

  var TITLES = {
    momentum:   ["Does it trend?", "and does the trend pay for the search that found it"],
    var:        ["What could it lose?", "three methods, and whether they agree"],
    montecarlo: ["What do the futures look like?", "resampled, and against a normal fit"],
    ml:         ["Did it learn, or memorise?", "train against test, honestly"],
    voltarget:  ["What does targeting vol cost?", "against a constant leverage matched to it"],
    options:    ["What is an option on it worth?", "an identity, not a forecast"],
    pairs:      ["Does it revert?", "against the peer it correlates with most"],
    factors:    ["What is it exposed to?", "the cross-section, sorted"],
    optimize:   ["How should it be weighted?", "the frontier is a band, not a line"]
  };

  /* The five sections models.js already draws, and the panel id each of its
   * renderers writes into. `pairs` is this repo's dossier key; `statarb` is
   * models.js's kind for the same model. */
  var DELEGATE = {
    pairs: "statarb", factors: "factors", var: "var", ml: "ml", optimize: "optimize"
  };

  var W = 880;                      /* one viewBox width, so panels line up */
  var DASH = "—";


  /* ------------------------------------------------------------- discipline */

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function def(v, d) { return v === undefined || v === null ? d : v; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }

  /* The only way a server number becomes a JS number in this file. numOrNull
   * turns null, "", NaN and Infinity into null; Number() would turn the first
   * two into a measured 0. */
  function nn(v) { return numOrNull(v); }

  /* First argument that is actually a number. `a || b` is not this: it steps
   * over a real, measured 0 as if the server had said nothing. */
  function pickNum() {
    for (var i = 0; i < arguments.length; i++) {
      var v = nn(arguments[i]);
      if (isNum(v)) return v;
    }
    return null;
  }

  /* Server text, always as a string, never as markup. */
  function txt(v, fallback) {
    if (v === null || v === undefined) return fallback === undefined ? "" : fallback;
    var t = String(v);
    return t.length ? t : (fallback === undefined ? "" : fallback);
  }

  function finite(a) {
    var out = [];
    for (var i = 0; i < (a || []).length; i++) if (isNum(a[i])) out.push(a[i]);
    return out;
  }

  /* {dates, values} as the charts want it: parallel arrays, holes preserved. */
  function ser(o, key) {
    var box = obj(o);
    var raw = arr(box[key || "values"]);
    if (!raw.length) return null;
    var v = [];
    for (var i = 0; i < raw.length; i++) v.push(nn(raw[i]));
    return { dates: arr(box.dates), v: v, n: v.length };
  }

  function shortDate(d) {
    var t = txt(d);
    return t.length >= 10 ? t.slice(0, 7) : t;
  }

  /* A count for prose. A count the server did not send is stated as unknown --
   * writing "0 components" when the payload said null is the same lie as
   * plotting a null at the origin, in words. */
  function plural(n, one, many) {
    var v = nn(n);
    if (!isNum(v)) return "an unstated number of " + (many || one + "s");
    return String(v) + " " + (v === 1 ? one : (many || one + "s"));
  }

  /* Percentages arrive on two scales in this payload set: the score's splits
   * are 0-100, everything else is a 0-1 fraction. Neither is guessed at. */
  function pct100(v, digits) {
    var n = nn(v);
    return isNum(n) ? n.toFixed(def(digits, 0)) + "%" : DASH;
  }

  function money(v) {
    var n = nn(v);
    if (!isNum(n)) return DASH;
    var sign = n < 0 ? "-" : "";
    var a = Math.abs(n);
    if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "bn";
    if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(2) + "m";
    if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(1) + "k";
    return sign + "$" + a.toFixed(0);
  }

  function count(v) {
    var n = nn(v);
    return isNum(n) ? n.toFixed(0) : DASH;
  }


  /* ---------------------------------------------------------- plot basics  */
  /* Same small kit as models.js: a linear scale, 1-2-5 ticks, and polylines
   * that break at holes. models.js keeps its copy inside its own closure, so
   * this is the same idiom rather than the same object. */

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

  /* Ticks are [{v, label}] because half these axes are dates, and dates do not
   * interpolate. */
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

  function dateTicks(dates, wanted) {
    var out = [], n = dates.length;
    if (!n) return out;
    var want = Math.max(2, Math.min(wanted || 6, n));
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

  /* A horizontal reference line with its own label drawn on the plot. */
  function rule(p, v, cls, label) {
    if (!isNum(v)) return [];
    var y = yOf(p, v);
    if (!isFinite(y)) return [];
    var out = [s("line", { "class": "mc-rule " + (cls || ""), x1: p.l, y1: y.toFixed(1),
                           x2: p.w - p.r, y2: y.toFixed(1) })];
    if (label) {
      out.push(s("text", { "class": "mc-annot", x: p.w - p.r - 4, y: (y - 5).toFixed(1),
                           "text-anchor": "end", text: label }));
    }
    return out;
  }

  function seq(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

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

  function gone(text) { return h("p", { "class": "m-gone", text: text }); }
  function note(text) { return h("p", { "class": "m-note", text: text }); }
  function subject(text) { return h("p", { "class": "subject", text: text }); }
  function grid(cells) { return h("dl", { "class": "grid m-grid" }, cells); }
  function head4(text) { return h("h4", { "class": "m-h", text: text }); }

  function callout(text, tone) {
    return h("div", { "class": "disagree" + (tone === "bad" ? " bad" : ""), text: text });
  }

  /* The desk's grading block, {state, headline, body}, when the payload carries
   * one. A bare string under `verdict` is the model's own prose, not a grading. */
  function grading(r) {
    var v = obj(r).verdict;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return {
      state: txt(v.state, "doubt"),
      headline: txt(v.headline),
      body: txt(v.body)
    };
  }

  function verdictBlock(r) {
    var g = grading(r);
    if (!g) return [];
    var out = [];
    if (g.headline) out.push(h("p", { "class": "verdict " + g.state, text: g.headline }));
    if (g.body) out.push(h("p", { "class": "verdict-sub", text: g.body }));
    return out;
  }

  function table(caption, headers, rows, cls) {
    if (!rows.length) return null;
    return h("div", { "class": "m-tablewrap" }, [
      h("table", { "class": "m-table " + (cls || "") }, [
        h("caption", { text: caption }),
        h("thead", {}, [h("tr", {}, headers.map(function (t) {
          return h("th", { scope: "col", text: t });
        }))]),
        h("tbody", {}, rows)
      ])
    ]);
  }


  /* ------------------------------------------------------------ live region */

  /* Every panel keeps ONE live region across renders. Replacing a live region
   * with a fresh node is how an aria-live update gets silently dropped: the
   * announcement is triggered by text changing inside a region the screen
   * reader already knows about, not by a region appearing with text in it. So
   * the node is detached, kept, re-attached, and only then written to. */
  function liveNode(el) {
    for (var i = 0; i < el.children.length; i++) {
      if (el.children[i].getAttribute("data-tape-live") !== null) return el.children[i];
    }
    return null;
  }

  function stage(el, kids, spoken) {
    var ln = liveNode(el);
    if (ln && ln.parentNode) ln.parentNode.removeChild(ln);
    if (!ln) {
      ln = h("p", { "class": "tp-live", "data-tape-live": "1",
                    role: "status", "aria-live": "polite", "aria-atomic": "true" });
    }
    fill(el, [ln].concat(kids));
    /* The four panels ship hidden and app.js unhides them. Doing it here too is
     * idempotent and it removes a whole class of silent failure: a renderer
     * that filled a node nobody could see has, from the reader's side, done
     * nothing at all — and there would be no error to go looking for. */
    if (el.hasAttribute && el.hasAttribute("hidden")) el.removeAttribute("hidden");
    ln.textContent = txt(spoken);
    return el;
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
        if (window.console && console.error) console.error("tape:" + name, err);
      }
    };
  }

  function emptyPanel(el, text, spoken) {
    stage(el, [h("p", { "class": "tp-empty", text: text })], spoken || text);
  }


  /* =================================================================== 0 */
  /* THE FAMILY CORRECTION                                                  */

  /* Nine models on one name is nine chances at a finding, and the grade is
   * computed from what survives being charged for all nine. That correction is
   * the load-bearing arithmetic on this page, so it is drawn — beside the
   * grade, and again in the dossier over the sections it demoted — rather than
   * left in the job log where only the person who ran it would ever see it.
   *
   * Nothing here recomputes anything. `survives` and `survives_correction` are
   * the server's, the note is the server's sentence, and the one line this file
   * draws from the payload's own numbers is the critical value at each rank,
   * which is the picture of the rule rather than a second opinion about it. */

  /* The block sits on the dossier envelope beside `verdict` AND under `score`;
   * tape_api hoists it precisely so a panel does not have to reach through a
   * grade to find it. Both copies are the same dict, and the envelope's is read
   * first. A payload from before the correction existed has neither, and gets
   * said so rather than drawn as a correction that found nothing. */
  function correctionOf(payload) {
    var p = obj(payload);
    var top = obj(p.multiple_testing);
    if (own(top, "n_models") || arr(top.models).length) return top;
    var inner = obj(obj(p.score).multiple_testing);
    if (own(inner, "n_models") || arr(inner.models).length) return inner;
    return null;
  }

  /* Four states, and the third is the whole reason the correction is on the
   * page: a model whose own interval cleared zero and which the family then
   * explained away. "It cleared zero" and "it cleared nine models looking at
   * one name" are different claims, and only the second one counts. */
  var FAMILY = {
    survived:  { label: "survived the family correction", cls: "tp-fam-live" },
    corrected: { label: "cleared zero alone · corrected out", cls: "tp-fam-out" },
    failed:    { label: "did not survive", cls: "tp-fam-no" },
    none:      { label: "posed no null to correct", cls: "tp-fam-na" }
  };

  function familyState(row, comp) {
    var r = obj(row), c = obj(comp);
    if (r.survives === true || c.survives_correction === true) return "survived";
    /* Only an explicit false means the family tested this model and rejected
     * it. An absent flag means it never posed a null, which is not a failure
     * and must not be drawn as one. */
    if (r.survives !== false && c.survives_correction !== false) return "none";
    return (c.corrected_out === true || c.clears_zero === true) ? "corrected" : "failed";
  }

  function familyBadge(state, extraClass) {
    var f = FAMILY[state] || FAMILY.none;
    return h("span", { "class": "tp-fam " + f.cls + (extraClass ? " " + extraClass : ""),
                       text: f.label });
  }

  /* WHICH CORRECTION RAN, AND AT WHAT LEVEL.
   *
   * Read from the payload, never named here. The engine has already moved this
   * family from Benjamini-Hochberg over an effective test count to
   * Benjamini-Yekutieli at q divided by a harmonic number, and a page that had
   * "Benjamini-Hochberg" typed into it would still be saying so. `fdr_method`
   * names the procedure; the level the step-up actually ran at arrives as
   * `q_effective` under the newer shape and as `q_scaled` under the older one,
   * and both mean the same thing — the q the critical values are built from,
   * which is NOT `fdr_q` in either. */
  var PROC_NAMES = {
    "benjamini-hochberg": "Benjamini-Hochberg",
    "benjamini-yekutieli": "Benjamini-Yekutieli",
    "bonferroni": "Bonferroni",
    "holm": "Holm"
  };

  function procName(mt, fallback) {
    var k = txt(obj(mt).fdr_method).toLowerCase();
    if (!k) return fallback || "the step-up correction";
    return PROC_NAMES[k] || txt(obj(mt).fdr_method);
  }

  /* The q handed to the step-up. Whatever the arithmetic that produced it, the
   * critical value at rank k is (k / m) * this, which is the one line this file
   * draws — and the only thing it needs to draw it. */
  function qRun(mt) {
    return pickNum(obj(mt).q_effective, obj(mt).q_scaled);
  }

  /* {model key: its row in the correction}, so a dossier section and a score
   * component can both find their own verdict without scanning the list. */
  function familyIndex(mt) {
    var out = {}, rows = arr(obj(mt).models);
    for (var i = 0; i < rows.length; i++) {
      var k = txt(obj(rows[i]).model);
      if (k) out[k] = rows[i];
    }
    return out;
  }

  /* The correction, drawn: every model's p-value against the critical value at
   * its own rank. A point under the line is one the family did not explain
   * away. The line is (k / m) × the q the step-up ran at — the payload's own
   * level, not a level this file decided on — and the horizontal rule is the
   * payload's `threshold`, the largest p the procedure actually accepted. */
  function bhChart(mt) {
    var rows = arr(mt.models).slice();
    if (!rows.length) return null;
    var m = rows.length;
    var q = qRun(mt);
    rows.sort(function (a, b) {
      var pa = nn(obj(a).p_value), pb = nn(obj(b).p_value);
      if (!isNum(pa) && !isNum(pb)) return 0;
      if (!isNum(pa)) return 1;                 /* no p-value sorts last, never first */
      if (!isNum(pb)) return -1;
      return pa - pb;
    });

    var xs = [], ps = [], crit = [], ticks = [], noP = [], i;
    for (i = 0; i < m; i++) {
      var row = obj(rows[i]);
      var pv = nn(row.p_value);
      xs.push(i + 1);
      ps.push(pv);
      crit.push(isNum(q) && m > 0 ? (i + 1) / m * q : null);
      ticks.push({ v: i + 1, label: txt(row.model, "?") });
      if (!isNum(pv)) noP.push(txt(row.model, "?"));
    }
    if (!finite(ps).length) return null;

    var thr = nn(mt.threshold);
    var p = P(W, 246, { l: 62, b: 66 });
    p.xlo = 0.5; p.xhi = m + 0.5;
    if (!setY(p, ps.concat(crit).concat([thr]), 0.12, true)) return null;

    var kids = yAxis(p, fmtNum(2), 5)
      .concat(xAxis(p, ticks, { rotate: true }))
      .concat(isNum(thr) && thr > 0
        ? rule(p, thr, "st-sig dash", "accepted up to p " + fx(thr, 4)) : [])
      .concat(lines(p, xs, crit, "st-dbt dash"));
    for (i = 0; i < m; i++) {
      if (!isNum(ps[i])) continue;
      kids.push(s("circle", {
        "class": "tp-dot " + (obj(rows[i]).survives === true ? "fl-sig" : "fl-dbt"),
        cx: xOf(p, xs[i]).toFixed(1), cy: yOf(p, ps[i]).toFixed(1), r: 4
      }));
    }
    kids = kids.concat(axisTitles(p, "rank in the family, smallest p-value first", "p-value"));

    var named = txt(obj(mt).fdr_method);
    var proc = procName(mt);
    var caption = plural(m, "model") + " ranked by p-value" +
      (isNum(q)
        ? "  ·  critical value (k ÷ " + count(m) + ") × " + fx(q, 4) + ", the level the " +
          "step-up ran at" + (named ? " under " + proc : "")
        : "  ·  the payload did not say what level the step-up ran at, so no line is drawn") +
      (noP.length ? "  ·  " + plural(noP.length, "model") + " reported no p-value (" +
                    noP.join(", ") + ") and is drawn as a gap, not as a 1.0" : "");

    var legend = [key("fl-sig", "survived the correction", "k-dot"),
                  key("fl-dbt", "did not survive", "k-dot"),
                  key("st-dbt dash", "critical value at each rank")];
    if (isNum(thr) && thr > 0) {
      legend.push(key("st-sig dash", "the largest p-value the procedure accepted"));
    }

    return fig(
      "Every model's p-value against the bar its own rank has to clear",
      chart(p, "p-value of each model in the dossier against the critical value at its " +
               "rank under " + proc, kids),
      legend, caption);
  }

  /* WHY THE EFFECTIVE COUNT IS BELOW THE RAW ONE, in the payload's own numbers.
   *
   * This says what the number IS and where it came from, and deliberately does
   * NOT say what the procedure then does with it. The engine has already
   * changed its mind about that once — an effective count in the critical
   * constant, then a harmonic penalty with the effective count reserved for
   * sizing the deflation — and `corrected_note`, printed below this, is the
   * server's own current sentence on it. One of them has to be authoritative
   * and it is not this file. */
  function effectiveSentence(mt) {
    var n = nn(mt.n_models);
    var eff = nn(mt.effective_tests);
    var measured = nn(mt.measured_effective_tests);
    var corr = arr(mt.correlated_models).map(function (c) { return txt(c); });
    if (!isNum(n) || !isNum(eff)) {
      return "The payload did not say how many effective tests this family is worth, so " +
             "how much the nine models overlap cannot be stated here.";
    }
    if (!isNum(measured) || corr.length < 2) {
      return "No two models shipped comparable return series over enough overlapping bars " +
             "for their correlation to be measured, so all " + count(n) + " are counted as " +
             "independent tests. That corrects HARDER than the truth: models built on one " +
             "price path are not " + count(n) + " independent looks at it.";
    }
    return "The models are not independent — every one of them is a function of the same " +
           "price path. The " + plural(corr.length, "model") + " that ship a return series (" +
           corr.join(", ") + ") correlate enough to be worth " + fx(measured, 2) +
           " independent tests between them, measured from their correlation matrix as a " +
           "participation ratio rather than assumed" +
           (n - corr.length > 0
             ? ", and the remaining " + plural(n - corr.length, "model") +
               " with no comparable series " +
               (n - corr.length === 1 ? "is counted as one independent test"
                                      : "are counted as one independent test each")
             : "") +
           ". That is why the effective count is " + fx(eff, 2) + " and not " + count(n) +
           ": " + count(n) + " looks at one price series are not " + count(n) +
           " independent tests. Where that number enters the arithmetic is in the payload's " +
           "own note at the foot of this block, which is the procedure that actually ran " +
           "rather than this page's memory of it.";
  }

  function correctionTable(mt, byModel) {
    var rows = arr(mt.models);
    if (!rows.length) return null;
    var body = rows.map(function (r0) {
      var r = obj(r0);
      var comp = obj(byModel[txt(r.model)]);
      var st = familyState(r, comp);
      var dsr = nn(r.deflated_sharpe);
      return h("tr", { "class": st === "corrected" ? "tp-correctedout"
                              : st === "survived" ? "tp-survived" : "" }, [
        h("td", { "class": "t-name" }, [
          txt(r.model, "?"),
          familyBadge(st)
        ]),
        h("td", { "class": "tp-notecell", text: txt(r.statistic, DASH) }),
        h("td", { text: fx(nn(r.value), 3, true) }),
        h("td", { "class": st === "survived" ? "t-sig" : "", text: fx(nn(r.p_value), 4) }),
        h("td", { text: count(r.n_trials) +
                        (r.trials_reported === true ? "" : " (floor)") }),
        h("td", { text: count(r.dossier_trials) }),
        h("td", { "class": r.clears_deflation === true ? "t-sig"
                         : r.clears_deflation === false ? "t-dbt" : "",
                  text: fx(dsr, 3) })
      ]);
    });
    return table(
      "Every model the family correction tested, and what it did to each one",
      ["model", "statistic it posed", "value", "p-value", "own trials",
       "trials charged", "deflated Sharpe"],
      body, "tp-mttable");
  }

  /* The whole block. The score is read alongside the correction because that is
   * where `clears_zero`, `corrected_out` and the authoritative `n_corrected_out`
   * live: the correction rows know whether a model survived, and the components
   * know whether it had anything to lose. */
  function correctionBlock(mt, score, headline) {
    if (!mt) {
      return h("div", { "class": "tp-block tp-mt" }, [
        head4("The family correction"),
        gone("No multiple_testing block came back with this dossier, so the page cannot " +
             "say what the grade was charged for. That is a missing correction, and a " +
             "missing correction is NOT a correction that found nothing.")
      ]);
    }

    var components = arr(obj(score).components);
    var byModel = {};
    for (var i = 0; i < components.length; i++) {
      var c = obj(components[i]);
      if (txt(c.model)) byModel[txt(c.model)] = c;
    }

    var n = nn(mt.n_models);
    var surviving = nn(mt.n_surviving);
    var eff = nn(mt.effective_tests);
    var q = nn(mt.fdr_q);
    var qr = qRun(mt);
    /* `n_corrected_out` is the scorer's own count of components it sent to flat,
     * and the scorer is the authority on what the grade was computed from. The
     * per-row scan is only used to decide which rows get the badge. */
    var declared = nn(obj(score).n_corrected_out);
    var seen = 0;
    var rows = arr(mt.models);
    for (i = 0; i < rows.length; i++) {
      if (familyState(rows[i], byModel[txt(obj(rows[i]).model)]) === "corrected") seen++;
    }
    var correctedOut = isNum(declared) ? declared : seen;

    var big = isNum(surviving) && isNum(n)
      ? count(surviving) + " of " + count(n) + " models survived"
      : "the survivor count did not come back";
    var tone = isNum(surviving) && surviving === 0 ? " tp-mtbox-bad" : "";

    var kids = [
      head4(headline || "What the grade was charged for"),
      h("div", { "class": "tp-mtbox" + tone }, [
        h("p", { "class": "tp-mtbig", text: big }),
        h("p", { "class": "tp-mtsub", text:
          "The dossier ran " + plural(KINDS.length, "model") + " on one name. " +
          (isNum(n)
            ? count(n) + " of them posed a null a correction can test" +
              (isNum(nn(mt.n_trials_total))
                ? " and swept " + plural(mt.n_trials_total, "trial") + " between them. " : ". ")
            : "How many of them posed a testable null did not come back. ") +
          procName(mt, "The step-up correction") + " at q=" + fx(q, 2) +
          (isNum(qr) ? ", run at " + fx(qr, 4) + "," : "") + " left " +
          (isNum(surviving) ? count(surviving) : "an unstated number of") +
          " standing. The grade above is computed from what is left, not from what each " +
          "model said about itself." })
      ]),
      h("p", { "class": "tp-mtwhy", text: effectiveSentence(mt) })
    ];

    kids.push(grid([
      cell("Testable models", count(n), "", "of the " + KINDS.length + " the dossier runs"),
      cell("Internal trials", count(mt.n_trials_total), "",
           "swept inside those models, counted as one where a model reports none"),
      cell("Effective tests", fx(eff, 2), "amber",
           "what the family is worth once the models' correlation is measured — below the " +
           "raw count because they read one price series"),
      cell("Raw test count", count(n), "",
           "what an independence assumption would have charged instead"),
      cell("Correction", procName(mt, DASH), "",
           "the procedure the server ran, as the payload names it"),
      cell("q, the false discovery rate", fx(q, 2), "",
           "the share of the survivors this procedure is willing to have wrong"),
      cell("q the step-up ran at", fx(qr, 4), "",
           "the level the critical values are built from, which is not q itself"),
      cell("Survived", count(surviving), isNum(surviving) && surviving === 0 ? "amber" : "",
           "models whose p-value cleared its own rank"),
      cell("Corrected out", isNum(declared) || rows.length ? String(correctedOut) : DASH,
           correctedOut > 0 ? "amber" : "",
           "cleared zero alone, then did not clear the family"),
      cell("Critical p", fx(nn(mt.threshold), 4), "",
           !isNum(nn(mt.threshold)) ? "the payload reported none"
             : isNum(surviving) && surviving === 0
               ? "0 because no p-value was accepted at any rank"
               : "the largest p-value the procedure accepted"),
      cell("Deflation floor", fx(nn(mt.dsr_floor), 2), "",
           "a deflated Sharpe under this is a finding the search alone explains")
    ]));

    var pic = bhChart(mt);
    if (pic) kids.push(pic);
    else kids.push(gone("Not one model in the family reported a p-value, so the correction " +
                        "cannot be drawn. The table below still says what ran."));

    var tbl = correctionTable(mt, byModel);
    if (tbl) kids.push(tbl);

    if (correctedOut > 0) {
      kids.push(callout(
        plural(correctedOut, "model") + " cleared zero on its own and did not survive the " +
        "family correction. That is the distinction this block exists for: an interval that " +
        "clears zero once is not evidence when " + count(n) + " models were asked the same " +
        "question about the same price path.", "bad"));
    }

    var untestable = arr(mt.untestable).map(function (u) { return txt(u); });
    if (untestable.length) {
      kids.push(note(plural(untestable.length, "model") + " posed no null for the correction " +
                     "to test (" + untestable.join(", ") + "), so " +
                     (untestable.length === 1 ? "it is" : "they are") +
                     " UNCORRECTED rather than corrected. An uncorrected model has not " +
                     "passed anything."));
    }

    if (txt(mt.corrected_note)) {
      kids.push(h("p", { "class": "tp-mtnote", text: txt(mt.corrected_note) }));
    }

    return h("div", { "class": "tp-block tp-mt" }, kids);
  }

  /* The one-line version, for the top of the dossier, where the reader is about
   * to scroll through nine sections that each look like an independent opinion
   * and are not. */
  function correctionBanner(mt) {
    if (!mt) return null;
    var surviving = nn(mt.n_surviving), n = nn(mt.n_models);
    var eff = nn(mt.effective_tests), q = nn(mt.fdr_q);
    var bad = isNum(surviving) && surviving === 0;
    return h("div", { "class": "tp-mtbanner" + (bad ? " tp-mtbanner-bad" : "") }, [
      head4("These nine models are one search, and it has been charged for"),
      h("p", { "class": "tp-mtbig", text:
        (isNum(surviving) && isNum(n)
          ? count(surviving) + " of " + count(n) + " testable models survived the correction"
          : "the survivor count did not come back") }),
      h("p", { "class": "tp-mtsub", text:
        procName(mt, "The step-up correction") + " at q=" + fx(q, 2) + " across the family. " +
        (isNum(n) && isNum(eff)
          ? "The " + count(n) + " testable models are worth " + fx(eff, 2) +
            " effective tests — effective, and not " + count(n) + ", because they read the " +
            "same price series and correlate. "
          : "The payload did not carry both a model count and an effective test count, so " +
            "how much these models overlap is not stated here. ") +
        "Each section below carries what the correction did to it; the arithmetic is on the " +
        "score card, above." })
    ]);
  }


  /* ==================================================================== 1 */
  /* THE SCORE CARD                                                         */

  /* A is drawn in --signal, B in --doubt, C in --chalk. C is not an error: on
   * one name over one window it is the answer the arithmetic gives most of the
   * time, and drawing it in red would be this card overstating its own news. */
  var GRADE_TONE = { A: "sig", B: "dbt", C: "chk" };

  var GRADE_GLOSS = {
    A: "Several intervals cleared their own bars and pointed the same way. On one name " +
       "over one window, that is also what luck looks like when you screen enough names.",
    B: "Something cleared, but not enough of it, or not jointly. Partial evidence.",
    C: "No interval cleared. This is the common answer on real single-name daily data, " +
       "and it is a measurement, not a malfunction."
  };

  var EVIDENCE_TONE = { strong: "t-sig", weak: "t-dbt", none: "" };

  function scoreOf(payload) {
    var p = obj(payload);
    if (typeof p.grade === "string") return p;
    if (p.score && typeof p.score === "object") return obj(p.score);
    return null;
  }

  /* The buy/sell/flat split as ONE segmented bar. Not a pie: a pie asks the
   * reader to compare angles, and the only comparison that matters here is
   * "how much of this is flat", which is a length. */
  function splitBar(buy, sell, flat) {
    if (!isNum(buy) || !isNum(sell) || !isNum(flat)) {
      return h("p", { "class": "tp-gone", text:
        "The directional split could not be computed, so it is not drawn. That is an " +
        "absent measurement, not a flat one." });
    }
    var total = buy + sell + flat;
    if (!(total > 0)) {
      return h("p", { "class": "tp-gone", text:
        "No component carried any weight, so there is no split to draw." });
    }
    var segs = [
      { k: "buy", v: buy, cls: "fl-sig", label: "buy" },
      { k: "sell", v: sell, cls: "fl-flt", label: "sell" },
      { k: "flat", v: flat, cls: "fl-chk", label: "flat" }
    ];
    var x = 0, kids = [], i;
    for (i = 0; i < segs.length; i++) {
      var wd = segs[i].v / total * 1000;
      if (wd > 0.01) {
        kids.push(s("rect", { "class": "tp-seg " + segs[i].cls, x: x.toFixed(2), y: 0,
                              width: wd.toFixed(2), height: 30 }));
        if (wd > 70) {
          kids.push(s("text", { "class": "tp-segv", x: (x + wd / 2).toFixed(2), y: 20,
                                "text-anchor": "middle",
                                text: segs[i].v.toFixed(0) + "%" }));
        }
      }
      x += wd;
    }
    var label = "directional lean: buy " + buy.toFixed(0) + "%, sell " + sell.toFixed(0) +
                "%, flat " + flat.toFixed(0) + "%";
    return h("div", { "class": "tp-split" }, [
      s("svg", { "class": "tp-splitsvg", viewBox: "0 0 1000 30",
                 preserveAspectRatio: "none", role: "img", "aria-label": label },
        [s("title", { text: label })].concat(kids)),
      h("div", { "class": "m-legend tp-splitkey" }, [
        key("fl-sig", "buy " + buy.toFixed(0) + "%", "k-box"),
        key("fl-flt", "sell " + sell.toFixed(0) + "%", "k-box"),
        key("fl-chk", "flat " + flat.toFixed(0) + "%", "k-box")
      ])
    ]);
  }

  /* Confidence in the MEASUREMENT. Drawn against its own ceiling, because the
   * ceiling is the part of the doubt no amount of coverage buys off. */
  function confidenceBar(c) {
    var v = nn(c);
    var ceiling = 0.95;
    var kids = [
      s("rect", { "class": "tp-meter-bg", x: 0, y: 0, width: 1000, height: 14 })
    ];
    if (isNum(v)) {
      kids.push(s("rect", { "class": "tp-meter-fill", x: 0, y: 0,
                            width: Math.max(0, Math.min(1, v)) * 1000, height: 14 }));
    }
    kids.push(s("line", { "class": "tp-meter-cap", x1: ceiling * 1000, y1: 0,
                          x2: ceiling * 1000, y2: 14 }));
    var label = isNum(v)
      ? "confidence in the measurement " + fpct(v, 0) + " of a possible " + fpct(ceiling, 0)
      : "confidence was not computed";
    return h("div", { "class": "tp-meter" }, [
      h("div", { "class": "tp-meter-row" }, [
        h("span", { "class": "tp-meter-k", text: "confidence" }),
        h("span", { "class": "tp-meter-v", text: isNum(v) ? fpct(v, 0) : DASH })
      ]),
      s("svg", { "class": "tp-metersvg", viewBox: "0 0 1000 14",
                 preserveAspectRatio: "none", role: "img", "aria-label": label },
        [s("title", { text: label })].concat(kids)),
      h("p", { "class": "tp-meter-note", text:
        "Confidence in the measurement — how much of the machinery ran, on how many bars, " +
        "and whether the risk model was calibrated. It is capped at " + fpct(ceiling, 0) +
        " (the mark on the bar) and says nothing about whether the answer holds tomorrow." })
    ]);
  }

  /* A component's lean, as a small diverging bar around a shared zero. */
  function leanBar(lean, evidence) {
    if (!isNum(lean)) return h("span", { "class": "tp-nolean", text: DASH });
    var mag = Math.min(1, Math.abs(lean));
    var wd = Math.max(mag * 50, lean === 0 ? 0 : 1.5);
    var left = lean >= 0 ? 50 : 50 - wd;
    var cls = evidence === "none" ? "fl-chk" : (lean > 0 ? "fl-sig" : lean < 0 ? "fl-flt" : "fl-chk");
    var label = "lean " + fx(lean, 2, true) + " on " + txt(evidence, "no") + " evidence";
    return h("span", { "class": "tp-lean" }, [
      s("svg", { "class": "tp-leansvg", viewBox: "0 0 100 12", preserveAspectRatio: "none",
                 role: "img", "aria-label": label }, [
        s("title", { text: label }),
        s("line", { "class": "tp-lean-mid", x1: 50, y1: 0, x2: 50, y2: 12 }),
        lean === 0 ? null : s("rect", { "class": "tp-lean-bar " + cls, x: left.toFixed(2),
                                        y: 3, width: wd.toFixed(2), height: 6 })
      ]),
      h("span", { "class": "tp-lean-v", text: fx(lean, 2, true) })
    ]);
  }

  function componentTable(components, netSide, byModel) {
    if (!components.length) {
      return gone("No component reported. Nothing was scored, and nothing was invented " +
                  "to fill the table.");
    }
    var index = byModel || {};
    var rows = components.map(function (c) {
      var lean = nn(c.lean);
      var evidence = txt(c.evidence, "none");
      var weight = nn(c.weight);
      var dissents = isNum(lean) && lean !== 0 && netSide !== 0 &&
                     (lean > 0 ? 1 : -1) !== netSide;
      var word = !isNum(lean) || lean === 0 ? "flat"
               : lean > 0 ? "buy" : "sell";
      /* The family verdict rides in the table the grade is argued from, because
       * "cleared zero" is the column a reader believes and it is no longer the
       * last word on any of these rows. */
      var state = familyState(index[txt(c.model)], c);
      return h("tr", { "class": (dissents ? "tp-dissents" : "") +
                                (state === "corrected" ? " tp-correctedout" : "") }, [
        h("td", { "class": "t-name" }, [
          txt(c.model, "?"),
          dissents ? h("span", { "class": "tp-flag", text: "dissents" }) : null
        ]),
        h("td", { "class": "tp-leancell" }, [leanBar(lean, evidence), " ", word]),
        h("td", { "class": EVIDENCE_TONE[evidence] || "", text: evidence }),
        h("td", { text: fx(nn(c.p_value), 4) }),
        h("td", { "class": "tp-famcell" }, [familyBadge(state)]),
        h("td", { text: isNum(weight) ? fx(weight, 2) : DASH }),
        h("td", { "class": "tp-notecell", text: txt(c.note, DASH) })
      ]);
    });
    return table(
      "Every component, including the ones that pointed the other way",
      ["model", "lean", "evidence on its own", "p-value", "against the family",
       "weight", "what it actually said"],
      rows, "tp-components"
    );
  }

  function renderScoreInner(el, payload) {
    var sc = scoreOf(payload);
    if (!sc) {
      emptyPanel(el, "No score was returned, so none is shown. An absent grade is not a C.",
                 "No score was returned.");
      return;
    }
    var top = obj(payload);
    var grade = txt(sc.grade, "?").toUpperCase();
    var tone = GRADE_TONE[grade] || "chk";
    var buy = nn(sc.buy_pct), sell = nn(sc.sell_pct), flat = nn(sc.flat_pct);
    var netSide = (isNum(buy) && isNum(sell)) ? (buy > sell ? 1 : buy < sell ? -1 : 0) : 0;
    var components = arr(sc.components);
    var dissent = arr(sc.dissent);
    var agreement = nn(sc.agreement);
    var ticker = txt(top.ticker || sc.ticker);
    var nBars = nn(top.n_bars);

    var stamp = [];
    if (ticker) stamp.push(ticker);
    if (txt(top.name)) stamp.push(txt(top.name));
    if (isNum(nBars)) stamp.push(count(nBars) + " bars");
    if (txt(top.as_of)) stamp.push("to " + txt(top.as_of));

    var kids = [];

    kids.push(h("div", { "class": "tp-scorehead" }, [
      h("div", { "class": "tp-gradebox tp-grade-" + tone }, [
        h("span", { "class": "tp-grade", text: grade }),
        h("span", { "class": "tp-grade-k", text: "grade" })
      ]),
      h("div", { "class": "tp-scoremeta" }, [
        stamp.length ? subject(stamp.join("  ·  ")) : null,
        h("p", { "class": "tp-gradegloss", text: GRADE_GLOSS[grade] ||
          "This grade is not one this card knows how to gloss; read the basis below." }),
        h("p", { "class": "tp-counts", text:
          plural(sc.n_strong, "component") + " with strong evidence, " +
          plural(sc.n_weak, "component") + " weak, " +
          plural(sc.n_spoke, "component") + " pointing anywhere at all" +
          (isNum(agreement) ? ", agreement " + fx(agreement, 2) + " among those" : "") + "." })
      ])
    ]));

    /* Directly under the grade, and above everything else on the card. The
     * letter is now a statement about what SURVIVED nine models on one name,
     * and a reader who does not see the correction is reading a different and
     * more flattering claim than the one the server made. */
    var mt = correctionOf(payload) || correctionOf(sc);
    kids.push(correctionBlock(mt, sc));

    kids.push(h("div", { "class": "tp-block" }, [
      head4("The directional lean, and how much of it is flat"),
      splitBar(buy, sell, flat),
      note("Each component puts its whole weight somewhere. The part backed by an interval " +
           "that clears zero goes to its direction; the rest goes to flat. A mostly-flat bar " +
           "is the normal reading and it means the intervals straddle zero.")
    ]));

    kids.push(h("div", { "class": "tp-block" }, [confidenceBar(sc.confidence)]));

    if (txt(sc.basis)) {
      kids.push(h("div", { "class": "tp-block" }, [
        head4("Why this grade"),
        h("p", { "class": "tp-basis", text: txt(sc.basis) })
      ]));
    }

    /* Dissent is a block of its own, above the table, at full reading size. A
     * consensus that hides its dissenters is worse than no consensus. */
    kids.push(h("div", { "class": "tp-block tp-dissent" }, [
      head4(dissent.length ? "Dissent and standing objections" : "Dissent"),
      dissent.length
        ? h("ul", { "class": "tp-dissentlist" }, dissent.map(function (d) {
            return h("li", { text: txt(d) });
          }))
        : h("p", { "class": "tp-dissent-none", text:
            "No component pointed against the rest, and the scorer raised no standing " +
            "objection. That is agreement among models built on one price path, which is " +
            "cheaper than it sounds." })
    ]));

    kids.push(h("div", { "class": "tp-block" },
      [componentTable(components, netSide, familyIndex(mt))]));

    kids.push(h("div", { "class": "tp-disclaimer" }, [
      h("p", { text: txt(sc.disclaimer,
        "This is model output computed on paper-only data. It is not investment advice.") })
    ]));

    var surviving = nn(obj(mt).n_surviving), nTested = nn(obj(mt).n_models);
    stage(el, kids,
      "Grade " + grade + ". Buy " + pct100(buy) + ", sell " + pct100(sell) +
      ", flat " + pct100(flat) + ". Confidence " + (isNum(nn(sc.confidence))
        ? fpct(nn(sc.confidence), 0) : "not computed") + ". " +
      (mt
        ? (isNum(surviving) && isNum(nTested)
            ? count(surviving) + " of " + count(nTested) +
              " models survived the family correction. "
            : "The family correction returned no survivor count. ")
        : "No family correction came back with this dossier. ") +
      (dissent.length ? plural(dissent.length, "objection") + " recorded." : "No dissent recorded."));
  }


  /* ==================================================================== 2 */
  /* THE DOSSIER                                                            */

  function priceChart(price, asOf, nBars, ticker) {
    var p0 = obj(price);
    var closes = arr(p0.close).map(nn);
    var dates = arr(p0.dates);
    if (finite(closes).length < 2) {
      return gone("Fewer than two usable closes came back, so there is no path to draw.");
    }
    var p = P(W, 220, { l: 62, b: 40 });
    p.xlo = 0; p.xhi = Math.max(1, closes.length - 1);
    if (!setY(p, closes, 0.08)) {
      return gone("The price path has no finite range, so it is not drawn.");
    }
    var holes = closes.length - finite(closes).length;
    var kids = yAxis(p, fmtNum(2), 5)
      .concat(xAxis(p, dateTicks(dates, 6)))
      .concat(lines(p, seq(closes.length), closes, "st-vel"))
      .concat(axisTitles(p, "date", "close"));
    var caption = count(nBars) + " bars to " + txt(asOf, "an unstated date") +
      (holes ? "  ·  " + plural(holes, "point") + " the feed could not value; the line breaks there"
             : "");
    return fig((txt(ticker) || "The name") + " — the path everything below is computed from",
      chart(p, "closing price of " + txt(ticker, "this name") + ", " + count(nBars) +
               " bars to " + txt(asOf, "an unstated date"), kids),
      [key("st-vel", "close")],
      caption);
  }

  /* --- momentum ---------------------------------------------------------- */

  /* The hero: Sharpe against lookback, with the bootstrap band, and the noise
   * bar drawn across it. The bar is the whole reading — a curve that peaks
   * below its own noise bar found nothing, however pretty the peak is. */
  function decayChart(rows, searchBar) {
    var d = arr(rows);
    if (d.length < 2) return null;
    var xs = [], sh = [], lo = [], hi = [], gross = [];
    for (var i = 0; i < d.length; i++) {
      xs.push(nn(d[i].lookback));
      sh.push(nn(d[i].sharpe));
      lo.push(nn(d[i].sharpe_lo));
      hi.push(nn(d[i].sharpe_hi));
      gross.push(nn(d[i].sharpe_gross));
    }
    var xf = finite(xs);
    if (xf.length < 2 || finite(sh).length < 2) return null;
    var p = P(W, 220, { l: 62, b: 42 });
    p.xlo = Math.min.apply(null, xf); p.xhi = Math.max.apply(null, xf);
    if (p.xhi <= p.xlo) return null;
    if (!setY(p, sh.concat(lo).concat(hi).concat(gross).concat([searchBar]), 0.10, true)) return null;

    var kids = yAxis(p, fmtNum(1), 4)
      .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 0) };
      })))
      .concat(band(p, xs, lo, hi, "fl-vel"))
      .concat(lines(p, xs, gross, "st-chk dim dash"))
      .concat(lines(p, xs, sh, "st-vel"))
      .concat(rule(p, searchBar, "st-dbt dash",
                   isNum(searchBar) ? "noise bar " + fx(searchBar, 2) : null))
      .concat(axisTitles(p, "lookback, in bars", "net Sharpe"));

    return fig("Sharpe against lookback, and the bar a search this size clears on noise",
      chart(p, "net Sharpe by momentum lookback with its bootstrap band, against the " +
               "expected best Sharpe from a search of this size on zero-edge data", kids),
      [key("st-vel", "net Sharpe"), key("fl-vel", "95% bootstrap band", "k-box"),
       key("st-chk dash", "gross Sharpe"), key("st-dbt dash", "noise bar")],
      "The peak of this curve was chosen by looking at this curve. The amber rule is what " +
      "the same search finds in data with no edge in it — a peak under it is a peak that " +
      "the search alone explains.");
  }

  function equityChart(values, dates, headline, caption) {
    var v = arr(values).map(nn);
    if (finite(v).length < 2) return null;
    var p = P(W, 190, { l: 62, b: 40 });
    p.xlo = 0; p.xhi = Math.max(1, v.length - 1);
    if (!setY(p, v, 0.08)) return null;
    var ticks = arr(dates).length === v.length
      ? dateTicks(dates, 6)
      : niceTicks(0, p.xhi, 6).map(function (t) { return { v: t, label: fx(t, 0) }; });
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, ticks))
      .concat(lines(p, seq(v.length), v, "st-vel"))
      .concat(axisTitles(p, arr(dates).length === v.length ? "date" : "bars",
                         "equity, 1.00 at the start"));
    return fig(headline, chart(p, headline, kids), [key("st-vel", "net equity")], caption);
  }

  function secMomentum(r) {
    var net = obj(r.net), gross = obj(r.gross);
    var ci = arr(r.sharpe_ci);
    var sharpe = nn(net.sharpe), bar = nn(r.search_bar), defl = nn(r.deflated_sharpe);
    var clears = r.clears_search_bar === true;
    var sig = nn(r.current_signal);

    var kids = [
      subject("lookback " + count(r.lookback) + " bars  ·  holding " + count(r.holding) +
              "  ·  " + plural(r.n_trials, "setting") + " swept  ·  " +
              "best lookback " + (isNum(nn(r.best_lookback)) ? count(r.best_lookback) : DASH))
    ].concat(verdictBlock(r));

    kids.push(intervalBar(nn(ci[0]), sharpe, nn(ci[1]),
                          "net Sharpe · 95% block-bootstrap interval"));

    if (isNum(bar)) {
      kids.push(callout(
        clears
          ? "The interval clears " + fx(bar, 2) + ", which is the best Sharpe a sweep of " +
            plural(r.n_trials, "setting") + " turns up on data with no edge in it. " +
            "This is the only section in the dossier that pays for its own search."
          : "The interval does NOT clear " + fx(bar, 2) + " — the best Sharpe a sweep of " +
            plural(r.n_trials, "setting") + " turns up on data with no edge in it. " +
            "Whatever the peak looks like, a search this size finds one that size for free.",
        clears ? "" : "bad"));
    }

    var decay = decayChart(r.decay, bar);
    if (decay) kids.push(decay);
    else kids.push(gone("The lookback sweep came back with fewer than two usable points, " +
                        "so the decay curve is not drawn."));

    var eq = equityChart(r.equity_curve, r.equity_dates,
      "What the rule actually made, net of what it cost to trade",
      "after the cost model for this asset class — the gross figure is in the grid below, " +
      "as a number, because it is not the one you would have kept");
    if (eq) kids.push(eq);

    kids.push(grid([
      cell("Net Sharpe", fx(sharpe, 2, true), isNum(sharpe) && sharpe < 0 ? "neg" : "",
           "after costs — the only one that counts"),
      cell("Gross Sharpe", fx(nn(gross.sharpe), 2, true), "", "before it paid to trade"),
      cell("Noise bar", fx(bar, 2), "amber", "best Sharpe this sweep finds on nothing"),
      cell("Deflated Sharpe", fx(defl, 2, true), isNum(defl) && defl <= 0 ? "amber" : "",
           "after paying for " + plural(r.n_trials, "trial")),
      cell("Out-of-sample Sharpe", fx(nn(r.oos_sharpe), 2, true), "",
           "walk-forward, refitting the lookback"),
      cell("Plateau", fx(nn(r.plateau), 2), "",
           "how flat the peak is — a spike is a fitted artefact"),
      cell("Neighbour Sharpe", fx(nn(r.neighbour_sharpe), 2, true), "",
           "the settings either side of the peak"),
      cell("Cost drag", fpct(nn(r.cost_drag), 2), "amber", "given up per year"),
      cell("Net CAGR", fpct(nn(net.cagr), 2, true), isNum(nn(net.cagr)) && nn(net.cagr) < 0 ? "neg" : "",
           "compounded, after costs"),
      cell("Max drawdown", fpct(nn(net.max_drawdown), 2), "neg", "worst peak to trough, net"),
      cell("Current signal", isNum(sig) ? fx(sig, 2, true) : DASH, "",
           isNum(sig) ? (sig > 0 ? "long as of the last bar" : sig < 0 ? "short as of the last bar"
                                                                       : "flat as of the last bar")
                      : "the rule reported no position"),
      cell("Bars", count(net.n_periods), "", "in the tested sample")
    ]));

    var wf = arr(r.walk_forward).map(function (w) {
      var tr = nn(w.train_sharpe), te = nn(w.test_sharpe);
      return h("tr", {}, [
        h("td", { text: count(w.fold) }),
        h("td", { text: isNum(nn(w.train_lookback)) ? count(w.train_lookback) : DASH }),
        h("td", { text: fx(tr, 2, true) }),
        h("td", { "class": isNum(te) && te > 0 ? "t-sig" : "t-dbt", text: fx(te, 2, true) }),
        h("td", { text: count(w.n_train) }),
        h("td", { text: count(w.n_test) })
      ]);
    });
    var wfTable = table("Walk-forward: the lookback chosen on train, scored on test",
      ["fold", "lookback", "train Sharpe", "test Sharpe", "n train", "n test"], wf);
    if (wfTable) {
      kids.push(wfTable);
      kids.push(note("The test column is the only one that was not chosen by looking at the " +
                     "data it is scored on. Read the spread between folds, not their mean."));
    }

    return kids;
  }

  /* --- Monte Carlo -------------------------------------------------------- */

  var FAN_Q = ["p5", "p25", "p50", "p75", "p95"];

  function fanChart(fan) {
    var f = obj(fan);
    var steps = arr(f.steps).map(nn);
    if (finite(steps).length < 2) return null;
    var q = {};
    for (var i = 0; i < FAN_Q.length; i++) {
      var vals = arr(f[FAN_Q[i]]).map(nn);
      q[FAN_Q[i]] = vals.length === steps.length ? vals : null;
    }
    if (!q.p50) return null;
    var all = [];
    for (i = 0; i < FAN_Q.length; i++) if (q[FAN_Q[i]]) all = all.concat(q[FAN_Q[i]]);
    all.push(1.0);
    var p = P(W, 230, { l: 62, b: 42 });
    p.xlo = Math.min.apply(null, finite(steps));
    p.xhi = Math.max.apply(null, finite(steps));
    if (p.xhi <= p.xlo) return null;
    if (!setY(p, all, 0.08)) return null;

    var kids = yAxis(p, fmtNum(2), 5)
      .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 0) };
      })));
    if (q.p5 && q.p95) kids = kids.concat(band(p, steps, q.p5, q.p95, "fl-chk"));
    if (q.p25 && q.p75) kids = kids.concat(band(p, steps, q.p25, q.p75, "fl-vel"));
    kids = kids.concat(rule(p, 1.0, "st-chk dash", "starting capital"))
               .concat(lines(p, steps, q.p50, "st-vel"))
               .concat(axisTitles(p, "bars ahead", "multiple of starting capital"));

    return fig("Where the resampled futures sit at each date",
      chart(p, "percentiles of simulated wealth at each step ahead, as a multiple of " +
               "starting capital", kids),
      [key("st-vel", "median"), key("fl-vel", "25–75%", "k-box"),
       key("fl-chk", "5–95%", "k-box"), key("st-chk dash", "starting capital")],
      "This is not a set of paths. No single simulated future traces the 5th percentile " +
      "line — it is the 5th percentile at each date, which overstates how bad an early " +
      "bad path is and understates a late one.");
  }

  function secMontecarlo(r) {
    var term = obj(r.terminal), dd = obj(r.drawdown_dist);
    var gauss = obj(r.gaussian_comparison);
    var gterm = obj(gauss.terminal);
    var pl = nn(r.prob_loss), plse = nn(r.prob_loss_se);
    var pr = nn(r.prob_ruin), prse = nn(r.prob_ruin_se);
    var gapCi = arr(r.tail_gap_ci);

    var kids = [
      subject(txt(r.method, "unstated method") + "  ·  " + count(r.n_paths) + " paths  ·  " +
              count(r.horizon) + "-bar horizon  ·  block " + count(r.block) + "  ·  " +
              "fitted on " + count(r.n_obs) + " observed bars")
    ].concat(verdictBlock(r));

    var fan = fanChart(r.fan);
    if (fan) kids.push(fan);
    else kids.push(gone("The fan came back without a usable median series, so it is not drawn."));

    kids.push(h("div", { "class": "m-ivbox" }, [
      head4("How much fatter the resampled tail is than a normal fit"),
      intervalBar(nn(gapCi[0]), nn(r.tail_gap), nn(gapCi[1]),
                  "tail gap · resampled 1% loss minus the normal fit's, in capital"),
      note("Positive means the normal fit understates the loss. The interval is the reading: " +
           "a 1% quantile of " + count(r.n_paths) + " paths is a handful of observations, and " +
           "one observation is not a tail.")
    ]));

    kids.push(grid([
      cell("Median outcome", fx(nn(term.p50), 3), "", "multiple of starting capital"),
      cell("5th percentile", fx(nn(term.p5), 3), "neg", "one year in twenty is worse"),
      cell("1st percentile", fx(nn(term.p1), 3), "neg", "one year in a hundred is worse"),
      cell("95th percentile", fx(nn(term.p95), 3), "pos", "one year in twenty is better"),
      cell("P(loss)", isNum(pl) ? fpct(pl, 1) + (isNum(plse) ? " ± " + fpct(plse, 1) : "") : DASH,
           "amber", "paths ending below where they started"),
      cell("P(ruin)", isNum(pr) ? fpct(pr, 2) + (isNum(prse) ? " ± " + fpct(prse, 2) : "") : DASH,
           "neg", "below " + fx(nn(r.ruin_threshold), 2) + " of capital at any point"),
      cell("VaR (simulated)", fpct(nn(r.var_mc), 2), "neg",
           "at " + fpct(nn(r.confidence), 0) + " over the horizon"),
      cell("CVaR (simulated)", fpct(nn(r.cvar_mc), 2), "neg", "average loss beyond the VaR"),
      cell("Median drawdown", fpct(nn(dd.p50), 2), "neg", "depth of the typical path"),
      cell("95th pct drawdown", fpct(nn(dd.p95), 2), "neg", "depth of a bad one"),
      cell("Normal fit, 1st pct", fx(nn(gterm.p1), 3), "",
           "what a Gaussian would have said"),
      cell("Tail gap ratio", fx(nn(r.tail_gap_ratio), 2), "amber",
           "the gap as a fraction of the normal fit's own loss")
    ]));

    var floored = nn(r.floored_draws);
    if (isNum(floored) && floored > 0) {
      kids.push(callout(
        count(floored) + " simulated bar(s) were floored at total loss, so the left tail is " +
        "clipped and every loss figure above is, if anything, optimistic.", "bad"));
    }

    kids.push(note(
      "A block bootstrap resamples the past in chunks. It keeps this sample's volatility " +
      "clustering and it cannot produce anything the sample never did — no crash larger than " +
      "the largest run of bad days already in the window."));

    return kids;
  }

  /* --- options ------------------------------------------------------------ */

  function payoffChart(r) {
    var curve = arr(r.value_curve), pay = arr(r.payoff);
    if (curve.length < 2 && pay.length < 2) return null;
    var xs = [], vals = [], intr = [];
    var src = curve.length >= 2 ? curve : pay;
    var byStrike = {};
    var i;
    for (i = 0; i < pay.length; i++) {
      var sp = nn(pay[i].spot);
      if (isNum(sp)) byStrike[sp.toFixed(6)] = nn(pay[i].intrinsic);
    }
    for (i = 0; i < src.length; i++) {
      var x = nn(src[i].spot);
      xs.push(x);
      vals.push(nn(src[i].value));
      intr.push(isNum(x) && own(byStrike, x.toFixed(6)) ? byStrike[x.toFixed(6)]
                                                        : nn(src[i].intrinsic));
    }
    var xf = finite(xs);
    if (xf.length < 2) return null;
    var p = P(W, 210, { l: 62, b: 42 });
    p.xlo = Math.min.apply(null, xf); p.xhi = Math.max.apply(null, xf);
    if (p.xhi <= p.xlo) return null;
    if (!setY(p, vals.concat(intr), 0.08, true)) return null;

    var spot = nn(r.spot), strike = nn(r.strike);
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, niceTicks(p.xlo, p.xhi, 6).map(function (t) {
        return { v: t, label: fx(t, 0) };
      })))
      .concat(lines(p, xs, intr, "st-chk dash"))
      .concat(lines(p, xs, vals, "st-vel"));
    if (isNum(strike) && strike >= p.xlo && strike <= p.xhi) {
      kids.push(s("line", { "class": "mc-rule st-dbt dash", x1: xOf(p, strike).toFixed(1),
                            y1: p.t, x2: xOf(p, strike).toFixed(1), y2: p.h - p.b }));
      kids.push(s("text", { "class": "mc-annot", x: (xOf(p, strike) + 4).toFixed(1),
                            y: p.t + 10, text: "strike " + fx(strike, 2) }));
    }
    if (isNum(spot) && spot >= p.xlo && spot <= p.xhi) {
      kids.push(s("line", { "class": "mc-rule st-blu", x1: xOf(p, spot).toFixed(1),
                            y1: p.t, x2: xOf(p, spot).toFixed(1), y2: p.h - p.b }));
      kids.push(s("text", { "class": "mc-annot", x: (xOf(p, spot) + 4).toFixed(1),
                            y: p.t + 22, text: "spot " + fx(spot, 2) }));
    }
    kids = kids.concat(axisTitles(p, "spot at expiry", "value"));

    return fig("What it is worth now, against what it is worth at expiry",
      chart(p, "option value against spot, with the expiry payoff underneath", kids),
      [key("st-vel", "value now"), key("st-chk dash", "payoff at expiry"),
       key("st-dbt dash", "strike"), key("st-blu", "spot")],
      "The gap between the two lines is time value, and it is the whole of what you are " +
      "paying for. It goes to zero on a schedule you do not control.");
  }

  var GREEK_NOTES = {
    delta: "per 1.00 of spot",
    gamma: "per 1.00 of spot, squared",
    vega: "per 1.00 of volatility — NOT per vol point",
    theta: "per year — NOT per day",
    rho: "per 1.00 of rate — NOT per basis point"
  };

  function secOptions(r) {
    var g = obj(r.greeks);
    var kids = [
      subject(txt(r.kind, "option") + "  ·  " + txt(r.struck, "struck as stated") + "  ·  " +
              (isNum(nn(r.tau_days)) ? count(r.tau_days) + " days to expiry" : "tenor " +
               fx(nn(r.tau), 3) + "y") + "  ·  " + txt(r.vol_source, "volatility as supplied"))
    ].concat(verdictBlock(r));

    var chartNode = payoffChart(r);
    if (chartNode) kids.push(chartNode);
    else kids.push(gone("No value curve or payoff grid came back, so the payoff is not drawn."));

    kids.push(grid([
      cell("Theoretical price", fx(nn(r.price), 4), "", "Black–Scholes, on the inputs below"),
      cell("Intrinsic", fx(nn(r.intrinsic), 4), "", "what it is worth if expiry were now"),
      cell("Time value", fx(nn(r.time_value), 4), "amber", "the part that decays to nothing"),
      cell("Spot", fx(nn(r.spot), 2), "", "last close"),
      cell("Strike", fx(nn(r.strike), 2), "", "as struck"),
      cell("Volatility in", fpct(nn(r.vol), 1), "", "the input, annualised"),
      cell("Rate", fpct(nn(r.rate), 2), isNum(nn(r.rate)) && nn(r.rate) === 0 ? "amber" : "",
           isNum(nn(r.rate)) && nn(r.rate) === 0 ? "zero: this repo has no rate curve"
                                                 : "risk-free, annualised"),
      cell("Implied vol", isNum(nn(r.implied_vol)) ? fpct(nn(r.implied_vol), 1) : DASH, "",
           isNum(nn(r.market_price)) ? "backed out of the market price supplied"
                                     : "no market price was supplied, so none was solved"),
      cell("Put–call parity", isNum(nn(r.parity_error)) ? fx(nn(r.parity_error), 8) : DASH,
           r.parity_ok === false ? "neg" : "",
           r.parity_ok === true ? "holds within tolerance" :
           r.parity_ok === false ? "BREACHED — the pricer disagrees with itself"
                                 : "not checked")
    ]));

    var chips = [];
    for (var k in g) {
      if (!own(g, k)) continue;
      chips.push(h("span", { "class": "m-chip" }, [
        h("b", { text: k }), " " + fx(nn(g[k]), 4, true),
        h("em", { "class": "tp-chipnote", text: GREEK_NOTES[k] || "" })
      ]));
    }
    if (chips.length) {
      kids.push(h("div", { "class": "m-chips" }, [
        head4("Greeks, in the units they are actually in"),
        h("div", { "class": "m-chiprow" }, chips),
        note("Each of these is a partial derivative and assumes every other input holds " +
             "still. In a real move none of them does, which is why adding them up does not " +
             "give you the P&L.")
      ]));
    }

    kids.push(note(
      "This section is an identity, not an estimate. Given spot, strike, rate, volatility " +
      "and time, the price is arithmetic — so it carries no interval, and it contributes no " +
      "direction to the grade. The one input that is a guess is the volatility, and it came " +
      "from the realised past."));

    return kids;
  }

  /* --- vol targeting ------------------------------------------------------ */

  function volEquityChart(eq) {
    var e = obj(eq);
    var dates = arr(e.dates);
    var t = arr(e.targeted).map(nn);
    var u = arr(e.untargeted).map(nn);
    var m = arr(e.matched).map(nn);
    var n = Math.max(t.length, u.length, m.length);
    if (n < 2) return null;
    var p = P(W, 210, { l: 62, b: 40 });
    p.xlo = 0; p.xhi = Math.max(1, n - 1);
    if (!setY(p, t.concat(u).concat(m), 0.08)) return null;
    var ticks = dates.length === n ? dateTicks(dates, 6)
      : niceTicks(0, p.xhi, 6).map(function (v) { return { v: v, label: fx(v, 0) }; });
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, ticks))
      .concat(lines(p, seq(u.length), u, "st-chk dim"))
      .concat(lines(p, seq(m.length), m, "st-blu"))
      .concat(lines(p, seq(t.length), t, "st-vel"))
      .concat(axisTitles(p, dates.length === n ? "date" : "bars", "equity, 1.00 at the start"));
    return fig("Targeted, untargeted, and a constant leverage matched to the same vol",
      chart(p, "equity of the vol-targeted series against the raw series and against a " +
               "constant leverage matched to the same full-sample volatility", kids),
      [key("st-vel", "targeted"), key("st-blu", "matched constant leverage"),
       key("st-chk dim", "untargeted")],
      "The blue line is the honest comparison. Beating the untargeted series can be bought " +
      "with leverage alone; beating a constant leverage matched to the same volatility is " +
      "the only version of the claim that is about timing.");
  }

  function volSeriesChart(realized, targetVol, bandFrac) {
    var rv = ser(realized);
    if (!rv || finite(rv.v).length < 2) return null;
    var p = P(W, 190, { l: 62, b: 40 });
    p.xlo = 0; p.xhi = Math.max(1, rv.n - 1);
    var tv = nn(targetVol), bf = nn(bandFrac);
    var extra = [];
    if (isNum(tv)) {
      extra.push(tv);
      if (isNum(bf)) { extra.push(tv * (1 + bf)); extra.push(tv * (1 - bf)); }
    }
    if (!setY(p, rv.v.concat(extra), 0.08)) return null;
    var kids = yAxis(p, fmtPct(0), 4)
      .concat(xAxis(p, rv.dates.length === rv.n ? dateTicks(rv.dates, 6)
        : niceTicks(0, p.xhi, 6).map(function (v) { return { v: v, label: fx(v, 0) }; })));
    if (isNum(tv) && isNum(bf)) {
      var loB = [], hiB = [];
      for (var i = 0; i < rv.n; i++) { loB.push(tv * (1 - bf)); hiB.push(tv * (1 + bf)); }
      kids = kids.concat(band(p, seq(rv.n), loB, hiB, "fl-sig"));
    }
    kids = kids.concat(rule(p, tv, "st-sig dash", isNum(tv) ? "target " + fpct(tv, 0) : null))
               .concat(lines(p, seq(rv.n), rv.v, "st-vel"))
               .concat(axisTitles(p, "date", "annualised volatility"));
    return fig("Realised volatility against the target it was aiming at",
      chart(p, "trailing realised volatility against the target and its tolerance band", kids),
      [key("st-vel", "realised vol"), key("st-sig dash", "target"),
       key("fl-sig", "tolerance band", "k-box")],
      "The estimate is trailing, so every move into the band happens after the move that " +
      "put it outside. That lag is the cost, and it is measured below.");
  }

  function leverageChart(lev, maxLev) {
    var lv = ser(lev);
    if (!lv || finite(lv.v).length < 2) return null;
    var p = P(W, 170, { l: 62, b: 40 });
    p.xlo = 0; p.xhi = Math.max(1, lv.n - 1);
    var mx = nn(maxLev);
    if (!setY(p, lv.v.concat([mx, 1.0]), 0.08)) return null;
    var kids = yAxis(p, fmtNum(2), 4)
      .concat(xAxis(p, lv.dates.length === lv.n ? dateTicks(lv.dates, 6)
        : niceTicks(0, p.xhi, 6).map(function (v) { return { v: v, label: fx(v, 0) }; })))
      .concat(rule(p, 1.0, "st-chk dash", "unlevered"))
      .concat(rule(p, mx, "st-flt dash", isNum(mx) ? "cap " + fx(mx, 2) : null))
      .concat(lines(p, seq(lv.n), lv.v, "st-vel"))
      .concat(axisTitles(p, "date", "leverage"));
    return fig("The leverage the rule asked for",
      chart(p, "position leverage over time against the unlevered line and the cap", kids),
      [key("st-vel", "leverage"), key("st-chk dash", "unlevered"), key("st-flt dash", "cap")],
      "Time spent flat against the cap is time the rule wanted more risk than it was allowed, " +
      "and over that stretch it is not targeting anything.");
  }

  function secVoltarget(r) {
    var tgt = obj(r.targeted), unt = obj(r.untargeted), mt = obj(r.matched);
    var ciT = arr(r.sharpe_ci_targeted), ciU = arr(r.sharpe_ci_untargeted);

    var kids = [
      subject("target " + fpct(nn(r.target_vol), 0) + "  ·  " + count(r.window) +
              "-bar estimate  ·  cap " + fx(nn(r.max_leverage), 2) + "x  ·  " +
              count(r.n_obs) + " bars")
    ].concat(verdictBlock(r));

    var eq = volEquityChart(r.equity);
    if (eq) kids.push(eq);
    else kids.push(gone("No equity series came back for the three variants, so they are not drawn."));

    var vs = volSeriesChart(r.realized_vol, r.target_vol, r.band);
    if (vs) kids.push(vs);

    var lc = leverageChart(r.leverage, r.max_leverage);
    if (lc) kids.push(lc);

    kids.push(h("div", { "class": "m-ivbox" }, [
      head4("Sharpe, targeted against untargeted"),
      intervalBar(nn(ciT[0]), nn(tgt.sharpe), nn(ciT[1]),
                  "targeted net Sharpe · 95% block-bootstrap interval"),
      intervalBar(nn(ciU[0]), nn(unt.sharpe), nn(ciU[1]),
                  "untargeted net Sharpe · 95% block-bootstrap interval"),
      note("These two intervals are computed on overlapping data and are not independent. " +
           "If they overlap each other — and they usually do — the difference between them " +
           "has not been demonstrated.")
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
      cell("Time at the cap", fpct(nn(r.capped_fraction), 1),
           isNum(nn(r.capped_fraction)) && nn(r.capped_fraction) > 0.05 ? "amber" : "",
           "not targeting anything while capped"),
      cell("Added turnover", fx(nn(r.turnover_added), 1), "amber", "times a year"),
      cell("Cost of targeting", fpct(nn(r.cost_of_targeting), 2), "amber", "per year, in return"),
      cell("Drawdown cut", fpct(nn(r.drawdown_reduction), 2), "",
           "against the untargeted series"),
      cell("Drawdown cut vs matched", fpct(nn(r.drawdown_reduction_vs_matched), 2), "",
           "the version that is not just less leverage"),
      cell("Estimator lag", isNum(nn(r.lag_bars)) ? fx(nn(r.lag_bars), 1) + " bars" : DASH,
           "amber", "how late the vol estimate turns"),
      cell("Regime strength", fx(nn(r.regime_strength), 2), "",
           "how much vol clustering there was to exploit")
    ]));

    var folds = arr(r.folds).map(function (f) {
      return h("tr", {}, [
        h("td", { text: txt(f.fold !== undefined ? f.fold : f.start, DASH) }),
        h("td", { text: fx(nn(f.targeted), 2, true) }),
        h("td", { text: fx(nn(f.untargeted), 2, true) }),
        h("td", { text: count(f.n) })
      ]);
    });
    var ft = table("Fold by fold, out of sample",
      ["fold", "targeted Sharpe", "untargeted Sharpe", "bars"], folds);
    if (ft) kids.push(ft);

    return kids;
  }

  /* --- the generic stand-in ---------------------------------------------- */

  /* Used when models.js is absent, or when the delegation cannot reach the
   * document. It shows the verdict and whatever interval is discoverable, and
   * says plainly that the full panel is missing rather than implying the model
   * had nothing to say. */
  function secGeneric(kind, r) {
    var kids = verdictBlock(r);
    /* Two places the interval lives, depending on the model: at the top level,
     * or inside a backtest block. Nowhere else is guessed at. */
    var bt = obj(r.backtest);
    var ci = arr(r.sharpe_ci).length ? arr(r.sharpe_ci) : arr(bt.sharpe_ci);
    var net = arr(r.sharpe_ci).length ? obj(r.net) : obj(bt.net);
    if (isNum(nn(ci[0])) || isNum(nn(ci[1]))) {
      kids.push(intervalBar(nn(ci[0]), nn(net.sharpe), nn(ci[1]),
                            "net Sharpe · 95% block-bootstrap interval"));
    }
    kids.push(gone(
      "The full chart pack for this section is drawn by models.js, which is not loaded on " +
      "this page. Everything the model computed is still in the saved run — nothing here " +
      "was recomputed or approximated to fill the gap."));
    return kids;
  }

  /* --- delegation to models.js ------------------------------------------- */

  /* models.js's five renderers write into fixed element ids — c-statarb,
   * live-ml, and so on — and paint() shows or hides q-<kind> around them. That
   * is the right design for the desk's own panels and the wrong one for a
   * dossier, which needs those same five sections drawn somewhere else on the
   * page.
   *
   * Rather than reimplement eight hundred lines of charts badly, the ids are
   * BORROWED: the desk's own nodes are parked under a suffixed id, the
   * dossier's hosts take the real ids, paint() runs, and both sets are put
   * back. It is synchronous from first rename to last, so nothing else can
   * observe the document mid-swap, and the restore is in a finally.
   *
   * Two details that are load-bearing. Parking happens for ALL five kinds, so a
   * kind with no host resolves to no element at all and paint() skips it rather
   * than hiding the desk's real panel. And the dossier's hosts are renamed to
   * their permanent ids BEFORE the desk's are restored, so the document never
   * holds two nodes with the same id.
   *
   * Returns the set of dossier keys it actually drew. */
  function delegate(hosts) {
    var M = window.__MODELS__;
    var drew = {};
    if (!M || typeof M.paint !== "function") return drew;

    var mkinds = [], dkey;
    for (dkey in DELEGATE) if (own(DELEGATE, dkey)) mkinds.push(DELEGATE[dkey]);

    var parked = [], adopted = [], i, j, id, node;
    var slots = ["q-", "c-", "live-"];

    try {
      for (i = 0; i < mkinds.length; i++) {
        for (j = 0; j < slots.length; j++) {
          id = slots[j] + mkinds[i];
          node = document.getElementById(id);
          if (node) { parked.push({ node: node, id: id }); node.id = id + "--parked"; }
        }
      }
      var results = {}, pending = [];
      for (dkey in hosts) {
        if (!own(hosts, dkey)) continue;
        var host = hosts[dkey];
        var mk = DELEGATE[dkey];
        adopted.push({ node: host.section, id: "tp-sec-" + dkey });
        host.section.id = "q-" + mk;
        adopted.push({ node: host.card, id: "tp-card-" + dkey });
        host.card.id = "c-" + mk;
        adopted.push({ node: host.live, id: "tp-livesub-" + dkey });
        host.live.id = "live-" + mk;
        results[mk] = (typeof M.normalise === "function")
          ? M.normalise(mk, host.payload) : host.payload;
        pending.push(dkey);
      }
      /* Marked drawn only once paint has returned. paint() catches a failure
       * per kind and writes its own message into that card, so a section it
       * handled must not then be overwritten by the stand-in; a paint that
       * threw outright drew nothing and every section falls back. */
      M.paint(results);
      for (i = 0; i < pending.length; i++) drew[pending[i]] = true;
    } catch (err) {
      if (window.console && console.error) console.error("tape:delegate", err);
    } finally {
      for (i = 0; i < adopted.length; i++) adopted[i].node.id = adopted[i].id;
      for (i = 0; i < parked.length; i++) parked[i].node.id = parked[i].id;
    }
    return drew;
  }

  /* --- the dossier itself ------------------------------------------------- */

  function sectionShell(kind, extraClass, badge) {
    var title = TITLES[kind] || [kind, ""];
    var live = h("p", { "class": "q-live tp-livesub" });
    var card = h("div", { "class": "card" });
    var section = h("section", {
      "class": "q tp-sec " + (extraClass || ""), id: "tp-sec-" + kind,
      "aria-labelledby": "tp-h-" + kind, tabindex: "-1"
    }, [
      h("div", { "class": "q-head" }, [
        h("h3", { id: "tp-h-" + kind, text: title[0] }),
        h("em", { text: title[1] })
      ]),
      badge || null,
      live,
      card
    ]);
    return { section: section, card: card, live: live };
  }

  function skippedShell(kind, reason, badge) {
    var shell = sectionShell(kind, "tp-skipped", badge);
    fill(shell.card, [
      h("p", { "class": "tp-skip-k", text: "skipped" }),
      h("p", { "class": "tp-skip-why", text: txt(reason,
        "The server gave no reason, which is itself worth knowing.") }),
      note("A model that could not run contributes nothing to the grade in either " +
           "direction. “The model said nothing” and “the model was never " +
           "asked” are different pieces of news, and this is the second.")
    ]);
    return shell;
  }

  function miniNav(entries) {
    return h("nav", { "class": "tp-nav", "aria-label": "Dossier sections" },
      [h("ul", {}, entries.map(function (e) {
        return h("li", {}, [
          h("a", {
            "class": "tp-navlink" + (e.skipped ? " tp-navlink-skip" : ""),
            href: "#tp-sec-" + e.kind,
            text: e.label
          }, e.skipped ? [h("span", { "class": "tp-navdot", "aria-hidden": "true", text: "·" })]
                       : null)
        ]);
      }))]);
  }

  function renderDossierInner(el, payload) {
    var d = obj(payload);
    var sections = obj(d.sections);
    var skipped = arr(d.skipped);
    var ran = arr(d.ran);

    if (!arr(d.price && d.price.close).length && !ran.length && !skipped.length) {
      emptyPanel(el, "No dossier came back. Nothing here was filled in from anywhere else.",
                 "No dossier came back.");
      return;
    }

    var reasons = {};
    for (var i = 0; i < skipped.length; i++) {
      reasons[txt(skipped[i].model)] = txt(skipped[i].reason);
    }

    var ticker = txt(d.ticker, "this name");
    var stampBits = [ticker];
    if (txt(d.name)) stampBits.push(txt(d.name));
    if (isNum(nn(d.n_bars))) stampBits.push(count(d.n_bars) + " bars");
    if (txt(d.as_of)) stampBits.push("to " + txt(d.as_of));
    if (isNum(nn(d.years))) stampBits.push(fx(nn(d.years), 1) + "y window");
    if (isNum(nn(d.elapsed_s))) stampBits.push(fx(nn(d.elapsed_s), 1) + "s to compute");

    var navEntries = [{ kind: "price", label: "price" }];
    var kids = [];

    kids.push(h("div", { "class": "tp-doshead" }, [
      h("h2", { "class": "tp-dostitle", text: ticker }),
      subject(stampBits.join("  ·  ")),
      h("p", { "class": "tp-source", text: "source: " + txt(d.source, "unstated") }),
      arr(d.peers).length
        ? h("p", { "class": "tp-source", text:
            "cross-section: " + plural(arr(d.peers).length, "peer") +
            (txt(d.peer) ? "  ·  pair leg: " + txt(d.peer) : "") })
        : null
    ]));

    /* Before the nine sections, because nine sections in one scroll read as
     * nine independent opinions and the correction is the statement that they
     * are not. Each section then carries its own line of it. */
    var mt = correctionOf(d);
    var famRows = familyIndex(mt);
    var famComps = {};
    var comps = arr(obj(d.score).components);
    for (i = 0; i < comps.length; i++) {
      if (txt(obj(comps[i]).model)) famComps[txt(obj(comps[i]).model)] = comps[i];
    }
    var untestable = {};
    var untestableList = arr(obj(mt).untestable);
    for (i = 0; i < untestableList.length; i++) untestable[txt(untestableList[i])] = true;

    /* One badge per section. A model the correction never tested says so, and a
     * model that cleared zero and was then corrected out says THAT, because it
     * is the one reading a section on its own would get wrong. */
    function sectionBadge(kind) {
      if (!mt) return null;
      if (!own(famRows, kind) && !untestable[kind]) return null;
      var state = untestable[kind] && !own(famRows, kind)
        ? "none" : familyState(famRows[kind], famComps[kind]);
      var row = obj(famRows[kind]);
      var detail = isNum(nn(row.p_value))
        ? "p " + fx(nn(row.p_value), 4) + " against its rank under " +
          procName(mt, "the family correction") +
          (isNum(nn(row.dossier_trials))
            ? "  ·  deflated at " + plural(row.dossier_trials, "trial") : "")
        : "no p-value, so nothing here was corrected";
      return h("div", { "class": "tp-secfam" }, [
        familyBadge(state), h("span", { "class": "tp-secfam-d", text: detail })
      ]);
    }

    var banner = correctionBanner(mt);
    if (banner) kids.push(banner);
    else {
      kids.push(note("No multiple_testing block came back with this dossier, so nothing " +
                     "below has been charged for the other eight models on this page. " +
                     "That is a missing correction, not a clean one."));
    }

    var warnings = arr(d.warnings);
    if (warnings.length) {
      kids.push(h("div", { "class": "tp-warnbox" }, [
        head4(plural(warnings.length, "thing") + " the dossier wants you to know first"),
        h("ul", { "class": "tp-warnlist" }, warnings.map(function (w) {
          return h("li", { text: txt(w) });
        }))
      ]));
    }

    /* Nav is built after the section list is known, but inserted here. A
     * placeholder keeps the reading order right. */
    var navSlot = h("div", { "class": "tp-navslot" });
    kids.push(navSlot);

    var priceSec = h("section", {
      "class": "q tp-sec", id: "tp-sec-price", "aria-labelledby": "tp-h-price", tabindex: "-1"
    }, [
      h("div", { "class": "q-head" }, [
        h("h3", { id: "tp-h-price", text: "The path" }),
        h("em", { text: "everything below is a function of this one series" })
      ]),
      h("div", { "class": "card" }, [
        priceChart(d.price, d.as_of, d.n_bars, ticker)
      ])
    ]);
    kids.push(priceSec);

    var LOCAL = {
      momentum: secMomentum, montecarlo: secMontecarlo,
      options: secOptions, voltarget: secVoltarget
    };

    var hosts = {};        /* the five models.js draws, keyed by dossier key */
    var order = KINDS;
    for (i = 0; i < order.length; i++) {
      var kind = order[i];
      var title = TITLES[kind] || [kind, ""];
      var payloadFor = sections[kind];
      var shell;

      if (payloadFor && typeof payloadFor === "object" && !Array.isArray(payloadFor)) {
        shell = sectionShell(kind, "", sectionBadge(kind));
        if (own(LOCAL, kind)) {
          var built;
          try {
            built = LOCAL[kind](payloadFor);
          } catch (err) {
            built = [gone("This section could not be drawn from what the desk sent back. " +
                          "The run itself may be fine.")];
            if (window.console && console.error) console.error("tape:section:" + kind, err);
          }
          fill(shell.card, built);
        } else if (own(DELEGATE, kind)) {
          hosts[kind] = { section: shell.section, card: shell.card,
                          live: shell.live, payload: payloadFor };
        } else {
          fill(shell.card, secGeneric(kind, payloadFor));
        }
        navEntries.push({ kind: kind, label: title[0] });
      } else if (own(reasons, kind)) {
        shell = skippedShell(kind, reasons[kind], sectionBadge(kind));
        navEntries.push({ kind: kind, label: title[0], skipped: true });
      } else {
        shell = sectionShell(kind, "tp-skipped");
        fill(shell.card, [
          h("p", { "class": "tp-skip-k", text: "not reported" }),
          h("p", { "class": "tp-skip-why", text:
            "The server neither ran this model nor said why. It is shown empty rather than " +
            "dropped, because a section that quietly disappears reads as one that agreed." })
        ]);
        navEntries.push({ kind: kind, label: title[0], skipped: true });
      }
      kids.push(shell.section);
    }

    var spoken = ticker + ": " + plural(ran.length, "model") + " ran, " +
                 skipped.length + " skipped, on " + count(d.n_bars) + " bars to " +
                 txt(d.as_of, "an unstated date") + ". " +
                 (mt
                   ? (isNum(nn(obj(mt).n_surviving)) && isNum(nn(obj(mt).n_models))
                       ? count(obj(mt).n_surviving) + " of " + count(obj(mt).n_models) +
                         " testable models survived the family correction."
                       : "The family correction returned no survivor count.")
                   : "No family correction came back with this dossier.");

    stage(el, kids, spoken);
    fill(navSlot, [miniNav(navEntries)]);

    /* The hosts must already be in the document: models.js finds them by id. */
    var reachable = document.body && document.body.contains(el);
    var drew = reachable ? delegate(hosts) : {};
    for (var dk in hosts) {
      if (!own(hosts, dk) || drew[dk]) continue;
      fill(hosts[dk].card, secGeneric(dk, hosts[dk].payload));
    }
  }


  /* ==================================================================== 3 */
  /* THE INSIDER TABLE                                                      */

  /* Only P is a decision to buy. M and A are pay, arriving on a schedule set
   * years ago, and F is the tax withheld on it. Drawing them the same colour as
   * a purchase is exactly how an insider score gets inflated. */
  var TX_CLASS = {
    P: "tp-tx-buy", S: "tp-tx-sell", M: "tp-tx-pay", A: "tp-tx-pay", F: "tp-tx-pay"
  };
  var TX_WORD = {
    P: "open-market purchase", S: "sale", M: "option exercise", A: "grant",
    F: "tax withholding"
  };

  function insiderRows(payload) {
    var explicit = arr(payload.transactions).length ? arr(payload.transactions)
                 : arr(payload.rows);
    if (explicit.length) return explicit.slice();
    var out = arr(payload.biggest).map(function (r) {
      var c = {}; for (var k in r) if (own(r, k)) c[k] = r[k];
      if (!txt(c.transaction)) c.transaction = "P";
      return c;
    });
    out = out.concat(arr(payload.biggest_sales).map(function (r) {
      var c = {}; for (var k in r) if (own(r, k)) c[k] = r[k];
      if (!txt(c.transaction)) c.transaction = "S";
      return c;
    }));
    return out;
  }

  function renderInsiderInner(el, payload) {
    var p = obj(payload);
    if (payload === null || payload === undefined) {
      emptyPanel(el,
        "No Form 4 data was fetched, so there is nothing to show. That means “not " +
        "fetched” — it does not mean nobody is trading.",
        "No insider data was fetched.");
      return;
    }

    var rows = insiderRows(p);
    var vals = [];
    for (var i = 0; i < rows.length; i++) {
      var v = nn(rows[i].value);
      if (isNum(v)) vals.push(Math.abs(v));
    }
    var maxV = vals.length ? Math.max.apply(null, vals) : null;

    rows.sort(function (a, b) {
      var av = nn(a.value), bv = nn(b.value);
      if (!isNum(av) && !isNum(bv)) return 0;
      if (!isNum(av)) return 1;                 /* unpriced sorts last, never as $0 */
      if (!isNum(bv)) return -1;
      return Math.abs(bv) - Math.abs(av);
    });

    var score = nn(p.score);
    var kids = [];

    kids.push(h("div", { "class": "tp-inhead" }, [
      h("div", { "class": "tp-ingrade" }, [
        h("span", { "class": "tp-ingrade-v", text: txt(p.grade, DASH) }),
        h("span", { "class": "tp-ingrade-k", text: isNum(score) ? fx(score, 1) + " / 100" : DASH })
      ]),
      h("div", { "class": "tp-inmeta" }, [
        subject(
          (txt(p.window_start) ? txt(p.window_start) + " to " + txt(p.window_end)
                               : plural(p.window_months, "month") + " window") +
          "  ·  " + plural(p.n_transactions, "filing") +
          "  ·  " + plural(p.n_buys, "purchase") +
          "  ·  " + plural(p.n_sells, "sale")),
        h("p", { "class": "tp-evidence tp-ev-" + txt(p.evidence, "none"),
                 text: txt(p.evidence, "no") + " evidence" }),
        h("p", { "class": "tp-innote", text: txt(p.evidence_note) })
      ])
    ]));

    if (isNum(score)) {
      kids.push(h("p", { "class": "tp-innote", text:
        "50 is neutral and means the filings said nothing. It is not a zero, and " +
        (isNum(score) && score === 50 ? "this score is sitting exactly on it. "
                                      : "the distance from it is the whole reading. ") +
        txt(p.grade_note) }));
    }

    /* The cluster flag, when set, is the one insider pattern with published
     * support, so it gets the loudest box on the panel. */
    if (p.cluster === true) {
      kids.push(h("div", { "class": "tp-cluster tp-cluster-on" }, [
        h("p", { "class": "tp-cluster-k", text: "CLUSTER BUYING" }),
        h("p", { "class": "tp-cluster-b", text: txt(p.cluster_note) })
      ]));
    } else {
      kids.push(h("div", { "class": "tp-cluster" }, [
        h("p", { "class": "tp-cluster-k", text: "no cluster" }),
        h("p", { "class": "tp-cluster-b", text: txt(p.cluster_note) })
      ]));
    }

    if (p.stale === true) {
      kids.push(callout(
        "The most recent filing here is " +
        (isNum(nn(p.days_since_last)) ? count(p.days_since_last) + " days old" : "stale") +
        ". This rates the period the filings actually cover, not the period since.", "bad"));
    }

    kids.push(grid([
      cell("Bought", money(p.buy_value), "pos",
           plural(p.n_insiders_buying, "distinct insider")),
      cell("Sold", money(p.sell_value), "neg",
           plural(p.n_insiders_selling, "distinct insider")),
      cell("Net", money(p.net_value),
           isNum(nn(p.net_value)) && nn(p.net_value) < 0 ? "neg" : "pos",
           "purchases minus sales, as reported"),
      cell("Officers buying", count(p.officers_buying), "",
           "of the insiders who bought"),
      cell("Distinct buyers in window", count(p.distinct_buyers_in_window), "",
           "a cluster needs " + count(p.cluster_min_insiders) + " within " +
           count(p.cluster_window_days) + " days"),
      cell("Days since last filing", count(p.days_since_last),
           p.stale === true ? "amber" : "", "Form 4 allows two business days to file")
    ]));

    if (rows.length) {
      var body = rows.map(function (row) {
        var code = txt(row.transaction, "?").toUpperCase().slice(0, 1);
        var value = nn(row.value);
        var mag = (isNum(value) && isNum(maxV) && maxV > 0) ? Math.abs(value) / maxV : null;
        var tier = !isNum(mag) ? "" : mag >= 0.5 ? " tp-big" : mag >= 0.2 ? " tp-mid" : "";
        var bar = isNum(mag)
          ? h("span", { "class": "tp-valbar " + (code === "P" ? "tp-valbar-buy" : "tp-valbar-sell"),
                        style: "width:" + (mag * 100).toFixed(1) + "%" })
          : null;
        return h("tr", { "class": (TX_CLASS[code] || "tp-tx-other") + tier }, [
          h("td", { text: txt(row.date, DASH) }),
          h("td", { "class": "t-name", text: txt(row.insider, DASH) }),
          h("td", { "class": "tp-role", text: txt(row.role, DASH) }),
          h("td", {}, [
            h("span", { "class": "tp-code", text: code }),
            h("span", { "class": "tp-codeword", text: TX_WORD[code] || "other" })
          ]),
          h("td", { text: isNum(nn(row.shares)) ? count(row.shares) : DASH }),
          h("td", { text: isNum(nn(row.price)) ? fx(nn(row.price), 2) : DASH }),
          h("td", { "class": "tp-valcell" }, [
            h("span", { "class": "tp-valtrack" }, [bar]),
            h("span", { "class": "tp-valnum", text: money(value) })
          ])
        ]);
      });
      kids.push(table(
        "Form 4 transactions, largest dollar value first — purchases in signal, sales in fault, " +
        "pay in chalk",
        ["date", "insider", "role", "code", "shares", "price", "value"], body, "tp-insider"));
      kids.push(h("div", { "class": "m-legend tp-inkey" }, [
        key("fl-sig", "code P — open-market purchase", "k-box"),
        key("fl-flt", "code S — sale", "k-box"),
        key("fl-chk", "M / A / F — exercise, grant, tax", "k-box")
      ]));
      kids.push(note("Row weight is proportional to dollar value, so the purchases worth " +
                     "arguing about are the ones that look heavy. A row with no reported " +
                     "price has no bar at all — it is unranked, not worthless."));
    } else {
      kids.push(gone("No transactions in the window. That is an absence of filings, not an " +
                     "absence of insider interest — and some issuers file no Form 4 at all."));
    }

    var excluded = obj(p.excluded), chips = [];
    for (var code in excluded) {
      if (!own(excluded, code)) continue;
      chips.push(h("span", { "class": "m-chip" }, [
        h("b", { text: code }), " " + count(excluded[code]),
        h("em", { "class": "tp-chipnote", text: TX_WORD[code] || "other" })
      ]));
    }
    if (chips.length) {
      kids.push(h("div", { "class": "m-chips" }, [
        head4("Excluded from every figure above"),
        h("div", { "class": "m-chiprow" }, chips),
        note(txt(p.excluded_note))
      ]));
    }
    if (txt(p.unpriced_note)) kids.push(note(txt(p.unpriced_note)));

    var caveats = arr(p.caveats);
    kids.push(h("div", { "class": "tp-caveats" }, [
      head4("What this cannot tell you"),
      h("ul", { "class": "tp-caveatlist" }, (caveats.length ? caveats : [
        "Sales are far weaker evidence than purchases. Insiders sell to diversify, to pay " +
        "tax, and on schedules adopted before anything they now know; they buy for one reason."
      ]).map(function (c) { return h("li", { text: txt(c) }); }))
    ]));

    kids.push(h("div", { "class": "tp-disclaimer" }, [
      h("p", { text: txt(p.disclaimer,
        "A summary of public Form 4 disclosure, scored by a rule written down in the source. " +
        "It carries no claim about what the stock will do next.") })
    ]));

    stage(el, kids,
      "Insider grade " + txt(p.grade, "none") + ", score " +
      (isNum(score) ? fx(score, 1) : "not computed") + " out of 100. " +
      plural(p.n_buys, "purchase") + " and " + plural(p.n_sells, "sale") +
      " in the window. " + (p.cluster === true ? "Cluster buying flagged." : "No cluster."));
  }


  /* ==================================================================== 4 */
  /* THE SCREENER                                                           */

  /* The Sharpe column is a plot, not a number, and every row shares one scale
   * so the luck line drawn in each of them lands on the same pixel and reads as
   * one continuous rule down the table. Fixed pixel geometry rather than a
   * scaled viewBox is what guarantees that: a viewBox that fits its cell would
   * put the rule in a different place on every row. */
  var SC_W = 230, SC_H = 22, SC_PAD = 6;

  /* WHICH COLUMN THE RANKING IS ON.
   *
   * The screener states it, on every payload, in `ranked_by`, and it orders its
   * rows on that key. This page therefore reads the key rather than naming a
   * column: a page that hardcodes "ranked on this" over a column is a page that
   * will keep saying it after the server has moved the ordering somewhere else,
   * and a label that contradicts the payload it is drawing is worse than no
   * label at all. Unknown keys are drawn under their own name with a generic
   * format, which is the honest thing to do with a ranking this file has never
   * heard of; what is NOT done is quietly falling back to a column it likes. */
  var RANK_COLS = {
    psr: {
      label: "PSR",
      fmt: function (v) { return fpct(v, 1); },
      tone: function (v) { return isNum(v) && v >= 0.95 ? "t-sig" : "t-dbt"; },
      gloss: "the probability this name's true Sharpe beats the luck line"
    },
    deflated_sharpe: {
      label: "deflated Sharpe",
      fmt: function (v) { return fx(v, 2, true); },
      tone: function (v) { return isNum(v) && v > 0 ? "t-sig" : "t-dbt"; },
      gloss: "the Sharpe after paying for the size of the search"
    },
    sharpe: {
      label: "Sharpe",
      fmt: function (v) { return fx(v, 2, true); },
      tone: function (v) { return isNum(v) && v > 0 ? "t-sig" : "t-dbt"; },
      gloss: "the raw risk-adjusted return, compared against nothing"
    }
  };

  var REPORTED_DEFL = {
    key: "deflated_sharpe", label: "deflated Sharpe",
    fmt: function (v) { return fx(v, 2, true); },
    tone: function (v) { return isNum(v) && v > 0 ? "t-sig" : "t-dbt"; }
  };

  /* The ranking column, or null when the payload did not say — in which case
   * the page says THAT rather than pointing at a column on its own authority. */
  function rankColumn(p, rows) {
    var k = txt(p.ranked_by);
    if (!k) return null;
    var present = false;
    for (var i = 0; i < rows.length; i++) {
      if (own(obj(rows[i]), k)) { present = true; break; }
    }
    if (!present) return null;
    var d = RANK_COLS[k];
    return {
      key: k,
      label: d ? d.label : k,
      fmt: d ? d.fmt : function (v) { return fx(v, 3, true); },
      tone: d ? d.tone : function () { return ""; },
      gloss: d ? d.gloss : "a column this page has no gloss for; the server ranks on it"
    };
  }

  /* The screener ships a note about its own ranking. Pull it out of the caveat
   * list at the foot and put it where the ranking claim is made, so the reader
   * meets it at the column rather than four screens below it. Matched on the
   * payload's own key so it moves when the ranking does. */
  function splitRankNote(notes, key) {
    var needle = ("ranked by " + txt(key)).toLowerCase();
    var found = null, rest = [];
    for (var i = 0; i < notes.length; i++) {
      var t = txt(notes[i]);
      if (!found && key && t.toLowerCase().indexOf(needle) >= 0) found = t;
      else rest.push(t);
    }
    return { note: found, rest: rest };
  }

  function scDomain(rows, line, p95) {
    var vals = [0];
    for (var i = 0; i < rows.length; i++) {
      var lo = nn(rows[i].sharpe_lo), hi = nn(rows[i].sharpe_hi), sr = nn(rows[i].sharpe);
      if (isNum(lo)) vals.push(lo);
      if (isNum(hi)) vals.push(hi);
      if (isNum(sr)) vals.push(sr);
    }
    if (isNum(line)) vals.push(line);
    if (isNum(p95)) vals.push(p95);
    var d = domain(vals, 0.06, true);
    return d || [-1, 1];
  }

  function scX(dom, v) {
    var span = (dom[1] - dom[0]) || 1;
    return SC_PAD + (v - dom[0]) / span * (SC_W - 2 * SC_PAD);
  }

  function scHeader(dom, line, p95) {
    var kids = [], ticks = niceTicks(dom[0], dom[1], 4), i;
    for (i = 0; i < ticks.length; i++) {
      var x = scX(dom, ticks[i]);
      kids.push(s("line", { "class": "mc-grid", x1: x.toFixed(1), y1: 22,
                            x2: x.toFixed(1), y2: 26 }));
      kids.push(s("text", { "class": "mc-tick", x: x.toFixed(1), y: 35,
                            "text-anchor": "middle", text: fx(ticks[i], 1) }));
    }
    if (isNum(line)) {
      var lx = scX(dom, line);
      kids.push(s("line", { "class": "tp-luck", x1: lx.toFixed(1), y1: 12,
                            x2: lx.toFixed(1), y2: 26 }));
      kids.push(s("text", { "class": "tp-lucklab", x: lx.toFixed(1), y: 9,
                            "text-anchor": lx > SC_W * 0.6 ? "end" : "start",
                            text: "luck " + fx(line, 2) }));
    }
    if (isNum(p95)) {
      var px = scX(dom, p95);
      kids.push(s("line", { "class": "tp-luck95", x1: px.toFixed(1), y1: 14,
                            x2: px.toFixed(1), y2: 26 }));
    }
    var label = "Sharpe axis" + (isNum(line) ? ", luck line at " + fx(line, 2) : "") +
                (isNum(p95) ? ", 95th percentile of luck at " + fx(p95, 2) : "");
    return s("svg", { "class": "tp-scaxis", width: SC_W, height: 38,
                      viewBox: "0 0 " + SC_W + " 38", role: "img", "aria-label": label },
      [s("title", { text: label })].concat(kids));
  }

  function scRow(row, dom, line, p95) {
    var lo = nn(row.sharpe_lo), hi = nn(row.sharpe_hi), sr = nn(row.sharpe);
    var beats = row.luck_adjusted === true;
    var kids = [];
    var zx = scX(dom, 0);
    kids.push(s("line", { "class": "mc-zero", x1: zx.toFixed(1), y1: 0,
                          x2: zx.toFixed(1), y2: SC_H }));
    if (isNum(p95)) {
      var px = scX(dom, p95);
      kids.push(s("line", { "class": "tp-luck95", x1: px.toFixed(1), y1: 0,
                            x2: px.toFixed(1), y2: SC_H }));
    }
    if (isNum(line)) {
      var lx = scX(dom, line);
      kids.push(s("line", { "class": "tp-luck", x1: lx.toFixed(1), y1: 0,
                            x2: lx.toFixed(1), y2: SC_H }));
    }
    if (isNum(lo) && isNum(hi)) {
      var x1 = scX(dom, lo), x2 = scX(dom, hi);
      kids.push(s("line", { "class": "tp-ci", x1: x1.toFixed(1), y1: SC_H / 2,
                            x2: x2.toFixed(1), y2: SC_H / 2 }));
      kids.push(s("line", { "class": "tp-cicap", x1: x1.toFixed(1), y1: SC_H / 2 - 4,
                            x2: x1.toFixed(1), y2: SC_H / 2 + 4 }));
      kids.push(s("line", { "class": "tp-cicap", x1: x2.toFixed(1), y1: SC_H / 2 - 4,
                            x2: x2.toFixed(1), y2: SC_H / 2 + 4 }));
    }
    if (isNum(sr)) {
      kids.push(s("circle", { "class": "tp-dot " + (beats ? "fl-sig" : "fl-dbt"),
                              cx: scX(dom, sr).toFixed(1), cy: SC_H / 2, r: 3.4 }));
    }
    var label = txt(row.ticker, "row") + " Sharpe " + fx(sr, 2) +
      (isNum(lo) && isNum(hi) ? ", interval " + fx(lo, 2) + " to " + fx(hi, 2)
                              : ", interval not computed") +
      /* No Sharpe, no claim about the luck line. The server's own flag is not
       * repeated over a number it could not compute. */
      (isNum(line) && isNum(sr)
        ? (beats ? ", above the luck line of " : ", below the luck line of ") + fx(line, 2)
        : isNum(line) ? ", not placeable against the luck line of " + fx(line, 2) : "");
    return s("svg", { "class": "tp-scrow", width: SC_W, height: SC_H,
                      viewBox: "0 0 " + SC_W + " " + SC_H, role: "img", "aria-label": label },
      [s("title", { text: label })].concat(kids));
  }

  function renderScreenInner(el, payload) {
    var p = obj(payload);
    var rows = arr(p.rows);
    var line = nn(p.expected_max_under_null);
    var p95 = nn(p.null_p95);
    var beat = nn(p.n_beating_luck);
    var v = obj(p.verdict);
    var kids = [];

    kids.push(h("div", { "class": "tp-schead" }, [
      h("h2", { "class": "tp-sctitle", text: txt(p.universe, "universe") }),
      subject(
        (txt(p.preset) ? "preset " + txt(p.preset) + "  ·  " : "") +
        (isNum(nn(p.years)) ? fx(nn(p.years), 1) + "y window  ·  " : "") +
        count(p.n_screened) + " screened  ·  " + count(p.n_with_data) + " with data  ·  " +
        count(p.n_passed) + " passed the filter  ·  " +
        count(p.n_bars_used) + " bars" + (txt(p.last_bar) ? " to " + txt(p.last_bar) : "")),
      h("p", { "class": "tp-scfilter", text:
        "filter: Sharpe ≥ " + fx(nn(p.min_sharpe), 2) + " and max drawdown ≤ " +
        fpct(nn(p.max_drawdown), 1) + ". Clearing a threshold someone chose is not evidence." })
    ]));

    /* The hero. When nothing beat the luck line, that IS the finding, and it is
     * the loudest thing on the panel. */
    if (isNum(beat) && beat === 0) {
      kids.push(h("div", { "class": "tp-luckbox tp-luckbox-bad" }, [
        h("p", { "class": "tp-luckbig", text: "0 names beat luck" }),
        h("p", { "class": "tp-lucksub", text:
          "Screening " + count(p.n_screened) + " names over " + count(p.n_bars_used) +
          " bars, a universe with NO edge at all would be expected to hand you a best Sharpe " +
          "of " + fx(line, 2) + (isNum(p95) ? " (p95 " + fx(p95, 2) + ")" : "") +
          ". Nothing in this ranking cleared that. The order below is a ranking of luck." })
      ]));
    } else if (isNum(beat)) {
      kids.push(h("div", { "class": "tp-luckbox" }, [
        h("p", { "class": "tp-luckbig", text: count(beat) + " of " + count(p.n_with_data) +
                                              " beat the luck line" }),
        h("p", { "class": "tp-lucksub", text:
          "A zero-edge universe of " + count(p.n_screened) + " names over " +
          count(p.n_bars_used) + " bars produces a best Sharpe of " + fx(line, 2) +
          (isNum(p95) ? " on average and " + fx(p95, 2) + " at the 95th percentile" : "") +
          ". Beating that line is the minimum bar, not a pass mark." })
      ]));
    }

    if (txt(v.headline)) {
      kids.push(h("p", { "class": "verdict " + txt(v.state, "doubt"), text: txt(v.headline) }));
    }
    if (txt(v.body)) kids.push(h("p", { "class": "verdict-sub", text: txt(v.body) }));

    var rc = rankColumn(p, rows);
    var split = splitRankNote(arr(p.notes), rc ? rc.key : "");

    if (rows.length) {
      var dom = scDomain(rows, line, p95);
      var body = rows.map(function (row, i) {
        var raw = nn(row.sharpe);
        /* `luck_adjusted` is only a verdict when there is a Sharpe behind it.
         * A row whose Sharpe could not be computed is not "within luck" and it
         * is certainly not beating it — it is unplaced, and says so. */
        var placed = isNum(raw) && isNum(line);
        var beats = placed && row.luck_adjusted === true;
        /* The verdict rides under the ticker rather than in a tenth column at
         * the far right. A wide table scrolls inside its wrapper, and the one
         * reading nobody should have to scroll for is whether the row cleared
         * the line. */
        var rankV = rc ? nn(row[rc.key]) : null;
        var cells = [
          h("td", { text: String(i + 1) }),
          h("td", { "class": "t-name" }, [
            txt(row.ticker, "?"),
            h("span", { "class": "tp-rowverdict " + (!placed ? "" : beats ? "t-sig" : "t-dbt"),
                        text: !placed ? "not placeable" : beats ? "beats luck" : "within luck" })
          ])
        ];
        if (rc) {
          cells.push(h("td", { "class": "tp-rank " + rc.tone(rankV), text: rc.fmt(rankV) }));
        }
        cells.push(h("td", { "class": "tp-sccell" }, [scRow(row, dom, line, p95)]));
        cells.push(h("td", { "class": "tp-shcell" }, [
          h("span", { "class": "tp-shv", text: isNum(raw) ? fx(raw, 2, true) : DASH }),
          h("span", { "class": "tp-shci", text:
            (isNum(nn(row.sharpe_lo)) && isNum(nn(row.sharpe_hi)))
              ? "[" + fx(nn(row.sharpe_lo), 2) + ", " + fx(nn(row.sharpe_hi), 2) + "]"
              : "interval " + DASH })
        ]));
        /* Still reported, because it is still a real figure and the payload
         * still carries it. It is simply not what anything was ordered on. */
        if (!rc || rc.key !== REPORTED_DEFL.key) {
          var defl = nn(row[REPORTED_DEFL.key]);
          cells.push(h("td", { "class": "tp-reported " + REPORTED_DEFL.tone(defl),
                               text: REPORTED_DEFL.fmt(defl) }));
        }
        cells.push(h("td", { "class": "t-dbt", text: fpct(nn(row.max_drawdown), 1) }));
        cells.push(h("td", { text: fpct(nn(row.cagr), 1, true) }));
        cells.push(h("td", { text: count(row.n_bars) }));
        return h("tr", { "class": !placed ? "" : beats ? "tp-beats" : "tp-within" }, cells);
      });

      var headCells = [
        h("th", { scope: "col", text: "#" }),
        h("th", { scope: "col" }, [h("span", { text: "ticker" }),
                                   h("em", { "class": "tp-rankmark tp-vmark",
                                             text: "and the luck verdict" })])
      ];
      if (rc) {
        headCells.push(h("th", { scope: "col" }, [
          h("span", { text: rc.label }),
          h("em", { "class": "tp-rankmark", text: "ranked on this" })
        ]));
      }
      headCells.push(h("th", { scope: "col", "class": "tp-scaxiscell" }, [
        h("span", { text: "Sharpe, against the luck line" }),
        scHeader(dom, line, p95)
      ]));
      headCells.push(h("th", { scope: "col" }, [
        h("span", { text: "Sharpe" }),
        h("em", { "class": "tp-rankmark tp-vmark", text: "95% interval" })
      ]));
      if (!rc || rc.key !== REPORTED_DEFL.key) {
        headCells.push(h("th", { scope: "col" }, [
          h("span", { text: REPORTED_DEFL.label }),
          h("em", { "class": "tp-rankmark tp-vmark", text: "reported, not ranked on" })
        ]));
      }
      headCells.push(h("th", { scope: "col", text: "max DD" }));
      headCells.push(h("th", { scope: "col", text: "CAGR" }));
      headCells.push(h("th", { scope: "col", text: "bars" }));

      kids.push(h("div", { "class": "m-tablewrap" }, [
        h("table", { "class": "m-table tp-screen" }, [
          h("caption", { text:
            (rc ? "Ranked by " + rc.key + " — " + rc.gloss + "."
                : "This payload did not say what it was ranked by, so no column is marked " +
                  "as the ranking. The order below is the server's; what it is an order of " +
                  "is not stated.") +
            " The amber rule down the Sharpe column is what a screen this size gets for free." }),
          h("thead", {}, [h("tr", {}, headCells)]),
          h("tbody", {}, body)
        ])
      ]));

      /* The payload's own sentence about its ranking, at the table rather than
       * in the footnotes it used to be buried in. */
      if (split.note) kids.push(note(split.note));
      if (isNum(nn(p.n_psr_clearing))) {
        kids.push(note(count(p.n_psr_clearing) + " of " + count(p.n_with_data) +
                       " names put the probability their true Sharpe beats the luck line at " +
                       "95% or better. That is the strict reading of this leaderboard, and " +
                       "on a short window it is close to unreachable — which is the correct " +
                       "amount of unreachable."));
      }

      kids.push(h("div", { "class": "m-legend tp-sckey" }, [
        key("fl-sig", "Sharpe, above the luck line", "k-dot"),
        key("fl-dbt", "Sharpe, within luck", "k-dot"),
        key("tp-k-ci", "95% block-bootstrap interval"),
        key("tp-k-luck", "expected best Sharpe under the null"),
        key("tp-k-luck95", "95th percentile of that null")
      ]));
    } else {
      kids.push(gone("Nothing cleared the filter, so the table is empty. It is empty because " +
                     "the filter is empty — no name was substituted in to fill it."));
    }

    /* The ranking note has been lifted out and drawn at the table; the rest of
     * the payload's notes stay here. */
    var notes = split.rest;
    kids.push(h("div", { "class": "tp-caveats" }, [
      head4("What this ranking is not"),
      h("ul", { "class": "tp-caveatlist" }, (notes.length ? notes : [
        "Universes are today's index members, so names that were delisted or dropped are " +
        "absent and these results are survivorship-biased upward."
      ]).map(function (n) { return h("li", { text: txt(n) }); }))
    ]));

    var missing = arr(p.missing);
    if (missing.length) {
      kids.push(note(plural(missing.length, "name") + " had no usable history over this " +
                     "window and " + (missing.length === 1 ? "was" : "were") +
                     " dropped rather than defaulted: " +
                     missing.slice(0, 40).map(function (m) { return txt(m); }).join(", ") +
                     (missing.length > 40 ? ", …" : "")));
    }

    var prov = obj(p.provenance), provBits = [];
    for (var pk in prov) {
      if (!own(prov, pk)) continue;
      provBits.push(pk + " " + txt(prov[pk]));
    }
    if (provBits.length) kids.push(note("provenance: " + provBits.join("  ·  ")));

    stage(el, kids,
      txt(p.universe, "universe") + ": " + count(p.n_with_data) + " names measured, " +
      count(p.n_passed) + " passed the filter, " +
      (isNum(beat) ? count(beat) : "an unstated number of") + " beat the luck line of " +
      fx(line, 2) + ". " +
      (rc ? "Ranked by " + rc.key + ". " : "The payload did not say what it ranked on. ") +
      txt(v.headline));
  }


  /* ---------------------------------------------------------------- export */

  window.__TAPE__ = {
    renderScore: guard("score", renderScoreInner),
    renderDossier: guard("dossier", renderDossierInner),
    renderInsider: guard("insider", renderInsiderInner),
    renderScreen: guard("screen", renderScreenInner),
    kinds: KINDS
  };

})();
