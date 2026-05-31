'use strict';

const https = require('https');

class FeishuService {
  constructor() {
    this.appId     = process.env.FEISHU_APP_ID;
    this.appSecret = process.env.FEISHU_APP_SECRET;
    this._token       = null;
    this._tokenExpire = 0;
    this._userToken       = null;
    this._userTokenExpire = 0;
    this._refreshToken    = null;
    this._userAppId     = null;
    this._userAppSecret = null;
  }

  setUserToken(accessToken, expiresIn, refreshToken) {
    this._userToken       = accessToken;
    this._userTokenExpire = Date.now() + (expiresIn - 60) * 1000;
    if (refreshToken) this._refreshToken = refreshToken;
  }

  isUserLoggedIn() {
    return !!this._userToken && Date.now() < this._userTokenExpire;
  }

  logout() {
    this._userToken       = null;
    this._userTokenExpire = 0;
    this._refreshToken    = null;
    this.clearUserCredentials();
  }

  setUserCredentials(appId, appSecret) {
    this._userAppId     = appId;
    this._userAppSecret = appSecret;
    this._token       = null;
    this._tokenExpire = 0;
  }

  clearUserCredentials() {
    this._userAppId     = null;
    this._userAppSecret = null;
    this._token       = null;
    this._tokenExpire = 0;
  }

  getEffectiveAppId() {
    return this._userAppId || this.appId;
  }

  getEffectiveAppSecret() {
    return this._userAppSecret || this.appSecret;
  }

  async _refreshUserToken() {
    if (!this._refreshToken) return false;
    const body = JSON.stringify({
      grant_type:    'refresh_token',
      refresh_token: this._refreshToken,
      client_id:     this.appId,
      client_secret: this.appSecret,
    });
    const res = await this._request({
      hostname: 'accounts.feishu.cn',
      path:     '/open-apis/authen/v2/oauth/token',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, body);
    if (res.access_token) {
      this.setUserToken(res.access_token, res.expires_in, res.refresh_token);
      return true;
    }
    return false;
  }

  async _getEffectiveToken() {
    // 优先使用用户 token
    if (this._userToken) {
      if (Date.now() < this._userTokenExpire) return this._userToken;
      if (await this._refreshUserToken()) return this._userToken;
      // 刷新失败，清除过期的用户 token，回退到 tenant token
      this._userToken = null;
      this._refreshToken = null;
    }
    return this._getToken();
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  _request(options, body = null) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`飞书响应解析失败: ${data.slice(0, 200)}`)); }
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  _get(path, token) {
    return this._request({
      hostname: 'open.feishu.cn',
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  async _getToken() {
    if (this._token && Date.now() < this._tokenExpire) return this._token;

    if (!this.appId || !this.appSecret) {
      throw new Error('缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET 环境变量');
    }

    const body = JSON.stringify({ app_id: this.appId, app_secret: this.appSecret });
    const res  = await this._request({
      hostname: 'open.feishu.cn',
      path:     '/open-apis/auth/v3/tenant_access_token/internal',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, body);

    if (res.code !== 0) throw new Error(`获取飞书 tenant_access_token 失败: ${res.msg}`);

    this._token       = res.tenant_access_token;
    this._tokenExpire = Date.now() + (res.expire - 300) * 1000; // 提前 5 分钟刷新
    return this._token;
  }

  // ── URL parsing ─────────────────────────────────────────────────────────────

  _parseUrl(url) {
    // 支持: feishu.cn/docx/{token}  feishu.cn/wiki/{token}  doubao.com/docx/{token} 等
    const m = url.match(/\/(docx|wiki|docs)\/([A-Za-z0-9_-]+)/);
    if (!m) throw new Error(`无法从 URL 中解析文档 token: ${url}`);
    return { type: m[1], token: m[2] };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async fetchDoc(docUrl) {
    const accessToken        = await this._getEffectiveToken();
    const { type, token }    = this._parseUrl(docUrl);

    console.log('[feishu] fetchDoc token type:', this._userToken === accessToken ? 'user' : 'tenant');
    console.log('[feishu] fetchDoc token prefix:', accessToken?.slice(0, 20) + '...');

    // Wiki 节点先解析出真实文档 token
    let docToken = token;
    if (type === 'wiki') {
      const wikiRes = await this._get(
        `/open-apis/wiki/v2/spaces/get_node?token=${token}`,
        accessToken
      );
      if (wikiRes.code !== 0) throw new Error(`Wiki 节点查询失败: ${wikiRes.msg}`);
      docToken = wikiRes.data?.node?.obj_token;
      if (!docToken) throw new Error('Wiki 节点未返回 obj_token');
    }

    // 并发获取文档元信息和正文
    const [infoRes, contentRes] = await Promise.all([
      this._get(`/open-apis/docx/v1/documents/${docToken}`,              accessToken),
      this._get(`/open-apis/docx/v1/documents/${docToken}/raw_content`,  accessToken),
    ]);

    if (infoRes.code    !== 0) { console.log('[feishu] infoRes full:', JSON.stringify(infoRes)); throw new Error(`获取文档信息失败: ${infoRes.msg}`); }
    if (contentRes.code !== 0) { console.log('[feishu] contentRes full:', JSON.stringify(contentRes)); throw new Error(`获取文档内容失败: ${contentRes.msg}`); }

    const title   = infoRes.data?.document?.title || '';
    const content = contentRes.data?.content      || '';

    if (!content.trim()) throw new Error('获取到的文档内容为空');

    return { content, title };
  }
}

module.exports = new FeishuService();
