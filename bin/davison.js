#!/usr/bin/env node

// `npx @amoshydra/davison` entry point.
// Expects dist-server/ and dist/ to exist (built by `npm run build`).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Try compiled server first, fall back to tsx source (dev mode)
let entryPoint = resolve(root, 'dist-server', 'index.js')
if (!existsSync(entryPoint)) {
  // Development fallback — run the TypeScript source via tsx
  const tsxLoader = resolve(root, 'node_modules', 'tsx', 'dist', 'loader.mjs')
  if (existsSync(tsxLoader)) {
    entryPoint = resolve(root, 'server', 'index.ts')
    spawn(process.execPath, ['--import', tsxLoader, entryPoint, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
    }).on('exit', (code) => process.exit(code ?? 1))
  } else {
    console.error('Server not built. Run: npm run build')
    process.exit(1)
  }
} else {
  spawn(process.execPath, [entryPoint, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
  }).on('exit', (code) => process.exit(code ?? 1))
}
