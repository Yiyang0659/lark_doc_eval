const API_BASE = '/api';
let currentResult = null;
let radarChart = null;

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
  loadHistory();
});

// ── Evaluate ──
async function handleEvaluate() {
  const docUrl = document.getElementById('docUrl').value.trim();
  const provider = document.getElementById('provider').value;
  const errorEl = document.getElementById('errorMsg');
  errorEl.style.display = 'none';

  if (!docUrl) { showError('请输入飞书文档链接'); return; }

  setLoading(true);
  try {
    const res = await fetch(`${API_BASE}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docUrl, provider })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '评分失败');
    currentResult = data;
    displayResult(data);
    loadHistory();
  } catch (err) {
    showError(`评分失败：${err.message}`);
  } finally {
    setLoading(false);
  }
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

  // Doc title (show domain + first path segment)
  const urlShort = result.docUrl.replace(/^https?:\/\//, '').split('/').slice(0, 3).join('/');
  document.getElementById('docTitle').textContent = urlShort;

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

// ── Radar chart (dark themed) ──
function renderRadarChart(dimensions) {
  const ctx = document.getElementById('radarChart').getContext('2d');
  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: DIM_CONFIG.map(d => d.name),
      datasets: [{
        label: '评分',
        data: DIM_CONFIG.map(d => dimensions[d.id]?.score || 0),
        backgroundColor: 'rgba(129,140,248,0.15)',
        borderColor: 'rgba(129,140,248,0.8)',
        borderWidth: 2,
        pointBackgroundColor: DIM_CONFIG.map(d => d.color),
        pointBorderColor: 'transparent',
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 5,
          ticks: {
            stepSize: 1,
            font: { size: 10 },
            color: '#52525b',
            backdropColor: 'transparent'
          },
          pointLabels: { font: { size: 12, weight: '600' }, color: '#a1a1aa' },
          grid: { color: '#27272a' },
          angleLines: { color: '#3f3f46' }
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
