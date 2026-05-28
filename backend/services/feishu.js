const { execSync } = require('child_process');

class FeishuService {
  constructor() {
    this.appId = process.env.FEISHU_APP_ID || '';
    this.appSecret = process.env.FEISHU_APP_SECRET || '';
    this.identity = process.env.FEISHU_IDENTITY || 'user';
  }

  async fetchDoc(docUrl) {
    try {
      // 构建 lark-cli 命令，支持从 .env 读取应用凭证
      let cmd = `lark-cli docs +fetch --doc "${docUrl}" --api-version v2 --doc-format markdown --format json`;

      // 如果配置了应用凭证，直接传入（不依赖本地 lark-cli 配置）
      if (this.appId && this.appSecret) {
        cmd = `echo "${this.appSecret}" | lark-cli docs +fetch --doc "${docUrl}" --api-version v2 --doc-format markdown --format json --app-id ${this.appId} --app-secret-stdin`;
      }

      // 指定身份模式
      cmd += ` --as ${this.identity}`;

      const output = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });

      const json = JSON.parse(output);

      if (json.ok === false) {
        const msg = json?.error?.message || '未知错误';
        throw new Error(`飞书接口错误: ${msg}`);
      }

      const content = this.extractContent(json);

      if (!content || content.trim().length === 0) {
        throw new Error('获取到的文档内容为空');
      }

      return content;
    } catch (error) {
      if (error.stderr) {
        try {
          const errJson = JSON.parse(error.stderr);
          const msg = errJson?.error?.message || errJson?.message || error.stderr;
          throw new Error(`飞书接口错误: ${msg}`);
        } catch (_) {
          throw new Error(`lark-cli 执行失败: ${error.stderr}`);
        }
      }
      throw new Error(`获取飞书文档失败: ${error.message}`);
    }
  }

  extractContent(json) {
    // 实际返回结构: { ok: true, data: { document: { content: "..." } } }
    if (json.data?.document?.content) return json.data.document.content;
    if (json.data?.markdown) return json.data.markdown;
    if (json.data?.content) return json.data.content;
    if (json.markdown) return json.markdown;
    if (json.content) return json.content;
    if (typeof json === 'string') return json;

    return JSON.stringify(json, null, 2);
  }
}

module.exports = new FeishuService();
