const screens = {
  start: document.getElementById("start-screen"),
  play: document.getElementById("play-screen"),
  result: document.getElementById("result-screen"),
  ranking: document.getElementById("ranking-screen"),
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
const playerNameInput = document.getElementById("player-name");
const bestScore = document.getElementById("best-score");
const recordMessage = document.getElementById("record-message");
const rankingRows = document.getElementById("ranking-rows");
const scoreStore = new ScoreStore();
let currentPlayerName = "プレイヤー";
let lastRecordId = null;
let rankingReturnScreen = "start";
playerNameInput.value = scoreStore.playerName;

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const GAME_DURATION = 45;
const spawnIntervalMs = 800;
const RAINBOW_DURATION = 5;
const COMBO_WINDOW = 1.6;
const BIRD_WARNING_MS = 1200;
const GROWTH_DURATION = 6;
const rainbowColors = ["#ff5f6d", "#ffb347", "#ffe56b", "#66d9a0", "#4a90ff", "#ac83ef"];

const balloonTypes = [
  { color: "#ff5f6d", points: 1, weight: 45 },
  { color: "#4a90ff", points: 2, weight: 30 },
  { color: "#ffd84d", points: 5, weight: 15 },
  { color: "#454545", points: -10, weight: 10 },
];

let score = 0;
let remainingTime = GAME_DURATION;
let balloons = [];
let birds = [];
let birdWarning = null;
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
let spawnCount = 0;

let audioCtx = null;
let audioUnlocked = false;

function setScreen(next) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[next].classList.add("active");
}

function updateBestScore() {
  scoreStore.load();
  bestScore.textContent = scoreStore.records.length ? `ベストスコア：${scoreStore.records[0].score}てん` : "めざせ！ はじめての きろく";
}

function showRanking(from) {
  rankingReturnScreen = from;
  const records = scoreStore.load();
  rankingRows.replaceChildren();
  for (const record of records) {
    const row = document.createElement("tr");
    if (record.id === lastRecordId) row.classList.add("latest-record");
    const rank = document.createElement("td");
    rank.textContent = `${records.filter(other => other.score > record.score).length + 1}い`;
    const name = document.createElement("td");
    const label = document.createElement("span");
    label.textContent = `${record.name}${record.id === lastRecordId ? "（こんかい）" : ""}`;
    const date = document.createElement("time");
    date.dateTime = record.playedAt;
    date.textContent = new Date(record.playedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    name.append(label, date);
    const points = document.createElement("td");
    points.textContent = `${record.score}てん`;
    row.append(rank, name, points);
    rankingRows.append(row);
  }
  document.getElementById("ranking-empty").hidden = records.length > 0;
  document.getElementById("ranking-table-wrap").hidden = records.length === 0;
  document.getElementById("ranking-scope").textContent = "この たんまつ・ブラウザの ランキングだよ。ほかの たんまつとは きょうゆうされないよ。";
  document.getElementById("ranking-storage-message").textContent = scoreStore.persistent
    ? "きろくは このブラウザに ほぞん。ブラウザのデータを けすと きろくも きえるよ。"
    : "このブラウザでは ほぞんできません。ページを とじると きろくが きえることが あります。";
  setScreen("ranking");
  document.getElementById("ranking-title").focus();
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
  const radius = Math.min(kind === "giant" ? 44 : 22 + Math.random() * 8, canvas.clientWidth * 0.15);
  // Alternate lower and side entrances so the middle is used in every game.
  const fromSide = spawnCount % 2 === 0;
  spawnCount += 1;
  const direction = Math.random() < 0.5 ? 1 : -1;
  const x = fromSide ? (direction === 1 ? -radius - 8 : canvas.clientWidth + radius + 8)
    : radius + Math.random() * (canvas.clientWidth - radius * 2);
  const y = fromSide ? canvas.clientHeight * (0.32 + Math.random() * 0.36)
    : canvas.clientHeight + radius + Math.random() * 40;
  const speed = fromSide ? 14 + Math.random() * 12 : kind === "giant" ? 25 : 22 + Math.random() * 20;

  balloons.push({
    x,
    y,
    radius,
    baseRadius: radius,
    age: 0,
    growthFlash: 0,
    entered: false,
    fromSide,
    velocityX: fromSide ? direction * Math.max(36, Math.min(90, canvas.clientWidth * 0.12)) : 0,
    speed,
    swaySeed: Math.random() * Math.PI * 2,
    color: kind === "giant" ? "#ff98c8" : type.color,
    points: kind === "giant" ? 8 : kind === "rainbow" ? 3 : type.points,
    kind,
    hitsRemaining: kind === "giant" ? 3 : 1,
    wobble: 0,
  });
}

function createBird(leadTimeSec = 0) {
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
    y = target.y - target.speed * (travelTime + leadTimeSec);
  }

  return {
    x,
    y: Math.max(45, Math.min(canvas.clientHeight - 45, y)),
    direction,
    speed,
    wingPhase: Math.random() * Math.PI * 2,
    fleeing: false,
  };
}

