const Anthropic = require('@anthropic-ai/sdk');
const BaseProvider = require('./base-provider');

class ClaudeProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    const baseURL = config.baseURL || process.env.ANTHROPIC_BASE_URL;
    const authToken = config.authToken || process.env.ANTHROPIC_AUTH_TOKEN;
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

    const clientOptions = {
      apiKey: apiKey || 'placeholder',
      ...(baseURL && { baseURL }),
      ...(authToken && {
        defaultHeaders: { Authorization: `Bearer ${authToken}` }
      })
    };

    this.client = new Anthropic(clientOptions);
    this.defaultModel = config.model || process.env.DEFAULT_CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  }

  async chat(prompt, options = {}) {
    const model = options.model || this.defaultModel;
    const maxTokens = options.maxTokens || 4096;

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  }

  getModels() {
    return [
      { id: 'mimo-v2.5-pro',  name: 'MiMo v2.5 Pro (Opus)' },
      { id: 'mimo-v2-pro',    name: 'MiMo v2 Pro (Sonnet)' }
    ];
  }
}

module.exports = ClaudeProvider;
