# 宠物起名事务所 · Pet Name Studio

> Hot take: 给宠物起名，比给人起名还认真。

给猫、狗、兔子、仓鼠、小鸟起名字的轻量网页工具。设计风格致敬 [aardvarkbookclub.com](https://aardvarkbookclub.com/)：大胆粗体排版、青蓝色高亮块、拼贴插画与黑白线条步骤插画。

## 功能特性

- **一键起名**：按宠物类型（猫 / 狗 / 兔子 / 仓鼠 / 鸟 / 通用）、性别、风格筛选，随机抽取名字
- **八种风格**：可爱、文艺、霸气、搞笑、吃货、古风、洋气、软萌，支持多选
- **名字库**：约 210 个编辑手挑的名字，每条都带一句话释义
- **卡片操作**：单个名字支持「复制」与「换一个」，筛选太严格时自动放宽
- **纯前端**：原生 HTML / CSS / JS 单文件，无需构建、无需后端，双击即开

## 快速开始

直接用浏览器打开 `index.html` 即可使用。

```bash
# 本地预览（任选其一）
open index.html
python3 -m http.server 8000   # 然后访问 http://localhost:8000
```

## 技术栈

- 原生 HTML / CSS / JavaScript（单文件，无框架、无构建工具）
- 字体：Noto Sans SC（自托管镜像加载）
- 插画：AI 生成的拼贴插画与黑白线条插画

## 目录结构

```
pet-name-studio/
├── index.html   # 全部页面结构与逻辑（单文件）
├── README.md
└── LICENSE
```

## 自定义名字库

所有名字数据都在 `index.html` 底部的 `<script>` 中（`NAMES` 数组）。每条记录格式：

```js
{ n: "团子", m: "圆滚滚的一团，只想揉脸。", g: "any", s: ["cute", "soft"], p: ["any"] }
```

- `n`：名字
- `m`：一句话释义
- `g`：性别倾向（`m` 男孩 / `f` 女孩 / `any` 通用）
- `s`：风格标签（`cute` / `artsy` / `boss` / `funny` / `food` / `ancient` / `trendy` / `soft`）
- `p`：适用宠物（`cat` / `dog` / `rabbit` / `hamster` / `bird` / `any`）

## 许可证

[MIT](LICENSE) © 2026 [1545468557](https://github.com/1545468557)

名字仅供娱乐参考，最终解释权归毛孩子所有。
