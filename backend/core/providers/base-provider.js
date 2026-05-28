class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  async chat(prompt, options = {}) {
    throw new Error('子类必须实现chat方法');
  }

  getModels() {
    throw new Error('子类必须实现getModels方法');
  }
}

module.exports = BaseProvider;
