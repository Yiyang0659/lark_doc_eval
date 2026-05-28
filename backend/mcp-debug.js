'use strict';
require('dotenv').config();
const { spawn } = require('child_process');

const proc = spawn('npx', ['-y', '@chehejia/doc-parser@latest'], {
  env: {
    ...process.env,
    Authorization:       process.env.DOC_PARSER_AUTHORIZATION,
    NPM_CONFIG_REGISTRY: process.env.DOC_PARSER_NPM_REGISTRY || 'https://rnpm.chehejia.com',
    USER_NAME:           process.env.DOC_PARSER_USER_NAME
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

let rawOut = '';
let msgId = 0;

proc.stdout.on('data', d => {
  rawOut += d.toString();
  console.log('[STDOUT]', JSON.stringify(d.toString().slice(0, 400)));
});
proc.stderr.on('data', d => {
  console.log('[STDERR]', d.toString().trim().slice(0, 600));
});
proc.on('error', e => console.error('[PROC ERROR]', e.message));
proc.on('exit', code => console.log('[EXIT code]', code));

function send(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf-8');
  proc.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  proc.stdin.write(body);
  console.log('[SEND]', JSON.stringify(obj).slice(0, 200));
}

// Wait for process to start, then send initialize
setTimeout(() => {
  console.log('--- sending initialize ---');
  send({ jsonrpc:'2.0', id: ++msgId, method:'initialize', params:{
    protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{name:'debug',version:'1.0'}
  }});
}, 4000);

setTimeout(() => {
  console.log('--- raw stdout so far ---');
  console.log(rawOut.slice(0, 1000));
  proc.kill();
  process.exit(0);
}, 15000);
