import path from 'node:path'

export const config = {
  port: 3000,
  musicPaths: [] as string[],
  dataDir: path.resolve(import.meta.dirname, '..', 'data'),
  playlistsFile: path.resolve(import.meta.dirname, '..', 'data', 'playlists.json'),
}
