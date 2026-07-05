import { X } from 'lucide-react'
import type { MusicTrack } from '../types'

interface Props {
  queue: MusicTrack[]
  currentIndex: number | null
  currentTrack: MusicTrack | null
  hasDevice: boolean
  onRemove: (index: number) => void
  onClear: () => void
  onJumpTo: (trackId: string) => void
}

export function QueueView({ queue, currentIndex, currentTrack, hasDevice, onRemove, onClear, onJumpTo }: Props) {
  if (queue.length === 0 && !currentTrack) {
    return (
      <div className="queue-view">
        <div className="queue-empty">
          <p>Queue is empty</p>
          <p style={{ fontSize: '0.8rem' }}>Browse music and add tracks</p>
        </div>
      </div>
    )
  }

  return (
    <div className="queue-view">
      <div className="view-panel-header">
        <h2>Queue</h2>
        {queue.length > 0 && (
          <button
            className="dir-btn"
            onClick={onClear}
            style={{ color: 'var(--text2)' }}
          >
            Clear
          </button>
        )}
      </div>

      {currentTrack && (
        <>
          <div className="queue-current">
            <span className="queue-badge">Now Playing</span>
            <h3>{currentTrack.title}</h3>
            <p>{currentTrack.artist}</p>
          </div>
          {!hasDevice && (
            <div className="queue-pending">
              Tracks queued — select a Sonos device in Settings to start playback
            </div>
          )}
        </>
      )}

      {queue.length > 0 && (
        <>
          {currentTrack && <div className="queue-section-title">Up Next ({queue.length})</div>}
          <div className="queue-list">
            {queue.map((track, i) => (
              <div
                key={`${track.id}-${i}`}
                className={`queue-item${i === currentIndex ? ' playing' : ''}`}
                onClick={() => onJumpTo(track.id)}
              >
                <span className="queue-pos">{i + 1}</span>
                <div className="queue-info">
                  <span>{track.title}</span>
                  <span>{track.artist}</span>
                </div>
                {i !== currentIndex && (
                  <button
                    className="queue-remove"
                    onClick={e => { e.stopPropagation(); onRemove(i) }}
                    aria-label="Remove"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
