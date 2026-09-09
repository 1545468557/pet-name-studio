// lib/dify.js —— Dify Chatflow 转发公共模块
// 本地版（server.js）与 Serverless 版（api/index.js）共用。

"use strict";

// 调用 Dify Chatflow 的 /chat-messages（blocking 模式）
async function difyChat(config, msg, convId, userId) {
  const url = config.difyBaseUrl.replace(/\/+$/, "") + "/chat-messages";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.difyToken
      },
      body: JSON.stringify({
        inputs: {},
        query: msg,
        response_mode: "blocking",
        conversation_id: convId || "",
        user: String(userId || "anonymous").slice(0, 36)
      }),
      signal: controller.signal
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error("Dify HTTP " + resp.status + (body ? "：" + body.slice(0, 200) : ""));
    }
    const data = await resp.json();
    return {
      answer: String(data.answer || ""),
      conversation_id: String(data.conversation_id || "")
    };
  } finally {
    clearTimeout(timer);
  }
}

// Dify answer 可能是 JSON 字符串（{reply,names,ask}），也可能是纯文本——两种都兼容
function parseDifyAnswer(answer) {
  try {
    const start = answer.indexOf("{");
    const end = answer.lastIndexOf("}");
    if (start > -1 && end > start) {
      const obj = JSON.parse(answer.slice(start, end + 1));
      if (obj && typeof obj.reply === "string") return obj;
    }
  } catch (err) { /* 非 JSON，走纯文本 */ }
  return { reply: answer, names: [], ask: "" };
}

module.exports = { difyChat, parseDifyAnswer };
