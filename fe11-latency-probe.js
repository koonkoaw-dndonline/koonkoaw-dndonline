/*
 * FE-11/FE-12 grid latency probe — measures on a REAL phone what automated
 * tests cannot: touch-to-highlight latency, and whether a board replacement
 * during an open picker destroys the player's pick.
 *
 * It is read-only instrumentation: it never taps, never submits, never writes
 * to the database, and never changes game state. It only listens and times.
 *
 * Load it (see docs/runbooks/FE11_MOBILE_LATENCY_RUNBOOK.md), play normally,
 * then run  __fe11.report()  to print the numbers.
 *
 * language-impact: none — diagnostic tool, not shipped to players.
 */
(function attachFe11LatencyProbe(root) {
  "use strict";
  if (root.__fe11 && root.__fe11.stop) root.__fe11.stop();

  var CELL_SEL = "[data-grid-cell]";
  var WATCHED = ["fill", "stroke", "stroke-width"];

  var taps = [];            // finger-up -> highlight painted (ms)
  var confirms = [];        // confirm tap -> board/draft settled (ms)
  var replacements = [];    // board replacements seen while a picker was open
  var pickLoss = 0;         // replacements that erased the highlighted cell
  var expiries = [];        // idle expiry -> board flush
  var pending = null;       // { at, x, y }
  var lastHighlight = null; // cell label currently highlighted
  var pendingConfirm = null;
  var observers = [];
  var started = Date.now();

  function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }

  function gridRoot() {
    var cell = document.querySelector(CELL_SEL);
    if (!cell) return null;
    var svg = cell.closest ? cell.closest("svg") : null;
    return svg || cell.parentNode;
  }

  function highlightedCell() {
    var nodes = document.querySelectorAll(CELL_SEL);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var stroke = String(n.getAttribute("stroke") || "").toLowerCase();
      var fill = String(n.getAttribute("fill") || "").toLowerCase();
      // selection is expressed as a white stroke or the strong center fill
      if (stroke === "#fff" || stroke === "#ffffff" || fill.indexOf("0.62") >= 0) {
        return n.getAttribute("data-grid-cell") || null;
      }
    }
    return null;
  }

  // paint-accurate stamp: mutation fires before the frame is presented
  function afterPaint(fn) {
    if (root.requestAnimationFrame) {
      requestAnimationFrame(function () { requestAnimationFrame(function () { fn(now()); }); });
    } else { fn(now()); }
  }

  function onPointerUp(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (!t.closest(CELL_SEL) && !t.closest("svg")) return;
    pending = { at: now(), cell: t.closest(CELL_SEL) ? t.closest(CELL_SEL).getAttribute("data-grid-cell") : null };
  }

  function onClickAnywhere(ev) {
    var t = ev.target;
    if (!t || !t.textContent) return;
    var label = String(t.textContent).trim().slice(0, 24);
    if (/ยืนยัน|confirm|ตกลง/i.test(label)) pendingConfirm = { at: now(), label: label };
  }

  function watchCells() {
    var attrObserver = new MutationObserver(function (records) {
      var sawSelectionChange = false;
      for (var i = 0; i < records.length; i++) {
        if (records[i].type === "attributes" && WATCHED.indexOf(records[i].attributeName) >= 0) {
          sawSelectionChange = true;
          break;
        }
      }
      if (!sawSelectionChange) return;
      var cell = highlightedCell();
      if (cell) lastHighlight = cell;
      if (pending) {
        var startedAt = pending.at;
        pending = null;
        afterPaint(function (paintedAt) { taps.push(Math.round(paintedAt - startedAt)); });
      }
      if (pendingConfirm) {
        var confirmAt = pendingConfirm.at;
        pendingConfirm = null;
        afterPaint(function (paintedAt) { confirms.push(Math.round(paintedAt - confirmAt)); });
      }
    });
    var g = gridRoot();
    if (g) {
      attrObserver.observe(g, { attributes: true, subtree: true, attributeFilter: WATCHED });
      observers.push(attrObserver);
    }
    return !!g;
  }

  function watchReplacement() {
    var host = document.body;
    var childObserver = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type !== "childList") continue;
        var touchedGrid = false;
        [].forEach.call(r.addedNodes, function (n) {
          if (n.querySelector && n.querySelector(CELL_SEL)) touchedGrid = true;
          if (n.getAttribute && n.getAttribute("data-grid-cell")) touchedGrid = true;
        });
        if (!touchedGrid) continue;
        var hadPick = lastHighlight;
        replacements.push({ at: Math.round(now()), hadPick: hadPick });
        if (hadPick) {
          // give the new board one frame, then check whether the pick survived
          afterPaint(function () {
            var still = highlightedCell();
            if (still !== hadPick) pickLoss++;
          });
        }
      }
    });
    childObserver.observe(host, { childList: true, subtree: true });
    observers.push(childObserver);
  }

  function pct(list, p) {
    if (!list.length) return null;
    var sorted = list.slice().sort(function (a, b) { return a - b; });
    var idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
  }

  function env() {
    var c = root.navigator && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    return {
      ua: String(root.navigator && navigator.userAgent || "").slice(0, 180),
      viewport: root.innerWidth + "x" + root.innerHeight,
      dpr: root.devicePixelRatio || 1,
      connection: c ? (c.effectiveType || "?") + (c.downlink ? " " + c.downlink + "Mbps" : "") : "unknown",
      saveData: c && typeof c.saveData === "boolean" ? c.saveData : "unknown",
      leaseLoaded: !!root.TTRPG_GRID_BOARD_REPLACEMENT_LEASE,
      leaseBuild: root.TTRPG_GRID_BOARD_REPLACEMENT_LEASE ? root.TTRPG_GRID_BOARD_REPLACEMENT_LEASE.build : null,
      frontendBuild: (function () {
        try { return String(root.FRONTEND_BUILD || "(not exposed)"); } catch (_e) { return "(not exposed)"; }
      })()
    };
  }

  var api = {
    taps: taps,
    confirms: confirms,
    replacements: replacements,
    reset: function () { taps.length = 0; confirms.length = 0; replacements.length = 0; pickLoss = 0; expiries.length = 0; started = Date.now(); },
    markExpiry: function () { expiries.push(Math.round(now())); },
    report: function () {
      var out = {
        minutes_running: Math.round((Date.now() - started) / 6000) / 10,
        tap_to_highlight_ms: { n: taps.length, median: pct(taps, 50), p95: pct(taps, 95), max: taps.length ? Math.max.apply(null, taps) : null },
        confirm_to_settle_ms: { n: confirms.length, median: pct(confirms, 50), p95: pct(confirms, 95) },
        board_replacements_during_pick: replacements.filter(function (r) { return r.hadPick; }).length,
        picks_destroyed_by_replacement: pickLoss,
        idle_expiry_events: expiries.length,
        env: env()
      };
      try { console.log(JSON.stringify(out, null, 2)); } catch (_e) { console.log(out); }
      return out;
    },
    stop: function () { observers.forEach(function (o) { try { o.disconnect(); } catch (_e) {} }); observers.length = 0; root.removeEventListener("pointerup", onPointerUp, true); root.removeEventListener("touchend", onPointerUp, true); root.removeEventListener("click", onClickAnywhere, true); }
  };

  root.addEventListener("pointerup", onPointerUp, true);
  root.addEventListener("touchend", onPointerUp, true);
  root.addEventListener("click", onClickAnywhere, true);
  var attached = watchCells();
  watchReplacement();

  root.__fe11 = api;
  console.log(
    attached
      ? "FE-11 probe armed. Open a picker and tap normally, then run: __fe11.report()"
      : "FE-11 probe armed, but no grid is on screen yet. Open a combat with a board, then re-run the loader."
  );
})(window);
