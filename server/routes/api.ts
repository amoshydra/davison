import { Router } from 'express'
import { getMusicLibrary } from '../services/music-discovery.js'
import { sonosController } from '../services/sonos-controller.js'
import { queueManager, LoopMode } from '../services/queue-manager.js'
import { getPlaylists, getPlaylist, createPlaylist, deletePlaylist, updatePlaylist } from '../services/playlist-store.js'
import { audioGenService } from '../services/audio-gen.js'
import { createMusicServerRouter } from '../services/music-server.js'

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

  router.post('/devices/select', (req, res) => {
    const { id } = req.body as { id: string }
    const ok = sonosController.selectDevice(id)
    if (!ok) {
      res.status(404).json({ error: 'Device not found' })
      return
    }
    void sonosController.startListening()
    res.json({ success: true })
  })

  router.get('/music', (_req, res) => {
    res.json(getMusicLibrary())
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
    const { volume } = req.body as { volume: number }
    const v = Math.max(0, Math.min(100, volume))
    void sonosController.setVolume(v)
    res.json({ success: true })
  })

  router.get('/queue', (_req, res) => {
    res.json(queueManager.getQueue())
  })

  router.post('/queue/add', (req, res) => {
    const { trackIds } = req.body as { trackIds: string[] }
    void queueManager.addToQueue(trackIds)
    res.json({ success: true })
  })

  router.post('/queue/remove', (req, res) => {
    const { index } = req.body as { index: number }
    queueManager.removeFromQueue(index)
    res.json({ success: true })
  })

  router.post('/queue/clear', (_req, res) => {
    queueManager.clearQueue()
    res.json({ success: true })
  })

  router.post('/queue/reorder', (req, res) => {
    const { from, to } = req.body as { from: number; to: number }
    queueManager.reorderQueue(from, to)
    res.json({ success: true })
  })

  router.post('/queue/jump', (req, res) => {
    const { trackId } = req.body as { trackId: string }
    void queueManager.jumpTo(trackId)
    res.json({ success: true })
  })

  router.post('/loop', (req, res) => {
    const { mode } = req.body as { mode: LoopMode }
    queueManager.setLoopMode(mode)
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

  router.post('/playlists', (req, res) => {
    const { name, trackIds } = req.body as { name: string; trackIds?: string[] }
    if (!name) {
      res.status(400).json({ error: 'Name is required' })
      return
    }
    void createPlaylist(name, trackIds).then(p => res.json(p))
  })

  router.put('/playlists/:id', (req, res) => {
    const { name, trackIds } = req.body as { name?: string; trackIds?: string[] }
    void updatePlaylist(req.params.id, { name, trackIds }).then(p => {
      if (!p) {
        res.status(404).json({ error: 'Playlist not found' })
        return
      }
      res.json(p)
    })
  })

  router.delete('/playlists/:id', (req, res) => {
    void deletePlaylist(req.params.id).then(ok => {
      res.json({ success: ok })
    })
  })

  router.post('/playlists/:id/play', (req, res) => {
    const playlist = getPlaylist(req.params.id)
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' })
      return
    }
    const tracks = playlist.trackIds
      .map(id => getMusicLibrary().find(t => t.id === id))
      .filter(Boolean) as import('../services/music-discovery.js').MusicTrack[]
    queueManager.setQueue(tracks)
    res.json({ success: true })
  })

  router.post('/generate', (req, res) => {
    const { prompt } = req.body as { prompt: string }
    void audioGenService.generate({ prompt }).then(result => {
      res.json(result)
    }).catch(err => {
      res.status(500).json({ error: err.message })
    })
  })

  return router
}
