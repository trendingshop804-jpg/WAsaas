/**
 * dev-server.js â€” NexusLead AI Local Dev Server
 * - Reads .env file (sets process.env for API handlers)
 * - Serves static files from project root on http://localhost:3001
 * - Handles /api/* routes by importing the matching api/*.js handler
 * Start with:  node dev-server.js
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;
function loadDotEnv() {
  // Match Vercel/Next conventions: .env.local overrides .env for local runs.
  for (const fileName of ['.env', '.env.local']) {
    const envPath = path.join(__dirname, fileName);
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key) process.env[key] = val;
    }
  }
}
loadDotEnv();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js': 'application/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};
function buildReq(nodeReq, body, parsedUrl) {
  return {
    method: nodeReq.method, url: nodeReq.url,
    query: Object.fromEntries(parsedUrl.searchParams.entries()),
    headers: nodeReq.headers, body
  };
}
function buildRes(nodeRes) {
  const res = {
    _statusCode: 200, _headers: {},
    status(code) { this._statusCode = code; return this; },
    setHeader(k, v) { this._headers[k] = v; },
    json(obj) {
      const body = JSON.stringify(obj);
      nodeRes.writeHead(this._statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ['https://yourdomain.com', 'https://app.yourdomain.com', 'http://localhost:3000'], ...this._headers
      });
      nodeRes.end(body);
    },
    send(text) {
      nodeRes.writeHead(this._statusCode, { 'Content-Type': 'text/plain', ...this._headers });
      nodeRes.end(String(text));
    },
    end(data) { nodeRes.writeHead(this._statusCode, this._headers); nodeRes.end(data || ''); },
  };
  return res;
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
    });
    req.on('error', () => resolve({}));
  });
}
const server = http.createServer(async (nodeReq, nodeRes) => {
  const parsedUrl = new URL(nodeReq.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  if (nodeReq.method === 'OPTIONS') {
    nodeRes.writeHead(204, {
      'Access-Control-Allow-Origin': ['https://yourdomain.com', 'https://app.yourdomain.com', 'http://localhost:3000'],
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return nodeRes.end();
  }
  if (pathname.startsWith('/api/')) {
    const fnName = pathname.replace('/api/', '').replace(/\/$/, '') || 'index';
    const handlerPath = path.join(__dirname, 'api', `${fnName}.js`);
    if (!fs.existsSync(handlerPath)) {
      nodeRes.writeHead(404, { 'Content-Type': 'application/json' });
      return nodeRes.end(JSON.stringify({ error: `API handler not found: ${fnName}` }));
    }
    try {
      const body = await readBody(nodeReq);
      const req = buildReq(nodeReq, body, parsedUrl);
      const res = buildRes(nodeRes);
      const mod = await import(`${pathToFileURL(handlerPath).href}?t=${Date.now()}`);
      const handler = mod.default || mod.handler;
      if (typeof handler !== 'function') throw new Error('No default export found');
      await handler(req, res);
    } catch (err) {
      console.error(`[API Error] ${pathname}:`, err.message);
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
        nodeRes.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }
  const cleanCrmRoute = pathname.match(/^\/(?:nextbright-crm\/index\.html\/)?(dashboard|leads|customers|deals|calls|messages|appointments|tasks|reports|settings)\/?$/i);
  if (cleanCrmRoute) {
    nodeRes.writeHead(302, { Location: `/nextbright-crm/index.html#/${cleanCrmRoute[1].toLowerCase()}` });
    return nodeRes.end();
  }

  let targetFile = pathname;
  if (pathname === '/admin' || pathname === '/admin/' || pathname === '/master-admin') {
    targetFile = 'admin.html';
  } else if (pathname === '/app' || pathname === '/app/' || pathname === '/') {
    targetFile = 'index.html';
  }
  let filePath = path.join(__dirname, targetFile);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      nodeRes.writeHead(404, { 'Content-Type': 'text/plain' });
      return nodeRes.end(`404 Not Found: ${pathname}`);
    }
    nodeRes.writeHead(200, { 'Content-Type': contentType });
    nodeRes.end(data);
    if (!pathname.endsWith('.js') && !pathname.endsWith('.css')) console.log(`  GET ${pathname} 200`);
  });
});
server.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  NexusLead AI - Dev Server Running');
  console.log(`  =>  http://localhost:${PORT}`);
  console.log('  Static + /api/* routes active');
  console.log('  .env loaded into process.env');
  console.log('========================================\n');
});
