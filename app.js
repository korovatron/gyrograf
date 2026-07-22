// --actual-vh fixes intermittent iOS PWA viewport height races after launch and rotation.
function fixIOSViewportBug() {
  let lastKnownHeight = 0;

  const setActualVH = () => {
    let viewportHeight = window.innerHeight;
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true;
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isPortrait = window.innerHeight > window.innerWidth;

    if (isIOS && isPWA && isPortrait) {
      const screenPortraitHeight = Math.max(window.screen.height, window.screen.width);
      const difference = screenPortraitHeight - viewportHeight;

      if (difference > 15) {
        const computedStyle = getComputedStyle(document.documentElement);
        const safeTop = computedStyle.getPropertyValue('--safe-area-top');
        const safeTopPx = parseInt(safeTop, 10) || 0;
        const heightWithSafeTop = viewportHeight + safeTopPx;
        const remainingShortfall = screenPortraitHeight - heightWithSafeTop;

        if (remainingShortfall > 8 && difference <= 180) {
          viewportHeight = screenPortraitHeight;
        } else if (safeTopPx > 0) {
          viewportHeight = heightWithSafeTop;
        } else if (difference <= 180) {
          viewportHeight = screenPortraitHeight;
        }
      }
    }

    document.documentElement.style.setProperty('--actual-vh', `${viewportHeight}px`);
    if (document.body) {
      void document.body.offsetHeight;
    }

    if (lastKnownHeight > 0 && Math.abs(viewportHeight - lastKnownHeight) > 30) {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }

    lastKnownHeight = viewportHeight;
  };

  const scheduleViewportHeightUpdates = (delays) => {
    delays.forEach((delay) => {
      setTimeout(setActualVH, delay);
    });
  };

  const scheduleLayoutSyncs = (delays) => {
    delays.forEach((delay) => {
      setTimeout(() => {
        scheduleLayoutGeometrySync({ fitView: true });
      }, delay + 20);
    });
  };

  setActualVH();
  scheduleViewportHeightUpdates([50, 150, 300, 500, 800, 1200]);

  window.addEventListener('resize', setActualVH);
  window.addEventListener('orientationchange', () => {
    const delays = [50, 100, 200, 350, 600, 900, 1300, 1800];
    scheduleViewportHeightUpdates(delays);
    scheduleLayoutSyncs(delays);
  });
  if (screen.orientation) {
    screen.orientation.addEventListener('change', () => {
      const delays = [50, 100, 200, 350, 600, 900, 1300, 1800];
      scheduleViewportHeightUpdates(delays);
      scheduleLayoutSyncs(delays);
    });
  }
  window.addEventListener('pageshow', () => {
    const delays = [0, 50, 200, 500, 900];
    scheduleViewportHeightUpdates(delays);
    scheduleLayoutSyncs(delays);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const delays = [50, 200, 500, 900];
      scheduleViewportHeightUpdates(delays);
      scheduleLayoutSyncs(delays);
    }
  });
}

fixIOSViewportBug();

const canvas = document.getElementById("stage");
const mainCtx = canvas.getContext("2d");
let ctx = mainCtx;

function getCanvasRasterMetrics() {
  const rect = canvas.getBoundingClientRect();
  const fallbackScale = window.devicePixelRatio || 1;
  const widthCss = rect.width || 0;
  const heightCss = rect.height || 0;
  const scaleX = widthCss > 0 ? canvas.width / widthCss : fallbackScale;
  const scaleY = heightCss > 0 ? canvas.height / heightCss : fallbackScale;
  return { widthCss, heightCss, scaleX, scaleY };
}

function syncPaperSurfaceColour() {
  document.documentElement.style.setProperty('--paper-colour', state.paperColour || '#ffffff');
}

const layoutRoot = document.getElementById("layoutRoot");
const controlPanel = document.getElementById("controlPanel");
const panelTab = document.getElementById("panelTab");
const narrowMedia = window.matchMedia("(max-width: 980px)");

const PRESETS = {
  pieces: [
    { id: "r150_105", label: "Ring 150/105", kind: "ring", outerTeeth: 150, innerTeeth: 105 },
    { id: "r144_96", label: "Ring 144/96", kind: "ring", outerTeeth: 144, innerTeeth: 96 },
    { id: "rack96", label: "Obround rack 96/24", kind: "rack", teeth: 96 }
  ],
  wheels: [24, 30, 32, 36, 40, 42, 45, 48, 50, 52, 56, 60, 63, 64, 72, 75, 80, 84]
};

const TOOTH_STYLE = {
  rootFactor: 0.55,
  depthScale: 0.42,
  minDepth: 4,
  maxDepth: 11,
  peakFraction: 0.5
};

const WHEEL_HOLE_MAP = {
  24: 5,
  30: 8,
  32: 9,
  36: 11,
  40: 13,
  42: 14,
  45: 16,
  48: 17,
  50: 18,
  52: 19,
  56: 21,
  60: 23,
  63: 25,
  64: 25,
  72: 29,
  75: 31,
  80: 33,
  84: 35
};

const GEAR_FILL_COLOR = "rgba(196, 214, 231, 0.58)";
const GEAR_STROKE_COLOR = "#6E8092";
const HOLE_STROKE_COLOR = "#6F7D8D";

const controls = {
  ringPiece: null, // Will be set via radio buttons
  track: null, // Will be set via radio buttons
  smallTeeth: document.getElementById("smallTeeth"),
  colourRow: document.getElementById("colourRow"),
  inkColourLabel: document.getElementById("inkColourLabel"),
  inkColour: document.getElementById("inkColour"),
  paperColour: document.getElementById("paperColour"),
  fillColour: document.getElementById("fillColour"),
  strokeWidth: document.getElementById("strokeWidth"),
  clearTrace: document.getElementById("clearTrace"),
  toggleGear: document.getElementById("toggleGear"),
  resetView: document.getElementById("resetView"),
  exportPng: document.getElementById("exportPng"),
  helpButton: document.getElementById("helpButton"),
  helpOverlay: document.getElementById("helpOverlay"),
  closeHelpBtn: document.getElementById("closeHelpBtn"),
  aboutButton: document.getElementById("aboutButton"),
  aboutOverlay: document.getElementById("aboutOverlay"),
  closeAboutBtn: document.getElementById("closeAboutBtn"),
  showAboutOnStartup: document.getElementById("showAboutOnStartup"),
  trackOptions: document.getElementById("trackOptions"),
  trackFieldset: document.getElementById("trackFieldset"),
  exportOverlay: document.getElementById("exportOverlay"),
  closeExportBtn: document.getElementById("closeExportBtn"),
  exportIncludeGear: document.getElementById("exportIncludeGear"),
  exportTransparent: document.getElementById("exportTransparent"),
  doExportBtn: document.getElementById("doExportBtn"),
  rackRotateControl: document.getElementById("rackRotateControl"),
  rackRotateSlider: document.getElementById("rackRotateSlider"),
  rackRotateValue: document.getElementById("rackRotateValue"),
  undoBtn: document.getElementById("undo-btn"),
  redoBtn: document.getElementById("redo-btn"),
  canvasContextMenu: document.getElementById("canvasContextMenu"),
  fillFromPointAction: document.getElementById("fillFromPointAction")
};

const SHOW_ABOUT_ON_STARTUP_KEY = "showAboutOnStartup";

function getShowAboutOnStartupPreference() {
  const saved = localStorage.getItem(SHOW_ABOUT_ON_STARTUP_KEY);
  if (saved === null) return true;
  return saved === "1";
}

function setShowAboutOnStartupPreference(enabled) {
  localStorage.setItem(SHOW_ABOUT_ON_STARTUP_KEY, enabled ? "1" : "0");
}

function canUseNativeFileShare() {
  const isTouchPrimaryPointer = window.matchMedia("(pointer: coarse)").matches;
  if (!isTouchPrimaryPointer) return false;

  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;

  try {
    const testFile = new File([new Blob(["x"], { type: "text/plain" })], "gyrograf-share-check.txt", { type: "text/plain" });
    return navigator.canShare({ files: [testFile] });
  } catch (_) {
    return false;
  }
}

function syncExportActionLabels() {
  const preferShareLabel = canUseNativeFileShare();
  const primaryText = preferShareLabel ? "SHARE IMAGE" : "EXPORT IMAGE";
  const primaryTitle = preferShareLabel
    ? "Share or export current view as PNG"
    : "Export current view as PNG";
  const primaryIconMarkup = preferShareLabel
    ? '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 8 12 4 8 8"></polyline><line x1="12" y1="4" x2="12" y2="14"></line>'
    : '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="8 8 12 12 16 8"></polyline><line x1="12" y1="2" x2="12" y2="12"></line>';

  const exportButtonLabel = controls.exportPng?.querySelector("span");
  if (exportButtonLabel) {
    exportButtonLabel.textContent = primaryText;
  }

  const exportButtonIcon = controls.exportPng?.querySelector("svg");
  if (exportButtonIcon) {
    exportButtonIcon.innerHTML = primaryIconMarkup;
  }

  controls.exportPng?.setAttribute("title", primaryTitle);
  controls.exportPng?.setAttribute("aria-label", primaryTitle);

  if (controls.doExportBtn) {
    controls.doExportBtn.textContent = primaryText;
    controls.doExportBtn.setAttribute("aria-label", primaryTitle);
  }
}

const state = {
  centre: { x: 0, y: 0 },
  theta: 0,
  paperOffsetX: 0,
  paperOffsetY: 0,
  selectedHole: -1,
  strokes: [],
  undoneStrokes: [],
  historyEntries: [],
  undoneHistoryEntries: [],
  activeStroke: null,
  dragging: false,
  showGear: true,
  lastPointerAngle: 0,
  lastPointerWorld: { x: 0, y: 0 },
  mode: "inside",
  track: "inner",
  ringPieceId: "r150_105",
  bigTeeth: 105,
  smallTeeth: 45,
  bigRadius: 210,
  smallRadius: 90,
  ringOuterRadius: 230,
  ringInnerRadius: 160,
  rackLength: 420,
  rackEndTeeth: 24,
  toothPitch: 1,
  penMode: "solid",
  inkColour: "#ff0000",
  paperColour: "#ffffff",
  fillColour: "#00b894",
  strokeWidth: 2,
  traceRevision: 0,
  holes: [],
  panelOpen: true,
  userPanelPreference: null,
  narrowPanelPreference: null,
  rackOrientationLocked: 0,
  view: {
    panX: 0,
    panY: 0,
    zoom: 1,
    minZoom: 0.18,
    maxZoom: 2.8,
    dragMode: null,
    lastScreenX: 0,
    lastScreenY: 0,
    animationFrame: 0
  }
};

let pendingLayoutFrame = 0;
let cursorResetTimer = 0;
let paperGridFlashTimer = 0;
let keyboardPanRafId = 0;
const pressedPanKeys = new Set();
let keyboardZoomRafId = 0;
let keyboardZoomDirection = 0;
let lastZoomInteractionAt = 0;
let pendingFillMenuWorldPoint = null;
let longPressTimer = 0;
let longPressPointerId = null;
let longPressStartX = 0;
let longPressStartY = 0;
let pendingTraceLayerRebuild = false;
let pendingFillLayerRebuild = false;
let renderWarmupTimer = 0;
let renderWarmupIdleHandle = 0;
let postSettleWarmupId = 0;
let pendingWheelDelta = 0;
let wheelDragRafId = 0;
const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

const diagnostics = {
  enabled: false,
  hudEl: null,
  rafId: 0,
  lastRafTime: 0,
  smoothDisplayFps: 0,
  renderMs: 0,
  statsNextAt: 0,
  statsEveryMs: 250,
  strokeCount: 0,
  pointCount: 0
};

const viewInteractionCache = {
  canvas: null,
  ctx: null,
  overscanFactor: 1.8,
  widthPx: 0,
  heightPx: 0,
  snapshotWidth: 0,
  snapshotHeight: 0,
  snapshotOffsetX: 0,
  snapshotOffsetY: 0,
  snapshotZoom: 1,
  snapshotPanX: 0,
  snapshotPanY: 0,
  snapshotPaperOffsetX: 0,
  snapshotPaperOffsetY: 0,
  snapshotTimestamp: 0,
  valid: false,
  active: false,
  showPaperGrid: false,
  settleTimer: 0
};

const traceLayer = {
  canvas: null,
  ctx: null,
  overscanFactor: 1.8,
  widthPx: 0,
  heightPx: 0,
  snapshotWidth: 0,
  snapshotHeight: 0,
  snapshotOffsetX: 0,
  snapshotOffsetY: 0,
  valid: false,
  revision: -1,
  viewSignature: "",
  snapshotPaperOffsetX: 0,
  snapshotPaperOffsetY: 0
};

const fillLayer = {
  canvas: null,
  ctx: null,
  workCanvas: null,
  workCtx: null,
  overscanFactor: 1.8,
  widthPx: 0,
  heightPx: 0,
  snapshotWidth: 0,
  snapshotHeight: 0,
  snapshotOffsetX: 0,
  snapshotOffsetY: 0,
  snapshotZoom: 1,
  snapshotPanX: 0,
  snapshotPanY: 0,
  snapshotPaperOffsetX: 0,
  snapshotPaperOffsetY: 0,
  viewSignature: "",
  operations: [],
  valid: false
};

function ensureDiagnosticsHud() {
  if (diagnostics.hudEl) return diagnostics.hudEl;
  const el = document.createElement("div");
  el.className = "perf-hud";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  diagnostics.hudEl = el;
  return el;
}

function recalcTraceStats() {
  diagnostics.strokeCount = state.strokes.length;
  let points = 0;
  for (let s = 0; s < state.strokes.length; s += 1) {
    points += state.strokes[s].points?.length || 0;
  }
  diagnostics.pointCount = points;
}

function canUndoStroke() {
  return state.historyEntries.length > 0;
}

function canRedoStroke() {
  return state.undoneHistoryEntries.length > 0;
}

function syncHistoryControls() {
  if (controls.undoBtn) {
    controls.undoBtn.disabled = !canUndoStroke();
  }
  if (controls.redoBtn) {
    controls.redoBtn.disabled = !canRedoStroke();
  }
}

function undoLastStroke() {
  if (!canUndoStroke()) return;
  const entry = state.historyEntries.pop();
  if (!entry) return;

  if (entry.type === "stroke") {
    const strokeIndex = state.strokes.lastIndexOf(entry.stroke);
    if (strokeIndex >= 0) {
      state.strokes.splice(strokeIndex, 1);
      state.traceRevision += 1;
      fillLayer.valid = false;
    }
  } else if (entry.type === "fill") {
    const fillIndex = fillLayer.operations.lastIndexOf(entry.operation);
    if (fillIndex >= 0) {
      fillLayer.operations.splice(fillIndex, 1);
      fillLayer.valid = false;
    }
  }

  traceLayer.valid = false;
  state.undoneHistoryEntries.push(entry);
  syncHistoryControls();
  draw();
}

function redoLastStroke() {
  if (!canRedoStroke()) return;
  const entry = state.undoneHistoryEntries.pop();
  if (!entry) return;

  if (entry.type === "stroke") {
    if (!state.strokes.includes(entry.stroke)) {
      state.strokes.push(entry.stroke);
      state.traceRevision += 1;
      fillLayer.valid = false;
    }
  } else if (entry.type === "fill") {
    if (!fillLayer.operations.includes(entry.operation)) {
      fillLayer.operations.push(entry.operation);
      fillLayer.valid = false;
    }
  }

  traceLayer.valid = false;
  state.historyEntries.push(entry);
  syncHistoryControls();
  draw();
}

function refreshDiagnosticsHud(now) {
  if (!diagnostics.enabled) return;
  const hud = ensureDiagnosticsHud();
  hud.style.display = "block";

  if (now >= diagnostics.statsNextAt) {
    recalcTraceStats();
    diagnostics.statsNextAt = now + diagnostics.statsEveryMs;
  }

  const dpr = window.devicePixelRatio || 1;
  const modeLabel = isRackMode() ? "rack" : `${state.track}-${state.mode}`;
  const fpsText = diagnostics.smoothDisplayFps > 0 ? diagnostics.smoothDisplayFps.toFixed(1) : "-";
  hud.textContent = [
    `FPS ${fpsText}`,
    `frame ${diagnostics.renderMs.toFixed(2)} ms`,
    `strokes ${diagnostics.strokeCount} | points ${diagnostics.pointCount}`,
    `mode ${modeLabel} | pen ${state.penMode}`,
    `zoom ${state.view.zoom.toFixed(2)} | dpr ${dpr.toFixed(2)}`,
    `drag ${state.view.dragMode || "none"}`,
    `toggle Shift+D`
  ].join("\n");
}

