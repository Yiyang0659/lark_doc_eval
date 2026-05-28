const fs = require('fs');
const path = require('path');

class ResultParser {
  constructor(criteriaPath = null) {
    this.criteriaPath = criteriaPath || path.join(__dirname, 'criteria.json');
    this.criteria = null;
  }

  loadCriteria() {
    if (!this.criteria) {
      const content = fs.readFileSync(this.criteriaPath, 'utf-8');
      this.criteria = JSON.parse(content);
    }
    return this.criteria;
  }

  getLevel(totalScore) {
    this.loadCriteria();
    const levels = this.criteria.scoring.levels;
    for (const level of levels) {
      if (totalScore >= level.minScore && totalScore <= level.maxScore) {
        return level;
      }
    }
    return levels[levels.length - 1];
  }

  parse(aiResponse) {
    try {
      let jsonStr = aiResponse;
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      const result = JSON.parse(jsonStr);
      return this.validate(result);
    } catch (error) {
      throw new Error(`解析AI响应失败: ${error.message}`);
    }
  }

  validate(result) {
    const dims = ['value', 'reusability', 'innovation', 'method'];

    for (const dim of dims) {
      if (!result.dimensions || !result.dimensions[dim]) {
        throw new Error(`缺少维度评分: ${dim}`);
      }
      const score = result.dimensions[dim].score;
      if (typeof score !== 'number' || score < 1 || score > 5) {
        throw new Error(`维度 ${dim} 评分无效: ${score}`);
      }
    }

    const totalScore = this.calcTotal(result.dimensions);
    const level = this.getLevel(totalScore);

    return {
      dimensions: {
        value:       { score: result.dimensions.value.score,       details: result.dimensions.value.details || [] },
        reusability: { score: result.dimensions.reusability.score, details: result.dimensions.reusability.details || [] },
        innovation:  { score: result.dimensions.innovation.score,  details: result.dimensions.innovation.details || [] },
        method:      { score: result.dimensions.method.score,      details: result.dimensions.method.details || [] }
      },
      total_score: totalScore,
      level,
      summary: result.summary || '',
      highlights: result.highlights || [],
      improvements: result.improvements || [],
      recommendation: result.recommendation || {}
    };
  }

  calcTotal(dimensions) {
    const weights = { value: 0.30, reusability: 0.25, innovation: 0.25, method: 0.20 };
    let total = 0;
    for (const [dim, weight] of Object.entries(weights)) {
      total += dimensions[dim].score * weight * 20;
    }
    return Math.round(total * 10) / 10;
  }
}

module.exports = ResultParser;
