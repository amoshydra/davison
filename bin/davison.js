#!/usr/bin/env node

// Entry point for `npx @amoshydra/davison` and global installs.
// Uses tsx to run the TypeScript server directly.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverEntry = resolve(__dirname, '..', 'server', 'index.ts')

const child = spawn(
  process.execPath,
  [
    '--import', resolve(__dirname, '..', 'node_modules', 'tsx', 'dist', 'loader.mjs'),
    serverEntry,
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
  },
)

child.on('exit', (code) => process.exit(code ?? 1))
