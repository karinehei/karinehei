(function () {
  "use strict";

  var DURATION = 12000;
  var STAGE_W = 960;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var REDUCED_MOTION_TIME = 10000;
  var QUERY = { x: 428, y: 178 };

  var MUTED = { r: 148, g: 163, b: 184, a: 0.22 };
  var BLUE = { r: 96, g: 165, b: 250, a: 0.85 };
  var TEAL = { r: 45, g: 212, b: 191, a: 0.95 };
  var BG_IDLE = { r: 11, g: 18, b: 32, a: 0.92 };
  var BG_BLUE = { r: 96, g: 165, b: 250, a: 0.12 };
  var BG_TEAL = { r: 45, g: 212, b: 191, a: 0.1 };

  var ROW_X = 100;
  var ROW_W = 760;
  var ROW_H = 48;
  var ROW_GAP = 8;
  var ROW_START_Y = 52;
  var DOT = 14;
  var CHIP_W = 252;
  var CHIP_H = 44;
  var CHIP_GAP = 16;
  var CHIP_Y = 236;

  var FIELD_POINTS = [
    { x: 118, y: 72, r: 2.4 },
    { x: 168, y: 118, r: 2.8 },
    { x: 108, y: 178, r: 2.2 },
    { x: 148, y: 248, r: 2.6 },
    { x: 198, y: 64, r: 2.3 },
    { x: 228, y: 158, r: 2.7 },
    { x: 188, y: 292, r: 2.5 },
    { x: 268, y: 88, r: 2.2 },
    { x: 278, y: 268, r: 2.9 },
    { x: 348, y: 58, r: 2.4 },
    { x: 368, y: 248, r: 2.6 },
    { x: 398, y: 98, r: 2.3 },
    { x: 408, y: 298, r: 2.8 },
    { x: 458, y: 64, r: 2.5 },
    { x: 478, y: 178, r: 2.2 },
    { x: 518, y: 292, r: 2.7 },
    { x: 578, y: 72, r: 2.4 },
    { x: 598, y: 268, r: 2.6 },
    { x: 668, y: 98, r: 2.3 },
    { x: 688, y: 168, r: 2.8 },
    { x: 708, y: 248, r: 2.4 },
    { x: 758, y: 88, r: 2.6 },
    { x: 778, y: 198, r: 2.2 },
    { x: 808, y: 278, r: 2.9 },
    { x: 838, y: 138, r: 2.5 },
    { x: 88, y: 108, r: 2.3 },
    { x: 98, y: 308, r: 2.7 },
    { x: 848, y: 48, r: 2.4 }
  ];

  var CANDIDATES = [
    {
      id: "source-metadata",
      title: "Source metadata",
      badge: "[1]",
      selected: true,
      scatter: { x: 318, y: 116 },
      retrieveIndex: 2,
      rankIndex: 0
    },
    {
      id: "citation-mapping",
      title: "Citation mapping",
      badge: "[2]",
      selected: true,
      scatter: { x: 548, y: 128 },
      retrieveIndex: 4,
      rankIndex: 1
    },
    {
      id: "evidence-checks",
      title: "Evidence checks",
      badge: "[3]",
      selected: true,
      scatter: { x: 498, y: 238 },
      retrieveIndex: 3,
      rankIndex: 2
    },
    {
      id: "token-overlap",
      title: "Token overlap notes",
      badge: "",
      selected: false,
      scatter: { x: 252, y: 214 },
      retrieveIndex: 1,
      rankIndex: 3
    },
    {
      id: "adjacent-snippets",
      title: "Adjacent snippets",
      badge: "",
      selected: false,
      scatter: { x: 628, y: 208 },
      retrieveIndex: 0,
      rankIndex: 4
    }
  ];

  var els = {};
  var fieldEls = [];
  var connectorEls = {};
  var candidateEls = {};
  var playing = false;
  var timeMs = 0;
  var lastTs = null;
  var rafId = 0;
  var seeking = false;

  function clamp(n, min, max) {
    return n < min ? min : n > max ? max : n;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clampTime(ms) {
    var t = Number(ms);
    if (!isFinite(t)) return 0;
    return clamp(t, 0, DURATION);
  }

  function wrapPlaybackTime(ms) {
    var t = Number(ms);
    if (!isFinite(t)) return 0;
    var m = t % DURATION;
    return m < 0 ? m + DURATION : m;
  }

  function range(t, start, end) {
    if (end <= start) return t >= start ? 1 : 0;
    return clamp((t - start) / (end - start), 0, 1);
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function smooth(t, start, end) {
    return easeInOut(range(t, start, end));
  }

  function interpolateColor(a, b, t) {
    t = clamp(t, 0, 1);
    return {
      r: lerp(a.r, b.r, t),
      g: lerp(a.g, b.g, t),
      b: lerp(a.b, b.b, t),
      a: lerp(a.a, b.a, t)
    };
  }

  function colorToCss(color) {
    return (
      "rgba(" +
      Math.round(color.r) +
      ", " +
      Math.round(color.g) +
      ", " +
      Math.round(color.b) +
      ", " +
      Number(color.a).toFixed(3) +
      ")"
    );
  }

  function rowY(index) {
    return ROW_START_Y + index * (ROW_H + ROW_GAP);
  }

  function chipLayout(rankIndex) {
    var count = 3;
    var total = count * CHIP_W + (count - 1) * CHIP_GAP;
    var start = (STAGE_W - total) / 2;
    return {
      x: start + rankIndex * (CHIP_W + CHIP_GAP),
      y: CHIP_Y,
      w: CHIP_W,
      h: CHIP_H
    };
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function phaseAt(t) {
    if (t < 2000) return "QUESTION";
    if (t < 5000) return "RETRIEVE";
    if (t < 8000) return "RERANK";
    return "ANSWER";
  }

  function sceneAt(t) {
    t = clampTime(t);

    var question = 1 - smooth(t, 1620, 2140);

    var field = smooth(t, 1680, 2320) * (1 - smooth(t, 4980, 5680));
    var query = smooth(t, 1980, 2480) * (1 - smooth(t, 4980, 5600));
    var mapLabel = smooth(t, 2280, 2680) * (1 - smooth(t, 4980, 5420));

    var expand = smooth(t, 5080, 5880);
    var reorder = t < 6740 ? 0 : 1;
    var toChips = t < 7640 ? 0 : 1;
    var listAlive = smooth(t, 5080, 5600);

    var answer = smooth(t, 7400, 8000);
    var demoLabel = smooth(t, 7600, 8000);

    var selectT = smooth(t, 6480, 7300);
    var phase = phaseAt(t);
    var rerankCaption = smooth(t, 5080, 5480) * (1 - smooth(t, 7400, 7920));

    var candidates = CANDIDATES.map(function (item) {
      var appear = smooth(
        t,
        2360 + item.retrieveIndex * 140,
        2760 + item.retrieveIndex * 140
      );
      var dotOpacity = appear * field;
      // Fade out in retrieval order before changing positions.
var rankOut = 1 - smooth(
  t,
  6300 + item.retrieveIndex * 40,
  6520 + item.retrieveIndex * 40
);

// Fade back in at the final ranked positions.
var rankIn = smooth(
  t,
  6780 + item.rankIndex * 40,
  7000 + item.rankIndex * 40
);

var rankVisibility = t < 6740 ? rankOut : rankIn;

// Fade rows out before switching to the source-chip layout.
var chipOut = 1 - smooth(t, 7380, 7600);

// Reveal selected source chips; leave other candidates hidden.
var chipIn = item.selected
  ? smooth(
      t,
      7660 + item.rankIndex * 35,
      7880 + item.rankIndex * 35
    )
  : 0;

var chipVisibility = t < 7640 ? chipOut : chipIn;

var listOpacity = listAlive * rankVisibility * chipVisibility;

      var retrieveCenter = {
        x: ROW_X + ROW_W / 2,
        y: rowY(item.retrieveIndex) + ROW_H / 2
      };
      var rankCenter = {
        x: ROW_X + ROW_W / 2,
        y: rowY(item.rankIndex) + ROW_H / 2
      };
      var listCenter = {
        x: lerp(retrieveCenter.x, rankCenter.x, reorder),
        y: lerp(retrieveCenter.y, rankCenter.y, reorder)
      };

      var chip = item.selected
        ? chipLayout(item.rankIndex)
        : { x: ROW_X + ROW_W / 2 - 70, y: rowY(item.rankIndex) + 4, w: 140, h: 28 };

      var chipCenter = { x: chip.x + chip.w / 2, y: chip.y + chip.h / 2 };

      var cx = lerp(
        lerp(item.scatter.x, listCenter.x, expand),
        chipCenter.x,
        item.selected ? toChips : 0
      );
      var cy = lerp(
        lerp(item.scatter.y, listCenter.y, expand),
        chipCenter.y,
        item.selected ? toChips : 0
      );

      var listW = lerp(DOT, ROW_W, expand);
      var listH = lerp(DOT, ROW_H, expand);
      var w = lerp(listW, chip.w, item.selected ? toChips : toChips * 0.35);
      var h = lerp(listH, chip.h, item.selected ? toChips : toChips * 0.35);

      var fadeLoser = item.selected ? 1 : 1 - 0.72 * selectT;
      var loserExit = item.selected ? 1 : 1 - toChips;
      var opacity = Math.max(dotOpacity, listOpacity) * fadeLoser * loserExit;

      var radius = lerp(DOT / 2, lerp(8, item.selected ? 18 : 8, toChips), expand);
      var titleOpacity = clamp((expand - 0.32) / 0.42, 0, 1) * opacity;
      var badgeOpacity = item.selected ? selectT * (0.35 + 0.65 * expand) * opacity : 0;

      var dotBorder = interpolateColor(MUTED, BLUE, appear);
      var rowBorder = item.selected
        ? interpolateColor(BLUE, TEAL, selectT)
        : interpolateColor(BLUE, MUTED, selectT);
      var border = interpolateColor(dotBorder, rowBorder, expand);

      var dotBg = interpolateColor(BG_IDLE, BG_BLUE, appear);
      var rowBg = item.selected ? interpolateColor(BG_IDLE, BG_TEAL, selectT) : BG_IDLE;
      var bg = interpolateColor(dotBg, rowBg, expand);

      var accent = item.selected
        ? interpolateColor(BLUE, TEAL, selectT)
        : interpolateColor(BLUE, MUTED, selectT);
      var chipT = item.selected ? toChips : 0;
      var barStrength = expand > 0.2 ? clamp(1 - chipT / 0.35, 0, 1) : 0;

      return {
        id: item.id,
        x: cx - w / 2,
        y: cy - h / 2,
        w: w,
        h: h,
        radius: radius,
        opacity: opacity,
        titleOpacity: titleOpacity,
        badgeOpacity: badgeOpacity,
        border: border,
        bg: bg,
        accent: accent,
        barStrength: barStrength,
        pad: lerp(0, lerp(18, 14, chipT), clamp((expand - 0.2) / 0.6, 0, 1)),
        align: chipT > 0.55 ? "center" : "flex-start",
        connector: appear * field * 0.28
      };
    });

    return {
      question: question,
      questionY: lerp(6, 0, smooth(t, 0, 220)),
      field: field,
      query: query,
      mapLabel: mapLabel,
      answer: answer,
      demoLabel: demoLabel,
      phase: phase,
      rerankCaption: rerankCaption,
      candidates: candidates
    };
  }

  function finiteOr(n, fallback) {
    return isFinite(n) ? n : fallback;
  }

  function apply(scene) {
    els.question.style.opacity = String(finiteOr(scene.question, 0));
    els.question.style.transform = "translateY(" + finiteOr(scene.questionY, 0) + "px)";

    els.grid.style.opacity = String(finiteOr(scene.field, 0));
    els.query.style.opacity = String(finiteOr(scene.query, 0));
    els.query.setAttribute(
      "transform",
      "translate(" + QUERY.x + " " + QUERY.y + ")"
    );

    els.queryCaption.style.opacity = String(finiteOr(scene.query, 0));
    els.queryCaption.style.transform =
      "translate(" + (QUERY.x + 20) + "px, " + (QUERY.y + 22) + "px)";

    els.mapLabel.style.opacity = String(finiteOr(scene.mapLabel, 0));
    els.demoLabel.style.opacity = String(finiteOr(scene.demoLabel, 0));
    els.phaseLabel.textContent = scene.phase;
    els.phaseLabel.style.opacity = "1";
    els.rerankCaption.style.opacity = String(finiteOr(scene.rerankCaption, 0));

    els.answer.style.opacity = String(finiteOr(scene.answer, 0));

    var i;
    for (i = 0; i < fieldEls.length; i += 1) {
      fieldEls[i].style.opacity = String(finiteOr(scene.field, 0) * 0.62);
    }

    for (i = 0; i < scene.candidates.length; i += 1) {
      var view = scene.candidates[i];
      var node = candidateEls[view.id];
      var border = colorToCss(view.border);
      var bg = colorToCss(view.bg);
      var accent = colorToCss(view.accent);

      node.style.opacity = String(finiteOr(view.opacity, 0));
      node.style.transform =
        "translate(" + finiteOr(view.x, 0) + "px, " + finiteOr(view.y, 0) + "px)";
      node.style.width = finiteOr(view.w, 0) + "px";
      node.style.height = finiteOr(view.h, 0) + "px";
      node.style.borderRadius = finiteOr(view.radius, 0) + "px";
      node.style.borderColor = border;
      node.style.background = bg;
      node.style.boxShadow =
        view.barStrength > 0.02 ? "inset 3px 0 0 " + accent : "none";
      node.style.paddingLeft = finiteOr(view.pad, 0) + "px";
      node.style.paddingRight = finiteOr(view.pad, 0) + "px";
      node.style.gap = view.pad > 4 ? "12px" : "0px";
      node.style.justifyContent = view.align;

      var badge = node.querySelector(".candidate-badge");
      var title = node.querySelector(".candidate-title");
      badge.style.opacity = String(finiteOr(view.badgeOpacity, 0));
      title.style.opacity = String(finiteOr(view.titleOpacity, 0));

      connectorEls[view.id].style.opacity = String(finiteOr(view.connector, 0));
    }

    syncTimeline();
  }

  function formatTime(ms) {
    return (ms / 1000).toFixed(1);
  }

  function syncTimeline() {
    if (!seeking) {
      els.timeline.value = String(Math.round(timeMs));
    }
    els.timeline.setAttribute("aria-valuenow", String(Math.round(timeMs)));
    els.timeline.setAttribute(
      "aria-valuetext",
      formatTime(timeMs) + " seconds of 12.0"
    );
    els.timeDisplay.textContent = formatTime(timeMs) + " / 12.0s";
  }

  function updatePlayButton() {
    els.btnPlay.textContent = playing ? "Pause" : "Play";
  }

  function renderAt(ms) {
    timeMs = clampTime(ms);
    apply(sceneAt(timeMs));
  }

  function pause() {
    playing = false;
    lastTs = null;
    updatePlayButton();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function play() {
    if (playing) return;
    playing = true;
    lastTs = null;
    updatePlayButton();
    rafId = requestAnimationFrame(tick);
  }

  function restart() {
    renderAt(0);
    if (prefersReducedMotion()) {
      pause();
      return;
    }
    if (!playing) play();
  }

  function tick(now) {
    if (!playing) {
      rafId = 0;
      return;
    }
    if (lastTs == null) lastTs = now;
    var dt = now - lastTs;
    lastTs = now;
    if (dt > 250) dt = 16.67;
    timeMs = wrapPlaybackTime(timeMs + dt);
    apply(sceneAt(timeMs));
    rafId = requestAnimationFrame(tick);
  }

  function fitStage() {
    var width = els.stageFrame.clientWidth;
    var scale = width / STAGE_W;
    if (!isFinite(scale) || scale <= 0) scale = 1;
    els.stageInner.style.transform = "scale(" + scale + ")";
  }

  function buildField() {
    var group = els.fieldPoints;
    FIELD_POINTS.forEach(function (point) {
      var circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", String(point.r));
      circle.setAttribute("fill", "#94A3B8");
      group.appendChild(circle);
      fieldEls.push(circle);
    });
  }

  function buildConnectors() {
    CANDIDATES.forEach(function (item) {
      var line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(QUERY.x));
      line.setAttribute("y1", String(QUERY.y));
      line.setAttribute("x2", String(item.scatter.x));
      line.setAttribute("y2", String(item.scatter.y));
      els.connectors.appendChild(line);
      connectorEls[item.id] = line;
    });
  }

  function buildCandidates() {
    CANDIDATES.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "candidate";
      li.setAttribute("data-id", item.id);

      var badge = document.createElement("span");
      badge.className = "candidate-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = item.badge;

      var title = document.createElement("span");
      title.className = "candidate-title";
      title.setAttribute("aria-hidden", "true");
      title.textContent = item.title;

      li.appendChild(badge);
      li.appendChild(title);
      els.candidates.appendChild(li);
      candidateEls[item.id] = li;
    });
  }

  function bindControls() {
    els.btnPlay.addEventListener("click", function () {
      if (playing) pause();
      else play();
    });

    els.btnRestart.addEventListener("click", restart);

    els.timeline.addEventListener("pointerdown", function () {
      seeking = true;
      pause();
    });

    els.timeline.addEventListener("input", function () {
      seeking = true;
      if (playing) pause();
      renderAt(Number(els.timeline.value));
    });

    function endSeek() {
      seeking = false;
      syncTimeline();
    }

    els.timeline.addEventListener("pointerup", endSeek);
    els.timeline.addEventListener("keyup", endSeek);
    els.timeline.addEventListener("change", endSeek);
  }

  function init() {
    els.stageFrame = document.getElementById("stage-frame");
    els.stageInner = document.getElementById("stage-inner");
    els.grid = document.getElementById("grid");
    els.connectors = document.getElementById("connectors");
    els.fieldPoints = document.getElementById("field-points");
    els.query = document.getElementById("query");
    els.queryCaption = document.getElementById("query-caption");
    els.question = document.getElementById("question");
    els.answer = document.getElementById("answer");
    els.mapLabel = document.getElementById("map-label");
    els.demoLabel = document.getElementById("demo-label");
    els.phaseLabel = document.getElementById("phase-label");
    els.rerankCaption = document.getElementById("rerank-caption");
    els.candidates = document.getElementById("candidates");
    els.btnPlay = document.getElementById("btn-play");
    els.btnRestart = document.getElementById("btn-restart");
    els.timeline = document.getElementById("timeline");
    els.timeDisplay = document.getElementById("time-display");

    buildField();
    buildConnectors();
    buildCandidates();
    bindControls();
    fitStage();

    if (window.ResizeObserver) {
      new ResizeObserver(fitStage).observe(els.stageFrame);
    } else {
      window.addEventListener("resize", fitStage);
    }

    document.addEventListener("visibilitychange", function () {
      lastTs = null;
    });

    window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .addEventListener("change", function (event) {
        if (event.matches) {
          pause();
          renderAt(REDUCED_MOTION_TIME);
        }
      });

    window.signalDemo = {
      duration: DURATION,
      renderAt: renderAt,
      pause: pause,
      play: play,
      restart: restart
    };

    if (prefersReducedMotion()) {
      pause();
      renderAt(REDUCED_MOTION_TIME);
    } else {
      renderAt(0);
      play();
    }
  }

  init();
})();
