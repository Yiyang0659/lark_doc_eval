'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const ProviderFactory = require('../core/providers/provider-factory');
const feishuService   = require('./feishu');

// ── Load external scoring config at module init (cached) ──────────────────
const SCORING_DIR = process.env.SCORING_DIR || '';

let SCORING_CRITERIA_TEXT = '';
try {
  SCORING_CRITERIA_TEXT = fs.readFileSync(
    path.join(SCORING_DIR, '评分标准.md'), 'utf-8'
  );
  console.log('[evaluator] 已加载评分标准.md');
} catch {
  console.warn('[evaluator] 未找到评分标准.md，使用内置默认标准');
}

let DIM_WEIGHTS = null;
let CONFIG_LEVELS = null;
try {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(SCORING_DIR, 'config.json'), 'utf-8')
  );
  DIM_WEIGHTS = Object.fromEntries(
    cfg.scoring.dimensions.map(d => [d.id, d.weight])
  );
  CONFIG_LEVELS = cfg.scoring.levels
    .sort((a, b) => b.minScore - a.minScore)
    .map(l => ({ min: l.minScore, name: l.name, icon: l.icon, color: l.color }));
  console.log('[evaluator] 已加载 config.json（等级 & 权重）');
} catch {
  console.warn('[evaluator] 未找到 config.json，使用内置默认等级与权重');
}

// ── Level & weight definitions (external config or built-in fallback) ──────
const LEVELS = CONFIG_LEVELS || [
  { min: 18, name: '卓越', icon: '🌟', color: '#FFD700' },
  { min: 15, name: '优秀', icon: '✅', color: '#4CAF50' },
  { min: 12, name: '良好', icon: '🆗', color: '#2196F3' },
  { min:  8, name: '一般', icon: '⚠️', color: '#FF9800' },
  { min:  0, name: '较差', icon: '❌', color: '#f44336' },
];

const WEIGHTS = DIM_WEIGHTS || {
  value: 0.30, reusability: 0.25, innovation: 0.25, method: 0.20
};

// Built-in fallback criteria (used only when 评分标准.md is unavailable)
const FALLBACK_CRITERIA = `
## 评分维度说明（各项满分 5 分）

### 1. 实际价值（30%）
- 真实落地：是否已在业务中应用
- 量化收益：是否有效率/成本/周期数据
- 解决痛点：是否明确并解决了业务难题
- 落地佐证：是否有代码/截图/任务单等证据

### 2. 可复用性（25%）
- 标准化程度：是否有SOP/流程/模板
- 跨场景适用：是否支持跨团队/场景复用
- 低依赖性：新人是否可独立上手

### 3. 创新性（25%）
- 新思路/算法：是否有创新解决方案
- AI Coding 新法：是否有新颖的 AI 辅助编程方法
- 新架构设计：是否提出新的 Skill/Agent/系统架构

### 4. 方法沉淀（20%）
- 可复制性：流程/Prompt/步骤是否清晰可照做
- 完整性：逻辑是否闭环，步骤是否齐全
`;

// ── In-memory result store ──────────────────────────────────────────────────
const results = new Map();

// ── Helpers ────────────────────────────────────────────────────────────────
function getLevel(score) {
  return LEVELS.find(l => score >= l.min) || LEVELS[LEVELS.length - 1];
}

function calcWeightedScore(dims) {
  // 总分 = (value×w1 + reusability×w2 + innovation×w3 + method×w4) × 4
  // 每维度满分 5，权重之和为 1，×4 → 满分 20
  return Math.round(
    Object.entries(dims).reduce(
      (sum, [k, d]) => sum + (Number(d.score) || 0) * (WEIGHTS[k] || 0) * 4,
      0
    )
  );
}

async function fetchDocContent(url) {
  return await feishuService.fetchDoc(url);
}

