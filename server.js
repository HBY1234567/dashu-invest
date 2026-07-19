// server.js — 大数投资（本地开发服务器，使用 shared.js）
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const MIME = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const { fuzzyMatch, apiStockDetail, apiPractice, apiAddPractice, apiRemovePractice, vercelHandler, STOCK_LIST } = require('./shared');

// 本地模拟 Express/Next.js 风格 req/res
function localHandler(req, res) {
  const urlPath = req.url.split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 模拟 vercelHandler 的路由逻辑
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathSegments = urlPath.replace(/^\/api\//, '').split('/').filter(Boolean);

  // 构建类似 Next.js 的 req.query
  const reqCopy = {
    method: req.method,
    query: Object.fromEntries(parsedUrl.searchParams),
  };

  if (urlPath.startsWith('/api/')) {
    reqCopy.query.path = pathSegments;
    return vercelHandler(reqCopy, res);
  }

  // 静态文件
  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
}

const server = http.createServer(localHandler);
server.listen(PORT, '0.0.0.0', () => console.log(`大数投资已启动: http://localhost:${PORT}`));
