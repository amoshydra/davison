import type { ServerStatus } from '../types'

interface Props {
  status: ServerStatus | null
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function NowPlaying({ status }: Props) {
  if (!status?.sonos) {
    return (
      <div className="now-playing">
        <p className="no-track">No track playing</p>
      </div>
    )
  }

  const { sonos } = status
  const progress = sonos.track.duration > 0
    ? (sonos.track.position / sonos.track.duration) * 100
    : 0

  return (
    <div className="now-playing">
      <h3>Now Playing</h3>
      {sonos.track.albumArt && (
        <img
          src={sonos.track.albumArt}
          alt="Album art"
          className="album-art"
        />
      )}
      <div className="track-details">
        <div className="track-title">{sonos.track.title}</div>
        <div className="track-artist">{sonos.track.artist}</div>
        <div className="track-album">{sonos.track.album}</div>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="time-display">
        <span>{formatTime(sonos.track.position)}</span>
        <span>{formatTime(sonos.track.duration)}</span>
      </div>
      <div className="state-indicator">
        {sonos.state === 'PLAYING' ? '▶ Playing' : sonos.state === 'PAUSED_PLAYBACK' ? '⏸ Paused' : '⏹ Stopped'}
      </div>
    </div>
  )
}
