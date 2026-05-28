const PromptBuilder = require('./prompt-builder');
const ResultParser = require('./result-parser');

class ScoringEngine {
  constructor(provider, options = {}) {
    this.provider = provider;
    this.promptBuilder = new PromptBuilder(options.criteriaPath);
    this.resultParser = new ResultParser(options.criteriaPath);
  }

  async evaluate(documentContent) {
    this.promptBuilder.loadCriteria();
    const prompt = this.promptBuilder.buildPrompt(documentContent);
    const aiResponse = await this.provider.chat(prompt);
    return this.resultParser.parse(aiResponse);
  }
}

module.exports = ScoringEngine;
