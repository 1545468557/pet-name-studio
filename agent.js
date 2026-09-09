// agent.js —— 宠物起名 Agent
// 三步编排：① 规划策略 → ② 生成候选 → ③ 代码质检 + 打分
// 模型不可用 / 未配置 key 时自动降级到本地规则引擎（mock），体验不断档。
"use strict";

// SQLite 延迟加载：queryKnowledge 停用期间不触碰数据库，
// 保证本模块可在无 SQLite 的 Serverless 环境（如 Vercel）直接运行。
let _db = null;
function getDb() {
  if (!_db) _db = require("./lib/db.js");
  return _db;
}

// 名字库统一数据源：优先读只读 JSON（Serverless 部署），缺失时回退 SQLite（本地）
let _libCache = null;
function getNameLib() {
  if (_libCache) return _libCache;
  try {
    _libCache = require("./data/names.json");
    if (Array.isArray(_libCache) && _libCache.length) return _libCache;
  } catch (err) { /* 无 JSON 文件，退回 SQLite */ }
  _libCache = getDb().getAll();
  return _libCache;
}

const { chatCompletion, extractJson } = require("./lib/models.js");

const STYLE_LABEL = { cute: "可爱", artsy: "文艺", boss: "霸气", funny: "搞笑", food: "吃货", ancient: "古风", trendy: "洋气", soft: "软萌" };
const PET_LABEL = { cat: "猫", dog: "狗", rabbit: "兔子", hamster: "仓鼠", bird: "鸟", any: "通用" };
const TRAIT_STYLE = {
  粘人: ["cute", "soft"], 高冷: ["artsy", "ancient"], 活泼: ["cute", "funny"],
  贪吃: ["food"], 爱睡觉: ["soft"], 拆家: ["funny"], 胆小: ["soft", "cute"], 聪明: ["trendy", "boss"]
};
const HOPE_STYLE = {
  好运: ["cute"], 健康: ["soft"], 富贵: ["boss"], 文艺: ["artsy"],
  可爱: ["cute"], 霸气: ["boss"], 洋气: ["trendy"], 古风: ["ancient"]
};
const HOPE_KW = {
  "好运": ["福", "运", "吉", "利"], "健康": ["安", "康", "平", "健"],
  "富贵": ["富", "贵", "财", "旺"], "文艺": ["诗", "书", "墨", "雅", "韵", "文"],
  "可爱": ["甜", "萌", "软", "乖", "圆", "可"], "霸气": ["霸", "王", "将", "龙", "虎", "帝"],
  "洋气": [], "古风": ["云", "月", "风", "青", "玉", "竹", "水"]
};

function normalizeInput(raw) {
  const arr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  return {
    pet: ["cat", "dog", "rabbit", "hamster", "bird", "any"].includes(raw.pet) ? raw.pet : "any",
    gender: ["m", "f", "any"].includes(raw.gender) ? raw.gender : "any",
    traits: arr(raw.traits).slice(0, 4),
    hopes: arr(raw.hopes).slice(0, 4),
    len: [2, 3, 4].includes(raw.len) ? raw.len : 2,
    avoid: String(raw.avoid || "").trim().slice(0, 4)
  };
}

function modelLabel(config) {
  return config.model || config.provider;
}

/* ================= 三步编排 ================= */

