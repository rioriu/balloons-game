const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");
const scoresSource = fs.readFileSync(path.join(__dirname, "../scores.js"), "utf8");

function game(width = 390, height = 650) {
  let now = 0;
  let seed = 12345;
  const math = Object.create(Math);
  math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const context = new Proxy({}, { get: (_, key) => {
    if (key === "createLinearGradient") return () => ({ addColorStop() {} });
    if (key === "measureText") return text => ({ width: text.length * 10 });
    return () => {};
  } });
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set(id === "start-screen" ? ["active"] : []);
      const children = [];
      elements.set(id, { textContent: "", value: "", children, checked: false, clientWidth: width, clientHeight: height,
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
        addEventListener() {}, focus() {}, append(...items) { children.push(...items); },
        replaceChildren(...items) { children.splice(0, children.length, ...items); }, getContext: () => context,
        getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) });
    }
    return elements.get(id);
  }
  let created = 0;
  const storage = new Map();
  const scope = vm.createContext({ document: { getElementById: element, createElement: () => element(`created-${created++}`), body: { addEventListener() {} } },
    window: { devicePixelRatio: 1, addEventListener() {}, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } }, performance: { now: () => now },
    Math: math, setInterval: () => 1, clearInterval() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
  vm.runInContext(scoresSource, scope);
  vm.runInContext(source, scope);
  const run = text => vm.runInContext(text, scope);
  run("startGame()");
  return { run, frame(time) { now = time; run("gameLoop(performance.now())"); },
    tap() { run("handlePointerDown({preventDefault() {}, clientX: 150, clientY: 200})"); },
    balloon(kind = "normal", points = 1) {
      run(`balloons = [{x:150, y:200, radius:${kind === "giant" ? 48 : 28}, speed:0, swaySeed:0,
        color:"red", points:${points}, kind:${JSON.stringify(kind)}, hitsRemaining:${kind === "giant" ? 3 : 1}, wobble:0}]`);
    } };
}

test("tapping a bird saves the balloon behind it and preserves a combo", () => {
  const g = game();
  g.balloon();
  g.run("combo = 2; comboUntil = 1; birds = [{x:150,y:200,direction:1,speed:150,wingPhase:0,fleeing:false}]");
  g.tap();
  assert.equal(g.run("birds[0].fleeing"), true);
  assert.equal(g.run("balloons.length"), 1);
  assert.equal(g.run("combo"), 2);
  g.run("update(0.05)");
  assert.equal(g.run("balloons.length"), 1);
  assert.ok(g.run("birds[0].y") < 200);
  assert.equal(g.run("score"), 0);
});

test("birds still pop balloons in both directions without points or rainbow activation", () => {
  for (const direction of [-1, 1]) {
    const g = game();
    g.balloon("rainbow", 3);
    g.run(`birds = [{x:${direction === 1 ? 100 : 200},y:200,direction:${direction},speed:1000,wingPhase:0,fleeing:false}]; update(0.1)`);
    assert.equal(g.run("balloons.length"), 0);
    assert.equal(g.run("score"), 0);
    assert.equal(g.run("rainbowUntil"), 0);
  }
});

test("rainbow doubles rewards, makes black balloons positive, and expires after five seconds", () => {
  const g = game();
  g.balloon("rainbow", 3); g.tap();
  assert.equal(g.run("rainbowUntil"), 5);
  assert.equal(g.run("score"), 6);
  g.balloon("normal", -1); g.tap();
  assert.equal(g.run("score"), 8);
  g.run("update(5.01)");
  g.balloon("normal", -1); g.tap();
  assert.equal(g.run("score"), 7);
  assert.equal(g.run("combo"), 0);
});

test("three positive pops earn a combo bonus; misses and timeout reset it", () => {
  const g = game();
  for (let i = 0; i < 3; i++) { g.balloon(); g.tap(); }
  assert.equal(g.run("score"), 5);
  assert.equal(g.run("combo"), 3);
  g.tap();
  assert.equal(g.run("combo"), 0);
  g.balloon(); g.tap(); g.run("update(1.61)");
  assert.equal(g.run("combo"), 0);
});

