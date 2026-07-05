import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Volume2, ListMusic } from 'lucide-react'
import { useCallback, useState, useEffect, useRef } from 'react'
import type { ServerStatus, LoopMode } from '../types'

interface Props {
  status: ServerStatus | null
  volume: number
  loopMode: LoopMode
  deviceName?: string
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrevious: () => void
  onSetVolume: (v: number) => void
  onSetLoop: (m: LoopMode) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function NowPlayingView({ status, volume, loopMode, deviceName, onPlay, onPause, onNext, onPrevious, onSetVolume, onSetLoop }: Props) {
  const sonos = status?.sonos
  const queue = status?.queue.queue || []
  const currentIndex = status?.queue.currentIndex ?? -1
  const currentTrack = status?.queue.currentTrack
  const isPlaying = sonos?.state === 'PLAYING'
  const [showUpNext, setShowUpNext] = useState(false)

  const progress = (sonos && sonos.track.duration > 0) ? (sonos.track.position / sonos.track.duration) * 100 : 0
  const coverUrl = (sonos?.track.trackId || currentTrack?.id) ? `/api/music/cover/${sonos?.track.trackId || currentTrack?.id}` : null
  const [coverError, setCoverError] = useState(false)

  useEffect(() => { setCoverError(false) }, [sonos?.track.trackId, currentTrack?.id])

  const nextTracks = currentIndex >= 0 ? queue.slice(currentIndex + 1, currentIndex + 10) : []

  const toggleLoop = useCallback(() => {
    const next: Record<LoopMode, LoopMode> = { none: 'one', one: 'all', all: 'none' }
    onSetLoop(next[loopMode])
  }, [loopMode, onSetLoop])

  // Swipe detection
  const touchStartX = useRef(0)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 60) {
      if (dx < 0) onNext()
      else onPrevious()
    }
  }, [onNext, onPrevious])

  return (
    <div
      className="now-playing-view"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Hero */}
      <div className="np-hero">
        {coverUrl && !coverError ? (
          <img
            src={coverUrl}
            alt=""
            className="np-cover"
            onError={() => setCoverError(true)}
          />
        ) : (
          <div className={`vinyl-disc${isPlaying ? ' playing' : ''}`} />
        )}
      </div>

      {/* Track info */}
      <div className="np-info">
        {sonos ? (
          <>
            <h2 className="np-title">{sonos.track.title}</h2>
            <p className="np-artist">{sonos.track.artist}</p>
            {deviceName && <span className="np-device">{deviceName}</span>}
          </>
        ) : (
          <>
            <h2 className="np-title">No track playing</h2>
            <p className="np-artist">Select music to play</p>
          </>
        )}
      </div>

      {/* Progress */}
      {sonos && (
        <div className="np-progress">
          <div className="np-progress-track">
            <div className="np-progress-fill" style={{ width: `${progress}%` }} />
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              className="np-seek"
              aria-label="Seek"
            />
          </div>
          <div className="np-times">
            <span>{formatTime(sonos.track.position)}</span>
            <span>{formatTime(sonos.track.duration)}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="np-controls">
        <button className="np-btn" onClick={toggleLoop} aria-label="Toggle loop">
          {loopMode === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
          {loopMode !== 'none' && <span className="np-badge" />}
        </button>
        <button className="np-btn" onClick={onPrevious} aria-label="Previous">
          <SkipBack size={26} />
        </button>
        <button className="np-play" onClick={isPlaying ? onPause : onPlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={32} /> : <Play size={32} />}
        </button>
        <button className="np-btn" onClick={onNext} aria-label="Next">
          <SkipForward size={26} />
        </button>
        <button className="np-btn" onClick={() => setShowUpNext(!showUpNext)} aria-label="Up next">
          <ListMusic size={22} />
        </button>
      </div>

      {/* Volume */}
      <div className="np-volume">
        <Volume2 size={16} />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={e => onSetVolume(Number(e.target.value))}
          aria-label="Volume"
        />
        <span className="np-vol-value">{volume}</span>
      </div>

      {/* Up next (collapsible) */}
      {nextTracks.length > 0 && showUpNext && (
        <div className="np-upnext">
          <h4>Up next</h4>
          {nextTracks.map((t, i) => (
            <div key={`${t.id}-${i}`} className="np-upnext-item">
              <span className="np-upnext-num">{currentIndex + 2 + i}</span>
              <div className="np-upnext-info">
                <span>{t.title}</span>
                <span>{t.artist}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