function diagnosticsTick(now) {
  if (!diagnostics.enabled) {
    diagnostics.rafId = 0;
    diagnostics.lastRafTime = 0;
    return;
  }

  if (diagnostics.lastRafTime > 0) {
    const dt = now - diagnostics.lastRafTime;
    if (dt > 0) {
      const instantFps = 1000 / dt;
      diagnostics.smoothDisplayFps = diagnostics.smoothDisplayFps > 0
        ? diagnostics.smoothDisplayFps * 0.9 + instantFps * 0.1
        : instantFps;
    }
  }
  diagnostics.lastRafTime = now;
  refreshDiagnosticsHud(now);
  diagnostics.rafId = requestAnimationFrame(diagnosticsTick);
}

function startDiagnosticsLoop() {
  if (!diagnostics.enabled || diagnostics.rafId) return;
  diagnostics.rafId = requestAnimationFrame(diagnosticsTick);
}

function stopDiagnosticsLoop() {
  if (diagnostics.rafId) {
    cancelAnimationFrame(diagnostics.rafId);
    diagnostics.rafId = 0;
  }
  diagnostics.lastRafTime = 0;
  diagnostics.smoothDisplayFps = 0;
  if (diagnostics.hudEl) {
    diagnostics.hudEl.style.display = "none";
  }
}

function flushDeferredLayerRebuilds() {
  if (pendingTraceLayerRebuild) {
    rebuildTraceLayer();
    pendingTraceLayerRebuild = false;
  }
  if (pendingFillLayerRebuild) {
    rebuildFillLayer();
    pendingFillLayerRebuild = false;
  }
}

function cancelRenderWarmup() {
  if (renderWarmupTimer) {
    clearTimeout(renderWarmupTimer);
    renderWarmupTimer = 0;
  }
  if (renderWarmupIdleHandle && "cancelIdleCallback" in window) {
    window.cancelIdleCallback(renderWarmupIdleHandle);
    renderWarmupIdleHandle = 0;
  }
}

function cancelPostSettleWarmup() {
  if (!postSettleWarmupId) return;
  cancelAnimationFrame(postSettleWarmupId);
  postSettleWarmupId = 0;
}

function runRenderWarmup() {
  renderWarmupIdleHandle = 0;

  if (state.dragging || state.view.dragMode || pendingLayoutFrame) {
    return;
  }

  const { widthCss, heightCss } = getCanvasRasterMetrics();
  if (widthCss < 20 || heightCss < 20) return;

  rebuildTraceLayer();
  pendingTraceLayerRebuild = false;
  pendingFillLayerRebuild = false;
}

function scheduleRenderWarmup(delayMs = 180) {
  // On coarse-pointer devices this warmup can overlap with a quick next drag.
  // Skip it there to avoid post-interaction background contention.
  if (isCoarsePointer) return;
  cancelRenderWarmup();
  renderWarmupTimer = setTimeout(() => {
    renderWarmupTimer = 0;
    const run = () => runRenderWarmup();

    if ("requestIdleCallback" in window) {
      renderWarmupIdleHandle = window.requestIdleCallback(run, { timeout: 220 });
      return;
    }

    requestAnimationFrame(run);
  }, delayMs);
}

// After a pan/zoom settles, run several extra draw frames so the JS engine
// re-tiers the render hot path before the user begins the next wheel drag.
// Without this the render functions can be cold (de-optimised by GC pressure
// during the gesture) and take 3-4 s to reach full JIT speed again.
const POST_SETTLE_WARMUP_FRAMES = 8;
const DEBUG_RENDER_FILL_SEEDS = false;
function schedulePostSettleWarmup() {
  cancelPostSettleWarmup();
  let remaining = POST_SETTLE_WARMUP_FRAMES;
  const tick = () => {
    postSettleWarmupId = 0;
    // Abort if we have re-entered a pan/zoom interaction.
    if (viewInteractionCache.active) return;
    // If the user is already dragging the wheel, the drag's own draw() calls
    // serve as the warmup - no need to fire extra frames.
    if (state.dragging) return;
    if (remaining-- > 0) {
      draw();
      postSettleWarmupId = requestAnimationFrame(tick);
    }
  };
  postSettleWarmupId = requestAnimationFrame(tick);
}

function renderVectorScene(scaleX, scaleY, viewportOffsetX = 0, viewportOffsetY = 0) {
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.translate(
    state.centre.x + state.view.panX + viewportOffsetX,
    state.centre.y + state.view.panY + viewportOffsetY
  );
  ctx.scale(state.view.zoom, state.view.zoom);
  ctx.translate(-state.centre.x, -state.centre.y);

  const canUseTraceLayer = viewportOffsetX === 0 && viewportOffsetY === 0 && ctx === mainCtx;
  if (canUseTraceLayer && ensureTraceLayerReady()) {
    const { widthCss, heightCss } = getCanvasRasterMetrics();
    const paperDeltaX = (state.paperOffsetX - traceLayer.snapshotPaperOffsetX) * state.view.zoom;
    const paperDeltaY = (state.paperOffsetY - traceLayer.snapshotPaperOffsetY) * state.view.zoom;
    const destX = paperDeltaX - traceLayer.snapshotOffsetX;
    const destY = paperDeltaY - traceLayer.snapshotOffsetY;
    const destW = traceLayer.snapshotWidth || widthCss;
    const destH = traceLayer.snapshotHeight || heightCss;
    ctx.save();
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.drawImage(traceLayer.canvas, 0, 0, traceLayer.widthPx, traceLayer.heightPx, destX, destY, destW, destH);
    ctx.restore();
  } else {
    drawFillLayer(scaleX, scaleY, viewportOffsetX, viewportOffsetY);
    drawTrace();
  }

  if (DEBUG_RENDER_FILL_SEEDS) {
    drawFillSeedDebugMarkers();
  }

  if (state.showGear) drawRingPiece();

  const sc = smallCentre();
  const phi = smallRotation();
  let meshPhaseOffset;
  if (isRackMode()) {
    meshPhaseOffset = rackMeshPhaseOffset();
  } else if (state.mode === "inside") {
    meshPhaseOffset = -Math.PI / state.smallTeeth;
  } else {
    meshPhaseOffset = Math.PI - Math.PI / state.smallTeeth;
  }
  if (state.showGear) {
    drawCogRing(
      sc.x,
      sc.y,
      state.smallRadius,
      currentWheelToothDepth(),
      state.smallTeeth,
      GEAR_STROKE_COLOR,
      true,
      phi + meshPhaseOffset
    );
  }
  if (state.showGear) drawHoles(sc.x, sc.y, phi);
}