async function planStep(input, config) {
  const sys = "你是宠物起名策略师。根据主人的输入，先分析宠物性格与主人的寓意偏好，输出一份简短的起名策略。";
  const user = [
    "宠物类型：" + PET_LABEL[input.pet],
    "性别偏好：" + (input.gender === "m" ? "男孩" : input.gender === "f" ? "女孩" : "不限"),
    "性格关键词：" + (input.traits.length ? input.traits.join("、") : "未提供"),
    "希望寓意：" + (input.hopes.length ? input.hopes.join("、") : "未提供"),
    "想要字数：" + input.len + " 个字",
    "忌用字：" + (input.avoid || "无")
  ].join("\n");
  const text = await chatCompletion({
    baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey, json: true,
    messages: [
      { role: "system", content: sys + " 必须只输出 JSON，不要任何多余文字，格式：{\"strategy\":\"一句话策略\",\"style_hint\":\"风格方向，用中文词\",\"keywords\":[\"参考字\"],\"avoid\":[\"要避开的字\"]}" },
      { role: "user", content: user }
    ]
  });
  const plan = extractJson(text);
  return {
    strategy: String(plan.strategy || "").slice(0, 120),
    style_hint: String(plan.style_hint || "").slice(0, 60),
    keywords: Array.isArray(plan.keywords) ? plan.keywords.map(String).slice(0, 8) : [],
    avoid: Array.isArray(plan.avoid) ? plan.avoid.map(String).slice(0, 6) : []
  };
}

async function generateStep(input, plan, config) {
  const sys = "你是宠物起名大师，专产出有温度、好记、适合宠物性格的中文名字。";
  const user = [
    "宠物类型：" + PET_LABEL[input.pet] + "，性别偏好：" + (input.gender === "m" ? "男孩" : input.gender === "f" ? "女孩" : "不限"),
    "性格：" + (input.traits.length ? input.traits.join("、") : "未提供"),
    "寓意：" + (input.hopes.length ? input.hopes.join("、") : "未提供"),
    "策略：" + (plan.strategy || "无"),
    "风格提示：" + (plan.style_hint || "无"),
    "参考字：" + (plan.keywords.join("、") || "无"),
    "",
    "硬性要求：",
    "1. 每个名字必须是 " + input.len + " 个字（中文；英文名需附中文可喊小名），不许超出；",
    "2. 禁止出现以下忌用字：" + (input.avoid || "无") + "；",
    "3. 名字好记、朗朗上口，避免生僻字；",
    "4. 输出 8 个候选。",
    "必须只输出 JSON，格式：{\"names\":[{\"name\":\"名字\",\"meaning\":\"名字含义(一句话)\",\"reason\":\"为什么适合这只宠物的性格与寓意(一句话)\",\"tags\":[\"风格标签，如 可爱/文艺/霸气/搞笑/吃货/古风/洋气/软萌\"],\"pet\":\"cat或dog或rabbit或hamster或bird或any\"}]}"
  ].join("\n");
  const text = await chatCompletion({
    baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey, json: true, temperature: 0.9,
    messages: [
      { role: "system", content: sys + " 必须严格按要求的 JSON 格式输出，不要输出 JSON 以外的任何文字。" },
      { role: "user", content: user }
    ]
  });
  const data = extractJson(text);
  const list = Array.isArray(data.names) ? data.names : [];
  if (!list.length) throw new Error("模型没有返回任何候选名字");
  return list.map((it) => ({
    name: String(it.name || "").trim(),
    meaning: String(it.meaning || "").trim(),
    reason: String(it.reason || "").trim(),
    tags: Array.isArray(it.tags) ? it.tags.map(String).slice(0, 3) : [],
    pet: ["cat", "dog", "rabbit", "hamster", "bird", "any"].includes(it.pet) ? it.pet : input.pet
  })).filter((it) => it.name && it.meaning);
}

