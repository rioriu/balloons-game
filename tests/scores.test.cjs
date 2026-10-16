const test = require("node:test");
const assert = require("node:assert/strict");
const { ScoreStore } = require("../scores.js");

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("records and player name persist across sessions, with descending scores and tied ranks", () => {
  const disk = storage();
  const first = new ScoreStore(() => disk);
  first.setPlayerName("ユノ");
  first.addScore(-1, "A"); first.addScore(0, "B"); first.addScore(30, "C");
  assert.equal(first.addScore(30, "D").rank, 1);
  const second = new ScoreStore(() => disk);
  assert.deepEqual(second.records.map(record => record.score), [30, 30, 0, -1]);
  assert.equal(second.playerName, "ユノ");
  assert.equal(second.addScore(20, "E").rank, 3);
});

test("only the best twenty are kept and nonqualifying runs are reported accurately", () => {
  const disk = storage();
  const store = new ScoreStore(() => disk);
  for (let score = 0; score < 25; score++) store.addScore(score, "A");
  assert.equal(store.records.length, 20);
  assert.equal(store.records[0].score, 24);
  assert.equal(store.records.at(-1).score, 5);
  assert.equal(store.addScore(-1, "B").listed, false);
  assert.equal(new ScoreStore(() => disk).records.length, 20);
});

test("broken JSON, wrong schemas, and malformed records do not break ranking loading", () => {
  const disk = storage();
  for (const value of ['{broken', '{}', 'null', '[{"score":"oops"}]']) {
    disk.setItem(ScoreStore.key, value);
    const store = new ScoreStore(() => disk);
    assert.deepEqual(store.records, []);
    assert.equal(store.addScore(5, "A").persistent, true);
  }
});

test("blocked storage and full storage retain session results without claiming persistence", () => {
  for (const getStorage of [() => { throw Error("denied"); }, () => ({ getItem() { return null; }, setItem() { throw Error("full"); } })]) {
    const store = new ScoreStore(getStorage);
    assert.equal(store.addScore(10, "A").persistent, false);
    assert.equal(store.load()[0].score, 10);
  }
});

test("new results merge other tabs' records before writing", () => {
  const disk = storage();
  const first = new ScoreStore(() => disk);
  const second = new ScoreStore(() => disk);
  first.addScore(30, "A"); second.addScore(20, "B"); first.addScore(10, "C");
  assert.deepEqual(new ScoreStore(() => disk).records.map(record => record.score), [30, 20, 10]);
});

test("names are bounded by Unicode characters, blank names default, invalid scores are rejected", () => {
  assert.equal(ScoreStore.cleanName("  "), "プレイヤー");
  assert.equal(Array.from(ScoreStore.cleanName("🎈".repeat(15))).length, 12);
  assert.equal(ScoreStore.cleanName("A\nB"), "AB");
  const store = new ScoreStore(storage);
  for (const value of [NaN, Infinity, "4", 1.5]) assert.throws(() => store.addScore(value, "A"));
});
