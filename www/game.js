/* =========================================================
   CYBERCRAWLER — browser edition
   Canvas-rendered dungeon crawler with juice: tweened movement,
   particles, screen shake, chiptune SFX, combo scoring.
========================================================= */

// ---------- Config ----------
const COLS = 20;
const ROWS = 12;
const TILE = 32;

const WALL = "#", FLOOR = ".", CHIP = "*", EXIT = "X";

const COLORS = {
  wall: "#1c1830",
  wallEdge: "#2c2650",
  floor: "#0d0b18",
  floorGrid: "#161228",
  player: "#35e6ff",
  enemyChase: "#ff2d6a",
  enemyPatrol: "#c76bff",
  chip: "#ffb700",
  exit: "#3dffa0",
};

// ---------- Sound (Web Audio, no assets) ----------
const SFX = (() => {
  let ctx = null;
  let enabled = true;
  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function beep({ freq = 440, dur = 0.09, type = "square", vol = 0.05, slide = 0 }) {
    if (!enabled) return;
    const c = ensure();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, c.currentTime + dur);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }
  return {
    toggle() { enabled = !enabled; return enabled; },
    move: () => beep({ freq: 180, dur: 0.04, type: "square", vol: 0.03 }),
    blocked: () => beep({ freq: 90, dur: 0.06, type: "sawtooth", vol: 0.04 }),
    chip: () => beep({ freq: 660, dur: 0.12, type: "square", vol: 0.05, slide: 300 }),
    hit: () => beep({ freq: 220, dur: 0.18, type: "sawtooth", vol: 0.07, slide: -120 }),
    levelUp: () => {
      beep({ freq: 440, dur: 0.1, type: "square", vol: 0.05 });
      setTimeout(() => beep({ freq: 660, dur: 0.1, type: "square", vol: 0.05 }), 100);
      setTimeout(() => beep({ freq: 880, dur: 0.18, type: "square", vol: 0.06 }), 200);
    },
    gameOver: () => {
      beep({ freq: 300, dur: 0.3, type: "sawtooth", vol: 0.06, slide: -200 });
      setTimeout(() => beep({ freq: 150, dur: 0.4, type: "sawtooth", vol: 0.06, slide: -100 }), 200);
    },
  };
})();

// ---------- Game state ----------
class CyberCrawler {
  constructor() {
    this.level = 1;
    this.hp = 100;
    this.score = 0;
    this.combo = 0;
    this.gameOver = false;
    this.paused = false;
    this.message = "Welcome to CyberCrawler. Reach the exit and get out.";
    this.player = { r: 1, c: 1, drawR: 1, drawC: 1 };
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.generateLevel();
  }

