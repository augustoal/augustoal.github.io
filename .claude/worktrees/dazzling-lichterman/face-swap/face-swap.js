// face-swap.js
// Face reenactment via 2D triangle warp (MediaPipe FaceMesh + Delaunator)

const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggleMode");
const opacityWrap = document.getElementById("opacityWrap");
const opacityRange = document.getElementById("opacity");
const opacityVal = document.getElementById("opacityVal");

const videoEl = document.getElementById("video");

const meshCanvas = document.getElementById("meshCanvas");
const meshCtx = meshCanvas.getContext("2d");

const overlayCanvas = document.getElementById("overlayCanvas");
const overlayCtx = overlayCanvas.getContext("2d");

const sideCanvas = document.getElementById("sideCanvas");
const sideCtx = sideCanvas.getContext("2d");

const fileEl = document.getElementById("file");
const clearBtn = document.getElementById("clear");

// Offscreen canvas for uploaded photo
const photoCanvas = document.createElement("canvas");
const photoCtx = photoCanvas.getContext("2d");

let liveLandmarks = null;
let photoLandmarks = null;
let delaunay = null;
let photoReady = false;

// Flow
let mode = "live";          // "live" or "photoOnce"
let layoutMode = "side";    // "side" or "overlay"
let overlayOpacity = 0.85;

function setStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = "status " + cls;
}

function updateModeUI() {
  if (layoutMode === "side") {
    document.body.classList.remove("overlay-mode");
    toggleBtn.textContent = "Mode: Side-by-side";
    opacityWrap.style.display = "none";
    overlayCanvas.style.opacity = "0";
  } else {
    document.body.classList.add("overlay-mode");
    toggleBtn.textContent = "Mode: Overlay";
    opacityWrap.style.display = "inline-flex";
    overlayCanvas.style.opacity = String(overlayOpacity);
    document.body.style.setProperty("--overlayOpacity", String(overlayOpacity));
  }
}

toggleBtn.addEventListener("click", () => {
  layoutMode = (layoutMode === "side") ? "overlay" : "side";
  updateModeUI();
});

opacityRange.addEventListener("input", () => {
  overlayOpacity = Number(opacityRange.value) / 100;
  opacityVal.textContent = `${opacityRange.value}%`;
  if (layoutMode === "overlay") {
    overlayCanvas.style.opacity = String(overlayOpacity);
    document.body.style.setProperty("--overlayOpacity", String(overlayOpacity));
  }
});

updateModeUI();

// Keep canvases synced to the *actual* stream size
function resizeCanvasesToVideo() {
  const w = videoEl.videoWidth || 1280;
  const h = videoEl.videoHeight || 720;

  for (const c of [meshCanvas, overlayCanvas, sideCanvas]) {
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
  }
}

// --- Math helpers ---
function affineFromTriangles(src, dst) {
  const x0 = src[0].x, y0 = src[0].y;
  const x1 = src[1].x, y1 = src[1].y;
  const x2 = src[2].x, y2 = src[2].y;

  const u0 = dst[0].x, v0 = dst[0].y;
  const u1 = dst[1].x, v1 = dst[1].y;
  const u2 = dst[2].x, v2 = dst[2].y;

  const det = (x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1));
  if (Math.abs(det) < 1e-6) return null;

  const invDet = 1 / det;

  const A11 = (y1 - y2) * invDet;
  const A12 = (y2 - y0) * invDet;
  const A13 = (y0 - y1) * invDet;

  const A21 = (x2 - x1) * invDet;
  const A22 = (x0 - x2) * invDet;
  const A23 = (x1 - x0) * invDet;

  const A31 = (x1 * y2 - x2 * y1) * invDet;
  const A32 = (x2 * y0 - x0 * y2) * invDet;
  const A33 = (x0 * y1 - x1 * y0) * invDet;

  const a = A11 * u0 + A12 * u1 + A13 * u2;
  const c = A21 * u0 + A22 * u1 + A23 * u2;
  const e = A31 * u0 + A32 * u1 + A33 * u2;

  const b = A11 * v0 + A12 * v1 + A13 * v2;
  const d = A21 * v0 + A22 * v1 + A23 * v2;
  const f = A31 * v0 + A32 * v1 + A33 * v2;

  return [a, b, c, d, e, f];
}

function clipTriangle(ctx, p0, p1, p2) {
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.clip();
}