function drawFillSeedDebugMarkers() {
  if (!fillLayer.operations.length) return;

  const markerRadius = 4 / Math.max(0.0001, state.view.zoom);
  ctx.save();
  ctx.fillStyle = "rgba(255, 46, 99, 0.9)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 1 / Math.max(0.0001, state.view.zoom);

  for (let i = 0; i < fillLayer.operations.length; i += 1) {
    const op = fillLayer.operations[i];
    const worldX = op.paperX + state.paperOffsetX;
    const worldY = op.paperY + state.paperOffsetY;

    ctx.beginPath();
    ctx.arc(worldX, worldY, markerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function ensureViewInteractionCacheSurface(targetW, targetH) {
  if (!targetW || !targetH) return null;

  if (!viewInteractionCache.canvas) {
    viewInteractionCache.canvas = document.createElement("canvas");
    viewInteractionCache.ctx = viewInteractionCache.canvas.getContext("2d");
  }

  if (viewInteractionCache.widthPx !== targetW || viewInteractionCache.heightPx !== targetH) {
    viewInteractionCache.canvas.width = targetW;
    viewInteractionCache.canvas.height = targetH;
    viewInteractionCache.widthPx = targetW;
    viewInteractionCache.heightPx = targetH;
    viewInteractionCache.valid = false;
  }

  return viewInteractionCache.ctx;
}

function captureViewInteractionSnapshot() {
  const { widthCss, heightCss } = getCanvasRasterMetrics();
  const overscan = viewInteractionCache.overscanFactor;
  const cacheCssW = widthCss * overscan;
  const cacheCssH = heightCss * overscan;
  const { scaleX, scaleY } = getCanvasRasterMetrics();
  const targetW = Math.max(1, Math.ceil(cacheCssW * scaleX));
  const targetH = Math.max(1, Math.ceil(cacheCssH * scaleY));

  const cacheCtx = ensureViewInteractionCacheSurface(targetW, targetH);
  if (!cacheCtx) return;

  const marginX = (cacheCssW - widthCss) * 0.5;
  const marginY = (cacheCssH - heightCss) * 0.5;
  const cacheScaleX = targetW / cacheCssW;
  const cacheScaleY = targetH / cacheCssH;
  const previousCtx = ctx;
  ctx = cacheCtx;
  ctx.setTransform(cacheScaleX, 0, 0, cacheScaleY, 0, 0);
  ctx.clearRect(0, 0, cacheCssW, cacheCssH);
  ctx.fillStyle = state.paperColour;
  ctx.fillRect(0, 0, cacheCssW, cacheCssH);

  if (viewInteractionCache.showPaperGrid) {
    drawPaperGrid(cacheCssW, cacheCssH, {
      panX: state.view.panX + marginX * state.view.zoom,
      panY: state.view.panY + marginY * state.view.zoom,
      zoom: state.view.zoom
    });
  }

  renderVectorScene(cacheScaleX, cacheScaleY, marginX, marginY);
  ctx = previousCtx;

  viewInteractionCache.snapshotWidth = cacheCssW;
  viewInteractionCache.snapshotHeight = cacheCssH;
  viewInteractionCache.snapshotOffsetX = marginX;
  viewInteractionCache.snapshotOffsetY = marginY;

  viewInteractionCache.snapshotZoom = state.view.zoom;
  viewInteractionCache.snapshotPanX = state.view.panX;
  viewInteractionCache.snapshotPanY = state.view.panY;
  viewInteractionCache.snapshotPaperOffsetX = state.paperOffsetX;
  viewInteractionCache.snapshotPaperOffsetY = state.paperOffsetY;
  viewInteractionCache.snapshotTimestamp = performance.now();
  viewInteractionCache.valid = true;
}

function shouldRefreshInteractionSnapshot() {
  if (!viewInteractionCache.active || !viewInteractionCache.valid) return false;

  const now = performance.now();
  // Keep using the cached snapshot while zoom input is active.
  if (now - lastZoomInteractionAt < 180) return false;

  const snapshotZoom = viewInteractionCache.snapshotZoom || 1;
  const zoomScale = state.view.zoom / snapshotZoom;
  if (zoomScale > 1.22 || zoomScale < 0.82) return true;

  const ageMs = now - (viewInteractionCache.snapshotTimestamp || 0);
  if (ageMs > 320) return true;

  return false;
}

function beginViewInteraction(showPaperGrid = false) {
  if (viewInteractionCache.settleTimer) {
    clearTimeout(viewInteractionCache.settleTimer);
    viewInteractionCache.settleTimer = 0;
  }
  viewInteractionCache.showPaperGrid = showPaperGrid;
  if (!viewInteractionCache.active) {
    captureViewInteractionSnapshot();
    viewInteractionCache.active = true;
  }
}

function settleViewInteraction(delayMs = 120) {
  if (viewInteractionCache.settleTimer) {
    clearTimeout(viewInteractionCache.settleTimer);
  }
  viewInteractionCache.settleTimer = setTimeout(() => {
    viewInteractionCache.settleTimer = 0;
    viewInteractionCache.active = false;
    viewInteractionCache.valid = false;
    viewInteractionCache.showPaperGrid = false;
    draw();
    schedulePostSettleWarmup();
  }, delayMs);
}

function disableViewInteractionCache() {
  if (paperGridFlashTimer) {
    clearTimeout(paperGridFlashTimer);
    paperGridFlashTimer = 0;
  }
  if (viewInteractionCache.settleTimer) {
    clearTimeout(viewInteractionCache.settleTimer);
    viewInteractionCache.settleTimer = 0;
  }
  viewInteractionCache.active = false;
  viewInteractionCache.valid = false;
  viewInteractionCache.showPaperGrid = false;
}

function pulsePaperGrid(durationMs = 140) {
  viewInteractionCache.showPaperGrid = true;
  if (paperGridFlashTimer) {
    clearTimeout(paperGridFlashTimer);
  }
  paperGridFlashTimer = setTimeout(() => {
    paperGridFlashTimer = 0;
    if (!viewInteractionCache.active) {
      viewInteractionCache.showPaperGrid = false;
      draw();
    }
  }, durationMs);
}

function applyKeyboardPanStep() {
  if (!pressedPanKeys.size) return;

  const panStepScreenPx = 14;
  const panStepWorld = panStepScreenPx / Math.max(0.0001, state.view.zoom);
  if (pressedPanKeys.has("ArrowLeft")) state.paperOffsetX -= panStepWorld;
  if (pressedPanKeys.has("ArrowRight")) state.paperOffsetX += panStepWorld;
  if (pressedPanKeys.has("ArrowUp")) state.paperOffsetY -= panStepWorld;
  if (pressedPanKeys.has("ArrowDown")) state.paperOffsetY += panStepWorld;
  draw();
}

function startKeyboardPanLoop() {
  if (keyboardPanRafId) return;
  viewInteractionCache.showPaperGrid = true;
  const tick = () => {
    if (!pressedPanKeys.size) {
      keyboardPanRafId = 0;
      viewInteractionCache.showPaperGrid = false;
      draw();
      return;
    }
    applyKeyboardPanStep();
    keyboardPanRafId = requestAnimationFrame(tick);
  };
  keyboardPanRafId = requestAnimationFrame(tick);
}

function stopKeyboardPanLoopIfIdle() {
  if (pressedPanKeys.size || !keyboardPanRafId) return;
  cancelAnimationFrame(keyboardPanRafId);
  keyboardPanRafId = 0;
  viewInteractionCache.showPaperGrid = false;
  draw();
}

function applyKeyboardZoomStep() {
  if (!keyboardZoomDirection) return;
  lastZoomInteractionAt = performance.now();
  const zoomFactor = keyboardZoomDirection > 0 ? 1.02 : 1 / 1.02;
  setZoomAt(state.centre.x, state.centre.y, state.view.zoom * zoomFactor);
  draw();
}

function startKeyboardZoomLoop(direction) {
  keyboardZoomDirection = direction;
  beginViewInteraction(true);
  cancelViewAnimation();
  if (keyboardZoomRafId) return;
  const tick = () => {
    if (!keyboardZoomDirection) {
      keyboardZoomRafId = 0;
      settleViewInteraction(150);
      return;
    }
    applyKeyboardZoomStep();
    keyboardZoomRafId = requestAnimationFrame(tick);
  };
  keyboardZoomRafId = requestAnimationFrame(tick);
}

function stopKeyboardZoomLoop() {
  keyboardZoomDirection = 0;
  if (!keyboardZoomRafId) {
    settleViewInteraction(150);
  }
}

function shouldShowPaperGrid() {
  return (state.dragging && state.view.dragMode === "pan") || viewInteractionCache.showPaperGrid;
}

function canUseViewInteractionCache(fillBackground) {
  return fillBackground && viewInteractionCache.active && viewInteractionCache.valid;
}

function drawViewInteractionCache(width, height) {
  const snapshotZoom = viewInteractionCache.snapshotZoom || 1;
  const scale = state.view.zoom / snapshotZoom;
  const paperDeltaX = state.paperOffsetX - viewInteractionCache.snapshotPaperOffsetX;
  const paperDeltaY = state.paperOffsetY - viewInteractionCache.snapshotPaperOffsetY;
  const tx =
    state.centre.x +
    state.view.panX -
    scale * (state.centre.x + viewInteractionCache.snapshotPanX + viewInteractionCache.snapshotOffsetX) +
    paperDeltaX * state.view.zoom;
  const ty =
    state.centre.y +
    state.view.panY -
    scale * (state.centre.y + viewInteractionCache.snapshotPanY + viewInteractionCache.snapshotOffsetY) +
    paperDeltaY * state.view.zoom;
  const destW = viewInteractionCache.snapshotWidth * scale;
  const destH = viewInteractionCache.snapshotHeight * scale;

  ctx.drawImage(
    viewInteractionCache.canvas,
    0,
    0,
    viewInteractionCache.widthPx,
    viewInteractionCache.heightPx,
    tx,
    ty,
    destW || width,
    destH || height
  );
}

function traceViewSignature() {
  return [
    canvas.width,
    canvas.height,
    state.centre.x.toFixed(3),
    state.centre.y.toFixed(3),
    state.view.zoom.toFixed(6),
    state.view.panX.toFixed(3),
    state.view.panY.toFixed(3)
  ].join("|");
}

function ensureTraceLayerSurface(targetW, targetH) {
  if (!targetW || !targetH) return null;

  if (!traceLayer.canvas) {
    traceLayer.canvas = document.createElement("canvas");
    traceLayer.ctx = traceLayer.canvas.getContext("2d");
  }

  if (traceLayer.widthPx !== targetW || traceLayer.heightPx !== targetH) {
    traceLayer.canvas.width = targetW;
    traceLayer.canvas.height = targetH;
    traceLayer.widthPx = targetW;
    traceLayer.heightPx = targetH;
    traceLayer.valid = false;
  }

  return traceLayer.ctx;
}

function rebuildTraceLayer() {
  const { widthCss, heightCss, scaleX, scaleY } = getCanvasRasterMetrics();
  const overscan = traceLayer.overscanFactor;
  const cacheCssW = widthCss * overscan;
  const cacheCssH = heightCss * overscan;
  const marginX = (cacheCssW - widthCss) * 0.5;
  const marginY = (cacheCssH - heightCss) * 0.5;
  const targetW = Math.max(1, Math.ceil(cacheCssW * scaleX));
  const targetH = Math.max(1, Math.ceil(cacheCssH * scaleY));

  const tctx = ensureTraceLayerSurface(targetW, targetH);
  if (!tctx) return false;

  const cacheScaleX = targetW / cacheCssW;
  const cacheScaleY = targetH / cacheCssH;
  tctx.setTransform(cacheScaleX, 0, 0, cacheScaleY, 0, 0);
  tctx.clearRect(0, 0, cacheCssW, cacheCssH);
  tctx.translate(state.centre.x + state.view.panX + marginX, state.centre.y + state.view.panY + marginY);
  tctx.scale(state.view.zoom, state.view.zoom);
  tctx.translate(-state.centre.x, -state.centre.y);

  const previousCtx = ctx;
  ctx = tctx;
  drawFillLayer(cacheScaleX, cacheScaleY, marginX, marginY);
  drawTrace();
  ctx = previousCtx;

  traceLayer.revision = state.traceRevision;
  traceLayer.viewSignature = traceViewSignature();
  traceLayer.snapshotWidth = cacheCssW;
  traceLayer.snapshotHeight = cacheCssH;
  traceLayer.snapshotOffsetX = marginX;
  traceLayer.snapshotOffsetY = marginY;
  traceLayer.snapshotPaperOffsetX = state.paperOffsetX;
  traceLayer.snapshotPaperOffsetY = state.paperOffsetY;
  traceLayer.valid = true;
  return true;
}

function appendLatestStrokeSegmentToTraceLayer(stroke) {
  if (!stroke || !traceLayer.valid) return false;
  if (traceLayer.revision !== state.traceRevision - 1) return false;
  if (traceLayer.viewSignature !== traceViewSignature()) return false;

  const points = stroke.points || [];
  if (points.length < 2) {
    traceLayer.revision = state.traceRevision;
    return true;
  }

  const tctx = traceLayer.ctx || ensureTraceLayerSurface(traceLayer.widthPx, traceLayer.heightPx);
  if (!tctx) return false;

  const p0 = points[points.length - 2];
  const p1 = points[points.length - 1];
  const paperOffsetX = traceLayer.snapshotPaperOffsetX;
  const paperOffsetY = traceLayer.snapshotPaperOffsetY;

  const cacheCssW = traceLayer.snapshotWidth || getCanvasRasterMetrics().widthCss;
  const cacheCssH = traceLayer.snapshotHeight || getCanvasRasterMetrics().heightCss;
  const cacheScaleX = traceLayer.widthPx / Math.max(1, cacheCssW);
  const cacheScaleY = traceLayer.heightPx / Math.max(1, cacheCssH);
  tctx.save();
  tctx.setTransform(cacheScaleX, 0, 0, cacheScaleY, 0, 0);
  tctx.translate(
    state.centre.x + state.view.panX + traceLayer.snapshotOffsetX,
    state.centre.y + state.view.panY + traceLayer.snapshotOffsetY
  );
  tctx.scale(state.view.zoom, state.view.zoom);
  tctx.translate(-state.centre.x, -state.centre.y);

  const strokePenMode = String(stroke.penMode || "solid").toLowerCase();
  const isSpectraStroke = strokePenMode === "spectra" || stroke.colour === null;
  const x0 = p0.x + paperOffsetX;
  const y0 = p0.y + paperOffsetY;
  const x1 = p1.x + paperOffsetX;
  const y1 = p1.y + paperOffsetY;

  tctx.beginPath();
  tctx.moveTo(x0, y0);
  tctx.lineTo(x1, y1);
  tctx.lineWidth = stroke.width;
  tctx.lineJoin = "round";
  tctx.lineCap = "round";

  if (isSpectraStroke) {
    const segmentDistance = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const d0 = Number.isFinite(p0.d) ? p0.d : 0;
    const d1 = Number.isFinite(p1.d) ? p1.d : d0 + segmentDistance;
    const dMid = (d0 + d1) * 0.5;
    tctx.strokeStyle = spectraColourAtDistance(dMid);
  } else {
    tctx.strokeStyle = stroke.colour || state.inkColour;
  }
  tctx.stroke();
  tctx.restore();

  traceLayer.revision = state.traceRevision;
  return true;
}

function ensureTraceLayerReady() {
  const hasRenderableTrace = !!traceLayer.canvas && traceLayer.widthPx > 0 && traceLayer.heightPx > 0;
  const shouldDeferHeavyRebuild = (state.dragging && state.view.dragMode === "pan") || viewInteractionCache.active;

  if (!traceLayer.valid) {
    if (shouldDeferHeavyRebuild) {
      pendingTraceLayerRebuild = true;
      return hasRenderableTrace;
    }
    return rebuildTraceLayer();
  }
  if (traceLayer.revision !== state.traceRevision) {
    if (shouldDeferHeavyRebuild) {
      pendingTraceLayerRebuild = true;
      return hasRenderableTrace;
    }
    return rebuildTraceLayer();
  }
  if (traceLayer.viewSignature !== traceViewSignature()) {
    if (shouldDeferHeavyRebuild) {
      pendingTraceLayerRebuild = true;
      return hasRenderableTrace;
    }
    return rebuildTraceLayer();
  }
  const deltaScreenX = Math.abs((state.paperOffsetX - traceLayer.snapshotPaperOffsetX) * state.view.zoom);
  const deltaScreenY = Math.abs((state.paperOffsetY - traceLayer.snapshotPaperOffsetY) * state.view.zoom);
  const availableMarginX = Math.max(8, (traceLayer.snapshotOffsetX || 0) - 2);
  const availableMarginY = Math.max(8, (traceLayer.snapshotOffsetY || 0) - 2);
  if (deltaScreenX > availableMarginX || deltaScreenY > availableMarginY) {
    if (shouldDeferHeavyRebuild) {
      pendingTraceLayerRebuild = true;
      return true;
    }
    return rebuildTraceLayer();
  }
  return true;
}

function ensureFillLayerSurface(targetW, targetH) {
  if (!targetW || !targetH) return null;

  if (!fillLayer.canvas) {
    fillLayer.canvas = document.createElement("canvas");
    fillLayer.ctx = fillLayer.canvas.getContext("2d", { willReadFrequently: true });
  }

  if (fillLayer.widthPx !== targetW || fillLayer.heightPx !== targetH) {
    fillLayer.canvas.width = targetW;
    fillLayer.canvas.height = targetH;
    fillLayer.widthPx = targetW;
    fillLayer.heightPx = targetH;
    fillLayer.valid = false;
  }

  return fillLayer.ctx;
}

function ensureFillWorkSurface(targetW, targetH) {
  if (!targetW || !targetH) return null;

  if (!fillLayer.workCanvas) {
    fillLayer.workCanvas = document.createElement("canvas");
    fillLayer.workCtx = fillLayer.workCanvas.getContext("2d", { willReadFrequently: true });
  }

  if (fillLayer.workCanvas.width !== targetW || fillLayer.workCanvas.height !== targetH) {
    fillLayer.workCanvas.width = targetW;
    fillLayer.workCanvas.height = targetH;
  }

  return fillLayer.workCtx;
}

function fillViewSignature() {
  return [
    canvas.width,
    canvas.height,
    state.centre.x.toFixed(3),
    state.centre.y.toFixed(3),
    state.view.zoom.toFixed(6)
  ].join("|");
}

function floodFillImageData(sourceData, width, height, startX, startY, tolerance = 14, bounds = null) {
  const activeBounds = bounds || {
    minX: 0,
    minY: 0,
    maxX: width - 1,
    maxY: height - 1
  };
  if (startX < activeBounds.minX || startX > activeBounds.maxX || startY < activeBounds.minY || startY > activeBounds.maxY) {
    return {
      changed: false,
      mask: null,
      minX: 0,
      minY: 0,
      maxX: -1,
      maxY: -1,
      touchedBounds: false
    };
  }

  const startIndex = (startY * width + startX) * 4;
  const tr = sourceData[startIndex];
  const tg = sourceData[startIndex + 1];
  const tb = sourceData[startIndex + 2];
  const ta = sourceData[startIndex + 3];

  const alphaLoose = ta < 12;
  const matchTargetAt = (idx) => {
    const a = sourceData[idx + 3];
    if (alphaLoose) {
      return a < 18;
    }
    if (a < 12) return false;
    return (
      Math.abs(sourceData[idx] - tr) <= tolerance
      && Math.abs(sourceData[idx + 1] - tg) <= tolerance
      && Math.abs(sourceData[idx + 2] - tb) <= tolerance
      && Math.abs(a - ta) <= 24
    );
  };

  const visited = new Uint8Array(width * height);
  const stackX = [startX];
  const stackY = [startY];
  let changed = false;
  let filledCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let touchedBounds = false;
  const boundsArea = Math.max(1, (activeBounds.maxX - activeBounds.minX + 1) * (activeBounds.maxY - activeBounds.minY + 1));
  const maxFillPixels = Math.max(1, Math.floor(boundsArea * 0.92));

  while (stackX.length) {
    const x = stackX.pop();
    const y = stackY.pop();
    if (x < activeBounds.minX || x > activeBounds.maxX || y < activeBounds.minY || y > activeBounds.maxY) continue;

    let left = x;
    while (left >= activeBounds.minX) {
      const pixel = y * width + left;
      const idx = pixel * 4;
      if (visited[pixel] || !matchTargetAt(idx)) break;
      left -= 1;
    }
    left += 1;

    let right = x;
    while (right <= activeBounds.maxX) {
      const pixel = y * width + right;
      const idx = pixel * 4;
      if (visited[pixel] || !matchTargetAt(idx)) break;
      right += 1;
    }
    right -= 1;
    if (left <= activeBounds.minX || right >= activeBounds.maxX || y <= activeBounds.minY || y >= activeBounds.maxY) {
      touchedBounds = true;
    }

    let spanAbove = false;
    let spanBelow = false;

    for (let xi = left; xi <= right; xi += 1) {
      const pixel = y * width + xi;
      if (visited[pixel]) continue;
      const idx = pixel * 4;
      if (!matchTargetAt(idx)) continue;

      visited[pixel] = 2;
      changed = true;
      filledCount += 1;
      if (xi < minX) minX = xi;
      if (y < minY) minY = y;
      if (xi > maxX) maxX = xi;
      if (y > maxY) maxY = y;

      if (filledCount >= maxFillPixels) {
        touchedBounds = true;
        break;
      }

      if (y > activeBounds.minY) {
        const abovePixel = (y - 1) * width + xi;
        const aboveIdx = abovePixel * 4;
        const aboveMatch = visited[abovePixel] !== 2 && matchTargetAt(aboveIdx);
        if (aboveMatch && !spanAbove) {
          stackX.push(xi);
          stackY.push(y - 1);
          spanAbove = true;
        } else if (!aboveMatch) {
          spanAbove = false;
        }
      }

      if (y < activeBounds.maxY) {
        const belowPixel = (y + 1) * width + xi;
        const belowIdx = belowPixel * 4;
        const belowMatch = visited[belowPixel] !== 2 && matchTargetAt(belowIdx);
        if (belowMatch && !spanBelow) {
          stackX.push(xi);
          stackY.push(y + 1);
          spanBelow = true;
        } else if (!belowMatch) {
          spanBelow = false;
        }
      }
    }
  }

  return {
    changed,
    mask: visited,
    minX,
    minY,
    maxX,
    maxY,
    touchedBounds
  };
}

function featherFillIntoEdge(sourceData, targetData, mask, width, height, patchX, patchY, patchW, patchH, fillRgb) {
  let touched = false;
  const idxAt = (x, y) => (y * width + x) * 4;
  const patchIdxAt = (x, y) => ((y - patchY) * patchW + (x - patchX)) * 4;
  const neighbourOffsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];

  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = Math.max(1, patchY); y <= Math.min(height - 2, patchY + patchH - 1); y += 1) {
      for (let x = Math.max(1, patchX); x <= Math.min(width - 2, patchX + patchW - 1); x += 1) {
        const pIdx = patchIdxAt(x, y);
        if (targetData[pIdx + 3] > 0) continue;

        const idx = idxAt(x, y);
        const sourceAlpha = sourceData[idx + 3];
        if (sourceAlpha < 4 || sourceAlpha >= 255) continue;

        let hasFilledNeighbour = false;
        for (let i = 0; i < neighbourOffsets.length; i += 1) {
          const [ox, oy] = neighbourOffsets[i];
          const nPixel = (y + oy) * width + (x + ox);
          if (mask[nPixel] === 2) {
            hasFilledNeighbour = true;
            break;
          }
        }
        if (!hasFilledNeighbour) continue;

        targetData[pIdx] = fillRgb.r;
        targetData[pIdx + 1] = fillRgb.g;
        targetData[pIdx + 2] = fillRgb.b;
        // Opaque underpaint prevents paper-colour sparkle through AA edges.
        targetData[pIdx + 3] = 255;
        mask[y * width + x] = 2;
        touched = true;
      }
    }
  }

  return touched;
}

function applyFillOperationToLayer(operation) {
  if (!fillLayer.ctx || !fillLayer.widthPx || !fillLayer.heightPx) return;
  const rgb = hexToRgb(operation.colour);
  if (!rgb) return;

  const workCtx = ensureFillWorkSurface(fillLayer.widthPx, fillLayer.heightPx);
  if (!workCtx) return;

  workCtx.setTransform(1, 0, 0, 1, 0, 0);
  workCtx.clearRect(0, 0, fillLayer.widthPx, fillLayer.heightPx);
  workCtx.drawImage(fillLayer.canvas, 0, 0);

  const cacheCssW = fillLayer.snapshotWidth || 1;
  const cacheCssH = fillLayer.snapshotHeight || 1;
  const cacheScaleX = fillLayer.widthPx / Math.max(1, cacheCssW);
  const cacheScaleY = fillLayer.heightPx / Math.max(1, cacheCssH);
  const previousCtx = ctx;
  ctx = workCtx;
  ctx.setTransform(cacheScaleX, 0, 0, cacheScaleY, 0, 0);
  ctx.translate(
    state.centre.x + fillLayer.snapshotPanX + fillLayer.snapshotOffsetX,
    state.centre.y + fillLayer.snapshotPanY + fillLayer.snapshotOffsetY
  );
  ctx.scale(fillLayer.snapshotZoom, fillLayer.snapshotZoom);
  ctx.translate(-state.centre.x, -state.centre.y);
  drawTrace();
  ctx = previousCtx;

  const worldX = operation.paperX + fillLayer.snapshotPaperOffsetX;
  const worldY = operation.paperY + fillLayer.snapshotPaperOffsetY;
  const seedCssX =
    state.centre.x
    + fillLayer.snapshotPanX
    + fillLayer.snapshotOffsetX
    + (worldX - state.centre.x) * fillLayer.snapshotZoom;
  const seedCssY =
    state.centre.y
    + fillLayer.snapshotPanY
    + fillLayer.snapshotOffsetY
    + (worldY - state.centre.y) * fillLayer.snapshotZoom;

  const seedX = Math.round((seedCssX / Math.max(1, cacheCssW)) * fillLayer.widthPx);
  const seedY = Math.round((seedCssY / Math.max(1, cacheCssH)) * fillLayer.heightPx);
  if (seedX < 0 || seedX >= fillLayer.widthPx || seedY < 0 || seedY >= fillLayer.heightPx) return;

  const workImage = workCtx.getImageData(0, 0, fillLayer.widthPx, fillLayer.heightPx);
  const searchRadius = Math.max(220, Math.floor(Math.min(fillLayer.widthPx, fillLayer.heightPx) * 0.42));
  const boundedSearch = {
    minX: Math.max(0, seedX - searchRadius),
    minY: Math.max(0, seedY - searchRadius),
    maxX: Math.min(fillLayer.widthPx - 1, seedX + searchRadius),
    maxY: Math.min(fillLayer.heightPx - 1, seedY + searchRadius)
  };

  let fillResult = floodFillImageData(workImage.data, fillLayer.widthPx, fillLayer.heightPx, seedX, seedY, 14, boundedSearch);
  if (fillResult.changed && fillResult.touchedBounds) {
    fillResult = floodFillImageData(workImage.data, fillLayer.widthPx, fillLayer.heightPx, seedX, seedY, 14, null);
  }
  if (!fillResult.changed || !fillResult.mask) return;

  const pad = 3;
  const patchX = Math.max(0, fillResult.minX - pad);
  const patchY = Math.max(0, fillResult.minY - pad);
  const patchMaxX = Math.min(fillLayer.widthPx - 1, fillResult.maxX + pad);
  const patchMaxY = Math.min(fillLayer.heightPx - 1, fillResult.maxY + pad);
  const patchW = patchMaxX - patchX + 1;
  const patchH = patchMaxY - patchY + 1;

  const fillPatch = fillLayer.ctx.getImageData(patchX, patchY, patchW, patchH);
  for (let y = fillResult.minY; y <= fillResult.maxY; y += 1) {
    for (let x = fillResult.minX; x <= fillResult.maxX; x += 1) {
      if (fillResult.mask[y * fillLayer.widthPx + x] !== 2) continue;
      const patchIdx = ((y - patchY) * patchW + (x - patchX)) * 4;
      fillPatch.data[patchIdx] = rgb.r;
      fillPatch.data[patchIdx + 1] = rgb.g;
      fillPatch.data[patchIdx + 2] = rgb.b;
      fillPatch.data[patchIdx + 3] = 255;
    }
  }

  featherFillIntoEdge(
    workImage.data,
    fillPatch.data,
    fillResult.mask,
    fillLayer.widthPx,
    fillLayer.heightPx,
    patchX,
    patchY,
    patchW,
    patchH,
    rgb
  );
  fillLayer.ctx.putImageData(fillPatch, patchX, patchY);
}

