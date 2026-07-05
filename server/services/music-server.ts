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

      const sendStream = (start: number, end: number) => {
        const stream = createReadStream(track.filePath, { start, end })

        stream.on('error', (err) => {
          console.error('Stream error:', err)
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error' })
          }
        })

        res.on('close', () => {
          stream.destroy()
        })

        stream.pipe(res)
      }

      if (range) {
        const match = range.match(/^bytes=(\d+)-(\d*)$/)
        if (!match) {
          res.status(416).json({ error: 'Invalid range' })
          return
        }
        const start = parseInt(match[1], 10)
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1

        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).json({ error: 'Range not satisfiable' })
          return
        }

        const chunkSize = end - start + 1
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'audio/mpeg',
        })
        sendStream(start, end)
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'audio/mpeg',
        })
        sendStream(0, fileSize - 1)
      }
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' })
      }
    }
  })

  return router
}
