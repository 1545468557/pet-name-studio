// server.js —— 宠物起名工作室后端
// 单服务：托管前端页面 + AI Agent 起名 API。部署时同源访问，无需反向代理。
"use strict";

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { runAgent, chat } = require("./agent.js");
const db = require("./lib/db.js");

// 加载 .env（Node ≥21.7 内置支持；文件缺失时静默跳过，走真实环境变量）
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch (err) {
  if (err.code !== "ENOENT") console.warn("[pet-name-studio] .env 加载警告:", err.message);
}

const config = {
  provider: process.env.AI_PROVIDER || "mock",       // mock | openai 兼容接口
  baseUrl: process.env.AI_BASE_URL || "",
  model: process.env.AI_MODEL || "",
  apiKey: process.env.AI_API_KEY || "",
  port: parseInt(process.env.PORT || "3000", 10),
  rateLimit: parseInt(process.env.RATE_LIMIT || "30", 10), // 每 IP 每分钟请求上限
  adminToken: process.env.ADMIN_TOKEN || ""         // 后台管理令牌；留空则本地开发直接放行
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

// CORS：本地 file:// 打开时前端从 null 源访问；部署同源时浏览器不会带 Origin 限制
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// 简单内存限流（防滥用；多实例部署时可换成 Redis）
const hits = new Map();
app.use("/api/", (req, res, next) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const rec = hits.get(ip) || { t: now, n: 0 };
  if (now - rec.t > 60000) { rec.t = now; rec.n = 0; }
  rec.n += 1;
  hits.set(ip, rec);
  if (rec.n > config.rateLimit) {
    return res.status(429).json({ ok: false, error: "请求太频繁啦，歇一会儿再试～" });
  }
  next();
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    provider: config.provider,
    model: config.model,
    ready: config.provider !== "mock" && Boolean(config.apiKey),
    engine: config.provider,
    time: new Date().toISOString()
  });
});

app.post("/api/ai-name", async (req, res) => {
  try {
    const result = await runAgent(req.body || {}, config);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "生成失败" });
  }
});

// ================= 对话式起名（多轮聊天） =================
const sessions = new Map();
app.post("/api/ai-chat", async (req, res) => {
  try {
    const body = req.body || {};
    const msg = String(body.message || "").trim().slice(0, 200);
    if (!msg) return res.status(400).json({ ok: false, error: "说点什么呀～" });

    let sid = String(body.sessionId || "");
    if (!sid || !sessions.has(sid)) {
      sid = crypto.randomUUID();
      sessions.set(sid, { messages: [], t: Date.now() });
    }
    const session = sessions.get(sid);
    session.t = Date.now();
    session.messages.push({ role: "user", content: msg });
    if (session.messages.length > 30) session.messages = session.messages.slice(-30);

    const result = await chat(session.messages, config);
    session.messages.push({ role: "assistant", content: result.reply });

    // 简单清理：最多保留 500 个会话，超出淘汰最旧
    if (sessions.size > 500) {
      let oldest = null, oldestKey = null;
      for (const [k, v] of sessions) {
        if (!oldest || v.t < oldest.t) { oldest = v; oldestKey = k; }
      }
      if (oldestKey) sessions.delete(oldestKey);
    }

    res.json({ ok: true, sessionId: sid, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "对话失败" });
  }
});

// ================= 名字库（公开，前端启动时同步） =================
app.get("/api/names", (req, res) => {
  res.json({ ok: true, total: db.getAll().length, names: db.getAll() });
});

// ================= 后台管理 API =================
function adminAuth(req, res, next) {
  if (!config.adminToken) return next(); // 未配置令牌：本地开发放行（部署时必须设置）
  if ((req.get("X-Admin-Token") || "") !== config.adminToken) {
    return res.status(401).json({ ok: false, error: "管理令牌不正确" });
  }
  next();
}

app.use("/api/admin", adminAuth);

app.get("/api/admin/names", (req, res) => {
  const q = String(req.query.q || "").trim();
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  res.json({ ok: true, ...db.list({ q, page, limit }) });
});

app.post("/api/admin/names", (req, res) => {
  try {
    const row = db.create(req.body || {});
    res.status(201).json({ ok: true, row });
  } catch (err) {
    const code = err.message.includes("UNIQUE") ? 409 : (err.status || 400);
    res.status(code).json({ ok: false, error: err.message.includes("UNIQUE") ? "这个名字已存在" : err.message });
  }
});

app.get("/api/admin/names/:id", (req, res) => {
  try {
    const id = db.validateId(req.params.id);
    const row = db.getById(id);
    if (!row) return res.status(404).json({ ok: false, error: "名字不存在" });
    res.json({ ok: true, row });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
  }
});

app.put("/api/admin/names/:id", (req, res) => {
  try {
    const id = db.validateId(req.params.id);
    const row = db.update(id, req.body || {});
    if (!row) return res.status(404).json({ ok: false, error: "名字不存在" });
    res.json({ ok: true, row });
  } catch (err) {
    const code = err.message.includes("UNIQUE") ? 409 : (err.status || 400);
    res.status(code).json({ ok: false, error: err.message.includes("UNIQUE") ? "这个名字已存在" : err.message });
  }
});

app.delete("/api/admin/names/:id", (req, res) => {
  try {
    const id = db.validateId(req.params.id);
    const ok = db.remove(id);
    if (!ok) return res.status(404).json({ ok: false, error: "名字不存在" });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 400).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/stats", (req, res) => {
  res.json({ ok: true, ...db.stats() });
});

// 只托管前端页面本身；源码（server.js / agent.js / .env）不对外暴露
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// 启动时自动建表并导入种子名字库（首次运行）
db.seedIfEmpty();

app.listen(config.port, () => {
  console.log("[pet-name-studio] 服务已启动");
  console.log("[pet-name-studio] 页面   http://localhost:" + config.port + "/");
  console.log("[pet-name-studio] 后台管理 http://localhost:" + config.port + "/admin" + (config.adminToken ? "（需令牌）" : "（未设令牌，本地开放）"));
  console.log("[pet-name-studio] 健康检查 http://localhost:" + config.port + "/api/health");
  console.log("[pet-name-studio] AI 引擎 " + config.provider + (config.model ? " / " + config.model : "（本地引擎，配置 .env 可接入真实大模型）"));
});
