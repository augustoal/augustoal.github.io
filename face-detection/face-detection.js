// face-detection.js
// Needs: #stage, #video, #overlay, #status
// Uses: MediaPipe Camera Utils + FaceMesh + Drawing Utils (drawConnectors)

const stageEl = document.getElementById("stage");
const videoEl = document.getElementById("video");
const canvasEl = document.getElementById("overlay");
const ctx = canvasEl.getContext("2d");
const statusEl = document.getElementById("status");

const PARTS = [
  { name: "Left brow",  idx: 70,  color: "#c4b5fd" },
  { name: "Right brow", idx: 300, color: "#c4b5fd" },
  { name: "Left eye",   idx: 33,  color: "#7dd3fc" },
  { name: "Right eye",  idx: 263, color: "#7dd3fc" },
  { name: "Nose",       idx: 1,   color: "#fda4af" },
  { name: "Mouth (L)",  idx: 61,  color: "#fbbf24" },
  { name: "Mouth (R)",  idx: 291, color: "#fbbf24" },
  { name: "Chin",       idx: 152, color: "#a7f3d0" },
];

function setStatus(msg, ok = false) {
  statusEl.textContent = msg;
  statusEl.className = "hint " + (ok ? "ok" : "");
}
function setError(msg) {
  statusEl.textContent = msg;
  statusEl.className = "hint error";
}

// Canvas sizing: match visible stage in CSS pixels + DPR for crisp lines.
function resizeCanvasToStage() {
  const rect = stageEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvasEl.style.width = rect.width + "px";
  canvasEl.style.height = rect.height + "px";

  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));

  if (canvasEl.width !== w) canvasEl.width = w;
  if (canvasEl.height !== h) canvasEl.height = h;

  // Draw in CSS pixel coordinates
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  stageEl._cssW = rect.width;
  stageEl._cssH = rect.height;
}

// Compute how object-fit: cover crops the source (video frame) into the stage box.
function getCoverMapping() {
  const vw = videoEl.videoWidth || 0;
  const vh = videoEl.videoHeight || 0;
  const dw = stageEl._cssW || stageEl.getBoundingClientRect().width;
  const dh = stageEl._cssH || stageEl.getBoundingClientRect().height;

  if (!vw || !vh || !dw || !dh) {
    return { sx: 0, sy: 0, sw: vw, sh: vh, dw, dh };
  }

  // scale to cover destination
  const scale = Math.max(dw / vw, dh / vh);
  const scaledW = vw * scale;
  const scaledH = vh * scale;

  // center crop in destination
  const offsetX = (scaledW - dw) / 2;
  const offsetY = (scaledH - dh) / 2;

  // Convert destination pixel to source pixel crop rectangle
  const sx = offsetX / scale;
  const sy = offsetY / scale;
  const sw = dw / scale;
  const sh = dh / scale;

  return { sx, sy, sw, sh, dw, dh };
}

// Map normalized landmark (0..1 in full frame) into destination (stage) pixels under cover-crop.
function mapLandmarkToStagePx(lm, cover) {
  const { sx, sy, sw, sh, dw, dh } = cover;

  // Landmark position in *source* pixels (full video frame)
  const px = lm.x * videoEl.videoWidth;
  const py = lm.y * videoEl.videoHeight;

  // Normalize within the cropped source rectangle
  const cx = (px - sx) / sw;
  const cy = (py - sy) / sh;

  // Map to destination pixels (stage)
  return {
    x: cx * dw,
    y: cy * dh
  };
}

// Helpers for labels
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  const radius = typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r;
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + w - radius.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius.tr);
  ctx.lineTo(x + w, y + h - radius.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius.br, y + h);
  ctx.lineTo(x + radius.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawLabel(x, y, text, color) {
  const padX = 6;
  const boxH = 22;

  ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textBaseline = "middle";

  const metrics = ctx.measureText(text);
  const boxW = metrics.width + padX * 2;

  const dx = 10, dy = -10;
  const bx = x + dx;
  const by = y + dy;

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#0b1220";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  roundRect(ctx, bx, by - boxH / 2, boxW, boxH, 8, true, true);

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#e7eef7";
  ctx.fillText(text, bx + padX, by);
}

// MediaPipe FaceMesh
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
});

faceMesh.onResults((results) => {
  resizeCanvasToStage();
  ctx.clearRect(0, 0, stageEl._cssW, stageEl._cssH);

  if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) {
    setStatus("No face detected (try more light and look at the camera).");
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  // Build a "landmarks mapped to stage pixels" array for drawing utils
  const cover = getCoverMapping();
  const mapped = landmarks.map((lm) => {
    const p = mapLandmarkToStagePx(lm, cover);
    // drawConnectors expects x/y in [0..1] if canvas is full-size,
    // BUT it also works if we provide pixel-space and we draw ourselves.
    // So we draw connectors ourselves below in pixel space.
    return { x: p.x, y: p.y, z: lm.z };
  });

  // Draw mesh in pixel space (manual lines) to avoid drawConnectors assumptions
  // We'll still use MediaPipe connector lists like FACEMESH_TESSELATION.
  function drawEdges(edges, lineWidth, strokeStyle = "rgba(255,255,255,0.65)") {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeStyle;
    ctx.beginPath();
    for (const [a, b] of edges) {
      const p1 = mapped[a];
      const p2 = mapped[b];
      // Skip if outside (can happen at crop boundary)
      if (!p1 || !p2) continue;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
  }

  // Draw main mesh + features
  drawEdges(FACEMESH_TESSELATION, 0.5, "rgba(255,255,255,0.55)");
  drawEdges(FACEMESH_RIGHT_EYE, 1, "rgba(255,255,255,0.75)");
  drawEdges(FACEMESH_LEFT_EYE, 1, "rgba(255,255,255,0.75)");
  drawEdges(FACEMESH_LIPS, 1, "rgba(255,255,255,0.75)");
  drawEdges(FACEMESH_FACE_OVAL, 1, "rgba(255,255,255,0.75)");

  // Points + labels
  for (const p of PARTS) {
    const lm = landmarks[p.idx];
    const pt = mapLandmarkToStagePx(lm, cover);

    // Clamp (if crop cuts part of face, labels won't explode)
    if (pt.x < -50 || pt.y < -50 || pt.x > cover.dw + 50 || pt.y > cover.dh + 50) continue;

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    drawLabel(pt.x, pt.y, p.name, p.color);
  }

  setStatus("Face detected ✅", true);
});

async function start() {
  try {
    const camera = new Camera(videoEl, {
      onFrame: async () => {
        await faceMesh.send({ image: videoEl });
      },
    });

    await camera.start();

    // First resize after stream is live
    requestAnimationFrame(() => resizeCanvasToStage());
    window.addEventListener("resize", () => resizeCanvasToStage());

    setStatus("Camera started. Looking for a face…", true);
  } catch (e) {
    console.error(e);
    setError("Could not access the camera. Check browser permissions (Chrome works best).");
  }
}

start();