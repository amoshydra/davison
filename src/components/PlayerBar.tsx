import { Play, Pause, Loader2, SkipBack, SkipForward, Music, Minus, Plus } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import type { MusicTrack, ServerStatus } from '../types'

interface Props {
  status: ServerStatus | null
  volume: number
  deviceName?: string
  syncState?: string | null
  syncVolume?: number | null
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrevious: () => void
  onSetVolume: (v: number) => void
  onClickTrack: () => void
}

export function PlayerBar({ status, volume, deviceName, syncState, syncVolume, onPlay, onPause, onNext, onPrevious, onSetVolume, onClickTrack }: Props) {
  const track = status?.queue.currentTrack
  const sonos = status?.sonos
  const isPlaying = sonos?.state === 'PLAYING'
  const progress = (sonos && sonos.track.duration > 0) ? (sonos.track.position / sonos.track.duration) * 100 : 0
  const [coverError, setCoverError] = useState(false)
  const coverTrackId = sonos?.track.trackId || track?.id
  const coverImgUrl = coverTrackId ? `/api/music/cover/${coverTrackId}` : null
  const noDevice = !!track && !sonos

  useEffect(() => { setCoverError(false) }, [coverTrackId])

  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (noDevice) onPause()
    else if (isPlaying) onPause()
    else onPlay()
  }, [isPlaying, onPlay, onPause, noDevice])

  const handleNext = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onNext() }, [onNext])
  const handlePrevious = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onPrevious() }, [onPrevious])

  if (!track) return null

  return (
    <div className="player-bar" onClick={onClickTrack}>
      <div className="player-bar-progress" style={{ width: noDevice ? '100%' : `${progress}%`, opacity: noDevice ? .3 : 1 }} />
      <div className="player-bar-content">
        <div className="player-bar-track">
          <div className="player-bar-cover">
            {coverTrackId && !coverError ? (
              <img src={coverImgUrl!} alt="" className="player-bar-img" onError={() => setCoverError(true)} />
            ) : (
              <Music size={20} />
            )}
          </div>
          <div className="player-bar-text">
            <span className="player-bar-title">{track.title}</span>
            <span className="player-bar-artist">
              {noDevice ? 'Select a device in Settings to play' : track.artist}
              {deviceName && !noDevice ? ` · ${deviceName}` : ''}
            </span>
          </div>
        </div>
        <div className="player-bar-controls" onClick={e => e.stopPropagation()}>
          <button onClick={handlePrevious} aria-label="Previous"><SkipBack size={18} /></button>
          <button className={syncState ? 'syncing' : ''} onClick={handlePlayPause} aria-label={isPlaying ? 'Pause' : noDevice ? 'Cancel' : 'Play'}>
            {noDevice ? <Loader2 size={20} className="spin" /> : isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button onClick={handleNext} aria-label="Next"><SkipForward size={18} /></button>
        </div>
        <div className={`player-bar-volume${syncVolume !== null ? ' syncing' : ''}`} onClick={e => e.stopPropagation()}>
          <button className="pv-btn" onClick={() => onSetVolume(Math.max(0, volume - 5))} aria-label="Volume down">
            <Minus size={14} />
          </button>
          <span className="pv-value">{volume}</span>
          <button className="pv-btn" onClick={() => onSetVolume(Math.min(100, volume + 5))} aria-label="Volume up">
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