function rebuildFillLayer() {
  const { widthCss, heightCss, scaleX, scaleY } = getCanvasRasterMetrics();
  const overscan = fillLayer.overscanFactor;
  const cacheCssW = widthCss * overscan;
  const cacheCssH = heightCss * overscan;
  const marginX = (cacheCssW - widthCss) * 0.5;
  const marginY = (cacheCssH - heightCss) * 0.5;
  const targetW = Math.max(1, Math.ceil(cacheCssW * scaleX));
  const targetH = Math.max(1, Math.ceil(cacheCssH * scaleY));

  const fctx = ensureFillLayerSurface(targetW, targetH);
  if (!fctx) return false;

  fillLayer.snapshotWidth = cacheCssW;
  fillLayer.snapshotHeight = cacheCssH;
  fillLayer.snapshotOffsetX = marginX;
  fillLayer.snapshotOffsetY = marginY;
  fillLayer.snapshotZoom = state.view.zoom;
  fillLayer.snapshotPanX = state.view.panX;
  fillLayer.snapshotPanY = state.view.panY;
  fillLayer.snapshotPaperOffsetX = state.paperOffsetX;
  fillLayer.snapshotPaperOffsetY = state.paperOffsetY;
  fillLayer.viewSignature = fillViewSignature();

  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.clearRect(0, 0, fillLayer.widthPx, fillLayer.heightPx);

  for (let i = 0; i < fillLayer.operations.length; i += 1) {
    applyFillOperationToLayer(fillLayer.operations[i]);
  }

  fillLayer.valid = true;
  return true;
}

function ensureFillLayerReady() {
  const hasRenderableFill = !!fillLayer.canvas && fillLayer.widthPx > 0 && fillLayer.heightPx > 0;
  const shouldDeferHeavyRebuild = (state.dragging && state.view.dragMode === "pan") || viewInteractionCache.active;

  if (!fillLayer.valid) {
    if (shouldDeferHeavyRebuild) {
      pendingFillLayerRebuild = true;
      return hasRenderableFill;
    }
    return rebuildFillLayer();
  }
  if (fillLayer.viewSignature !== fillViewSignature()) {
    if (shouldDeferHeavyRebuild) {
      pendingFillLayerRebuild = true;
      return hasRenderableFill;
    }
    return rebuildFillLayer();
  }

  const deltaScreenX = Math.abs((state.paperOffsetX - fillLayer.snapshotPaperOffsetX) * state.view.zoom);
  const deltaScreenY = Math.abs((state.paperOffsetY - fillLayer.snapshotPaperOffsetY) * state.view.zoom);
  const availableMarginX = Math.max(8, (fillLayer.snapshotOffsetX || 0) - 2);
  const availableMarginY = Math.max(8, (fillLayer.snapshotOffsetY || 0) - 2);
  if (deltaScreenX > availableMarginX || deltaScreenY > availableMarginY) {
    if (shouldDeferHeavyRebuild) {
      pendingFillLayerRebuild = true;
      return fillLayer.valid;
    }
    return rebuildFillLayer();
  }

  return true;
}

function drawFillLayer(scaleX, scaleY, viewportOffsetX = 0, viewportOffsetY = 0) {
  if (!fillLayer.operations.length) return;
  if (!ensureFillLayerReady()) return;

  const snapshotZoom = fillLayer.snapshotZoom || 1;
  const scale = state.view.zoom / snapshotZoom;
  const paperDeltaX = state.paperOffsetX - fillLayer.snapshotPaperOffsetX;
  const paperDeltaY = state.paperOffsetY - fillLayer.snapshotPaperOffsetY;
  const tx =
    state.centre.x +
    state.view.panX +
    viewportOffsetX -
    scale * (state.centre.x + fillLayer.snapshotPanX + fillLayer.snapshotOffsetX) +
    paperDeltaX * state.view.zoom;
  const ty =
    state.centre.y +
    state.view.panY +
    viewportOffsetY -
    scale * (state.centre.y + fillLayer.snapshotPanY + fillLayer.snapshotOffsetY) +
    paperDeltaY * state.view.zoom;
  const destW = fillLayer.snapshotWidth * scale;
  const destH = fillLayer.snapshotHeight * scale;

  ctx.save();
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.drawImage(
    fillLayer.canvas,
    0,
    0,
    fillLayer.widthPx,
    fillLayer.heightPx,
    tx,
    ty,
    destW || fillLayer.snapshotWidth,
    destH || fillLayer.snapshotHeight
  );
  ctx.restore();
}

function canApplyFillIncrementally() {
  if (!fillLayer.valid || !fillLayer.canvas || !fillLayer.ctx) return false;
  if (!fillLayer.widthPx || !fillLayer.heightPx) return false;
  if (fillLayer.viewSignature !== fillViewSignature()) return false;

  const epsilon = 1e-6;
  if (Math.abs((fillLayer.snapshotZoom || 1) - state.view.zoom) > epsilon) return false;
  if (Math.abs((fillLayer.snapshotPanX || 0) - state.view.panX) > epsilon) return false;
  if (Math.abs((fillLayer.snapshotPanY || 0) - state.view.panY) > epsilon) return false;
  if (Math.abs((fillLayer.snapshotPaperOffsetX || 0) - state.paperOffsetX) > epsilon) return false;
  if (Math.abs((fillLayer.snapshotPaperOffsetY || 0) - state.paperOffsetY) > epsilon) return false;

  return true;
}

function refineFillSeedWorld(worldX, worldY) {
  if (state.strokes.length === 0) {
    return { x: worldX, y: worldY };
  }

  const { widthCss, heightCss, scaleX, scaleY } = getCanvasRasterMetrics();
  if (widthCss < 2 || heightCss < 2 || scaleX <= 0 || scaleY <= 0 || state.view.zoom <= 0) {
    return { x: worldX, y: worldY };
  }

  const targetW = Math.max(1, Math.ceil(widthCss * scaleX));
  const targetH = Math.max(1, Math.ceil(heightCss * scaleY));
  const workCtx = ensureFillWorkSurface(targetW, targetH);
  if (!workCtx) {
    return { x: worldX, y: worldY };
  }

  workCtx.setTransform(1, 0, 0, 1, 0, 0);
  workCtx.clearRect(0, 0, targetW, targetH);

  const previousCtx = ctx;
  ctx = workCtx;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.translate(state.centre.x + state.view.panX, state.centre.y + state.view.panY);
  ctx.scale(state.view.zoom, state.view.zoom);
  ctx.translate(-state.centre.x, -state.centre.y);
  drawTrace();
  ctx = previousCtx;

  const seedCssX = state.centre.x + state.view.panX + (worldX - state.centre.x) * state.view.zoom;
  const seedCssY = state.centre.y + state.view.panY + (worldY - state.centre.y) * state.view.zoom;
  let seedX = Math.round((seedCssX / Math.max(1, widthCss)) * targetW);
  let seedY = Math.round((seedCssY / Math.max(1, heightCss)) * targetH);
  if (seedX < 0 || seedX >= targetW || seedY < 0 || seedY >= targetH) {
    return { x: worldX, y: worldY };
  }

  const workImage = workCtx.getImageData(0, 0, targetW, targetH);
  const isInteriorPixel = (x, y) => {
    if (x < 0 || x >= targetW || y < 0 || y >= targetH) return false;
    const idx = (y * targetW + x) * 4;
    return workImage.data[idx + 3] < 18;
  };

  if (!isInteriorPixel(seedX, seedY)) {
    let found = null;
    const maxProbeRadius = 14;
    for (let radius = 1; radius <= maxProbeRadius && !found; radius += 1) {
      for (let oy = -radius; oy <= radius && !found; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          if (Math.abs(ox) !== radius && Math.abs(oy) !== radius) continue;
          const px = seedX + ox;
          const py = seedY + oy;
          if (!isInteriorPixel(px, py)) continue;
          found = { x: px, y: py };
          break;
        }
      }
    }
    if (!found) {
      return { x: worldX, y: worldY };
    }
    seedX = found.x;
    seedY = found.y;
  }

  const searchRadius = Math.max(220, Math.floor(Math.min(targetW, targetH) * 0.42));
  const boundedSearch = {
    minX: Math.max(0, seedX - searchRadius),
    minY: Math.max(0, seedY - searchRadius),
    maxX: Math.min(targetW - 1, seedX + searchRadius),
    maxY: Math.min(targetH - 1, seedY + searchRadius)
  };

  let fillResult = floodFillImageData(workImage.data, targetW, targetH, seedX, seedY, 14, boundedSearch);
  if (fillResult.changed && fillResult.touchedBounds) {
    fillResult = floodFillImageData(workImage.data, targetW, targetH, seedX, seedY, 14, null);
  }
  if (!fillResult.changed || !fillResult.mask) {
    return { x: worldX, y: worldY };
  }

  const distanceField = new Float32Array(targetW * targetH);
  const INF = 1e9;
  for (let y = fillResult.minY; y <= fillResult.maxY; y += 1) {
    for (let x = fillResult.minX; x <= fillResult.maxX; x += 1) {
      const idx = y * targetW + x;
      if (fillResult.mask[idx] !== 2) {
        distanceField[idx] = 0;
        continue;
      }

      const leftInside = x > fillResult.minX && fillResult.mask[idx - 1] === 2;
      const rightInside = x < fillResult.maxX && fillResult.mask[idx + 1] === 2;
      const upInside = y > fillResult.minY && fillResult.mask[idx - targetW] === 2;
      const downInside = y < fillResult.maxY && fillResult.mask[idx + targetW] === 2;
      const isBoundaryCell = !(leftInside && rightInside && upInside && downInside);
      distanceField[idx] = isBoundaryCell ? 1 : INF;
    }
  }

  const DIAG = 1.41421356237;
  for (let y = fillResult.minY; y <= fillResult.maxY; y += 1) {
    for (let x = fillResult.minX; x <= fillResult.maxX; x += 1) {
      const idx = y * targetW + x;
      if (fillResult.mask[idx] !== 2) continue;
      let best = distanceField[idx];
      if (x > fillResult.minX) best = Math.min(best, distanceField[idx - 1] + 1);
      if (y > fillResult.minY) best = Math.min(best, distanceField[idx - targetW] + 1);
      if (x > fillResult.minX && y > fillResult.minY) best = Math.min(best, distanceField[idx - targetW - 1] + DIAG);
      if (x < fillResult.maxX && y > fillResult.minY) best = Math.min(best, distanceField[idx - targetW + 1] + DIAG);
      distanceField[idx] = best;
    }
  }

  for (let y = fillResult.maxY; y >= fillResult.minY; y -= 1) {
    for (let x = fillResult.maxX; x >= fillResult.minX; x -= 1) {
      const idx = y * targetW + x;
      if (fillResult.mask[idx] !== 2) continue;
      let best = distanceField[idx];
      if (x < fillResult.maxX) best = Math.min(best, distanceField[idx + 1] + 1);
      if (y < fillResult.maxY) best = Math.min(best, distanceField[idx + targetW] + 1);
      if (x < fillResult.maxX && y < fillResult.maxY) best = Math.min(best, distanceField[idx + targetW + 1] + DIAG);
      if (x > fillResult.minX && y < fillResult.maxY) best = Math.min(best, distanceField[idx + targetW - 1] + DIAG);
      distanceField[idx] = best;
    }
  }

  let chosenX = seedX;
  let chosenY = seedY;
  let bestInteriorDistance = -1;
  let bestSeedDistanceSq = Number.POSITIVE_INFINITY;
  for (let y = fillResult.minY; y <= fillResult.maxY; y += 1) {
    for (let x = fillResult.minX; x <= fillResult.maxX; x += 1) {
      const idx = y * targetW + x;
      if (fillResult.mask[idx] !== 2) continue;
      const interiorDistance = distanceField[idx];
      const dx = x - seedX;
      const dy = y - seedY;
      const seedDistanceSq = dx * dx + dy * dy;
      const isBetterDistance = interiorDistance > bestInteriorDistance + 1e-6;
      const isTieButCloserToSeed = Math.abs(interiorDistance - bestInteriorDistance) <= 1e-6
        && seedDistanceSq < bestSeedDistanceSq;
      if (!isBetterDistance && !isTieButCloserToSeed) continue;

      bestInteriorDistance = interiorDistance;
      bestSeedDistanceSq = seedDistanceSq;
      chosenX = x;
      chosenY = y;
    }
  }

  const chosenCssX = (chosenX / Math.max(1, targetW)) * widthCss;
  const chosenCssY = (chosenY / Math.max(1, targetH)) * heightCss;
  return {
    x: state.centre.x + (chosenCssX - state.centre.x - state.view.panX) / state.view.zoom,
    y: state.centre.y + (chosenCssY - state.centre.y - state.view.panY) / state.view.zoom
  };
}

function addFillOperationAtWorld(worldX, worldY) {
  const refinedSeed = refineFillSeedWorld(worldX, worldY);
  const op = {
    paperX: refinedSeed.x - state.paperOffsetX,
    paperY: refinedSeed.y - state.paperOffsetY,
    colour: state.fillColour
  };

  if (state.undoneHistoryEntries.length > 0) {
    state.undoneHistoryEntries = [];
  }

  const canApplyNow = canApplyFillIncrementally();
  fillLayer.operations.push(op);
  state.historyEntries.push({ type: "fill", operation: op });
  if (canApplyNow) {
    applyFillOperationToLayer(op);
    fillLayer.valid = true;
  } else {
    fillLayer.valid = false;
  }
  traceLayer.valid = false;
  syncHistoryControls();
  draw();
}

function syncPenModeControls() {
  const solidMode = state.penMode === "solid";
  if (controls.inkColourLabel) {
    controls.inkColourLabel.style.display = solidMode ? "" : "none";
  }
  if (controls.colourRow) {
    controls.colourRow.classList.toggle("is-single", !solidMode);
  }
  if (controls.inkColour) {
    controls.inkColour.disabled = !solidMode;
  }
}

function selectedPenMode() {
  const selected = document.querySelector('input[name="penType"]:checked');
  return selected ? selected.value : "solid";
}

function spectraColourAtDistance(distance) {
  const hue = ((distance * 0.75) % 360 + 360) % 360;
  return `hsl(${hue} 100% 50%)`;
}

