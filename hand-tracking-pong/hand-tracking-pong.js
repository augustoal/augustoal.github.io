// hand-tracking-pong.js
// MediaPipe Hands -> controls Pong paddle with index fingertip

// ---------- UI ----------
const statusEl = document.getElementById("status");
const toggleDebugBtn = document.getElementById("toggleDebug");
const resetBtn = document.getElementById("reset");
const handStateEl = document.getElementById("handState");
const scoreYouEl = document.getElementById("scoreYou");
const scoreCpuEl = document.getElementById("scoreCpu");

function setStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = "hint " + cls;
}

// ---------- Elements ----------
const videoEl = document.getElementById("video");
const overlayCanvas = document.getElementById("overlay");
const overlayCtx = overlayCanvas.getContext("2d");
const gameCanvas = document.getElementById("game");
const gameCtx = gameCanvas.getContext("2d");

// ---------- State ----------
let debug = false;
let paused = false;

// Hand control (normalized 0..1)
let targetPaddleY = 0.5;
let handPresent = false;

// Smoothing (EMA)
let smoothedY = 0.5;
const SMOOTH = 0.25;

// ---------- Utils ----------
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function circleRectCollide(cx, cy, r, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) <= r * r;
}

// ---------- Canvas sizing ----------
function resizeOverlayToVideo() {
  const w = videoEl.videoWidth || 1280;
  const h = videoEl.videoHeight || 720;
  if (overlayCanvas.width !== w) overlayCanvas.width = w;
  if (overlayCanvas.height !== h) overlayCanvas.height = h;
}

function resizeGameCanvas() {
  const rect = gameCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (gameCanvas.width !== w) gameCanvas.width = w;
  if (gameCanvas.height !== h) gameCanvas.height = h;
}
window.addEventListener("resize", resizeGameCanvas);

// ---------- MediaPipe Hands ----------
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
});

hands.onResults((results) => {
  resizeOverlayToVideo();
  overlayCtx.save();
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  handPresent = !!(results.multiHandLandmarks && results.multiHandLandmarks.length);
  handStateEl.textContent = handPresent ? "✅" : "—";

  if (handPresent) {
    const lm = results.multiHandLandmarks[0];

    // Control point: index fingertip = landmark 8
    // Video+overlay are mirrored in CSS, but y is invariant to mirroring.
    const indexTip = lm[8];
    targetPaddleY = clamp(indexTip.y, 0, 1);

    if (debug) {
      drawConnectors(overlayCtx, lm, HAND_CONNECTIONS, { lineWidth: 2 });
      drawLandmarks(overlayCtx, lm, { lineWidth: 1, radius: 2.5 });

      const x = indexTip.x * overlayCanvas.width;
      const y = indexTip.y * overlayCanvas.height;

      overlayCtx.beginPath();
      overlayCtx.arc(x, y, 6, 0, Math.PI * 2);
      overlayCtx.fillStyle = "rgba(255,255,255,0.9)";
      overlayCtx.fill();

      overlayCtx.strokeStyle = "rgba(255,255,255,0.5)";
      overlayCtx.lineWidth = 2;
      overlayCtx.beginPath();
      overlayCtx.moveTo(0, y);
      overlayCtx.lineTo(overlayCanvas.width, y);
      overlayCtx.stroke();
    }

    setStatus("Hand detected ✅ Move your index fingertip to control the paddle.", "ok");
  } else {
    setStatus("No hand detected. Try brighter light and keep your full hand in view.", "");
  }

  overlayCtx.restore();
});

// ---------- Pong game ----------
const game = {
  you: { x: 18, y: 0, w: 10, h: 90 },
  cpu: { x: 0, y: 0, w: 10, h: 90 },
  ball: { x: 0, y: 0, r: 7, vx: 4.2, vy: 2.2 },
  scoreYou: 0,
  scoreCpu: 0,
};

function resetRound(direction = 1) {
  const W = gameCanvas.width;
  const H = gameCanvas.height;

  game.ball.x = W / 2;
  game.ball.y = H / 2;

  const speed = 8;
  const angle = (Math.random() * 0.6 - 0.3);
  game.ball.vx = direction * speed * (1 - Math.abs(angle));
  game.ball.vy = (Math.random() < 0.5 ? -1 : 1) * speed * (0.5 + Math.random() * 0.6);

  game.you.y = (H - game.you.h) / 2;
  game.cpu.y = (H - game.cpu.h) / 2;
}

function reflectFromPaddle(paddle, dir) {
  const rel = ((game.ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2));
  const maxBounce = 6.0;

  game.ball.vx = dir * (5.5 + Math.random() * 0.8);
  game.ball.vy = clamp(rel * maxBounce, -maxBounce, maxBounce);

  const speedUp = 1.03;
  game.ball.vx *= speedUp;
  game.ball.vy *= speedUp;
}

