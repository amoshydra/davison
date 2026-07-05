import createServer from 'nephele'
import Adapter from '@nephele/adapter-file-system'
import Authenticator from '@nephele/authenticator-custom'
import path from 'node:path'
import { mkdirSync, existsSync, symlinkSync, unlinkSync, readdirSync } from 'node:fs'
import { config } from '../config.js'
import os from 'node:os'

let _webdavApp: ReturnType<typeof createServer> | null = null

export function initWebdav(): ReturnType<typeof createServer> {
  if (_webdavApp) return _webdavApp

  // Build merged root with symlinks
  const mergedDir = path.resolve(config.dataDir, 'webdav-music')
  if (!existsSync(mergedDir)) {
    mkdirSync(mergedDir, { recursive: true })
  }
  for (const entry of readdirSync(mergedDir)) {
    try { unlinkSync(path.join(mergedDir, entry)) } catch { /* ignore */ }
  }
  for (const musicPath of config.musicPaths) {
    const resolved = path.resolve(musicPath)
    const parent = path.basename(path.dirname(resolved))
    const name = parent && parent !== path.sep
      ? `${parent}_${path.basename(resolved)}`
      : path.basename(resolved)
    try { symlinkSync(resolved, path.join(mergedDir, name)) } catch { /* ignore */ }
  }

  const uid = os.userInfo().uid
  const gid = os.userInfo().gid

  _webdavApp = createServer({
    adapter: new Adapter({ root: mergedDir, followLinks: true }),
    authenticator: new Authenticator({
      unauthorizedAccess: true,
      getUser: async () => ({ username: 'sonos', uid, gid }),
      authBasic: async () => false,
    }),
  })

  return _webdavApp
}
