export interface MusicTrack {
  id: string
  filePath: string
  fileName: string
  relativePath: string
  baseIdx: number
  baseName: string
  title: string
  artist: string
  album: string
  duration: number
  format: string
  size: number
}

export interface SonosDevice {
  id: string
  name: string
  ip: string
  model: string
  group: string
}

export interface TrackInfo {
  title: string
  artist: string
  album: string
  albumArt: string
  duration: number
  position: number
}

export interface SonosStatus {
  state: 'PLAYING' | 'PAUSED_PLAYBACK' | 'STOPPED'
  track: TrackInfo
  volume: number
  muted: boolean
}

export type LoopMode = 'none' | 'one' | 'all'

export interface QueueState {
  queue: MusicTrack[]
  history: MusicTrack[]
  currentIndex: number | null
  loopMode: LoopMode
  autoPlay: boolean
  currentTrack: MusicTrack | null
  nextTrack: MusicTrack | null
}

export interface ServerStatus {
  sonos: SonosStatus | null
  queue: QueueState
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: string
  updatedAt: string
}