function hexToRgb(hex) {
  if (!hex) return null;
  let value = String(hex).trim();
  if (value.startsWith("#")) value = value.slice(1);
  if (value.length === 3) {
    value = value.split("").map((c) => c + c).join("");
  }
  if (value.length !== 6) return null;
  const intValue = Number.parseInt(value, 16);
  if (Number.isNaN(intValue)) return null;
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255
  };
}

function getTimestampSlug() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
}

async function shareOrDownloadFile(filename, blob) {
  if (canUseNativeFileShare()) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return true;
      } catch (error) {
        if (error?.name === "AbortError") return false;
      }
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return true;
}

function exportCurrentViewAsPng(options = {}) {
  const { includeGear = true, transparent = false } = options;
  const previousShowGear = state.showGear;
  const previousZoom = state.view.zoom;
  const previousPanX = state.view.panX;
  const previousPanY = state.view.panY;
  const originalCanvasWidth = canvas.width;
  const originalCanvasHeight = canvas.height;
  state.showGear = includeGear;

  // Export should frame all content, even when distant from the rig centre.
  const bounds = getContentBounds();
  const viewport = canvas.parentElement.getBoundingClientRect();
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const padding = 0.08;
  const exportZoom = Math.max(
    0.0001,
    Math.min(
      state.view.maxZoom,
      Math.min(
        (viewport.width * (1 - padding)) / contentWidth,
        (viewport.height * (1 - padding)) / contentHeight
      )
    )
  );
  const contentCenterX = (bounds.minX + bounds.maxX) * 0.5;
  const contentCenterY = (bounds.minY + bounds.maxY) * 0.5;
  state.view.zoom = exportZoom;
  state.view.panX = -(contentCenterX - state.centre.x) * exportZoom;
  state.view.panY = -(contentCenterY - state.centre.y) * exportZoom;

  const exportScale = 2;

  // Supersample export rendering so zoomed-out views still export with good detail.
  canvas.width = Math.max(1, Math.round(originalCanvasWidth * exportScale));
  canvas.height = Math.max(1, Math.round(originalCanvasHeight * exportScale));
  traceLayer.valid = false;
  fillLayer.valid = false;
  viewInteractionCache.valid = false;
  draw(!transparent);

  try {
    const sourceCtx = canvas.getContext("2d", { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;
    if (!sourceCtx || width < 1 || height < 1) return;

    const paper = hexToRgb(state.paperColour) || { r: 253, g: 233, b: 212 };
    const tolerance = 8;
    const data = sourceCtx.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        const differsFromPaper =
          Math.abs(r - paper.r) > tolerance
          || Math.abs(g - paper.g) > tolerance
          || Math.abs(b - paper.b) > tolerance
          || a < 250;

        if (transparent) {
          if (a < 5) continue;
        } else if (!differsFromPaper) {
          continue;
        }

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      return;
    }

    const pad = Math.round((window.devicePixelRatio || 1) * 18);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    const out = document.createElement("canvas");
    out.width = cropW;
    out.height = cropH;
    const outCtx = out.getContext("2d");
    
    if (transparent) {
      outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    } else {
      outCtx.fillStyle = state.paperColour;
      outCtx.fillRect(0, 0, cropW, cropH);
      outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    }

    out.toBlob(async (blob) => {
      if (!blob) return;
      await shareOrDownloadFile(`gyrograf-diagram-${getTimestampSlug()}.png`, blob);
    }, "image/png");
  } finally {
    canvas.width = originalCanvasWidth;
    canvas.height = originalCanvasHeight;
    traceLayer.valid = false;
    fillLayer.valid = false;
    viewInteractionCache.valid = false;
    state.view.zoom = previousZoom;
    state.view.panX = previousPanX;
    state.view.panY = previousPanY;
    state.showGear = previousShowGear;
    draw();
  }
}

function openHelpModal() {
  controls.helpOverlay.classList.add("show");
  controls.helpOverlay.setAttribute("aria-hidden", "false");
}

function closeHelpModal() {
  controls.helpOverlay.classList.remove("show");
  controls.helpOverlay.setAttribute("aria-hidden", "true");
}

function openAboutModal() {
  controls.aboutOverlay.classList.add("show");
  controls.aboutOverlay.setAttribute("aria-hidden", "false");
}

function closeAboutModal() {
  controls.aboutOverlay.classList.remove("show");
  controls.aboutOverlay.setAttribute("aria-hidden", "true");
}

function openExportModal() {
  syncExportActionLabels();
  controls.exportOverlay.classList.add("show");
  controls.exportOverlay.setAttribute("aria-hidden", "false");
}

function closeExportModal() {
  controls.exportOverlay.classList.remove("show");
  controls.exportOverlay.setAttribute("aria-hidden", "true");
}

function syncGearToggleButton() {
  controls.toggleGear.innerHTML = state.showGear ? "HIDE<br>GEARS" : "SHOW<br>GEARS";
  controls.toggleGear.classList.toggle("is-off", !state.showGear);
}

function normaliseRackAngleDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function updateRackRotationReadout(degrees) {
  if (!controls.rackRotateValue) return;
  controls.rackRotateValue.textContent = `${Math.round(normaliseRackAngleDegrees(degrees))} deg`;
}

function syncRackRotationControl() {
  if (!controls.rackRotateControl || !controls.rackRotateSlider) return;
  const show = isRackMode();
  controls.rackRotateControl.classList.toggle("is-visible", show);
  controls.rackRotateControl.setAttribute("aria-hidden", show ? "false" : "true");
  if (!show) return;

  const degrees = normaliseRackAngleDegrees((state.rackOrientationLocked * 180) / Math.PI);
  controls.rackRotateSlider.value = String(Math.round(degrees));
  updateRackRotationReadout(degrees);
}

function selectedPiece() {
  return PRESETS.pieces.find((piece) => piece.id === state.ringPieceId) || PRESETS.pieces[0];
}

function isRackMode() {
  return selectedPiece().kind === "rack";
}

function availableWheels() {
  if (isRackMode()) {
    return PRESETS.wheels.filter((teeth) => teeth < state.bigTeeth);
  }
  return PRESETS.wheels.filter((teeth) => (state.mode === "inside" ? teeth < state.bigTeeth : true));
}

function wheelHoleCount(teeth) {
  return WHEEL_HOLE_MAP[teeth] || Math.max(5, Math.round(teeth * 0.4));
}

function currentRingToothDepth() {
  return Math.max(TOOTH_STYLE.minDepth, Math.min(TOOTH_STYLE.maxDepth, state.toothPitch * TOOTH_STYLE.depthScale));
}

function currentWheelToothDepth() {
  return currentRingToothDepth() * 0.92;
}

function rackStraightLength() {
  const piece = selectedPiece();
  if (piece.kind !== "rack") return 0;
  return piece.teeth * state.toothPitch;
}

function rackEndRadius() {
  return (state.rackEndTeeth * state.toothPitch) / Math.PI;
}

function rackLoopLength() {
  const straight = rackStraightLength();
  const radius = rackEndRadius();
  return 2 * straight + 2 * Math.PI * radius;
}

function rackOrientationAngle() {
  if (!isRackMode()) return 0;
  return state.rackOrientationLocked;
}

function isCanvasBlank() {
  if (state.strokes.length === 0) return true;
  for (let s = 0; s < state.strokes.length; s += 1) {
    const stroke = state.strokes[s];
    if (stroke?.points?.length) return false;
  }
  return true;
}

function currentPreferredRackOrientation() {
  if (!narrowMedia.matches) return 0;
  return window.matchMedia("(orientation: portrait)").matches ? Math.PI / 2 : 0;
}

function normaliseRackTravel(value) {
  const length = rackLoopLength();
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
}

function syncTrackOptions() {
  const piece = selectedPiece();

  if (piece.kind === "rack") {
    state.track = "outer";
    state.mode = "outside";
    controls.trackOptions.innerHTML = "<label><input type=\"radio\" name=\"track\" value=\"outer\" checked disabled /> Outside (rack only)</label>";
    controls.trackFieldset?.classList.add("is-disabled");
    return;
  }

  controls.trackFieldset?.classList.remove("is-disabled");
  controls.trackOptions.innerHTML = [
    { value: "inner", label: `Inner (${piece.innerTeeth} teeth)` },
    { value: "outer", label: `Outer (${piece.outerTeeth} teeth)` }
  ]
    .map((item) => `<label><input type="radio" name="track" value="${item.value}" /> ${item.label}</label>`)
    .join("");

  // Set the checked radio button
  const trackRadio = document.querySelector(`input[name="track"][value="${state.track}"]`);
  if (trackRadio) trackRadio.checked = true;
  
  // Attach event listeners to the newly created radio buttons
  attachTrackListener();
}

function syncWheelOptions() {
  const options = availableWheels();
  const previous = state.smallTeeth;
  controls.smallTeeth.innerHTML = "";
  for (let i = 0; i < options.length; i += 1) {
    const teeth = options[i];
    const option = document.createElement("option");
    option.value = String(teeth);
    option.textContent = `${teeth} teeth`;
    controls.smallTeeth.appendChild(option);
  }

  if (!options.length) return;
  state.smallTeeth = options.includes(previous) ? previous : options[Math.floor(options.length / 2)];
  controls.smallTeeth.value = String(state.smallTeeth);
}

function rebuildHoles() {
  state.holes = [];
  const count = wheelHoleCount(state.smallTeeth);
  const minRadius = 10;
  const maxRadius = Math.max(minRadius + 8, state.smallRadius - 16);
  const turns = Math.max(1.2, Math.min(2.6, 1 + count / 24));
  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1);
    const spiralRadius = minRadius + t * (maxRadius - minRadius);
    const spiralAngle = -Math.PI / 2 + t * turns * Math.PI * 2;
    state.holes.push({ r: spiralRadius, a: spiralAngle });
  }
}

function refreshMeta() {
}

function updateGeometryFromTeeth() {
  const piece = selectedPiece();
  const bounds = canvas.getBoundingClientRect();
  const maxFitRadius = Math.max(60, Math.min(bounds.width, bounds.height) * 0.5 - 24);
  const fitOuterRadius = Math.min(300, maxFitRadius);

  if (piece.kind === "rack") {
    state.toothPitch = (Math.PI * 2 * fitOuterRadius) / piece.teeth;
    state.rackLength = rackStraightLength() + 2 * rackEndRadius();
    state.mode = "outside";
    state.bigTeeth = piece.teeth;
    state.bigRadius = 0;
    state.smallRadius = (state.toothPitch * state.smallTeeth) / (Math.PI * 2);
    return;
  }

  state.ringOuterRadius = fitOuterRadius;
  state.toothPitch = (Math.PI * 2 * fitOuterRadius) / piece.outerTeeth;
  state.ringInnerRadius = (state.toothPitch * piece.innerTeeth) / (Math.PI * 2);

  if (state.track === "inner") {
    state.mode = "inside";
    state.bigTeeth = piece.innerTeeth;
    state.bigRadius = state.ringInnerRadius;
  } else {
    state.mode = "outside";
    state.bigTeeth = piece.outerTeeth;
    state.bigRadius = state.ringOuterRadius;
  }

  state.smallRadius = (state.toothPitch * state.smallTeeth) / (Math.PI * 2);
}

function resizeCanvas() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  if (bounds.width < 20 || bounds.height < 20) {
    return false;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.ceil(bounds.width * dpr);
  canvas.height = Math.ceil(bounds.height * dpr);
  const scaleX = bounds.width > 0 ? canvas.width / bounds.width : dpr;
  const scaleY = bounds.height > 0 ? canvas.height / bounds.height : dpr;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  state.centre.x = bounds.width / 2;
  state.centre.y = bounds.height / 2;
  return true;
}

function canvasPointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function screenToWorld(clientX, clientY) {
  const screen = canvasPointFromClient(clientX, clientY);
  return {
    x: state.centre.x + (screen.x - state.centre.x - state.view.panX) / state.view.zoom,
    y: state.centre.y + (screen.y - state.centre.y - state.view.panY) / state.view.zoom
  };
}

function applyViewportTransform() {
  const { scaleX, scaleY } = getCanvasRasterMetrics();
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.translate(state.centre.x + state.view.panX, state.centre.y + state.view.panY);
  ctx.scale(state.view.zoom, state.view.zoom);
  ctx.translate(-state.centre.x, -state.centre.y);
}

function setZoomAt(clientX, clientY, nextZoom) {
  state.view.zoom = Math.max(state.view.minZoom, Math.min(state.view.maxZoom, nextZoom));
  // Rig stays anchored at centre; zoom does not introduce view translation.
  state.view.panX = 0;
  state.view.panY = 0;
}

function cancelViewAnimation() {
  if (state.view.animationFrame) {
    cancelAnimationFrame(state.view.animationFrame);
    state.view.animationFrame = 0;
    if (viewInteractionCache.settleTimer) {
      clearTimeout(viewInteractionCache.settleTimer);
      viewInteractionCache.settleTimer = 0;
    }
    viewInteractionCache.active = false;
    viewInteractionCache.valid = false;
  }
}

function updateCanvasCursor(clientX = null, clientY = null) {
  if (state.dragging) {
    canvas.style.cursor = "grabbing";
    return;
  }

  if (clientX === null || clientY === null) {
    canvas.style.cursor = "grab";
    return;
  }

  const worldPoint = screenToWorld(clientX, clientY);
  const holeIndex = nearestHole(worldPoint);
  canvas.style.cursor = holeIndex >= 0 ? "pointer" : "grab";
}

function flashZoomCursor(deltaY) {
  if (cursorResetTimer) {
    clearTimeout(cursorResetTimer);
  }

  canvas.style.cursor = deltaY < 0 ? "zoom-in" : "zoom-out";
  cursorResetTimer = setTimeout(() => {
    cursorResetTimer = 0;
    updateCanvasCursor(state.view.lastScreenX, state.view.lastScreenY);
  }, 140);
}

function syncLayoutGeometry(options = {}) {
  const { fitView = false } = options;
  const oldCentre = { x: state.centre.x, y: state.centre.y };
  const oldOuterRadius = state.ringOuterRadius;

  if (!resizeCanvas()) {
    return;
  }

  updateGeometryFromTeeth();
  const scale = oldOuterRadius > 0 ? state.ringOuterRadius / oldOuterRadius : 1;
  if (state.strokes.length > 0) {
    state.strokes.forEach((stroke) => {
      if (!stroke.points) return;
      stroke.points.forEach((point) => {
        point.x = state.centre.x + (point.x - oldCentre.x) * scale;
        point.y = state.centre.y + (point.y - oldCentre.y) * scale;
      });
    });
    state.traceRevision += 1;

    if (state.activeStroke) {
      state.activeStroke = state.strokes[state.strokes.length - 1] || null;
    }
  }

  if (state.undoneStrokes.length > 0) {
    state.undoneStrokes.forEach((stroke) => {
      if (!stroke.points) return;
      stroke.points.forEach((point) => {
        point.x = state.centre.x + (point.x - oldCentre.x) * scale;
        point.y = state.centre.y + (point.y - oldCentre.y) * scale;
      });
    });
  }

  if (fillLayer.operations.length > 0) {
    fillLayer.operations.forEach((op) => {
      op.paperX = state.centre.x + (op.paperX - oldCentre.x) * scale;
      op.paperY = state.centre.y + (op.paperY - oldCentre.y) * scale;
    });
  }

  fillLayer.valid = false;

  rebuildHoles();
  refreshMeta();
  if (fitView) {
    fitViewToContent();
  }
  draw();
  scheduleRenderWarmup(220);
}

function scheduleLayoutGeometrySync(options = {}) {
  if (pendingLayoutFrame) {
    cancelAnimationFrame(pendingLayoutFrame);
  }
  const { fitView = false } = options;
  pendingLayoutFrame = requestAnimationFrame(() => {
    pendingLayoutFrame = 0;
    syncLayoutGeometry({ fitView });
  });
}

function applyPanelState(open, fromUser = true) {
  state.panelOpen = open;
  layoutRoot.classList.toggle("panel-hidden", !open);
  panelTab.setAttribute("aria-expanded", open ? "true" : "false");

  if (fromUser) {
    if (narrowMedia.matches) {
      state.narrowPanelPreference = open;
    } else {
      state.userPanelPreference = open;
    }
  }
}

function applyViewportPanelRule() {
  const isNarrow = narrowMedia.matches;

  if (isNarrow) {
    if (state.narrowPanelPreference === null) {
      applyPanelState(true, false);
    } else {
      applyPanelState(state.narrowPanelPreference, false);
    }
    return;
  }

  state.narrowPanelPreference = null;

  if (state.userPanelPreference === false) {
    applyPanelState(false, false);
  } else {
    applyPanelState(true, false);
  }
}

