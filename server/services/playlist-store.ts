import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: string
  updatedAt: string
}

const ALLOWED_UPDATES = new Set(['name', 'trackIds'])

let playlists: Playlist[] = []

function isValidPlaylistArray(data: unknown): data is Playlist[] {
  if (!Array.isArray(data)) return false
  return data.every(item =>
    item !== null &&
    typeof item === 'object' &&
    typeof (item as Playlist).id === 'string' &&
    typeof (item as Playlist).name === 'string' &&
    Array.isArray((item as Playlist).trackIds),
  )
}

export async function loadPlaylists(): Promise<void> {
  try {
    if (!existsSync(config.playlistsFile)) {
      await mkdir(config.dataDir, { recursive: true })
      playlists = []
      return
    }
    const data = await readFile(config.playlistsFile, 'utf-8')
    const parsed = JSON.parse(data)
    if (isValidPlaylistArray(parsed)) {
      playlists = parsed
    } else {
      console.warn('Corrupted playlists.json, starting fresh')
      playlists = []
    }
  } catch (err) {
    console.warn('Failed to load playlists:', err)
    playlists = []
  }
}

async function savePlaylists(): Promise<void> {
  await mkdir(config.dataDir, { recursive: true })
  const tmp = config.playlistsFile + '.tmp'
  await writeFile(tmp, JSON.stringify(playlists, null, 2), 'utf-8')
  await rename(tmp, config.playlistsFile)
}

export function getPlaylists(): Playlist[] {
  return playlists.map(p => ({ ...p }))
}

export function getPlaylist(id: string): Playlist | undefined {
  const p = playlists.find(p => p.id === id)
  return p ? { ...p } : undefined
}

export async function createPlaylist(name: string, trackIds: string[] = []): Promise<Playlist> {
  const playlist: Playlist = {
    id: randomUUID(),
    name,
    trackIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  playlists.push(playlist)
  await savePlaylists()
  return { ...playlist }
}

export async function deletePlaylist(id: string): Promise<boolean> {
  const idx = playlists.findIndex(p => p.id === id)
  if (idx === -1) return false
  playlists.splice(idx, 1)
  await savePlaylists()
  return true
}

export async function updatePlaylist(id: string, updates: Partial<Playlist>): Promise<Playlist | null> {
  const playlist = playlists.find(p => p.id === id)
  if (!playlist) return null

  const safe: Record<string, unknown> = {}
  for (const key of ALLOWED_UPDATES) {
    if (key in updates) {
      (safe as any)[key] = (updates as any)[key]
    }
  }
  Object.assign(playlist, safe, { updatedAt: new Date().toISOString() })
  await savePlaylists()
  return { ...playlist }
}
