const API_BASE = 'https://lark-doc-eval-1.onrender.com/api';
let currentResult = null;
let radarChart = null;
let scoreRadarChart = null;

const DIM_CONFIG = [
  {
    id: 'value',
    name: '实际价值',
    icon: '📈',
    weight: 0.30,
    color: '#f59e0b',
    desc: '是否真实落地、是否具备量效收益、是否解决业务痛点',
    tags: ['ROI', '效率提升', '业务价值']
  },
  {
    id: 'reusability',
    name: '可复用性',
    icon: '♻️',
    weight: 0.25,
    color: '#06b6d4',
    desc: '是否形成 SOP / 模板 / 流程，可跨团队复用',
    tags: ['SOP', '流程化', '团队协作']
  },
  {
    id: 'innovation',
    name: '创新性',
    icon: '💡',
    weight: 0.25,
    color: '#a78bfa',
    desc: '是否有新 AI Coding 方法、Agent 架构或创新思路',
    tags: ['AI Agent', '创新架构', 'Prompt']
  },
  {
    id: 'method',
    name: '方法沉淀',
    icon: '📝',
    weight: 0.20,
    color: '#34d399',
    desc: '步骤是否完整，逻辑是否形成闭环，可直接照做',
    tags: ['可复制', '结构化', '方法论']
  }
];

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('evaluateBtn').addEventListener('click', handleEvaluate);
  document.getElementById('exportMarkdown').addEventListener('click', () => handleExport('markdown'));
  document.getElementById('exportHTML').addEventListener('click', () => handleExport('html'));
  document.getElementById('toggleChart').addEventListener('click', toggleRadar);
  document.getElementById('overviewToggleChart').addEventListener('click', toggleOverviewRadar);
  renderOverviewRadar();
  renderOverviewDimensions();
  loadScoringCriteriaBrief();
  checkLoginStatus();

  // 监听 OAuth 登录成功消息
  window.addEventListener('message', (e) => {
    if (e.data === 'feishu-login-success') checkLoginStatus();
  });
});