function holeWorldPosition(index) {
  const hole = state.holes[index];
  if (!hole) return null;
  const { x: cx, y: cy } = smallCentre();
  const phi = smallRotation();
  return {
    x: cx + Math.cos(phi + hole.a) * hole.r,
    y: cy + Math.sin(phi + hole.a) * hole.r
  };
}

function currentDistance() {
  return state.mode === "inside" ? state.bigRadius - state.smallRadius : state.bigRadius + state.smallRadius;
}

function rotateAround(point, centre, angle) {
  if (angle === 0) return { x: point.x, y: point.y };
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return {
    x: centre.x + dx * cosA - dy * sinA,
    y: centre.y + dx * sinA + dy * cosA
  };
}

function gcdInt(a, b) {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function strokeClosureThetaSpan() {
  const teethGcd = gcdInt(state.bigTeeth, state.smallTeeth);

  if (isRackMode()) {
    const piece = selectedPiece();
    const loopsForClosure = state.smallTeeth / gcdInt(2 * (piece.teeth + state.rackEndTeeth), state.smallTeeth);
    return rackLoopLength() * loopsForClosure;
  }

  return ((Math.PI * 2) * state.smallTeeth) / teethGcd;
}

function rackPathPoseAt(travel) {
  const straight = rackStraightLength();
  const radius = rackEndRadius();
  const left = state.centre.x - straight / 2;
  const right = state.centre.x + straight / 2;
  const topY = state.centre.y - radius;
  const bottomY = state.centre.y + radius;
  const arcLen = Math.PI * radius;
  const s = normaliseRackTravel(travel);

  let pose;

  if (s < straight) {
    pose = {
      x: left + s,
      y: topY,
      tangentAngle: 0,
      progress: s
    };
  } else if (s < straight + arcLen) {
    const t = (s - straight) / arcLen;
    const angle = -Math.PI / 2 + t * Math.PI;
    pose = {
      x: right + Math.cos(angle) * radius,
      y: topY + radius + Math.sin(angle) * radius,
      tangentAngle: angle + Math.PI / 2,
      progress: s
    };
  } else if (s < 2 * straight + arcLen) {
    const t = s - (straight + arcLen);
    pose = {
      x: right - t,
      y: bottomY,
      tangentAngle: Math.PI,
      progress: s
    };
  } else {
    const t = (s - (2 * straight + arcLen)) / arcLen;
    const angle = Math.PI / 2 + t * Math.PI;
    pose = {
      x: left + Math.cos(angle) * radius,
      y: topY + radius + Math.sin(angle) * radius,
      tangentAngle: angle + Math.PI / 2,
      progress: s
    };
  }

  const orientation = rackOrientationAngle();
  if (orientation === 0) {
    return pose;
  }

  const rotatedPoint = rotateAround(pose, state.centre, orientation);
  return {
    x: rotatedPoint.x,
    y: rotatedPoint.y,
    tangentAngle: pose.tangentAngle + orientation,
    progress: pose.progress
  };
}

function rackPathPose() {
  return rackPathPoseAt(state.theta);
}

function smallCentre() {
  if (isRackMode()) {
    const pose = rackPathPose();
    const normalAngle = pose.tangentAngle - Math.PI / 2;
    return {
      x: pose.x + Math.cos(normalAngle) * state.smallRadius,
      y: pose.y + Math.sin(normalAngle) * state.smallRadius
    };
  }

  const d = currentDistance();
  return {
    x: state.centre.x + Math.cos(state.theta) * d,
    y: state.centre.y + Math.sin(state.theta) * d
  };
}

function smallRotation() {
  if (isRackMode()) {
    const pose = rackPathPose();
    return state.theta / state.smallRadius + pose.tangentAngle;
  }

  const R = state.bigRadius;
  const r = state.smallRadius;
  if (state.mode === "inside") {
    return -((R - r) / r) * state.theta;
  }
  return ((R + r) / r) * state.theta;
}

function rackMeshPhaseOffset() {
  const toothCount = Math.max(1, state.smallTeeth);
  const step = (Math.PI * 2) / toothCount;
  const contactAngle = Math.PI / 2;
  const peakFraction = TOOTH_STYLE.peakFraction;
  const peakIndex = Math.round(contactAngle / step - peakFraction);
  return contactAngle - (peakIndex + peakFraction) * step;
}

function drawCogRing(x, y, radius, toothDepth, toothCount, colour, fill = false, phase = 0) {
  const tipRadius = radius + toothDepth;
  const rootRadius = radius - toothDepth * TOOTH_STYLE.rootFactor;
  const step = (Math.PI * 2) / toothCount;
  ctx.beginPath();
  for (let i = 0; i < toothCount; i += 1) {
    const a0 = phase + i * step;
    const aPeak = a0 + step * TOOTH_STYLE.peakFraction;
    const a2 = a0 + step;
    if (i === 0) {
      ctx.moveTo(x + Math.cos(a0) * rootRadius, y + Math.sin(a0) * rootRadius);
    }
    ctx.lineTo(x + Math.cos(aPeak) * tipRadius, y + Math.sin(aPeak) * tipRadius);
    ctx.lineTo(x + Math.cos(a2) * rootRadius, y + Math.sin(a2) * rootRadius);
  }
  ctx.closePath();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6;
  if (fill) {
    ctx.fillStyle = GEAR_FILL_COLOR;
    ctx.fill();
  }
  ctx.stroke();
}

function traceToothTrackPath(x, y, pitchRadius, toothDepth, toothCount, direction = "out") {
  const step = (Math.PI * 2) / toothCount;
  const tipRadius = direction === "out" ? pitchRadius + toothDepth : pitchRadius - toothDepth;
  const rootRadius =
    direction === "out"
      ? pitchRadius - toothDepth * TOOTH_STYLE.rootFactor
      : pitchRadius + toothDepth * TOOTH_STYLE.rootFactor;

  for (let i = 0; i < toothCount; i += 1) {
    const a0 = i * step;
    const aPeak = a0 + step * TOOTH_STYLE.peakFraction;
    const a2 = a0 + step;
    if (i === 0) {
      ctx.moveTo(x + Math.cos(a0) * rootRadius, y + Math.sin(a0) * rootRadius);
    }
    ctx.lineTo(x + Math.cos(aPeak) * tipRadius, y + Math.sin(aPeak) * tipRadius);
    ctx.lineTo(x + Math.cos(a2) * rootRadius, y + Math.sin(a2) * rootRadius);
  }
  ctx.closePath();
}

function drawRingPiece() {
  const piece = selectedPiece();
  if (piece.kind === "rack") {
    const orientation = rackOrientationAngle();
    if (orientation !== 0) {
      ctx.save();
      ctx.translate(state.centre.x, state.centre.y);
      ctx.rotate(orientation);
      ctx.translate(-state.centre.x, -state.centre.y);
    }

    const toothDepth = currentRingToothDepth();
    const toothRootInset = toothDepth * TOOTH_STYLE.rootFactor;
    const radius = rackEndRadius();
    const left = state.centre.x - rackStraightLength() / 2;
    const right = state.centre.x + rackStraightLength() / 2;
    const topY = state.centre.y - radius;
    const bottomY = state.centre.y + radius;
    const arcStep = Math.PI / state.rackEndTeeth;
    const rootRadius = radius - toothRootInset;
    const tipRadius = radius + toothDepth;

    ctx.beginPath();
    ctx.moveTo(left, topY + toothRootInset);
    for (let i = 0; i < piece.teeth; i += 1) {
      const x0 = left + i * state.toothPitch;
      const xPeak = x0 + state.toothPitch * TOOTH_STYLE.peakFraction;
      const x1 = x0 + state.toothPitch;
      ctx.lineTo(xPeak, topY - toothDepth);
      ctx.lineTo(x1, topY + toothRootInset);
    }

    for (let i = 0; i < state.rackEndTeeth; i += 1) {
      const a0 = -Math.PI / 2 + i * arcStep;
      const aPeak = a0 + arcStep * TOOTH_STYLE.peakFraction;
      const a1 = a0 + arcStep;
      ctx.lineTo(right + Math.cos(aPeak) * tipRadius, topY + radius + Math.sin(aPeak) * tipRadius);
      ctx.lineTo(right + Math.cos(a1) * rootRadius, topY + radius + Math.sin(a1) * rootRadius);
    }

    for (let i = 0; i < piece.teeth; i += 1) {
      const x0 = right - i * state.toothPitch;
      const xPeak = x0 - state.toothPitch * TOOTH_STYLE.peakFraction;
      const x1 = x0 - state.toothPitch;
      ctx.lineTo(xPeak, bottomY + toothDepth);
      ctx.lineTo(x1, bottomY - toothRootInset);
    }

    for (let i = 0; i < state.rackEndTeeth; i += 1) {
      const a0 = Math.PI / 2 + i * arcStep;
      const aPeak = a0 + arcStep * TOOTH_STYLE.peakFraction;
      const a1 = a0 + arcStep;
      ctx.lineTo(left + Math.cos(aPeak) * tipRadius, topY + radius + Math.sin(aPeak) * tipRadius);
      ctx.lineTo(left + Math.cos(a1) * rootRadius, topY + radius + Math.sin(a1) * rootRadius);
    }

    ctx.closePath();
    ctx.fillStyle = GEAR_FILL_COLOR;
    ctx.fill();
    ctx.strokeStyle = GEAR_STROKE_COLOR;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (orientation !== 0) {
      ctx.restore();
    }
    return;
  }

  const toothDepth = currentRingToothDepth();

  ctx.beginPath();
  traceToothTrackPath(state.centre.x, state.centre.y, state.ringOuterRadius, toothDepth, piece.outerTeeth, "out");
  traceToothTrackPath(state.centre.x, state.centre.y, state.ringInnerRadius, toothDepth, piece.innerTeeth, "in");
  ctx.fillStyle = GEAR_FILL_COLOR;
  ctx.fill("evenodd");

  ctx.strokeStyle = GEAR_STROKE_COLOR;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function drawTrace() {
  const paperOffsetX = state.paperOffsetX;
  const paperOffsetY = state.paperOffsetY;

  for (let s = 0; s < state.strokes.length; s += 1) {
    const stroke = state.strokes[s];
    if (!stroke.points || stroke.points.length < 2) continue;

    const strokePenMode = String(stroke.penMode || "solid").toLowerCase();
    const isSpectraStroke = strokePenMode === "spectra" || stroke.colour === null;
    if (isSpectraStroke) {
      ctx.lineWidth = stroke.width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      for (let i = 1; i < stroke.points.length; i += 1) {
        const p0 = stroke.points[i - 1];
        const p1 = stroke.points[i];
        const segmentDistance = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const d0 = Number.isFinite(p0.d) ? p0.d : 0;
        const d1 = Number.isFinite(p1.d) ? p1.d : d0 + segmentDistance;
        const dMid = (d0 + d1) * 0.5;
        ctx.beginPath();
        ctx.moveTo(p0.x + paperOffsetX, p0.y + paperOffsetY);
        ctx.lineTo(p1.x + paperOffsetX, p1.y + paperOffsetY);
        ctx.strokeStyle = spectraColourAtDistance(dMid);
        ctx.stroke();
      }
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x + paperOffsetX, stroke.points[0].y + paperOffsetY);
    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i].x + paperOffsetX, stroke.points[i].y + paperOffsetY);
    }
    ctx.strokeStyle = stroke.colour || state.inkColour;
    ctx.lineWidth = stroke.width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

function drawHoles(cx, cy, phi) {
  for (let i = 0; i < state.holes.length; i += 1) {
    const hole = state.holes[i];
    const x = cx + Math.cos(phi + hole.a) * hole.r;
    const y = cy + Math.sin(phi + hole.a) * hole.r;
    ctx.beginPath();
    ctx.arc(x, y, i === state.selectedHole ? 4.6 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = state.paperColour;
    ctx.fill();
    ctx.strokeStyle = i === state.selectedHole ? state.inkColour : HOLE_STROKE_COLOR;
    ctx.lineWidth = i === state.selectedHole ? 1.8 : 1.2;
    ctx.stroke();
    if (i === state.selectedHole) {
      ctx.beginPath();
      ctx.arc(x, y, 9.5, 0, Math.PI * 2);
      ctx.strokeStyle = state.inkColour;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }
}

function drawPaperGrid(widthCss, heightCss, transform = {}) {
  const gridSize = 176;
  const zoom = transform.zoom ?? state.view.zoom;
  const panX = transform.panX ?? state.view.panX;
  const panY = transform.panY ?? state.view.panY;

  const paperRgb = hexToRgb(state.paperColour);
  const paperLuma = paperRgb
    ? 0.2126 * paperRgb.r + 0.7152 * paperRgb.g + 0.0722 * paperRgb.b
    : 255;

  // Slightly higher contrast on darker paper keeps the grid visible but unobtrusive.
  ctx.fillStyle = paperLuma < 128 ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.04)";

  const screenCellSize = gridSize * zoom;
  if (screenCellSize <= 0.01) return;

  const originScreenX = state.centre.x + panX + (state.paperOffsetX - state.centre.x) * zoom;
  const originScreenY = state.centre.y + panY + (state.paperOffsetY - state.centre.y) * zoom;

  const startCol = Math.floor((0 - originScreenX) / screenCellSize) - 1;
  const endCol = Math.ceil((widthCss - originScreenX) / screenCellSize) + 1;
  const startRow = Math.floor((0 - originScreenY) / screenCellSize) - 1;
  const endRow = Math.ceil((heightCss - originScreenY) / screenCellSize) + 1;

  for (let row = startRow; row <= endRow; row += 1) {
    const y = originScreenY + row * screenCellSize;
    for (let col = startCol; col <= endCol; col += 1) {
      if ((row + col) % 2 !== 0) continue;
      const x = originScreenX + col * screenCellSize;
      ctx.fillRect(x, y, screenCellSize, screenCellSize);
    }
  }
}

function draw(fillBackground = true) {
  const frameStart = performance.now();
  const { widthCss, heightCss, scaleX, scaleY } = getCanvasRasterMetrics();
  const bleedX = 1 / Math.max(scaleX, 1);
  const bleedY = 1 / Math.max(scaleY, 1);
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(-bleedX, -bleedY, widthCss + bleedX * 2, heightCss + bleedY * 2);
  if (fillBackground) {
    ctx.fillStyle = state.paperColour;
    ctx.fillRect(-bleedX, -bleedY, widthCss + bleedX * 2, heightCss + bleedY * 2);

    if (shouldShowPaperGrid()) {
      drawPaperGrid(widthCss, heightCss);
    }
  }

  if (shouldRefreshInteractionSnapshot()) {
    captureViewInteractionSnapshot();
  }

  if (canUseViewInteractionCache(fillBackground)) {
    drawViewInteractionCache(widthCss, heightCss);
    const frameEndFast = performance.now();
    diagnostics.renderMs = frameEndFast - frameStart;
    return;
  }

  renderVectorScene(scaleX, scaleY, 0, 0);

  const frameEnd = performance.now();
  diagnostics.renderMs = frameEnd - frameStart;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function screenToCanvas(clientX, clientY) {
  return canvasPointFromClient(clientX, clientY);
}

function nearestHole(point) {
  let best = -1;
  let bestD = 1e9;
  const hitRadius = 14 / state.view.zoom;
  for (let i = 0; i < state.holes.length; i += 1) {
    const hp = holeWorldPosition(i);
    if (!hp) continue;
    const d = Math.hypot(point.x - hp.x, point.y - hp.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return bestD <= hitRadius ? best : -1;
}

function getContentBounds() {
  if (isRackMode()) {
    const ringDepth = currentRingToothDepth();
    const wheelDepth = currentWheelToothDepth();
    const wheelRadius = state.smallRadius + wheelDepth;
    const envelope = ringDepth + wheelRadius;
    const straight = rackStraightLength();
    const radius = rackEndRadius();
    const orientation = rackOrientationAngle();
    const horizontalHalfWidth = straight * 0.5 + radius;
    const horizontalHalfHeight = radius;
    const isVertical = Math.abs(Math.sin(orientation)) > 0.5;
    const halfWidth = isVertical ? horizontalHalfHeight : horizontalHalfWidth;
    const halfHeight = isVertical ? horizontalHalfWidth : horizontalHalfHeight;
    const bounds = {
      minX: state.centre.x - halfWidth - envelope,
      minY: state.centre.y - halfHeight - envelope,
      maxX: state.centre.x + halfWidth + envelope,
      maxY: state.centre.y + halfHeight + envelope
    };

    for (let s = 0; s < state.strokes.length; s += 1) {
      const stroke = state.strokes[s];
      for (let i = 0; i < stroke.points.length; i += 1) {
        const point = stroke.points[i];
        const px = point.x + state.paperOffsetX;
        const py = point.y + state.paperOffsetY;
        if (px < bounds.minX) bounds.minX = px;
        if (py < bounds.minY) bounds.minY = py;
        if (px > bounds.maxX) bounds.maxX = px;
        if (py > bounds.maxY) bounds.maxY = py;
      }
    }

    return bounds;
  }

  const ringDepth = currentRingToothDepth();
  const wheelDepth = currentWheelToothDepth();
  const ringRadius = state.ringOuterRadius + ringDepth;
  const wheelRadius = state.smallRadius + wheelDepth;
  const orbitRadius = currentDistance() + wheelRadius;
  const envelopeRadius = Math.max(ringRadius, orbitRadius);
  const bounds = {
    minX: state.centre.x - envelopeRadius,
    minY: state.centre.y - envelopeRadius,
    maxX: state.centre.x + envelopeRadius,
    maxY: state.centre.y + envelopeRadius
  };

  for (let s = 0; s < state.strokes.length; s += 1) {
    const stroke = state.strokes[s];
    for (let i = 0; i < stroke.points.length; i += 1) {
      const point = stroke.points[i];
      const px = point.x + state.paperOffsetX;
      const py = point.y + state.paperOffsetY;
      if (px < bounds.minX) bounds.minX = px;
      if (py < bounds.minY) bounds.minY = py;
      if (px > bounds.maxX) bounds.maxX = px;
      if (py > bounds.maxY) bounds.maxY = py;
    }
  }

  return bounds;
}

function getRigBounds() {
  if (isRackMode()) {
    const ringDepth = currentRingToothDepth();
    const wheelDepth = currentWheelToothDepth();
    const wheelRadius = state.smallRadius + wheelDepth;
    const envelope = ringDepth + wheelRadius;
    const straight = rackStraightLength();
    const radius = rackEndRadius();
    const orientation = rackOrientationAngle();
    const horizontalHalfWidth = straight * 0.5 + radius;
    const horizontalHalfHeight = radius;
    const isVertical = Math.abs(Math.sin(orientation)) > 0.5;
    const halfWidth = isVertical ? horizontalHalfHeight : horizontalHalfWidth;
    const halfHeight = isVertical ? horizontalHalfWidth : horizontalHalfHeight;
    return {
      minX: state.centre.x - halfWidth - envelope,
      minY: state.centre.y - halfHeight - envelope,
      maxX: state.centre.x + halfWidth + envelope,
      maxY: state.centre.y + halfHeight + envelope
    };
  }

  const ringDepth = currentRingToothDepth();
  const wheelDepth = currentWheelToothDepth();
  const ringRadius = state.ringOuterRadius + ringDepth;
  const wheelRadius = state.smallRadius + wheelDepth;
  const orbitRadius = currentDistance() + wheelRadius;
  const envelopeRadius = Math.max(ringRadius, orbitRadius);
  return {
    minX: state.centre.x - envelopeRadius,
    minY: state.centre.y - envelopeRadius,
    maxX: state.centre.x + envelopeRadius,
    maxY: state.centre.y + envelopeRadius
  };
}

function fitViewToContent(animate = false) {
  const bounds = getContentBounds();
  const viewport = canvas.parentElement.getBoundingClientRect();
  const panelBounds = controlPanel.getBoundingClientRect();
  const occludedLeftWidth = !narrowMedia.matches && state.panelOpen ? panelBounds.width : 0;
  const availableWidth = Math.max(1, viewport.width - occludedLeftWidth);
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const padding = 0.12;
  const targetZoom = Math.min(
    state.view.maxZoom,
    Math.max(
      state.view.minZoom,
      Math.min(
        (availableWidth * (1 - padding)) / contentWidth,
        (viewport.height * (1 - padding)) / contentHeight
      )
    )
  );
  const targetPanX = 0;
  const targetPanY = 0;

  if (!animate) {
    cancelViewAnimation();
    state.view.zoom = targetZoom;
    state.view.panX = targetPanX;
    state.view.panY = targetPanY;
    return;
  }

  cancelViewAnimation();
  beginViewInteraction();
  const startZoom = state.view.zoom;
  const startPanX = state.view.panX;
  const startPanY = state.view.panY;
  const duration = 320;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const startTime = performance.now();

  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = easeOutCubic(progress);
    state.view.zoom = startZoom + (targetZoom - startZoom) * eased;
    state.view.panX = startPanX + (targetPanX - startPanX) * eased;
    state.view.panY = startPanY + (targetPanY - startPanY) * eased;
    draw();
    if (progress < 1) {
      state.view.animationFrame = requestAnimationFrame(tick);
    } else {
      state.view.animationFrame = 0;
      settleViewInteraction(40);
    }
  };

  state.view.animationFrame = requestAnimationFrame(tick);
}

function zoomFitToContent(animate = false) {
  const bounds = getRigBounds();
  const viewport = canvas.parentElement.getBoundingClientRect();
  const panelBounds = controlPanel.getBoundingClientRect();
  const occludedLeftWidth = !narrowMedia.matches && state.panelOpen ? panelBounds.width : 0;
  const visibleLeft = occludedLeftWidth;
  const visibleRight = viewport.width;
  const visibleTop = 0;
  const visibleBottom = viewport.height;
  const anchorX = state.centre.x;
  const anchorY = state.centre.y;
  const dxLeft = Math.max(0, state.centre.x - bounds.minX);
  const dxRight = Math.max(0, bounds.maxX - state.centre.x);
  const dyTop = Math.max(0, state.centre.y - bounds.minY);
  const dyBottom = Math.max(0, bounds.maxY - state.centre.y);
  const padding = 0.12;

  const zoomLimits = [state.view.maxZoom];
  if (dxLeft > 0) zoomLimits.push((anchorX - visibleLeft) * (1 - padding) / dxLeft);
  if (dxRight > 0) zoomLimits.push((visibleRight - anchorX) * (1 - padding) / dxRight);
  if (dyTop > 0) zoomLimits.push((anchorY - visibleTop) * (1 - padding) / dyTop);
  if (dyBottom > 0) zoomLimits.push((visibleBottom - anchorY) * (1 - padding) / dyBottom);

  const targetZoom = Math.max(
    state.view.minZoom,
    Math.min(...zoomLimits.filter((value) => Number.isFinite(value) && value > 0))
  );

  if (!animate) {
    cancelViewAnimation();
    state.view.zoom = targetZoom;
    state.view.panX = 0;
    state.view.panY = 0;
    return;
  }

  cancelViewAnimation();
  beginViewInteraction(false);
  const startZoom = state.view.zoom;
  const startPanX = state.view.panX;
  const startPanY = state.view.panY;
  const duration = 320;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const startTime = performance.now();

  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = easeOutCubic(progress);
    state.view.zoom = startZoom + (targetZoom - startZoom) * eased;
    state.view.panX = startPanX + (0 - startPanX) * eased;
    state.view.panY = startPanY + (0 - startPanY) * eased;
    draw();
    if (progress < 1) {
      state.view.animationFrame = requestAnimationFrame(tick);
    } else {
      state.view.animationFrame = 0;
      settleViewInteraction(40);
    }
  };

  state.view.animationFrame = requestAnimationFrame(tick);
}

function pushTracePoint(force = false) {
  if (state.selectedHole < 0) return;
  const hp = holeWorldPosition(state.selectedHole);
  if (!hp) return;
  if (!state.activeStroke) return;

  const points = state.activeStroke.points;
  const last = points[points.length - 1];
  const paperX = hp.x - state.paperOffsetX;
  const paperY = hp.y - state.paperOffsetY;
  const segmentDistance = last ? Math.hypot(last.x - paperX, last.y - paperY) : 0;
  // Keep sample spacing roughly constant in screen space to avoid producing
  // overly dense point streams at low zoom (a major mobile CPU hotspot).
  const minScreenSamplePx = isCoarsePointer ? 2.1 : 1.15;
  const minWorldSample = minScreenSamplePx / Math.max(0.0001, state.view.zoom);
  if (!last || force || segmentDistance > minWorldSample) {
    const lastDistance = last && Number.isFinite(last.d) ? last.d : 0;
    points.push({
      x: paperX,
      y: paperY,
      d: last ? lastDistance + segmentDistance : 0
    });
    state.traceRevision += 1;
    appendLatestStrokeSegmentToTraceLayer(state.activeStroke);
  }
}

function pushInterpolatedTrace(deltaTheta) {
  if (state.selectedHole < 0) return;

  const selectedHolePoint = holeWorldPosition(state.selectedHole);
  const holeOrbitRadius = selectedHolePoint
    ? Math.hypot(selectedHolePoint.x - state.centre.x, selectedHolePoint.y - state.centre.y)
    : Math.max(state.smallRadius || 0, 1);
  // Target roughly one interpolation step per ~1.35 px of wheel travel.
  const targetScreenStepPx = isCoarsePointer ? 2.4 : 1.35;
  const adaptiveAngularStep = targetScreenStepPx / Math.max(1, holeOrbitRadius * Math.max(0.0001, state.view.zoom));
  const maxStep = Math.max(0.009, Math.min(0.032, adaptiveAngularStep));
  const stepMagnitude = isRackMode() ? Math.max(0.65, state.toothPitch * 0.22) : maxStep;
  const steps = Math.max(1, Math.ceil(Math.abs(deltaTheta) / stepMagnitude));
  const startTheta = state.theta;
  const epsilon = 1e-6;

  for (let i = 1; i <= steps; i += 1) {
    const prevTheta = state.theta;
    const nextTheta = startTheta + (deltaTheta * i) / steps;
    const stroke = state.activeStroke;

    if (!stroke) {
      state.theta = nextTheta;
      continue;
    }

    if (!stroke.closedCycle) {
      const stepDelta = nextTheta - prevTheta;
      if (Math.abs(stepDelta) <= epsilon) {
        state.theta = nextTheta;
        continue;
      }

      const progressAtPrev = Math.abs(prevTheta - stroke.thetaStart);
      const progressAtNext = Math.abs(nextTheta - stroke.thetaStart);

      if (progressAtPrev >= stroke.closureThetaSpan - epsilon) {
        stroke.closedCycle = true;
        state.theta = nextTheta;
        continue;
      }

      if (progressAtNext >= stroke.closureThetaSpan - epsilon) {
        const progressStep = Math.abs(progressAtNext - progressAtPrev);
        const remaining = stroke.closureThetaSpan - progressAtPrev;
        const ratio = progressStep > epsilon ? Math.max(0, Math.min(1, remaining / progressStep)) : 1;
        const closureTheta = prevTheta + (nextTheta - prevTheta) * ratio;

        // Force one exact closure sample before stopping further point capture.
        state.theta = closureTheta;
        pushTracePoint(true);

        stroke.closedCycle = true;
        state.theta = nextTheta;
        continue;
      }

      state.theta = nextTheta;
      pushTracePoint();
      continue;
    }

    state.theta = nextTheta;
  }
}

function rackPointerDelta(previousPoint, currentPoint) {
  const pose = rackPathPose();
  const tx = Math.cos(pose.tangentAngle);
  const ty = Math.sin(pose.tangentAngle);
  const dx = currentPoint.x - previousPoint.x;
  const dy = currentPoint.y - previousPoint.y;
  return dx * tx + dy * ty;
}

function fitAfterControlChange() {
  if (!isRackMode()) {
    fitViewToContent();
  }
}

const activePointers = new Map();
let pinchLastDist = 0;

function flushWheelDragDelta() {
  wheelDragRafId = 0;
  if (!state.dragging || state.view.dragMode !== "wheel") {
    pendingWheelDelta = 0;
    return;
  }

  if (Math.abs(pendingWheelDelta) > 1e-7) {
    const delta = pendingWheelDelta;
    pendingWheelDelta = 0;
    pushInterpolatedTrace(delta);
    draw();
  }
}

function scheduleWheelDragDelta(delta) {
  pendingWheelDelta += delta;
  if (!wheelDragRafId) {
    wheelDragRafId = requestAnimationFrame(flushWheelDragDelta);
  }
}

function getPinchInfo() {
  const pts = Array.from(activePointers.values());
  const dx = pts[1].x - pts[0].x;
  const dy = pts[1].y - pts[0].y;
  return {
    dist: Math.sqrt(dx * dx + dy * dy),
    midX: (pts[0].x + pts[1].x) / 2,
    midY: (pts[0].y + pts[1].y) / 2
  };
}

function closeCanvasContextMenu() {
  if (!controls.canvasContextMenu) return;
  controls.canvasContextMenu.classList.remove("is-open");
  controls.canvasContextMenu.setAttribute("aria-hidden", "true");
  pendingFillMenuWorldPoint = null;
}

function openCanvasContextMenu(clientX, clientY) {
  if (!controls.canvasContextMenu) return;

  const stageRect = canvas.parentElement.getBoundingClientRect();
  const menu = controls.canvasContextMenu;
  menu.classList.add("is-open");
  menu.setAttribute("aria-hidden", "false");

  const localX = clientX - stageRect.left;
  const localY = clientY - stageRect.top;
  const menuW = menu.offsetWidth || 168;
  const menuH = menu.offsetHeight || 46;
  const clampedX = Math.max(6, Math.min(localX, stageRect.width - menuW - 6));
  const clampedY = Math.max(6, Math.min(localY, stageRect.height - menuH - 6));
  menu.style.left = `${Math.round(clampedX)}px`;
  menu.style.top = `${Math.round(clampedY)}px`;

  pendingFillMenuWorldPoint = screenToWorld(clientX, clientY);
}

function cancelLongPress() {
  if (!longPressTimer) return;
  clearTimeout(longPressTimer);
  longPressTimer = 0;
  longPressPointerId = null;
}

function beginLongPressTimer(event) {
  if (event.pointerType !== "touch") return;
  cancelLongPress();
  longPressPointerId = event.pointerId;
  longPressStartX = event.clientX;
  longPressStartY = event.clientY;
  longPressTimer = setTimeout(() => {
    longPressTimer = 0;
    if (activePointers.size !== 1 || longPressPointerId === null) return;
    const point = activePointers.get(longPressPointerId);
    if (!point) return;

    if (state.dragging) {
      stopDrag({ pointerId: longPressPointerId });
    }

    openCanvasContextMenu(point.x, point.y);
    longPressPointerId = null;
  }, 520);
}

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  closeCanvasContextMenu();
  openCanvasContextMenu(event.clientX, event.clientY);
});

canvas.addEventListener("pointerdown", (event) => {
  const isMouseLikePointer = event.pointerType === "mouse" || event.pointerType === "pen";
  if (isMouseLikePointer && event.button !== 0) {
    return;
  }

  cancelRenderWarmup();
  cancelPostSettleWarmup();
  closeCanvasContextMenu();
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  beginLongPressTimer(event);

  if (activePointers.size === 2) {
    cancelLongPress();
    beginViewInteraction(true);
    // Second finger down - cancel any active draw/drag and enter pinch mode
    cancelViewAnimation();
    if (state.activeStroke && state.activeStroke.points.length < 2) {
      const cancelledStroke = state.strokes.pop();
      if (cancelledStroke && state.historyEntries.length > 0) {
        const last = state.historyEntries[state.historyEntries.length - 1];
        if (last?.type === "stroke" && last.stroke === cancelledStroke) {
          state.historyEntries.pop();
        }
      }
    }
    state.dragging = false;
    state.activeStroke = null;
    state.selectedHole = -1;
    state.view.dragMode = "pinch";
    pinchLastDist = getPinchInfo().dist;
    draw();
    return;
  }

  cancelViewAnimation();
  const screenPoint = screenToCanvas(event.clientX, event.clientY);
  const worldPoint = screenToWorld(event.clientX, event.clientY);
  const holeIndex = nearestHole(worldPoint);
  state.view.lastScreenX = screenPoint.x;
  state.view.lastScreenY = screenPoint.y;

  if (holeIndex >= 0) {
    if (state.undoneStrokes.length > 0) {
      state.undoneStrokes = [];
    }
    if (state.undoneHistoryEntries.length > 0) {
      state.undoneHistoryEntries = [];
    }
    state.dragging = true;
    state.selectedHole = holeIndex;
    state.view.dragMode = "wheel";
    pendingWheelDelta = 0;
    if (wheelDragRafId) {
      cancelAnimationFrame(wheelDragRafId);
      wheelDragRafId = 0;
    }
    const activePenMode = selectedPenMode() === "spectra" ? "spectra" : "solid";
    state.penMode = activePenMode;
    state.activeStroke = {
      penMode: activePenMode,
      colour: activePenMode === "solid" ? state.inkColour : null,
      width: state.strokeWidth,
      closureThetaSpan: strokeClosureThetaSpan(),
      thetaStart: state.theta,
      closedCycle: false,
      points: []
    };
    state.strokes.push(state.activeStroke);
    state.historyEntries.push({ type: "stroke", stroke: state.activeStroke });
    state.lastPointerAngle = Math.atan2(worldPoint.y - state.centre.y, worldPoint.x - state.centre.x);
    state.lastPointerWorld = worldPoint;
    canvas.setPointerCapture(event.pointerId);
    updateCanvasCursor();
    syncHistoryControls();
    pushTracePoint();
    draw();
    return;
  }

  disableViewInteractionCache();
  state.dragging = true;
  state.view.dragMode = "pan";
  state.selectedHole = -1;
  state.activeStroke = null;
  canvas.setPointerCapture(event.pointerId);
  updateCanvasCursor();
  draw();
});

canvas.addEventListener("pointermove", (event) => {
  if (activePointers.has(event.pointerId)) {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (longPressTimer && event.pointerId === longPressPointerId) {
    const dx = event.clientX - longPressStartX;
    const dy = event.clientY - longPressStartY;
    if (Math.hypot(dx, dy) > 14) {
      cancelLongPress();
    }
  }

  if (state.view.dragMode === "pinch" && activePointers.size === 2) {
    const { dist, midX, midY } = getPinchInfo();
    if (pinchLastDist > 0) {
      const factor = dist / pinchLastDist;
      lastZoomInteractionAt = performance.now();
      setZoomAt(midX, midY, state.view.zoom * factor);
      draw();
    }
    pinchLastDist = dist;
    return;
  }

  const screenPoint = screenToCanvas(event.clientX, event.clientY);
  const previousScreenX = state.view.lastScreenX;
  const previousScreenY = state.view.lastScreenY;

  if (!state.dragging) {
    updateCanvasCursor(event.clientX, event.clientY);
    state.view.lastScreenX = screenPoint.x;
    state.view.lastScreenY = screenPoint.y;
    return;
  }

  if (state.view.dragMode === "pan") {
    const dx = screenPoint.x - previousScreenX;
    const dy = screenPoint.y - previousScreenY;
    state.paperOffsetX += dx / Math.max(0.0001, state.view.zoom);
    state.paperOffsetY += dy / Math.max(0.0001, state.view.zoom);
    state.view.lastScreenX = screenPoint.x;
    state.view.lastScreenY = screenPoint.y;
    draw();
    return;
  }

  const worldPoint = screenToWorld(event.clientX, event.clientY);
  let delta;
  if (isRackMode()) {
    delta = rackPointerDelta(state.lastPointerWorld, worldPoint);
    state.lastPointerWorld = worldPoint;
  } else {
    const pointerAngle = Math.atan2(worldPoint.y - state.centre.y, worldPoint.x - state.centre.x);
    delta = angleDiff(pointerAngle, state.lastPointerAngle);
    state.lastPointerAngle = pointerAngle;
  }

  scheduleWheelDragDelta(delta);
});

function stopDrag(event) {
  activePointers.delete(event.pointerId);
  if (event.pointerId === longPressPointerId || !activePointers.size) {
    cancelLongPress();
  }

  if (state.view.dragMode === "pinch") {
    if (activePointers.size < 2) {
      state.view.dragMode = null;
      pinchLastDist = 0;
      flushDeferredLayerRebuilds();
      settleViewInteraction(80);
      scheduleRenderWarmup(140);
    } else {
      pinchLastDist = getPinchInfo().dist;
    }
    draw();
    return;
  }

  if (!state.dragging) return;
  const previousDragMode = state.view.dragMode;
  state.dragging = false;
  state.view.dragMode = null;
  pendingWheelDelta = 0;
  if (wheelDragRafId) {
    cancelAnimationFrame(wheelDragRafId);
    wheelDragRafId = 0;
  }
  if (state.activeStroke && state.activeStroke.points.length < 2) {
    const cancelledStroke = state.strokes.pop();
    if (cancelledStroke && state.historyEntries.length > 0) {
      const last = state.historyEntries[state.historyEntries.length - 1];
      if (last?.type === "stroke" && last.stroke === cancelledStroke) {
        state.historyEntries.pop();
      }
    }
    state.traceRevision += 1;
  }
  state.activeStroke = null;
  state.selectedHole = -1;
  if (event) {
    canvas.releasePointerCapture(event.pointerId);
  }
  flushDeferredLayerRebuilds();
  syncHistoryControls();
  updateCanvasCursor();
  draw();
  scheduleRenderWarmup(140);
}

canvas.addEventListener("pointerup", stopDrag);
canvas.addEventListener("pointercancel", stopDrag);
canvas.addEventListener("pointerenter", (event) => {
  updateCanvasCursor(event.clientX, event.clientY);
});
canvas.addEventListener("pointerleave", () => {
  if (!state.dragging) {
    canvas.style.cursor = "grab";
  }
  if (state.dragging) draw();
});

canvas.addEventListener("wheel", (event) => {
  beginViewInteraction(true);
  cancelViewAnimation();
  event.preventDefault();
  lastZoomInteractionAt = performance.now();
  flashZoomCursor(event.deltaY);
  const zoomFactor = Math.exp(-event.deltaY * 0.0012);
  setZoomAt(event.clientX, event.clientY, state.view.zoom * zoomFactor);
  draw();
  settleViewInteraction(150);
}, { passive: false });

// Ring piece radio buttons
document.querySelectorAll('input[name="ringPiece"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    state.ringPieceId = radio.value;
    if (isRackMode() && isCanvasBlank()) {
      state.rackOrientationLocked = currentPreferredRackOrientation();
    }
    state.theta = 0;
    syncTrackOptions();
    updateGeometryFromTeeth();
    syncWheelOptions();
    updateGeometryFromTeeth();
    rebuildHoles();
    refreshMeta();
    syncRackRotationControl();
    fitViewToContent();
    draw();
  });
});

