const screens = {
  start: document.getElementById("start-screen"),
  play: document.getElementById("play-screen"),
  result: document.getElementById("result-screen"),
};

const startButton = document.getElementById("start-button");
const retryButton = document.getElementById("retry-button");
const soundCheckbox = document.getElementById("sound-checkbox");

const timeValue = document.getElementById("time-value");
const scoreValue = document.getElementById("score-value");
const finalScore = document.getElementById("final-score");
const resultMessage = document.getElementById("result-message");

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const GAME_DURATION = 30;
const spawnIntervalMs = 800;

const balloonTypes = [
  { color: "#ff5f6d", points: 1, weight: 45 },
  { color: "#4a90ff", points: 2, weight: 30 },
  { color: "#ffd84d", points: 5, weight: 15 },
  { color: "#454545", points: -1, weight: 10 },
];

let score = 0;
let remainingTime = GAME_DURATION;
let balloons = [];
let particles = [];
let lastSpawn = 0;
let lastFrame = 0;
let timerId = null;
let animationId = null;
let running = false;

let audioCtx = null;
let audioUnlocked = false;

function setScreen(next) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[next].classList.add("active");
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function weightedType() {
  const total = balloonTypes.reduce((sum, type) => sum + type.weight, 0);
  let random = Math.random() * total;
  for (const type of balloonTypes) {
    random -= type.weight;
    if (random <= 0) return type;
  }
  return balloonTypes[0];
}

function spawnBalloon() {
  const type = weightedType();
  const radius = 22 + Math.random() * 12;
  const x = radius + Math.random() * (canvas.clientWidth - radius * 2);
  const y = canvas.clientHeight + radius + Math.random() * 40;
  const speed = 22 + Math.random() * 20;

  balloons.push({
    x,
    y,
    radius,
    speed,
    swaySeed: Math.random() * Math.PI * 2,
    color: type.color,
    points: type.points,
  });
}

function update(deltaSec) {
  balloons.forEach((balloon) => {
    balloon.y -= balloon.speed * deltaSec;
    balloon.x += Math.sin((performance.now() / 1000) * 2 + balloon.swaySeed) * 0.25;
  });
  balloons = balloons.filter((balloon) => balloon.y + balloon.radius > -20);

  particles.forEach((p) => {
    p.life -= deltaSec;
    p.x += p.vx * deltaSec;
    p.y += p.vy * deltaSec;
    p.vy += 90 * deltaSec;
  });
  particles = particles.filter((p) => p.life > 0);
}

function drawBackgroundDecor() {
  for (let i = 0; i < 5; i += 1) {
    const x = ((i + 1) * canvas.clientWidth) / 6;
    const y = 24 + (i % 2) * 10;
    ctx.fillStyle = "#ffffff99";
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.arc(x + 12, y + 2, 14, 0, Math.PI * 2);
    ctx.arc(x - 12, y + 2, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBalloon(balloon) {
  const shineX = balloon.x - balloon.radius * 0.35;
  const shineY = balloon.y - balloon.radius * 0.35;

  ctx.fillStyle = balloon.color;
  ctx.beginPath();
  ctx.ellipse(balloon.x, balloon.y, balloon.radius * 0.95, balloon.radius * 1.12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffffaa";
  ctx.beginPath();
  ctx.ellipse(shineX, shineY, balloon.radius * 0.22, balloon.radius * 0.33, 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ffffffb0";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(balloon.x, balloon.y + balloon.radius * 1.1);
  ctx.bezierCurveTo(
    balloon.x - 6,
    balloon.y + balloon.radius * 1.5,
    balloon.x + 6,
    balloon.y + balloon.radius * 1.8,
    balloon.x,
    balloon.y + balloon.radius * 2.2
  );
  ctx.stroke();
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / 0.45);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawBackgroundDecor();
  balloons.forEach(drawBalloon);
  drawParticles();
}

function gameLoop(timestamp) {
  if (!running) return;

  if (!lastFrame) lastFrame = timestamp;
  const deltaMs = timestamp - lastFrame;
  const deltaSec = deltaMs / 1000;
  lastFrame = timestamp;

  if (timestamp - lastSpawn > spawnIntervalMs) {
    spawnBalloon();
    lastSpawn = timestamp;
  }

  update(deltaSec);
  draw();

  animationId = requestAnimationFrame(gameLoop);
}

function playPopSound(points) {
  if (!soundCheckbox.checked || !audioUnlocked || !audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  const baseFreq = points > 0 ? 520 + points * 80 : 220;
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.55, now + 0.1);
  osc.type = points > 0 ? "triangle" : "square";

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.15);
}

function createPopParticles(x, y, color) {
  for (let i = 0; i < 14; i += 1) {
    const angle = (Math.PI * 2 * i) / 14;
    const speed = 70 + Math.random() * 60;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.45,
      size: 2 + Math.random() * 2,
      color,
    });
  }
}

function handlePointerDown(event) {
  event.preventDefault();

  if (!audioUnlocked) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioUnlocked = true;
  }

  if (!running) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  for (let i = balloons.length - 1; i >= 0; i -= 1) {
    const b = balloons[i];
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy <= b.radius * b.radius) {
      score += b.points;
      scoreValue.textContent = String(score);
      createPopParticles(b.x, b.y, b.color);
      playPopSound(b.points);
      balloons.splice(i, 1);
      break;
    }
  }
}

function tickTime() {
  remainingTime -= 1;
  timeValue.textContent = String(remainingTime);
  if (remainingTime <= 0) {
    endGame();
  }
}

function startGame() {
  score = 0;
  remainingTime = GAME_DURATION;
  balloons = [];
  particles = [];
  lastSpawn = 0;
  lastFrame = 0;
  scoreValue.textContent = "0";
  timeValue.textContent = String(GAME_DURATION);

  setScreen("play");
  resizeCanvas();

  running = true;
  timerId = setInterval(tickTime, 1000);
  animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
  if (!running) return;

  running = false;
  clearInterval(timerId);
  cancelAnimationFrame(animationId);

  finalScore.textContent = String(score);
  resultMessage.textContent =
    score >= 40 ? "すごい！ふうせんマスター！" : score >= 20 ? "じょうずにできたね！" : "またチャレンジしてみよう！";

  setScreen("result");
}

startButton.addEventListener("click", startGame);
retryButton.addEventListener("click", startGame);
canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
window.addEventListener("resize", () => {
  if (screens.play.classList.contains("active")) {
    resizeCanvas();
  }
});

document.body.addEventListener(
  "touchmove",
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);
