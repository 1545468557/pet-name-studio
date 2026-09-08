# 宠物起名事务所 · Pet Name Studio

> Hot take: 给宠物起名，比给人起名还认真。

给猫、狗、兔子、仓鼠、小鸟起名字的暖萌网页工具 + AI Agent 起名后端。设计风格：暖萌卡通手绘（奶油底色、珊瑚橙主色、快乐体标题），App 式多画面切换，每个画面配猫狗插画。

## 功能特性

**多画面站点**
- **首页**：华丽入场动画、宠物跑马灯、统计条、今日幸运名、四张功能入口卡
- **起名神器**：按宠物类型、性别、8 种风格（可爱/文艺/霸气/搞笑/吃货/古风/洋气/软萌）、数量筛选，约 210 个手挑名字，支持收藏 / 复制 / 换一个
- **AI 定制（Agent）**：选性格、寓意、字数、忌用字 → 后端 Agent 三步编排（规划策略 → 生成候选 → 质检打分）→ 返回带理由的名字卡
- **名字灵感 / 起名指南 / 常见问题**：人气名字卡、四步起名法、避坑指南、FAQ
- 画面切换带 GSAP 动画，支持 hash 定位直达（`#ai`、`#generator`…）

**后端 Agent（Node.js）**
- 三步编排：① 大模型产出起名策略 → ② 带着策略生成 8 个候选 → ③ 代码层质检（字数 / 忌用字 / 去重 / 打分）
- 模型可插拔：火山豆包、DeepSeek、通义、智谱、Kimi 等 OpenAI 兼容接口，改 `.env` 即切换
- 未配置 Key 时自动使用本地规则引擎（mock），模型调用失败时自动降级兜底，体验不断档
- 简单限流、健康检查、源码不对外暴露

**名字库后台管理（SQLite）**
- 名字库落库（`node:sqlite`，零依赖单文件 `petname.db`），首次启动自动导入种子数据
- 后台管理页 `http://localhost:3000/admin`：搜索、分页、新增、编辑、删除、热门标记、风格/宠物分布统计
- 管理端增删改**立即生效**：前台页面启动时从 `/api/names` 拉取，AI Agent 质检与兜底直接从数据库读取
- 部署时在 `.env` 设置 `ADMIN_TOKEN` 保护管理接口（本地留空即开放）

## 快速开始

```bash
npm install          # 安装依赖（仅 express）
npm start            # 启动服务
# 浏览器打开 http://localhost:3000
```

不开后端也能用：直接用浏览器打开 `index.html`，AI 定制会自动回退到本地引擎。

## 接入真实 AI（可选）

复制 `.env.example` 为 `.env`，填入模型配置：

```bash
AI_PROVIDER=openai             # mock = 本地引擎 | openai = 各家兼容接口
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
AI_API_KEY=sk-你的key
PORT=3000
RATE_LIMIT=30
```

各家 OpenAI 兼容接口速查（详见 `.env.example` 注释）：

| 模型 | Base URL | 示例 Model |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 火山豆包 | `https://ark.cn-beijing.volces.com/api/v3` | 推理接入点 ID |

配置后重启：`npm start`。AI 定制画面会显示「由 模型名 生成」；失败自动降级。

## 部署到服务器

项目是一个 Node 服务（同源托管页面 + API），部署方式与普通 Node 应用一致：

```bash
# 生产环境
npm ci --omit=dev
AI_PROVIDER=openai AI_BASE_URL=... AI_MODEL=... AI_API_KEY=... PORT=8080 node server.js
```

- 推荐用 `pm2 start server.js` 守护进程，或用 systemd / Docker 托管
- 部署后无需反向代理即可同源访问；若前面有 Nginx 代理，把 `/` 转发到 Node 端口即可
- Key 只在服务端 `.env`（已 gitignore），不会进入前端代码

## 技术栈

- 前端：原生 HTML / CSS / JavaScript（无框架）+ GSAP 3（jsDelivr + SRI）
- 后端：Node.js ≥ 18 + Express
- 字体：ZCOOL KuaiLe（快乐体）与 Noto Sans SC（自托管镜像）
- 插画：AI 生成暖萌猫狗插画（CDN 直引）

## 目录结构

```
pet-name-studio/
├── index.html        # 前端全部页面与逻辑（单文件，启动时从服务端同步名字库）
├── admin.html        # 名字库后台管理页（搜索/分页/增删改/统计）
├── server.js         # Node 服务：托管页面 + 名字库 API + AI Agent API + 管理 API
├── agent.js          # AI Agent 三步编排（规划 → 生成 → 质检）+ 本地兜底引擎
├── lib/
│   ├── models.js     # 大模型调用适配层（OpenAI 兼容）
│   ├── db.js         # SQLite 名字库（建表/导入/CRUD/统计，权威数据源）
│   └── names.js      # 种子名字库（首次启动自动导入数据库）
├── petname.db        # SQLite 数据库文件（首次启动自动生成）
├── .env.example      # 配置模板（复制为 .env 使用）
├── package.json
└── LICENSE
```

## 自定义名字库

前端名字数据在 `index.html` 的 `NAMES` 数组；服务端同名数据在 `lib/names.js`（由前端同步生成）。每条记录格式：

```js
{ n: "团子", m: "圆滚滚的一团，只想揉脸。", g: "any", s: ["cute", "soft"], p: ["any"] }
```

- `n`：名字
- `m`：一句话释义
- `g`：性别倾向（`m` 男孩 / `f` 女孩 / `any` 通用）
- `s`：风格标签（`cute` / `artsy` / `boss` / `funny` / `food` / `ancient` / `trendy` / `soft`）
- `p`：适用宠物（`cat` / `dog` / `rabbit` / `hamster` / `bird` / `any`）

## 自定义名字库

- **管理后台**：`http://localhost:3000/admin` 可视化增删改、搜索、统计
- **批量导入**：`node scripts/import-names.js data.json`（支持 JSON/CSV，自动去重、标签白名单化、长度过滤）
- **网上采集**：`python3 scripts/scrape-names.py > data/xxx.json`，按宠物类型分类采集公开名字站，再用导入工具入库
- 已内置一份采集数据：`data/scraped-names-2026-09-07.json`（9 个公开来源、按猫/狗/兔/仓鼠/鸟分类）

## API

| 接口 | 说明 |
|---|---|
| `GET /api/health` | 健康检查，返回当前引擎与模型就绪状态 |
| `POST /api/ai-name` | AI 起名请求，body：`{ pet, gender, traits[], hopes[], len, avoid }` |
| `POST /api/ai-chat` | 对话式起名，body：`{ sessionId?, message }`，返回 `{ sessionId, reply, names[], engine, mode }`；服务端会话保留最多 30 轮 |
| `GET /api/names` | 名字库（公开，前台启动时同步） |
| `GET /api/admin/stats` | 名字库统计（需令牌） |
| `GET /api/admin/names` | 名字列表：`?q=关键词&page=1&limit=20`（需令牌） |
| `POST /api/admin/names` | 新增名字 `{ n, m, g, s[], p[], hot }`（需令牌） |
| `GET/PUT/DELETE /api/admin/names/:id` | 按 ID 查看 / 编辑 / 删除（需令牌） |

管理接口请求头：`X-Admin-Token: <ADMIN_TOKEN>`。未设置 `ADMIN_TOKEN` 时本地直接放行。

## 许可证

[MIT](LICENSE) © 2026 [1545468557](https://github.com/1545468557)

名字仅供娱乐参考，最终解释权归毛孩子所有。
