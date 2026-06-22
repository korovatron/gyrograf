// --actual-vh fixes the iOS Safari bug where 100vh includes the browser chrome,
// causing the layout to overflow. We compute the real viewport height in JS and
// set it as a CSS custom property, then use var(--actual-vh) in place of 100dvh.
function setActualVH() {
  document.documentElement.style.setProperty('--actual-vh', `${window.innerHeight}px`);
}
setActualVH();
window.addEventListener('resize', setActualVH);
// orientationchange fires before the browser has finished resizing, so we
// delay slightly to capture the final innerHeight after rotation completes.
window.addEventListener('orientationchange', () => setTimeout(setActualVH, 100));
// pageshow covers the iOS back-forward cache restore case and SW updates.
window.addEventListener('pageshow', () => {
  setTimeout(setActualVH, 0);
  // Reschedule layout geometry sync after viewport height is updated
  setTimeout(() => scheduleLayoutGeometrySync({ fitView: true }), 50);
});

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
    { id: "rack96", label: "Obround rack 96/96", kind: "rack", teeth: 96 }
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

const GEAR_FILL_COLOR = "rgba(196, 214, 231, 0.38)";
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
  doExportBtn: document.getElementById("doExportBtn")
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
  selectedHole: -1,
  strokes: [],
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
  paperColour: "#000000",
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
  valid: false,
  active: false,
  settleTimer: 0
};

const traceLayer = {
  canvas: null,
  ctx: null,
  widthPx: 0,
  heightPx: 0,
  valid: false,
  revision: -1,
  viewSignature: ""
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

function renderVectorScene(scaleX, scaleY, viewportOffsetX = 0, viewportOffsetY = 0) {
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.translate(
    state.centre.x + state.view.panX + viewportOffsetX,
    state.centre.y + state.view.panY + viewportOffsetY
  );
  ctx.scale(state.view.zoom, state.view.zoom);
  ctx.translate(-state.centre.x, -state.centre.y);

  if (state.showGear) drawRingPiece();
  const canUseTraceLayer = viewportOffsetX === 0 && viewportOffsetY === 0 && ctx === mainCtx;
  if (canUseTraceLayer && ensureTraceLayerReady()) {
    const { widthCss, heightCss } = getCanvasRasterMetrics();
    ctx.save();
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.drawImage(traceLayer.canvas, 0, 0, traceLayer.widthPx, traceLayer.heightPx, 0, 0, widthCss, heightCss);
    ctx.restore();
  } else {
    drawTrace();
  }

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
  renderVectorScene(cacheScaleX, cacheScaleY, marginX, marginY);
  ctx = previousCtx;

  viewInteractionCache.snapshotWidth = cacheCssW;
  viewInteractionCache.snapshotHeight = cacheCssH;
  viewInteractionCache.snapshotOffsetX = marginX;
  viewInteractionCache.snapshotOffsetY = marginY;
  viewInteractionCache.snapshotZoom = state.view.zoom;
  viewInteractionCache.snapshotPanX = state.view.panX;
  viewInteractionCache.snapshotPanY = state.view.panY;
  viewInteractionCache.valid = true;
}

function beginViewInteraction() {
  if (viewInteractionCache.settleTimer) {
    clearTimeout(viewInteractionCache.settleTimer);
    viewInteractionCache.settleTimer = 0;
  }
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
    draw();
  }, delayMs);
}

function canUseViewInteractionCache(fillBackground) {
  return fillBackground && viewInteractionCache.active && viewInteractionCache.valid;
}