  generateLevel() {
    this.grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        row.push((r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) ? WALL : FLOOR);
      }
      this.grid.push(row);
    }

    // scatter some interior wall clusters for variety (keeps start/exit reachable-ish, simple crawler feel)
    const clusters = 3 + Math.min(this.level, 5);
    for (let i = 0; i < clusters; i++) {
      const cr = 2 + Math.floor(Math.random() * (ROWS - 4));
      const cc = 2 + Math.floor(Math.random() * (COLS - 4));
      const len = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < len; j++) {
        const rr = Math.min(ROWS - 2, cr + j);
        const ccx = Math.min(COLS - 2, cc + (Math.random() > 0.5 ? j : 0));
        if ((rr === 1 && ccx === 1)) continue;
        this.grid[rr][ccx] = WALL;
      }
    }

    this.player.r = 1; this.player.c = 1;
    this.player.drawR = 1; this.player.drawC = 1;
    this.grid[1][1] = FLOOR;
    this.exit = { r: ROWS - 2, c: COLS - 2 };
    this.grid[this.exit.r][this.exit.c] = FLOOR;

    this.chips = [];
    const chipCount = 3 + this.level;
    let tries = 0;
    while (this.chips.length < chipCount && tries < 500) {
      tries++;
      const r = 1 + Math.floor(Math.random() * (ROWS - 2));
      const c = 1 + Math.floor(Math.random() * (COLS - 2));
      if (this.grid[r][c] !== FLOOR) continue;
      if (r === 1 && c === 1) continue;
      if (r === this.exit.r && c === this.exit.c) continue;
      if (this.chips.some(ch => ch.r === r && ch.c === c)) continue;
      this.chips.push({ r, c, bob: Math.random() * Math.PI * 2 });
    }

    this.enemies = [];
    const enemyCount = 2 + this.level;
    tries = 0;
    while (this.enemies.length < enemyCount && tries < 500) {
      tries++;
      const r = 2 + Math.floor(Math.random() * (ROWS - 3));
      const c = 2 + Math.floor(Math.random() * (COLS - 3));
      if (this.grid[r][c] !== FLOOR) continue;
      if (Math.abs(r - 1) + Math.abs(c - 1) < 4) continue; // not on top of player
      if (this.enemies.some(e => e.r === r && e.c === c)) continue;
      this.enemies.push({
        r, c, drawR: r, drawC: c,
        type: Math.random() > 0.5 ? "chase" : "patrol",
        dir: [[0, 1], [0, -1], [1, 0], [-1, 0]][Math.floor(Math.random() * 4)],
      });
    }
  }

  canMoveTo(r, c) {
    return this.grid[r] && this.grid[r][c] !== undefined && this.grid[r][c] !== WALL;
  }

  movePlayer(dr, dc) {
    if (this.gameOver || this.paused) return;
    const nr = this.player.r + dr, nc = this.player.c + dc;
    if (!this.canMoveTo(nr, nc)) {
      this.message = "Hit a firewall. Movement blocked.";
      this.shake = Math.max(this.shake, 4);
      SFX.blocked();
      return;
    }
    this.player.r = nr; this.player.c = nc;
    SFX.move();

    const chipIdx = this.chips.findIndex(ch => ch.r === nr && ch.c === nc);
    if (chipIdx !== -1) {
      this.chips.splice(chipIdx, 1);
      this.combo++;
      const gained = 50 + (this.combo - 1) * 10;
      this.score += gained;
      this.message = `Data chip acquired (+${gained} pts) — streak x${this.combo}`;
      this.spawnParticles(nc, nr, COLORS.chip, 14);
      SFX.chip();
    }

    if (nr === this.exit.r && nc === this.exit.c) {
      this.level++;
      this.score += 100;
      this.message = `Portal decrypted! Advancing to Level ${this.level}.`;
      SFX.levelUp();
      this.spawnParticles(nc, nr, COLORS.exit, 24);
      this.generateLevel();
      return;
    }

    this.updateEnemies();
  }

  updateEnemies() {
    for (const e of this.enemies) {
      let nr = e.r, nc = e.c;
      if (e.type === "chase") {
        const dr = Math.sign(this.player.r - e.r);
        const dc = Math.sign(this.player.c - e.c);
        if (dr !== 0 && (dc === 0 || Math.random() > 0.5)) nr = e.r + dr;
        else if (dc !== 0) nc = e.c + dc;
      } else {
        // patrol: walk in a straight line until blocked, then pick a new direction
        nr = e.r + e.dir[0];
        nc = e.c + e.dir[1];
        if (!this.canMoveTo(nr, nc)) {
          const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
          e.dir = dirs[Math.floor(Math.random() * dirs.length)];
          nr = e.r; nc = e.c;
        }
      }

      if (nr === this.player.r && nc === this.player.c) {
        const dmg = 10 + Math.floor(Math.random() * 11);
        this.hp -= dmg;
        this.combo = 0;
        this.message = `Alert! Enemy virus ambushed you (-${dmg} HP).`;
        this.shake = 10;
        this.flash = 1;
        SFX.hit();
        if (this.hp <= 0) {
          this.hp = 0;
          this.gameOver = true;
          SFX.gameOver();
        }
        continue;
      }

      if (this.canMoveTo(nr, nc)) {
        e.r = nr; e.c = nc;
      }
    }
  }

  spawnParticles(c, r, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2.5;
      this.particles.push({
        x: c * TILE + TILE / 2,
        y: r * TILE + TILE / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color,
      });
    }
  }
}

// ---------- Rendering ----------
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
canvas.width = COLS * TILE;
canvas.height = ROWS * TILE;

let game = new CyberCrawler();
let lastTime = performance.now();

function lerp(a, b, t) { return a + (b - a) * t; }