function evaluateStep(input, candidates) {
  const namesLib = getNameLib();
  const avoid = input.avoid;
  const okLen = (name) => {
    const zh = name.replace(/[a-zA-Z\s]/g, "");
    const en = name.replace(/[^\x00-\x7F]/g, "");
    const n = zh || en;
    return n.length === input.len;
  };
  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  let filtered = unique.filter((c) =>
    (!avoid || c.name.indexOf(avoid) === -1) && c.name.length >= 1 && c.name.length <= 6
  );

  // 打分：性格→风格、寓意→风格 ×2；寓意关键词命中释义 ×1.5；与本地库同名 +0.5
  const wantStyles = new Set();
  input.traits.forEach((t) => (TRAIT_STYLE[t] || []).forEach((s) => wantStyles.add(s)));
  input.hopes.forEach((h) => (HOPE_STYLE[h] || []).forEach((s) => wantStyles.add(s)));

  const score = (c) => {
    let s = 0;
    (c.tags || []).forEach((t) => { if (wantStyles.has(t)) s += 2; });
    input.hopes.forEach((h) => {
      (HOPE_KW[h] || []).forEach((k) => { if (c.meaning.indexOf(k) > -1) s += 1.5; });
    });
    if (namesLib.some((x) => x.n === c.name)) s += 0.5;
    return s;
  };

  filtered.forEach((c) => { c._score = score(c); });
  filtered.sort((a, b) => b._score - a._score || a.name.length - b.name.length);

  let top = filtered.slice(0, 3);
  if (!top.length) top = unique.slice(0, 3); // 全被过滤则放宽
  return top.map((c) => {
    const { _score, ...rest } = c;
    void _score;
    return rest;
  });
}

/* ================= 本地规则引擎（mock / 降级兜底） ================= */

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function mockEngine(input) {
  const namesLib = getNameLib();
  const avoid = input.avoid;
  const pool = namesLib.filter((x) => {
    if (x.p.indexOf(input.pet) === -1 && x.p.indexOf("any") === -1) return false;
    if (input.gender !== "any" && x.g !== "any" && x.g !== input.gender) return false;
    if (x.n.length !== input.len) return false;
    if (avoid && x.n.indexOf(avoid) > -1) return false;
    return true;
  });  const scored = pool.map((x) => {
    let score = 0;
    const styles = new Set();
    input.traits.forEach((t) => (TRAIT_STYLE[t] || []).forEach((s) => styles.add(s)));
    input.hopes.forEach((h) => (HOPE_STYLE[h] || []).forEach((s) => styles.add(s)));
    const hits = x.s.filter((st) => styles.has(st));
    score += hits.length * 2;
    const kws = [];
    input.hopes.forEach((h) => {
      (HOPE_KW[h] || []).forEach((k) => { if (x.m.indexOf(k) > -1 && kws.indexOf(h) === -1) kws.push(h); });
    });
    score += kws.length * 1.5;
    return { it: x, score, styles: hits, kws };
  });
  let cand = scored.filter((s) => s.score > 0);
  if (!cand.length) cand = scored;
  cand.sort((a, b) => b.score - a.score);
  const top = cand.slice(0, Math.min(24, cand.length));
  const picked = shuffle(top).slice(0, 3);

  const buildReason = (s) => {
    const parts = [];
    if (input.traits.length && s.styles.length) {
      parts.push("性格「" + input.traits.join("、") + "」很配「" + s.styles.map((st) => STYLE_LABEL[st]).join("、") + "」风格");
    }
    if (s.kws.length) parts.push("寓意「" + s.kws.join("、") + "」就藏在名字释义里");
    if (!parts.length) parts.push("没给太多线索，AI 纯靠眼缘挑的——名字本身是好的");
    parts.push("释义：" + s.it.m);
    return parts.join(" · ");
  };

  return {
    names: picked.map((s) => ({
      name: s.it.n,
      meaning: s.it.m,
      reason: buildReason(s),
      tags: s.it.s.slice(0, 3),
      pet: input.pet !== "any" ? input.pet : (s.it.p.filter((k) => k !== "any")[0] || "any")
    })),
    strategy: mockStrategy(input),
    engine: "本地引擎",
    mode: "mock"
  };
}

function mockStrategy(input) {
  const styles = new Set();
  input.traits.forEach((t) => (TRAIT_STYLE[t] || []).forEach((s) => styles.add(s)));
  input.hopes.forEach((h) => (HOPE_STYLE[h] || []).forEach((s) => styles.add(s)));
  const hint = Array.from(styles).slice(0, 2).map((s) => STYLE_LABEL[s]).join("、");
  const src = [];
  if (input.traits.length) src.push("性格「" + input.traits.join("、") + "」");
  if (input.hopes.length) src.push("寓意「" + input.hopes.join("、") + "」");
  return "分析了" + (src.length ? src.join(" + ") : "你的选择") +
    (hint ? "，锁定「" + hint + "」方向" : "") +
    "，从 " + getNameLib().length + " 个名字里筛出最合拍的 3 位。";
}