// --- FaceMesh ---
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
  // Photo pass (one-shot)
  if (mode === "photoOnce") {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length) {
      photoLandmarks = results.multiFaceLandmarks[0];
      buildTriangulation();
      photoReady = true;
      setStatus("Photo ready ✅ Your expressions now animate it.", "ok");
    } else {
      photoLandmarks = null;
      delaunay = null;
      photoReady = false;
      setStatus("No face detected in that photo. Try a front-facing one with good lighting.", "error");
    }
    mode = "live";
    return;
  }

  resizeCanvasesToVideo();

  // Clear render targets
  meshCtx.setTransform(1, 0, 0, 1, 0, 0);
  meshCtx.clearRect(0, 0, meshCanvas.width, meshCanvas.height);

  overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  sideCtx.setTransform(1, 0, 0, 1, 0, 0);
  sideCtx.clearRect(0, 0, sideCanvas.width, sideCanvas.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length) {
    liveLandmarks = results.multiFaceLandmarks[0];

    // Mesh overlay on live camera
    drawConnectors(meshCtx, liveLandmarks, FACEMESH_TESSELATION, { lineWidth: 0.5 });
    drawConnectors(meshCtx, liveLandmarks, FACEMESH_FACE_OVAL, { lineWidth: 1 });
    drawConnectors(meshCtx, liveLandmarks, FACEMESH_LIPS, { lineWidth: 1 });
    drawConnectors(meshCtx, liveLandmarks, FACEMESH_LEFT_EYE, { lineWidth: 1 });
    drawConnectors(meshCtx, liveLandmarks, FACEMESH_RIGHT_EYE, { lineWidth: 1 });

    if (photoReady && photoLandmarks && delaunay) {
      if (layoutMode === "overlay") {
        renderWarpedPhoto(overlayCtx, overlayCanvas.width, overlayCanvas.height);
      } else {
        renderWarpedPhoto(sideCtx, sideCanvas.width, sideCanvas.height);
        // subtle depth
        sideCtx.save();
        sideCtx.globalCompositeOperation = "destination-over";
        sideCtx.fillStyle = "rgba(0,0,0,0.22)";
        sideCtx.fillRect(0, 0, sideCanvas.width, sideCanvas.height);
        sideCtx.restore();
      }
      setStatus("Tracking ✅ (animated photo active)", "ok");
    } else {
      if (layoutMode === "side") {
        sideCtx.save();
        sideCtx.fillStyle = "rgba(0,0,0,0.35)";
        sideCtx.fillRect(0, 0, sideCanvas.width, sideCanvas.height);
        sideCtx.fillStyle = "#e7eef7";
        sideCtx.font = "16px system-ui";
        sideCtx.fillText("Upload a photo to animate →", 20, 40);
        sideCtx.restore();
      }
      setStatus("Tracking ✅ (upload a photo)", "ok");
    }
  } else {
    liveLandmarks = null;
    setStatus("No face detected (try more light and look at the camera).");
  }
});

// --- Triangulation ---
function buildTriangulation() {
  const w = photoCanvas.width;
  const h = photoCanvas.height;

  const pts = new Float64Array(468 * 2);
  for (let i = 0; i < 468; i++) {
    const lm = photoLandmarks[i];
    pts[i * 2] = lm.x * w;
    pts[i * 2 + 1] = lm.y * h;
  }
  delaunay = new Delaunator(pts);
}

// --- Warp render ---
function renderWarpedPhoto(ctx, outW, outH) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, outW, outH);

  const tris = delaunay.triangles;
  const pw = photoCanvas.width;
  const ph = photoCanvas.height;

  function srcPoint(i) {
    const lm = photoLandmarks[i];
    return { x: lm.x * pw, y: lm.y * ph };
  }
  function dstPoint(i) {
    const lm = liveLandmarks[i];
    return { x: lm.x * outW, y: lm.y * outH };
  }

  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t], i1 = tris[t + 1], i2 = tris[t + 2];

    const s0 = srcPoint(i0), s1 = srcPoint(i1), s2 = srcPoint(i2);
    const d0 = dstPoint(i0), d1 = dstPoint(i1), d2 = dstPoint(i2);

    const M = affineFromTriangles([s0, s1, s2], [d0, d1, d2]);
    if (!M) continue;

    ctx.save();
    clipTriangle(ctx, d0, d1, d2);
    ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    ctx.drawImage(photoCanvas, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

// --- Upload handling ---
fileEl.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = async () => {
    const maxW = 900;
    const scale = Math.min(1, maxW / img.naturalWidth);

    photoCanvas.width = Math.round(img.naturalWidth * scale);
    photoCanvas.height = Math.round(img.naturalHeight * scale);

    photoCtx.setTransform(1, 0, 0, 1, 0, 0);
    photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
    photoCtx.drawImage(img, 0, 0, photoCanvas.width, photoCanvas.height);

    setStatus("Analyzing face in photo…");
    photoReady = false;
    photoLandmarks = null;
    delaunay = null;

    mode = "photoOnce";
    await faceMesh.send({ image: photoCanvas });

    URL.revokeObjectURL(url);
  };

  img.onerror = () => {
    setStatus("Could not load that image. Try another one.", "error");
    URL.revokeObjectURL(url);
  };

  img.src = url;
});

clearBtn.addEventListener("click", () => {
  fileEl.value = "";
  photoReady = false;
  photoLandmarks = null;
  delaunay = null;

  overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  sideCtx.setTransform(1, 0, 0, 1, 0, 0);
  sideCtx.clearRect(0, 0, sideCanvas.width, sideCanvas.height);

  setStatus("Photo cleared. Upload another one to animate.");
});

// --- Camera ---
async function startCamera() {
  try {
    const camera = new Camera(videoEl, {
      onFrame: async () => {
        mode = "live";
        await faceMesh.send({ image: videoEl });
      },
      width: 1280,
      height: 720,
    });

    await camera.start();
    setStatus("Camera started ✅ Upload a photo to begin.", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Could not access the camera. Check permissions or try Chrome.", "error");
  }
}

startCamera();