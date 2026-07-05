import { useState } from 'react'
import type { Playlist } from '../types'

interface Props {
  playlists: Playlist[]
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onPlay: (id: string) => void
}

export function PlaylistPanel({ playlists, onCreate, onDelete, onPlay }: Props) {
  const [name, setName] = useState('')

  function handleCreate() {
    if (!name.trim()) return
    onCreate(name.trim())
    setName('')
  }

  return (
    <div className="playlist-panel">
      <div className="view-panel-header">
        <h2>Playlists</h2>
      </div>

      <div className="playlist-create">
        <input
          type="text"
          placeholder="New playlist name..."
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate}>Create</button>
      </div>

      {playlists.length === 0 ? (
        <div className="playlist-empty">
          <p>No playlists yet</p>
        </div>
      ) : (
        <div className="playlist-list">
          {playlists.map(p => (
            <div key={p.id} className="playlist-item">
              <div className="playlist-info">
                <span className="playlist-name">{p.name}</span>
                <span className="playlist-count">{p.trackIds.length} tracks</span>
              </div>
              <div className="playlist-actions">
                <button className="btn-play-list" onClick={() => onPlay(p.id)}>Play</button>
                <button onClick={() => onDelete(p.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