/* ================= 对话层（聊天式起名） ================= */

const PET_KW = {
  cat: ["猫", "喵", "咪", "橘", "布偶", "英短", "暹罗", "缅因", "奶牛", "狸花", "加菲", "折耳"],
  dog: ["狗", "汪", "犬", "柯基", "柴犬", "金毛", "泰迪", "拉布拉多", "边牧", "萨摩", "哈士奇", "二哈", "比熊", "博美", "法斗", "雪纳瑞", "腊肠"],
  rabbit: ["兔", "垂耳", "侏儒兔", "安哥拉兔"],
  hamster: ["仓鼠", "鼠", "金丝熊", "豚鼠", "奶茶鼠", "布丁鼠"],
  bird: ["鸟", "鹦鹉", "玄凤", "牡丹", "虎皮", "文鸟", "鸽子", "八哥", "金丝雀"]
};
const GENDER_KW = {
  m: ["公", "男", "弟弟", "哥哥", "小伙", "男孩", "汉子", "帅哥", "小伙儿"],
  f: ["母", "女", "妹妹", "姐姐", "姑娘", "女孩", "小公主", "美女", "妹妹仔"]
};
const TRAIT_ALIAS = {
  粘人: ["粘", "黏", "缠", "跟屁虫", "贴"],
  高冷: ["高冷", "傲娇", "酷", "不爱理人", "冷"],
  活泼: ["活泼", "闹", "好动", "跳", "皮", "淘气", "顽皮", "疯", "活跃"],
  贪吃: ["贪吃", "能吃", "吃货", "馋", "爱吃", "饭桶", "吃得多"],
  爱睡觉: ["睡", "懒", "躺", "安静", "宅", "困"],
  拆家: ["拆家", "捣蛋", "破坏", "咬", "拆"],
  胆小: ["胆小", "怕生", "害羞", "怂", "温顺", "怯"],
  聪明: ["聪明", "机灵", "灵", "懂事", "精"]
};
const HOPE_ALIAS = {
  好运: ["好运", "福", "幸运", "lucky", "吉"],
  健康: ["健康", "平安", "长寿", "健壮", "安康"],
  富贵: ["富贵", "发财", "招财", "旺财", "有钱", "暴富", "富裕"],
  文艺: ["文艺", "诗意", "书卷", "雅", "仙", "清冷", "高级感"],
  可爱: ["可爱", "萌", "甜", "软萌", "奶"],
  霸气: ["霸气", "王", "大佬", "酷炫", "威风", "凶猛", "帅"],
  洋气: ["洋气", "英文", "潮流", "时尚", "国际", "外国", "摩登"],
  古风: ["古风", "古韵", "诗词", "汉服", "国风", "文雅"]
};
const LEN_KW = { 2: ["两", "2", "二"], 3: ["三", "3"], 4: ["四", "4"] };