function spawnBird() {
  birds.push(birdWarning ? birdWarning.bird : createBird());
  birdWarning = null;
}

function addFloatingText(x, y, text, color = "#24485c") {
  floatingTexts.push({ x, y, text, color, life: 1 });
}

function updateStatus() {
  const effects = [];
  if (gameElapsed < rainbowUntil) effects.push(`にじいろ ×2！ あと${Math.ceil(rainbowUntil - gameElapsed)}びょう`);
  if (gameElapsed < windUntil) effects.push(windSpeed > 0 ? "かぜ →" : "← かぜ");
  const effectText = effects.join("　") || "そだてて ×4！ とりには きをつけよう！";
  const comboText = combo > 1 ? `${combo}れんぞく！` : "つづけて タップ！";
  if (effectStatus.textContent !== effectText) effectStatus.textContent = effectText;
  if (comboStatus.textContent !== comboText) comboStatus.textContent = comboText;
}

function growthMultiplier(balloon) {
  return 1 + Math.floor(Math.min(balloon.age || 0, GROWTH_DURATION) / 2);
}

function balloonPoints(balloon) {
  const rainbow = gameElapsed < rainbowUntil || balloon.kind === "rainbow";
  if (balloon.points < 0 && !rainbow) return balloon.points * growthMultiplier(balloon);
  return Math.max(1, balloon.points) * growthMultiplier(balloon) * (rainbow ? 2 : 1);
}