// Track radio buttons (re-attached each time syncTrackOptions is called)
function attachTrackListener() {
  document.querySelectorAll('input[name="track"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.track = radio.value;
      syncWheelOptions();
      updateGeometryFromTeeth();
      rebuildHoles();
      refreshMeta();
      fitAfterControlChange();
      draw();
    });
  });
}

controls.smallTeeth.addEventListener("change", () => {
  state.smallTeeth = Number(controls.smallTeeth.value);
  updateGeometryFromTeeth();
  rebuildHoles();
  refreshMeta();
  fitAfterControlChange();
  draw();
});

controls.inkColour.addEventListener("input", () => {
  state.inkColour = controls.inkColour.value;
  draw();
});

document.querySelectorAll('input[name="penType"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    state.penMode = selectedPenMode();
    syncPenModeControls();
    draw();
  });
});

controls.paperColour.addEventListener("input", () => {
  state.paperColour = controls.paperColour.value;
  localStorage.setItem('paperColour', state.paperColour);
  syncPaperSurfaceColour();
  draw();
});

controls.fillColour.addEventListener("input", () => {
  state.fillColour = controls.fillColour.value;
});

controls.strokeWidth.addEventListener("input", () => {
  state.strokeWidth = Number(controls.strokeWidth.value);
  draw();
});

