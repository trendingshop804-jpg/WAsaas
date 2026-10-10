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

export default defineConfig({
  server: {
    port: 3001,
  },
  plugins: [copyStaticFilesPlugin()],
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