function drawViewInteractionCache(width, height) {
  if (!viewInteractionCache.valid || !viewInteractionCache.canvas) return;
  const snapshotZoom = viewInteractionCache.snapshotZoom || 1;
  const scale = state.view.zoom / snapshotZoom;
  const tx =
    state.centre.x +
    state.view.panX -
    scale * (state.centre.x + viewInteractionCache.snapshotPanX + viewInteractionCache.snapshotOffsetX);
  const ty =
    state.centre.y +
    state.view.panY -
    scale * (state.centre.y + viewInteractionCache.snapshotPanY + viewInteractionCache.snapshotOffsetY);
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

function ensureTraceLayerSurface() {
  const targetW = canvas.width;
  const targetH = canvas.height;
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
  const tctx = ensureTraceLayerSurface();
  if (!tctx) return false;

  const { widthCss, heightCss, scaleX, scaleY } = getCanvasRasterMetrics();
  tctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  tctx.clearRect(0, 0, widthCss, heightCss);
  tctx.translate(state.centre.x + state.view.panX, state.centre.y + state.view.panY);
  tctx.scale(state.view.zoom, state.view.zoom);
  tctx.translate(-state.centre.x, -state.centre.y);

  const previousCtx = ctx;
  ctx = tctx;
  drawTrace();
  ctx = previousCtx;

  traceLayer.revision = state.traceRevision;
  traceLayer.viewSignature = traceViewSignature();
  traceLayer.valid = true;
  return true;
}

function ensureTraceLayerReady() {
  if (!traceLayer.valid) {
    return rebuildTraceLayer();
  }
  if (traceLayer.revision !== state.traceRevision) {
    return rebuildTraceLayer();
  }
  if (traceLayer.viewSignature !== traceViewSignature()) {
    return rebuildTraceLayer();
  }
  return true;
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
  state.showGear = includeGear;
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
  controls.toggleGear.innerHTML = state.showGear ? "HIDE<br>WHEELS" : "SHOW<br>WHEELS";
  controls.toggleGear.classList.toggle("is-off", !state.showGear);
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
  const screen = canvasPointFromClient(clientX, clientY);
  const world = screenToWorld(clientX, clientY);
  state.view.zoom = Math.max(state.view.minZoom, Math.min(state.view.maxZoom, nextZoom));
  state.view.panX = screen.x - state.centre.x - (world.x - state.centre.x) * state.view.zoom;
  state.view.panY = screen.y - state.centre.y - (world.y - state.centre.y) * state.view.zoom;
}

function cancelViewAnimation() {
  if (state.view.animationFrame) {
    cancelAnimationFrame(state.view.animationFrame);
    state.view.animationFrame = 0;
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
    state.strokes = state.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({
        ...point,
        x: state.centre.x + (point.x - oldCentre.x) * scale,
        y: state.centre.y + (point.y - oldCentre.y) * scale
      }))
    }));
    state.traceRevision += 1;

    if (state.activeStroke) {
      state.activeStroke = state.strokes[state.strokes.length - 1] || null;
    }
  }

  rebuildHoles();
  refreshMeta();
  if (fitView) {
    fitViewToContent();
  }
  draw();
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
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = spectraColourAtDistance(dMid);
        ctx.stroke();
      }
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
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
        if (point.x < bounds.minX) bounds.minX = point.x;
        if (point.y < bounds.minY) bounds.minY = point.y;
        if (point.x > bounds.maxX) bounds.maxX = point.x;
        if (point.y > bounds.maxY) bounds.maxY = point.y;
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
      if (point.x < bounds.minX) bounds.minX = point.x;
      if (point.y < bounds.minY) bounds.minY = point.y;
      if (point.x > bounds.maxX) bounds.maxX = point.x;
      if (point.y > bounds.maxY) bounds.maxY = point.y;
    }
  }

  return bounds;
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
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const visibleCenterOffsetX = occludedLeftWidth * 0.5;
  const targetPanX = -(centerX - state.centre.x) * targetZoom + visibleCenterOffsetX;
  const targetPanY = -(centerY - state.centre.y) * targetZoom;

  if (!animate) {
    cancelViewAnimation();
    state.view.zoom = targetZoom;
    state.view.panX = targetPanX;
    state.view.panY = targetPanY;
    return;
  }

  cancelViewAnimation();
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
    }
  };

  state.view.animationFrame = requestAnimationFrame(tick);
}

function pushTracePoint() {
  if (state.selectedHole < 0) return;
  const hp = holeWorldPosition(state.selectedHole);
  if (!hp) return;
  if (!state.activeStroke) return;

  const points = state.activeStroke.points;
  const last = points[points.length - 1];
  const segmentDistance = last ? Math.hypot(last.x - hp.x, last.y - hp.y) : 0;
  if (!last || segmentDistance > 0.6) {
    const lastDistance = last && Number.isFinite(last.d) ? last.d : 0;
    points.push({
      x: hp.x,
      y: hp.y,
      d: last ? lastDistance + segmentDistance : 0
    });
    state.traceRevision += 1;
  }
}

