import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseFile } from 'music-metadata'
import { randomUUID } from 'node:crypto'

export interface MusicTrack {
  id: string
  filePath: string
  fileName: string
  relativePath: string
  baseIdx: number
  baseName: string
  title: string
  artist: string
  album: string
  duration: number
  format: string
  size: number
}

const supportedExtensions = new Set([
  '.mp3', '.flac', '.wav', '.m4a', '.m4b', '.ogg', '.opus',
  '.wma', '.aac', '.aiff', '.dsf', '.ape',
])

let musicLibrary: MusicTrack[] = []

async function walkDir(dirPath: string, basePath: string, baseIdx: number, baseName: string): Promise<MusicTrack[]> {
  const results: MusicTrack[] = []
  const entries = await readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...await walkDir(fullPath, basePath, baseIdx, baseName))
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (!supportedExtensions.has(ext)) continue

      let metadata
      try {
        metadata = await parseFile(fullPath)
      } catch {
        metadata = { format: { duration: 0 }, common: { title: '', artist: '', album: '' } }
      }

      results.push({
        id: randomUUID(),
        filePath: fullPath,
        fileName: entry.name,
        relativePath: path.relative(basePath, fullPath),
        baseIdx,
        baseName,
        title: metadata.common.title || path.parse(entry.name).name,
        artist: metadata.common.artist || 'Unknown Artist',
        album: metadata.common.album || 'Unknown Album',
        duration: metadata.format.duration || 0,
        format: ext.slice(1),
        size: (await stat(fullPath)).size,
      })
    }
  }
  return results
}

export async function discoverMusic(paths: string[]): Promise<MusicTrack[]> {
  const all: MusicTrack[] = []
  for (let i = 0; i < paths.length; i++) {
    const resolved = path.resolve(paths[i])
    try {
      const stats = await stat(resolved)
      if (stats.isDirectory()) {
        const parentDir = path.basename(path.dirname(resolved))
        const baseName = parentDir && parentDir !== path.sep
          ? `${parentDir}/${path.basename(resolved)}`
          : path.basename(resolved)
        all.push(...await walkDir(resolved, resolved, i, baseName))
      }
    } catch {
      console.warn(`Music path not accessible: ${resolved}`)
    }
  }
  musicLibrary = all
  return musicLibrary
}

export function getMusicLibrary(): MusicTrack[] {
  return [...musicLibrary]
}

export function getTrackById(id: string): MusicTrack | undefined {
  return musicLibrary.find(t => t.id === id)
}
