// lib/models.js —— 大模型调用适配层
// 火山豆包 / DeepSeek / 通义 / 智谱 / Kimi 均为 OpenAI 兼容接口，
// 统一走 chatCompletion，通过 .env 里的 baseUrl + model + key 切换。
"use strict";

const DEFAULT_TIMEOUT = 20000;

async function chatCompletion({ baseUrl, model, apiKey, messages, temperature = 0.8, json = false, timeoutMs = DEFAULT_TIMEOUT }) {
  if (!baseUrl || !model || !apiKey) {
    throw new Error("模型未配置：请检查 .env 中的 AI_BASE_URL / AI_MODEL / AI_API_KEY");
  }
  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        ...(json ? { response_format: { type: "json_object" } } : {})
      }),
      signal: controller.signal
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error("模型接口 HTTP " + resp.status + (body ? "：" + body.slice(0, 200) : ""));
    }

    const data = await resp.json();
    const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    if (!text) throw new Error("模型返回内容为空");
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

// 从模型输出中稳健地取出 JSON（容忍 ```json 围栏与前后废话）
function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const src = fence ? fence[1] : text;
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("模型输出中未找到 JSON");
  return JSON.parse(src.slice(start, end + 1));
}

module.exports = { chatCompletion, extractJson };
