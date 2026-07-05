import { readFile, writeFile, mkdir } from 'node:fs/promises'
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

let playlists: Playlist[] = []

export async function loadPlaylists(): Promise<void> {
  try {
    if (!existsSync(config.playlistsFile)) {
      await mkdir(config.dataDir, { recursive: true })
      playlists = []
      return
    }
    const data = await readFile(config.playlistsFile, 'utf-8')
    playlists = JSON.parse(data)
  } catch {
    playlists = []
  }
}

async function savePlaylists(): Promise<void> {
  await mkdir(config.dataDir, { recursive: true })
  await writeFile(config.playlistsFile, JSON.stringify(playlists, null, 2), 'utf-8')
}

export function getPlaylists(): Playlist[] {
  return [...playlists]
}

export function getPlaylist(id: string): Playlist | undefined {
  return playlists.find(p => p.id === id)
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
  return playlist
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
  Object.assign(playlist, updates, { updatedAt: new Date().toISOString() })
  await savePlaylists()
  return playlist
}
