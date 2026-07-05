import { Router } from 'express'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { getTrackById } from './music-discovery.js'

export function createMusicServerRouter(): Router {
  const router = Router()

  router.get('/stream/:id', async (req, res) => {
    const track = getTrackById(req.params.id)
    if (!track) {
      res.status(404).json({ error: 'Track not found' })
      return
    }

    try {
      const fileStat = await stat(track.filePath)
      const fileSize = fileStat.size
      const range = req.headers.range

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunkSize = end - start + 1

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'audio/mpeg',
        })
        createReadStream(track.filePath, { start, end }).pipe(res)
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'audio/mpeg',
        })
        createReadStream(track.filePath).pipe(res)
      }
    } catch {
      res.status(500).json({ error: 'Failed to stream file' })
    }
  })

  return router
}