function extractIntent(text, prev) {
  const it = {
    pet: (prev && prev.pet) || "any",
    gender: (prev && prev.gender) || "any",
    traits: [...((prev && prev.traits) || [])],
    hopes: [...((prev && prev.hopes) || [])],
    len: (prev && prev.len) || 2,
    avoid: (prev && prev.avoid) || ""
  };
  for (const [pet, kws] of Object.entries(PET_KW)) {
    if (kws.some((k) => text.includes(k))) it.pet = pet;
  }
  for (const [g, kws] of Object.entries(GENDER_KW)) {
    if (kws.some((k) => text.includes(k))) it.gender = g;
  }
  for (const [trait, kws] of Object.entries(TRAIT_ALIAS)) {
    if (kws.some((k) => text.includes(k)) && it.traits.indexOf(trait) === -1) it.traits.push(trait);
  }
  for (const [hope, kws] of Object.entries(HOPE_ALIAS)) {
    if (kws.some((k) => text.includes(k)) && it.hopes.indexOf(hope) === -1) it.hopes.push(hope);
  }
  for (const [len, kws] of Object.entries(LEN_KW)) {
    if (kws.some((k) => text.includes(k))) it.len = Number(len);
  }
  const avoidM = text.match(/(?:不要|别叫|避开|避免|不喜欢|忌|别用)[^，。！？!?、\s]{1,3}/);
  if (avoidM) {
    const word = avoidM[0].replace(/(?:不要|别叫|避开|避免|不喜欢|忌|别用)/, "").slice(0, 2);
    if (word) it.avoid = word;
  }
  it.traits = it.traits.slice(0, 4);
  it.hopes = it.hopes.slice(0, 4);
  return it;
}

function hasIntent(it) {
  return it.pet !== "any" || it.traits.length > 0 || it.hopes.length > 0 || it.len !== 2 || Boolean(it.avoid);
}

const WELCOME_REPLY =
  "嗨～想给你家宝贝起个名字对吧？跟我聊聊它就行，比如：\n" +
  "「我家橘猫特别粘人，想要可爱点的」\n" +
  "或者告诉我你喜欢的风格、几个字，我会记着接着聊～";

function buildChatReply(intent, result) {
  const bits = [];
  if (intent.pet !== "any") bits.push(PET_LABEL[intent.pet]);
  if (intent.gender !== "any") bits.push(intent.gender === "m" ? "弟弟" : "妹妹");
  if (intent.traits.length) bits.push("性格「" + intent.traits.join("、") + "」");
  if (intent.hopes.length) bits.push("想要「" + intent.hopes.join("、") + "」的感觉");
  if (intent.len !== 2) bits.push(intent.len + " 个字");
  const got = bits.length ? bits.join("，") : null;
  const strategy = result.strategy ? " " + result.strategy : "";
  const head = got ? ("收到～" + got + "。" + strategy) : "好嘞～";
  if (result.names && result.names.length) {
    const hint = intent.hopes[0] || (intent.traits.length ? "贴" : "可爱");
    return head + "\n我挑了几个，看看合不合眼缘：\n想再" + hint + "一点、换个字数，或者说说别的想法？直接告诉我，我马上换～";
  }
  return head + "\n再多告诉我一点：它的性格？还是你想要的感觉？（比如「粘人」「文艺」「两个字」）";
}

const CHAT_SYS_PLAIN =
  "你是「宠名社」的 AI 起名助手，一位既懂宠物、又懂中文名字的起名师傅，正在和主人自然聊天。\n" +
  "\n" +
  "【你的使命】\n" +
  "通过轻松的聊天摸清四件事：宠物类型（猫/狗/兔/仓鼠/鸟/其他）、性别、性格特质、主人想要的寓意与字数（默认两字），然后给出有温度、好记、贴合性格的中文名字。\n" +
  "\n" +
  "【起名方法论】\n" +
  "1. 观察：先聊出宠物特点——花色、性格、怪癖、和主人的故事，好名字都藏在细节里；\n" +
  "2. 定风格：按性格匹配风格——粘人→软萌/可爱，高冷→文艺/古风，贪吃→吃货，拆家→搞笑，聪明→洋气/霸气；\n" +
  "3. 定结构：默认两字名（好喊顺口）；只有主人明确要求三字/四字才换；\n" +
  "4. 避坑：避开主人提到的忌用字，避开生僻字和尴尬谐音（推荐前先在心里默念三遍）；\n" +
  "5. 给理由：每个名字附「为什么适合它」，结合主人说过的具体细节（性格、花色、故事），别写空话。\n" +
  "\n" +
  "【对话规则】\n" +
  "- 像朋友一样自然回应，每轮回复控制在 3 句话以内；\n" +
  "- 信息不足时先追问（它什么性格？你想要什么感觉？几个字？），不要硬出名字；\n" +
  "- 主人给够信息后，一次推荐最多 3 个名字；\n" +
  "- 记住之前聊过的内容（类型/性格/字数/忌用字），主人改口要跟着改。\n" +
  "\n" +
  "【输出格式】必须只输出 JSON：{\"reply\":\"对主人说的话（3 句话内）\",\"names\":[{\"name\":\"名字\",\"meaning\":\"一句话含义\",\"reason\":\"为什么适合这只宠物\"}],\"ask\":\"可选追问，没有就空字符串\"}。\n" +
  "名字最多 3 个；信息不足时 reply 里自然追问、names 给空数组；不要输出 JSON 以外的任何文字。";

