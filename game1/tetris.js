// ====== スマホ特化・簡潔版 ======
const COLS = 10;
const ROWS = 20;
let BLOCK = 30;
const GHOST_ALPHA = 0.22;

const PARAMS = new URLSearchParams(location.search);
const TARGET_LINES = Number(PARAMS.get("target") || 10);

// ---- 形状・色 ----
const SHAPES = {
  I: [[[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]]],
  J: [[[2, 0, 0], [2, 2, 2], [0, 0, 0]], [[0, 2, 2], [0, 2, 0], [0, 2, 0]], [[0, 0, 0], [2, 2, 2], [0, 0, 2]], [[0, 2, 0], [0, 2, 0], [2, 2, 0]]],
  L: [[[0, 0, 3], [3, 3, 3], [0, 0, 0]], [[0, 3, 0], [0, 3, 0], [0, 3, 3]], [[0, 0, 0], [3, 3, 3], [3, 0, 0]], [[3, 3, 0], [0, 3, 0], [0, 3, 0]]],
  O: [[[4, 4], [4, 4]]],
  S: [[[0, 5, 5], [5, 5, 0], [0, 0, 0]], [[0, 5, 0], [0, 5, 5], [0, 0, 5]]],
  T: [[[0, 6, 0], [6, 6, 6], [0, 0, 0]], [[0, 6, 0], [0, 6, 6], [0, 6, 0]], [[0, 0, 0], [6, 6, 6], [0, 6, 0]], [[0, 6, 0], [6, 6, 0], [0, 6, 0]]],
  Z: [[[7, 7, 0], [0, 7, 7], [0, 0, 0]], [[0, 0, 7], [0, 7, 7], [0, 7, 0]]]
};
const COLORS = [null, "#00bcd4", "#3f51b5", "#ff9800", "#ffeb3b", "#4caf50", "#9c27b0", "#f44336"];

// ---- ピース ----
class Piece {
  constructor(type) {
    this.type = type;
    this.shape = SHAPES[type];
    this.rot = 0;
    this.mat = this.shape[this.rot];
    this.x = Math.floor(COLS / 2) - Math.ceil(this.mat[0].length / 2);
    this.y = -this.mat.length;
  }
  rotate(board) {
    const nxt = (this.rot + 1) % this.shape.length;
    const nm = this.shape[nxt];
    if (!this.collide(board, this.x, this.y, nm)) {
      this.rot = nxt; this.mat = nm;
    }
  }
  move(dx, dy, board) {
    if (!this.collide(board, this.x + dx, this.y + dy, this.mat)) {
      this.x += dx; this.y += dy; return true;
    }
    return false;
  }
  hardDrop(board) { while (this.move(0, 1, board)) { } }
  collide(board, nx, ny, mat) {
    for (let y = 0; y < mat.length; y++) {
      for (let x = 0; x < mat[y].length; x++) {
        if (!mat[y][x]) continue;
        const px = nx + x, py = ny + y;
        if (py >= ROWS || px < 0 || px >= COLS || (py >= 0 && board[py][px])) return true;
      }
    }
    return false;
  }
  lock(board) {
    for (let y = 0; y < this.mat.length; y++) {
      for (let x = 0; x < this.mat[y].length; x++) {
        if (!this.mat[y][x]) continue;
        const px = this.x + x, py = this.y + y;
        if (py >= 0) board[py][px] = this.mat[y][x];
      }
    }
  }
}

