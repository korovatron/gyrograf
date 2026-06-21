const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const layoutRoot = document.getElementById("layoutRoot");
const controlPanel = document.getElementById("controlPanel");
const panelToggle = document.getElementById("panelToggle");
const narrowMedia = window.matchMedia("(max-width: 980px)");

const PRESETS = {
  ringPieces: [
    { id: "r150_105", label: "150/105", outerTeeth: 150, innerTeeth: 105 },
    { id: "r144_96", label: "144/96", outerTeeth: 144, innerTeeth: 96 }
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

const controls = {
  ringPiece: document.getElementById("ringPiece"),
  track: document.getElementById("track"),
  smallTeeth: document.getElementById("smallTeeth"),
  ringMeta: document.getElementById("ringMeta"),
  wheelMeta: document.getElementById("wheelMeta"),
  inkColour: document.getElementById("inkColour"),
  strokeWidth: document.getElementById("strokeWidth"),
  clearTrace: document.getElementById("clearTrace"),
  resetWheel: document.getElementById("resetWheel"),
  resetView: document.getElementById("resetView")
};

const state = {
  centre: { x: 0, y: 0 },
  theta: 0,
  selectedHole: -1,
  strokes: [],
  activeStroke: null,
  dragging: false,
  lastPointerAngle: 0,
  mode: "inside",
  track: "inner",
  ringPieceId: "r150_105",
  bigTeeth: 105,
  smallTeeth: 45,
  bigRadius: 210,
  smallRadius: 90,
  ringOuterRadius: 230,
  ringInnerRadius: 160,
  toothPitch: 1,
  inkColour: "#0f172a",
  strokeWidth: 2,
  holes: [],
  panelOpen: true,
  userPanelPreference: null,
  narrowPanelPreference: false,
  view: {
    panX: 0,
    panY: 0,
    zoom: 1,
    minZoom: 0.55,
    maxZoom: 2.8,
    dragMode: null,
    lastScreenX: 0,
    lastScreenY: 0,
    animationFrame: 0
  }
};

let pendingLayoutFrame = 0;

function selectedRingPiece() {
  return PRESETS.ringPieces.find((piece) => piece.id === state.ringPieceId) || PRESETS.ringPieces[0];
}

function availableWheels() {
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

function syncTrackOptions() {
  const piece = selectedRingPiece();
  controls.track.innerHTML = [
    { value: "inner", label: `Inner (${piece.innerTeeth} teeth)` },
    { value: "outer", label: `Outer (${piece.outerTeeth} teeth)` }
  ]
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join("");

  controls.track.value = state.track;
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
  const piece = selectedRingPiece();
  const ringPitchDiameter = Math.round(state.bigRadius * 2);
  const wheelPitchDiameter = Math.round(state.smallRadius * 2);
  controls.ringMeta.textContent = `Ring ${piece.label} selected, ${state.track} track ${state.bigTeeth} teeth, pitch diameter ${ringPitchDiameter}px`;
  controls.wheelMeta.textContent = `Wheel: ${state.smallTeeth} teeth, ${wheelHoleCount(state.smallTeeth)} holes, pitch diameter ${wheelPitchDiameter}px`;
}

function updateGeometryFromTeeth() {
  const piece = selectedRingPiece();
  const bounds = canvas.getBoundingClientRect();
  const maxFitRadius = Math.max(60, Math.min(bounds.width, bounds.height) * 0.5 - 24);
  const fitOuterRadius = Math.min(300, maxFitRadius);
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
  canvas.width = Math.floor(bounds.width * dpr);
  canvas.height = Math.floor(bounds.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

function syncLayoutGeometry() {
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
        x: state.centre.x + (point.x - oldCentre.x) * scale,
        y: state.centre.y + (point.y - oldCentre.y) * scale
      }))
    }));

    if (state.activeStroke) {
      state.activeStroke = state.strokes[state.strokes.length - 1] || null;
    }
  }

  rebuildHoles();
  refreshMeta();
  draw();
}

function scheduleLayoutGeometrySync() {
  if (pendingLayoutFrame) {
    cancelAnimationFrame(pendingLayoutFrame);
  }
  pendingLayoutFrame = requestAnimationFrame(() => {
    pendingLayoutFrame = 0;
    syncLayoutGeometry();
  });
}

