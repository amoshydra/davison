#!/usr/bin/env node

// `npx @amoshydra/davison` entry point.
import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { patchNephele } from '../scripts/patch-nephele.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Apply the Nephele HEAD Content-Length patch when install scripts were skipped.
patchNephele(root)

// Auto-build if needed (first run from git clone)
if (!existsSync(resolve(root, 'dist-server', 'index.js'))) {
  const viteBin = resolve(root, 'node_modules', '.bin', 'vite')
  const tscBin = resolve(root, 'node_modules', '.bin', 'tsc')
  if (existsSync(viteBin) && existsSync(tscBin)) {
    console.log('Building server and frontend...')
    try {
      execSync(`"${tscBin}" -p "${root}/tsconfig.server.json"`, { cwd: root, stdio: 'inherit' })
      execSync(`"${viteBin}" build`, { cwd: root, stdio: 'inherit' })
    } catch {
      console.warn('Build failed — falling back to tsx source')
    }
  }
}

// Try compiled server first, fall back to tsx source
let entryPoint = resolve(root, 'dist-server', 'index.js')
if (!existsSync(entryPoint)) {
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
