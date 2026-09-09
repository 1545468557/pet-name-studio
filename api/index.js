// api/index.js —— Vercel Serverless 版后端
// 由 vercel.json 把 /api/* 全部 rewrite 到这里。
// 与本地 server.js 的差异：
//   1. 不监听端口，直接导出 Express app（Vercel 函数签名兼容）
//   2. 名字库使用只读 JSON（data/names.json），不依赖 SQLite
//   3. 会话无状态：历史由前端全量携带（body.history），Dify 的
//      conversation_id 由前端保存回传（body.conversationId）
//   4. 后台管理写接口不可用（SQLite 持久化仅限本地），返回友好提示
"use strict";

const express = require("express");
const crypto = require("crypto");
const { runAgent, chat } = require("../agent.js");
const { difyChat, parseDifyAnswer } = require("../lib/dify.js");

const names = require("../data/names.json");

const config = {
  provider: process.env.AI_PROVIDER || "mock",
  baseUrl: process.env.AI_BASE_URL || "",
  model: process.env.AI_MODEL || "",
  apiKey: process.env.AI_API_KEY || "",
  difyBaseUrl: process.env.DIFY_BASE_URL || "https://api.dify.ai/v1",
  difyToken: process.env.DIFY_APP_TOKEN || ""
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

// CORS：兼容 file:// 与跨域调试
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// 简单内存限流（Serverless 单实例内有效；多实例可后续换 KV）
const hits = new Map();
app.use("/api/", (req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
  const now = Date.now();
  const rec = hits.get(ip) || { t: now, n: 0 };
  if (now - rec.t > 60000) { rec.t = now; rec.n = 0; }
  rec.n += 1;
  hits.set(ip, rec);
  if (rec.n > 30) {
    return res.status(429).json({ ok: false, error: "请求太频繁啦，歇一会儿再试～" });
  }
  next();
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    provider: config.difyToken ? "dify" : config.provider,
    model: config.difyToken ? "dify-chatflow" : config.model,
    ready: Boolean(config.apiKey) || Boolean(config.difyToken),
    engine: config.difyToken ? "dify" : config.provider,
    serverless: true,
    time: new Date().toISOString()
  });
});

// 只读名字库（与本地版同结构）
app.get("/api/names", (req, res) => {
  res.json({ ok: true, total: names.length, names });
});

app.post("/api/ai-name", async (req, res) => {
  try {
    const result = await runAgent(req.body || {}, config);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "生成失败" });
  }
});

// 对话式起名（无状态：历史前端携带）
app.post("/api/ai-chat", async (req, res) => {
  try {
    const body = req.body || {};
    const msg = String(body.message || "").trim().slice(0, 200);
    if (!msg) return res.status(400).json({ ok: false, error: "说点什么呀～" });

    const history = Array.isArray(body.history)
      ? body.history.filter((h) => h && typeof h.content === "string").slice(-29)
          .map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content).slice(0, 500) }))
      : [];
    history.push({ role: "user", content: msg });

    const convId = String(body.conversationId || "");
    const userId = String(body.user || "anon").slice(0, 36);
    let result;

    if (config.difyToken) {
      try {
        const d = await difyChat(config, msg, convId, userId);
        const parsed = parseDifyAnswer(d.answer);
        result = {
          reply: String(parsed.reply || "").slice(0, 300),
          names: Array.isArray(parsed.names)
            ? parsed.names.map((n) => ({
                name: String(n.name || "").trim(),
                meaning: String(n.meaning || "").trim(),
                reason: String(n.reason || "").trim(),
                tags: Array.isArray(n.tags) ? n.tags.map(String).slice(0, 3) : [],
                pet: "any"
              })).filter((n) => n.name).slice(0, 3)
            : [],
          ask: String(parsed.ask || "").slice(0, 80),
          engine: "dify",
          mode: "ai",
          conversationId: d.conversation_id || undefined
        };
      } catch (err) {
        result = await chat(history, config);
        result.engine = (result.engine || "AI") + "（Dify 降级）";
        result.mode = "fallback";
        result.note = "Dify 调用失败，已用备选引擎：" + err.message;
      }
    } else {
      result = await chat(history, config);
    }

    res.json({ ok: true, sessionId: crypto.randomUUID(), ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "对话失败" });
  }
});

// 后台写接口在 Serverless 环境不可用（SQLite 无法持久化）
app.all("/api/admin*", (req, res) => {
  res.status(501).json({
    ok: false,
    error: "后台写入仅限本地部署（SQLite 持久化）。线上如需管理名字库，请接入外置数据库（Turso/Supabase 等）。"
  });
});

module.exports = app;
