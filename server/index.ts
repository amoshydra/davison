import express from 'express'
import ViteExpress from 'vite-express'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { config } from './config.js'
import { discoverMusic } from './services/music-discovery.js'
import { sonosController } from './services/sonos-controller.js'
import { loadPlaylists } from './services/playlist-store.js'
import { createApiRouter } from './routes/api.js'
import { initWebdav } from './services/webdav.js'
import { startAutoAdvancePolling, stopAutoAdvancePolling } from './services/queue-manager.js'

const program = new Command()

program
  .name('davison')
  .description('Sonos music player with web UI')
  .option('-p, --path <paths...>', 'Path(s) to music directories')
  .option('--port <number>', 'Server port', '3000')
  .option('--host <address>', 'Server LAN address (auto-detected if omitted)')
  .parse(process.argv)

const options = program.opts()

config.port = parseInt(options.port, 10) || 3000
if (options.host) config.host = options.host
config.musicPaths = options.path || []

config.musicPaths.forEach(p => {
  if (p.includes(' ')) {
    console.warn(`Warning: path "${p}" contains spaces — ensure it was quoted in the shell`)
  }
})

let server: ReturnType<typeof ViteExpress.listen> | null = null

async function main() {
  // Set cwd to package root so vite-express finds dist/ and vite.config
  process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'))

  console.log('Starting davison...')

  try {
    await loadPlaylists()
  } catch (err) {
    console.warn('Could not load playlists, starting fresh:', err)
  }

  if (config.musicPaths.length > 0) {
    console.log('Discovering music in:', config.musicPaths.join(', '))
    try {
      const tracks = await discoverMusic(config.musicPaths)
      console.log(`Found ${tracks.length} music files`)
    } catch (err) {
      console.warn('Music discovery failed:', err)
    }
  } else {
    console.log('No music paths specified. Use --path to add music folders.')
  }

  const app = express()
  app.use(express.json())

  app.use('/api', createApiRouter())
  app.use('/webdav', initWebdav())

  if (config.musicPaths.length > 0) {
    config.musicPaths.forEach((musicDir, i) => {
      app.use(`/music-files/${i}`, express.static(musicDir))
    })
    console.log(`Serving ${config.musicPaths.length} music director${config.musicPaths.length > 1 ? 'ies' : 'y'} at /music-files/* and /webdav/*`)
  }

  server = ViteExpress.listen(app, config.port, () => {
    console.log(`Davison running at http://${config.host}:${config.port}`)
    startAutoAdvancePolling()
  })
}

function shutdown(): void {
  console.log('\nShutting down gracefully...')
  stopAutoAdvancePolling()

  if (server) {
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
    // Force exit after 5s if close hangs
    setTimeout(() => {
      console.warn('Forced shutdown after timeout')
      process.exit(1)
    }, 5000).unref()
  } else {
    process.exit(0)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
