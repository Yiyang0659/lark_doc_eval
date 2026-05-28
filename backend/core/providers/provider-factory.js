const ClaudeProvider = require('./claude-provider');
const OpenAIProvider = require('./openai-provider');

class ProviderFactory {
  static create(providerName, config = {}) {
    switch (providerName.toLowerCase()) {
      case 'claude':
        return new ClaudeProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      default:
        throw new Error(`未知的AI提供商: ${providerName}`);
    }
  }

  static getSupportedProviders() {
    return [
      { id: 'claude', name: 'Claude (Anthropic)' },
      { id: 'openai', name: 'OpenAI (GPT)' }
    ];
  }
}

module.exports = ProviderFactory;
