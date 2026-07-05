import { ChevronLeft, Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Volume2 } from 'lucide-react'
import { useCallback } from 'react'
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
  onBack?: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function NowPlayingView({ status, volume, loopMode, deviceName, onPlay, onPause, onNext, onPrevious, onSetVolume, onSetLoop, onBack }: Props) {
  const sonos = status?.sonos
  const queue = status?.queue.queue || []
  const currentIndex = status?.queue.currentIndex ?? -1
  const isPlaying = sonos?.state === 'PLAYING'

  const progress = (sonos && sonos.track.duration > 0) ? (sonos.track.position / sonos.track.duration) * 100 : 0

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // seeking not implemented on server yet
  }, [])

  const nextTracks = currentIndex >= 0 ? queue.slice(currentIndex + 1, currentIndex + 6) : []

  const toggleLoop = useCallback(() => {
    const next: Record<LoopMode, LoopMode> = { none: 'one', one: 'all', all: 'none' }
    onSetLoop(next[loopMode])
  }, [loopMode, onSetLoop])

  return (
    <div className="now-playing-view">
      {onBack && (
        <button className="now-playing-back" onClick={onBack}>
          <ChevronLeft size={20} />
          Back
        </button>
      )}

      <div className="now-playing-hero">
        <div className={`vinyl-disc${isPlaying ? ' playing' : ''}`} />
      </div>

      <div className="now-playing-info">
        {sonos ? (
          <>
            <h2>{sonos.track.title}</h2>
            <p>{sonos.track.artist}</p>
            {deviceName && <span className="now-playing-device">{deviceName}</span>}
          </>
        ) : (
          <>
            <h2>No track playing</h2>
            <p>Select music to play</p>
          </>
        )}
      </div>

      {sonos && (
        <div className="now-playing-progress">
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={handleSeek}
            aria-label="Seek"
          />
          <div className="now-playing-times">
            <span>{formatTime(sonos.track.position)}</span>
            <span>{formatTime(sonos.track.duration)}</span>
          </div>
        </div>
      )}

      <div className="now-playing-controls">
        <button
          className={`btn-sm ${loopMode !== 'none' ? 'btn-active' : ''}`}
          onClick={toggleLoop}
          title={`Loop: ${loopMode}`}
          aria-label="Toggle loop mode"
        >
          {loopMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
        </button>
        <button className="btn-sm" onClick={onPrevious} aria-label="Previous">
          <SkipBack size={24} />
        </button>
        <button className="btn-play" onClick={isPlaying ? onPause : onPlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={28} /> : <Play size={28} />}
        </button>
        <button className="btn-sm" onClick={onNext} aria-label="Next">
          <SkipForward size={24} />
        </button>
        <button className="btn-sm" onClick={onSetVolume.bind(null, Math.max(0, volume - 5))} aria-label="Volume down" style={{ visibility: 'hidden' }}>
          <Volume2 size={20} />
        </button>
      </div>

      <div className="now-playing-volume">
        <Volume2 size={18} />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={e => onSetVolume(Number(e.target.value))}
          aria-label="Volume"
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text3)', minWidth: 28, textAlign: 'right' }}>{volume}</span>
      </div>

      {nextTracks.length > 0 && (
        <div className="now-playing-upnext">
          <h4>Up next</h4>
          {nextTracks.map((t, i) => (
            <div key={`${t.id}-${i}`} className="now-playing-upnext-item">
              <span>{currentIndex + 2 + i}</span>
              <div className="upnext-info">
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
