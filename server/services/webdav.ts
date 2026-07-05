import createServer from 'nephele'
import Adapter from '@nephele/adapter-file-system'
import Authenticator from '@nephele/authenticator-none'
import path from 'node:path'
import { mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { config } from '../config.js'

let _webdavApp: ReturnType<typeof createServer> | null = null

export function initWebdav(): ReturnType<typeof createServer> {
  if (_webdavApp) return _webdavApp

  // Build a root directory that lists available music paths as subdirectories
  const rootDir = path.resolve(config.dataDir, 'webdav-root')
  if (!existsSync(rootDir)) {
    mkdirSync(rootDir, { recursive: true })
  }

  // Clean and rebuild the root directory contents
  for (const entry of readdirSync(rootDir)) {
    rmSync(path.join(rootDir, entry), { recursive: true, force: true })
  }

  for (const musicPath of config.musicPaths) {
    const resolved = path.resolve(musicPath)
    const parent = path.basename(path.dirname(resolved))
    const name = parent && parent !== path.sep
      ? `${parent}_${path.basename(resolved)}`
      : path.basename(resolved)
    mkdirSync(path.join(rootDir, name), { recursive: true })
  }

  const adapters: Record<string, InstanceType<typeof Adapter>> = {
    '/': new Adapter({ root: rootDir }),
  }

  for (const musicPath of config.musicPaths) {
    const resolved = path.resolve(musicPath)
    const parent = path.basename(path.dirname(resolved))
    const name = parent && parent !== path.sep
      ? `${parent}_${path.basename(resolved)}`
      : path.basename(resolved)
    adapters[`/${name}`] = new Adapter({ root: resolved })
  }

  _webdavApp = createServer({
    adapter: adapters,
    authenticator: new Authenticator(),
  })

  return _webdavApp
}
