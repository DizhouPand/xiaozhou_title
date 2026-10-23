'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('./api/generate');
// Cloud configuration comes exclusively from platform environment variables.
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
server.on('error', () => { console.error('服务启动失败，请检查端口配置。'); process.exitCode = 1; });
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log('网页服务已启动，端口：' + server.address().port));