function applyPanelState(open, fromUser = true) {
  state.panelOpen = open;
  layoutRoot.classList.toggle("panel-hidden", !open);
  panelToggle.textContent = open ? "Hide controls" : "Show controls";
  panelToggle.setAttribute("aria-expanded", open ? "true" : "false");

  if (fromUser) {
    if (narrowMedia.matches) {
      state.narrowPanelPreference = open;
    } else {
      state.userPanelPreference = open;
    }
  }

  scheduleLayoutGeometrySync();
  setTimeout(scheduleLayoutGeometrySync, 210);
}

function applyViewportPanelRule() {
  const isNarrow = narrowMedia.matches;
  layoutRoot.classList.toggle("narrow", isNarrow);

  if (isNarrow) {
    applyPanelState(state.narrowPanelPreference, false);
    return;
  }

  state.narrowPanelPreference = false;

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

function smallCentre() {
  const d = currentDistance();
  return {
    x: state.centre.x + Math.cos(state.theta) * d,
    y: state.centre.y + Math.sin(state.theta) * d
  };
}

function smallRotation() {
  const R = state.bigRadius;
  const r = state.smallRadius;
  if (state.mode === "inside") {
    return -((R - r) / r) * state.theta;
  }
  return ((R + r) / r) * state.theta;
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
    ctx.fillStyle = "rgba(250, 237, 218, 0.92)";
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
  const toothDepth = currentRingToothDepth();
  const piece = selectedRingPiece();

  ctx.beginPath();
  traceToothTrackPath(state.centre.x, state.centre.y, state.ringOuterRadius, toothDepth, piece.outerTeeth, "out");
  traceToothTrackPath(state.centre.x, state.centre.y, state.ringInnerRadius, toothDepth, piece.innerTeeth, "in");
  ctx.fillStyle = "rgba(215, 200, 176, 0.98)";
  ctx.fill("evenodd");

  ctx.strokeStyle = "#2f4858";
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function drawTrace() {
  for (let s = 0; s < state.strokes.length; s += 1) {
    const stroke = state.strokes[s];
    if (!stroke.points || stroke.points.length < 2) continue;

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.strokeStyle = stroke.colour;
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
    ctx.strokeStyle = i === state.selectedHole ? "#de6e4b" : "#364152";
    ctx.lineWidth = i === state.selectedHole ? 1.8 : 1.2;
    ctx.stroke();
    if (i === state.selectedHole) {
      ctx.beginPath();
      ctx.arc(x, y, 9.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(222, 110, 75, 0.55)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }
}

function draw() {
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  applyViewportTransform();

  const toothDepth = currentRingToothDepth();
  drawRingPiece();

  drawTrace();

  const sc = smallCentre();
  const phi = smallRotation();
  const meshPhaseOffset =
    state.mode === "inside"
      ? -Math.PI / state.smallTeeth
      : Math.PI - Math.PI / state.smallTeeth;
  drawCogRing(sc.x, sc.y, state.smallRadius, currentWheelToothDepth(), state.smallTeeth, "#000000", true, phi + meshPhaseOffset);

  drawHoles(sc.x, sc.y, phi);
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
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const padding = 0.12;
  const targetZoom = Math.min(
    state.view.maxZoom,
    Math.max(
      state.view.minZoom,
      Math.min(
        (viewport.width * (1 - padding)) / contentWidth,
        (viewport.height * (1 - padding)) / contentHeight
      )
    )
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const targetPanX = -(centerX - state.centre.x) * targetZoom;
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
  if (!last || Math.hypot(last.x - hp.x, last.y - hp.y) > 0.6) {
    points.push(hp);
  }
}

function pushInterpolatedTrace(deltaTheta) {
  if (state.selectedHole < 0) return;

  const maxStep = 0.012;
  const steps = Math.max(1, Math.ceil(Math.abs(deltaTheta) / maxStep));
  const startTheta = state.theta;

  for (let i = 1; i <= steps; i += 1) {
    state.theta = startTheta + (deltaTheta * i) / steps;
    pushTracePoint();
  }
}

canvas.addEventListener("pointerdown", (event) => {
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
    state.activeStroke = {
      colour: state.inkColour,
      width: state.strokeWidth,
      points: []
    };
    state.strokes.push(state.activeStroke);
    state.lastPointerAngle = Math.atan2(worldPoint.y - state.centre.y, worldPoint.x - state.centre.x);
    canvas.setPointerCapture(event.pointerId);
    pushTracePoint();
    draw();
    return;
  }

  state.dragging = true;
  state.view.dragMode = "pan";
  state.selectedHole = -1;
  state.activeStroke = null;
  canvas.setPointerCapture(event.pointerId);
  draw();
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.dragging) return;
  const screenPoint = screenToCanvas(event.clientX, event.clientY);

  if (state.view.dragMode === "pan") {
    const dx = screenPoint.x - state.view.lastScreenX;
    const dy = screenPoint.y - state.view.lastScreenY;
    state.view.panX += dx;
    state.view.panY += dy;
    state.view.lastScreenX = screenPoint.x;
    state.view.lastScreenY = screenPoint.y;
    draw();
    return;
  }

  const worldPoint = screenToWorld(event.clientX, event.clientY);
  const pointerAngle = Math.atan2(worldPoint.y - state.centre.y, worldPoint.x - state.centre.x);
  const delta = angleDiff(pointerAngle, state.lastPointerAngle);
  state.lastPointerAngle = pointerAngle;

  pushInterpolatedTrace(delta);
  draw();
});

function stopDrag(event) {
  if (!state.dragging) return;
  state.dragging = false;
  state.view.dragMode = null;
  if (state.activeStroke && state.activeStroke.points.length < 2) {
    state.strokes.pop();
  }
  state.activeStroke = null;
  if (event) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener("pointerup", stopDrag);
canvas.addEventListener("pointercancel", stopDrag);
canvas.addEventListener("pointerleave", () => {
  if (state.dragging) draw();
});

canvas.addEventListener("wheel", (event) => {
  cancelViewAnimation();
  event.preventDefault();
  const zoomFactor = Math.exp(-event.deltaY * 0.0012);
  setZoomAt(event.clientX, event.clientY, state.view.zoom * zoomFactor);
  draw();
}, { passive: false });

controls.ringPiece.addEventListener("change", () => {
  state.ringPieceId = controls.ringPiece.value;
  syncTrackOptions();
  updateGeometryFromTeeth();
  syncWheelOptions();
  updateGeometryFromTeeth();
  rebuildHoles();
  refreshMeta();
  fitViewToContent();
  draw();
});

controls.track.addEventListener("change", () => {
  state.track = controls.track.value;
  syncWheelOptions();
  updateGeometryFromTeeth();
  rebuildHoles();
  refreshMeta();
  fitViewToContent();
  draw();
});

controls.smallTeeth.addEventListener("change", () => {
  state.smallTeeth = Number(controls.smallTeeth.value);
  updateGeometryFromTeeth();
  rebuildHoles();
  refreshMeta();
  fitViewToContent();
  draw();
});

controls.inkColour.addEventListener("input", () => {
  state.inkColour = controls.inkColour.value;
  draw();
});

controls.strokeWidth.addEventListener("input", () => {
  state.strokeWidth = Number(controls.strokeWidth.value);
  draw();
});

controls.clearTrace.addEventListener("click", () => {
  state.strokes = [];
  state.activeStroke = null;
  draw();
});

controls.resetWheel.addEventListener("click", () => {
  state.theta = 0;
  state.selectedHole = -1;
  draw();
});

controls.resetView.addEventListener("click", () => {
  fitViewToContent(true);
  draw();
});

window.addEventListener("resize", () => {
  applyViewportPanelRule();
  scheduleLayoutGeometrySync();
});

panelToggle.addEventListener("click", () => {
  applyPanelState(!state.panelOpen, true);
});

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
  controls.ringPiece.innerHTML = PRESETS.ringPieces
    .map((piece) => `<option value="${piece.id}">${piece.label} ring</option>`)
    .join("");
  controls.ringPiece.value = state.ringPieceId;

  syncTrackOptions();
  state.track = controls.track.value;
  state.ringPieceId = controls.ringPiece.value;
  syncWheelOptions();
  state.smallTeeth = Number(controls.smallTeeth.value);
  state.inkColour = controls.inkColour.value;
  state.strokeWidth = Number(controls.strokeWidth.value);

  applyViewportPanelRule();
  syncLayoutGeometry();
  fitViewToContent();
  draw();
}

init();
