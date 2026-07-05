import type { MusicTrack } from '../types'

interface Props {
  queue: MusicTrack[]
  currentIndex: number | null
  onRemove: (index: number) => void
  onClear: () => void
  onJumpTo: (trackId: string) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function QueueView({ queue, currentIndex, onRemove, onClear, onJumpTo }: Props) {
  if (queue.length === 0) {
    return (
      <div className="queue-view">
        <h3>Queue</h3>
        <p className="empty-queue">Queue is empty</p>
      </div>
    )
  }

  return (
    <div className="queue-view">
      <div className="queue-header">
        <h3>Queue ({queue.length})</h3>
        <button onClick={onClear}>Clear</button>
      </div>
      <div className="queue-list">
        {queue.map((track, i) => (
          <div
            key={`${track.id}-${i}`}
            className={`queue-item ${i === currentIndex ? 'playing' : ''}`}
            onClick={() => onJumpTo(track.id)}
          >
            <span className="queue-index">{i + 1}</span>
            <div className="queue-info">
              <span className="queue-title">{track.title}</span>
              <span className="queue-artist">{track.artist}</span>
            </div>
            <span className="queue-duration">{formatDuration(track.duration)}</span>
            {i !== currentIndex && (
              <button
                className="remove-btn"
                onClick={e => { e.stopPropagation(); onRemove(i) }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
