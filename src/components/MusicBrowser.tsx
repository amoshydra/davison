import { useState, useMemo } from 'react'
import type { MusicTrack } from '../types'

interface Props {
  tracks: MusicTrack[]
  onAddToQueue: (ids: string[]) => void
  onPlayNow: (id: string) => void
}

export function MusicBrowser({ tracks, onAddToQueue, onPlayNow }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!search) return tracks
    const q = search.toLowerCase()
    return tracks.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    )
  }, [tracks, search])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="music-browser">
      <h3>Music Library</h3>
      <input
        type="text"
        placeholder="Search tracks..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="browser-actions">
        <span>{filtered.length} tracks</span>
        {selected.size > 0 && (
          <>
            <button onClick={() => onAddToQueue(Array.from(selected))}>
              Add {selected.size} to Queue
            </button>
            <button onClick={() => setSelected(new Set())}>Clear</button>
          </>
        )}
      </div>
      <div className="track-list">
        {filtered.map(t => (
          <div
            key={t.id}
            className={`track-item ${selected.has(t.id) ? 'selected' : ''}`}
            onClick={() => toggle(t.id)}
            onDoubleClick={() => onPlayNow(t.id)}
          >
            <div className="track-info">
              <span className="track-title">{t.title}</span>
              <span className="track-artist">{t.artist}</span>
              <span className="track-album">{t.album}</span>
            </div>
            <span className="track-duration">{formatDuration(t.duration)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
