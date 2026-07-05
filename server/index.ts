import express from 'express'
import ViteExpress from 'vite-express'
import { Command } from 'commander'
import { config } from './config.js'
import { discoverMusic } from './services/music-discovery.js'
import { sonosController } from './services/sonos-controller.js'
import { loadPlaylists } from './services/playlist-store.js'
import { createApiRouter } from './routes/api.js'
import { startAutoAdvancePolling } from './services/queue-manager.js'

const program = new Command()

program
  .name('sonos-node')
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
      console.warn(`Warning: path "${p}" contains spaces — make sure it was quoted in the shell`)
    }
  })

async function main() {
  console.log('Starting sonos-node...')

  await loadPlaylists()

  if (config.musicPaths.length > 0) {
    console.log('Discovering music in:', config.musicPaths.join(', '))
    const tracks = await discoverMusic(config.musicPaths)
    console.log(`Found ${tracks.length} music files`)
  } else {
    console.log('No music paths specified. Use --path to add music folders.')
  }

  const app = express()
  app.use(express.json())

  app.use('/api', createApiRouter())

  if (config.musicPaths.length > 0) {
    config.musicPaths.forEach((musicDir, i) => {
      app.use(`/music-files/${i}`, express.static(musicDir))
    })
    console.log(`Serving ${config.musicPaths.length} music director${config.musicPaths.length > 1 ? 'ies' : 'y'} at /music-files/*`)
  }

  sonosController.discoverDevices().then(devices => {
    console.log(`Discovered ${devices.length} Sonos device(s)`)
    if (devices.length > 0) {
      console.log(`  ${devices.map(d => `${d.name} (${d.ip})`).join('\n  ')}`)
    }
  })

  ViteExpress.listen(app, config.port, () => {
    console.log(`Sonos Node running at http://${config.host}:${config.port}`)
    startAutoAdvancePolling()
  })
}

main().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
