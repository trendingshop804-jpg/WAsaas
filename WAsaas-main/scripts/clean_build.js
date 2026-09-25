// scripts/clean_build.js
// Simple script to remove the existing React build directory before a new build.
// Usage: node ../scripts/clean_build.js (called from the frontend/package.json)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the build directory relative to this script (project root/scripts => frontend/build)
const buildDir = path.resolve(__dirname, '..', 'frontend', 'build');

try {
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
    console.log('Removed existing build directory:', buildDir);
  } else {
    console.log('No existing build directory to remove.');
  }
} catch (err) {
  console.error('Error while removing build directory:', err);
  process.exit(1);
}
