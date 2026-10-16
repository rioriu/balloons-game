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
const effectStatus = document.getElementById("effect-status");
const comboStatus = document.getElementById("combo-status");

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const GAME_DURATION = 30;
const spawnIntervalMs = 800;
const RAINBOW_DURATION = 5;
const COMBO_WINDOW = 1.6;
const rainbowColors = ["#ff5f6d", "#ffb347", "#ffe56b", "#66d9a0", "#4a90ff", "#ac83ef"];

const balloonTypes = [
  { color: "#ff5f6d", points: 1, weight: 45 },
  { color: "#4a90ff", points: 2, weight: 30 },
  { color: "#ffd84d", points: 5, weight: 15 },
  { color: "#454545", points: -1, weight: 10 },
];

let score = 0;
let remainingTime = GAME_DURATION;
let balloons = [];
let birds = [];
let particles = [];
let lastSpawn = 0;
let nextBirdSpawn = 0;
let lastFrame = 0;
let timerId = null;
let animationId = null;
let running = false;
let gameElapsed = 0;
let rainbowUntil = 0;
let combo = 0;
let comboUntil = 0;
let nextRainbowSpawn = 0;
let nextGiantSpawn = 0;
let nextWind = 0;
let windUntil = 0;
let windSpeed = 0;
let floatingTexts = [];

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

function spawnBalloon(kind = "normal") {
  const type = weightedType();
  const radius = kind === "giant" ? 48 : 22 + Math.random() * 12;
  const x = radius + Math.random() * (canvas.clientWidth - radius * 2);
  const y = canvas.clientHeight + radius + Math.random() * 40;
  const speed = kind === "giant" ? 25 : 22 + Math.random() * 20;

  balloons.push({
    x,
    y,
    radius,
    speed,
    swaySeed: Math.random() * Math.PI * 2,
    color: kind === "giant" ? "#ff98c8" : type.color,
    points: kind === "giant" ? 8 : kind === "rainbow" ? 3 : type.points,
    kind,
    hitsRemaining: kind === "giant" ? 3 : 1,
    wobble: 0,
  });
}

function spawnBird() {
  const direction = Math.random() < 0.5 ? 1 : -1;
  const speed = Math.max(150, canvas.clientWidth / (3.5 + Math.random()));
  const x = direction === 1 ? -45 : canvas.clientWidth + 45;
  const visibleBalloons = balloons.filter((balloon) =>
    balloon.y > balloon.radius + 40 && balloon.y < canvas.clientHeight - balloon.radius
  );
  let y = canvas.clientHeight * (0.2 + Math.random() * 0.6);

  // Aim near a balloon's future position so birds can reach the rising balloons.
  if (visibleBalloons.length > 0) {
    const target = visibleBalloons[Math.floor(Math.random() * visibleBalloons.length)];
    const travelTime = Math.abs(target.x - x) / speed;
    y = target.y - target.speed * travelTime;
  }

  birds.push({
    x,
    y: Math.max(45, Math.min(canvas.clientHeight - 45, y)),
    direction,
    speed,
    wingPhase: Math.random() * Math.PI * 2,
    fleeing: false,
  });
}

function addFloatingText(x, y, text, color = "#24485c") {
  floatingTexts.push({ x, y, text, color, life: 1 });
}

function updateStatus() {
  const effects = [];
  if (gameElapsed < rainbowUntil) effects.push(`にじいろ ×2！ あと${Math.ceil(rainbowUntil - gameElapsed)}びょう`);
  if (gameElapsed < windUntil) effects.push(windSpeed > 0 ? "かぜ →" : "← かぜ");
  const effectText = effects.join("　") || "とりを タップして おいはらおう！";
  const comboText = combo > 1 ? `${combo}れんぞく！` : "つづけて タップ！";
  if (effectStatus.textContent !== effectText) effectStatus.textContent = effectText;
  if (comboStatus.textContent !== comboText) comboStatus.textContent = comboText;
}

function popBalloon(index, awardPoints = true) {
  const balloon = balloons[index];
  const rainbow = gameElapsed < rainbowUntil || balloon.kind === "rainbow";
  const points = rainbow ? Math.max(1, balloon.points) * 2 : balloon.points;
  if (awardPoints) {
    let bonus = 0;
    if (points > 0) {
      combo = gameElapsed <= comboUntil ? combo + 1 : 1;
      comboUntil = gameElapsed + COMBO_WINDOW;
      bonus = combo % 3 === 0 ? 2 : 0;
    } else {
      combo = 0;
    }
    score += points + bonus;
    scoreValue.textContent = String(score);
    addFloatingText(balloon.x, balloon.y, `${points > 0 ? "+" : ""}${points}${bonus ? " ＋2ボーナス！" : ""}`,
      points > 0 ? "#9a285b" : "#24485c");
    if (balloon.kind === "rainbow") {
      rainbowUntil = gameElapsed + RAINBOW_DURATION;
      addFloatingText(canvas.clientWidth / 2, canvas.clientHeight * 0.3, "にじいろタイム！", "#713ab0");
    }
  }
  createPopParticles(balloon.x, balloon.y, balloon.color);
  if (balloon.kind === "giant" || rainbow) createConfetti(balloon.x, balloon.y);
  playPopSound(awardPoints ? points : 0);
  balloons.splice(index, 1);
  updateStatus();
}

