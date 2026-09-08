// lib/db.js —— 名字库数据库层（SQLite，Node 22 内置 node:sqlite，零依赖）
// 首次启动自动建表并从 lib/names.js 导入种子数据；此后以数据库为权威。
// 前端 /api/names 与 Agent 质检兜底都从这里读，管理后台增删改立即全局生效。
"use strict";

const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const seedNames = require("./names.js");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "petname.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS names (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    n          TEXT NOT NULL UNIQUE,
    m          TEXT NOT NULL DEFAULT '',
    g          TEXT NOT NULL DEFAULT 'any',
    s          TEXT NOT NULL DEFAULT '[]',
    p          TEXT NOT NULL DEFAULT '["any"]',
    hot        INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// 与前端一致的风格/宠物白名单（校验用）
const STYLE_KEYS = ["cute", "artsy", "boss", "funny", "food", "ancient", "trendy", "soft"];
const PET_KEYS = ["cat", "dog", "rabbit", "hamster", "bird", "any"];

const HOT_NAMES = ["团子", "布丁", "旺财", "咪咪", "奶茶", "将军", "Luna", "二狗", "汤圆", "糯米", "豆包", "火锅", "麻薯", "Mochi", "望舒", "土豆", "拿铁", "Coco", "泡面", "云深"];

function decorate(row) {
  return {
    id: row.id,
    n: row.n,
    m: row.m,
    g: row.g,
    s: safeJson(row.s, []),
    p: safeJson(row.p, ["any"]),
    hot: !!row.hot,
    created_at: row.created_at
  };
}

function safeJson(text, fallback) {
  try { const v = JSON.parse(text); return Array.isArray(v) ? v : fallback; } catch (e) { return fallback; }
}

function seedIfEmpty() {
  const { c } = db.prepare("SELECT COUNT(*) AS c FROM names").get();
  if (c > 0) return false;
  const ins = db.prepare("INSERT INTO names (n, m, g, s, p, hot) VALUES (?, ?, ?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    for (const x of seedNames) {
      ins.run(x.n, x.m, x.g || "any", JSON.stringify(x.s || ["cute"]), JSON.stringify(x.p || ["any"]), HOT_NAMES.includes(x.n) ? 1 : 0);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return true;
}

/* ================= 查询 ================= */

function getAll() {
  return db.prepare("SELECT * FROM names ORDER BY id").all().map(decorate);
}

function list({ q = "", page = 1, limit = 20 }) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const like = `%${q}%`;
  const total = db.prepare("SELECT COUNT(*) AS c FROM names WHERE n LIKE ? OR m LIKE ?").get(like, like).c;
  const rows = db.prepare("SELECT * FROM names WHERE n LIKE ? OR m LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(like, like, limitNum, (pageNum - 1) * limitNum)
    .map(decorate);
  return { total, page: pageNum, limit: limitNum, rows };
}

function getById(id) {
  const row = db.prepare("SELECT * FROM names WHERE id = ?").get(id);
  return row ? decorate(row) : null;
}

function stats() {
  const total = db.prepare("SELECT COUNT(*) AS c FROM names").get().c;
  const hotCount = db.prepare("SELECT COUNT(*) AS c FROM names WHERE hot = 1").get().c;
  const byStyle = {};
  const byPet = {};
  for (const x of getAll()) {
    for (const k of x.s) byStyle[k] = (byStyle[k] || 0) + 1;
    for (const k of x.p) byPet[k] = (byPet[k] || 0) + 1;
  }
  return { total, hotCount, byStyle, byPet };
}

/* ================= 写入 ================= */

function create(fields) {
  const clean = validate(fields);
  db.prepare("INSERT INTO names (n, m, g, s, p, hot) VALUES (?, ?, ?, ?, ?, ?)")
    .run(clean.n, clean.m, clean.g, JSON.stringify(clean.s), JSON.stringify(clean.p), clean.hot ? 1 : 0);
  const { id } = db.prepare("SELECT id FROM names WHERE n = ? ORDER BY id DESC LIMIT 1").get(clean.n);
  return getById(id);
}

function update(id, fields) {
  const clean = validate(fields);
  db.prepare("UPDATE names SET n = ?, m = ?, g = ?, s = ?, p = ?, hot = ?, updated_at = datetime('now') WHERE id = ?")
    .run(clean.n, clean.m, clean.g, JSON.stringify(clean.s), JSON.stringify(clean.p), clean.hot ? 1 : 0, id);
  return getById(id);
}

function remove(id) {
  const info = db.prepare("DELETE FROM names WHERE id = ?").run(id);
  return info.changes > 0;
}

/* ================= 校验 ================= */

function validate({ n, m, g, s, p, hot }) {
  const name = String(n || "").trim();
  if (!name) throw Object.assign(new Error("名字不能为空"), { status: 400 });
  if (name.length > 12) throw Object.assign(new Error("名字最长 12 个字符（中文 6 字 / 英文名 12 字母）"), { status: 400 });
  const mean = String(m || "").trim().slice(0, 100);
  const gender = ["m", "f", "any"].includes(g) ? g : "any";
  const styles = Array.isArray(s) ? s.filter((k) => STYLE_KEYS.includes(k)).slice(0, 3) : [];
  const pets = Array.isArray(p) ? p.filter((k) => PET_KEYS.includes(k)).slice(0, 3) : ["any"];
  if (!styles.length) styles.push("cute");
  if (!pets.length) pets.push("any");
  return { n: name, m: mean, g: gender, s: styles, p: pets, hot: !!hot };
}

function validateId(id) {
  const num = parseInt(id, 10);
  if (!Number.isInteger(num) || num < 1) throw Object.assign(new Error("无效的 ID"), { status: 400 });
  return num;
}

module.exports = { seedIfEmpty, getAll, list, getById, stats, create, update, remove, validateId, STYLE_KEYS, PET_KEYS };
