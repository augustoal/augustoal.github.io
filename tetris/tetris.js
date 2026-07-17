const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const SCORE_KEY = 'tetris-high-scores';
const COLORS = { I:'#38bdf8', J:'#60a5fa', L:'#fb923c', O:'#facc15', S:'#4ade80', T:'#c084fc', Z:'#fb7185' };
const SHAPES = {
  I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J:[[1,0,0],[1,1,1],[0,0,0]], L:[[0,0,1],[1,1,1],[0,0,0]],
  O:[[1,1],[1,1]], S:[[0,1,1],[1,1,0],[0,0,0]],
  T:[[0,1,0],[1,1,1],[0,0,0]], Z:[[1,1,0],[0,1,1],[0,0,0]]
};
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetScoresBtn = document.getElementById('resetScoresBtn');
const scoresEl = document.getElementById('scores');
const emptyScoreEl = document.getElementById('emptyScore');

let board, active, next, score, lines, level, dropMs, lastTime, dropCounter, running, paused, animationId;

function emptyBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }
function randomPiece() { const type = Object.keys(SHAPES)[Math.floor(Math.random() * 7)]; return { type, shape: SHAPES[type].map(r => [...r]), x: Math.floor(COLS / 2) - 2, y: 0 }; }
function rotate(shape) { return shape[0].map((_, i) => shape.map(row => row[i]).reverse()); }
function collides(piece, dx = 0, dy = 0, shape = piece.shape) {
  return shape.some((row, y) => row.some((cell, x) => cell && (piece.x + x + dx < 0 || piece.x + x + dx >= COLS || piece.y + y + dy >= ROWS || board[piece.y + y + dy]?.[piece.x + x + dx])));
}
function merge() { active.shape.forEach((row, y) => row.forEach((cell, x) => { if (cell) board[active.y + y][active.x + x] = active.type; })); }
function clearLines() {
  let cleared = 0;
  board = board.filter(row => row.some(cell => !cell) || (cleared++, false));
  while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
  if (cleared) {
    score += [0, 100, 300, 500, 800][cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    dropMs = Math.max(90, 800 - (level - 1) * 65);
  }
}
function spawn() {
  active = next || randomPiece();
  active.x = Math.floor(COLS / 2) - Math.ceil(active.shape[0].length / 2);
  active.y = 0;
  next = randomPiece();
  drawNext();
  if (collides(active)) gameOver();
}
function hardDrop() { if (!running || paused) return; while (!collides(active, 0, 1)) active.y++; lockPiece(); }
function softDrop() { if (!running || paused) return; if (!collides(active, 0, 1)) { active.y++; score++; } else lockPiece(); }
function lockPiece() { merge(); clearLines(); spawn(); updateStats(); draw(); }
function move(dx) { if (running && !paused && !collides(active, dx, 0)) active.x += dx; }
function rotateActive() {
  if (!running || paused) return;
  const rotated = rotate(active.shape);
  for (const offset of [0, -1, 1, -2, 2]) if (!collides(active, offset, 0, rotated)) { active.x += offset; active.shape = rotated; break; }
}
function drawCell(context, x, y, color, size = BLOCK) { context.fillStyle = color; context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2); context.strokeStyle = 'rgba(255,255,255,0.18)'; context.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2); }
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#08111f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.055)'; for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * BLOCK, 0); ctx.lineTo(x * BLOCK, ROWS * BLOCK); ctx.stroke(); } for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * BLOCK); ctx.lineTo(COLS * BLOCK, y * BLOCK); ctx.stroke(); }
  board.forEach((row, y) => row.forEach((cell, x) => cell && drawCell(ctx, x, y, COLORS[cell])));
  if (active) active.shape.forEach((row, y) => row.forEach((cell, x) => cell && drawCell(ctx, active.x + x, active.y + y, COLORS[active.type])));
}
function drawNext() { nextCtx.clearRect(0,0,120,120); nextCtx.fillStyle = '#08111f'; nextCtx.fillRect(0,0,120,120); if (!next) return; const size = 24; const ox = (5 - next.shape[0].length) / 2; const oy = (5 - next.shape.length) / 2; next.shape.forEach((row,y)=>row.forEach((cell,x)=>cell && drawCell(nextCtx, x + ox, y + oy, COLORS[next.type], size))); }
function updateStats() { scoreEl.textContent = score; linesEl.textContent = lines; levelEl.textContent = level; }
function loop(time = 0) { const delta = time - lastTime; lastTime = time; if (running && !paused) { dropCounter += delta; if (dropCounter > dropMs) { softDrop(); dropCounter = 0; } draw(); } animationId = requestAnimationFrame(loop); }
function startGame() { cancelAnimationFrame(animationId); board = emptyBoard(); score = 0; lines = 0; level = 1; dropMs = 800; dropCounter = 0; lastTime = 0; running = true; paused = false; active = null; next = randomPiece(); overlay.classList.add('hidden'); startBtn.textContent = 'Restart'; pauseBtn.textContent = 'Pause'; spawn(); updateStats(); loop(); }
function togglePause() { if (!running) return; paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; overlay.classList.toggle('hidden', !paused); overlay.querySelector('strong').textContent = 'Paused'; overlay.querySelector('span').textContent = 'Press P or Resume to keep playing.'; }
function gameOver() { running = false; saveScore(score); renderScores(); overlay.classList.remove('hidden'); overlay.querySelector('strong').textContent = 'Game over'; overlay.querySelector('span').textContent = `Score: ${score}. Press Enter or Start to play again.`; }
function getScores() { try { return JSON.parse(localStorage.getItem(SCORE_KEY)) || []; } catch { return []; } }
function saveScore(value) { const scores = [...getScores(), { score: value, date: new Date().toLocaleDateString() }].sort((a,b) => b.score - a.score).slice(0, 5); localStorage.setItem(SCORE_KEY, JSON.stringify(scores)); }
function renderScores() { const scores = getScores(); scoresEl.innerHTML = scores.map(item => `<li><strong>${item.score}</strong> <span>(${item.date})</span></li>`).join(''); emptyScoreEl.classList.toggle('hidden', scores.length > 0); }

document.addEventListener('keydown', (event) => {
  if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(event.key)) event.preventDefault();
  if (event.key === 'Enter' && !running) startGame();
  if (event.key.toLowerCase() === 'p') togglePause();
  if (event.key === 'ArrowLeft') move(-1); if (event.key === 'ArrowRight') move(1); if (event.key === 'ArrowDown') softDrop(); if (event.key === 'ArrowUp') rotateActive(); if (event.key === ' ') hardDrop(); draw();
});
startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);
resetScoresBtn.addEventListener('click', () => { localStorage.removeItem(SCORE_KEY); renderScores(); });
board = emptyBoard(); score = 0; lines = 0; level = 1; running = false; paused = false; renderScores(); updateStats(); draw(); drawNext();