/* ================= 知识库检索（暂未启用） =================
 * 说明：曾尝试把站内 SQLite 名字库（994 条）注入给模型作为参考，
 * 用户决定暂不接入该库（数据质量待整理、与生成器功能重复）。
 * 等知识库数据源确定后再在 chat() 中启用 queryKnowledge + buildChatSys。
 */

function queryKnowledge(intent, limit = 20) {
  const lib = getNameLib();
  if (!lib.length) return [];
  const wantStyles = new Set();
  intent.traits.forEach((t) => (TRAIT_STYLE[t] || []).forEach((s) => wantStyles.add(s)));
  intent.hopes.forEach((h) => (HOPE_STYLE[h] || []).forEach((s) => wantStyles.add(s)));
  const pool = lib.filter((x) => {
    if (x.p.indexOf(intent.pet) === -1 && x.p.indexOf("any") === -1) return false;
    if (intent.gender !== "any" && x.g !== "any" && x.g !== intent.gender) return false;
    return true;
  });
  const scored = pool.map((x) => {
    let s = 0;
    x.s.forEach((st) => { if (wantStyles.has(st)) s += 2; });
    if (x.n.length === intent.len) s += 1;
    if (x.m) {
      s += 0.5; // 有释义的名字优先给模型参考
      intent.hopes.forEach((h) => {
        (HOPE_KW[h] || []).forEach((k) => { if (x.m.indexOf(k) > -1) s += 1.5; });
      });
    }
    return { x, s };
  });
  scored.sort((a, b) => b.s - a.s || a.x.n.length - b.x.n.length);
  return scored.slice(0, limit).map((o) => o.x);
}

function buildChatSys(intent, kb) {
  const kbText = kb.length
    ? kb.map((x) => "- " + x.n + "（" + x.s.map((s) => STYLE_LABEL[s] || s).join("/") + "）" + (x.m ? "：" + x.m : "")).join("\n")
    : "（当前话题下没有特别贴合的候选，可以基于风格自由发挥，但要在 reason 里说明是现想的）";
  return [
    "你是「宠名社」的 AI 起名助手，一位特别懂宠物的老牌起名师傅，正在和主人像朋友一样自然聊天。",
    "",
    "【你的任务】",
    "通过聊天摸清宠物的类型、性别、性格，以及主人想要的寓意和字数（默认两字），再给出有温度、好记、贴合性格的名字。",
    "",
    "【站内名字库（优先参考，别乱编）】",
    "下面是本站名字库按当前聊天话题筛出的最相关候选（名字＋风格标签＋释义）：",
    kbText,
    "",
    "【行为规则】",
    "1. 先自然回应主人；信息不足（还不知道宠物类型/性格/想要的感觉）时先追问，不硬凑名字。",
    "2. 推荐名字最多 3 个：优先从上面名字库里挑贴合的；库内确实没有合适的，可以自己创作，但要在该名字的 reason 里说明「站内没有，我现想的」。",
    "3. 每个名字都要给出：名字、一句话含义、为什么适合（结合主人说过的性格/寓意）。",
    "4. 避开主人明确提到的忌用字；主人没说字数时默认两字，说三字/四字才换。",
    "5. 语气亲切、简短，像懂宠物的朋友，不要像客服。",
    "",
    "【输出格式】必须只输出 JSON，不要输出 JSON 以外的任何文字：",
    '{"reply":"对主人说的话（控制在3句话内，先回应再给建议）","names":[{"name":"名字","meaning":"一句话含义","reason":"为什么适合"}],"ask":"一个可选的追问问题，没有就给空字符串"}'
  ].join("\n");
}

