const DIM_CONFIG = [
  { id: 'value',       name: '实际价值', weight: '30%' },
  { id: 'reusability', name: '可复用性', weight: '25%' },
  { id: 'innovation',  name: '创新性',   weight: '25%' },
  { id: 'method',      name: '方法沉淀', weight: '20%' }
];

function toMarkdown(result) {
  const { docUrl, total_score, level, summary, dimensions, highlights, improvements, recommendation, timestamp } = result;
  const lvl = level || {};
  let md = `# 文档评分报告\n\n`;
  md += `- **文档链接**：${docUrl}\n`;
  md += `- **评分时间**：${new Date(timestamp).toLocaleString('zh-CN')}\n`;
  md += `- **总分**：${total_score}/20  ${lvl.icon || ''} ${lvl.name || ''}\n\n`;
  md += `## 总体评价\n\n${summary}\n\n`;
  md += `## 维度评分\n\n| 维度 | 分数 | 权重 |\n|------|------|------|\n`;

  DIM_CONFIG.forEach(dim => {
    const d = dimensions[dim.id] || {};
    md += `| ${dim.name} | ${d.score || 0}/5 | ${dim.weight} |\n`;
  });
  md += `\n`;

  DIM_CONFIG.forEach(dim => {
    const d = dimensions[dim.id] || {};
    if (d.details && d.details.length) {
      md += `### ${dim.name}\n\n`;
      d.details.forEach(detail => { md += `- ${detail}\n`; });
      md += `\n`;
    }
  });

  if (highlights && highlights.length) {
    md += `## 亮点\n\n`;
    highlights.forEach(h => { md += `- ${h}\n`; });
    md += `\n`;
  }

  if (improvements && improvements.length) {
    md += `## 改进建议\n\n| 建议 | 维度 | 详情 |\n|------|------|------|\n`;
    improvements.forEach(imp => {
      if (typeof imp === 'object') {
        md += `| ${imp.suggestion} | ${imp.dimension || '-'} | ${imp.detail || '-'} |\n`;
      } else {
        md += `| ${imp} | - | - |\n`;
      }
    });
    md += `\n`;
  }

  if (recommendation) {
    md += `## 推荐程度\n\n`;
    md += `- **推荐阅读**：${recommendation.recommended ? '是' : '否'}\n`;
    md += `- **推荐理由**：${recommendation.reason || '-'}\n`;
    md += `- **适用人群**：${recommendation.targetAudience || '-'}\n`;
    md += `- **最佳实践**：${recommendation.bestPractice || '-'}\n`;
  }

  return md;
}

function toHTML(result) {
  const { docUrl, total_score, level, summary, dimensions, highlights, improvements, recommendation, timestamp } = result;
  const lvl = level || {};

  const dimRows = DIM_CONFIG.map(dim => {
    const d = dimensions[dim.id] || {};
    const detailItems = (d.details || []).map(det => `<li>${esc(det)}</li>`).join('');
    return `<tr>
      <td><strong>${esc(dim.name)}</strong><br><small>${dim.weight}</small></td>
      <td style="text-align:center;font-size:1.2em">${d.score || 0}/5</td>
      <td><ul style="margin:0;padding-left:16px">${detailItems}</ul></td>
    </tr>`;
  }).join('');

  const highlightItems = (highlights || []).map(h => `<li>${esc(h)}</li>`).join('');

  const improvRows = (improvements || []).map(imp => {
    if (typeof imp === 'object') {
      return `<tr><td>${esc(imp.suggestion)}</td><td>${esc(imp.dimension || '-')}</td><td>${esc(imp.detail || '-')}</td></tr>`;
    }
    return `<tr><td>${esc(imp)}</td><td>-</td><td>-</td></tr>`;
  }).join('');

  const rec = recommendation || {};
  const recHTML = rec.recommended !== undefined ? `
    <h2>推荐程度</h2>
    <table class="info-table"><tbody>
      <tr><th>推荐阅读</th><td>${rec.recommended ? '✅ 是' : '❌ 否'}</td></tr>
      <tr><th>推荐理由</th><td>${esc(rec.reason || '-')}</td></tr>
      <tr><th>适用人群</th><td>${esc(rec.targetAudience || '-')}</td></tr>
      <tr><th>最佳实践</th><td>${esc(rec.bestPractice || '-')}</td></tr>
    </tbody></table>` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>文档评分报告</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:860px;margin:40px auto;padding:0 24px;color:#1f2937;line-height:1.6}
    h1{color:#1a1a2e;border-bottom:3px solid #667eea;padding-bottom:8px}
    h2{color:#16213e;margin-top:32px}
    .meta{color:#6b7280;font-size:.9em}
    .score-badge{display:inline-block;font-size:2em;font-weight:700;color:${lvl.color||'#667eea'};border:2px solid ${lvl.color||'#667eea'};border-radius:8px;padding:4px 16px;margin:8px 0}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    th,td{border:1px solid #e5e7eb;padding:10px 14px;text-align:left}
    th{background:#f9fafb;font-weight:600}
    .info-table th{width:120px}
    ul{margin:8px 0}
  </style>
</head>
<body>
  <h1>文档评分报告</h1>
  <p class="meta">文档链接：<a href="${esc(docUrl)}">${esc(docUrl)}</a><br>
  评分时间：${new Date(timestamp).toLocaleString('zh-CN')}</p>
  <div class="score-badge">${total_score}/20 ${lvl.icon||''} ${esc(lvl.name||'')}</div>

  <h2>总体评价</h2>
  <p>${esc(summary)}</p>

  <h2>维度评分</h2>
  <table><thead><tr><th>维度</th><th>分数</th><th>评价详情</th></tr></thead>
  <tbody>${dimRows}</tbody></table>

  ${highlightItems ? `<h2>亮点</h2><ul>${highlightItems}</ul>` : ''}

  ${improvRows ? `<h2>改进建议</h2>
  <table><thead><tr><th>建议</th><th>维度</th><th>详情</th></tr></thead>
  <tbody>${improvRows}</tbody></table>` : ''}

  ${recHTML}
</body>
</html>`;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = { toMarkdown, toHTML };