if (controls.rackRotateSlider) {
  controls.rackRotateSlider.addEventListener("input", () => {
    const degrees = Number(controls.rackRotateSlider.value) || 0;
    state.rackOrientationLocked = (normaliseRackAngleDegrees(degrees) * Math.PI) / 180;
    updateRackRotationReadout(degrees);
    draw();
  });
}

controls.clearTrace.addEventListener("click", () => {
  state.strokes = [];
  state.undoneStrokes = [];
  state.historyEntries = [];
  state.undoneHistoryEntries = [];
  state.activeStroke = null;
  fillLayer.operations = [];
  fillLayer.valid = false;
  state.traceRevision += 1;
  syncHistoryControls();
  draw();
});

if (controls.undoBtn) {
  controls.undoBtn.addEventListener("click", () => {
    undoLastStroke();
  });
}

if (controls.redoBtn) {
  controls.redoBtn.addEventListener("click", () => {
    redoLastStroke();
  });
}

if (controls.fillFromPointAction) {
  controls.fillFromPointAction.addEventListener("click", () => {
    if (!pendingFillMenuWorldPoint) {
      closeCanvasContextMenu();
      return;
    }
    addFillOperationAtWorld(pendingFillMenuWorldPoint.x, pendingFillMenuWorldPoint.y);
    closeCanvasContextMenu();
  });
}

controls.toggleGear.addEventListener("click", () => {
  state.showGear = !state.showGear;
  syncGearToggleButton();
  draw();
});

controls.resetView.addEventListener("click", () => {
  zoomFitToContent(true);
  draw();
});

controls.exportPng.addEventListener("click", () => {
  openExportModal();
});

controls.helpButton.addEventListener("click", () => {
  openHelpModal();
});

controls.closeHelpBtn.addEventListener("click", () => {
  closeHelpModal();
});

controls.helpOverlay.addEventListener("click", (event) => {
  if (event.target === controls.helpOverlay) {
    closeHelpModal();
  }
});

controls.aboutButton.addEventListener("click", () => {
  openAboutModal();
});

controls.closeAboutBtn.addEventListener("click", () => {
  closeAboutModal();
});

controls.aboutOverlay.addEventListener("click", (event) => {
  if (event.target === controls.aboutOverlay) {
    closeAboutModal();
  }
});

if (controls.showAboutOnStartup) {
  controls.showAboutOnStartup.addEventListener("change", () => {
    setShowAboutOnStartupPreference(controls.showAboutOnStartup.checked);
  });
}

controls.closeExportBtn.addEventListener("click", () => {
  closeExportModal();
});

controls.exportOverlay.addEventListener("click", (event) => {
  if (event.target === controls.exportOverlay) {
    closeExportModal();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!controls.canvasContextMenu?.classList.contains("is-open")) return;
  if (controls.canvasContextMenu.contains(event.target)) return;
  closeCanvasContextMenu();
});

controls.doExportBtn.addEventListener("click", () => {
  const includeGear = controls.exportIncludeGear.checked;
  const transparent = controls.exportTransparent.checked;
  closeExportModal();
  exportCurrentViewAsPng({ includeGear, transparent });
});

syncExportActionLabels();

document.addEventListener("keydown", (event) => {
  const targetElement = event.target;
  const targetTag = targetElement?.tagName?.toLowerCase?.() || "";
  const isFormTarget =
    targetTag === "input"
    || targetTag === "textarea"
    || targetTag === "select"
    || targetElement?.isContentEditable;

  if (event.shiftKey && event.key.toLowerCase() === "d") {
    diagnostics.enabled = !diagnostics.enabled;
    if (diagnostics.enabled) {
      diagnostics.lastRafTime = 0;
      diagnostics.smoothDisplayFps = 0;
      startDiagnosticsLoop();
      draw();
    } else {
      stopDiagnosticsLoop();
    }
    return;
  }

  if (isFormTarget) return;

  const cmdOrCtrl = event.metaKey || event.ctrlKey;
  if (cmdOrCtrl && !event.altKey) {
    const keyLower = event.key.toLowerCase();
    const redoWithShiftZ = keyLower === "z" && event.shiftKey;
    const redoWithY = keyLower === "y";
    const undoWithZ = keyLower === "z" && !event.shiftKey;

    if (undoWithZ) {
      event.preventDefault();
      undoLastStroke();
      return;
    }

    if (redoWithShiftZ || redoWithY) {
      event.preventDefault();
      redoLastStroke();
      return;
    }
  }

  const key = event.key;

  const isArrowLeft = key === "ArrowLeft" || key === "Left";
  const isArrowRight = key === "ArrowRight" || key === "Right";
  const isArrowUp = key === "ArrowUp" || key === "Up";
  const isArrowDown = key === "ArrowDown" || key === "Down";
  if (isArrowLeft || isArrowRight || isArrowUp || isArrowDown) {
    event.preventDefault();
    if (isArrowLeft) pressedPanKeys.add("ArrowLeft");
    if (isArrowRight) pressedPanKeys.add("ArrowRight");
    if (isArrowUp) pressedPanKeys.add("ArrowUp");
    if (isArrowDown) pressedPanKeys.add("ArrowDown");
    startKeyboardPanLoop();
    return;
  }

  const isZoomInKey = key === "+" || key === "=" || key === "NumpadAdd";
  const isZoomOutKey = key === "-" || key === "_" || key === "NumpadSubtract";
  if (isZoomInKey || isZoomOutKey) {
    event.preventDefault();
    startKeyboardZoomLoop(isZoomInKey ? 1 : -1);
    return;
  }

  if (event.key !== "Escape") return;

  if (controls.canvasContextMenu?.classList.contains("is-open")) {
    closeCanvasContextMenu();
    return;
  }

  if (controls.helpOverlay.classList.contains("show")) {
    closeHelpModal();
    return;
  }

  if (controls.aboutOverlay.classList.contains("show")) {
    closeAboutModal();
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key;
  if (key === "ArrowLeft" || key === "Left") pressedPanKeys.delete("ArrowLeft");
  if (key === "ArrowRight" || key === "Right") pressedPanKeys.delete("ArrowRight");
  if (key === "ArrowUp" || key === "Up") pressedPanKeys.delete("ArrowUp");
  if (key === "ArrowDown" || key === "Down") pressedPanKeys.delete("ArrowDown");
  if (key === "+" || key === "=" || key === "NumpadAdd" || key === "-" || key === "_" || key === "NumpadSubtract") {
    stopKeyboardZoomLoop();
  }
  stopKeyboardPanLoopIfIdle();
});

window.addEventListener("blur", () => {
  pressedPanKeys.clear();
  stopKeyboardZoomLoop();
  stopKeyboardPanLoopIfIdle();
});

window.addEventListener("resize", () => {
  applyViewportPanelRule();
  scheduleLayoutGeometrySync({ fitView: true });
});

window.addEventListener("orientationchange", () => {
  applyViewportPanelRule();
  // Delay layout sync to match setActualVH timing, ensuring --actual-vh is updated first
  setTimeout(() => scheduleLayoutGeometrySync({ fitView: true }), 100);
});

panelTab.addEventListener("click", () => {
  applyPanelState(!state.panelOpen, true);
});

// On narrow screens, tapping the canvas closes the panel so it doesn't obscure the drawing area.
canvas.addEventListener("pointerdown", (event) => {
  if (narrowMedia.matches && state.panelOpen) {
    applyPanelState(false, true);
    event.stopPropagation();
    return;
  }
}, { capture: true });

narrowMedia.addEventListener("change", () => {
  applyViewportPanelRule();
  scheduleLayoutGeometrySync();
});

const stageResizeObserver = new ResizeObserver(() => {
  scheduleLayoutGeometrySync();
});

stageResizeObserver.observe(canvas.parentElement);
stageResizeObserver.observe(controlPanel);

function init() {
  // Set initial ring piece radio button
  const ringRadio = document.querySelector(`input[name="ringPiece"][value="${state.ringPieceId}"]`);
  if (ringRadio) ringRadio.checked = true;

  syncTrackOptions();
  
  // Get track value from checked radio button
  const trackRadio = document.querySelector('input[name="track"]:checked');
  if (trackRadio) state.track = trackRadio.value;
  
  syncWheelOptions();
  state.smallTeeth = Number(controls.smallTeeth.value);
  state.penMode = selectedPenMode();
  state.inkColour = controls.inkColour.value;
  state.fillColour = controls.fillColour.value;
  const savedPaperColour = localStorage.getItem('paperColour');
  if (savedPaperColour) {
    state.paperColour = savedPaperColour;
    controls.paperColour.value = savedPaperColour;
  } else {
    state.paperColour = controls.paperColour.value;
  }
  syncPaperSurfaceColour();
  state.strokeWidth = Number(controls.strokeWidth.value);
  syncPenModeControls();
  syncGearToggleButton();
  syncRackRotationControl();

  const showAboutOnStartup = getShowAboutOnStartupPreference();
  if (controls.showAboutOnStartup) {
    controls.showAboutOnStartup.checked = showAboutOnStartup;
  }

  if (diagnostics.enabled) {
    startDiagnosticsLoop();
  }

  applyViewportPanelRule();
  syncLayoutGeometry();
  fitViewToContent();
  draw();
  scheduleRenderWarmup(120);
  syncHistoryControls();

  if (showAboutOnStartup) {
    openAboutModal();
  }

  updateCanvasCursor();
}

init();
