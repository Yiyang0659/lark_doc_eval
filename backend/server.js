require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const evaluateRoutes = require('./routes/evaluate');
const feishuService = require('./services/feishu');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', evaluateRoutes);

// ── 飞书 OAuth 登录 ──────────────────────────────────────────────────────────

function httpsPost(hostname, reqPath, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path:     reqPath,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`响应解析失败: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 返回登录 URL
app.get('/auth/feishu/login', (req, res) => {
  const appId      = feishuService.getEffectiveAppId();
  const redirectUri = encodeURIComponent(process.env.FEISHU_REDIRECT_URI || 'http://localhost:3000/auth/feishu/callback');
  const scopes     = [
    'wiki:node:read',
    'docx:document:readonly',
    'drive:drive:readonly',
  ].join(' ');
  const authUrl = `https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent(scopes)}&prompt=login`;
  res.json({ authUrl });
});

// OAuth 回调
app.get('/auth/feishu/callback', async (req, res) => {
  const { code, error } = req.query;

  const errorPage = (title, detail, status = 400) => {
    res.status(status).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#09090b;color:#fafafa}
.box{text-align:center;max-width:420px;padding:40px}.box h2{color:#f87171;margin-bottom:12px;font-size:20px}
.box p{color:#a1a1aa;margin-bottom:24px;line-height:1.6;font-size:14px}
.btns{display:flex;gap:12px;justify-content:center}
.btns button{padding:10px 24px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;transition:opacity .2s}
.btns button:hover{opacity:.85}
.btn-close{background:#3f3f46;color:#fafafa}
.btn-back{background:#818cf8;color:#fff}
.code{color:#f87171;font-family:monospace;font-size:13px;background:#18181b;padding:4px 10px;border-radius:6px;display:inline-block;margin-top:8px}</style></head>
<body><div class="box"><h2>❌ ${title}</h2><p>${detail}</p>
<div class="btns"><button class="btn-close" onclick="window.close()">关闭窗口</button>
<button class="btn-back" onclick="try{window.opener&&window.opener.focus()}catch(e){};window.close()">返回评分页</button></div></div></body></html>`);
  };

  if (error) {
    return errorPage('授权失败', `飞书返回错误：<span class="code">${error}</span><br>请关闭此窗口，确认权限后重试，或切换账号登录。`);
  }
  if (!code) {
    return errorPage('缺少授权码', '未收到飞书授权码，请关闭窗口后重新点击「飞书授权登录」。');
  }

  try {
    const body = JSON.stringify({
      grant_type:    'authorization_code',
      code,
      client_id:     feishuService.getEffectiveAppId(),
      client_secret: feishuService.getEffectiveAppSecret(),
      redirect_uri:  process.env.FEISHU_REDIRECT_URI || 'http://localhost:3000/auth/feishu/callback',
    });
    const tokenRes = await httpsPost('accounts.feishu.cn', '/open-apis/authen/v2/oauth/token', body);

    if (tokenRes.access_token) {
      feishuService.setUserToken(tokenRes.access_token, tokenRes.expires_in, tokenRes.refresh_token);
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>登录成功</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#09090b;color:#fafafa}
.ok{text-align:center}.ok h2{color:#34d399;margin-bottom:12px}a{color:#818cf8}</style></head>
<body><div class="ok"><h2>✅ 登录成功</h2><p>可以关闭此窗口，返回评分页面操作</p><p><a href="https://yiyang0659.github.io/lark_doc_eval/">← 返回评分页面</a></p></div>
<script>
  try{window.opener.postMessage("feishu-login-success","*")}catch(e){}
  setTimeout(function(){try{window.close()}catch(e){}},300);
</script></body></html>`);
    } else {
      return errorPage('获取 Token 失败', `飞书返回：<span class="code">${JSON.stringify(tokenRes).slice(0,200)}</span>`);
    }
  } catch (e) {
    return errorPage('登录异常', `服务器错误：<span class="code">${e.message}</span>`, 500);
  }
});

// 登录状态
app.get('/auth/feishu/status', (req, res) => {
  res.json({ loggedIn: feishuService.isUserLoggedIn() });
});

// 保存自定义飞书应用配置
app.post('/auth/feishu/config', (req, res) => {
  const { appId, appSecret } = req.body;
  if (!appId || !appSecret) {
    return res.status(400).json({ error: 'App ID 和 App Secret 不能为空' });
  }
  feishuService.setUserCredentials(appId, appSecret);
  res.json({ ok: true });
});

// 获取当前应用配置状态
app.get('/auth/feishu/config', (req, res) => {
  res.json({
    hasCustomConfig: feishuService._userAppId != null,
    appId: feishuService._userAppId || '',
  });
});

// 退出登录
app.post('/auth/feishu/logout', (req, res) => {
  feishuService.logout();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
}).setTimeout(600000); // 10 分钟超时，AI 评分需要较长时间
