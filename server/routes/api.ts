import { Router } from 'express'
import { getMusicLibrary } from '../services/music-discovery.js'
import { sonosController } from '../services/sonos-controller.js'
import { queueManager, LoopMode } from '../services/queue-manager.js'
import { getPlaylists, getPlaylist, createPlaylist, deletePlaylist, updatePlaylist } from '../services/playlist-store.js'
import { audioGenService } from '../services/audio-gen.js'
import { createMusicServerRouter } from '../services/music-server.js'
import type { MusicTrack } from '../services/music-discovery.js'

const VALID_LOOP_MODES: ReadonlySet<string> = new Set(['none', 'one', 'all'])

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function createApiRouter(): Router {
  const router = Router()

  router.get('/devices', async (_req, res) => {
    const devices = sonosController.getDevices()
    res.json(devices)
  })

  router.post('/devices/discover', async (_req, res) => {
    const devices = await sonosController.discoverDevices()
    res.json(devices)
  })

  router.post('/devices/select', async (req, res) => {
    const id = asString(req.body?.id)
    if (!id) {
      res.status(400).json({ error: 'Device id is required' })
      return
    }
    const ok = sonosController.selectDevice(id)
    if (!ok) {
      res.status(404).json({ error: 'Device not found' })
      return
    }
    // Resume playback if tracks were queued while no device was selected
    await queueManager.resumePlayback().catch(err => {
      console.warn('Failed to resume playback after device select:', err)
    })
    res.json({ success: true })
  })

  router.get('/music', (req, res) => {
    const all = getMusicLibrary()
    const offset = Math.max(0, asNumber(req.query.offset ? Number(req.query.offset) : undefined, 0))
    const limit = Math.max(1, Math.min(1000, asNumber(req.query.limit ? Number(req.query.limit) : undefined, all.length)))
    res.json(all.slice(offset, offset + limit))
  })

  router.use('/music', createMusicServerRouter())

  router.get('/status', async (_req, res) => {
    const sonosStatus = await sonosController.getStatus()
    const queueState = queueManager.getState()
    res.json({ sonos: sonosStatus, queue: queueState })
  })

  router.post('/play', async (_req, res) => {
    await queueManager.play()
    res.json({ success: true })
  })

  router.post('/pause', async (_req, res) => {
    await queueManager.pause()
    res.json({ success: true })
  })

  router.post('/stop', async (_req, res) => {
    await queueManager.stop()
    res.json({ success: true })
  })

  router.post('/next', async (_req, res) => {
    await queueManager.next()
    res.json({ success: true })
  })

  router.post('/previous', async (_req, res) => {
    await queueManager.previous()
    res.json({ success: true })
  })

  router.post('/volume', (req, res) => {
    const volume = asNumber(req.body?.volume, -1)
    if (volume < 0 || volume > 100) {
      res.status(400).json({ error: 'Volume must be between 0 and 100' })
      return
    }
    sonosController.setVolume(volume).catch(err => {
      console.warn('Failed to set volume:', err)
    })
    res.json({ success: true })
  })

  router.get('/queue', (_req, res) => {
    res.json(queueManager.getQueue())
  })

  router.post('/queue/add', (req, res) => {
    const trackIds = asStringArray(req.body?.trackIds)
    if (trackIds.length === 0) {
      res.status(400).json({ error: 'trackIds array is required' })
      return
    }
    queueManager.addToQueue(trackIds).catch(err => {
      console.warn('Failed to add to queue:', err)
    })
    res.json({ success: true })
  })

  router.post('/queue/remove', (req, res) => {
    const index = asNumber(req.body?.index, -1)
    if (index < 0) {
      res.status(400).json({ error: 'Valid index is required' })
      return
    }
    queueManager.removeFromQueue(index)
    res.json({ success: true })
  })

  router.post('/queue/clear', (_req, res) => {
    queueManager.clearQueue()
    res.json({ success: true })
  })

  router.post('/queue/reorder', (req, res) => {
    const from = asNumber(req.body?.from, -1)
    const to = asNumber(req.body?.to, -1)
    if (from < 0 || to < 0) {
      res.status(400).json({ error: 'Valid from and to indices are required' })
      return
    }
    queueManager.reorderQueue(from, to)
    res.json({ success: true })
  })

  router.post('/queue/jump', (req, res) => {
    const trackId = asString(req.body?.trackId)
    if (!trackId) {
      res.status(400).json({ error: 'trackId is required' })
      return
    }
    queueManager.jumpTo(trackId).catch(err => {
      console.warn('Failed to jump:', err)
    })
    res.json({ success: true })
  })

  router.post('/queue/play-now', (req, res) => {
    const trackIds = asStringArray(req.body?.trackIds)
    if (trackIds.length === 0) {
      res.status(400).json({ error: 'trackIds array is required' })
      return
    }
    queueManager.playNow(trackIds).catch(err => {
      console.warn('Failed to play now:', err)
    })
    res.json({ success: true })
  })

  router.post('/queue/play-next', (req, res) => {
    const trackIds = asStringArray(req.body?.trackIds)
    if (trackIds.length === 0) {
      res.status(400).json({ error: 'trackIds array is required' })
      return
    }
    queueManager.playNext(trackIds).catch(err => {
      console.warn('Failed to play next:', err)
    })
    res.json({ success: true })
  })

  router.post('/queue/play-folder-or-now', (req, res) => {
    const trackId = asString(req.body?.trackId)
    if (!trackId) {
      res.status(400).json({ error: 'trackId is required' })
      return
    }
    queueManager.playFolderOrNow(trackId).catch(err => {
      console.warn('Failed to play folder/now:', err)
    })
    res.json({ success: true })
  })

  router.post('/loop', (req, res) => {
    const mode = asString(req.body?.mode)
    if (!VALID_LOOP_MODES.has(mode)) {
      res.status(400).json({ error: 'Mode must be one of: none, one, all' })
      return
    }
    queueManager.setLoopMode(mode as LoopMode)
    res.json({ success: true })
  })

  router.get('/playlists', (_req, res) => {
    res.json(getPlaylists())
  })

  router.get('/playlists/:id', (req, res) => {
    const playlist = getPlaylist(req.params.id)
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' })
      return
    }
    res.json(playlist)
  })

  router.post('/playlists', async (req, res) => {
    const name = asString(req.body?.name)
    if (!name) {
      res.status(400).json({ error: 'Name is required' })
      return
    }
    const trackIds = asStringArray(req.body?.trackIds)
    try {
      const p = await createPlaylist(name, trackIds)
      res.json(p)
    } catch (err) {
      console.warn('Failed to create playlist:', err)
      res.status(500).json({ error: 'Failed to create playlist' })
    }
  })

  router.put('/playlists/:id', async (req, res) => {
    try {
      const p = await updatePlaylist(req.params.id, {
        name: asString(req.body?.name),
        trackIds: asStringArray(req.body?.trackIds),
      })
      if (!p) {
        res.status(404).json({ error: 'Playlist not found' })
        return
      }
      res.json(p)
    } catch (err) {
      console.warn('Failed to update playlist:', err)
      res.status(500).json({ error: 'Failed to update playlist' })
    }
  })

  router.delete('/playlists/:id', async (req, res) => {
    try {
      const ok = await deletePlaylist(req.params.id)
      res.json({ success: ok })
    } catch (err) {
      console.warn('Failed to delete playlist:', err)
      res.status(500).json({ error: 'Failed to delete playlist' })
    }
  })

  router.post('/playlists/:id/play', (req, res) => {
    const playlist = getPlaylist(req.params.id)
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' })
      return
    }
    const allTracks = getMusicLibrary()
    const tracks = playlist.trackIds
      .map(id => allTracks.find(t => t.id === id))
      .filter((t): t is MusicTrack => !!t)
    queueManager.setQueue(tracks)
    res.json({ success: true })
  })

  router.post('/generate', (req, res) => {
    const prompt = asString(req.body?.prompt)
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' })
      return
    }
    audioGenService.generate({ prompt }).then(result => {
      res.json(result)
    }).catch(err => {
      console.warn('Audio generation failed:', err)
      res.status(500).json({ error: err.message })
    })
  })

  return router
}
