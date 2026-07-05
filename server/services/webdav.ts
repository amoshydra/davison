import createServer from 'nephele'
import Adapter from '@nephele/adapter-file-system'
import Authenticator from '@nephele/authenticator-none'
import { mkdirSync, existsSync, symlinkSync, unlinkSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

const mergedDir = path.resolve(config.dataDir, 'webdav-music')

let _webdavApp: ReturnType<typeof createServer> | null = null

export function initWebdav(): ReturnType<typeof createServer> {
  if (_webdavApp) return _webdavApp

  if (!existsSync(mergedDir)) {
    mkdirSync(mergedDir, { recursive: true })
  }

  // Refresh symlinks
  try {
    for (const entry of readdirSync(mergedDir)) {
      try { unlinkSync(path.join(mergedDir, entry)) } catch { /* ignore */ }
    }
  } catch { /* dir may not exist yet */ }

  for (const musicPath of config.musicPaths) {
    const resolved = path.resolve(musicPath)
    const parentDir = path.basename(path.dirname(resolved))
    const name = parentDir && parentDir !== path.sep
      ? `${parentDir}_${path.basename(resolved)}`
      : path.basename(resolved)
    try { symlinkSync(resolved, path.join(mergedDir, name)) } catch { /* ignore */ }
  }

  _webdavApp = createServer({
    adapter: new Adapter({ root: mergedDir, followLinks: true }),
    authenticator: new Authenticator(),
  })

  return _webdavApp
}