function draw(dt) {
  // tween player draw position toward logical position
  game.player.drawR = lerp(game.player.drawR, game.player.r, 0.35);
  game.player.drawC = lerp(game.player.drawC, game.player.c, 0.35);
  for (const e of game.enemies) {
    e.drawR = lerp(e.drawR, e.r, 0.25);
    e.drawC = lerp(e.drawC, e.c, 0.25);
  }

  ctx.save();
  if (game.shake > 0) {
    const sx = (Math.random() - 0.5) * game.shake;
    const sy = (Math.random() - 0.5) * game.shake;
    ctx.translate(sx, sy);
    game.shake = Math.max(0, game.shake - dt * 40);
  }

  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(-8, -8, canvas.width + 16, canvas.height + 16);

  // grid + walls
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE, y = r * TILE;
      if (game.grid[r][c] === WALL) {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = COLORS.wallEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      } else {
        ctx.strokeStyle = COLORS.floorGrid;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  // exit portal glow
  const ex = game.exit.c * TILE + TILE / 2, ey = game.exit.r * TILE + TILE / 2;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
  ctx.save();
  ctx.shadowColor = COLORS.exit;
  ctx.shadowBlur = 14 + pulse * 10;
  ctx.fillStyle = COLORS.exit;
  ctx.beginPath();
  ctx.arc(ex, ey, TILE * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // chips
  const now = performance.now();
  for (const ch of game.chips) {
    const bob = Math.sin(now / 300 + ch.bob) * 2;
    const x = ch.c * TILE + TILE / 2, y = ch.r * TILE + TILE / 2 + bob;
    ctx.save();
    ctx.shadowColor = COLORS.chip;
    ctx.shadowBlur = 10;
    ctx.fillStyle = COLORS.chip;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x + 8, y);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x - 8, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // enemies
  for (const e of game.enemies) {
    const x = e.drawC * TILE + TILE / 2, y = e.drawR * TILE + TILE / 2;
    const color = e.type === "chase" ? COLORS.enemyChase : COLORS.enemyPatrol;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, TILE * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // little "virus spikes"
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + now / 400;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * TILE * 0.3, y + Math.sin(a) * TILE * 0.3);
      ctx.lineTo(x + Math.cos(a) * TILE * 0.42, y + Math.sin(a) * TILE * 0.42);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // player
  {
    const x = game.player.drawC * TILE + TILE / 2, y = game.player.drawR * TILE + TILE / 2;
    ctx.save();
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 16;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(x, y, TILE * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#06121a";
    ctx.beginPath();
    ctx.arc(x, y, TILE * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // particles
  game.particles = game.particles.filter(p => p.life > 0);
  for (const p of game.particles) {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.94; p.vy *= 0.94;
    p.life -= dt * 1.6;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // damage flash
  if (game.flash > 0) {
    ctx.save();
    ctx.globalAlpha = game.flash * 0.35;
    ctx.fillStyle = COLORS.enemyChase;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    game.flash = Math.max(0, game.flash - dt * 3);
  }
}

function updateHUD() {
  document.getElementById("statLevel").textContent = game.level;
  document.getElementById("statHp").textContent = Math.max(0, game.hp);
  document.getElementById("statScore").textContent = game.score;
  document.getElementById("statCombo").textContent = "x" + game.combo;
  document.getElementById("hpFill").style.width = Math.max(0, game.hp) + "%";
  document.getElementById("logText").textContent = game.message;

  const overlay = document.getElementById("overlay");
  if (game.gameOver) {
    overlay.classList.remove("hidden");
    document.getElementById("overlayTitle").textContent = "SYSTEM CRASHED";
    document.getElementById("overlaySub").textContent = "HP reached zero. Connection terminated.";
    document.getElementById("overlayScore").textContent = game.score;
  } else {
    overlay.classList.add("hidden");
  }
}

function loop(t) {
  const dt = Math.min(0.05, (t - lastTime) / 1000);
  lastTime = t;
  if (!game.paused) draw(dt);
  updateHUD();
  requestAnimationFrame(loop);
}

// ---------- Input ----------
const keyMap = {
  w: [-1, 0], arrowup: [-1, 0],
  s: [1, 0], arrowdown: [1, 0],
  a: [0, -1], arrowleft: [0, -1],
  d: [0, 1], arrowright: [0, 1],
};

function togglePause() {
  if (game.gameOver) return;
  game.paused = !game.paused;
  document.getElementById("pauseOverlay").classList.toggle("hidden", !game.paused);
}

window.addEventListener("keydown", (ev) => {
  const key = ev.key.toLowerCase();
  if (key === "p") { togglePause(); return; }
  if (game.paused || game.gameOver) return;
  const dir = keyMap[key];
  if (dir) {
    ev.preventDefault();
    game.movePlayer(dir[0], dir[1]);
  }
});

document.querySelectorAll(".dbtn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (game.paused || game.gameOver) return;
    const dirs = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
    const d = dirs[btn.dataset.dir];
    game.movePlayer(d[0], d[1]);
  });
});

document.getElementById("pauseBtn").addEventListener("click", togglePause);
document.getElementById("resumeBtn").addEventListener("click", togglePause);

document.getElementById("soundBtn").addEventListener("click", (ev) => {
  const on = SFX.toggle();
  ev.target.textContent = "SOUND: " + (on ? "ON" : "OFF");
});

document.getElementById("overlayBtn").addEventListener("click", () => {
  game = new CyberCrawler();
});

// ---------- Boot sequence ----------
const bootLines = [
  "INITIALIZING CYBERCRAWLER v2.0 ...",
  "ESTABLISHING UPLINK TO MAINFRAME ...",
  "LOADING FIREWALL MAP ...",
  "SEEDING DATA CHIPS ...",
  "DEPLOYING VIRUS COUNTERMEASURES ...",
  "UPLINK STABLE. GOOD LUCK, RUNNER.",
];

async function runBoot() {
  const el = document.getElementById("bootText");
  const bar = document.getElementById("bootBar");
  let text = "";
  for (let i = 0; i < bootLines.length; i++) {
    const line = bootLines[i];
    for (let j = 0; j < line.length; j++) {
      text += line[j];
      el.textContent = text;
      await new Promise(r => setTimeout(r, 8));
    }
    text += "\n";
    el.textContent = text;
    bar.style.width = `${((i + 1) / bootLines.length) * 100}%`;
    await new Promise(r => setTimeout(r, 140));
  }
  await new Promise(r => setTimeout(r, 300));
  document.getElementById("boot").classList.add("hidden");
  document.getElementById("shell").classList.remove("hidden");
  requestAnimationFrame(loop);
}

runBoot();