function update(dt) {
  const W = gameCanvas.width;
  const H = gameCanvas.height;

  // Smooth hand control
  smoothedY = smoothedY + (targetPaddleY - smoothedY) * SMOOTH;

  // Map hand y (0..1) -> game y
  const desiredY = clamp(smoothedY * H - game.you.h / 2, 0, H - game.you.h);
  game.you.y = desiredY;

  // CPU follows ball (with lag)
  const cpuTarget = game.ball.y - game.cpu.h / 2;
  const cpuSpeed = 6.0;
  game.cpu.y += clamp(cpuTarget - game.cpu.y, -cpuSpeed, cpuSpeed);
  game.cpu.y = clamp(game.cpu.y, 0, H - game.cpu.h);

  // Move ball
  game.ball.x += game.ball.vx * dt * 60;
  game.ball.y += game.ball.vy * dt * 60;

  // Top/bottom bounce
  if (game.ball.y - game.ball.r < 0) { game.ball.y = game.ball.r; game.ball.vy *= -1; }
  if (game.ball.y + game.ball.r > H) { game.ball.y = H - game.ball.r; game.ball.vy *= -1; }

  // Paddle x positions
  game.cpu.x = W - 18 - game.cpu.w;

  // Collisions
  if (circleRectCollide(game.ball.x, game.ball.y, game.ball.r, game.you.x, game.you.y, game.you.w, game.you.h) && game.ball.vx < 0) {
    game.ball.x = game.you.x + game.you.w + game.ball.r;
    reflectFromPaddle(game.you, +1);
  }
  if (circleRectCollide(game.ball.x, game.ball.y, game.ball.r, game.cpu.x, game.cpu.y, game.cpu.w, game.cpu.h) && game.ball.vx > 0) {
    game.ball.x = game.cpu.x - game.ball.r;
    reflectFromPaddle(game.cpu, -1);
  }

  // Scoring
  if (game.ball.x + game.ball.r < 0) {
    game.scoreCpu += 1;
    scoreCpuEl.textContent = String(game.scoreCpu);
    resetRound(+1);
  }
  if (game.ball.x - game.ball.r > W) {
    game.scoreYou += 1;
    scoreYouEl.textContent = String(game.scoreYou);
    resetRound(-1);
  }
}

function draw() {
  resizeGameCanvas();

  const W = gameCanvas.width;
  const H = gameCanvas.height;

  gameCtx.save();
  gameCtx.setTransform(1, 0, 0, 1, 0, 0);
  gameCtx.clearRect(0, 0, W, H);

  // Background
  gameCtx.fillStyle = "#000";
  gameCtx.fillRect(0, 0, W, H);

  // Center dashed line
  gameCtx.strokeStyle = "rgba(255,255,255,0.25)";
  gameCtx.lineWidth = 2;
  gameCtx.setLineDash([8, 10]);
  gameCtx.beginPath();
  gameCtx.moveTo(W / 2, 0);
  gameCtx.lineTo(W / 2, H);
  gameCtx.stroke();
  gameCtx.setLineDash([]);

  // Paddles
  gameCtx.fillStyle = "rgba(255,255,255,0.9)";
  gameCtx.fillRect(game.you.x, game.you.y, game.you.w, game.you.h);
  gameCtx.fillRect(game.cpu.x, game.cpu.y, game.cpu.w, game.cpu.h);

  // Ball
  gameCtx.beginPath();
  gameCtx.arc(game.ball.x, game.ball.y, game.ball.r, 0, Math.PI * 2);
  gameCtx.fill();

  // Hint if no hand
  if (!handPresent) {
    gameCtx.fillStyle = "rgba(255,255,255,0.7)";
    gameCtx.font = `${Math.floor(H * 0.05)}px system-ui`;
    gameCtx.fillText("Show your hand ✋", Math.floor(W * 0.12), Math.floor(H * 0.18));
  }

  gameCtx.restore();
}

// ---------- Main loop ----------
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;

  if (!paused) update(dt);
  draw();

  requestAnimationFrame(loop);
}

// ---------- Controls ----------
toggleDebugBtn.addEventListener("click", () => {
  debug = !debug;
  toggleDebugBtn.textContent = `Debug: ${debug ? "ON" : "OFF"}`;
});

resetBtn.addEventListener("click", () => {
  game.scoreYou = 0;
  game.scoreCpu = 0;
  scoreYouEl.textContent = "0";
  scoreCpuEl.textContent = "0";
  resetRound(Math.random() < 0.5 ? 1 : -1);
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    paused = !paused;
    setStatus(paused ? "Paused ⏸️ (press Space to resume)" : "Playing ▶️", paused ? "" : "ok");
  }
});

// ---------- Start camera ----------
async function start() {
  try {
    const camera = new Camera(videoEl, {
      onFrame: async () => {
        await hands.send({ image: videoEl });
      },
      width: 1280,
      height: 720,
    });

    await camera.start();

    setStatus("Camera started ✅ Move your index fingertip to control the paddle.", "ok");
    resizeGameCanvas();
    resetRound(Math.random() < 0.5 ? 1 : -1);
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    setStatus("Could not access the camera. Check permissions (Chrome usually works best).", "error");
  }
}

start();