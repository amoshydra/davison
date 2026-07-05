import { useState, useMemo } from 'react'
import type { MusicTrack } from '../types'

interface Props {
  tracks: MusicTrack[]
  onAddToQueue: (ids: string[]) => void
  onPlayNow: (id: string) => void
}

interface DirNode {
  name: string
  tracks: MusicTrack[]
  dirs: DirNode[]
}

function buildDirs(tracks: MusicTrack[]): DirNode[] {
  const roots: DirNode[] = []

  for (const track of tracks) {
    const parts = track.relativePath.split('/')
    let level = roots

    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]
      let dir = level.find(d => d.name === name)
      if (!dir) {
        dir = { name, tracks: [], dirs: [] }
        level.push(dir)
      }
      level = dir.dirs
    }

    level.push({ name: track.fileName, tracks: [track], dirs: [] })
  }

  return roots
}

function flattenIds(dir: DirNode): string[] {
  const ids: string[] = []
  for (const t of dir.tracks) ids.push(t.id)
  for (const sub of dir.dirs) ids.push(...flattenIds(sub))
  return ids
}

function pickTracks(dir: DirNode): MusicTrack[] {
  const list: MusicTrack[] = []
  for (const t of dir.tracks) list.push(t)
  for (const sub of dir.dirs) list.push(...pickTracks(sub))
  return list
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function DirSection({
  dir,
  depth,
  search,
  selected,
  onToggle,
  onAddToQueue,
}: {
  dir: DirNode
  depth: number
  search: string
  selected: Set<string>
  onToggle: (id: string) => void
  onAddToQueue: (ids: string[]) => void
}) {
  const [collapsed, setCollapsed] = useState(depth > 0)

  const isLeaf = dir.dirs.length === 0 && dir.tracks.length <= 1
  const track = isLeaf ? dir.tracks[0] : null

  const allIds = useMemo(() => flattenIds(dir), [dir])

  const hasContent = useMemo(() => {
    if (!search) return true
    return pickTracks(dir).some(t =>
      t.title.toLowerCase().includes(search) ||
      t.artist.toLowerCase().includes(search) ||
      t.album.toLowerCase().includes(search) ||
      t.fileName.toLowerCase().includes(search),
    )
  }, [dir, search])

  if (!hasContent) return null

  if (isLeaf && track) {
    return (
      <div
        className={`track-item ${selected.has(track.id) ? 'selected' : ''}`}
        style={{ paddingLeft: `${16 + depth * 20}px` }}
        onClick={() => onToggle(track.id)}
        onDoubleClick={() => onAddToQueue([track.id])}
      >
        <div className="track-info">
          <span className="track-title">{track.title}</span>
          <span className="track-artist">{track.artist}</span>
        </div>
        <span className="track-duration">{formatDuration(track.duration)}</span>
      </div>
    )
  }

  const isEmpty = allIds.length === 0
  if (isEmpty) return null

  return (
    <div className="dir-section">
      <div
        className="dir-header"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="dir-arrow">{collapsed ? '▶' : '▼'}</span>
        <span className="dir-name">{dir.name}</span>
        <span className="dir-count">{allIds.length}</span>
        <span className="dir-actions" onClick={e => e.stopPropagation()}>
          <button
            className="dir-btn"
            onClick={() => onAddToQueue(allIds)}
          >
            Add
          </button>
        </span>
      </div>
      {!collapsed && (
        <div className="dir-children">
          {dir.dirs.map(sub => (
            <DirSection
              key={`${dir.name}/${sub.name}`}
              dir={sub}
              depth={depth + 1}
              search={search}
              selected={selected}
              onToggle={onToggle}
              onAddToQueue={onAddToQueue}
            />
          ))}
          {dir.tracks.map(t => {
            if (search && !matches(t, search)) return null
            return (
              <div
                key={t.id}
                className={`track-item ${selected.has(t.id) ? 'selected' : ''}`}
                style={{ paddingLeft: `${16 + (depth + 1) * 20}px` }}
                onClick={() => onToggle(t.id)}
                onDoubleClick={() => onAddToQueue([t.id])}
              >
                <div className="track-info">
                  <span className="track-title">{t.title}</span>
                  <span className="track-artist">{t.artist}</span>
                </div>
                <span className="track-duration">{formatDuration(t.duration)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function matches(t: MusicTrack, q: string): boolean {
  const ql = q.toLowerCase()
  return (
    t.title.toLowerCase().includes(ql) ||
    t.artist.toLowerCase().includes(ql) ||
    t.album.toLowerCase().includes(ql) ||
    t.fileName.toLowerCase().includes(ql)
  )
}

export function MusicBrowser({ tracks, onAddToQueue, onPlayNow }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const roots = useMemo(() => buildDirs(tracks), [tracks])
  const q = search.toLowerCase()

  const filtered = useMemo(() => {
    if (!search) return roots
    function filterDir(d: DirNode): DirNode | null {
      const subDirs = d.dirs.map(filterDir).filter(Boolean) as DirNode[]
      const subTracks = d.tracks.filter(t => matches(t, q))
      if (subDirs.length === 0 && subTracks.length === 0) return null
      return { name: d.name, tracks: subTracks, dirs: subDirs }
    }
    return roots.map(filterDir).filter(Boolean) as DirNode[]
  }, [roots, search, q])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div className="music-browser">
      <h3>Music Library</h3>
      <input
        type="text"
        placeholder="Search tracks, artists, albums..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="browser-actions">
        <span>{tracks.length} tracks</span>
        {selected.size > 0 && (
          <>
            <button onClick={() => { onAddToQueue(Array.from(selected)); setSelected(new Set()) }}>
              Add {selected.size} to Queue
            </button>
            <button onClick={() => setSelected(new Set())}>Clear</button>
          </>
        )}
      </div>
      <div className="track-list">
        {filtered.map(root => (
          <DirSection
            key={root.name}
            dir={root}
            depth={0}
            search={q}
            selected={selected}
            onToggle={toggle}
            onAddToQueue={onAddToQueue}
          />
        ))}
      </div>
    </div>
  )
}
