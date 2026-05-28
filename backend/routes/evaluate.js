const express = require('express');
const router = express.Router();
const evaluatorService = require('../services/evaluator');
const exporterService = require('../services/exporter');
const ProviderFactory = require('../core/providers/provider-factory');

router.post('/evaluate', async (req, res) => {
  try {
    const { docUrl, provider, model } = req.body;

    if (!docUrl) {
      return res.status(400).json({ error: '请提供文档链接' });
    }

    const result = await evaluatorService.evaluate(docUrl, { provider, model });
    res.json(result);
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

module.exports = router;
