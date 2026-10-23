'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('./api/generate');
// This file is loaded only when you explicitly start the local server.
try {
  const lines = fs.readFileSync(path.join(__dirname, 'local.env'), 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(DIFY_API_BASE|DIFY_API_KEY)\s*=\s*(.*?)\s*$/);
    if (match) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { console.error('无法载入本机配置，请确认 local.env 已创建。'); process.exit(1); }
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/api/generate') {
    if (req.method !== 'POST') return handler(req, res);
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) {
          res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '提交内容过长，请精简后重试。' }));
          return;
        }
        chunks.push(chunk);
      }
      req.body = Buffer.concat(chunks).toString('utf8');
      await handler(req, res);
    } catch {
      if (!res.writableEnded) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '提交失败，请再试一次。' }));
      }
    }
    return;
  }
  // Explicit allowlist: local.env and all server source files are never served.
  if (pathname === '/' || pathname === '/index.html') {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
    return;
  }
  res.writeHead(404); res.end('未找到页面');
});
server.on('error', () => { console.error('服务启动失败，请检查 3000 端口是否被占用。'); process.exitCode = 1; });
server.listen(3000, '127.0.0.1', () => console.log('请在浏览器打开 http://localhost:3000'));
