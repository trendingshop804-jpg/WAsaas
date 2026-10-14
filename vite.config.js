import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Custom plugin to copy non-module static folders (js, css, nextbright-crm, admin.html) to dist
function copyStaticFilesPlugin() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      const copyRecursive = (src, dest) => {
        if (!fs.existsSync(src)) return;
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
          for (const item of fs.readdirSync(src)) {
            copyRecursive(resolve(src, item), resolve(dest, item));
          }
        } else {
          fs.copyFileSync(src, dest);
        }
      };

      // Copy crm, js, and css assets to dist
      copyRecursive(resolve(__dirname, 'nextbright-crm'), resolve(distDir, 'nextbright-crm'));
      copyRecursive(resolve(__dirname, 'js'), resolve(distDir, 'js'));
      copyRecursive(resolve(__dirname, 'css'), resolve(distDir, 'css'));
      if (fs.existsSync(resolve(__dirname, 'admin.html'))) {
        fs.copyFileSync(resolve(__dirname, 'admin.html'), resolve(distDir, 'admin.html'));
      }
    }
  };
}

function apiDevPlugin() {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost:3001');
        if (url.pathname.startsWith('/api/')) {
          let fnName = url.pathname.replace('/api/', '').replace(/\/$/, '') || 'index';
          const rewrites = {
            'ai-agents': 'ai-chat',
            'knowledge-base': 'ai-chat'
          };
          if (rewrites[fnName]) {
            url.searchParams.set('route', rewrites[fnName] === 'ai-chat' ? (fnName === 'ai-agents' ? 'ai_agents' : 'knowledge_base') : fnName);
            fnName = rewrites[fnName];
          }
          const handlerPath = resolve(__dirname, 'api', `${fnName}.js`);
          if (fs.existsSync(handlerPath)) {
            try {
              let body = {};
              if (req.method !== 'GET' && req.method !== 'HEAD') {
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                const raw = Buffer.concat(chunks).toString('utf8');
                try { body = JSON.parse(raw); } catch { body = raw; }
              }
              const query = Object.fromEntries(url.searchParams.entries());
              const apiReq = Object.assign(req, {
                query,
                body,
                headers: req.headers
              });
              const apiRes = {
                _statusCode: 200,
                _headers: {},
                status(c) { this._statusCode = c; return this; },
                setHeader(k, v) { this._headers[k] = v; return this; },
                json(obj) {
                  res.writeHead(this._statusCode, { 'Content-Type': 'application/json', ...this._headers });
                  res.end(JSON.stringify(obj));
                },
                send(data) {
                  res.writeHead(this._statusCode, this._headers);
                  res.end(data);
                },
                end(d) {
                  res.writeHead(this._statusCode, this._headers);
                  res.end(d);
                }
              };
              const mod = await import(`${pathToFileURL(handlerPath).href}?t=${Date.now()}`);
              const handler = mod.default || mod.handler;
              if (typeof handler === 'function') {
                return await handler(apiReq, apiRes);
              }
            } catch (err) {
              console.error('[Vite API Middleware error]:', err.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: err.message }));
            }
          }
        }
        next();
      });
    }
  };
}

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [copyStaticFilesPlugin(), apiDevPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});

