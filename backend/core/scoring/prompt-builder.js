const fs = require('fs');
const path = require('path');

class PromptBuilder {
  constructor(criteriaPath = null) {
    this.criteriaPath = criteriaPath || path.join(__dirname, 'criteria.json');
    this.criteria = null;
  }

  loadCriteria() {
    const content = fs.readFileSync(this.criteriaPath, 'utf-8');
    this.criteria = JSON.parse(content);
    return this.criteria;
  }

  buildPrompt(documentContent) {
    if (!this.criteria) this.loadCriteria();

    const { dimensions } = this.criteria.scoring;

    let prompt = `你是一个专业的文档质量评估专家。请根据以下评分维度和标准，对提供的飞书文档进行详细分析并打分。

## 评分维度和标准：

`;

    for (const dim of dimensions) {
      prompt += `### ${dim.icon} ${dim.name}（1-5分，权重${dim.weight * 100}%）
评估子项：
`;
      for (const sub of dim.subItems) {
        prompt += `- **${sub.name}**：${sub.description}\n`;
      }

      prompt += `\n评分细则：\n`;
      for (const [score, guide] of Object.entries(dim.scoringGuide)) {
        prompt += `- ${score}分：${guide}\n`;
      }
      prompt += '\n';
    }

    prompt += `---

## 待评估文档内容：

${documentContent}

---

## 输出要求

请严格按以下JSON格式返回评分结果（不要输出其他内容）：

{
    "total_score": 总分（四个维度加权后换算为满分20分：实际价值×0.30×20 + 可复用性×0.25×20 + 创新性×0.25×20 + 方法沉淀×0.20×20，保留一位小数，最终为XX/20的形式），
    "summary": "总体评价总结（100-200字，说明文档的整体质量、主要亮点和改进方向）",
    "dimensions": {
        "value": {
            "score": 分数（1-5整数）,
            "details": ["具体评价点1（引用文档内容）", "具体评价点2", "具体评价点3"]
        },
        "reusability": {
            "score": 分数（1-5整数）,
            "details": ["具体评价点1", "具体评价点2", "具体评价点3"]
        },
        "innovation": {
            "score": 分数（1-5整数）,
            "details": ["具体评价点1", "具体评价点2", "具体评价点3"]
        },
        "method": {
            "score": 分数（1-5整数）,
            "details": ["具体评价点1", "具体评价点2", "具体评价点3"]
        }
    },
    "highlights": ["核心优势1", "核心优势2", "核心优势3"],
    "improvements": [
        {"suggestion": "改进建议1", "dimension": "针对维度", "detail": "详细说明"},
        {"suggestion": "改进建议2", "dimension": "针对维度", "detail": "详细说明"},
        {"suggestion": "改进建议3", "dimension": "针对维度", "detail": "详细说明"}
    ],
    "recommendation": {
        "recommended": true或false,
        "reason": "推荐/不推荐理由",
        "targetAudience": "适用人群",
        "bestPractice": "如何最好地使用本文档"
    }
}

注意：
- 每个维度的score必须是1-5的整数
- details数组应包含2-4条具体的评价依据，需引用文档内容佐证
- total_score = value×0.30×20 + reusability×0.25×20 + innovation×0.25×20 + method×0.20×20，满分20分`;

    return prompt;
  }
}

module.exports = PromptBuilder;