function popBalloon(index, awardPoints = true) {
  const balloon = balloons[index];
  const rainbow = gameElapsed < rainbowUntil || balloon.kind === "rainbow";
  const points = balloonPoints(balloon);
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
  if (balloon.kind === "giant" || rainbow || (points > 0 && growthMultiplier(balloon) === 4)) createConfetti(balloon.x, balloon.y);
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
    const previousLevel = growthMultiplier(balloon);
    balloon.baseRadius ??= balloon.radius;
    if (balloon.entered) balloon.age = Math.min(GROWTH_DURATION, (balloon.age || 0) + deltaSec);
    const growth = (balloon.age || 0) / GROWTH_DURATION;
    balloon.radius = balloon.baseRadius * (1 + 1.1 * growth);
    balloon.growthFlash = Math.max(0, (balloon.growthFlash || 0) - deltaSec);
    if (growthMultiplier(balloon) > previousLevel) {
      balloon.growthFlash = 0.6;
      if (balloonPoints(balloon) > 0) {
        addFloatingText(balloon.x, balloon.y - balloon.radius * 1.2,
          growthMultiplier(balloon) === 4 ? "×4 MAX！" : `×${growthMultiplier(balloon)}に そだった！`, "#905510");
      }
    }
    balloon.y -= balloon.speed * deltaSec;
    balloon.x += ((balloon.velocityX || 0) + Math.sin(gameElapsed * 2 + balloon.swaySeed) * 15 +
      (balloon.entered || !balloon.fromSide ? wind : 0)) * deltaSec;
    if (balloon.entered || !balloon.fromSide) {
      const left = balloon.radius;
      const right = canvas.clientWidth - balloon.radius;
      if (balloon.x < left || balloon.x > right) {
        if (balloon.velocityX) balloon.velocityX = Math.abs(balloon.velocityX) * (balloon.x < left ? 1 : -1);
        balloon.x = Math.max(left, Math.min(right, balloon.x));
      }
    }
    if (!balloon.entered && balloon.x >= balloon.radius && balloon.x <= canvas.clientWidth - balloon.radius &&
      balloon.y + balloon.radius <= canvas.clientHeight) balloon.entered = true;
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
  const multiplier = growthMultiplier(balloon);
  const points = balloonPoints(balloon);
  const pulse = Math.sin(gameElapsed * 5 + balloon.swaySeed) * 0.5 + 0.5;

  if (balloon.fromSide && (balloon.age || 0) < 1.2) {
    ctx.strokeStyle = "#ffffffb0";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      const behind = balloon.x - Math.sign(balloon.velocityX) * (balloon.radius + 12 + i * 12);
      ctx.beginPath();
      ctx.moveTo(behind, balloon.y + 12 + i * 8);
      ctx.lineTo(behind - Math.sign(balloon.velocityX) * 14, balloon.y + 18 + i * 8);
      ctx.stroke();
    }
  }

  if (multiplier > 1) {
    ctx.shadowColor = points < 0 ? "#d95079" : "#ffca38";
    ctx.shadowBlur = 6 + multiplier * 4 + pulse * 5;
  }

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
  ctx.shadowBlur = 0;

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
  // The live score uses the exact same calculation as popping the balloon.
  const scoreText = `${points > 0 ? "+" : ""}${points}`;
  ctx.font = `bold ${multiplier === 4 ? 20 : 17}px sans-serif`;
  const badgeWidth = Math.max(23, ctx.measureText(scoreText).width / 2 + 9);
  const badgeY = balloon.y + (balloon.kind === "normal" ? 0 : balloon.radius * 0.32);
  ctx.fillStyle = points < 0 ? "#ffe1eaf2" : "#fffffff2";
  ctx.beginPath();
  ctx.ellipse(balloon.x, badgeY, badgeWidth, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = points > 0 ? "#8f2852" : "#962848";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(scoreText, balloon.x, badgeY);
  if (balloon.kind === "giant" || balloon.kind === "rainbow") {
    ctx.fillStyle = "#24485c";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(balloon.kind === "giant" ? `あと${balloon.hitsRemaining}` : "★", balloon.x, balloon.y - balloon.radius * 0.32);
  }
  drawGrowthEffect(balloon, multiplier, pulse);
  ctx.restore();
}