test("giant balloons need three taps and award points and confetti only once", () => {
  const g = game();
  g.balloon("giant", 8);
  g.tap(); g.tap();
  assert.equal(g.run("balloons[0].hitsRemaining"), 1);
  assert.equal(g.run("score"), 0);
  g.tap();
  assert.equal(g.run("balloons.length"), 0);
  assert.equal(g.run("score"), 8);
  assert.ok(g.run("particles.some(p => p.confetti)"));
  g.tap();
  assert.equal(g.run("score"), 8);
});

test("rainbow and combo bonuses also apply to giant balloons", () => {
  const g = game();
  g.run("rainbowUntil = 5; combo = 2; comboUntil = 1");
  g.balloon("giant", 8); g.tap(); g.tap(); g.tap();
  assert.equal(g.run("score"), 18);
  assert.equal(g.run("combo"), 3);
});

test("wind moves balloons in either direction, keeps them onscreen, and expires", () => {
  for (const direction of [-1, 1]) {
    const g = game();
    g.balloon(); g.run(`windUntil = 3; windSpeed = ${direction * 60}; update(0.5)`);
    assert.ok(direction * (g.run("balloons[0].x") - 150) > 20);
    g.run("balloons[0].x = 10000; update(0.1)");
    assert.ok(g.run("balloons[0].x + balloons[0].radius <= canvas.clientWidth"));
    g.run("gameElapsed = 4; balloons[0].x = 150; update(0.1)");
    assert.ok(Math.abs(g.run("balloons[0].x") - 150) <= 1.5);
  }
});

test("restart clears every effect and the 30-second timer ends the game", () => {
  const g = game();
  g.run("rainbowUntil = 99; combo = 12; windUntil = 99; windSpeed = 60; floatingTexts = [{}]; endGame(); startGame()");
  assert.equal(g.run("rainbowUntil === 0 && combo === 0 && windUntil === 0 && windSpeed === 0 && floatingTexts.length === 0 && gameElapsed === 0"), true);
  for (let i = 0; i < 30; i++) g.run("tickTime()");
  assert.equal(g.run("running"), false);
  assert.equal(g.run('screens.result.classList.contains("active")'), true);
});

test("natural 30-second games schedule all events and draw safely at mobile and desktop widths", () => {
  for (const width of [320, 390, 1280]) {
    const g = game(width);
    g.run('let kinds = []; const originalSpawn = spawnBalloon; spawnBalloon = (kind = "normal") => { kinds.push(kind); originalSpawn(kind); }; let gusts = 0; let previousWind = 0;');
    for (let time = 16; time < 30000; time += 16) {
      g.frame(time);
      g.run("if (windUntil !== previousWind) { gusts++; previousWind = windUntil; }");
    }
    assert.ok(g.run('kinds.filter(k => k === "rainbow").length') >= 2);
    assert.ok(g.run('kinds.filter(k => k === "giant").length') >= 2);
    assert.ok(g.run("gusts") >= 2);
    assert.equal(g.run("score"), 0);
    assert.equal(g.run("balloons.every(b => Number.isFinite(b.x) && Number.isFinite(b.y))"), true);
  }
});

test("game over saves one named score and ranking navigation never duplicates it", () => {
  const g = game();
  g.run('currentPlayerName = "ユノ"; score = 42; endGame(); endGame(); showRanking("result")');
  assert.equal(g.run("scoreStore.records.length"), 1);
  assert.equal(g.run("scoreStore.records[0].score"), 42);
  assert.equal(g.run("scoreStore.records[0].name"), "ユノ");
  assert.equal(g.run("rankingRows.children.length"), 1);
  assert.equal(g.run('screens.ranking.classList.contains("active")'), true);
  g.run('showRanking("start"); showRanking("result")');
  assert.equal(g.run("scoreStore.records.length"), 1);
  assert.equal(g.run("rankingRows.children.length"), 1);
  assert.equal(g.run("new ScoreStore().records[0].score"), 42);
});

test("ranking names are rendered as text and storage errors do not stop game over", () => {
  const g = game();
  g.run('currentPlayerName = "<img src=x>"; score = -2; scoreStore.getStorage = () => { throw Error("blocked"); }; endGame(); showRanking("result")');
  assert.equal(g.run('screens.ranking.classList.contains("active")'), true);
  assert.equal(g.run("scoreStore.records[0].score"), -2);
  assert.equal(g.run("rankingRows.children[0].children[1].children[0].textContent"), "<img src=x>（こんかい）");
  assert.equal(g.run("scoreStore.persistent"), false);
});
