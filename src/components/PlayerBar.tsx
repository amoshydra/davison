import { Play, Pause, SkipBack, SkipForward, Volume2, Music } from 'lucide-react'
import { useState, useCallback } from 'react'
import type { MusicTrack, ServerStatus } from '../types'

interface Props {
  status: ServerStatus | null
  volume: number
  deviceName?: string
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrevious: () => void
  onSetVolume: (v: number) => void
  onClickTrack: () => void
}

export function PlayerBar({ status, volume, deviceName, onPlay, onPause, onNext, onPrevious, onSetVolume, onClickTrack }: Props) {
  const track = status?.queue.currentTrack
  const sonos = status?.sonos
  const isPlaying = sonos?.state === 'PLAYING'
  const progress = (sonos && sonos.track.duration > 0) ? (sonos.track.position / sonos.track.duration) * 100 : 0

  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPlaying) onPause()
    else onPlay()
  }, [isPlaying, onPlay, onPause])

  const handleNext = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onNext() }, [onNext])
  const handlePrevious = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onPrevious() }, [onPrevious])

  if (!track) {
    return null
  }

  return (
    <div className="player-bar" onClick={onClickTrack}>
      <div className="player-bar-progress" style={{ width: `${progress}%` }} />
      <div className="player-bar-content">
        <div className="player-bar-track">
          <div className="player-bar-cover">
            {status?.queue.currentTrack ? (
              <img
                src={`/api/music/cover/${status.queue.currentTrack.id}`}
                alt=""
                className="player-bar-img"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <Music size={20} />
            )}
          </div>
          <div className="player-bar-text">
            <span className="player-bar-title">{track.title}</span>
            <span className="player-bar-artist">{track.artist}{deviceName ? ` · ${deviceName}` : ''}</span>
          </div>
        </div>
        <div className="player-bar-controls" onClick={e => e.stopPropagation()}>
          <button onClick={handlePrevious} title="Previous" aria-label="Previous track">
            <SkipBack size={18} />
          </button>
          <button onClick={handlePlayPause} title={isPlaying ? 'Pause' : 'Play'} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button onClick={handleNext} title="Next" aria-label="Next track">
            <SkipForward size={18} />
          </button>
        </div>
        <div className="player-bar-volume">
          <Volume2 size={16} />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onClick={e => e.stopPropagation()}
            onChange={e => onSetVolume(Number(e.target.value))}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  )
}
