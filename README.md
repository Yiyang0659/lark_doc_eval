# 飞书文档 AI 智能评分系统

基于 AI 的飞书文档质量评估工具，支持四维度自动评分并导出报告。

---

## 目录结构

```
doc-evaluator/
├── frontend/                        # 前端页面
│   ├── index.html                   # 主页面（输入链接、展示结果）
│   ├── css/
│   │   └── style.css                # 页面样式
│   └── js/
│       └── app.js                   # 前端交互逻辑（API调用、图表渲染）
│
└── backend/                         # 后端服务
    ├── server.js                    # Express 服务器入口，端口 3000
    ├── .env                         # 环境变量（API Key、飞书配置等）
    ├── .env.example                 # 环境变量示例模板
    ├── package.json                 # 依赖配置
    │
    ├── routes/
    │   └── evaluate.js              # API 路由（评分、导出、历史记录）
    │
    ├── services/                    # 业务服务层
    │   ├── feishu.js                # 飞书文档获取（调用 lark-cli）
    │   ├── evaluator.js             # 评分编排（文档获取→AI评分→结果格式化）
    │   ├── exporter.js              # 报告生成（Markdown / HTML 格式）
    │   └── doc-parser-client.js     # 文档解析客户端（备用）
    │
    └── core/                        # 核心模块（主要修改区域）
        │
        ├── providers/               # AI 提供商（修改 API 调用改这里）
        │   ├── base-provider.js     # 抽象基类，定义统一 chat() 接口
        │   ├── claude-provider.js   # Claude (Anthropic) API 实现
        │   ├── openai-provider.js   # OpenAI (GPT) API 实现
        │   └── provider-factory.js  # 工厂类，根据配置创建对应实例
        │
        └── scoring/                 # 评分引擎（修改评分逻辑改这里）
            ├── criteria.json        # 评分规则配置（维度/权重/标准）
            ├── prompt-builder.js    # 读取 criteria.json，构建 AI Prompt
            ├── result-parser.js     # 解析 AI 返回结果，计算加权总分
            └── scoring-engine.js    # 评分引擎主入口，编排评分流程
```

---

## 评分维度

| 维度 | 权重 | 说明 |
|------|------|------|
| 实际价值 | 30% | 是否真实落地、有量化收益、解决痛点 |
| 可复用性 | 25% | 是否有 SOP/模板、可跨团队复用 |
| 创新性   | 25% | 是否有新思路、新 AI 方法、新架构 |
| 方法沉淀 | 20% | 步骤是否清晰可复制、逻辑是否闭环 |

- 每个维度 1-5 分，综合得分满分 **20 分**
- 等级划分：🌟 卓越（18-20）/ ✅ 优秀（15-17）/ 🆗 良好（12-14）/ ⚠️ 一般（8-11）/ ❌ 较差（4-7）

---

## 快速启动

### 1. 安装 lark-cli（飞书文档获取依赖）

```bash
# 安装 lark-cli
npm install -g @anthropic-ai/lark-cli

# 配置飞书应用
lark-cli config init --app-id <your_app_id> --app-secret-stdin --brand feishu

# 用户授权登录（需扫描二维码）
lark-cli auth login --scope "docx:document:readonly wiki:node:read"
```

### 2. 配置环境变量

编辑 `backend/.env`：

```env
# AI API配置（使用 Anthropic 代理）
ANTHROPIC_API_KEY=
ANTHROPIC_AUTH_TOKEN=your_auth_token
ANTHROPIC_BASE_URL=https://your-proxy-url/anthropic

# 默认设置
DEFAULT_MODEL=claude
DEFAULT_CLAUDE_MODEL=mimo-v2.5-pro

# 评分标准目录（评分标准.md 和 config.json 所在路径）
SCORING_DIR=D:\path\to\评分标准

# 服务器
PORT=3000
```

### 3. 安装依赖并启动

```bash
cd backend
npm install
npm start
```

### 4. 访问页面

浏览器打开 [http://localhost:3000](http://localhost:3000)

---

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/evaluate` | 提交飞书链接，返回评分结果 |
| GET  | `/api/result/:id` | 获取指定评分结果 |
| GET  | `/api/export/:id/markdown` | 导出 Markdown 报告 |
| GET  | `/api/export/:id/html` | 导出 HTML 报告 |
| GET  | `/api/history` | 获取所有历史评分记录 |
| GET  | `/api/providers` | 获取支持的 AI 提供商列表 |

---

## 修改指南

| 需求 | 修改文件 |
|------|----------|
| 调整评分标准/权重 | `SCORING_DIR` 目录下的 `评分标准.md` 和 `config.json` |
| 修改 AI Prompt | `backend/services/evaluator.js` 中的 `buildPrompt()` |
| 调整结果解析逻辑 | `backend/services/evaluator.js` 中的 `robustParseJSON()` |
| 更换/新增 AI 模型 | `backend/core/providers/` 下对应文件 |
| 修改报告输出格式 | `backend/services/exporter.js` |
| 调整加权总分计算 | `backend/services/evaluator.js` 中的 `calcWeightedScore()` |

---

## 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JS + Chart.js（雷达图）
- **文档获取**: lark-cli（飞书 CLI 工具）
- **AI 模型**: Anthropic Claude（支持代理）/ OpenAI GPT
