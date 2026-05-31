const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const evaluatorService = require('../services/evaluator');
const exporterService = require('../services/exporter');
const ProviderFactory = require('../core/providers/provider-factory');

router.post('/evaluate', async (req, res) => {
  try {
    const { docUrl, provider, model } = req.body;

    if (!docUrl) {
      return res.status(400).json({ error: '请提供文档链接' });
    }

    const id = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // 立即返回任务 ID，后台异步评估
    res.json({ id, status: 'pending' });

    // 后台执行评估
    evaluatorService.evaluate(docUrl, { provider, model, id }).catch(err => {
      console.error('[evaluate] 后台评估失败:', err.message);
      evaluatorService.setResult(id, { error: err.message });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/result/:id', (req, res) => {
  const result = evaluatorService.getResult(req.params.id);
  if (!result) {
    return res.status(404).json({ error: '未找到评分结果' });
  }
  res.json(result);
});

router.get('/export/:id/:format', (req, res) => {
  const result = evaluatorService.getResult(req.params.id);
  if (!result) {
    return res.status(404).json({ error: '未找到评分结果' });
  }

  const { format } = req.params;

  if (format === 'markdown') {
    const md = exporterService.toMarkdown(result);
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename=evaluation.md');
    res.send(md);
  } else if (format === 'html') {
    const html = exporterService.toHTML(result);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } else {
    res.status(400).json({ error: '不支持的格式，可选: markdown, html' });
  }
});

router.get('/providers', (req, res) => {
  res.json(ProviderFactory.getSupportedProviders());
});

router.get('/history', (req, res) => {
  const results = evaluatorService.getAllResults();
  res.json(results);
});

router.get('/scoring-criteria', (req, res) => {
  const content = evaluatorService.getScoringCriteria();
  res.json({ content });
});

router.get('/scoring-criteria-brief', (req, res) => {
  const content = evaluatorService.getScoringCriteriaBrief();
  res.json({ content });
});

module.exports = router;
