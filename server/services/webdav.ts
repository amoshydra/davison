import createServer from 'nephele'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { getMusicLibrary } from './music-discovery.js'
import { config } from '../config.js'
import os from 'node:os'
import mime from 'mime'

// ─── Shared tree (mirrors MusicBrowser's buildDirs) ───

interface DirNode {
  name: string
  tracks: { filePath: string; title: string }[]
  dirs: DirNode[]
}

function buildDirs(tracks: { relativePath: string; baseName: string; filePath: string; title: string }[]): DirNode[] {
  const roots: DirNode[] = []
  for (const track of tracks) {
    const parts = track.relativePath.split('/')
    const fileName = parts.pop()!
    // Sanitize baseName: replace / with _ for filesystem-safe names
    const baseName = track.baseName.replace(/\//g, '_')
    const dirParts = baseName ? [baseName, ...parts] : parts
    let level = roots
    for (const segment of dirParts) {
      let dir = level.find(d => d.name === segment)
      if (!dir) { dir = { name: segment, tracks: [], dirs: [] }; level.push(dir) }
      level = dir.dirs
    }
    level.push({ name: fileName, tracks: [{ filePath: track.filePath, title: track.title }], dirs: [] })
  }

  function wrapRootTracks(node: DirNode) {
    const trackLeaves = node.dirs.filter(d => d.dirs.length === 0 && d.tracks.length <= 1)
    const subdirs = node.dirs.filter(d => d.dirs.length > 0 || d.tracks.length > 1)
    if (trackLeaves.length > 0 && subdirs.length > 0) {
      node.dirs = [...subdirs, { name: '<root>', tracks: trackLeaves.flatMap(d => d.tracks), dirs: [] }]
    }
    for (const sub of node.dirs) wrapRootTracks(sub)
    node.dirs.sort((a, b) => {
      const af = a.dirs.length > 0 || a.tracks.length > 1 || a.name === '<root>'
      const bf = b.dirs.length > 0 || b.tracks.length > 1 || b.name === '<root>'
      if (af && !bf) return -1
      if (!af && bf) return 1
      if (a.name === '<root>') return 1
      if (b.name === '<root>') return -1
      return a.name.localeCompare(b.name)
    })
  }
  for (const r of roots) wrapRootTracks(r)

  roots.sort((a, b) => {
    const af = a.dirs.length > 0 || a.tracks.length > 1 || a.name === '<root>'
    const bf = b.dirs.length > 0 || b.tracks.length > 1 || b.name === '<root>'
    if (af && !bf) return -1
    if (!af && bf) return 1
    if (a.name === '<root>') return 1
    if (b.name === '<root>') return -1
    return a.name.localeCompare(b.name)
  })
  return roots
}

// ─── Virtual adapter ───

function findNode(pathParts: string[], nodes: DirNode[]): { node: DirNode | null; trackIndex: number | null; realPath: string | null } {
  if (pathParts.length === 0) return { node: nodes.length > 0 ? { name: '', tracks: [], dirs: nodes } : null, trackIndex: null, realPath: null }
  const name = pathParts[0]
  const rest = pathParts.slice(1)
  for (const n of nodes) {
    if (n.name === name) {
      // Leaf track node (single file, no subdirs)
      if (n.dirs.length === 0 && n.tracks.length === 1) {
        return { node: null, trackIndex: null, realPath: n.tracks[0].filePath }
      }
      // Multi-track leaf node (e.g. <root> group, several loose files)
      if (rest.length === 0 && n.tracks.length > 0) {
        return { node: n, trackIndex: null, realPath: null }
      }
      if (rest.length === 0) return { node: n, trackIndex: null, realPath: null }
      if (n.dirs.length > 0) return findNode(rest, n.dirs)
      if (n.tracks.length > 0) {
        for (let i = 0; i < n.tracks.length; i++) {
          if (rest[0] === path.basename(n.tracks[i].filePath)) {
            return { node: n, trackIndex: i, realPath: n.tracks[i].filePath }
          }
        }
      }
      return { node: null, trackIndex: null, realPath: null }
    }
  }
  return { node: null, trackIndex: null, realPath: null }
}

async function getRealSize(filePath: string): Promise<number> {
  try { return (await stat(filePath)).size } catch { return 0 }
}

async function getRealMtime(filePath: string): Promise<Date> {
  try { return (await stat(filePath)).mtime } catch { return new Date() }
}

// Simple read-only in-memory resource
function createVirtualResource(adapter: any, baseUrl: URL, nodePath: string, node: DirNode | null, realPath: string | null, isCollection: boolean) {
  let cachedSize: number | undefined
  let cachedMtime: Date | undefined

  async function ensureStats() {
    if (realPath && cachedSize === undefined) {
      const s = await stat(realPath)
      cachedSize = s.size
      cachedMtime = s.mtime
    }
  }

  return {
    adapter,
    baseUrl,
    path: nodePath,
    collection: isCollection,

    get absolutePath() { return realPath || nodePath },

    async getCanonicalPath() {
      const segments = nodePath.split('/').filter(Boolean)
      const p = segments.length > 0 ? '/' + segments.join(path.sep) : '/'
      return isCollection ? p.replace(/\/?$/, '/') : p
    },

    async getCanonicalUrl() {
      const segments = nodePath.split('/').filter(Boolean)
      const relPath = segments.length > 0 ? segments.join('/') + (isCollection ? '/' : '') : ''
      return new URL(relPath, baseUrl)
    },

    async isCollection() { return isCollection },
    async exists() { return node !== null || realPath !== null },

    async getSize() {
      if (realPath) { await ensureStats(); return cachedSize || 0 }
      return 4096
    },

    async getLength() { return this.getSize() },

    async getModificationTime() {
      if (realPath) { await ensureStats(); return cachedMtime || new Date() }
      return new Date()
    },

    async getCreationTime() {
      if (realPath) { await ensureStats(); return cachedMtime || new Date() }
      return new Date()
    },

    async getEtag() { return `${nodePath.replace(/\//g, '_')}` },

    async getContentType() {
      if (realPath) return mime.getType(realPath) || 'application/octet-stream'
      return 'httpd/unix-directory'
    },

    async getMediaType() { return this.getContentType() },

    async getStream(range?: { start: number; end: number }) {
      if (!realPath) {
        const { Readable } = await import('node:stream')
        return Readable.from([])
      }
      if (range) {
        const { createReadStream } = await import('node:fs')
        return createReadStream(realPath, { start: range.start, end: range.end })
      }
      return createReadStream(realPath)
    },

    async getInternalMembers() {
      if (!isCollection || !node) return []
      const members: any[] = []

      // Subdirectories and track leaf nodes (sorted by buildDirs)
      for (const dir of node.dirs) {
        // Leaf track nodes (in dirs array from buildDirs) are files, not directories
        if (dir.tracks.length === 1 && dir.dirs.length === 0) {
          const filePath = dir.tracks[0].filePath
          const fileName = path.basename(filePath)
          members.push(createVirtualResource(adapter, baseUrl, `${nodePath}/${fileName}`, null, filePath, false))
        } else {
          members.push(createVirtualResource(adapter, baseUrl, `${nodePath}/${dir.name}/`, dir, null, true))
        }
      }

      // Tracks at this level
      for (let i = 0; i < node.tracks.length; i++) {
        const fileName = path.basename(node.tracks[i].filePath)
        members.push(createVirtualResource(adapter, baseUrl, `${nodePath}/${fileName}`, null, node.tracks[i].filePath, false))
      }

      return members
    },

    async readMetadataFile() { return {} },
    async writeMetadataFile() {},
    async delete() { throw Object.assign(new Error('Forbidden'), { statusCode: 403 }) },
    async setProperty() {},
    async removeProperty() {},
    getProperties() {
      const resolve = async (name: string) => {
        switch (name) {
          case 'getcontentlength':
            return String(isCollection ? 0 : (realPath ? await getRealSize(realPath) : 0))
          case 'getlastmodified': {
            const d = await getRealMtime(realPath || '')
            return d.toUTCString()
          }
          case 'creationdate': {
            const d = await getRealMtime(realPath || '')
            return d.toISOString()
          }
          case 'getcontenttype':
            if (realPath) return mime.getType(realPath) || 'application/octet-stream'
            return 'httpd/unix-directory'
          case 'getetag':
            return nodePath.replace(/\//g, '_')
          case 'resourcetype':
            return isCollection ? { collection: {} } : undefined
          case 'displayname':
            return nodePath.split('/').filter(Boolean).pop() || '/'
          case 'supportedlock':
            return undefined
          default:
            return undefined
        }
      }

      // Standard live property names
      const liveNames = [
        'creationdate', 'getcontentlength', 'getcontenttype',
        'getetag', 'getlastmodified', 'resourcetype', 'supportedlock',
        'displayname',
      ]

      return {
        get: resolve,
        getByUser: async (name: string) => resolve(name),
        getAllByUser: async () => {
          const out: Record<string, any> = {}
          for (const name of liveNames) {
            const v = await resolve(name)
            if (v !== undefined) out[name] = v
          }
          return out
        },
        listByUser: async () => liveNames,
        listLiveByUser: async () => liveNames,
        listDeadByUser: async () => [],
        getAll: async () => {
          const out: Record<string, any> = {}
          for (const name of liveNames) {
            const v = await resolve(name)
            if (v !== undefined) out[name] = v
          }
          return out
        },
        list: async () => liveNames,
        listLive: async () => liveNames,
        listDead: async () => [],
        set: async () => {},
        setByUser: async () => {},
        remove: async () => {},
        removeByUser: async () => {},
        runInstructions: async () => undefined,
        runInstructionsByUser: async () => undefined,
      }
    },
    getLocks() { return [] },
    getLocksByUser() { return [] },
    addLock() {},
    removeLock() {},
    removeLocksByUser() {},
    cleanLocks() {},
  }
}

// ─── Nephele Adapter ───

class VirtualAdapter {
  tree: DirNode[]
  rootNode: DirNode

  constructor(tree: DirNode[]) {
    this.tree = tree
    this.rootNode = { name: '', tracks: [], dirs: tree }
  }

  urlToRelativePath(url: URL, baseUrl: URL): string | null {
    const urlPath = decodeURIComponent(url.pathname).replace(/\/?$/, '/')
    const basePath = decodeURIComponent(baseUrl.pathname).replace(/\/?$/, '/')
    if (!urlPath.startsWith(basePath)) return null
    const rel = urlPath.substring(basePath.length).replace(/\/$/, '')
    return '/' + rel
  }

  urlToAbsolutePath(url: URL, baseUrl: URL): string | null {
    const rel = this.urlToRelativePath(url, baseUrl)
    if (rel == null) return null
    return rel
  }

  async getUid() { return os.userInfo().uid }
  async getGid() { return os.userInfo().gid }
  async getGids() { return [os.userInfo().gid] }

  async getComplianceClasses() { return [] }
  async getAllowedMethods() { return [] }
  async getOptionsResponseCacheControl() { return 'max-age=604800' }
  async isAuthorized() { return true }
  getMethod(method: string) {
    // Standard HTTP methods are handled by Nephele's built-in routes (GET, HEAD,
    // PUT, DELETE, COPY, MOVE, MKCOL, LOCK, UNLOCK, OPTIONS, PROPFIND, PROPPATCH).
    // This fallback is only for unrecognized methods.
    const err: any = new Error('Method not supported: ' + method)
    err.statusCode = 405
    throw err
  }

  async getResource(url: URL, baseUrl: URL) {
    const relPath = this.urlToRelativePath(url, baseUrl)
    if (relPath == null) throw Object.assign(new Error('Bad Gateway'), { statusCode: 502 })

    const parts = relPath.split('/').filter(Boolean)

    if (parts.length === 0) {
      // Root node
      return createVirtualResource(this, baseUrl, '/', this.rootNode, null, true)
    }

    const { node, trackIndex, realPath } = findNode(parts, this.tree)
    if (!node && !realPath) throw Object.assign(new Error('Resource not found'), { statusCode: 404 })

    const isCollection = !realPath
    const nodePath = '/' + parts.join('/')

    if (realPath) {
      return createVirtualResource(this, baseUrl, nodePath, null, realPath, false)
    }

    if (node && node.tracks.length === 1 && node.dirs.length === 0) {
      return createVirtualResource(this, baseUrl, nodePath, null, node.tracks[0].filePath, false)
    }

    // Handle multi-track nodes: find track by filename in URL
    if (node && node.tracks.length > 1) {
      const fileName = parts[parts.length - 1]
      const matched = node.tracks.find(t => path.basename(t.filePath) === fileName)
      if (matched) {
        return createVirtualResource(this, baseUrl, nodePath, null, matched.filePath, false)
      }
    }

    return createVirtualResource(this, baseUrl, nodePath + '/', node, null, true)
  }

  async newResource() { throw Object.assign(new Error('Forbidden'), { statusCode: 403 }) }
  async newCollection() { throw Object.assign(new Error('Forbidden'), { statusCode: 403 }) }
}

// ─── Server setup ───

let _webdavApp: ReturnType<typeof createServer> | null = null

export function initWebdav(): ReturnType<typeof createServer> {
  if (_webdavApp) return _webdavApp

  const tracks = getMusicLibrary()
  const tree = buildDirs(tracks)
  const adapter = new VirtualAdapter(tree)

  class NoAuth {
    async authenticate() { return { username: 'sonos' } }
    async cleanAuthentication() {}
  }

  _webdavApp = createServer({
    adapter: adapter as any,
    authenticator: new NoAuth(),
  })

  return _webdavApp
}