async function chat(messages, config) {
  // 只从用户消息提取意图，避免 AI 回复里的字污染
  const history = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const intent = extractIntent(history, null);

  // 真实模型：直接看历史聊天，对话式回复
  if (config.provider !== "mock" && config.apiKey) {
    try {
      const text = await chatCompletion({
        baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey, json: true, temperature: 0.9,
        messages: [{ role: "system", content: CHAT_SYS_PLAIN }, ...messages.slice(-10)]
      });
      const data = extractJson(text);
      const names = Array.isArray(data.names)
        ? data.names.map((n) => ({
            name: String(n.name || "").trim(),
            meaning: String(n.meaning || "").trim(),
            reason: String(n.reason || "").trim(),
            tags: Array.isArray(n.tags) ? n.tags.map(String).slice(0, 3) : [],
            pet: intent.pet
          })).filter((n) => n.name)
        : [];
      return {
        reply: String(data.reply || "").slice(0, 300),
        names: names.slice(0, 3),
        ask: String(data.ask || "").slice(0, 80),
        intent,
        engine: modelLabel(config),
        mode: "ai"
      };
    } catch (err) {
      // 降级到本地对话
      const local = localChat(messages, intent, config);
      local.engine = modelLabel(config) + "（降级）";
      local.mode = "fallback";
      local.note = "AI 模型调用失败，已用本地引擎兜底：" + err.message;
      return local;
    }
  }
  return localChat(messages, intent, config);
}

function localChat(messages, intent, config) {
  const users = messages.filter((m) => m.role === "user");
  const lastText = users.length ? users[users.length - 1].content : "";
  const wantName = /起名|名字|叫什么|取个|起个|给它|叫它|推荐|想一个/.test(lastText);

  if (!hasIntent(intent)) {
    return { reply: WELCOME_REPLY, names: [], ask: "它是什么宝贝呀？", intent, engine: "本地引擎", mode: "mock" };
  }

  // 只聊到宠物类型（还没说性格/风格）→ 先引导，不急着出名字
  const petOnly = intent.pet !== "any" && !intent.traits.length && !intent.hopes.length && intent.len === 2 && !intent.avoid;
  if (petOnly && !wantName) {
    return {
      reply: "「" + PET_LABEL[intent.pet] + "」呀，喜欢！再告诉我一点它的性格，或者你想要的感觉？\n比如「特别粘人」「想要文艺一点的」，我就能开动啦～",
      names: [], ask: "它是什么性格？",
      intent, engine: "本地引擎", mode: "mock"
    };
  }

  const input = normalizeInput(intent);
  const result = mockEngine(input);
  return {
    reply: buildChatReply(intent, result),
    names: result.names,
    ask: "",
    intent,
    engine: result.engine,
    mode: result.mode
  };
}

/* ================= 入口 ================= */

async function runAgent(rawInput, config) {
  const input = normalizeInput(rawInput);
  if (config.provider === "mock" || !config.apiKey) {
    return mockEngine(input);
  }
  try {
    const plan = await planStep(input, config);
    const candidates = await generateStep(input, plan, config);
    const names = evaluateStep(input, candidates);
    return {
      names,
      engine: modelLabel(config),
      mode: "ai",
      strategy: plan.strategy || undefined
    };
  } catch (err) {
    const mock = mockEngine(input);
    mock.engine = modelLabel(config) + "（降级）";
    mock.mode = "fallback";
    mock.note = "AI 模型调用失败，已用本地引擎兜底：" + err.message;
    return mock;
  }
}

module.exports = { runAgent, mockEngine, normalizeInput, chat, extractIntent };
