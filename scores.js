class ScoreStore {
  static key = "balloons-game:scores:v1";
  static nameKey = "balloons-game:player:v1";
  static limit = 20;

  constructor(getStorage = () => window.localStorage) {
    this.getStorage = getStorage;
    this.records = [];
    this.persistent = true;
    this.playerName = "";
    this.load();
    try {
      this.playerName = ScoreStore.cleanName(this.getStorage().getItem(ScoreStore.nameKey) || "", "");
    } catch {
      this.persistent = false;
    }
  }

  static cleanName(value, fallback = "プレイヤー") {
    return Array.from(String(value).replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0, 12).join("") || fallback;
  }

  static validRecord(record) {
    return record && typeof record.id === "string" && record.id.length > 0 && record.id.length <= 100 &&
      typeof record.name === "string" && Number.isSafeInteger(record.score) &&
      record.score >= -10000 && record.score <= 1000000 && typeof record.playedAt === "string" &&
      Number.isFinite(Date.parse(record.playedAt));
  }

  load() {
    try {
      const raw = this.getStorage().getItem(ScoreStore.key);
      let saved = [];
      try { saved = raw ? JSON.parse(raw) : []; } catch { /* Ignore malformed stored data. */ }
      const merged = new Map();
      for (const record of [...(Array.isArray(saved) ? saved : []), ...this.records]) {
        if (ScoreStore.validRecord(record)) {
          merged.set(record.id, { id: record.id, name: ScoreStore.cleanName(record.name),
            score: record.score, playedAt: record.playedAt });
        }
      }
      this.records = [...merged.values()].sort((a, b) => b.score - a.score || Date.parse(a.playedAt) - Date.parse(b.playedAt))
        .slice(0, ScoreStore.limit);
    } catch {
      this.persistent = false;
    }
    return this.records;
  }

  setPlayerName(name) {
    this.playerName = ScoreStore.cleanName(name);
    try {
      this.getStorage().setItem(ScoreStore.nameKey, this.playerName);
    } catch {
      this.persistent = false;
    }
    return this.playerName;
  }

  addScore(score, name, playedAt = new Date().toISOString()) {
    const record = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      name: ScoreStore.cleanName(name), score, playedAt };
    if (!ScoreStore.validRecord(record)) throw new TypeError("Invalid score record");
    this.load();
    const rank = this.records.filter(previous => previous.score > score).length + 1;
    this.records.push(record);
    this.records.sort((a, b) => b.score - a.score || Date.parse(a.playedAt) - Date.parse(b.playedAt));
    this.records = this.records.slice(0, ScoreStore.limit);
    const listed = this.records.some(previous => previous.id === record.id);
    try {
      this.getStorage().setItem(ScoreStore.key, JSON.stringify(this.records));
      this.persistent = true;
    } catch {
      this.persistent = false;
    }
    return { record, rank, listed, persistent: this.persistent };
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = { ScoreStore };