function pushInterpolatedTrace(deltaTheta) {
  if (state.selectedHole < 0) return;

  const maxStep = 0.012;
  const stepMagnitude = isRackMode() ? Math.max(0.65, state.toothPitch * 0.22) : maxStep;
  const steps = Math.max(1, Math.ceil(Math.abs(deltaTheta) / stepMagnitude));
  const startTheta = state.theta;

  for (let i = 1; i <= steps; i += 1) {
    const nextTheta = startTheta + (deltaTheta * i) / steps;
    state.theta = nextTheta;
    pushTracePoint();
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

canvas.addEventListener("pointerdown", (event) => {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (activePointers.size === 2) {
    beginViewInteraction();
    // Second finger down - cancel any active draw/drag and enter pinch mode
    cancelViewAnimation();
    if (state.activeStroke && state.activeStroke.points.length < 2) {
      state.strokes.pop();
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
    state.dragging = true;
    state.selectedHole = holeIndex;
    state.view.dragMode = "wheel";
    const activePenMode = selectedPenMode() === "spectra" ? "spectra" : "solid";
    state.penMode = activePenMode;
    state.activeStroke = {
      penMode: activePenMode,
      colour: activePenMode === "solid" ? state.inkColour : null,
      width: state.strokeWidth,
      points: []
    };
    state.strokes.push(state.activeStroke);
    state.lastPointerAngle = Math.atan2(worldPoint.y - state.centre.y, worldPoint.x - state.centre.x);
    state.lastPointerWorld = worldPoint;
    canvas.setPointerCapture(event.pointerId);
    updateCanvasCursor();
    pushTracePoint();
    draw();
    return;
  }

  beginViewInteraction();
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

  if (state.view.dragMode === "pinch" && activePointers.size === 2) {
    const { dist, midX, midY } = getPinchInfo();
    if (pinchLastDist > 0) {
      const factor = dist / pinchLastDist;
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
    state.view.panX += dx;
    state.view.panY += dy;
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

  pushInterpolatedTrace(delta);
  draw();
});

function stopDrag(event) {
  activePointers.delete(event.pointerId);

  if (state.view.dragMode === "pinch") {
    if (activePointers.size < 2) {
      state.view.dragMode = null;
      pinchLastDist = 0;
      settleViewInteraction(80);
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
  if (state.activeStroke && state.activeStroke.points.length < 2) {
    state.strokes.pop();
    state.traceRevision += 1;
  }
  state.activeStroke = null;
  state.selectedHole = -1;
  if (previousDragMode === "pan") {
    settleViewInteraction(80);
  }
  if (event) {
    canvas.releasePointerCapture(event.pointerId);
  }
  updateCanvasCursor();
  draw();
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
  beginViewInteraction();
  cancelViewAnimation();
  event.preventDefault();
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

controls.strokeWidth.addEventListener("input", () => {
  state.strokeWidth = Number(controls.strokeWidth.value);
  draw();
});

controls.clearTrace.addEventListener("click", () => {
  state.strokes = [];
  state.activeStroke = null;
  state.traceRevision += 1;
  draw();
});

controls.toggleGear.addEventListener("click", () => {
  state.showGear = !state.showGear;
  syncGearToggleButton();
  draw();
});

controls.resetView.addEventListener("click", () => {
  fitViewToContent(true);
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

controls.doExportBtn.addEventListener("click", () => {
  const includeGear = controls.exportIncludeGear.checked;
  const transparent = controls.exportTransparent.checked;
  closeExportModal();
  exportCurrentViewAsPng({ includeGear, transparent });
});

syncExportActionLabels();

document.addEventListener("keydown", (event) => {
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

  if (event.key !== "Escape") return;

  if (controls.helpOverlay.classList.contains("show")) {
    closeHelpModal();
    return;
  }

  if (controls.aboutOverlay.classList.contains("show")) {
    closeAboutModal();
  }
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

  if (showAboutOnStartup) {
    openAboutModal();
  }

  updateCanvasCursor();
}

init();
