import { useState, useEffect, useCallback, useRef } from 'react'
import type { SonosDevice, MusicTrack, ServerStatus, Playlist, LoopMode } from '../types'

const BASE = '/api'
const CACHE_KEY_DEVICES = 'sonos:devices'
const CACHE_KEY_SELECTED = 'sonos:selectedId'

function cacheGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function cacheSet(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`API error: ${res.statusText}`)
  return res.json()
}

export function useDevices() {
  const [devices, setDevices] = useState<SonosDevice[]>(() => cacheGet(CACHE_KEY_DEVICES, []))
  const [selectedId, setSelectedId] = useState<string | null>(() => cacheGet(CACHE_KEY_SELECTED, null))
  const [isScanning, setIsScanning] = useState(false)
  const hasCached = useRef(devices.length > 0)

  const select = useCallback(async (id: string) => {
    await fetchJson('/devices/select', { method: 'POST', body: JSON.stringify({ id }) })
    setSelectedId(id)
    cacheSet(CACHE_KEY_SELECTED, id)
  }, [])

  const discover = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsScanning(true)
    try {
      const d = await fetchJson<SonosDevice[]>('/devices/discover', { method: 'POST' })

      if (d.length > 0) {
        cacheSet(CACHE_KEY_DEVICES, d)
      }
      setDevices(d)

      const existingDevice = selectedId && d.find(dev => dev.id === selectedId)
      if (existingDevice) {
        await select(existingDevice.id)
      } else if (d.length > 0) {
        await select(d[0].id)
      } else {
        setSelectedId(null)
      }

      return d
    } finally {
      setIsScanning(false)
    }
  }, [selectedId, select])

  useEffect(() => {
    void discover(!hasCached.current)
  }, [])

  const selectedDevice = devices.find(d => d.id === selectedId) || null

  return { devices, selectedId, selectedDevice, isScanning, discover, select }
}

export function useMusic() {
  const [tracks, setTracks] = useState<MusicTrack[]>([])

  const load = useCallback(async () => {
    const t = await fetchJson<MusicTrack[]>('/music')
    setTracks(t)
  }, [])

  return { tracks, load }
}

export function useStatus() {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const fetchStatus = useCallback(async () => {
    try {
      const s = await fetchJson<ServerStatus>('/status')
      setStatus(s)
    } catch {
      // server not ready yet
    }
  }, [])

  const startPolling = useCallback(() => {
    void fetchStatus()
    intervalRef.current = setInterval(fetchStatus, 2000)
  }, [fetchStatus])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return { status, fetchStatus, startPolling, stopPolling }
}

export function usePlayback() {
  const send = useCallback(async (action: string, body?: Record<string, unknown>) => {
    return fetchJson(`/${action}`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }, [])

  return {
    play: () => send('play'),
    pause: () => send('pause'),
    stop: () => send('stop'),
    next: () => send('next'),
    previous: () => send('previous'),
    setVolume: (volume: number) => send('volume', { volume }),
    seekTo: (seconds: number) => send('seek', { seconds }),
    setLoop: (mode: LoopMode) => send('loop', { mode }),
    addToQueue: (trackIds: string[]) => send('queue/add', { trackIds }),
    playNow: (trackIds: string[]) => send('queue/play-now', { trackIds }),
    playNext: (trackIds: string[]) => send('queue/play-next', { trackIds }),
    playFolderOrNow: (trackId: string) => send('queue/play-folder-or-now', { trackId }),
    removeFromQueue: (index: number) => send('queue/remove', { index }),
    clearQueue: () => send('queue/clear'),
    reorderQueue: (from: number, to: number) => send('queue/reorder', { from, to }),
    jumpTo: (trackId: string) => send('queue/jump', { trackId }),
  }
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([])

  const load = useCallback(async () => {
    const p = await fetchJson<Playlist[]>('/playlists')
    setPlaylists(p)
  }, [])

  const create = useCallback(async (name: string, trackIds?: string[]) => {
    await fetchJson('/playlists', { method: 'POST', body: JSON.stringify({ name, trackIds }) })
    await load()
  }, [load])

  const remove = useCallback(async (id: string) => {
    await fetchJson(`/playlists/${id}`, { method: 'DELETE' })
    await load()
  }, [load])

  const play = useCallback(async (id: string) => {
    await fetchJson(`/playlists/${id}/play`, { method: 'POST' })
  }, [])

  const update = useCallback(async (id: string, data: { name?: string; trackIds?: string[] }) => {
    await fetchJson(`/playlists/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    await load()
  }, [load])

  return { playlists, load, create, remove, play, update }
}