function buildPrompt(docUrl, docContent) {
  const criteria = SCORING_CRITERIA_TEXT || FALLBACK_CRITERIA;

  const contentSection = docContent
    ? `文档内容（前 10000 字符）：\n${docContent}`
    : `（无法自动获取文档内容，请基于文档 URL 特征和已知上下文进行评估）`;

  return `你是一位专业的文档质量评估专家。请严格按照以下评分标准对文档进行逐维度评估并打分。

━━━━━━━━━━━━━━━━━━━━━━━━ 评分标准 ━━━━━━━━━━━━━━━━━━━━━━━━
${criteria}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

待评文档信息：
文档链接：${docUrl}
${contentSection}

请严格按照以下 JSON 格式返回评分结果，不要包含任何其他文字或代码块标记：

{
  "dimensions": {
    "value":       { "score": <1-5整数>, "details": ["<评价点，含子项依据>", "<评价点>", "<评价点>"] },
    "reusability": { "score": <1-5整数>, "details": ["<评价点，含子项依据>", "<评价点>", "<评价点>"] },
    "innovation":  { "score": <1-5整数>, "details": ["<评价点，含子项依据>", "<评价点>", "<评价点>"] },
    "method":      { "score": <1-5整数>, "details": ["<评价点，含子项依据>", "<评价点>", "<评价点>"] }
  },
  "summary": "<100-200字总体评价，涵盖文档的主要特点和整体质量>",
  "highlights": ["<核心优势1>", "<核心优势2>", "<核心优势3>"],
  "improvements": [
    { "suggestion": "<具体改进建议>", "dimension": "<对应维度名>", "detail": "<详细说明和预期效果>" }
  ],
  "recommendation": {
    "recommended": <true/false>,
    "reason": "<推荐/不推荐的核心原因>",
    "targetAudience": "<适合哪类读者>",
    "bestPractice": "<如何最好地使用此文档>"
  }
}

评分要求：
- 每个维度分数必须是 1-5 的整数，对照评分细则（5分=卓越，4分=优秀，3分=良好，2分=一般，1分=较差）
- details 中每条说明需对应该维度的具体子项判断结果
- 综合总分由系统按权重自动计算，无需输出 total_score`;
}

// ── Robust JSON parser for AI output ─────────────────────────────────────
function robustParseJSON(raw) {
  // 1. 先尝试标准 JSON
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let str = jsonMatch[0];

  // 2. 尝试直接解析
  try { return JSON.parse(str); } catch (_) {}

  // 3. 修复常见问题后重试
  str = str
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')  // 仅移除 ASCII 控制字符，保留中文
    .replace(/,\s*([}\]])/g, '$1');                    // 尾部逗号

  try { return JSON.parse(str); } catch (_) {}

  // 4. 最后兜底：用 Function 构造器（安全上下文中 AI 输出已限制）
  try {
    const fn = new Function('return ' + jsonMatch[0]);
    return fn();
  } catch (_) { return null; }
}

// ── Core evaluate function ─────────────────────────────────────────────────
async function evaluate(docUrl, options = {}) {
  const providerName = options.provider || process.env.DEFAULT_MODEL || 'claude';
  const provider = ProviderFactory.create(providerName, { model: options.model });

  const docContent = await fetchDocContent(docUrl);
  const prompt = buildPrompt(docUrl, docContent);
  const raw = await provider.chat(prompt, { maxTokens: 8000 });

  const parsed = robustParseJSON(raw);
  if (!parsed) throw new Error('AI 返回格式错误，无法解析评分结果');
  const dims = parsed.dimensions;
  const totalScore = calcWeightedScore(dims);

  const result = {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    docUrl,
    provider: providerName,
    total_score: totalScore,
    level: getLevel(totalScore),
    summary: parsed.summary || '',
    dimensions: dims,
    highlights: parsed.highlights || [],
    improvements: parsed.improvements || [],
    recommendation: parsed.recommendation || null,
    timestamp: new Date().toISOString()
  };

  results.set(result.id, result);
  return result;
}

function getResult(id)    { return results.get(id) || null; }
function getAllResults()   { return Array.from(results.values()); }

module.exports = { evaluate, getResult, getAllResults };