function drawGrowthEffect(balloon, multiplier, pulse) {
  const r = balloon.radius;
  const progress = Math.min(1, (balloon.age || 0) / GROWTH_DURATION);
  const penalty = balloonPoints(balloon) < 0;
  ctx.strokeStyle = "#ffffff88";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(balloon.x, balloon.y, r * 1.08, r * 1.23, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = penalty ? "#ef87a3" : multiplier === 4 ? "#ffe168" : "#fff8b0";
  ctx.lineWidth = multiplier === 4 ? 4 : 3;
  ctx.beginPath();
  ctx.ellipse(balloon.x, balloon.y, r * 1.08, r * 1.23, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();
  if (multiplier > 1) {
    ctx.fillStyle = "#fff9c7";
    for (let i = 0; !penalty && i < multiplier * 2; i += 1) {
      const angle = gameElapsed * 0.8 + i * Math.PI / multiplier;
      const x = balloon.x + Math.cos(angle) * r * (1.2 + pulse * 0.08);
      const y = balloon.y + Math.sin(angle) * r * 1.36;
      const size = 2 + pulse * 2;
      ctx.fillRect(x - size, y - 1, size * 2, 2);
      ctx.fillRect(x - 1, y - size, 2, size * 2);
    }
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = penalty ? "#ffe1ea" : "#fff8b0";
    ctx.strokeStyle = penalty ? "#7c2945" : "#744516";
    ctx.lineWidth = 3;
    const text = multiplier === 4 ? "×4 MAX" : `×${multiplier}`;
    const y = balloon.y - r * 1.3 - 8;
    ctx.strokeText(text, balloon.x, y);
    ctx.fillText(text, balloon.x, y);
  }
  if (balloon.growthFlash > 0) {
    ctx.globalAlpha = balloon.growthFlash / 0.6;
    ctx.strokeStyle = penalty ? "#ef87a3" : "#fff7a0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(balloon.x, balloon.y, r * (1.2 + (0.6 - balloon.growthFlash)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
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
  drawBirdWarning();
}

function drawBirdWarning() {
  if (!birdWarning) return;
  const bird = birdWarning.bird;
  const progress = Math.max(0, Math.min(1, (lastFrame - birdWarning.spawnAt + BIRD_WARNING_MS) / BIRD_WARNING_MS));
  ctx.save();
  for (let i = 0; i < 3; i += 1) {
    const flutter = Math.sin(progress * 7 + i * 2);
    const distance = 8 + progress * (52 + i * 13);
    const x = bird.direction === 1 ? distance : canvas.clientWidth - distance;
    const y = bird.y - 24 + i * 19 + progress * 30 + flutter * 7;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bird.direction * (-0.55 + flutter * 0.45));
    ctx.scale(0.55 + i * 0.08, 0.55 + i * 0.08);
    ctx.globalAlpha = Math.min(0.9, progress * 5 + 0.15) * Math.min(1, (1 - progress) * 5);
    ctx.fillStyle = "#fff0d6";
    ctx.strokeStyle = "#967c5d";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.bezierCurveTo(12, -7, 8, 8, 0, 15);
    ctx.bezierCurveTo(-8, 8, -7, -7, 0, -14);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(0, 19);
    for (let j = -7; j <= 8; j += 5) {
      ctx.moveTo(0, j + 3);
      ctx.lineTo(5, j - 2);
      ctx.moveTo(0, j + 3);
      ctx.lineTo(-4, j - 1);
    }
    ctx.stroke();
    ctx.restore();
  }
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

  if (!birdWarning && timestamp >= nextBirdSpawn - BIRD_WARNING_MS) {
    birdWarning = { bird: createBird(BIRD_WARNING_MS / 1000), spawnAt: timestamp + BIRD_WARNING_MS };
  }
  if (birdWarning && timestamp >= birdWarning.spawnAt) {
    spawnBird();
    nextBirdSpawn = timestamp + 3000 + Math.random() * 2000;
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
  currentPlayerName = scoreStore.setPlayerName(playerNameInput.value);
  playerNameInput.value = currentPlayerName;
  unlockAudio();
  score = 0;
  remainingTime = GAME_DURATION;
  balloons = [];
  birds = [];
  birdWarning = null;
  particles = [];
  floatingTexts = [];
  gameElapsed = 0;
  spawnCount = 0;
  rainbowUntil = 0;
  combo = 0;
  comboUntil = 0;
  windUntil = 0;
  windSpeed = 0;
  nextRainbowSpawn = 3 + Math.random();
  nextGiantSpawn = 6 + Math.random() * 2;
  nextWind = 5 + Math.random() * 2;
  lastSpawn = 0;
  nextBirdSpawn = performance.now() + 3000 + Math.random() * 1500;
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

  const saved = scoreStore.addScore(score, currentPlayerName);
  lastRecordId = saved.record.id;
  recordMessage.textContent = saved.listed ? `${saved.rank}いに ランクイン！` : "こんかいは ランクインならず。ベスト20を めざそう！";
  if (!saved.persistent) recordMessage.textContent += " このブラウザでは ほぞんできないため、いまだけの きろくだよ。";
  updateBestScore();

  setScreen("result");
}

startButton.addEventListener("click", startGame);
retryButton.addEventListener("click", startGame);
playerNameInput.addEventListener("input", () => {
  playerNameInput.value = Array.from(playerNameInput.value).slice(0, 12).join("");
});
document.getElementById("start-ranking-button").addEventListener("click", () => showRanking("start"));
document.getElementById("result-ranking-button").addEventListener("click", () => showRanking("result"));
document.getElementById("ranking-back-button").addEventListener("click", () => {
  setScreen(rankingReturnScreen);
  document.getElementById(rankingReturnScreen === "start" ? "start-ranking-button" : "result-ranking-button").focus();
});
document.getElementById("result-home-button").addEventListener("click", () => { updateBestScore(); setScreen("start"); startButton.focus(); });
updateBestScore();
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
