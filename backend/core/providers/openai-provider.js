const OpenAI = require('openai');
const BaseProvider = require('./base-provider');

class OpenAIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY
    });
    this.defaultModel = config.model || process.env.DEFAULT_OPENAI_MODEL || 'gpt-4o';
  }

  async chat(prompt, options = {}) {
    const model = options.model || this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    return response.choices[0].message.content;
  }

  getModels() {
    return [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
    ];
  }
}

module.exports = OpenAIProvider;