// ---- 本体 ----
class Tetris {
  constructor() {
    this.canvas = document.getElementById("board");
    this.ctx = this.canvas.getContext("2d");

    this.board = this.makeMatrix(ROWS, COLS);
    this.curr = null;
    this.next = this.randPiece();

    this.lines = 0;
    this.dropMs = 550; // 固定
    this.timer = 0;
    this.live = true;
    this.prev = 0;

    this.bindInputs();
    this.reset();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  makeMatrix(h, w) { return Array.from({ length: h }, () => Array(w).fill(0)); }
  randPiece() { const k = Object.keys(SHAPES); return new Piece(k[(Math.random() * k.length) | 0]); }

  bindInputs() {
    document.addEventListener("keydown", (e) => {
      if (!this.live) return;
      switch (e.key) {
        case "ArrowLeft": this.curr.move(-1, 0, this.board); break;
        case "ArrowRight": this.curr.move(1, 0, this.board); break;
        case "ArrowDown": this.softDrop(); break;
        case "ArrowUp": this.curr.rotate(this.board); break;
        case " ": this.curr.hardDrop(this.board); this.drop(true); break;
      }
    });

    setupTouchControls(this);
    window.addEventListener("resize", fitCanvasToViewport);
    window.addEventListener("orientationchange", () => setTimeout(fitCanvasToViewport, 300));
  }

  reset() {
    this.board.forEach(r => r.fill(0));
    this.curr = this.next; this.next = this.randPiece();
    this.lines = 0;
    fitCanvasToViewport();
    updateGoalText();
  }

  restart() {
    this.live = true;
    this.timer = 0;
    this.prev = 0;
    this.next = this.randPiece();
    this.reset();
    requestAnimationFrame(this.loop);
  }

  loop(ts) {
    if (!this.prev) this.prev = ts;
    const dt = ts - this.prev; this.prev = ts;

    if (!this.live) return;
    this.timer += dt;
    if (this.timer >= this.dropMs) {
      this.drop(false);
      this.timer = 0;
    }

    this.draw();
    if (this.live) requestAnimationFrame(this.loop);
  }

  softDrop() { this.curr.move(0, 1, this.board); }


drop(hard=false){
  if (!this.curr.move(0,1,this.board)) {

    const lockedAboveTop = this.curr.mat.some((row, yy) =>
      row.some((v, xx) => v && (this.curr.y + yy) < 0)
    );

    this.curr.lock(this.board);
    this.clearLines();

    if (lockedAboveTop) {
      this.live = false;
      showGameOverSplash();
      return;
    }

    this.curr = this.next;
    this.next = this.randPiece();

    if (this.curr.collide(this.board, this.curr.x, this.curr.y, this.curr.mat)) {
      this.live = false;
      showGameOverSplash();
      return;
    }
  }
}


  clearLines() {
    let cleared = 0;
    outer: for (let y = ROWS - 1; y >= 0; --y) {
      for (let x = 0; x < COLS; ++x) if (!this.board[y][x]) continue outer;
      this.board.splice(y, 1);
      this.board.unshift(Array(COLS).fill(0));
      ++cleared; ++y;
    }
    if (cleared) {
      this.lines += cleared;
      if (this.lines >= TARGET_LINES) {
        this.live = false;
        showClearSplash(this.lines); // ← ボタン押下で親へ通知
      }
    }
  }

  // ---- 描画 ----
  draw() {
    const w = COLS * BLOCK, h = ROWS * BLOCK;
    this.ctx.fillStyle = "#000"; this.ctx.fillRect(0, 0, w, h);
    this.drawGrid();
    this.drawMatrix(this.board, { x: 0, y: 0 }, this.ctx);
    const gy = this.getGhostY();
    this.drawMatrixGhost(this.curr.mat, { x: this.curr.x, y: gy }, this.ctx);
    this.drawMatrix(this.curr.mat, { x: this.curr.x, y: this.curr.y }, this.ctx);
  }

  drawGrid() {
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255,255,255,0.06)";
    this.ctx.setLineDash([4, 4]);
    for (let x = 0; x <= COLS; x++) {
      this.ctx.beginPath(); this.ctx.moveTo(x * BLOCK, 0); this.ctx.lineTo(x * BLOCK, ROWS * BLOCK); this.ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      this.ctx.beginPath(); this.ctx.moveTo(0, y * BLOCK); this.ctx.lineTo(COLS * BLOCK, y * BLOCK); this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawMatrix(mat, off, ctx) {
    for (let y = 0; y < mat.length; y++) {
      for (let x = 0; x < mat[y].length; x++) {
        const v = mat[y][x]; if (!v) continue;
        ctx.fillStyle = COLORS[v];
        ctx.fillRect((off.x + x) * BLOCK, (off.y + y) * BLOCK, BLOCK - 1, BLOCK - 1);
      }
    }
  }
  drawMatrixGhost(mat, off, ctx) {
    ctx.save(); ctx.globalAlpha = GHOST_ALPHA;
    this.drawMatrix(mat, off, ctx); ctx.restore();
  }
  getGhostY() {
    let y = this.curr.y;
    while (!this.curr.collide(this.board, this.curr.x, y + 1, this.curr.mat)) y++;
    return y;
  }
}

// ====== フィット ======
function fitCanvasToViewport() {
  const canvas = document.getElementById("board");
  const controlsH = document.getElementById("touchControls")?.offsetHeight || 0;
  const goalbarH = document.getElementById("goalbar")?.offsetHeight || 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight - controlsH - goalbarH - 8;
  BLOCK = Math.max(14, Math.floor(Math.min(vw / COLS, vh / ROWS)));
  const width = COLS * BLOCK;
  const height = ROWS * BLOCK;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
}

// ====== テキスト更新 ======
function updateGoalText() {
  const bar = document.getElementById("goalbar");
  const sc = document.querySelector(".splash-cond strong");
  if (bar) bar.textContent = `${TARGET_LINES}ライン消したらクリア`;
  if (sc) sc.textContent = `${TARGET_LINES}ライン`;
}

// ====== クリアスプラッシュ（押下で親へ通知） ======
function showClearSplash(lines) {
  const wrap = document.getElementById("clearSplash");
  wrap.classList.remove("hidden");
  const btn = document.getElementById("claimBtn");
  btn.onclick = () => {
    wrap.classList.add("hidden");
    notifyParent(true, 0, lines);            // ここで親へ通知 → 親が動画→記録
  };
}

// ====== ゲームオーバースプラッシュ（押下で同じiFrame内で再開） ======
function showGameOverSplash() {
  const wrap = document.getElementById("overSplash");
  wrap.classList.remove("hidden");
  const btn = document.getElementById("retryBtn");
  btn.onclick = () => {
    wrap.classList.add("hidden");
    if (window._tetris) window._tetris.restart();  // 盤面リセットして再スタート
  };
}

// ====== 親（qr.js）への結果送信 ======
function notifyParent(cleared, score, lines) {
  const detail = { gameId: "game1", score, time: null, cleared, lines };
  try { window.parent?.postMessage({ type: "minigame:clear", detail }, "*"); } catch { }
  try { window.dispatchEvent(new CustomEvent("minigame:clear", { detail })); } catch { }
}

// ====== タッチ操作 ======
function setupTouchControls(game) {
  const id = (s) => document.getElementById(s);
  const repeat = (el, fn, every = 90) => {
    if (!el) return;
    let t = null;
    const start = (e) => { e.preventDefault(); fn(); t = setInterval(fn, every); };
    const end = () => { if (t) { clearInterval(t); t = null; } };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("mousedown", start);
    ["touchend", "touchcancel", "mouseup", "mouseleave"].forEach(v => el.addEventListener(v, end));
  };
  repeat(id("btnLeft"), () => { if (game.live) game.curr.move(-1, 0, game.board); });
  repeat(id("btnRight"), () => { if (game.live) game.curr.move(1, 0, game.board); });
  repeat(id("btnDrop"), () => { if (game.live) game.softDrop(); });
  id("btnRotate")?.addEventListener("click", () => { if (game.live) game.curr.rotate(game.board); });
}

// ====== 起動 ======
window.addEventListener("load", () => {
  updateGoalText();
  fitCanvasToViewport();
  const splash = document.getElementById("splash");
  const startBtn = document.getElementById("startGame");
  const start = () => { splash.style.display = "none"; window._tetris = new Tetris(); };
  startBtn.addEventListener("click", start);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && splash.style.display !== "none") start(); });
});
