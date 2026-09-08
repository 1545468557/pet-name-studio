#!/usr/bin/env node
// scripts/import-names.js —— 批量把网上扒下来的名字导入数据库
//
// 用法：
//   node scripts/import-names.js data.json
//   node scripts/import-names.js data.csv
//   node scripts/import-names.js data.json --mode=update   # 重名时更新而非跳过
//
// 数据格式：
//   JSON: [{ "n":"名字", "m":"释义(可空)", "g":"m|f|any", "s":["可爱"], "p":["猫"], "hot":false }]
//         s/p 支持中文标签或英文 key（cute/cat…），可多个
//   CSV:  第一行表头 n,m,g,s,p,hot
//         s/p 多个标签用 | 分隔，中文或英文均可
//
// 清洗规则：名字 1~6 字、自动去重（库里已有则跳过/更新）、
//           风格宠物标签白名单化、释义截断 100 字。
"use strict";

const fs = require("fs");
const path = require("path");
try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch (e) { /* 无 .env 用默认 */ }
const db = require("../lib/db.js");

const STYLE_MAP = { 可爱:"cute", 文艺:"artsy", 霸气:"boss", 搞笑:"funny", 吃货:"food", 古风:"ancient", 洋气:"trendy", 软萌:"soft" };
const PET_MAP = { 猫:"cat", 狗:"dog", 兔子:"rabbit", 仓鼠:"hamster", 鸟:"bird", 通用:"any" };

function normTags(v, map, keys) {
  return (Array.isArray(v) ? v : String(v == null ? "" : v).split(/[|;，、,]/))
    .map((x) => String(x).trim())
    .filter(Boolean)
    .map((x) => map[x] || x)
    .filter((k) => keys.includes(k))
    .slice(0, 3);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; }
      else cur += c;
    } else if (c === '"') { inq = true; }
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((x) => x.trim() !== "")) rows.push(row); }
  return rows;
}

function usage() {
  console.log("用法: node scripts/import-names.js <data.json|data.csv> [--mode=skip|update]");
}

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { usage(); process.exit(1); }
const modeArg = (process.argv.find((a) => a.startsWith("--mode=")) || "--mode=skip").split("=")[1];
const mode = modeArg === "update" ? "update" : "skip";

const raw = fs.readFileSync(file, "utf8");
let items;
if (file.endsWith(".json")) {
  items = JSON.parse(raw);
} else if (file.endsWith(".csv")) {
  const rows = parseCsv(raw).slice(1); // 跳过表头
  items = rows.map((r) => ({ n: r[0] || "", m: r[1] || "", g: r[2] || "any", s: r[3] || "", p: r[4] || "", hot: /1|true|是|yes/i.test(r[5] || "") }));
} else {
  console.log("仅支持 .json / .csv"); process.exit(1);
}

if (!Array.isArray(items) || !items.length) { console.log("没有可导入的数据"); process.exit(1); }
console.log("待导入 " + items.length + " 条，重名模式：" + (mode === "update" ? "更新" : "跳过") + "\n");

const existing = db.getAll();
const index = new Map(existing.map((x) => [x.n, x.id]));

let added = 0, updated = 0, skipped = 0, failed = 0;
for (const it of items) {
  const rec = {
    n: String(it.n == null ? "" : it.n).trim(),
    m: String(it.m == null ? "" : it.m).trim().slice(0, 100),
    g: ["m", "f", "any"].includes(it.g) ? it.g : "any",
    s: normTags(it.s, STYLE_MAP, db.STYLE_KEYS),
    p: normTags(it.p, PET_MAP, db.PET_KEYS),
    hot: !!it.hot
  };
  if (!rec.n || rec.n.length > 12) { failed++; console.log("✗ 跳过（名字不合法）:", JSON.stringify(rec.n)); continue; }
  try {
    if (index.has(rec.n)) {
      if (mode === "update") { db.update(index.get(rec.n), rec); updated++; console.log("↻ 更新:", rec.n); }
      else { skipped++; console.log("– 跳过（已存在）:", rec.n); }
    } else {
      const row = db.create(rec); index.set(row.n, row.id); added++;
      console.log("＋ 导入:", rec.n + (rec.m ? "｜" + rec.m.slice(0, 18) : ""));
    }
  } catch (e) { failed++; console.log("✗ 失败:", rec.n, "→", e.message); }
}

console.log("\n完成：新增 " + added + "，更新 " + updated + "，跳过 " + skipped + "，失败 " + failed);
