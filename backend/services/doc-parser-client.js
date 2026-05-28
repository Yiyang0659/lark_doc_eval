'use strict';

const { spawn } = require('child_process');
const path = require('path');

// Resolve npx from the same directory as the currently running node binary.
// This handles fnm / nvm / volta where npx lives beside node.exe and
// is NOT on the child-process PATH by default.
function resolveNpx() {
  const nodeDir = path.dirname(process.execPath);
  // Windows: prefer npx.cmd so cmd-based shims work correctly
  const candidates = [
    path.join(nodeDir, 'npx.cmd'),
    path.join(nodeDir, 'npx'),
    'npx'  // last-resort fallback
  ];
  const fs = require('fs');
  return candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || 'npx';
}

const NPX_PATH = resolveNpx();

// MCP uses Content-Length framing (LSP-style) over stdio
class McpStdioClient {
  constructor(command, args, env) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.proc = null;
    this.callbacks = new Map();
    this.msgId = 0;
    this.buf = Buffer.alloc(0);
    this.ready = false;
    this._startPromise = null;
  }

  ensureReady() {
    if (this.ready) return Promise.resolve();
    if (this._startPromise) return this._startPromise;
    this._startPromise = this._start().catch(err => {
      this._startPromise = null;
      throw err;
    });
    return this._startPromise;
  }

  _start() {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.command, this.args, {
        env: { ...process.env, ...this.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      this.proc = proc;

      proc.stdout.on('data', chunk => {
        this.buf = Buffer.concat([this.buf, chunk]);
        this._flush();
      });
      proc.stderr.on('data', d => process.stderr.write('[doc-parser] ' + d));
      proc.on('error', err => { reject(err); this._reset(); });
      proc.on('exit', () => this._reset());

      this._request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'doc-evaluator', version: '1.0.0' }
      }).then(() => {
        this._write({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
        this.ready = true;
        resolve();
      }).catch(err => { reject(err); this._reset(); });
    });
  }

  _reset() {
    this.ready = false;
    this.proc = null;
    this._startPromise = null;
    this.callbacks.forEach(cb => cb.reject(new Error('MCP process exited')));
    this.callbacks.clear();
    this.buf = Buffer.alloc(0);
  }

  _flush() {
    while (true) {
      const sep = this.buf.indexOf('\r\n\r\n');
      if (sep === -1) break;
      const header = this.buf.slice(0, sep).toString();
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) { this.buf = this.buf.slice(sep + 4); continue; }
      const len = parseInt(m[1]);
      if (this.buf.length < sep + 4 + len) break;
      const body = this.buf.slice(sep + 4, sep + 4 + len).toString();
      this.buf = this.buf.slice(sep + 4 + len);
      try {
        const msg = JSON.parse(body);
        if (msg.id != null) {
          const cb = this.callbacks.get(msg.id);
          if (cb) {
            this.callbacks.delete(msg.id);
            msg.error ? cb.reject(new Error(msg.error.message || JSON.stringify(msg.error))) : cb.resolve(msg.result);
          }
        }
      } catch {}
    }
  }

  _write(obj) {
    const body = Buffer.from(JSON.stringify(obj), 'utf-8');
    this.proc.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.proc.stdin.write(body);
  }

  _request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; this.callbacks.delete(id); reject(new Error(`MCP timeout: ${method}`)); }
      }, 90000);
      this.callbacks.set(id, {
        resolve: v => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
        reject:  e => { if (!done) { done = true; clearTimeout(timer); reject(e); } }
      });
      this._write({ jsonrpc: '2.0', id, method, params });
    });
  }

  async callTool(name, args) {
    await this.ensureReady();
    return this._request('tools/call', { name, arguments: args });
  }
}

// Extract text from MCP tool result (content array or raw string)
function extractText(result) {
  if (!result) return null;
  if (Array.isArray(result.content)) {
    return result.content.filter(c => c.type === 'text').map(c => c.text).join('\n') || null;
  }
  if (typeof result === 'string') return result;
  return JSON.stringify(result);
}

const client = new McpStdioClient(
  NPX_PATH,
  ['-y', '@chehejia/doc-parser@latest'],
  {
    Authorization:        process.env.DOC_PARSER_AUTHORIZATION,
    NPM_CONFIG_REGISTRY:  process.env.DOC_PARSER_NPM_REGISTRY || 'https://rnpm.chehejia.com',
    USER_NAME:            process.env.DOC_PARSER_USER_NAME,
    PATH:                 process.env.PATH  // pass current PATH so npx can resolve deps
  }
);

async function parseDocument(url) {
  console.log('[doc-parser] submit:', url);

  // Step 1: submit
  const submitResult = await client.callTool('submit', { resourceUri: url });
  const submitText = extractText(submitResult);
  console.log('[doc-parser] submit result:', submitText?.slice(0, 300));
  if (!submitText) throw new Error('doc-parser submit 无返回');

  let taskId;
  try {
    const obj = JSON.parse(submitText);
    taskId = obj.taskId || obj.task_id || obj.id;
  } catch {
    const m = submitText.match(/"?taskId"?\s*[:=]\s*"?([a-zA-Z0-9_-]+)"?/);
    taskId = m && m[1];
  }
  console.log('[doc-parser] taskId:', taskId);
  if (!taskId) throw new Error('无法解析 taskId: ' + submitText);

  // Step 2: poll result (max 30×5s = 150s)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const pollResult = await client.callTool('result', { taskId });
    const text = extractText(pollResult);
    console.log(`[doc-parser] poll #${i + 1}:`, text?.slice(0, 200));
    if (text && !/pending|processing|处理中/i.test(text)) {
      console.log('[doc-parser] content ready, length:', text.length);
      return text;
    }
  }
  throw new Error('文档解析超时');
}

module.exports = { parseDocument };
