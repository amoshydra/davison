import path from 'node:path'
import os from 'node:os'

function detectLanIp(): string {
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    if (name.startsWith('wg') || name.startsWith('tun') || name.startsWith('docker') || name.startsWith('br-')) continue
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address
      }
    }
  }
  return '127.0.0.1'
}

export const config = {
  port: 4534,
  host: detectLanIp(),
  musicPaths: [] as string[],
  webdavEnabled: true,
  webdavUser: '' as string,
  webdavPass: '' as string,
  dataDir: path.resolve(import.meta.dirname, '..', 'data'),
  playlistsFile: path.resolve(import.meta.dirname, '..', 'data', 'playlists.json'),
}