// ── Evaluate ──
async function handleEvaluate() {
  const docUrl = document.getElementById('docUrl').value.trim();
  const errorEl = document.getElementById('errorMsg');
  errorEl.style.display = 'none';

  if (!docUrl) { showError('请输入飞书文档链接'); return; }

  setLoading(true);
  try {
    // 第一步：提交评估任务，立即返回任务 ID
    const res = await fetch(`${API_BASE}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docUrl, provider: 'claude' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '提交失败');

    const jobId = data.id;
    console.log('[evaluate] 任务已提交, id:', jobId);

    // 第二步：轮询结果
    const result = await pollResult(jobId);
    currentResult = result;
    displayResult(result);
  } catch (err) {
    console.error('[evaluate] 异常:', err);
    showError(`评分失败：${err.message}`);
  } finally {
    setLoading(false);
  }
}

async function pollResult(id) {
  const maxAttempts = 180; // 最多 3 分钟（每秒 1 次）
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const res = await fetch(`${API_BASE}/result/${id}`);
    if (res.ok) {
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.total_score !== undefined) return data;
    }
    // 更新加载提示
    const btn = document.getElementById('evaluateBtn');
    const loadingEl = btn.querySelector('.btn-loading');
    if (loadingEl) {
      const sec = i + 1;
      loadingEl.innerHTML = `<span class="spinner"></span> AI 分析中… ${sec}s`;
    }
  }
  throw new Error('评估超时，请稍后重试');
}

function setLoading(on) {
  const btn = document.getElementById('evaluateBtn');
  btn.disabled = on;
  btn.querySelector('.btn-text').style.display = on ? 'none' : '';
  btn.querySelector('.btn-loading').style.display = on ? '' : 'none';
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Display result ──
function displayResult(result) {
  const section = document.getElementById('resultSection');
  section.style.display = 'block';

  // Hide initial page overview
  const overview = document.getElementById('dimsOverview');
  if (overview) overview.style.display = 'none';

  // Doc title: use fetched title, fall back to short URL
  const urlShort = result.docUrl.replace(/^https?:\/\//, '').split('/').slice(0, 3).join('/');
  document.getElementById('docTitle').textContent = result.docTitle || urlShort;

  // Document summary block
  const summaryBlock = document.getElementById('docSummaryBlock');
  const s = result.docSummary;
  if (s) {
    document.getElementById('docOneLine').textContent = s.one_line_intro || '';

    const detailsEl = document.getElementById('docSummaryDetails');
    const rows = [];
    if (s.background_and_pain_points?.length) {
      rows.push(`<div class="summary-row"><span class="summary-tag">背景痛点</span><span class="summary-val">${s.background_and_pain_points.slice(0,2).join('；')}</span></div>`);
    }
    if (s.core_solutions?.length) {
      rows.push(`<div class="summary-row"><span class="summary-tag">核心方案</span><span class="summary-val">${s.core_solutions.slice(0,2).join('；')}</span></div>`);
    }
    if (s.target_audience_and_scenario) {
      rows.push(`<div class="summary-row"><span class="summary-tag">适用人群</span><span class="summary-val">${s.target_audience_and_scenario}</span></div>`);
    }
    detailsEl.innerHTML = rows.join('');
    summaryBlock.style.display = '';
  } else {
    summaryBlock.style.display = 'none';
  }

  // Total score
  document.getElementById('totalScore').textContent = result.total_score;

  // Level badge
  const lvl = result.level || {};
  const badge = document.getElementById('levelBadge');
  badge.textContent = `${lvl.icon || ''} ${lvl.name || ''}`;
  badge.style.setProperty('--level-color', lvl.color || '#818cf8');

  // Summary in AI card
  document.getElementById('summaryText').textContent = result.summary || '';

  // Score progress bars
  renderScoreBars(result.dimensions);

  // Inline radar chart in score card
  renderScoreRadarChart(result.dimensions);

  // AI bubbles (highlights in AI card)
  renderAIBubbles(result.highlights || []);

  // Dimension cards
  renderDimensions(result.dimensions);

  // Radar chart (hidden, built in background)
  renderRadarChart(result.dimensions);

  // Highlights card
  renderHighlights(result.highlights || []);

  // Improvements
  renderImprovements(result.improvements || []);

  // Recommendation
  renderRecommendation(result.recommendation);

  section.scrollIntoView({ behavior: 'smooth' });
}

// ── Inline radar chart in score card (rich multi-color) ──
function renderScoreRadarChart(dimensions) {
  const canvas = document.getElementById('scoreRadarChart');
  if (!canvas) return;

  if (scoreRadarChart) { scoreRadarChart.destroy(); scoreRadarChart = null; }

  const ctx = canvas.getContext('2d');
  const scores = DIM_CONFIG.map(d => dimensions[d.id]?.score || 0);
  const colors = DIM_CONFIG.map(d => d.color);

  scoreRadarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: DIM_CONFIG.map(d => d.name),
      datasets: [
        {
          data: [5, 5, 5, 5],
          backgroundColor: 'rgba(255,255,255,0.025)',
          borderColor: 'rgba(255,255,255,0.07)',
          borderWidth: 1,
          pointRadius: 0,
          order: 3
        },
        {
          data: [2.5, 2.5, 2.5, 2.5],
          backgroundColor: 'rgba(255,255,255,0.015)',
          borderColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          pointRadius: 0,
          order: 2
        },
        {
          label: '评分',
          data: scores,
          backgroundColor: 'rgba(129,140,248,0.18)',
          borderColor: colors,
          borderWidth: 2.5,
          pointBackgroundColor: colors,
          pointBorderColor: '#18181b',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 8,
          fill: true,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 5,
          ticks: { display: false, backdropColor: 'transparent' },
          pointLabels: {
            font: { size: 10, weight: '700' },
            color: (ctx) => DIM_CONFIG[ctx.index]?.color || '#a1a1aa'
          },
          grid: { color: 'rgba(255,255,255,0.07)', lineWidth: 1 },
          angleLines: {
            color: (ctx) => (DIM_CONFIG[ctx.index]?.color || '#3f3f46') + '55'
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#18181b',
          borderColor: '#3f3f46',
          borderWidth: 1,
          titleColor: '#fafafa',
          bodyColor: '#a1a1aa',
          callbacks: {
            label: (item) => item.datasetIndex === 2 ? `${item.raw}/5 分` : null
          }
        }
      }
    }
  });
}

// ── Score progress bars (in score card) ──
function renderScoreBars(dimensions) {
  const container = document.getElementById('scoreBars');
  container.innerHTML = DIM_CONFIG.map(dim => {
    const d = dimensions[dim.id] || {};
    const pct = ((d.score || 0) / 5 * 100).toFixed(1);
    return `
      <div class="score-bar-item">
        <div class="score-bar-meta">
          <span>${dim.name}</span>
          <span class="score-bar-val" style="color:${dim.color}">${d.score || 0}/5</span>
        </div>
        <div class="score-bar-track">
          <div class="score-bar-fill" data-fill="${pct}%" style="background:${dim.color}"></div>
        </div>
      </div>`;
  }).join('');

  // Animate bars after render
  requestAnimationFrame(() => {
    container.querySelectorAll('.score-bar-fill').forEach(el => {
      el.style.width = el.dataset.fill;
    });
  });
}

// ── AI bubbles (top 3 highlights shown as chat bubbles) ──
function renderAIBubbles(highlights) {
  const el = document.getElementById('aiBubbles');
  const items = highlights.slice(0, 3);
  if (!items.length) { el.innerHTML = ''; return; }
  el.innerHTML = items.map(h => `<div class="ai-bubble">${h}</div>`).join('');
}

// ── Dimension cards ──
function renderDimensions(dimensions) {
  const container = document.getElementById('dimensionsGrid');
  container.innerHTML = DIM_CONFIG.map(dim => {
    const d = dimensions[dim.id] || {};
    const pct = ((d.score || 0) / 5 * 100).toFixed(1);
    const detailItems = (d.details || []).slice(0, 3)
      .map(det => `<li>${det}</li>`).join('');
    const tagItems = dim.tags.map(t => `<span class="dim-tag">${t}</span>`).join('');

    return `
      <div class="dim-card" style="--dim-accent:${dim.color}">
        <div class="dim-card-top">
          <div class="dim-name">${dim.icon} ${dim.name}</div>
          <div class="dim-score-badge" style="color:${dim.color}">
            ${d.score || '-'}<span class="dim-score-max">/5</span>
          </div>
        </div>
        <p class="dim-desc">${dim.desc}</p>
        <div class="dim-bar-track">
          <div class="dim-bar-fill" data-fill="${pct}%" style="background:${dim.color};box-shadow:0 0 8px ${dim.color}60"></div>
        </div>
        <ul class="dim-details-list">${detailItems}</ul>
        <div class="dim-tags">${tagItems}</div>
      </div>`;
  }).join('');

  // Animate bar fills
  requestAnimationFrame(() => {
    container.querySelectorAll('.dim-bar-fill').forEach(el => {
      el.style.width = el.dataset.fill;
    });
  });
}

// ── Highlights card (full list) ──
function renderHighlights(highlights) {
  const card = document.getElementById('highlightsCard');
  const list = document.getElementById('highlightsList');
  if (!highlights.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  list.innerHTML = highlights.map(h => `<li>${h}</li>`).join('');
}

// ── Radar chart (dimension section, dark themed with rich colors) ──
function renderRadarChart(dimensions) {
  const ctx = document.getElementById('radarChart').getContext('2d');
  if (radarChart) radarChart.destroy();

  const scores = DIM_CONFIG.map(d => dimensions[d.id]?.score || 0);
  const colors = DIM_CONFIG.map(d => d.color);

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: DIM_CONFIG.map(d => `${d.icon} ${d.name}`),
      datasets: [
        {
          data: [5, 5, 5, 5],
          backgroundColor: 'rgba(255,255,255,0.025)',
          borderColor: 'rgba(255,255,255,0.07)',
          borderWidth: 1,
          pointRadius: 0
        },
        {
          label: '评分',
          data: scores,
          backgroundColor: 'rgba(129,140,248,0.18)',
          borderColor: colors,
          borderWidth: 2.5,
          pointBackgroundColor: colors,
          pointBorderColor: '#18181b',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 9,
          fill: true
        }
      ]
    },
    options: {
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 5,
          ticks: { stepSize: 1, font: { size: 10 }, color: '#52525b', backdropColor: 'transparent' },
          pointLabels: {
            font: { size: 13, weight: '700' },
            color: (ctx) => DIM_CONFIG[ctx.index]?.color || '#a1a1aa'
          },
          grid: { color: 'rgba(255,255,255,0.07)' },
          angleLines: {
            color: (ctx) => (DIM_CONFIG[ctx.index]?.color || '#3f3f46') + '50'
          }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ── Toggle radar ──
function toggleRadar() {
  const wrap = document.getElementById('radarWrap');
  const btn  = document.getElementById('toggleChart');
  const visible = wrap.style.display !== 'none';
  wrap.style.display = visible ? 'none' : 'block';
  btn.classList.toggle('active', !visible);
}

// ── Improvements ──
function renderImprovements(improvements) {
  const tbody = document.getElementById('improvementsBody');
  if (!improvements.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#52525b;padding:20px">暂无改进建议</td></tr>';
    return;
  }
  tbody.innerHTML = improvements.map(imp => {
    if (typeof imp === 'object') {
      return `<tr><td>${imp.suggestion}</td><td>${imp.dimension || '—'}</td><td>${imp.detail || '—'}</td></tr>`;
    }
    return `<tr><td>${imp}</td><td>—</td><td>—</td></tr>`;
  }).join('');
}

// ── Recommendation ──
function renderRecommendation(rec) {
  const section = document.getElementById('recommendSection');
  if (!rec || rec.recommended === undefined) { section.innerHTML = ''; return; }

  const flag = rec.recommended;
  section.innerHTML = `
    <div class="eval-card-head">
      <span class="eval-tag ${flag ? 'tag-green' : 'tag-amber'}">
        ${flag ? '✓ 推荐阅读' : '— 暂不推荐'}
      </span>
    </div>
    <div class="rec-grid">
      <div class="rec-item">
        <div class="rec-item-label">推荐理由</div>
        <div class="rec-item-val">${rec.reason || '—'}</div>
      </div>
      <div class="rec-item">
        <div class="rec-item-label">适用人群</div>
        <div class="rec-item-val">${rec.targetAudience || '—'}</div>
      </div>
      <div class="rec-item" style="grid-column:1/-1">
        <div class="rec-item-label">最佳实践建议</div>
        <div class="rec-item-val">${rec.bestPractice || '—'}</div>
      </div>
    </div>`;
}

// ── Export ──
async function handleExport(format) {
  if (!currentResult) { alert('请先进行评分'); return; }
  window.open(`${API_BASE}/export/${currentResult.id}/${format}`, '_blank');
}

// ── History ──
async function loadHistory() {
  try {
    const res = await fetch(`${API_BASE}/history`);
    const history = await res.json();
    const container = document.getElementById('historyList');
    const countEl   = document.getElementById('historyCount');

    countEl.textContent = `${history.length} 条`;

    if (!history.length) {
      container.innerHTML = '<div class="empty-state">暂无评分记录</div>';
      return;
    }

    container.innerHTML = history
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(item => {
        const lvl = item.level || {};
        const urlShort = item.docUrl.length > 55
          ? item.docUrl.substring(0, 55) + '…'
          : item.docUrl;
        return `
          <div class="history-item" onclick="loadResult('${item.id}')">
            <span class="history-url">${urlShort}</span>
            <span class="history-score" style="color:${lvl.color || '#818cf8'}">
              ${lvl.icon || ''} ${item.total_score}/20
            </span>
            <span class="history-date">${new Date(item.timestamp).toLocaleString('zh-CN')}</span>
          </div>`;
      }).join('');
  } catch (err) {
    console.error('加载历史记录失败:', err);
  }
}

async function loadResult(id) {
  try {
    const res = await fetch(`${API_BASE}/result/${id}`);
    currentResult = await res.json();
    displayResult(currentResult);
  } catch {
    alert('加载评分结果失败');
  }
}

// ── Overview Radar (initial page, empty scores) ──
function renderOverviewRadar() {
  const canvas = document.getElementById('overviewRadarChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: DIM_CONFIG.map(d => `${d.icon} ${d.name}`),
      datasets: [
        {
          data: [5, 5, 5, 5],
          backgroundColor: 'rgba(255,255,255,0.025)',
          borderColor: 'rgba(255,255,255,0.07)',
          borderWidth: 1,
          pointRadius: 0
        },
        {
          data: [0, 0, 0, 0],
          backgroundColor: 'rgba(129,140,248,0.08)',
          borderColor: DIM_CONFIG.map(d => d.color),
          borderWidth: 2.5,
          pointBackgroundColor: DIM_CONFIG.map(d => d.color),
          pointBorderColor: '#18181b',
          pointBorderWidth: 2,
          pointRadius: 5,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 5,
          ticks: { display: false, backdropColor: 'transparent' },
          pointLabels: {
            font: { size: 12, weight: '700' },
            color: (ctx) => DIM_CONFIG[ctx.index]?.color || '#a1a1aa'
          },
          grid: { color: 'rgba(255,255,255,0.07)' },
          angleLines: {
            color: (ctx) => (DIM_CONFIG[ctx.index]?.color || '#3f3f46') + '55'
          }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function toggleOverviewRadar() {
  const wrap = document.getElementById('overviewRadarWrap');
  const btn  = document.getElementById('overviewToggleChart');
  const visible = wrap.style.display !== 'none';
  wrap.style.display = visible ? 'none' : 'block';
  btn.classList.toggle('active', !visible);
}

// ── Overview Dimension Cards (initial page, no scores) ──
function renderOverviewDimensions() {
  const container = document.getElementById('overviewDimensionsGrid');
  if (!container) return;
  container.innerHTML = DIM_CONFIG.map(dim => {
    const tagItems = dim.tags.map(t => `<span class="dim-tag">${t}</span>`).join('');
    return `
      <div class="dim-card" style="--dim-accent:${dim.color}">
        <div class="dim-card-top">
          <div class="dim-name">${dim.icon} ${dim.name}</div>
          <div class="dim-score-badge" style="color:${dim.color}">
            —<span class="dim-score-max">/5</span>
          </div>
        </div>
        <p class="dim-desc">${dim.desc}</p>
        <div class="dim-bar-track">
          <div class="dim-bar-fill" style="width:0;background:${dim.color};box-shadow:0 0 8px ${dim.color}60"></div>
        </div>
        <div class="dim-tags">${tagItems}</div>
      </div>`;
  }).join('');
}

// ── Scoring Criteria Brief ──
async function loadScoringCriteriaBrief() {
  try {
    const res = await fetch(`${API_BASE}/scoring-criteria-brief`);
    const data = await res.json();
    const el = document.getElementById('scoringCriteriaBrief');
    el.innerHTML = data.content
      ? marked.parse(data.content)
      : '';
  } catch (err) {
    console.error('加载评分标准失败:', err);
  }
}

// ── Feishu OAuth Login ──
async function checkLoginStatus() {
  try {
    const res = await fetch('https://lark-doc-eval-1.onrender.com/auth/feishu/status');
    const data = await res.json();
    const loginBtn    = document.getElementById('loginBtn');
    const loginStatus = document.getElementById('loginStatus');
    if (data.loggedIn) {
      loginBtn.style.display    = 'none';
      loginStatus.style.display = '';
    } else {
      loginBtn.style.display    = '';
      loginStatus.style.display = 'none';
    }
  } catch (e) {
    console.error('检查登录状态失败:', e);
  }
  try {
    const cfgRes = await fetch('https://lark-doc-eval-1.onrender.com/auth/feishu/config');
    const cfgData = await cfgRes.json();
    if (cfgData.hasCustomConfig) {
      document.getElementById('customAppId').value = cfgData.appId;
    }
  } catch (_) {}
}

async function handleFeishuLogin() {
  try {
    const res = await fetch('https://lark-doc-eval-1.onrender.com/auth/feishu/login');
    const data = await res.json();
    if (data.authUrl) {
      const popup = window.open(data.authUrl, '_blank', 'width=600,height=700');
      // 监控弹窗：用户手动关闭后自动恢复登录按钮
      if (popup) {
        const watcher = setInterval(() => {
          if (popup.closed) {
            clearInterval(watcher);
            checkLoginStatus();
          }
        }, 1000);
        // 安全超时：5 分钟后停止监控
        setTimeout(() => clearInterval(watcher), 300000);
      }
    }
  } catch (e) {
    alert('获取登录链接失败: ' + e.message);
  }
}

async function handleFeishuLogout() {
  try {
    await fetch('https://lark-doc-eval-1.onrender.com/auth/feishu/logout', { method: 'POST' });
    checkLoginStatus();
  } catch (e) {
    alert('退出失败: ' + e.message);
  }
}

// ── App Config Panel ──
function toggleAppConfig() {
  const body  = document.getElementById('appConfigBody');
  const arrow = document.getElementById('configArrow');
  const open  = body.style.display === 'none';
  body.style.display = open ? '' : 'none';
  arrow.classList.toggle('open', open);
}

async function saveAppConfig() {
  const appId     = document.getElementById('customAppId').value.trim();
  const appSecret = document.getElementById('customAppSecret').value.trim();
  const statusEl  = document.getElementById('configStatus');

  if (!appId || !appSecret) {
    statusEl.textContent = '请填写完整的 App ID 和 App Secret';
    statusEl.className = 'config-status error';
    return;
  }

  try {
    const res = await fetch('https://lark-doc-eval-1.onrender.com/auth/feishu/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, appSecret }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存失败');

    statusEl.textContent = '配置已保存，请重新登录';
    statusEl.className = 'config-status';
    checkLoginStatus();
  } catch (e) {
    statusEl.textContent = '保存失败: ' + e.message;
    statusEl.className = 'config-status error';
  }
}

async function clearAppConfig() {
  const statusEl = document.getElementById('configStatus');
  try {
    await fetch('https://lark-doc-eval-1.onrender.com/auth/feishu/logout', { method: 'POST' });
    document.getElementById('customAppId').value     = '';
    document.getElementById('customAppSecret').value  = '';
    statusEl.textContent = '已恢复默认配置';
    statusEl.className = 'config-status';
    checkLoginStatus();
  } catch (e) {
    statusEl.textContent = '操作失败: ' + e.message;
    statusEl.className = 'config-status error';
  }
}