function birdHitsBalloon(bird, previousX, balloon) {
  // Sweep the bird's body across the frame to catch contacts between positions.
  const nearestX = Math.max(Math.min(previousX, bird.x),
    Math.min(balloon.x, Math.max(previousX, bird.x)));
  const dx = (balloon.x - nearestX) / (balloon.radius * 0.95 + 25);
  const dy = (balloon.y - bird.y) / (balloon.radius * 1.12 + 14);
  return dx * dx + dy * dy <= 1;
}

function update(deltaSec) {
  gameElapsed += deltaSec;
  if (combo > 0 && gameElapsed > comboUntil) combo = 0;
  const wind = gameElapsed < windUntil ? windSpeed : 0;
  balloons.forEach((balloon) => {
    balloon.y -= balloon.speed * deltaSec;
    balloon.x += (Math.sin(gameElapsed * 2 + balloon.swaySeed) * 15 + wind) * deltaSec;
    balloon.x = Math.max(balloon.radius, Math.min(canvas.clientWidth - balloon.radius, balloon.x));
    balloon.wobble = Math.max(0, balloon.wobble - deltaSec);
  });
  balloons = balloons.filter((balloon) => balloon.y + balloon.radius > -20);

  birds.forEach((bird) => {
    const previousX = bird.x;
    bird.x += bird.direction * bird.speed * deltaSec;
    bird.wingPhase += deltaSec * 16;
    if (bird.fleeing) {
      bird.y -= 170 * deltaSec;
      return;
    }
    for (let i = balloons.length - 1; i >= 0; i -= 1) {
      if (birdHitsBalloon(bird, previousX, balloons[i])) {
        popBalloon(i, false);
      }
    }
  });
  birds = birds.filter((bird) => bird.x > -60 && bird.x < canvas.clientWidth + 60 && bird.y > -60);

  particles.forEach((p) => {
    p.life -= deltaSec;
    p.x += p.vx * deltaSec;
    p.y += p.vy * deltaSec;
    p.vy += 90 * deltaSec;
  });
  particles = particles.filter((p) => p.life > 0);
  floatingTexts.forEach((text) => {
    text.life -= deltaSec;
    text.y -= 32 * deltaSec;
  });
  floatingTexts = floatingTexts.filter((text) => text.life > 0);
  updateStatus();
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
  ctx.save();
  if (balloon.wobble > 0) ctx.translate(Math.sin(balloon.wobble * 70) * 4, 0);
  const shineX = balloon.x - balloon.radius * 0.35;
  const shineY = balloon.y - balloon.radius * 0.35;

  ctx.fillStyle = balloon.color;
  if (balloon.kind === "rainbow" || gameElapsed < rainbowUntil) {
    const gradient = ctx.createLinearGradient(balloon.x - balloon.radius, balloon.y - balloon.radius,
      balloon.x + balloon.radius, balloon.y + balloon.radius);
    rainbowColors.forEach((color, i) => gradient.addColorStop(i / (rainbowColors.length - 1), color));
    ctx.fillStyle = gradient;
  }
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
  if (balloon.kind === "giant" || balloon.kind === "rainbow") {
    ctx.fillStyle = "#24485c";
    ctx.font = `bold ${balloon.kind === "giant" ? 22 : 20}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(balloon.kind === "giant" ? String(balloon.hitsRemaining) : "★", balloon.x, balloon.y);
  }
  ctx.restore();
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.min(1, Math.max(0, p.life / 0.45));
    ctx.fillStyle = p.color;
    if (p.confetti) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * p.spin);
      ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}

function drawBird(bird) {
  const wingLift = Math.sin(bird.wingPhase) * 17;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.scale(bird.direction, 1);
  if (bird.fleeing) ctx.rotate(-0.35);

  // Tail, round body, and a flapping wing, all drawn without image assets.
  ctx.fillStyle = "#805747";
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(-32, -10);
  ctx.lineTo(-28, 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ba815a";
  ctx.beginPath();
  ctx.ellipse(-2, 2, 20, 13, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe1ad";
  ctx.beginPath();
  ctx.ellipse(2, 7, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#805747";
  ctx.beginPath();
  ctx.moveTo(3, 0);
  ctx.quadraticCurveTo(-9, -15 + wingLift, -23, -10 + wingLift);
  ctx.quadraticCurveTo(-15, 13, 3, 0);
  ctx.fill();

  ctx.fillStyle = "#ba815a";
  ctx.beginPath();
  ctx.arc(15, -7, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f5aa37";
  ctx.beginPath();
  ctx.moveTo(23, -10);
  ctx.lineTo(34, -5);
  ctx.lineTo(23, -2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#263643";
  ctx.beginPath();
  ctx.arc(18, -9, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(18.6, -9.8, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawBackgroundDecor();
  balloons.forEach(drawBalloon);
  birds.forEach(drawBird);
  drawParticles();
  drawWind();
  ctx.save();
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  floatingTexts.forEach((text) => {
    ctx.globalAlpha = Math.min(1, text.life * 2);
    ctx.fillStyle = text.color;
    const halfWidth = ctx.measureText(text.text).width / 2 + 6;
    const x = Math.max(halfWidth, Math.min(canvas.clientWidth - halfWidth, text.x));
    ctx.fillText(text.text, x, text.y);
  });
  ctx.restore();
}

function drawWind() {
  if (gameElapsed >= windUntil) return;
  ctx.save();
  ctx.strokeStyle = "#ffffffb0";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i += 1) {
    const width = canvas.clientWidth + 100;
    const x = (((gameElapsed * windSpeed * 3 + i * 137) % width) + width) % width - 50;
    const y = canvas.clientHeight * ((i + 0.5) / 8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sign(windSpeed) * 45, y);
    ctx.stroke();
  }
  ctx.restore();
}

function gameLoop(timestamp) {
  if (!running) return;

  if (!lastFrame) lastFrame = timestamp;
  const deltaMs = timestamp - lastFrame;
  const deltaSec = Math.min(deltaMs / 1000, 0.05);
  lastFrame = timestamp;

  if (timestamp - lastSpawn > spawnIntervalMs) {
    spawnBalloon();
    lastSpawn = timestamp;
  }

  if (timestamp >= nextBirdSpawn) {
    spawnBird();
    nextBirdSpawn = timestamp + 4000 + Math.random() * 3000;
  }

  update(deltaSec);
  if (gameElapsed >= nextRainbowSpawn) {
    spawnBalloon("rainbow");
    nextRainbowSpawn = gameElapsed + 9 + Math.random() * 3;
  }
  if (gameElapsed >= nextGiantSpawn) {
    spawnBalloon("giant");
    nextGiantSpawn = gameElapsed + 9 + Math.random() * 3;
  }
  if (gameElapsed >= nextWind) {
    windSpeed = (Math.random() < 0.5 ? -1 : 1) * (45 + Math.random() * 20);
    windUntil = gameElapsed + 3;
    nextWind = gameElapsed + 7 + Math.random() * 3;
  }
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

function createConfetti(x, y) {
  for (let i = 0; i < 38; i += 1) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * 260, vy: -80 - Math.random() * 160,
      life: 1 + Math.random() * 0.5, size: 3 + Math.random() * 3,
      color: rainbowColors[i % rainbowColors.length], confetti: true, spin: (Math.random() - 0.5) * 12 });
  }
}

function unlockAudio() {
  if (!soundCheckbox.checked) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  audioUnlocked = true;
}

function handlePointerDown(event) {
  event.preventDefault();
  if (!running) return;
  unlockAudio();

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Birds are drawn in front of balloons, so a tap scares the bird first.
  for (let i = birds.length - 1; i >= 0; i -= 1) {
    const bird = birds[i];
    if (!bird.fleeing && ((x - bird.x) / 36) ** 2 + ((y - bird.y) / 30) ** 2 <= 1) {
      bird.fleeing = true;
      bird.speed *= 2.2;
      addFloatingText(bird.x, bird.y - 24, "びっくり！");
      createPopParticles(bird.x, bird.y, "#fff");
      playPopSound(1);
      return;
    }
  }

  for (let i = balloons.length - 1; i >= 0; i -= 1) {
    const b = balloons[i];
    const dx = x - b.x;
    const dy = y - b.y;
    if ((dx / (b.radius * 0.95)) ** 2 + (dy / (b.radius * 1.12)) ** 2 <= 1) {
      if (b.hitsRemaining > 1) {
        b.hitsRemaining -= 1;
        b.wobble = 0.25;
        if (combo > 0) comboUntil = gameElapsed + COMBO_WINDOW;
        addFloatingText(b.x, b.y, `あと${b.hitsRemaining}かい！`);
        playPopSound(1);
        return;
      }
      popBalloon(i);
      return;
    }
  }
  combo = 0;
  updateStatus();
}

function tickTime() {
  remainingTime -= 1;
  timeValue.textContent = String(remainingTime);
  if (remainingTime <= 0) {
    endGame();
  }
}

function startGame() {
  if (running) return;
  unlockAudio();
  score = 0;
  remainingTime = GAME_DURATION;
  balloons = [];
  birds = [];
  particles = [];
  floatingTexts = [];
  gameElapsed = 0;
  rainbowUntil = 0;
  combo = 0;
  comboUntil = 0;
  windUntil = 0;
  windSpeed = 0;
  nextRainbowSpawn = 3 + Math.random();
  nextGiantSpawn = 6 + Math.random() * 2;
  nextWind = 5 + Math.random() * 2;
  lastSpawn = 0;
  nextBirdSpawn = performance.now() + 4000 + Math.random() * 2000;
  lastFrame = 0;
  scoreValue.textContent = "0";
  timeValue.textContent = String(GAME_DURATION);
  updateStatus();

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
    if (running) event.preventDefault();
  },
  { passive: false }
);
